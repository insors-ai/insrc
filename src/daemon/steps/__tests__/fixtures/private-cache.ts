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
	const original = PATHS.insrc, originalContext = PATHS.analyzeContext, originalOutput = PATHS.analyzeTaskOutput; PATHS.analyzeContext = id => join(directory, 'analyze', id, 'context'); PATHS.analyzeTaskOutput = (id, task) => join(directory, 'analyze', id, 'tasks', task + '.json'); PATHS.insrc = join(directory, 'insrc'); const overlays = new Map<string, TemporaryConnectionOverlay>(), factories: string[] = [];
	const runtime = new ConnectionSessionRpc({ enabled: async () => true, isRegistered: async r => r === root, createOverlay: (r, h, c) => { const o = createTemporaryOverlay(r, h, c, { factory: kind => { factories.push(kind); return getFactory(kind); } }); overlays.set(h, o); return o; }, dropOverlay: o => o.close() });
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
	return { root, runtime, owners, factories, async fresh(owner: typeof owners[number]) { const current = await request(owner.context.connectionIdentity); return { ...current, execution: await runtime.executionFor(current.context, root) }; }, async close() { for (const lifetime of requests) { lifetime.abort(); lifetime.complete(); } await runtime.close(); for (const lifetime of requests) await lifetime.drained; await closeAll(); _setMeasureDepsForTest(undefined); PATHS.insrc = original; PATHS.analyzeContext = originalContext; PATHS.analyzeTaskOutput = originalOutput; await rm(directory, { recursive: true, force: true }); } };
}

import { setGraphStorePath, closeGraphStore, getGraphStore } from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { getCachedExploration, putCachedExploration } from '../../../../db/exploration-cache.js';
import { executePlan, stepPlan, _overrideNarrowRunnerForTest } from '../../../../analyze/explore/executor.js';
import { readBundle, writeBundle, invalidateBundle } from '../../../../analyze/context/cache.js';
import type { AnalyzeContextBundle } from '../../../../analyze/context/types.js';
import type { Exploration, ExplorationOutput, ExplorationPlan, StepPlanResumeState } from '../../../../analyze/explore/types.js';
import { beginSessionReuse, assertSessionReuse, sessionReuseWindow, rememberSessionContinuation } from '../../../../analyze/session-reuse.js';
import { encodeState, decodeState, reencodeState } from '../../analyze-step/state.js';
import type { StepStatePayload } from '../../analyze-step/state.js';
import { releaseState, _privateStateCountForTests, _clearStateStoreForTests } from '../../analyze-step/state-store.js';
import { LocalStepStateStore, installStepStateStore } from '../../../threads/step-state.js';
import { readFile, readdir } from 'node:fs/promises';

