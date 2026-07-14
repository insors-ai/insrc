/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live tests for the code-shaper.
 *
 * Drives the real Ollama against the tiny-multi-lang-repo fixture
 * and asserts the code edge-case matrix rows that are reachable in
 * P5.c (C1, C3, C4, C6 in plans/analyze-context-builder.md):
 *
 *   C1 -- Small multi-language repo, run-mode: all three languages
 *         (TypeScript / Python / Go) acknowledged in summary; all
 *         three surfaces (export / CLI / HTTP) acknowledged in
 *         surface; structure lists all three modules
 *   C3 -- Single-file scope, run-mode: surface narrows to the file's
 *         exports; structure is the file's symbol tree
 *   C4 -- Task-mode with one upstream output: upstream layer carries
 *         a rendered version of the upstream JSON; surface drops to
 *         a one-line pointer
 *   C6 -- Cache hit on identical re-run: second call is fast + the
 *         on-disk cache file is present
 *
 * Deferred to P6 (auto-reindex pathway):
 *   C5 -- Empty closure on a real unindexed repo. Requires
 *         `ensureNonEmptyClosure` (analyze/context/invariants.ts) +
 *         driver wiring, which are P6 stubs today. Skipped with an
 *         explicit test.todo.
 *
 * Deferred (cost / scope):
 *   C2 -- The monorepo-fixture is `src/insrc` itself (~200 modules).
 *         Running the code-shaper against the entire project is
 *         expected to take 10+ minutes against qwen3.6:35b-a3b and
 *         exercises the same code paths C1/C3 already cover. Marked
 *         test.todo for now; revisit as a separate optional run.
 *
 * Gated behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/context/__tests__/code-shaper.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { _resetAnalyzeConfigCacheForTests } from '../../../config/analyze.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import { shaperFor } from '../index.js';
