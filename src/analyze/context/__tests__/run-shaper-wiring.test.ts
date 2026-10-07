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
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { PATHS } from '../../../shared/paths.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan, ExplorationPlan } from '../../explore/types.js';
import { DecomposerLlmUnavailableError } from '../decomposer.js';
import {
	runShaper,
	ShaperAnswerInvalidError,
	ShaperLlmUnavailableError,
	_realPipelineStepsForTest,
	type PipelineSteps,
} from '../driver.js';
import { ScopeKindTargetMismatchError, ScopeNotIndexedError } from '../invariants.js';
import type { ResolvedScope } from '../scope.js';
import type { AnalyzeContextBundle } from '../types.js';

type RawBundle = Omit<AnalyzeContextBundle, 'meta'>;

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
				results: a.plan.explorations.map(e => ({ exploration: e, output: { type: e.type } as never, cached: false, elapsedMs: 0 })),
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
		(err: unknown) => err instanceof ShaperAnswerInvalidError && err.stage === 'bundle validation',
	);
	assert.equal(loop2.used(), false);
});
