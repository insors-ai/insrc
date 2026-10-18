/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-dced4385 S001/t1 — the store side of keeping document summaries
 * across a full index: the doc_summary_carry database, the conditional
 * write inside a transaction (onlyIfAbsent, keepGoodSummary) and the
 * write-back of carried summaries under the document's new entity number.
 *
 * Over a temporary graph store.
 *
 * Run: npx tsx --test src/db/__tests__/doc-summary-carry.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, SCHEMA_VERSION, withWriteTxn } from '../graph/store.js';
import { encodeEntityKey } from '../graph/keys.js';
import { addRepo, lookupRepoId } from '../repos.js';
import { deleteEntitiesForFile, deleteEntitiesForRepo, entityU64ForId, getEntity, upsertEntities } from '../entities.js';
import { upsertRelations } from '../relations.js';
import {
	encodeCarryKey, getDocSummary, listDocSummaryEntityIdsForRepo, restoreCarriedDocSummaries, writeDocSummary,
	writeDocSummaryIfCurrent, writeDocSummaryIfCurrentInTxn,
} from '../doc-summaries.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { DocSummary } from '../../shared/analyze-types.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';
import { Packr, Unpackr } from 'msgpackr';

useTemporaryLance();

const NOW = '2026-10-18T00:00:00.000Z';
const REPO = '/repo/carry';
let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-dced-carry-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: 'carry', addedAt: NOW, status: 'ready' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

function doc(name: string, body: string): Entity {
	const file = `${REPO}/docs/${name}.md`;
	return {
		id: makeEntityId(REPO, file, 'document', name), kind: 'document', name, language: 'markdown',
		repoId: 1, repo: REPO, file, startLine: 1, endLine: 1, body, embedding: [], indexedAt: NOW,
	};
}

const hash = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex');

function summaryOf(body: string, extra: Partial<DocSummary> = {}): DocSummary {
	return {
		title: 't', family: 'design', kind: 'design', subjects: [], summary: `of ${body}`,
		keyDecisions: [], keyConstraints: [], relatedEntities: [], status: 'current',
		summarisedAt: NOW, modelId: 'model-a', contentHash: hash(body), ...extra,
	} as DocSummary;
}

const inTxn = (e: Entity, s: DocSummary, opts?: { onlyIfAbsent?: boolean; keepGoodSummary?: boolean }) =>
	withWriteTxn(st => writeDocSummaryIfCurrentInTxn(st, e.id, s, opts));

/** Put a carry row for `e` by hand, as the repository delete writes it. */
async function carry(e: Entity, s: DocSummary): Promise<void> {
	const repoId = (await lookupRepoId(REPO))!;
	await withWriteTxn(st => { st.docSummaryCarry.put(encodeCarryKey(repoId, e.id), new Packr({ useRecords: false }).pack(s)); });
}

const carryRows = async (): Promise<number> => [...(await getGraphStore()).docSummaryCarry.getKeys({})].length;

test('writeDocSummaryIfCurrent is unchanged and onlyIfAbsent never replaces a stored summary', async () => {
	const a = doc('a', 'body a');
	await upsertEntities(null, [a]);

	// The public function: the three outcomes it always had.
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, summaryOf('other body')), 'body-changed');
	assert.equal(await getDocSummary(null, a.id), null);
	assert.equal(await writeDocSummaryIfCurrent(null, doc('gone', 'x').id, REPO, summaryOf('x')), 'entity-gone');
	const first = summaryOf('body a');
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, first), 'written');
	const fresh = summaryOf('body a', { summary: 'fresh' });
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, fresh), 'written', 'without options it still replaces a stored summary');
	assert.equal((await getDocSummary(null, a.id))?.summary, 'fresh');
	await assert.rejects(writeDocSummaryIfCurrent(null, a.id, '/repo/unregistered', fresh), /not registered/);
	// An unregistered repo is refused only for a write, after the entity and body checks, as before.
	assert.equal(await writeDocSummaryIfCurrent(null, doc('gone', 'x').id, '/repo/unregistered', summaryOf('x')), 'entity-gone');
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, '/repo/unregistered', summaryOf('other body')), 'body-changed');
	assert.equal((await getDocSummary(null, a.id))?.summary, 'fresh', 'the refused write stored nothing');
	// The by-repo index entry goes under the caller's repo, as before.
	await addRepo(null, { path: '/repo/caller', name: 'caller', addedAt: NOW, status: 'ready' });
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, '/repo/caller', fresh), 'written');
	assert.equal((await listDocSummaryEntityIdsForRepo(null, '/repo/caller')).includes(a.id), true);

	// onlyIfAbsent: the stored one stays.
	assert.equal(await inTxn(a, summaryOf('body a', { summary: 'older' }), { onlyIfAbsent: true }), 'already-present');
	assert.equal((await getDocSummary(null, a.id))?.summary, 'fresh');
	// ...and with nothing stored it writes.
	const b = doc('b', 'body b');
	await upsertEntities(null, [b]);
	assert.equal(await inTxn(b, summaryOf('body b'), { onlyIfAbsent: true }), 'written');
	assert.equal((await getDocSummary(null, b.id))?.contentHash, hash('body b'));
});

