import '../../../analyze/orchestrator/__tests__/private-paths.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { purgeRunForTests, writeRunRecord } from '../../../analyze/orchestrator/index.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { _setRunAnalyzeForTest, runStart as runAnalysis, runStatus } from '../../analyze-rpc.js';
import type { IpcStreamMessage, LLMProvider } from '../../../shared/types.js';
import { writeRepoSchema } from '../../../workflow/artifact-core/repo-schema.js';
import { _setWorkflowDriverForTests, prepareWorkflowRun, runStart } from '../../workflow-rpc.js';
import { _resetWorkflowRuns, abortWorkflowRun, pollWorkflowRun, startWorkflowRun } from '../../workflow-run-registry.js';
import { ProgressAccess } from '../access.js';
import { createProgressAuthority, OWNER_RENEWAL_MS, ProgressCoordinator } from '../coordinator.js';
import { registerExecutorProducers, validateExecutorDetails } from '../executor-measurements.js';
import type { ExecutorDetails } from '../executor-measurements.js';
import { analysisProgressPath, beginExecutorProgress, ExecutorProgressRelay } from '../executor-relay.js';
import { FallbackScheduler } from '../fallback.js';
import { ProgressStore } from '../store.js';

const project = '/registered';
const context = { connectionIdentity: 'verified-connection', daemonEpoch: 'epoch' };
const workflow = {
  kind: 'workflow', stageId: 'step-start', activeUnit: 's1', stagePosition: null,
  production: { unit: 'output-chunks', completed: 7, total: null },
} as const;

async function fixture(t: TestContext, withRepo = false) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-executor-relay-'));
  const repoPath = withRepo ? join(root, 'repo') : project;
  if (withRepo) {
    await mkdir(repoPath);
    writeRepoSchema(repoPath, { version: 2, convertedAt: new Date().toISOString() });
  }
  const store = await ProgressStore.open(root, validateExecutorDetails);
  const authority = createProgressAuthority();
  let mono = 0;
  let now = Date.now();
  const coordinator = new ProgressCoordinator(store, authority.inspect, {
    now: () => now,
    monotonic: () => mono,
    wait: delay,
  });
  const fallback = new FallbackScheduler<ExecutorDetails>({
    read: task => coordinator.read(task),
    isTerminal: task => coordinator.isTerminal(task),
    hasLiveOwner: task => coordinator.hasLiveOwner(task),
    disposition: (task, prior, current) => coordinator.disposition(task, prior, current),
    refresh: (task, signal) => coordinator.refreshForFallback(task, signal),
  });
  const projects = new Map([[repoPath, 1], ['/other', 2]]);
  const access = new ProgressAccess(store, coordinator, authority.mint, async () => projects, fallback);
  const runtime = { access, coordinator, producers: registerExecutorProducers(coordinator),
    close: () => store.settle() };
  const ports: MessagePort[] = [];
  t.after(async () => {
    for (const port of ports) port.close();
    coordinator.stopOwnerProbes();
    await store.settle();
    await rm(root, { recursive: true, force: true });
  });
  return {
    runtime, store, coordinator, access, projects, repoPath,
    advance(ms: number) { mono += ms; now += ms; },
    port(relay: ExecutorProgressRelay, repo = repoPath, origin = context, kind: ExecutorDetails['kind'] = 'workflow') {
      const port = relay.reserve(kind, repo, origin);
      assert.ok(port);
      ports.push(port);
      return port;
    },
  };
}

async function until<T>(read: () => T | undefined): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const result = read();
    if (result !== undefined) return result;
    await delay(10);
  }
  throw new Error('progress observation did not arrive');
}

function closed(port: MessagePort): Promise<void> {
  return new Promise(resolve => { port.once('close', resolve); port.ref(); });
}

