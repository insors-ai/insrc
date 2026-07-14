/**
 * LMDB-backed graph relations + cross-file-resolver queue.
 *
 * Phase 2.3 (resolved edges) + Phase 2.4 (unresolved queue) of
 * plans/storage-migration-lmdb-lance.md, landed in one file because
 * the surfaces are tangled in the existing caller code.
 *
 * Surface preserved verbatim from the prior DuckDB-backed
 * implementation:
 *   - upsertRelation / upsertRelations: dispatch by `resolved` flag
 *   - deleteRelationsForFile / deleteRelationsForRepo: no-ops (entity
 *     cascade in db/entities.ts handles incident edges)
 *   - listUnresolvedRelations: by repo (+ optional file scope)
 *   - deleteUnresolvedForFile / deleteUnresolvedForRepo
 *   - promoteToResolved / promoteResolvedBatch: cross-file resolver
 *     accept path
 *   - updateUnresolvedMeta / updateUnresolvedMetaBatch: ambiguous /
 *     retry path
 *
 * Storage:
 *   - Resolved edges land in `out_edge` + `in_edge` sub-DBs (mirrored
 *     for symmetric O(degree) range scans). u64 entity IDs from
 *     `entity_id_by_string`. Edge value: empty Buffer (most kinds);
 *     Phase 1.3's CallsEdgeProps / ReadsEdgeProps / WritesEdgeProps /
 *     ImportsEdgeProps round-trip via msgpack when callers populate
 *     `Relation.meta`. Initial port keeps all edge values empty
 *     (matches prior DuckDB schema where `relation` had no value
 *     column); per-kind props writing lands when callers start
 *     supplying meta.
 *   - Unresolved rows land in `unresolved` sub-DB keyed by string SHA
 *     id (matches the public surface). Secondary `unresolved_by_file`
 *     dupsort index keyed by (repoId, fromFile) -> id for efficient
 *     per-file queries.
 *
 * The `db: DbClient` parameter is retained (vestigial) for caller
 * back-compat; the LMDB substrate is opened lazily by
 * `db/graph/store.ts`.
 */

import { createHash } from 'node:crypto';

import type { Relation, RelationKind } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import {
	getGraphStore,
	withWriteTxn,
	type GraphStore,
} from './graph/store.js';
import {
	encodeOutEdgeKey,
	encodeInEdgeKey,
	encodeUnresolvedByFileKey,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	type RelationKind as InternalRelationKind,
} from './graph/keys.js';
import {
	encodeUnresolvedRow,
	decodeUnresolvedRow,
	decodeRepoRow,
	type UnresolvedRow,
} from './graph/codec.js';

const log = getLogger('db.relations');

type DbClient = unknown;

// ---------------------------------------------------------------------------
// Public types -- preserved from the prior DuckDB-backed implementation
// ---------------------------------------------------------------------------

export interface UnresolvedRelation {
	id:          string;
	repo:        string;
	fromEntity:  string;
	fromFile:    string;
	kind:        RelationKind;
	rawTo:       string;
	meta:        Record<string, unknown>;
	attemptedAt: string;
}

/** Deterministic id -- re-parsing the same file produces the same row id. */
export function makeUnresolvedRelationId(
	repo: string,
	fromEntity: string,
	kind: RelationKind,
	rawTo: string,
): string {
	return createHash('sha256')
		.update(`${repo}\x00${fromEntity}\x00${kind}\x00${rawTo}`)
		.digest('hex')
		.slice(0, 32);
}

// ---------------------------------------------------------------------------
// Resolved edges
// ---------------------------------------------------------------------------

export async function upsertRelation(_db: DbClient, relation: Relation): Promise<void> {
	if (!relation.resolved) {
		await upsertUnresolvedRelations([relation]);
		return;
	}
	await upsertResolvedRelations([relation]);
}

export async function upsertRelations(_db: DbClient, relations: Relation[]): Promise<void> {
	if (relations.length === 0) return;

	const resolved: Relation[] = [];
	const unresolved: Relation[] = [];
	for (const r of relations) {
		if (r.resolved) resolved.push(r); else unresolved.push(r);
	}
	if (resolved.length > 0) await upsertResolvedRelations(resolved);
	if (unresolved.length > 0) await upsertUnresolvedRelations(unresolved);
}

