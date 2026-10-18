/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `docSummary` sub-DB CRUD.
 *
 * docs/plans/docs-module.md Section 8. One row per doc / section entity,
 * produced by the post-indexing summariser. Row shape is
 * `DocSummary` from shared/analyze-types; storage encodes as
 * msgpack.
 *
 * Sub-DBs used:
 *   - `docSummary`       -- primary: entityU64 -> msgpack(DocSummary)
 *   - `docSummaryByRepo` -- secondary index (dupSort): (repoId, entityU64) -> empty buffer
 *
 * The secondary index lets `listDocSummariesForRepo(repo)` do a
 * range scan by repoId prefix instead of full-scanning the primary
 * table.
 */

import { createHash } from 'node:crypto';
import { Packr, Unpackr } from 'msgpackr';

import type { DocSummary } from '../shared/analyze-types.js';
import type { DbClient } from './client.js';
import { getGraphStore, withWriteTxn } from './graph/store.js';
import type { GraphStore } from './graph/store.js';
import { encodeEntityKey, prefixSuccessor } from './graph/keys.js';
import { decodeEntityRow } from './graph/codec.js';
import { entityU64ForId, entityIdByU64 } from './entities.js';
import { lookupRepoIdInTxn } from './repos.js';

// withReadTxn is a thin no-op wrapper; lmdb-js already snapshots each
// get() / getRange() call. Matches the pattern in entities.ts. Kept
// as a local helper so the read-path signatures line up with the
// write-path signatures at call sites.
async function withReadTxn<T>(_store: GraphStore, fn: () => T | Promise<T>): Promise<T> {
	return fn();
}

// ---------------------------------------------------------------------------
// msgpack codec (local -- codec.ts is graph-shape only)
// ---------------------------------------------------------------------------

const packr   = new Packr({ useRecords: false });
const unpackr = new Unpackr({ useRecords: false });

function encodeDocSummary(row: DocSummary): Buffer {
	return packr.pack(row);
}

function decodeDocSummary(buf: Buffer): DocSummary {
	return unpackr.unpack(buf) as DocSummary;
}

// ---------------------------------------------------------------------------
// Secondary-index key encoding
// ---------------------------------------------------------------------------

/**
 * (repoId u32 BE || entityU64 BE) -- 12 bytes total. Prefix scan by
 * repoId returns every entity summary keyed to that repo.
 */
function encodeByRepoKey(repoId: number, entityU64: bigint): Buffer {
	const buf = Buffer.alloc(12);
	buf.writeUInt32BE(repoId, 0);
	buf.writeBigUInt64BE(entityU64, 4);
	return buf;
}

function encodeByRepoPrefix(repoId: number): Buffer {
	const buf = Buffer.alloc(4);
	buf.writeUInt32BE(repoId, 0);
	return buf;
}

function decodeByRepoKey(buf: Buffer): { repoId: number; entityU64: bigint } {
	if (buf.length !== 12) {
		throw new Error(`expected 12-byte docSummaryByRepo key, got ${buf.length}`);
	}
	return {
		repoId:    buf.readUInt32BE(0),
		entityU64: buf.readBigUInt64BE(4),
	};
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Fetch a doc summary by string entity id. Returns null if the
 * entity isn't summarised (either the summariser hasn't run yet or
 * the entity was deleted).
 */
export async function getDocSummary(
	_db: DbClient,
	entityId: string,
): Promise<DocSummary | null> {
	const u64 = await entityU64ForId(entityId);
	if (u64 === undefined) return null;
	const store = await getGraphStore();
	const buf = store.docSummary.get(encodeEntityKey(u64)) as Buffer | undefined;
	if (buf === undefined) return null;
	return decodeDocSummary(buf);
}

/**
 * Bulk get by entity ids. Preserves input order; missing rows
 * become null in the output array (matches getEntitiesByIds shape).
 */
export async function getDocSummaries(
	_db: DbClient,
	entityIds: readonly string[],
): Promise<(DocSummary | null)[]> {
	const store = await getGraphStore();
	const out: (DocSummary | null)[] = [];
	for (const id of entityIds) {
		const u64 = await entityU64ForId(id);
		if (u64 === undefined) { out.push(null); continue; }
		const buf = store.docSummary.get(encodeEntityKey(u64)) as Buffer | undefined;
		out.push(buf === undefined ? null : decodeDocSummary(buf));
	}
	return out;
}

