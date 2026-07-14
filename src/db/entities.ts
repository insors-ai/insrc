/**
 * LMDB-backed entity persistence. Phase 2.2 of
 * plans/storage-migration-lmdb-lance.md.
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

import type { Entity, EntityKind, Language } from '../shared/types.js';
import { getLogger } from '../shared/logger.js';
import {
	getGraphStore,
	withWriteTxn,
	type GraphStore,
} from './graph/store.js';
import { allocateEntityIdInTxn } from './graph/ids.js';
import {
	encodeEntityKey,
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
import { deleteDocSummaryInTxn } from './doc-summaries.js';

const log = getLogger('db.entities');

/** Vestigial `DbClient` param shape, kept for caller back-compat. */
type DbClient = unknown;

// ---------------------------------------------------------------------------
// Domain <-> row mapping
// ---------------------------------------------------------------------------

function entityToRow(e: Entity, repoId: number, repoRoot: string): EntityRow {
	return {
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

export async function upsertEntities(_db: DbClient, entities: Entity[]): Promise<void> {
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
	type LanceWrite = { entity: Entity; firstEmbed: boolean };
	const lanceWrites: LanceWrite[] = [];

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
			if (e.kind === 'module' && e.repo === '') {
				const namespace = SHARED_MODULES_NAMESPACE_BY_LANG[e.language];
				if (namespace === undefined) {
					throw new UnregisteredRepoError(
						`module entity '${e.name}' (language=${e.language}) has no shared-modules namespace mapping`,
					);
				}
				return SHARED_MODULES_REPO_ID[namespace];
			}

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
				const row = entityToRow(e, repoId, e.repo);
				const prevBuf = s.entity.get(encodeEntityKey(existingU64));
				const prev = prevBuf !== undefined ? decodeEntityRow(prevBuf as Buffer) : null;
				s.entity.put(encodeEntityKey(existingU64), encodeEntityRow(row));
				// Reconcile name_index: drop the prior (repo, kind, name)
				// entry if any of those identity fields changed, then
				// rewrite the new one. Idempotent for unchanged rows.
				rewireNameIndexInTxn(s, existingU64, prev, row);
				if (e.embedding !== undefined && e.embedding.length > 0) {
					lanceWrites.push({
						entity: e,
						firstEmbed: prev === null || prev.embeddingModel === '',
					});
				}
				continue;
			}

			// New entity: allocate u64, write the row + index entries
			const u64 = allocateEntityIdInTxn(s);
			const row = entityToRow(e, repoId, e.repo);
			s.entity.put(encodeEntityKey(u64), encodeEntityRow(row));
			s.entityIdByString.put(e.id, u64);
			s.entityStringByU64.put(encodeEntityKey(u64), e.id);
			// dupsort put: multiple entities can share (repo, kind, name)
			s.nameIndex.put(encodeNameIndexKey(repoId, ENTITY_KIND_BYTE[row.kind], row.name), encodeEntityKey(u64));
			if (e.embedding !== undefined && e.embedding.length > 0) {
				lanceWrites.push({ entity: e, firstEmbed: true });
			}
		}
	});

	// Push vectors to Lance after the LMDB commit. Two paths:
	//   - firstEmbed:  use addEntityEmbeddings (raw .add(), no JOIN).
	//                  Indexer's bulk first-index hits this path for
	//                  every entity -- O(N) total instead of the
	//                  O(N²) cost of mergeInsert at scale.
	//   - re-embed:    use writeEntityEmbeddings (mergeInsert) so the
	//                  prior Lance row is replaced.
	// Lance failure is non-fatal: the LMDB row's `embeddingModel`
	// already reflects the intent; a `daemon reembed` (Phase 9.x or
	// manual) replays the missing vectors.
	if (lanceWrites.length > 0) {
		try {
			const lance = await import('./lance/entity-vec.js');
			type Row = Parameters<typeof lance.addEntityEmbeddings>[0][number];
			const adds:    Row[] = [];
			const upserts: Row[] = [];
			for (const w of lanceWrites) {
				const row: Row = {
					id:        w.entity.id,
					embedding: new Float32Array(w.entity.embedding),
					repo:      w.entity.repo,
					kind:      w.entity.kind as string,
					artifact:  w.entity.artifact ?? false,
				};
				if (w.firstEmbed) adds.push(row); else upserts.push(row);
			}
			if (adds.length > 0)    await lance.addEntityEmbeddings(adds);
			if (upserts.length > 0) await lance.writeEntityEmbeddings(upserts);
		} catch (err) {
			log.warn(
				{ count: lanceWrites.length, err: err instanceof Error ? err.message : String(err) },
				'upsertEntities: Lance write failed after LMDB commit -- vectors not persisted; rerun reembed to backfill',
			);
		}
	}
}

