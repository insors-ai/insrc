/**
 * Module-level DriverPool cache keyed by repo path.
 *
 * The tool layer calls into this every turn; we lazily build one pool
 * per repo + keep it for the process lifetime. Each pool in turn
 * lazy-builds drivers + closes them on idle, so the memory shape is:
 * N repos * M active-connections drivers, capped by use rather than
 * pool-count.
 *
 * `reloadAll()` exists for a future `db.reloadConnections` RPC; for
 * phase 3 tool dispatch the caller never asks to reload, but a pool
 * picks up config changes when it's rebuilt. We re-read connections
 * file on every acquire() since the underlying JSON is tiny and a
 * stale pool would confuse the user immediately after they edit
 * db-connections.json.
 *
 * Scope: one cache per daemon process; shared across all sessions
 * pointing at the same repoPath.
 */

import { getLogger } from '../../shared/logger.js';
import { DriverPool } from './pool.js';

const log = getLogger('db-pool-cache');

const CACHE = new Map<string, DriverPool>();

export async function acquirePool(repoPath: string): Promise<DriverPool> {
	let pool = CACHE.get(repoPath);
	if (pool === undefined) {
		log.debug({ repoPath }, 'creating driver pool');
		pool = new DriverPool(repoPath);
		CACHE.set(repoPath, pool);
	}
	await pool.reload();
	return pool;
}

export async function reloadAll(): Promise<void> {
	for (const [repoPath, pool] of CACHE) {
		try { await pool.reload(); }
		catch (err) {
			log.warn(
				{ repoPath, err: (err as Error).message },
				'pool reload failed',
			);
		}
	}
}

export async function closeAll(): Promise<void> {
	for (const pool of CACHE.values()) {
		try { await pool.closeAll(); }
		catch (err) {
			log.warn({ err: (err as Error).message }, 'pool close failed');
		}
	}
	CACHE.clear();
}

/** Test-only. Drops the cache without closing -- callers that want
 *  a clean shutdown should call closeAll() first. */
export function _resetCacheForTests(): void {
	CACHE.clear();
}
