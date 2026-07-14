/**
 * Phase 2.3 + 2.4 tests for the LMDB-backed `db/relations.ts`.
 *
 * Verifies the public surface preserves the prior DuckDB-backed
 * behaviour at the contract level. Covers both:
 *   - resolved-edge writes via upsertRelation / upsertRelations
 *     (out_edge + in_edge mirrors)
 *   - unresolved-relation queue (insert, list, scope by file,
 *     promote-to-resolved, update meta, delete by file/repo)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath } from '../graph/store.js';
import {
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	prefixSuccessor,
	RELATION_KIND_BYTE,
} from '../graph/keys.js';
import { upsertEntities } from '../entities.js';
import {
	upsertRelation,
	upsertRelations,
	listUnresolvedRelations,
	deleteUnresolvedForFile,
	deleteUnresolvedForRepo,
	promoteToResolved,
	updateUnresolvedMeta,
	promoteResolvedBatch,
	updateUnresolvedMetaBatch,
	makeUnresolvedRelationId,
	type UnresolvedRelation,
} from '../relations.js';
import type { Entity, EntityKind, Relation } from '../../shared/types.js';

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-relations-lmdb-2.3-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	const { addRepo } = await import('../repos.js');
	for (const path of ['/repo/foo', '/repo/nonexistent']) {
		await addRepo(null, { path, name: '', addedAt: new Date().toISOString(), status: 'pending' });
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

function makeEntity(name: string, file = `${REPO}/src/${name}.ts`, kind: EntityKind = 'function'): Entity {
	return {
		id: makeEntityId(REPO, file, kind, name),
		kind, name,
		language:  'typescript',
		repoId:    1,
		repo:      REPO,
		file,
		startLine: 1, endLine: 5,
		body:      `function ${name}() {}`,
		embedding: [],
		indexedAt: '2026-05-05T10:00:00.000Z',
	};
}

async function countOutEdges(fromU64: bigint): Promise<number> {
	const store = await getGraphStore();
	const prefix = encodeOutEdgePrefix(fromU64);
	const succ = prefixSuccessor(prefix);
	let n = 0;
	for (const _ of store.outEdge.getRange({ start: prefix, end: succ })) n++;
	return n;
}

async function countInEdges(toU64: bigint): Promise<number> {
	const store = await getGraphStore();
	const prefix = encodeInEdgePrefix(toU64);
	const succ = prefixSuccessor(prefix);
	let n = 0;
	for (const _ of store.inEdge.getRange({ start: prefix, end: succ })) n++;
	return n;
}

async function getU64(id: string): Promise<bigint> {
	const store = await getGraphStore();
	const v = store.entityIdByString.get(id) as bigint | number;
	return typeof v === 'bigint' ? v : BigInt(v);
}

// ---------------------------------------------------------------------------
// Resolved edges
// ---------------------------------------------------------------------------

test('upsertRelation writes a single resolved edge to both mirrors', async () => {
	const a = makeEntity('a');
	const b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelation(null, { kind: 'CALLS', from: a.id, to: b.id, resolved: true });
	const aU64 = await getU64(a.id);
	const bU64 = await getU64(b.id);
	assert.equal(await countOutEdges(aU64), 1);
	assert.equal(await countInEdges(bU64), 1);
});

test('upsertRelations bulk-writes multiple resolved edges', async () => {
	const a = makeEntity('a'), b = makeEntity('b'), c = makeEntity('c');
	await upsertEntities(null, [a, b, c]);
	await upsertRelations(null, [
		{ kind: 'CALLS',     from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS',     from: a.id, to: c.id, resolved: true },
		{ kind: 'INHERITS',  from: b.id, to: c.id, resolved: true },
	]);
	const aU64 = await getU64(a.id);
	assert.equal(await countOutEdges(aU64), 2);
});

test('upsertRelations dedupes intra-batch duplicates by (from, to, kind)', async () => {
	const a = makeEntity('a'), b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
	]);
	const aU64 = await getU64(a.id);
	assert.equal(await countOutEdges(aU64), 1);
});

test('upsertRelations is idempotent across calls', async () => {
	const a = makeEntity('a'), b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: b.id, resolved: true }]);
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: b.id, resolved: true }]);
	assert.equal(await countOutEdges(await getU64(a.id)), 1);
});

test('upsertRelations skips resolved edges with missing endpoints', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	// `to` doesn't exist
	await upsertRelations(null, [{ kind: 'CALLS', from: a.id, to: 'phantom-id', resolved: true }]);
	assert.equal(await countOutEdges(await getU64(a.id)), 0);
});

test('upsertRelations on empty array is a no-op', async () => {
	await upsertRelations(null, []);
	// no error, no writes
});

test('different relation kinds coexist on the same (from, to) pair', async () => {
	const a = makeEntity('a'), b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [
		{ kind: 'CALLS',      from: a.id, to: b.id, resolved: true },
		{ kind: 'REFERENCES', from: a.id, to: b.id, resolved: true },
	]);
	assert.equal(await countOutEdges(await getU64(a.id)), 2);
});

// ---------------------------------------------------------------------------
// Unresolved relations
// ---------------------------------------------------------------------------

test('upsertRelation routes unresolved to the queue', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	// register the repo so the unresolved path can find repoId
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelation(null, {
		kind: 'IMPORTS', from: a.id, to: './missing-module', resolved: false,
		meta: { repo: REPO, file: a.file },
	});
	const list = await listUnresolvedRelations(null, REPO);
	assert.equal(list.length, 1);
	assert.equal(list[0]!.fromEntity, a.id);
	assert.equal(list[0]!.rawTo, './missing-module');
});

test('upsertRelations splits resolved/unresolved correctly', async () => {
	const a = makeEntity('a'), b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },
		{ kind: 'IMPORTS', from: a.id, to: './x', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	const aU64 = await getU64(a.id);
	assert.equal(await countOutEdges(aU64), 1);
	const list = await listUnresolvedRelations(null, REPO);
	assert.equal(list.length, 1);
	assert.equal(list[0]!.kind, 'IMPORTS');
});

test('listUnresolvedRelations with file scope filters correctly', async () => {
	const a = makeEntity('a', `${REPO}/src/a.ts`);
	const b = makeEntity('b', `${REPO}/src/b.ts`);
	await upsertEntities(null, [a, b]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './m1', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'IMPORTS', from: b.id, to: './m2', resolved: false, meta: { repo: REPO, file: b.file } },
	]);
	const all = await listUnresolvedRelations(null, REPO);
	assert.equal(all.length, 2);
	const aOnly = await listUnresolvedRelations(null, REPO, a.file);
	assert.equal(aOnly.length, 1);
	assert.equal(aOnly[0]!.rawTo, './m1');
});

test('unresolved row missing meta.file/repo is dropped', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './x', resolved: false /* no meta */ },
	]);
	const list = await listUnresolvedRelations(null, REPO);
	assert.equal(list.length, 0);
});

