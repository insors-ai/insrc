/**
 * Epic c2ba6fa6, Story s1, t3 -- pending-row writes keep and count every
 * relationship.
 *
 * Every resolved relationship ends as an edge, one pending row awaiting its
 * target by id, or a counted unwritable; pending rows are counted by class in
 * the same transaction; promotions re-key a row they keep awaiting and report
 * what they did.
 *
 * Run: npx tsx --test src/db/__tests__/relations-awaiting-target.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { decodeUnresolvedRow, type UnresolvedRow } from '../graph/codec.js';
import { putIndexStateRowInTxn, readUnattributedUnwritableInTxn } from '../graph/index-state-rows.js';
import { emptyIndexStateRow } from '../graph/pending-class.js';
import { upsertEntities } from '../entities.js';
import { readIndexState } from '../index-state.js';
import { addRepo, lookupRepoId } from '../repos.js';
import {
	listUnresolvedRelations, makeUnresolvedRelationId, promoteResolvedBatch, promoteToResolved, upsertRelations,
} from '../relations.js';
import type { Entity, Relation } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

const REPO = '/repo/awaiting';

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-relations-awaiting-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'awaiting', addedAt: '2026-10-16T00:00:00.000Z', status: 'ready' });
	const repoId = (await lookupRepoId(REPO))!;
	// A finished, otherwise complete state, so the tests read what the writes add.
	await withWriteTxn(s => { putIndexStateRowInTxn(s, repoId, { ...emptyIndexStateRow(), fullIndexFinished: true }); });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function id(file: string, kind: string, name: string): string {
	return createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
}
function entity(name: string, file = `${REPO}/src/${name}.ts`): Entity {
	return {
		id: id(file, 'function', name), kind: 'function', name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 2, body: `function ${name}() {}`, embedding: [], indexedAt: '2026-10-16T00:00:00.000Z',
	};
}
async function pendingRows(): Promise<UnresolvedRow[]> {
	const store = await getGraphStore();
	return [...store.unresolved.getRange()].map(({ value }) => decodeUnresolvedRow(value as Buffer));
}
async function awaitingIdsFor(targetId: string): Promise<string[]> {
	const store = await getGraphStore();
	return [...store.unresolvedByTarget.getValues(Buffer.from(targetId, 'utf8'))].map(v => (v as Buffer).toString('utf8'));
}

test('each input of a resolved write ends as an edge, one pending row awaiting the target, or a counted unwritable', async () => {
	const a = entity('a');
	const b = entity('b');
	await upsertEntities(null, [a, b]);
	const absent = id(`${REPO}/src/later.ts`, 'function', 'later');
	const rels: Relation[] = [
		{ kind: 'CALLS', from: a.id, to: b.id, resolved: true },                                          // edge
		{ kind: 'CALLS', from: a.id, to: absent, resolved: true, meta: { repo: REPO } },                 // kept awaiting
		{ kind: 'CALLS', from: 'no-such-source', to: b.id, resolved: true, meta: { repo: REPO } },        // unwritable: source-missing (this repo)
		{ kind: 'CALLS', from: 'no-such-source-2', to: b.id, resolved: true },                           // unwritable: no repository -> daemon-wide
		{ kind: 'NOT_A_KIND' as Relation['kind'], from: a.id, to: b.id, resolved: true, meta: { repo: REPO } }, // unwritable: unknown-kind
	];
	await upsertRelations(null, rels);

	const rows = await pendingRows();
	assert.equal(rows.length, 1, 'exactly one pending row');
	const kept = rows[0]!;
	assert.equal(kept.id, makeUnresolvedRelationId(REPO, a.id, 'CALLS', absent), 'keyed by the awaited id');
	assert.equal(kept.rawTo, absent);
	assert.deepEqual(
		{ awaitsId: kept.meta['awaitsId'], class: kept.meta['class'], reason: kept.meta['reason'], file: kept.meta['file'], repo: kept.meta['repo'] },
		{ awaitsId: true, class: 'awaiting-target', reason: 'target-not-stored-yet', file: a.file, repo: REPO },
	);
	assert.equal(kept.fromFile, a.file, 'the absolute file, as the parser writes it');
	assert.deepEqual(await awaitingIdsFor(absent), [kept.id], 'indexed by the awaited id');

	const state = (await readIndexState(REPO))!;
	assert.equal(state.pending['awaiting-target'], 1);
	assert.deepEqual(state.reasonCounts.awaiting, { 'target-not-stored-yet': 1 });
	assert.equal(state.unwritable, 2);
	assert.deepEqual(state.reasonCounts.unwritable, { 'source-missing': 1, 'unknown-kind': 1 });
	assert.equal(state.complete, false);
	assert.deepEqual(readUnattributedUnwritableInTxn(await getGraphStore()), { total: 1, reasons: { 'source-missing': 1 } });

	// The pending write counts its drops too.
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: 'x', resolved: false, meta: { repo: REPO } },                                   // no file
		{ kind: 'CALLS', from: a.id, to: 'y', resolved: false, meta: { repo: '/repo/unregistered', file: '/repo/unregistered/a.ts' } },
	]);
	const after = (await readIndexState(REPO))!;
	assert.equal(after.reasonCounts.unwritable['pending-without-file'], 1);
	assert.deepEqual(readUnattributedUnwritableInTxn(await getGraphStore()).reasons, { 'source-missing': 1, 'repository-not-registered': 1 });
});

test('writing the same relationship twice while its target is absent leaves one row and an awaiting count of 1', async () => {
	const a = entity('a');
	await upsertEntities(null, [a]);
	const absent = id(`${REPO}/src/later.ts`, 'function', 'later');
	const rel: Relation = { kind: 'IMPORTS', from: a.id, to: absent, resolved: true };
	await upsertRelations(null, [rel]);
	await upsertRelations(null, [rel]);
	assert.equal((await pendingRows()).length, 1);
	assert.equal((await readIndexState(REPO))!.pending['awaiting-target'], 1);
	assert.equal((await awaitingIdsFor(absent)).length, 1);
});

test('a boundary relation with an absent target is kept as external-endpoint and does not count against graphComplete', async () => {
	const a = entity('a');
	await upsertEntities(null, [a]);
	await upsertRelations(null, [{ kind: 'CALLS_HTTP', from: a.id, to: id('', 'externalEndpoint', 'GET /x'), resolved: true }]);
	const rows = await pendingRows();
	assert.equal(rows.length, 1);
	assert.equal(rows[0]!.meta['class'], 'external-endpoint');
	const state = (await readIndexState(REPO))!;
	assert.equal(state.pending['external-endpoint'], 1);
	assert.equal(state.pending['awaiting-target'], 0);
	assert.equal(state.graphComplete, true);
});

test('promotions: an edge removes the row and advances the generation; an absent target re-keys the row to await it; a missing source removes and counts it; the batch reports each', async () => {
	const a = entity('a');
	const t = entity('t');
	await upsertEntities(null, [a, t]);
	await upsertRelations(null, [
		{ kind: 'CALLS', from: a.id, to: 't', resolved: false, meta: { repo: REPO, file: a.file } },
		{ kind: 'CALLS', from: a.id, to: 'later', resolved: false, meta: { repo: REPO, file: a.file, candidates: ['p', 'q'] } },
		{ kind: 'CALLS', from: 'gone', to: 'z', resolved: false, meta: { repo: REPO, file: a.file } },
	]);
	assert.equal((await readIndexState(REPO))!.pending['awaiting-target'], 3, 'three unattempted rows');
	const list = await listUnresolvedRelations(null, REPO);
	const byTo = (to: string) => list.find(u => u.rawTo === to)!;
	const absent = id(`${REPO}/src/later.ts`, 'function', 'later');
	const generationBefore = (await readIndexState(REPO))!.generation;

	const result = await promoteResolvedBatch(null, [
		{ unresolved: byTo('t'), targetEntityId: t.id },          // promoted
		{ unresolved: byTo('later'), targetEntityId: absent },    // kept awaiting, re-keyed
		{ unresolved: byTo('z'), targetEntityId: t.id },          // source missing
	]);
	assert.deepEqual(result, { promoted: 1, keptAwaiting: 1, unwritable: 1 });

	const rows = await pendingRows();
	assert.equal(rows.length, 1, 'only the re-keyed row is left');
	const rekeyed = rows[0]!;
	assert.equal(rekeyed.id, makeUnresolvedRelationId(REPO, a.id, 'CALLS', absent));
	assert.equal(rekeyed.rawTo, absent);
	assert.equal(rekeyed.fromFile, a.file, 'its absolute file is kept');
	assert.equal(rekeyed.meta['candidates'], undefined, 'a stale candidates list is not carried');
	assert.deepEqual(await awaitingIdsFor(absent), [rekeyed.id]);

	const state = (await readIndexState(REPO))!;
	assert.equal(state.pending['awaiting-target'], 1, 'one awaiting row, counted once');
	assert.deepEqual(state.reasonCounts.awaiting, { 'target-not-stored-yet': 1 });
	assert.deepEqual(state.reasonCounts.unwritable, { 'source-missing': 1 });
	assert.equal(state.generation, generationBefore + 1, 'advanced once for the promotion');

	// promoteToResolved follows the same rule (it has no production caller; this is its test).
	const t2 = entity('t2');
	await upsertEntities(null, [t2]);
	await promoteToResolved(null, { ...byTo('later'), id: rekeyed.id, rawTo: absent }, t2.id);
	assert.equal((await pendingRows()).length, 0);
	assert.equal((await readIndexState(REPO))!.pending['awaiting-target'], 0);
});