/**
 * Atomic re-index of a single file. Phase 2.9 of the LMDB+Lance
 * migration: snapshot the file's existing entities, upsert each
 * parsed entity (allocating new u64 IDs as needed), then tombstone
 * any entities that disappeared from the parse. All in one LMDB
 * write transaction so readers never see a half-state.
 *
 * Compared to calling `deleteEntitiesForFile` followed by
 * `upsertEntities`:
 *   - Atomic: no window where rows are deleted but new ones not yet
 *     written.
 *   - Idempotent: parsing the same file twice produces the same row
 *     set (same SHA → same u64 → same EntityRow).
 *   - Body-write short-circuit: rows whose `contentHash` matches the
 *     prior parse are skipped (typical re-index hits this for
 *     unchanged entities).
 *   - Cascade: tombstoned entities take their incident edges with
 *     them via the same prefix-scan logic used by
 *     `deleteEntitiesForFile`.
 *
 * `repoPath` is the repo root path (e.g. `/repo/foo`); `filePath` is
 * the absolute path of the file being re-parsed (matches the prior
 * call shape used by the indexer). Caller passes the parsed entities
 * exactly as returned by the parser (`Entity[]` with string SHA ids).
 *
 * Auto-allocates a u32 repoId for `repoPath` if the repo isn't
 * registered yet (matches the existing `upsertEntities` behaviour).
 */
export async function reindexFile(
	_db: DbClient,
	repoPath: string,
	filePath: string,
	parsed: Entity[],
): Promise<void> {
	// Phase 2.10 / 2026-05-07 guardrail: reject reindex calls with
	// invalid repo paths. Same intent as the upsertEntities check --
	// don't let an empty / banned-root repoPath silently auto-allocate
	// a phantom Repo registry row through `allocateRepoIdInTxn` below.
	// Unlike upsertEntities, reindexFile has no kind-module fallback
	// path (it's whole-file replacement); empty repoPath here is
	// always a bug.
	try {
		validateRepoPathShape(repoPath);
	} catch (err) {
		log.warn(
			{
				repoPath,
				filePath,
				reason: err instanceof Error ? err.message : String(err),
				stackHint: new Error('reindexFile caller stack').stack?.split('\n').slice(2, 7),
			},
			'reindexFile: rejected -- invalid repoPath. Caller should be passing the registered repo root, not a derived / empty / system path.',
		);
		return;
	}

	// Dedupe by SHA id (same protective pass `upsertEntities` does)
	const { unique, duplicateIds } = dedupeEntitiesById(parsed);
	if (duplicateIds.size > 0) {
		log.warn(
			{ totalDuplicates: duplicateIds.size, kept: unique.length, original: parsed.length, file: filePath },
			'reindexFile: collapsed duplicate entity ids in input batch (last-wins)',
		);
	}

	const toLanceDelete: string[] = [];
	type LanceWrite = { entity: Entity; firstEmbed: boolean };
	const lanceWrites: LanceWrite[] = [];
	await withWriteTxn(s => {
		// Phase 5.x strict-contract: repo must be pre-registered.
		// reindexFile is only ever called for files inside a known
		// workspace, so the lookup should always succeed; throw
		// otherwise to surface the programming error loudly.
		const repoId = lookupRepoIdInTxn(s, repoPath);
		if (repoId === undefined) {
			throw new UnregisteredRepoError(repoPath);
		}

		// 1. Snapshot existing entities for this (repoId, filePath).
		//    Scan the entity sub-DB; cheap at typical scale (a few
		//    dozen entities per file).
		const existing: bigint[] = [];
		for (const { key, value } of s.entity.getRange()) {
			const row = decodeEntityRow(value as Buffer);
			if (row.repoId !== repoId) continue;
			if (toAbsolutePath(row.filePath, repoPath) !== filePath) continue;
			existing.push(decodeKeyU64(key as Buffer));
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
			// the actual-bytes safety net).
			const newRow = entityToRow(e, repoId, repoPath);
			if (prevBuf !== undefined) {
				const prev = decodeEntityRow(prevBuf as Buffer);
				if (prev.contentHash === newRow.contentHash
				 && prev.body === newRow.body
				 && prev.startLine === newRow.startLine
				 && prev.endLine === newRow.endLine
				 && prev.signature === newRow.signature
				 && prev.embeddingModel === newRow.embeddingModel) {
					seen.add(u64);
					continue; // unchanged -- skip write
				}
			}

			const prev = prevBuf !== undefined ? decodeEntityRow(prevBuf as Buffer) : null;
			s.entity.put(encodeEntityKey(u64), encodeEntityRow(newRow));
			rewireNameIndexInTxn(s, u64, prev, newRow);
			if (e.embedding !== undefined && e.embedding.length > 0) {
				lanceWrites.push({
					entity: e,
					firstEmbed: isNew || prev === null || prev.embeddingModel === '',
				});
			}
			seen.add(u64);
		}

		// 3. Tombstone unseen (= deleted from the file).
		for (const u64 of existing) {
			if (!seen.has(u64)) {
				const sid = lookupStringIdByU64(s, u64);
				if (sid !== undefined) toLanceDelete.push(sid);
			}
		}
		const toDelete: bigint[] = [];
		for (const u64 of existing) {
			if (!seen.has(u64)) toDelete.push(u64);
		}
		detachDeleteEntitiesInTxn(s, toDelete);
	});
	// After LMDB commits, drop Lance rows for the tombstoned entities.
	if (toLanceDelete.length > 0) {
		const { deleteEntityVecsByIds } = await import('./lance/entity-vec.js');
		await deleteEntityVecsByIds(toLanceDelete);
	}
	// Push vectors for newly-parsed / re-embedded entities. Same
	// dispatch as upsertEntities -- addEntityEmbeddings for first-
	// embed (no JOIN), writeEntityEmbeddings for re-embed (mergeInsert).
	if (lanceWrites.length > 0) {
		try {
			const lance = await import('./lance/entity-vec.js');
			type Row = Parameters<typeof lance.addEntityEmbeddings>[0][number];
			const adds:    Row[] = [];
			const upserts: Row[] = [];
			for (const w of lanceWrites) {
				const row: Row = {
					id:        w.entity.id,
					embedding: new Float32Array(w.entity.embedding),
					repo:      w.entity.repo,
					kind:      w.entity.kind as string,
					artifact:  w.entity.artifact ?? false,
				};
				if (w.firstEmbed) adds.push(row); else upserts.push(row);
			}
			if (adds.length > 0)    await lance.addEntityEmbeddings(adds);
			if (upserts.length > 0) await lance.writeEntityEmbeddings(upserts);
		} catch (err) {
			log.warn(
				{ count: lanceWrites.length, err: err instanceof Error ? err.message : String(err) },
				'reindexFile: Lance write failed after LMDB commit -- vectors not persisted; rerun reembed to backfill',
			);
		}
	}
}

