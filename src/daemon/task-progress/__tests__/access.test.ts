import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import type { TestContext } from 'node:test';
import type { ProgressSnapshot, TaskRef } from '../../../shared/task-progress.js';
import { directDispatch, IpcServer } from '../../server.js';
import { progressProjectId } from '../access.js';
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

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'insrc-progress-access-'));
  const path = join(root, 'rpc.sock');
  const projects = new Set([project, otherProject]);
  let server: IpcServer | undefined;
  const sockets = new Set<ReturnType<typeof createConnection>>();
  const stop = async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await server?.close();
  };
  t.after(async () => { await stop(); await rm(root, { recursive: true, force: true }); });

  async function start() {
    await stop();
    const runtime = await openProgressRuntime(root, async () => projects, validate);
    const producer = runtime.coordinator.registerProducer('test', () => ({ kind: 'test' }));
    const { rpc, streams } = createProgressRoutes(async () => runtime);
    rpc['test.launch'] = async (params, context) => {
      assert.ok(context);
      const { repo, originId } = params as { repo: string; originId: string };
      const launch = await runtime.access.launch(repo, originId, 'fixture-executor', context);
      const admission = await producer.register(launch.authorization, 'suite', { progress: async () => null });
      assert.equal(admission.kind, 'admitted');
      const grants = await launch.grants(admission.task);
      return { task: admission.task, ...grants };
    };
    rpc['test.permission'] = async (params, context) => {
      const { observerId, permission } = params as { observerId: string; permission: 'details' | 'cancel' | 'fallback' };
      await runtime.access.authorize(observerId, permission, context);
      return { allowed: true };
    };
    server = new IpcServer(directDispatch(rpc, streams), Date.now, path);
    server.onConnectionClose(context => runtime.access.disconnect(context));
    await server.listen();
  }

  function client() {
    const socket = createConnection(path);
    sockets.add(socket);
    const lines = createInterface({ input: socket })[Symbol.asyncIterator]();
    let sequence = 0;
    const send = (method: string, params: object, stream = false) => {
      const id = ++sequence;
      socket.write(JSON.stringify({ id, method, params, stream }) + '\n');
      return id;
    };
    const next = async (id: number): Promise<Frame> => {
      const line = await lines.next();
      assert.equal(line.done, false);
      const frame = JSON.parse(line.value as string) as Frame;
      assert.equal(frame.id, id);
      return frame;
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
  return { client, start, projects };
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
  for (const key of ['owner', 'origin', 'originDigest', 'grants', 'rawDetails']) assert.equal(Object.hasOwn(snapshot, key), false);
  assert.equal(JSON.stringify(snapshot).includes(a.conversation), false);
  await assert.rejects(beta.read(observer, snapshot.cursor), /task-unavailable/);
  const deniedStream = beta.send('progress.subscribe', { observerId: observer }, true);
  assert.equal((await beta.next(deniedStream)).stream, 'error');
  await assert.rejects(beta.attach({ ...a, task: { ...a.task, projectId: progressProjectId(otherProject) } }), /task-unavailable/);
  await assert.rejects(beta.attach({ ...sameProject, conversation: a.conversation }), /task-unavailable/);
  const otherObserver = await beta.attach(b);
  assert.equal((await beta.read(otherObserver, snapshot.cursor)).disposition, 'resync');
  await assert.rejects(beta.request('test.permission', { observerId: observer, permission: 'details' }), /task-unavailable/);
  await assert.rejects(beta.request('test.permission', { observerId: observer, permission: 'cancel' }), /task-unavailable/);
  f.projects.delete(project);
  await assert.rejects(alpha.read(observer), /task-unavailable/);
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
