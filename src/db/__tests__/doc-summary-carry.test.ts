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
import { deleteEntitiesForFile, entityU64ForId, upsertEntities } from '../entities.js';
import {
	encodeCarryKey, getDocSummary, restoreCarriedDocSummaries, writeDocSummary,
	writeDocSummaryIfCurrent, writeDocSummaryIfCurrentInTxn,
} from '../doc-summaries.js';
import { makeEntityId } from '../../indexer/parser/base.js';
import type { DocSummary } from '../../shared/analyze-types.js';
import type { Entity } from '../../shared/types.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';
import { Packr } from 'msgpackr';

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

	assert.deepEqual(await restoreCarriedDocSummaries(REPO), { written: 1, entityGone: 1, bodyChanged: 1 });
	assert.equal((await getDocSummary(null, kept.id))?.summary, 'carried kept');
	const s = await getGraphStore();
	assert.notEqual(s.docSummary.get(encodeEntityKey(newU64)), undefined, 'stored under the new number');
	assert.equal(s.docSummary.get(encodeEntityKey(oldU64)), undefined, 'not under the old one');
	assert.equal(await getDocSummary(null, changed.id), null);
	assert.equal(await carryRows(), 0, 'no carry row is left');
});

test('restoreCarriedDocSummaries works through more carry rows than one batch, and touches no other repository\'s carry', async () => {
	await addRepo(null, { path: '/repo/other', name: 'other', addedAt: NOW, status: 'ready' });
	const docs = Array.from({ length: 1203 }, (_, i) => doc(`d${i}`, `body ${i}`));
	await upsertEntities(null, docs);
	for (const e of docs) await carry(e, summaryOf(e.body));
	const otherId = (await lookupRepoId('/repo/other'))!;
	await withWriteTxn(st => { st.docSummaryCarry.put(encodeCarryKey(otherId, 'some-id'), Buffer.from([0x90])); });

	assert.deepEqual(await restoreCarriedDocSummaries(REPO), { written: 1203, entityGone: 0, bodyChanged: 0 });
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
