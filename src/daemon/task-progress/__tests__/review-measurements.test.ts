import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import {
  CodeReviewDelegate, CodeReviewDetailsSchema, DesignReviewDelegate, DesignReviewDetailsSchema,
  mapCodeReviewMeasurement, mapDesignReviewMeasurement, validateReviewDetails,
} from '../review-measurements.js';
import type { ReviewProgressSource } from '../review-measurements.js';
import type { ReviewWorkerProgress } from '../../threads/review-workers.js';
import type { ReviewKey } from '../../../shared/review-resources.js';
import { MAX_PROGRESS_SNAPSHOT_BYTES } from '../../../shared/task-progress.js';

const identity = { key: { project: '/repo', family: 'design' as const, reviewId: 'rev-1' }, incarnation: 'inc-1', attempt: 1 };
const codeIdentity = { key: { project: '/repo', family: 'code' as const, reviewId: 'rev-c1' }, incarnation: 'inc-1', attempt: 1 };
const task = { projectId: 'proj', invocationId: 'inv', taskId: 's3', attempt: 1 };
const owner = { ownerId: 'main', ownerEpoch: 'epoch-1', ownerSequence: 4 };

function designProgress(overrides: Partial<ReviewWorkerProgress> = {}, observation: Record<string, unknown> = {}): ReviewWorkerProgress {
  return {
    key: identity.key, incarnation: identity.incarnation, attempt: 1, sequence: 7, phase: 'execution',
    completed: 2, total: 5, updatedAt: '2026-11-15T10:00:00.000Z',
    observation: {
      status: 'running', phase: 'chunk_review', completedChunks: 2, totalChunks: 5, activeChunkId: 'chunk-3',
      lastMeaningfulActivityAt: '2026-11-15T09:59:00.000Z',
      coverageProgress: { plannedChunks: 8, selectedChunks: 5, reviewedChunks: 2, retainedChunks: 3, effectiveCompletedChunks: 5 },
      report: { artifactId: 'LLD-abc123-s1' },
      ...observation,
    } as never,
    display: { project: '/repo', family: 'design', reviewId: 'rev-1', attempt: 1, status: 'running', phase: 'chunk_review',
      completed: 2, total: 5, observedAt: '2026-11-15T10:00:00.000Z', freshness: 'live' },
    ...overrides,
  };
}
function codeProgress(overrides: Partial<ReviewWorkerProgress> = {}, observation: Record<string, unknown> = {}): ReviewWorkerProgress {
  return {
    key: { ...codeIdentity.key }, incarnation: codeIdentity.incarnation, attempt: 1, sequence: 9, phase: 'execution',
    completed: 3, total: 10, updatedAt: '2026-11-15T10:01:00.000Z',
    observation: {
      reviewId: 'rev-c1', attempt: 1, status: 'running', crPublication: 'pending', executionState: 'active',
      completedTasks: 3, totalTasks: 10, interrupted: false, hasError: false, freshness: 'live',
      progress: { phase: 'task_review', task: { id: 't3', name: 'write validators', position: 3, total: 10 },
        lastMeaningfulActivityAt: '2026-11-15T10:00:30.000Z' },
      ...observation,
    } as never,
    display: { project: '/repo', family: 'code', reviewId: 'rev-c1', attempt: 1, status: 'running', phase: 'task_review',
      completed: 3, total: 10, observedAt: '2026-11-15T10:01:00.000Z', freshness: 'live' },
    ...overrides,
  };
}

