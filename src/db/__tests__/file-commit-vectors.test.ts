/**
 * Epic c2ba6fa6, Story s2, t5 -- the embedding marker is set only once the
 * vector is stored. Against a real temporary vector table: a failed vector
 * write (a writer that refuses, put in front of the real table) leaves the
 * changed entities' markers empty and reports them as outstanding; a
 * successful one sets each marker to the model its vector came from; a first
 * allocated entity is a plain add and a changed one an upsert (one row per
 * id); updateEmbedding writes the vector before the marker.
 *
 * Run: npx tsx --test src/db/__tests__/file-commit-vectors.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { updateIndexStateRowInTxn } from '../graph/index-state-rows.js';
import { completenessOf, readIndexState } from '../index-state.js';
import { lookupRepoId } from '../repos.js';
import { _setVectorWriterForTest, commitFile, getEntity, reconcileEntityVectors, updateEmbedding } from '../entities.js';
import { addEntityEmbeddings, deleteEntityVecsByIds, searchEntityVecs } from '../lance/entity-vec.js';
import { IndexQueue } from '../../daemon/queue.js';
import { IndexerService } from '../../indexer/index.js';
import type { Watcher } from '../../indexer/watcher.js';
import type { DbClient } from '../client.js';
import { addRepo } from '../repos.js';
import { loadLocalProviderConfig } from '../../config/local.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/file-commit-vectors';
const FILE = `${REPO}/src/a.ts`;
const DIM = loadLocalProviderConfig().embeddingDim;
const MODEL = loadLocalProviderConfig().embeddingModel;   // the marker names the configured (active) model

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-file-commit-vectors-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'vectors', addedAt: '2026-11-01T00:00:00.000Z', status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function vec(seed: number, dim: number = DIM): number[] {
	return Array.from({ length: dim }, (_, i) => Math.sin(seed * 31 + i));
}
function entity(name: string, opts: { body?: string; vector?: number[] } = {}): Entity {
	return {
		id: createHash('sha256').update(`${REPO}\x00${FILE}\x00function\x00${name}\x00${Date.now()}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file: FILE,
		startLine: 1, endLine: 2, body: opts.body ?? `function ${name}() {}`,
		embedding: opts.vector ?? [],
		indexedAt: '2026-11-01T00:00:00.000Z',
	};
}
/** Every vector write refused for the duration of `fn`. */
async function withRefusedVectorWrites<T>(fn: () => Promise<T>): Promise<T> {
	const refuse = async (): Promise<never> => { throw new Error('vector store refused the write'); };
	_setVectorWriterForTest({ addEntityEmbeddings: refuse, writeEntityEmbeddings: refuse, writeEntityEmbedding: refuse });
	try { return await fn(); } finally { _setVectorWriterForTest(undefined); }
}
const marker = async (id: string): Promise<string> => (await getEntity(null, id))?.embeddingModel ?? '';
/** How many stored vectors carry this id (an add on top of an existing vector would make two). */
async function vectorRows(id: string, v: number[]): Promise<number> {
	const hits = await searchEntityVecs(v, [REPO], 50);
	return hits.filter(h => h.id === id).length;
}

test('t5: a successful vector write sets each changed entity\'s marker to the active embedding model; nothing is outstanding', async () => {
	const a = entity('a', { vector: vec(1) });
	const result = await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a], relations: [] });

	assert.equal(result.vectorsOutstanding, 0);
	assert.equal(await marker(a.id), MODEL);
	assert.equal(await vectorRows(a.id, vec(1)), 1);
});

test('t5: a failed vector write leaves the changed entities\' markers empty and reports them as outstanding, and the graph rows are still committed', async () => {
	const good = entity('good', { vector: vec(2) });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [good], relations: [] });
	assert.equal(await marker(good.id), MODEL);

	const changed = { ...good, body: 'function good() { return 1; }', embedding: vec(3) };
	const added = entity('added', { vector: vec(4) });
	const result = await withRefusedVectorWrites(() =>
		commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [changed, added], relations: [] }));

	assert.equal(result.vectorsOutstanding, 2);
	assert.deepEqual([await marker(good.id), await marker(added.id)], ['', '']);
	assert.equal((await getEntity(null, good.id))?.body, 'function good() { return 1; }', 'the graph commit stands');
});

test('t5: a first-allocated entity is added and a changed one upserted: one vector row per id after both', async () => {
	const a = entity('a', { vector: vec(5) });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a], relations: [] });
	const changed = { ...a, body: 'function a() { return 2; }', embedding: vec(6) };
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h2', entities: [changed], relations: [] });

	assert.equal(await vectorRows(a.id, vec(6)), 1, 'the second write replaced the vector instead of adding a second row');
	assert.equal(await marker(a.id), MODEL);
});

