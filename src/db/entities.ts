import { assertNoSessionPersistence } from '../shared/connection-persistence.js';
/**
 * LMDB-backed entity persistence. Phase 2.2 of
 * docs/plans/storage-migration-lmdb-lance.md.
 *
 * Public surface preserved verbatim from the prior DuckDB-backed
 * implementation: callers (`indexer/`, `daemon/`, `agent/tasks/`,
 * RPC handlers) keep using `upsertEntities / getEntity / ...` with
 * the same signatures. The `db: DbClient` parameter is retained
 * (vestigial) for caller back-compat; the LMDB substrate is opened
 * lazily by `db/graph/store.ts`.
 *
 * Storage model:
 *   - `entity` sub-DB: u64 BE -> msgpack(EntityRow). u64 because
 *     edges reference entities by u64 (10x edge:entity ratio makes
 *     8-byte vs 32-byte IDs the dominant storage win).
 *   - `entity_id_by_string` sub-DB: utf8 SHA-32 string -> u64. Used
 *     to translate the daemon's domain `Entity.id: string` (kept for
 *     caller back-compat) to/from the internal u64.
 *   - `repo` sub-DB: u32 BE -> RepoRow. Linear scan for path<->id
 *     translation (~hundreds of repos at most).
 *   - Embedding vectors do NOT live in LMDB -- they go to LanceDB
 *     keyed by entity_id (Phase 3.2). For now `updateEmbedding()`
 *     records only the model name; vector writes land in Phase 3.2.
 *     `getEntity()` returns `embedding: []` until Phase 3.2 wires
 *     Lance reads.
 *
 * Module-stub semantics: module entities use "ensure exists" (no-op
 * if already present); other kinds use full upsert (overwrite). The
 * DuckDB era used `ON CONFLICT DO NOTHING` vs `DO UPDATE`; LMDB
 * achieves the same via an explicit pre-check.
 *
 * Cascade on delete: incident edges in `out_edge` / `in_edge`
 * sub-DBs are also removed. Phase 2.10 will hoist this into a
 * shared cascade helper; for Phase 2.2 we do the prefix-scan
 * inline.
 */

import { relative } from 'node:path';

import type { Entity, EntityKind, FileCommit, FileCommitResult, Language } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import {
	getGraphStore,
	withWriteTxn,
	type GraphStore,
} from './graph/store.js';
import { allocateEntityIdInTxn } from './graph/ids.js';
import {
	encodeEntityKey,
	encodeEntityByFileKey,
	encodeEntityByFilePrefix,
	decodeRepoKey,
	encodeOutEdgePrefix,
	encodeInEdgePrefix,
	encodeNameIndexKey,
	prefixSuccessor,
	ENTITY_KIND_BYTE,
} from './graph/keys.js';
import {
	decodeEntityRow,
	decodeRepoRow,
	encodeEntityRow,
	type EntityRow,
} from './graph/codec.js';
import {
	UnregisteredRepoError,
	lookupRepoIdInTxn,
	validateRepoPathShape,
} from './repos.js';
import {
	SHARED_MODULES_NAMESPACE_BY_LANG,
	SHARED_MODULES_REPO_ID,
} from '../shared/repo-namespaces.js';
import { trackUnembeddedInTxn, updateIndexStateRowInTxn } from './graph/index-state-rows.js';
import { loadLocalProviderConfig } from '../config/local.js';
import { carryDocSummariesInTxn, deleteCarriedDocSummariesInTxn, deleteDocSummaryInTxn } from './doc-summaries.js';
import { isGroupingKindByte, recordChangedEntityFileInTxn, recordChangedFileInTxn, resetSubsystemInputsInTxn } from './subsystem-changes.js';

const log = getLogger('db.entities');

/** Vestigial `DbClient` param shape, kept for caller back-compat. */
type DbClient = unknown;

// ---------------------------------------------------------------------------
// Domain <-> row mapping
// ---------------------------------------------------------------------------

function entityToRow(e: Entity, repoId: number, repoRoot: string): EntityRow {
	const row: EntityRow = {
		repoId,
		kind:           e.kind,
		name:           e.name,
		filePath:       toRepoRelative(e.file, repoRoot),
		startLine:      e.startLine,
		endLine:        e.endLine,
		language:       e.language,
		rootPath:       e.rootPath ?? repoRoot,
		body:           e.body,
		signature:      e.signature ?? '',
		summary:        '',
		isExported:     e.isExported ?? false,
		isAsync:        e.isAsync    ?? false,
		isAbstract:     e.isAbstract ?? false,
		artifact:       e.artifact   ?? false,
		contentHash:    e.hash       ?? '',
		embeddingModel: e.embeddingModel ?? '',
		indexedAt:      parseTimestamp(e.indexedAt),
	};
	// External-service endpoint fields (sc1): attach only for externalEndpoint
	// entities so every other entity's row stays byte-identical to pre-S001.
	if (e.kind === 'externalEndpoint') {
		if (e.protocol !== undefined)      row.protocol = e.protocol;
		if (e.resolved !== undefined)      row.resolved = e.resolved;
		if (e.target !== undefined)        row.target = e.target;
		if (e.rawExpression !== undefined) row.rawExpression = e.rawExpression;
	}
	return row;
}

function rowToDomainEntity(id: string, row: EntityRow, repoRoot: string): Entity {
	const e: Entity = {
		id,
		kind:      row.kind,
		name:      row.name,
		language:  row.language,
		repoId:    row.repoId,
		repo:      repoRoot,
		file:      toAbsolutePath(row.filePath, repoRoot),
		startLine: row.startLine,
		endLine:   row.endLine,
		body:      row.body,
		// Embedding lives in LanceDB; Phase 3.2 wires the read path.
		embedding: [],
		indexedAt: formatTimestamp(row.indexedAt),
	};
	if (row.embeddingModel !== '') e.embeddingModel = row.embeddingModel;
	if (row.isExported) e.isExported = true;
	if (row.isAsync)    e.isAsync    = true;
	if (row.isAbstract) e.isAbstract = true;
	if (row.signature !== '') e.signature = row.signature;
	if (row.contentHash !== '') e.hash = row.contentHash;
	if (row.rootPath !== '' && row.rootPath !== repoRoot) e.rootPath = row.rootPath;
	if (row.artifact) e.artifact = true;
	// External-service endpoint fields (sc1): surface only when present on the row.
	if (row.protocol !== undefined)      e.protocol = row.protocol;
	if (row.resolved !== undefined)      e.resolved = row.resolved;
	if (row.target !== undefined)        e.target = row.target;
	if (row.rawExpression !== undefined) e.rawExpression = row.rawExpression;
	return e;
}

/**
 * Legacy DuckDB-era row mapper. The new code path produces Entity
 * via `rowToDomainEntity`; this function is kept exported only because
 * `db/search.ts` still imports it. When `db/search.ts` is rewired in
 * Phase 4.2, this export goes away.
 *
 * @deprecated Use the LMDB read path instead.
 */
export function rowToEntity(row: Record<string, unknown>): Entity {
	const e: Entity = {
		id:        row['id']         as string,
		kind:      row['kind']       as EntityKind,
		name:      (row['name']      as string) ?? '',
		language:  (row['language']  as Language) ?? '',
		repoId:    Number(row['repo_id'] ?? row['repoId'] ?? 0),
		repo:      (row['repo']      as string) ?? '',
		file:      (row['file']      as string) ?? '',
		startLine: Number(row['start_line'] ?? 0),
		endLine:   Number(row['end_line']   ?? 0),
		body:      (row['body']      as string) ?? '',
		indexedAt: (row['indexed_at'] as string) ?? '',
		embedding: unwrapEmbedding(row['embedding']),
	};
	const em = row['embedding_model'] as string; if (em) e.embeddingModel = em;
	if (row['is_exported'] === true) e.isExported = true;
	if (row['is_async']    === true) e.isAsync    = true;
	if (row['is_abstract'] === true) e.isAbstract = true;
	const sg = row['signature'] as string; if (sg) e.signature = sg;
	const hh = row['hash']      as string; if (hh) e.hash      = hh;
	const rp = row['root_path'] as string; if (rp) e.rootPath  = rp;
	if (row['artifact'] === true) e.artifact = true;
	return e;
}

/**
 * @deprecated DuckDB-era helper. The LMDB path stores embeddings in
 * Lance, not in the entity row. Kept exported only for back-compat
 * with `db/search.ts`.
 */
export function unwrapEmbedding(raw: unknown): number[] {
	if (raw === null || raw === undefined) return [];
	if (Array.isArray(raw)) return raw as number[];
	const inner = (raw as { items?: unknown }).items;
	return Array.isArray(inner) ? (inner as number[]) : [];
}

// ---------------------------------------------------------------------------
// Public API (signatures unchanged from the DuckDB era)
// ---------------------------------------------------------------------------

/**
 * A module stub (kind 'module', no repo) is a shared external reference: it
 * lives under the reserved shared-modules row of its language's namespace,
 * never under the workspace that first imported it. Undefined for any other
 * entity; throws for a stub whose language has no namespace.
 */
