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




import { getGraphStore, setGraphStorePath, closeGraphStore, withWriteTxn, withWriteTxnSync } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { upsertEntities, getEntity } from '../../../../db/entities.js';
import { saveTurn, getTurnsForSession } from '../../../../db/conversations.js';
import { getLanceConn, setLanceConnPath, closeLanceConn } from '../../../../db/lance/conn.js';
import { upsertArtifactVec, getArtifactById } from '../../../../db/lance/artifact-vec.js';
import { loadLocalProviderConfig } from '../../../../config/local.js';
import { ConfigStore } from '../../../../config/store.js';
import { recordFeedback } from '../../../../config/feedback.js';
import { writeAtomic, appendRunLog, appendProgressLog } from '../../../../workflow/storage.js';
import { writeArtifactJson } from '../../../../workflow/artifacts/provenance/writer.js';
import { LocalStepStateStore, HubStepStateStore } from '../../../threads/step-state.js';
import { writeTaskOutput, readTaskOutput, purgeTaskOutput, purgeAllTaskOutputs } from '../../../../analyze/executor/cache.js';
import { registerTemplateRuntime, _resetRuntimeRegistryForTests } from '../../../../analyze/executor/registry.js';
import { runExecutor } from '../../../../analyze/executor/walker.js';
import { dataSchemaTableRuntime } from '../../../../analyze/runtimes/data/schema-table.js';
import { saveToolResults, toolLoopExhausted } from '../../../../analyze/context/driver.js';
import { completeRun } from '../../../../analyze/orchestrator/driver.js';
import { createRunRecordPort } from '../../../../analyze/orchestrator/persistence.js';
import { encodeState, decodeState } from '../../analyze-step/state.js';
import { saveConnections } from '../../../db/config.js';
import { runWithConnectionExecution } from '../../../../shared/step-context.js';
import { buildCompleteness } from '../../../../analyze/completeness.js';
import { readdir, readFile, mkdir as createDirectory } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ClassifiedIntent } from '../../../../shared/analyze-types.js';
import type { PlanTreeNode } from '../../../../analyze/planner/recursive.js';
import type { RunRecord } from '../../../../analyze/orchestrator/types.js';
import type { StepStatePayload } from '../../analyze-step/state.js';

async function filesUnder(root: string): Promise<Buffer[]> {
	const result: Buffer[] = []; let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result; throw error; }
	for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) result.push(...await filesUnder(path)); else if (entry.isFile()) result.push(await readFile(path)); } return result;
}
function tree(template: string, connectionId = 'same'): PlanTreeNode { return { plan: { planId: 'private', goal: 'data', target: 'data', scope: 'S', reasoning: 'private data', tasks: [{ taskId: 't01', template, kind: 'leaf', params: { connectionId, table: 'table_0', sessionMemory: 'read-only' }, produces: ['table-schema'], rationale: 'Read schema' }, { taskId: 't02', template: 'fixture.failure', kind: 'leaf', params: {}, produces: ['broken'], rationale: 'Exercise failed task' }, { taskId: 't03', template: 'fixture.report', kind: 'leaf', params: {}, consumes: ['table-schema', 'broken'], produces: ['report'], rationale: 'Aggregate source' }] }, children: new Map(), childErrors: new Map() }; }

