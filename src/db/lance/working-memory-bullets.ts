/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * `working_memory_bullets` LanceDB table -- per-TODO semantic-bullet
 * cache for the planner-section-task-separation orchestrator (P1.e /
 * Q1.1 mitigation 1).
 *
 * Each row is a prompt-AGNOSTIC key fact extracted from a completed
 * TODO's findings + section markdown. At the NEXT TODO's shaping
 * step, the updater embeds the next objective and ANN-retrieves the
 * top-K most relevant bullets across the run -- this replaces the
 * expensive `updateSemantic` LLM call (which would otherwise have to
 * read the prior semantic + new entry + new objective every TODO
 * transition) with a cheap vector lookup.
 *
 * Scope is per-report-run, NOT per-session. A run can produce dozens
 * of bullets; cleanup happens when the run completes (success or
 * failure) via `deleteBulletsForRun`.
 *
 * Schema:
 *   id:         string          -- `${runId}:${todoId}:${bulletIdx}`
 *   embedding:  FLOAT[<dim>]    -- local Ollama embedding of `bullet`
 *   runId:      string          -- per-report-run identifier
 *   todoId:     string          -- producing TODO's id
 *   todoIndex:  number          -- producing TODO's index within the run
 *   bullet:     string          -- the fact text itself
 *   createdAt:  number          -- unix ms
 */

import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, openOrCreateTable } from './conn.js';
import { loadLocalProviderConfig } from '../../config/local.js';

const TABLE = 'working_memory_bullets';
const EMBEDDING_DIM = loadLocalProviderConfig().embeddingDim;

export interface BulletRow {
	id:         string;
	embedding:  Float32Array | number[];
	runId:      string;
	todoId:     string;
	todoIndex:  number;
	bullet:     string;
	createdAt:  number;
}

export interface BulletHit {
	id:         string;
	runId:      string;
	todoId:     string;
	todoIndex:  number;
	bullet:     string;
	createdAt:  number;
	distance:   number;
}

let _tableCache: lancedb.Table | null = null;

async function getBulletsTable(): Promise<lancedb.Table> {
	if (_tableCache !== null) { return _tableCache; }
	const conn = await getLanceConn();
	const seed: BulletRow = {
		id:        '_seed_working_memory_bullets',
		embedding: new Float32Array(EMBEDDING_DIM),
		runId:     '',
		todoId:    '',
		todoIndex: 0,
		bullet:    '',
		createdAt: 0,
	};
	_tableCache = await openOrCreateTable(conn, TABLE, () => [seed]);
	return _tableCache;
}

/** Test-only: reset the module-level table cache (parity with other Lance tables). */
export function _resetBulletsTableCache(): void {
	_tableCache = null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function writeBullet(row: BulletRow): Promise<void> {
	await writeBullets([row]);
}

export async function writeBullets(rows: readonly BulletRow[]): Promise<void> {
	if (rows.length === 0) { return; }
	const table = await getBulletsTable();
	await table.mergeInsert('id')
		.whenMatchedUpdateAll()
		.whenNotMatchedInsertAll()
		.execute(rows.map(r => ({
			id:        r.id,
			embedding: r.embedding instanceof Float32Array ? r.embedding : new Float32Array(r.embedding),
			runId:     r.runId,
			todoId:    r.todoId,
			todoIndex: r.todoIndex,
			bullet:    r.bullet,
			createdAt: r.createdAt,
		})));
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchBulletsOpts {
	/** Per-report-run scope. Bullets from other runs are excluded. */
	runId: string;
	/** Top-K limit; caller decides (5-15 typical). */
	limit: number;
}

/**
 * ANN search restricted to a single report run. The query vector is
 * the local embedding of the NEXT TODO's objective; the returned hits
 * are the prompt-agnostic bullets most relevant to that objective.
 */
export async function searchBullets(
	queryVec: number[],
	opts: SearchBulletsOpts,
): Promise<BulletHit[]> {
	if (queryVec.length === 0 || opts.runId === '') { return []; }
	const table = await getBulletsTable();
	const conditions: string[] = [
		`runId = '${escapeLanceString(opts.runId)}'`,
		"id != '_seed_working_memory_bullets'",
	];
	const search = table.search(queryVec).limit(opts.limit);
	const rows = await search.where(conditions.join(' AND ')).toArray();
	return rows.map(r => ({
		id:        r['id']        as string,
		runId:     r['runId']     as string,
		todoId:    r['todoId']    as string,
		todoIndex: Number(r['todoIndex']),
		bullet:    r['bullet']    as string,
		createdAt: Number(r['createdAt']),
		distance:  Number(r['_distance']),
	}));
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

/**
 * Drop every bullet for a given report run. Called by the orchestrator
 * when a run completes (success or failure) so the LanceDB table
 * doesn't accumulate stale per-run data across the daemon lifetime.
 */
export async function deleteBulletsForRun(runId: string): Promise<void> {
	if (runId === '') { return; }
	const table = await getBulletsTable();
	await table.delete(`runId = '${escapeLanceString(runId)}'`);
}

export async function deleteBulletsForTodo(runId: string, todoId: string): Promise<void> {
	if (runId === '' || todoId === '') { return; }
	const table = await getBulletsTable();
	await table.delete(`runId = '${escapeLanceString(runId)}' AND todoId = '${escapeLanceString(todoId)}'`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeLanceString(s: string): string {
	return s.replace(/'/g, "''");
}

export const _escapeLanceStringForTest = escapeLanceString;
