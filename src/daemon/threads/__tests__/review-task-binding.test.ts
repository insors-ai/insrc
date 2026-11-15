import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { TrustedRpcContext } from '../../request-context.js';
import { ThreadServices } from '../main-services.js';
import { ReviewWorkers } from '../review-workers.js';
import type { StartedReviewWorker } from '../review-worker-bootstrap.js';
import { registerReviewWorkerConnection } from '../../review-request-owner.js';
import { ProgressStore } from '../../task-progress/store.js';
import { createProgressAuthority, ProgressCoordinator } from '../../task-progress/coordinator.js';
import type { ReviewTaskBinding } from '../../task-progress/review-measurements.js';
import { bindReviewTask, CodeReviewDelegate, DesignReviewDelegate, registerReviewProducers, validateAllDetails } from '../../task-progress/review-measurements.js';
import type { AllTaskDetails } from '../../task-progress/review-measurements.js';
import { ProgressAccess } from '../../task-progress/access.js';
import { FallbackScheduler } from '../../task-progress/fallback.js';
import type { ReviewKey } from '../../../shared/review-resources.js';

const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: 'fixture' }));

function context(id: string, extra?: Partial<TrustedRpcContext>): { abort: AbortController; context: TrustedRpcContext } {
  const abort = new AbortController();
  return { abort, context: { connectionIdentity: id, daemonEpoch: 'test-epoch', connectionSignal: abort.signal, ...extra } };
}

async function stubStart(servicesArg: ThreadServices, review: never, port: MessagePort): Promise<StartedReviewWorker> {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./helpers/review-stub-worker.ts', import.meta.url), {
    workerData: { review, nativePort: port }, transferList: [port],
  });
  registerReviewWorkerConnection(port1);
  const reclaimed = new Promise<{ locks: never[]; stores: { released: never[]; unhealthy: never[] } }>(resolve => {
    worker.once('exit', () => resolve({ locks: [], stores: { released: [], unhealthy: [] } }));
  });
  void servicesArg; // the stub serves no hub; nothing to attach
  return {
    worker,
    threadId: worker.threadId,
    port: port1,
    reclaimed,
    disconnect: () => { port1.close(); port2.close(); },
    admission: { kind: 'review-admission-saved', key: (review as { key: ReviewKey }).key, incarnation: (review as { incarnation: string }).incarnation, attempt: (review as { attempt: number }).attempt, checkpointPath: 'stub' },
    fence: undefined as never,
  } as StartedReviewWorker;
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }, opts: { bind: boolean; breakRuntime?: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'review-task-binding-'));
  const repo = join(root, 'repo'); await mkdir(repo);
  t.after(() => rm(root, { recursive: true, force: true }));
  // The one real progress runtime, exactly as index.ts opens it.
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
  let runtimeCalls = 0, launchFailures = 0, registerFailures = 0, lastError: unknown;
  let releaseStall: (() => void) | undefined;
  const runtime = async () => {
    runtimeCalls++;
    if (opts.breakRuntime) throw new Error('runtime offline');
    if (releaseStall !== undefined) {
      // A launch that never settles until released: the admission must not wait on it.
      const stalledLaunchReview = () => new Promise<{ authorization: never }>(resolve => { releaseStall = () => resolve({ authorization: undefined as never }); });
      return { access: { projectForScope: access.projectForScope.bind(access), launchReview: stalledLaunchReview }, producers };
    }
    if (launchFailures > 0) return { access: { projectForScope: access.projectForScope.bind(access), launchReview: async () => { launchFailures--; throw new Error('task-unavailable'); } }, producers };
    if (registerFailures > 0) return { access, producers: { designReview: { ...producers.designReview, register: async () => { registerFailures--; return { kind: 'refused', reason: 'capacity' as const }; } }, codeReview: producers.codeReview } };
    return { access, producers };
  };
  let registry!: ReviewWorkers;
  const bindTask = opts.bind
    ? (key: ReviewKey, attempt: number, ctx: TrustedRpcContext): Promise<ReviewTaskBinding | undefined> =>
        bindReviewTask({ runtime, source: { progressOf: (k: ReviewKey) => registry.progressOf(k), identity: (k: ReviewKey) => registry.identity(k) } }, key, attempt, ctx).catch(error => { lastError = error; return undefined; })
    : undefined;
  registry = new ReviewWorkers({
    services,
    resolveScope: async key => ({ reviewer: 'daemon', subject: `${key.project}:s1`, cleanupScope: `${key.project}:s1` }),
    authorizeNative: async () => {},
    resolveBinary: async c => c,
    track: () => {},
    start: stubStart as never,
    ...(bindTask !== undefined ? { bindTask } : {}),
  });
  t.after(async () => { await registry.shutdown(); await store.settle(); });
  const submit = (id: string, family: 'code' | 'design' = 'code') => ({
    key: { project: repo, family, reviewId: id }, attempt: 1, actionId: `action-${id}`,
    submitted: family === 'code'
      ? { reviewRevision: 'a'.repeat(40), storyId: 's1', functionalSummary: 'Fixture', documents: {}, reviewSet: [], tests: [] }
      : { phase: 'start', repo, reviewId: id, attempt: 1, artifactPath: 'unread-artifact.json' },
  });
  return { root, repo, registry, coordinator, store, runtimeCalls: () => runtimeCalls, launchFailures: () => launchFailures, registerFailures: () => registerFailures, lastError: () => lastError, setLaunchFailures: (n: number) => { launchFailures = n; }, setRegisterFailures: (n: number) => { registerFailures = n; }, setStalledLaunch: () => { releaseStall = () => undefined; }, releaseStalledLaunch: () => { releaseStall?.(); releaseStall = undefined; }, submit };
}

