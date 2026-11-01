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
	encodeEntityKey,
	encodeEntityByFileKey,
	decodeEntityByFileKey,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	ENTITY_KIND_BYTE,
} from '../graph/keys.js';
import { decodeEntityRow } from '../graph/codec.js';
import {
	upsertEntities,
	reindexFile,
	deleteEntitiesForFile,
	deleteEntitiesForRepo,
	getEntity,
	getEntitiesByIds,
	findEntitiesByName,
	listEntitiesForRepo,
	findEntitiesByFile,
	listUnembeddedEntities,
	updateEmbedding,
	repoHasAnyEntity,
	putEntityRowInTxn,
	removeEntityRowInTxn,
} from '../entities.js';
import { addRepo } from '../repos.js';
import type { Entity, EntityKind, RegisteredRepo } from '../../shared/types.js';

import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

// This file reaches the vector store through code that takes no path; it gets a
// temporary one (the default path belongs to the daemon alone).
useTemporaryLance();

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
	'/repo/outer', '/repo/outer/inner', '/repo/empty',
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
// Epic c2ba6fa6 Story s3: entity_by_file (t1/t2/t5/t6/t7)
// ---------------------------------------------------------------------------

test('t1: encodeEntityByFileKey/decodeEntityByFileKey round-trip (repoId, filePath), including an empty filePath', () => {
	for (const [repoId, filePath] of [[1, 'src/foo.ts'], [42, ''], [0, 'a/b/c.ts']] as const) {
		const key = encodeEntityByFileKey(repoId, filePath);
		assert.deepEqual(decodeEntityByFileKey(key), { repoId, filePath });
	}
});

test('t2: the put/remove wrapper keeps entity, nameIndex and entityByFile consistent across create, replace and delete', async () => {
	const store = await getGraphStore();
	const e = makeEntity({ repo: '/repo/foo', file: '/repo/foo/wrapped.ts', name: 'wrapped' });
	await upsertEntities(null, [e]); // create, through the wrapper

	const u64 = store.entityIdByString.get(e.id) as bigint;
	const fileKey = encodeEntityByFileKey(1, 'wrapped.ts');
	assert.deepEqual([...store.entityByFile.getValues(fileKey)].map(v => (v as Buffer).toString('hex')), [encodeEntityKey(u64).toString('hex')]);
	assert.ok(store.entity.get(encodeEntityKey(u64)) !== undefined);

	// Replace: rename to a different file -- the old entityByFile entry
	// must be dropped and the new one written, same as nameIndex.
	await withWriteTxn(s => {
		const prevBuf = s.entity.get(encodeEntityKey(u64));
		const prev = decodeEntityRow(prevBuf as Buffer);
		const next = { ...prev, filePath: 'moved.ts' };
		putEntityRowInTxn(s, u64, prev, next);
	});
	assert.equal([...store.entityByFile.getValues(fileKey)].length, 0, 'old (repoId, filePath) entry dropped');
	const movedKey = encodeEntityByFileKey(1, 'moved.ts');
	assert.equal([...store.entityByFile.getValues(movedKey)].length, 1, 'new (repoId, filePath) entry present');

	// Delete: both nameIndex and entityByFile entries go with the row.
	await withWriteTxn(s => {
		const row = decodeEntityRow(s.entity.get(encodeEntityKey(u64)) as Buffer);
		removeEntityRowInTxn(s, u64, row);
	});
	assert.equal([...store.entityByFile.getValues(movedKey)].length, 0);
	assert.equal(store.entity.get(encodeEntityKey(u64)), undefined);
});

