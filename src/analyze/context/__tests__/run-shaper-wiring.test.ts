import { _runShaperAtEntryForTest as runShaper } from '../index.js';
/**
 * runShaper's own body for a run-mode request, driven directly: the
 * pairing check, the scope resolved once and handed on, the pipeline's
 * outcome settled, and no fall-through to the tool loop.
 *
 * The pipeline's steps are stand-ins and the graph store is a sandbox,
 * so nothing here reaches a model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo, removeRepo, updateRepoStatus } from '../../../db/repos.js';
import { resolveTaskScope } from '../../runtimes/shared/task-scope.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { PATHS } from '../../../shared/paths.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { writeBundle } from '../cache.js';
import { DecomposerLlmUnavailableError } from '../decomposer.js';
import {

	ShaperAnswerStepFailedError,
	ShaperLlmUnavailableError,
	ShaperIndexStateReadError,
	_realPipelineStepsForTest,
	type PipelineSteps,
	_computeCacheKeyForTest,
	_stableStringifyForTest,
} from '../driver.js';
import { RepoIndexingError, ScopeKindTargetMismatchError, ScopeNotIndexedError } from '../invariants.js';
import { validateBundleWithErrors } from '../schema.js';
import { _classifyShaperErrorForTest as daemonClassify } from '../../../daemon/analyze-rpc.js';
import { _classifyShaperErrorForTest as planTreeClassify } from '../../orchestrator/driver.js';
import type { ResolvedScope } from '../scope.js';
import type { AnalyzeContextBundle } from '../types.js';
import { buildCompleteness } from '../../completeness.js';
import type { AnswerReport } from '../../completeness.js';

/** A stand-in lookup's record: every lookup output states its completeness. */
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });

type RawBundle = Omit<AnalyzeContextBundle, 'meta'>;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

let sandbox: string;
let repo: string;
// removeRepo also deletes the repository's vectors: a temporary vector store, never the daemon's.
useTemporaryLance();

const runIds: string[] = [];

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-runshaper-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src'), { recursive: true });
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{
		id: 'e-fixture', repo, file: `${repo}/src/a.ts`, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
	for (const id of runIds.splice(0)) rmSync(PATHS.analyzeContext(id), { recursive: true, force: true });
});