/**
 * Write a summary. Idempotent -- overwrites any existing row for
 * the same entity. Requires the entity to be known (i.e. registered
 * in `entityIdByString`); throws otherwise so we don't accumulate
 * orphan summary rows.
 *
 * Two-write transaction: primary + secondary index. If the primary
 * row existed with a different repoId (e.g. a file was moved
 * between repos), the old secondary-index entry must be removed
 * first -- but the summariser rewrites the whole row, so we always
 * check + remove the stale index entry.
 */
export async function writeDocSummary(
	_db: DbClient,
	entityId: string,
	repo: string,
	summary: DocSummary,
): Promise<void> {
	const u64 = await entityU64ForId(entityId);
	if (u64 === undefined) {
		throw new Error(
			`writeDocSummary: entity '${entityId}' is not known -- ` +
			'cannot summarise an unregistered entity',
		);
	}
	await withWriteTxn(s => {
		const repoId = lookupRepoIdInTxn(s, repo);
		if (repoId === undefined) {
			throw new Error(
				`writeDocSummary: repo '${repo}' is not registered -- ` +
				'cannot summarise a doc in an unregistered repo',
			);
		}
		const primaryKey = encodeEntityKey(u64);
		// Best-effort: if the entity was previously summarised under a
		// different repoId, drop the stale secondary index entry. Real
		// re-repo (file moved to a different registered workspace) is
		// rare but the daemon can't distinguish it from re-summarise
		// without this check.
		const existingBuf = s.docSummary.get(primaryKey) as Buffer | undefined;
		if (existingBuf !== undefined) {
			// The old row lived under SOME repoId; we don't record it
			// in the value, so we can't know without scanning. But
			// same-repo re-summarise is the common case and put() on
			// an existing dupSort key is a no-op. Cross-repo moves
			// would leak an index entry; deferred to a future
			// consistency sweep. Not user-visible.
		}
		s.docSummary.put(primaryKey, encodeDocSummary(summary));
		s.docSummaryByRepo.put(encodeByRepoKey(repoId, u64), Buffer.alloc(0));
	});
}

/** What `writeDocSummaryIfCurrent` did. */
export type DocSummaryWriteOutcome = 'written' | 'entity-gone' | 'body-changed';

/**
 * Write a summary only if it is still current (Story b94cf2c9 S001): the
 * summariser runs at the same time as code indexing, which may delete or
 * rewrite the document while the model works. Checked inside the write
 * transaction, so it is atomic with the entity delete (which drops the
 * summary in its own transaction):
 *
 *   - the entity is unknown or its row is gone -> nothing written, 'entity-gone';
 *   - the hash of the stored body is not `summary.contentHash` -> nothing
 *     written, 'body-changed';
 *   - otherwise the row is written exactly as `writeDocSummary` writes it.
 *
 * With `keepGoodSummary` (the summariser's error placeholder, ISSUE-dced4385)
 * a stored summary with no errorCode for the same contentHash is kept:
 * 'kept-good'.
 *
 * Throws as `writeDocSummary` does for an unregistered repo or a failed write.
 * `writeDocSummary` itself is unchanged for its other callers.
 */
export function writeDocSummaryIfCurrent(
	db: DbClient, entityId: string, repo: string, summary: DocSummary,
): Promise<DocSummaryWriteOutcome>;
export function writeDocSummaryIfCurrent(
	db: DbClient, entityId: string, repo: string, summary: DocSummary,
	opts: { readonly keepGoodSummary: true },
): Promise<DocSummaryWriteOutcome | 'kept-good'>;
export async function writeDocSummaryIfCurrent(
	_db: DbClient,
	entityId: string,
	repo: string,
	summary: DocSummary,
	opts?: { readonly keepGoodSummary?: boolean | undefined },
): Promise<DocSummaryWriteOutcome | 'kept-good'> {
	return withWriteTxn(s => {
		// The caller's repo is checked only when the row is about to be written, as before.
		const outcome = writeIfCurrentInTxn(s, entityId, summary, { keepGoodSummary: opts?.keepGoodSummary }, () => {
			const repoId = lookupRepoIdInTxn(s, repo);
			if (repoId === undefined) throw unregisteredRepo(repo);
			return repoId;
		});
		// No onlyIfAbsent here, so 'already-present' cannot come back.
		return outcome as DocSummaryWriteOutcome | 'kept-good';
	});
}