test('keepGoodSummary keeps a stored summary with no errorCode and the same contentHash, and writes over an error row or a different hash', async () => {
	const a = doc('a', 'body a');
	await upsertEntities(null, [a]);
	const placeholder = summaryOf('body a', { summary: '', errorCode: 'llm-timeout' });

	// A good summary of the same body: kept.
	await writeDocSummary(null, a.id, REPO, summaryOf('body a', { summary: 'good' }));
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, placeholder, { keepGoodSummary: true }), 'kept-good');
	assert.equal((await getDocSummary(null, a.id))?.summary, 'good');
	assert.equal((await getDocSummary(null, a.id))?.errorCode, undefined);

	// A stored error row: replaced.
	await writeDocSummary(null, a.id, REPO, summaryOf('body a', { summary: 'old error', errorCode: 'llm-error' }));
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, placeholder, { keepGoodSummary: true }), 'written');
	assert.equal((await getDocSummary(null, a.id))?.errorCode, 'llm-timeout');

	// A good summary of a different body: replaced.
	await writeDocSummary(null, a.id, REPO, summaryOf('an earlier body', { summary: 'stale' }));
	assert.equal(await writeDocSummaryIfCurrent(null, a.id, REPO, placeholder, { keepGoodSummary: true }), 'written');
	assert.equal((await getDocSummary(null, a.id))?.errorCode, 'llm-timeout');

	// Nothing stored: written.
	const b = doc('b', 'body b');
	await upsertEntities(null, [b]);
	assert.equal(await writeDocSummaryIfCurrent(null, b.id, REPO, summaryOf('body b', { errorCode: 'x' }), { keepGoodSummary: true }), 'written');
});

test('restoreCarriedDocSummaries writes a current carried summary under the new entity number, drops gone and changed ones and leaves no carry row', async () => {
	const kept = doc('kept', 'kept body'), changed = doc('changed', 'old body'), gone = doc('gone', 'gone body');
	await upsertEntities(null, [kept, changed, gone]);
	const oldU64 = (await entityU64ForId(kept.id))!;
	for (const e of [kept, changed, gone]) await carry(e, summaryOf(e.body, { summary: `carried ${e.name}` }));

	// The rebuild: every document is deleted and stored again; one changed, one not stored again.
	for (const e of [kept, changed, gone]) await deleteEntitiesForFile(null, e.file);
	await upsertEntities(null, [kept, { ...changed, body: 'new body' }]);
	const newU64 = (await entityU64ForId(kept.id))!;
	assert.notEqual(newU64, oldU64, 'the rebuild gave the document a new entity number');

	assert.deepEqual(await restoreCarriedDocSummaries(REPO), { written: 1, keptGood: 0, entityGone: 1, bodyChanged: 1 });
	assert.equal((await getDocSummary(null, kept.id))?.summary, 'carried kept');
	const s = await getGraphStore();
	assert.notEqual(s.docSummary.get(encodeEntityKey(newU64)), undefined, 'stored under the new number');
	assert.equal(s.docSummary.get(encodeEntityKey(oldU64)), undefined, 'not under the old one');
	assert.equal(await getDocSummary(null, changed.id), null);
	assert.equal(await carryRows(), 0, 'no carry row is left');
});