async function until(check: () => boolean): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (check()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('condition not reached');
}

test('an observed review is registered as a task of kind design-review or code-review', async t => {
  const f = await fixture(t, { bind: true });
  const owner = context('owner');
  const codeAck = await f.registry.admit(f.submit('bind-code', 'code'), owner.context);
  const designAck = await f.registry.admit(f.submit('bind-design', 'design'), owner.context);
  await until(() => f.store.list().length >= 2 || f.lastError() !== undefined);
  if (f.lastError() !== undefined) throw f.lastError();
  // Both attempts were bound: one task per review kind in the one store.
  const records = f.store.list();
  const kinds = records.map(r => r.producerKind).sort();
  assert.deepEqual(kinds, ['code-review', 'design-review']);
  const code = records.find(r => r.producerKind === 'code-review')!;
  const design = records.find(r => r.producerKind === 'design-review')!;
  assert.equal(code.origin.turnId, 'bind-code');
  assert.equal(design.origin.turnId, 'bind-design');
  assert.equal(code.task.attempt, codeAck.attempt);
  assert.equal(design.task.attempt, designAck.attempt);
  assert.ok(f.coordinator.read(code.task)?.task.taskId.length === 64);
});

test('a review without an origin, session or capacity is admitted exactly as before', async t => {
  const f = await fixture(t, { bind: true });
  // A session connection carries no live request origin: the seam must refuse.
  const session = context('session-conn', { connectionSession: { role: 'control', access: {}, audience: 'test', controlGeneration: 1, signal: new AbortController().signal, assertActive: () => {} } });
  const ack = await f.registry.admit(f.submit('unobserved-1', 'code'), session.context);
  assert.ok(ack.incarnation);
  // A session connection is refused before the runtime is touched: give the
  // fire-and-forget bind a beat, then assert it never ran and registered nothing.
  await new Promise(r => setTimeout(r, 50));
  assert.equal(f.runtimeCalls(), 0, 'the seam refuses a session connection before the runtime');
  assert.equal(f.store.list().length, 0, 'no task is registered for a session connection');
  // With no bindTask seam at all the admission path is byte-identical to before.
  const g = await fixture(t, { bind: false });
  const plain = context('plain-conn');
  const ack2 = await g.registry.admit(g.submit('unobserved-2', 'code'), plain.context);
  assert.ok(ack2.incarnation);
  assert.equal(g.store.list().length, 0);
  assert.equal(g.runtimeCalls(), 0, 'the seam is never touched without bindTask');
  // A refused launch on a normal connection (no capacity for a new origin)
  // leaves the admission intact and registers nothing, exactly as before.
  f.setLaunchFailures(1);
  const noCapacity = context('no-capacity');
  const ack3 = await f.registry.admit(f.submit('unobserved-3', 'code'), noCapacity.context);
  assert.ok(ack3.incarnation, 'admission succeeds with no capacity');
  await until(() => f.launchFailures() === 0);
  assert.equal(f.store.list().length, 0, 'no task when the launch is refused');
});

test('a failure to launch or register never fails or slows the review', async t => {
  const f = await fixture(t, { bind: true });
  f.setLaunchFailures(1);
  const owner = context('owner-fail');
  const ack = await f.registry.admit(f.submit('launch-fails', 'code'), owner.context);
  assert.ok(ack.incarnation, 'admission succeeds although launch failed');
  await until(() => f.launchFailures() === 0);
  assert.equal(f.store.list().length, 0);
  f.setRegisterFailures(1);
  const ack2 = await f.registry.admit(f.submit('register-refused', 'design'), owner.context);
  assert.ok(ack2.incarnation, 'admission succeeds although registration was refused');
  await until(() => f.registerFailures() === 0);
  assert.equal(f.store.list().length, 0);
  // Even a runtime that throws outright leaves the admission intact.
  const g = await fixture(t, { bind: true, breakRuntime: true });
  const ack3 = await g.registry.admit(g.submit('runtime-down', 'code'), owner.context);
  assert.ok(ack3.incarnation);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(g.store.list().length, 0);
  // A stalled launch (never settles) must not slow the admission either: the
  // bind is fire-and-forget, so the admit returned above already, and the
  // pending launch resolves on its own without ever registering a task.
  const h = await fixture(t, { bind: true });
  h.setStalledLaunch();
  const stalled = context('stalled-launch');
  const startedAt = Date.now();
  const ack4 = await h.registry.admit(h.submit('stalled', 'code'), stalled.context);
  assert.ok(ack4.incarnation, 'admission returns although launch never settles');
  assert.ok(Date.now() - startedAt < 1000, 'admission is not delayed by the stalled launch');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(h.store.list().length, 0, 'a stalled launch registers nothing');
  h.releaseStalledLaunch();
});

