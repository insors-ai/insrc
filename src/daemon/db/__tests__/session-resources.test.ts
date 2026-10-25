import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConnectionSessionRpc } from '../../connection-session-rpc.js';
import { connectionManagementHandlers } from '../../connection-management-rpc.js';
import { IpcServer, directDispatch } from '../../server.js';
import { TemporaryConnectionOverlay, createTemporaryOverlay } from '../session-entries.js';
import { createConnectionResolver } from '../pool-cache.js';
import { DriverPool } from '../pool.js';
import { connectionsPath } from '../config.js';
import { environment } from './fixtures/saved-management-fixture.js';
import { sessionRpcClient } from './fixtures/session-rpc-client.js';
import type { TemporaryResourcePorts } from '../session-resources.js';
import type { TrustedRpcContext } from '../../request-context.js';
import type { ConnectionConfig, Driver } from '../../../shared/db-driver.js';
import type { ConnectionAccessContext, OperationTicket, MutationRequest, MutationOutcome, OpenConnectionSessionResult } from '../../../shared/connection-management.js';
import '../drivers/index.js';
function deferred<T = void>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function rejected(value: unknown, code: string) { assert.ok(value && typeof value === 'object' && 'code' in value); assert.equal(value.code, code); }
function committed(value: MutationOutcome) { assert.equal(value.status, 'committed', JSON.stringify(value)); if (value.status !== 'committed') throw new Error('Expected committed'); return value.value; }
async function fixture(ports: TemporaryResourcePorts = {}) {
 const env = await environment(), a = join(env.directory, 'a'), b = join(env.directory, 'b');
 for (const root of [a, b]) { await mkdir(root); await mkdir(dirname(connectionsPath(root)), { recursive: true }); await writeFile(connectionsPath(root), '{"connections":[]}'); }
 const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({ enabled: async () => true, isRegistered: async root => root === a || root === b,
  createOverlay: (root, handle, context) => createTemporaryOverlay(root, handle, context, ports), dropOverlay: overlay => overlay.close() });
 const queued: { entered: ReturnType<typeof deferred<TrustedRpcContext>>; release: ReturnType<typeof deferred> }[] = [];
 const held: { response: Promise<unknown>; release: ReturnType<typeof deferred> }[] = [];
 const clients: Awaited<ReturnType<typeof sessionRpcClient>>[] = [], pools = new Map<string, DriverPool>(); let lookups = 0;
 const server = new IpcServer(runtime.forward(directDispatch({ ...connectionManagementHandlers({ sessionRuntime: runtime }), 'db.listDriverKinds': async (_params, context) => {
  const next = queued.shift(); assert.ok(next && context); next.entered.resolve(context); await next.release.promise; return [];
 } })), Date.now, join(env.directory, 'runtime.sock')); server.onConnectionClose(context => runtime.disconnect(context)); await server.listen();
 const client = async () => { const value = await sessionRpcClient(join(env.directory, 'runtime.sock')); clients.push(value); return value; };
 const hold = async (value: Awaited<ReturnType<typeof client>>) => { const entered = deferred<TrustedRpcContext>(), release = deferred(); queued.push({ entered, release }); const response = value.call('db.listDriverKinds'); held.push({ response, release }); return { context: await entered.promise, release, response }; };
 const resolver = createConnectionResolver({ poolSource: async root => { lookups++; let pool = pools.get(root); if (!pool) { pool = new DriverPool(root); pools.set(root, pool); } await pool.reload(); return pool; } });
 return { ...env, a, b, runtime, resolver, client, hold, get lookups() { return lookups; }, close: async () => { for (const item of held) item.release.resolve(); await Promise.allSettled(held.map(item => item.response)); for (const value of clients) await value.close(); await server.close(); await runtime.close(); for (const pool of pools.values()) await pool.closeAll(); await env.cleanup(); } };
}
async function request(client: Awaited<ReturnType<typeof sessionRpcClient>>, root: string, patch: Record<string, unknown>, credentials: Record<string, { action: 'replace'; value: string }> = {}, revision?: string): Promise<MutationRequest> {
 const key = { repoRoot: root, scope: 'temporary' as const, id: 'same' }, mode = revision ? 'update' as const : 'create' as const;
 const ticket = await client.call<OperationTicket>('db.connections.v2.ticket', { key, mode }); assert.ok(ticket.signature, JSON.stringify(ticket));
 return { ticket, operationId: ticket.operationId, key, mode, publicPatch: patch, credentials, ...(revision ? { expectedRevision: revision } : {}) };
}
function raw(config: ConnectionConfig, closed: () => void, marker = config.label): Driver {
 return { id: config.id, kind: config.kind, family: 'rdbms', privateConfig: config, describe: async () => ({ columns: [{ name: 'marker', type: 'text', nullable: false }] }), sample: async () => ({ rows: [{ marker }] }), close: async () => { closed(); } } as unknown as Driver;
}

