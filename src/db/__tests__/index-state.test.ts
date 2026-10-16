/**
 * Epic c2ba6fa6, Story s1, t2 -- IndexState: the sc1 formula, completeness
 * reason lines, counts kept in the same transaction as the rows they count,
 * and the recount on store open.
 *
 * Run: npx tsx --test src/db/__tests__/index-state.test.ts
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../graph/store.js';
import { decodeRepoRow, encodeUnresolvedRow, type IndexStateRow, type UnresolvedRow } from '../graph/codec.js';
import { encodeRepoKey } from '../graph/keys.js';
import { emptyIndexStateRow } from '../graph/pending-class.js';
import {
	countUnwritableInTxn, getIndexStateRowInTxn, movePendingInTxn, putIndexStateRowInTxn,
	readUnattributedUnwritableInTxn,
} from '../graph/index-state-rows.js';
import { completenessOf, deriveIndexState, NOT_INDEXED_REASON, readIndexState, readUnattributedUnwritable } from '../index-state.js';
import { addRepo } from '../repos.js';
import { getLogger } from '../../shared/logger.js';
import { useTemporaryLance } from '../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;
test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-index-state-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const REPO = '/tmp/insrc-index-state/repo';
const AT = '2026-10-16T00:00:00.000Z';

async function registered(path = REPO): Promise<number> {
	await addRepo(null, { path, name: 'r', addedAt: AT, status: 'ready', lastIndexed: AT });
	const store = await getGraphStore();
	for (const { value } of store.repo.getRange()) {
		const r = decodeRepoRow(value as Buffer);
		if (r.path === path) return r.id;
	}
	throw new Error('not registered');
}

function stateRow(over: Partial<IndexStateRow> = {}): IndexStateRow {
	return { ...emptyIndexStateRow(), fullIndexFinished: true, ...over };
}

test('completenessOf table test: graphComplete and complete follow the sc1 formula for every combination of the inputs, and reasons are empty exactly when complete', () => {
	let combos = 0;
	for (const fullIndexFinished of [true, false])
	for (const endpointPassFailed of [true, false])
	for (const uncommitted of [0, 1])
	for (const awaiting of [0, 1])
	for (const unwritable of [0, 1])
	for (const unembedded of [0, 1])
	for (const embeddingAvailable of [true, false]) {
		combos++;
		const row = stateRow({
			fullIndexFinished, endpointPassFailed, embeddingAvailable, unembedded, unwritable,
			uncommittedFiles: uncommitted ? ['src/a.ts'] : [],
			pending: { 'awaiting-target': awaiting, 'ambiguous': 3, 'no-candidate': 5, 'external-endpoint': 7 },
			reasonCounts: { unwritable: unwritable ? { 'source-missing': 1 } : {}, awaiting: awaiting ? { 'target-not-stored-yet': 1 } : {} },
		});
		const state = deriveIndexState(REPO, row);
		const graphComplete = fullIndexFinished && !endpointPassFailed && uncommitted === 0 && awaiting === 0 && unwritable === 0;
		const complete = graphComplete && (unembedded === 0 || !embeddingAvailable);
		const label = JSON.stringify({ fullIndexFinished, endpointPassFailed, uncommitted, awaiting, unwritable, unembedded, embeddingAvailable });
		assert.equal(state.graphComplete, graphComplete, label);
		assert.equal(state.complete, complete, label);
		const c = completenessOf(state);
		assert.equal(c.complete, complete, label);
		assert.equal(c.reasons.length === 0, complete, `${label}: ${JSON.stringify(c.reasons)}`);
	}
	assert.equal(combos, 128);
});

test('completenessOf(undefined) reads not complete with "a reindex is needed"', () => {
	const c = completenessOf(undefined);
	assert.equal(c.complete, false);
	assert.deepEqual(c.reasons, [NOT_INDEXED_REASON]);
	assert.match(NOT_INDEXED_REASON, /a reindex is needed/);
});

test('completeness reason lines: one per non-zero cause with its count, awaiting rows split by reason, no-candidate and ambiguous rows not a cause', () => {
	const c = completenessOf(deriveIndexState(REPO, stateRow({
		fullIndexFinished: false,
		endpointPassFailed: true,
		uncommittedFiles: ['src/a.ts', 'src/b.ts'],
		unwritable: 3,
		unembedded: 4,
		embeddingAvailable: true,
		pending: { 'awaiting-target': 12, 'ambiguous': 9, 'no-candidate': 40, 'external-endpoint': 2 },
		reasonCounts: {
			unwritable: { 'source-missing': 2, 'unknown-kind': 1 },
			awaiting: { 'target-not-stored-yet': 7, 'target-excluded-by-ignore': 4, 'unattempted': 1 },
		},
	})));
	assert.deepEqual(c.reasons, [
		'the full index has not finished',
		'the external-endpoint pass failed',
		'2 files could not be indexed',
		'4 relationships point at files an ignore rule excludes',
		'7 relationships await a target that is not stored yet',
		'1 relationship has not been attempted by the cross-file pass',
		'3 relationships could not be stored (source-missing: 2, unknown-kind: 1)',
		'4 entities have no vector',
	]);
	assert.deepEqual(c.counts, { pending: { 'awaiting-target': 12, 'ambiguous': 9, 'no-candidate': 40, 'external-endpoint': 2 }, unwritable: 3, unembedded: 4, uncommittedFiles: 2 });
	assert.deepEqual(c.uncommittedFiles, ['src/a.ts', 'src/b.ts']);
});

test('an aborted transaction leaves the counts unchanged: a callback that writes a pending row and its count, then throws, leaves neither', async () => {
	const repoId = await registered();
	await withWriteTxn(s => { putIndexStateRowInTxn(s, repoId, stateRow()); });
	const row: UnresolvedRow = { id: 'u1', repoId, fromEntity: 'e1', fromFile: `${REPO}/a.ts`, kind: 'CALLS', rawTo: 'f', meta: { class: 'awaiting-target', reason: 'target-not-stored-yet' }, attemptedAt: 0 };
	await assert.rejects(withWriteTxn(s => {
		void s.unresolved.put(row.id, encodeUnresolvedRow(row));
		movePendingInTxn(s, repoId, undefined, { cls: 'awaiting-target', reason: 'target-not-stored-yet' });
		countUnwritableInTxn(s, repoId, 'source-missing');
		countUnwritableInTxn(s, undefined, 'source-missing');
		throw new Error('boom');
	}), /boom/);
	await closeGraphStore();
	const store = await getGraphStore();
	assert.equal(store.unresolved.get('u1'), undefined, 'the pending row is not kept');
	assert.deepEqual(getIndexStateRowInTxn(store, repoId), stateRow(), 'nor any count');
	assert.deepEqual(await readUnattributedUnwritable(), { total: 0, reasons: {} });

	// The same writes that commit move the counts.
	await withWriteTxn(s => {
		void s.unresolved.put(row.id, encodeUnresolvedRow(row));
		movePendingInTxn(s, repoId, undefined, { cls: 'awaiting-target', reason: 'target-not-stored-yet' });
		countUnwritableInTxn(s, repoId, 'source-missing');
		countUnwritableInTxn(s, undefined, 'unknown-kind');
	});
	const state = await readIndexState(REPO);
	assert.equal(state?.pending['awaiting-target'], 1);
	assert.deepEqual(state?.reasonCounts, { unwritable: { 'source-missing': 1 }, awaiting: { 'target-not-stored-yet': 1 } });
	assert.equal(state?.unwritable, 1);
	assert.equal(state?.complete, false);
	assert.deepEqual(readUnattributedUnwritableInTxn(store), { total: 1, reasons: { 'unknown-kind': 1 } });
	// Moving it out again brings the count to zero and drops the reason.
	await withWriteTxn(s => { movePendingInTxn(s, repoId, { cls: 'awaiting-target', reason: 'target-not-stored-yet' }, { cls: 'no-candidate' }); });
	const after = await readIndexState(REPO);
	assert.equal(after?.pending['awaiting-target'], 0);
	assert.equal(after?.pending['no-candidate'], 1);
	assert.deepEqual(after?.reasonCounts.awaiting, {});
});

test('recount on open corrects a hand-edited count with a warn log, and deletes the row of an unregistered repoId', async () => {
	const repoId = await registered();
	const strayId = 4_000_000;
	await withWriteTxn(s => {
		const row: UnresolvedRow = { id: 'u1', repoId, fromEntity: 'e1', fromFile: `${REPO}/a.ts`, kind: 'CALLS', rawTo: 'f', meta: { class: 'ambiguous' }, attemptedAt: 0 };
		void s.unresolved.put(row.id, encodeUnresolvedRow(row));
		// Hand-edited: claims 5 awaiting rows; the store holds one ambiguous row.
		putIndexStateRowInTxn(s, repoId, stateRow({ pending: { 'awaiting-target': 5, 'ambiguous': 0, 'no-candidate': 0, 'external-endpoint': 0 }, reasonCounts: { unwritable: {}, awaiting: { 'unattempted': 5 } } }));
		putIndexStateRowInTxn(s, strayId, stateRow());
	});
	await closeGraphStore();

	const warn = mock.method(getLogger('graph-store'), 'warn');
	try {
		const store = await getGraphStore();
		const row = getIndexStateRowInTxn(store, repoId);
		assert.deepEqual(row?.pending, { 'awaiting-target': 0, 'ambiguous': 1, 'no-candidate': 0, 'external-endpoint': 0 });
		assert.deepEqual(row?.reasonCounts.awaiting, {});
		assert.equal(store.indexState.get(encodeRepoKey(strayId)), undefined, 'the unregistered repoId row is deleted');
		const messages = warn.mock.calls.map(c => String(c.arguments[1]));
		assert.ok(messages.some(m => /differed from a recount; corrected/.test(m)), JSON.stringify(messages));
		assert.ok(messages.some(m => /unregistered repository deleted/.test(m)), JSON.stringify(messages));
	} finally {
		warn.mock.restore();
	}
});
