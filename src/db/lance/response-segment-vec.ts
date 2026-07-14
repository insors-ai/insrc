/**
 * `response_segment_vec` LanceDB table -- per-segment embeddings of
 * prior assistant responses, used by the intent classifier's memory
 * retrieval (Phase 3 of plans/intent-classification-consolidation.md).
 *
 * Why a separate table from `turn_vec`: `turn_vec` holds whole-turn
 * embeddings, optimised for "find similar past turns". The classifier
 * memory needs the OPPOSITE -- "find the specific paragraph inside a
 * past assistant response that talks about the entity the user just
 * referenced". Embedding whole responses smears the signal; we chunk
 * each assistant response and embed each chunk so ANN can pinpoint
 * the relevant excerpt without dragging the entire reply into the
 * classifier prompt.
 *
 * Schema:
 *   id:         string         -- formatted as `${turnId}:${segmentIdx}`
 *   embedding:  FLOAT[1024]
 *   sessionId:  string         -- duplicated from LMDB for filtering
 *   turnId:     string         -- FK to LMDB turn row (`${sessionId}:${idx}`)
 *   segmentIdx: int            -- 0-based ordinal inside the response
 *   text:       string         -- the chunk itself, raw markdown, ≤2 KB
 *   timestamp:  bigint         -- ms epoch from the source turn
 *
 * Cleanup contract: rows are scoped to a session. Per the standing
 * "purge only via repo.remove cascade" rule, the legal callers of
 * `deleteResponseSegmentsForSession` are:
 *   - `db/conversations.ts:deleteSessionsForRepo` (per-id loop in the
 *     repo-remove cascade)
 *   - explicit per-turn cleanup if a future feature deletes a turn
 *     while keeping the session.
 * Session.close() does NOT touch this table -- segments must outlive
 * idle reaping so the next user turn can still retrieve them.
 */

import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, openOrCreateTable } from './conn.js';
import { loadLocalProviderConfig } from '../../config/local.js';

const TABLE = 'response_segment_vec';
const SEED_ID = '_seed_response_segment_vec';
const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;

// ---------------------------------------------------------------------------
// Row + hit shapes
// ---------------------------------------------------------------------------

export interface ResponseSegmentVecRow {
	id:         string;
	embedding:  Float32Array | number[];
	sessionId:  string;
	turnId:     string;
	segmentIdx: number;
	text:       string;
	timestamp:  bigint;
}

export interface ResponseSegmentVecHit {
	id:         string;
	sessionId:  string;
	turnId:     string;
	segmentIdx: number;
	text:       string;
	timestamp:  bigint;
	distance:   number;
}

let _tableCache: lancedb.Table | null = null;

async function getResponseSegmentVecTable(): Promise<lancedb.Table> {
	if (_tableCache !== null) return _tableCache;
	const conn = await getLanceConn();
	const seed: ResponseSegmentVecRow = {
		id:         SEED_ID,
		embedding:  new Float32Array(EMBEDDING_DIM),
		sessionId:  '',
		turnId:     '',
		segmentIdx: 0,
		text:       '',
		timestamp:  BigInt(0),
	};
	_tableCache = await openOrCreateTable(conn, TABLE, () => [seed]);
	return _tableCache;
}

export function _resetResponseSegmentVecCache(): void {
	_tableCache = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function upsertResponseSegmentVec(row: ResponseSegmentVecRow): Promise<void> {
	await upsertResponseSegmentVecBatch([row]);
}

export async function upsertResponseSegmentVecBatch(
	rows: readonly ResponseSegmentVecRow[],
): Promise<void> {
	if (rows.length === 0) return;
	const table = await getResponseSegmentVecTable();
	await table.mergeInsert('id')
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute(rows.map(r => ({
			id:         r.id,
			embedding:  r.embedding instanceof Float32Array
				? r.embedding
				: new Float32Array(r.embedding),
			sessionId:  r.sessionId,
			turnId:     r.turnId,
			segmentIdx: r.segmentIdx,
			text:       r.text,
			timestamp:  r.timestamp,
		})));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface QueryResponseSegmentOpts {
	readonly sessionId: string;
	readonly k?:        number;
}

/**
 * ANN search over response segments belonging to a single session.
 * Returns up to `k` hits (default 6) sorted by ascending distance
 * (closest match first). Empty when the query vector is empty or the
 * sessionId is empty.
 */
export async function queryResponseSegmentVec(
	queryVec: number[],
	opts: QueryResponseSegmentOpts,
): Promise<readonly ResponseSegmentVecHit[]> {
	if (queryVec.length === 0 || opts.sessionId === '') return [];
	const table = await getResponseSegmentVecTable();
	const k = opts.k ?? 6;

	const conditions = [
		`sessionId = '${escapeLanceString(opts.sessionId)}'`,
		`id != '${SEED_ID}'`,
	];

	const rows = await table.search(queryVec)
		.limit(k)
		.where(conditions.join(' AND '))
		.toArray();

	return rows.map(r => ({
		id:         r['id']         as string,
		sessionId:  r['sessionId']  as string,
		turnId:     r['turnId']     as string,
		segmentIdx: Number(r['segmentIdx']),
		text:       r['text']       as string,
		timestamp:  toBigInt(r['timestamp']),
		distance:   Number(r['_distance']),
	}));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Delete every segment row tied to a session id. Returns the number
 * of rows deleted (0 when the session had no segments). Mirrors
 * `purgeSessionById` -- repo-remove cascade calls this in a loop
 * over the session ids it just enumerated.
 */
export async function deleteResponseSegmentsForSession(sessionId: string): Promise<number> {
	if (sessionId === '') return 0;
	const table = await getResponseSegmentVecTable();
	const before = await rowCountForSession(table, sessionId);
	if (before === 0) return 0;
	await table.delete(`sessionId = '${escapeLanceString(sessionId)}'`);
	return before;
}

/** Delete every segment row tied to a single turn id. */
export async function deleteResponseSegmentsForTurn(turnId: string): Promise<number> {
	if (turnId === '') return 0;
	const table = await getResponseSegmentVecTable();
	const rows = await table.query()
		.where(`turnId = '${escapeLanceString(turnId)}'`)
		.select(['id'])
		.toArray();
	if (rows.length === 0) return 0;
	await table.delete(`turnId = '${escapeLanceString(turnId)}'`);
	return rows.length;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rowCountForSession(table: lancedb.Table, sessionId: string): Promise<number> {
	// Lance doesn't expose a cheap COUNT(*); query just the id column
	// (~few bytes per row) and length-check the result. Sessions cap
	// at O(turns × segments-per-turn) which stays modest.
	const rows = await table.query()
		.where(`sessionId = '${escapeLanceString(sessionId)}'`)
		.select(['id'])
		.toArray();
	return rows.length;
}

function toBigInt(v: unknown): bigint {
	if (typeof v === 'bigint') return v;
	if (typeof v === 'number') return BigInt(v);
	if (typeof v === 'string') return BigInt(v);
	return BigInt(0);
}

function escapeLanceString(s: string): string {
	return s.replace(/'/g, "''");
}
