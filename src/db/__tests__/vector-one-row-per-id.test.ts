/**
 * ISSUE-8c7d75b08e02a7a8 -- the entity vector table keeps one row per entity
 * id. Against a real temporary vector table: a removal whose vector delete is
 * refused does not fail the commit, and the id's re-creation still leaves one
 * row (the add deletes any row first); a backfill write for an entity removed
 * meanwhile leaves no vector behind; the start-time reconciliation repairs an
 * id stored twice so the backfill writes it once; a refused delete before the
 * add writes nothing and leaves the marker empty for the backfill.
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
import { _setVectorWriterForTest, commitFile, getEntity, reconcileEntityVectors, writeBackfillVectors } from '../entities.js';
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
