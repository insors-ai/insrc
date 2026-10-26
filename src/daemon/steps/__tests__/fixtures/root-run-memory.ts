import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { PATHS } from '../../../../shared/paths.js';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { RequestLifetime } from '../../../request-context.js';
import { createTemporaryOverlay } from '../../../db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../db/session-entries.js';
import '../../../db/drivers/index.js';
import { SqliteDriver } from '../../../db/drivers/sqlite.js';
import { getFactory } from '../../../db/registry.js';
import { closeAll } from '../../../db/pool-cache.js';
import { _setMeasureDepsForTest, measureDataSource, measureRequestScope, measureResolvedScope } from '../../../../analyze/measure.js';
import type { RegisteredRepo } from '../../../../shared/types.js';
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function fixture() {
	const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-owner-measure-'))), root = join(directory, 'root'); await mkdir(root);
	const original = PATHS.insrc, originalContext = PATHS.analyzeContext, originalOutput = PATHS.analyzeTaskOutput, originalRecord = PATHS.analyzeRunRecord; PATHS.analyzeRunRecord = id => join(directory, 'analyze', id, 'run.json'); PATHS.analyzeContext = id => join(directory, 'analyze', id, 'context'); PATHS.analyzeTaskOutput = (id, task) => join(directory, 'analyze', id, 'tasks', task + '.json'); PATHS.insrc = join(directory, 'insrc'); const overlays = new Map<string, TemporaryConnectionOverlay>(), factories: string[] = [];
	let now = 0;
	const runtime = new ConnectionSessionRpc({ monotonicNow: () => now, enabled: async () => true, isRegistered: async r => r === root, createOverlay: (r, h, c) => { const o = createTemporaryOverlay(r, h, c, { factory: kind => { factories.push(kind); return getFactory(kind); } }); overlays.set(h, o); return o; }, dropOverlay: o => o.close() });
	const requests: RequestLifetime[] = [];
	const request = async (identity: string) => { const lifetime = new RequestLifetime(); requests.push(lifetime); const context = { connectionIdentity: identity, daemonEpoch: 'measure-fixture', signal: lifetime.signal, registerDrain: lifetime.registerDrain, assertRequestActive: lifetime.assertActive }; return { lifetime, context }; };
	const owners = [];
	for (const [index, count] of [1, 3].entries()) {
		const path = join(root, 'owner' + index + '.sqlite'), db = new DatabaseSync(path); for (let n = 0;n < count;n++)db.exec(`CREATE TABLE table_${n}(marker TEXT)`); db.close();
		const current = await request(randomUUID()), opened = await runtime.call('db.connections.v2.session.open', { repoRoot: root }, current.context) as { sessionHandle: string }; assert.ok(opened.sessionHandle);
		const overlay = overlays.get(opened.sessionHandle)!; overlay.commit(await overlay.prepare({ key: { repoRoot: root, scope: 'temporary', id: 'same' }, mode: 'create', publicPatch: { kind: 'sqlite', path } }));
		owners.push({ ...current, overlay, execution: await runtime.executionFor(current.context, root), count });
	}
	_setMeasureDepsForTest({ scope: { listRepos: async () => [{ path: root, status: 'ready' } as RegisteredRepo], findEntitiesByFile: async () => [], listEntitiesForRepo: async () => [], loadConnections: async () => { throw new Error('cross-root saved enumeration forbidden'); } } });
	return { root, runtime, owners, factories, advance(ms: number) { now += ms; }, async fresh(owner: typeof owners[number]) { const current = await request(owner.context.connectionIdentity); return { ...current, execution: await runtime.executionFor(current.context, root) }; }, async close() { for (const lifetime of requests) { lifetime.abort(); lifetime.complete(); } await runtime.close(); for (const lifetime of requests) await lifetime.drained; await closeAll(); _setMeasureDepsForTest(undefined); PATHS.insrc = original; PATHS.analyzeContext = originalContext; PATHS.analyzeTaskOutput = originalOutput; PATHS.analyzeRunRecord = originalRecord; await rm(directory, { recursive: true, force: true }); } };
}


