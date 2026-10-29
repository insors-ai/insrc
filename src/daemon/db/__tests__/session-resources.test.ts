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
import { contextualDriverFactory, temporaryDriverOwner, temporaryFileExecutionOwner } from '../driver-log-policy.js';
import { TemporaryDriverResources } from '../session-resources.js';
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
 const runtime = new ConnectionSessionRpc<TemporaryConnectionOverlay>({ enabled: async () => true, removalEnabled: async () => true, isRegistered: async root => root === a || root === b,
  createOverlay: (root, handle, context) => createTemporaryOverlay(root, handle, context, ports.factory ? { factory: kind => { const selected = ports.factory!(kind); return selected ? contextualDriverFactory(selected) : undefined; } } : ports), dropOverlay: overlay => overlay.close() });
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
async function removeRequest(client: Awaited<ReturnType<typeof sessionRpcClient>>, root: string, revision: string): Promise<MutationRequest> {
 const key={repoRoot:root,scope:'temporary' as const,id:'same'},ticket=await client.call<OperationTicket>('db.connections.v2.ticket',{key,mode:'remove'});
 return {key,ticket,operationId:ticket.operationId,mode:'remove',expectedRevision:revision};
}
function raw(config: ConnectionConfig, closed: () => void, marker = config.label): Driver {
 return { id: config.id, kind: config.kind, family: 'rdbms', privateConfig: config, describe: async () => ({ columns: [{ name: 'marker', type: 'text', nullable: false }] }), sample: async () => ({ rows: [{ marker }] }), close: async () => { closed(); } } as unknown as Driver;
}

test('CM-S4-TEMP: retired resources retain a shared slot across roots and failed cleanup does not poison other owners',async()=>{
 const shared={slots:0};const retain=()=>{shared.slots++;let released=false;return()=>{if(!released){released=true;shared.slots--;}};};
 let calls=0,otherCloses=0;
 const rootA='/s4-resource-root-a',rootB='/s4-resource-root-b';
 const a=new TemporaryDriverResources(rootA,'owner',()=>{},temporaryDriverOwner('owner',rootA,()=>{}),
  {factory:()=>contextualDriverFactory(async config=>raw(config,()=>{calls++;if(calls===1)throw new Error('private-close-canary');}))},retain);
 const b=new TemporaryDriverResources(rootB,'owner',()=>{},temporaryDriverOwner('owner',rootB,()=>{}),
  {factory:()=>contextualDriverFactory(async config=>raw(config,()=>{otherCloses++;}))},retain);
 try {
  await a.acquire({id:'old',kind:'postgres',url:'postgres://host/db'},'old-revision');
  const cleanup=a.commitRemoval(a.prepareRemoval('old-revision','old-operation'));
  assert.equal(shared.slots,1);
  await assert.rejects(cleanup.close(),{code:'recovery-required'});assert.equal(shared.slots,1);
  assert.ok(a.removalCleanupPending('old-operation','old-revision'));
  await b.acquire({id:'other',kind:'postgres',url:'postgres://host/db'},'other-revision');
  await a.acquire({id:'new',kind:'postgres',url:'postgres://host/db'},'new-revision');
  await a.retryRemovalCleanup('old-operation','old-revision');assert.equal(shared.slots,0);assert.equal(calls,2);
  await cleanup.close();assert.equal(calls,2);assert.equal(otherCloses,0);
 } finally {await a.close();await b.close();}
 assert.equal(shared.slots,0);assert.equal(otherCloses,1);
});

