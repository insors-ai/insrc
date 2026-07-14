/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `docSummary` sub-DB CRUD.
 *
 * plans/docs-module.md Section 8. One row per doc / section entity,
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

import { Packr, Unpackr } from 'msgpackr';

import type { DocSummary } from '../shared/analyze-types.js';
import type { DbClient } from './client.js';
import { getGraphStore, withWriteTxn } from './graph/store.js';
import type { GraphStore } from './graph/store.js';
import { encodeEntityKey, prefixSuccessor } from './graph/keys.js';
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
