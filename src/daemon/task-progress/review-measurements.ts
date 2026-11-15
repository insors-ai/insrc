/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ReviewWorkerProgress } from '../threads/review-workers.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewWorkerIdentity } from '../threads/review-worker-contract.js';
import { MeasuredCountSchema, ProgressLabel, ProgressSequence, progressObject } from '../../shared/task-progress.js';
import type { DelegateMeasurement, MeasuredCount, ProgressKind, TaskOwnerFence, TaskProgressDelegate, TaskRef } from '../../shared/task-progress.js';
import { validateExecutorDetails } from './executor-measurements.js';
import type { ExecutorDetails } from './executor-measurements.js';
import type { ProgressAccess } from './access.js';
import type { OwnerEvidence, OwnerHandle, ProducerPort } from './coordinator.js';
import type { ProgressCoordinator } from './coordinator.js';
import type { TrustedRpcContext } from '../request-context.js';

const target = Type.String({ minLength: 1, maxLength: 2048, pattern: '^[^\\x00-\\x1f\\x7f]+$' });
const nullableCount = Type.Union([MeasuredCountSchema, Type.Null()]);
const nullableNumber = Type.Union([ProgressSequence, Type.Null()]);

export const DesignReviewDetailsSchema = progressObject({
  kind: Type.Literal('design-review'),
  target,
  checks: nullableCount,
  freshChunks: nullableCount,
  retainedChunks: nullableNumber,
  retries: nullableNumber,
});
export const CodeReviewDetailsSchema = progressObject({
  kind: Type.Literal('code-review'),
  target,
  initial: nullableCount,
  followUp: nullableCount,
  retries: nullableNumber,
  publication: Type.Union([
    Type.Literal('pending'), Type.Literal('complete'), Type.Literal('failed'), Type.Literal('unknown'),
  ]),
});
export type DesignReviewDetails = Static<typeof DesignReviewDetailsSchema>;
export type CodeReviewDetails = Static<typeof CodeReviewDetailsSchema>;
export type ReviewDetails = DesignReviewDetails | CodeReviewDetails;

export function validateReviewDetails(kind: ProgressKind, value: unknown): value is ReviewDetails {
  if (kind === 'design-review') return Value.Check(DesignReviewDetailsSchema, value);
  if (kind === 'code-review') return Value.Check(CodeReviewDetailsSchema, value);
  return false;
}

/** One runtime, one store: executor kinds and review kinds share the composed validator. */
export type AllTaskDetails = ExecutorDetails | ReviewDetails;
export function validateAllDetails(kind: ProgressKind, value: unknown): value is AllTaskDetails {
  return validateExecutorDetails(kind, value) || validateReviewDetails(kind, value);
}

/** Register the review producers next to the workflow and analysis ones on the one coordinator. */
export function registerReviewProducers(coordinator: ProgressCoordinator<AllTaskDetails>) {
  return {
    designReview: coordinator.registerProducer<DesignReviewDetails>('design-review', detail => detail),
    codeReview: coordinator.registerProducer<CodeReviewDetails>('code-review', detail => detail),
  };
}

type ReviewIdentity = ReviewWorkerIdentity & { readonly attempt: number };
const sameIdentity = (expected: ReviewIdentity, actual: ReviewWorkerProgress): boolean =>
  expected.incarnation === actual.incarnation && expected.attempt === actual.attempt &&
  expected.key.project === actual.key.project && expected.key.family === actual.key.family &&
  expected.key.reviewId === actual.key.reviewId;
const label = (value: string | undefined): string | null =>
  value !== undefined && Value.Check(ProgressLabel, value) ? value : null;
/** Unverified admission may not claim reviewed work; reviewProgressPublication already rejects it. */
const unverifiedReviewedWork = (admission: { validation: string } | undefined, reviewed: number): boolean =>
  admission?.validation === 'unverified' && reviewed > 0;

