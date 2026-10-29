/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Method-class registry (Epic 86197ac6, Story s2, t2, contract sc5): every
 * served method has a class, the table equals the handler tables the daemon
 * builds, and the module loads on a worker without a handler module.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/method-class.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-method-class-'));
process.env['HOME'] = HOME;
const { FIFO_EXEMPT_METHODS, SHARED_STATE_METHODS, inDaemonTarget, methodClasses } = await import('../method-class.js');
const { createInDaemonClient } = await import('../../steps/daemon-client.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');

const HERE = dirname(fileURLToPath(import.meta.url));

const ADMIN = ['daemon.status', 'daemon.debug-status', 'daemon.shutdown', 'daemon.update', 'daemon.updateOutcome',
	'repo.list', 'config.show', 'config.catalog', 'guide.list', 'guide.get'];
const INDEXING = ['repo.add', 'repo.remove', 'repo.reindex', 'repo.stats', 'index.file',
	'config.enqueue', 'config.reindex', 'daemon.compact', 'daemon.backup', 'docSummary.restoreFromBackup'];

/** The methods the daemon serves: the tables buildHandlerRuntime constructs, after every merge. */
function servedTables(): { rpc: string[]; stream: string[] } {
	const none = {} as never;
	const runtime = buildHandlerRuntime({
		db: none, configStore: none, queue: none, indexer: none, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	return { rpc: Object.keys(runtime.rpcHandlers), stream: Object.keys(runtime.streamHandlers) };
}

/** Where the registry and the served tables differ: methods with no entry, and entries for no served method or with the wrong stream flag. */
function differences(tables: { rpc: string[]; stream: string[] }): { missing: string[]; stale: string[] } {
	const served = new Map<string, boolean>([...tables.rpc.map(m => [m, false] as const), ...tables.stream.map(m => [m, true] as const)]);
	const entries = methodClasses.entries();
	const missing = [...served.keys()].filter(m => !entries.some(e => e.method === m)).sort();
	const stale = entries.filter(e => served.get(e.method) !== e.stream).map(e => e.method).sort();
	return { missing, stale };
}

test('classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique', () => {
	for (const m of ADMIN) assert.equal(methodClasses.classOf(m), 'admin', m);
	for (const m of INDEXING) assert.equal(methodClasses.classOf(m), 'indexing', m);
	const entries = methodClasses.entries();
	assert.deepEqual(entries.filter(e => e.cls === 'admin').map(e => e.method).sort(), [...ADMIN].sort());
	assert.deepEqual(entries.filter(e => e.cls === 'indexing').map(e => e.method).sort(), [...INDEXING].sort());
	assert.ok(entries.filter(e => e.cls !== 'admin' && e.cls !== 'indexing').every(e => e.cls === 'session'));
	assert.equal(new Set(entries.map(e => e.method)).size, entries.length, 'no method listed twice');
	assert.equal(methodClasses.classOf('step.call'), 'session');
	assert.equal(methodClasses.classOf('no.such.method'), undefined);
	assert.ok(Object.isFrozen(entries) && Object.isFrozen(entries[0]), 'the table is frozen');
});

test('coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry', () => {
	try {
		const tables = servedTables();
		assert.ok(tables.rpc.includes('daemon.update') && tables.rpc.includes('understanding.list') && tables.stream.includes('understanding.watch'),
			'the tables include the update-handler spread and the understanding routes');
		assert.deepEqual(differences(tables), { missing: [], stale: [] });
		// The comparison catches both kinds of drift.
		const drifted = { rpc: [...tables.rpc.filter(m => m !== 'repo.list'), 'repo.brandNew'], stream: tables.stream };
		assert.deepEqual(differences(drifted), { missing: ['repo.brandNew'], stale: ['repo.list'] });
		const flipped = { rpc: [...tables.rpc, 'step.call'], stream: tables.stream.filter(m => m !== 'step.call') };
		assert.deepEqual(differences(flipped).stale, ['step.call'], 'a wrong stream flag is stale');
	} finally {
		rmSync(HOME, { recursive: true, force: true });
	}
});

test('method sets: every shared-state and FIFO-exempt member is a session-class method', () => {
	assert.ok(SHARED_STATE_METHODS.size > 0 && FIFO_EXEMPT_METHODS.size > 0);
	for (const m of [...SHARED_STATE_METHODS, ...FIFO_EXEMPT_METHODS]) assert.equal(methodClasses.classOf(m), 'session', m);
});

test('method sets: every served chat.*, todos.*, understanding.*, models.* and codeReview.* method is in the shared-state set', () => {
	const { rpc, stream } = servedTables();
	const family = [...rpc, ...stream].filter(m => /^(chat|todos|understanding|models|codeReview)\./.test(m));
	assert.ok(family.includes('chat.start') && family.includes('todos.subscribe') && family.includes('understanding.watch'), 'the three families are served');
	assert.deepEqual(family.filter(m => !SHARED_STATE_METHODS.has(m)).sort(), [], 'every one runs on the shared-state worker');
	assert.ok(family.includes('models.check') && family.includes('models.approve') && family.includes('codeReview.run'), 'models and codeReview are served (Story 5d393a4b)');
	assert.deepEqual([...SHARED_STATE_METHODS].filter(m => !/^(chat|todos|understanding|models|codeReview)\./.test(m)), [], 'and nothing else does');
});

test('in-daemon route: targetOf sends admin/indexing to their workers, shared-state methods to the shared-state target (inline on it), others inline', async () => {
	const allRouted = new Set(['admin', 'indexing', 'session'] as const);
	const view = { routed: allRouted, onSharedWorker: false };
	assert.deepEqual(inDaemonTarget('repo.list', view), { cls: 'admin' });
	assert.deepEqual(inDaemonTarget('repo.reindex', view), { cls: 'indexing' });
	assert.deepEqual(inDaemonTarget('chat.list', view), { cls: 'session', shared: true });
	assert.deepEqual(inDaemonTarget('todos.cleanup', view), { cls: 'session', shared: true });
	assert.deepEqual(inDaemonTarget('chat.dropSession', view), { cls: 'session', shared: true }, 'the in-daemon-only purge method too');
	assert.equal(inDaemonTarget('session.list', view), undefined, 'any other session method runs inline');
	assert.equal(inDaemonTarget('chat.list', { routed: allRouted, onSharedWorker: true }), undefined, 'inline on the shared-state worker itself');
	assert.equal(inDaemonTarget('chat.list', { routed: new Set(['admin', 'indexing'] as const), onSharedWorker: false }), undefined, 'inline while session work is not routed');
	assert.equal(inDaemonTarget('repo.list', { routed: new Set(['indexing'] as const), onSharedWorker: false }), undefined, 'a class not routed runs inline, as before');
	// The client follows it: routed calls go out with their target, the rest run on its own tables.
	const sent: unknown[] = [];
	const client = createInDaemonClient({ 'session.list': async () => 'inline' }, {}, {
		inDaemonOnly: { 'chat.dropSession': async () => 'in-daemon-only inline' },
		route: { targetOf: m => inDaemonTarget(m, view), request: async (cls, method, _p, opts) => { sent.push({ cls, method, opts }); return 'sent'; } },
	});
	assert.equal(await client.request('session.list', {}), 'inline');
	assert.equal(await client.request('chat.list', {}), 'sent');
	assert.equal(await client.request('repo.list', {}), 'sent');
	assert.deepEqual(sent, [{ cls: 'session', method: 'chat.list', opts: { shared: true } }, { cls: 'admin', method: 'repo.list', opts: {} }]);
	const onShared = createInDaemonClient({}, {}, {
		inDaemonOnly: { 'chat.dropSession': async () => 'in-daemon-only inline' },
		route: { targetOf: m => inDaemonTarget(m, { routed: allRouted, onSharedWorker: true }), request: async () => assert.fail('the shared-state worker serves its own families') },
	});
	assert.equal(await onShared.request('chat.dropSession', { sessionId: 's' }), 'in-daemon-only inline');
});

test('the method-class module loads on a worker without importing a handler module', async () => {
	// Its only import is type-only, which is erased at run time.
	const src = readFileSync(join(HERE, '..', 'method-class.ts'), 'utf8');
	const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*;/gm)];
	assert.ok(imports.length > 0 && imports.every(m => m[1] !== undefined), `only type imports: ${imports.map(m => m[0]).join(' | ')}`);
	assert.doesNotMatch(src, /import\(/, 'no dynamic import');

	const worker = new Worker(join(HERE, 'helpers', 'method-class-worker.ts'));
	const reply = await new Promise<unknown>((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
	await worker.terminate();
	assert.deepEqual(reply, { status: 'admin', reindex: 'indexing', step: 'session', entries: methodClasses.entries().length });
});

test('CM-S4-RPC/GATE: source and freshly compiled removal methods agree with handlers and main ownership',async()=>{
 const ts=await import('typescript'),source=readFileSync(join(HERE,'..','method-class.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const output=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 const {MAIN_DAEMON_CONNECTION_METHODS}=await import('../method-class.js');
 const tables=servedTables();
 for(const method of ['db.connections.v2.removalState','db.connections.v2.retryRemovalCleanup']){
  assert.ok(tables.rpc.includes(method));assert.ok(MAIN_DAEMON_CONNECTION_METHODS.has(method));
  assert.equal(methodClasses.classOf(method),'session');
  assert.equal(output.methodClasses.classOf(method),methodClasses.classOf(method));
  assert.ok(output.MAIN_DAEMON_CONNECTION_METHODS.has(method));
  assert.equal(SHARED_STATE_METHODS.has(method),false);
 }
 assert.deepEqual([...output.MAIN_DAEMON_CONNECTION_METHODS],[...MAIN_DAEMON_CONNECTION_METHODS]);
 assert.deepEqual(output.methodClasses.entries(),methodClasses.entries());
});
