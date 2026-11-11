import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { MessageChannel, Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { ProgressAccess } from '../access.js';
import { createProgressAuthority, OWNER_RENEWAL_MS, ProgressCoordinator } from '../coordinator.js';
import { registerExecutorProducers, validateExecutorDetails } from '../executor-measurements.js';
import type { ExecutorDetails } from '../executor-measurements.js';
import { beginExecutorProgress, ExecutorProgressRelay } from '../executor-relay.js';
import { FallbackScheduler } from '../fallback.js';
import { ProgressStore } from '../store.js';

const project = '/registered';
const context = { connectionIdentity: 'verified-connection', daemonEpoch: 'epoch' };
const workflow = {
  kind: 'workflow', stageId: 'step-start', activeUnit: 's1', stagePosition: null,
  production: { unit: 'output-chunks', completed: 7, total: null },
} as const;

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-executor-relay-'));
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
  const projects = new Map([[project, 1], ['/other', 2]]);
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
    runtime, store, coordinator, access, projects,
    advance(ms: number) { mono += ms; now += ms; },
    port(relay: ExecutorProgressRelay, repo = project, origin = context) {
      const port = relay.reserve('workflow', repo, origin);
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
