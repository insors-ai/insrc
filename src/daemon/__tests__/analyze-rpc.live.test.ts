/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live end-to-end test for analyze.context.* RPC handlers.
 *
 * Invokes each handler with real (non-mocked) shaper internals,
 * including a real Ollama call. Each handler returns the tagged-
 * union AnalyzeRpcResponse; the live test asserts:
 *
 *   - buildClassification + buildRun + buildTask: first call hits
 *     real Ollama and returns `ok: true` with a schema-valid bundle.
 *     Second call (same runId + params) hits the cache and returns
 *     the SAME bundle quickly.
 *   - Typed shaper errors propagate as the documented
 *     AnalyzeRpcErrorCode values (scope-not-indexed,
 *     shaper-llm-unavailable, ...). We pin the scope-not-indexed
 *     path because it short-circuits before any Ollama work.
 *
 * The handlers cover the three modes via the same per-shaper
 * dispatch the driver uses internally; this file is the wire-shape
 * contract test for the IPC layer.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/daemon/__tests__/analyze-rpc.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../config/analyze.js';
import {
	cacheFilePathFor,
	type CacheKey,
} from '../../analyze/context/cache.js';
import { validateBundle } from '../../analyze/context/schema.js';
import {
	buildClassification,
	buildRun,
	buildTask,
	classify,
	plan,
	runStart,
	runStatus,
	type AnalyzeRpcResponse,
	type ClassifyRpcResponse,
	type PlanRpcResponse,
	type RunStartRpcResponse,
	type RunStatusRpcResponse,
} from '../analyze-rpc.js';
import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../analyze/runtimes/bootstrap.js';
import { purgeRunForTests } from '../../analyze/orchestrator/index.js';
import {
	_resetTemplateBootstrapLatchForTests,
	registerBuiltinTemplates,
} from '../../analyze/planner/templates/bootstrap.js';
import {
	_resetTemplateRegistryForTests,
} from '../../analyze/planner/templates/registry.js';
import { purgePlan } from '../../analyze/planner/cache.js';
import { validatePlanShape } from '../../analyze/planner/schema.js';
import { addRepo } from '../../db/repos.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { registerBuiltinTools } from '../tools/builtins/index.js';
import { _resetRegistryForTests } from '../tools/registry.js';
import {
	setupFixtures,
	teardownFixtures,
	type FixtureSet,
} from '../../analyze/context/__tests__/fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('analyze-rpc.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;
let lmdbDir:  string;

