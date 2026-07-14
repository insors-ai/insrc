/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the three deterministic code-target runtimes:
 *   - code.discovery.entrypoints
 *   - code.surface.functional
 *   - code.structure.module-tree
 *
 * Two halves:
 *   1. Pure-helper unit tests for _shared.ts (compareEntitiesByLocation
 *      + modulePrefixOf). Always run.
 *   2. Integration tests against a sandboxed LMDB graph store with
 *      a hand-seeded fixture (one repo, two modules, a mix of
 *      exported / internal functions, a single IMPORTS edge between
 *      modules). Gated INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH INSRC_LIVE_TESTS=1 \
 *     npx tsx --test \
 *     src/insrc/analyze/runtimes/code/__tests__/deterministic-runtimes.test.ts
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
import { upsertRelations } from '../../../../db/relations.js';
import { getDb } from '../../../../db/client.js';
import { makeEntityId } from '../../../../indexer/parser/base.js';

import { codeDiscoveryEntrypointsRuntime } from '../discovery-entrypoints.js';
import { codeSurfaceFunctionalRuntime    } from '../surface-functional.js';
import { codeStructureModuleTreeRuntime  } from '../structure-module-tree.js';
import {
	compareEntitiesByLocation,
	modulePrefixOf,
} from '../_shared.js';
import type {
	PlannedTask,
	TemplateExecuteArgs,
} from '../../../executor/types.js';
import type {
	ClassifiedIntent,
	Entity,
	Relation,
} from '../../../../shared/types.js';

// ---------------------------------------------------------------------------
// Pure helpers (always run)
// ---------------------------------------------------------------------------

test('modulePrefixOf: includes trailing slash for nested paths', () => {
	assert.equal(modulePrefixOf('/r/m/package.json'), '/r/m/');
});

test('modulePrefixOf: root-level path (no slash) returns input', () => {
	assert.equal(modulePrefixOf('package.json'), 'package.json');
});

test('compareEntitiesByLocation: file then startLine then name', () => {
	const mk = (file: string, startLine: number, name: string): Entity => ({
		id:        'x', kind: 'function', name, language: 'typescript',
		repoId:    0,   repo: '/r', file, startLine, endLine: startLine + 1,
		body: '', embedding: [], indexedAt: '1970-01-01T00:00:00.000Z',
	});
	const a = mk('/r/a.ts', 10, 'a');
	const b = mk('/r/a.ts', 20, 'b');
	const c = mk('/r/b.ts', 5,  'a');
	const d = mk('/r/a.ts', 10, 'aa');
	const sorted = [c, b, a, d].sort(compareEntitiesByLocation);
	assert.deepEqual(sorted.map(e => `${e.file}:${e.startLine}:${e.name}`),
		['/r/a.ts:10:a', '/r/a.ts:10:aa', '/r/a.ts:20:b', '/r/b.ts:5:a']);
});

// ---------------------------------------------------------------------------
// Integration: seeded LMDB graph
// ---------------------------------------------------------------------------

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
if (!GATE) {
	test('code deterministic runtimes integration: skipped (set INSRC_LIVE_TESTS=1)', { skip: true }, () => {});
}

let sandboxDir: string;
let repoPath:   string;
let moduleAId:  string;
let moduleBId:  string;
let fileA1Id:   string;
let fileB1Id:   string;

// Synthetic intent + task helpers
const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'XS',
	focused:   false,
	scopeRef:  { kind: 'repo', value: '/synthetic/det-test-repo' },
	reasoning: 'deterministic runtimes integration test',
};

function mkTask(
	templateId: string,
	params:     Record<string, unknown>,
	produces:   string[],
): PlannedTask {
	return {
		taskId:   't01',
		template: templateId,
		kind:     'leaf',
		params,
		produces,
		rationale: `${templateId} integration test`,
	};
}

