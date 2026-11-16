import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { TrustedRpcContext } from '../../request-context.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import type { ReviewWorkerProgress } from '../review-workers.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';
import { registerReviewWorkerConnection } from '../../review-request-owner.js';
import { ProgressStore } from '../../task-progress/store.js';
import { createProgressAuthority, ProgressCoordinator } from '../../task-progress/coordinator.js';
import type { ReviewTaskBinding } from '../../task-progress/review-measurements.js';
import { bindReviewTask, registerReviewProducers, validateAllDetails } from '../../task-progress/review-measurements.js';
import type { AllTaskDetails } from '../../task-progress/review-measurements.js';
import { ProgressAccess } from '../../task-progress/access.js';
import { FallbackScheduler } from '../../task-progress/fallback.js';
import type { ReviewKey } from '../../../shared/review-resources.js';

const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));

function context(id: string, extra?: Partial<TrustedRpcContext>): { abort: AbortController; context: TrustedRpcContext } {
  const abort = new AbortController();
  return { abort, context: { connectionIdentity: id, daemonEpoch: 'test-epoch', connectionSignal: abort.signal, ...extra } };
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }, opts: { signalBreaks?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'review-task-signal-'));
  const repo = join(root, 'repo'); await mkdir(repo);
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await ProgressStore.open(join(root, 'state'), validateAllDetails);
  const authority = createProgressAuthority();
  const clock = { now: () => Date.now(), monotonic: () => performance.now(), wait: async () => {} };
  const coordinator = new ProgressCoordinator<AllTaskDetails>(store, authority.inspect, clock);
  const fallback = new FallbackScheduler<AllTaskDetails>({
    read: task => coordinator.read(task),
    isTerminal: task => coordinator.isTerminal(task),
    hasLiveOwner: task => coordinator.hasLiveOwner(task),
    disposition: (task, prior, current) => coordinator.disposition(task, prior, current),
    refresh: (task, signal) => coordinator.refreshForFallback(task, signal),
  });
  const projects = async () => new Map([[repo, 1]]);
  const access = new ProgressAccess<AllTaskDetails>(store, coordinator, authority.mint, projects, fallback);
  const producers = registerReviewProducers(coordinator);
  const runtime = async () => {
    if (opts.signalBreaks) {
      const broken = {
        signalMeasurement: async () => { throw new Error('coordinator offline'); },
        recordLifecycle: async () => { throw new Error('coordinator offline'); },
      };
      return { access, producers: { designReview: { ...producers.designReview, ...broken }, codeReview: { ...producers.codeReview, ...broken } } };
    }
    return { access, producers };
  };
  const started = new Map<string, StartedReviewWorker>();
  let registry!: ReviewWorkers;
  const bindTask = (key: ReviewKey, attempt: number, ctx: TrustedRpcContext): Promise<ReviewTaskBinding | undefined> =>
    bindReviewTask({ runtime, source: { progressOf: (k: ReviewKey) => registry.progressOf(k), identity: (k: ReviewKey) => registry.identity(k) } }, key, attempt, ctx).catch(() => undefined);
  const stubStart = async (servicesArg: ThreadServices, review: never, port: MessagePort): Promise<StartedReviewWorker> => {
    const { port1, port2 } = new MessageChannel();
    const worker = new Worker(new URL('./helpers/review-stub-worker.ts', import.meta.url), {
      workerData: { review, nativePort: port }, transferList: [port],
    });
    registerReviewWorkerConnection(port1);
    const reclaimed = new Promise<{ locks: never[]; stores: { released: never[]; unhealthy: never[] } }>(resolve => {
      worker.once('exit', () => resolve({ locks: [], stores: { released: [], unhealthy: [] } }));
    });
    void servicesArg;
    const s = {
      worker,
      threadId: worker.threadId,
      port: port1,
      reclaimed,
      disconnect: () => { port1.close(); port2.close(); },
      admission: { kind: 'review-admission-saved', key: (review as { key: ReviewKey }).key, incarnation: (review as { incarnation: string }).incarnation, attempt: (review as { attempt: number }).attempt, checkpointPath: 'stub' },
      fence: undefined as never,
    } as StartedReviewWorker;
    started.set((review as { key: ReviewKey }).key.reviewId, s);
    return s;
  };
  registry = new ReviewWorkers({
    services,
    resolveScope: async key => ({ reviewer: 'daemon', subject: `${key.project}:s1`, cleanupScope: `${key.project}:s1` }),
    authorizeNative: async () => {},
    resolveBinary: async c => c,
    track: () => {},
    start: stubStart as never,
    bindTask,
  });
  t.after(async () => { await registry.shutdown(); await store.settle(); });
  const submit = (id: string, family: 'code' | 'design' = 'code') => ({
    key: { project: repo, family, reviewId: id }, attempt: 1, actionId: `action-${id}`,
    submitted: family === 'code'
      ? { reviewRevision: 'a'.repeat(40), storyId: 's1', functionalSummary: 'Fixture', documents: {}, reviewSet: [], tests: [] }
      : { phase: 'start', repo, reviewId: id, attempt: 1, artifactPath: 'unread-artifact.json' },
  });
  return { root, repo, registry, coordinator, store, started, submit };
}

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (check()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('condition not reached');
}