test('S2 producer relay admits only a verified project origin and worker attempt', async t => {
  const f = await fixture(t);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  await f.access.openOrigin(project, context);
  for (const [repo, origin] of [
    ['/unregistered', context], ['/other', context],
    [project, { ...context, connectionIdentity: 'foreign' }],
  ] as const) {
    const port = f.port(relay, repo, origin);
    beginExecutorProgress(port);
    const done = closed(port);
    await done;
  }
  assert.equal(f.store.list().length, 0);

  const { port1, port2 } = new MessageChannel();
  t.after(() => { port1.close(); port2.close(); });
  const received = new Promise<MessagePort>(resolve => { port2.once('message', resolve); });
  const transferred = f.port(relay);
  port1.postMessage(transferred, [transferred]);
  const owner = await received;
  const start = beginExecutorProgress(owner);
  assert.ok(start);
  owner.postMessage({ type: 'sample', sequence: 400, details: { ...workflow, private: 'discard' } });
  start.sample(workflow);
  const running = await until(() => f.store.list().find(record => record.measurement?.details.kind === 'workflow'));
  assert.equal(running.measurement?.details.production?.completed, 7);
  const done = closed(owner);
  start.settle('completed');
  await done;
  assert.equal(f.store.get(running.task)?.state, 'completed');

  await f.access.openOrigin(project, context);
  const ambiguous = f.port(relay);
  beginExecutorProgress(ambiguous);
  const refused = closed(ambiguous);
  await refused;
  assert.equal(f.store.list().length, 1);
});

test('S2 workflow progress preserves streaming frames and terminal result', async t => {
  const f = await fixture(t, true);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  const params = { workflow: 'stub', focus: 'measure stub progress', repo: f.repoPath };
  await f.access.openOrigin(f.repoPath, context);
  _setWorkflowDriverForTests(async (_intent, _provider, opts) => {
    opts.onProgress?.({ phase: 'step-start', stepId: 's1', runner: 'echo.a' });
    for (let i = 0; i < 17; i++) opts.onToken?.('s1', 'output');
    opts.onProgress?.({ phase: 'done' });
    return { path: '/fixture', runId: 'same-run', model: 'fake', artifact: { fixture: true } };
  });
  t.after(() => _setWorkflowDriverForTests());
  const legacy: IpcStreamMessage[] = [];
  const observed: IpcStreamMessage[] = [];
  await runStart(params, frame => legacy.push(frame), new AbortController().signal);
  await runStart(params, frame => observed.push(frame), new AbortController().signal, f.port(relay));
  assert.deepEqual(observed, legacy);
  assert.deepEqual(observed.map(frame => frame.stream), ['progress', 'delta', 'progress', 'delta', 'done']);
  const finished = await until(() => f.store.list().find(record => record.state === 'completed'));
  assert.equal(finished.measurement?.details.stageId, 'done');
  assert.deepEqual(finished.measurement?.details.production, { unit: 'output-chunks', completed: 17, total: null });
});

test('S2 detached workflow preserves poll cursor and abort behavior across observer loss', async t => {
  const f = await fixture(t, true);
  t.after(_resetWorkflowRuns);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  const params = { workflow: 'stub', focus: 'measure detached progress', repo: f.repoPath };
  await f.access.openOrigin(f.repoPath, context);
  const prepared = prepareWorkflowRun(params);
  let rejectTurn: ((error: Error) => void) | undefined;
  const provider: LLMProvider = {
    supportsTools: false,
    capabilities: { ...prepared.provider.capabilities, structuredOutput: true },
    async complete() { throw new Error('unused'); },
    async *stream() { throw new Error('unused'); },
    async embed() { return []; },
    completeStructured<T>(_messages, _schema, opts) {
      opts?.onToken?.('first chunk');
      return new Promise<T>((_resolve, reject) => { rejectTurn = reject; });
    },
  };
  const baseRouter = prepared.router;
  const router = {
    resolveProviderForRole(...args: Parameters<typeof baseRouter.resolveProviderForRole>) {
      const base = baseRouter.resolveProviderForRole(...args);
      return { ...base, provider };
    },
    resolveSummariser: () => baseRouter.resolveSummariser(),
  };
  const { runId } = startWorkflowRun(params, { progressPort: f.port(relay),
    prepare: () => ({ ...prepared, provider, router }) });
  const active = await until(() => f.store.list().find(record => record.measurement?.details.production?.completed === 1));
  f.access.disconnect(context);
  const first = pollWorkflowRun(runId);
  assert.equal(first.status, 'running');
  assert.equal(first.frames[0]?.phase, 'decompose');
  assert.deepEqual(pollWorkflowRun(runId, first.cursor).frames, []);
  assert.deepEqual(abortWorkflowRun(runId), { ok: true });
  assert.equal(pollWorkflowRun(runId, first.cursor).status, 'aborted');
  assert.equal(f.store.get(active.task)?.state, 'running');
  assert.ok(rejectTurn);
  rejectTurn(new Error('owner observed abort'));
  const terminal = await until(() => f.store.list().find(record => record.state === 'cancelled'));
  assert.equal(terminal.resultRef, runId);
  assert.equal(pollWorkflowRun(runId, first.cursor).cursor, first.cursor);
});

