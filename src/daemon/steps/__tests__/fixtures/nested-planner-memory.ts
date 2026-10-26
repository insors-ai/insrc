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
	const original = PATHS.insrc, originalContext = PATHS.analyzeContext, originalOutput = PATHS.analyzeTaskOutput, originalRecord = PATHS.analyzeRunRecord, originalRun = PATHS.analyzeRun; PATHS.analyzeRun = id => join(directory, 'analyze', id); PATHS.analyzeRunRecord = id => join(directory, 'analyze', id, 'run.json'); PATHS.analyzeContext = id => join(directory, 'analyze', id, 'context'); PATHS.analyzeTaskOutput = (id, task) => join(directory, 'analyze', id, 'tasks', task + '.json'); PATHS.insrc = join(directory, 'insrc'); const overlays = new Map<string, TemporaryConnectionOverlay>(), factories: string[] = [];
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
	return { root, runtime, owners, factories, advance(ms: number) { now += ms; }, async fresh(owner: typeof owners[number]) { const current = await request(owner.context.connectionIdentity); return { ...current, execution: await runtime.executionFor(current.context, root) }; }, async close() { for (const lifetime of requests) { lifetime.abort(); lifetime.complete(); } await runtime.close(); for (const lifetime of requests) await lifetime.drained; await closeAll(); _setMeasureDepsForTest(undefined); PATHS.insrc = original; PATHS.analyzeContext = originalContext; PATHS.analyzeTaskOutput = originalOutput; PATHS.analyzeRunRecord = originalRecord; PATHS.analyzeRun = originalRun; await rm(directory, { recursive: true, force: true }); } };
}



import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { runRecursivePlanner, _setRecursivePlannerForTest } from '../../../../analyze/planner/recursive.js';
import { runPlanner } from '../../../../analyze/planner/driver.js';
import { writeAttempt, writeFeedback, writePlanFinal, readPlanFinal, purgePlan, planFinalPathFor } from '../../../../analyze/planner/cache.js';
import type { PersistArgs } from '../../../../analyze/planner/cache.js';
import type { PlanBuilderInput, PlanTask, PlannedTask } from '../../../../analyze/planner/types.js';
import type { PlanValidationFailure } from '../../../../analyze/planner/validate.js';
import type { AnalyzeContextBundle } from '../../../../analyze/context/types.js';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import { runExecutor } from '../../../../analyze/executor/walker.js';
import { registerTemplateRuntime, _resetRuntimeRegistryForTests } from '../../../../analyze/executor/registry.js';
import { runDbTablesList } from '../../../../analyze/explore/db-tables-list.js';
import { permissiveIgnoreFilter } from '../../../../analyze/context/repo-ignore-filter.js';
import { buildCompleteness } from '../../../../analyze/completeness.js';
import { beginSessionReuse, rememberSessionContinuation, assertSessionContinuation, assertSessionContinuationNow } from '../../../../analyze/session-reuse.js';
import { savedAnalysisExecution } from '../../../../analyze/connection-access.js';
const intent: ClassifiedIntent = { target: 'generic', scope: 'L', focused: true, focus: 'private', scopeRef: { kind: 'connection', value: 'same' }, reasoning: 'test' };
const aggregate: PlannedTask = { taskId: 'agg', template: 'fixture.aggregate', kind: 'leaf', params: {}, produces: ['report'], consumes: ['report'], rationale: 'aggregate' };
function plan(depth: number): PlanTask {
	const first: PlannedTask = depth < 2 ? { taskId: 'child', template: 'generic.subrun.deep-dive', kind: 'planner', params: { childIntent: intent }, produces: ['report'], rationale: 'child' } : { taskId: 'list', template: 'fixture.list', kind: 'leaf', params: {}, produces: ['report'], rationale: 'list' };
	return { planId: 'depth' + depth, goal: 'private', target: 'generic', scope: 'L', reasoning: 'test', tasks: [first, aggregate] };
}
const input = (): PlanBuilderInput => ({ intent, contextBundle: { summary: 'PRIVATE_SOURCE' } as AnalyzeContextBundle, catalog: [] });

