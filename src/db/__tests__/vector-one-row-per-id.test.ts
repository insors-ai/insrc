/**
 * ISSUE-8c7d75b08e02a7a8 -- the entity vector table keeps one row per entity
 * id. Against a real temporary vector table: a removal whose vector delete is
 * refused does not fail the commit, and the id's re-creation still leaves one
 * row (the add deletes any row first); a backfill write for an entity removed
 * meanwhile leaves no vector behind; the start-time reconciliation repairs an
 * id stored twice so the backfill writes it once; a refused delete before the
 * add writes nothing and leaves the marker empty for the backfill. Review
 * round 1: with the backfill held inside its write while the index lane
 * commits, the id still ends with one row and a marker only for the vector
 * that describes the stored body; a backfill vector for a body refreshed since
 * it was listed never replaces the fresh one; the reconciliation's deletes go
 * in chunks.
 *
 * Run: npx tsx --test src/db/__tests__/vector-one-row-per-id.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, setGraphStorePath } from '../graph/store.js';
import { readIndexState } from '../index-state.js';
import { _setVectorWriterForTest, commitFile, deleteEntitiesById, getEntity, reconcileEntityVectors, writeBackfillVectors } from '../entities.js';
import * as entityVec from '../lance/entity-vec.js';
import { addEntityEmbeddings, searchEntityVecs } from '../lance/entity-vec.js';
import { addRepo } from '../repos.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/vector-one-row';
const FILE = `${REPO}/src/a.ts`;
const DIM = loadLocalProviderConfig().embeddingDim;
const MODEL = loadLocalProviderConfig().embeddingModel;

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-vector-one-row-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'one-row', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	_setVectorWriterForTest(undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const vec = (seed: number): number[] => Array.from({ length: DIM }, (_, i) => Math.sin(seed * 37 + i));
let serial = 0;
function entity(name: string, vector: number[] = []): Entity {
	return {
		// Unique per test: the vector table is shared by this file's tests.
		id: createHash('sha256').update(`${REPO}\x00${FILE}\x00function\x00${name}\x00${++serial}\x00${Date.now()}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file: FILE,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: vector, indexedAt: '2026-11-01T00:00:00.000Z',
	};
}
/** How many stored vector rows carry this id. */
async function rows(id: string, v: number[]): Promise<number> {
	return (await searchEntityVecs(v, [REPO], 100)).filter(h => h.id === id).length;
}
const marker = async (id: string): Promise<string> => (await getEntity(null, id))?.embeddingModel ?? '';
const refuse = async (): Promise<never> => { throw new Error('vector store refused the delete'); };
const commit = (hash: string | null, entities: Entity[]) => commitFile({ repoPath: REPO, filePath: FILE, contentHash: hash, entities, relations: [] });

test('a removal whose vector delete is refused does not fail the commit, and re-creating the id leaves one vector row', async () => {
	const x = entity('x', vec(1));
	await commit('h1', [x]);
	assert.equal(await rows(x.id, vec(1)), 1);

	_setVectorWriterForTest({ deleteEntityVecsByIds: refuse });
	const removed = await commit(null, []);   // resolves: the graph commit stands
	_setVectorWriterForTest(undefined);
	assert.equal(removed.entitiesRemoved, 1);
	assert.equal(await getEntity(null, x.id), null);
	assert.equal(await rows(x.id, vec(1)), 1, 'the vector outlived its entity');

	await commit('h2', [{ ...x, embedding: vec(1) }]);   // first allocated again: a plain add
	assert.equal(await rows(x.id, vec(1)), 1, 'one row, not the orphan plus the add');
	assert.equal(await marker(x.id), MODEL);
});

test('a backfill write for an entity removed meanwhile leaves no vector behind, so its re-creation leaves one row', async () => {
	const x = entity('x');   // committed without a vector: the backfill's candidate
	await commit('h1', [x]);
	await commit(null, []);  // the index lane removes it while the backfill embeds

	assert.equal(await writeBackfillVectors([{ ...x, embedding: vec(2) }]), 0);
	assert.equal(await rows(x.id, vec(2)), 0, 'the vector of the removed entity was deleted');

	await commit('h2', [{ ...x, embedding: vec(2) }]);
	assert.equal(await rows(x.id, vec(2)), 1);
});