function runId(tag: string): string {
	const id = `runshaper-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;
	runIds.push(id);
	return id;
}

const PLAN: ExplorationPlan = {
	answerType: 'structural-map', synthesisHint: 'h',
	explorations: [{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/x' } }],
} as unknown as ExplorationPlan;

const RAW: RawBundle = { system: 'sys', focus: 'Intent focus: none', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

interface Seen { decompose: Array<{ scope: ResolvedScope; intent: ClassifiedIntent }>; executePlan: Array<{ repoPath: string; scope?: ResolvedScope }>; synthesize: number }

/** A report without its measure: these tests are about the completeness part. The measure has its own tests. */
const sansMeasure = (report: AnswerReport | undefined): unknown => { if (report === undefined) return undefined; const { measure: _m, ...rest } = report; return rest; };

function standIns(over: Partial<PipelineSteps> = {}): { steps: PipelineSteps; seen: Seen } {
	const seen: Seen = { decompose: [], executePlan: [], synthesize: 0 };
	const steps: PipelineSteps = {
		..._realPipelineStepsForTest,
		decompose: async (a) => { seen.decompose.push(a); return PLAN; },
		executePlan: async (a) => {
			seen.executePlan.push(a);
			return {
				plan: a.plan,
				results: a.plan.explorations.map(e => ({ exploration: e, output: { type: e.type, completeness: WHOLE } as never, cached: false, elapsedMs: 0 })),
				elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
			} as unknown as ExecutedPlan;
		},
		synthesize: async () => { seen.synthesize += 1; return RAW; },
		...over,
	};
	return { steps, seen };
}

/** A tool-loop provider that must never be used by a run-mode request. */
function forbiddenLoop(): { provider: LLMProvider; used: () => boolean } {
	let used = false;
	const provider = new Proxy({}, {
		get: (_t, prop) => {
			if (prop === 'then') return undefined;
			return () => { used = true; throw new Error(`the tool loop was reached (${String(prop)})`); };
		},
	}) as unknown as LLMProvider;
	return { provider, used: () => used };
}

function unfocused(scopeRef: ClassifiedIntent['scopeRef'], target: ClassifiedIntent['target'] = 'code'): ClassifiedIntent {
	return { target, scope: 'M', focused: false, scopeRef, reasoning: 'r' };
}

function call(intent: ClassifiedIntent, steps: PipelineSteps, provider: LLMProvider, tag: string) {
	return runShaper({
		promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code',
		inputs: { intent }, opts: { runId: runId(tag) }, provider, pipelineSteps: steps,
	});
}

test('runShaper, run mode: an unfocused request on a module gets a stamped bundle, and each step is handed the resolved scope', async () => {
	const moduleDir = join(repo, 'src');
	const { steps, seen } = standIns();
	const loop = forbiddenLoop();
	const bundle = await call(unfocused({ kind: 'module', value: moduleDir }), steps, loop.provider, 'module');

	// The bundle the pipeline wrote, with meta stamped by runShaper.
	assert.equal(bundle.summary, 'sum');
	assert.equal(bundle.meta.mode, 'run');
	assert.equal(bundle.meta.shaper, 'code');
	assert.equal(bundle.meta.toolCalls, 1);

	// The scope was resolved once and handed on: the registered repo is
	// found, and the lookups run in the module's own directory.
	const expected: ResolvedScope = { kind: 'module', value: moduleDir, repoPath: repo, lookupPath: moduleDir };
	assert.deepEqual(seen.decompose.map(d => d.scope), [expected]);
	assert.equal(seen.decompose[0]!.intent.focused, false);
	assert.equal(seen.executePlan.length, 1);
	assert.equal(seen.executePlan[0]!.repoPath, moduleDir);
	assert.deepEqual(seen.executePlan[0]!.scope, expected);
	assert.equal(seen.synthesize, 1);
	// A run-mode request never reaches the tool loop.
	assert.equal(loop.used(), false);
});

test('runShaper, run mode: a refused pairing fails before the scope is resolved or any step runs', async () => {
	const { steps, seen } = standIns();
	const loop = forbiddenLoop();
	await assert.rejects(
		() => call(unfocused({ kind: 'connection', value: 'ledger-db' }), steps, loop.provider, 'pairing'),
		(err: unknown) => err instanceof ScopeKindTargetMismatchError,
	);
	assert.deepEqual(seen, { decompose: [], executePlan: [], synthesize: 0 });
	assert.equal(loop.used(), false);
});

test('runShaper, run mode: a scope outside every registered repo fails as not indexed before any step runs', async () => {
	const outside = join(sandbox, 'elsewhere');
	mkdirSync(outside, { recursive: true });
	const { steps, seen } = standIns();
	const loop = forbiddenLoop();
	await assert.rejects(
		() => call(unfocused({ kind: 'repo', value: outside }), steps, loop.provider, 'unindexed'),
		(err: unknown) => err instanceof ScopeNotIndexedError,
	);
	assert.deepEqual(seen, { decompose: [], executePlan: [], synthesize: 0 });
	assert.equal(loop.used(), false);
});

test('runShaper, run mode: a cause becomes its typed error and does NOT fall through to the tool loop', async () => {
	// A failed planning call. Before, every such case fell to one throw
	// that blamed "Local Ollama"; and long before, to the tool loop.
	const { steps } = standIns({
		decompose: async () => { throw new DecomposerLlmUnavailableError('claude exited with 1. stderr=overloaded'); },
	});
	const loop = forbiddenLoop();
	await assert.rejects(
		() => call(unfocused({ kind: 'repo', value: repo }), steps, loop.provider, 'planner-down'),
		(err: unknown) => {
			assert.ok(err instanceof ShaperLlmUnavailableError, `got ${(err as Error).name}`);
			assert.equal(err.message, 'The model call for planning failed: claude exited with 1. stderr=overloaded');
			return true;
		},
	);
	assert.equal(loop.used(), false);

	// A bundle that fails validation.
	const broken = { ...RAW } as Record<string, unknown>;
	delete broken['summary'];
	const second = standIns({ synthesize: async () => broken as unknown as RawBundle });
	const loop2 = forbiddenLoop();
	await assert.rejects(
		() => call(unfocused({ kind: 'repo', value: repo }), second.steps, loop2.provider, 'bad-bundle'),
		(err: unknown) => err instanceof ShaperAnswerStepFailedError && err.reason === 'invalid-bundle',
	);
	assert.equal(loop2.used(), false);
});

// ---------------------------------------------------------------------------
// The answer report on the bundle (LLD-b9d5c5c40df5a574-s1, task t12)
// ---------------------------------------------------------------------------

test("runShaper's run-mode bundle carries the report derived from the executed lookups", async () => {
	const plan = {
		answerType: 'structural-map', synthesisHint: 'h',
		explorations: [
			{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/x' } },
			{ id: 'e2', type: 'search.text',    purpose: 'p', params: { pattern: 'charge' } },
			{ id: 'e3', type: 'symbol.locate',  purpose: 'p', params: { names: ['charge'] } },
		],
	} as unknown as ExplorationPlan;
	const limited = buildCompleteness({
		returned: 30, basis: 'text',
		limited: [{ what: 'hits', limit: 30, scope: 'overall', reason: 'the search stops at 30 hits' }],
	});
	const outputs: Record<string, unknown> = {
		e1: { type: 'module.profile', completeness: WHOLE },
		e2: { type: 'search.text', completeness: limited },
		e3: { type: 'failed', requested: 'symbol.locate', errorCode: 'runtime-error', message: 'the graph store is closed' },
	};
	// The model's answer tries to state its own completeness. It must not be taken.
	const forged = { ...RAW, report: { completeness: { complete: true, incomplete: [], failed: [] } }, meta: { anything: true } };
	const { steps, seen } = standIns({
		decompose: async () => plan,
		executePlan: async (a) => ({
			plan: a.plan,
			results: a.plan.explorations.map(e => ({ exploration: e, output: outputs[e.id] as never, cached: false, elapsedMs: 0 })),
			elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
		}) as unknown as ExecutedPlan,
		synthesize: async () => { seen.synthesize += 1; return forged as unknown as RawBundle; },
	});
	const bundle = await call(unfocused({ kind: 'repo', value: repo }), steps, forbiddenLoop().provider, 'report');

	assert.equal(seen.synthesize, 1);
	assert.deepEqual(sansMeasure(bundle.report), {
		completeness: {
			complete:   false,
			incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached (the search stops at 30 hits)' }],
			failed:     [{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'the graph store is closed' }],
		},
	}, 'derived from the three lookups: one complete, one limited, one failed');
	// The seven layers are the model's; meta is stamped by code.
	assert.equal(bundle.summary, 'sum');
	assert.equal(bundle.meta.mode, 'run');
	assert.equal((bundle.meta as unknown as Record<string, unknown>)['anything'], undefined);
	assert.equal(bundle.meta.schemaVersion, 2);

	// Every lookup complete: the report says so.
	const allWhole = standIns();
	const whole = await call(unfocused({ kind: 'repo', value: repo }), allWhole.steps, forbiddenLoop().provider, 'report-whole');
	assert.deepEqual(sansMeasure(whole.report), { completeness: { complete: true, incomplete: [], failed: [] } });
});

test('a lookup that returns no completeness record is listed as failed, and the answer is still written from the other lookups', async () => {
	const plan = {
		answerType: 'structural-map', synthesisHint: 'h',
		explorations: [
			{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/x' } },
			{ id: 'e2', type: 'search.text',    purpose: 'p', params: { pattern: 'charge' } },
			{ id: 'e3', type: 'symbol.locate',  purpose: 'p', params: { names: ['charge'] } },
		],
	} as unknown as ExplorationPlan;
	const outputs: Record<string, unknown> = {
		e1: { type: 'module.profile', completeness: WHOLE },
		// No record at all.
		e2: { type: 'search.text', hits: [] },
		// A value in the record's place that is not a record.
		e3: { type: 'symbol.locate', completeness: { complete: true } },
	};
	const { steps, seen } = standIns({
		decompose: async () => plan,
		executePlan: async (a) => ({
			plan: a.plan,
			results: a.plan.explorations.map(e => ({ exploration: e, output: outputs[e.id] as never, cached: false, elapsedMs: 0 })),
			elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
		}) as unknown as ExecutedPlan,
	});
	// It used to throw a RangeError and lose every lookup's result.
	const bundle = await call(unfocused({ kind: 'repo', value: repo }), steps, forbiddenLoop().provider, 'no-record');

	assert.equal(seen.synthesize, 1, 'the answer was written');
	assert.equal(bundle.summary, 'sum');
	assert.deepEqual(sansMeasure(bundle.report), {
		completeness: {
			complete:   false,
			incomplete: [],
			failed: [
				{ sourceId: 'search.text [e2]',   sourceKind: 'lookup', reason: 'the lookup returned no completeness record' },
				{ sourceId: 'symbol.locate [e3]', sourceKind: 'lookup', reason: 'the lookup returned no completeness record' },
			],
		},
	});
});

test("a request answered by the free-form lookup alone returns a bundle with a one-source 'model-directed' report", async () => {
	const plan = {
		answerType: 'structural-map', synthesisHint: 'h',
		explorations: [{ id: 'e1', type: 'freeform.probe', purpose: 'survey', params: { purpose: 'survey', shaperId: 'code' } }],
	} as unknown as ExplorationPlan;
	const record = buildCompleteness({
		returned: 1, basis: 'model-directed', notEstablished: true,
		basisNote: 'a model chose what to search, in 4 tool calls; what it did not look at is not known',
	});
	const { steps, seen } = standIns({
		decompose: async () => plan,
		executePlan: async (a) => ({
			plan: a.plan,
			results: [{
				exploration: a.plan.explorations[0]!,
				output: { type: 'freeform.probe', purpose: 'survey', shaperId: 'code', rawBundle: RAW, toolCallCount: 4, completeness: record } as never,
				cached: false, elapsedMs: 0,
			}],
			elapsedMs: 0, cacheHits: 0, cacheMisses: 0,
		}) as unknown as ExecutedPlan,
	});
	const bundle = await call(unfocused({ kind: 'repo', value: repo }), steps, forbiddenLoop().provider, 'freeform-only');

	assert.equal(seen.synthesize, 0, 'the free-form answer is the bundle; no answer-writing call is made');
	assert.equal(bundle.summary, 'sum');
	assert.equal(bundle.meta.toolCalls, 4);
	assert.deepEqual(bundle.report?.completeness.failed, []);
	assert.equal(bundle.report?.completeness.complete, false, 'a search a model chose is never established complete');
	assert.deepEqual(bundle.report?.completeness.incomplete, [{
		sourceId: 'freeform.probe [e1]', sourceKind: 'lookup',
		reason: 'completeness could not be established: a model chose what to search, in 4 tool calls; what it did not look at is not known',
	}]);
});

test('a bundle cached before the change is not returned', async () => {
	const intent = unfocused({ kind: 'repo', value: repo });
	const id = runId('old-cache');
	const prompt = readFileSync(join(REPO_ROOT, 'src/prompts/analyze/code.system.md'), 'utf8');

	// The key the cache used at schema version 1, computed the way it was.
	const keyAt = (version: number): string => createHash('sha256')
		.update('analyze-context-bundle:').update(String(version))
		.update('|prompt:').update(prompt)
		// The intent's size is not part of the key: the size the builder works with is measured.
		.update('|inputs:').update(_stableStringifyForTest({ intent: (({ scope: _size, ...unsized }) => unsized)(intent) })).digest('hex');
	assert.equal(_computeCacheKeyForTest(prompt, { intent }), keyAt(2), 'the key is built from the current version');
	assert.notEqual(keyAt(1), keyAt(2));

	// A version-1 bundle sits in the run's cache slot under its version-1 key: no report.
	const old = { ...RAW, summary: 'OLD', meta: { mode: 'run', shaper: 'code', toolCalls: 1, modelId: 'm', emptyLayers: [], schemaVersion: 1 } };
	writeBundle(id, { mode: 'run', hash: keyAt(1) }, old as unknown as AnalyzeContextBundle);

	const { steps, seen } = standIns();
	const bundle = await runShaper({
		promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code',
		inputs: { intent }, opts: { runId: id }, provider: forbiddenLoop().provider, pipelineSteps: steps,
	});
	assert.equal(bundle.summary, 'sum', 'built again, not read from the old slot');
	assert.equal(seen.synthesize, 1);
	assert.ok(bundle.report !== undefined);

	// The bundle written now IS returned on the next identical request.
	const again = standIns();
	const second = await runShaper({
		promptPath: 'prompts/analyze/code.system.md', invocationMode: 'run', shaperId: 'code',
		inputs: { intent }, opts: { runId: id }, provider: forbiddenLoop().provider, pipelineSteps: again.steps,
	});
	assert.equal(again.seen.synthesize, 0, 'served from the cache');
	assert.deepEqual(second.report, bundle.report, 'and the cached bundle carries its report');
});

test("the tool loop's final answer is asked for with a schema that has no report, and a classification bundle carries none", async () => {
	// Classification mode is served by the tool loop, not by the lookup pipeline.
	registerBuiltinTools();
	let schemaGiven: Record<string, unknown> | undefined;
	const layers = { system: 'sys', focus: 'f', summary: 'classified', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };
	const provider = {
		// The model makes no tool call: the loop ends at once.
		complete: async () => ({ text: 'done', stopReason: 'end_turn', toolCalls: [] }),
		completeStructured: async (_messages: unknown, schema: Record<string, unknown>) => { schemaGiven = schema; return layers; },
	} as unknown as LLMProvider;

	const bundle = await runShaper({
		promptPath: 'prompts/analyze/classification.system.md', invocationMode: 'classification', shaperId: 'classification',
		inputs: { scopeRef: { kind: 'repo', value: repo }, userPrompt: 'what is here' },
		opts: { runId: runId('classification') }, provider,
	});

	assert.ok(schemaGiven !== undefined, 'the final answer was asked for');
	const props = (schemaGiven as { properties: Record<string, unknown> }).properties;
	assert.equal('report' in props, false, 'a model is never shown a schema that has the report');
	assert.equal('summary' in props, true);
	assert.equal(bundle.summary, 'classified');
	assert.equal(bundle.report, undefined, 'a classification bundle has no report: no lookups were run for it');
	assert.equal(bundle.meta.mode, 'classification');
});

test("runShaper: a lastIndexedAt that throws ends as ShaperIndexStateReadError (code 'index-state-read-failed'), through the one injectable reader (PipelineSteps.lastIndexedAt), at runShaper's freshness read and inside the pipeline", async () => {
	const loop = forbiddenLoop();
	const intent = unfocused({ kind: 'module', value: join(repo, 'src') });

	// (a) runShaper's own freshness read: the first read throws.
	const reads: string[] = [];
	const first = standIns({ lastIndexedAt: async (path) => { reads.push(path); throw new Error('MDB_BAD_TXN: the registry could not be read'); } });
	const atRead = await call(intent, first.steps, loop.provider, 'state-read').then(() => undefined, (e: unknown) => e);
	assert.ok(atRead instanceof ShaperIndexStateReadError, `runShaper's read: ${String(atRead)}`);
	assert.match(atRead.message, /MDB_BAD_TXN: the registry could not be read/);
	assert.equal(reads.length, 1, 'the read went through the injected reader');
	assert.equal(first.seen.decompose.length, 0, 'nothing ran after the failed read');
	assert.equal(planTreeClassify(atRead).code, 'index-state-read-failed');
	assert.equal(daemonClassify(atRead).code, 'index-state-read-failed');

	// (b) inside the pipeline: runShaper's read succeeds, the pipeline's read throws.
	let n = 0;
	const second = standIns({ lastIndexedAt: async () => { n += 1; if (n === 1) return 1_700_000_000_000; throw new Error('MDB_READERS_FULL'); } });
	const inPipeline = await call(intent, second.steps, loop.provider, 'state-read-pipeline').then(() => undefined, (e: unknown) => e);
	assert.ok(inPipeline instanceof ShaperIndexStateReadError, `pipeline: ${String(inPipeline)}`);
	assert.match(inPipeline.message, /MDB_READERS_FULL/);
	assert.equal(n, 2, 'both reads went through the one injected reader');
	assert.equal(second.seen.decompose.length, 1, 'the plan was made');
	assert.equal(second.seen.executePlan.length, 0, 'no lookup ran without the watermark');
	assert.equal(loop.used(), false);
});

