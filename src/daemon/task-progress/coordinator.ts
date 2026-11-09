import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Value } from '@sinclair/typebox/value';
import { MAX_PROGRESS_MILESTONES, ProgressId, ProgressSequence } from '../../shared/task-progress.js';
import type {
  DelegateMeasurement, Measurement, ProgressKind, ProgressSnapshot, TaskOrigin, TaskOwnerFence, TaskProgressDelegate, TaskRef,
} from '../../shared/task-progress.js';
import { progressTaskKey } from './record.js';
import type { ProgressRecord } from './record.js';
import { ProgressStorageError } from './store.js';
import type { ProgressStore } from './store.js';

type Details = { readonly kind: ProgressKind };
type RunningState = 'queued' | 'running' | 'waiting' | 'paused';
type TerminalState = 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type OwnerEvidence =
  | { readonly sequence: number; readonly state: RunningState }
  | { readonly sequence: number; readonly state: TerminalState; readonly resultRef?: string | undefined };

const authorizationBrand = Symbol('progress producer authorization');
const ownerBrand = Symbol('progress owner');
export type ProducerAuthorization = Readonly<{ [authorizationBrand]: true }>;
export type OwnerHandle = Readonly<{ [ownerBrand]: true }>;

type Decision =
  | { readonly action: 'launch'; readonly projectId: string; readonly invocationId: string; readonly ownerId: string; readonly origin: TaskOrigin }
  | { readonly action: 'retry' | 'revalidate'; readonly task: TaskRef; readonly ownerId: string };

type Admission =
  | { readonly kind: 'admitted'; readonly task: TaskRef; readonly owner: OwnerHandle; readonly fence: TaskOwnerFence }
  | { readonly kind: 'refused'; readonly reason: 'capacity' | 'invalid-origin' | 'conflict' | 'expired' | 'unavailable' };

interface Runtime<D extends Details> {
  readonly owner: OwnerHandle;
  readonly task: TaskRef;
  readonly key: string;
  readonly ownerId: string;
  readonly epoch: string;
  readonly delegate: TaskProgressDelegate<D>;
  readonly kind: ProgressKind;
  sequence: number;
  lifecycle?: OwnerEvidence | undefined;
  sourceRevision?: number | undefined;
  refresh?: Promise<void> | undefined;
  requestedSequence?: number | undefined;
  lastRefreshAt?: number | undefined;
  stopped: boolean;
}

interface ProducerPort<D extends Details> {
  register(authorization: ProducerAuthorization, producerKey: string, delegate: TaskProgressDelegate<D>): Promise<Admission>;
  signalMeasurement(owner: OwnerHandle, sequence: number): Promise<void>;
  recordLifecycle(owner: OwnerHandle, evidence: OwnerEvidence): Promise<'recorded' | 'replay' | 'rejected'>;
  renewActivity(owner: OwnerHandle, sequence: number): Promise<'renewed' | 'rejected'>;
}

interface Clock {
  now(): number;
  monotonic(): number;
  wait(ms: number): Promise<void>;
}

const systemClock: Clock = {
  now: Date.now,
  monotonic: () => performance.now(),
  wait: ms => new Promise(resolve => { setTimeout(resolve, ms).unref(); }),
};

function terminal(evidence: OwnerEvidence): evidence is Extract<OwnerEvidence, { state: TerminalState }> {
  return evidence.state !== 'queued' && evidence.state !== 'running' &&
    evidence.state !== 'waiting' && evidence.state !== 'paused';
}

function measurementContent<D>(measurement: Measurement<D>): unknown {
  const { measuredAt, lastMeaningfulAt, meaningfulRevision, ...content } = measurement;
  return content;
}

/** Daemon-private authority. Mint calls are reserved for the trusted execution host. */
export function createProgressAuthority(): {
  readonly mint: (decision: Decision) => ProducerAuthorization;
  readonly inspect: (authorization: ProducerAuthorization) => Decision | undefined;
} {
  const decisions = new WeakMap<ProducerAuthorization, Decision>();
  return {
    mint(decision) {
      const authorization = Object.freeze({ [authorizationBrand]: true } as const);
      decisions.set(authorization, structuredClone(decision));
      return authorization;
    },
    inspect: authorization => decisions.get(authorization),
  };
}