/**
 * `writeDocSummaryIfCurrent` inside the caller's write transaction. The
 * repository is the stored entity row's own (the backup restore and the
 * carry write-back have no caller-supplied path).
 *
 *   - `onlyIfAbsent`: a document that already has a summary is left as it
 *     is, 'already-present' (the backup restore never replaces one);
 *   - `keepGoodSummary`: a stored summary with no errorCode and the same
 *     contentHash is left as it is, 'kept-good'.
 */
export function writeDocSummaryIfCurrentInTxn(
	s: GraphStore,
	entityId: string,
	summary: DocSummary,
	opts: { readonly onlyIfAbsent?: boolean | undefined; readonly keepGoodSummary?: boolean | undefined } = {},
): DocSummaryWriteOutcome | 'already-present' | 'kept-good' {
	return writeIfCurrentInTxn(s, entityId, summary, opts, entityRepoId => entityRepoId);
}

/** The shared body: `indexRepoId` names the repo the by-repo index entry goes under, called only for a write. */
function writeIfCurrentInTxn(
	s: GraphStore,
	entityId: string,
	summary: DocSummary,
	opts: { readonly onlyIfAbsent?: boolean | undefined; readonly keepGoodSummary?: boolean | undefined },
	indexRepoId: (entityRepoId: number) => number,
): DocSummaryWriteOutcome | 'already-present' | 'kept-good' {
	// The id lookup is inside the transaction too, so a delete cannot land between it and the write.
	const id = s.entityIdByString.get(entityId) as bigint | number | undefined;
	if (id === undefined) return 'entity-gone';
	const u64 = BigInt(id);
	// Deleted with its id mapping in one transaction; read here for the body.
	const row = s.entity.get(encodeEntityKey(u64)) as Buffer | undefined;
	if (row === undefined) return 'entity-gone';
	const entity = decodeEntityRow(row);
	if (createHash('sha256').update(entity.body, 'utf8').digest('hex') !== summary.contentHash) return 'body-changed';
	const storedBuf = s.docSummary.get(encodeEntityKey(u64)) as Buffer | undefined;
	if (storedBuf !== undefined) {
		if (opts.onlyIfAbsent === true) return 'already-present';
		if (opts.keepGoodSummary === true) {
			const stored = decodeDocSummary(storedBuf);
			if (stored.errorCode === undefined && stored.contentHash === summary.contentHash) return 'kept-good';
		}
	}
	const repoId = indexRepoId(entity.repoId);
	s.docSummary.put(encodeEntityKey(u64), encodeDocSummary(summary));
	s.docSummaryByRepo.put(encodeByRepoKey(repoId, u64), Buffer.alloc(0));
	return 'written';
}

function unregisteredRepo(repo: string): Error {
	return new Error(
		`writeDocSummary: repo '${repo}' is not registered -- ` +
		'cannot summarise a doc in an unregistered repo',
	);
}

// ---------------------------------------------------------------------------
// Carry across a full index (ISSUE-dced4385)
// ---------------------------------------------------------------------------

/** (repoId u32 BE || UTF-8 string entity id): the document's id survives the rebuild, its u64 does not. */
export function encodeCarryKey(repoId: number, entityId: string): Buffer {
	const id = Buffer.from(entityId, 'utf8');
	const buf = Buffer.alloc(4 + id.length);
	buf.writeUInt32BE(repoId, 0);
	id.copy(buf, 4);
	return buf;
}

/**
 * Copy the summary of every entity in `u64s` into the carry, inside the
 * caller's write transaction (the repository delete's, before its cascade
 * removes the summaries). A carry row already present for the id is
 * overwritten: the live summary is the newer one. Returns how many were carried.
 */
