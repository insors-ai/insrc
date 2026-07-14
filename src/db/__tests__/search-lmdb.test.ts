/**
 * Phase 4.2 tests for the LMDB-backed graph queries in `db/search.ts`.
 *
 * Covers:
 *   - findCallers / findCallees / findDefinedIn / findImports
 *     (1-hop CALLS / DEFINES / IMPORTS via out_edge / in_edge)
 *   - resolveClosure (transitive DEPENDS_ON via traversal layer)
 *
 * Vector search (`searchEntities`) is exercised in the
 * `entities-lance-integration.test.ts` suite -- not duplicated here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { upsertEntities } from '../entities.js';
import { upsertRelations } from '../relations.js';
import { addRepo } from '../repos.js';
import {
	findCallers,
	findCallees,
	findDefinedIn,
	findImports,
	resolveClosure,
} from '../search.js';
import type { Entity, EntityKind } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-search-lmdb-4.2-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	// Pre-register every synthetic repo path the suite uses -- the
	// Phase 5.x strict-contract resolver throws if the path isn't in
	// the registry.
	const now = new Date().toISOString();
	for (const path of [REPO, '/a', '/b', '/c']) {
		await addRepo(null, { path, name: '', addedAt: now, status: 'pending' });
	}
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(
	name: string,
	opts: { file?: string; kind?: EntityKind; repo?: string; rootPath?: string } = {},
): Entity {
	const repo = opts.repo ?? REPO;
	const file = opts.file ?? `${repo}/src/${name}.ts`;
	const kind = opts.kind ?? 'function';
	const e: Entity = {
		id:        makeEntityId(repo, file, kind, name),
		kind,
		name,
		language:  'typescript',
		repoId:    1,
		repo,
		file,
		startLine: 1, endLine: 5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: '2026-05-05T10:00:00.000Z',
	};
	if (opts.rootPath !== undefined) e.rootPath = opts.rootPath;
	return e;
}

/**
 * Build a repo entity matching the indexer's
 * `makeEntityId(repoPath, '', 'repo', repoPath)` shape.
 */
function makeRepoEntity(repoPath: string): Entity {
	return {
		id:        makeEntityId(repoPath, '', 'repo', repoPath),
		kind:      'repo',
		name:      repoPath,
		language:  'typescript',
		repoId:    1,
		repo:      repoPath,
		file:      '',
		startLine: 0, endLine: 0,
		body:      '',
		embedding: [],
		indexedAt: '2026-05-05T10:00:00.000Z',
	};
}

// ---------------------------------------------------------------------------
// findCallers / findCallees -- 1-hop CALLS
// ---------------------------------------------------------------------------

test('findCallees returns 1-hop CALLS successors', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const c = makeEntity('c');
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: a.id, to: c.id, resolved: true },
	]);
	const callees = await findCallees(null, a.id);
	const names = callees.map(e => e.name).sort();
	assert.deepEqual(names, ['b', 'c']);
});

test('findCallers returns 1-hop CALLS predecessors', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const c = makeEntity('c');
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: c.id, resolved: true },
		{ kind: 'CALLS', from: b.id, to: c.id, resolved: true },
	]);
	const callers = await findCallers(null, c.id);
	const names = callers.map(e => e.name).sort();
	assert.deepEqual(names, ['a', 'b']);
});

test('findCallees with no outgoing CALLS returns []', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const callees = await findCallees(null, a.id);
	assert.deepEqual(callees, []);
});

test('findCallers with no incoming CALLS returns []', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const callers = await findCallers(null, a.id);
	assert.deepEqual(callers, []);
});

test('findCallees on unknown entity returns []', async () => {
	const callees = await findCallees(null, 'deadbeef'.repeat(4));
	assert.deepEqual(callees, []);
});

test('findCallees ignores non-CALLS edges', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	const c = makeEntity('c');
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS',   from: a.id, to: b.id, resolved: true },
		{ kind: 'IMPORTS', from: a.id, to: c.id, resolved: true },
	]);
	const callees = await findCallees(null, a.id);
	const names = callees.map(e => e.name);
	assert.deepEqual(names, ['b']);
});

// ---------------------------------------------------------------------------
// findDefinedIn -- 1-hop DEFINES from a file
// ---------------------------------------------------------------------------

