import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { createShutdown } from '../shutdown.js';
import { assertUnderstandingRoles, understandingRoles } from '../../understanding/roles.js';
import { roleDescriptor } from '../../config/role-taxonomy.js';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { IpcServer } from '../server.js';
import { createUnderstandingRoutes } from '../understanding-rpc.js';
import { UnderstandingService } from '../../understanding/service.js';
import type { Owner } from '../../understanding/service.js';
import { closeGraphStore, getGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import type { AssessmentScope } from '../../shared/understanding.js';
import { AssessmentError, parseEvent } from '../../shared/understanding.js';

let dir: string;
let server: IpcServer;
let service: UnderstandingService;
let routes: ReturnType<typeof createUnderstandingRoutes>;
let currentOwner: Owner;
const sockets: Socket[] = [];
const owner: Owner = { ownerPrincipal: 'owner', learner: { key: 'learner', source: 'git', authority: 'git-email', subject: 'private', assurance: 'local-config', aliases: [] } };
const scope: AssessmentScope = { repoId: 'repo', worktreeId: 'worktree', baseOid: null, stagedTreeOid: 'a'.repeat(40), commitMode: 'normal', parentOids: [], learnerKey: 'learner', policyRevision: 'p', evidenceRevision: 'e' };
const command = (id: string, revision: number) => ({ assessmentId: id, expectedRevision: revision, requestId: randomUUID(), scope });
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await delay(10); }
  assert.fail('timed out waiting for socket event');
}
beforeEach(async () => {
  await closeGraphStore();
  dir = mkdtempSync(join(tmpdir(), 'understanding-rpc-'));
  setGraphStorePath(join(dir, 'graph.lmdb'));
  await getGraphStore();
  currentOwner = owner;
  routes = createUnderstandingRoutes({ service: () => { if (!service) throw new AssessmentError('unavailable'); return service; }, owner: async () => currentOwner });
  server = new IpcServer(routes.rpc, routes.streams, Date.now, join(dir, 'daemon.sock'));
  await server.listen();
  service = await UnderstandingService.open(join(dir, 'daemon.sock'));
});
afterEach(async () => {
  routes.stop();
  for (const socket of sockets.splice(0)) socket.destroy();
  await server.close();
  await closeGraphStore();
  rmSync(dir, { recursive: true, force: true });
});
async function client(method: string, params: unknown, stream = false) {
  const socket = connect(join(dir, 'daemon.sock'));
  sockets.push(socket);
  const frames: Record<string, any>[] = [];
  let pending = '';
  socket.on('data', data => {
    pending += data.toString();
    let end: number;
    while ((end = pending.indexOf('\n')) >= 0) { frames.push(JSON.parse(pending.slice(0, end))); pending = pending.slice(end + 1); }
  });
  await once(socket, 'connect');
  socket.write(JSON.stringify({ id: 73, method, params, stream }) + '\n');
  await until(() => frames.length > 0);
  return { socket, frames };
}

test('RPC rejects forged authority and returns typed revision conflicts', async () => {
  const id = (await service.prepare(owner, scope, randomUUID())).view.id;
  const forged = await client('understanding.cancel', { ...command(id, 1), ownerPrincipal: 'forged' });
  assert.equal(forged.frames[0]!.result.error.code, 'invalid-input');
  const retry = command(id, 1);
  await service.cancel(owner, retry);
  const replay = await client('understanding.cancel', retry);
  assert.equal(replay.frames[0]!.result.ok, true);
  assert.equal(replay.frames[0]!.result.appliedRevision, 2);
  assert.equal(replay.frames[0]!.result.value.revision, 2);
  const conflict = await client('understanding.cancel', command(id, 1));
  assert.equal(conflict.frames[0]!.id, 73);
  assert.equal(conflict.frames[0]!.result.protocolVersion, 1);
  assert.equal(conflict.frames[0]!.result.error.code, 'revision-conflict');
  assert.equal(conflict.frames[0]!.result.current.revision, 2);
  assert.equal(conflict.frames[0]!.error, undefined);
  currentOwner = { ...owner, ownerPrincipal: 'other' };
  const foreign = await client('understanding.resume', { assessmentId: id });
  assert.equal(foreign.frames[0]!.result.error.code, 'not-found');
  assert.equal(foreign.frames[0]!.result.current, undefined);
  const prepare = await client('understanding.prepare', { requestId: randomUUID(), repoPath: 'repo', worktreePath: 'worktree' });
  assert.equal(prepare.frames[0]!.result.error.code, 'unavailable');
});