function mkArgs(task: PlannedTask, runId: string): TemplateExecuteArgs {
	return {
		task,
		intent:          INTENT,
		upstreamOutputs: new Map(),
		runId,
	};
}

test.before(async () => {
	if (!GATE) return;

	sandboxDir = mkdtempSync(join(tmpdir(), 'rt-det-'));
	await closeGraphStore();
	setGraphStorePath(join(sandboxDir, 'graph.lmdb'));

	repoPath = '/synthetic/det-test-repo';
	const db = await getDb();
	await addRepo(db, {
		kind:    'workspace',
		path:    repoPath,
		name:    'det-test-repo',
		addedAt: new Date(0).toISOString(),
		status:  'ready',
	});

	// Fixture: 2 modules (mod-a, mod-b). Each owns one file (a1.ts, b1.ts).
	// mod-a exports `formatName`. mod-a has internal helper `_normalize`.
	// mod-b exports `User`. mod-b's b1.ts IMPORTS mod-a's a1.ts.
	const baseTimestamp = new Date(0).toISOString();
	const mkEntity = (
		file: string, kind: Entity['kind'], name: string,
		opts: Partial<Pick<Entity, 'isExported' | 'signature' | 'startLine' | 'endLine'>> = {},
	): Entity => ({
		id:        makeEntityId(repoPath, file, kind, name),
		kind,
		name,
		language:  'typescript',
		repoId:    0,
		repo:      repoPath,
		file,
		startLine: opts.startLine ?? 1,
		endLine:   opts.endLine   ?? (opts.startLine ?? 1) + 2,
		body:      `export function ${name}() { /* fixture */ }`,
		embedding: [],
		indexedAt: baseTimestamp,
		...(opts.isExported !== undefined ? { isExported: opts.isExported } : {}),
		...(opts.signature  !== undefined ? { signature: opts.signature   } : {}),
	});

	// Modules + their manifest "files".
	const modA = mkEntity(`${repoPath}/mod-a/package.json`, 'module', 'mod-a');
	const modB = mkEntity(`${repoPath}/mod-b/package.json`, 'module', 'mod-b');
	moduleAId = modA.id;
	moduleBId = modB.id;

	// Files (kind='file') in each module. These are the IMPORTS edge endpoints.
	const fileA1 = mkEntity(`${repoPath}/mod-a/a1.ts`, 'file', 'a1.ts');
	const fileB1 = mkEntity(`${repoPath}/mod-b/b1.ts`, 'file', 'b1.ts');
	fileA1Id = fileA1.id;
	fileB1Id = fileB1.id;

	// Symbols.
	const formatName = mkEntity(`${repoPath}/mod-a/a1.ts`, 'function', 'formatName',
		{ isExported: true, signature: 'formatName(first: string, last: string): string', startLine: 10 });
	const normalize = mkEntity(`${repoPath}/mod-a/a1.ts`, 'function', '_normalize',
		{ isExported: false, startLine: 5 });
	const userClass = mkEntity(`${repoPath}/mod-b/b1.ts`, 'class', 'User',
		{ isExported: true, signature: 'class User', startLine: 1 });
	// A non-exported method on the class -- exercises kind='method' filter.
	const userDisplayName = mkEntity(`${repoPath}/mod-b/b1.ts`, 'method', 'User.displayName',
		{ isExported: false, signature: 'displayName(): string', startLine: 4 });

	await upsertEntities(db, [
		modA, modB,
		fileA1, fileB1,
		formatName, normalize,
		userClass, userDisplayName,
	]);

	// IMPORTS edge: b1.ts -> a1.ts (mod-b depends on mod-a).
	const rels: Relation[] = [
		{ kind: 'IMPORTS', from: fileB1.id, to: fileA1.id, resolved: true },
	];
	await upsertRelations(db, rels);
});

test.after(async () => {
	if (!GATE) return;
	await closeGraphStore();
	if (sandboxDir) {
		try { rmSync(sandboxDir, { recursive: true, force: true }); }
		catch { /* best-effort */ }
	}
});