test('S2 producer relay preserves early terminal evidence and releases unresolved admissions', async t => {
  const f = await fixture(t);
  await f.access.openOrigin(project, context);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const relay = new ExecutorProgressRelay(async () => { await pending; return f.runtime; }, 1000, 1);
  const port = f.port(relay);
  const owner = beginExecutorProgress(port);
  const done = closed(port);
  assert.ok(owner);
  owner.sample(workflow);
  owner.settle('completed', 'wf-1');
  await delay(20);
  assert.equal(relay.reserve('workflow', project, context), undefined);
  assert.equal(f.store.list().length, 0);
  release();
  await done;
  const [record] = f.store.list();
  assert.equal(record?.state, 'completed');
  assert.equal(record?.resultRef, 'wf-1');

  const stalled = new ExecutorProgressRelay(async () => new Promise(() => {}), 20, 1);
  const unresolved = f.port(stalled);
  beginExecutorProgress(unresolved);
  const expired = closed(unresolved);
  await expired;
  const replacement = f.port(stalled);
  replacement.close();
  assert.equal(f.store.list().length, 1);
});

test('S2 quiet owner renews activity and worker loss fences stale evidence', async t => {
  const f = await fixture(t);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  await f.access.openOrigin(project, context);
  const port = f.port(relay);
  const worker = new Worker(new URL('./helpers/executor-worker.ts', import.meta.url), {
    workerData: { port }, transferList: [port],
  });
  t.after(() => worker.terminate());
  const running = await until(() => f.store.list().find(record => record.state === 'running'));
  f.access.disconnect(context);
  f.advance(OWNER_RENEWAL_MS + 1);
  await f.coordinator.probeOwnerActivity();
  assert.ok((f.store.get(running.task)?.lastOwnerActivityAt ?? 0) > (running.lastOwnerActivityAt ?? 0));
  assert.equal(f.store.get(running.task)?.measurement, null);

  await worker.terminate();
  await until(() => f.store.list().find(record => record.state === 'interrupted'));
  port.postMessage({ type: 'terminal', sequence: 99, state: 'completed' });
  assert.equal(f.store.get(running.task)?.state, 'interrupted');
  assert.equal(f.coordinator.hasLiveOwner(running.task), false);
});

function analysisIntent(repo: string): ClassifiedIntent {
  return { target: 'docs', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: repo }, reasoning: 'fixture' };
}