test('Real watch snapshots handle races, reconnect, deletion and abort with exact terminal frames', async () => {
  const id = (await service.prepare(owner, scope, randomUUID())).view.id;
  const original = service.resume.bind(service);
  let raced = false;
  service.resume = async (o, key) => {
    if (!raced) { raced = true; await service.cancel(owner, command(id, 1)); }
    return original(o, key);
  };
  const watch = await client('understanding.watch', { assessmentId: id, afterRevision: 999 }, true);
  assert.equal(watch.frames[0]!.id, 73);
  assert.equal(watch.frames[0]!.stream, 'progress');
  const first = parseEvent(watch.frames[0]!.data);
  assert.equal(first.type, 'snapshot');
  assert.equal(watch.frames[0]!.data.revision, 2);
  assert.ok(!JSON.stringify(watch.frames).includes('private'));
  watch.socket.destroy();
  await until(() => routes.watchCount() === 0);
  const count = watch.frames.length;
  const reconnect = await client('understanding.watch', { assessmentId: id, afterRevision: 2 }, true);
  assert.equal(reconnect.frames[0]!.data.type, 'snapshot');
  await service.delete(owner, { ...command(id, 2), confirmed: true });
  await until(() => reconnect.frames.some(f => f.stream === 'done'));
  assert.deepEqual(reconnect.frames.map(f => f.stream), ['progress', 'progress', 'done']);
  assert.equal(reconnect.frames[1]!.data.type, 'deleted');
  assert.equal(watch.frames.length, count);
  assert.equal(routes.watchCount(), 0);
  const missing = await client('understanding.watch', { assessmentId: id }, true);
  assert.deepEqual(missing.frames.map(f => f.stream), ['error']);
  assert.equal(missing.frames[0]!.data.protocolVersion, 1);
});


test('All five understanding roles require critical core descriptors', () => {
  assert.equal(understandingRoles.length, 5);
  assertUnderstandingRoles();
  for (const id of understandingRoles) {
    assert.deepEqual(roleDescriptor(id), { id, criticality: 'critical', defaultTier: 'core' });
    assert.throws(() => assertUnderstandingRoles(key => key === id ? undefined : roleDescriptor(key)), /unavailable/);
  }
});

test('Healthy shutdown flushes final frames before storage close and stops only once', async () => {
  const id = (await service.prepare(owner, scope, randomUUID())).view.id;
  const watch = await client('understanding.watch', { assessmentId: id }, true);
  const order: string[] = [];
  let finished!: () => void;
  const done = new Promise<void>(resolve => { finished = resolve; });
  const shutdown = createShutdown({
    log: { info() {}, warn() {} }, queueDone: Promise.resolve(),
    stopBackgroundWork: () => { order.push('stop'); service.stop(); routes.stop(); void server.close(); },
    closeStores: async () => {
      assert.equal(await server.flushPendingWrites(1000), true);
      order.push('flush');
      server.disconnectClients();
      order.push('stores');
    },
    end: { clearPid() {}, exit: () => { order.push('exit'); finished(); }, killSelf: () => assert.fail('unexpected kill'),
      lastLinePath: join(dir, 'last.log'), storeHealth: () => ({ state: 'ok' }) },
  });
  shutdown('SIGTERM');
  shutdown('SIGINT');
  await done;
  await until(() => watch.frames.some(f => f.stream === 'done'));
  assert.deepEqual(order, ['stop', 'flush', 'stores', 'exit']);
  assert.deepEqual(watch.frames.map(f => f.stream), ['progress', 'progress', 'done']);
  assert.equal(watch.frames[1]!.data.type, 'unavailable');
  await assert.rejects(service.resume(owner, id), /unavailable/);
  assert.equal(routes.watchCount(), 0);
});

test('Socket write flushing is bounded and settles disconnected writes', async () => {
  class BlockedSocket extends EventEmitter { write(): boolean { return false; } }
  const socket = new BlockedSocket();
  const internal = server as unknown as { writeLine(socket: BlockedSocket, line: string): void };
  internal.writeLine(socket, 'pending');
  const before = Date.now();
  assert.equal(await server.flushPendingWrites(20), false);
  assert.ok(Date.now() - before < 500);
  socket.emit('close');
  assert.equal(await server.flushPendingWrites(1000), false);
  assert.equal(socket.listenerCount('close'), 0);
});