// ---------------------------------------------------------------------------
// The cache before the scope (Epic c2ba6fa6, Story s5, Task t8)
// ---------------------------------------------------------------------------

/** Scope readers that fail the test if anything resolves a scope. */
function forbiddenScopeDeps(): { deps: NonNullable<Parameters<typeof runShaper>[0]['scopeDeps']>; reached: string[] } {
	const reached: string[] = [];
	const no = (name: string) => async (): Promise<never> => { reached.push(name); throw new Error(`scope resolution reached (${name})`); };
	return { deps: { listRepos: no('listRepos'), findEntitiesByFile: no('findEntitiesByFile'), listEntitiesForRepo: no('listEntitiesForRepo'), loadConnections: no('loadConnections') }, reached };
}

function callWith(intent: ClassifiedIntent, id: string, steps: PipelineSteps, extra: Partial<Parameters<typeof runShaper>[0]> = {}, shaper: 'code' | 'docs' | 'data' | 'infra' | 'generic' = 'code') {
	return runShaper({
		promptPath: `prompts/analyze/${shaper}.system.md`, invocationMode: 'run', shaperId: shaper,
		inputs: { intent }, opts: { runId: id }, provider: forbiddenLoop().provider, pipelineSteps: steps, ...extra,
	});
}

/** A cached bundle for `intent` in `id`'s run slot, written the way runShaper writes one. */
function seedBundle(id: string, intent: ClassifiedIntent, meta: Record<string, unknown>, shaper: 'code' | 'docs' | 'data' | 'infra' | 'generic' = 'code'): void {
	const prompt = readFileSync(join(REPO_ROOT, `src/prompts/analyze/${shaper}.system.md`), 'utf8');
	const bundle = { ...RAW, summary: 'CACHED', meta: { mode: 'run', shaper, toolCalls: 1, modelId: 'm', emptyLayers: [], schemaVersion: 2, ...meta } };
	writeBundle(id, { mode: 'run', hash: _computeCacheKeyForTest(prompt, { intent }) }, bundle as unknown as AnalyzeContextBundle);
}

