/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * code.discovery.modules runtime tests.
 *
 * Two halves:
 *   1. Pure-helper unit tests (no graph, always run): scopeRef
 *      reading + repo path resolution + bootstrap registration.
 *   2. Integration tests with a sandboxed LMDB graph store. These
 *      seed the graph with hand-built `Entity` rows (mix of
 *      kind='module' and kind='function') under a registered
 *      repo, then call the runtime against that repo's scopeRef
 *      and assert the modules output matches the seeded modules
 *      (deduplicated, sorted by path).
 *
 *      Gated behind INSRC_LIVE_TESTS=1 -- LMDB native bindings +
 *      the sandbox setup are heavier than a pure unit test, and
 *      we want the same INSRC_LIVE_TESTS gating story other
 *      graph-touching tests already use.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/runtimes/code/__tests__/discovery-modules.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	closeGraphStore,
	setGraphStorePath,
} from '../../../../db/graph/store.js';
import { addRepo } from '../../../../db/repos.js';
import { upsertEntities } from '../../../../db/entities.js';
import { getDb } from '../../../../db/client.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';

import {
	_readScopeRefForTest,
	_resolveRepoPathForTest,
	codeDiscoveryModulesRuntime,
} from '../discovery-modules.js';
import {
	_resetRuntimeBootstrapLatchForTests,
	registerBuiltinRuntimes,
} from '../../bootstrap.js';
import {
	getRuntime,
	listRegisteredRuntimes,
} from '../../../executor/registry.js';
import type {
	PlannedTask,
	TemplateExecuteArgs,
} from '../../../executor/types.js';
import type { ClassifiedIntent, Entity } from '../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure-helper unit tests (always run)
// ---------------------------------------------------------------------------

function mkTask(params: Record<string, unknown>): PlannedTask {
	return {
		taskId:    't01',
		template:  'code.discovery.modules',
		kind:      'leaf',
		params,
		produces:  ['modules'],
		rationale: 'discovery-modules runtime test fixture',
	};
}

function mkArgs(task: PlannedTask): TemplateExecuteArgs {
	return {
		task,
		intent: {
			target:    'code',
			scope:     'XS',
			focused:   false,
			scopeRef:  { kind: 'repo', value: '/r' },
			reasoning: 'discovery-modules runtime test',
		},
		upstreamOutputs: new Map(),
		runId:           'rt-test',
	};
}

test('readScopeRef: well-formed scopeRef -> returned verbatim', () => {
	const sr = _readScopeRefForTest(mkArgs(mkTask({ scopeRef: { kind: 'repo', value: '/r' } })), 'code.discovery.modules');
	assert.deepEqual(sr, { kind: 'repo', value: '/r' });
});

test('readScopeRef: missing scopeRef -> throws with INV-5 message', () => {
	assert.throws(
		() => _readScopeRefForTest(mkArgs(mkTask({})), 'code.discovery.modules'),
		/scopeRef missing/,
	);
});

test('readScopeRef: scopeRef with wrong shape -> throws', () => {
	assert.throws(
		() => _readScopeRefForTest(mkArgs(mkTask({ scopeRef: { kind: 1, value: 'x' } })), 'code.discovery.modules'),
		/wrong shape/,
	);
});

test('resolveRepoPath: repo kind -> value passthrough', () => {
	assert.equal(_resolveRepoPathForTest({ kind: 'repo', value: '/r' }, 'code.discovery.modules'), '/r');
});

test('resolveRepoPath: manifest-dir kind -> value passthrough', () => {
	assert.equal(_resolveRepoPathForTest({ kind: 'manifest-dir', value: '/r/mod' }, 'code.discovery.modules'), '/r/mod');
});

test('resolveRepoPath: unsupported kind -> throws with supported-list hint', () => {
	assert.throws(
		() => _resolveRepoPathForTest({ kind: 'symbol', value: 'foo' }, 'code.discovery.modules'),
		/not supported yet.*repo, manifest-dir/,
	);
});

// ---------------------------------------------------------------------------
// Bootstrap registration (always runs)
// ---------------------------------------------------------------------------

test('registerBuiltinRuntimes registers code.discovery.modules; idempotent', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	assert.notEqual(getRuntime('code.discovery.modules'), undefined);

	// Second call is a no-op (latched).
	assert.doesNotThrow(() => registerBuiltinRuntimes());
	assert.notEqual(getRuntime('code.discovery.modules'), undefined);

	const ids = listRegisteredRuntimes();
	assert.ok(ids.includes('code.discovery.modules'));
});

test('registerBuiltinRuntimes: after reset, re-registers without collision', () => {
	_resetRuntimeBootstrapLatchForTests();
	assert.doesNotThrow(() => registerBuiltinRuntimes());
});

