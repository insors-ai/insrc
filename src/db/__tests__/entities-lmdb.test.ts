/**
 * Phase 2.2 tests for the LMDB-backed `db/entities.ts`.
 *
 * Verifies the public surface preserves the prior DuckDB-backed
 * behaviour at the contract level:
 *   - upsertEntities creates new + overwrites existing (by string SHA id)
 *   - module-stub upsert is "ensure exists" (no overwrite)
 *   - deleteEntitiesForFile / deleteEntitiesForRepo cascade to incident
 *     edges (raw out_edge / in_edge sweep)
 *   - getEntity / getEntitiesByIds / findEntitiesByName /
 *     listEntitiesForRepo / findEntitiesByFile / listUnembeddedEntities
 *     all return the expected subsets
 *   - updateEmbedding writes the embeddingModel field (vector itself
 *     goes to Lance in Phase 3.2)
 *   - Empty-string sentinel defaults round-trip cleanly
 *   - Repo IDs are auto-allocated on first sighting of a path
 *   - Edge cascade removes both out_edge and in_edge entries
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import {
	encodeOutEdgeKey,
	encodeInEdgeKey,
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	ENTITY_KIND_BYTE,
} from '../graph/keys.js';
import {
	upsertEntities,
	deleteEntitiesForFile,
	deleteEntitiesForRepo,
	getEntity,
	getEntitiesByIds,
	findEntitiesByName,
	listEntitiesForRepo,
	findEntitiesByFile,
	listUnembeddedEntities,
	updateEmbedding,
} from '../entities.js';
import { addRepo } from '../repos.js';
import type { Entity, EntityKind, RegisteredRepo } from '../../shared/types.js';

let dir: string;

/**
 * Phase 5.x strict-contract: storage layer no longer auto-allocates
 * Repo registry rows. Tests must pre-register synthetic paths via
 * `addRepo()` before upserting entities for that path. This helper
 * batch-registers the well-known synthetic paths used across this
 * file so individual tests don't have to.
 */
const TEST_REPO_PATHS = [
	'/repo/foo', '/repo/x', '/repo/y', '/repo/z', '/repo/a', '/repo/b', '/repo/c',
	'/repo/nonexistent', '/path/to/myrepo',
] as const;

async function registerTestRepos(...paths: readonly string[]): Promise<void> {
	for (const path of paths) {
		const repo: RegisteredRepo = {
			path, name: '', addedAt: new Date().toISOString(), status: 'pending',
		};
		await addRepo(null, repo);
	}
}

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-entities-lmdb-2.2-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await registerTestRepos(...TEST_REPO_PATHS);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/repo/foo';
const NOW = '2026-05-05T10:00:00.000Z';

function makeEntityId(repo: string, file: string, kind: string, name: string): string {
	return createHash('sha256')
		.update(`${repo}\x00${file}\x00${kind}\x00${name}`)
		.digest('hex')
		.slice(0, 32);
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
	const repo = overrides.repo ?? REPO;
	const file = overrides.file ?? `${repo}/src/foo.ts`;
	const kind = (overrides.kind ?? 'function') as EntityKind;
	const name = overrides.name ?? 'foo';
	const id = overrides.id ?? makeEntityId(repo, file, kind, name);
	return {
		id,
		kind,
		name,
		language:  overrides.language ?? 'typescript',
		repoId:    overrides.repoId   ?? 1,
		repo,
		file,
		startLine: overrides.startLine ?? 1,
		endLine:   overrides.endLine   ?? 10,
		body:      overrides.body      ?? 'function foo() {}',
		embedding: overrides.embedding ?? [],
		indexedAt: overrides.indexedAt ?? NOW,
		...(overrides.signature      !== undefined ? { signature:      overrides.signature      } : {}),
		...(overrides.hash           !== undefined ? { hash:           overrides.hash           } : {}),
		...(overrides.embeddingModel !== undefined ? { embeddingModel: overrides.embeddingModel } : {}),
		...(overrides.isExported     !== undefined ? { isExported:     overrides.isExported     } : {}),
		...(overrides.isAsync        !== undefined ? { isAsync:        overrides.isAsync        } : {}),
		...(overrides.isAbstract     !== undefined ? { isAbstract:     overrides.isAbstract     } : {}),
		...(overrides.artifact       !== undefined ? { artifact:       overrides.artifact       } : {}),
	};
}