import { runAnalyze, _setClassifyForTest, _setRunShaperForTest, _setOrchestratorStagesForTest, completeRun } from '../../../../analyze/orchestrator/driver.js';
import { liveRunCount, isRunLive, trackRunLive } from '../../../../analyze/orchestrator/live-runs.js';
import { createRunRecordPort, assertRunRecordPort, readRunRecord, writeRunRecord, abandonRunRecord, purgeRun } from '../../../../analyze/orchestrator/persistence.js';
import type { RunRecord, AnalyzeRunEvent } from '../../../../analyze/orchestrator/types.js';
import type { RunShaper, AnalyzeContextBundle } from '../../../../analyze/context/types.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlanTreeNode } from '../../../../analyze/planner/recursive.js';
import type { ExecutorResult } from '../../../../analyze/executor/types.js';
import type { ConnectionExecutionContext } from '../../../../shared/step-context.js';
import { beginSessionReuse } from '../../../../analyze/session-reuse.js';
import { readFile } from 'node:fs/promises';
const tree: PlanTreeNode = { plan: { planId: 'private', goal: 'test', target: 'generic', scope: 'S', reasoning: 'test', tasks: [] }, children: new Map(), childErrors: new Map() };
const intent = (root: string): ClassifiedIntent => ({ target: 'generic', scope: 'S', focused: true, focus: 'SOURCE_CANARY', scopeRef: { kind: 'connection', value: 'same' }, reasoning: 'test' });
function reset() { _setClassifyForTest(undefined); _setRunShaperForTest(undefined); _setOrchestratorStagesForTest(); }

test('root lifecycle uses owner-private records through success, failure and outer repair', async () => {
	const f = await fixture(), [a, b] = f.owners as [typeof f.owners[number], typeof f.owners[number]];
	const path = PATHS.analyzeRunRecord('same-run'), saved: RunRecord = { runId: 'same-run', createdAt: 'saved', updatedAt: 'saved', userPrompt: 'SAVED_CANARY', initialScopeRef: { kind: 'repo', value: f.root }, stage: 'done', status: 'ok', intent: intent(f.root), finalReport: { summary: 'SAVED_CANARY' } };
	writeRunRecord(saved); const before = await readFile(path, 'utf8'), original = PATHS.analyzeRunRecord; let paths = 0, reads = 0, expected: ConnectionExecutionContext | undefined, mode = 'success', calls = 0;
	PATHS.analyzeRunRecord = () => { paths++; throw Error('DURABLE_RUN_RECORD'); };
	const poison = () => Object.defineProperty(new Error(), 'message', { get() { reads++; throw Error('SOURCE_ERROR_CANARY'); } });
	const execute = (execution: ConnectionExecutionContext) => { expected = execution; return runAnalyze({ runId: 'same-run', userPrompt: 'SOURCE_CANARY', scopeRef: { kind: 'connection', value: 'same' }, connectionExecution: execution }, { onEvent: event => { assert.ok(event); } }); };
	_setClassifyForTest(async args => { assert.equal(args.connectionExecution, expected); if (mode === 'classify') throw poison(); return intent(f.root); });
	_setRunShaperForTest(() => ({ buildRunBundle: async (_input: unknown, opts: { connectionExecution?: ConnectionExecutionContext }) => { assert.equal(opts.connectionExecution, expected); if (mode === 'context') throw poison(); return { summary: 'PRIVATE' } as AnalyzeContextBundle; } } as RunShaper));
	const setup = () => _setOrchestratorStagesForTest({
		measure: async (...args) => { assert.equal(args[3]?.connectionExecution, expected); if (mode === 'measure') throw poison(); return measureRequestScope(...args); },
		planner: async args => { assert.equal(args.opts.connectionExecution, expected); if (mode === 'planner') throw poison(); return tree; },
		executor: async args => { calls++; assert.equal(args.connectionExecution, expected); if (mode === 'repair') throw poison(); return { root: { perTask: new Map(), tasksCompleted: 1, tasksFailed: [], ...(mode === 'aggregate' ? {} : { finalReport: { summary: expected!.connectionAccess.sessionHandle } }) }, children: new Map() }; },
	}); setup();
	try {
		const first = await execute(a.execution), second = await execute(b.execution), again = await execute(a.execution); assert.equal(first.ok, true); assert.equal(second.ok, true); if (first.ok && again.ok) assert.deepEqual(first.finalReport, again.finalReport); if (first.ok && second.ok) assert.notDeepEqual(first.finalReport, second.finalReport); assert.equal(calls, 3);
		for (mode of ['classify', 'measure', 'context', 'planner', 'aggregate', 'repair']) { const result = await execute(a.execution); assert.equal(result.ok, false, mode); assert.equal(paths, 0); assert.equal(reads, 0); }
		await beginSessionReuse(a.execution); const port = createRunRecordPort('same-run', a.execution); const privateRecord = { ...saved }; port.write(privateRecord); assert.equal(port.read(), privateRecord);
		assert.throws(() => writeRunRecord(privateRecord), { code: 'session-expired' });
		const otherPort = createRunRecordPort('same-run', b.execution); assert.throws(() => otherPort.write(privateRecord), { code: 'session-expired' }); otherPort.close(); assert.throws(() => assertRunRecordPort(port, b.execution), { code: 'session-expired' }); port.close(); assert.throws(() => port.read(), { code: 'session-expired' });
		const poisoned = new Proxy({}, { get() { reads++; throw Error('SOURCE_READ'); } }) as RunRecord;
		assert.throws(() => writeRunRecord(poisoned, a.execution), { code: 'unsupported-temporary' }); assert.throws(() => readRunRecord('same-run', a.execution), { code: 'unsupported-temporary' }); assert.throws(() => abandonRunRecord(poisoned, a.execution), { code: 'unsupported-temporary' }); assert.throws(() => purgeRun('same-run', {}, a.execution), { code: 'unsupported-temporary' });
		assert.throws(() => completeRun({ connectionExecution: a.execution, record: poisoned, intent: intent(f.root), tree, executed: {} as ExecutorResult, contextReport: undefined, start: 0 }), { code: 'session-expired' });
		assert.equal(paths, 0); assert.equal(reads, 0); assert.equal(liveRunCount('same-run'), 0); assert.equal(liveRunCount('same-run', a.execution), 0);
	} finally { reset(); PATHS.analyzeRunRecord = original; assert.equal(await readFile(path, 'utf8'), before); await f.close(); }
});

