import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { ProgressSnapshot, TaskOwnerFence, TaskRef } from '../../../shared/task-progress.js';
import { directDispatch, IpcServer } from '../../server.js';
import { progressProjectId } from '../access.js';
import { progressTaskKey } from '../record.js';
import { createProgressRoutes } from '../rpc.js';
import { openProgressRuntime } from '../runtime.js';

type Details = { readonly kind: 'test' };
type Origin = { originId: string; capability: string };
type Launch = { task: TaskRef; conversation: string; history: string };
type Observation = { snapshot: ProgressSnapshot<Details>; disposition: string };
type Frame = { id: number; result?: unknown; error?: string; stream?: string; data?: unknown };
const project = '/registered/alpha';
const otherProject = '/registered/beta';
const validate = (kind: string, input: unknown): input is Details =>
  kind === 'test' && input !== null && typeof input === 'object' &&
  'kind' in input && input.kind === 'test' && Object.keys(input).length === 1;

async function fixture(t: TestContext, holdProgressWrites = false) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-progress-access-'));
  const path = join(root, 'rpc.sock');
  const projects = new Map([[project, 1], [otherProject, 2]]);
  const cancellations: string[] = [];
  let drainWrite = () => {};
  let server: IpcServer | undefined;
  let runtime: Awaited<ReturnType<typeof openProgressRuntime<Details>>> | undefined;
  const sockets = new Set<ReturnType<typeof createConnection>>();
  const stop = async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await server?.close();
    await runtime?.close();
  };
  t.after(async () => { await stop(); await rm(root, { recursive: true, force: true }); });

  async function start() {
    await stop();
    const opened = await openProgressRuntime(root, async () => projects, validate);
    runtime = opened;
    const { access, coordinator } = opened;
    const producer = coordinator.registerProducer('test', () => ({ kind: 'test' }));
    const owners = new Map<string, Extract<Awaited<ReturnType<typeof producer.register>>, { kind: 'admitted' }>>();
    const { rpc, streams } = createProgressRoutes(async () => opened);
    rpc['test.launch'] = async (params, context) => {
      assert.ok(context);
      const { repo, originId } = params as { repo: string; originId: string };
      const launch = await access.launch(repo, originId, 'fixture-executor', context);
      let identity: { task: TaskRef; fence: TaskOwnerFence } | undefined;
      const admission = await producer.register(launch.authorization, 'suite', {
        cancel: async (_task, requestId) => { cancellations.push(requestId); },
        progress: async () => identity === undefined ? null : {
          task: identity.task, owner: { ...identity.fence, ownerSequence: 1 }, kind: 'test',
          meaningfulRevision: 1, measuredAt: new Date().toISOString(), lastMeaningfulAt: null,
          phase: 'execution', activeUnit: null, counts: [], milestones: [], controls: ['cancel'],
          details: { kind: 'test', rawOutput: 'internal-worker-output' },
        },
      });
      assert.equal(admission.kind, 'admitted');
      identity = admission;
      owners.set(admission.task.invocationId, admission);
      await producer.signalMeasurement(admission.owner, 1);
      const grants = await launch.grants(admission.task);
      return { task: admission.task, ...grants };
    };
    rpc['test.permission'] = async (params, context) => {
      const { observerId, permission } = params as { observerId: string; permission: 'details' | 'cancel' | 'fallback' };
      await access.authorize(observerId, permission, context);
      return { allowed: true };
    };
    rpc['test.activity'] = async (params, context) => {
      assert.ok(context);
      return access.activityFor((params as { originId: string }).originId, context);
    };
    rpc['test.record'] = async params => {
      const { task, sequence, state } = params as { task: TaskRef; sequence: number; state: 'completed' | 'running' };
      const owner = owners.get(task.invocationId);
      assert.ok(owner);
      return producer.recordLifecycle(owner.owner, state === 'completed'
        ? { sequence, state, resultRef: 'verified-result' }
        : { sequence, state });
    };
    const dispatch = directDispatch(rpc, streams);
    const blocked = new Promise<boolean>(resolve => { drainWrite = () => resolve(true); });
    server = new IpcServer((request, deliver) => {
      if (holdProgressWrites && request.method === 'progress.subscribe' && request.trustedContext !== undefined) {
        return dispatch({ ...request, trustedContext: { ...request.trustedContext, awaitProgressWrite: () => blocked } }, deliver);
      }
      return dispatch(request, deliver);
    }, Date.now, path);
    server.onConnectionClose(context => access.disconnect(context));
    await server.listen();
  }

  function client() {
    const socket = createConnection(path);
    sockets.add(socket);
    const pending = new Map<number, (frame: Frame) => void>();
    const queued = new Map<number, Frame[]>();
    createInterface({ input: socket }).on('line', line => {
      const frame = JSON.parse(line) as Frame;
      const resolve = pending.get(frame.id);
      if (resolve !== undefined) {
        pending.delete(frame.id);
        resolve(frame);
      } else {
        const queue = queued.get(frame.id) ?? [];
        queue.push(frame);
        queued.set(frame.id, queue);
      }
    });
    let sequence = 0;
    const send = (method: string, params: object, stream = false) => {
      const id = ++sequence;
      socket.write(JSON.stringify({ id, method, params, stream }) + '\n');
      return id;
    };
    const next = async (id: number): Promise<Frame> => {
      const queue = queued.get(id);
      const frame = queue?.shift();
      if (queue?.length === 0) queued.delete(id);
      return frame ?? new Promise(resolve => pending.set(id, resolve));
    };
    const request = async <T>(method: string, params: object): Promise<T> => {
      const frame = await next(send(method, params));
      if (frame.error !== undefined) throw new Error(frame.error);
      return frame.result as T;
    };
    return {
      request, send, next, close: () => socket.destroy(),
      open: (repo = project) => request<Origin>('progress.origin.open', { repo }),
      launch: (originId: string, repo = project) => request<Launch>('test.launch', { repo, originId }),
      bind: (origin: Origin, repo = project) => request('progress.origin.bind', { repo, ...origin }),
      async attach(launch: Launch, purpose: 'conversation' | 'history' = 'conversation') {
        const { observerId } = await request<{ observerId: string }>('progress.attach',
          { task: launch.task, capability: launch[purpose], purpose });
        return observerId;
      },
      read: (observerId: string, cursor?: string) => request<Observation>('progress.read', { observerId, cursor }),
    };
  }

  await start();
  const retainedRecord = async (task: TaskRef) =>
    JSON.parse(await readFile(join(root, 'task-progress', progressTaskKey(task) + '.json'), 'utf8')) as { recoveryDeadline: number | null };
  return { client, start, projects, cancellations, retainedRecord, drain: () => drainWrite() };
}

