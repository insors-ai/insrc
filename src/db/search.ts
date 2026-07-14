/**
 * Search layer — vector ANN + graph queries scoped to a repo's
 * dependency closure.
 *
 * Public API (preserved across the LMDB+Lance migration):
 *   resolveClosure  — transitive DEPENDS_ON repos from a root repo
 *   searchEntities  — vector ANN search scoped to closure repos
 *   findCallers     — graph: 1-hop CALLS predecessors
 *   findCallees     — graph: 1-hop CALLS successors
 *   findDefinedIn   — graph: all entities DEFINED IN a file
 *   findImports     — graph: all files/modules a file IMPORTS
 *
 * Phase 4.2: searchEntities uses Lance (Phase 3.2). The graph queries
 * now route through `db/graph/edges.ts` (1-hop) and `db/graph/traversal.ts`
 * (transitiveClosure for resolveClosure), with string↔u64 ID
 * translation via `entityU64ForId` / `entityIdsByU64s` from
 * `db/entities.ts`.
 */

import type { DbClient } from './client.js';
import type { Entity, EntityKind } from '../shared/types.js';
import {
	entityU64ForId,
	entityIdsByU64s,
	getEntitiesByIds,
} from './entities.js';
import { searchEntityVecs, type EntityVecFilter } from './lance/entity-vec.js';
import { outNeighbors, inNeighbors } from './graph/edges.js';
import {
	transitiveClosure,
	scc,
	unreachable,
	type TraversalOpts,
} from './graph/traversal.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('search');

// Maximum DEPENDS_ON traversal depth in resolveClosure. Bounded to
// keep pathological dependency graphs from blowing up.
const CLOSURE_MAX_DEPTH = 10;

// ---------------------------------------------------------------------------
// Closure resolution
// ---------------------------------------------------------------------------

/**
 * Returns the transitive DEPENDS_ON closure of repo paths reachable
 * from `repoPath`. Result always includes `repoPath` itself (as the
 * first element).
 *
 * Resolution path:
 *   1. Map `repoPath` to its repo entity ID via `makeEntityId(repoPath, '', 'repo', repoPath)`,
 *      then translate that string to its internal u64.
 *   2. BFS-walk DEPENDS_ON outgoing edges up to `CLOSURE_MAX_DEPTH`.
 *   3. For each reachable u64, look up the matching string entity id;
 *      keep only the ones that are repo entities (filter applied via
 *      `getEntitiesByIds` + `kind === 'repo'`).
 *
 * In the current indexer flow `repo --DEPENDS_ON--> module`, so the
 * BFS frontier saturates after one hop and the result is typically
 * `[repoPath]` plus any other repos this repo depends on. The
 * `unshift(repoPath)` guarantees the root is present.
 */
export async function resolveClosure(_db: DbClient, repoPath: string): Promise<string[]> {
	const rootStringId = await makeRepoEntityIdLazy(repoPath);
	const rootU64 = await entityU64ForId(rootStringId);

	if (rootU64 === undefined) {
		// Root repo entity not in LMDB yet (indexer hasn't materialised
		// it, or test fixture didn't seed). Fall back to the path-only
		// answer to preserve the prior contract.
		log.debug({ repo: repoPath }, 'resolveClosure: root not in graph, returning [root]');
		return [repoPath];
	}

	const reachableU64s = await transitiveClosure([rootU64], {
		kindFilter: ['DEPENDS_ON'],
		direction:  'out',
		maxDepth:   CLOSURE_MAX_DEPTH,
	});

	const u64Array = [...reachableU64s];
	const idMap = await entityIdsByU64s(u64Array);
	const stringIds: string[] = [];
	for (const u of u64Array) {
		const sid = idMap.get(u);
		if (sid !== undefined) stringIds.push(sid);
	}

	// Hydrate to Entity rows so we can filter by kind and emit `repo`.
	const entities = await getEntitiesByIds(_db, stringIds);
	const paths: string[] = [];
	for (const e of entities) {
		if (e.kind !== 'repo') continue;
		// Repo entities use their absolute path as the repo column. Fall
		// back to `e.repo` if `rootPath` isn't set.
		const path = e.rootPath ?? e.repo;
		if (path !== '' && !paths.includes(path)) paths.push(path);
	}

	if (!paths.includes(repoPath)) paths.unshift(repoPath);

	log.debug({ repo: repoPath, closure: paths.length }, 'resolved dependency closure');
	return paths;
}