test('warm saved exploration and context caches never satisfy attached owners', async () => {
	const f = await fixture(), [a, b] = f.owners as [typeof f.owners[number], typeof f.owners[number]];
	setGraphStorePath(join(f.root, 'graph'));
	const exp: Exploration = { id: 'list', type: 'db.tables.list', purpose: 'list', params: { connectionId: 'same' } };
	const saved = { type: 'db.tables.list', tables: [{ name: 'SAVED_CANARY' }] } as ExplorationOutput;
	const plan: ExplorationPlan = { answerType: 'structural-map', synthesisHint: 'test', explorations: [exp] };
	try {
		await addRepo(null, { path: f.root, name: 'private', addedAt: new Date().toISOString(), status: 'ready' });
		await putCachedExploration(f.root, 1n, exp, saved); assert.deepEqual(await getCachedExploration(f.root, 1n, exp), saved);
		const store = await getGraphStore(), get = mock.method(store.explorationCache, 'get', () => { throw Error('PERSISTENT_GET'); }), put = mock.method(store.explorationCache, 'put', () => { throw Error('PERSISTENT_PUT'); });
		for (const owner of [a, b, a]) for (const mode of ['execute', 'step']) {
			const args = { runId: 'private-cache', repoPath: f.root, closureRepos: [f.root], repoLastIndexedAtMs: 1n, plan, connectionExecution: owner.execution };
			const result = mode === 'execute' ? await executePlan(args) : await stepPlan(args);
			const done = 'kind' in result ? (assert.equal(result.kind, 'done'), result.kind === 'done' ? result.executed : undefined) : result;
			assert.ok(done); assert.equal(done.totalCached, 0); const output = done.results[0]!.output; assert.equal(output.type, 'db.tables.list'); if (output.type === 'db.tables.list') assert.equal(output.tables.length, owner.count);
		}
		const restore = _overrideNarrowRunnerForTest('doc.decision.trace', { schema: { type: 'object', properties: {}, additionalProperties: false }, prepare: async () => ({ kind: 'narrow-llm', systemPrompt: 'private', userTurn: 'private', schema: { type: 'object', properties: {}, additionalProperties: false }, prepared: { marker: 'PRIVATE_PREPARED' } }), finalize: () => saved });
		try {
			const paused = await stepPlan({ runId: 'private-cache', repoPath: f.root, closureRepos: [f.root], repoLastIndexedAtMs: 1n, plan: { ...plan, explorations: [exp, { id: 'narrow', type: 'doc.decision.trace', purpose: 'test', params: {} }] }, connectionExecution: a.execution });
			assert.equal(paused.kind, 'pending'); if (paused.kind === 'pending') {
				const again = await f.fresh(a); const resumed = await stepPlan({ runId: 'private-cache', repoPath: f.root, closureRepos: [f.root], repoLastIndexedAtMs: 1n, plan, resumeState: paused.resumeState, connectionExecution: again.execution }); assert.equal(resumed.kind, 'done');
				await assert.rejects(stepPlan({ runId: 'private-cache', repoPath: f.root, closureRepos: [f.root], repoLastIndexedAtMs: 1n, plan, resumeState: paused.resumeState, connectionExecution: b.execution }), { code: 'session-expired' });
			}
		} finally { restore(); }
		assert.equal(get.mock.callCount(), 0); assert.equal(put.mock.callCount(), 0); get.mock.restore(); put.mock.restore();
		assert.deepEqual(await getCachedExploration(f.root, 1n, exp), saved);
		const key = { mode: 'run' as const, hash: 'same' }, bundle = { summary: 'SAVED_CONTEXT_CANARY' } as AnalyzeContextBundle;
		writeBundle('private-cache', key, bundle); assert.deepEqual(readBundle('private-cache', key, { runId: 'private-cache' }), bundle);
		const path = join(PATHS.analyzeContext('private-cache'), 'run-bundle.json'), before = await readFile(path, 'utf8'), original = PATHS.analyzeContext; let paths = 0, reads = 0;
		PATHS.analyzeContext = () => { paths++; throw Error('PERSISTENT_PATH'); };
		const poison = new Proxy({}, { get() { reads++; throw Error('SOURCE_READ'); } });
		try {
for (const owner of [a, b]) {
				assert.equal(readBundle('private-cache', key, { runId: 'private-cache', connectionExecution: owner.execution }), null);
				writeBundle('private-cache', key, poison as AnalyzeContextBundle, owner.execution); invalidateBundle('private-cache', key, owner.execution);
				assert.equal(await getCachedExploration(f.root, 1n, poison as Exploration, owner.execution), null);
				await putCachedExploration(f.root, 1n, poison as Exploration, poison as ExplorationOutput, owner.execution);
			}
} finally { PATHS.analyzeContext = original; }
		assert.equal(paths, 0); assert.equal(reads, 0); assert.equal(await readFile(path, 'utf8'), before);
	} finally { mock.restoreAll(); await closeGraphStore(); await f.close(); }
});