function sharedModulesRepoIdOf(e: Entity): number | undefined {
	if (e.kind !== 'module' || e.repo !== '') return undefined;
	const namespace = SHARED_MODULES_NAMESPACE_BY_LANG[e.language];
	if (namespace === undefined) {
		throw new UnregisteredRepoError(
			`module entity '${e.name}' (language=${e.language}) has no shared-modules namespace mapping`,
		);
	}
	return SHARED_MODULES_REPO_ID[namespace];
}

export async function upsertEntities(_db: DbClient, entities: Entity[]): Promise<void> {
	assertNoSessionPersistence();
	if (entities.length === 0) return;

	const { unique, duplicateIds } = dedupeEntitiesById(entities);
	if (duplicateIds.size > 0) {
		const sample: { id: string; count: number; name: string; kind: string; file: string }[] = [];
		for (const [id, count] of duplicateIds) {
			const ent = unique.find(x => x.id === id);
			if (ent === undefined) continue;
			sample.push({ id, count, name: ent.name, kind: ent.kind, file: ent.file });
			if (sample.length >= 5) break;
		}
		log.warn(
			{ totalDuplicates: duplicateIds.size, kept: unique.length, original: entities.length, sample },
			'upsertEntities: collapsed duplicate entity ids in input batch (last-wins). ' +
			'This usually indicates a parser emitting two entities with identical (repo, file, kind, name) -- ' +
			'common for overloaded Java/Scala methods since the id formula doesn\'t include signature.',
		);
	}

	// Collect (entity, was-new-or-re-embed) tuples for the post-commit
	// Lance write step. Filled inside the txn so we have prior-row
	// state available; flushed to Lance after the LMDB commit so a
	// Lance failure doesn't block the structural write.
	const vectorWrites: VectorWrite[] = [];

	await withWriteTxn(s => {
		// Phase 5.x strict-contract resolver. The storage layer no
		// longer auto-allocates Repo registry rows -- callers must
		// have registered the workspace via `addRepo()` first, or
		// (for `kind: 'module'` entities) use the empty-string
		// sentinel which routes to the matching namespace's
		// reserved row provisioned by the v2->v3 migration.
		//
		// `repoIdCache` short-circuits the per-path lookup once
		// per batch.
		const repoIdCache = new Map<string, number>();
		const resolveRepoId = (e: Entity): number => {
			// Module-entity sentinel: empty repo + namespace lookup
			// from language. Modules are shared external references
			// (no specific workspace); they live under reserved
			// namespace-keyed rows.
			const shared = sharedModulesRepoIdOf(e);
			if (shared !== undefined) return shared;

			// Workspace entities: pre-registered path required.
			const cached = repoIdCache.get(e.repo);
			if (cached !== undefined) return cached;
			const existing = lookupRepoIdInTxn(s, e.repo);
			if (existing === undefined) {
				throw new UnregisteredRepoError(e.repo);
			}
			repoIdCache.set(e.repo, existing);
			return existing;
		};

		for (const e of unique) {
			const repoId = resolveRepoId(e);
			const existingU64 = lookupU64ByStringId(s, e.id);

			if (existingU64 !== undefined) {
				// Module entities are ensure-exists: don't overwrite.
				if (e.kind === 'module') continue;
				const row = rowAwaitingVector(e, repoId, e.repo);
				const prevBuf = s.entity.get(encodeEntityKey(existingU64));
				const prev = prevBuf !== undefined ? decodeEntityRow(prevBuf as Buffer) : null;
				putEntityRowInTxn(s, existingU64, prev, row);
				if (e.embedding !== undefined && e.embedding.length > 0) vectorWrites.push({ entity: e, replace: false });
				continue;
			}

			// New entity: allocate u64, write the row + index entries
			const u64 = allocateEntityIdInTxn(s);
			const row = rowAwaitingVector(e, repoId, e.repo);
			s.entityIdByString.put(e.id, u64);
			s.entityStringByU64.put(encodeEntityKey(u64), e.id);
			putEntityRowInTxn(s, u64, null, row);
			if (e.embedding !== undefined && e.embedding.length > 0) vectorWrites.push({ entity: e, replace: true });
		}
	});

	// The vectors, then the markers (writeVectorsThenMarkers).
	await writeVectorsThenMarkers(vectorWrites, 'upsertEntities');
}

/** The vector writes this module makes; a test puts a failing one in front of the real table. */
type VectorWriter = Pick<typeof import('./lance/entity-vec.js'), 'addEntityEmbeddings' | 'writeEntityEmbeddings' | 'writeEntityEmbedding' | 'deleteEntityVecsByIds' | 'deleteEntityVecsForRepo'>;
let vectorWriterForTest: Partial<VectorWriter> | undefined;
/** Test seam: the vector writes and deletes commitFile, upsertEntities, updateEmbedding and the reconciliation use; the methods given replace the real table's (undefined: the real table). */
export function _setVectorWriterForTest(writer: Partial<VectorWriter> | undefined): void { vectorWriterForTest = writer; }
async function vectorWriter(): Promise<VectorWriter> {
	const real = await import('./lance/entity-vec.js');
	return vectorWriterForTest === undefined ? real : { ...real, ...vectorWriterForTest };
}
/** Ids per vector delete: a long IN-list stalls Lance's predicate planner (see writeEntityEmbeddings). */
const VECTOR_DELETE_CHUNK = 500;
async function deleteVectorsInChunks(lance: VectorWriter, ids: readonly string[]): Promise<void> {
	for (let i = 0; i < ids.length; i += VECTOR_DELETE_CHUNK) await lance.deleteEntityVecsByIds(ids.slice(i, i + VECTOR_DELETE_CHUNK));
}

/**
 * Every change to the entity vector table from this module -- a write and its
 * markers, a removal's delete, a repository's delete, the start-time
 * reconciliation, the full index's compaction and index build -- runs under
 * this one lock (ISSUE-8c7d75b0 review): the backfill lane and the index lane
 * run side by side in the code-indexing worker, and without it a backfill
 * write can land between the index lane's delete and add of the same id,
 * delete a row the index lane has just written, or be cut by a compaction that
 * deletes unverified files. The lock is per thread: the queue's lanes, and the
 * repository removal routed to that worker, share it. A removal running on
 * another thread is still safe for the one-row rule: the backfill's check
 * before its write and its delete of an entity gone by its marker transaction
 * cover it.
 */
let vectorLock: Promise<void> = Promise.resolve();
function withVectorLock<T>(fn: () => Promise<T>): Promise<T> {
	const run = vectorLock.then(fn);
	vectorLock = run.then(() => undefined, () => undefined);
	return run;
}

/** One entity whose vector is written after its row commits. */
interface VectorWrite {
	readonly entity: Entity;
	/**
	 * Write as delete-then-add, which leaves exactly one row whatever was
	 * stored: an entity first allocated in the same commit (a vector may have
	 * outlived an earlier entity of that id), or a backfill write. Otherwise an
	 * upsert of the entity's one row.
	 */
	readonly replace: boolean;
}

/** The embedded text's source still matches the stored row: the vector describes what is stored. */
function rowMatches(row: EntityRow, e: Entity): boolean {
	return row.body === e.body && row.name === e.name && (row.signature ?? '') === (e.signature ?? '');
}

/**
 * The embedding marker is set only once the vector is stored (Epic c2ba6fa6
 * s2): rows are committed with an empty marker, then the vectors are written
 * (a plain add for an entity first allocated in that commit, an upsert for any
 * other, which may still have a vector from before), then ONE transaction sets
 * each written entity's marker to the active embedding model (the
 * configured models.local.embeddingModel, which names the ONNX model too
 * when that backend runs). Returns how many vectors are
 * still outstanding: all of them when the vector write or the marker
 * transaction fails, which is logged and never fails the caller's graph write;
 * their markers stay empty for the backfill to find.
 */
function writeVectorsThenMarkers(all: readonly VectorWrite[], who: string): Promise<number> {
	if (all.length === 0) return Promise.resolve(0);
	return withVectorLock(() => writeVectorsThenMarkersLocked(all, who));
}