test('findDefinedIn returns DEFINES successors', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	const fn1  = makeEntity('fn1');
	const fn2  = makeEntity('fn2');
	const cls1 = makeEntity('Cls1', { kind: 'class' });
	await upsertEntities(null, [file, fn1, fn2, cls1]);
	await upsertRelations(null, [
		{ kind: 'DEFINES', from: file.id, to: fn1.id,  resolved: true },
		{ kind: 'DEFINES', from: file.id, to: fn2.id,  resolved: true },
		{ kind: 'DEFINES', from: file.id, to: cls1.id, resolved: true },
	]);
	const defined = await findDefinedIn(null, file.id);
	const names = defined.map(e => e.name).sort();
	assert.deepEqual(names, ['Cls1', 'fn1', 'fn2']);
});

test('findDefinedIn with mixed kinds only returns DEFINES targets', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	const fn   = makeEntity('fn');
	const mod  = makeEntity('mod', { kind: 'module' });
	await upsertEntities(null, [file, fn, mod]);
	await upsertRelations(null, [
		{ kind: 'DEFINES', from: file.id, to: fn.id,  resolved: true },
		{ kind: 'IMPORTS', from: file.id, to: mod.id, resolved: true },
	]);
	const defined = await findDefinedIn(null, file.id);
	assert.equal(defined.length, 1);
	assert.equal(defined[0]!.name, 'fn');
});

// ---------------------------------------------------------------------------
// findImports -- 1-hop IMPORTS from a file
// ---------------------------------------------------------------------------

test('findImports returns IMPORTS successors', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	const m1   = makeEntity('m1', { kind: 'module' });
	const m2   = makeEntity('m2', { kind: 'module' });
	await upsertEntities(null, [file, m1, m2]);
	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: file.id, to: m1.id, resolved: true },
		{ kind: 'IMPORTS', from: file.id, to: m2.id, resolved: true },
	]);
	const imports = await findImports(null, file.id);
	const names = imports.map(e => e.name).sort();
	assert.deepEqual(names, ['m1', 'm2']);
});

test('findImports on file with no IMPORTS returns []', async () => {
	const file = makeEntity('file.ts', { kind: 'file' });
	await upsertEntities(null, [file]);
	assert.deepEqual(await findImports(null, file.id), []);
});

// ---------------------------------------------------------------------------
// resolveClosure -- transitive DEPENDS_ON
// ---------------------------------------------------------------------------

test('resolveClosure includes the root even with no DEPENDS_ON edges', async () => {
	const repo = makeRepoEntity(REPO);
	await upsertEntities(null, [repo]);
	const closure = await resolveClosure(null, REPO);
	assert.deepEqual(closure, [REPO]);
});

test('resolveClosure on unknown repo path returns just the path', async () => {
	const closure = await resolveClosure(null, '/repo/nope');
	assert.deepEqual(closure, ['/repo/nope']);
});

test('resolveClosure walks transitive DEPENDS_ON across repos', async () => {
	// /a depends on /b which depends on /c.
	// We model repo→repo DEPENDS_ON since the BFS surfaces repo entities
	// only.
	const repoA = makeRepoEntity('/a');
	const repoB = makeRepoEntity('/b');
	const repoC = makeRepoEntity('/c');
	await upsertEntities(null, [repoA, repoB, repoC]);
	await upsertRelations(null, [
		{ kind: 'DEPENDS_ON', from: repoA.id, to: repoB.id, resolved: true },
		{ kind: 'DEPENDS_ON', from: repoB.id, to: repoC.id, resolved: true },
	]);
	const closure = await resolveClosure(null, '/a');
	const sorted = [...closure].sort();
	assert.deepEqual(sorted, ['/a', '/b', '/c']);
});

test('resolveClosure handles cycles without infinite loop', async () => {
	const repoA = makeRepoEntity('/a');
	const repoB = makeRepoEntity('/b');
	await upsertEntities(null, [repoA, repoB]);
	await upsertRelations(null, [
		{ kind: 'DEPENDS_ON', from: repoA.id, to: repoB.id, resolved: true },
		{ kind: 'DEPENDS_ON', from: repoB.id, to: repoA.id, resolved: true },
	]);
	const closure = await resolveClosure(null, '/a');
	assert.deepEqual([...closure].sort(), ['/a', '/b']);
});

test('resolveClosure filters out non-repo reachable entities', async () => {
	// Real indexer flow: repo --DEPENDS_ON--> module. The module is
	// reachable via the BFS but should NOT appear in the closure list,
	// because callers expect `repo path[]`.
	const repo = makeRepoEntity(REPO);
	const mod  = makeEntity('left-pad', { kind: 'module' });
	await upsertEntities(null, [repo, mod]);
	await upsertRelations(null, [
		{ kind: 'DEPENDS_ON', from: repo.id, to: mod.id, resolved: true },
	]);
	const closure = await resolveClosure(null, REPO);
	assert.deepEqual(closure, [REPO]);
});
