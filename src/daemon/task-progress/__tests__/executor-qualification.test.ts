import '../../../analyze/orchestrator/__tests__/private-paths.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { ProgressKind, TaskRef } from '../../../shared/task-progress.js';
import { writeRepoSchema } from '../../../workflow/artifact-core/repo-schema.js';
import type { TrustedRpcContext } from '../../request-context.js';
import { IpcServer } from '../../server.js';
import { TargetRegistry } from '../../threads/registry.js';
import { Router } from '../../threads/router.js';
import { progressProjectId } from '../access.js';
import { registerExecutorProducers, validateExecutorDetails } from '../executor-measurements.js';
import { ExecutorProgressRelay } from '../executor-relay.js';
import { progressTaskKey } from '../record.js';
import { createProgressRoutes } from '../rpc.js';
import { openProgressRuntime } from '../runtime.js';
import { controlledExecutors } from './helpers/qualification-executors.js';

async function fixtures(t: TestContext) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'insrc-s2-qualify-')));
  const cleanup: (() => unknown)[] = [];
  t.after(async () => {
    try {
      for (const close of cleanup.reverse()) await close();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  const repos = [join(root, 'workflow'), join(root, 'analysis')] as const;
  for (const repo of repos) {
    await mkdir(repo);
    writeRepoSchema(repo, { version: 2, convertedAt: new Date().toISOString() });
  }
  const projects = async () => new Map(repos.map((repo, index) => [repo, index + 1]));
  const runtime = async () => {
    const base = await openProgressRuntime(root, projects, validateExecutorDetails);
    cleanup.push(base.close);
    return { ...base, producers: registerExecutorProducers(base.coordinator) };
  };
  return { root, repos, projects, runtime, cleanup };
}

type Frame = { readonly id: number; readonly stream?: string; readonly result?: unknown; readonly error?: unknown };
async function client(cleanup: (() => unknown)[], path: string) {
  const socket = createConnection(path);
  cleanup.push(() => socket.destroy());
  await once(socket, 'connect');
  const lines = createInterface({ input: socket });
  let id = 0;
  const pending = new Map<number, { frames: Frame[]; finish: (frames: Frame[]) => void }>();
  lines.on('line', line => {
    const frame = JSON.parse(line) as Frame;
    const waiter = pending.get(frame.id);
    if (waiter === undefined) return;
    waiter.frames.push(frame);
    if (frame.stream === undefined || frame.stream === 'done' || frame.stream === 'error') {
      pending.delete(frame.id);
      waiter.finish(waiter.frames);
    }
  });
  return {
    close: () => socket.destroy(),
    send(method: string, params: unknown, stream = false) {
      const request = ++id;
      return new Promise<Frame[]>(finish => {
        pending.set(request, { frames: [], finish });
        socket.write(JSON.stringify({ id: request, method, params, stream }) + '\n');
      });
    },
  };
}

async function until<T>(value: () => T | undefined): Promise<T> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = value();
    if (found !== undefined) return found;
    await delay(10);
  }
  throw new Error('expected progress record did not arrive');
}

const workflowParams = (repo: string) => ({ repo, workflow: 'stub', focus: 'fixture' });
const analysisParams = (repo: string) => ({ runId: 'analysis-qualification', userPrompt: 'fixture', scopeRef: { kind: 'repo', value: repo } });
const origin = (frames: Frame[]) => {
  assert.equal(frames[0]?.error, undefined);
  return (frames[0]?.result as { originId: string }).originId;
};

test('S2 real daemon routes concurrent workflow and analysis progress to isolated observers', { timeout: 60_000 }, async t => {
  const f = await fixtures(t);
  const runtime = await f.runtime();
  const { rpc, streams } = createProgressRoutes(async () => runtime);
  const { directDispatch } = await import('../../server.js');
  const registry = new TargetRegistry();
  const router = new Router({ classOf: method => method === 'workflow.run' || method === 'analyze.run.start' ? 'session' : undefined,
    registry, routed: new Set(['session']), local: directDispatch(rpc, streams) });
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(new URL('./helpers/qualification-worker.ts', import.meta.url), {
    workerData: { port: port2 }, transferList: [port2],
  });
  f.cleanup.push(async () => { port1.close(); await worker.terminate(); });
  assert.deepEqual(await once(worker, 'message'), ['ready']);
  registry.register({ cls: 'session', threadId: worker.threadId });
  router.attach(worker.threadId, port1);
  const socket = join(f.root, 'daemon.sock');
  const relay = new ExecutorProgressRelay(async () => runtime);
  const server = new IpcServer(relay.forward(router.forward), Date.now, socket);
  server.onConnectionClose(context => runtime.access.disconnect(context));
  await server.listen();
  f.cleanup.push(() => server.close());
  const work = await client(f.cleanup, socket);
  const analysis = await client(f.cleanup, socket);
  const chatA = origin(await work.send('progress.origin.open', { repo: f.repos[0] }));
  const chatB = origin(await analysis.send('progress.origin.open', { repo: f.repos[1] }));
  const a = work.send('workflow.run', workflowParams(f.repos[0]), true);
  const b = analysis.send('analyze.run.start', analysisParams(f.repos[1]), true);
  const projectA = progressProjectId(f.repos[0], 1);
  const projectB = progressProjectId(f.repos[1], 2);
  const taskA = await until(() => runtime.coordinator.activityFor(projectA, chatA)[0]?.task);
  const taskB = await until(() => runtime.coordinator.activityFor(projectB, chatB)[0]?.task);
  const activeA = await until(() => runtime.coordinator.read(taskA)?.measurement ?? undefined);
  const activeB = await until(() => runtime.coordinator.read(taskB)?.measurement ?? undefined);
  assert.equal(activeA.details.kind, 'workflow');
  assert.equal(activeB.details.kind, 'analysis');
  assert.equal(activeA.details.production?.unit, 'output-chunks');
  assert.equal(activeB.details.production, null);
  assert.notEqual(taskA.invocationId, taskB.invocationId);
  assert.notEqual(taskA.projectId, taskB.projectId);
  assert.deepEqual(runtime.coordinator.activityFor(projectB, chatA), []);
  assert.deepEqual(runtime.coordinator.activityFor(projectA, chatB), []);
  const deliveries: TaskRef[][] = [[], []];
  const removeA = runtime.coordinator.onChange(taskA, (task, terminal) => { if (terminal) deliveries[0]!.push(task); });
  const removeB = runtime.coordinator.onChange(taskB, (task, terminal) => { if (terminal) deliveries[1]!.push(task); });
  t.after(removeA);
  t.after(removeB);
  worker.postMessage('release');
  const [workflow, analyzed] = await Promise.all([a, b]);
  assert.deepEqual(workflow.map(frame => frame.stream), ['progress', 'progress', 'delta', 'done']);
  assert.deepEqual(analyzed.slice(-2).map(frame => frame.stream), ['analyze.result', 'done']);
  await until(() => deliveries.every(items => items.length > 0) ? true : undefined);
  assert.deepEqual(deliveries, [[taskA], [taskB]]);
  assert.equal(runtime.coordinator.read(taskA)?.state, 'completed');
  assert.equal(runtime.coordinator.read(taskB)?.state, 'completed');
  worker.postMessage('calls');
  assert.deepEqual(await once(worker, 'message'), [{ workflow: 1, analysis: 1 }]);
  work.close();
  analysis.close();
});