import { cacheFilePathFor } from '../cache.js';
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
	test('code-shaper.live: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

// ---------------------------------------------------------------------------
// Suite-scoped setup
// ---------------------------------------------------------------------------

let fixtures: FixtureSet;
let lmdbDir:  string;

test.before(async () => {
	if (!GATE) return;
	_resetAnalyzeConfigCacheForTests();
	_resetRegistryForTests();
	registerBuiltinTools();
	fixtures = setupFixtures();

	// Sandbox the LMDB graph store so ensureNonEmptyClosure sees a
	// pristine registry (no repos registered) and skips the invariant
	// silently. Without this, the user's production registry would be
	// visible during tests, and fixture paths under /tmp would fail
	// the longest-prefix containment check -> ScopeNotIndexedError.
	// (P6 design: the invariant only applies to the code shaper; the
	// other shapers fall back to filesystem / DB-driver tools cleanly
	// with an empty graph.)
	await closeGraphStore();
	lmdbDir = join(fixtures.root, 'lmdb-sandbox');
	setGraphStorePath(join(lmdbDir, 'graph.lmdb'));
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	if (fixtures) teardownFixtures(fixtures);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueRunId(label: string): string {
	const suffix = Math.floor(Math.random() * 1e9).toString(16);
	return `live-code-${label}-${suffix}`;
}

async function runCodeShaper(
	scopeValue: string,
	runId:      string,
	scopeKind:  ClassifiedIntent['scopeRef']['kind'] = 'workspace',
	scope:      ClassifiedIntent['scope']            = 'S',
): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('run', 'code');
	const intent: ClassifiedIntent = {
		target:    'code',
		scope,
		focused:   false,
		scopeRef:  { kind: scopeKind, value: scopeValue },
		reasoning: 'code-shaper.live test fixture',
	};
	const inputs: RunShapeInput = { intent };
	const opts:   ShapeOpts     = { runId };
	return shaper.buildRunBundle(inputs, opts);
}

async function runCodeTaskShaper(args: {
	repoPath: string;
	runId:    string;
	template: string;
	params:   Record<string, unknown>;
	upstream: Map<string, unknown>;
}): Promise<AnalyzeContextBundle> {
	const shaper = shaperFor('task', 'code');
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'S',
		focused:   true,
		focus:     `Continue task ${args.template}`,
		scopeRef:  { kind: 'workspace', value: args.repoPath },
		reasoning: 'code-shaper.live task-mode fixture',
	};
	const task: PlannedTask = {
		taskId:    't02',
		template:  args.template,
		kind:      'leaf',
		params:    args.params,
		produces:  ['structural-summary'],
		consumes:  ['exports'],
		rationale: 'code-shaper.live task-mode fixture',
	};
	const template: AnalyzeTaskTemplate = {
		id:       args.template,
		target:   'code',
		family:   'structure',
		kind:     'leaf',
		revision: 'pre-registry',
	};
	const inputs: TaskShapeInput = {
		intent,
		task,
		template,
		upstreamTasks: args.upstream,
	};
	return shaper.buildTaskBundle(inputs, { runId: args.runId });
}

function cleanupRun(runId: string, mode: 'run' | 'task' = 'run'): void {
	const key = mode === 'task'
		? { mode: 'task' as const, taskId: 't02', hash: 'x' }
		: { mode: 'run'  as const, hash: 'x' };
	const path = cacheFilePathFor(runId, key);
	if (existsSync(path)) {
		// eslint-disable-next-line no-empty
		try { rmSync(path); } catch {}
	}
}

// ---------------------------------------------------------------------------
// C1 -- small multi-language repo, run-mode
// ---------------------------------------------------------------------------

test('C1: tiny-multi-lang-repo run-mode -- all 3 languages + all 3 surfaces', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	const runId = uniqueRunId('C1');
	try {
		const bundle = await runCodeShaper(repoPath, runId);
		assert.ok(validateBundle(bundle));

		const haystack = `${bundle.summary}\n${bundle.surface}\n${bundle.structure}`.toLowerCase();

		// Three languages.
		assert.match(haystack, /typescript|\.ts\b/,
			`TypeScript should be acknowledged; got:\n${haystack.slice(0, 800)}`);
		assert.match(haystack, /python|\.py\b/,
			`Python should be acknowledged; got:\n${haystack.slice(0, 800)}`);
		assert.match(haystack, /\bgo\b|golang|\.go\b/,
			`Go should be acknowledged; got:\n${haystack.slice(0, 800)}`);

		// Three surfaces: an export from each file, OR the file
		// names themselves (TS file declares formatName + CLI command
		// `greetCommand` + HTTP route `registerUsersRoute`; Py file
		// has `normalize_email` / `normalize_name`; Go file has the
		// User struct + DisplayName / IsActive). At least one
		// recognizable identifier per file MUST appear in surface or
		// structure.
		const tsHit = /formatname|greetcommand|registerusersroute|index\.ts/.test(haystack);
		const pyHit = /normalize_email|normalize_name|_normalize|compute\.py/.test(haystack);
		const goHit = /\buser\b|displayname|isactive|user\.go/.test(haystack);
		assert.ok(tsHit, `TS surface (export/CLI/route or filename) should appear; got:\n${haystack.slice(0, 1200)}`);
		assert.ok(pyHit, `Py surface (function or filename) should appear; got:\n${haystack.slice(0, 1200)}`);
		assert.ok(goHit, `Go surface (type/method or filename) should appear; got:\n${haystack.slice(0, 1200)}`);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// C2 -- whole monorepo (src/insrc) -- deferred
// ---------------------------------------------------------------------------

test.todo('C2: monorepo-fixture (src/insrc) run-mode -- deferred (cost; covered by C1+C3 paths)');

// ---------------------------------------------------------------------------
// C3 -- single-file scope, run-mode
// ---------------------------------------------------------------------------

test('C3: single-file scope -- surface narrows to that file', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	const tsFile   = join(repoPath, 'index.ts');
	const runId    = uniqueRunId('C3');
	try {
		const bundle = await runCodeShaper(tsFile, runId, 'file', 'XS');
		assert.ok(validateBundle(bundle));

		// The TS file's exports should appear in the surface layer
		// (formatName, greetCommand, registerUsersRoute).
		const surfaceLower = bundle.surface.toLowerCase();
		const tsExports = /formatname|greetcommand|registerusersroute/.test(surfaceLower);
		assert.ok(tsExports,
			`TS file's exports should appear in surface; got:\n${bundle.surface.slice(0, 1200)}`);

		// CITATIONS layer must point at index.ts only -- the structural
		// evidence that the shaper actually consumed the in-scope file
		// without dragging in the others.
		const citesBlock = `${bundle.surface}\n${bundle.structure}\n${bundle.artefacts}`.toLowerCase();
		const cites = citesBlock.match(/cite:[^\n]*?file:\s*'[^']+/g) ?? [];
		assert.ok(cites.length > 0,
			`at least one cite: marker should be present in surface/structure/artefacts`);

		const offScopeCites = cites.filter(c =>
			c.includes('compute.py') || c.includes('user.go') || c.includes('readme'),
		);
		assert.equal(offScopeCites.length, 0,
			`citations should reference only the in-scope file (index.ts); ` +
			`found off-scope cites:\n${offScopeCites.join('\n')}`);

		// surface should NOT carry full per-symbol tables for the other
		// files. Mere mention in summary as "the directory also contains
		// compute.py and user.go" is allowed by the prompt; full per-
		// symbol enumeration in surface is the leak. We accept a soft
		// version of this check: the surface body should not contain
		// BOTH formatName and (normalize_email OR DisplayName) -- if
		// it does, it's enumerating every file's surface.
		const pyEnumeratedInSurface = /normalize_email|normalize_name/.test(surfaceLower);
		const goEnumeratedInSurface = /displayname|isactive/.test(surfaceLower);
		assert.equal(pyEnumeratedInSurface, false,
			`surface enumerates Python exports; got:\n${bundle.surface.slice(0, 1200)}`);
		assert.equal(goEnumeratedInSurface, false,
			`surface enumerates Go methods; got:\n${bundle.surface.slice(0, 1200)}`);
	} finally {
		cleanupRun(runId);
	}
});

// ---------------------------------------------------------------------------
// C4 -- task-mode with one upstream
// ---------------------------------------------------------------------------

test('C4: task-mode with one upstream output -- upstream rendered, surface trimmed', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	const runId = uniqueRunId('C4');
	try {
		// Synthetic upstream output from a hypothetical earlier
		// `code.surface.exports` task. The driver passes this through to
		// the prompt; the shaper renders it into the `upstream` layer.
		const upstream = new Map<string, unknown>([
			['t01', {
				task:    'code.surface.exports',
				exports: [
					{ name: 'formatName',          kind: 'function', file: 'index.ts' },
					{ name: 'greetCommand',        kind: 'function', file: 'index.ts' },
					{ name: 'registerUsersRoute',  kind: 'function', file: 'index.ts' },
				],
			}],
		]);

		const bundle = await runCodeTaskShaper({
			repoPath,
			runId,
			template: 'code.structure.dep-tree',
			params:   { module: 'index.ts' },
			upstream,
		});
		assert.ok(validateBundle(bundle));

		// The upstream layer must contain content rendered from the
		// upstream task: the task id (t01) or at least one of the
		// exported names.
		const upstreamLower = bundle.upstream.toLowerCase();
		assert.ok(
			upstreamLower.length > 0,
			'upstream layer must be non-empty in task-mode with upstreamTasks',
		);
		const rendered =
			/\bt01\b|code\.surface\.exports/.test(upstreamLower) ||
			/formatname/.test(upstreamLower);
		assert.ok(rendered,
			`upstream should render the upstream task's content; got:\n${bundle.upstream.slice(0, 800)}`);

		// surface should be trimmed (one-line pointer pattern). Accept
		// any of: empty, or short (< 200 chars), or contains pointer-y
		// phrasing like "see run-mode" / "see surface" / "covered in run".
		const surfaceTrim =
			bundle.surface.trim().length === 0 ||
			bundle.surface.length < 200 ||
			/see\s+run|covered\s+in|run-mode\s+surface/i.test(bundle.surface);
		assert.ok(surfaceTrim,
			`surface should be trimmed in task-mode; got ${bundle.surface.length} chars:\n${bundle.surface.slice(0, 800)}`);
	} finally {
		cleanupRun(runId, 'task');
	}
});