test('private continuations authenticate owner and revisions before output payload access', async () => {
	const f = await fixture(), [a, b] = f.owners as [typeof f.owners[number], typeof f.owners[number]];
	setGraphStorePath(join(f.root, 'graph'));
	let reads = 0, shared = 0; const store = new LocalStepStateStore();
	for (const method of ['mint', 'read', 'update', 'release'] as const) mock.method(store, method, async () => { shared++; throw Error('SHARED_STATE'); }); installStepStateStore(store);
	const payload = { version: 2, runId: 'SOURCE_CANARY', repoPath: f.root, repoIndexedAt: null, intent: { target: 'data', scope: 'S', focused: true, focus: 'SOURCE_CANARY', scopeRef: { kind: 'connection', value: 'same' }, reasoning: '' }, synthesizerKey: 'data', stage: 'awaiting_plan' } as StepStatePayload;
	const poison = { get outputs() { reads++; throw Error('SOURCE_CANARY'); }, results: [], totalCached: 0, totalMsSoFar: 0 } as StepPlanResumeState;
	try {
		await addRepo(null, { path: f.root, name: 'private', addedAt: new Date().toISOString(), status: 'ready' });
		await beginSessionReuse(a.execution); await beginSessionReuse(b.execution);
		const token = await encodeState(payload, a.execution); assert.match(token, /^[A-Za-z0-9_-]{32}$/); assert.equal(token.includes('SOURCE'), false); assert.equal(shared, 0);
		const fresh = await f.fresh(a); await beginSessionReuse(fresh.execution); assert.equal(await decodeState(token, fresh.execution), payload);
		a.lifetime.complete(); assert.equal(await decodeState(token, fresh.execution), payload);
		await assert.rejects(decodeState(token, b.execution), { code: 'session-expired' }); await assert.rejects(decodeState(token), { code: 'session-expired' }); assert.equal(shared, 0);
		await rememberSessionContinuation(poison, fresh.execution);
		const plan: ExplorationPlan = { answerType: 'structural-map', synthesisHint: '', explorations: [] };
		const args = { runId: 'private-cache', repoPath: f.root, closureRepos: [f.root], repoLastIndexedAtMs: 1n, plan, resumeState: poison };
		await assert.rejects(stepPlan({ ...args, connectionExecution: b.execution }), { code: 'session-expired' });
		await assert.rejects(stepPlan({ ...args, resumeState: { outputs: [], results: [], totalCached: 0, totalMsSoFar: 0 }, connectionExecution: fresh.execution }), { code: 'session-expired' });
		assert.equal(reads, 0);
		const good = await rememberSessionContinuation({ outputs: [], results: [], totalCached: 0, totalMsSoFar: 0 }, fresh.execution);
		assert.equal((await stepPlan({ ...args, resumeState: good, connectionExecution: fresh.execution })).kind, 'done');
		const next = await reencodeState(token, payload, fresh.execution); await assert.rejects(decodeState(token, fresh.execution), { code: 'session-expired' }); assert.equal(await decodeState(next, fresh.execution), payload);
		const revision = a.overlay.read('same').revision;
		a.overlay.commit(await a.overlay.prepare({ key: { repoRoot: f.root, scope: 'temporary', id: 'same' }, mode: 'update', expectedRevision: revision, publicPatch: { label: 'changed' } }));
		assert.throws(() => sessionReuseWindow(a.execution), { code: 'session-expired' }); await assert.rejects(assertSessionReuse(fresh.execution), { code: 'session-expired' });
		const changed = await f.fresh(a); await beginSessionReuse(changed.execution);
		await assert.rejects(decodeState(next, changed.execution), { code: 'session-expired' });
		await assert.rejects(stepPlan({ ...args, connectionExecution: changed.execution }), { code: 'session-expired' }); assert.equal(reads, 0);
		const current = await encodeState(payload, changed.execution); assert.equal(await decodeState(current, changed.execution), payload); await releaseState(current, changed.execution); await assert.rejects(decodeState(current, changed.execution), { code: 'session-expired' });
		const cancelled = await encodeState(payload, changed.execution); const count = _privateStateCountForTests(); changed.lifetime.abort(); assert.ok(_privateStateCountForTests() < count); const after = await f.fresh(a); await beginSessionReuse(after.execution); await assert.rejects(decodeState(cancelled, after.execution), { code: 'session-expired' });
		const ended = await encodeState(payload, after.execution); await f.runtime.call('db.connections.v2.session.end', {}, a.context); assert.equal(_privateStateCountForTests(), 0); await assert.rejects(decodeState(ended, after.execution), { code: 'session-expired' });
		for (let index = 0; index < 100; index++) await encodeState(payload, b.execution);
		await assert.rejects(encodeState(payload, b.execution), { code: 'resource-limit' });
		assert.equal(_privateStateCountForTests(), 100); b.lifetime.abort(); assert.equal(_privateStateCountForTests(), 0); assert.equal(shared, 0); assert.equal(reads, 0);
	} finally { mock.restoreAll(); installStepStateStore(new LocalStepStateStore()); await _clearStateStoreForTests(); await closeGraphStore(); await f.close(); }
});
