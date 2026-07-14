/**
 * `config_vec` LanceDB table -- config-entry embeddings.
 *
 * Phase 3.4 of plans/storage-migration-lmdb-lance.md.
 *
 * Schema (post Phase 0.2 dim downshift):
 *   id:         string         -- entry id (matches LMDB config_entry.id)
 *   embedding:  FLOAT[1024]
 *   scope:      string         -- formatted scope ('global' | 'project:/path')
 *   namespace:  string         -- ConfigNamespace
 *   category:   string         -- 'template' | 'feedback' | 'convention'
 *   language:   string         -- Language | 'all'
 *
 * Filter columns are duplicated from the LMDB row so Lance can scope
 * ANN searches via raw `where` SQL fragments (the prior DuckDB API
 * accepted them; Lance's DataFusion-backed filter parser uses the same
 * syntax for the column names referenced by `config/search.ts`).
 */

import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, openOrCreateTable } from './conn.js';
import { loadLocalProviderConfig } from '../../config/local.js';

const TABLE = 'config_vec';
const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;

export interface ConfigVecRow {
	id:        string;
	embedding: Float32Array | number[];
	scope:     string;
	namespace: string;
	category:  string;
	language:  string;
}

export interface ConfigVecHit {
	id:        string;
	scope:     string;
	namespace: string;
	category:  string;
	language:  string;
	distance:  number;
}

let _tableCache: lancedb.Table | null = null;

async function getConfigVecTable(): Promise<lancedb.Table> {
	if (_tableCache !== null) return _tableCache;
	const conn = await getLanceConn();
	const seed: ConfigVecRow = {
		id: '_seed_config_vec',
		embedding: new Float32Array(EMBEDDING_DIM),
		scope: '',
		namespace: '',
		category: '',
		language: '',
	};
	_tableCache = await openOrCreateTable(conn, TABLE, () => [seed]);
	return _tableCache;
}

export function _resetConfigVecCache(): void {
	_tableCache = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function writeConfigEmbedding(row: ConfigVecRow): Promise<void> {
	await writeConfigEmbeddings([row]);
}

export async function writeConfigEmbeddings(rows: readonly ConfigVecRow[]): Promise<void> {
	if (rows.length === 0) return;
	const table = await getConfigVecTable();
	// Native upsert via mergeInsert -- see entity-vec.ts:writeEntityEmbeddings
	// for the full rationale (Phase 7.3 follow-up).
	await table.mergeInsert('id')
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute(rows.map(r => ({
			id:        r.id,
			embedding: r.embedding instanceof Float32Array ? r.embedding : new Float32Array(r.embedding),
			scope:     r.scope,
			namespace: r.namespace,
			category:  r.category,
			language:  r.language,
		})));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Vector ANN with optional caller-supplied `where` filter. The `where`
 * argument is a raw SQL fragment using DataFusion syntax (single-quoted
 * strings, IN, AND, OR, parens) -- the same dialect the prior DuckDB
 * vectorSearch accepted. `config/search.ts:buildWhereClause` already
 * builds queries in this shape; we splice them through unchanged.
 *
 * The seed sentinel is always excluded.
 */
export async function searchConfigVecs(
	queryVec: number[],
	where: string | undefined,
	limit: number,
): Promise<ConfigVecHit[]> {
	if (queryVec.length === 0) return [];
	const table = await getConfigVecTable();

	const conditions: string[] = ["id != '_seed_config_vec'"];
	if (where !== undefined && where.trim() !== '') conditions.push(`(${where})`);

	const search = table.search(queryVec).limit(limit);
	const rows = await search.where(conditions.join(' AND ')).toArray();
	return rows.map(r => ({
		id:        r['id']        as string,
		scope:     r['scope']     as string,
		namespace: r['namespace'] as string,
		category:  r['category']  as string,
		language:  r['language']  as string,
		distance:  Number(r['_distance']),
	}));
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteConfigVec(id: string): Promise<void> {
	if (id === '') return;
	const table = await getConfigVecTable();
	await table.delete(`id = '${escapeLanceString(id)}'`);
}

export async function deleteConfigVecsByIds(ids: readonly string[]): Promise<void> {
	if (ids.length === 0) return;
	const table = await getConfigVecTable();
	const list = ids.map(id => `'${escapeLanceString(id)}'`).join(', ');
	await table.delete(`id IN (${list})`);
}

export async function deleteConfigVecsForScope(scope: string): Promise<void> {
	const table = await getConfigVecTable();
	await table.delete(`scope = '${escapeLanceString(scope)}'`);
}

function escapeLanceString(s: string): string {
	return s.replace(/'/g, "''");
}