// ---------------------------------------------------------------------------
// code.discovery.entrypoints
// ---------------------------------------------------------------------------

test('discovery.entrypoints: lists only exported functions/methods/classes, sorted by location',
{ skip: !GATE }, async () => {
	const task = mkTask('code.discovery.entrypoints',
		{ scopeRef: { kind: 'repo', value: repoPath } },
		['entrypoints']);
	const result = await codeDiscoveryEntrypointsRuntime.execute(mkArgs(task, 'rt-det-entry-1'));

	const entrypoints = result.outputs.get('entrypoints') as Array<{
		name: string; kind: string; file: string; startLine: number;
		entityId: string; signature?: string;
	}>;
	assert.ok(Array.isArray(entrypoints));

	// Only the EXPORTED function (formatName) + the EXPORTED class (User)
	// qualify. _normalize (not exported) + User.displayName (not exported)
	// drop out. The module entities themselves are kind='module' and don't
	// qualify either.
	assert.deepEqual(entrypoints.map(e => e.name), ['formatName', 'User']);
	for (const e of entrypoints) {
		assert.equal(e.entityId.length, 32);
	}
	const formatName = entrypoints[0]!;
	assert.equal(formatName.signature, 'formatName(first: string, last: string): string');
});

// ---------------------------------------------------------------------------
// code.surface.functional
// ---------------------------------------------------------------------------

test('surface.functional: splits exports vs internalHelpers for a single module',
{ skip: !GATE }, async () => {
	const task = mkTask('code.surface.functional',
		{ module: moduleAId },
		['functional-surface']);
	const result = await codeSurfaceFunctionalRuntime.execute(mkArgs(task, 'rt-det-surf-1'));

	const surface = result.outputs.get('functional-surface') as {
		module: { name: string; entityId: string };
		exports: Array<{ name: string; kind: string }>;
		internalHelpers: Array<{ name: string; kind: string }>;
	};
	assert.equal(surface.module.name, 'mod-a');
	assert.equal(surface.module.entityId, moduleAId);

	// mod-a has exported `formatName` + internal `_normalize`.
	assert.deepEqual(surface.exports.map(s => s.name), ['formatName']);
	assert.deepEqual(surface.internalHelpers.map(s => s.name), ['_normalize']);

	// mod-b's symbols MUST NOT appear in mod-a's surface.
	for (const s of [...surface.exports, ...surface.internalHelpers]) {
		assert.equal(s.name === 'User' || s.name === 'User.displayName', false);
	}
});

test('surface.functional: shallow depth omits body, deep includes it',
{ skip: !GATE }, async () => {
	const shallow = await codeSurfaceFunctionalRuntime.execute(mkArgs(
		mkTask('code.surface.functional',
			{ module: moduleAId, depth: 'shallow' },
			['functional-surface']),
		'rt-det-surf-shallow'));
	const sshallow = shallow.outputs.get('functional-surface') as {
		exports: Array<{ name: string; body?: string }>;
	};
	for (const s of sshallow.exports) {
		assert.equal(s.body, undefined, `shallow should omit body for ${s.name}`);
	}

	const deep = await codeSurfaceFunctionalRuntime.execute(mkArgs(
		mkTask('code.surface.functional',
			{ module: moduleAId, depth: 'deep' },
			['functional-surface']),
		'rt-det-surf-deep'));
	const sdeep = deep.outputs.get('functional-surface') as {
		exports: Array<{ name: string; body?: string }>;
	};
	for (const s of sdeep.exports) {
		assert.ok(typeof s.body === 'string', `deep should include body for ${s.name}`);
	}
});

