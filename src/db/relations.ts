/**
 * LMDB-backed graph relations + cross-file-resolver queue.
 *
 * Phase 2.3 (resolved edges) + Phase 2.4 (unresolved queue) of
 * docs/plans/storage-migration-lmdb-lance.md, landed in one file because
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
	encodeEntityKey,
	encodeOutEdgeKey,
	encodeInEdgeKey,
	encodeRepoKey,
	encodeUnresolvedByFileKey,
	prefixSuccessor,
	RELATION_KIND_BYTE,
	type RelationKind as InternalRelationKind,
} from './graph/keys.js';
import {
	encodeUnresolvedRow,
	decodeEntityRow,
	decodeUnresolvedRow,
	decodeRepoRow,
	type UnresolvedRow,
} from './graph/codec.js';
import { advanceGenerationInTxn, countUnwritableInTxn, movePendingInTxn, type PendingSlot } from './graph/index-state-rows.js';
import { awaitingReasonOf, BOUNDARY_RELATION_KINDS, pendingClassOf } from './graph/pending-class.js';
import { putExportNameInTxn } from './export-names.js';

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

/**
 * Write resolved relationships. Each input ends as exactly one of: an edge
 * (both endpoints stored), ONE pending row awaiting the target by its id (the
 * target is not stored yet; kept until the cross-file pass completes it), or a
 * counted unwritable with its reason (no source entity, or a kind with no
 * byte), logged at warn. Nothing is dropped silently (Epic c2ba6fa6 s1).
 */