test('validators accept the sc5 shapes and reject unknown kinds, extra fields and over-long labels', () => {
  const design = { kind: 'design-review', target: 'LLD-abc123-s1', checks: { unit: 'chunks', completed: 2, total: 5 },
    freshChunks: { unit: 'chunks', completed: 2, total: 5 }, retainedChunks: 3, retries: null };
  const code = { kind: 'code-review', target: 'BUILD-abc123-s1', initial: { unit: 'tasks', completed: 3, total: 10 },
    followUp: null, retries: null, publication: 'pending' };
  assert.ok(Value.Check(DesignReviewDetailsSchema, design));
  assert.ok(Value.Check(CodeReviewDetailsSchema, code));
  assert.ok(validateReviewDetails('design-review', design));
  assert.ok(validateReviewDetails('code-review', code));
  assert.ok(!validateReviewDetails('workflow', design), 'unknown kind rejected');
  assert.ok(!validateReviewDetails('design-review', { ...design, extra: 1 }), 'extra fields rejected');
  assert.ok(!validateReviewDetails('design-review', { ...design, checks: { unit: 'chunks', completed: -1, total: 5 } }), 'negative count rejected');
  assert.ok(!validateReviewDetails('design-review', { ...design, checks: { unit: 'chunks', completed: 1.5, total: 5 } }), 'non-integer count rejected');
  assert.ok(!validateReviewDetails('code-review', { ...code, target: 'x'.repeat(2049) }), 'over-long target rejected');
  assert.ok(!validateReviewDetails('code-review', { ...code, publication: 'maybe' }), 'unknown publication rejected');
  assert.ok(!Value.Check(DesignReviewDetailsSchema, { ...design, retainedChunks: -1 }), 'negative retainedChunks rejected');
});

test('design review reports active chunk, reviewed against selected chunks and retained coverage separately', () => {
  const m = mapDesignReviewMeasurement(identity, designProgress(), task, owner);
  assert.ok(m);
  assert.equal(m.kind, 'design-review');
  assert.equal(m.details.kind, 'design-review');
  assert.equal(m.details.target, 'LLD-abc123-s1');
  assert.deepEqual(m.details.checks, { unit: 'chunks', completed: 2, total: 5 });
  assert.deepEqual(m.details.freshChunks, { unit: 'chunks', completed: 2, total: 5 }, 'reviewed against selected, not planned');
  assert.equal(m.details.retainedChunks, 3, 'retained coverage is reported separately, not folded into fresh counts');
  assert.equal(m.details.retries, null);
  assert.equal(m.activeUnit, 'chunk-3');
  assert.equal(m.phase, 'chunk_review');
  assert.equal(m.meaningfulRevision, 7);
  assert.equal(m.lastMeaningfulAt, '2026-11-15T09:59:00.000Z');
  assert.deepEqual(m.owner, owner);
  assert.deepEqual(m.task, task);
  // Without coverageProgress retained/fresh fall back to null while checks still report raw counts.
  const noCoverage = mapDesignReviewMeasurement(identity, designProgress({}, { coverageProgress: undefined }), task, owner);
  assert.ok(noCoverage);
  assert.equal(noCoverage.details.freshChunks, null);
  assert.equal(noCoverage.details.retainedChunks, null);
  assert.deepEqual(noCoverage.details.checks, { unit: 'chunks', completed: 2, total: 5 });
});

test('code review reports active task, completed against total tasks and publication state', () => {
  const m = mapCodeReviewMeasurement(codeIdentity, codeProgress(), task, owner);
  assert.ok(m);
  assert.equal(m.kind, 'code-review');
  assert.equal(m.details.target, 'rev-c1');
  assert.deepEqual(m.details.initial, { unit: 'tasks', completed: 3, total: 10 });
  assert.equal(m.details.followUp, null);
  assert.equal(m.details.retries, null);
  assert.equal(m.details.publication, 'pending');
  assert.equal(m.activeUnit, 'write validators');
  assert.equal(m.phase, 'task_review');
  assert.deepEqual(m.counts, [{ unit: 'tasks', completed: 3, total: 10 }]);
  const complete = mapCodeReviewMeasurement(codeIdentity, codeProgress({}, { crPublication: 'complete' }), task, owner);
  assert.equal(complete!.details.publication, 'complete');
  const failed = mapCodeReviewMeasurement(codeIdentity, codeProgress({}, { status: 'failed' }), task, owner);
  assert.equal(failed!.details.publication, 'failed');
  const unknown = mapCodeReviewMeasurement(codeIdentity, codeProgress({}, { crPublication: undefined }), task, owner);
  assert.equal(unknown!.details.publication, 'unknown');
});