// ---------------------------------------------------------------------------
// C5 -- empty closure / auto-reindex -- deferred to P6
// ---------------------------------------------------------------------------

test.todo('C5: empty closure on unindexed repo -- requires P6 ensureNonEmptyClosure + driver wiring');

// ---------------------------------------------------------------------------
// C6 -- cache hit on identical re-run
// ---------------------------------------------------------------------------

test('C6: identical re-run hits the run-bundle cache', { skip: !GATE }, async () => {
	const repoPath = realpathSync(fixtures.tinyMultiLangRepo);
	const runId    = uniqueRunId('C6');
	try {
		// First call -- real LLM work.
		const t0 = Date.now();
		const first = await runCodeShaper(repoPath, runId);
		const firstMs = Date.now() - t0;
		assert.ok(validateBundle(first));

		// Cache file present.
		const cachePath = cacheFilePathFor(runId, { mode: 'run', hash: 'x' });
		assert.ok(existsSync(cachePath), `cache file should exist at ${cachePath}`);

		// Second call -- cache hit.
		const t1 = Date.now();
		const second = await runCodeShaper(repoPath, runId);
		const secondMs = Date.now() - t1;
		assert.deepEqual(second, first, 'cached bundle should be byte-identical');

		// Cache hit should be MUCH faster than a fresh LLM call.
		assert.ok(secondMs < 500,
			`second call should be a cache hit (<500ms); got ${secondMs}ms (first=${firstMs}ms)`);
	} finally {
		cleanupRun(runId);
	}
});
