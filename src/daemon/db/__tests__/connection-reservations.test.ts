import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { mkdir, writeFile, readFile, symlink, chmod } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { saveConnectionRpc } from '../../db-rpc.js';
import { IpcServer, directDispatch } from '../../server.js';
import { Router } from '../../threads/router.js';
import { TargetRegistry } from '../../threads/registry.js';
import { TemporaryConnectionOverlay, createTemporaryOverlay } from '../session-entries.js';
import { assertSavedUpsertRoot } from '../connection-reservations.js';
import { connectionsPath } from '../config.js';
import { _setKeystoreForTests } from '../secrets.js';
import { DriverPool } from '../pool.js';
import { createConnectionResolver, SessionAccessError } from '../pool-cache.js';
import { environment, deferred } from './fixtures/saved-management-fixture.js';
import { sessionRpcClient } from './fixtures/session-rpc-client.js';
import type { OperationTicket, MutationRequest, MutationOutcome, SafeConnection, ConnectionResolver, ConnectionAccessContext, OpenConnectionSessionResult } from '../../../shared/connection-management.js';
import type { ConnectionSessionRpcPorts } from '../../connection-session-rpc.js';
import '../drivers/index.js';

function rejected(value: unknown, expected: string) { assert.ok(value && typeof value === 'object' && 'code' in value); assert.equal(value.code, expected); }
function savedSuccess(value: unknown, v2: boolean) { assert.ok(value && typeof value === 'object'); if (v2) { assert.ok('status' in value); assert.equal(value.status, 'committed'); } else assert.ok(!('error' in value), JSON.stringify(value)); }
function savedDuplicate(value: unknown, v2: boolean) { if (v2) rejected(value, 'duplicate-id'); else { assert.ok(value && typeof value === 'object' && 'error' in value); assert.match(String(value.error), /^duplicate-id:/); } }
async function serverFixture(path: string, root: string, extra: Partial<ConnectionSessionRpcPorts<TemporaryConnectionOverlay>> = {}) {
 const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({ enabled: async () => true, isRegistered: async candidate => candidate === root, createOverlay: createTemporaryOverlay, dropOverlay: overlay => overlay.close(), ...extra });
 const registry = new TargetRegistry(), { port1, port2 } = new MessageChannel(); registry.register({ threadId: 88, cls: 'session' }); let workerCalls = 0;
 port2.on('message', request => { workerCalls++; port2.postMessage({ kind: 'reply', requestId: request.requestId, result: 'wrong-worker' }); });
 const router = new Router({ classOf: () => 'session', registry, routed: new Set(['session']), local: directDispatch({ ...connectionManagementHandlers({ sessionRuntime: runtime }), 'db.saveConnection': saveConnectionRpc }) }); router.attach(88, port1);
 const server = new IpcServer(runtime.forward(router.forward), Date.now, path); server.onConnectionClose(context => runtime.disconnect(context)); await server.listen();
 return { runtime, get workerCalls() { return workerCalls; }, close: async () => { await server.close(); await runtime.close(); router.detach(88); port1.close(); port2.close(); } };
}
async function draft(client: Awaited<ReturnType<typeof sessionRpcClient>>, root: string, id = 'same', patch: Record<string, unknown> = { kind: 'postgres', endpoint: 'postgres://host/db' }): Promise<MutationRequest> {
 const key = { repoRoot: root, scope: 'temporary' as const, id }, ticket = await client.call<OperationTicket>('db.connections.v2.ticket', { key, mode: 'create' });
 assert.ok(ticket.signature, JSON.stringify(ticket)); return { key, ticket, operationId: ticket.operationId, mode: 'create', publicPatch: patch };
}