test('CM-S3-LEASE: full callback pins revision through multiple calls busy update and retained-view revocation', async () => {
 let builds = 0, closes = 0; const f = await fixture({ factory: () => async config => { builds++; return raw(config, () => { closes++; }); } });
 const entered = deferred(), release = deferred(); let retained: Driver | undefined;
 try {
  const ui = await f.client(); await ui.call('db.connections.v2.session.open', { repoRoot: f.a });
  const create = await request(ui, f.a, { kind: 'postgres', endpoint: 'postgres://host/db', label: 'first' });
  const initial = committed(await ui.call<MutationOutcome>('db.connections.v2.mutate', create)); assert.equal(initial.activation, 'active');
  const held = await f.hold(ui), access = await f.runtime.accessFor(held.context, f.a);
  const work = f.resolver.withConnection(access, 'same', async driver => { retained = driver; assert.equal((driver as unknown as Record<string, unknown>)['privateConfig'], undefined); assert.equal(Object.getPrototypeOf(driver), null); await driver.describe!('data'); entered.resolve(); await release.promise; if (driver.family !== 'rdbms') throw new Error('Expected relational driver'); await driver.sample('data', { limit: 1 }); return 7; });
  await entered.promise;
  const edit = await request(ui, f.a, { label: 'second' }, {}, initial.revision); rejected(await ui.call('db.connections.v2.mutate', edit), 'busy'); assert.equal(builds, 1); assert.equal(closes, 0);
  release.resolve(); assert.equal(await work, 7); assert.throws(() => retained!.describe!('data'), { code: 'conflict' });
  const updated = committed(await ui.call<MutationOutcome>('db.connections.v2.mutate', edit)); assert.notEqual(updated.revision, initial.revision); assert.equal(updated.activation, 'active'); assert.equal(builds, 2); assert.equal(closes, 1);
  const before = f.lookups;
  for (const forged of [{ ...access }, { ...access, lookupRoot: f.b }, { ...access, daemonEpoch: 'wrong' }]) await assert.rejects(f.resolver.list(forged), { code: 'session-expired' });
  assert.equal(f.lookups, before);
  held.release.resolve(); await held.response; await assert.rejects(f.resolver.list(access), { code: 'session-expired' }); assert.equal(f.lookups, before);
 } finally { release.resolve(); await f.close(); }
 assert.equal(closes, 2);
});

test('CM-S3-LEASE: failed construction keeps committed truth and activation-only retry builds once', async () => {
 let fail = true, builds = 0, closes = 0;
 const f = await fixture({ factory: () => async config => { builds++; if (fail) throw new Error('private-constructor-error-canary'); return raw(config, () => { closes++; }); } });
 try {
  const ui = await f.client(); await ui.call('db.connections.v2.session.open', { repoRoot: f.a }); const input = await request(ui, f.a, { kind: 'postgres', endpoint: 'postgres://host/db' });
  const result = await ui.call<MutationOutcome>('db.connections.v2.mutate', input), first = committed(result); assert.equal(first.activation, 'failed'); assert.ok(!JSON.stringify(result).includes('private-constructor-error-canary'));
  fail = false; const retried = committed(await ui.call<MutationOutcome>('db.connections.v2.activate', { key: input.key, committedRevision: first.revision })); assert.equal(retried.revision, first.revision); assert.equal(retried.activation, 'active'); assert.equal(builds, 2);
  committed(await ui.call<MutationOutcome>('db.connections.v2.activate', { key: input.key, committedRevision: first.revision })); assert.equal(builds, 2);
 } finally { await f.close(); }
 assert.equal(closes, 1);
});