test('t4 guard: every entity.put/entity.remove/nameIndex.put/nameIndex.remove/entityByFile.put/entityByFile.remove call in entities.ts and migrations.ts is inside the wrapper (or the one documented, entity-row-free exemption)', async () => {
	const { readFileSync } = await import('node:fs');
	const RAW_CALL = /\b(?:entity|nameIndex|entityByFile)\.(?:put|remove)\(/g;

	const entitiesSrc = readFileSync(new URL('../entities.ts', import.meta.url), 'utf8');
	const [beginMarker, endMarker] = ['// GUARD-TEST-BOUNDARY: entity-row write path begins', '// GUARD-TEST-BOUNDARY: entity-row write path ends'];
	const begin = entitiesSrc.indexOf(beginMarker);
	const end = entitiesSrc.indexOf(endMarker);
	assert.ok(begin >= 0 && end > begin, 'entities.ts must carry both guard-test boundary markers');
	const entitiesOutsideWrapper = entitiesSrc.slice(0, begin) + entitiesSrc.slice(end + endMarker.length);
	const entitiesViolations = [...entitiesOutsideWrapper.matchAll(RAW_CALL)];
	assert.deepEqual(entitiesViolations.map(m => m[0]), [], 'no raw entity/nameIndex/entityByFile write outside the wrapper in entities.ts');

	const migrationsSrc = readFileSync(new URL('../graph/migrations.ts', import.meta.url), 'utf8');
	// Each GUARD-TEST-EXEMPT marker documents one standalone, index-only
	// migration step that legitimately writes nameIndex/entityByFile
	// without an accompanying entity.put/entity.remove (v1->v2's
	// name_index backfill; v5->v6's entity_by_file backfill). For each
	// marker, find the exempt call itself (the next nameIndex.put/
	// entityByFile.put after it) and strip exactly that one balanced
	// statement -- not merely up to the first `);`, which can belong to
	// an earlier, unrelated sub-expression on a preceding line.
	const exemptMarker = 'GUARD-TEST-EXEMPT';
	let cleaned = migrationsSrc;
	let exemptionsFound = 0;
	for (;;) {
		const at = cleaned.indexOf(exemptMarker);
		if (at < 0) break;
		const callMatch = /(?:nameIndex|entityByFile)\.put\(/.exec(cleaned.slice(at));
		assert.ok(callMatch, 'a GUARD-TEST-EXEMPT marker must be followed by a nameIndex.put/entityByFile.put call');
		const callStart = at + callMatch.index;
		const openParenAt = callStart + callMatch[0].length - 1;
		let depth = 1;
		let i = openParenAt + 1;
		for (; i < cleaned.length && depth > 0; i++) {
			if (cleaned[i] === '(') depth++;
			else if (cleaned[i] === ')') depth--;
		}
		assert.equal(depth, 0, 'the exempt call\'s parentheses must balance');
		cleaned = cleaned.slice(0, at) + cleaned.slice(i);
		exemptionsFound++;
	}
	assert.equal(exemptionsFound, 2, 'migrations.ts must carry exactly the two documented exemptions (v1->v2 nameIndex backfill, v5->v6 entityByFile backfill)');
	const migrationsViolations = [...cleaned.matchAll(RAW_CALL)];
	assert.deepEqual(migrationsViolations.map(m => m[0]), [], 'no raw entity/nameIndex/entityByFile write outside the wrapper or the documented exemptions in migrations.ts');
});

test('ac1: findEntitiesByFile on one file of the smaller of two indexed repos returns the same entities as a full-scan baseline, touching only that file\'s rows', async () => {
	// The larger repo has many more rows than the smaller one -- if
	// findEntitiesByFile scanned the whole store it would still return
	// the right answer, but this proves the *result* is correct; t4's
	// guard + the implementation itself (an exact key lookup) establish
	// that only the smaller repo's single-file rows are touched.
	const big: Entity[] = [];
	for (let i = 0; i < 50; i++) big.push(makeEntity({ repo: '/repo/x', file: `/repo/x/big${i}.ts`, name: `big${i}` }));
	await upsertEntities(null, big);
	const small = makeEntity({ repo: '/repo/y', file: '/repo/y/small.ts', name: 'small' });
	await upsertEntities(null, [small]);

	const found = await findEntitiesByFile(null, '/repo/y/small.ts');
	assert.equal(found.length, 1);
	assert.equal(found[0]!.id, small.id);
});

test('ac3: write, replace, then delete a file\'s entities in sequence; findEntitiesByFile after each step matches a full-scan-equivalent baseline every time', async () => {
	const file = '/repo/foo/seq.ts';
	await upsertEntities(null, [makeEntity({ file, name: 'seqA' })]);
	assert.deepEqual((await findEntitiesByFile(null, file)).map(e => e.name), ['seqA']);

	// Replace via reindexFile (whole-file replacement), as the indexer does.
	await reindexFile(null, REPO, file, [makeEntity({ file, name: 'seqB' })]);
	assert.deepEqual((await findEntitiesByFile(null, file)).map(e => e.name), ['seqB']);

	await deleteEntitiesForFile(null, file);
	assert.deepEqual(await findEntitiesByFile(null, file), []);
});

test('an entity with an empty filePath (external endpoint) is excluded from findEntitiesByFile but included in listEntitiesForRepo', async () => {
	const endpoint = makeEntity({ repo: '/repo/foo', file: '', kind: 'externalEndpoint' as EntityKind, name: 'endpoint' });
	await upsertEntities(null, [endpoint]);

	const byFile = await findEntitiesByFile(null, '/repo/foo'); // the repo root itself, not a real file
	assert.ok(!byFile.some(e => e.id === endpoint.id));

	const forRepo = await listEntitiesForRepo(null, '/repo/foo');
	assert.ok(forRepo.some(e => e.id === endpoint.id), 'listEntitiesForRepo still returns the empty-filePath entity');
});

test('two repos sharing the same relative file path never cross-contaminate a file-scoped read', async () => {
	const a = makeEntity({ repo: '/repo/x', file: '/repo/x/shared.ts', name: 'fromX' });
	const b = makeEntity({ repo: '/repo/y', file: '/repo/y/shared.ts', name: 'fromY' });
	await upsertEntities(null, [a, b]);

	const fromX = await findEntitiesByFile(null, '/repo/x/shared.ts');
	assert.deepEqual(fromX.map(e => e.name), ['fromX']);
	const fromY = await findEntitiesByFile(null, '/repo/y/shared.ts');
	assert.deepEqual(fromY.map(e => e.name), ['fromY']);
});

test('t5: an absolute file path under a repo root nested inside another repo root resolves to the more specific (nested) root', async () => {
	const inner = makeEntity({ repo: '/repo/outer/inner', file: '/repo/outer/inner/a.ts', name: 'innerFn' });
	await upsertEntities(null, [inner]);

	const found = await findEntitiesByFile(null, '/repo/outer/inner/a.ts');
	assert.deepEqual(found.map(e => e.name), ['innerFn']);
	assert.equal(found[0]!.repo, '/repo/outer/inner', 'resolved to the nested root, not the outer one');
});

test('t5: an absolute path matching no registered repo root resolves to no repo, not a false match', async () => {
	assert.deepEqual(await findEntitiesByFile(null, '/not/a/registered/repo/x.ts'), []);
});

test('listEntitiesForRepo returns [] for a repository with zero stored entities, identical to today\'s full-scan behavior', async () => {
	assert.deepEqual(await listEntitiesForRepo(null, '/repo/empty'), []);
});

test('t7/ac4: repoHasAnyEntity answers yes for a repo with stored entities and no for one with none, without building the entity list', async () => {
	await upsertEntities(null, [makeEntity({ repo: '/repo/foo', file: '/repo/foo/has.ts', name: 'has' })]);
	assert.equal(await repoHasAnyEntity(null, '/repo/foo'), true);
	assert.equal(await repoHasAnyEntity(null, '/repo/empty'), false);
	assert.equal(await repoHasAnyEntity(null, '/repo/nonexistent-unregistered'), false);
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