test('same run id live accounting and expired resume remain owner/root scoped', async () => {
	const f = await fixture(), [a, b] = f.owners as [typeof f.owners[number], typeof f.owners[number]], enteredA = deferred(), enteredB = deferred(), heldA = deferred(), heldB = deferred(); let sourceReads = 0;
	const runs: Promise<unknown>[] = [];
	_setClassifyForTest(async args => { const owner = args.connectionExecution === a.execution ? a : b; (owner === a ? enteredA : enteredB).resolve(); await (owner === a ? heldA : heldB).promise; return owner === a ? new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; sourceReads++; throw Error('EXPIRED_SOURCE'); } }) as ClassifiedIntent : intent(f.root); });
	_setRunShaperForTest(() => ({ buildRunBundle: async () => { throw Error('STOP'); } } as unknown as RunShaper));
	try {
		const first = runAnalyze({ runId: 'shared', userPrompt: 'private', scopeRef: { kind: 'connection', value: 'same' }, connectionExecution: a.execution }); runs.push(first); await enteredA.promise;
		const second = runAnalyze({ runId: 'shared', userPrompt: 'private', scopeRef: { kind: 'connection', value: 'same' }, connectionExecution: b.execution }); runs.push(second); await enteredB.promise;
		assert.equal(liveRunCount('shared', a.execution), 1); assert.equal(liveRunCount('shared', b.execution), 1); assert.equal(liveRunCount('shared'), 0); assert.equal(isRunLive('shared', b.execution), true);
		const port = createRunRecordPort('shared', a.execution); port.write({ runId: 'shared' } as RunRecord);
		const rev = a.overlay.read('same').revision; a.overlay.commit(await a.overlay.prepare({ key: { repoRoot: f.root, scope: 'temporary', id: 'same' }, mode: 'update', expectedRevision: rev, publicPatch: { label: 'changed' } })); assert.throws(() => port.read(), { code: 'session-expired' });
		heldA.resolve(); assert.equal((await first).ok, false); assert.equal(sourceReads, 0); assert.equal(liveRunCount('shared', b.execution), 1);
		f.advance(90_001); heldB.resolve(); assert.equal((await second).ok, false); assert.equal(sourceReads, 0); assert.equal(liveRunCount('shared'), 0);
	} finally { heldA.resolve(); heldB.resolve(); await Promise.allSettled(runs); reset(); await f.close(); }
});
