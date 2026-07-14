/**
 * `turn_vec` LanceDB table -- conversation-turn embeddings.
 *
 * Phase 3.3 of plans/storage-migration-lmdb-lance.md.
 *
 * Schema (post Phase 0.2 dim downshift):
 *   id:        string          -- formatted as `${sessionId}:${idx}`
 *   embedding: FLOAT[1024]
 *   repo:      string
 *   sessionId: string
 *   type:      string          -- 'turn' | 'directive' | 'summary' | 'merged'
 *   tier:      string          -- 'hot' | 'warm' | 'cold' | 'archive'
 *
 * Filter columns are duplicated from LMDB. searchTurnsByRepo filters
 * on `repo IN (...) AND type IN ('turn','directive','merged')` per the
 * prior DuckDB query contract.
 */

import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, openOrCreateTable } from './conn.js';
import { loadLocalProviderConfig } from '../../config/local.js';

const TABLE = 'turn_vec';
const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;

export interface TurnVecRow {
	id:        string;
	embedding: Float32Array | number[];
	repo:      string;
	sessionId: string;
	type:      string;
	tier:      string;
}

export interface TurnVecHit {
	id:        string;
	repo:      string;
	sessionId: string;
	type:      string;
	tier:      string;
	distance:  number;
}

let _tableCache: lancedb.Table | null = null;

async function getTurnVecTable(): Promise<lancedb.Table> {
	if (_tableCache !== null) return _tableCache;
	const conn = await getLanceConn();
	const seed: TurnVecRow = {
		id: '_seed_turn_vec',
		embedding: new Float32Array(EMBEDDING_DIM),
		repo: '',
		sessionId: '',
		type: 'turn',
		tier: 'hot',
	};
	_tableCache = await openOrCreateTable(conn, TABLE, () => [seed]);
	return _tableCache;
}

export function _resetTurnVecCache(): void {
	_tableCache = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function writeTurnEmbedding(row: TurnVecRow): Promise<void> {
	await writeTurnEmbeddings([row]);
}

export async function writeTurnEmbeddings(rows: readonly TurnVecRow[]): Promise<void> {
	if (rows.length === 0) return;
	const table = await getTurnVecTable();
	// Native upsert via mergeInsert -- see entity-vec.ts:writeEntityEmbeddings
	// for the full rationale (Phase 7.3 follow-up).
	await table.mergeInsert('id')
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute(rows.map(r => ({
			id:        r.id,
			embedding: r.embedding instanceof Float32Array ? r.embedding : new Float32Array(r.embedding),
			repo:      r.repo,
			sessionId: r.sessionId,
			type:      r.type,
			tier:      r.tier,
		})));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchTurnsOpts {
	repo:  string;
	limit: number;
	/** Default: ['turn','directive','merged'] -- mirrors prior DuckDB filter */
	types?: readonly string[];
}

export async function searchTurnVecs(
	queryVec: number[],
	opts: SearchTurnsOpts,
): Promise<TurnVecHit[]> {
	if (queryVec.length === 0 || opts.repo === '') return [];
	const table = await getTurnVecTable();
	const types = opts.types ?? ['turn', 'directive', 'merged'];
	const typeList = types.map(t => `'${escapeLanceString(t)}'`).join(', ');

	const conditions: string[] = [
		`repo = '${escapeLanceString(opts.repo)}'`,
		`type IN (${typeList})`,
		"id != '_seed_turn_vec'",
	];

	const search = table.search(queryVec).limit(opts.limit);
	const rows = await search.where(conditions.join(' AND ')).toArray();
	return rows.map(r => ({
		id:        r['id']        as string,
		repo:      r['repo']      as string,
		sessionId: r['sessionId'] as string,
		type:      r['type']      as string,
		tier:      r['tier']      as string,
		distance:  Number(r['_distance']),
	}));
}

export interface SearchTurnsBySessionOpts {
	sessionId: string;
	limit:     number;
	/** Default: ['turn','directive','merged'] -- mirrors searchTurnVecs */
	types?:    readonly string[];
}

/**
 * ANN search restricted to a single session. Used by the intent
 * resolver's classifier-memory retrieval (Phase 3 of
 * plans/intent-classification-consolidation.md): "find prior turns
 * in THIS conversation similar to the user's current message".
 *
 * Repo is intentionally NOT a filter here -- the question we're
 * answering is "what's in this session's history", which is a
 * narrower scope than the per-repo cross-session search above.
 */
export async function searchTurnVecsBySession(
	queryVec: number[],
	opts: SearchTurnsBySessionOpts,
): Promise<TurnVecHit[]> {
	if (queryVec.length === 0 || opts.sessionId === '') return [];
	const table = await getTurnVecTable();
	const types = opts.types ?? ['turn', 'directive', 'merged'];
	const typeList = types.map(t => `'${escapeLanceString(t)}'`).join(', ');

	const conditions: string[] = [
		`sessionId = '${escapeLanceString(opts.sessionId)}'`,
		`type IN (${typeList})`,
		"id != '_seed_turn_vec'",
	];

	const rows = await table.search(queryVec)
		.limit(opts.limit)
		.where(conditions.join(' AND '))
		.toArray();
	return rows.map(r => ({
		id:        r['id']        as string,
		repo:      r['repo']      as string,
		sessionId: r['sessionId'] as string,
		type:      r['type']      as string,
		tier:      r['tier']      as string,
		distance:  Number(r['_distance']),
	}));
}

/**
 * Bulk-fetch turn embeddings by id. Returns a map id -> Float32Array;
 * ids without a Lance row are absent from the result.
 *
 * Used by `db/conversations.ts:getAllTurnsWithVectorsForRepo` to hydrate
 * vectors back onto the LMDB-side TurnRecord when the caller needs
 * them (e.g. compaction's clustering / centroid / dedup steps).
 */
export async function getTurnVecsByIds(ids: readonly string[]): Promise<Map<string, Float32Array>> {
	const out = new Map<string, Float32Array>();
	if (ids.length === 0) return out;
	const table = await getTurnVecTable();
	const idList = ids.map(id => `'${escapeLanceString(id)}'`).join(', ');
	const rows = await table.query().where(`id IN (${idList})`).toArray();
	for (const r of rows) {
		const raw = r['embedding'] as ArrayLike<number> | Float32Array;
		const vec = raw instanceof Float32Array ? raw : new Float32Array(Array.from(raw));
		out.set(r['id'] as string, vec);
	}
	return out;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteTurnVec(id: string): Promise<void> {
	if (id === '') return;
	const table = await getTurnVecTable();
	await table.delete(`id = '${escapeLanceString(id)}'`);
}

export async function deleteTurnVecsByIds(ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return;
	const table = await getTurnVecTable();
	const list = ids.map(id => `'${escapeLanceString(id)}'`).join(', ');
	await table.delete(`id IN (${list})`);
}

export async function deleteTurnVecsBySessionId(sessionId: string): Promise<void> {
	const table = await getTurnVecTable();
	await table.delete(`sessionId = '${escapeLanceString(sessionId)}'`);
}

export async function deleteTurnVecsForRepo(repo: string): Promise<void> {
	const table = await getTurnVecTable();
	await table.delete(`repo = '${escapeLanceString(repo)}'`);
}

function escapeLanceString(s: string): string {
	return s.replace(/'/g, "''");
}
