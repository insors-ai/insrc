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
import { addRepo } from '../../../db/repos.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { PATHS } from '../../../shared/paths.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { writeBundle } from '../cache.js';
import { DecomposerLlmUnavailableError } from '../decomposer.js';
import {
	runShaper,
	ShaperAnswerStepFailedError,
	ShaperLlmUnavailableError,
	_realPipelineStepsForTest,
	type PipelineSteps,
	_computeCacheKeyForTest,
	_stableStringifyForTest,
} from '../driver.js';
import { ScopeKindTargetMismatchError, ScopeNotIndexedError } from '../invariants.js';
import type { ResolvedScope } from '../scope.js';
import type { AnalyzeContextBundle } from '../types.js';
import { buildCompleteness } from '../../completeness.js';

/** A stand-in lookup's record: every lookup output states its completeness. */
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });

type RawBundle = Omit<AnalyzeContextBundle, 'meta'>;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

let sandbox: string;
let repo: string;
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
	assert.deepEqual(bundle.report, {
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
	assert.deepEqual(whole.report, { completeness: { complete: true, incomplete: [], failed: [] } });
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
		.update('|inputs:').update(_stableStringifyForTest({ intent })).digest('hex');
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
