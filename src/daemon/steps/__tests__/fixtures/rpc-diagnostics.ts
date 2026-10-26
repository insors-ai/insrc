/** Normal trace sink, real Session owner + SQLite, source and compiled modules. */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { mkdir, writeFile, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import type { PlanTreeNode } from '../../../../analyze/planner/recursive.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
const directory = await realpath(process.argv[2]!), mode = process.argv[3] ?? 'source';
const base = new URL(mode === 'compiled' ? '../../../../../out/' : '../../../../', import.meta.url);
const load = (path: string) => import(new URL(path, base).href);
const { PATHS } = await load('shared/paths.js'); await mkdir(directory, { recursive: true }); PATHS.insrc = directory; PATHS.config = join(directory, 'config.json'); await writeFile(PATHS.config, '{"logLevel":"trace"}'); PATHS.logDir = join(directory, 'logs'); PATHS.daemonLog = join(PATHS.logDir, 'daemon.log'); PATHS.agentLog = join(PATHS.logDir, 'agent.log'); PATHS.analyzeTaskOutput = (r: string, t: string) => join(directory, 'analyze', r, t + '.json');
const { registerDbTools } = await load('daemon/tools/builtins/db/index.js'); const { executeTool } = await load('daemon/tools/executor.js'); const { getTool } = await load('daemon/tools/registry.js');
const { analysisAdmissionFailure } = await load('daemon/steps/analysis-admission.js'); const { buildHandlerRuntime } = await load('daemon/handler-runtime.js'); const rpc = await load('daemon/analyze-rpc.js'); const { directDispatch, IpcServer, failureMessage } = await load('daemon/server.js'); const { ConnectionExecutionError, connectionExecutionErrorCode } = await load('shared/step-context.js');
const { ConnectionSessionRpc } = await load('daemon/connection-session-rpc.js'); const { RequestLifetime } = await load('daemon/request-context.js'); const { createTemporaryOverlay } = await load('daemon/db/session-entries.js'); await load('daemon/db/drivers/index.js');
const { closeAll } = await load('daemon/db/pool-cache.js'); const { SqliteDriver } = await load('daemon/db/drivers/sqlite.js'); const { getFactory } = await load('daemon/db/registry.js');
const { dataSchemaTableRuntime } = await load('analyze/runtimes/data/schema-table.js'); const { dataDiscoveryObjectsRuntime } = await load('analyze/runtimes/data/discovery-objects.js');
const { resolveScope } = await load('analyze/context/scope.js'); const { resolveTaskScope } = await load('analyze/runtimes/shared/task-scope.js');
const { runExecutor } = await load('analyze/executor/walker.js'); const { registerTemplateRuntime, _resetRuntimeRegistryForTests } = await load('analyze/executor/registry.js');
const { executePlan, _overrideRunnerForTest, _getRunnersForTest } = await load('analyze/explore/executor.js');
const { runDbTableDescribe } = await load('analyze/explore/db-table-describe.js'); const { runDbTablesList } = await load('analyze/explore/db-tables-list.js');
const { measureDataSource, _setMeasureDepsForTest } = await load('analyze/measure.js'); const { captureAnalysisDiagnostics } = await load('analyze/connection-access.js'); const { runWithConnectionExecution } = await load('shared/step-context.js'); const { getLogger } = await load('shared/logger.js');
const { setGraphStorePath, closeGraphStore } = await load('db/graph/store.js'); const { addRepo } = await load('db/repos.js');
const root = join(directory, 'root'); await mkdir(root); setGraphStorePath(join(directory, 'graph')); await addRepo(null, { path: root, name: 'fixture', addedAt: 'now', status: 'ready' });
const sql = new DatabaseSync(join(root, 'source.sqlite')); sql.exec('CREATE TABLE CM_PRIVATE_TABLE(CM_PRIVATE_COLUMN TEXT)'); sql.close();
let now = 0, overlay: any;
const runtime = new ConnectionSessionRpc({ monotonicNow: () => now, enabled: async () => true, isRegistered: async (r: string) => r === root, createOverlay: (r: string, h: string, c: any) => { overlay = createTemporaryOverlay(r, h, c, { factory: (kind: string) => getFactory(kind) }); return overlay; }, dropOverlay: (o: any) => o.close() });
const lifetime = new RequestLifetime(), context = { connectionIdentity: 'diagnostic-owner', daemonEpoch: 'diagnostic-fixture', signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive };
await runtime.call('db.connections.v2.session.open', { repoRoot: root }, context); overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'CM_PRIVATE_ENDPOINT' }, mode: 'create', publicPatch: { kind: 'sqlite', path: join(root, 'source.sqlite') } }));
const execution = await runtime.executionFor(context, root);
const deps = { sessionId: 'fixture', repoPath: root, requestId: 1, send() { }, connectionExecution: execution };
registerDbTools();
let rawReads = 0, inputReads = 0;
const raw = new Proxy({}, { get() { rawReads++; throw Error('CM_PRIVATE_RAW_GETTER'); }, getPrototypeOf() { rawReads++; throw Error('CM_PRIVATE_RAW_GETTER'); } });
const poison = new Proxy({}, { get() { inputReads++; throw Error('CM_PRIVATE_INPUT_GETTER'); } });
const { createConnection } = await import('node:net'); const { once } = await import('node:events');
let actualLifetime: any, release!: () => void, drainSettled = false;
const held = new Promise<void>(r => { release = r; });
const dispatch = directDispatch({
	'fixture.raw': async () => { throw raw; },
	'fixture.typed': async () => { const err = new ConnectionExecutionError('upgrade-required'); for (const key of ['message', 'code', 'name']) Object.defineProperty(err, key, { get() { rawReads++; throw Error('CM_PRIVATE_TYPED_GETTER'); } }); throw err; },
	'fixture.failure': async () => Object.defineProperty({ ok: false }, 'error', { get() { rawReads++; throw Error('CM_PRIVATE_ENVELOPE_GETTER'); } }),
	'fixture.saved': async () => { getLogger('analyze-rpc').info({ marker: 'SAVED_CONCURRENT_RPC_MARKER' }, 'Saved control'); return 'SAVED_RPC_OUTPUT'; },
}, {
	'fixture.progress': async (_p: unknown, send: any) => { const emit = rpc.makeProgressEmitter(send, 'CM_PRIVATE_RUN', execution); emit(poison); send({ id: 0, stream: 'analyze.result', data: Object.defineProperty({ ok: false }, 'error', { get() { rawReads++; throw Error('CM_PRIVATE_FINAL_GETTER'); } }) }); send({ id: 0, stream: 'done', data: { private: 'CM_PRIVATE_DONE' } }); },
	'fixture.error': async (_p: unknown, send: any) => { send({ id: 0, stream: 'progress', data: poison }); throw raw; },
	'fixture.delivery': async (_p: unknown, send: any, _signal: AbortSignal, context: any) => { context.registerDrain(held.then(() => { drainSettled = true; })); send({ id: 0, stream: 'progress', data: poison }); await held; },
});
const server = new IpcServer((request: any, deliver: any) => { actualLifetime = request.lifetime; return dispatch({ ...request, trustedContext: { ...request.trustedContext, connectionExecution: execution } }, deliver); }, Date.now, join(directory, 'test.sock'));
await server.listen(); const socket = createConnection(join(directory, 'test.sock')); await once(socket, 'connect'); let buffer = '', seq = 0;
const waiting = new Map<number, { frames: any[]; resolve: (v: any[]) => void }>();
socket.on('data', chunk => { buffer += chunk.toString(); for (;;) { const end = buffer.indexOf('\n'); if (end < 0) break; const frame = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); const row = waiting.get(frame.id); if (!row) continue; row.frames.push(frame); if (!frame.stream || frame.stream === 'done' || frame.stream === 'error') { waiting.delete(frame.id); row.resolve(row.frames); } } });
function request(method: string, stream = false): Promise<any[]> { return new Promise(resolve => { const id = ++seq; waiting.set(id, { frames: [], resolve }); socket.write(JSON.stringify({ id, method, params: { query: 'CM_PRIVATE_QUERY' }, stream }) + '\n'); }); }
async function bytes(root: string): Promise<Buffer[]> { let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; } const out: Buffer[] = []; for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) out.push(...await bytes(path)); else out.push(await readFile(path)); } return out; }
try {
	assert.equal(analysisAdmissionFailure(raw).error.code, 'session-expired');
	const sample = await executeTool('db_sql_sample', { connectionId: 'CM_PRIVATE_ENDPOINT', target: 'CM_PRIVATE_TABLE', limit: 1 }, deps); assert.equal(sample.success, true);
	const missing = await executeTool('db_sql_describe', { connectionId: 'CM_PRIVATE_ENDPOINT', target: 'CM_PRIVATE_MISSING' }, deps); assert.equal(missing.success, false); assert.equal(JSON.stringify(missing).includes('CM_PRIVATE_'), false);
	const tool = getTool('db_sql_sample'); const override = mock.method(tool, 'execute', async () => { throw raw; });
	const rejected = await executeTool(tool.id, {}, deps); assert.equal(rejected.success, false); override.mock.restore();
	const returned = mock.method(tool, 'execute', async () => Object.defineProperty({ success: false }, 'error', { get() { rawReads++; throw Error('CM_PRIVATE_TOOL_GETTER'); } })); const failure = await executeTool(tool.id, {}, deps); assert.equal(failure.success, false); assert.equal(JSON.stringify(failure).includes('CM_PRIVATE_'), false); returned.mock.restore();
	const typed = mock.method(tool, 'execute', async () => { throw new ConnectionExecutionError('upgrade-required'); }); await assert.rejects(executeTool(tool.id, {}, deps), (error: unknown) => connectionExecutionErrorCode(error) === 'upgrade-required'); typed.mock.restore();
	await assert.rejects(executeTool('CM_PRIVATE_UNKNOWN_TOOL', poison, deps), { code: 'unsupported-temporary' });
	for (const name of ['buildClassification', 'buildRun', 'buildTask', 'classify', 'plan', 'runStatus', 'runPurge']) await assert.rejects(rpc[name](poison, execution), { code: 'unsupported-temporary' });
	await assert.rejects(rpc.runStart(poison, () => { throw raw; }, lifetime.signal, execution), { code: 'unsupported-temporary' });
	const handlers = buildHandlerRuntime({ db: null, configStore: poison, queue: poison, indexer: poison, startedAt: 0, shutdown() { throw Error('unexpected shutdown'); }, attachedClients: () => [], understandingService: () => undefined });
	const trusted = { connectionIdentity: 'fixture', daemonEpoch: 'fixture', connectionExecution: execution };
	for (const method of ['analyze.context.buildClassification', 'analyze.context.buildRun', 'analyze.context.buildTask', 'analyze.classify', 'analyze.plan.build', 'analyze.run.status', 'analyze.run.purge']) {
		await assert.rejects(handlers.rpcHandlers[method](poison, trusted), { code: 'unsupported-temporary' });
		await assert.rejects(handlers.rpcHandlers[method](poison, { ...trusted, connectionExecution: undefined, connectionSession: {} }), { code: 'session-expired' });
	}
	await assert.rejects(handlers.streamHandlers['analyze.run.start'](poison, () => { throw raw; }, lifetime.signal, trusted), { code: 'unsupported-temporary' });

	const frames = [...await request('fixture.raw'), ...await request('fixture.typed'), ...await request('fixture.failure'), ...await request('fixture.progress', true), ...await request('fixture.error', true)]; assert.equal(JSON.stringify(frames).includes('CM_PRIVATE_'), false); assert.ok(JSON.stringify(frames).includes('upgrade-required'));
	assert.equal(failureMessage(raw, 'CM_PRIVATE_METHOD', { connectionIdentity: 'fixture', daemonEpoch: 'fixture', connectionExecution: execution }), 'unsupported-temporary');
	rpc.makeProgressEmitter(() => { throw raw; }, 'CM_PRIVATE_RUN', execution)(poison);
	const deliveryLifetime = new RequestLifetime(); let deliveries = 0;
	dispatch({ kind: 'request', requestId: 'held', method: 'fixture.delivery', params: {}, stream: true, lifetime: deliveryLifetime, trustedContext: { connectionIdentity: 'fixture', daemonEpoch: 'fixture', connectionExecution: execution } }, () => { deliveries++; throw raw; });
	await deliveryLifetime.completed; assert.equal(deliveryLifetime.signal.aborted, true); let drained = false; void deliveryLifetime.drained.then(() => { drained = true; }); await delay(20); assert.equal(drained, false); assert.equal(drainSettled, false); assert.equal(deliveries, 1);
	getLogger('tools-executor').info({ marker: 'SAVED_CONCURRENT_RPC_MARKER' }, 'Saved control while owned cleanup is held'); release(); await deliveryLifetime.drained; assert.equal(drainSettled, true);
	// Saved diagnostic and wire controls use the original formatter/error detail.
	const savedTool = mock.method(tool, 'execute', async () => { throw Error('SAVED_TOOL_FAILURE_DETAIL'); }); assert.equal((await executeTool(tool.id, {}, { ...deps, connectionExecution: undefined })).error, 'SAVED_TOOL_FAILURE_DETAIL'); savedTool.mock.restore(); assert.equal(failureMessage(Error('SAVED_RPC_FAILURE_DETAIL'), 'saved'), 'SAVED_RPC_FAILURE_DETAIL');
	let logs = ''; for (let n = 0;n < 100;n++) { await delay(20); logs = Buffer.concat(await bytes(PATHS.logDir)).toString(); if (logs.includes('SAVED_TOOL_FAILURE_DETAIL')) break; } assert.ok(logs.includes('SAVED_TOOL_FAILURE_DETAIL')); assert.ok(logs.includes('SAVED_CONCURRENT_RPC_MARKER')); assert.equal(logs.includes('CM_PRIVATE_'), false); assert.equal(rawReads, 0); assert.equal(inputReads, 0);
	process.stdout.write(JSON.stringify({ completed: true, mode, actualDaemonSink: true, actualSocket: true, rawReads, inputReads, deliveryDrainRetained: true }) + '\n');
} finally { release(); socket.destroy(); await server.close(); lifetime.abort(); lifetime.complete(); await runtime.close(); await lifetime.drained; await closeAll(); await closeGraphStore(); }
process.exit(0);