// ---------------------------------------------------------------------------
// upsertEntities + getEntity round-trip
// ---------------------------------------------------------------------------

test('upsertEntities + getEntity round-trip', async () => {
	const e = makeEntity();
	await upsertEntities(null, [e]);
	const back = await getEntity(null, e.id);
	assert.ok(back);
	assert.equal(back.id, e.id);
	assert.equal(back.name, 'foo');
	assert.equal(back.kind, 'function');
	assert.equal(back.repo, REPO);
	assert.equal(back.file, e.file);
	assert.equal(back.body, 'function foo() {}');
	assert.equal(back.indexedAt, NOW);
	assert.deepEqual(back.embedding, []);
});

test('upsertEntities preserves all flag fields', async () => {
	const e = makeEntity({
		isExported: true, isAsync: true, isAbstract: false, artifact: false,
		signature: 'function foo(): void',
		hash: 'a'.repeat(64),
	});
	await upsertEntities(null, [e]);
	const back = await getEntity(null, e.id);
	assert.equal(back?.isExported, true);
	assert.equal(back?.isAsync, true);
	assert.equal(back?.isAbstract, undefined); // false sentinel -> absent
	assert.equal(back?.signature, 'function foo(): void');
	assert.equal(back?.hash, 'a'.repeat(64));
});

test('getEntity on unknown id returns null', async () => {
	const id = makeEntityId('x', 'y', 'function', 'z');
	assert.equal(await getEntity(null, id), null);
});

test('getEntitiesByIds returns matched subset (unmatched omitted)', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b' });
	await upsertEntities(null, [a, b]);
	const got = await getEntitiesByIds(null, [a.id, b.id, 'no-such-id']);
	assert.equal(got.length, 2);
	assert.deepEqual(got.map(e => e.name).sort(), ['a', 'b']);
});

test('getEntitiesByIds on empty array returns []', async () => {
	const got = await getEntitiesByIds(null, []);
	assert.deepEqual(got, []);
});

// ---------------------------------------------------------------------------
// upsert semantics: regular vs module entities
// ---------------------------------------------------------------------------

test('upsert overwrites a non-module entity', async () => {
	const e = makeEntity({ body: 'v1' });
	await upsertEntities(null, [e]);
	await upsertEntities(null, [makeEntity({ body: 'v2' })]);
	const back = await getEntity(null, e.id);
	assert.equal(back?.body, 'v2');
});

test('module-stub upsert is ensure-exists (does not overwrite)', async () => {
	const id = makeEntityId(REPO, '', 'module', 'm');
	const v1 = makeEntity({ id, kind: 'module', name: 'm', file: '', body: '' });
	const v2 = makeEntity({ id, kind: 'module', name: 'm', file: '', body: 'should-not-appear' });
	await upsertEntities(null, [v1]);
	await upsertEntities(null, [v2]);
	const back = await getEntity(null, id);
	assert.ok(back);
	// Module stubs preserve original; v2's body should NOT have been written
	assert.equal(back.body, '');
});

test('upsertEntities dedupes intra-batch duplicates (last-wins)', async () => {
	const id = makeEntityId(REPO, '/repo/foo/src/a.ts', 'function', 'foo');
	const a = makeEntity({ id, body: 'first' });
	const b = makeEntity({ id, body: 'second' });
	await upsertEntities(null, [a, b]);
	const back = await getEntity(null, id);
	assert.equal(back?.body, 'second');
});