test('restoreCarriedDocSummaries keeps a good summary stored after the rebuild and replaces a stored error placeholder', async () => {
	const fresh = doc('fresh', 'fresh body'), placeholder = doc('placeholder', 'placeholder body');
	await upsertEntities(null, [fresh, placeholder]);
	await carry(fresh, summaryOf('fresh body', { summary: 'carried placeholder', errorCode: 'schema-invalid' }));
	await carry(placeholder, summaryOf('placeholder body', { summary: 'carried good' }));

	// The rebuild, then a write that lands before the write-back: a good summary
	// for one document (a summary that was running), a placeholder for the other.
	for (const e of [fresh, placeholder]) await deleteEntitiesForFile(null, e.file);
	await upsertEntities(null, [fresh, placeholder]);
	await writeDocSummary(null, fresh.id, REPO, summaryOf('fresh body', { summary: 'written after the rebuild' }));
	await writeDocSummary(null, placeholder.id, REPO, summaryOf('placeholder body', { summary: 'stored placeholder', errorCode: 'timeout' }));

	assert.deepEqual(await restoreCarriedDocSummaries(REPO), { written: 1, keptGood: 1, entityGone: 0, bodyChanged: 0 });
	assert.equal((await getDocSummary(null, fresh.id))?.summary, 'written after the rebuild', 'the good summary is kept');
	assert.equal((await getDocSummary(null, placeholder.id))?.summary, 'carried good', 'the stored placeholder is replaced');
	assert.equal(await carryRows(), 0, 'no carry row is left');
});

test('restoreCarriedDocSummaries works through more carry rows than one batch, and touches no other repository\'s carry', async () => {
	await addRepo(null, { path: '/repo/other', name: 'other', addedAt: NOW, status: 'ready' });
	const docs = Array.from({ length: 1203 }, (_, i) => doc(`d${i}`, `body ${i}`));
	await upsertEntities(null, docs);
	for (const e of docs) await carry(e, summaryOf(e.body));
	const otherId = (await lookupRepoId('/repo/other'))!;
	await withWriteTxn(st => { st.docSummaryCarry.put(encodeCarryKey(otherId, 'some-id'), Buffer.from([0x90])); });

	assert.deepEqual(await restoreCarriedDocSummaries(REPO), { written: 1203, keptGood: 0, entityGone: 0, bodyChanged: 0 });
	assert.equal(await carryRows(), 1, 'only the other repository\'s row is left');
});

test('a v5 store opened with this build has an empty doc_summary_carry and schema version 5', async () => {
	// A store without the database, as every v5 store written before this build is.
	const s = await getGraphStore();
	await s.docSummaryCarry.drop();
	assert.ok(!s.root.getKeys({}).asArray.includes('doc_summary_carry'), 'the database is gone');
	await closeGraphStore();

	const reopened = await getGraphStore();
	assert.equal(SCHEMA_VERSION, 5);
	assert.equal(reopened.meta.get('schema_version'), 5);
	assert.ok(reopened.root.getKeys({}).asArray.includes('doc_summary_carry'), 'opened again');
	assert.equal(await carryRows(), 0);
});

/** The carried summary of `e`, decoded, or undefined. */
async function carried(e: Entity): Promise<DocSummary | undefined> {
	const repoId = (await lookupRepoId(REPO))!;
	const buf = (await getGraphStore()).docSummaryCarry.get(encodeCarryKey(repoId, e.id)) as Buffer | undefined;
	return buf === undefined ? undefined : new Unpackr({ useRecords: false }).unpack(buf) as DocSummary;
}