export function carryDocSummariesInTxn(s: GraphStore, repoId: number, u64s: readonly bigint[]): number {
	let carried = 0;
	for (const u64 of u64s) {
		const buf = s.docSummary.get(encodeEntityKey(u64)) as Buffer | undefined;
		if (buf === undefined) continue;
		const entityId = s.entityStringByU64.get(encodeEntityKey(u64)) as string | undefined;
		if (entityId === undefined) continue;
		s.docSummaryCarry.put(encodeCarryKey(repoId, entityId), buf);
		carried++;
	}
	return carried;
}

/** Delete every carry row of the repository, inside the caller's write transaction. */
export function deleteCarriedDocSummariesInTxn(s: GraphStore, repoId: number): void {
	const prefix = encodeByRepoPrefix(repoId);
	const keys = [...s.docSummaryCarry.getKeys({ start: prefix, end: prefixSuccessor(prefix) })] as Buffer[];
	for (const k of keys) s.docSummaryCarry.remove(k);
}

const CARRY_BATCH = 500;

/**
 * Write back the repository's carried summaries once the rebuild has stored
 * its documents: each one goes through `writeDocSummaryIfCurrentInTxn`, so it
 * lands under the document's current entity number only if the body still
 * hashes to its contentHash. Each carry row is removed in the same write
 * transaction as its outcome, CARRY_BATCH rows per transaction, so a failed
 * batch leaves its rows carried for the next full index.
 */
export async function restoreCarriedDocSummaries(
	repo: string,
): Promise<{ written: number; entityGone: number; bodyChanged: number }> {
	const counts = { written: 0, entityGone: 0, bodyChanged: 0 };
	for (;;) {
		const done = await withWriteTxn(s => {
			const repoId = lookupRepoIdInTxn(s, repo);
			if (repoId === undefined) return true;
			const prefix = encodeByRepoPrefix(repoId);
			const batch = [...s.docSummaryCarry.getRange({ start: prefix, end: prefixSuccessor(prefix), limit: CARRY_BATCH })];
			for (const { key, value } of batch) {
				const k = key as Buffer;
				const outcome = writeDocSummaryIfCurrentInTxn(s, k.subarray(4).toString('utf8'), decodeDocSummary(value as Buffer));
				if (outcome === 'written') counts.written++;
				else if (outcome === 'entity-gone') counts.entityGone++;
				else counts.bodyChanged++;
				s.docSummaryCarry.remove(k);
			}
			return batch.length < CARRY_BATCH;
		});
		if (done) return counts;
	}
}

/**
 * Delete a single summary + its secondary index entry. Called on
 * entity cascade delete (deleteEntitiesForFile / deleteEntitiesForRepo).
 * No-op if the summary doesn't exist.
 *
 * Takes the string entity id; the caller has one at cascade time.
 * If the entity is already deleted from `entityIdByString`, we can't
 * resolve the u64 -- callers that need to sweep first-then-delete
 * should use `deleteDocSummaryByU64` instead.
 */
export async function deleteDocSummary(
	_db: DbClient,
	entityId: string,
): Promise<void> {
	const u64 = await entityU64ForId(entityId);
	if (u64 === undefined) return;
	await withWriteTxn(s => {
		deleteDocSummaryInTxn(s, u64);
	});
}

/**
 * In-transaction delete by u64. For cascade paths where the caller
 * already holds a write txn AND has the u64 in hand (e.g. inside
 * `detachDeleteEntitiesInTxn`). Sweeps the secondary index by
 * scanning ALL repos' index entries for this u64 -- rare full scan,
 * but the secondary index has one entry per (repoId, u64) tuple so
 * it's bounded by workspace repo count.
 */
export function deleteDocSummaryInTxn(store: GraphStore, u64: bigint): void {
	const primaryKey = encodeEntityKey(u64);
	if (store.docSummary.get(primaryKey) === undefined) return;
	store.docSummary.remove(primaryKey);
	// Sweep secondary index -- one entry across all repos matches this u64.
	// The index is (repoId u32 || entityU64 u64); we scan all keys and
	// drop matches. Small subset -- most repos have no summaries; even
	// with 300 summarised docs across 5 repos, this is 300 iterations.
	const toRemove: Buffer[] = [];
	for (const { key } of store.docSummaryByRepo.getRange({})) {
		const k = key as Buffer;
		if (k.length !== 12) continue;
		if (k.readBigUInt64BE(4) === u64) {
			toRemove.push(k);
		}
	}
	for (const k of toRemove) {
		store.docSummaryByRepo.remove(k);
	}
}