async function writeVectorsThenMarkersLocked(all: readonly VectorWrite[], who: string): Promise<number> {
	// Only entities still stored as embedded here and awaiting a vector: one
	// removed or refreshed since (the backfill embeds beside the index lane) is
	// left to the index lane, whose own vector write for it is ordered after this
	// one by the lock (s2 review: a stale vector must not replace a fresh one).
	const store = await getGraphStore();
	const writes = all.filter(w => {
		const u64 = lookupU64ByStringId(store, w.entity.id);
		const row = u64 === undefined ? null : readEntityRowSync(store, u64);
		return row !== null && row.embeddingModel === '' && rowMatches(row, w.entity);
	});
	if (writes.length === 0) return 0;
	const lance = await vectorWriter();
	type Row = Parameters<VectorWriter['addEntityEmbeddings']>[0][number];
	const rowOf = (e: Entity): Row => ({
		id:        e.id,
		embedding: new Float32Array(e.embedding),
		repo:      e.repo,
		kind:      e.kind as string,
		artifact:  e.artifact ?? false,
	});
	try {
		const adds    = writes.filter(w => w.replace).map(w => rowOf(w.entity));
		const upserts = writes.filter(w => !w.replace).map(w => rowOf(w.entity));
		// The plain add needs the ids to have no row: a vector can outlive its
		// entity (a failed removal delete) or an id hold two rows, so any rows
		// stored for these ids go first (ISSUE-8c7d75b0). One row per id.
		if (adds.length > 0) {
			await deleteVectorsInChunks(lance, adds.map(r => r.id));
			await lance.addEntityEmbeddings(adds);
		}
		if (upserts.length > 0) await lance.writeEntityEmbeddings(upserts);
	} catch (err) {
		log.warn(
			{ count: writes.length, err: err instanceof Error ? err.message : String(err) },
			`${who}: vector write failed after the graph commit -- markers left empty for the backfill`,
		);
		return writes.length;
	}
	const model = activeEmbeddingModel();
	const gone: string[] = [];
	try {
		await withWriteTxn(s => {
			gone.length = 0;
			for (const w of writes) {
				const u64 = lookupU64ByStringId(s, w.entity.id);
				if (u64 === undefined) { gone.push(w.entity.id); continue; }
				const row = readEntityRowSync(s, u64);
				// Refreshed since the check above: the index lane writes its vector
				// (after this, under the lock) and sets the marker; not this one.
				if (row === null || row.embeddingModel !== '' || !rowMatches(row, w.entity)) continue;
				putEntityRowInTxn(s, u64, row, { ...row, embeddingModel: model });
			}
		});
	} catch (err) {
		log.warn(
			{ count: writes.length, err: err instanceof Error ? err.message : String(err) },
			`${who}: marker transaction failed after the vector write -- markers left empty for the backfill`,
		);
		return writes.length;
	}
	// A vector written for an entity no longer stored (removed by the index lane
	// while the backfill embedded it) is deleted, so it cannot become an orphan
	// that a later add of the same id would sit beside (ISSUE-8c7d75b0).
	if (gone.length > 0) {
		try {
			await deleteVectorsInChunks(lance, gone);
		} catch (err) {
			log.warn({ count: gone.length, err: err instanceof Error ? err.message : String(err) },
				`${who}: deleting vectors of entities removed meanwhile failed -- the start-time reconciliation deletes them`);
		}
	}
	return 0;
}

/**
 * The backfill's write (Epic c2ba6fa6 s2): one batch's vectors in ONE delete
 * and ONE add (an entity with an empty marker may still have a vector from an
 * interrupted write, or two rows a failed reconciliation left: the write leaves
 * exactly one, ISSUE-8c7d75b0), then their markers in one transaction. A Lance
 * write costs ~10-50 ms whatever its size up to a few hundred rows (t11,
 * measured on this repository's table), so a per-entity write would dominate
 * the job. Entities removed or refreshed since they were listed are skipped.
 * Returns how many entities were left without a marker (0 on success).
 */
export async function writeBackfillVectors(entities: readonly Entity[]): Promise<number> {
	assertNoSessionPersistence();
	return writeVectorsThenMarkers(entities.filter(e => e.embedding.length > 0).map(entity => ({ entity, replace: true })), 'backfill');
}

/**
 * The full index's compaction of the entity vector table, under the vector
 * lock: it deletes unverified files, which would corrupt a write in flight
 * from the backfill lane (ISSUE-8c7d75b0 review, Lance optimize docs).
 */
export function compactEntityVectors(): ReturnType<typeof import('./lance/entity-vec.js').compactEntityVecTable> {
	assertNoSessionPersistence();
	return withVectorLock(async () => (await import('./lance/entity-vec.js')).compactEntityVecTable());
}

/** The full index's build of the entity vector index, under the vector lock. */
export function optimizeEntityVectorIndex(): ReturnType<typeof import('./lance/entity-vec.js').optimizeEntityVecIndex> {
	assertNoSessionPersistence();
	return withVectorLock(async () => (await import('./lance/entity-vec.js')).optimizeEntityVecIndex());
}

/** The model a stored marker names: the configured embedding model. */
function activeEmbeddingModel(): string {
	return loadLocalProviderConfig().embeddingModel;
}

/** The row an entity is committed as: its marker empty when a vector write follows. */
function rowAwaitingVector(e: Entity, repoId: number, repoPath: string): EntityRow {
	const row = entityToRow(e, repoId, repoPath);
	return e.embedding !== undefined && e.embedding.length > 0 ? { ...row, embeddingModel: '' } : row;
}

/**
 * Atomic re-index of a single file, kept as the entity-only form of
 * commitFile (Epic c2ba6fa6 s2, lc1: the file commit grew from this
 * function). `repoPath` is the registered repo root; `filePath` the
 * absolute path of the re-parsed file; `parsed` its entities.
 */
export async function reindexFile(
	_db: DbClient,
	repoPath: string,
	filePath: string,
	parsed: Entity[],
): Promise<void> {
	const fileEntity = parsed.find(e => e.kind === 'file' && e.file === filePath);
	await commitFile({ repoPath, filePath, contentHash: fileEntity?.hash ?? '', entities: parsed, relations: [] });
}

const NOTHING_COMMITTED: FileCommitResult = {
	generation: 0, entitiesWritten: 0, entitiesRemoved: 0, relationsStored: 0, relationsPending: 0,
	relationsUnwritable: 0, relationsReturnedToPending: 0, vectorsOutstanding: 0,
};

/**
 * The file commit (Epic c2ba6fa6 sc2): ONE write transaction replaces the
 * file's entity rows and advances the repository's index state, so a reader
 * sees the file's complete old set or its complete new set, and a failure
 * leaves the old set (withWriteTxn aborts a throwing transaction).
 *
 * In the transaction: the file's previous entities are read through
 * entity_by_file (Story s3), each parsed entity is upserted (module stubs
 * ensure-exist under the shared-modules rows; an unchanged row is not
 * rewritten), the outgoing relationships of every previous entity of the
 * file and the file's pending rows are removed, the previous entities no
 * longer parsed are removed with their derived rows (a relationship another
 * entity holds into one of them returns to pending), the file's new
 * relationships are written by Story s1's rule, the generation advances and
 * the file leaves uncommittedFiles. `contentHash: null` removes the file: no entities are
 * written and every previous one is removed. After the commit the removed
 * entities' vectors are deleted and the new vectors written.
 */
