/**
 * plans/exploration-based-context-build.md Section 3. Executor
 * tests: dispatch, dependency resolution, cache hits, failure
 * handling, unsupported-type diagnostics.
 *
 * Uses a seeded LMDB fixture + registers a repo. The runner
 * registry is overridden with a stub so we don't have to seed
 * entities for every test.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { RegisteredRepo } from '../../../shared/types.js';

import {
	_getRunnersForTest,
	_overrideRunnerForTest,
} from '../executor.js';
import { executePlan } from '../executor.js';
import type {
	Exploration,
	ExplorationOutput,
	ExplorationPlan,
	ExplorationRunner,
} from '../types.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-10T10:00:00.000Z';
let dir: string;

async function registerRepo(path: string): Promise<void> {
	const r: RegisteredRepo = {
		path, name: '', addedAt: NOW, status: 'pending',
	};
	await addRepo(null, r);
}

function makeExp(overrides: Partial<Exploration> = {}): Exploration {
	return {
		id:      overrides.id      ?? 'e1',
		type:    overrides.type    ?? 'concept.resolve',
		purpose: overrides.purpose ?? 'test',
		params:  overrides.params  ?? {},
		...(overrides.dependsOn !== undefined ? { dependsOn: overrides.dependsOn } : {}),
	};
}

// Save + restore per-test: some tests replace runners; restore
// keeps other test files' assumptions intact.
let savedConceptResolve: ExplorationRunner | undefined;
let savedSymbolLocate:   ExplorationRunner | undefined;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-explore-executor-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await registerRepo(REPO);
	savedConceptResolve = _getRunnersForTest()['concept.resolve'];
	savedSymbolLocate   = _getRunnersForTest()['symbol.locate'];
});

test.afterEach(async () => {
	_overrideRunnerForTest('concept.resolve', savedConceptResolve);
	_overrideRunnerForTest('symbol.locate',   savedSymbolLocate);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

test('executor dispatches to the registered runner', async () => {
	let called = false;
	_overrideRunnerForTest('concept.resolve', async () => {
		called = true;
		return {
			type: 'concept.resolve',
			query: 'stub',
			hits: [],
		};
	});
	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [makeExp({ params: { query: 'foo' } })],
	};
	await executePlan({
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.ok(called);
});

// ---------------------------------------------------------------------------
// Unsupported type handling
// ---------------------------------------------------------------------------

test('unsupported exploration type produces a diagnostic output', async () => {
	// Phase 6 filled the last catalog gap (`freeform.probe` is now
	// registered). Every declared ExplorationType has a runner. This
	// test exercises the executor's diagnostic path for a type that
	// is NOT in the type union at all -- cast through `unknown` so
	// TypeScript doesn't reject the fake. The RUNNERS lookup returns
	// undefined for it -> `unsupported` output surfaces.
	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [makeExp({ type: 'never.registered' as unknown as Exploration['type'] })],
	};
	const executed = await executePlan({
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	const out = executed.results[0]!.output;
	assert.equal(out.type, 'unsupported');
	if (out.type === 'unsupported') {
		assert.equal(out.requested, 'never.registered');
	}
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

test('runner throw produces a `failed` output; does not stop the plan', async () => {
	_overrideRunnerForTest('concept.resolve', async () => {
		throw new Error('boom: something in the params is required');
	});
	_overrideRunnerForTest('symbol.locate', async () => ({
		type: 'symbol.locate', names: ['x'], hits: [],
	}));
	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [
			makeExp({ id: 'e1' }),
			makeExp({ id: 'e2', type: 'symbol.locate' }),
		],
	};
	const executed = await executePlan({
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	// e1 = failed
	assert.equal(executed.results[0]!.output.type, 'failed');
	if (executed.results[0]!.output.type === 'failed') {
		assert.equal(executed.results[0]!.output.errorCode, 'invalid-params');
	}
	// e2 = ran anyway
	assert.equal(executed.results[1]!.output.type, 'symbol.locate');
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

test('deterministic exploration is cached across executions', async () => {
	let callCount = 0;
	_overrideRunnerForTest('concept.resolve', async () => {
		callCount += 1;
		return { type: 'concept.resolve', query: 'foo', hits: [] } as ExplorationOutput;
	});
	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [makeExp({ params: { query: 'foo' } })],
	};
	// First run: miss + write.
	const first = await executePlan({
		runId: 'r1', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.equal(callCount, 1);
	assert.equal(first.results[0]!.cached, false);

	// Second run: hit.
	const second = await executePlan({
		runId: 'r2', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.equal(callCount, 1, 'runner should not be called again on cache hit');
	assert.equal(second.results[0]!.cached, true);
});

test('lastIndexedAt bump invalidates the cache', async () => {
	let callCount = 0;
	_overrideRunnerForTest('concept.resolve', async () => {
		callCount += 1;
		return { type: 'concept.resolve', query: 'foo', hits: [] } as ExplorationOutput;
	});
	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [makeExp({ params: { query: 'foo' } })],
	};
	await executePlan({
		runId: 'r1', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	await executePlan({
		runId: 'r2', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 2n, plan,
	});
	assert.equal(callCount, 2);
});

// ---------------------------------------------------------------------------
// Dependency resolution via readDep
// ---------------------------------------------------------------------------

test('readDep exposes prior exploration outputs to later runners', async () => {
	let seenDep: ExplorationOutput | undefined;
	_overrideRunnerForTest('concept.resolve', async () => ({
		type:  'concept.resolve',
		query: 'foo',
		hits:  [{
			kind:  'dir',
			path:  '/repo/alpha/insors/extraction/payable',
			name:  'payable',
			score: 0.9,
			diagnostics: { tokenMatch: 0.9, pathDepth: 3 },
		}],
	}));
	_overrideRunnerForTest('symbol.locate', async (_exp, ctx) => {
		seenDep = ctx.readDep('e1');
		return { type: 'symbol.locate', names: ['x'], hits: [] };
	});

	const plan: ExplorationPlan = {
		answerType:    'structural-map',
		synthesisHint: 'test',
		explorations:  [
			makeExp({ id: 'e1', params: { query: 'foo' } }),
			makeExp({ id: 'e2', type: 'symbol.locate', dependsOn: ['e1'] }),
		],
	};
	await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.ok(seenDep !== undefined);
	assert.equal(seenDep!.type, 'concept.resolve');
});
