/**
 * LIVE checks for "an unfocused request gets an answer, and a request
 * that cannot proceed says why".
 *
 * Gated by INSRC_LIVE_TESTS=1. They run the context build IN PROCESS
 * from this working tree, with the real models and this machine's real
 * graph store (the index of this very repository) -- so they exercise
 * the code as it stands here, not whatever the installed daemon runs.
 *
 * The repository under analysis is this one. Its index must be ready.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/analyze/context/__tests__/unfocused.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { _classifyShaperErrorForTest as daemonCode } from '../../../daemon/analyze-rpc.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { closeGraphStore } from '../../../db/graph/store.js';
import type { AnalyzeScopeRef, AnalyzeTarget, ClassifiedIntent } from '../../../shared/analyze-types.js';
import { decompose } from '../decomposer.js';
import {
	prepareScope,
	settlePipelineOutcome,
	ShaperLlmUnavailableError,
	_realPipelineStepsForTest,
	_runExplorationPipelineForTest as runPipeline,
} from '../driver.js';
import { shaperFor } from '../index.js';
import { ScopeRefUnresolvedError } from '../invariants.js';
import { resolveScope } from '../scope.js';
import type { AnalyzeContextBundle } from '../types.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('unfocused.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

const REPO   = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const MODULE = join(REPO, 'src/analyze/classifier');
const FILE   = join(REPO, 'src/analyze/classifier/validate.ts');
const SYMBOL = `${FILE}#isKindCompatibleWithTarget`;

const LIVE = { timeout: 20 * 60_000 };

test.before(() => {
	if (!GATE) return;
	assert.ok(existsSync(FILE), `expected this repository at ${REPO}`);
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
});

function runId(label: string): string {
	return `live-unfocused-${label}-${Math.floor(Math.random() * 1e9).toString(16)}`;
}

function intent(target: AnalyzeTarget, scopeRef: AnalyzeScopeRef, focus?: string): ClassifiedIntent {
	return focus !== undefined
		? { target, scope: 'M', focused: true, focus, scopeRef, reasoning: 'live check' }
		: { target, scope: 'M', focused: false, scopeRef, reasoning: 'live check' };
}

async function build(target: 'code' | 'docs', i: ClassifiedIntent, label: string): Promise<AnalyzeContextBundle> {
	return shaperFor('run', target).buildRunBundle({ intent: i }, { runId: runId(label), bypassCache: true });
}

function assertNoPlaceholders(bundle: AnalyzeContextBundle, label: string): void {
	for (const layer of ['system', 'focus', 'summary', 'structure', 'surface', 'artefacts', 'upstream'] as const) {
		const text = bundle[layer];
		assert.ok(!text.includes('<intent.focus>'), `${label}: ${layer} carries the placeholder`);
		assert.ok(!/\bundefined\b/.test(text), `${label}: ${layer} says 'undefined': ${text.slice(0, 200)}`);
	}
}

// ---------------------------------------------------------------------------
// An unfocused request gets its context built
// ---------------------------------------------------------------------------

test('unfocused code request on this repository returns a bundle with a no-focus focus layer', { ...LIVE, skip: !GATE }, async () => {
	// The check of 2026-10-07 that failed at once with "Local Ollama
	// unavailable ... Run-mode exploration pipeline returned no bundle".
	const bundle = await build('code', intent('code', { kind: 'repo', value: REPO }), 'repo');
	assert.equal(bundle.meta.mode, 'run');
	assert.ok(bundle.summary.length > 0, 'the bundle has a summary');
	assert.ok(bundle.structure.length > 0, 'the bundle has a structure layer');
	// The focus layer says there is no focus and names the scope.
	assert.match(bundle.focus, /Intent focus: none/i, bundle.focus);
	assert.ok(bundle.focus.includes(REPO) || bundle.system.includes(REPO), `the scope is named: ${bundle.focus}`);
	assertNoPlaceholders(bundle, 'repo');
});

// ---------------------------------------------------------------------------
// A file and a symbol are served
// ---------------------------------------------------------------------------

test('file scope and symbol scope return a bundle', { ...LIVE, skip: !GATE }, async () => {
	const forFile = await build('code', intent('code', { kind: 'file', value: FILE }, 'what does this file check'), 'file');
	assert.ok(forFile.summary.length > 0);
	assertNoPlaceholders(forFile, 'file');
	assert.ok(JSON.stringify(forFile).includes('validate'), 'the answer is about the named file');

	const resolved = await resolveScope({ kind: 'symbol', value: SYMBOL });
	assert.equal(resolved.entityName, 'isKindCompatibleWithTarget');
	assert.equal(resolved.repoPath, REPO);
	const forSymbol = await build('code', intent('code', { kind: 'symbol', value: SYMBOL }, 'who calls this'), 'symbol');
	assert.ok(forSymbol.summary.length > 0);
	assertNoPlaceholders(forSymbol, 'symbol');
	assert.ok(JSON.stringify(forSymbol).includes('isKindCompatibleWithTarget'), 'the answer names the entity');
});

// ---------------------------------------------------------------------------
// What the real planning call emits with no focus
// ---------------------------------------------------------------------------

test('real planning call follows the no-focus recipe for code and returns a free-form lookup for docs', { ...LIVE, skip: !GATE }, async () => {
	const codeIntent = intent('code', { kind: 'module', value: MODULE });
	const codeScope  = await prepareScope('run', { intent: codeIntent });
	const codePlan   = await decompose({ intent: codeIntent, runId: runId('plan-code'), scope: codeScope });
	const types = codePlan.explorations.map(e => e.type);
	assert.ok(types.length > 0, 'the plan has lookups');
	// The recipe for code on a directory: only these lookups, on the module's own path.
	const recipe = new Set(['module.profile', 'import.graph', 'convention.detect']);
	for (const e of codePlan.explorations) {
		assert.ok(recipe.has(e.type), `'${e.type}' is not in the no-focus recipe for code (plan: ${types.join(', ')})`);
		assert.equal((e.params as { path?: string }).path, MODULE, `${e.type} runs on the module's path`);
	}
	assert.ok(types.includes('module.profile'), `the plan profiles the module (plan: ${types.join(', ')})`);
	assert.equal(codePlan.answerType, 'structural-map');

	const docsIntent = intent('docs', { kind: 'repo', value: REPO });
	const docsScope  = await prepareScope('run', { intent: docsIntent });
	const docsPlan   = await decompose({ intent: docsIntent, runId: runId('plan-docs'), scope: docsScope });
	assert.deepEqual(docsPlan.explorations.map(e => e.type), ['freeform.probe']);
	const purpose = (docsPlan.explorations[0]!.params as { purpose?: string }).purpose ?? '';
	assert.match(purpose, /survey/i, purpose);
});

// ---------------------------------------------------------------------------
// A request that cannot proceed says why
// ---------------------------------------------------------------------------

test("failure codes: 'scope-ref-unresolved' with the model running, 'shaper-llm-unavailable' with it stopped", { ...LIVE, skip: !GATE }, async () => {
	// (1) The model is running, and the failure is NOT blamed on it: a
	// symbol that names no stored entity.
	const missing = intent('code', { kind: 'symbol', value: `${FILE}#noSuchEntityAnywhere` }, 'who calls this');
	await assert.rejects(
		() => build('code', missing, 'unresolved'),
		(err: unknown) => {
			assert.ok(err instanceof ScopeRefUnresolvedError, `got ${(err as Error).name}: ${(err as Error).message}`);
			assert.equal(daemonCode(err).code, 'scope-ref-unresolved');
			assert.ok(!(err as Error).message.includes('unavailable'), (err as Error).message);
			return true;
		},
	);

	// (2) The model is unreachable: the real planning call, through a
	// real provider pointed at a closed port, in the real pipeline.
	const codeIntent = intent('code', { kind: 'module', value: MODULE });
	const scope = await prepareScope('run', { intent: codeIntent });
	const stopped = new OllamaProvider('qwen3.8:27b', 'http://127.0.0.1:9', 4096);
	const outcome = await runPipeline(
		{ invocationMode: 'run', shaperId: 'code', inputs: { intent: codeIntent }, runId: runId('stopped'), scope },
		{ ..._realPipelineStepsForTest, decompose: (a) => decompose({ ...a, provider: stopped }) },
	);
	assert.equal(outcome.kind, 'did-not-proceed');
	if (outcome.kind !== 'did-not-proceed') return;
	assert.equal(outcome.cause, 'planner-model-failed');
	assert.throws(
		() => settlePipelineOutcome(outcome, () => { throw new Error('unreachable'); }),
		(err: unknown) => {
			assert.ok(err instanceof ShaperLlmUnavailableError, `got ${(err as Error).name}`);
			assert.equal(daemonCode(err).code, 'shaper-llm-unavailable');
			assert.match((err as Error).message, /^The model call for planning failed: /);
			return true;
		},
	);
});
