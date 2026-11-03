import { source } from './session-file-inputs.js';
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { sessionRpcClient } from './session-rpc-client.js';
import type { TemporaryDriverResources as TemporaryResources } from '../../session-resources.js';
import type { MemoryFileExecution as MemoryExecution } from '../../file-execution.js';
import { DuckDBInstance, DuckDBConnection, DuckDBPreparedStatement } from '@duckdb/node-api';
import type { ConnectionConfig, FileDriver, DriverFactory } from '../../../../shared/db-driver.js';
const mode = process.argv[2] === 'compiled' ? 'compiled' : 'source';
const base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const load = (path: string) => import(new URL(path, base).href);
const { PATHS } = await load('shared/paths.js');
const loggingDirectory = await realpath(await mkdtemp(join(tmpdir(), 'cm-file-trace-')));
for (const [key, value] of Object.entries(PATHS)) {
	if (typeof value === 'string') PATHS[key] = join(loggingDirectory, key);
	else if (typeof value === 'function') PATHS[key] = (...args: string[]) => join(loggingDirectory, key, ...args.map(value => encodeURIComponent(value)));
}
PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log');
await mkdir(PATHS.insrc, { recursive: true }); await writeFile(PATHS.config, '{}');
const { ConnectionSessionOwner } = await load('daemon/db/session-owner.js') as typeof import('../../session-owner.js');
const { TemporaryDriverResources } = await load('daemon/db/session-resources.js') as typeof import('../../session-resources.js');
const { MemoryFileExecution } = await load('daemon/db/file-execution.js') as typeof import('../../file-execution.js');
const { contextualDriverFactory } = await load('daemon/db/driver-log-policy.js') as typeof import('../../driver-log-policy.js');
const { getFactory } = await load('daemon/db/registry.js') as typeof import('../../registry.js');
await load('daemon/db/drivers/index.js');
const globalBefore = Object.fromEntries(Object.entries(await tree(loggingDirectory)).filter(([name]) => !name.startsWith('logDir/')));
const budget = 256 * 1024 * 1024;
async function tree(root: string): Promise<Record<string, string>> {
 const result: Record<string, string> = {};
 for (const name of await readdir(root, { recursive: true })) try { result[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex'); } catch { /* directory */ }
 return result;
}
async function fixture(factory?: (kind: string) => DriverFactory) {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-session-files-'))), root = join(directory, 'root'), other = join(directory, 'other'), saved = PATHS.insrc;
 await mkdir(root); await mkdir(other); PATHS.insrc = join(directory, 'insrc'); await mkdir(PATHS.insrc); await writeFile(join(PATHS.insrc, 'saved-marker'), 'unchanged');
 let now = 0;
	const owner = new ConnectionSessionOwner<TemporaryResources>({
		daemonEpoch: 'fixture', monotonicNow: () => now, isRegistered: async r => r === root || r === other,
  createOverlay: (r, handle, c) => new TemporaryDriverResources(r, handle, c.assertActive, c.factoryAuthority, factory ? { factory } : {}), dropOverlay: r => r.close() });
 const context = (id: string) => ({ connectionIdentity: id, daemonEpoch: 'fixture' });
 return { directory, root, other, owner, context, expire() { now = 90000; owner.sweepExpired(); }, async close() { try { await owner.close(); } finally { PATHS.insrc = saved; await rm(directory, { recursive: true, force: true }); } } };
}

async function rows(driver: FileDriver) { assert.ok(driver.sample); return driver.sample(driver.kind === 'xlsx' ? 'Data' : undefined, { limit: 1 }); }

test('CM-S3-FILES: native and converted readers use distinct owner root revision resources at the production 256MiB budget without writes or INSTALL', async () => {
 const f = await fixture();
 try {
  for (const kind of ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'parquet', 'avro', 'bson', 'fixed-width', 'xlsx']) {
			const a = await source(f.root, kind, 'CM_FILE_PRIVATE_A'), b = await source(f.root, kind, 'CM_FILE_PRIVATE_B'), cross = await source(f.other, kind, 'CM_FILE_PRIVATE_ROOT_B'), replacement = await source(f.root, kind, 'CM_FILE_PRIVATE_REVISION');
   const oa = await f.owner.open(f.context('A' + kind), f.root), ob = await f.owner.open(f.context('B' + kind), f.root);
   const ra = await f.owner.overlay(f.context('A' + kind), f.root), rb = await f.owner.overlay(f.context('B' + kind), f.root);
   const crossResources = cross ? await f.owner.overlay(f.context('A' + kind), f.other) : undefined;
   const before = await tree(f.directory), events: string[] = [], sql: string[] = [];
   const watcher = watch(f.directory, { recursive: true }, (_t, name) => events.push(String(name)));
   const original = DuckDBConnection.prototype.run, spy = mock.method(DuckDBConnection.prototype, 'run', function (this: DuckDBConnection, query: string, ...args: unknown[]) { sql.push(query); return original.call(this, query, ...args as []); });
   try {
				const da = await ra.acquire(Object.freeze(a), 'revision-A').catch(error => { throw new Error(kind + ' owner-A construction failed', { cause: error }); }) as FileDriver, db = await rb.acquire(Object.freeze(b), 'revision-A') as FileDriver;
				assert.ok(JSON.stringify(await rows(da)).includes('CM_FILE_PRIVATE_A'), kind); assert.ok(JSON.stringify(await rows(db)).includes('CM_FILE_PRIVATE_B'), kind);
				const ea = (da as unknown as { execution: MemoryExecution }).execution, eb = (db as unknown as { execution: MemoryExecution }).execution;
    assert.ok(ea instanceof MemoryFileExecution && eb instanceof MemoryFileExecution); assert.notEqual(ea.engine.instance, eb.engine.instance);
    assert.equal(ea.policy.memoryBudgetBytes, budget); assert.equal(eb.policy.memoryBudgetBytes, budget); assert.equal(ea.policy.allowSpill, false); assert.equal(ea.policy.persistence, 'memory-only');
    assert.deepEqual([ea.policy.identity.ownerId, eb.policy.identity.ownerId], [oa.sessionHandle, ob.sessionHandle]); assert.equal(ea.policy.identity.lookupRoot, f.root); assert.equal(ea.policy.identity.connectionId, kind); assert.equal(ea.policy.identity.revision, 'revision-A');
    const c = await ea.engine.instance.connect(); try { const settings = (await c.runAndReadAll("SELECT current_setting('memory_limit') AS memory, current_setting('temp_directory') AS temp, current_setting('max_temp_directory_size') AS spill, current_setting('autoinstall_known_extensions') AS install")).getRowObjectsJS()[0]!; assert.equal(settings.memory, '256.0 MiB'); assert.equal(settings.temp, ''); assert.equal(settings.spill, '0 bytes'); assert.equal(settings.install, false); } finally { c.closeSync(); }
				if (cross && crossResources) { const dc = await crossResources.acquire(cross, 'revision-A') as FileDriver; assert.ok(JSON.stringify(await rows(dc)).includes('CM_FILE_PRIVATE_ROOT_B')); const ec = (dc as unknown as { execution: MemoryExecution }).execution; assert.equal(ec.policy.identity.ownerId, oa.sessionHandle); assert.equal(ec.policy.identity.lookupRoot, f.other); assert.notEqual(ec.engine.instance, ea.engine.instance); await crossResources.retire('revision-A'); }
				await ra.retire('revision-A');
				const changed = await ra.acquire(Object.freeze(replacement), 'revision-C') as FileDriver, changedExecution = (changed as unknown as { execution: MemoryExecution }).execution;
				assert.ok(JSON.stringify(await rows(changed)).includes('CM_FILE_PRIVATE_REVISION'), kind); assert.equal(changedExecution.policy.identity.revision, 'revision-C'); assert.notEqual(changedExecution.policy.identity.sourceIdentity, ea.policy.identity.sourceIdentity); assert.notEqual(changedExecution.engine.instance, ea.engine.instance);
				assert.ok(JSON.stringify(await rows(db)).includes('CM_FILE_PRIVATE_B'), kind); await ra.retire('revision-C'); await rb.retire('revision-A'); assert.deepEqual(ea.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
    assert.equal(sql.some(s => /^\s*INSTALL\b/i.test(s)), false); assert.deepEqual(await tree(f.directory), before); assert.ok(events.every(name => Object.hasOwn(before, name)), JSON.stringify(events));
   } finally { spy.mock.restore(); watcher.close(); }
  }
 } finally { await f.close(); }
});

test('CM-S3-FILES: unavailable Arrow Feather and overbudget BSON refuse explicitly without source deletion or cache writes', async () => {
 const f = await fixture();
 try {
  await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  for (const kind of ['arrow', 'feather', 'bson']) {
   const config = await source(f.root, kind, kind), header = Buffer.alloc(4); header.writeInt32LE(0x7fffffff); if (kind === 'bson') await writeFile(config.path!, header);
   const before = await tree(f.directory);
   await assert.rejects(async () => { const d = await resources.acquire(config, kind) as FileDriver; await rows(d); }, { code: kind === 'bson' ? 'resource-limit' : 'unsupported-temporary' });
   await resources.retire(kind); assert.deepEqual(await tree(f.directory), before);
  }
 } finally { await f.close(); }
});

test('CM-S3-FILES: owner end interrupts actual private file work and retains late allocations for cleanup', async () => {
	let allocated!: () => void, release!: () => void; const entered = new Promise<void>(r => { allocated = r; }), held = new Promise<void>(r => { release = r; }); let resource: MemoryExecution | undefined;
	const f = await fixture(kind => contextualDriverFactory(async (config, context) => { const driver = await getFactory(kind)!(config, context); resource = (driver as unknown as { execution: MemoryExecution }).execution; allocated(); await held; return driver; }));
 try {
  const config = await source(f.root, 'csv', 'late'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  const constructing = resources.acquire(config, 'late'); void constructing.catch(() => {}); await entered;
  const ending = f.owner.end(f.context('owner')); assert.equal(resource!.diagnostics.closed, true); release(); await assert.rejects(constructing, { code: 'session-expired' }); await ending;
  assert.deepEqual(resource!.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
 } finally { release?.(); await f.close(); }
});

test('CM-S3-FILES: session end interrupts a running native query and drains all private execution counters', async () => {
 const f = await fixture(); let started!: () => void; const entered = new Promise<void>(r => { started = r; });
 try {
  const config = await source(f.root, 'csv', 'interrupt'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
		const driver = await resources.acquire(config, 'revision') as FileDriver, execution = (driver as unknown as { execution: MemoryExecution }).execution;
  const original = DuckDBPreparedStatement.prototype.runAndReadAll;
  const spy = mock.method(DuckDBPreparedStatement.prototype, 'runAndReadAll', function (this: DuckDBPreparedStatement) { const work = original.call(this); started(); return work; });
  try {
   const work = execution.withConnection(c => c.runAndReadAll('SELECT sum(hash(i)) FROM range(100000000000) t(i)')); void work.catch(() => {});
   await entered; const ending = f.owner.end(f.context('owner')); await assert.rejects(work); await ending;
   assert.deepEqual(execution.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
  } finally { spy.mock.restore(); }
 } finally { await f.close(); }
});

test('CM-S3-FILES: expiry during engine opening retains and closes the allocation before constructor refusal settles', async () => {
 const f = await fixture(); let entered!: () => void, release!: () => void;
	const opened = new Promise<void>(r => { entered = r; }), held = new Promise<void>(r => { release = r; }); let execution: MemoryExecution | undefined;
 const original = MemoryFileExecution.open;
 const spy = mock.method(MemoryFileExecution, 'open', async (...args: Parameters<typeof MemoryFileExecution.open>) => { execution = await original(...args); entered(); await held; return execution; });
 try {
  const config = await source(f.root, 'csv', 'opening'); await f.owner.open(f.context('owner'), f.root); const resources = await f.owner.overlay(f.context('owner'), f.root);
  const constructing = resources.acquire(config, 'opening'); void constructing.catch(() => {}); await opened;
  let ended = false; const ending = f.owner.end(f.context('owner')).then(() => { ended = true; }); assert.equal(ended, false); release();
  await assert.rejects(constructing, { code: 'session-expired' }); await ending;
  assert.deepEqual(execution!.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
 } finally { release?.(); spy.mock.restore(); await f.close(); }
});

// Reuse production management and the real isolated S002 worker for each reader.
test('CM-S3-FILES: real source and compiled socket probes cover every supported reader and explicit negative controls', async () => {
	const f = await fixture();
	const { ConnectionSessionRpc } = await load('daemon/connection-session-rpc.js'); const { createTemporaryOverlay } = await load('daemon/db/session-entries.js');
	const { connectionManagementHandlers } = await load('daemon/connection-management-rpc.js'); const { IpcServer, directDispatch } = await load('daemon/server.js'); const { connectionTestSupervisor } = await load('daemon/db/draft-test.js');
	const overlays = new Map<string, any>(), children: ReturnType<typeof fork>[] = []; const original = connectionTestSupervisor.spawnWorker;
	connectionTestSupervisor.spawnWorker = (entry: string, options: any) => { assert.ok(entry.endsWith(mode === 'compiled' ? '.js' : '.ts')); const child = fork(entry, [], options); children.push(child); return child; };
	const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async (r: string) => r === f.root, createOverlay: (r: string, h: string, c: any) => { const o = createTemporaryOverlay(r, h, c); overlays.set(h, o); return o; }, dropOverlay: (o: any) => o.close() });
	const path = join(f.directory, 'rpc.sock'); const server = new IpcServer(runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime, enabled: async () => true, isRegistered: async (r: string) => r === f.root }))), Date.now, path); server.onConnectionClose((c: any) => runtime.disconnect(c)); await server.listen(); const ui = await sessionRpcClient(path);
	try {
		const opened = await ui.call<any>('db.connections.v2.session.open', { repoRoot: f.root }), overlay = overlays.get(opened.sessionHandle)!;
		for (const kind of ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'parquet', 'avro', 'bson', 'fixed-width', 'xlsx', 'arrow', 'feather']) {
			const config = await source(f.root, kind, 'CM_FILE_PRIVATE_PROBE'), key = { repoRoot: f.root, scope: 'temporary', id: kind };
			const row = overlay.commit(await overlay.prepare({ key, mode: 'create', publicPatch: { kind, path: config.path, ...(config.options ? { options: config.options } : {}) } }));
			const before = await tree(f.directory);
			const result = await ui.call<any>('db.connections.v2.test', { requestId: randomUUID(), draftRevision: 1, key, expectedRevision: row.revision, publicPatch: {}, credentials: {} });
			if (kind === 'arrow' || kind === 'feather') { assert.equal(result.status, 'failed'); assert.equal(result.safeMessage, 'This input cannot be tested without persistent storage. Use a saved connection.'); }
			else assert.equal(result.status, 'reachable', kind + ':' + JSON.stringify(result));
			assert.equal(connectionTestSupervisor.activeCount, 0); assert.deepEqual(await tree(f.directory), before);
		}
		const oversized = join(f.root, 'CM_FILE_PRIVATE_TOO_BIG.bson'), header = Buffer.alloc(4); header.writeInt32LE(0x7fffffff); await writeFile(oversized, header);
		const key = { repoRoot: f.root, scope: 'temporary', id: 'overbudget' }, row = overlay.commit(await overlay.prepare({ key, mode: 'create', publicPatch: { kind: 'bson', path: oversized } })), before = await tree(f.directory);
		const refused = await ui.call<any>('db.connections.v2.test', { requestId: randomUUID(), draftRevision: 1, key, expectedRevision: row.revision, publicPatch: {}, credentials: {} });
		assert.equal(refused.status, 'failed'); assert.equal(refused.safeMessage, 'Connection test exceeded the memory limit. Use a smaller input or a saved connection.'); assert.deepEqual(await tree(f.directory), before);
		await ui.call('db.connections.v2.session.end'); assert.equal(connectionTestSupervisor.activeCount, 0); assert.equal(children.length, 13); assert.ok(children.every(c => c.exitCode !== null || c.signalCode !== null));
	} finally { connectionTestSupervisor.spawnWorker = original; await ui.close(); await server.close(); await runtime.close(); await f.close(); }
});
test.after(async () => {
	assert.deepEqual(Object.fromEntries(Object.entries(await tree(loggingDirectory)).filter(([name]) => !name.startsWith('logDir/'))), globalBefore, 'module-captured cache/config/history/temp roots must remain unchanged');
	if (process.env['INSRC_MODE'] === 'daemon') {
		const { getLogger } = await load('shared/logger.js'); getLogger('file-matrix').info('SAVED_FILE_TRACE_CONTROL'); let logs = '';
		for (let n = 0;n < 100;n++) { await new Promise(resolve => setTimeout(resolve, 10)); logs = ''; for (const path of Object.keys(await tree(PATHS.logDir))) logs += (await readFile(join(PATHS.logDir, path))).toString(); if (logs.includes('SAVED_FILE_TRACE_CONTROL')) break; }
		assert.ok(logs.includes('SAVED_FILE_TRACE_CONTROL')); assert.equal(logs.includes('CM_FILE_PRIVATE_'), false); process.stdout.write('file-normal-trace-ok:' + mode + '\n');
	}
	await rm(loggingDirectory, { recursive: true, force: true });
});