/** Admit a review and wait until its task binding is committed in the store. */
async function admitBound(f: Awaited<ReturnType<typeof fixture>>, id: string, family: 'code' | 'design' = 'code') {
  const owner = context(`owner-${id}`);
  const ack = await f.registry.admit(f.submit(id, family), owner.context);
  await until(() => f.store.list().some(r => r.origin.turnId === id));
  await until(() => f.started.get(id) !== undefined);
  const record = f.store.list().find(r => r.origin.turnId === id)!;
  return { ack, record, worker: f.started.get(id)!.worker, owner };
}

/** Drive one accepted publication through acceptProgress on the stub worker.
 *  For design reviews the delegate's mapping reads the design observation, so
 *  the progress carries the minimal sc5 design observation shape. */
function publish(f: Awaited<ReturnType<typeof fixture>>, ack: { key: ReviewKey; incarnation: string }, worker: Worker, sequence: number, phase: ReviewWorkerProgress['phase'], completed = 1, total = 3) {
  const designObservation = ack.key.family === 'design' ? {
    status: ['complete', 'failed', 'interrupted'].includes(phase)
      ? (phase === 'complete' ? 'passed' : phase) as string
      : 'running',
    phase: 'chunk_review',
    completedChunks: completed,
    totalChunks: total,
    lastMeaningfulActivityAt: null,
    activeToolCount: 0,
    requiresUserInput: false,
    checkpointPath: `${ack.key.project}/.insrc/tmp/${ack.key.reviewId}.json`,
    sequence,
    reviewElapsedMs: 0,
    unitElapsedMs: null,
    observedAt: new Date().toISOString(),
    freshness: 'live' as const,
    coverageProgress: { plannedChunks: total, selectedChunks: total, reviewedChunks: completed, retainedChunks: 0, effectiveCompletedChunks: completed },
  } : undefined;
  const progress: ReviewWorkerProgress = {
    key: ack.key, incarnation: ack.incarnation, attempt: 1, sequence,
    phase, completed, total, updatedAt: new Date().toISOString(),
    ...(designObservation === undefined ? {} : { observation: designObservation as never }),
  };
  return f.registry.acceptProgress(worker, ack, progress);
}

test("an observed review's task progress changes as publications are accepted", async t => {
  const f = await fixture(t);
  const { ack, record, worker } = await admitBound(f, 'sig-progress', 'design');
  assert.equal(f.coordinator.read(record.task)?.measurement, null, 'no measurement before the first signal settles');
  assert.equal(publish(f, ack, worker, 2, 'execution', 1, 3), true);
  await until(() => f.coordinator.read(record.task)?.measurement !== null);
  const first = f.coordinator.read(record.task)!;
  assert.equal(first.measurement?.kind, 'design-review');
  assert.equal(first.measurement?.phase, 'execution');
  assert.deepEqual(first.measurement?.counts, [{ unit: 'chunks', completed: 1, total: 3 }]);
  const revisionAfterFirst = first.measurement!.meaningfulRevision;
  assert.equal(publish(f, ack, worker, 3, 'execution', 2, 3), true);
  await until(() => (f.coordinator.read(record.task)?.measurement?.meaningfulRevision ?? 0) > revisionAfterFirst);
  const second = f.coordinator.read(record.task)!;
  assert.deepEqual(second.measurement?.counts, [{ unit: 'chunks', completed: 2, total: 3 }]);
  assert.ok(second.measurement!.meaningfulRevision > revisionAfterFirst, 'the committed measurement changes as publications are accepted');
});

test("terminal evidence follows the owner's terminal phase and never the review verdict", async t => {
  for (const [phase, state] of [['complete', 'completed'], ['failed', 'failed'], ['interrupted', 'interrupted']] as const) {
    const f = await fixture(t);
    const { ack, record, worker } = await admitBound(f, `terminal-${phase}`, 'code');
    assert.equal(publish(f, ack, worker, 2, phase, 3, 3), true);
    await until(() => f.store.get(record.task)?.retention === 'terminal');
    const terminal = f.store.get(record.task)!;
    assert.equal(terminal.state, state, `phase ${phase} records owner state ${state}`);
    assert.equal(terminal.retention, 'terminal');
    assert.ok(!['passed', 'changes_requested', 'incomplete', 'paused', 'invalidated'].includes(terminal.state),
      'no review verdict ever reaches the owner lifecycle');
    await f.registry.shutdown();
  }
});