test('retries and follow-up stay null when the engine reports none', () => {
  const d = mapDesignReviewMeasurement(identity, designProgress({}, { retriesUsed: 2 }), task, owner);
  assert.equal(d!.details.retries, null, 'design engine retry count is not adopted; sc5 reports null');
  const c = mapCodeReviewMeasurement(codeIdentity, codeProgress(), task, owner);
  assert.equal(c!.details.retries, null);
  assert.equal(c!.details.followUp, null);
});

test('foreign identity, inconsistent counts and unverified admission map to null', () => {
  const foreign = mapDesignReviewMeasurement({ ...identity, incarnation: 'other' }, designProgress(), task, owner);
  assert.equal(foreign, null);
  const foreignKey = mapCodeReviewMeasurement(codeIdentity, codeProgress({ key: { ...identity.key, family: 'code', reviewId: 'other' } }), task, owner);
  assert.equal(foreignKey, null);
  assert.equal(mapDesignReviewMeasurement(identity, designProgress({}, { completedChunks: 6, totalChunks: 5 }), task, owner), null, 'completed above total');
  assert.equal(mapDesignReviewMeasurement(identity, designProgress({}, {
    coverageProgress: { plannedChunks: 8, selectedChunks: 5, reviewedChunks: 2, retainedChunks: 4 },
  }), task, owner), null, 'retained + selected must equal planned');
  assert.equal(mapDesignReviewMeasurement(identity, designProgress({}, {
    coverageProgress: { plannedChunks: 8, selectedChunks: 5, reviewedChunks: 6, retainedChunks: 3 },
  }), task, owner), null, 'reviewed above selected maps to null');
  assert.equal(mapCodeReviewMeasurement(codeIdentity, codeProgress({}, { completedTasks: 11, totalTasks: 10 }), task, owner), null);
  assert.equal(mapDesignReviewMeasurement(identity, designProgress({}, { admission: { validation: 'unverified' }, completedChunks: 1, totalChunks: 5 }), task, owner), null,
    'unverified admission claiming reviewed work maps to null');
  assert.ok(mapDesignReviewMeasurement(identity, designProgress({}, { admission: { validation: 'unverified' }, completedChunks: 0, totalChunks: 5,
    coverageProgress: { plannedChunks: 8, selectedChunks: 5, reviewedChunks: 0, retainedChunks: 3, effectiveCompletedChunks: 3 } }), task, owner),
    'unverified admission with zero reviewed work still maps');
});

test('a mapped measurement fits the 8 KiB snapshot bound', () => {
  const d = mapDesignReviewMeasurement(identity, designProgress(), task, owner)!;
  const c = mapCodeReviewMeasurement(codeIdentity, codeProgress(), task, owner)!;
  for (const m of [d, c]) {
    const snapshot = { task: m.task, cursor: String(m.meaningfulRevision), state: 'running', freshness: 'live',
      measurement: m, lastOwnerActivityAt: null, workerHealth: 'alive', cancellation: 'none' };
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= MAX_PROGRESS_SNAPSHOT_BYTES);
  }
});

/** In-memory ReviewProgressSource double over an entry map. */
function fakeSource(entries: Map<string, { progress?: ReviewWorkerProgress; closing?: boolean; live?: string }>): ReviewProgressSource {
  const keyOf = (key: ReviewKey) => JSON.stringify([key.project, key.family, key.reviewId]);
  return {
    progressOf: key => { const e = entries.get(keyOf(key)); return !e || e.closing ? undefined : e.progress; },
    identity: key => { const e = entries.get(keyOf(key)); const live = e?.live; return live ? { key, incarnation: live } : undefined; },
  };
}
const srcKey = (family: 'design' | 'code', reviewId: string): ReviewKey => ({ project: '/repo', family, reviewId });

