import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_PROGRESS_SNAPSHOT_BYTES } from '../../../shared/task-progress.js';
import type {
  TaskOwnerFence, TaskProgressDelegate, TaskRef,
} from '../../../shared/task-progress.js';
import type { ReviewKey } from '../../../shared/review-resources.js';
import type { ReviewWorkerProgress } from '../../threads/review-workers.js';
import { createProgressAuthority, ProgressCoordinator } from '../coordinator.js';
import { ProgressStore } from '../store.js';
import type { ProgressRecord } from '../record.js';
import { validProgressMeasurement } from '../record.js';
import { registerExecutorProducers } from '../executor-measurements.js';
import type { AnalysisDetails, WorkflowDetails } from '../executor-measurements.js';
import {
  AllTaskDetails, CodeReviewDelegate, CodeReviewDetails, DesignReviewDelegate, DesignReviewDetails,
  mapCodeReviewMeasurement, mapDesignReviewMeasurement, registerReviewProducers, validateAllDetails,
} from '../review-measurements.js';
import type { ReviewProgressSource } from '../review-measurements.js';

const designKey: ReviewKey = { project: '/repo', family: 'design', reviewId: 'rev-1' };
const codeKey: ReviewKey = { project: '/repo', family: 'code', reviewId: 'rev-c1' };
const designIdentity = { key: designKey, incarnation: 'inc-1', attempt: 1 };
const codeIdentity = { key: codeKey, incarnation: 'inc-1', attempt: 1 };
const task: TaskRef = { projectId: 'project', invocationId: 'inv', taskId: 's3', attempt: 1 };
const owner: TaskOwnerFence = { ownerId: 'owner', ownerEpoch: 'epoch-1', ownerSequence: 4 };

function designProgress(sequence: number, observation: Record<string, unknown> = {}): ReviewWorkerProgress {
  return {
    key: designKey, incarnation: designIdentity.incarnation, attempt: 1, sequence, phase: 'execution',
    completed: 2, total: 5, updatedAt: '2026-11-15T10:00:00.000Z',
    observation: {
      status: 'running', phase: 'chunk_review', completedChunks: 2, totalChunks: 5, activeChunkId: 'chunk-3',
      lastMeaningfulActivityAt: '2026-11-15T09:59:00.000Z',
      coverageProgress: { plannedChunks: 8, selectedChunks: 5, reviewedChunks: 2, retainedChunks: 3 },
      report: { artifactId: 'LLD-abc123-s1' },
      ...observation,
    } as never,
  } as ReviewWorkerProgress;
}
function codeProgress(sequence: number, observation: Record<string, unknown> = {}): ReviewWorkerProgress {
  return {
    key: codeKey, incarnation: codeIdentity.incarnation, attempt: 1, sequence, phase: 'execution',
    completed: 3, total: 10, updatedAt: '2026-11-15T10:01:00.000Z',
    observation: {
      reviewId: 'rev-c1', attempt: 1, status: 'running', crPublication: 'pending',
      completedTasks: 3, totalTasks: 10,
      progress: { phase: 'task_review', task: { id: 't3', name: 'write validators' },
        lastMeaningfulActivityAt: '2026-11-15T10:00:30.000Z' },
      ...observation,
    } as never,
  } as ReviewWorkerProgress;
}

function fakeSource(key: ReviewKey, incarnation: string): ReviewProgressSource & { set(p: ReviewWorkerProgress | undefined): void } {
  let current: ReviewWorkerProgress | undefined;
  const same = (k: ReviewKey) => current !== undefined &&
    k.project === current.key.project && k.family === current.key.family && k.reviewId === current.key.reviewId;
  return {
    progressOf: k => (same(k) ? current : undefined),
    identity: k => (same(k) && current !== undefined ? { key: k, incarnation } : undefined),
    set: p => { current = p; },
  };
}

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-review-producers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state');
  // The one store runs the composed validator: executor kinds and review kinds together.
  const store = await ProgressStore.open(path, validateAllDetails);
  const authority = createProgressAuthority();
  let time = 1000;
  let monotonic = 0;
  const clock = { now: () => time, monotonic: () => monotonic, wait: async (ms: number) => { monotonic += ms; } };
  const coordinator = new ProgressCoordinator<AllTaskDetails>(store, authority.inspect, clock);
  const producers = { ...registerExecutorProducers(coordinator), ...registerReviewProducers(coordinator) };
  const mint = (invocationId: string, ownerId = 'owner') => authority.mint({
    action: 'launch', invocationId, projectId: 'project', ownerId, origin: { extensionChatId: 'chat' },
  });
  return { path, store, authority, coordinator, producers, mint };
}