test('the start-time reconciliation repairs an id stored twice: every row deleted, the marker cleared, and the backfill writes one row', async () => {
	const x = entity('x', vec(3));
	await commit('h1', [x]);
	await addEntityEmbeddings([{ id: x.id, embedding: new Float32Array(vec(3)), repo: REPO, kind: 'function', artifact: false }]);
	assert.equal(await rows(x.id, vec(3)), 2);

	const result = await reconcileEntityVectors();
	assert.equal(result.duplicateIdsRepaired, 1);
	assert.equal(await rows(x.id, vec(3)), 0);
	assert.equal(await marker(x.id), '');
	assert.equal((await readIndexState(REPO))?.unembedded, 1, 'counted for the backfill');

	assert.equal(await writeBackfillVectors([{ ...x, embedding: vec(3) }]), 0);
	assert.equal(await rows(x.id, vec(3)), 1);
	assert.equal(await marker(x.id), MODEL);
	assert.equal((await reconcileEntityVectors()).duplicateIdsRepaired, 0);
});

test('a refused delete before the add writes no vector and leaves the marker empty, so the backfill writes the one row', async () => {
	const x = entity('x', vec(4));
	// An orphan from an earlier failed removal delete.
	await addEntityEmbeddings([{ id: x.id, embedding: new Float32Array(vec(4)), repo: REPO, kind: 'function', artifact: false }]);

	_setVectorWriterForTest({ deleteEntityVecsByIds: refuse });
	const result = await commit('h1', [x]);
	_setVectorWriterForTest(undefined);
	assert.equal(result.vectorsOutstanding, 1);
	assert.equal(await marker(x.id), '');
	assert.equal(await rows(x.id, vec(4)), 1, 'no add beside the orphan');

	assert.equal(await writeBackfillVectors([{ ...x, embedding: vec(4) }]), 0);
	assert.equal(await rows(x.id, vec(4)), 1);
	assert.equal(await marker(x.id), MODEL);
});

// ---------------------------------------------------------------------------
// Review round 1: the backfill lane beside the index lane
// ---------------------------------------------------------------------------

/** A gate the test opens: `entered` resolves when the held call arrives, `open()` lets it continue. */
function gate(): { entered: Promise<void>; arrive: () => void; opened: Promise<void>; open: () => void } {
	let arrive!: () => void; let open!: () => void;
	const entered = new Promise<void>(r => { arrive = r; });
	const opened = new Promise<void>(r => { open = r; });
	return { entered, arrive, opened, open };
}
const settle = (): Promise<void> => new Promise(r => setTimeout(r, 300));
async function nearest(v: number[]): Promise<{ id: string; distance: number } | undefined> {
	return (await searchEntityVecs(v, [REPO], 1))[0];
}

test('the index lane removing and re-creating an id while the backfill is inside its write still leaves one row and a set marker', async () => {
	const x = entity('x');
	await commit('h1', [x]);   // stored without a vector: the backfill's candidate
	const g = gate();
	let held = true;
	_setVectorWriterForTest({ addEntityEmbeddings: async rows => {
		if (held) { held = false; g.arrive(); await g.opened; }
		await entityVec.addEntityEmbeddings(rows);
	} });
	const backfill = writeBackfillVectors([{ ...x, embedding: vec(5) }]);
	await g.entered;
	// The index lane: the file is deleted and restored while the backfill writes.
	const lane = (async () => { await commit(null, []); await commit('h2', [{ ...x, embedding: vec(5) }]); })();
	await settle();
	g.open();
	await Promise.all([backfill, lane]);

	assert.equal(await rows(x.id, vec(5)), 1);
	assert.equal(await marker(x.id), MODEL);
});

test('a backfill vector for a body refreshed since it was listed never replaces the fresh vector, and no marker is set for it', async () => {
	const x = entity('x');
	await commit('h1', [x]);
	const listed = { ...x, embedding: vec(6) };            // the backfill embedded body v1
	const refreshed = { ...x, body: 'function x() { return 2; }', embedding: vec(7) };
	await commit('h2', [refreshed]);                        // the index lane commits v2 with its vector

	assert.equal(await writeBackfillVectors([listed]), 0);
	const hit = await nearest(vec(7));
	assert.equal(hit?.id, x.id);
	assert.ok((hit?.distance ?? 1) < 1e-6, 'the stored vector is still the refreshed body\'s');
	assert.equal(await rows(x.id, vec(7)), 1);
	assert.equal(await marker(x.id), MODEL);
});

test('a refresh committed while the backfill is inside its write leaves the refreshed body\'s vector and no marker for the stale one', async () => {
	const x = entity('x');
	await commit('h1', [x]);
	const g = gate();
	let held = true;
	_setVectorWriterForTest({ addEntityEmbeddings: async rows => {
		if (held) { held = false; g.arrive(); await g.opened; }
		await entityVec.addEntityEmbeddings(rows);
	} });
	const backfill = writeBackfillVectors([{ ...x, embedding: vec(8) }]);
	await g.entered;
	const refreshed = { ...x, body: 'function x() { return 3; }', embedding: vec(9) };
	const lane = commit('h2', [refreshed]);
	await settle();
	g.open();
	await Promise.all([backfill, lane]);

	const hit = await nearest(vec(9));
	assert.equal(hit?.id, x.id);
	assert.ok((hit?.distance ?? 1) < 1e-6, 'the refreshed body\'s vector is the one stored');
	assert.equal(await rows(x.id, vec(9)), 1);
	assert.equal(await marker(x.id), MODEL);
});

