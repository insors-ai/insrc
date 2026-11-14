/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { ReviewWorkerProgress } from '../threads/review-workers.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewWorkerIdentity } from '../threads/review-worker-contract.js';
import { MeasuredCountSchema, ProgressLabel, ProgressSequence, progressObject } from '../../shared/task-progress.js';
import type { DelegateMeasurement, MeasuredCount, ProgressKind, TaskOwnerFence, TaskProgressDelegate, TaskRef } from '../../shared/task-progress.js';

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

abstract class ReviewDelegateBase<D extends ReviewDetails> implements TaskProgressDelegate<D> {
  private lastAccepted: { incarnation: string; sequence: number; measurement: DelegateMeasurement<D>; processAlive: boolean } | undefined;
  protected constructor(
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
  /** Liveness only: the last accepted sequence while the live incarnation matches (and the process is alive for code). Never renews activity by reading. */
  async ownerActivity(_task: TaskRef): Promise<number | null> {
    try {
      const live = this.source.identity(this.identity.key);
      if (!live || !this.lastAccepted || live.incarnation !== this.lastAccepted.incarnation) return null;
      if (this.requiresAliveProcess && !this.lastAccepted.processAlive) return null;
      return this.lastAccepted.sequence;
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