export async function commitFile(commit: FileCommit): Promise<FileCommitResult> {
	assertNoSessionPersistence();
	const { repoPath, filePath } = commit;
	try {
		validateRepoPathShape(repoPath);
	} catch (err) {
		log.warn(
			{
				repoPath,
				filePath,
				reason: err instanceof Error ? err.message : String(err),
				stackHint: new Error('commitFile caller stack').stack?.split('\n').slice(2, 7),
			},
			'commitFile: rejected -- invalid repoPath. Caller should be passing the registered repo root, not a derived / empty / system path.',
		);
		return NOTHING_COMMITTED;
	}

	const removing = commit.contentHash === null;
	const { unique, duplicateIds } = dedupeEntitiesById(removing ? [] : commit.entities);
	if (duplicateIds.size > 0) {
		log.warn(
			{ totalDuplicates: duplicateIds.size, kept: unique.length, original: commit.entities.length, file: filePath },
			'commitFile: collapsed duplicate entity ids in input batch (last-wins)',
		);
	}

	// Imported before the transaction: relations.ts imports this module (a cycle).
	const rel = await import('./relations.js');
	const { relationOfWrite } = await import('./file-commit.js');
	const relations = removing ? [] : commit.relations.map(relationOfWrite);
	const resolved = rel.dedupeResolvedRelations(relations.filter(r => r.resolved));
	const unresolved = relations.filter(r => !r.resolved);

	const toLanceDelete: string[] = [];
	const vectorWrites: VectorWrite[] = [];
	let entitiesWritten = 0;
	let entitiesRemoved = 0;
	let generation = 0;
	let returnedToPending = 0;
	let resolvedCounts: import('./relations.js').RelationWriteCounts | undefined;
	let unresolvedCounts: import('./relations.js').RelationWriteCounts | undefined;
	await withWriteTxn(s => {
		// Strict contract: the repository must be registered.
		const repoId = lookupRepoIdInTxn(s, repoPath);
		if (repoId === undefined) {
			throw new UnregisteredRepoError(repoPath);
		}

		// The file's outgoing edges and entities are rewritten: the subsystem pass recomputes it (ISSUE-7d42b5dc).
		recordChangedFileInTxn(s, repoId, toRepoRelative(filePath, repoPath));

		// 1. The file's existing entities, by its entity_by_file key.
		const existing: bigint[] = [];
		for (const u64Buf of s.entityByFile.getValues(encodeEntityByFileKey(repoId, toRepoRelative(filePath, repoPath)))) {
			existing.push(decodeKeyU64(u64Buf as Buffer));
		}

		// 2. Upsert each parsed entity, tracking which u64s we touched.
		const seen = new Set<bigint>();
		for (const e of unique) {
			let u64 = lookupU64ByStringId(s, e.id);
			let isNew = false;
			if (u64 === undefined) {
				u64 = allocateEntityIdInTxn(s);
				s.entityIdByString.put(e.id, u64);
				s.entityStringByU64.put(encodeEntityKey(u64), e.id);
				isNew = true;
			}

			// Module-stub semantics: don't overwrite an existing module
			// (matches the prior DuckDB ON CONFLICT DO NOTHING split).
			const prevBuf = s.entity.get(encodeEntityKey(u64));
			if (prevBuf !== undefined && e.kind === 'module') {
				seen.add(u64);
				continue;
			}

			// Body-write short-circuit: skip the put if everything that
			// would change is identical. We compare contentHash + body
			// (contentHash alone is a hash collision risk but body adds
			// the actual-bytes safety net). An unchanged row whose marker
			// already names this vector's model (or that was not re-embedded)
			// keeps its marker and its vector.
			// A module stub goes to the shared-modules rows, as upsertEntities
			// routes it (HLD sc2), not under this workspace (s2 review).
			const sharedRepoId = sharedModulesRepoIdOf(e);
			const newRow = sharedRepoId === undefined ? rowAwaitingVector(e, repoId, repoPath) : rowAwaitingVector(e, sharedRepoId, e.repo);
			if (prevBuf !== undefined) {
				const prev = decodeEntityRow(prevBuf as Buffer);
				const embedded = e.embedding !== undefined && e.embedding.length > 0;
				if (prev.contentHash === newRow.contentHash
				 && prev.body === newRow.body
				 && prev.startLine === newRow.startLine
				 && prev.endLine === newRow.endLine
				 && prev.signature === newRow.signature
				 && (!embedded || prev.embeddingModel === activeEmbeddingModel())) {
					seen.add(u64);
					continue; // unchanged -- skip write
				}
			}

			const prev = prevBuf !== undefined ? decodeEntityRow(prevBuf as Buffer) : null;
			putEntityRowInTxn(s, u64, prev, newRow);
			entitiesWritten++;
			if (e.embedding !== undefined && e.embedding.length > 0) vectorWrites.push({ entity: e, replace: isNew });
			seen.add(u64);
		}

		// 3. The file's relationships are replaced, not merged: the outgoing
		//    edges of EVERY previous entity of the file and the file's pending rows go.
		for (const u64 of existing) {
			sweepOutgoingEdges(s, u64);
			// The names a file re-exports are written with its EXPORTS edges
			// (Story s1): they go with them, and the cross-file pass writes them again.
			const exportPrefix = encodeEntityKey(u64);
			for (const key of [...s.exportNames.getKeys({ start: exportPrefix, end: prefixSuccessor(exportPrefix) })]) s.exportNames.remove(key);
		}
		rel.deletePendingRowsForFileInTxn(s, repoId, filePath);

		// 4. Remove the previous entities no longer parsed (all of them for a
		//    removal). A relationship another entity holds into one of them is
		//    not lost: it returns to pending, awaiting the removed id, so the
		//    cross-file pass completes it if the entity comes back.
		const toDelete = existing.filter(u64 => !seen.has(u64));
		const removed = new Set(toDelete);
		for (const u64 of toDelete) {
			const sid = lookupStringIdByU64(s, u64);
			if (sid !== undefined) toLanceDelete.push(sid);
			for (const { kind, from } of incomingEdgesInTxn(s, u64)) {
				if (removed.has(from)) continue;
				if (rel.returnEdgeToPendingInTxn(s, from, kind, u64)) returnedToPending++;
			}
		}
		detachDeleteEntitiesInTxn(s, toDelete, { recordFile: false });   // the committed file is recorded once, above
		entitiesRemoved = toDelete.length;

		// 5. The file's new relationships, by Story s1's rule (edge / pending / counted unwritable).
		const now = Date.now();
		resolvedCounts = rel.upsertResolvedRelationsInTxn(s, resolved, now, { recordSources: false });   // the file is recorded above
		unresolvedCounts = rel.upsertUnresolvedRelationsInTxn(s, unresolved, now);

		// 6. The repository's index state, in the same transaction.
		generation = updateIndexStateRowInTxn(s, repoId, row => {
			row.generation++;
			row.uncommittedFiles = row.uncommittedFiles.filter(f => f !== filePath);
		}).generation;
	});
	// After LMDB commits, drop Lance rows for the removed entities.
	// A failure is logged, not thrown: the graph commit stands, a later add of
	// these ids deletes any row first, and the start-time reconciliation deletes
	// the orphans (ISSUE-8c7d75b0).
	if (toLanceDelete.length > 0) {
		try {
			await withVectorLock(async () => deleteVectorsInChunks(await vectorWriter(), toLanceDelete));
		} catch (err) {
			log.warn({ count: toLanceDelete.length, file: filePath, err: err instanceof Error ? err.message : String(err) },
				'commitFile: vector delete for removed entities failed after the graph commit -- left for the start-time reconciliation');
		}
	}
	// The vectors of the written entities, then their markers.
	const vectorsOutstanding = await writeVectorsThenMarkers(vectorWrites, 'commitFile');
	if (resolvedCounts !== undefined) rel.logResolvedWrite(resolvedCounts, resolved.length);
	if (unresolvedCounts !== undefined) rel.logUnresolvedWrite(unresolvedCounts, unresolved.length);
	return {
		...NOTHING_COMMITTED, generation, entitiesWritten, entitiesRemoved,
		relationsStored:            resolvedCounts?.stored ?? 0,
		relationsPending:           (resolvedCounts?.pending ?? 0) + (unresolvedCounts?.pending ?? 0),
		relationsUnwritable:        (resolvedCounts?.unwritable ?? 0) + (unresolvedCounts?.unwritable ?? 0),
		relationsReturnedToPending: returnedToPending,
		vectorsOutstanding,
	};
}

/**
 * Bring the graph and the vector table back into agreement (Epic c2ba6fa6
 * s2), once when the daemon starts, before any job runs: a vector whose
 * entity is not stored is deleted (a removal whose vector delete failed), so
 * a later plain add for a re-allocated id cannot meet it; an entity whose
 * marker says embedded but whose vector is missing (a store written before
 * the marker order changed, or a vector store reset) has its marker cleared,
 * which counts it unembedded for the backfill. An id stored more than once
 * (ISSUE-8c7d75b0) has every row deleted and its entity's marker cleared, so
 * the backfill writes exactly one row for it.
 */
export function reconcileEntityVectors(): Promise<{ orphanVectorsDeleted: number; markersCleared: number; duplicateIdsRepaired: number }> {
	assertNoSessionPersistence();
	return withVectorLock(reconcileEntityVectorsLocked);
}

async function reconcileEntityVectorsLocked(): Promise<{ orphanVectorsDeleted: number; markersCleared: number; duplicateIdsRepaired: number }> {
	const lance = await vectorWriter();
	const rowsPerId = new Map<string, number>();
	for (const id of await (await import('./lance/entity-vec.js')).listEntityVecIds()) rowsPerId.set(id, (rowsPerId.get(id) ?? 0) + 1);
	const storedIds = new Set<string>();
	let markersCleared = 0;
	const duplicated: string[] = [];
	await withWriteTxn(s => {
		markersCleared = 0;
		duplicated.length = 0;
		for (const { key, value } of s.entity.getRange()) {
			const u64 = decodeKeyU64(key as Buffer);
			const id = lookupStringIdByU64(s, u64);
			if (id === undefined) continue;
			storedIds.add(id);
			const rows = rowsPerId.get(id) ?? 0;
			if (rows > 1) duplicated.push(id);
			const row = decodeEntityRow(value as Buffer);
			if (row.embeddingModel === '' || rows === 1) continue;
			putEntityRowInTxn(s, u64, row, { ...row, embeddingModel: '' });
			if (rows === 0) markersCleared++;
		}
	});
	const orphans = [...rowsPerId.keys()].filter(id => !storedIds.has(id));
	await deleteVectorsInChunks(lance, [...orphans, ...duplicated]);
	if (orphans.length > 0 || markersCleared > 0 || duplicated.length > 0) {
		log.info({ orphanVectorsDeleted: orphans.length, markersCleared, duplicateIdsRepaired: duplicated.length }, 'graph and vector table reconciled');
	}
	return { orphanVectorsDeleted: orphans.length, markersCleared, duplicateIdsRepaired: duplicated.length };
}

export async function deleteEntitiesForFile(_db: DbClient, filePath: string): Promise<void> {
	assertNoSessionPersistence();
	const store = await getGraphStore();
	const ids = await collectEntityU64sByFile(store, filePath);
	await detachDeleteEntities(store, ids);
	// Phase 2.10 cascade: also wipe unresolved relations whose `from_file`
	// matches. The cross-file resolver writes these per source-file; when
	// the file is being purged the unresolved queue entries should go
	// too. Imported here (rather than callers chaining the two) so the
	// cascade is centralized.
	await deleteUnresolvedForFileCascade(filePath);
}