test("runShaper cache order: a cache hit does not call scope resolution (a scopeDeps that throws is never reached) and returns the bundle; a hit on a connection scope while another repository's connections file is broken returns the bundle", async () => {
	const intent = unfocused({ kind: 'repo', value: repo });
	const id = runId('cache-first');
	const built = await callWith(intent, id, standIns().steps);
	assert.equal(built.meta?.repoPath, repo, 'a built bundle records its repository');

	const again = standIns();
	const forbidden = forbiddenScopeDeps();
	const hit = await callWith(intent, id, again.steps, { scopeDeps: forbidden.deps });
	assert.equal(hit.summary, built.summary);
	assert.deepEqual(forbidden.reached, [], 'scope resolution was never reached');
	assert.equal(again.seen.decompose.length + again.seen.synthesize, 0, 'nothing was built');

	// A connection scope: resolving it would read every repository's connections
	// file, and one of them is broken. The cached bundle is still returned.
	const conn: ClassifiedIntent = { target: 'data', scope: 'M', focused: false, scopeRef: { kind: 'connection', value: 'ledger-db' }, reasoning: 'r' };
	const cid = runId('cache-conn');
	seedBundle(cid, conn, { repoPath: null }, 'data');
	const broken = forbiddenScopeDeps();
	const connHit = await callWith(conn, cid, standIns().steps, { scopeDeps: broken.deps }, 'data');
	assert.equal(connHit.summary, 'CACHED');
	assert.deepEqual(broken.reached, []);
});