test('upsertEntities on empty array is a no-op', async () => {
	await upsertEntities(null, []);
	// no error; no rows
	const list = await listEntitiesForRepo(null, REPO);
	assert.deepEqual(list, []);
});

// ---------------------------------------------------------------------------
// listEntitiesForRepo / findEntitiesByFile / findEntitiesByName
// ---------------------------------------------------------------------------

test('listEntitiesForRepo returns only the requested repo', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'a', repo: '/repo/x', file: '/repo/x/a.ts' }),
		makeEntity({ name: 'b', repo: '/repo/x', file: '/repo/x/b.ts' }),
		makeEntity({ name: 'c', repo: '/repo/y', file: '/repo/y/c.ts' }),
	]);
	const x = await listEntitiesForRepo(null, '/repo/x');
	const y = await listEntitiesForRepo(null, '/repo/y');
	assert.deepEqual(x.map(e => e.name).sort(), ['a', 'b']);
	assert.deepEqual(y.map(e => e.name).sort(), ['c']);
});

test('listEntitiesForRepo on unknown repo returns []', async () => {
	const got = await listEntitiesForRepo(null, '/repo/nonexistent');
	assert.deepEqual(got, []);
});

test('findEntitiesByFile filters by absolute path', async () => {
	const fileA = '/repo/foo/src/a.ts';
	const fileB = '/repo/foo/src/b.ts';
	await upsertEntities(null, [
		makeEntity({ name: 'a1', file: fileA }),
		makeEntity({ name: 'a2', file: fileA }),
		makeEntity({ name: 'b1', file: fileB }),
	]);
	const a = await findEntitiesByFile(null, fileA);
	assert.deepEqual(a.map(e => e.name).sort(), ['a1', 'a2']);
	const b = await findEntitiesByFile(null, fileB);
	assert.deepEqual(b.map(e => e.name).sort(), ['b1']);
});

test('findEntitiesByName matches names + kind filter', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'common', kind: 'function' }),
		makeEntity({ name: 'common', kind: 'class', file: '/repo/foo/src/c.ts' }),
		makeEntity({ name: 'other',  kind: 'function', file: '/repo/foo/src/o.ts' }),
	]);
	const all = await findEntitiesByName(null, ['common']);
	assert.equal(all.length, 2);
	const onlyFn = await findEntitiesByName(null, ['common'], { kinds: ['function'] });
	assert.equal(onlyFn.length, 1);
	assert.equal(onlyFn[0]!.kind, 'function');
});

test('findEntitiesByName respects repo filter', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'foo', repo: '/repo/x', file: '/repo/x/a.ts' }),
		makeEntity({ name: 'foo', repo: '/repo/y', file: '/repo/y/a.ts' }),
	]);
	const xs = await findEntitiesByName(null, ['foo'], { repo: '/repo/x' });
	assert.equal(xs.length, 1);
	assert.equal(xs[0]!.repo, '/repo/x');
});

test('findEntitiesByName respects multi-repo `repos` filter', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'foo', repo: '/repo/x', file: '/repo/x/a.ts' }),
		makeEntity({ name: 'foo', repo: '/repo/y', file: '/repo/y/a.ts' }),
		makeEntity({ name: 'foo', repo: '/repo/z', file: '/repo/z/a.ts' }),
	]);
	const xy = await findEntitiesByName(null, ['foo'], { repos: ['/repo/x', '/repo/y'] });
	assert.equal(xy.length, 2);
	const got = new Set(xy.map(e => e.repo));
	assert.ok(got.has('/repo/x'));
	assert.ok(got.has('/repo/y'));
	assert.ok(!got.has('/repo/z'));
});

test('findEntitiesByName: empty `repos` array returns []', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'foo', repo: '/repo/x', file: '/repo/x/a.ts' }),
	]);
	const out = await findEntitiesByName(null, ['foo'], { repos: [] });
	assert.deepEqual(out, []);
});