async function upsertResolvedRelations(relations: Relation[]): Promise<void> {
	const unique = dedupeResolvedRelations(relations);
	if (unique.length < relations.length) {
		log.debug(
			{ original: relations.length, kept: unique.length },
			'upsertRelations: collapsed duplicate (src, dst, kind) edges in input batch',
		);
	}
	if (unique.length === 0) return;

	const refused: Array<{ kind: string; from: string; to: string; reason: string }> = [];
	let keptAwaiting = 0;
	const now = Date.now();
	await withWriteTxn(s => {
		for (const r of unique) {
			const kindByte = RELATION_KIND_BYTE[r.kind as InternalRelationKind];
			const fromU64  = lookupU64ByStringId(s, r.from);
			if (kindByte === undefined || fromU64 === undefined) {
				const reason = kindByte === undefined ? 'unknown-kind' : 'source-missing';
				countUnwritableInTxn(s, repoIdOfMetaInTxn(s, r.meta), reason);
				refused.push({ kind: r.kind, from: r.from, to: r.to, reason });
				continue;
			}
			const toU64 = lookupU64ByStringId(s, r.to);
			if (toU64 === undefined) {
				writePendingRowInTxn(s, awaitingRowFor(s, fromU64, r.from, r.kind, r.to, r.meta, now));
				keptAwaiting++;
				continue;
			}
			s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(toU64, kindByte, fromU64), Buffer.alloc(0));
		}
	});
	if (keptAwaiting > 0) log.debug({ keptAwaiting, total: unique.length }, 'upsertResolvedRelations: kept relationships awaiting a target not stored yet');
	if (refused.length > 0) {
		log.warn(
			{ refused: refused.length, total: unique.length, first: refused.slice(0, 20) },
			'upsertResolvedRelations: relationships the store could not write (counted as unwritable)',
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

/**
 * Write pending relationships. Every stored row is counted under its class
 * (and reason) in its repository's IndexState, in the same transaction; a row
 * awaiting an entity id is also indexed by that id. A row without its file or
 * repository, or of an unregistered repository, is counted unwritable with its
 * reason (daemon-wide when it names no registered repository) and logged at warn.
 */
async function upsertUnresolvedRelations(relations: Relation[]): Promise<void> {
	if (relations.length === 0) return;

	const attemptedAt = Date.now();
	const refused: Array<{ kind: string; from: string; to: string; reason: string }> = [];

	// De-duplicate within the batch (last-wins by computed id)
	type Tuple = { id: string; row: UnresolvedRow; repoPath: string };
	const tupleById = new Map<string, Tuple>();
	const withoutFile: Relation[] = [];
	for (const r of relations) {
		const meta     = r.meta ?? {};
		const fromFile = typeof meta['file'] === 'string' ? meta['file'] as string : '';
		const repo     = typeof meta['repo'] === 'string' ? meta['repo'] as string : '';
		if (fromFile === '' || repo === '') {
			withoutFile.push(r);
			continue;
		}
		// `export { f }` and `export { f as g }` from one file are two relationships: an
		// aliased re-export's id also names the alias (Epic c2ba6fa6 s1).
		const exportedAs = meta['exportedAs'];
		const idTo = r.kind === 'EXPORTS' && typeof exportedAs === 'string' && exportedAs !== r.to ? `${r.to}\x00as\x00${exportedAs}` : r.to;
		const id = makeUnresolvedRelationId(repo, r.from, r.kind, idTo);
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
	if (tupleById.size === 0 && withoutFile.length === 0) return;

	await withWriteTxn(s => {
		for (const r of withoutFile) {
			countUnwritableInTxn(s, repoIdOfMetaInTxn(s, r.meta), 'pending-without-file');
			refused.push({ kind: r.kind, from: r.from, to: r.to, reason: 'pending-without-file' });
		}
		const repoIdCache = new Map<string, number | undefined>();
		for (const t of tupleById.values()) {
			if (!repoIdCache.has(t.repoPath)) repoIdCache.set(t.repoPath, repoIdByPathInTxn(s, t.repoPath));
			const repoId = repoIdCache.get(t.repoPath);
			if (repoId === undefined) {
				// No registered repo: upsertEntities is the canonical creation
				// point, so this is a caller error; it is counted, not dropped silently.
				countUnwritableInTxn(s, undefined, 'repository-not-registered');
				refused.push({ kind: t.row.kind, from: t.row.fromEntity, to: t.row.rawTo, reason: 'repository-not-registered' });
				continue;
			}
			writePendingRowInTxn(s, { ...t.row, repoId });
		}
	});
	if (refused.length > 0) {
		log.warn(
			{ refused: refused.length, total: relations.length, first: refused.slice(0, 20) },
			'upsertUnresolvedRelations: pending relationships the store could not keep (counted as unwritable)',
		);
	}
}

export async function listUnresolvedRelations(
	_db: DbClient,
	repo: string,
	scopeFile?: string,
	opts?: { readonly awaiting?: readonly string[] | undefined },
): Promise<UnresolvedRelation[]> {
	const store = await getGraphStore();
	const repoId = repoIdByPathInTxn(store, repo);
	if (repoId === undefined) return [];

	const out: UnresolvedRelation[] = [];

	if (opts?.awaiting !== undefined) {
		// Rows awaiting one of these entity ids, from EVERY repository, read
		// through unresolved_by_target: proportional to the matches, not the table.
		const seen = new Set<string>();
		const pathById = new Map<number, string | undefined>();
		for (const awaited of opts.awaiting) {
			for (const value of store.unresolvedByTarget.getValues(Buffer.from(awaited, 'utf8'))) {
				const id = (value as Buffer).toString('utf8');
				if (seen.has(id)) continue;
				seen.add(id);
				const row = getPendingRowInTxn(store, id);
				if (row === undefined) continue;
				if (!pathById.has(row.repoId)) pathById.set(row.repoId, repoPathOfInTxn(store, row.repoId));
				out.push(rowToUnresolved(row, pathById.get(row.repoId) ?? ''));
			}
		}
		return out;
	}

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

/**
 * Repo-scoped variant of `deleteUnresolvedForFile`: removes only the
 * unresolved rows `repo` holds for `file`. Another registered repo's
 * rows for the same path (nested repos) are left alone. An
 * unregistered repo is a no-op.
 */
export async function deleteUnresolvedForRepoFile(
	_db: DbClient,
	repo: string,
	file: string,
): Promise<void> {
	const store = await getGraphStore();
	const repoId = repoIdByPathInTxn(store, repo);
	if (repoId === undefined) return;
	const idsToDelete: string[] = [];
	const idxKey = encodeUnresolvedByFileKey(repoId, file);
	for (const value of store.unresolvedByFile.getValues(idxKey)) {
		idsToDelete.push((value as Buffer).toString('utf8'));
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

/** What a batch of promotions did. */
export interface PromoteResult {
	/** Rows that became edges. */
	promoted:     number;
	/** Rows kept pending because their target is not stored (re-keyed to await it by id). */
	keptAwaiting: number;
	/** Rows counted unwritable (no source entity, or a kind with no byte). */
	unwritable:   number;
}

export async function promoteToResolved(
	_db: DbClient,
	unresolved: UnresolvedRelation,
	targetEntityId: string,
): Promise<void> {
	await promoteResolvedBatch(_db, [{ unresolved, targetEntityId }]);
}

export async function updateUnresolvedMeta(
	_db: DbClient,
	id: string,
	meta: Record<string, unknown>,
): Promise<void> {
	const attemptedAt = Date.now();
	await withWriteTxn(s => { updatePendingMetaInTxn(s, id, meta, attemptedAt); });
}

/**
 * Complete pending rows whose target was found. Per row: both endpoints stored
 * -> the edge is written and the row removed; the target not stored -> the row
 * is KEPT, re-keyed to await the target by its id (one row per relationship);
 * no source entity -> the stale row is removed and counted unwritable; a kind
 * with no byte -> counted unwritable and the row kept. Counts move in the same
 * transaction; each repository with a promotion advances its generation once.
 */
export async function promoteResolvedBatch(
	_db: DbClient,
	items: ReadonlyArray<{
		unresolved: UnresolvedRelation;
		targetEntityId: string;
		/** An EXPORTS row: the name the file exports it under, written to export_names with the edge. */
		exportName?: string | undefined;
	}>,
): Promise<PromoteResult> {
	const result: PromoteResult = { promoted: 0, keptAwaiting: 0, unwritable: 0 };
	if (items.length === 0) return result;
	const refused: Array<{ id: string; kind: string; reason: string }> = [];
	const now = Date.now();
	await withWriteTxn(s => {
		const promotedRepos = new Set<number>();
		for (const { unresolved, targetEntityId, exportName } of items) {
			const stored = getPendingRowInTxn(s, unresolved.id);
			const repoId = stored?.repoId ?? repoIdByPathInTxn(s, unresolved.repo);
			const kindByte = RELATION_KIND_BYTE[unresolved.kind as InternalRelationKind];
			if (kindByte === undefined) {
				countUnwritableInTxn(s, repoId, 'unknown-kind');
				refused.push({ id: unresolved.id, kind: unresolved.kind, reason: 'unknown-kind' });
				result.unwritable++;
				continue;
			}
			const fromU64 = lookupU64ByStringId(s, unresolved.fromEntity);
			if (fromU64 === undefined) {
				removePendingRowInTxn(s, unresolved.id);
				countUnwritableInTxn(s, repoId, 'source-missing');
				refused.push({ id: unresolved.id, kind: unresolved.kind, reason: 'source-missing' });
				result.unwritable++;
				continue;
			}
			const toU64 = lookupU64ByStringId(s, targetEntityId);
			if (toU64 === undefined) {
				const meta = { ...(stored?.meta ?? unresolved.meta) };
				removePendingRowInTxn(s, unresolved.id);
				writePendingRowInTxn(s, awaitingRowFor(s, fromU64, unresolved.fromEntity, unresolved.kind, targetEntityId, meta, now));
				result.keptAwaiting++;
				continue;
			}
			s.outEdge.put(encodeOutEdgeKey(fromU64, kindByte, toU64), Buffer.alloc(0));
			s.inEdge.put(encodeInEdgeKey(toU64, kindByte, fromU64), Buffer.alloc(0));
			if (exportName !== undefined) putExportNameInTxn(s, fromU64, exportName, targetEntityId);
			removePendingRowInTxn(s, unresolved.id);
			if (repoId !== undefined) promotedRepos.add(repoId);
			result.promoted++;
		}
		for (const repoId of promotedRepos) advanceGenerationInTxn(s, repoId);
	});
	if (refused.length > 0) {
		log.warn({ refused: refused.length, total: items.length, first: refused.slice(0, 20) }, 'promoteResolvedBatch: pending relationships the store could not complete (counted as unwritable)');
	}
	return result;
}

export async function updateUnresolvedMetaBatch(
	_db: DbClient,
	items: ReadonlyArray<{ id: string; meta: Record<string, unknown> }>,
): Promise<void> {
	if (items.length === 0) return;
	const attemptedAt = Date.now();
	await withWriteTxn(s => {
		for (const { id, meta } of items) updatePendingMetaInTxn(s, id, meta, attemptedAt);
	});
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function slotOf(row: UnresolvedRow): PendingSlot {
	const cls = pendingClassOf(row);
	return cls === 'awaiting-target' ? { cls, reason: awaitingReasonOf(row) } : { cls };
}

function getPendingRowInTxn(s: GraphStore, id: string): UnresolvedRow | undefined {
	const buf = s.unresolved.get(id);
	return buf === undefined ? undefined : decodeUnresolvedRow(buf as Buffer);
}

/** The by-target index key of a row awaiting an entity id, or undefined. */
function awaitedKey(row: UnresolvedRow): Buffer | undefined {
	return row.meta['awaitsId'] === true ? Buffer.from(row.rawTo, 'utf8') : undefined;
}

/**
 * Store one pending row with its by-file and by-target index entries and its
 * count. A row already stored under the same id is replaced (its count and
 * index entries removed first), so one relationship is always one row.
 */
function writePendingRowInTxn(s: GraphStore, row: UnresolvedRow): void {
	removePendingRowInTxn(s, row.id);
	s.unresolved.put(row.id, encodeUnresolvedRow(row));
	s.unresolvedByFile.put(encodeUnresolvedByFileKey(row.repoId, row.fromFile), Buffer.from(row.id, 'utf8'));
	const target = awaitedKey(row);
	if (target !== undefined) s.unresolvedByTarget.put(target, Buffer.from(row.id, 'utf8'));
	movePendingInTxn(s, row.repoId, undefined, slotOf(row));
}

/**
 * Merge `meta` into a pending row's stored meta (awaitsId, file, repo,
 * specifier and exportedAs survive), clear a stale candidates list when the
 * class becomes anything but 'ambiguous' and no new list is given, and move
 * the row's count when its class or reason changes.
 */
function updatePendingMetaInTxn(s: GraphStore, id: string, meta: Record<string, unknown>, attemptedAt: number): void {
	const row = getPendingRowInTxn(s, id);
	if (row === undefined) return;
	const merged: Record<string, unknown> = { ...row.meta, ...meta };
	if (merged['class'] !== 'ambiguous' && !('candidates' in meta)) delete merged['candidates'];
	const next: UnresolvedRow = { ...row, meta: merged, attemptedAt };
	const before = slotOf(row);
	const after = slotOf(next);
	s.unresolved.put(id, encodeUnresolvedRow(next));
	if (before.cls !== after.cls || before.reason !== after.reason) movePendingInTxn(s, row.repoId, before, after);
}

/** Remove one pending row, its index entries and its count. */
function removePendingRowInTxn(s: GraphStore, id: string): void {
	const row = getPendingRowInTxn(s, id);
	if (row === undefined) return;
	s.unresolvedByFile.remove(encodeUnresolvedByFileKey(row.repoId, row.fromFile), Buffer.from(id, 'utf8'));
	const target = awaitedKey(row);
	if (target !== undefined) s.unresolvedByTarget.remove(target, Buffer.from(id, 'utf8'));
	s.unresolved.remove(id);
	movePendingInTxn(s, row.repoId, slotOf(row), undefined);
}

/**
 * The pending row that keeps a relationship whose source is stored and whose
 * target is not: keyed by the awaited id, with the source's repository and
 * its ABSOLUTE file (the form the parser writes and unresolved_by_file is
 * keyed by; the relation's own meta.file when present, else rebuilt from the
 * entity row; a source with no file, the repository entity, uses the
 * repository root). A boundary kind is classed 'external-endpoint'.
 */
function awaitingRowFor(
	s: GraphStore,
	fromU64: bigint,
	fromEntity: string,
	kind: RelationKind,
	targetEntityId: string,
	meta: Record<string, unknown> | undefined,
	attemptedAt: number,
): UnresolvedRow {
	const source = decodeEntityRow(s.entity.get(encodeEntityKey(fromU64)) as Buffer);
	const repoPath = repoPathOfInTxn(s, source.repoId) ?? source.rootPath;
	const ownFile = typeof meta?.['file'] === 'string' && (meta['file'] as string) !== '' ? meta['file'] as string : undefined;
	const file = ownFile ?? (source.filePath === '' || source.filePath === '.' ? repoPath : absolutePath(source.filePath, source.rootPath));
	const boundary = BOUNDARY_RELATION_KINDS.has(kind);
	const { reason: _ignored, candidates: _stale, ...rest } = meta ?? {};
	void _ignored; void _stale;
	return {
		id:          makeUnresolvedRelationId(repoPath, fromEntity, kind, targetEntityId),
		repoId:      source.repoId,
		fromEntity,
		fromFile:    file,
		kind,
		rawTo:       targetEntityId,
		meta:        {
			...rest,
			file,
			repo:     repoPath,
			awaitsId: true,
			class:    boundary ? 'external-endpoint' : 'awaiting-target',
			...(boundary ? {} : { reason: 'target-not-stored-yet' }),
		},
		attemptedAt,
	};
}

function absolutePath(filePath: string, root: string): string {
	if (filePath.startsWith('/') || root === '') return filePath;
	return root.endsWith('/') ? `${root}${filePath}` : `${root}/${filePath}`;
}

function repoPathOfInTxn(s: GraphStore, repoId: number): string | undefined {
	const buf = s.repo.get(encodeRepoKey(repoId));
	return buf === undefined ? undefined : decodeRepoRow(buf as Buffer).path;
}

/** The registered repository a relationship's meta.repo names, if any. */
function repoIdOfMetaInTxn(s: GraphStore, meta: Record<string, unknown> | undefined): number | undefined {
	const repo = meta?.['repo'];
	return typeof repo === 'string' && repo !== '' ? repoIdByPathInTxn(s, repo) : undefined;
}

/** Every pending-row delete removes the row, its index entries and its count (Epic c2ba6fa6 s1). */
function deleteUnresolvedRowInTxn(s: GraphStore, id: string): void {
	removePendingRowInTxn(s, id);
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