test('runShaper: a cache hit for a bundle whose repository is now being indexed is refused with RepoIndexingError and the bundle is not returned; a bundle without repoPath is a miss', async () => {
	const intent = unfocused({ kind: 'repo', value: repo });
	const id = runId('cache-indexing');
	await callWith(intent, id, standIns().steps);
	await updateRepoStatus(null, repo, 'indexing');
	const again = standIns();
	const refused = await callWith(intent, id, again.steps).then(() => undefined, (e: unknown) => e);
	assert.ok(refused instanceof RepoIndexingError, String(refused));
	assert.equal(refused.data.repoPath, repo);
	assert.equal(again.seen.synthesize, 0, 'not built either');

	// A bundle written before repoPath was recorded is a miss: built again.
	await updateRepoStatus(null, repo, 'ready');
	const oid = runId('cache-no-repopath');
	seedBundle(oid, intent, {});
	const rebuilt = standIns();
	const fresh = await callWith(intent, oid, rebuilt.steps);
	assert.equal(rebuilt.seen.synthesize, 1, 'built, not served');
	assert.notEqual(fresh.summary, 'CACHED');
	assert.equal(fresh.meta?.repoPath, repo);
});

test('runShaper: a cache hit whose recorded repository was reindexed since (newer last-indexed time) is a miss and the request is built', async () => {
	const intent = unfocused({ kind: 'repo', value: repo });
	const id = runId('cache-stale');
	let watermark = 1_760_000_000_000;
	const reads: string[] = [];
	const lastIndexedAt = async (path: string): Promise<number> => { reads.push(path); return watermark; };
	await callWith(intent, id, standIns({ lastIndexedAt }).steps);

	// Same watermark: served, and the freshness read is the recorded repository's.
	reads.length = 0;
	const same = standIns({ lastIndexedAt });
	await callWith(intent, id, same.steps);
	assert.equal(same.seen.synthesize, 0, 'served');
	assert.deepEqual(reads, [repo], 'freshness read for the recorded repository only');

	// The repository was reindexed since: a miss, built again.
	watermark += 60_000;
	const later = standIns({ lastIndexedAt });
	const rebuilt = await callWith(intent, id, later.steps);
	assert.equal(later.seen.synthesize, 1, 'built again');
	assert.equal(rebuilt.meta?.repoLastIndexedAt, watermark);
});