// Forward-declare the unresolved cascade helper; the real implementation
// lives in db/relations.ts and is imported lazily to avoid a circular
// import (entities.ts <-> relations.ts).
async function deleteUnresolvedForFileCascade(filePath: string): Promise<void> {
	const { deleteUnresolvedForFile } = await import('./relations.js');
	await deleteUnresolvedForFile(null, filePath);
}

/**
 * Delete specific entities BY ID, cascading their incident edges + name_index +
 * id-maps + Lance vecs (via detachDeleteEntities) — the same core the file/repo
 * deletes use, but keyed by explicit ids. Needed for targeted GC of entities
 * that can't be isolated by file scope (e.g. externalEndpoint nodes all share
 * file=''; S001). Missing/stale ids are skipped (no throw); idempotent.
 */
export async function deleteEntitiesById(_db: DbClient, ids: readonly string[]): Promise<void> {
	assertNoSessionPersistence();
	if (ids.length === 0) return;
	const store = await getGraphStore();
	const u64s: bigint[] = [];
	for (const id of ids) {
		const u64 = await withReadTxn(store, () => lookupU64ByStringId(store, id));
		if (u64 !== undefined) u64s.push(u64);
	}
	await detachDeleteEntities(store, u64s);
}

/**
 * Delete every entity of the repository, with its edges and derived rows.
 * With `returnIncomingToPending`, every relationship ANOTHER repository holds
 * into these entities is first written back, in the same transaction as the
 * delete and with its counts, as a pending row of the holder awaiting the
 * entity's id (Epic c2ba6fa6 s1), so a reindex can restore it.
 * With `carryDocSummaries`, every summary of these entities is copied into
 * doc_summary_carry in that same transaction, for the full index to write
 * back (ISSUE-dced4385); without it the repository's carry rows are deleted.
 */
export async function deleteEntitiesForRepo(
	_db: DbClient,
	repo: string,
	opts?: {
		readonly returnIncomingToPending?: boolean | undefined;
		readonly carryDocSummaries?: boolean | undefined;
	},
): Promise<{ returnedToPending: number; carriedDocSummaries: number }> {
	assertNoSessionPersistence();
	const store = await getGraphStore();
	const repoId = await withReadTxn(store, () => lookupRepoIdInTxn(store, repo));
	if (repoId === undefined) return { returnedToPending: 0, carriedDocSummaries: 0 };
	const ids = await collectEntityU64sByRepo(store, repoId);
	const { returnEdgeToPendingInTxn } = await import('./relations.js');
	let returnedToPending = 0;
	let carriedDocSummaries = 0;
	await detachDeleteEntities(store, ids, s => {
		if (opts?.carryDocSummaries === true) carriedDocSummaries = carryDocSummariesInTxn(s, repoId, ids);
		if (opts?.returnIncomingToPending === true) {
			for (const u64 of ids) {
				for (const { kind, from } of incomingEdgesInTxn(s, u64)) {
					const holder = s.entity.get(encodeEntityKey(from));
					if (holder === undefined || decodeEntityRow(holder as Buffer).repoId === repoId) continue;
					if (returnEdgeToPendingInTxn(s, from, kind, u64)) returnedToPending++;
				}
			}
		}
	}, s => resetSubsystemInputsInTxn(s, repoId));   // after the removals, which record their files
	// Its own transaction: detachDeleteEntities skips its hooks when the repository has no entities left.
	if (ids.length === 0) await withWriteTxn(s => { resetSubsystemInputsInTxn(s, repoId); });
	if (opts?.carryDocSummaries !== true) await withWriteTxn(s => { deleteCarriedDocSummariesInTxn(s, repoId); });
	// Repo-scoped Lance cleanup: belt-and-suspenders alongside the
	// per-id cleanup detachDeleteEntities does. Catches any rows whose
	// LMDB string-id mapping was already missing (e.g. corruption-
	// recovery paths).
	// Under the vector lock, and logged rather than thrown (ISSUE-8c7d75b0
	// review): the graph removal stands, and the start-time reconciliation
	// deletes any vector left behind.
	try {
		await withVectorLock(async () => (await vectorWriter()).deleteEntityVecsForRepo(repo));
	} catch (err) {
		log.warn({ repo, err: err instanceof Error ? err.message : String(err) },
			'deleteEntitiesForRepo: vector delete failed after the graph removal -- left for the start-time reconciliation');
	}
	// Doc-summary repo cascade: repo-scoped drop of every summary row +
	// secondary-index entry. Belt-and-suspenders alongside the per-id
	// cascade `detachDeleteEntitiesInTxn` fires -- catches summary rows
	// whose primary entity_string_by_u64 mapping was lost.
	const { deleteDocSummariesForRepo } = await import('./doc-summaries.js');
	await deleteDocSummariesForRepo(null as unknown as DbClient, repo);

	// Exploration-cache repo cascade: wipe every cached exploration
	// output for this repo. See db/exploration-cache.ts.
	const { deleteCachedExplorationsForRepo } = await import('./exploration-cache.js');
	await deleteCachedExplorationsForRepo(repo);
	return { returnedToPending, carriedDocSummaries };
}

export async function getEntity(_db: DbClient, id: string): Promise<Entity | null> {
	const store = await getGraphStore();
	const u64 = store.entityIdByString.get(id) as bigint | number | undefined;
	if (u64 === undefined) return null;
	const row = readEntityRow(store, u64);
	if (row === null) return null;
	const repoPath = readRepoPath(store, row.repoId);
	return rowToDomainEntity(id, row, repoPath ?? '');
}

export async function getEntitiesByIds(_db: DbClient, ids: readonly string[]): Promise<Entity[]> {
	if (ids.length === 0) return [];
	const store = await getGraphStore();
	const repoCache = new Map<number, string>();
	const out: Entity[] = [];
	for (const id of ids) {
		const u64 = store.entityIdByString.get(id) as bigint | number | undefined;
		if (u64 === undefined) continue;
		const row = readEntityRow(store, u64);
		if (row === null) continue;
		out.push(rowToDomainEntity(id, row, lookupRepoPath(store, row.repoId, repoCache)));
	}
	return out;
}

export async function findEntitiesByName(
	_db: DbClient,
	names: readonly string[],
	opts: {
		readonly kinds?: readonly EntityKind[] | undefined;
		readonly repo?:  string | undefined;
		/**
		 * Multi-repo filter (Phase 6 of plans/skill-closure-scoping.md).
		 * Mutually exclusive with `repo`. Pass the active session's
		 * closure here to scope name lookups to the session repo +
		 * transitive DEPENDS_ON dependents. Empty array = no matches
		 * (explicit empty scope); unknown paths are silently dropped.
		 */
		readonly repos?: readonly string[] | undefined;
		readonly limit?: number | undefined;
	} = {},
): Promise<Entity[]> {
	if (names.length === 0) return [];

	if (opts.repo !== undefined && opts.repos !== undefined) {
		throw new Error(
			'findEntitiesByName: pass either `repo` (single) or `repos` (multi), not both',
		);
	}

	const store = await getGraphStore();
	const limit = opts.limit ?? 50;
	const repoCache = new Map<number, string>();

	// Resolve the repo set we'll probe. `repos` (multi) > `repo`
	// (single) > unscoped (every registered repo). The name_index key
	// is repo-scoped, so we need explicit repoIds either way.
	const repoIds: number[] = [];
	if (opts.repos !== undefined) {
		if (opts.repos.length === 0) return [];   // explicit empty scope
		for (const p of opts.repos) {
			const id = lookupRepoIdInTxn(store, p);
			if (id !== undefined) repoIds.push(id);
		}
		if (repoIds.length === 0) return [];     // none resolved
	} else if (opts.repo !== undefined) {
		const id = lookupRepoIdInTxn(store, opts.repo);
		if (id === undefined) return [];          // unknown repo
		repoIds.push(id);
	} else {
		for (const { key } of store.repo.getRange()) {
			repoIds.push((key as Buffer).readUInt32BE(0));
		}
	}

	// Resolve the kind set. Default = every candidate kind (we still
	// need to probe per-kind because name_index is repo+kind+name).
	const kinds = opts.kinds !== undefined && opts.kinds.length > 0
		? opts.kinds
		: (Object.keys(ENTITY_KIND_BYTE) as EntityKind[]);

	// Probe name_index by exact key per (repoId, kindByte, name). O(K)
	// where K = repos × kinds × names. For typical artifact lookups
	// (one repo, a handful of kinds, a handful of names) this is
	// dozens of point-lookups; the prior linear scan over `entity`
	// scanned every row (millions at scale).
	const out: Entity[] = [];
	for (const repoId of repoIds) {
		for (const k of kinds) {
			const kindByte = ENTITY_KIND_BYTE[k as keyof typeof ENTITY_KIND_BYTE];
			if (kindByte === undefined) continue;
			for (const name of names) {
				// dupsort: getValues returns all u64s sharing this
				// (repo, kind, name) tuple.
				const u64Iter = store.nameIndex.getValues(encodeNameIndexKey(repoId, kindByte, name));
				for (const valBuf of u64Iter) {
					const u64Big = (valBuf as Buffer).readBigUInt64BE(0);
					const rowBuf = store.entity.get(encodeEntityKey(u64Big));
					if (rowBuf === undefined) continue;
					const row = decodeEntityRow(rowBuf as Buffer);
					const stringId = lookupStringIdByU64(store, u64Big);
					if (stringId === undefined) continue;
					out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
					if (out.length >= limit) return out;
				}
			}
		}
	}
	return out;
}