export function mapDesignReviewMeasurement(
  identity: ReviewIdentity, progress: ReviewWorkerProgress, task: TaskRef, owner: TaskOwnerFence,
): DelegateMeasurement<DesignReviewDetails> | null {
  if (!sameIdentity(identity, progress)) return null;
  const observation = progress.key.family === 'design' ? progress.observation as
    | (Record<string, unknown> & { completedChunks?: unknown; totalChunks?: unknown; activeChunkId?: unknown;
        coverageProgress?: unknown; report?: unknown; admission?: unknown; lastMeaningfulActivityAt?: unknown })
    | undefined : undefined;
  if (!observation || typeof observation !== 'object') return null;
  const completed = observation.completedChunks, total = observation.totalChunks;
  if (!Value.Check(ProgressSequence, completed) || !Value.Check(ProgressSequence, total) || completed > total) return null;
  const coverage = observation.coverageProgress as
    | { plannedChunks?: unknown; selectedChunks?: unknown; reviewedChunks?: unknown; retainedChunks?: unknown } | undefined;
  if (coverage !== undefined) {
    const { plannedChunks, selectedChunks, reviewedChunks, retainedChunks } = coverage;
    if (!Value.Check(ProgressSequence, plannedChunks) || !Value.Check(ProgressSequence, selectedChunks) ||
        !Value.Check(ProgressSequence, reviewedChunks) || !Value.Check(ProgressSequence, retainedChunks)) return null;
    // Retained coverage complements the fresh selection; an inconsistent plan maps to null.
    if (retainedChunks + selectedChunks !== plannedChunks) return null;
    if (reviewedChunks > selectedChunks) return null;
    if (unverifiedReviewedWork(observation.admission as never, reviewedChunks)) return null;
  }
  if (unverifiedReviewedWork(observation.admission as never, completed)) return null;
  const report = observation.report as { artifactId?: unknown } | undefined;
  const targetValue = report?.artifactId ?? progress.key.reviewId;
  if (!Value.Check(target, targetValue)) return null;
  const checks: MeasuredCount = { unit: 'chunks', completed, total };
  const freshChunks: MeasuredCount | null = coverage !== undefined && Value.Check(ProgressSequence, coverage.reviewedChunks) && Value.Check(ProgressSequence, coverage.selectedChunks)
    ? { unit: 'chunks', completed: coverage.reviewedChunks, total: coverage.selectedChunks } : null;
  const retainedChunks = coverage !== undefined && Value.Check(ProgressSequence, coverage.retainedChunks) ? coverage.retainedChunks : null;
  const details: DesignReviewDetails = { kind: 'design-review', target: targetValue, checks, freshChunks, retainedChunks, retries: null };
  return {
    kind: 'design-review',
    measuredAt: progress.updatedAt,
    meaningfulRevision: progress.sequence,
    lastMeaningfulAt: typeof observation.lastMeaningfulActivityAt === 'string' && Number.isFinite(Date.parse(observation.lastMeaningfulActivityAt))
      ? observation.lastMeaningfulActivityAt : null,
    phase: label(progress.display?.phase) ?? progress.phase,
    activeUnit: label(typeof observation.activeChunkId === 'string' ? observation.activeChunkId : undefined),
    counts: freshChunks !== null ? [freshChunks] : [],
    milestones: [],
    controls: [],
    details,
    task,
    owner,
  };
}

export function mapCodeReviewMeasurement(
  identity: ReviewIdentity, progress: ReviewWorkerProgress, task: TaskRef, owner: TaskOwnerFence,
): DelegateMeasurement<CodeReviewDetails> | null {
  if (!sameIdentity(identity, progress)) return null;
  const observation = progress.key.family === 'code' ? progress.observation as
    | (Record<string, unknown> & { status?: unknown; crPublication?: unknown; completedTasks?: unknown; totalTasks?: unknown;
        progress?: unknown; admission?: unknown }) | undefined : undefined;
  if (!observation || typeof observation !== 'object') return null;
  const completed = observation.completedTasks, total = observation.totalTasks;
  if (!Value.Check(ProgressSequence, completed) || !Value.Check(ProgressSequence, total) || completed > total) return null;
  if (unverifiedReviewedWork(observation.admission as never, completed)) return null;
  const view = observation as { status?: string; crPublication?: string; progress?: { phase?: unknown; task?: { name?: unknown } | null; lastMeaningfulActivityAt?: unknown } | null };
  const publication = view.status === 'failed' ? 'failed'
    : view.crPublication === 'complete' ? 'complete'
    : view.crPublication === 'pending' ? 'pending' : 'unknown';
  const details: CodeReviewDetails = {
    kind: 'code-review',
    target: progress.key.reviewId,
    initial: { unit: 'tasks', completed, total },
    followUp: null,
    retries: null,
    publication,
  };
  return {
    kind: 'code-review',
    measuredAt: progress.updatedAt,
    meaningfulRevision: progress.sequence,
    lastMeaningfulAt: typeof view.progress?.lastMeaningfulActivityAt === 'string' && Number.isFinite(Date.parse(view.progress.lastMeaningfulActivityAt))
      ? view.progress.lastMeaningfulActivityAt : null,
    phase: label(progress.display?.phase) ?? (Value.Check(ProgressLabel, view.progress?.phase) ? view.progress.phase : progress.phase),
    activeUnit: label(typeof view.progress?.task?.name === 'string' ? view.progress.task.name : undefined),
    counts: [{ unit: 'tasks', completed, total }],
    milestones: [],
    controls: [],
    details,
    task,
    owner,
  };
}