test('bundle schema: a freshly built bundle with repoPath (a string and null) passes validateBundleWithErrors; an older bundle without it still validates', () => {
	const base = { ...RAW, report: undefined, meta: { mode: 'run', shaper: 'code', toolCalls: 1, modelId: 'm', emptyLayers: [], schemaVersion: 2 } };
	delete (base as { report?: unknown }).report;
	for (const repoPath of ['/r/app', null]) {
		const v = validateBundleWithErrors({ ...base, meta: { ...base.meta, repoPath } });
		assert.ok(v.ok, `repoPath ${String(repoPath)}: ${v.ok ? '' : v.errors.join('; ')}`);
	}
	assert.ok(validateBundleWithErrors(base).ok, 'a bundle without repoPath still validates');
	const wrong = validateBundleWithErrors({ ...base, meta: { ...base.meta, repoPath: 42 } });
	assert.equal(wrong.ok, false, 'repoPath is a string or null, nothing else');
});

test('runShaper: a connection-scope bundle (repoPath null) is served from cache without the indexing and freshness checks', async () => {
	const conn: ClassifiedIntent = { target: 'data', scope: 'M', focused: false, scopeRef: { kind: 'connection', value: 'ledger-db' }, reasoning: 'r' };
	const id = runId('cache-null');
	seedBundle(id, conn, { repoPath: null }, 'data');
	// Every repository is under index, and the freshness reader throws: neither is consulted.
	await updateRepoStatus(null, repo, 'indexing');
	let freshnessReads = 0;
	const served = await callWith(conn, id, standIns({ lastIndexedAt: async () => { freshnessReads += 1; throw new Error('must not be read'); } }).steps, {}, 'data');
	assert.equal(served.summary, 'CACHED');
	assert.equal(freshnessReads, 0);
});