test('task report history checkpoint trace and warm native sinks remain memory-only', async () => {
	const f = await fixture(), a = f.owners[0]!, b = f.owners[1]!, output = join(f.root, 'persisted'); await createDirectory(output);
	setGraphStorePath(join(output, 'graph.lmdb')); setLanceConnPath(join(output, 'lance'));
	const source = 'TEMP_SOURCE_' + randomUUID().replaceAll('-', ''), saved = 'SAVED_PERSISTENCE_CONTROL';
	const db = new DatabaseSync(join(f.root, 'owner0.sqlite')); db.exec('ALTER TABLE table_0 ADD COLUMN "' + source + '" TEXT'); db.close();
	await saveConnections(f.root, { connections: [{ id: 'saved-sql', kind: 'sqlite', path: join(f.root, 'owner0.sqlite') }] });
	await addRepo(null, { path: f.root, name: 'fixture', addedAt: new Date().toISOString(), status: 'ready' }); const graph = await getGraphStore();
	await saveTurn(null, { sessionId: 'saved', idx: 1, user: saved, assistant: saved, entities: [], vector: [], repo: f.root });
	await upsertArtifactVec({ id: 'saved-artifact', embedding: new Float32Array(loadLocalProviderConfig().embeddingDim), session_id: 'saved', intent: 'control', skill_id: 'fixture', timestamp: 1n, path: join(output, 'saved.json'), preview: saved });
	const lance = await getLanceConn(), table = await lance.openTable('artifact_vec'), builder = table.mergeInsert('id').whenMatchedUpdateAll().whenNotMatchedInsertAll();
	writeAtomic(join(output, 'checkpoint.json'), JSON.stringify({ saved })); writeTaskOutput('saved', { taskId: 't01', template: 'control', kind: 'leaf', produces: ['report'], status: 'ok', outputs: { report: saved } });
	const dump = saveToolResults([{ source: 'saved', content: saved }], join(output, 'tool-results')); assert.ok(dump); assert.ok((await readFile(dump.path, 'utf8')).includes(saved));
	const shared = new LocalStepStateStore(), savedToken = await shared.mint('analyze', { saved }); assert.deepEqual((await shared.read<{ saved: string }>('analyze', savedToken))!.payload, { saved });
	let rawReads = 0, unsafeCalls = 0, drainCallbacks = 0, hubCalls = 0;
	const poisoned = new Proxy({}, { get(_target, key) { if (key === 'then') return undefined; rawReads++; throw Error(source); } });
	const hub = new HubStepStateStore({ request: async () => { hubCalls++; throw Error(source); } } as never);
	const intent: ClassifiedIntent = { target: 'data', scope: 'S', focused: true, focus: source, scopeRef: { kind: 'repo', value: f.root }, reasoning: 'private' };
	registerTemplateRuntime(dataSchemaTableRuntime, { sessionMemory: 'read-only' });
	registerTemplateRuntime({ templateId: 'fixture.failure', execute: async () => { throw Object.defineProperty(new Error(), 'message', { get() { rawReads++; return source; } }); } }, { sessionMemory: 'read-only' });
	registerTemplateRuntime({ templateId: 'fixture.report', execute: async args => { assert.equal(args.connectionExecution, a.execution); const schemas = args.upstreamOutputs.get('table-schema')!; assert.ok(schemas.length); assert.equal(args.absentInputs![0]!.reason, 'Temporary task failed.'); return { outputs: new Map([['report', { summary: JSON.stringify(schemas[0]!.value) }]]), completeness: buildCompleteness({ returned: 1, basis: 'data-source' }) }; } }, { sessionMemory: 'read-only' });
	registerTemplateRuntime({ templateId: 'fixture.persist', get execute() { unsafeCalls++; return async () => { writeAtomic(join(output, 'bad.json'), JSON.stringify(poisoned)); throw Error('should not execute'); }; } });
	const entered = deferred(), held = deferred(); let late: Promise<unknown> | undefined;
	registerTemplateRuntime({ templateId: 'fixture.late', execute: async () => { entered.resolve(); await held.promise; return poisoned as never; } }, { sessionMemory: 'read-only' });
	try {
		for (const connectionId of ['same', 'saved-sql']) {
			const node = tree('data.schema.table', connectionId), executed = await runExecutor({ tree: node, intent, runId: 'source', connectionExecution: a.execution }); assert.ok(JSON.stringify(executed.root.finalReport).includes(source)); assert.equal(executed.root.tasksFailed.length, 1);
			const records = createRunRecordPort('source', a.execution), record: RunRecord = { runId: 'source', createdAt: 'now', updatedAt: 'now', userPrompt: source, initialScopeRef: intent.scopeRef, stage: 'execute', status: 'in-progress' }; records.write(record);
			const completed = await runWithConnectionExecution(a.execution, async () => completeRun({ connectionExecution: a.execution, recordPort: records, record, intent, tree: node, executed, contextReport: undefined, start: Date.now() })); assert.equal(completed.ok, true); records.close();
		}
		await assert.rejects(runExecutor({ tree: tree('fixture.persist'), intent, runId: 'source', connectionExecution: a.execution }), { code: 'unsupported-temporary' }); assert.equal(unsafeCalls, 0);
		const poisonedTask = tree('fixture.persist'); Object.defineProperty(poisonedTask.plan.tasks[0]!, 'params', { get() { rawReads++; throw Error(source); } }); await assert.rejects(runExecutor({ tree: poisonedTask, intent, runId: 'source', connectionExecution: a.execution }), { code: 'unsupported-temporary' }); assert.equal(unsafeCalls, 0);
		await runWithConnectionExecution(a.execution, async () => {
			const denied = { code: 'unsupported-temporary' };
			await assert.rejects(async () => runWithConnectionExecution(undefined, async () => { unsafeCalls++; }), { code: 'session-expired' });
			await assert.rejects(saveTurn(null, poisoned as never), denied); await assert.rejects(upsertEntities(null, poisoned as never), denied); await assert.rejects(new ConfigStore(null).upsertEntry(poisoned as never), denied); await assert.rejects(recordFeedback(poisoned as never), denied);
			await assert.rejects(withWriteTxn(() => { drainCallbacks++; return 0; }), denied); assert.throws(() => withWriteTxnSync(graph, () => { drainCallbacks++; return 0; }), denied);
			assert.throws(() => graph.root.transactionSync(() => { drainCallbacks++; }), denied); assert.throws(() => graph.conversationTurn.put('private', poisoned), denied); assert.throws(() => graph.conversationTurn.get('private'), denied);
			assert.equal(graph.entity.get(Buffer.alloc(8)), undefined); // Independent structural read still works.
			await assert.rejects(getLanceConn(), denied); await assert.rejects(upsertArtifactVec(poisoned as never), denied); assert.throws(() => table.add([poisoned]), denied); assert.throws(() => builder.execute([poisoned]), denied);
			assert.throws(() => writeAtomic(join(output, 'private-checkpoint.json'), source), denied); assert.throws(() => writeArtifactJson(join(output, 'artifact.json'), poisoned as never), denied); assert.throws(() => appendRunLog('private', 'analyze', 'source', { source }), denied); assert.throws(() => appendProgressLog('source', 'analyze', 'checkpoint', source), denied);
			await assert.rejects(shared.mint('analyze', poisoned), denied); await assert.rejects(async () => hub.mint('workflow', poisoned), denied);
			assert.equal(saveToolResults(poisoned as never, join(output, 'tool-results'), a.execution), undefined); assert.deepEqual(toolLoopExhausted(3, poisoned as never, a.execution).toolResults, []);
			assert.equal(writeTaskOutput('source', poisoned as never, undefined, a.execution), ''); assert.equal(readTaskOutput('saved', 't01', undefined, a.execution), null); purgeTaskOutput('saved', 't01', a.execution); purgeAllTaskOutputs('saved', a.execution);
		});
		const payload = { version: 2, runId: 'source', repoPath: f.root, repoIndexedAt: null, intent, synthesizerKey: 'data', stage: 'awaiting_narrow', narrow: { explorationId: 'source', explorationType: 'capability.reuse-check', preparedBlob: { source }, resumeState: { results: [], outputs: [], totalCached: 0, totalMsSoFar: 0 } } } as StepStatePayload;
		const token = await encodeState(payload, a.execution); assert.equal(JSON.stringify({ state: token }).includes(source), false); await assert.rejects(decodeState(token, b.execution), { code: 'session-expired' }); assert.equal((await decodeState(token, a.execution)).narrow!.preparedBlob, payload.narrow!.preparedBlob);
		late = runExecutor({ tree: tree('fixture.late'), intent, runId: 'late', connectionExecution: a.execution }); await entered.promise; f.advance(90_001); held.resolve(); await assert.rejects(late, { code: 'session-expired' });
		assert.equal(rawReads, 0); assert.equal(unsafeCalls, 0); assert.equal(hubCalls, 0); assert.equal(drainCallbacks, 0);
		assert.equal((await getTurnsForSession(null, 'saved'))[0]!.user, saved); assert.deepEqual(await getTurnsForSession(null, 'source'), []); assert.equal((await getArtifactById('saved-artifact'))!.preview, saved); assert.equal(await getArtifactById(source), null); assert.equal(readTaskOutput('saved', 't01')!.outputs!['report'], saved);
		const vectorRows = await table.query().select(['id', 'preview', 'path', 'summary']).toArray(); assert.equal(JSON.stringify(vectorRows).includes(source), false);
		for (const bytes of [...await filesUnder(output), ...await filesUnder(PATHS.insrc), ...await filesUnder(dirname(PATHS.analyzeRun('source')))]) assert.equal(bytes.includes(Buffer.from(source)), false);
	} finally { held.resolve(); await late?.catch(() => { }); _resetRuntimeRegistryForTests(); await closeLanceConn(); await closeGraphStore(); await f.close(); }
});