test('t5: updateEmbedding writes the vector before the marker: a refused vector leaves the marker empty, a stored one sets it', async () => {
	const a = entity('a');   // no vector yet: committed with an empty marker
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a], relations: [] });
	assert.equal(await marker(a.id), '');

	await assert.rejects(withRefusedVectorWrites(() => updateEmbedding(null, a.id, vec(7), MODEL)), /refused/);
	assert.equal(await marker(a.id), '', 'no marker for a vector that was not stored');

	await updateEmbedding(null, a.id, vec(8), MODEL);
	assert.equal(await marker(a.id), MODEL);
	assert.equal(await vectorRows(a.id, vec(8)), 1);
});

// ---------------------------------------------------------------------------
// t6: the unembedded count
// ---------------------------------------------------------------------------

async function finishedState(): Promise<void> {
	const repoId = (await lookupRepoId(REPO))!;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, row => { row.fullIndexFinished = true; }); });
}

test('t6: after a commit whose vector write failed, unembedded counts the entities without a vector and the repository is not complete; the backfill-style write brings it back to zero', async () => {
	await finishedState();
	const [a, b] = [entity('a', { vector: vec(11) }), entity('b', { vector: vec(12) })];
	await withRefusedVectorWrites(() => commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a, b], relations: [] }));

	let state = await readIndexState(REPO);
	assert.equal(state?.unembedded, 2);
	assert.equal(completenessOf(state).complete, false);
	assert.ok(completenessOf(state).reasons.includes('2 entities have no vector'), completenessOf(state).reasons.join('; '));

	await updateEmbedding(null, a.id, vec(11), MODEL);
	await updateEmbedding(null, b.id, vec(12), MODEL);
	state = await readIndexState(REPO);
	assert.equal(state?.unembedded, 0);
	assert.equal(completenessOf(state).complete, true, completenessOf(state).reasons.join('; '));
});

test('t6: entities the embed step never selects (an empty body: endpoints, module stubs) are never counted', async () => {
	const endpoint = { ...entity('endpoint'), body: '' };
	const coded = entity('coded');   // a body, no vector yet
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [endpoint, coded], relations: [] });
	assert.equal((await readIndexState(REPO))?.unembedded, 1);

	// Removing the file takes its counted entity out of the count again.
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: null, entities: [], relations: [] });
	assert.equal((await readIndexState(REPO))?.unembedded, 0);
});

test('t6: the recount when the store opens corrects a wrong stored count', async () => {
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [entity('a'), entity('b')], relations: [] });
	const repoId = (await lookupRepoId(REPO))!;
	await withWriteTxn(s => { updateIndexStateRowInTxn(s, repoId, row => { row.unembedded = 7; }); });

	await closeGraphStore();
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await getGraphStore();
	assert.equal((await readIndexState(REPO))?.unembedded, 2);
});

// ---------------------------------------------------------------------------
// t7: the graph and the vector table agree again at start
// ---------------------------------------------------------------------------

test('t7: a vector whose entity is not stored is deleted, so a later first commit of that id leaves exactly one vector row', async () => {
	const a = entity('a', { vector: vec(21) });
	// A removal whose vector delete failed: the vector outlives its entity.
	await addEntityEmbeddings([{ id: a.id, embedding: new Float32Array(vec(21)), repo: REPO, kind: 'function', artifact: false }]);
	assert.equal(await vectorRows(a.id, vec(21)), 1);

	// (The vector table is shared by this file's tests, each with a fresh graph: earlier tests' vectors are orphans too.)
	const result = await reconcileEntityVectors();
	assert.ok(result.orphanVectorsDeleted >= 1);
	assert.equal(await vectorRows(a.id, vec(21)), 0);

	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a], relations: [] });   // a plain add: first allocated
	assert.equal(await vectorRows(a.id, vec(21)), 1);
});

test('t7: an entity whose marker says embedded but whose vector is missing has its marker cleared and is counted unembedded', async () => {
	const a = entity('a', { vector: vec(22) });
	await commitFile({ repoPath: REPO, filePath: FILE, contentHash: 'h1', entities: [a], relations: [] });
	assert.equal(await marker(a.id), MODEL);
	await deleteEntityVecsByIds([a.id]);   // e.g. a vector store reset

	const result = await reconcileEntityVectors();
	assert.equal(result.markersCleared, 1);
	assert.equal(await marker(a.id), '');
	assert.equal((await readIndexState(REPO))?.unembedded, 1);
});

test('t7: the indexer reconciles the graph and the vector table when it starts, before any job', async () => {
	const ghost = entity('ghost', { vector: vec(23) });
	await addEntityEmbeddings([{ id: ghost.id, embedding: new Float32Array(vec(23)), repo: REPO, kind: 'function', artifact: false }]);
	const watcher = { onEvents() {}, onFilterRefreshed() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {}, async syncIgnores() {} } as unknown as Watcher;
	const queue = new IndexQueue();
	queue.enqueue = (() => {}) as typeof queue.enqueue;

	await new IndexerService(null as unknown as DbClient, queue, watcher, undefined, 600_000).start([]);

	assert.equal(await vectorRows(ghost.id, vec(23)), 0);
});