/** Read-only source the delegates share: progressOf plus the live identity. */
export interface ReviewProgressSource {
  progressOf(key: ReviewKey): ReviewWorkerProgress | undefined;
  identity(key: ReviewKey): ReviewWorkerIdentity | undefined;
}

/** One registered review task, owned through the review producer's port. */
export interface ReviewTaskBinding {
  readonly kind: 'design-review' | 'code-review';
  readonly task: TaskRef;
  readonly owner: OwnerHandle;
  /** The producer port this binding was registered on; t6 signals through it. */
  readonly producer: Pick<ProducerPort<ReviewDetails>, 'signalMeasurement' | 'recordLifecycle'>;
}

export interface BindReviewTaskDeps {
  /** The one progress runtime, typed over every detail kind. */
  readonly runtime: () => Promise<{
    access: Pick<ProgressAccess<AllTaskDetails>, 'launchReview' | 'projectForScope'>;
    producers: { designReview: ProducerPort<DesignReviewDetails>; codeReview: ProducerPort<CodeReviewDetails> };
  }>;
  /** Read-only review publication source; the delegates consume it, nothing else. */
  readonly source: ReviewProgressSource;
}

/** Bind a review attempt to a coordinator task at admission. Returns undefined
 *  (the review is admitted unobserved, exactly as before) when the connection is
 *  a session, the launch is refused or registration fails; callers must never
 *  let this fail or slow the review. Minting and fencing stay in s1. */
/** Wrap a delegate so its measurement is stamped with the coordinator's durable
 *  fence; normalize rejects any owner other than the runtime's ownerId/epoch.
 *  The fence epoch is minted at admission, so the wrapper reads a mutable ref
 *  that bindReviewTask fills in the moment registration returns. */
function withOwnedFence<D extends ReviewDetails>(delegate: TaskProgressDelegate<D>, fence: { current?: TaskOwnerFence | undefined }): TaskProgressDelegate<D> {
  return {
    progress: async (task, signal) => {
      const measured = await delegate.progress(task, signal);
      const owned = fence.current;
      if (measured === null || owned === undefined) return measured;
      return { ...measured, owner: { ownerId: owned.ownerId, ownerEpoch: owned.ownerEpoch, ownerSequence: measured.owner.ownerSequence } };
    },
    ...(delegate.ownerActivity === undefined ? {} : { ownerActivity: (task, signal) => delegate.ownerActivity!(task, signal) }),
    ...(delegate.cancel === undefined ? {} : { cancel: (task, requestId) => delegate.cancel!(task, requestId) }),
  };
}

export async function bindReviewTask(
  deps: BindReviewTaskDeps,
  key: ReviewKey, attempt: number, context: TrustedRpcContext,
): Promise<ReviewTaskBinding | undefined> {
  try {
    if (context.connectionSignal?.aborted || context.connectionSession !== undefined ||
        context.connectionExecution?.mode === 'session-memory') return undefined;
    const runtime = await deps.runtime();
    const project = await runtime.access.projectForScope(key.project);
    if (project === undefined) return undefined;
    const incarnation = deps.source.identity(key)?.incarnation;
    if (incarnation === undefined) return undefined;
    const { authorization } = await runtime.access.launchReview(project, key.reviewId, `review-${key.family}-${key.reviewId}`, context);
    const fence: { current?: TaskOwnerFence | undefined } = {};
    if (key.family === 'design') {
      const registration = await runtime.producers.designReview.register(authorization, key.reviewId,
        withOwnedFence(new DesignReviewDelegate(deps.source, { key, incarnation, attempt }), fence));
      if (registration.kind !== 'admitted') return undefined;
      fence.current = registration.fence;
      return { kind: 'design-review', task: registration.task, owner: registration.owner, producer: runtime.producers.designReview };
    }
    const registration = await runtime.producers.codeReview.register(authorization, key.reviewId,
      withOwnedFence(new CodeReviewDelegate(deps.source, { key, incarnation, attempt }), fence));
    if (registration.kind !== 'admitted') return undefined;
    fence.current = registration.fence;
    return { kind: 'code-review', task: registration.task, owner: registration.owner, producer: runtime.producers.codeReview };
  } catch {
    return undefined;
  }
}

/** Terminal phases only; the review verdict (passed / changes_requested) never
 *  reaches the owner's lifecycle — only the owner's own terminal phase does. */
export function reviewTerminalEvidence(phase: 'complete' | 'failed' | 'interrupted', sequence: number): OwnerEvidence {
  const state = phase === 'complete' ? 'completed' as const : phase;
  return { sequence, state };
}