test('S2 legacy workflow and analysis outcomes survive absent refused and failing observation', { timeout: 60_000 }, async t => {
  const f = await fixtures(t);
  const runtime = await f.runtime();
  const worker = controlledExecutors(async () => {});
  t.after(worker.reset);
  const routes = createProgressRoutes(async () => runtime);
  let attempts = 0;
  const relay = new ExecutorProgressRelay(async () => {
    attempts++;
    return runtime;
  });
  const socket = join(f.root, 'legacy.sock');
  let enabled = false;
  const dispatch = worker.dispatch(routes.rpc);
  const progress = relay.forward(dispatch);
  const server = new IpcServer((request, send) => (enabled ? progress : dispatch)(request, send), Date.now, socket);
  await server.listen();
  f.cleanup.push(() => server.close());
  const peer = await client(f.cleanup, socket);
  const run = async () => [
    (await peer.send('workflow.run', workflowParams(f.repos[0]), true)).map(({ id: _, ...frame }) => frame),
    (await peer.send('analyze.run.start', analysisParams(f.repos[1]), true)).map(({ id: _, ...frame }) => frame),
  ];
  const legacy = await run();
  for (const frames of legacy) assert.equal(frames.at(-1)?.stream, 'done');
  assert.equal(attempts, 0);
  enabled = true;
  assert.deepEqual(await run(), legacy);
  await until(() => attempts >= 2 ? true : undefined);
  const progressDirectory = join(f.root, 'task-progress');
  await rename(progressDirectory, progressDirectory + '-held');
  try {
    await writeFile(progressDirectory, 'injected non-directory');
    const chatA = origin(await peer.send('progress.origin.open', { repo: f.repos[0] }));
    const chatB = origin(await peer.send('progress.origin.open', { repo: f.repos[1] }));
    const before = attempts;
    assert.deepEqual(await run(), legacy);
    await until(() => {
      try { runtime.coordinator.activityFor(progressProjectId(f.repos[0], 1), chatA); }
      catch { if (attempts >= before + 2) return true; }
      return undefined;
    });
    assert.throws(() => runtime.coordinator.activityFor(progressProjectId(f.repos[1], 2), chatB), /Progress storage unavailable/);
    assert.deepEqual(worker.calls, { workflow: 3, analysis: 3 });
  } finally {
    peer.close();
    await rm(progressDirectory, { force: true });
    await rename(progressDirectory + '-held', progressDirectory);
  }
});

test('S2 production runtime preserves S1 records and adds no provider calls', async t => {
  const f = await fixtures(t);
  const context: TrustedRpcContext = { connectionIdentity: 'predecessor', daemonEpoch: 's1' };
  const s1 = await openProgressRuntime(f.root, f.projects, (_kind, _value): _value is { kind: ProgressKind } => false);
  let task: TaskRef;
  try {
    const { originId } = await s1.access.openOrigin(f.repos[0], context);
    const launch = await s1.access.launch(f.repos[0], originId, 's1-owner', context);
    const producer = s1.coordinator.registerProducer('test', details => details);
    const admitted = await producer.register(launch.authorization, 's1-run', { progress: async () => null });
    assert.equal(admitted.kind, 'admitted');
    task = admitted.task;
    assert.equal(await producer.recordLifecycle(admitted.owner, { sequence: 1, state: 'completed' }), 'recorded');
  } finally {
    await s1.close();
  }
  const file = join(f.root, 'task-progress', progressTaskKey(task) + '.json');
  const prior = await readFile(file);
  const exec = controlledExecutors(async () => {});
  t.after(exec.reset);
  const s2 = await f.runtime();
  assert.equal(s2.coordinator.read(task)?.state, 'completed');
  await s2.coordinator.sweep();
  assert.deepEqual(await readFile(file), prior);
  assert.deepEqual(exec.calls, { workflow: 0, analysis: 0 });
});