test('S2 analysis progress preserves stage frames and the analyze.result then done sequence', async t => {
  const f = await fixture(t, true);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  await f.access.openOrigin(f.repoPath, context);
  const intent = analysisIntent(f.repoPath);
  let observedIntent = intent;
  const params = { runId: 's2-analysis', userPrompt: 'fixture', scopeRef: intent.scopeRef };
  _setRunAnalyzeForTest(async (args, opts) => {
    opts?.onEvent?.({ type: 'stage-started', stage: 'classify' });
    opts?.onEvent?.({ type: 'classified', intent: observedIntent });
    opts?.onEvent?.({ type: 'stage-started', stage: 'plan' });
    opts?.onEvent?.({ type: 'plan-accepted', planId: 'p1', taskCount: 1 });
    opts?.onEvent?.({ type: 'stage-started', stage: 'execute' });
    opts?.onEvent?.({ type: 'llm-token', stage: 'execute', substep: 'emit', preview: 'private preview' });
    opts?.onEvent?.({ type: 'task-started', taskId: 't1', template: 'private template', index: 1, total: 1 });
    opts?.onEvent?.({ type: 'task-completed', taskId: 't1', status: 'ok' });
    return { ok: true, runId: args.runId, intent: observedIntent, finalReport: { summary: 'result' },
      tasksCompleted: 1, tasksFailed: [], durationMs: 4 };
  });
  t.after(() => _setRunAnalyzeForTest());
  const baseline: IpcStreamMessage[] = [];
  const frames: IpcStreamMessage[] = [];
  await runAnalysis(params, frame => baseline.push(frame), new AbortController().signal);
  await runAnalysis(params, frame => frames.push(frame), new AbortController().signal, undefined,
    f.port(relay, f.repoPath, context, 'analysis'));
  assert.deepEqual(frames, baseline);
  assert.deepEqual(frames.slice(-2).map(frame => frame.stream), ['analyze.result', 'done']);
  const terminal = await until(() => f.store.list().find(record => record.state === 'completed'));
  assert.deepEqual(terminal.measurement?.details, {
    kind: 'analysis', stageId: 'execute', activeUnit: null, production: null,
    stagePosition: { unit: 'tasks', completed: 1, total: 1 },
  });

  assert.equal(analysisProgressPath({ kind: 'symbol', value: f.repoPath + '/file.ts#name' }), f.repoPath + '/file.ts');
  assert.equal(analysisProgressPath({ kind: 'connection', value: f.repoPath }), undefined);
  observedIntent = analysisIntent('/other');
  const redirected: IpcStreamMessage[] = [];
  await runAnalysis({ ...params, repo: '/other', runId: 's2-analysis-redirected' },
    frame => redirected.push(frame), new AbortController().signal, undefined, f.port(relay, f.repoPath, context, 'analysis'));
  assert.deepEqual(redirected.slice(-2).map(frame => frame.stream), ['analyze.result', 'done']);
  const refused = await until(() => f.store.list().find(record => record.state === 'interrupted'));
  assert.notEqual(refused.measurement?.details.stageId, 'execute');
});

test('S2 analysis preserves cached completion cancellation and persisted status', async t => {
  const f = await fixture(t, true);
  const relay = new ExecutorProgressRelay(async () => f.runtime);
  await f.access.openOrigin(f.repoPath, context);
  const intent = analysisIntent(f.repoPath);
  const params = { runId: 's2-cache', userPrompt: 'fixture', scopeRef: intent.scopeRef };
  const time = new Date().toISOString();
  writeRunRecord({
    runId: params.runId, userPrompt: params.userPrompt, initialScopeRef: params.scopeRef,
    createdAt: time, updatedAt: time, stage: 'done', status: 'ok', intent,
    finalReport: { summary: 'cached' }, tasksCompleted: 1, tasksFailed: [],
  });
  t.after(() => purgeRunForTests(params.runId));
  const prior = await runStatus({ runId: params.runId });
  const frames: IpcStreamMessage[] = [];
  const cancelledBeforeCache = new AbortController();
  cancelledBeforeCache.abort();
  await runAnalysis(params, frame => frames.push(frame), cancelledBeforeCache.signal, undefined,
    f.port(relay, f.repoPath, context, 'analysis'));
  assert.deepEqual(frames.map(frame => frame.stream), ['analyze.result', 'done']);
  const cached = await until(() => f.store.list().find(record => record.resultRef === params.runId));
  assert.equal(cached.state, 'completed');
  assert.equal(cached.measurement, null);
  assert.deepEqual(await runStatus({ runId: params.runId }), prior);

  _setRunAnalyzeForTest(async (args, opts) => {
    assert.equal(opts?.signal?.aborted, true);
    return { ok: false, runId: args.runId, intent, stage: 'plan', durationMs: 1,
      error: { code: 'aborted', message: 'owner cancelled' } };
  });
  t.after(() => _setRunAnalyzeForTest());
  const aborted = { ...params, runId: 's2-cancelled' };
  await runAnalysis(aborted, frame => frames.push(frame), cancelledBeforeCache.signal, undefined,
    f.port(relay, f.repoPath, context, 'analysis'));
  assert.equal((await until(() => f.store.list().find(record => record.resultRef === aborted.runId))).state, 'cancelled');

  _setRunAnalyzeForTest(async () => { throw new Error('unexpected fixture failure'); });
  const thrown = { ...params, runId: 's2-thrown' };
  await runAnalysis(thrown, frame => frames.push(frame), cancelledBeforeCache.signal, undefined,
    f.port(relay, f.repoPath, context, 'analysis'));
  assert.equal((await until(() => f.store.list().find(record => record.resultRef === thrown.runId))).state, 'failed');
  assert.deepEqual(frames.slice(-2).map(frame => frame.stream), ['analyze.result', 'done']);
});
