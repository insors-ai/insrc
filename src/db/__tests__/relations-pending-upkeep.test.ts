/**
 * Epic c2ba6fa6, Story s1, t4 -- pending-row deletes, meta updates and the
 * by-target read keep the counts true.
 *
 * Run: npx tsx --test src/db/__tests__/relations-pending-upkeep.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { decodeUnresolvedRow } from '../graph/codec.js';
import { putIndexStateRowInTxn } from '../graph/index-state-rows.js';
import { emptyIndexStateRow } from '../graph/pending-class.js';
import { upsertEntities } from '../entities.js';
import { readIndexState } from '../index-state.js';
import { addRepo, lookupRepoId } from '../repos.js';
import {
	deleteUnresolvedForFile, deleteUnresolvedForRepo, deleteUnresolvedForRepoFile, listUnresolvedRelations,
	promoteResolvedBatch, updateUnresolvedMeta, updateUnresolvedMetaBatch, upsertRelations,
} from '../relations.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const A = '/repo/upkeep-a';
const B = '/repo/upkeep-b';

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-pending-upkeep-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	for (const path of [A, B]) {
		await addRepo(null, { path, name: path, addedAt: '2026-10-16T00:00:00.000Z', status: 'ready' });
		const repoId = (await lookupRepoId(path))!;
		await withWriteTxn(s => { putIndexStateRowInTxn(s, repoId, { ...emptyIndexStateRow(), fullIndexFinished: true }); });
	}
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function entity(repo: string, name: string): Entity {
	const file = `${repo}/src/${name}.ts`;
	return {
		id: createHash('sha256').update(`${repo}\x00${file}\x00function\x00${name}`).digest('hex').slice(0, 32),
		kind: 'function', name, language: 'typescript', repoId: 1, repo, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-10-16T00:00:00.000Z',
	};
}
const ABSENT = 'f'.repeat(32);

async function rowCount(): Promise<number> { return [...(await getGraphStore()).unresolved.getRange()].length; }
async function awaitingIndex(id: string): Promise<number> { return [...(await getGraphStore()).unresolvedByTarget.getValues(Buffer.from(id, 'utf8'))].length; }
async function awaitingCount(repo: string): Promise<number> { return (await readIndexState(repo))!.pending['awaiting-target']; }

/** One row kept awaiting ABSENT and one raw-name row, both from `a`'s file. */
async function seedTwoRows(): Promise<Entity> {
	const a = entity(A, 'a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: ABSENT, resolved: true },
		{ kind: 'CALLS', from: a.id, to: 'raw', resolved: false, meta: { repo: A, file: a.file } },
	]);
	assert.equal(await rowCount(), 2);
	assert.equal(await awaitingCount(A), 2);
	assert.equal(await awaitingIndex(ABSENT), 1);
	return a;
}

test('each of the three delete functions removes its rows, their by-target entries and their counts', async () => {
	for (const [label, del] of [
		['deleteUnresolvedForFile', (a: Entity) => deleteUnresolvedForFile(null, a.file)],
		['deleteUnresolvedForRepoFile', (a: Entity) => deleteUnresolvedForRepoFile(null, A, a.file)],
		['deleteUnresolvedForRepo', () => deleteUnresolvedForRepo(null, A)],
	] as const) {
		const a = await seedTwoRows();
		await del(a);
		assert.equal(await rowCount(), 0, `${label}: rows removed`);
		assert.equal(await awaitingIndex(ABSENT), 0, `${label}: the by-target entry is removed`);
		assert.equal(await awaitingCount(A), 0, `${label}: the counts are decremented`);
		assert.deepEqual((await readIndexState(A))!.reasonCounts.awaiting, {}, `${label}: the reason counts too`);
	}
});