for (const outcome of ['driver', 'rejection'] as const) test(`CM-S3-LEASE: late ${outcome} construction cannot publish after end and end awaits disposal`, async () => {
 const entered = deferred(), release = deferred(); let closed = 0, ended = false;
 const f = await fixture({ factory: () => async config => { entered.resolve(); await release.promise; if (outcome === 'rejection') throw new Error('late-private-constructor-canary'); return raw(config, () => { closed++; }); } });
 try {
  const ui = await f.client(); await ui.call('db.connections.v2.session.open', { repoRoot: f.a }); const input = await request(ui, f.a, { kind: 'postgres', endpoint: 'postgres://host/db' });
  const pending = ui.call('db.connections.v2.mutate', input); await entered.promise;
  const ending = ui.call('db.connections.v2.session.end').then(value => { ended = true; return value; }); rejected(await ui.call('db.connections.v2.status', { ticket: input.ticket }), 'session-expired'); assert.equal(ended, false);
  release.resolve(); rejected(await pending, 'session-expired'); assert.deepEqual(await ending, { status: 'ended' }); assert.equal(closed, outcome === 'driver' ? 1 : 0);
 } finally { release.resolve(); await f.close(); }
});

test('CM-S3-LEASE: abandoned late iterator retains its lease and closes before end completes', async () => {
 const late = deferred<AsyncIterable<unknown>>(), called = deferred(); let returned = 0, closed = 0;
 const f = await fixture({ factory: () => async config => ({ id: config.id, kind: config.kind, family: 'kv', scan: () => { called.resolve(); return late.promise; }, close: async () => { closed++; } }) as unknown as Driver });
 try {
  const ui = await f.client(); await ui.call('db.connections.v2.session.open', { repoRoot: f.a }); const input = await request(ui, f.a, { kind: 'redis', endpoint: 'redis://host' }); const first = committed(await ui.call<MutationOutcome>('db.connections.v2.mutate', input));
  const held = await f.hold(ui), access = await f.runtime.accessFor(held.context, f.a);
  const use = f.resolver.withConnection(access, 'same', async driver => { void (driver as unknown as { scan(): Promise<unknown> }).scan(); });
  await called.promise;
  const edit = await request(ui, f.a, { label: 'blocked' }, {}, first.revision); rejected(await ui.call('db.connections.v2.mutate', edit), 'busy');
  let ended = false; const ending = ui.call('db.connections.v2.session.end').then(result => { ended = true; return result; });
  rejected(await ui.call('db.connections.v2.status', { ticket: input.ticket }), 'session-expired'); assert.equal(ended, false);
  late.resolve({ [Symbol.asyncIterator]() { return { next: async () => ({ done: false, value: 'private-late-row' }), return: async () => { returned++; return { done: true, value: undefined }; } }; } });
  await assert.rejects(use, { code: 'session-expired' }); assert.deepEqual(await ending, { status: 'ended' }); assert.equal(returned, 1); assert.equal(closed, 1);
 } finally { late.resolve({ async *[Symbol.asyncIterator]() {} }); await f.close(); }
});