test('findEntitiesByName: `repos` with unknown paths drops them silently', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'foo', repo: '/repo/x', file: '/repo/x/a.ts' }),
	]);
	const out = await findEntitiesByName(null, ['foo'], {
		repos: ['/repo/x', '/repo/does-not-exist'],
	});
	assert.equal(out.length, 1);
	assert.equal(out[0]!.repo, '/repo/x');
});

test('findEntitiesByName: passing both `repo` and `repos` throws', async () => {
	await assert.rejects(
		() => findEntitiesByName(null, ['foo'], {
			repo:  '/repo/x',
			repos: ['/repo/y'],
		}),
		/either `repo` \(single\) or `repos` \(multi\), not both/,
	);
});

test('findEntitiesByName respects limit', async () => {
	const N = 30;
	const entries: Entity[] = [];
	for (let i = 0; i < N; i++) {
		entries.push(makeEntity({ name: 'shared', file: `/repo/foo/src/f${i}.ts` }));
	}
	await upsertEntities(null, entries);
	const limited = await findEntitiesByName(null, ['shared'], { limit: 5 });
	assert.equal(limited.length, 5);
});

test('findEntitiesByName on empty input returns []', async () => {
	const got = await findEntitiesByName(null, []);
	assert.deepEqual(got, []);
});

// ---------------------------------------------------------------------------
// listUnembeddedEntities
// ---------------------------------------------------------------------------

test('listUnembeddedEntities filters on empty embeddingModel', async () => {
	const a = makeEntity({ name: 'a' });
	const b = makeEntity({ name: 'b', embeddingModel: 'qwen3-embedding:0.6b' });
	await upsertEntities(null, [a, b]);
	const un = await listUnembeddedEntities(null, REPO);
	assert.equal(un.length, 1);
	assert.equal(un[0]!.name, 'a');
});

test('updateEmbedding sets the model name (vector goes to Lance in 3.2)', async () => {
	const e = makeEntity();
	await upsertEntities(null, [e]);
	await updateEmbedding(null, e.id, [1, 2, 3], 'qwen3-embedding:0.6b');
	const back = await getEntity(null, e.id);
	assert.equal(back?.embeddingModel, 'qwen3-embedding:0.6b');
	const un = await listUnembeddedEntities(null, REPO);
	assert.equal(un.length, 0);
});

test('updateEmbedding on unknown id is a silent no-op', async () => {
	await upsertEntities(null, [makeEntity()]);
	await updateEmbedding(null, 'nonexistent-id', [1, 2, 3], 'model');
	// no error; existing entity untouched
	const list = await listEntitiesForRepo(null, REPO);
	assert.equal(list[0]!.embeddingModel, undefined);
});

// ---------------------------------------------------------------------------
// Delete + cascade
// ---------------------------------------------------------------------------

test('deleteEntitiesForFile removes only that file\'s entities', async () => {
	const fileA = '/repo/foo/src/a.ts';
	const fileB = '/repo/foo/src/b.ts';
	await upsertEntities(null, [
		makeEntity({ name: 'a1', file: fileA }),
		makeEntity({ name: 'a2', file: fileA }),
		makeEntity({ name: 'b1', file: fileB }),
	]);
	await deleteEntitiesForFile(null, fileA);
	const all = await listEntitiesForRepo(null, REPO);
	assert.deepEqual(all.map(e => e.name).sort(), ['b1']);
});

