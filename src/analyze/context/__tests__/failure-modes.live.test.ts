/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for P6 failure modes that weren't covered by
 * driver.live.test.ts:
 *
 *   - Missing upstream output (task-mode): the driver renders
 *     `[unavailable: <taskId>]` into the user message; the shaper
 *     surfaces it in the bundle's `upstream` layer.
 *   - ScopeNotIndexedError (run-mode, code-shaper, unindexed scope):
 *     the closure invariant detects the empty graph and throws
 *     BEFORE any Ollama call (cheap, no LLM cost).
 *
 * Auto-reindex on empty closure -- deferred to P6.b. The current
 * implementation throws ScopeNotIndexedError directly; the
 * orchestrator (P7) is the right layer to drive an indexer pass +
 * retry.
 *
 * ShaperLlmUnavailableError + ShaperToolLoopExhausted are pinned by
 * driver.live.test.ts.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/context/__tests__/failure-modes.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { addRepo } from '../../../db/repos.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
import { ScopeNotIndexedError } from '../invariants.js';
import { validateBundle } from '../schema.js';
import type {
	AnalyzeContextBundle,
	RunShapeInput,
	ShapeOpts,
	TaskShapeInput,
} from '../types.js';
import type {
	AnalyzeTaskTemplate,
	ClassifiedIntent,
	PlannedTask,
} from '../../../shared/analyze-types.js';

import { setupFixtures, teardownFixtures, type FixtureSet } from './fixtures/setup.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('failure-modes.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Sandbox: per-suite tmp graph store + fixtures
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;
let lmdbDir:  string;

test.before(async () => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	fixtures = setupFixtures();

	// Per-suite LMDB sandbox -- the user's production registry must
	// not leak in.
	await closeGraphStore();
	lmdbDir = mkdtempSync(join(tmpdir(), 'analyze-failure-modes-'));
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
	return `live-fail-${label}-${suffix}`;
}

async function runCodeShaperRun(
	scopeValue: string,
	runId:      string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', 'code');
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind: 'repo', value: scopeValue },
		reasoning: 'failure-modes.live fixture',
	};
	const inputs: RunShapeInput = { intent };
	const opts:   ShapeOpts     = { runId };
	return shaper.buildRunBundle(inputs, opts);
}

async function runCodeShaperTaskWithUpstream(
	repoPath: string,
	upstream: ReadonlyMap<string, unknown | null>,
	runId:    string,
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('task', 'code');
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'S',
		focused:   true,
		focus:     'Continue with upstream guidance',
		scopeRef:  { kind: 'workspace', value: repoPath },
		reasoning: 'failure-modes.live task fixture',
	};
	const task: PlannedTask = {
		taskId:           't99',
		template:  'code.structure.dep-tree',
		kind:      'leaf',
		params:    { module: 'index.ts' },
		produces:  ['continuation'],
		consumes:  ['exports'],
		rationale: 'failure-modes.live task fixture',
	};
	const template: AnalyzeTaskTemplate = {
		id:       'code.structure.dep-tree',
		target:   'code',
		family:   'structure',
		kind:     'leaf',
		revision: 'pre-registry',
	};
	const inputs: TaskShapeInput = {
		intent,
		task,
		template,
		upstreamTasks: upstream,
	};
	return shaper.buildTaskBundle(inputs, { runId });
}

function cleanupRun(runId: string, mode: 'run' | 'task' = 'run'): void {
	const key = mode === 'task'
		? { mode: 'task' as const, taskId: 't99', hash: 'x' }
		: { mode: 'run'  as const, hash: 'x' };
	const path = cacheFilePathFor(runId, key);
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

// ---------------------------------------------------------------------------
// ScopeNotIndexedError: registered repo with ZERO entities
// ---------------------------------------------------------------------------

test('failure-mode: code-shaper run-mode against an unindexed registered repo throws ScopeNotIndexedError', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	// Register the fixture as a repo but DO NOT upsert any entities.
	// The invariant sees: registered, status=pending, entity count = 0
	// -> ScopeNotIndexedError BEFORE any Ollama call.
	await addRepo(null, {
		path:    repoPath,
		name:    'tiny-multi-lang-repo',
		addedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
		status:  'pending',
	});

	const runId = uniqueRunId('not-indexed');
	const t0 = Date.now();
	await assert.rejects(
		() => runCodeShaperRun(repoPath, runId),
		(err: unknown) => {
			assert.ok(err instanceof ScopeNotIndexedError);
			assert.equal(err.scopePath, repoPath);
			assert.equal(err.registeredAs, repoPath);
			assert.match(err.message, /zero indexed entities/);
			return true;
		},
	);
	const ms = Date.now() - t0;
	// Invariant short-circuits BEFORE the Ollama call. Must be fast
	// (no model load, no tool-loop).
	assert.ok(ms < 5_000,
		`ScopeNotIndexedError should fire pre-Ollama (<5s); got ${ms}ms`);

	cleanupRun(runId);
});

// ---------------------------------------------------------------------------
// Missing upstream (task-mode): the driver renders [unavailable: ...]
// which the shaper surfaces in its `upstream` layer.
// ---------------------------------------------------------------------------

test('failure-mode: task-mode with null upstream surfaces [unavailable: ...] in the upstream layer', { skip: !GATE }, async () => {
	// Use a path NOT registered with addRepo so the pristine-registry
	// rule does NOT fire (we registered a different repo in the
	// previous test). Hmm -- it has registered repos now, so the
	// invariant DOES check this scope. But task-mode skips the
	// invariant entirely (per the driver wiring), so this works
	// regardless.
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);

	const runId = uniqueRunId('null-upstream');
	const upstream = new Map<string, unknown | null>([
		['t01', { task: 'code.surface.exports', exports: ['formatName'] }],
		['t02', null],  // synthetic failure
	]);

	try {
		const bundle = await runCodeShaperTaskWithUpstream(repoPath, upstream, runId);
		assert.ok(validateBundle(bundle));

		const upstreamLower = bundle.upstream.toLowerCase();

		// Per-id rendering must surface both upstream tasks. The
		// null one MUST carry the unavailable marker; the populated
		// one should render its content.
		assert.match(upstreamLower, /\bt01\b|formatname/,
			`upstream layer should render t01's content; got:\n${bundle.upstream.slice(0, 800)}`);
		assert.match(upstreamLower, /\bt02\b/,
			`upstream layer should reference t02; got:\n${bundle.upstream.slice(0, 800)}`);
		assert.match(upstreamLower, /unavailable|failed|missing|not available|skipped/,
			`upstream layer should surface t02's unavailability; got:\n${bundle.upstream.slice(0, 800)}`);
	} finally {
		cleanupRun(runId, 'task');
	}
});

// ---------------------------------------------------------------------------
// Auto-reindex on empty closure -- deferred to P6.b / framework outer-loop.
// ---------------------------------------------------------------------------

test.todo('failure-mode: auto-reindex on empty closure -- deferred to P6.b (needs indexer-queue wiring)');
