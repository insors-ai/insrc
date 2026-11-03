/** Actual SDKs, owner/management/stream host and deterministic analysis; no model stub success. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, fork } from 'node:child_process';
import type { Writable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { sessionRpcClient } from './session-rpc-client.js';
const endpoints = (await once(process, 'message'))[0] as { sql: string; kv: string; username: string; password: string; kvPassword: string; marker: string }[];
const directory = process.argv[2]!, mode = process.argv[3]!, base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const load = (path: string) => import(new URL(path, base).href);
const { PATHS } = await load('shared/paths.js');
// Redirect every path, including closures over the module's original default.
for (const [key, value] of Object.entries(PATHS)) {
	if (typeof value === 'string') (PATHS as any)[key] = join(directory, 'state', key);
	else if (typeof value === 'function') (PATHS as any)[key] = (...args: string[]) => join(directory, 'state', key, ...args.map(value => encodeURIComponent(value)));
}
PATHS.logDir = join(directory, 'logs'); PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log');
await mkdir(PATHS.insrc, { recursive: true }); await mkdir(dirname(PATHS.config), { recursive: true }); await writeFile(PATHS.config, '{}');
const { setGraphStorePath, closeGraphStore } = await load('db/graph/store.js'); const { addRepo } = await load('db/repos.js');
const { getLanceConn, closeLanceConn, setLanceConnPath } = await load('db/lance/conn.js');
const roots = [join(directory, 'a'), join(directory, 'b')]; for (const root of roots) await mkdir(root);
const { connectionsPath } = await load('daemon/db/config.js');
setGraphStorePath(join(directory, 'state', 'test-graph')); setLanceConnPath(join(directory, 'state', 'test-lance')); for (const root of roots) await addRepo(null, { path: root, name: 'fixture', addedAt: 'now', status: 'ready' }); await getLanceConn();
for (const root of roots) { await mkdir(dirname(connectionsPath(root)), { recursive: true }); await writeFile(connectionsPath(root), '{"connections":[]}'); await mkdir(join(root, 'nested', '.insrc'), { recursive: true }); await writeFile(join(root, 'nested', '.insrc', 'connections.json'), '{"connections":[{"id":"nested-saved","kind":"sqlite","path":"missing"}]}'); }
await load('daemon/db/drivers/index.js');
const { ConnectionSessionRpc } = await load('daemon/connection-session-rpc.js'); const { createTemporaryOverlay } = await load('daemon/db/session-entries.js'); const { connectionManagementHandlers } = await load('daemon/connection-management-rpc.js');
const { IpcServer, directDispatch } = await load('daemon/server.js'); const { createStepCallHandler } = await load('daemon/steps/host.js'); const { registerDbTools } = await load('daemon/tools/builtins/db/index.js'); const { executeTool } = await load('daemon/tools/executor.js');
const { executePlan } = await load('analyze/explore/executor.js'); const { closeAll } = await load('daemon/db/pool-cache.js'); const { _setKeystoreForTests } = await load('daemon/db/secrets.js'); const { getLogger } = await load('shared/logger.js');
const { connectionTestSupervisor } = await load('daemon/db/draft-test.js');
let keychain = 0, now = 0, runnerCalls = 0; const previous = _setKeystoreForTests({ getKey: async () => { keychain++; return null; }, setKey: async () => { keychain++; }, deleteKey: async () => { keychain++; } }); registerDbTools();
const runtime = new ConnectionSessionRpc({ monotonicNow: () => now, enabled: async () => true, isRegistered: async (r: string) => roots.includes(r), createOverlay: createTemporaryOverlay, dropOverlay: (o: any) => o.close() });
const host = createStepCallHandler({
	insrc_analyze_step: async (args: any, _signal: AbortSignal, progress: any, execution: any) => {
		runnerCalls++; assert.ok(execution); const root = execution.connectionAccess.lookupRoot;
		const deps = { sessionId: 'fixture', repoPath: root, requestId: 1, send() { }, connectionExecution: execution };
		const result = await executeTool(args.kv ? 'db_kv_get' : 'db_sql_sample', args.kv ? { connectionId: 'kv', key: 'data:marker' } : { connectionId: 'same', target: 'data', limit: 1 }, deps);
		assert.equal(result.success, true, JSON.stringify(result));
		const analysis = await executePlan({ connectionExecution: execution, runId: 'live-service', repoPath: root, closureRepos: [root], repoLastIndexedAtMs: 1n, plan: { answerType: 'structural-map', synthesisHint: 'fixture', explorations: [{ id: 'e', type: 'db.table.describe', purpose: 'actual SQL schema', params: { connectionId: 'same', target: 'data' } }] } });
		assert.ok(JSON.stringify(analysis).includes('marker'));
		progress({ private: 'CM_ROUTE_PRIVATE_PROGRESS' });
		return { content: [{ type: 'text', text: JSON.stringify(result) }] };
	}
});
const path = join(directory, 'rpc.sock'), server = new IpcServer(runtime.forward(directDispatch(connectionManagementHandlers({ sessionRuntime: runtime, enabled: async () => true, isRegistered: async (r: string) => roots.includes(r) }), { 'step.call': host })), Date.now, path); server.onConnectionClose((c: any) => runtime.disconnect(c)); await server.listen();
const clients: Awaited<ReturnType<typeof sessionRpcClient>>[] = [], streams: ReturnType<typeof createConnection>[] = [], children: ReturnType<typeof fork>[] = [];
const spawnWorker = connectionTestSupervisor.spawnWorker; connectionTestSupervisor.spawnWorker = (entry: string, options: any) => { assert.ok(entry.endsWith(mode === 'compiled' ? '.js' : '.ts')); const child = fork(entry, [], options); children.push(child); return child; };
async function client() { const value = await sessionRpcClient(path); clients.push(value); return value; }
async function tree(root: string, prefix = ''): Promise<Record<string, string>> {
	const values: Record<string, string> = {}; let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return values; }
	for (const entry of entries) { const name = join(prefix, entry.name), full = join(root, entry.name); if (entry.isDirectory()) Object.assign(values, await tree(full, name)); else if (entry.isFile()) values[name] = createHash('sha256').update(await readFile(full)).digest('hex'); }
	return values;
}
async function files(root: string): Promise<string> { let output = ''; for (const name of Object.keys(await tree(root))) output += (await readFile(join(root, name))).toString(); return output; }
async function dataSocket(token: any) {
	const socket = createConnection(path); streams.push(socket); await once(socket, 'connect'); let buffer = '', seq = 0; const pending = new Map<number, { frames: any[]; resolve: (v: any[]) => void }>();
	socket.on('error', () => { }); socket.on('data', b => { buffer += b; for (;;) { const end = buffer.indexOf('\n'); if (end < 0) return; const frame = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); const call = pending.get(frame.id); if (!call) continue; call.frames.push(frame); if (!frame.stream || frame.stream === 'done' || frame.stream === 'error') { pending.delete(frame.id); call.resolve(call.frames); } } });
	const call = (method: string, params: any, stream = false): Promise<any[]> => new Promise(resolve => { const id = ++seq; pending.set(id, { frames: [], resolve }); socket.write(JSON.stringify({ id, method, params, stream }) + '\n'); });
	const attached = await call('db.connections.v2.session.attach', token); assert.equal(attached[0].result.attached, true); return { call };
}
async function mutate(ui: any, root: string, id: string, patch: any, credentials: any, revision?: string) {
	const key = { repoRoot: root, scope: 'temporary', id }, mode = revision ? 'update' : 'create', ticket = await ui.call('db.connections.v2.ticket', { key, mode });
	const input = { key, mode, ticket, operationId: ticket.operationId, publicPatch: patch, credentials, ...(revision ? { expectedRevision: revision } : {}) };
	const result = await ui.call('db.connections.v2.mutate', input); assert.equal(result.status, 'committed', JSON.stringify(result)); assert.equal(result.value.activation, 'active'); assert.deepEqual(await ui.call('db.connections.v2.mutate', input), result); assert.equal((await ui.call('db.connections.v2.mutate', { ...input, publicPatch: { ...patch, label: 'different' } })).code, 'operation-mismatch'); return { key, input, revision: result.value.revision };
}
try {
	const beforeState = await tree(join(directory, 'state')), beforeRoots = await Promise.all(roots.map(root => tree(root)));
	const owners = [];
	for (let owner = 0;owner < 2;owner++) {
		const ui = await client(), opened = await ui.call<any>('db.connections.v2.session.open', { repoRoot: roots[0] }); owners.push({ ui, opened, rows: [] as any[] });
		for (let rootIndex = 0;rootIndex < 2;rootIndex++) {
			const root = roots[rootIndex]!, endpoint = endpoints[owner * 2 + rootIndex]!;
			const sql = await mutate(ui, root, 'same', { kind: 'postgres', endpoint: endpoint.sql }, { 'url.username': { action: 'replace', value: endpoint.username }, 'url.password': { action: 'replace', value: endpoint.password } });
			await mutate(ui, root, 'kv', { kind: 'redis', endpoint: endpoint.kv }, { 'url.password': { action: 'replace', value: endpoint.kvPassword } });
			owners[owner]!.rows.push({ root, endpoint, sql });
			const token = { ...await ui.call<any>('db.connections.v2.session.delegate', { repoRoot: root, audience: 'workbench-ui' }), repoRoot: root }, data = await dataSocket(token);
			for (const kv of [false, true]) {
				const frames = await data.call('step.call', { tool: 'insrc_analyze_step', args: { kv }, context: { cwd: root, envRepo: root } }, true);
				const done = frames.find(v => v.stream === 'done'); assert.ok(done, JSON.stringify(frames)); assert.ok(JSON.stringify(done.data).includes(endpoint.marker), JSON.stringify({ owner, rootIndex, kv, frames }).replace(/CM_ROUTE_PRIVATE_[A-Z0-9_]+/g, '[private]'));
				for (const sibling of endpoints.filter(e => e !== endpoint)) assert.equal(JSON.stringify(done.data).includes(sibling.marker), false);
				assert.equal(JSON.stringify(frames.filter(v => v.stream === 'progress' || v.stream === 'error')).includes('CM_ROUTE_PRIVATE_'), false);
			}
			const list = await ui.call<any>('db.connections.v2.list', { repoRoot: root }); assert.ok(JSON.stringify(list).includes('same')); assert.equal(JSON.stringify(list).includes('CM_ROUTE_PRIVATE_'), false);
			owners[owner]!.rows[rootIndex].data = data;
			const probe = await ui.call<any>('db.connections.v2.test', { requestId: randomUUID(), draftRevision: 1, key: sql.key, expectedRevision: sql.revision, publicPatch: {}, credentials: { 'url.password': { action: 'keep' }, 'url.username': { action: 'keep' } } }); assert.equal(probe.status, 'reachable', JSON.stringify(probe));
		}
	}
	// Revision change moves only the authorized entry; sibling owners/roots remain intact.
	const first = owners[0]!, old = first.rows[0], replacement = endpoints[1]!;
	const changed = await mutate(first.ui, roots[0]!, 'same', { endpoint: replacement.sql }, { 'url.username': { action: 'replace', value: replacement.username }, 'url.password': { action: 'replace', value: replacement.password } }, old.sql.revision); assert.notEqual(changed.revision, old.sql.revision);
	assert.equal((await owners[1]!.ui.call<any>('db.connections.v2.mutate', changed.input)).code, 'invalid-input');
	for (const [ownerIndex, owner] of owners.entries()) for (const [rootIndex, row] of owner.rows.entries()) for (const kv of [false, true]) {
		const expected = ownerIndex === 0 && rootIndex === 0 && !kv ? replacement : row.endpoint;
		const frames = await row.data.call('step.call', { tool: 'insrc_analyze_step', args: { kv }, context: { cwd: row.root } }, true);
		assert.ok(JSON.stringify(frames).includes(expected.marker), 'revision/sibling isolation must return the exact positive row');
		for (const sibling of endpoints.filter(e => e !== expected)) assert.equal(JSON.stringify(frames).includes(sibling.marker), false);
	}

	await first.ui.close(); const resumed = await client(); await resumed.call('db.connections.v2.session.resume', { sessionHandle: first.opened.sessionHandle, capability: first.opened.capability, daemonEpoch: first.opened.daemonEpoch });
	const token = { ...await resumed.call<any>('db.connections.v2.session.delegate', { repoRoot: roots[0], audience: 'workbench-ui' }), repoRoot: roots[0] }, data = await dataSocket(token);
	const frames = await data.call('step.call', { tool: 'insrc_analyze_step', args: {}, context: { cwd: roots[1] } }, true); assert.ok(JSON.stringify(frames).includes(replacement.marker));
	// Unverified MCP private fd3 bootstrap is denied before the deterministic runner.
	const restricted = { ...await resumed.call<any>('db.connections.v2.session.delegate', { repoRoot: roots[0], audience: 'mcp-unverified' }), repoRoot: roots[0] }, calls = runnerCalls;
	const child = spawn(process.execPath, ['--import', 'tsx', new URL('../../../../mcp/__tests__/session-pipe-child.ts', import.meta.url).pathname, path, 'all-phases'], { env: { ...process.env, INSRC_MODE: 'probe-worker', NODE_TEST_CONTEXT: undefined }, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
	let output = ''; child.stdout!.on('data', b => { output += b; }); child.stderr!.on('data', b => { output += b; }); (child.stdio[3] as Writable).write(JSON.stringify(restricted) + '\n');
	assert.equal(await new Promise(resolve => child.once('close', resolve)), 0, output); assert.match(output, /all-phases-refused/); assert.equal(runnerCalls, calls); assert.equal(output.includes('CM_ROUTE_PRIVATE_'), false);
	assert.equal((await resumed.call<any>('db.connections.v2.read', { key: { repoRoot: join(roots[0]!, 'nested'), scope: 'temporary', id: 'same' } })).code, 'invalid-input');
	await resumed.call('db.connections.v2.session.end'); now = 90000; assert.equal((await owners[1]!.ui.call<any>('db.connections.v2.list', { repoRoot: roots[0] })).code, 'session-expired'); await runtime.close();
	assert.equal(connectionTestSupervisor.activeCount, 0); assert.ok(children.length >= 4); assert.ok(children.every(c => c.exitCode !== null || c.signalCode !== null)); assert.equal(keychain, 0);
	// Remain alive with the actual server listening: process exit must not substitute for Session disposal.
	const verified = once(process, 'message'); process.send!({ type: 'session-drained', mode }); assert.deepEqual((await verified)[0], { type: 'drain-verified' });
	const savedControl = await client(); assert.ok(Array.isArray(await savedControl.call('db.connections.v2.drivers')));
	assert.deepEqual(await tree(join(directory, 'state')), beforeState); for (let n = 0;n < roots.length;n++) assert.deepEqual(await tree(roots[n]!), beforeRoots[n]);
	getLogger('session-service-proof').info('SAVED_ROUTE_DIAGNOSTIC_CONTROL'); let logs = ''; for (let n = 0;n < 100;n++) { await delay(10); logs = await files(PATHS.logDir); if (logs.includes('SAVED_ROUTE_DIAGNOSTIC_CONTROL')) break; } assert.ok(logs.includes('SAVED_ROUTE_DIAGNOSTIC_CONTROL')); assert.equal(logs.includes('CM_ROUTE_PRIVATE_'), false);
	process.stdout.write('service-isolation-ok:' + mode + '\n');
} finally {
	connectionTestSupervisor.spawnWorker = spawnWorker; for (const socket of streams) socket.destroy(); for (const ui of clients) await ui.close(); await server.close(); await runtime.close(); await closeAll(); await closeLanceConn(); await closeGraphStore(); _setKeystoreForTests(previous);
}
process.exit(0);
