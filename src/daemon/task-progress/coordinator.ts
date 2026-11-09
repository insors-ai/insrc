import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Value } from '@sinclair/typebox/value';
import { MAX_PROGRESS_MILESTONES, MAX_PROGRESS_SNAPSHOT_BYTES, ProgressId, ProgressSequence } from '../../shared/task-progress.js';
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
export type CancelOutcome = 'pending' | 'unsupported' | TerminalState;
export interface TerminalDelivery<D> {
  readonly snapshot: ProgressSnapshot<D>;
  readonly previousCursor: string;
}
type ChangeListener<D> = (task: TaskRef, terminal?: TerminalDelivery<D>) => void;
export const OWNER_RENEWAL_MS = 30_000;
const OWNER_LEASE_MS = 120_000;
const INACTIVE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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
  activityDeadline: number;
  nextOwnerProbe: number;
  probingOwner?: AbortController | undefined;
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

/** Compact the full wire projection, including repeated task identifiers and timestamps. */
function boundedSnapshot<D>(snapshot: ProgressSnapshot<D>): ProgressSnapshot<D> {
  const size = () => Buffer.byteLength(JSON.stringify(snapshot));
  if (size() <= MAX_PROGRESS_SNAPSHOT_BYTES || snapshot.measurement === null) return snapshot;
  const milestones = [...snapshot.measurement.milestones];
  snapshot = { ...snapshot, measurement: { ...snapshot.measurement, milestones } };
  while (milestones.length > 0 && size() > MAX_PROGRESS_SNAPSHOT_BYTES) milestones.shift();
  return size() <= MAX_PROGRESS_SNAPSHOT_BYTES ? snapshot : { ...snapshot, measurement: null, freshness: 'unavailable' };
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
  private readonly listeners = new Map<string, Set<ChangeListener<D>>>();
  private readonly cursorEpoch = randomUUID();

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
        async progress(task, signal) {
          const measured = await delegate.progress(task, signal);
          return measured === null ? null : { ...measured, details: projectDetails(measured.details) };
        },
        ...(delegate.ownerActivity === undefined ? {} : {
          ownerActivity: (task: TaskRef, signal: AbortSignal) => delegate.ownerActivity!(task, signal),
        }),
        ...(delegate.cancel === undefined ? {} : {
          cancel: (task: TaskRef, requestId: string) => delegate.cancel!(task, requestId),
        }),
      }),
      signalMeasurement: (owner, sequence) => this.signal(kind, owner, sequence),
      recordLifecycle: (owner, evidence) => this.lifecycle(kind, owner, evidence),
      renewActivity: (owner, sequence) => this.activity(kind, owner, sequence),
    };
  }

  read(task: TaskRef): ProgressSnapshot<D> | undefined {
    const record = this.store.get(task);
    return record === undefined ? undefined : this.snapshot(record);
  }

  private snapshot(record: ProgressRecord<D>): ProgressSnapshot<D> {
    const runtime = this.active.get(progressTaskKey(record.task));
    const live = runtime !== undefined && this.live(runtime) && runtime.epoch === record.owner?.ownerEpoch;
    const sample = record.measurement;
    return boundedSnapshot({
      task: record.task, cursor: this.cursor(record.task, record.revision),
      state: record.retention === 'active' && !live ? 'interrupted' : record.state,
      freshness: sample === null ? 'unavailable' : record.measurementStale || (record.retention === 'active' && !live) ? 'stale' : 'live',
      measurement: sample === null ? null : {
        ...sample, task: record.task, controls: live && runtime?.delegate.cancel !== undefined ? sample.controls : [],
        measuredAt: new Date(sample.measuredAt).toISOString(),
        lastMeaningfulAt: sample.lastMeaningfulAt === null ? null : new Date(sample.lastMeaningfulAt).toISOString(),
      },
      lastOwnerActivityAt: record.lastOwnerActivityAt === null ? null : new Date(record.lastOwnerActivityAt).toISOString(),
      workerHealth: live ? 'alive' : record.retention === 'expired' ? 'lost' : 'unknown',
      cancellation: record.retention === 'active' && record.cancelRequestId !== undefined ? 'pending' : 'none',
      ...(record.resultRef === undefined ? {} : { resultRef: record.resultRef }),
    });
  }

  disposition(task: TaskRef, prior: string | undefined, current: string): 'changed' | 'unchanged' | 'resync' {
    if (prior === undefined) return 'changed';
    if (prior === current) return 'unchanged';
    const record = this.store.get(task);
    if (record !== undefined && this.cursor(task, record.revision) === current &&
        prior === this.cursor(task, record.revision - 1)) return 'changed';
    return 'resync';
  }

  private cursor(task: TaskRef, revision: number): string {
    return createHash('sha256').update(JSON.stringify([this.cursorEpoch, progressTaskKey(task), task.attempt, revision])).digest('base64url');
  }

  onChange(task: TaskRef, listener: ChangeListener<D>): () => void {
    const key = progressTaskKey(task);
    const listeners = this.listeners.get(key) ?? new Set<ChangeListener<D>>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  isTerminal(task: TaskRef): boolean {
    return this.store.get(task)?.retention === 'terminal';
  }

  observationClosed(task: TaskRef, cursor: string): boolean {
    const record = this.store.get(task);
    return record !== undefined && record.retention !== 'active' && this.cursor(task, record.revision) === cursor;
  }

  async cancel(task: TaskRef, requestId: string, reauthorize: () => Promise<unknown>): Promise<CancelOutcome> {
    const key = progressTaskKey(task);
    const decision = await this.run(key, async (): Promise<{ outcome: CancelOutcome; runtime?: Runtime<D> }> => {
      await this.store.settle();
      await reauthorize();
      const record = this.store.get(task);
      if (record === undefined) throw new Error('task-unavailable');
      if (record.priorAttempts.some(attempt => attempt.cancelRequestId === requestId)) throw new Error('conflicting-request');
      if (record.retention === 'terminal') return { outcome: record.state as TerminalState };
      if (record.retention === 'active' && record.cancelRequestId !== undefined) return { outcome: 'pending' };
      const runtime = this.active.get(key);
      if (runtime === undefined || this.current(runtime) === undefined || runtime.delegate.cancel === undefined ||
          record.measurement?.controls.includes('cancel') !== true) return { outcome: 'unsupported' };
      await this.store.commit({ ...record, revision: record.revision + 1, cancelRequestId: requestId }, record.revision);
      this.notify(task);
      return { outcome: 'pending', runtime };
    });
    const runtime = decision.runtime;
    if (runtime !== undefined) {
      void Promise.resolve().then(() => {
        if (this.current(runtime) !== undefined) return runtime.delegate.cancel!({ ...task }, requestId);
        return undefined;
      }).catch(() => { /* Only verified executor lifecycle evidence resolves the durable receipt. */ });
    }
    return decision.outcome;
  }

  isCancellationRequest(task: TaskRef, requestId: string): boolean {
    return this.store.get(task)?.cancelRequestId === requestId;
  }

  hasLiveOwner(task: TaskRef): boolean {
    const runtime = this.active.get(progressTaskKey(task));
    return runtime !== undefined && runtime.task.attempt === task.attempt && this.current(runtime) !== undefined;
  }

  activityFor(projectId: string, originId: string): readonly { task: TaskRef; expiresAt: string }[] {
    return this.store.list().flatMap(record => {
      if (record.task.projectId !== projectId || record.origin.extensionChatId !== originId ||
          record.activityReleased === true || !this.hasLiveOwner(record.task)) return [];
      const runtime = this.active.get(progressTaskKey(record.task))!;
      return [{ task: record.task, expiresAt: new Date(this.clock.now() + runtime.activityDeadline - this.clock.monotonic()).toISOString() }];
    });
  }

  async sweep(): Promise<void> {
    await this.store.settle();
    for (const { task } of this.store.list()) {
      await this.run(progressTaskKey(task), async () => {
        const record = this.store.get(task);
        if (record === undefined) return;
        if (record.retention === 'active') await this.recover(record);
        else if (this.clock.now() - record.updatedAt >= INACTIVE_RETENTION_MS) {
          await this.store.remove(task, record.revision);
          this.notify(task);
        }
      });
    }
  }

  /** The daemon calls this independently of connected readers. Probes never hold task or store locks. */
  async probeOwnerActivity(): Promise<void> {
    const now = this.clock.monotonic();
    const probes: Promise<void>[] = [];
    for (const runtime of this.active.values()) {
      if (!this.live(runtime) || runtime.delegate.ownerActivity === undefined ||
          runtime.probingOwner !== undefined || runtime.nextOwnerProbe > now) continue;
      const controller = new AbortController();
      runtime.probingOwner = controller;
      runtime.nextOwnerProbe = now + OWNER_RENEWAL_MS;
      probes.push(this.probe(runtime, runtime.delegate.ownerActivity, controller));
    }
    await Promise.all(probes);
  }

  stopOwnerProbes(): void {
    for (const runtime of this.active.values()) {
      runtime.stopped = true;
      runtime.probingOwner?.abort();
    }
  }

  private async probe(runtime: Runtime<D>, verify: NonNullable<TaskProgressDelegate<D>['ownerActivity']>,
    controller: AbortController): Promise<void> {
    try {
      const sequence = await verify({ ...runtime.task }, controller.signal);
      if (sequence !== null && !controller.signal.aborted) {
        await this.activity(runtime.kind, runtime.owner, sequence);
      }
    } catch {
      // No new activity was verified. The existing lease expires on its original deadline.
    } finally {
      if (runtime.probingOwner === controller) runtime.probingOwner = undefined;
    }
  }

  private live(runtime: Runtime<D>): boolean {
    return !runtime.stopped && this.clock.monotonic() < runtime.activityDeadline;
  }

  private async recover(record: ProgressRecord<D>): Promise<ProgressRecord<D> | undefined> {
    const key = progressTaskKey(record.task);
    const runtime = this.active.get(key);
    if (runtime !== undefined && this.live(runtime)) return record;
    if (runtime !== undefined) {
      runtime.stopped = true;
      runtime.probingOwner?.abort();
    }
    const now = this.clock.now();
    const overdue = runtime === undefined ? 0 : Math.max(0, this.clock.monotonic() - runtime.activityDeadline);
    const recoveryDeadline = record.recoveryDeadline ?? Math.max(0, now - overdue) + OWNER_LEASE_MS;
    if (now >= recoveryDeadline) {
      const { grants, originDigest, ...base } = record;
      try {
        await this.store.commit({
          ...base, revision: record.revision + 1, retention: 'expired', state: 'unknown', updatedAt: now,
          owner: null, activityReleased: true, measurement: null, priorAttempts: [],
          ...(grants?.history === undefined ? {} : { grants: { history: grants.history } }),
        }, record.revision);
      } catch (error) {
        if (!(error instanceof ProgressStorageError) || error.reason !== 'capacity') throw error;
        await this.store.remove(record.task, record.revision);
      }
      this.active.delete(key);
      this.notify(record.task);
      return undefined;
    }
    if (record.recoveryDeadline !== null) {
      this.active.delete(key);
      return record;
    }
    const next = { ...record, revision: record.revision + 1, recoveryDeadline, updatedAt: now,
      measurementStale: true };
    await this.store.commit(next, record.revision);
    this.active.delete(key);
    this.notify(record.task);
    return next;
  }

  notify(task: TaskRef, terminal?: TerminalDelivery<D>): void {
    for (const listener of this.listeners.get(progressTaskKey(task)) ?? []) {
      try { listener(task, terminal); } catch { /* Observer failure cannot affect the executor. */ }
    }
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
        let prior = this.store.get(task);
        if (prior?.retention === 'active' && !this.hasLiveOwner(task)) {
          await this.recover(prior);
          prior = this.store.get(task);
        }
        const existing = this.active.get(key);
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
          if (prior?.retention === 'expired') return { kind: 'refused', reason: 'expired' };
          if (existing !== undefined || prior?.owner?.ownerId !== decision.ownerId) return { kind: 'refused', reason: 'conflict' };
          record = await this.store.revalidateOwner(task, prior.owner, epoch, now);
        } else {
          if (decision.action === 'retry' && (prior === undefined || prior.retention !== 'terminal')) {
            return { kind: 'refused', reason: 'conflict' };
          }
          const priorAttempts = prior === undefined ? [] : [...prior.priorAttempts, {
            attempt: prior.task.attempt, state: prior.state, updatedAt: prior.updatedAt,
            ...(prior.cancelRequestId === undefined ? {} : { cancelRequestId: prior.cancelRequestId }),
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
          delegate, sequence: 0, stopped: false, activityDeadline: this.clock.monotonic() + OWNER_LEASE_MS,
          nextOwnerProbe: this.clock.monotonic() + OWNER_RENEWAL_MS,
        };
        this.active.set(key, runtime);
        this.owners.set(owner, runtime);
        this.notify(record.task);
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
    if (!this.live(runtime) || this.active.get(runtime.key) !== runtime) return undefined;
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
        runtime.probingOwner?.abort();
        this.active.delete(runtime.key);
        this.notify(runtime.task, { snapshot: this.snapshot(next), previousCursor: this.cursor(record.task, record.revision) });
      } else {
        this.notify(runtime.task);
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
      const deadline = this.clock.monotonic() + OWNER_LEASE_MS;
      await this.store.commit({
        ...record, revision: record.revision + 1, updatedAt: now, lastOwnerActivityAt: now,
        owner: { ownerId: runtime.ownerId, ownerEpoch: runtime.epoch, ownerSequence: sequence },
      }, record.revision);
      runtime.sequence = sequence;
      runtime.activityDeadline = deadline;
      this.notify(runtime.task);
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
      await this.sample(runtime, requested);
    }
  }

  async refreshForFallback(task: TaskRef, signal: AbortSignal): Promise<void> {
    const runtime = this.active.get(progressTaskKey(task));
    if (runtime === undefined || runtime.task.attempt !== task.attempt || !this.live(runtime) || signal.aborted) return;
    if (runtime.refresh !== undefined) {
      await runtime.refresh;
      return;
    }
    if (this.clock.monotonic() - (runtime.lastRefreshAt ?? -Infinity) < 1000) return;
    let abort!: () => void;
    const cancelled = new Promise<void>(resolve => { abort = resolve; });
    signal.addEventListener('abort', abort, { once: true });
    const observation = this.sample(runtime, runtime.sequence, signal);
    runtime.refresh = Promise.race([observation, cancelled])
      .finally(() => this.refresh(runtime))
      .finally(() => { runtime.refresh = undefined; });
    void runtime.refresh.catch(() => { /* A producer waiting for the refresh receives the error. */ });
    try { await observation; } finally { signal.removeEventListener('abort', abort); }
  }

  private async sample(runtime: Runtime<D>, requested: number, signal?: AbortSignal): Promise<void> {
    runtime.lastRefreshAt = this.clock.monotonic();
    let sample: DelegateMeasurement<D> | null;
    try { sample = await runtime.delegate.progress({ ...runtime.task }, signal); } catch { sample = null; }
    if (signal?.aborted) return;
    await this.run(runtime.key, async () => {
      await this.store.settle();
      const record = this.current(runtime);
      if (record === undefined || signal?.aborted) return;
      const normalized = this.normalize(runtime, record, sample, requested);
      const stale = normalized === undefined;
      if (stale !== (record.measurementStale === true) || (normalized !== undefined && normalized !== record.measurement)) {
        await this.store.commit({
          ...record, revision: record.revision + 1, updatedAt: this.clock.now(),
          measurement: normalized ?? record.measurement, measurementStale: stale,
          owner: { ownerId: runtime.ownerId, ownerEpoch: runtime.epoch, ownerSequence: runtime.sequence },
        }, record.revision);
        this.notify(runtime.task);
      }
      if (!stale && sample !== null) runtime.sourceRevision = sample.meaningfulRevision;
    });
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