test('CM-S3-ISOLATION: private factory receives only the matching owner root and immutable credential revision', async () => {
 const built: { config: ConnectionConfig; owner: string; root: string; revision: string }[] = [];
 const f = await fixture({ factory: () => async (config, context) => { const identity = context!.fileExecutionPolicy!.identity; built.push({ config, owner: identity.ownerId, root: identity.lookupRoot, revision: identity.revision }); return raw(config, () => {}); } });
 try {
  const a = await f.client(), b = await f.client(); const oa = await a.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: f.a }), ob = await b.call<OpenConnectionSessionResult>('db.connections.v2.session.open', { repoRoot: f.a });
  for (const [client, root, label, password] of [[a, f.a, 'A', 'private-A'], [b, f.a, 'B', 'private-B'], [a, f.b, 'A-root-B', 'private-root-B']] as const) { const input = await request(client, root, { kind: 'postgres', endpoint: 'postgres://host/db', label }, { 'url.password': { action: 'replace', value: password } }); committed(await client.call<MutationOutcome>('db.connections.v2.mutate', input)); }
  assert.deepEqual(built.map(entry => [entry.owner, entry.root, new URL(entry.config.url!).password]), [[oa.sessionHandle, f.a, 'private-A'], [ob.sessionHandle, f.a, 'private-B'], [oa.sessionHandle, f.b, 'private-root-B']]);
  assert.ok(built.every(entry => Object.isFrozen(entry.config))); assert.equal(new Set(built.map(entry => entry.revision)).size, 3);
  const held = await f.hold(a), access = await f.runtime.accessFor(held.context, f.a), fresh = await f.client();
  await fresh.call('db.connections.v2.session.resume', { sessionHandle: oa.sessionHandle, capability: oa.capability, daemonEpoch: oa.daemonEpoch });
  const before = f.lookups; await assert.rejects(f.resolver.list(access), { code: 'session-expired' }); assert.equal(f.lookups, before);
 } finally { await f.close(); }
});

test('CM-S3-ISOLATION: actual private SQLite drivers return distinct rows for two owners roots and revisions', async () => {
 const f = await fixture();
 try {
  for (const [root, name, marker] of [[f.a, 'a.sqlite', 'owner-A'], [f.a, 'b.sqlite', 'owner-B'], [f.b, 'c.sqlite', 'root-B'], [f.a, 'next.sqlite', 'next-revision']] as const) { const db = new DatabaseSync(join(root, name)); db.exec(`CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('${marker}');`); db.close(); }
  const a = await f.client(), b = await f.client(); await a.call('db.connections.v2.session.open', { repoRoot: f.a }); await b.call('db.connections.v2.session.open', { repoRoot: f.a });
  const requests: MutationRequest[] = [];
  for (const [client, root, path] of [[a, f.a, 'a.sqlite'], [b, f.a, 'b.sqlite'], [a, f.b, 'c.sqlite']] as const) { const input = await request(client, root, { kind: 'sqlite', path }); requests.push(input); committed(await client.call<MutationOutcome>('db.connections.v2.mutate', input)); }
  const ha = await f.hold(a), hb = await f.hold(b), aa = await f.runtime.accessFor(ha.context, f.a), ab = await f.runtime.accessFor(hb.context, f.a), ac = await f.runtime.accessFor(ha.context, f.b);
  const rows = (access: ConnectionAccessContext) => f.resolver.withConnection(access, 'same', async driver => { assert.equal(driver.family, 'rdbms'); if (driver.family !== 'rdbms') throw new Error('Expected SQLite'); return driver.sample('data', { limit: 1 }); });
  for (const [access, marker] of [[aa, 'owner-A'], [ab, 'owner-B'], [ac, 'root-B']] as const) assert.ok(JSON.stringify(await rows(access)).includes(marker));
  const initial = await a.call<{ revision: string }>('db.connections.v2.read', { key: requests[0]!.key }), edit = await request(a, f.a, { path: 'next.sqlite' }, {}, initial.revision); committed(await a.call<MutationOutcome>('db.connections.v2.mutate', edit));
  assert.ok(JSON.stringify(await rows(aa)).includes('next-revision')); assert.ok(JSON.stringify(await rows(ab)).includes('owner-B')); assert.ok(JSON.stringify(await rows(ac)).includes('root-B'));
 } finally { await f.close(); }
});