export class ProgressCoordinator<D extends Details> {
  private readonly producers = new Set<ProgressKind>();
  private readonly active = new Map<string, Runtime<D>>();
  private readonly owners = new WeakMap<OwnerHandle, Runtime<D>>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly store: ProgressStore<D>,
    private readonly inspect: (authorization: ProducerAuthorization) => Decision | undefined,
    private readonly clock: Clock = systemClock,
  ) {}

  registerProducer<K extends D>(kind: K['kind'], projectDetails: (value: K) => K): ProducerPort<K> {
    if (this.producers.has(kind)) throw new Error('progress producer already registered');
    this.producers.add(kind);
    return {
      register: (authorization, key, delegate) => this.admit(kind, authorization, key, {
        async progress(task) {
          const measured = await delegate.progress(task);
          return measured === null ? null : { ...measured, details: projectDetails(measured.details) };
        },
      }),
      signalMeasurement: (owner, sequence) => this.signal(kind, owner, sequence),
      recordLifecycle: (owner, evidence) => this.lifecycle(kind, owner, evidence),
      renewActivity: (owner, sequence) => this.activity(kind, owner, sequence),
    };
  }

  read(task: TaskRef): ProgressSnapshot<D> | undefined {
    const record = this.store.get(task);
    if (record === undefined) return undefined;
    const runtime = this.active.get(progressTaskKey(task));
    const live = runtime !== undefined && runtime.epoch === record.owner?.ownerEpoch;
    const sample = record.measurement;
    return {
      task: record.task, cursor: `${record.task.attempt}:${record.revision}`, state: record.state,
      freshness: sample === null ? 'unavailable' : record.measurementStale || (record.retention === 'active' && !live) ? 'stale' : 'live',
      measurement: sample === null ? null : {
        ...sample, task: record.task,
        measuredAt: new Date(sample.measuredAt).toISOString(),
        lastMeaningfulAt: sample.lastMeaningfulAt === null ? null : new Date(sample.lastMeaningfulAt).toISOString(),
      },
      lastOwnerActivityAt: record.lastOwnerActivityAt === null ? null : new Date(record.lastOwnerActivityAt).toISOString(),
      workerHealth: live ? 'alive' : record.retention === 'expired' ? 'lost' : 'unknown',
      cancellation: 'none',
      ...(record.resultRef === undefined ? {} : { resultRef: record.resultRef }),
    };
  }

  private run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(key) ?? Promise.resolve()).then(work);
    const tail = result.then(() => undefined, () => undefined);
    this.queues.set(key, tail);
    void tail.then(() => { if (this.queues.get(key) === tail) this.queues.delete(key); });
    return result;
  }

  private admit(kind: ProgressKind, authorization: ProducerAuthorization, producerKey: string, delegate: TaskProgressDelegate<D>): Promise<Admission> {
    const decision = this.inspect(authorization);
    if (decision === undefined || !Value.Check(ProgressId, producerKey)) return Promise.resolve({ kind: 'refused', reason: 'invalid-origin' });
    const task: TaskRef = decision.action === 'launch' ? {
      projectId: decision.projectId, invocationId: decision.invocationId,
      taskId: createHash('sha256').update(JSON.stringify([kind, producerKey])).digest('hex'), attempt: 1,
    } : decision.task;
    const key = progressTaskKey(task);
    return this.run(key, async () => {
      try {
        await this.store.settle();
        const existing = this.active.get(key);
        const prior = this.store.get(task);
        if (decision.action === 'launch' && existing !== undefined && existing.ownerId === decision.ownerId &&
            prior?.owner != null && isDeepStrictEqual(prior.origin, decision.origin)) {
          return { kind: 'admitted', task: { ...existing.task }, owner: existing.owner, fence: { ...prior.owner } };
        }
        if (decision.action === 'launch' ? prior !== undefined : prior === undefined || prior.producerKind !== kind) {
          return { kind: 'refused', reason: 'conflict' };
        }
        const now = this.clock.now();
        const epoch = randomUUID();
        const fence = { ownerId: decision.ownerId, ownerEpoch: epoch, ownerSequence: 0 };
        let record: ProgressRecord<D>;
        if (decision.action === 'revalidate') {
          if (existing !== undefined || prior?.owner?.ownerId !== decision.ownerId) return { kind: 'refused', reason: 'conflict' };
          record = await this.store.revalidateOwner(task, prior.owner, epoch, now);
        } else {
          if (decision.action === 'retry' && (prior === undefined || prior.retention !== 'terminal')) {
            return { kind: 'refused', reason: 'conflict' };
          }
          const priorAttempts = prior === undefined ? [] : [...prior.priorAttempts, {
            attempt: prior.task.attempt, state: prior.state, updatedAt: prior.updatedAt,
          }].slice(-16);
          record = {
            version: 1, task: prior === undefined ? task : { ...task, attempt: task.attempt + 1 },
            origin: decision.action === 'launch' ? decision.origin : prior!.origin,
            producerKind: kind, owner: fence, revision: prior === undefined ? 0 : prior.revision + 1,
            state: 'queued', retention: 'active', updatedAt: now, lastOwnerActivityAt: now,
            recoveryDeadline: null, measurement: null, priorAttempts,
          };
          await this.store.commit(record, prior?.revision ?? null);
        }
        const owner = Object.freeze({ [ownerBrand]: true } as const);
        const runtime: Runtime<D> = {
          owner, task: record.task, key, ownerId: decision.ownerId, epoch, kind,
          delegate, sequence: 0, stopped: false,
        };
        this.active.set(key, runtime);
        this.owners.set(owner, runtime);
        return { kind: 'admitted', task: { ...record.task }, owner, fence };
      } catch (error) {
        if (error instanceof ProgressStorageError && error.reason === 'capacity') return { kind: 'refused', reason: 'capacity' };
        if (error instanceof ProgressStorageError && error.reason === 'stale') return { kind: 'refused', reason: 'expired' };
        return { kind: 'refused', reason: 'unavailable' };
      }
    });
  }

  private runtime(kind: ProgressKind, owner: OwnerHandle): Runtime<D> | undefined {
    const runtime = this.owners.get(owner);
    return runtime?.kind === kind ? runtime : undefined;
  }

  private current(runtime: Runtime<D>): ProgressRecord<D> | undefined {
    if (runtime.stopped || this.active.get(runtime.key) !== runtime) return undefined;
    const record = this.store.get(runtime.task);
    return record?.owner?.ownerEpoch === runtime.epoch ? record : undefined;
  }

  private lifecycle(kind: ProgressKind, owner: OwnerHandle, evidence: OwnerEvidence): Promise<'recorded' | 'replay' | 'rejected'> {
    const runtime = this.runtime(kind, owner);
    if (runtime === undefined) return Promise.resolve('rejected');
    return this.run(runtime.key, async () => {
      await this.store.settle();
      if (isDeepStrictEqual(runtime.lifecycle, evidence) && this.store.get(runtime.task) !== undefined) return 'replay';
      const record = this.current(runtime);
      if (record === undefined || !Value.Check(ProgressSequence, evidence.sequence) || evidence.sequence <= runtime.sequence) return 'rejected';
      const ended = terminal(evidence);
      const updatedAt = this.clock.now();
      const next: ProgressRecord<D> = {
        ...record, revision: record.revision + 1, state: evidence.state, updatedAt,
        retention: ended ? 'terminal' : 'active',
        owner: ended ? null : { ownerId: runtime.ownerId, ownerEpoch: runtime.epoch, ownerSequence: evidence.sequence },
        ...(ended && evidence.resultRef !== undefined ? { resultRef: evidence.resultRef } : {}),
      };
      await this.store.commit(next, record.revision);
      runtime.sequence = evidence.sequence;
      runtime.lifecycle = structuredClone(evidence);
      if (ended) {
        runtime.stopped = true;
        this.active.delete(runtime.key);
      }
      return 'recorded';
    });
  }

  private activity(kind: ProgressKind, owner: OwnerHandle, sequence: number): Promise<'renewed' | 'rejected'> {
    const runtime = this.runtime(kind, owner);
    if (runtime === undefined) return Promise.resolve('rejected');
    return this.run(runtime.key, async () => {
      await this.store.settle();
      const record = this.current(runtime);
      if (record === undefined || !Value.Check(ProgressSequence, sequence) || sequence <= runtime.sequence) return 'rejected';
      const now = this.clock.now();
      await this.store.commit({
        ...record, revision: record.revision + 1, updatedAt: now, lastOwnerActivityAt: now,
        owner: { ownerId: runtime.ownerId, ownerEpoch: runtime.epoch, ownerSequence: sequence },
      }, record.revision);
      runtime.sequence = sequence;
      return 'renewed';
    });
  }

  private async signal(kind: ProgressKind, owner: OwnerHandle, sequence: number): Promise<void> {
    const runtime = this.runtime(kind, owner);
    if (runtime === undefined || !Value.Check(ProgressSequence, sequence)) return;
    await this.run(runtime.key, async () => {
      await this.store.settle();
      if (this.current(runtime) === undefined || sequence <= runtime.sequence) return;
      runtime.sequence = sequence;
      runtime.requestedSequence = sequence;
      runtime.refresh ??= this.refresh(runtime).finally(() => { runtime.refresh = undefined; });
    });
    await runtime.refresh;
  }

  private async refresh(runtime: Runtime<D>): Promise<void> {
    while (!runtime.stopped && runtime.requestedSequence !== undefined) {
      const elapsed = this.clock.monotonic() - (runtime.lastRefreshAt ?? -Infinity);
      if (elapsed < 1000) await this.clock.wait(1000 - elapsed);
      const requested = runtime.requestedSequence;
      runtime.requestedSequence = undefined;
      if (runtime.stopped) return;
      runtime.lastRefreshAt = this.clock.monotonic();
      let sample: DelegateMeasurement<D> | null;
      try { sample = await runtime.delegate.progress({ ...runtime.task }); } catch { sample = null; }
      await this.run(runtime.key, async () => {
        const record = this.current(runtime);
        if (record === undefined) return;
        const normalized = this.normalize(runtime, record, sample, requested);
        const stale = normalized === undefined;
        if (stale !== (record.measurementStale === true) || (normalized !== undefined && normalized !== record.measurement)) {
          await this.store.commit({
            ...record, revision: record.revision + 1, updatedAt: this.clock.now(),
            measurement: normalized ?? record.measurement, measurementStale: stale,
            owner: { ownerId: runtime.ownerId, ownerEpoch: runtime.epoch, ownerSequence: runtime.sequence },
          }, record.revision);
        }
        if (!stale && sample !== null) runtime.sourceRevision = sample.meaningfulRevision;
      });
    }
  }

  private normalize(runtime: Runtime<D>, record: ProgressRecord<D>, source: DelegateMeasurement<D> | null, requested: number): Measurement<D> | undefined {
    if (source === null || source.kind !== runtime.kind || source.details?.kind !== runtime.kind ||
        !isDeepStrictEqual(source.task, runtime.task) || source.owner?.ownerId !== runtime.ownerId ||
        source.owner?.ownerEpoch !== runtime.epoch || !Value.Check(ProgressSequence, source.owner.ownerSequence) ||
        source.owner.ownerSequence < requested || source.owner.ownerSequence > runtime.sequence) return undefined;
    const { task, owner, measuredAt, lastMeaningfulAt, meaningfulRevision, milestones, ...details } = source;
    const prior = record.measurement;
    const at = Date.parse(measuredAt);
    const milestoneLimit = MAX_PROGRESS_MILESTONES - record.priorAttempts.length;
    if (!Array.isArray(milestones)) return undefined;
    const next = { ...details, milestones: milestoneLimit > 0 ? milestones.slice(-milestoneLimit) : [],
      measuredAt: at, lastMeaningfulAt: at, meaningfulRevision: (prior?.meaningfulRevision ?? 0) + 1 };
    if (!this.store.acceptsMeasurement(next) || !Value.Check(ProgressSequence, meaningfulRevision) ||
        (runtime.sourceRevision !== undefined && meaningfulRevision < runtime.sourceRevision)) return undefined;
    if (prior !== null && isDeepStrictEqual(measurementContent(prior), measurementContent(next))) {
      return prior;
    }
    if (runtime.sourceRevision === meaningfulRevision || (prior !== null && at < prior.measuredAt)) return undefined;
    return next;
  }
}