test('Reject cross-project and cross-conversation reads, controls and raw details', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const alpha = f.client();
  const beta = f.client();
  const a = await alpha.launch((await alpha.open()).originId);
  const b = await beta.launch((await beta.open(otherProject)).originId, otherProject);
  const sameProject = await beta.launch((await beta.open()).originId);
  const observer = await alpha.attach(a);
  const snapshot = (await alpha.read(observer)).snapshot;
  assert.deepEqual(snapshot.task, a.task);
  assert.deepEqual(snapshot.measurement?.details, { kind: 'test' });
  for (const key of ['owner', 'origin', 'originDigest', 'grants', 'rawDetails']) assert.equal(Object.hasOwn(snapshot, key), false);
  assert.equal(JSON.stringify(snapshot).includes(a.conversation), false);
  assert.equal(JSON.stringify(snapshot).includes('internal-worker-output'), false);
  await assert.rejects(beta.read(observer, snapshot.cursor), /task-unavailable/);
  const deniedStream = beta.send('progress.subscribe', { observerId: observer }, true);
  assert.equal((await beta.next(deniedStream)).stream, 'error');
  await assert.rejects(beta.attach({ ...a, task: { ...a.task, projectId: progressProjectId(otherProject, 2) } }), /task-unavailable/);
  await assert.rejects(beta.attach({ ...sameProject, conversation: a.conversation }), /task-unavailable/);
  const otherObserver = await beta.attach(b);
  assert.equal((await beta.read(otherObserver, snapshot.cursor)).disposition, 'resync');
  await assert.rejects(beta.request('test.permission', { observerId: observer, permission: 'details' }), /task-unavailable/);
  await assert.rejects(beta.request('test.permission', { observerId: observer, permission: 'cancel' }), /task-unavailable/);
  f.projects.delete(project);
  await assert.rejects(alpha.read(observer), /task-unavailable/);
  f.projects.set(project, 3);
  await assert.rejects(alpha.attach(a), /task-unavailable/);
});