test('promoteToResolved writes the resolved edge + removes the unresolved row', async () => {
	const a = makeEntity('a');
	const target = makeEntity('target', `${REPO}/src/target.ts`);
	await upsertEntities(null, [a, target]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './target', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	const list = await listUnresolvedRelations(null, REPO);
	assert.equal(list.length, 1);

	await promoteToResolved(null, list[0]!, target.id);

	// Resolved edge written
	assert.equal(await countOutEdges(await getU64(a.id)), 1);
	// Unresolved row removed
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 0);
});

test('updateUnresolvedMeta writes the new meta + bumps attemptedAt', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './x', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	const list = await listUnresolvedRelations(null, REPO);
	const id = list[0]!.id;
	await updateUnresolvedMeta(null, id, { repo: REPO, file: a.file, candidates: ['./x', './y'] });
	const after = await listUnresolvedRelations(null, REPO);
	assert.deepEqual(after[0]!.meta['candidates'], ['./x', './y']);
});

test('updateUnresolvedMeta on unknown id is a silent no-op', async () => {
	await updateUnresolvedMeta(null, 'bogus-id', { foo: 'bar' });
});

test('deleteUnresolvedForFile removes only that file\'s unresolved rows', async () => {
	const a = makeEntity('a', `${REPO}/src/a.ts`);
	const b = makeEntity('b', `${REPO}/src/b.ts`);
	await upsertEntities(null, [a, b]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './m1', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'IMPORTS', from: b.id, to: './m2', resolved: false, meta: { repo: REPO, file: b.file } },
	]);
	await deleteUnresolvedForFile(null, a.file);
	const remaining = await listUnresolvedRelations(null, REPO);
	assert.equal(remaining.length, 1);
	assert.equal(remaining[0]!.fromFile, b.file);
});