/**
 * List entities filtered by kind. Optional `repo` further scopes to a
 * single repo path. Used by the cross-file resolver to enumerate every
 * `module` stub regardless of repo (module entities live with repo='').
 *
 * Linear scan over the entity sub-DB. For ≤ ~1M entities this is fast
 * (mmap'd cursor); module-stub counts are typically O(100s).
 */
export async function listEntitiesByKind(
	_db: DbClient,
	kind: EntityKind,
	opts: { readonly repo?: string | undefined } = {},
): Promise<Entity[]> {
	const store = await getGraphStore();
	const kindByte = ENTITY_KIND_BYTE[kind as keyof typeof ENTITY_KIND_BYTE];
	if (kindByte === undefined) return [];

	let repoFilter: number | null = null;
	if (opts.repo !== undefined) {
		const id = lookupRepoIdInTxn(store, opts.repo);
		if (id === undefined) return [];
		repoFilter = id;
	}

	const out: Entity[] = [];
	const repoCache = new Map<number, string>();
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		if (ENTITY_KIND_BYTE[row.kind] !== kindByte) continue;
		if (repoFilter !== null && row.repoId !== repoFilter) continue;
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
	}
	return out;
}

/**
 * Variadic version of `listEntitiesByKind`: return every entity
 * whose kind is in the given set. Single entity-table scan; O(N)
 * with the kind check inlined per row. docs/plans/docs-module.md Section
 * 6.4 -- the docs retriever calls this to enumerate every doc /
 * section / config entity in a repo without three separate scans.
 *
 * Unknown kind strings are silently ignored (their kindByte
 * mapping returns undefined so no row will match). Empty kind
 * list returns [].
 */
export async function listEntitiesByKinds(
	_db: DbClient,
	kinds: readonly EntityKind[],
	opts: { readonly repo?: string | undefined } = {},
): Promise<Entity[]> {
	if (kinds.length === 0) return [];
	const store = await getGraphStore();
	const kindBytes = new Set<number>();
	for (const k of kinds) {
		const b = ENTITY_KIND_BYTE[k as keyof typeof ENTITY_KIND_BYTE];
		if (b !== undefined) kindBytes.add(b);
	}
	if (kindBytes.size === 0) return [];

	let repoFilter: number | null = null;
	if (opts.repo !== undefined) {
		const id = lookupRepoIdInTxn(store, opts.repo);
		if (id === undefined) return [];
		repoFilter = id;
	}

	const out: Entity[] = [];
	const repoCache = new Map<number, string>();
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		const rowKindByte = ENTITY_KIND_BYTE[row.kind];
		if (rowKindByte === undefined || !kindBytes.has(rowKindByte)) continue;
		if (repoFilter !== null && row.repoId !== repoFilter) continue;
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
	}
	return out;
}

/**
 * Whether `repo` holds any stored entity, without building its entity
 * list (Epic c2ba6fa6 Story s3, ac4): a limit-1 range on entity_by_file
 * by repoId-prefix. An unregistered repo answers false.
 */
export async function repoHasAnyEntity(_db: DbClient, repo: string): Promise<boolean> {
	const store = await getGraphStore();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return false;
	const prefix = encodeEntityByFilePrefix(repoId);
	for (const _ of store.entityByFile.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
		return true;
	}
	return false;
}

/** `opts.limit` stops the range read early (an existence check needs one row); v2's bounded-readiness callers rely on it. */
export async function listEntitiesForRepo(_db: DbClient, repo: string, opts: { readonly limit?: number | undefined } = {}): Promise<Entity[]> {
	const store = await getGraphStore();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return [];
	const out: Entity[] = [];
	const repoCache = new Map<number, string>([[repoId, repo]]);
	// Epic c2ba6fa6 Story s3: a repoId-prefix range over entity_by_file,
	// not a full store.entity scan -- cost follows this repo's own rows.
	const prefix = encodeEntityByFilePrefix(repoId);
	for (const { value } of store.entityByFile.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
		const u64 = decodeKeyU64(value as Buffer);
		const row = readEntityRow(store, u64);
		if (row === null) continue;
		const stringId = lookupStringIdByU64(store, u64);
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
		if (opts.limit !== undefined && out.length >= opts.limit) break;
	}
	return out;
}

/**
 * The files the store holds for one repo: each non-empty absolute file
 * path mapped to the string ids of THIS repo's entities in it. One pass
 * over the entity table, no entity construction. Entities with an empty
 * file path (external endpoints) belong to no file and are left out.
 * An unregistered repo yields an empty map.
 */
export async function listEntityFilesForRepo(
	_db: DbClient,
	repo: string,
): Promise<Map<string, string[]>> {
	const store = await getGraphStore();
	const out = new Map<string, string[]>();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return out;
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		if (row.repoId !== repoId) continue;
		if (row.filePath === '') continue;
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
		if (stringId === undefined) continue;
		const file = toAbsolutePath(row.filePath, repo);
		const ids = out.get(file);
		if (ids === undefined) out.set(file, [stringId]);
		else ids.push(stringId);
	}
	return out;
}

export async function findEntitiesByFile(_db: DbClient, file: string): Promise<Entity[]> {
	const store = await getGraphStore();
	// Epic c2ba6fa6 Story s3: resolve the owning repo (longest matching
	// root), then an exact (repoId, relativeFilePath) key lookup on
	// entity_by_file -- not a full store.entity scan with per-row path
	// recomputation. `file` from callers is absolute; rows store the
	// repo-relative `filePath`.
	const repoId = resolveOwningRepoIdInTxn(store, file);
	if (repoId === undefined) return [];
	const repoPath = readRepoPath(store, repoId) ?? '';
	const relativeFilePath = toRepoRelative(file, repoPath);
	const out: Entity[] = [];
	const key = encodeEntityByFileKey(repoId, relativeFilePath);
	for (const u64Buf of store.entityByFile.getValues(key)) {
		const u64 = decodeKeyU64(u64Buf as Buffer);
		const row = readEntityRow(store, u64);
		if (row === null) continue;
		const stringId = lookupStringIdByU64(store, u64);
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, repoPath));
	}
	return out;
}

export async function listUnembeddedEntities(_db: DbClient, repo: string): Promise<Entity[]> {
	const store = await getGraphStore();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return [];
	const out: Entity[] = [];
	const repoCache = new Map<number, string>([[repoId, repo]]);
	// The repository's rows through entity_by_file (Story s3), not the whole
	// entity table; only the rows the embed step selects (a non-empty body)
	// whose marker is empty -- the ones IndexState counts as unembedded (s2).
	const prefix = encodeEntityByFilePrefix(repoId);
	for (const { value } of store.entityByFile.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
		const u64 = decodeKeyU64(value as Buffer);
		const row = readEntityRow(store, u64);
		if (row === null || row.body === '' || row.embeddingModel !== '') continue;
		const stringId = lookupStringIdByU64(store, u64);
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
	}
	return out;
}

/**
 * Translate a public-API string entity ID (SHA-32 hex) to its internal
 * u64. Returns `undefined` if the entity isn't known. Lets graph-layer
 * callers cross the string↔u64 boundary without reaching into the
 * sub-DBs directly.
 */
export async function entityU64ForId(id: string): Promise<bigint | undefined> {
	const store = await getGraphStore();
	const v = store.entityIdByString.get(id) as bigint | number | undefined;
	if (v === undefined) return undefined;
	return toBigInt(v);
}

/**
 * Reverse of `entityU64ForId`. O(1) via the maintained
 * `entity_string_by_u64` sub-DB (schema_version 2). On v1 envs the
 * v1→v2 migration backfills the index before this is reachable.
 */
export async function entityIdByU64(u64: bigint): Promise<string | undefined> {
	const store = await getGraphStore();
	const v = store.entityStringByU64.get(encodeEntityKey(u64));
	return typeof v === 'string' ? v : undefined;
}

/**
 * Bulk reverse-lookup: u64 → string id for many ids at once. O(K)
 * via the `entity_string_by_u64` sub-DB (one point-lookup per id);
 * pre-migration this required an O(N) cursor scan over the forward
 * sub-DB.
 */
export async function entityIdsByU64s(u64s: readonly bigint[]): Promise<Map<bigint, string>> {
	const out = new Map<bigint, string>();
	if (u64s.length === 0) return out;
	const store = await getGraphStore();
	for (const u of u64s) {
		const v = store.entityStringByU64.get(encodeEntityKey(u));
		if (typeof v === 'string') out.set(u, v);
	}
	return out;
}