test('a delayed publication from an earlier incarnation does not replace the newer measurement', async () => {
  const key = srcKey('design', 'rev-1');
  const entries = new Map<string, { progress?: ReviewWorkerProgress; live?: string }>([
    [JSON.stringify([key.project, key.family, key.reviewId]), { live: 'inc-2' }],
  ]);
  const source = fakeSource(entries);
  const delegate = new DesignReviewDelegate(source, { ...identity });
  const newer = designProgress({ incarnation: 'inc-2', sequence: 5 });
  entries.get(JSON.stringify([key.project, key.family, key.reviewId]))!.progress = newer;
  const first = await delegate.progress(task);
  assert.equal(first!.meaningfulRevision, 5);
  // A stale sample from the old incarnation arrives late.
  entries.get(JSON.stringify([key.project, key.family, key.reviewId]))!.progress = designProgress({ incarnation: 'inc-1', sequence: 99 });
  const second = await delegate.progress(task);
  assert.equal(second!.meaningfulRevision, 5, 'stale incarnation does not replace the newer measurement');
  // A lower sequence in the same incarnation is also stale.
  entries.get(JSON.stringify([key.project, key.family, key.reviewId]))!.progress = designProgress({ incarnation: 'inc-2', sequence: 3 });
  const third = await delegate.progress(task);
  assert.equal(third!.meaningfulRevision, 5, 'lower sequence does not replace the newer measurement');
});

test('heartbeat-only samples keep counts and meaningful revision unchanged', async () => {
  const key = srcKey('code', 'rev-c1');
  const entries = new Map([[JSON.stringify([key.project, key.family, key.reviewId]), { live: 'inc-1' }]]) as Map<string, { progress?: ReviewWorkerProgress; live?: string }>;
  entries.get(JSON.stringify([key.project, key.family, key.reviewId]))!.progress = codeProgress();
  const delegate = new CodeReviewDelegate(fakeSource(entries), { ...codeIdentity });
  const first = await delegate.progress(task);
  assert.deepEqual(first!.counts, [{ unit: 'tasks', completed: 3, total: 10 }]);
  // Heartbeat: same counts, only sequence/updatedAt advance.
  entries.get(JSON.stringify([key.project, key.family, key.reviewId]))!.progress = codeProgress({ sequence: 10, updatedAt: '2026-11-15T10:02:00.000Z' });
  const second = await delegate.progress(task);
  assert.deepEqual(second!.counts, [{ unit: 'tasks', completed: 3, total: 10 }], 'counts unchanged by heartbeat');
  assert.equal(second!.meaningfulRevision, first!.meaningfulRevision, 'a heartbeat-only sample leaves meaningfulRevision unchanged');
});

test('an interrupted review reads as interrupted until the new incarnation is verified', async () => {
  const key = srcKey('code', 'rev-c1');
  const slot = JSON.stringify([key.project, key.family, key.reviewId]);
  const entries = new Map([[slot, { live: 'inc-1' }]]) as Map<string, { progress?: ReviewWorkerProgress; live?: string }>;
  entries.get(slot)!.progress = codeProgress({}, { status: 'interrupted' });
  const delegate = new CodeReviewDelegate(fakeSource(entries), { ...codeIdentity });
  const interrupted = await delegate.progress(task);
  assert.equal(interrupted!.details.publication, 'pending', 'publication follows crPublication unless status is failed');
  assert.equal(interrupted!.phase, 'interrupted', 'an interrupted review reads as interrupted');
  assert.equal(interrupted!.details.initial.completed, 3, 'interrupted review keeps its last accepted counts');
  // New incarnation admitted but not yet verified (no progress accepted): keep the interrupted view.
  entries.get(slot)!.live = 'inc-2';
  const held = await delegate.progress(task);
  assert.equal(held!.meaningfulRevision, interrupted!.meaningfulRevision, 'unverified new incarnation does not replace the interrupted measurement');
  // Once the new incarnation publishes, its measurement wins.
  entries.get(slot)!.progress = codeProgress({ incarnation: 'inc-2', sequence: 1, updatedAt: '2026-11-15T10:03:00.000Z' }, { status: 'running' });
  const recovered = await delegate.progress(task);
  assert.equal(recovered!.meaningfulRevision, 1);
});