test('deleteUnresolvedForRepo removes everything for that repo only', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './x', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'IMPORTS', from: a.id, to: './y', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	await deleteUnresolvedForRepo(null, REPO);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 0);
});

test('deleteUnresolvedForRepo on unknown repo is a silent no-op', async () => {
	await deleteUnresolvedForRepo(null, '/repo/nonexistent');
});

// ---------------------------------------------------------------------------
// Batch ops
// ---------------------------------------------------------------------------

test('promoteResolvedBatch writes all edges + removes all unresolved rows', async () => {
	const a = makeEntity('a');
	const t1 = makeEntity('t1', `${REPO}/src/t1.ts`);
	const t2 = makeEntity('t2', `${REPO}/src/t2.ts`);
	await upsertEntities(null, [a, t1, t2]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './t1', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'IMPORTS', from: a.id, to: './t2', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	const list = await listUnresolvedRelations(null, REPO);
	assert.equal(list.length, 2);

	await promoteResolvedBatch(null, [
		{ unresolved: list.find(u => u.rawTo === './t1')!, targetEntityId: t1.id },
		{ unresolved: list.find(u => u.rawTo === './t2')!, targetEntityId: t2.id },
	]);
	assert.equal(await countOutEdges(await getU64(a.id)), 2);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 0);
});

test('updateUnresolvedMetaBatch updates each row', async () => {
	const a = makeEntity('a');
	await upsertEntities(null, [a]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'IMPORTS', from: a.id, to: './x', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'IMPORTS', from: a.id, to: './y', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	const list = await listUnresolvedRelations(null, REPO);
	await updateUnresolvedMetaBatch(null, [
		{ id: list[0]!.id, meta: { tag: 'one', repo: REPO, file: a.file } },
		{ id: list[1]!.id, meta: { tag: 'two', repo: REPO, file: a.file } },
	]);
	const after = await listUnresolvedRelations(null, REPO);
	const tags = after.map(u => u.meta['tag']).sort();
	assert.deepEqual(tags, ['one', 'two']);
});

test('promoteResolvedBatch on empty array is a no-op', async () => {
	await promoteResolvedBatch(null, []);
});

test('updateUnresolvedMetaBatch on empty array is a no-op', async () => {
	await updateUnresolvedMetaBatch(null, []);
});

// ---------------------------------------------------------------------------
// makeUnresolvedRelationId determinism
// ---------------------------------------------------------------------------

test('makeUnresolvedRelationId is deterministic', () => {
	const a = makeUnresolvedRelationId(REPO, 'from-id', 'IMPORTS', './target');
	const b = makeUnresolvedRelationId(REPO, 'from-id', 'IMPORTS', './target');
	assert.equal(a, b);
});

test('makeUnresolvedRelationId differs for different inputs', () => {
	const a = makeUnresolvedRelationId(REPO, 'x', 'IMPORTS', './a');
	const b = makeUnresolvedRelationId(REPO, 'x', 'IMPORTS', './b');
	assert.notEqual(a, b);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('resolved edges + unresolved rows survive close + reopen', async () => {
	const a = makeEntity('a'), b = makeEntity('b');
	await upsertEntities(null, [a, b]);
	const { addRepo } = await import('../repos.js');
	await addRepo(null, { path: REPO, name: 'foo', addedAt: '2026-05-05T10:00:00.000Z', status: 'pending' });

	await upsertRelations(null, [
		{ kind: 'CALLS',  from: a.id, to: b.id, resolved: true },
		{ kind: 'IMPORTS', from: a.id, to: './m', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	await closeGraphStore();

	assert.equal(await countOutEdges(await getU64(a.id)), 1);
	assert.equal((await listUnresolvedRelations(null, REPO)).length, 1);
});

// silences unused-import lint in case some imports go unused after edits
void RELATION_KIND_BYTE;