test('src/daemon/task-progress/__tests__/review-producers.test.ts: register both delegates through registerProducer and ProducerPort.register with a minted authorization', async t => {
  const f = await fixture(t);
  const designSource = fakeSource(designKey, designIdentity.incarnation);
  const codeSource = fakeSource(codeKey, codeIdentity.incarnation);
  designSource.set(designProgress(1));
  codeSource.set(codeProgress(1));
  const design = await f.producers.designReview.register(f.mint('inv-design'), 'producer-design',
    new DesignReviewDelegate(designSource, designIdentity));
  const code = await f.producers.codeReview.register(f.mint('inv-code'), 'producer-code',
    new CodeReviewDelegate(codeSource, codeIdentity));
  assert.equal(design.kind, 'admitted');
  assert.equal(code.kind, 'admitted');
  if (design.kind !== 'admitted' || code.kind !== 'admitted') return;
  assert.equal(design.task.projectId, 'project');
  assert.notEqual(design.task.taskId, code.task.taskId, 'each kind gets its own task record');
  // The executor producers live on the same coordinator next to the review ones.
  assert.ok(f.producers.workflow);
  assert.ok(f.producers.analysis);
  const refused = await f.producers.designReview.register({} as never, 'producer-x',
    new DesignReviewDelegate(designSource, designIdentity));
  assert.deepEqual(refused, { kind: 'refused', reason: 'invalid-origin' });
});

test('src/daemon/task-progress/__tests__/review-producers.test.ts: a review measurement is committed and read back through the one store and an unknown kind is rejected', async t => {
  const f = await fixture(t);
  const source = fakeSource(designKey, designIdentity.incarnation);
  source.set(designProgress(3));
  const real = new DesignReviewDelegate(source, designIdentity);
  let fence: TaskOwnerFence | undefined;
  // The coordinator owns the durable fence; the delegate's measurement is stamped with it.
  const delegate: TaskProgressDelegate<DesignReviewDetails> = {
    progress: async taskRef => {
      const measured = await real.progress(taskRef);
      const progress = source.progressOf(designKey);
      return measured === null || progress === undefined || fence === undefined ? measured
        : { ...measured, owner: { ownerId: 'owner', ownerEpoch: fence.ownerEpoch, ownerSequence: progress.sequence } };
    },
    ownerActivity: taskRef => real.ownerActivity(taskRef),
  };
  const admission = await f.producers.designReview.register(f.mint('inv-measure'), 'producer-measure', delegate);
  assert.equal(admission.kind, 'admitted');
  if (admission.kind !== 'admitted') return;
  fence = admission.fence;
  await f.producers.designReview.signalMeasurement(admission.owner, 3);
  const snapshot = f.coordinator.read(admission.task);
  assert.ok(snapshot?.measurement, 'the review measurement is committed through the one store');
  assert.equal(snapshot.measurement.kind, 'design-review');
  assert.ok(validateAllDetails('design-review', snapshot.measurement.details), 'read back through the composed validator');
  assert.equal(snapshot.measurement.details.kind, 'design-review');
  // Durable: reopen the store and decode the same record with the composed validator.
  await f.store.settle();
  const reopened = await ProgressStore.open(f.path, validateAllDetails);
  const record = reopened.get(admission.task);
  assert.equal(record?.measurement?.kind, 'design-review');
  assert.ok(record?.measurement !== null && validateAllDetails(record.measurement.kind, record.measurement.details));
  // An unknown kind is still rejected by the composed validator and the store.
  const unknown = { kind: 'test', measuredAt: 1, meaningfulRevision: 1, lastMeaningfulAt: null,
    phase: 'execution', activeUnit: null, counts: [], milestones: [], controls: [], details: { kind: 'test' } };
  assert.ok(!validateAllDetails('test', { kind: 'test' }));
  assert.ok(!reopened.acceptsMeasurement(unknown));
});