test('surface.functional: unknown module entity id -> throws',
{ skip: !GATE }, async () => {
	const task = mkTask('code.surface.functional',
		{ module: '0'.repeat(32) },
		['functional-surface']);
	await assert.rejects(
		codeSurfaceFunctionalRuntime.execute(mkArgs(task, 'rt-det-surf-missing')),
		/module entity '0+' not found/,
	);
});

test('surface.functional: passing a non-module entity id -> throws',
{ skip: !GATE }, async () => {
	// fileA1Id is kind='file', not 'module'.
	const task = mkTask('code.surface.functional',
		{ module: fileA1Id },
		['functional-surface']);
	await assert.rejects(
		codeSurfaceFunctionalRuntime.execute(mkArgs(task, 'rt-det-surf-wrong-kind')),
		/has kind='file', expected 'module'/,
	);
});

test('surface.functional: missing params.module -> throws with INV-5 message',
{ skip: !GATE }, async () => {
	const task = mkTask('code.surface.functional', {}, ['functional-surface']);
	await assert.rejects(
		codeSurfaceFunctionalRuntime.execute(mkArgs(task, 'rt-det-surf-no-module')),
		/task\.params\.module missing/,
	);
});

// ---------------------------------------------------------------------------
// code.structure.module-tree
// ---------------------------------------------------------------------------

test('structure.module-tree: emits module nodes + IMPORTS edges as module-to-module',
{ skip: !GATE }, async () => {
	const task = mkTask('code.structure.module-tree',
		{ scopeRef: { kind: 'repo', value: repoPath } },
		['module-tree']);
	const result = await codeStructureModuleTreeRuntime.execute(mkArgs(task, 'rt-det-tree-1'));

	const tree = result.outputs.get('module-tree') as {
		repo: string;
		modules: Array<{ id: string; name: string; path: string; language: string }>;
		edges: Array<{ from: string; to: string; viaImports: number }>;
	};
	assert.equal(tree.repo, repoPath);
	assert.equal(tree.modules.length, 2);
	assert.deepEqual(tree.modules.map(m => m.name).sort(), ['mod-a', 'mod-b']);

	// One IMPORTS edge (b1.ts -> a1.ts) collapses to one module edge.
	assert.equal(tree.edges.length, 1);
	const e = tree.edges[0]!;
	assert.equal(e.from, moduleBId);
	assert.equal(e.to,   moduleAId);
	assert.equal(e.viaImports, 1);
	// fileA1Id is unused by the assertion below but the test verifies
	// the prefix-resolution path picked the right file -> module mapping.
	void fileA1Id;
});

test('structure.module-tree: repo with zero modules -> empty tree, not error',
{ skip: !GATE }, async () => {
	// Add a second repo with no modules.
	const emptyRepoPath = '/synthetic/det-test-empty';
	const db = await getDb();
	await addRepo(db, {
		kind:    'workspace',
		path:    emptyRepoPath,
		name:    'det-test-empty',
		addedAt: new Date(0).toISOString(),
		status:  'ready',
	});
	// Just one file, no module entity.
	await upsertEntities(db, [{
		id:        makeEntityId(emptyRepoPath, `${emptyRepoPath}/x.ts`, 'file', 'x.ts'),
		kind:      'file',
		name:      'x.ts',
		language:  'typescript',
		repoId:    0,
		repo:      emptyRepoPath,
		file:      `${emptyRepoPath}/x.ts`,
		startLine: 1,
		endLine:   1,
		body:      '',
		embedding: [],
		indexedAt: new Date(0).toISOString(),
	}]);

	const task = mkTask('code.structure.module-tree',
		{ scopeRef: { kind: 'repo', value: emptyRepoPath } },
		['module-tree']);
	const result = await codeStructureModuleTreeRuntime.execute(mkArgs(task, 'rt-det-tree-empty'));

	const tree = result.outputs.get('module-tree') as {
		modules: unknown[];
		edges:   unknown[];
	};
	assert.deepEqual(tree.modules, []);
	assert.deepEqual(tree.edges,   []);
});
