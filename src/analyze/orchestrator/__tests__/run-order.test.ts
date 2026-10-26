import './private-paths.js';
/**
 * Epic c2ba6fa6, Story s5, Task t9 -- the run refuses a scope BEFORE it
 * measures or announces a size (ISSUE-a6940f8a).
 *
 * Whole runs over a sandboxed graph store. No model is reached: the requests
 * are refused at classify, or pass and are stopped at the plan stage by a
 * stand-in context builder. The refusal's code and message are the ones the
 * run gave before the change, recorded from the code before it (2026-10-13:
 * then at stage 'plan', after a 'classified' event announcing size XL).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo, updateRepoStatus } from '../../../db/repos.js';
import { openIndexRun, closeIndexRun } from '../../../indexer/run-record.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity } from '../../../shared/types.js';
import { writeBundle } from '../../context/cache.js';
import { _computeCacheKeyForTest } from '../../context/driver.js';
import { shaperFor } from '../../context/index.js';
import { RepoIndexingError, ScopeNotIndexedError } from '../../context/invariants.js';
import type { AnalyzeContextBundle, RunShaper, ShapeOpts } from '../../context/types.js';
import { _setClassifyForTest, _setRunShaperForTest, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent, RunAnalyzeArgs } from '../types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const REGISTERED = '/registered/elsewhere';

let sandbox: string;
/** A directory no registered repository contains. */
let unregistered: string;
/** A registered, indexed repository. */
let indexed: string;

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-run-order-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	unregistered = join(sandbox, 'proj');
	indexed = join(sandbox, 'app');
	for (const d of [unregistered, indexed]) {
		mkdirSync(d, { recursive: true });
		writeFileSync(join(d, 'a.ts'), 'export const a = 1;\n', 'utf8');
	}
	// The registry is readable and holds repositories, so the indexed check is live.
	await addRepo(null, { path: REGISTERED, name: REGISTERED, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await addRepo(null, { path: indexed, name: indexed, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [
		{ id: 'e-reg', repo: REGISTERED, file: `${REGISTERED}/i.ts`, kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 1 },
		{ id: 'e-app', repo: indexed, file: join(indexed, 'a.ts'), kind: 'variable', name: 'a', language: 'typescript', startLine: 1, endLine: 1 },
	] as unknown as Entity[]);
});

test.afterEach(async () => {
	_setRunShaperForTest(undefined);
	_setClassifyForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

/** The refusal the run gave before the change, for a scope in no registered repository. */
function recordedRefusal(path: string): { code: string; message: string; data: { scopePath: string; registeredAs: undefined } } {
	return {
		code: 'scope-not-indexed',
		message: `Scope ${path} produced an empty graph closure. No registered repo contains this path. Reason: no registered repo contains the scope path. `
			+ "Run `insrc repo add <path>` and let the indexer finish (status: 'ready') before re-running analyze.",
		data: { scopePath: path, registeredAs: undefined },
	};
}

/** A context builder that stops the run at the plan stage, before any model, and records the options it got. */
function stopAtPlan(seen: ShapeOpts[] = []): () => RunShaper {
	return () => ({
		buildRunBundle: async (_input: unknown, opts: ShapeOpts) => { seen.push(opts); throw new ScopeNotIndexedError('/stand-in', '/stand-in', 'the context builder stands in for the test'); },
	}) as unknown as RunShaper;
}

async function run(args: Omit<RunAnalyzeArgs, 'runId'>): Promise<{ result: Awaited<ReturnType<typeof runAnalyze>>; events: AnalyzeRunEvent[]; record: ReturnType<typeof readRunRecord> }> {
	const runId = `run-order-${Math.floor(Math.random() * 1e9).toString(16)}`;
	const events: AnalyzeRunEvent[] = [];
	try {
		const result = await runAnalyze({ runId, ...args }, { onEvent: e => events.push(e) });
		return { result, events, record: readRunRecord(runId) };
	} finally {
		purgeRunForTests(runId);
	}
}

const announced = (events: readonly AnalyzeRunEvent[]): boolean => events.some(e => e.type === 'classified');
const measured = (events: readonly AnalyzeRunEvent[]): boolean => events.some(e => e.type === 'stage-substep' && e.substep === 'measure');

function assertRefusedAtClassify(r: Awaited<ReturnType<typeof run>>, path: string): void {
	assert.equal(announced(r.events), false, "no 'classified' event: no size is announced");
	assert.equal(measured(r.events), false, 'no measure substep');
	assert.equal(r.result.ok, false);
	if (r.result.ok) return;
	assert.equal(r.result.stage, 'classify');
	const want = recordedRefusal(path);
	assert.deepEqual([r.result.error.code, r.result.error.message, r.result.error.data], [want.code, want.message, want.data],
		'the same code, message and data as before the change');
	assert.deepEqual([r.record?.status, r.record?.stage, r.record?.error?.code, r.record?.measure], ['failed', 'classify', 'scope-not-indexed', undefined]);
	assert.equal(r.events.filter(e => e.type === 'done').length, 1);
}

test("run order: a code request on a path no registered repository contains emits no 'classified' event and no measure substep, and ends failed at classify with the same code and message as runShaper's refusal (recorded from today's code before the change)", async () => {
	// The classifier's branch: a stand-in classifier names the unindexed directory.
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'repo', value: unregistered }, reasoning: 'r' };
	_setClassifyForTest(async () => intent);
	const built: ShapeOpts[] = [];
	_setRunShaperForTest(stopAtPlan(built));
	const r = await run({ userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: unregistered } });
	assertRefusedAtClassify(r, unregistered);
	assert.equal(built.length, 0, 'the context builder was never asked');
});