export async function updateEmbedding(
	_db: DbClient,
	id: string,
	embedding: number[],
	embeddingModel: string,
): Promise<void> {
	assertNoSessionPersistence();
	if (embedding.length === 0) return;
	// The vector first, the marker second (Epic c2ba6fa6 s2): a marker is set
	// only for a vector that is stored. One entity's write, for an entity that
	// may still have a vector from an interrupted earlier write, so an upsert,
	// never a plain add; under the vector lock like every vector change.
	await withVectorLock(async () => {
	const store = await getGraphStore();
	const u64 = lookupU64ByStringId(store, id);
	if (u64 === undefined) return; // no-op (matches prior DuckDB UPDATE behaviour)
	const row = readEntityRowSync(store, u64);
	if (row === null) return;
	const lance = await vectorWriter();
	await lance.writeEntityEmbedding({
		id,
		embedding: new Float32Array(embedding),
		repo: readRepoPath(store, row.repoId) ?? '',
		kind: row.kind,
		artifact: row.artifact,
	});
	await withWriteTxn(s => {
		const at = lookupU64ByStringId(s, id);
		if (at === undefined) return;
		const current = readEntityRowSync(s, at);
		if (current === null) return;
		putEntityRowInTxn(s, at, current, { ...current, embeddingModel });
	});
	});
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const lookupU64ByStringId = (s: GraphStore, id: string): bigint | undefined => {
	const v = s.entityIdByString.get(id) as bigint | number | undefined;
	if (v === undefined) return undefined;
	return toBigInt(v);
};

const lookupStringIdByU64 = (s: GraphStore, u64: bigint): string | undefined => {
	// O(1) via the maintained reverse index `entity_string_by_u64`
	// (populated on every entity write since schema_version 2).
	// On v1 envs the v1→v2 migration backfills it before this code
	// path runs, so a missing entry is always real-deletion, never
	// a missing-backfill bug.
	const v = s.entityStringByU64.get(encodeEntityKey(u64));
	return typeof v === 'string' ? v : undefined;
};

// GUARD-TEST-BOUNDARY: entity-row write path begins. The guard test in
// entities-lmdb.test.ts (Epic c2ba6fa6 Story s3, t4) strips everything
// between this marker and its "ends" counterpart before scanning this
// file for a raw entity.put/entity.remove/nameIndex.put/nameIndex.remove/
// entityByFile.put/entityByFile.remove call. Only `putEntityRowInTxn` and
// `removeEntityRowInTxn` (and their own private helpers) may write these
// tables directly; every other site in this file must call one of them.

/**
 * Reconcile `name_index` for an entity write:
 *   - drop the prior (repoId, kind, name) entry if any of those
 *     identity fields changed (rename / move / kind change)
 *   - write the new (repoId, kind, name) -> u64 entry
 *
 * Idempotent for unchanged rows (the put just rewrites the same
 * value). Called by every code path that does `entity.put`.
 */
function rewireNameIndexInTxn(
	s: GraphStore,
	u64: bigint,
	prev: EntityRow | null,
	next: EntityRow,
): void {
	const nextKey = encodeNameIndexKey(next.repoId, ENTITY_KIND_BYTE[next.kind], next.name);
	const u64Buf  = encodeEntityKey(u64);
	if (prev !== null) {
		const prevKey = encodeNameIndexKey(prev.repoId, ENTITY_KIND_BYTE[prev.kind], prev.name);
		if (!prevKey.equals(nextKey)) {
			// Drop only THIS entity's u64 from the prior dup set; other
			// entities sharing the same (repo, kind, name) keep their
			// entries.
			s.nameIndex.remove(prevKey, u64Buf);
		}
	}
	// dupsort put: idempotent for (key, value) pairs already present;
	// adds a new value to the dup set if not.
	s.nameIndex.put(nextKey, u64Buf);
}

/**
 * Reconcile `entity_by_file` for an entity write (Epic c2ba6fa6 Story s3):
 * drop the prior (repoId, filePath) entry if either changed, then write
 * the new one. Mirrors `rewireNameIndexInTxn`'s shape exactly. An entity
 * with an empty filePath (e.g. an external-service endpoint) still gets
 * a (repoId, '') entry -- that key is part of the repoId-prefix range
 * `listEntitiesForRepo` scans, so such entities stay included there,
 * while no absolute file path ever resolves to '' for `findEntitiesByFile`.
 */
function rewireEntityByFileInTxn(
	s: GraphStore,
	u64: bigint,
	prev: EntityRow | null,
	next: EntityRow,
): void {
	const nextKey = encodeEntityByFileKey(next.repoId, next.filePath);
	const u64Buf  = encodeEntityKey(u64);
	if (prev !== null) {
		const prevKey = encodeEntityByFileKey(prev.repoId, prev.filePath);
		if (!prevKey.equals(nextKey)) {
			s.entityByFile.remove(prevKey, u64Buf);
		}
	}
	s.entityByFile.put(nextKey, u64Buf);
}

/**
 * Write (create or replace) an entity row, keeping `entity`, `nameIndex`
 * and `entityByFile` in exact step inside the caller's transaction. The
 * SOLE entry point for an entity-row write (Epic c2ba6fa6 Story s3) --
 * every call site that used to write `store.entity`/`nameIndex` raw now
 * calls this instead, closing the gap where some sites wrote nameIndex
 * inline rather than through `rewireNameIndexInTxn`.
 */
export function putEntityRowInTxn(
	s: GraphStore,
	u64: bigint,
	prev: EntityRow | null,
	next: EntityRow,
): void {
	s.entity.put(encodeEntityKey(u64), encodeEntityRow(next));
	rewireNameIndexInTxn(s, u64, prev, next);
	rewireEntityByFileInTxn(s, u64, prev, next);
	trackUnembeddedInTxn(s, prev, next);
}

/**
 * Remove an entity row, dropping its `nameIndex` and `entityByFile`
 * entries along with it. The other half of the single write path every
 * entity-row mutation now goes through (Epic c2ba6fa6 Story s3).
 */
export function removeEntityRowInTxn(s: GraphStore, u64: bigint, row: EntityRow, recordFile = true): void {
	s.nameIndex.remove(
		encodeNameIndexKey(row.repoId, ENTITY_KIND_BYTE[row.kind], row.name),
		encodeEntityKey(u64),
	);
	s.entityByFile.remove(encodeEntityByFileKey(row.repoId, row.filePath), encodeEntityKey(u64));
	s.entity.remove(encodeEntityKey(u64));
	trackUnembeddedInTxn(s, row, null);
	// The file lost an entity: the subsystem pass recomputes it (ISSUE-7d42b5dc), on every removal path.
	if (recordFile) recordChangedFileInTxn(s, row.repoId, row.filePath);
}

// GUARD-TEST-BOUNDARY: entity-row write path ends.

const readEntityRow = (s: GraphStore, u64: bigint | number): EntityRow | null => {
	const buf = s.entity.get(encodeEntityKey(toBigInt(u64)));
	if (buf === undefined) return null;
	return decodeEntityRow(buf as Buffer);
};

const readEntityRowSync = readEntityRow;

const lookupRepoPath = (
	s: GraphStore,
	repoId: number,
	cache: Map<number, string>,
): string => {
	const cached = cache.get(repoId);
	if (cached !== undefined) return cached;
	const path = readRepoPath(s, repoId);
	const out = path ?? '';
	cache.set(repoId, out);
	return out;
};

const readRepoPath = (s: GraphStore, repoId: number): string | undefined => {
	const buf = s.repo.get(encodeRepoKey(repoId));
	if (buf === undefined) return undefined;
	return decodeRepoRow(buf as Buffer).path;
};

/**
 * The registered repo owning an absolute file path, by the longest
 * (most specific) root that contains it at a path-segment boundary
 * (Epic c2ba6fa6 Story s3). `src/db` cannot import
 * `src/analyze/context/scope.ts`'s `longestPrefixRepo` (layering), so
 * this independently re-implements the identical boundary-safe
 * comparison: a plain string-prefix test would wrongly match
 * `/x/repo2/a.ts` against root `/x/repo`.
 */
function resolveOwningRepoIdInTxn(s: GraphStore, file: string): number | undefined {
	let bestId: number | undefined;
	let bestPathLen = -1;
	for (const { key, value } of s.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		const contains = file === row.path || file.startsWith(`${row.path}/`);
		if (!contains) continue;
		if (row.path.length > bestPathLen) {
			bestPathLen = row.path.length;
			bestId = decodeRepoKey(key as Buffer);
		}
	}
	return bestId;
}

const decodeKeyU64 = (buf: Buffer): bigint => buf.readBigUInt64BE(0);

const encodeRepoKey = (id: number): Buffer => {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(id, 0);
	return b;
};

async function collectEntityU64sByFile(store: GraphStore, file: string): Promise<bigint[]> {
	return collectEntityU64sByFileInTxn(store, file);
}

function collectEntityU64sByFileInTxn(store: GraphStore, file: string): bigint[] {
	const out: bigint[] = [];
	const repoCache = new Map<number, string>();
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		const repoPath = lookupRepoPath(store, row.repoId, repoCache);
		if (toAbsolutePath(row.filePath, repoPath) === file) {
			out.push(decodeKeyU64(key as Buffer));
		}
	}
	return out;
}

