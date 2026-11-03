import { restartPeer } from './session-restart-peer.js';
/** Real owned native handles; lifecycle fault ports never replace the owner chain. */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, writeFile, readFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
const mode = process.argv[2] ?? 'source', base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const load = (path: string) => import(new URL(path, base).href);
const { PATHS } = await load('shared/paths.js');
const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-cleanup-'))); PATHS.insrc = join(directory, 'insrc'); await mkdir(PATHS.insrc); PATHS.config = join(directory, 'config.json'); await writeFile(PATHS.config, '{}');
const { ConnectionSessionRpc } = await load('daemon/connection-session-rpc.js'); const { RequestLifetime } = await load('daemon/request-context.js');
const { createTemporaryOverlay } = await load('daemon/db/session-entries.js'); const { contextualDriverFactory } = await load('daemon/db/driver-log-policy.js'); const { getFactory } = await load('daemon/db/registry.js'); const { closeAll } = await load('daemon/db/pool-cache.js');
const { assertSavedIdAvailable } = await load('daemon/db/connection-reservations.js');
await load('daemon/db/drivers/index.js');
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture(label: string, options: { holdBuild?: boolean; failClose?: boolean } = {}) {
	const root = join(directory, label); await mkdir(root); const source = join(root, 'source.sqlite'), db = new DatabaseSync(source); db.exec("CREATE TABLE data(marker TEXT); INSERT INTO data VALUES ('positive-owned-row')"); db.close();
	let now = 0, overlay: any, builds = 0, closes = 0, closeAttempts = 0, failClose = options.failClose === true; const live = new Set<any>(), enteredBuild = deferred(), releaseBuild = deferred(); if (!options.holdBuild) releaseBuild.resolve();
	const runtime = new ConnectionSessionRpc({ monotonicNow: () => now, enabled: async () => true, isRegistered: async (r: string) => r === root, createOverlay: (r: string, h: string, c: any) => { overlay = createTemporaryOverlay(r, h, c, { factory: (kind: string) => contextualDriverFactory(async (config: any, context: any) => { const driver = await getFactory(kind)!(config, context); builds++; live.add(driver); const close = driver.close.bind(driver); driver.close = async () => { closeAttempts++; if (failClose) throw Error('private-close-failure'); await close(); closes++; live.delete(driver); }; enteredBuild.resolve(); await releaseBuild.promise; return driver; }) }); return overlay; }, dropOverlay: (o: any) => o.close() });
	const lifetime = new RequestLifetime(), context = { connectionIdentity: label, daemonEpoch: 'cleanup-fixture', signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive };
	const opened = await runtime.call('db.connections.v2.session.open', { repoRoot: root }, context); assert.ok(opened.sessionHandle);
	overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'same' }, mode: 'create', publicPatch: { kind: 'sqlite', path: source } }));
	const execution = await runtime.executionFor(context, root);
	const resolver = overlay.resolver(execution.connectionAccess, { signal: lifetime.signal, assertActive: execution.assertActive, registerDrain: lifetime.registerDrain });
	return { root, source, runtime, context, lifetime, execution, resolver, opened, overlay, live, enteredBuild, releaseBuild, expire() { now = 90_000; }, allowClose() { failClose = false; }, get counts() { return { builds, closes, closeAttempts }; }, async cleanup() { releaseBuild.resolve(); failClose = false; lifetime.abort(); lifetime.complete(); await runtime.close().catch(() => { }); await runtime.close(); await lifetime.drained; assert.equal(live.size, 0); await closeAll(); } };
}
for (const trigger of ['end', 'deadline', 'shutdown', 'restart'] as const) test(`native constructor and use drain across ${trigger}`, async () => {
	const f = await fixture('held-' + trigger, { holdBuild: true }), before = await readFile(f.source); let settled = false;
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => driver.sample('data', { limit: 1 })); const observed = using.then(value => ({ value }), error => ({ error }));
	await f.enteredBuild.promise;
	let ending: Promise<unknown>;
	if (trigger === 'end') ending = f.runtime.call('db.connections.v2.session.end', {}, f.context);
	else if (trigger === 'deadline') { f.expire(); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); ending = f.runtime.close(); }
	else { f.runtime.stopAdmission(); ending = f.runtime.close(); }
	const completion = ending.then(value => { settled = true; return value; });
	try {
		if (trigger === 'restart') { await restartPeer(mode, f.root, f.opened); assert.equal(f.live.size, 1); }
		await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); await delay(10); assert.equal(settled, false); assert.equal(f.live.size, 1); assert.equal(f.counts.closes, 0);
		await assert.rejects(assertSavedIdAvailable(f.root, 'same'), { code: 'duplicate-id' });
		f.releaseBuild.resolve(); const result = await observed; assert.ok('error' in result); assert.equal(result.error.code, 'session-expired'); await completion; assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1); await assertSavedIdAvailable(f.root, 'same'); assert.deepEqual(await readFile(f.source), before);
	} finally { f.releaseBuild.resolve(); await observed; await completion.catch(() => { }); await f.cleanup(); }
});
for (const trigger of ['end', 'deadline', 'restart'] as const) test(`actual native use is held across ${trigger} and cannot publish after revocation`, async () => {
	const f = await fixture('use-' + trigger), entered = deferred(), held = deferred();
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => { const value = await driver.sample('data', { limit: 1 }); assert.ok(JSON.stringify(value).includes('positive-owned-row')); entered.resolve(); await held.promise; return value; }); const observed = using.then(value => ({ value }), error => ({ error }));
	try {
		await entered.promise; let closing: Promise<unknown>;
		if (trigger === 'end') closing = f.runtime.call('db.connections.v2.session.end', {}, f.context);
		else if (trigger === 'deadline') { f.expire(); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); closing = f.runtime.close(); }
		else { f.runtime.stopAdmission(); closing = f.runtime.close(); await restartPeer(mode, f.root, f.opened); }
		let done = false; void closing.then(() => { done = true; }); await delay(5); assert.equal(done, false); assert.equal(f.live.size, 1); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' });
		held.resolve(); const result = await observed; assert.ok('error' in result); assert.equal(result.error.code, 'session-expired'); await closing; assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1);
	} finally { held.resolve(); await observed; await f.cleanup(); }
});
for (const trigger of ['end', 'deadline', 'restart'] as const) test(`native close failure retains cleanup ownership across ${trigger}`, async () => {
	const f = await fixture('close-retry-' + trigger, { failClose: true }); const before = await readFile(f.source);
	try {
		const result = await f.resolver.withConnection(f.execution.connectionAccess, 'same', (driver: any) => driver.sample('data', { limit: 1 })); assert.ok(JSON.stringify(result).includes('positive-owned-row'));
		if (trigger === 'end') { const ended = await f.runtime.call('db.connections.v2.session.end', {}, f.context); assert.equal(ended.code, 'recovery-required'); }
		else { if (trigger === 'deadline') { f.expire(); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); } else f.runtime.stopAdmission(); await assert.rejects(f.runtime.close(), { code: 'recovery-required' }); if (trigger === 'restart') await restartPeer(mode, f.root, f.opened); } assert.equal(f.live.size, 1); assert.equal(f.counts.closes, 0); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); assert.throws(() => f.overlay.list(), { code: 'session-expired' });
		await assert.rejects(f.runtime.close(), { code: 'recovery-required' }); assert.equal(f.live.size, 1); await assert.rejects(assertSavedIdAvailable(f.root, 'same'), { code: 'duplicate-id' }); f.allowClose(); await f.runtime.close(); assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1); assert.ok(f.counts.closeAttempts >= 3); await assertSavedIdAvailable(f.root, 'same'); assert.deepEqual(await readFile(f.source), before);
		await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); assert.equal(f.counts.builds, 1);
	} finally { await f.cleanup(); }
});
test('actual converted file and DuckDB close failures retain native handles and decoder budget until cleanup retry', async () => {
	const { MemoryFileExecution } = await load('daemon/db/file-execution.js'); const { createTypedRowSource } = await load('daemon/db/drivers/converters/typed-row-source.js'); const { convertedColumn } = await load('daemon/db/drivers/converters/normalization.js');
	const root = join(directory, 'converted-close'); await mkdir(root); const path = join(root, 'rows.txt'); await writeFile(path, 'positive-converted-row'); const before = await readFile(path), file = await open(path, 'r');
	const resource = await MemoryFileExecution.open({ identity: { lookupRoot: root, ownerId: 'owner', connectionId: 'converted', revision: 'revision', sourceIdentity: 'source', converterOptionsDigest: 'options' }, persistence: 'memory-only', memoryBudgetBytes: 64 * 1024 * 1024, allowSpill: false });
	let allow = false, sourceCloses = 0, nativeCloses = 0, attempts = 0; const native = resource.engine.instance.closeSync.bind(resource.engine.instance);
	const hook = mock.method(resource.engine.instance, 'closeSync', () => { attempts++; if (!allow) throw Error('private-native-close-failure'); native(); nativeCloses++; });
	try {
		await assert.rejects(resource.loadRows(async (budget: any) => createTypedRowSource([{ target: { targetId: 'data', sourceIdentity: 'source', columns: [convertedColumn('marker', 'UTF8', false)] }, async *rows() { yield { marker: (await file.readFile('utf8')) }; }, normalize(row: any) { return row; } }], { budget, memoryBudgetBytes: 64 * 1024 * 1024, close: async () => { sourceCloses++; if (!allow) throw Error('private-decoder-close-failure'); await file.close(); } })), /cleanup pending/);
		assert.ok(file.fd >= 0); assert.ok(resource.diagnostics.decodedBytes > 0); assert.equal(nativeCloses, 0); await assert.rejects(resource.table(), /closed/);
		allow = true; await resource.close(); assert.equal(file.fd, -1); assert.equal(nativeCloses, 1); assert.ok(attempts >= 2); assert.ok(sourceCloses >= 3); assert.equal(resource.diagnostics.decodedBytes, 0); assert.equal(resource.diagnostics.connections, 0); assert.equal(resource.diagnostics.operations, 0); assert.equal(resource.diagnostics.tables, 0); assert.deepEqual(await readFile(path), before);
	} finally { allow = true; await resource.close().catch(() => { }); hook.mock.restore(); await file.close().catch(() => { }); }
});
test('before-deadline control resume preserves entries and revokes an actual held callback generation', async () => {
	const f = await fixture('resume'); const held = deferred(), entered = deferred(); let published = false;
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => { const rows = await driver.sample('data', { limit: 1 }); assert.ok(JSON.stringify(rows).includes('positive-owned-row')); entered.resolve(); await held.promise; published = true; return rows; }); const observed = using.then(value => ({ value }), error => ({ error }));
	try {
		await entered.promise; const nextLifetime = new RequestLifetime(), next = { ...f.context, connectionIdentity: 'next-control', signal: nextLifetime.signal, registerDrain: nextLifetime.registerDrain, assertRequestActive: nextLifetime.assertActive };
		const resumed = await f.runtime.call('db.connections.v2.session.resume', { sessionHandle: f.opened.sessionHandle, capability: f.opened.capability, daemonEpoch: f.opened.daemonEpoch }, next); assert.ok(resumed.sessionHandle); assert.equal(f.execution.lifetime.signal.aborted, true); assert.equal(f.overlay.read('same').revision.length > 0, true); held.resolve(); const old = await observed; assert.ok('error' in old); assert.equal(old.error.code, 'session-expired');
		const execution = await f.runtime.executionFor(next, f.root); const resolver = f.overlay.resolver(execution.connectionAccess, { signal: nextLifetime.signal, assertActive: execution.assertActive, registerDrain: nextLifetime.registerDrain }); const rows = await resolver.withConnection(execution.connectionAccess, 'same', (driver: any) => driver.sample('data', { limit: 1 })); assert.ok(JSON.stringify(rows).includes('positive-owned-row')); assert.equal(f.counts.builds, 1);
		await f.runtime.call('db.connections.v2.session.end', {}, next); nextLifetime.complete(); await nextLifetime.drained; assert.equal(f.live.size, 0); assert.equal(published, true, 'the callback actually settled; its old result was refused by the owner lease');
	} finally { held.resolve(); await observed; await f.cleanup(); }
});
for (const fail of [false, true]) test(`actual daemon shutdown waits for owned use and reports close failure=${fail}`, async () => {
	const { createShutdown } = await load('daemon/shutdown.js'); const f = await fixture('daemon-shutdown-' + fail, { failClose: fail });
	const entered = deferred(), held = deferred(), exits: number[] = []; let cleared = 0;
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => { await driver.sample('data', { limit: 1 }); entered.resolve(); await held.promise; return 'late output'; }); const observed = using.then(value => ({ value }), error => ({ error }));
	try {
		await entered.promise;
		const shutdown = createShutdown({ log: { info() { }, warn() { } }, stopBackgroundWork() { f.runtime.stopAdmission(); }, queueDone: Promise.resolve(), closeStores: () => f.runtime.close(), hardExitMs: 1000, end: { clearPid() { cleared++; }, exit(code: number) { exits.push(code); }, killSelf() { assert.fail('healthy private store must not be killed'); }, lastLinePath: join(directory, 'end.log'), storeHealth() { return { state: 'ok' }; } } });
		shutdown('SIGTERM'); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); await delay(10); assert.deepEqual(exits, []); assert.equal(f.live.size, 1);
		held.resolve(); assert.ok('error' in await observed); for (let n = 0;n < 200 && exits.length === 0;n++) await delay(2); assert.deepEqual(exits, [fail ? 1 : 0]); assert.equal(cleared, 1);
		if (fail) { assert.equal(f.live.size, 1); f.allowClose(); await f.runtime.close(); }
		assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1);
	} finally { held.resolve(); await observed; await f.cleanup(); }
});
test('shutdown backstop refuses success while actual owned callback work remains held', async () => {
	const { createShutdown } = await load('daemon/shutdown.js'); const f = await fixture('shutdown-backstop'), entered = deferred(), held = deferred(), exits: number[] = [];
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => { await driver.sample('data', { limit: 1 }); entered.resolve(); await held.promise; }); const observed = using.catch(() => { });
	try {
		await entered.promise;
		createShutdown({ log: { info() { }, warn() { } }, stopBackgroundWork() { f.runtime.stopAdmission(); }, queueDone: Promise.resolve(), closeStores: () => f.runtime.close(), hardExitMs: 10, end: { clearPid() { }, exit(code: number) { exits.push(code); }, killSelf() { assert.fail('healthy store'); }, lastLinePath: join(directory, 'end.log'), storeHealth() { return { state: 'ok' }; } } })('SIGTERM');
		await delay(30); assert.deepEqual(exits, [1]); assert.equal(f.live.size, 1); held.resolve(); await observed; await f.runtime.close(); await delay(5); assert.equal(f.live.size, 0); assert.deepEqual(exits, [1]);
	} finally { held.resolve(); await observed; await f.cleanup(); }
});
test('rejected queue drain still closes native resources and ends once with failure', async () => {
	const { createShutdown } = await load('daemon/shutdown.js'); const f = await fixture('shutdown-queue-rejected'), exits: number[] = [];
	try {
		await f.resolver.withConnection(f.execution.connectionAccess, 'same', (driver: any) => driver.sample('data', { limit: 1 }));
		createShutdown({ log: { info() { }, warn() { } }, stopBackgroundWork() { f.runtime.stopAdmission(); }, queueDone: Promise.reject(Error('private-queue-failure')), closeStores: () => f.runtime.close(), hardExitMs: 1000, end: { clearPid() { }, exit(code: number) { exits.push(code); }, killSelf() { assert.fail('healthy store'); }, lastLinePath: join(directory, 'end.log'), storeHealth() { return { state: 'ok' }; } } })('SIGTERM');
		for (let n = 0;n < 200 && exits.length === 0;n++) await delay(2); assert.deepEqual(exits, [1]); assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1);
	} finally { await f.cleanup(); }
});
test('periodic cleanup retry releases a failed owner handle while daemon admission stays open', async () => {
	const f = await fixture('background-retry', { failClose: true });
	try {
		await f.resolver.withConnection(f.execution.connectionAccess, 'same', (driver: any) => driver.sample('data', { limit: 1 }));
		assert.equal((await f.runtime.call('db.connections.v2.session.end', {}, f.context)).code, 'recovery-required'); assert.equal(f.live.size, 1); f.allowClose();
		for (let n = 0;n < 200 && f.live.size;n++) await delay(10); assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1); assert.equal(await f.runtime.ready(), true);
		const opened = await f.runtime.call('db.connections.v2.session.open', { repoRoot: f.root }, { ...f.context, connectionIdentity: 'fresh-after-cleanup' }); assert.ok(opened.sessionHandle); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' });
	} finally { await f.cleanup(); }
});
for (const trigger of ['end', 'deadline', 'restart'] as const) for (const failClose of [false, true]) test(`actual converted decoder ${trigger} during work, native close failure=${failClose}`, async () => {
	const { ConnectionSessionOwner } = await load('daemon/db/session-owner.js'); const { TemporaryDriverResources } = await load('daemon/db/session-resources.js'); const { bsonConverter } = await load('daemon/db/drivers/converters/bson.js'); const { serialize } = await import('bson');
	const root = join(directory, 'conversion-' + trigger + '-' + failClose); await mkdir(root); const path = join(root, 'data.bson'); await writeFile(path, serialize({ marker: 'positive-converted-owner' })); const before = await readFile(path);
	let now = 0, allowClose = !failClose, nativeClosed = 0; const entered = deferred(), held = deferred();
	const owner = new ConnectionSessionOwner({ daemonEpoch: 'converted-fixture', monotonicNow: () => now, isRegistered: async (value: string) => value === root, createOverlay: (r: string, h: string, c: any) => new TemporaryDriverResources(r, h, c.assertActive, c.factoryAuthority), dropOverlay: (resources: any) => resources.close() });
	const context = { connectionIdentity: 'owner', daemonEpoch: 'converted-fixture' }, opened = await owner.open(context, root), resources = await owner.overlay(context, root);
	const original = bsonConverter.openMemory.bind(bsonConverter); const sourceHook = mock.method(bsonConverter, 'openMemory', async (...args: any[]) => { const source = await original(...args); return { ...source, async *batches(...values: any[]) { for await (const batch of source.batches(...values)) { assert.ok(JSON.stringify(batch).includes('positive-converted-owner')); entered.resolve(); await held.promise; yield batch; } } }; });
	let observed: Promise<any> | undefined, nativeHook: any, execution: any;
	try {
		const driver = await resources.acquire(Object.freeze({ id: 'same', kind: 'bson', path }), 'revision'); execution = driver.execution; assert.ok(execution);
		const native = execution.engine.instance.closeSync.bind(execution.engine.instance); nativeHook = mock.method(execution.engine.instance, 'closeSync', () => { if (!allowClose) throw Error('private-converted-native-close-failure'); native(); nativeClosed++; });
		observed = driver.sample(undefined, { limit: 1 }).then((value: any) => ({ value }), (error: any) => ({ error })); await entered.promise;
		let closing: Promise<unknown>;
		if (trigger === 'end') closing = owner.end(context);
		else if (trigger === 'deadline') { now = 90_000; owner.sweepExpired(); assert.throws(() => owner.heartbeat(context), { code: 'session-expired' }); closing = owner.close(); }
		else { closing = owner.close(); await restartPeer(mode, root, opened); }
		const closingResult = closing.then(() => ({ ok: true }), error => ({ error })); let done = false; void closingResult.then(() => { done = true; });
		await assert.rejects(owner.overlay(context, root), { code: 'session-expired' }); assert.equal(execution.diagnostics.closed, true); assert.ok(execution.diagnostics.operations > 0); assert.equal(done, false); assert.equal(nativeClosed, 0);
		held.resolve(); assert.ok('error' in await observed); const closed = await closingResult;
		if (failClose) { assert.ok('error' in closed); assert.equal(closed.error.code, 'recovery-required'); assert.equal(nativeClosed, 0); if (trigger === 'restart') await restartPeer(mode, root, opened); allowClose = true; await owner.close(); }
		else assert.ok('ok' in closed);
		assert.equal(nativeClosed, 1); assert.equal(owner.size, 0); assert.deepEqual(execution.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 }); assert.deepEqual(await readFile(path), before);
	} finally { held.resolve(); await observed; allowClose = true; await owner.close().catch(() => { }); await owner.close(); nativeHook?.mock.restore(); sourceHook.mock.restore(); }
});
test('native query queued after the first interrupt is canceled before resource disposal completes', async () => {
	const { MemoryFileExecution } = await load('daemon/db/file-execution.js'); const { DuckDBPreparedStatement, DuckDBConnection } = await import('@duckdb/node-api'); const root = join(directory, 'queued-query'); await mkdir(root);
	const resource = await MemoryFileExecution.open({ identity: { lookupRoot: root, ownerId: 'owner', connectionId: 'queued', revision: 'revision', sourceIdentity: 'source', converterOptionsDigest: 'options' }, persistence: 'memory-only', memoryBudgetBytes: 64 * 1024 * 1024, allowSpill: false });
	const entered = deferred(), held = deferred(); let calls = 0, interrupts = 0;
	const submit = DuckDBPreparedStatement.prototype.runAndReadAll, interrupt = DuckDBConnection.prototype.interrupt;
	const submission = mock.method(DuckDBPreparedStatement.prototype, 'runAndReadAll', async function(this: any) { entered.resolve(); await held.promise; calls++; return submit.call(this); });
	const cancellation = mock.method(DuckDBConnection.prototype, 'interrupt', function(this: any) { interrupts++; return interrupt.call(this); });
	const work = resource.withConnection((connection: any) => connection.runAndReadAll('SELECT sum(hash(i)) FROM range(100000000000) t(i)')); const observed = work.then((value: any) => ({ value }), (error: any) => ({ error }));
	try {
		await entered.promise; let disposed = false; const closing = resource.close().then(() => { disposed = true; }); await delay(10); assert.equal(disposed, false); assert.equal(calls, 0); held.resolve(); assert.ok('error' in await observed); await closing; assert.equal(calls, 1); assert.ok(interrupts >= 2); assert.deepEqual(resource.diagnostics, { closed: true, connections: 0, operations: 0, tables: 0, decodedBytes: 0 });
	} finally { held.resolve(); await observed; await resource.close(); submission.mock.restore(); cancellation.mock.restore(); }
});
test.after(async () => { await rm(directory, { recursive: true, force: true }); });