export async function deleteEntitiesForFile(_db: DbClient, filePath: string): Promise<void> {
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

export async function deleteEntitiesForRepo(_db: DbClient, repo: string): Promise<void> {
	const store = await getGraphStore();
	const repoId = await withReadTxn(store, () => lookupRepoIdInTxn(store, repo));
	if (repoId === undefined) return;
	const ids = await collectEntityU64sByRepo(store, repoId);
	await detachDeleteEntities(store, ids);
	// Repo-scoped Lance cleanup: belt-and-suspenders alongside the
	// per-id cleanup detachDeleteEntities does. Catches any rows whose
	// LMDB string-id mapping was already missing (e.g. corruption-
	// recovery paths).
	const { deleteEntityVecsForRepo } = await import('./lance/entity-vec.js');
	await deleteEntityVecsForRepo(repo);
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
 * with the kind check inlined per row. plans/docs-module.md Section
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

export async function listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]> {
	const store = await getGraphStore();
	const repoId = lookupRepoIdInTxn(store, repo);
	if (repoId === undefined) return [];
	const out: Entity[] = [];
	const repoCache = new Map<number, string>([[repoId, repo]]);
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		if (row.repoId !== repoId) continue;
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
		if (stringId === undefined) continue;
		out.push(rowToDomainEntity(stringId, row, lookupRepoPath(store, row.repoId, repoCache)));
	}
	return out;
}