for (const mode of ['managed-legacy', 'managed-v2', 'unmanaged-legacy'] as const) for (const first of ['saved', 'temporary'] as const) {
 test(`CM-S3-COLLISION: ${mode} ${first}-first real socket race has one winner and zero loser writes`, async () => {
  const env = await environment(), managed = mode !== 'unmanaged-legacy', f = managed ? await env.rootFixture('root') : undefined;
  const root = f?.root ?? join(env.directory, 'root');
  if (!managed) { await mkdir(root); await mkdir(dirname(connectionsPath(root)), { recursive: true }); await writeFile(connectionsPath(root), '{"connections":[],"legacy":"unchanged"}\n'); }
  const started = deferred(), hold = deferred(); let vaultSets = 0; const vault = new Map<string, string>();
  const oldKeystore = _setKeystoreForTests({ getKey: async ref => vault.get(ref) ?? null, setKey: async (ref, value) => { vaultSets++; if (first === 'saved' && !managed) { started.resolve(); await hold.promise; } vault.set(ref, value); }, deleteKey: async ref => { vault.delete(ref); } });
  const s = await serverFixture(join(env.directory, 'race.sock'), root), ui = await sessionRpcClient(join(env.directory, 'race.sock')), legacy = await sessionRpcClient(join(env.directory, 'race.sock'));
  const original = TemporaryConnectionOverlay.prototype.prepare;
  const spy = mock.method(TemporaryConnectionOverlay.prototype, 'prepare', async function(this: TemporaryConnectionOverlay, ...args: Parameters<typeof original>) { const prepared = await original.apply(this, args); if (first === 'temporary') { started.resolve(); await hold.promise; } return prepared; });
  try {
   await ui.call('db.connections.v2.session.open', { repoRoot: root }); const input = await draft(ui, root);
   const v2 = mode === 'managed-v2', savedKey = { repoRoot: root, scope: 'saved', id: 'same' };
   const savedTicket = v2 ? await legacy.call<OperationTicket>('db.connections.v2.ticket', { key: savedKey, mode: 'create' }) : undefined;
   const save = () => v2 ? legacy.call('db.connections.v2.mutate', { key: savedKey, ticket: savedTicket, operationId: savedTicket!.operationId, mode: 'create', publicPatch: { kind: 'postgres', endpoint: 'postgres://host/db' }, credentials: { 'url.password': { action: 'replace', value: 'saved-private-password' } } }) : legacy.call('db.saveConnection', { repoRoot: root, config: { id: 'same', kind: 'postgres', url: 'postgres://user:saved-private-password@host/db' } });
   if (f && first === 'saved') f.hooks.stage = async () => { started.resolve(); await hold.promise; };
   f?.reset(); const before = await readFile(connectionsPath(root)), keys = f ? [...f.values] : [...vault];
   const winning = first === 'saved' ? save() : ui.call<MutationOutcome>('db.connections.v2.mutate', input); await started.promise;
   const losing = first === 'saved' ? ui.call<MutationOutcome>('db.connections.v2.mutate', input) : save();
   // A round-trip status ensures the second request is admitted while the first holds the root gate.
   await ui.call('db.connections.v2.status', { ticket: input.ticket }); hold.resolve();
   const winner = await winning, loser = await losing;
   if (first === 'temporary') {
    assert.ok(winner && typeof winner === 'object' && 'status' in winner); assert.equal(winner.status, 'committed'); savedDuplicate(loser, v2);
    assert.deepEqual(await readFile(connectionsPath(root)), before); assert.equal(vaultSets, 0);
    if (f) { assert.deepEqual([...f.values], keys); assert.ok(Object.values(f.counts).every(value => value === 0)); }
    assert.equal((await ui.call<SafeConnection>('db.connections.v2.read', { key: input.key })).key.id, 'same');
   } else {
    savedSuccess(winner, v2); rejected(loser, 'duplicate-id'); rejected(await ui.call('db.connections.v2.read', { key: input.key }), 'not-found');
    assert.notDeepEqual(await readFile(connectionsPath(root)), before); assert.ok(!String(await readFile(connectionsPath(root))).includes('saved-private-password'));
    const settled = await readFile(connectionsPath(root)), settledKeys = f ? [...f.values] : [...vault];
    rejected(await ui.call('db.connections.v2.mutate', input), 'duplicate-id'); assert.deepEqual(await readFile(connectionsPath(root)), settled); assert.deepEqual(f ? [...f.values] : [...vault], settledKeys);
   }
   assert.equal(s.workerCalls, 0);
  } finally { hold.resolve(); spy.mock.restore(); await ui.close(); await legacy.close(); await s.close(); _setKeystoreForTests(oldKeystore); await env.cleanup(); }
 });
}

test('CM-S3-COLLISION: independent workbench reservations remain until every same-ID owner ends', async () => {
 const env = await environment(), root = join(env.directory, 'root'); await mkdir(root); await mkdir(dirname(connectionsPath(root)), { recursive: true }); await writeFile(connectionsPath(root), '{"connections":[]}\n');
 const path = join(root, 'saved.sqlite'), db = new DatabaseSync(path); db.exec('CREATE TABLE data(id INTEGER)'); db.close();
 const s = await serverFixture(join(env.directory, 'owners.sock'), root), a = await sessionRpcClient(join(env.directory, 'owners.sock')), b = await sessionRpcClient(join(env.directory, 'owners.sock')), saved = await sessionRpcClient(join(env.directory, 'owners.sock'));
 try {
  const openedA = await a.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: root }), openedB = await b.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: root }); assert.notEqual(openedA.sessionHandle, openedB.sessionHandle);
  const x = await draft(a, root), y = await draft(b, root); assert.equal((await a.call<MutationOutcome>('db.connections.v2.mutate', x)).status, 'committed'); assert.equal((await b.call<MutationOutcome>('db.connections.v2.mutate', y)).status, 'committed');
  const before = await readFile(connectionsPath(root)), upsert = () => saved.call('db.saveConnection', { repoRoot: root, config: { id: 'same', kind: 'sqlite', path } });
  savedDuplicate(await upsert(), false); await a.call('db.connections.v2.session.end'); savedDuplicate(await upsert(), false); assert.deepEqual(await readFile(connectionsPath(root)), before);
  await b.call('db.connections.v2.session.end'); savedSuccess(await upsert(), false); assert.equal(s.workerCalls, 0);
 } finally { await a.close(); await b.close(); await saved.close(); await s.close(); await env.cleanup(); }
});

test('CM-S3-NAMESPACE: alias relative and trailing writes refuse while actual saved and temporary SQLite rows stay separate', async () => {
	const { spawn } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
	const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
	const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/session-namespace-child.ts', import.meta.url))], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /# pass 1\b/); for (const key of ['fail', 'skipped', 'cancelled', 'todo']) assert.match(output, new RegExp('# ' + key + ' 0\\b')); }
	finally { clearTimeout(timer); child.kill('SIGKILL'); }
});
