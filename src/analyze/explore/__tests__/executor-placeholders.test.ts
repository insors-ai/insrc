/**
 * plans/exploration-based-context-build.md Phase 1 follow-up:
 * placeholder substitution in the executor. Verifies that string
 * params like `$e1.hits[0].path` are resolved against prior
 * exploration outputs BEFORE the runner sees them.
 *
 * Live-test bug found on insors-extraction: without substitution,
 * `module.profile` received the literal string `"$e1.hits[0].path"`
 * and stat-failed. This test suite pins the fix.
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
	executePlan,
} from '../executor.js';
import type {
	Exploration,
	ExplorationOutput,
	ExplorationPlan,
	ExplorationRunner,
} from '../types.js';

const REPO = '/repo/alpha';
const NOW = '2026-07-11T10:00:00.000Z';
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

let savedRunners: Record<string, ExplorationRunner | undefined> = {};

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-explore-placeholders-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await registerRepo(REPO);
	savedRunners = {
		'concept.resolve': _getRunnersForTest()['concept.resolve'],
		'module.profile':  _getRunnersForTest()['module.profile'],
		'symbol.locate':   _getRunnersForTest()['symbol.locate'],
	};
});

test.afterEach(async () => {
	for (const [type, runner] of Object.entries(savedRunners)) {
		_overrideRunnerForTest(type as never, runner);
	}
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Basic .field access
// ---------------------------------------------------------------------------

test('$e1.field resolves to prior output field', async () => {
	_overrideRunnerForTest('concept.resolve', async () => ({
		type:  'concept.resolve',
		query: 'foo',
		hits:  [{ kind: 'dir', path: '/resolved/path', name: 'foo', score: 0.9,
			diagnostics: { tokenMatch: 0.9, pathDepth: 2 } }],
	}));
	let sawPath: unknown;
	_overrideRunnerForTest('module.profile', async (exp) => {
		sawPath = (exp.params as { path: unknown }).path;
		return {
			type: 'failed', requested: 'module.profile',
			errorCode: 'ok', message: 'test-only',
		} as ExplorationOutput;
	});

	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', params: { query: 'foo' } }),
			makeExp({
				id: 'e2', type: 'module.profile', dependsOn: ['e1'],
				params: { path: '$e1.hits[0].path' },
			}),
		],
	};
	await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.equal(sawPath, '/resolved/path');
});

// ---------------------------------------------------------------------------
// Range accessor -> array
// ---------------------------------------------------------------------------

test('$eN.field[0..2] returns an array of items', async () => {
	_overrideRunnerForTest('module.profile', async () => ({
		type: 'module.profile',
		profile: {
			path: '/x', kind: 'dir',
			subdirs: [], filesInDir: [], entrypoints: [],
			exports: ['alpha', 'bravo', 'charlie', 'delta'],
			entityCount: 4, totalBytes: 100,
		},
	}));
	let sawNames: unknown;
	_overrideRunnerForTest('symbol.locate', async (exp) => {
		sawNames = (exp.params as { names: unknown }).names;
		return { type: 'symbol.locate', names: [], hits: [] };
	});

	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', type: 'module.profile', params: { path: '/x' } }),
			makeExp({
				id: 'e2', type: 'symbol.locate', dependsOn: ['e1'],
				params: { names: '$e1.profile.exports[0..2]' },
			}),
		],
	};
	await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.deepEqual(sawNames, ['alpha', 'bravo', 'charlie']);
});

// ---------------------------------------------------------------------------
// Unresolved placeholder -> skip runner + emit prerequisite-empty diagnostic
// ---------------------------------------------------------------------------

test('placeholder referencing unknown dep skips the runner cleanly', async () => {
	let sawPath: unknown = 'unset';
	_overrideRunnerForTest('module.profile', async (exp) => {
		sawPath = (exp.params as { path: unknown }).path;
		return {
			type: 'failed', requested: 'module.profile',
			errorCode: 'ok', message: 'test-only',
		} as ExplorationOutput;
	});

	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			// No e1 defined; e2 references it
			makeExp({
				id: 'e2', type: 'module.profile',
				params: { path: '$e1.hits[0].path' },
			}),
		],
	};
	const executed = await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	// Runner MUST NOT have been called -- the executor detected the
	// unmet prerequisite and skipped straight to a failed output.
	assert.equal(sawPath, 'unset');
	assert.equal(executed.results.length, 1);
	const out = executed.results[0]!.output;
	assert.equal(out.type, 'failed');
	if (out.type === 'failed') {
		assert.equal(out.errorCode, 'prerequisite-empty');
		assert.match(out.message, /\$e1\.hits\[0\]\.path/);
	}
});

test('placeholder with out-of-range index skips the runner cleanly', async () => {
	_overrideRunnerForTest('concept.resolve', async () => ({
		type: 'concept.resolve', query: 'foo',
		hits: [{ kind: 'dir', path: '/a', name: 'a', score: 0.9,
			diagnostics: { tokenMatch: 0.9, pathDepth: 1 } }],
	}));
	let sawPath: unknown = 'unset';
	_overrideRunnerForTest('module.profile', async (exp) => {
		sawPath = (exp.params as { path: unknown }).path;
		return {
			type: 'failed', requested: 'module.profile',
			errorCode: 'ok', message: 'test-only',
		} as ExplorationOutput;
	});

	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', params: { query: 'foo' } }),
			makeExp({
				id: 'e2', type: 'module.profile', dependsOn: ['e1'],
				params: { path: '$e1.hits[5].path' },  // index 5 doesn't exist
			}),
		],
	};
	const executed = await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.equal(sawPath, 'unset');
	const profileResult = executed.results.find(r => r.exploration.type === 'module.profile');
	assert.ok(profileResult !== undefined, 'module.profile result should be present');
	assert.equal(profileResult.output.type, 'failed');
	if (profileResult.output.type === 'failed') {
		assert.equal(profileResult.output.errorCode, 'prerequisite-empty');
	}
});

// ---------------------------------------------------------------------------
// Placeholder resolves to empty array (dependent output legitimately empty)
// -> skip the runner cleanly.
// The live-test motivation: capability-discovery recipe emits
// `symbol.locate(names=$e3.profile.exports[0..3])` and when the winning
// module's __init__.py has no top-level exports the array resolves
// empty. Before this behavior we let symbol.locate throw "names is
// required (non-empty string[])" and surfaced that as a `failed`
// output with a runtime message -- confusing readers.
// ---------------------------------------------------------------------------

test('placeholder resolves to empty array -> runner is skipped, not called', async () => {
	_overrideRunnerForTest('module.profile', async () => ({
		type: 'module.profile',
		profile: {
			path: '/x', kind: 'dir',
			subdirs: [], filesInDir: [], entrypoints: [],
			exports: [],  // <- empty
			entityCount: 4, totalBytes: 100,
		},
	}));
	let sawNames: unknown = 'unset';
	_overrideRunnerForTest('symbol.locate', async (exp) => {
		sawNames = (exp.params as { names: unknown }).names;
		return { type: 'symbol.locate', names: [], hits: [] };
	});

	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', type: 'module.profile', params: { path: '/x' } }),
			makeExp({
				id: 'e2', type: 'symbol.locate', dependsOn: ['e1'],
				params: { names: '$e1.profile.exports[0..3]' },
			}),
		],
	};
	const executed = await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});

	// The symbol.locate runner MUST NOT be invoked when the prerequisite
	// resolves to an empty array. It should carry a failed output with
	// errorCode='prerequisite-empty' so the synthesizer renders a
	// clean diagnostic instead of a runtime error.
	assert.equal(sawNames, 'unset');
	const locateResult = executed.results.find(r => r.exploration.type === 'symbol.locate');
	assert.ok(locateResult !== undefined, 'symbol.locate result should be present');
	assert.equal(locateResult.output.type, 'failed');
	if (locateResult.output.type === 'failed') {
		assert.equal(locateResult.output.errorCode, 'prerequisite-empty');
		assert.match(locateResult.output.message, /\$e1\.profile\.exports\[0\.\.3\]/);
	}
});

// ---------------------------------------------------------------------------
// Non-placeholder strings pass through untouched
// ---------------------------------------------------------------------------

test('literal string params (not $e-prefixed) pass through verbatim', async () => {
	let sawPath: unknown;
	_overrideRunnerForTest('module.profile', async (exp) => {
		sawPath = (exp.params as { path: unknown }).path;
		return {
			type: 'failed', requested: 'module.profile',
			errorCode: 'ok', message: 'test-only',
		} as ExplorationOutput;
	});
	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', type: 'module.profile', params: { path: '/literal/path' } }),
		],
	};
	await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	assert.equal(sawPath, '/literal/path');
});

// ---------------------------------------------------------------------------
// Nested params: substitution recurses into arrays + objects
// ---------------------------------------------------------------------------

test('substitution recurses into nested arrays + objects', async () => {
	_overrideRunnerForTest('concept.resolve', async () => ({
		type: 'concept.resolve', query: 'foo',
		hits: [{ kind: 'dir', path: '/first', name: 'a', score: 1,
			diagnostics: { tokenMatch: 1, pathDepth: 1 } }],
	}));
	let seenParams: unknown;
	_overrideRunnerForTest('module.profile', async (exp) => {
		seenParams = exp.params;
		return {
			type: 'failed', requested: 'module.profile',
			errorCode: 'ok', message: 'test-only',
		} as ExplorationOutput;
	});
	const plan: ExplorationPlan = {
		answerType: 'structural-map',
		synthesisHint: 'test',
		explorations: [
			makeExp({ id: 'e1', params: { query: 'foo' } }),
			makeExp({
				id: 'e2', type: 'module.profile', dependsOn: ['e1'],
				params: {
					options: {
						root: '$e1.hits[0].path',
						fixed: 'literal',
						list: ['$e1.hits[0].name', 'other'],
					},
				},
			}),
		],
	};
	await executePlan({
		runId: 'r', repoPath: REPO, closureRepos: [REPO],
		repoLastIndexedAtMs: 1n, plan,
	});
	const p = seenParams as { options: { root: string; fixed: string; list: unknown[] } };
	assert.equal(p.options.root, '/first');
	assert.equal(p.options.fixed, 'literal');
	assert.deepEqual(p.options.list, ['a', 'other']);
});