test('actual nested walk, child measurement and task aggregation avoid persistent planner stores', async () => {
	const f = await fixture(), [a, b] = f.owners as [typeof f.owners[number], typeof f.owners[number]];
	const persist = { runId: 'same-run' }, saved = plan(0); writePlanFinal(persist, saved); const savedPath = planFinalPathFor(persist), before = fs.readFileSync(savedPath, 'utf8'); let gets = 0, puts = 0, expected = a.execution, calls = 0;
	const originalRead = fs.readFileSync, originalWrite = fs.writeFileSync;
	const isPlan = (path: unknown) => typeof path === 'string' && (/[/\\]plan\.json$/.test(path) || path.includes('plan.attempts'));
	mock.method(fs, 'readFileSync', function(...args: Parameters<typeof originalRead>) { if (isPlan(args[0])) gets++; return originalRead.apply(fs, args); });
	mock.method(fs, 'writeFileSync', function(...args: Parameters<typeof originalWrite>) { if (isPlan(args[0])) puts++; return originalWrite.apply(fs, args); }); syncBuiltinESMExports();
	_setRecursivePlannerForTest(async args => { calls++; assert.equal(args.opts.connectionExecution, expected); assert.equal(args.opts.signal, expected.lifetime.signal); assert.ok(Object.isFrozen(args.opts)); return plan(args.input.currentDepth ?? 0); });
	registerTemplateRuntime({ templateId: 'fixture.list', execute: async args => { assert.equal(args.connectionExecution, expected); const listed = await runDbTablesList({ id: 'tables', type: 'db.tables.list', purpose: 'private', params: { connectionId: 'same' } }, { connectionExecution: expected, runId: args.runId, repoPath: f.root, closureRepos: [f.root], readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(f.root) }); return { outputs: new Map([['report', { summary: String(listed.tables.length) }]]), completeness: buildCompleteness({ returned: listed.tables.length, basis: 'data-source' }) }; } });
	registerTemplateRuntime({ templateId: 'fixture.aggregate', execute: async args => { assert.equal(args.connectionExecution, expected); const values = args.upstreamOutputs.get('report') ?? []; return { outputs: new Map([['report', values[0]!.value]]), completeness: buildCompleteness({ returned: values.length, basis: 'model-directed' }) }; } });
	try {
		for (const owner of [a, b, a]) {
			expected = owner.execution; const tree = await runRecursivePlanner({ input: input(), opts: { runId: 'same-run', connectionExecution: expected } });
			const child = tree.children.get('child')!, grandchild = child.children.get('child')!; assert.equal(child.measure!.items, owner.count); assert.equal(grandchild.measure!.items, owner.count);
			await assertSessionContinuation(tree, expected); const result = await runExecutor({ tree, intent, runId: 'same-run', connectionExecution: expected }); assert.deepEqual(result.root.finalReport, { summary: String(owner.count) });
			await assert.rejects(assertSessionContinuation(tree, owner === a ? b.execution : a.execution), { code: 'session-expired' }); assert.throws(() => assertSessionContinuationNow(tree, savedAnalysisExecution(f.root)), { code: 'session-expired' });
			const fresh = await f.fresh(owner); await beginSessionReuse(fresh.execution); await assertSessionContinuation(tree, fresh.execution);
		}
		assert.equal(calls, 9); assert.equal(gets, 0); assert.equal(puts, 0);
		let reads = 0; const poison = new Proxy({}, { get() { reads++; throw Error('PERSISTENT_SOURCE_READ'); } });
		assert.equal(readPlanFinal(poison as PersistArgs, a.execution), null); writeAttempt(poison as PersistArgs, 1, poison as PlanTask, a.execution); writeFeedback(poison as PersistArgs, 1, poison as PlanValidationFailure, a.execution); writePlanFinal(poison as PersistArgs, poison as PlanTask, a.execution); purgePlan(poison as PersistArgs, a.execution); assert.equal(reads, 0);
		const tagged = await rememberSessionContinuation(plan(2), a.execution); assert.throws(() => writePlanFinal(persist, tagged), { code: 'session-expired' }); await assert.rejects(rememberSessionContinuation(tagged, b.execution), { code: 'session-expired' });
		assert.equal(gets, 0); assert.equal(puts, 0);
	} finally { _setRecursivePlannerForTest(); _resetRuntimeRegistryForTests(); mock.restoreAll(); syncBuiltinESMExports(); assert.equal(fs.readFileSync(savedPath, 'utf8'), before); await f.close(); }
});

test('owner loss and unsupported provider reject before child plan/input payload reuse', async () => {
	const f = await fixture(), a = f.owners[0]!, entered = deferred(), held = deferred(); let reads = 0, calls = 0;
	const poison = new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; reads++; throw Error('PRIVATE_CHILD_PAYLOAD'); } });
	try {
		await beginSessionReuse(a.execution);
		await assert.rejects(runPlanner({ opts: { runId: 'private', connectionExecution: a.execution }, get input() { reads++; throw Error('PRIVATE_INPUT'); }, get provider() { reads++; throw Error('PRIVATE_PROVIDER'); } }), { code: 'unsupported-temporary' }); assert.equal(reads, 0);
		const taggedInput = await rememberSessionContinuation(poison as PlanBuilderInput, a.execution); await assert.rejects(runPlanner({ input: taggedInput, opts: { runId: 'private' } }), { code: 'session-expired' }); assert.equal(reads, 0);
		_setRecursivePlannerForTest(async args => { calls++; if ((args.input.currentDepth ?? 0) === 1) { entered.resolve(); await held.promise; return poison as PlanTask; } return plan(0); });
		const opts = { runId: 'held', connectionExecution: a.execution }; const work = runRecursivePlanner({ input: input(), opts }); await entered.promise;
		// A later mutation of the supplied options cannot replace the captured carrier.
		opts.connectionExecution = f.owners[1]!.execution;
		const revision = a.overlay.read('same').revision; a.overlay.commit(await a.overlay.prepare({ key: { repoRoot: f.root, scope: 'temporary', id: 'same' }, mode: 'update', expectedRevision: revision, publicPatch: { label: 'changed' } })); held.resolve(); await assert.rejects(work, { code: 'session-expired' }); assert.equal(reads, 0); assert.equal(calls, 2);
		const fresh = await f.fresh(a); await beginSessionReuse(fresh.execution); await assert.rejects(rememberSessionContinuation(taggedInput, fresh.execution), { code: 'session-expired' }); assert.equal(reads, 0);
	} finally { held.resolve(); _setRecursivePlannerForTest(); await f.close(); }
});