async function collectEntityU64sByRepo(store: GraphStore, repoId: number): Promise<bigint[]> {
	const out: bigint[] = [];
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		if (row.repoId !== repoId) continue;
		out.push(decodeKeyU64(key as Buffer));
	}
	return out;
}

/**
 * Detach-delete pattern: incident edges first, then the entity row +
 * its string-id index entry. Wrapped in one txn so partial failure
 * never leaves dangling edges or orphaned index entries.
 *
 * Phase 2.10 will hoist this into a shared cascade helper using the
 * Phase 2.3 edge API; for Phase 2.2 we do raw key-range scans on the
 * out_edge / in_edge sub-DBs.
 */
async function detachDeleteEntities(store: GraphStore, u64s: readonly bigint[], before?: (s: GraphStore) => void, after?: (s: GraphStore) => void): Promise<void> {
	if (u64s.length === 0) return;
	// Capture string IDs BEFORE the delete (we lose the entity_id_by_string
	// mapping inside the txn). After LMDB commits, drop the corresponding
	// Lance rows.
	const stringIds: string[] = [];
	for (const u64 of u64s) {
		const sid = lookupStringIdByU64(store, u64);
		if (sid !== undefined) stringIds.push(sid);
	}
	await withWriteTxn(s => { before?.(s); detachDeleteEntitiesInTxn(s, u64s); after?.(s); });
	// As commitFile's removal (ISSUE-8c7d75b0): chunked, under the vector lock,
	// and a failure is logged, not thrown -- the graph change stands, a later add
	// of these ids deletes any row first, and the start-time reconciliation
	// deletes the orphans.
	if (stringIds.length > 0) {
		try {
			await withVectorLock(async () => deleteVectorsInChunks(await vectorWriter(), stringIds));
		} catch (err) {
			log.warn({ count: stringIds.length, err: err instanceof Error ? err.message : String(err) },
				'detachDeleteEntities: vector delete failed after the graph commit -- left for the start-time reconciliation');
		}
	}
}

/**
 * Sync, in-txn variant of `detachDeleteEntities`. Used by the bulk
 * `reindexFile` helper (Phase 2.9) so the snapshot + upsert + tombstone
 * pass commits as a single LMDB transaction.
 */
function detachDeleteEntitiesInTxn(s: GraphStore, u64s: readonly bigint[], opts: { readonly recordFile?: boolean | undefined } = {}): void {
	if (u64s.length === 0) return;
	for (const u64 of u64s) {
		// Forward direction: edges where this entity is the `from`.
		// Walk out_edge by prefix(u64), removing both the out_edge
		// entry and the matching in_edge mirror at (to, kind, u64).
		sweepOutgoingEdges(s, u64);
		// Reverse direction: edges where this entity is the `to`.
		// Walk in_edge by prefix(u64), removing both the in_edge
		// entry and the matching out_edge mirror at (from, kind, u64).
		sweepIncomingEdges(s, u64);
		// Doc-summariser cascade (docs/plans/docs-module.md Section 8):
		// drop any DocSummary row + its secondary index entry keyed
		// on this u64. Cheap no-op when the entity isn't a doc.
		deleteDocSummaryInTxn(s, u64);
		// The names this entity (a file) re-exports (Epic c2ba6fa6 s1): every
		// export_names entry keyed by its u64, before the u64 mapping goes.
		const exportPrefix = encodeEntityKey(u64);
		for (const key of [...s.exportNames.getKeys({ start: exportPrefix, end: prefixSuccessor(exportPrefix) })]) {
			s.exportNames.remove(key);
		}
		// Drop derived indices BEFORE the row itself so we have the
		// row's (repoId, kind, name, filePath) available for the
		// name_index / entity_by_file lookups. Reverse-lookup via
		// entityStringByU64 is O(1).
		const stringId = s.entityStringByU64.get(encodeEntityKey(u64)) as string | undefined;
		const rowBuf = s.entity.get(encodeEntityKey(u64));
		if (rowBuf !== undefined) {
			removeEntityRowInTxn(s, u64, decodeEntityRow(rowBuf as Buffer), opts.recordFile);
		}
		if (stringId !== undefined) {
			s.entityIdByString.remove(stringId);
			s.entityStringByU64.remove(encodeEntityKey(u64));
		}
	}
}

function sweepOutgoingEdges(s: GraphStore, u64: bigint): void {
	const prefix = encodeOutEdgePrefix(u64);
	const succ = prefixSuccessor(prefix);
	const collected: Array<{ kind: number; to: bigint }> = [];
	for (const { key } of s.outEdge.getRange({ start: prefix, end: succ })) {
		const k = key as Buffer;
		collected.push({ kind: k.readUInt8(8), to: k.readBigUInt64BE(9) });
	}
	for (const { kind, to } of collected) {
		const outKey = Buffer.alloc(17);
		outKey.writeBigUInt64BE(u64, 0);
		outKey.writeUInt8(kind, 8);
		outKey.writeBigUInt64BE(to, 9);
		s.outEdge.remove(outKey);

		const inKey = Buffer.alloc(17);
		inKey.writeBigUInt64BE(to, 0);
		inKey.writeUInt8(kind, 8);
		inKey.writeBigUInt64BE(u64, 9);
		s.inEdge.remove(inKey);
	}
}

/** The (kind byte, source u64) of every edge into `u64`. */
function incomingEdgesInTxn(s: GraphStore, u64: bigint): Array<{ kind: number; from: bigint }> {
	const prefix = encodeInEdgePrefix(u64);
	const collected: Array<{ kind: number; from: bigint }> = [];
	for (const { key } of s.inEdge.getRange({ start: prefix, end: prefixSuccessor(prefix) })) {
		const k = key as Buffer;
		collected.push({ kind: k.readUInt8(8), from: k.readBigUInt64BE(9) });
	}
	return collected;
}

function sweepIncomingEdges(s: GraphStore, u64: bigint): void {
	for (const { kind, from } of incomingEdgesInTxn(s, u64)) {
		// The holder's file loses an outgoing edge (ISSUE-7d42b5dc).
		if (isGroupingKindByte(kind)) recordChangedEntityFileInTxn(s, from);
		const inKey = Buffer.alloc(17);
		inKey.writeBigUInt64BE(u64, 0);
		inKey.writeUInt8(kind, 8);
		inKey.writeBigUInt64BE(from, 9);
		s.inEdge.remove(inKey);

		const outKey = Buffer.alloc(17);
		outKey.writeBigUInt64BE(from, 0);
		outKey.writeUInt8(kind, 8);
		outKey.writeBigUInt64BE(u64, 9);
		s.outEdge.remove(outKey);
	}
}

function dedupeEntitiesById(entities: readonly Entity[]): {
	unique: Entity[];
	duplicateIds: Map<string, number>;
} {
	const map = new Map<string, Entity>();
	const dupCounts = new Map<string, number>();
	for (const e of entities) {
		if (map.has(e.id)) dupCounts.set(e.id, (dupCounts.get(e.id) ?? 1) + 1);
		map.set(e.id, e);
	}
	return { unique: [...map.values()], duplicateIds: dupCounts };
}

// ---------------------------------------------------------------------------
// Path / timestamp helpers
// ---------------------------------------------------------------------------

function toRepoRelative(absoluteOrRelative: string, repoRoot: string): string {
	if (repoRoot === '' || !absoluteOrRelative.startsWith(repoRoot)) {
		// Already relative, or repo root unknown -- keep as-is
		return absoluteOrRelative;
	}
	const rel = relative(repoRoot, absoluteOrRelative);
	return rel === '' ? '.' : rel;
}

function toAbsolutePath(filePath: string, repoRoot: string): string {
	if (filePath.startsWith('/') || repoRoot === '') return filePath;
	return repoRoot.endsWith('/') ? `${repoRoot}${filePath}` : `${repoRoot}/${filePath}`;
}

function parseTimestamp(s: string | undefined): number {
	if (s === undefined || s === '') return 0;
	const n = Date.parse(s);
	return Number.isFinite(n) ? n : 0;
}

function formatTimestamp(ms: number): string {
	if (ms === 0) return '';
	return new Date(ms).toISOString();
}

function toBigInt(v: bigint | number): bigint {
	return typeof v === 'bigint' ? v : BigInt(v);
}

// withReadTxn is a thin wrapper for read-only call sites that want to
// preserve a snapshot. lmdb-js allows direct .get / .getRange calls
// outside any explicit txn (each acquires its own read snapshot per
// call), so for the get-then-act pattern we accept the slight
// mismatched-snapshot risk as acceptable for v1.
async function withReadTxn<T>(_store: GraphStore, fn: () => T | Promise<T>): Promise<T> {
	return fn();
}