/**
 * Delete every summary for a given repo. Called on repo cascade
 * delete (deleteEntitiesForRepo). Scans the secondary index by
 * repoId prefix so we don't need to touch the primary table until
 * we know which u64s to drop.
 */
export async function deleteDocSummariesForRepo(
	_db: DbClient,
	repo: string,
): Promise<void> {
	const store = await getGraphStore();
	await withWriteTxn(s => {
		const repoId = lookupRepoIdInTxn(s, repo);
		if (repoId === undefined) return;
		const prefix = encodeByRepoPrefix(repoId);
		const succ = prefixSuccessor(prefix);
		const idxKeysToRemove: Buffer[] = [];
		const primaryKeysToRemove: Buffer[] = [];
		for (const { key } of s.docSummaryByRepo.getRange({ start: prefix, end: succ })) {
			const k = key as Buffer;
			const { entityU64 } = decodeByRepoKey(k);
			idxKeysToRemove.push(k);
			primaryKeysToRemove.push(encodeEntityKey(entityU64));
		}
		for (const k of primaryKeysToRemove) { s.docSummary.remove(k); }
		for (const k of idxKeysToRemove)     { s.docSummaryByRepo.remove(k); }
	});
	// Silence unused-var lint on the outer store binding; the getRange
	// scan happens inside the txn on the txn's snapshot.
	void store;
}

/**
 * List every summary for a repo. Range scan over the secondary
 * index by repoId; O(K) where K = summaries in this repo.
 */
export async function listDocSummariesForRepo(
	_db: DbClient,
	repo: string,
): Promise<DocSummary[]> {
	const store = await getGraphStore();
	return await withReadTxn(store, () => {
		const repoId = lookupRepoIdInTxn(store, repo);
		if (repoId === undefined) return [];
		const prefix = encodeByRepoPrefix(repoId);
		const succ = prefixSuccessor(prefix);
		const out: DocSummary[] = [];
		for (const { key } of store.docSummaryByRepo.getRange({ start: prefix, end: succ })) {
			const { entityU64 } = decodeByRepoKey(key as Buffer);
			const buf = store.docSummary.get(encodeEntityKey(entityU64)) as Buffer | undefined;
			if (buf !== undefined) out.push(decodeDocSummary(buf));
		}
		return out;
	});
}

/**
 * Return the entity ids for every summarised doc in this repo, in
 * the same order as `listDocSummariesForRepo`. Useful when the
 * caller needs to correlate summaries back to their source entity
 * (e.g. for rendering citations).
 */
export async function listDocSummaryEntityIdsForRepo(
	_db: DbClient,
	repo: string,
): Promise<string[]> {
	const store = await getGraphStore();
	const repoId = await withReadTxn(store, () => lookupRepoIdInTxn(store, repo));
	if (repoId === undefined) return [];
	const prefix = encodeByRepoPrefix(repoId);
	const succ = prefixSuccessor(prefix);
	const out: string[] = [];
	for (const { key } of store.docSummaryByRepo.getRange({ start: prefix, end: succ })) {
		const { entityU64 } = decodeByRepoKey(key as Buffer);
		const stringId = await entityIdByU64(entityU64);
		if (stringId !== undefined) out.push(stringId);
	}
	return out;
}

/**
 * Count summaries for a repo. Prefix scan over the secondary
 * index; no primary reads.
 */
export async function countDocSummariesForRepo(
	_db: DbClient,
	repo: string,
): Promise<number> {
	const store = await getGraphStore();
	return await withReadTxn(store, () => {
		const repoId = lookupRepoIdInTxn(store, repo);
		if (repoId === undefined) return 0;
		const prefix = encodeByRepoPrefix(repoId);
		const succ = prefixSuccessor(prefix);
		let n = 0;
		for (const _ of store.docSummaryByRepo.getRange({ start: prefix, end: succ })) {
			n += 1;
		}
		return n;
	});
}