abstract class ReviewDelegateBase<D extends ReviewDetails> implements TaskProgressDelegate<D> {
  private lastAccepted: { incarnation: string; sequence: number; measurement: DelegateMeasurement<D>; processAlive: boolean } | undefined;
  private probeSequence = 0;
  constructor(
    protected readonly source: ReviewProgressSource,
    protected readonly identity: ReviewIdentity,
  ) {}
  protected abstract map(progress: ReviewWorkerProgress, task: TaskRef, owner: TaskOwnerFence): DelegateMeasurement<D> | null;
  /** True when the mapping must also observe executor process liveness (code review). */
  protected abstract readonly requiresAliveProcess: boolean;
  protected processAlive(progress: ReviewWorkerProgress): boolean {
    return (progress.observation as { progress?: { processState?: unknown } } | undefined)?.progress?.processState === 'alive';
  }
  /** A sample from an earlier incarnation or a lower sequence never replaces the newer measurement. */
  private isNewer(progress: ReviewWorkerProgress): boolean {
    const last = this.lastAccepted;
    if (!last) return true;
    if (progress.incarnation === last.incarnation) return progress.sequence > last.sequence;
    // A new incarnation supersedes the old one only once it is the live one.
    return progress.incarnation === this.source.identity(this.identity.key)?.incarnation;
  }
  /** True when only the sequence/timestamp advanced: a heartbeat keeps the prior revision. */
  private isHeartbeat(mapped: DelegateMeasurement<D>): boolean {
    const last = this.lastAccepted?.measurement;
    if (!last) return false;
    const strip = (m: DelegateMeasurement<D>) => ({
      ...m, meaningfulRevision: 0, measuredAt: '',
      owner: { ...m.owner, ownerSequence: 0 },
    });
    return JSON.stringify(strip(mapped)) === JSON.stringify(strip(last));
  }
  async progress(task: TaskRef): Promise<DelegateMeasurement<D> | null> {
    try {
      const progress = this.source.progressOf(this.identity.key);
      if (!progress) return null; // missing or closing entry
      if (!this.isNewer(progress)) return this.lastAccepted?.measurement ?? null;
      // An unverified admission in a new incarnation is not verified yet: the
      // previous (e.g. interrupted) measurement stands until verification.
      const admission = (progress.observation as { admission?: { validation?: unknown } } | undefined)?.admission;
      if (this.lastAccepted && admission?.validation === 'unverified' && progress.incarnation !== this.lastAccepted.incarnation) {
        return this.lastAccepted.measurement;
      }
      const owner: TaskOwnerFence = { ownerId: 'main', ownerEpoch: progress.incarnation, ownerSequence: progress.sequence };
      let mapped = this.map(progress, task, owner);
      if (!mapped) return this.lastAccepted?.measurement ?? null; // a rejected sample keeps the last accepted measurement
      // An interrupted review surfaces as phase 'interrupted' for both families.
      if ((progress.observation as { status?: unknown } | undefined)?.status === 'interrupted') mapped = { ...mapped, phase: 'interrupted' };
      const measurement = this.isHeartbeat(mapped) && this.lastAccepted
        ? { ...mapped, meaningfulRevision: this.lastAccepted.measurement.meaningfulRevision }
        : mapped;
      this.lastAccepted = { incarnation: progress.incarnation, sequence: progress.sequence, measurement, processAlive: this.processAlive(progress) };
      return measurement;
    } catch {
      return null; // never throws
    }
  }
  /** Liveness only: a fresh sequence per probe while the live incarnation matches
   * (and the process is alive for code). Reading never renews anything itself. */
  async ownerActivity(_task: TaskRef): Promise<number | null> {
    try {
      const live = this.source.identity(this.identity.key);
      if (!live || !this.lastAccepted || live.incarnation !== this.lastAccepted.incarnation) return null;
      if (this.requiresAliveProcess && !this.lastAccepted.processAlive) return null;
      return ++this.probeSequence;
    } catch {
      return null;
    }
  }
}

export class DesignReviewDelegate extends ReviewDelegateBase<DesignReviewDetails> {
  protected readonly requiresAliveProcess = false;
  protected map(progress: ReviewWorkerProgress, task: TaskRef, owner: TaskOwnerFence): DelegateMeasurement<DesignReviewDetails> | null {
    // Validate key and attempt against the bound identity; accept the sample's
    // incarnation because a newer live incarnation supersedes the bound one.
    return mapDesignReviewMeasurement({ ...this.identity, incarnation: progress.incarnation, attempt: progress.attempt }, progress, task, owner);
  }
}
export class CodeReviewDelegate extends ReviewDelegateBase<CodeReviewDetails> {
  protected readonly requiresAliveProcess = true;
  protected map(progress: ReviewWorkerProgress, task: TaskRef, owner: TaskOwnerFence): DelegateMeasurement<CodeReviewDetails> | null {
    return mapCodeReviewMeasurement({ ...this.identity, incarnation: progress.incarnation, attempt: progress.attempt }, progress, task, owner);
  }
}