test('CM-S4-TEMP: exact private file failures remain owned and retain the slot until file and SDK close complete',async()=>{
 let files=0,drivers=0,slots=0;
 const root='/s4-resource-file';
 const resources=new TemporaryDriverResources(root,'owner',()=>{},temporaryDriverOwner('owner',root,()=>{}),
  {factory:()=>contextualDriverFactory(async(config,context)=>{
   temporaryFileExecutionOwner(context)!({close:async()=>{files++;if(files===1)throw new Error('private-file-canary');}});
   return raw(config,()=>{drivers++;});
  })},()=>{slots++;return()=>{slots--;};});
 try {
  await resources.acquire({id:'private-file',kind:'postgres',url:'postgres://host/db'},'file-revision');
  const cleanup=resources.commitRemoval(resources.prepareRemoval('file-revision','file-operation'));
  await assert.rejects(cleanup.close(),{code:'recovery-required'});assert.equal(slots,1);assert.equal(drivers,1);
  await cleanup.close();assert.equal(slots,0);assert.equal(files,2);assert.equal(drivers,1);
 } finally {await resources.close();}
});

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
  rejected(await ui.call('db.connections.v2.mutate',await removeRequest(ui,f.a,initial.revision)),'busy');
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
  const selected=await ui.call<{revision:string}>('db.connections.v2.read',{key:input.key});
  rejected(await ui.call('db.connections.v2.mutate',await removeRequest(ui,f.a,selected.revision)),'busy');
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
  rejected(await ui.call('db.connections.v2.mutate',await removeRequest(ui,f.a,first.revision)),'busy');
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
	const { spawn } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
	const baseline = Object.fromEntries(['DEBUG', 'NODE_DEBUG', 'OLLAMA_DEBUG', 'GRPC_TRACE', 'GRPC_VERBOSITY', 'DPI_DEBUG_LEVEL', 'NODE_ORACLEDB_TRACE_LEVEL', 'NODE_ORACLEDB_DEBUG_PACKETS', 'ORA_DEBUG_JDWP'].map(key => [key, '']));
	const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./fixtures/native-sqlite-isolation-child.ts', import.meta.url))], { env: { ...process.env, ...baseline, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['ignore', 'pipe', 'pipe'] });
	let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; }); const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
	try { const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }); assert.equal(code, 0, output); assert.match(output, /native-sqlite-isolation-ok/); } finally { clearTimeout(timer); child.kill('SIGKILL'); }
});

test('CM-S4-RACES: temporary remove replay and cleanup create races invalidate access before paused close',async()=>{
 const entered=deferred(),release=deferred();let oldCloses=0,newCloses=0,builds=0;
 const f=await fixture({factory:()=>async config=>{const generation=++builds;return {...raw(config,()=>{}),close:async()=>{if(generation===1){oldCloses++;entered.resolve();await release.promise;}else newCloses++;}} as Driver;}});
 try{
  const ui=await f.client();await ui.call('db.connections.v2.session.open',{repoRoot:f.a});
  const create=await request(ui,f.a,{kind:'postgres',endpoint:'postgres://host/db'}),initial=committed(await ui.call<MutationOutcome>('db.connections.v2.mutate',create));
  const held=await f.hold(ui),access=await f.runtime.accessFor(held.context,f.a),remove=await removeRequest(ui,f.a,initial.revision);
  const [a,b]=await Promise.all([ui.call<MutationOutcome>('db.connections.v2.mutate',remove),ui.call<MutationOutcome>('db.connections.v2.mutate',structuredClone(remove))]);
  const removed=committed(a);assert.deepEqual(a,b);await entered.promise;assert.equal(oldCloses,1);
  const list=await f.resolver.list(access);assert.equal(list.some(row=>row.key.id==='same'),false);
  await assert.rejects(f.resolver.lease(access,'same'),{code:'not-found'});await assert.rejects(f.resolver.withConnection(access,'same',async()=>{}),{code:'not-found'});
  const edit=await request(ui,f.a,{label:'late'},{},initial.revision);rejected(await ui.call('db.connections.v2.mutate',edit),'busy');
  const recreate=await request(ui,f.a,{kind:'postgres',endpoint:'postgres://host/new'});rejected(await ui.call('db.connections.v2.mutate',recreate),'busy');
  const retry=ui.call('db.connections.v2.retryRemovalCleanup',{ticket:remove.ticket});
  assert.equal((await ui.call<{state:string}>('db.connections.v2.removalState',{ticket:remove.ticket})).state,'removed-cleanup-pending');
  release.resolve();assert.equal((await retry as {state:string}).state,'removed');assert.equal(oldCloses,1);
  const fresh=committed(await ui.call<MutationOutcome>('db.connections.v2.mutate',recreate));assert.notEqual(fresh.revision,initial.revision);
  assert.deepEqual(committed(await ui.call<MutationOutcome>('db.connections.v2.mutate',remove)),removed);
  await ui.call('db.connections.v2.retryRemovalCleanup',{ticket:remove.ticket});assert.equal(newCloses,0);assert.equal(oldCloses,1);
  assert.equal((await f.resolver.list(access)).find(row=>row.key.id==='same')!.revision,fresh.revision);
  held.release.resolve();await held.response;
 }finally{release.resolve();await f.close();}
 assert.equal(newCloses,1);
});
