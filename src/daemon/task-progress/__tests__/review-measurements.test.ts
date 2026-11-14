import test from 'node:test';
import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import {
  CodeReviewDetailsSchema, DesignReviewDetailsSchema, mapCodeReviewMeasurement, mapDesignReviewMeasurement,
  validateReviewDetails,
} from '../review-measurements.js';
import type { ReviewWorkerProgress } from '../../threads/review-workers.js';
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