// ---------------------------------------------------------------------------
// Integration tests (gated behind INSRC_LIVE_TESTS=1)
//
// Uses a per-test sandboxed LMDB store. Seeds a repo registry row +
// a handful of entities (mix of modules + functions), then runs the
// runtime against the registered repo's path.
// ---------------------------------------------------------------------------

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('code.discovery.modules integration: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

let sandboxDir: string;

test.before(async () => {
	if (!GATE) return;
	sandboxDir = mkdtempSync(join(tmpdir(), 'rt-discovery-modules-'));
	await closeGraphStore();
	setGraphStorePath(join(sandboxDir, 'graph.lmdb'));
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	if (sandboxDir) {
		try { rmSync(sandboxDir, { recursive: true, force: true }); }
		catch { /* best-effort */ }
	}
});

async function seedFixtureRepoWithModules(
	repoPath:    string,
	moduleNames: readonly string[],
	extraFuncs:  readonly string[] = [],
): Promise<void> {
	const db = await getDb();
	await addRepo(db, {
		kind:    'workspace',
		path:    repoPath,
		name:    repoPath.split('/').pop()!,
		addedAt: new Date(0).toISOString(),
		status:  'ready',
	});

	const entities: Entity[] = [];
	for (const mod of moduleNames) {
		const file = `${repoPath}/${mod}/package.json`;
		entities.push({
			id:        makeEntityId(repoPath, file, 'module', mod),
			kind:      'module',
			name:      mod,
			language:  'typescript',
			repoId:    0,                       // set by upsertEntities lookup
			repo:      repoPath,
			file,
			startLine: 1,
			endLine:   1,
			body:      '',
			embedding: [],
			indexedAt: new Date(0).toISOString(),
		});
	}
	for (const fn of extraFuncs) {
		const file = `${repoPath}/src/${fn}.ts`;
		entities.push({
			id:        makeEntityId(repoPath, file, 'function', fn),
			kind:      'function',
			name:      fn,
			language:  'typescript',
			repoId:    0,
			repo:      repoPath,
			file,
			startLine: 1,
			endLine:   3,
			body:      `export function ${fn}() {}`,
			embedding: [],
			indexedAt: new Date(0).toISOString(),
		});
	}
	await upsertEntities(db, entities);
}

test('integration: seeded 3 modules + 2 functions -> outputs only the 3 modules, sorted by path',
{ skip: !GATE }, async () => {
	const repoPath = '/synthetic/rt-test-repo-1';
	await seedFixtureRepoWithModules(
		repoPath,
		['z-package', 'a-package', 'mid-package'],
		['helperA', 'helperB'],
	);

	const result = await codeDiscoveryModulesRuntime.execute({
		task: mkTask({ scopeRef: { kind: 'repo', value: repoPath } }),
		intent: {
			target:    'code',
			scope:     'XS',
			focused:   false,
			scopeRef:  { kind: 'repo', value: repoPath },
			reasoning: 'integration test',
		},
		upstreamOutputs: new Map(),
		runId:           'rt-integration-1',
	});

	const modules = result.outputs.get('modules') as Array<{
		name: string; path: string; repo: string; entityId: string;
	}>;
	assert.ok(Array.isArray(modules));
	assert.equal(modules.length, 3);

	// Sorted by path ascending. With our path scheme this happens
	// to also be alphabetical by module name.
	assert.deepEqual(modules.map(m => m.name), ['a-package', 'mid-package', 'z-package']);
	for (const m of modules) {
		assert.equal(m.repo, repoPath);
		assert.ok(m.path.startsWith(repoPath));
		assert.equal(m.entityId.length, 32);
	}
});

test('integration: repo with zero modules -> empty array, not error',
{ skip: !GATE }, async () => {
	const repoPath = '/synthetic/rt-test-repo-2';
	// Seed only functions, no modules.
	await seedFixtureRepoWithModules(repoPath, [], ['onlyFn']);

	const result = await codeDiscoveryModulesRuntime.execute({
		task: mkTask({ scopeRef: { kind: 'repo', value: repoPath } }),
		intent: {
			target:    'code',
			scope:     'XS',
			focused:   false,
			scopeRef:  { kind: 'repo', value: repoPath },
			reasoning: 'integration test',
		},
		upstreamOutputs: new Map(),
		runId:           'rt-integration-2',
	});

	const modules = result.outputs.get('modules');
	assert.deepEqual(modules, []);
});

test('integration: manifest-dir scopeRef -> resolved to repo path',
{ skip: !GATE }, async () => {
	const repoPath = '/synthetic/rt-test-repo-3';
	await seedFixtureRepoWithModules(repoPath, ['only-mod'], []);

	const result = await codeDiscoveryModulesRuntime.execute({
		task: mkTask({ scopeRef: { kind: 'manifest-dir', value: repoPath } }),
		intent: {
			target:    'code',
			scope:     'XS',
			focused:   false,
			scopeRef:  { kind: 'manifest-dir', value: repoPath },
			reasoning: 'integration test',
		},
		upstreamOutputs: new Map(),
		runId:           'rt-integration-3',
	});

	const modules = result.outputs.get('modules') as Array<{ name: string }>;
	assert.equal(modules.length, 1);
	assert.equal(modules[0]!.name, 'only-mod');
});

test('integration: unsupported scopeRef.kind (symbol) -> runtime throws',
{ skip: !GATE }, async () => {
	await assert.rejects(
		codeDiscoveryModulesRuntime.execute({
			task: mkTask({ scopeRef: { kind: 'symbol', value: 'foo' } }),
			intent: {
				target:    'code',
				scope:     'XS',
				focused:   false,
				scopeRef:  { kind: 'symbol', value: 'foo' },
				reasoning: 'integration test',
			},
			upstreamOutputs: new Map(),
			runId:           'rt-integration-4',
		}),
		/not supported yet/,
	);
});