test('runShaper: a cache hit decides the index state by the same rule as a miss: a generic run, or a run whose caller checked the scope, about a repository being indexed is served from a warm cache as it would be built from a cold one; a code run is refused', async () => {
	await updateRepoStatus(null, repo, 'indexing');

	// A generic run is not checked on a miss (step 4.5), so a hit is not refused either.
	const generic = unfocused({ kind: 'repo', value: repo }, 'generic');
	const gid = runId('cache-generic-indexing');
	seedBundle(gid, generic, { repoPath: repo }, 'generic');
	const servedGeneric = await callWith(generic, gid, standIns().steps, {}, 'generic');
	assert.equal(servedGeneric.summary, 'CACHED', 'generic: served, not refused');

	// A run whose caller checked the scope already (runAnalyze) is not checked again.
	const code = unfocused({ kind: 'repo', value: repo });
	const cid = runId('cache-checked-indexing');
	seedBundle(cid, code, { repoPath: repo });
	const servedChecked = await callWith(code, cid, standIns().steps, { opts: { runId: cid, scopeChecked: true } });
	assert.equal(servedChecked.summary, 'CACHED', 'scopeChecked: served, not refused');

	// The same code run with no prior check is refused, warm as cold.
	const refused = await callWith(code, cid, standIns().steps).then(() => undefined, (e: unknown) => e);
	assert.ok(refused instanceof RepoIndexingError, String(refused));
});