test('the delete with carryDocSummaries carries every summary it removes, the live value winning over an older carry row', async () => {
	const a = doc('a', 'body a'), b = doc('b', 'body b'), plain = doc('plain', 'no summary'), old = doc('old', 'body old');
	await upsertEntities(null, [a, b, plain]);
	await writeDocSummary(null, a.id, REPO, summaryOf('body a', { summary: 'live a' }));
	await writeDocSummary(null, b.id, REPO, summaryOf('body b', { summary: 'live b' }));
	// Carry rows from an interrupted full index: one for an id that has a live summary again, one with none.
	await carry(a, summaryOf('body a', { summary: 'older a' }));
	await carry(old, summaryOf('body old', { summary: 'carried old' }));

	const result = await deleteEntitiesForRepo(null, REPO, { carryDocSummaries: true });

	assert.deepEqual(result, { returnedToPending: 0, carriedDocSummaries: 2 });
	assert.equal(await getEntity(null, a.id), null, 'the entities are deleted');
	assert.equal((await getGraphStore()).docSummary.getKeys({}).asArray.length, 0, 'and their summaries');
	assert.equal((await carried(a))?.summary, 'live a', 'the live value wins over the older carry row');
	assert.equal((await carried(b))?.summary, 'live b');
	assert.equal((await carried(old))?.summary, 'carried old', 'a carry row with no live summary is kept');
	assert.equal(await carried(plain), undefined, 'an entity with no summary carries nothing');
	assert.equal(await carryRows(), 3);
});

test('a failure inside the delete transaction rolls back the carry with the delete', async () => {
	const a = doc('a', 'body a');
	await upsertEntities(null, [a]);
	await writeDocSummary(null, a.id, REPO, summaryOf('body a', { summary: 'live a' }));
	// A holder in another repository whose row cannot be read: the delete's transaction
	// throws while returning that holder's edge to pending, after the carry was written in it.
	const other = '/repo/holder';
	await addRepo(null, { path: other, name: 'holder', addedAt: NOW, status: 'ready' });
	const holder: Entity = { ...doc('h', 'h'), id: makeEntityId(other, `${other}/h.ts`, 'function', 'h'), kind: 'function', repo: other, file: `${other}/h.ts` };
	await upsertEntities(null, [holder]);
	await upsertRelations(null, [{ kind: 'CALLS', from: holder.id, to: a.id, resolved: true, meta: { repo: other, file: holder.file } }]);
	const holderU64 = (await entityU64ForId(holder.id))!;
	await withWriteTxn(st => { st.entity.put(encodeEntityKey(holderU64), Buffer.from([0xc1])); });

	await assert.rejects(deleteEntitiesForRepo(null, REPO, { carryDocSummaries: true, returnIncomingToPending: true }));

	assert.notEqual(await getEntity(null, a.id), null, 'the entity is still stored');
	assert.equal((await getDocSummary(null, a.id))?.summary, 'live a', 'and its summary');
	assert.equal(await carryRows(), 0, 'the carry written in the transaction was rolled back');
});

test('without carryDocSummaries the repository\'s carry rows are deleted', async () => {
	await addRepo(null, { path: '/repo/other', name: 'other', addedAt: NOW, status: 'ready' });
	const a = doc('a', 'body a');
	await upsertEntities(null, [a]);
	await writeDocSummary(null, a.id, REPO, summaryOf('body a'));
	await carry(doc('old', 'body old'), summaryOf('body old'));
	const otherId = (await lookupRepoId('/repo/other'))!;
	await withWriteTxn(st => { st.docSummaryCarry.put(encodeCarryKey(otherId, 'some-id'), Buffer.from([0x90])); });

	assert.deepEqual(await deleteEntitiesForRepo(null, REPO), { returnedToPending: 0, carriedDocSummaries: 0 });
	assert.equal(await carried(doc('old', 'body old')), undefined);
	assert.equal(await carried(a), undefined, 'the live summary is not carried either');
	assert.equal(await carryRows(), 1, 'only the other repository\'s row is left');
});

test('repo removal of a repository with carry rows and no entities deletes the carry rows', async () => {
	await carry(doc('a', 'body a'), summaryOf('body a'));
	await carry(doc('b', 'body b'), summaryOf('body b'));
	assert.equal(await carryRows(), 2);

	// As repo.remove calls it: no options, and the repository has no entity left.
	await deleteEntitiesForRepo(null, REPO);
	assert.equal(await carryRows(), 0);
});
