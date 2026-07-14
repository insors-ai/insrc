/**
 * Session-delete cleanup orchestrator for the LanceDB vector tables.
 *
 * Plan: plans/session-delete.md Phase A.2 + A.3.
 *
 * Today's reality: each per-table file ships its own delete helper
 * (`deleteSessionVec`, `deleteTurnVecsBySessionId`,
 * `deleteResponseSegmentsForSession`, `deleteArtifactsForSession`),
 * but there's no single entry point and no compaction pass. Without
 * compaction, Lance's `table.delete(predicate)` tombstones rows in
 * the storage format -- disk usage grows even as logical row counts
 * shrink, so session-delete leaks disk silently.
 *
 * This module exposes:
 *
 *   - `deleteSessionFromLance(sessionId)`: calls all 4 per-table
 *     deletes in parallel; returns per-table row counts so the daemon
 *     can log + surface them to the UI. Counts are derived by a
 *     pre-query (Lance's delete API doesn't return a count).
 *
 *   - `compactSessionVecTables()`: runs `table.optimize()` across all
 *     4 vector tables to reclaim tombstoned-row disk. Idempotent;
 *     cheap when no tombstones exist. Per-session delete runs this
 *     at the end; bulk delete defers and runs ONE pass at the end
 *     of the loop (compaction is the expensive part).
 */

import { getLogger } from '../../shared/logger.js';
import { getLanceConn } from './conn.js';
import { deleteSessionVec } from './session-vec.js';
import { deleteTurnVecsBySessionId } from './turn-vec.js';
import { deleteResponseSegmentsForSession } from './response-segment-vec.js';
import { deleteArtifactsForSession } from './artifact-vec.js';

const log = getLogger('lance-cleanup');

/** Names of the 4 vector tables that hold session-keyed data. */
const SESSION_VEC_TABLES = [
	'session_vec',
	'turn_vec',
	'response_segment_vec',
	'artifact_vec',
] as const;

export interface LanceCleanupCounts {
	readonly sessionRows:       number;
	readonly turnRows:          number;
	readonly responseSegments:  number;
	readonly artifacts:         number;
}

/**
 * Delete every Lance row keyed to the given session. Runs the 4 per-
 * table deletes in parallel and returns per-table counts. Does NOT
 * run compaction -- callers run that either at the end of a per-
 * session delete or after a bulk delete (see plan §A.3).
 */
export async function deleteSessionFromLance(sessionId: string): Promise<LanceCleanupCounts> {
	if (sessionId === '') {
		return { sessionRows: 0, turnRows: 0, responseSegments: 0, artifacts: 0 };
	}
	const t0 = Date.now();

	// Pre-count what each table holds for this session. Lance's
	// delete API returns void; we count before deleting so the
	// telemetry surfaces accurate per-table impact. The counts run
	// in parallel with each other; per-table delete runs in parallel
	// with its sibling counts BUT we sequence count-then-delete per
	// table to avoid the count getting truncated by an in-flight
	// delete in the same table.
	const [sessionRows, turnRows, responseSegments, artifacts] = await Promise.all([
		countAndDeleteSessionVec(sessionId),
		countAndDeleteTurnVec(sessionId),
		// These two helpers ALREADY pre-count + return -- reuse them.
		deleteResponseSegmentsForSession(sessionId).catch(err => {
			log.warn({ err: (err as Error).message, sessionId }, 'deleteResponseSegmentsForSession failed');
			return 0;
		}),
		deleteArtifactsForSession(sessionId).catch(err => {
			log.warn({ err: (err as Error).message, sessionId }, 'deleteArtifactsForSession failed');
			return 0;
		}),
	]);

	const counts: LanceCleanupCounts = { sessionRows, turnRows, responseSegments, artifacts };
	log.info({ sessionId, counts, durationMs: Date.now() - t0 }, 'deleteSessionFromLance complete');
	return counts;
}

/**
 * Run `table.optimize()` across all 4 vector tables. Lance's
 * delete tombstones rows in the storage format; without compaction
 * the on-disk fragments accumulate. Idempotent and cheap when there
 * are no tombstones; safe to call after any delete.
 *
 * Errors per-table are logged but do NOT throw -- compaction is a
 * disk-space optimization, not a correctness requirement. A failed
 * optimize leaves the (correct) tombstoned data in place.
 */
export async function compactSessionVecTables(): Promise<void> {
	const t0 = Date.now();
	const conn = await getLanceConn();
	const existingTables = await conn.tableNames();
	const results: { table: string; ok: boolean; errMsg?: string }[] = [];

	for (const name of SESSION_VEC_TABLES) {
		if (!existingTables.includes(name)) {
			results.push({ table: name, ok: true });
			continue;
		}
		try {
			const table = await conn.openTable(name);
			await table.optimize();
			results.push({ table: name, ok: true });
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			log.warn({ table: name, err: errMsg }, 'lance optimize failed (best-effort, continuing)');
			results.push({ table: name, ok: false, errMsg });
		}
	}

	log.info({ results, durationMs: Date.now() - t0 }, 'compactSessionVecTables complete');
}

// ---------------------------------------------------------------------------
// Internal helpers -- count + delete for the two tables whose per-table
// delete helpers return void today.
// ---------------------------------------------------------------------------

async function countAndDeleteSessionVec(sessionId: string): Promise<number> {
	try {
		const exists = await sessionVecRowExists(sessionId);
		if (!exists) return 0;
		await deleteSessionVec(sessionId);
		return 1;
	} catch (err) {
		log.warn({ err: (err as Error).message, sessionId }, 'session_vec delete failed');
		return 0;
	}
}

async function countAndDeleteTurnVec(sessionId: string): Promise<number> {
	try {
		const count = await turnVecRowCountForSession(sessionId);
		if (count === 0) return 0;
		await deleteTurnVecsBySessionId(sessionId);
		return count;
	} catch (err) {
		log.warn({ err: (err as Error).message, sessionId }, 'turn_vec delete failed');
		return 0;
	}
}

/**
 * Open the session_vec table and count rows for the given session id.
 * Returns 0 if the table doesn't exist yet or the row is absent.
 * Inlined here (rather than exporting from session-vec.ts) so the
 * cleanup orchestrator is self-contained.
 */
async function sessionVecRowExists(sessionId: string): Promise<boolean> {
	const conn = await getLanceConn();
	const existing = await conn.tableNames();
	if (!existing.includes('session_vec')) return false;
	const table = await conn.openTable('session_vec');
	const escaped = sessionId.replace(/'/g, "''");
	const rows = await table.query()
		.where(`id = '${escaped}'`)
		.select(['id'])
		.toArray();
	return rows.length > 0;
}

async function turnVecRowCountForSession(sessionId: string): Promise<number> {
	const conn = await getLanceConn();
	const existing = await conn.tableNames();
	if (!existing.includes('turn_vec')) return 0;
	const table = await conn.openTable('turn_vec');
	const escaped = sessionId.replace(/'/g, "''");
	const rows = await table.query()
		.where(`sessionId = '${escaped}'`)
		.select(['id'])
		.toArray();
	return rows.length;
}