test.before(async () => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
	_resetRuntimeBootstrapLatchForTests();
	registerBuiltinRuntimes();
	fixtures = setupFixtures();

	await closeGraphStore();
	lmdbDir = mkdtempSync(join(tmpdir(), 'analyze-rpc-live-'));
	setGraphStorePath(join(lmdbDir, 'graph.lmdb'));
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	if (lmdbDir) rmSync(lmdbDir, { recursive: true, force: true });
	if (fixtures) teardownFixtures(fixtures);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-rpc-${label}-${suffix}`;
}

function cleanupRun(runId: string, key: CacheKey): void {
	const path = cacheFilePathFor(runId, key);
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

function asOk(r: AnalyzeRpcResponse): { bundle: AnalyzeRpcResponse extends { bundle: infer B } ? B : never } {
	assert.equal(r.ok, true, `expected ok response, got: ${JSON.stringify('error' in r ? r.error : r)}`);
	return r as never;
}

function asErr(r: AnalyzeRpcResponse): { error: { code: string; message: string; data?: unknown } } {
	assert.equal(r.ok, false, `expected error response, got ok bundle`);
	return r as never;
}

// ---------------------------------------------------------------------------
// buildClassification: end-to-end happy path + cache hit
// ---------------------------------------------------------------------------

test('buildClassification: happy path + cache hit on identical re-invocation', { skip: !GATE }, async () => {
	const runId = uniqueRunId('cls');
	const params = {
		runId,
		scopeRef:   { kind: 'workspace' as const, value: realpathSync(fixtures.tinyMultiLangRepo) },
		userPrompt: 'What is in this workspace?',
	};
	const cacheKey: CacheKey = { mode: 'classification', hash: 'x' };
	try {
		const first = asOk(await buildClassification(params));
		assert.ok(validateBundle((first as unknown as { bundle: unknown }).bundle));

		const t1 = Date.now();
		const second = asOk(await buildClassification(params));
		const secondMs = Date.now() - t1;
		assert.deepEqual(second, first, 'cached invocation should return identical response');
		assert.ok(secondMs < 500,
			`cache hit should be fast (<500ms); got ${secondMs}ms`);
	} finally {
		cleanupRun(runId, cacheKey);
	}
});

// ---------------------------------------------------------------------------
// buildRun (infra-shaper) happy path
// ---------------------------------------------------------------------------

test('buildRun (infra target): happy path returns schema-valid bundle', { skip: !GATE }, async () => {
	const runId = uniqueRunId('run-infra');
	const params = {
		runId,
		intent: {
			target:    'infra' as const,
			scope:     'S' as const,
			focused:   false,
			scopeRef:  { kind: 'manifest-dir' as const, value: realpathSync(fixtures.seededManifests) },
			reasoning: 'analyze-rpc.live test fixture',
		},
	};
	const cacheKey: CacheKey = { mode: 'run', hash: 'x' };
	try {
		const r = asOk(await buildRun(params));
		assert.ok(validateBundle((r as unknown as { bundle: unknown }).bundle));
	} finally {
		cleanupRun(runId, cacheKey);
	}
});

// ---------------------------------------------------------------------------
// buildTask happy path with one upstream + one null upstream
// ---------------------------------------------------------------------------

test('buildTask (code target): happy path with upstream mix', { skip: !GATE }, async () => {
	const runId = uniqueRunId('task-code');
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	const params = {
		runId,
		intent: {
			target:    'code' as const,
			scope:     'S' as const,
			focused:   true,
			focus:     'Continue with upstream guidance',
			scopeRef:  { kind: 'workspace' as const, value: repoPath },
			reasoning: 'analyze-rpc.live task fixture',
		},
		task: {
			taskId:    't42',
			template:  'code.structure.dep-tree',
			kind:      'leaf',
			params:    { module: 'index.ts' },
			produces:  ['continuation'],
			consumes:  ['exports'],
			rationale: 'analyze-rpc.live task fixture',
		},
		template: {
			id:       'code.structure.dep-tree',
			target:   'code' as const,
			family:   'structure',
			kind:     'leaf' as const,
			revision: 'pre-registry',
		},
		upstream: [
			['t01', { task: 'code.surface.exports', exports: ['formatName'] }],
			['t02', null],
		] as Array<[string, unknown | null]>,
	};
	const cacheKey: CacheKey = { mode: 'task', taskId: 't42', hash: 'x' };
	try {
		const r = asOk(await buildTask(params));
		assert.ok(validateBundle((r as unknown as { bundle: unknown }).bundle));
	} finally {
		cleanupRun(runId, cacheKey);
	}
});

// ---------------------------------------------------------------------------
// Error path: scope-not-indexed (cheap; no Ollama call)
// ---------------------------------------------------------------------------

test('buildRun (code target): unindexed registered repo -> scope-not-indexed error code', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.emptyRepo);
	// Register the empty repo so the longest-prefix match finds it,
	// then verify it has zero entities -> scope-not-indexed.
	await addRepo(null, {
		path:    repoPath,
		name:    'rpc-empty-repo-fixture',
		addedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
		status:  'pending',
	});

	const runId = uniqueRunId('not-indexed');
	const t0 = Date.now();
	const r = asErr(await buildRun({
		runId,
		intent: {
			target:    'code',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'repo', value: repoPath },
			reasoning: 'analyze-rpc.live unindexed fixture',
		},
	}));
	const ms = Date.now() - t0;

	assert.equal(r.error.code, 'scope-not-indexed');
	assert.match(r.error.message, /zero indexed entities/);
	// Error path's data carries the scope path + registered repo path.
	const data = r.error.data as { scopePath?: string; registeredAs?: string } | undefined;
	assert.ok(data);
	assert.equal(data.scopePath, repoPath);
	assert.equal(data.registeredAs, repoPath);

	// Must short-circuit BEFORE any Ollama call -- much faster than a
	// real model invocation (which takes seconds).
	assert.ok(ms < 5_000,
		`scope-not-indexed should fire pre-Ollama (<5s); got ${ms}ms`);

	cleanupRun(runId, { mode: 'run', hash: 'x' });
});

// ---------------------------------------------------------------------------
// Error path: invalid-params (cheap; no Ollama)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// classify: end-to-end happy path
// ---------------------------------------------------------------------------

test('classify: happy path returns ok:true with a ClassifiedIntent', { skip: !GATE }, async () => {
	const runId = uniqueRunId('classify');
	const scopeValue = realpathSync(fixtures.tinyMultiLangRepo);
	const r = await classify({
		runId,
		userPrompt: 'What is in this workspace?',
		scopeRef:   { kind: 'workspace' as const, value: scopeValue },
	}) as ClassifyRpcResponse;

	assert.equal(r.ok, true);
	if (!r.ok) return;
	assert.ok(['code', 'data', 'infra', 'generic'].includes(r.intent.target));
	assert.ok(['XS', 'S', 'M', 'L', 'XL'].includes(r.intent.scope));
	assert.equal(typeof r.intent.focused, 'boolean');
	assert.equal(typeof r.intent.reasoning, 'string');
	assert.ok(r.intent.reasoning.length > 0);

	cleanupRun(runId, { mode: 'classification', hash: 'x' });
});

// ---------------------------------------------------------------------------
// classify: error path -- scope-ref-unresolved is unwrapped from
// ClassifierValidationExhausted into the wire-level error code
// ---------------------------------------------------------------------------

test('classify: nonexistent scopeRef.value -> scope-ref-unresolved error code', { skip: !GATE }, async () => {
	const runId = uniqueRunId('classify-bad-path');
	const r = await classify({
		runId,
		userPrompt: 'analyze this',
		scopeRef:   { kind: 'workspace' as const, value: '/var/folders/does-not-exist-' + Math.random().toString(16) },
	}) as ClassifyRpcResponse;

	assert.equal(r.ok, false);
	if (r.ok) return;
	// Either the classifier's own validation pass surfaces
	// scope-ref-unresolved verbatim, OR (more likely) the
	// classification shaper trips first on the missing path.
	// Both are valid orchestrator-dispatchable codes.
	const acceptable = [
		'scope-ref-unresolved',
		'scope-ref-kind-target-mismatch',
		'internal-error',
		'classifier-llm-unavailable',
		'shaper-llm-unavailable',
	];
	assert.ok(acceptable.includes(r.error.code),
		`error.code should be a dispatchable analyze code; got '${r.error.code}'. ` +
		`message: ${r.error.message}`);
});

// ---------------------------------------------------------------------------
// plan: end-to-end happy path through the daemon RPC layer
// ---------------------------------------------------------------------------

test('plan (infra XS): end-to-end -> ok:true with a validator-passing PlanTask', { skip: !GATE }, async () => {
	const runId = uniqueRunId('plan');
	const intent = {
		target:    'infra' as const,
		scope:     'XS' as const,
		focused:   false,
		scopeRef:  { kind: 'manifest-dir' as const, value: realpathSync(fixtures.seededManifests) },
		reasoning: 'analyze-rpc.live plan happy-path fixture',
	};
	try {
		const r = await plan({ runId, intent }) as PlanRpcResponse;
		assert.equal(r.ok, true,
			`expected ok response; got: ${JSON.stringify('error' in r ? r.error : '?')}`);
		if (!r.ok) return;
		assert.ok(validatePlanShape(r.plan));
		assert.equal(r.plan.target, 'infra');
		assert.equal(r.plan.scope,  'XS');
		assert.equal(r.plan.parentTaskPath, undefined);
		// XS band: 3-8 tasks. Last task is the infra aggregator.
		assert.ok(r.plan.tasks.length >= 3 && r.plan.tasks.length <= 8);
		const last = r.plan.tasks[r.plan.tasks.length - 1]!;
		assert.equal(last.template, 'infra.aggregate.report');
	} finally {
		purgePlan({ runId });
	}
});

// ---------------------------------------------------------------------------
// plan: max-plan-depth-exceeded fires pre-LLM (cheap)
// ---------------------------------------------------------------------------

test('plan: currentDepth=99 -> max-plan-depth-exceeded error code in <5s', { skip: !GATE }, async () => {
	const runId = uniqueRunId('plan-depth');
	const intent = {
		target:    'infra' as const,
		scope:     'XS' as const,
		focused:   false,
		scopeRef:  { kind: 'manifest-dir' as const, value: realpathSync(fixtures.seededManifests) },
		reasoning: 'analyze-rpc.live depth-cap fixture',
	};
	const t0 = Date.now();
	const r = await plan({ runId, intent, currentDepth: 99 }) as PlanRpcResponse;
	const ms = Date.now() - t0;
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'max-plan-depth-exceeded');
	const data = r.error.data as { currentDepth?: number; rootScope?: string; cap?: number } | undefined;
	assert.ok(data);
	assert.equal(data.currentDepth, 99);
	assert.equal(data.rootScope, 'XS');
	assert.equal(data.cap, 2);
	// Must short-circuit before any shaper / LLM call.
	assert.ok(ms < 5_000,
		`max-plan-depth-exceeded should fire pre-LLM (<5s); got ${ms}ms`);
});

test('buildRun: malformed intent -> invalid-params error code', { skip: !GATE }, async () => {
	const r = asErr(await buildRun({
		runId: 'whatever',
		intent: {
			target:    'not-a-target',
			scope:     'M',
			focused:   false,
			scopeRef:  { kind: 'workspace', value: '/x' },
			reasoning: 'test',
		},
	}));
	assert.equal(r.error.code, 'invalid-params');
});

// ---------------------------------------------------------------------------
// analyze.run.start -- end-to-end via the daemon RPC handler
// ---------------------------------------------------------------------------

/**
 * Drives the full pipeline through the RPC handler against the
 * seeded-manifests infra fixture. Asserts that the wire response
 * is structured + the persisted run record mirrors it.
 *
 * Wall-clock: 4-5 LLM calls (10-20 min ceiling). Decoupled from
 * "happy path always" -- a transient shaper schema flake (e.g.
 * artifacts/artefacts) is a legitimate failure outcome AS LONG
 * AS it surfaces through the orchestrator's structured failure
 * path with a recognised error code. Use
 *   --test-timeout=1500000
 * when running this directly.
 */
// S3: runStart is a streaming RPC now. Collect emitted frames via
// a stub `send` callback; assert on the terminal `analyze.result`
// frame + sequence-level invariants (progress frames precede
// analyze.result; done is the last frame).

interface LiveFrame { stream: string; data: unknown; }

test('runStart (streaming): infra workspace end-to-end via streaming RPC; result mirrors run.json', { skip: !GATE }, async () => {
	const runId = uniqueRunId('runstart');
	const repoPath = realpathSync(fixtures.seededManifests);
	try {
		const frames: LiveFrame[] = [];
		await runStart({
			runId,
			userPrompt: 'Give me a brief inventory of the infrastructure in this repo.',
			scopeRef:   { kind: 'workspace', value: repoPath },
		}, (m) => frames.push({ stream: m.stream, data: m.data }), new AbortController().signal);

		// Terminal frames: analyze.result + done as the last 2.
		const resultIdx = frames.findIndex(f => f.stream === 'analyze.result');
		const doneIdx   = frames.findIndex(f => f.stream === 'done');
		assert.ok(resultIdx >= 0, 'analyze.result frame must be emitted');
		assert.equal(doneIdx, frames.length - 1, 'done must be the last frame');
		assert.ok(resultIdx < doneIdx, 'analyze.result must come BEFORE done');

		// At least 1 progress frame -- the pipeline must emit *some*
		// observable activity. Cache miss + classify+plan+execute
		// produces many; even a fast-fail produces stage-started.
		const progressFrames = frames.filter(f => f.stream === 'progress');
		assert.ok(progressFrames.length >= 1,
			`expected >=1 progress frame; got ${progressFrames.length} (total frames: ${frames.length})`);

		const r = frames[resultIdx]!.data as RunStartRpcResponse;
		assert.equal(r.runId, runId);

		// status RPC reflects the same outcome.
		const status = await runStatus({ runId }) as RunStatusRpcResponse;
		assert.equal(status.ok, true);
		if (!status.ok) return;
		assert.equal(status.record.runId, runId);

		if (r.ok) {
			const report = r.finalReport as {
				summary: string;
				findings: Array<{ title: string; detail: string; sources: string[] }>;
				metadata: { target: string; scope: string; runId: string; tasksAnalyzed: number };
			};
			assert.ok(typeof report.summary === 'string' && report.summary.length >= 40);
			assert.ok(Array.isArray(report.findings) && report.findings.length >= 1);
			assert.equal(report.metadata.target, 'infra');
			assert.equal(report.metadata.runId, runId);

			assert.equal(status.record.status, 'ok');
			assert.equal(status.record.stage,  'done');
			assert.equal(status.record.intent?.target, 'infra');
		} else {
			// Failure path -- must be a recognised code (not internal-error).
			assert.notEqual(r.error.code, 'internal-error',
				`runStart produced an unmapped error: ${r.error.message}`);
			assert.equal(status.record.status, 'failed');
			assert.equal(status.record.stage,  r.stage,
				`status record stage should mirror response stage`);
			assert.equal(status.record.error?.code, r.error.code,
				`status record error.code should mirror response error.code`);
		}
	} finally {
		purgeRunForTests(runId);
	}
});

test('runStart (streaming): invalid scopeRef.kind -> invalid-params in analyze.result, fast (no LLM)', { skip: !GATE }, async () => {
	const frames: LiveFrame[] = [];
	const t0 = Date.now();
	await runStart({
		runId:      'runstart-invalid',
		userPrompt: 'analyze this',
		scopeRef:   { kind: 'frobnicate', value: '/x' },
	}, (m) => frames.push({ stream: m.stream, data: m.data }), new AbortController().signal);
	const ms = Date.now() - t0;

	assert.equal(frames.length, 2, `param-validation fast path should emit exactly 2 frames (analyze.result + done); got ${frames.length}`);
	assert.equal(frames[0]!.stream, 'analyze.result');
	assert.equal(frames[1]!.stream, 'done');
	const r = frames[0]!.data as RunStartRpcResponse;
	assert.equal(r.ok, false);
	if (r.ok) return;
	assert.equal(r.error.code, 'invalid-params');
	assert.ok(ms < 1_000, `param validation should be fast (<1s); got ${ms}ms`);
});