/**
 * Compute the deterministic repo entity ID for a path. Mirrors the
 * indexer's `makeEntityId(repoPath, '', 'repo', repoPath)` so that
 * `resolveClosure(repoPath)` lines up with the rows the indexer wrote.
 *
 * Imported lazily to avoid pulling indexer code into the daemon's read
 * path at module load.
 */
async function makeRepoEntityIdLazy(repoPath: string): Promise<string> {
	const { makeEntityId } = await import('../indexer/parser/base.js');
	return makeEntityId(repoPath, '', 'repo', repoPath);
}

// ---------------------------------------------------------------------------
// Vector search
// ---------------------------------------------------------------------------

/**
 * Vector ANN search scoped to the given repos.
 * Returns up to `limit` entities ranked by cosine distance.
 *
 * Falls back to gracefully returning [] if:
 *  - the query vector is empty (embedding unavailable)
 *  - closureRepos is empty (no scope to search)
 */
export type SearchFilter = 'all' | 'code' | 'artifact';

export async function searchEntities(
	_db:          DbClient,
	queryVec:     number[],
	closureRepos: string[],
	limit         = 10,
	filter:       SearchFilter = 'all',
): Promise<Entity[]> {
	if (queryVec.length === 0 || closureRepos.length === 0) {
		log.debug('searchEntities: empty query vector or closure');
		return [];
	}

	// Two-step: ANN against the Lance entity_vec table for hits +
	// distances, then hydrate full Entity rows from LMDB by id. The
	// hydration step also serves as a consistency check -- if Lance
	// has a row whose LMDB counterpart was tombstoned in a prior
	// cascade, the hydration silently drops it.
	const t0 = Date.now();
	const hits = await searchEntityVecs(
		queryVec,
		closureRepos,
		limit,
		filter as EntityVecFilter,
	);
	const ids = hits.map(h => h.id);
	const entities = await getEntitiesByIds(_db, ids);

	// Preserve the Lance-side ranking. getEntitiesByIds doesn't
	// guarantee order; reorder by hits[].
	const byId = new Map<string, Entity>();
	for (const e of entities) byId.set(e.id, e);
	const ordered: Entity[] = [];
	for (const h of hits) {
		const e = byId.get(h.id);
		if (e !== undefined) ordered.push(e);
	}

	const elapsed = `${Date.now() - t0}ms`;
	log.info({ hits: ordered.length, limit, filter, elapsed }, 'vector search');
	log.debug(
		{ names: ordered.map(e => `${e.kind}:${e.name}`), elapsed },
		'vector search details',
	);
	return ordered;
}

// ---------------------------------------------------------------------------
// Graph queries
// ---------------------------------------------------------------------------

/** Find all entities that directly call the entity with the given id. */
export async function findCallers(db: DbClient, entityId: string): Promise<Entity[]> {
	const results = await neighborEntities(db, entityId, 'CALLS', 'in');
	log.debug({ entity: entityId, callers: results.length }, 'findCallers');
	return results;
}

/** Find all entities directly called by the entity with the given id. */
export async function findCallees(db: DbClient, entityId: string): Promise<Entity[]> {
	const results = await neighborEntities(db, entityId, 'CALLS', 'out');
	log.debug({ entity: entityId, callees: results.length }, 'findCallees');
	return results;
}

/** Find all entities defined in a file (DEFINES edges from File). */
export async function findDefinedIn(db: DbClient, fileEntityId: string): Promise<Entity[]> {
	const results = await neighborEntities(db, fileEntityId, 'DEFINES', 'out');
	log.debug({ file: fileEntityId, defined: results.length }, 'findDefinedIn');
	return results;
}

/** Find all files/modules a file imports (IMPORTS edges). */
export async function findImports(db: DbClient, fileEntityId: string): Promise<Entity[]> {
	const results = await neighborEntities(db, fileEntityId, 'IMPORTS', 'out');
	log.debug({ file: fileEntityId, imports: results.length }, 'findImports');
	return results;
}

// ---------------------------------------------------------------------------
// Multi-hop / reachability domain wrappers
// ---------------------------------------------------------------------------

/**
 * Hydrate a list of u64 IDs to `Entity` rows in the original order.
 * u64s with no string-id mapping (shouldn't happen under normal cascade
 * rules) are silently dropped.
 */