test('runShaper: a cache hit on a code run whose recorded repository the index no longer holds is refused as not indexed, as the same request is from a cold cache', async () => {
	const intent = unfocused({ kind: 'repo', value: repo });
	const id = runId('cache-removed');
	await callWith(intent, id, standIns().steps);
	// The repository leaves the registry; another one stays, so the registry is not pristine.
	await addRepo(null, { path: join(sandbox, 'other'), name: 'other', addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await removeRepo(null, repo);

	const warm = standIns();
	const hit = await callWith(intent, id, warm.steps).then(() => undefined, (e: unknown) => e);
	assert.ok(hit instanceof ScopeNotIndexedError, `warm: ${String(hit)}`);
	assert.equal(warm.seen.synthesize, 0, 'not served, not built');

	const cold = await callWith(intent, runId('cache-removed-cold'), standIns().steps).then(() => undefined, (e: unknown) => e);
	assert.ok(cold instanceof ScopeNotIndexedError, `cold: ${String(cold)}`);
	assert.equal((hit as Error).message, (cold as Error).message, 'the same refusal warm and cold');
});

test("runShaper (ISSUE-0c845762): a docs run on a scope the index does not hold (in no registered repository, or in a registered repository with no stored entities) is refused as not indexed before any lookup or model call, cold and warm, with the run's message; a caller that checked the scope already is not checked again", async () => {
	const loop = forbiddenLoop();
	const outside = join(sandbox, 'elsewhere');
	mkdirSync(outside, { recursive: true });
	const empty = join(sandbox, 'empty');
	mkdirSync(empty, { recursive: true });
	await addRepo(null, { path: empty, name: 'empty', addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	for (const path of [outside, empty]) {
		const intent = unfocused({ kind: 'repo', value: path }, 'docs');
		const expected = await resolveTaskScope({ kind: 'repo', value: path }, 'docs', 'the run').then(() => undefined, (e: unknown) => e);
		assert.ok(expected instanceof ScopeNotIndexedError, `the run refuses ${path}`);
		const cold = standIns();
		const refused = await callWith(intent, runId('docs-unindexed'), cold.steps, { provider: loop.provider }, 'docs').then(() => undefined, (e: unknown) => e);
		assert.ok(refused instanceof ScopeNotIndexedError, `cold ${path}: ${String(refused)}`);
		assert.equal(refused.message, (expected as Error).message, 'the run\'s message');
		assert.deepEqual(cold.seen, { decompose: [], executePlan: [], synthesize: 0 }, 'no lookup');
	}
	assert.equal(loop.used(), false, 'no model call');

	// Warm: a docs bundle cached for a repository the index no longer holds is refused too.
	const intent = unfocused({ kind: 'repo', value: empty }, 'docs');
	const wid = runId('docs-warm');
	seedBundle(wid, intent, { repoPath: empty }, 'docs');
	const warm = await callWith(intent, wid, standIns().steps, {}, 'docs').then(() => undefined, (e: unknown) => e);
	assert.ok(warm instanceof ScopeNotIndexedError, `warm: ${String(warm)}`);

	// A caller that checked the scope already (runAnalyze) is served from the cache, not checked again.
	const served = await callWith(intent, wid, standIns().steps, { opts: { runId: wid, scopeChecked: true } }, 'docs');
	assert.equal(served.summary, 'CACHED');
});
