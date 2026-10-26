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
for (const trigger of ['end', 'deadline', 'shutdown'] as const) test(`native constructor and use drain across ${trigger}`, async () => {
	const f = await fixture('held-' + trigger, { holdBuild: true }), before = await readFile(f.source); let settled = false;
	const using = f.resolver.withConnection(f.execution.connectionAccess, 'same', async (driver: any) => driver.sample('data', { limit: 1 })); const observed = using.then(value => ({ value }), error => ({ error }));
	await f.enteredBuild.promise;
	let ending: Promise<unknown>;
	if (trigger === 'end') ending = f.runtime.call('db.connections.v2.session.end', {}, f.context);
	else if (trigger === 'deadline') { f.expire(); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); ending = f.runtime.close(); }
	else { f.runtime.stopAdmission(); ending = f.runtime.close(); }
	const completion = ending.then(value => { settled = true; return value; });
	try {
		await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); await delay(10); assert.equal(settled, false); assert.equal(f.live.size, 1); assert.equal(f.counts.closes, 0);
		await assert.rejects(assertSavedIdAvailable(f.root, 'same'), { code: 'duplicate-id' });
		f.releaseBuild.resolve(); const result = await observed; assert.ok('error' in result); assert.equal(result.error.code, 'session-expired'); await completion; assert.equal(f.live.size, 0); assert.equal(f.counts.closes, 1); await assertSavedIdAvailable(f.root, 'same'); assert.deepEqual(await readFile(f.source), before);
		const restarted = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async () => true, createOverlay() { throw Error('must not recover an overlay'); } });
		try { const rejected = await restarted.call('db.connections.v2.session.resume', { sessionHandle: f.opened.sessionHandle, capability: f.opened.capability, daemonEpoch: f.opened.daemonEpoch }, { ...f.context, connectionIdentity: 'new', daemonEpoch: 'new-epoch' }); assert.equal(rejected.code, 'session-expired'); } finally { await restarted.close(); }
	} finally { f.releaseBuild.resolve(); await observed; await completion.catch(() => { }); await f.cleanup(); }
});
test('native close failure retains cleanup ownership for retry without reactivation', async () => {
	const f = await fixture('close-retry', { failClose: true }); const before = await readFile(f.source);
	try {
		const result = await f.resolver.withConnection(f.execution.connectionAccess, 'same', (driver: any) => driver.sample('data', { limit: 1 })); assert.ok(JSON.stringify(result).includes('positive-owned-row'));
		const ended = await f.runtime.call('db.connections.v2.session.end', {}, f.context); assert.equal(ended.code, 'recovery-required'); assert.equal(f.live.size, 1); assert.equal(f.counts.closes, 0); await assert.rejects(f.runtime.executionFor(f.context, f.root), { code: 'session-expired' }); assert.throws(() => f.overlay.list(), { code: 'session-expired' });
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
test.after(async () => { await rm(directory, { recursive: true, force: true }); });