async function hydrateU64s(db: DbClient, u64s: readonly bigint[]): Promise<Entity[]> {
	if (u64s.length === 0) return [];
	const idMap = await entityIdsByU64s(u64s);
	const stringIds: string[] = [];
	for (const u of u64s) {
		const sid = idMap.get(u);
		if (sid !== undefined) stringIds.push(sid);
	}
	const entities = await getEntitiesByIds(db, stringIds);
	const byId = new Map<string, Entity>();
	for (const e of entities) byId.set(e.id, e);
	const ordered: Entity[] = [];
	for (const u of u64s) {
		const sid = idMap.get(u);
		if (sid === undefined) continue;
		const e = byId.get(sid);
		if (e !== undefined) ordered.push(e);
	}
	return ordered;
}

/**
 * Translate a list of public string entity IDs to internal u64s,
 * dropping entries we can't resolve.
 */
async function rootStringsToU64s(rootIds: readonly string[]): Promise<bigint[]> {
	const out: bigint[] = [];
	for (const id of rootIds) {
		const u = await entityU64ForId(id);
		if (u !== undefined) out.push(u);
	}
	return out;
}

/**
 * Generic transitive closure over the entity graph: BFS from `rootIds`
 * across the LMDB out_edge / in_edge sub-DBs, returning the reachable
 * set hydrated as `Entity` rows. Roots are included in the result.
 *
 * Used by the LLM-facing `graph_query` tool and by domain skills
 * (Phase 8.1 dead-code) that need a string-id ↔ Entity round-trip
 * around the pure-graph traversal layer.
 */
export async function closureEntities(
	db:       DbClient,
	rootIds:  readonly string[],
	opts:     TraversalOpts = {},
): Promise<Entity[]> {
	const u64Roots = await rootStringsToU64s(rootIds);
	if (u64Roots.length === 0) return [];
	const reachable = await transitiveClosure(u64Roots, opts);
	return hydrateU64s(db, [...reachable]);
}

/**
 * Domain wrapper around `traversal.unreachable`. Returns hydrated
 * Entity rows whose kind matches `candidateKinds` and which are NOT
 * in the transitive closure of `rootIds`.
 */
export async function unreachableEntities(
	db:              DbClient,
	rootIds:         readonly string[],
	candidateKinds:  readonly EntityKind[],
	opts:            TraversalOpts = {},
): Promise<Entity[]> {
	const u64Roots = await rootStringsToU64s(rootIds);
	const u64s: bigint[] = [];
	for await (const u of unreachable(u64Roots, candidateKinds, opts)) {
		u64s.push(u);
	}
	return hydrateU64s(db, u64s);
}

/**
 * Domain wrapper around `traversal.scc`. Returns each strongly
 * connected component as an array of hydrated `Entity` rows. Empty
 * `rootIds` returns an empty array.
 */
export async function sccEntities(
	db:       DbClient,
	rootIds:  readonly string[],
	opts:     TraversalOpts = {},
): Promise<Entity[][]> {
	const u64Roots = await rootStringsToU64s(rootIds);
	if (u64Roots.length === 0) return [];
	const components = await scc(u64Roots, opts);
	const out: Entity[][] = [];
	for (const comp of components) {
		out.push(await hydrateU64s(db, comp));
	}
	return out;
}

/**
 * Internal: 1-hop neighbour query that returns hydrated `Entity` rows.
 * Pipeline:
 *   string id → u64 → outNeighbors / inNeighbors (kind-filtered)
 *   → bulk reverse lookup u64 → string ids
 *   → hydrate via getEntitiesByIds
 *
 * If the source entity isn't known to LMDB, returns []. If a neighbor
 * u64 has no corresponding string id (shouldn't happen under normal
 * cascade rules but possible if a write was partial), it's silently
 * dropped during reverse-mapping.
 */
async function neighborEntities(
	db: DbClient,
	entityId: string,
	kind: 'CALLS' | 'DEFINES' | 'IMPORTS',
	direction: 'in' | 'out',
): Promise<Entity[]> {
	const u64 = await entityU64ForId(entityId);
	if (u64 === undefined) return [];

	const neighborU64s = direction === 'out'
		? await outNeighbors(u64, { kindFilter: [kind] })
		: await inNeighbors(u64, { kindFilter: [kind] });
	if (neighborU64s.length === 0) return [];

	const idMap = await entityIdsByU64s(neighborU64s);
	const stringIds: string[] = [];
	for (const u of neighborU64s) {
		const sid = idMap.get(u);
		if (sid !== undefined) stringIds.push(sid);
	}
	return getEntitiesByIds(db, stringIds);
}