async function upsertResolvedRelations(relations: Relation[]): Promise<void> {
	const unique = dedupeResolvedRelations(relations);
	if (unique.length < relations.length) {
		log.debug(
			{ original: relations.length, kept: unique.length },
			'upsertRelations: collapsed duplicate (src, dst, kind) edges in input batch',
		);
	}
	if (unique.length === 0) return;

	let skipped = 0;
	await withWriteTxn(s => {
		for (const r of unique) {
			const fromU64 = lookupU64ByStringId(s, r.from);
			const toU64   = lookupU64ByStringId(s, r.to);
			if (fromU64 === undefined || toU64 === undefined) {
				skipped++;
				continue;
			}
			const kindByte = RELATION_KIND_BYTE[r.kind as InternalRelationKind];
			if (kindByte === undefined) {
				skipped++;
				continue;
			}
			s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(toU64, kindByte, fromU64), Buffer.alloc(0));
		}
	});
	if (skipped > 0) {
		log.debug(
			{ skipped, total: unique.length },
			'upsertResolvedRelations: skipped edges with missing endpoints or unknown kind',
		);
	}
}

function dedupeResolvedRelations(relations: readonly Relation[]): Relation[] {
	const seen = new Set<string>();
	const out: Relation[] = [];
	for (const r of relations) {
		const key = `${r.from}\x00${r.to}\x00${r.kind}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(r);
	}
	return out;
}

/**
 * Remove specific resolved (from, kind, to) edges from both
 * out_edge / in_edge mirrors in a single write txn. Used by the
 * cross-file resolver Pass 1 to delete the (file → module-stub)
 * IMPORTS edges before re-adding (file → file) IMPORTS edges to the
 * located in-tree target.
 *
 * Edges whose endpoints aren't in `entity_id_by_string` (e.g. an
 * already-cascaded entity) are silently skipped. Edges whose kind isn't
 * in `RELATION_KIND_BYTE` (shouldn't happen at runtime) are skipped.
 */
export async function deleteResolvedRelations(
	_db: DbClient,
	items: ReadonlyArray<{ readonly from: string; readonly kind: RelationKind; readonly to: string }>,
): Promise<void> {
	if (items.length === 0) return;
	await withWriteTxn(s => {
		for (const r of items) {
			const fromU64 = lookupU64ByStringId(s, r.from);
			const toU64   = lookupU64ByStringId(s, r.to);
			if (fromU64 === undefined || toU64 === undefined) continue;
			const kindByte = RELATION_KIND_BYTE[r.kind as InternalRelationKind];
			if (kindByte === undefined) continue;
			s.outEdge.remove(encodeOutEdgeKey(fromU64, kindByte, toU64));
			s.inEdge.remove(encodeInEdgeKey(toU64, kindByte, fromU64));
		}
	});
}

export async function deleteRelationsForFile(_db: DbClient, _filePath: string): Promise<void> {
	// Resolved edges are removed automatically when entity rows are
	// deleted via deleteEntitiesForFile (entities.ts cascade). No
	// separate action needed here.
}

export async function deleteRelationsForRepo(_db: DbClient, _repo: string): Promise<void> {
	// Same as above; cleanup runs through deleteEntitiesForRepo.
}

// ---------------------------------------------------------------------------
// Unresolved relations -- cross-file resolver queue
// ---------------------------------------------------------------------------

async function upsertUnresolvedRelations(relations: Relation[]): Promise<void> {
	if (relations.length === 0) return;

	const attemptedAt = Date.now();

	// De-duplicate within the batch (last-wins by computed id)
	type Tuple = { id: string; row: UnresolvedRow; repoPath: string };
	const tupleById = new Map<string, Tuple>();
	for (const r of relations) {
		const meta     = r.meta ?? {};
		const fromFile = typeof meta['file'] === 'string' ? meta['file'] as string : '';
		const repo     = typeof meta['repo'] === 'string' ? meta['repo'] as string : '';
		if (fromFile === '' || repo === '') {
			log.debug(
				{ kind: r.kind, from: r.from, to: r.to },
				'unresolved relation missing meta.file/meta.repo -- dropping',
			);
			continue;
		}
		const id = makeUnresolvedRelationId(repo, r.from, r.kind, r.to);
		// repoId resolved per-row inside the txn (it's not on the
		// public Relation type; we look up by path)
		const row: UnresolvedRow = {
			id,
			repoId:      0, // back-filled inside the txn
			fromEntity:  r.from,
			fromFile,
			kind:        r.kind,
			rawTo:       r.to,
			meta,
			attemptedAt,
		};
		tupleById.set(id, { id, row, repoPath: repo });
	}
	if (tupleById.size === 0) return;

	await withWriteTxn(s => {
		const repoIdCache = new Map<string, number>();
		for (const t of tupleById.values()) {
			let repoId = repoIdCache.get(t.repoPath);
			if (repoId === undefined) {
				const found = repoIdByPathInTxn(s, t.repoPath);
				if (found === undefined) {
					// No registered repo. Skip rather than auto-allocate
					// here: upsertEntities is the canonical creation
					// point in the indexer flow, so by the time we hit
					// unresolved relations the repo should exist.
					log.debug(
						{ repo: t.repoPath, id: t.id },
						'upsertUnresolvedRelations: repo not registered; dropping',
					);
					continue;
				}
				repoId = found;
				repoIdCache.set(t.repoPath, repoId);
			}
			const row: UnresolvedRow = { ...t.row, repoId };
			// Write the canonical row
			s.unresolved.put(t.id, encodeUnresolvedRow(row));
			// Maintain the (repoId, fromFile) -> id dupsort index
			const idxKey = encodeUnresolvedByFileKey(repoId, row.fromFile);
			s.unresolvedByFile.put(idxKey, Buffer.from(t.id, 'utf8'));
		}
	});
}

export async function listUnresolvedRelations(
	_db: DbClient,
	repo: string,
	scopeFile?: string,
): Promise<UnresolvedRelation[]> {
	const store = await getGraphStore();
	const repoId = repoIdByPathInTxn(store, repo);
	if (repoId === undefined) return [];

	const out: UnresolvedRelation[] = [];

	if (scopeFile !== undefined) {
		// Use the (repoId, fromFile) dupsort index for an O(matches) scan.
		const idxKey = encodeUnresolvedByFileKey(repoId, scopeFile);
		for (const value of store.unresolvedByFile.getValues(idxKey)) {
			const id = (value as Buffer).toString('utf8');
			const buf = store.unresolved.get(id);
			if (buf === undefined) continue;
			const row = decodeUnresolvedRow(buf as Buffer);
			out.push(rowToUnresolved(row, repo));
		}
		return out;
	}

	// No file scope: scan the whole `unresolved` sub-DB filtering by
	// repoId. O(N) over unresolved rows; acceptable for the cross-file-
	// resolver call frequency.
	for (const { value } of store.unresolved.getRange()) {
		const row = decodeUnresolvedRow(value as Buffer);
		if (row.repoId !== repoId) continue;
		out.push(rowToUnresolved(row, repo));
	}
	return out;
}

export async function deleteUnresolvedForFile(_db: DbClient, file: string): Promise<void> {
	const store = await getGraphStore();
	// We don't know the repoId from `file` alone (file is an absolute
	// path; the index is (repoId, fromFile)). The fromFile in the index
	// is repo-relative *or* absolute -- the existing DuckDB code stored
	// whatever `meta.file` was, which the parser populates. To preserve
	// the lookup semantics, we scan all repos.
	const repos: number[] = [];
	for (const { key } of store.repo.getRange()) {
		repos.push((key as Buffer).readUInt32BE(0));
	}
	const idsToDelete: string[] = [];
	for (const repoId of repos) {
		const idxKey = encodeUnresolvedByFileKey(repoId, file);
		for (const value of store.unresolvedByFile.getValues(idxKey)) {
			idsToDelete.push((value as Buffer).toString('utf8'));
		}
	}
	if (idsToDelete.length === 0) return;
	await withWriteTxn(s => {
		for (const id of idsToDelete) {
			deleteUnresolvedRowInTxn(s, id);
		}
	});
}

export async function deleteUnresolvedForRepo(_db: DbClient, repo: string): Promise<void> {
	const store = await getGraphStore();
	const repoId = repoIdByPathInTxn(store, repo);
	if (repoId === undefined) return;

	// Collect ids to delete
	const ids: string[] = [];
	for (const { key, value } of store.unresolved.getRange()) {
		const row = decodeUnresolvedRow(value as Buffer);
		if (row.repoId === repoId) ids.push(key as string);
	}
	if (ids.length === 0) return;

	await withWriteTxn(s => {
		for (const id of ids) {
			deleteUnresolvedRowInTxn(s, id);
		}
	});
}

export async function promoteToResolved(
	_db: DbClient,
	unresolved: UnresolvedRelation,
	targetEntityId: string,
): Promise<void> {
	await withWriteTxn(s => {
		const fromU64 = lookupU64ByStringId(s, unresolved.fromEntity);
		const toU64   = lookupU64ByStringId(s, targetEntityId);
		const kindByte = RELATION_KIND_BYTE[unresolved.kind as InternalRelationKind];
		if (fromU64 !== undefined && toU64 !== undefined && kindByte !== undefined) {
			s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(toU64, kindByte, fromU64), Buffer.alloc(0));
		} else {
			log.debug(
				{ unresolvedId: unresolved.id, fromEntity: unresolved.fromEntity, targetEntityId, kind: unresolved.kind },
				'promoteToResolved: missing endpoint or unknown kind; resolved edge skipped (unresolved row still removed)',
			);
		}
		deleteUnresolvedRowInTxn(s, unresolved.id);
	});
}

export async function updateUnresolvedMeta(
	_db: DbClient,
	id: string,
	meta: Record<string, unknown>,
): Promise<void> {
	const attemptedAt = Date.now();
	await withWriteTxn(s => {
		const buf = s.unresolved.get(id);
		if (buf === undefined) return;
		const row = decodeUnresolvedRow(buf as Buffer);
		const next: UnresolvedRow = { ...row, meta, attemptedAt };
		s.unresolved.put(id, encodeUnresolvedRow(next));
	});
}

export async function promoteResolvedBatch(
	_db: DbClient,
	items: ReadonlyArray<{ unresolved: UnresolvedRelation; targetEntityId: string }>,
): Promise<void> {
	if (items.length === 0) return;
	await withWriteTxn(s => {
		for (const item of items) {
			const { unresolved, targetEntityId } = item;
			const fromU64 = lookupU64ByStringId(s, unresolved.fromEntity);
			const toU64   = lookupU64ByStringId(s, targetEntityId);
			const kindByte = RELATION_KIND_BYTE[unresolved.kind as InternalRelationKind];
			if (fromU64 !== undefined && toU64 !== undefined && kindByte !== undefined) {
				s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));
				s.inEdge.put(encodeInEdgeKey(toU64, kindByte, fromU64), Buffer.alloc(0));
			}
			deleteUnresolvedRowInTxn(s, unresolved.id);
		}
	});
}

export async function updateUnresolvedMetaBatch(
	_db: DbClient,
	items: ReadonlyArray<{ id: string; meta: Record<string, unknown> }>,
): Promise<void> {
	if (items.length === 0) return;
	const attemptedAt = Date.now();
	await withWriteTxn(s => {
		for (const { id, meta } of items) {
			const buf = s.unresolved.get(id);
			if (buf === undefined) continue;
			const row = decodeUnresolvedRow(buf as Buffer);
			const next: UnresolvedRow = { ...row, meta, attemptedAt };
			s.unresolved.put(id, encodeUnresolvedRow(next));
		}
	});
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function deleteUnresolvedRowInTxn(s: GraphStore, id: string): void {
	const buf = s.unresolved.get(id);
	if (buf === undefined) return;
	const row = decodeUnresolvedRow(buf as Buffer);
	const idxKey = encodeUnresolvedByFileKey(row.repoId, row.fromFile);
	// Remove the specific id from the dupsort index (other ids under
	// the same key persist).
	s.unresolvedByFile.remove(idxKey, Buffer.from(id, 'utf8'));
	s.unresolved.remove(id);
}

function repoIdByPathInTxn(s: GraphStore, path: string): number | undefined {
	for (const { key, value } of s.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		if (row.path === path) {
			return (key as Buffer).readUInt32BE(0);
		}
	}
	return undefined;
}

function lookupU64ByStringId(s: GraphStore, id: string): bigint | undefined {
	const v = s.entityIdByString.get(id) as bigint | number | undefined;
	if (v === undefined) return undefined;
	return typeof v === 'bigint' ? v : BigInt(v);
}

function rowToUnresolved(row: UnresolvedRow, repoPath: string): UnresolvedRelation {
	return {
		id:          row.id,
		repo:        repoPath,
		fromEntity:  row.fromEntity,
		fromFile:    row.fromFile,
		// LMDB-side RelationKind is a superset of the domain enum
		// (it includes CONTAINS / READS / WRITES / STEP_DEPENDS_ON
		// for future use). Cast back to the domain type; if a row was
		// somehow written with one of the extra kinds we surface it
		// as the LMDB string -- callers expecting a narrower union
		// should validate at their boundary.
		kind:        row.kind as RelationKind,
		rawTo:       row.rawTo,
		meta:        row.meta,
		attemptedAt: row.attemptedAt > 0 ? new Date(row.attemptedAt).toISOString() : '',
	};
}

// Suppress unused-imports
void prefixSuccessor;