test('Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const source = f.client();
  const origin = await source.open();
  const launch = await source.launch(origin.originId);
  const first = await source.attach(launch);
  const cursor = (await source.read(first)).snapshot.cursor;
  source.close();

  const reconnect = f.client();
  await assert.rejects(reconnect.read(first, cursor), /task-unavailable/);
  const second = await reconnect.attach(launch);
  assert.equal((await reconnect.read(second, cursor)).disposition, 'unchanged');
  await assert.rejects(reconnect.request('progress.attach', { task: launch.task, purpose: 'conversation',
    capability: launch.history, originId: origin.originId }), /invalid-progress-request/);
  await assert.rejects(reconnect.request('progress.origin.revoke', { originId: origin.originId }), /task-unavailable/);

  await f.start();
  assert.ok((await f.retainedRecord(launch.task)).recoveryDeadline, 'startup recovery precedes any client request');
  const restarted = f.client();
  await assert.rejects(restarted.read(second), /task-unavailable/);
  const third = await restarted.attach(launch);
  assert.equal((await restarted.read(third, cursor)).disposition, 'resync');
  const stream = restarted.send('progress.subscribe', { observerId: third }, true);
  assert.equal((await restarted.next(stream)).stream, 'progress');
  const owner = f.client();
  await owner.bind(origin);
  await owner.request('progress.origin.revoke', { originId: origin.originId });
  assert.equal((await restarted.next(stream)).stream, 'error');
  await assert.rejects(restarted.read(third), /task-unavailable/);
  const history = await restarted.attach(launch, 'history');
  assert.deepEqual((await restarted.read(history)).snapshot.task, launch.task);
  assert.deepEqual((await restarted.read(history)).snapshot.measurement?.controls, []);
  await assert.rejects(restarted.request('test.permission', { observerId: history, permission: 'cancel' }), /task-unavailable/);
  await assert.rejects(restarted.request('test.permission', { observerId: history, permission: 'fallback' }), /task-unavailable/);

  await f.start();
  const afterRemoval = f.client();
  await assert.rejects(afterRemoval.bind(origin), /task-unavailable/);
  await assert.rejects(afterRemoval.attach(launch), /task-unavailable/);
  assert.deepEqual((await afterRemoval.read(await afterRemoval.attach(launch, 'history'))).snapshot.task, launch.task);
});

test('First observer grant requires daemon-owned origin bootstrap or an existing origin capability', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const original = f.client();
  const impostor = f.client();
  await assert.rejects(original.open('/unregistered'), /task-unavailable/);
  await assert.rejects(original.request('progress.origin.open', { repo: project, originId: 'claimed-id' }), /invalid-progress-request/);
  const origin = await original.open();
  await assert.rejects(impostor.launch(origin.originId), /task-unavailable/);
  await assert.rejects(impostor.bind(origin, otherProject), /task-unavailable/);
  await assert.rejects(impostor.bind({ ...origin, capability: 'A'.repeat(43) }), /task-unavailable/);
  await impostor.bind(origin);
  const launch = await impostor.launch(origin.originId);
  assert.deepEqual((await impostor.read(await impostor.attach(launch))).snapshot.task, launch.task);
});

test('Removing one conversation releases its activity without stopping its tasks or other conversations', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const owner = f.client();
  const first = await owner.open();
  const second = await owner.open();
  const a = await owner.launch(first.originId);
  const b = await owner.launch(first.originId);
  const c = await owner.launch(second.originId);
  const activity = (origin: Origin) => owner.request<{ task: TaskRef }[]>('test.activity', { originId: origin.originId });
  assert.deepEqual((await activity(first)).map(item => item.task), [a.task, b.task]);
  await owner.request('progress.origin.revoke', { originId: first.originId });
  await assert.rejects(activity(first), /task-unavailable/);
  assert.deepEqual((await activity(second)).map(item => item.task), [c.task]);
  for (const launch of [a, b]) {
    const history = await owner.attach(launch, 'history');
    assert.equal((await owner.read(history)).snapshot.workerHealth, 'alive');
  }
});

test('Revocation releases exhausted observer capacity and interrupts a blocked subscription', { timeout: 10000 }, async t => {
  const f = await fixture(t, true);
  const owner = f.client();
  const origin = await owner.open();
  const revoked = await owner.launch(origin.originId);
  const retained = await owner.launch((await owner.open()).originId);
  const binding = await owner.attach(revoked);
  const stream = owner.send('progress.subscribe', { observerId: binding }, true);
  assert.equal((await owner.next(stream)).stream, 'progress');
  const history = await owner.attach(revoked, 'history');
  for (let index = 2; index < 1024; index++) await owner.attach(revoked);
  await assert.rejects(owner.attach(retained), /progress-capacity/);
  await owner.request('progress.origin.revoke', { originId: origin.originId });
  const terminal = await owner.next(stream);
  assert.equal(terminal.stream, 'error');
  assert.match(JSON.stringify(terminal.data), /task-unavailable/);
  await assert.rejects(owner.read(binding), /task-unavailable/);
  assert.equal((await owner.read(history)).snapshot.task.invocationId, revoked.task.invocationId);
  assert.deepEqual((await owner.read(await owner.attach(retained))).snapshot.task, retained.task);
});