export async function findEntitiesByFile(_db: DbClient, file: string): Promise<Entity[]> {
	const store = await getGraphStore();
	// `file` from callers is an absolute path; rows store the
	// repo-relative `filePath`. We resolve the row's repo root via its
	// repoId, recompute the absolute, and compare.
	const out: Entity[] = [];
	const repoCache = new Map<number, string>();
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		const repoPath = lookupRepoPath(store, row.repoId, repoCache);
		if (toAbsolutePath(row.filePath, repoPath) !== file) continue;
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
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
	for (const { key, value } of store.entity.getRange()) {
		const row = decodeEntityRow(value as Buffer);
		if (row.repoId !== repoId) continue;
		if (row.embeddingModel !== '') continue; // already embedded
		const stringId = lookupStringIdByU64(store, decodeKeyU64(key as Buffer));
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
	// Two-step write: update the LMDB row first (sync inside a write
	// txn), then persist the vector to Lance. Lance write happens after
	// the LMDB commit so a Lance failure leaves the EntityRow's
	// `embeddingModel` advertising "embedded" -- caller can re-run.
	//
	// Dispatch the Lance side based on whether this is a first-time
	// embed or a re-embed. First-time = prior `embeddingModel` was
	// empty; we know the entity has no existing Lance row, so we can
	// use the fast `addEntityEmbedding` (table.add, no JOIN). Re-embed
	// = prior model non-empty; the row may already exist, so we must
	// upsert via `writeEntityEmbedding` (mergeInsert). This matters at
	// scale: the indexer reembeds 1M entities through this path
	// serially; mergeInsert against a growing target is O(target) per
	// call and goes quadratic, while pure add stays linear.
	let repoId = -1;
	let repoPath = '';
	let kind = '';
	let artifact = false;
	let touched = false;
	let isFirstEmbed = false;
	await withWriteTxn(s => {
		const u64 = s.entityIdByString.get(id) as bigint | number | undefined;
		if (u64 === undefined) return; // no-op (matches prior DuckDB UPDATE behaviour)
		const row = readEntityRowSync(s, u64);
		if (row === null) return;
		isFirstEmbed = row.embeddingModel === '';
		const next: EntityRow = { ...row, embeddingModel };
		s.entity.put(encodeEntityKey(toBigInt(u64)), encodeEntityRow(next));
		repoId = row.repoId;
		kind = row.kind;
		artifact = row.artifact;
		touched = true;
	});
	if (!touched) return;
	if (embedding.length > 0) {
		const store = await getGraphStore();
		repoPath = readRepoPath(store, repoId) ?? '';
		const lance = await import('./lance/entity-vec.js');
		const writer = isFirstEmbed ? lance.addEntityEmbedding : lance.writeEntityEmbedding;
		await writer({
			id,
			embedding: new Float32Array(embedding),
			repo: repoPath,
			kind,
			artifact,
		});
	}
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
async function detachDeleteEntities(store: GraphStore, u64s: readonly bigint[]): Promise<void> {
	if (u64s.length === 0) return;
	// Capture string IDs BEFORE the delete (we lose the entity_id_by_string
	// mapping inside the txn). After LMDB commits, drop the corresponding
	// Lance rows.
	const stringIds: string[] = [];
	for (const u64 of u64s) {
		const sid = lookupStringIdByU64(store, u64);
		if (sid !== undefined) stringIds.push(sid);
	}
	await withWriteTxn(s => detachDeleteEntitiesInTxn(s, u64s));
	if (stringIds.length > 0) {
		const { deleteEntityVecsByIds } = await import('./lance/entity-vec.js');
		await deleteEntityVecsByIds(stringIds);
	}
}

/**
 * Sync, in-txn variant of `detachDeleteEntities`. Used by the bulk
 * `reindexFile` helper (Phase 2.9) so the snapshot + upsert + tombstone
 * pass commits as a single LMDB transaction.
 */
function detachDeleteEntitiesInTxn(s: GraphStore, u64s: readonly bigint[]): void {
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
		// Doc-summariser cascade (plans/docs-module.md Section 8):
		// drop any DocSummary row + its secondary index entry keyed
		// on this u64. Cheap no-op when the entity isn't a doc.
		deleteDocSummaryInTxn(s, u64);
		// Drop derived indices BEFORE the row itself so we have the
		// row's (repoId, kind, name) available for the name_index
		// lookup. Reverse-lookup via entityStringByU64 is O(1).
		const stringId = s.entityStringByU64.get(encodeEntityKey(u64)) as string | undefined;
		const rowBuf = s.entity.get(encodeEntityKey(u64));
		if (rowBuf !== undefined) {
			const row = decodeEntityRow(rowBuf as Buffer);
			// dupsort remove(key, value): drop only this entity's u64 from
			// the dup set, leaving other entities that share (repo, kind,
			// name) untouched.
			s.nameIndex.remove(
				encodeNameIndexKey(row.repoId, ENTITY_KIND_BYTE[row.kind], row.name),
				encodeEntityKey(u64),
			);
		}
		if (stringId !== undefined) {
			s.entityIdByString.remove(stringId);
			s.entityStringByU64.remove(encodeEntityKey(u64));
		}
		s.entity.remove(encodeEntityKey(u64));
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

function sweepIncomingEdges(s: GraphStore, u64: bigint): void {
	const prefix = encodeInEdgePrefix(u64);
	const succ = prefixSuccessor(prefix);
	const collected: Array<{ kind: number; from: bigint }> = [];
	for (const { key } of s.inEdge.getRange({ start: prefix, end: succ })) {
		const k = key as Buffer;
		collected.push({ kind: k.readUInt8(8), from: k.readBigUInt64BE(9) });
	}
	for (const { kind, from } of collected) {
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