test('src/daemon/task-progress/__tests__/review-producers.test.ts: second registration of the same kind is refused', async t => {
  const f = await fixture(t);
  assert.throws(() => f.coordinator.registerProducer('design-review', (d: DesignReviewDetails) => d),
    /progress producer already registered/);
  assert.throws(() => f.coordinator.registerProducer('code-review', (d: CodeReviewDetails) => d),
    /progress producer already registered/);
  assert.throws(() => f.coordinator.registerProducer('workflow', (d: WorkflowDetails) => d),
    /progress producer already registered/);
});

test('src/daemon/task-progress/__tests__/review-producers.test.ts: committed workflow and analysis record fixtures decode with the composed validator', async t => {
  const root = await mkdtemp(join(tmpdir(), 'insrc-review-producers-fixtures-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'state');
  const store = await ProgressStore.open(path, validateAllDetails);
  const base = {
    version: 1 as const, origin: {}, priorAttempts: [],
    owner: { ownerId: 'owner', ownerEpoch: 'epoch', ownerSequence: 0 },
    state: 'running' as const, retention: 'active' as const,
    lastOwnerActivityAt: 1, recoveryDeadline: null,
  };
  const workflowDetails: WorkflowDetails = { kind: 'workflow', stageId: 'decompose',
    activeUnit: null, stagePosition: null, production: null };
  const analysisDetails: AnalysisDetails = { kind: 'analysis', stageId: 'execute', activeUnit: 'task-1',
    stagePosition: { unit: 'tasks', completed: 2, total: 4 }, production: null };
  const workflowRecord: ProgressRecord<AllTaskDetails> = {
    ...base, revision: 0, updatedAt: 1,
    task: { projectId: 'project', invocationId: 'inv-w', taskId: 'wf-1', attempt: 1 },
    measurement: { kind: 'workflow', measuredAt: 1, meaningfulRevision: 1, lastMeaningfulAt: 1,
      phase: 'decompose', activeUnit: null, counts: [], milestones: [], controls: [], details: workflowDetails },
  };
  const analysisRecord: ProgressRecord<AllTaskDetails> = {
    ...base, revision: 0, updatedAt: 1,
    task: { projectId: 'project', invocationId: 'inv-a', taskId: 'an-1', attempt: 1 },
    measurement: { kind: 'analysis', measuredAt: 1, meaningfulRevision: 1, lastMeaningfulAt: 1,
      phase: 'execute', activeUnit: 'task-1',
      counts: [{ unit: 'tasks', completed: 2, total: 4 }], milestones: [], controls: [], details: analysisDetails },
  };
  await store.commit(workflowRecord, null);
  await store.commit(analysisRecord, null);
  await store.settle();
  const reopened = await ProgressStore.open(path, validateAllDetails);
  const workflow = reopened.get(workflowRecord.task);
  const analysis = reopened.get(analysisRecord.task);
  assert.deepEqual(workflow?.measurement?.details, workflowDetails);
  assert.deepEqual(analysis?.measurement?.details, analysisDetails);
  assert.ok(workflow?.measurement !== null && validateAllDetails(workflow.measurement.kind, workflow.measurement.details));
  assert.ok(analysis?.measurement !== null && validateAllDetails(analysis.measurement.kind, analysis.measurement.details));
});

test('src/daemon/task-progress/__tests__/review-producers.test.ts: DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB', () => {
  const design = mapDesignReviewMeasurement(designIdentity, designProgress(7), task, owner);
  const code = mapCodeReviewMeasurement(codeIdentity, codeProgress(9), task, owner);
  assert.ok(design && code);
  for (const m of [design, code] as const) {
    const { task: _t, owner: _o, ...rest } = m;
    const value = { ...rest, measuredAt: Date.parse(m.measuredAt),
      lastMeaningfulAt: m.lastMeaningfulAt === null ? null : Date.parse(m.lastMeaningfulAt) };
    assert.ok(validProgressMeasurement(value, validateAllDetails), `${m.kind} passes the bounded measurement schema`);
    assert.ok(Buffer.byteLength(JSON.stringify(value)) <= MAX_PROGRESS_SNAPSHOT_BYTES,
      `${m.kind} stays under 8 KiB (${Buffer.byteLength(JSON.stringify(value))} bytes)`);
  }
});