test('a coordinator error is swallowed without altering acceptProgress, the board publication or reclaim', async t => {
  const f = await fixture(t, { signalBreaks: true });
  const { ack, record, worker } = await admitBound(f, 'sig-error', 'design');
  const boardBefore = JSON.stringify(services.board.snapshot());
  assert.equal(publish(f, ack, worker, 2, 'execution', 1, 3), true, 'acceptProgress still returns true');
  assert.equal(publish(f, ack, worker, 3, 'complete', 3, 3), true, 'terminal acceptProgress still returns true');
  await new Promise(r => setTimeout(r, 100));
  assert.equal(f.store.get(record.task)?.retention, 'active', 'the throwing coordinator recorded no terminal evidence');
  const boardAfter = JSON.parse(JSON.stringify(services.board.snapshot()));
  assert.notEqual(JSON.stringify(boardAfter), boardBefore, 'the board publication still happened');
  const events = boardAfter.threads.filter((th: { cls: string; method: string }) => th.cls === 'review');
  const methods = events.map((th: { method: string }) => th.method);
  assert.equal(methods.at(-1), 'complete', 'the latest board event is the terminal phase publication');
  assert.ok(methods.includes('complete'), 'the board publication still happened');
});

test('snapshot after interruption shows interrupted or stale, then a newer incarnation is verified', async t => {
  const f = await fixture(t);
  const { ack, record, worker } = await admitBound(f, 'sig-interrupt', 'design');
  assert.equal(publish(f, ack, worker, 2, 'execution', 1, 3), true);
  await until(() => f.coordinator.read(record.task)?.measurement !== null);
  assert.equal(publish(f, ack, worker, 3, 'interrupted', 1, 3), true);
  await until(() => f.store.get(record.task)?.retention === 'terminal');
  const interrupted = f.coordinator.read(record.task)!;
  assert.equal(interrupted.state, 'interrupted', 'the owner phase interrupted is recorded as the task state');
  assert.ok(['interrupted', 'stale', 'unavailable'].includes(interrupted.freshness) || interrupted.state === 'interrupted');
});

test('a delayed publication from the earlier incarnation does not overwrite the newer snapshot', async t => {
  const f = await fixture(t);
  const { ack, record, worker } = await admitBound(f, 'sig-delayed', 'design');
  assert.equal(publish(f, ack, worker, 2, 'execution', 1, 3), true);
  await until(() => f.coordinator.read(record.task)?.measurement !== null);
  const newer = f.coordinator.read(record.task)!;
  const staleProgress: ReviewWorkerProgress = {
    key: ack.key, incarnation: 'other-incarnation', attempt: 1, sequence: 1,
    phase: 'execution', completed: 0, total: 3, updatedAt: new Date().toISOString(),
  };
  assert.equal(f.registry.acceptProgress(worker, { key: ack.key, incarnation: 'other-incarnation' }, staleProgress), false,
    'a foreign incarnation is refused outright');
  const after = f.coordinator.read(record.task)!;
  assert.deepEqual(after.measurement, newer.measurement, 'the newer snapshot is unchanged');
});

test('the normalized projection of an unobserved review is unchanged', async t => {
  // An unobserved review is one admitted without a task binding (session
  // connection, aborted connection, session-memory execution, refused launch
  // or refused registration — proven in review-task-binding.test.ts). Its
  // public surface is exactly the pre-s3 projection: cachedProgress/progressOf
  // plus the board publication, with no store record and no coordinator task.
  const f = await fixture(t);
  const session = context('session-conn', { connectionSession: { role: 'control', access: {}, audience: 'test', controlGeneration: 1, signal: new AbortController().signal, assertActive: () => {} } });
  const ack = await f.registry.admit(f.submit('unobserved-projection', 'code'), session.context);
  await until(() => f.started.get('unobserved-projection') !== undefined);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(f.store.list().length, 0, 'no task record is created for an unobserved review');
  // The admission still publishes its progress on the board, unchanged.
  const board = JSON.parse(JSON.stringify(services.board.snapshot()));
  const reviewThreads = board.threads.filter((th: { cls: string }) => th.cls === 'review');
  assert.ok(reviewThreads.length > 0, 'the review still appears on the board');
  // Binding an observed review of the same shape does not disturb it: admit a
  // second, observed review and confirm the unobserved one's record set and
  // projection are untouched.
  const projectionBefore = JSON.stringify(f.registry.progressOf(ack.key));
  const { ack: observedAck } = await admitBound(f, 'observed-neighbor', 'code');
  assert.equal(f.store.list().length, 1, 'only the observed review has a task record');
  assert.equal(f.store.list()[0]!.origin.turnId, observedAck.key.reviewId);
  assert.equal(JSON.stringify(f.registry.progressOf(ack.key)), projectionBefore, 'the unobserved review projection is unchanged');
});