test('a backfill vector for an entity removed during the write is deleted even when the removal\'s own vector delete fails', async () => {
	const x = entity('x');
	await commit('h1', [x]);
	const g = gate();
	let held = true;
	let deletes = 0;
	_setVectorWriterForTest({
		addEntityEmbeddings: async rows => { if (held) { held = false; g.arrive(); await g.opened; } await entityVec.addEntityEmbeddings(rows); },
		// 1: the backfill's delete before its add; 2: its delete of the removed entity's vector; 3: the removal's own delete, refused.
		deleteEntityVecsByIds: async ids => { if (++deletes === 3) throw new Error('vector store refused the delete'); await entityVec.deleteEntityVecsByIds(ids); },
	});
	const backfill = writeBackfillVectors([{ ...x, embedding: vec(10) }]);
	await g.entered;
	const lane = commit(null, []);
	await settle();
	g.open();
	await Promise.all([backfill, lane]);

	assert.equal(deletes, 3);
	assert.equal(await rows(x.id, vec(10)), 0);
});

test('when the reconciliation\'s delete fails after it cleared the marker, the backfill\'s write still leaves one row', async () => {
	const x = entity('x', vec(11));
	await commit('h1', [x]);
	await addEntityEmbeddings([{ id: x.id, embedding: new Float32Array(vec(11)), repo: REPO, kind: 'function', artifact: false }]);
	_setVectorWriterForTest({ deleteEntityVecsByIds: refuse });
	await assert.rejects(reconcileEntityVectors(), /refused/);
	_setVectorWriterForTest(undefined);
	assert.equal(await marker(x.id), '');
	assert.equal(await rows(x.id, vec(11)), 2);

	assert.equal(await writeBackfillVectors([{ ...x, embedding: vec(11) }]), 0);
	assert.equal(await rows(x.id, vec(11)), 1);
	assert.equal(await marker(x.id), MODEL);
});

test('the reconciliation deletes in chunks of at most 500 ids', async () => {
	const orphans = Array.from({ length: 1001 }, (_, i) => createHash('sha256').update(`orphan\x00${i}\x00${Date.now()}`).digest('hex').slice(0, 32));
	await addEntityEmbeddings(orphans.map((id, i) => ({ id, embedding: new Float32Array(vec(1000 + i)), repo: REPO, kind: 'function', artifact: false })));
	const sizes: number[] = [];
	_setVectorWriterForTest({ deleteEntityVecsByIds: async ids => { sizes.push(ids.length); await entityVec.deleteEntityVecsByIds(ids); } });
	const result = await reconcileEntityVectors();

	assert.ok(result.orphanVectorsDeleted >= 1001);
	assert.ok(sizes.length >= 3 && sizes.every(n => n <= 500), JSON.stringify(sizes));
	const left = new Set(await entityVec.listEntityVecIds());
	assert.equal(orphans.filter(id => left.has(id)).length, 0);
});

test('when the refresh\'s own vector write fails after a backfill write for the old body, the marker stays empty for the backfill', async () => {
	const x = entity('x');
	await commit('h1', [x]);
	const g = gate();
	let held = true;
	_setVectorWriterForTest({
		addEntityEmbeddings: async rows => { if (held) { held = false; g.arrive(); await g.opened; } await entityVec.addEntityEmbeddings(rows); },
		writeEntityEmbeddings: refuse,   // the refresh's upsert of the changed entity
	});
	const backfill = writeBackfillVectors([{ ...x, embedding: vec(12) }]);
	await g.entered;
	const lane = commit('h2', [{ ...x, body: 'function x() { return 4; }', embedding: vec(13) }]);
	await settle();
	g.open();
	const [, refreshed] = await Promise.all([backfill, lane]);

	assert.equal(refreshed.vectorsOutstanding, 1);
	assert.equal(await marker(x.id), '', 'no marker for the old body\'s vector');
	assert.equal((await readIndexState(REPO))?.unembedded, 1);
});

test('a removal through deleteEntitiesById whose vector delete fails is logged, not thrown: the graph change stands', async () => {
	const x = entity('x', vec(14));
	await commit('h1', [x]);
	_setVectorWriterForTest({ deleteEntityVecsByIds: refuse });
	await deleteEntitiesById(null, [x.id]);
	_setVectorWriterForTest(undefined);
	assert.equal(await getEntity(null, x.id), null);
});