test('a missing or closing entry returns null without throwing', async () => {
  const key = srcKey('design', 'gone');
  const delegate = new DesignReviewDelegate(fakeSource(new Map()), { ...identity, key });
  assert.equal(await delegate.progress(task), null);
  assert.equal(await delegate.ownerActivity(task), null);
  const closing = srcKey('design', 'closing');
  const slot = JSON.stringify([closing.project, closing.family, closing.reviewId]);
  const entries = new Map([[slot, { closing: true, progress: designProgress() }]]) as Map<string, { progress?: ReviewWorkerProgress; closing?: boolean }>;
  const closingDelegate = new DesignReviewDelegate(fakeSource(entries), { ...identity, key: closing });
  assert.equal(await closingDelegate.progress(task), null, 'closing entry yields null');
  // After an accepted measurement, a missing/closing entry or a throwing read
  // returns null rather than serving the cache.
  const liveKey = srcKey('design', 'rev-1');
  const liveSlot = JSON.stringify([liveKey.project, liveKey.family, liveKey.reviewId]);
  const liveEntries = new Map([[liveSlot, { live: 'inc-1', progress: designProgress() }]]) as Map<string, { progress?: ReviewWorkerProgress; live?: string; closing?: boolean }>;
  const liveDelegate = new DesignReviewDelegate(fakeSource(liveEntries), { ...identity });
  assert.ok(await liveDelegate.progress(task), 'first read accepts');
  liveEntries.get(liveSlot)!.closing = true;
  assert.equal(await liveDelegate.progress(task), null, 'closing after an accepted measurement yields null');
  liveEntries.delete(liveSlot);
  assert.equal(await liveDelegate.progress(task), null, 'missing entry after an accepted measurement yields null');
  const throwing: ReviewProgressSource = { progressOf: () => { throw new Error('boom'); }, identity: () => undefined };
  const throwingDelegate = new DesignReviewDelegate(throwing, { ...identity });
  assert.equal(await throwingDelegate.progress(task), null, 'a throwing read returns null without throwing');
});

test('observing progress leaves review results, publication and approval unchanged', async () => {
  const key = srcKey('design', 'rev-1');
  const slot = JSON.stringify([key.project, key.family, key.reviewId]);
  const entries = new Map([[slot, { live: 'inc-1', progress: designProgress() }]]) as Map<string, { progress?: ReviewWorkerProgress; live?: string }>;
  const source = fakeSource(entries);
  const delegate = new DesignReviewDelegate(source, { ...identity });
  const before = structuredClone(entries.get(slot)!.progress);
  for (let i = 0; i < 3; i++) await delegate.progress(task);
  await delegate.ownerActivity(task);
  assert.deepEqual(entries.get(slot)!.progress, before, 'the stored publication is untouched by reads');
  assert.equal(typeof delegate.cancel, 'undefined', 'delegates expose no cancel, so controls stay empty');
});

test('code review ownerActivity requires a live incarnation and an alive process', async () => {
  const key = srcKey('code', 'rev-c1');
  const slot = JSON.stringify([key.project, key.family, key.reviewId]);
  const aliveObs = { ...codeProgress().observation as Record<string, unknown>, progress: { phase: 'task_review', task: null, processState: 'alive', lastMeaningfulActivityAt: '2026-11-15T10:00:30.000Z' } };
  const entries = new Map([[slot, { live: 'inc-1', progress: codeProgress({}, aliveObs) }]]) as Map<string, { progress?: ReviewWorkerProgress; live?: string }>;
  const delegate = new CodeReviewDelegate(fakeSource(entries), { ...codeIdentity });
  await delegate.progress(task);
  assert.equal(await delegate.ownerActivity(task), 9, 'alive process reports the last accepted sequence');
  const deadObs = { ...codeProgress().observation as Record<string, unknown>, progress: { phase: 'task_review', task: null, processState: 'exited', lastMeaningfulActivityAt: '2026-11-15T10:00:30.000Z' } };
  entries.get(slot)!.progress = codeProgress({ sequence: 11 }, deadObs);
  await delegate.progress(task);
  assert.equal(await delegate.ownerActivity(task), null, 'exited process yields null');
  entries.get(slot)!.live = 'inc-2';
  assert.equal(await delegate.ownerActivity(task), null, 'a foreign live incarnation yields null');
});