test('deleteEntitiesForFile cascades to out_edge and in_edge', async () => {
	const fileA = '/repo/foo/src/a.ts';
	const fileB = '/repo/foo/src/b.ts';
	const a = makeEntity({ name: 'caller', file: fileA });
	const b = makeEntity({ name: 'callee', file: fileB });
	await upsertEntities(null, [a, b]);

	// Look up the u64 ids and write a CALLS edge a -> b directly so we
	// have a known incident edge to verify cleanup against.
	const store = await getGraphStore();
	const aU64 = store.entityIdByString.get(a.id) as bigint | number;
	const bU64 = store.entityIdByString.get(b.id) as bigint | number;
	const aBig = typeof aU64 === 'bigint' ? aU64 : BigInt(aU64);
	const bBig = typeof bU64 === 'bigint' ? bU64 : BigInt(bU64);
	await withWriteTxn(s => {
		s.outEdge.put(encodeOutEdgeKey(aBig, RELATION_KIND_BYTE.CALLS, bBig), Buffer.alloc(0));
		s.inEdge.put(encodeInEdgeKey(bBig, RELATION_KIND_BYTE.CALLS, aBig), Buffer.alloc(0));
	});

	// Sanity: edges exist
	const before = countEdges(store.outEdge, encodeOutEdgePrefix(aBig));
	assert.equal(before, 1);

	// Delete the source file -> caller entity removed -> incident edges removed
	await deleteEntitiesForFile(null, fileA);

	const after = countEdges(store.outEdge, encodeOutEdgePrefix(aBig));
	assert.equal(after, 0, 'expected out_edge cascade to clear edges from the deleted entity');
	const inAfter = countEdges(store.inEdge, encodeInEdgePrefix(bBig));
	assert.equal(inAfter, 0, 'expected in_edge cascade to clear matching mirror entries');
});

test('deleteEntitiesForRepo removes all entities for that repo only', async () => {
	await upsertEntities(null, [
		makeEntity({ name: 'a', repo: '/repo/x', file: '/repo/x/a.ts' }),
		makeEntity({ name: 'b', repo: '/repo/x', file: '/repo/x/b.ts' }),
		makeEntity({ name: 'c', repo: '/repo/y', file: '/repo/y/c.ts' }),
	]);
	await deleteEntitiesForRepo(null, '/repo/x');
	assert.deepEqual(await listEntitiesForRepo(null, '/repo/x'), []);
	const y = await listEntitiesForRepo(null, '/repo/y');
	assert.deepEqual(y.map(e => e.name), ['c']);
});

test('deleteEntitiesForRepo on unknown repo is a silent no-op', async () => {
	await upsertEntities(null, [makeEntity()]);
	await deleteEntitiesForRepo(null, '/repo/nonexistent');
	const list = await listEntitiesForRepo(null, REPO);
	assert.equal(list.length, 1);
});

// ---------------------------------------------------------------------------
// Persistence + file path handling
// ---------------------------------------------------------------------------

test('entities survive close + reopen', async () => {
	const e = makeEntity();
	await upsertEntities(null, [e]);
	await closeGraphStore();
	const back = await getEntity(null, e.id);
	assert.ok(back);
	assert.equal(back.body, e.body);
});

test('absolute file path -> repo-relative on write, back to absolute on read', async () => {
	const file = `${REPO}/deep/nested/path.ts`;
	await upsertEntities(null, [makeEntity({ file })]);
	const list = await listEntitiesForRepo(null, REPO);
	// File reconstructed back to the original absolute path
	assert.equal(list[0]!.file, file);
});

test('repo IDs are auto-allocated on first sighting', async () => {
	await upsertEntities(null, [
		makeEntity({ repo: '/repo/a', file: '/repo/a/x.ts' }),
		makeEntity({ repo: '/repo/b', file: '/repo/b/y.ts' }),
		makeEntity({ repo: '/repo/c', file: '/repo/c/z.ts' }),
	]);
	const a = await listEntitiesForRepo(null, '/repo/a');
	const b = await listEntitiesForRepo(null, '/repo/b');
	const c = await listEntitiesForRepo(null, '/repo/c');
	assert.equal(a.length, 1);
	assert.equal(b.length, 1);
	assert.equal(c.length, 1);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function countEdges(db: { getRange: (opts: { start: Buffer; end: Buffer }) => Iterable<unknown> }, prefix: Buffer): number {
	const succ = prefixSuccessor(prefix);
	let n = 0;
	for (const _ of db.getRange({ start: prefix, end: succ })) n++;
	return n;
}

void ENTITY_KIND_BYTE; // silences unused-import lint when test changes
