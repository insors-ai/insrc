/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t10 — deleteEntitiesForRepo({ returnIncomingToPending }):
 * every relationship another repository holds into the deleted repository's
 * entities is written back as a pending row of the holder awaiting the
 * entity's id, in the same transaction as the delete and with its counts. A
 * failure inside that transaction leaves both repositories as they were;
 * without the option the delete is as before.
 *
 * Over a temporary graph store.
 *
 * Run: npx tsx --test src/db/__tests__/entities-return-to-pending.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { encodeEntityKey } from '../graph/keys.js';
import { addRepo } from '../repos.js';
import { deleteEntitiesForRepo, entityU64ForId, getEntity, upsertEntities } from '../entities.js';
import { listUnresolvedRelations, upsertRelations } from '../relations.js';
import { outNeighbors } from '../graph/edges.js';
import { readIndexState } from '../index-state.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const NOW = '2026-10-18T00:00:00.000Z';
let store: string;
let repoA: string, repoB: string, repoC: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s1t10-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	[repoA, repoB, repoC] = ['a', 'b', 'c'].map(n => mkdtempSync(join(tmpdir(), `insrc-s1t10-repo-${n}-`))) as [string, string, string];
	for (const r of [repoA, repoB, repoC]) await addRepo(null, { path: r, name: '', addedAt: NOW, status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	for (const r of [repoA, repoB, repoC]) rmSync(r, { recursive: true, force: true });
});

function fn(repo: string, name: string): Entity {
	const file = `${repo}/${name}.ts`;
	return {
		id: makeEntityId(repo, file, 'function', name), kind: 'function', name, language: 'typescript',
		repoId: 1, repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: NOW,
	};
}

/** A in repo A calls B in repo B, by a hand-written edge; B also calls its own helper. */
async function fixture(): Promise<{ a: Entity; b: Entity; helper: Entity }> {
	const a = fn(repoA, 'a'), b = fn(repoB, 'b'), helper = fn(repoB, 'helper');
	await upsertEntities(null, [a, b, helper]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true, meta: { repo: repoA, file: a.file } },
		{ kind: 'CALLS', from: b.id, to: helper.id, resolved: true, meta: { repo: repoB, file: b.file } },
	]);
	return { a, b, helper };
}

const outOf = async (e: Entity): Promise<bigint[]> => outNeighbors((await entityU64ForId(e.id))!, { kindFilter: ['CALLS'] });

test('with returnIncomingToPending, a hand-written edge from repository A into B is a pending row of A awaiting the entity after B is deleted, counted in A\'s state; B\'s own edge is not returned', async () => {
	const { a, b } = await fixture();
	const result = await deleteEntitiesForRepo(null, repoB, { returnIncomingToPending: true });

	assert.deepEqual(result, { returnedToPending: 1 });
	assert.equal(await getEntity(null, b.id), null, 'B\'s entities are deleted');
	assert.deepEqual(await outOf(a), [], 'the edge is gone');
	const pending = await listUnresolvedRelations(null, repoA);
	assert.deepEqual(pending.map(r => ({ kind: r.kind, from: r.fromEntity, rawTo: r.rawTo, awaitsId: r.meta['awaitsId'], class: r.meta['class'] })),
		[{ kind: 'CALLS', from: a.id, rawTo: b.id, awaitsId: true, class: 'awaiting-target' }]);
	assert.equal((await readIndexState(repoA))?.pending['awaiting-target'], 1, 'counted in A\'s index state');
	assert.deepEqual(await listUnresolvedRelations(null, repoB), [], 'B holds no pending row');
});

test('a failure inside the delete transaction leaves both B\'s rows and A\'s edge untouched', async () => {
	const { a, b, helper } = await fixture();
	// A second holder, in repository C, whose row cannot be read: the transaction throws
	// while it reads that holder, after A's pending row was written in it (A's entity
	// sorts first), so the rollback has to undo a write.
	const c = fn(repoC, 'c');
	await upsertEntities(null, [c]);
	await upsertRelations(null, [{ kind: 'CALLS', from: c.id, to: b.id, resolved: true, meta: { repo: repoC, file: c.file } }]);
	const cU64 = (await entityU64ForId(c.id))!;
	assert.ok(cU64 > (await entityU64ForId(a.id))!, 'A\'s edge is returned before C\'s is read');
	await withWriteTxn(s => { s.entity.put(encodeEntityKey(cU64), Buffer.from([0xc1])); });

	await assert.rejects(deleteEntitiesForRepo(null, repoB, { returnIncomingToPending: true }));

	assert.notEqual(await getEntity(null, b.id), null, 'B\'s entities are still stored');
	assert.notEqual(await getEntity(null, helper.id), null);
	assert.deepEqual(await outOf(a), [(await entityU64ForId(b.id))!], 'A\'s edge is still an edge');
	assert.deepEqual(await listUnresolvedRelations(null, repoA), [], 'the pending row written for A was rolled back');
	assert.equal((await readIndexState(repoA))?.pending['awaiting-target'] ?? 0, 0, 'and its count');
});

test('without the option the delete is as before: the edge is removed and nothing is returned to pending', async () => {
	const { a, b } = await fixture();
	const result = await deleteEntitiesForRepo(null, repoB);

	assert.deepEqual(result, { returnedToPending: 0 });
	assert.equal(await getEntity(null, b.id), null);
	assert.deepEqual(await outOf(a), []);
	assert.deepEqual(await listUnresolvedRelations(null, repoA), []);
});