test('Check stop, cancel replay and verified completion races', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const owner = f.client();
  const launch = await owner.launch((await owner.open()).originId);
  const observer = await owner.attach(launch);
  const second = await owner.attach(launch);
  const stream = owner.send('progress.subscribe', { observerId: observer }, true);
  assert.equal((await owner.next(stream)).stream, 'progress');
  const other = f.client();
  const history = await other.attach(launch, 'history');
  await assert.rejects(other.request('progress.control', {
    observerId: history, action: 'cancel-execution', requestId: 'blocked',
  }), /task-unavailable/);
  const stop = { observerId: observer, action: 'stop-observation', requestId: 'stop-1' };
  assert.deepEqual(await owner.request('progress.control', stop), { outcome: 'stopped' });
  assert.deepEqual(await owner.request('progress.control', stop), { outcome: 'stopped' });
  assert.deepEqual((await owner.next(stream)).data, { outcome: 'stopped' });
  await assert.rejects(owner.read(observer), /task-unavailable/);
  assert.equal((await owner.read(second)).snapshot.workerHealth, 'alive');

  const request = { observerId: second, action: 'cancel-execution', requestId: 'cancel-1' };
  assert.deepEqual(await owner.request('progress.control', request), { outcome: 'pending' });
  assert.deepEqual(await owner.request('progress.control', request), { outcome: 'pending' });
  await assert.rejects(owner.request('progress.control', { ...request, action: 'stop-observation' }), /conflicting-request/);
  assert.equal((await owner.read(second)).snapshot.cancellation, 'pending');
  assert.deepEqual(f.cancellations, ['cancel-1']);
  assert.equal(await owner.request('test.record', { task: launch.task, sequence: 2, state: 'completed' }), 'recorded');
  assert.deepEqual(await owner.request('progress.control', request), { outcome: 'completed' });
  assert.equal((await owner.read(second)).snapshot.resultRef, 'verified-result');

  const otherLaunch = await owner.launch((await owner.open()).originId);
  const third = await owner.attach(otherLaunch);
  assert.deepEqual(await owner.request('progress.control', {
    ...request, observerId: third, requestId: 'cancel-2',
  }), { outcome: 'pending' });
  await f.start();
  const reconnected = f.client();
  const resumed = await reconnected.attach(otherLaunch);
  assert.deepEqual(await reconnected.request('progress.control', {
    ...request, observerId: resumed, requestId: 'cancel-2',
  }), { outcome: 'pending' });
  const pending = (await reconnected.read(resumed)).snapshot;
  assert.equal(pending.state, 'interrupted');
  assert.equal(pending.cancellation, 'pending');
  assert.deepEqual(f.cancellations, ['cancel-1', 'cancel-2']);
});

test('A full observer queue coalesces progress and reserves the verified terminal frame', { timeout: 5000 }, async t => {
  const f = await fixture(t, true);
  const owner = f.client();
  const launch = await owner.launch((await owner.open()).originId);
  const binding = await owner.attach(launch);
  const stream = owner.send('progress.subscribe', { observerId: binding }, true);
  assert.equal((await owner.next(stream)).stream, 'progress');
  const duplicate = owner.send('progress.subscribe', { observerId: binding }, true);
  assert.match(JSON.stringify((await owner.next(duplicate)).data), /progress-subscription-already-open/);
  for (let sequence = 2; sequence <= 20; sequence++) {
    assert.equal(await owner.request('test.record', { task: launch.task, sequence, state: 'running' }), 'recorded');
  }
  assert.equal(await owner.request('test.record', { task: launch.task, sequence: 21, state: 'completed' }), 'recorded');
  f.drain();
  const terminal = await owner.next(stream);
  assert.equal(terminal.stream, 'done');
  assert.equal((terminal.data as Observation).disposition, 'resync');
  assert.equal((terminal.data as Observation).snapshot.state, 'completed');
  assert.equal((terminal.data as Observation).snapshot.resultRef, 'verified-result');
});