test('run order: the same on the hinted-target branch', async () => {
	const built: ShapeOpts[] = [];
	_setRunShaperForTest(stopAtPlan(built));
	const r = await run({ userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: unregistered }, targetHint: 'code', scopeHint: 'M' });
	assertRefusedAtClassify(r, unregistered);
	assert.equal(built.length, 0);
});

test("run order: a docs request on an unindexed scope emits no 'classified' event and ends failed at classify with the moved check's code and message", async () => {
	const built: ShapeOpts[] = [];
	_setRunShaperForTest(stopAtPlan(built));
	const r = await run({ userPrompt: 'what do the docs say', scopeRef: { kind: 'repo', value: unregistered }, targetHint: 'docs', scopeHint: 'M' });
	assertRefusedAtClassify(r, unregistered);
	assert.equal(built.length, 0, 'no bundle was built for it (before the change, two model calls were made)');
});

test("run order: a request that passes the check still emits 'classified' with its measure, as before", async () => {
	const built: ShapeOpts[] = [];
	_setRunShaperForTest(stopAtPlan(built));
	const r = await run({ userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: indexed }, targetHint: 'code', scopeHint: 'M' });
	const classified = r.events.find(e => e.type === 'classified');
	assert.ok(classified !== undefined && classified.type === 'classified');
	assert.equal(measured(r.events), true);
	// The measure, before the event, as before.
	const order = r.events.map(e => e.type === 'stage-substep' ? `substep:${e.substep}` : e.type);
	assert.ok(order.indexOf('substep:measure') < order.indexOf('classified'), order.join(','));
	assert.deepEqual([classified.measure?.determined, classified.measure?.size, classified.measure?.sizeHint], [true, 'XS', 'M']);
	assert.equal(classified.intent.scope, 'XS');
	// It reached the context builder, at the plan stage.
	assert.equal(built.length, 1);
	assert.equal(r.result.ok, false);
	if (!r.result.ok) assert.equal(r.result.stage, 'plan');
});

test("runAnalyze: a request about a repository under index ends with code 'repo-indexing' through the orchestrator's mapping (not 'internal-error')", async () => {
	await updateRepoStatus(null, indexed, 'indexing');
	openIndexRun(indexed, Date.UTC(2026, 9, 13, 12, 0));
	try {
		for (const targetHint of ['code', 'docs', 'infra', 'data'] as const) {
			const built: ShapeOpts[] = [];
			_setRunShaperForTest(stopAtPlan(built));
			const r = await run({ userPrompt: 'what is here', scopeRef: { kind: 'repo', value: indexed }, targetHint, scopeHint: 'M' });
			assert.equal(r.result.ok, false, targetHint);
			if (r.result.ok) continue;
			assert.deepEqual([r.result.stage, r.result.error.code], ['classify', 'repo-indexing'], targetHint);
			assert.deepEqual((r.result.error.data as { repoPath: string; status: string }).repoPath, indexed);
			assert.equal(announced(r.events), false, `${targetHint}: no size announced`);
			assert.equal(built.length, 0);
		}
		// A generic request has no family row and is not checked: it reaches the context builder.
		const built: ShapeOpts[] = [];
		_setRunShaperForTest(stopAtPlan(built));
		const generic = await run({ userPrompt: 'what is here', scopeRef: { kind: 'repo', value: indexed }, targetHint: 'generic', scopeHint: 'M' });
		assert.equal(built.length, 1, 'generic is not checked');
		assert.equal(built[0]?.scopeChecked, false, 'and the builder is not told it was');
		assert.equal(generic.result.ok, false);
	} finally {
		closeIndexRun(indexed);
	}
});

test("runAnalyze's scopeChecked option reaches runShaper through ShapeOpts and does not change the cache key", async () => {
	// runAnalyze passes it, for a checked source.
	const seen: ShapeOpts[] = [];
	_setRunShaperForTest(stopAtPlan(seen));
	await run({ userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: indexed }, targetHint: 'code', scopeHint: 'M' });
	assert.equal(seen[0]?.scopeChecked, true);
	_setRunShaperForTest(undefined);

	// Through the real factory it reaches runShaper: a cached bundle about a repository now
	// under index is served when the scope was checked (runShaper skips its own check) and
	// refused when it was not. Both requests hit the same cache slot: the key is unchanged.
	const intent: ClassifiedIntent = { target: 'code', scope: 'M', focused: false, scopeRef: { kind: 'repo', value: indexed }, reasoning: 'r' };
	const prompt = readFileSync(join(REPO_ROOT, 'src/prompts/analyze/code.system.md'), 'utf8');
	const id = `run-order-cache-${Math.floor(Math.random() * 1e9).toString(16)}`;
	try {
		const bundle = {
			system: 's', focus: 'f', summary: 'CACHED', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u',
			meta: { mode: 'run', shaper: 'code', toolCalls: 1, modelId: 'm', emptyLayers: [], schemaVersion: 2, repoPath: indexed },
		} as unknown as AnalyzeContextBundle;
		writeBundle(id, { mode: 'run', hash: _computeCacheKeyForTest(prompt, { intent }) }, bundle);
		await updateRepoStatus(null, indexed, 'indexing');

		const checked = await shaperFor('run', 'code').buildRunBundle({ intent }, { runId: id, scopeChecked: true });
		assert.equal(checked.summary, 'CACHED', 'served: the flag reached runShaper, and the key is the one the bundle was cached under');
		await assert.rejects(shaperFor('run', 'code').buildRunBundle({ intent }, { runId: id }), RepoIndexingError,
			'without the flag runShaper checks the hit itself');
	} finally {
		purgeRunForTests(id);
	}
});
