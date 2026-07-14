/**
 * `session_vec` LanceDB table -- conversation-session embeddings.
 *
 * Phase 3.3 of plans/storage-migration-lmdb-lance.md.
 *
 * Schema (post Phase 0.2 dim downshift):
 *   id:         string         -- session id (matches LMDB conversation_session.id)
 *   embedding:  FLOAT[1024]    -- summary embedding
 *   repo:       string         -- repo path (filter column)
 *   status:     string         -- 'active' | 'archived' | 'expired' (LMDB-side enum)
 *
 * Filter columns are duplicated from LMDB so Lance can scope ANN
 * searches without a join. LMDB stays canonical for the structured
 * fields.
 */

import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, openOrCreateTable } from './conn.js';
import { loadLocalProviderConfig } from '../../config/local.js';

const TABLE = 'session_vec';
const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;

export interface SessionVecRow {
	id:        string;
	embedding: Float32Array | number[];
	repo:      string;
	status:    string;
}

export interface SessionVecHit {
	id:       string;
	repo:     string;
	status:   string;
	distance: number;
}

let _tableCache: lancedb.Table | null = null;

async function getSessionVecTable(): Promise<lancedb.Table> {
	if (_tableCache !== null) return _tableCache;
	const conn = await getLanceConn();
	const seed: SessionVecRow = {
		id: '_seed_session_vec',
		embedding: new Float32Array(EMBEDDING_DIM),
		repo: '',
		status: 'archived',
	};
	_tableCache = await openOrCreateTable(conn, TABLE, () => [seed]);
	return _tableCache;
}

export function _resetSessionVecCache(): void {
	_tableCache = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function writeSessionEmbedding(row: SessionVecRow): Promise<void> {
	await writeSessionEmbeddings([row]);
}

export async function writeSessionEmbeddings(rows: readonly SessionVecRow[]): Promise<void> {
	if (rows.length === 0) return;
	const table = await getSessionVecTable();
	// Native upsert via mergeInsert -- see entity-vec.ts:writeEntityEmbeddings
	// for the full rationale (Phase 7.3 follow-up).
	await table.mergeInsert('id')
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute(rows.map(r => ({
			id:        r.id,
			embedding: r.embedding instanceof Float32Array ? r.embedding : new Float32Array(r.embedding),
			repo:      r.repo,
			status:    r.status,
		})));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchSessionsOpts {
	repo:    string;
	limit:   number;
	/** Drop expired sessions (matches the prior seedFromPrior contract). */
	notExpired?: boolean;
}

export async function searchSessionVecs(
	queryVec: number[],
	opts: SearchSessionsOpts,
): Promise<SessionVecHit[]> {
	if (queryVec.length === 0 || opts.repo === '') return [];
	const table = await getSessionVecTable();

	const conditions: string[] = [
		`repo = '${escapeLanceString(opts.repo)}'`,
		"id != '_seed_session_vec'",
	];
	if (opts.notExpired === true) {
		conditions.push("status != 'expired'");
	}

	const search = table.search(queryVec).limit(opts.limit);
	const rows = await search.where(conditions.join(' AND ')).toArray();
	return rows.map(r => ({
		id:       r['id']     as string,
		repo:     r['repo']   as string,
		status:   r['status'] as string,
		distance: Number(r['_distance']),
	}));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteSessionVec(id: string): Promise<void> {
	if (id === '') return;
	const table = await getSessionVecTable();
	await table.delete(`id = '${escapeLanceString(id)}'`);
}

export async function deleteSessionVecsByIds(ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return;
	const table = await getSessionVecTable();
	const list = ids.map(id => `'${escapeLanceString(id)}'`).join(', ');
	await table.delete(`id IN (${list})`);
}

export async function deleteSessionVecsForRepo(repo: string): Promise<void> {
	const table = await getSessionVecTable();
	await table.delete(`repo = '${escapeLanceString(repo)}'`);
}

function escapeLanceString(s: string): string {
	return s.replace(/'/g, "''");
}