test('a reclass merges meta: awaitsId and specifier survive, a stale candidates list is cleared, and the counts move', async () => {
	const a = entity(A, 'a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: ABSENT, resolved: true },
		{ kind: 'EXPORTS', from: a.id, to: 'f', resolved: false, meta: { repo: A, file: a.file, specifier: './b', exportedAs: 'g' } },
	]);
	const [awaiting, exported] = [...(await getGraphStore()).unresolved.getRange()]
		.map(({ value }) => decodeUnresolvedRow(value as Buffer))
		.sort((x, y) => (x.kind === 'CALLS' ? -1 : 1) - (y.kind === 'CALLS' ? -1 : 1));

	await updateUnresolvedMetaBatch(null, [
		{ id: awaiting!.id, meta: { class: 'ambiguous', candidates: ['p', 'q'] } },
		{ id: exported!.id, meta: { class: 'ambiguous', candidates: ['r'] } },
	]);
	let state = (await readIndexState(A))!;
	assert.deepEqual(state.pending, { 'awaiting-target': 0, 'ambiguous': 2, 'no-candidate': 0, 'external-endpoint': 0 });

	await updateUnresolvedMeta(null, exported!.id, { class: 'no-candidate', reason: 'no-match' });
	const after = decodeUnresolvedRow((await getGraphStore()).unresolved.get(exported!.id) as Buffer);
	assert.equal(after.meta['specifier'], './b', 'specifier survives');
	assert.equal(after.meta['exportedAs'], 'g', 'exportedAs survives');
	assert.equal(after.meta['candidates'], undefined, 'the stale candidates list is cleared');
	const kept = decodeUnresolvedRow((await getGraphStore()).unresolved.get(awaiting!.id) as Buffer);
	assert.equal(kept.meta['awaitsId'], true, 'awaitsId survives');
	assert.deepEqual(kept.meta['candidates'], ['p', 'q'], 'an ambiguous row keeps its candidates');
	state = (await readIndexState(A))!;
	assert.deepEqual(state.pending, { 'awaiting-target': 0, 'ambiguous': 1, 'no-candidate': 1, 'external-endpoint': 0 });
});

test('listUnresolvedRelations with opts.awaiting returns the rows awaiting an id from every repository, without scanning the pending table', async () => {
	const a = entity(A, 'a');
	const b = entity(B, 'b');
	await upsertEntities(null, [a, b]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: ABSENT, resolved: true },
		{ kind: 'CALLS', from: b.id, to: ABSENT, resolved: true },
		{ kind: 'CALLS', from: a.id, to: 'unrelated', resolved: false, meta: { repo: A, file: a.file } },
	]);
	const store = await getGraphStore();
	const realRange = store.unresolved.getRange.bind(store.unresolved);
	store.unresolved.getRange = (() => { throw new Error('the pending table was scanned'); }) as typeof store.unresolved.getRange;
	try {
		const rows = await listUnresolvedRelations(null, A, undefined, { awaiting: [ABSENT] });
		assert.deepEqual(rows.map(r => r.repo).sort(), [A, B].sort());
		assert.ok(rows.every(r => r.rawTo === ABSENT));
	} finally {
		store.unresolved.getRange = realRange;
	}
	// Without the option the read is as today: this repository's rows only.
	assert.equal((await listUnresolvedRelations(null, A)).length, 2);
});

test('promotions count each removal once: an edge lowers the class count by exactly one; a re-key leaves the awaiting count unchanged', async () => {
	const a = entity(A, 'a');
	const t = entity(A, 't');
	await upsertEntities(null, [a, t]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: 't', resolved: false, meta: { repo: A, file: a.file } },
		{ kind: 'CALLS', from: a.id, to: 'later', resolved: false, meta: { repo: A, file: a.file } },
	]);
	const list = await listUnresolvedRelations(null, A);
	assert.equal(await awaitingCount(A), 2);
	await promoteResolvedBatch(null, [{ unresolved: list.find(u => u.rawTo === 't')!, targetEntityId: t.id }]);
	assert.equal(await awaitingCount(A), 1, 'an edge lowers the count by exactly one');
	await promoteResolvedBatch(null, [{ unresolved: list.find(u => u.rawTo === 'later')!, targetEntityId: ABSENT }]);
	assert.equal(await awaitingCount(A), 1, 'a re-key leaves it unchanged');
	assert.equal(await rowCount(), 1);
});
