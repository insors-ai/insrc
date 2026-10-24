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
import type { ConnectionAccessContext, ConnectionResolver } from '../../shared/connection-management.js';
const log = getLogger('db-pool-cache');
const CACHE = new Map<string, DriverPool>();
export interface ResolverPorts {
	readonly poolSource?: ((lookupRoot: string) => Promise<DriverPool>) | undefined;
	/** Future session owner validates the handle and returns its resolver. No session store lives here. */
	readonly sessionOverlay?: ((context: ConnectionAccessContext) => Promise<ConnectionResolver>) | undefined;
}
export class SessionAccessError extends Error {
	readonly code = 'session-expired';
	constructor() {
		super('Connection session is unavailable.');
		this.name = 'SessionAccessError';
	}
}
/** Saved reads retain the caller's own directory, independently of registry membership. */
export function createConnectionResolver(ports: ResolverPorts = {}): ConnectionResolver {
	const pool = (context: ConnectionAccessContext) => (ports.poolSource ?? acquirePool)(context.lookupRoot);
	const overlay = async (context: ConnectionAccessContext): Promise<ConnectionResolver | undefined> => {
		if (context.sessionHandle === undefined)
			return undefined;
		if (!ports.sessionOverlay)
			throw new SessionAccessError();
		return ports.sessionOverlay(context);
	};
	return {
		async list(context) {
			const session = await overlay(context);
			const saved = (await pool(context)).safeList();
			return session ? [...saved, ...await session.list(context)] : saved;
		},
		async lease(context, id) {
			const session = await overlay(context);
			if (session && (await session.list(context)).some(c => c.key.id === id))
				return session.lease(context, id);
			return (await pool(context)).lease(id);
		},
		async withConnection(context, id, use) {
			const session = await overlay(context);
			if (session && (await session.list(context)).some(c => c.key.id === id))
				return session.withConnection(context, id, use);
			return (await pool(context)).withConnection(id, use);
		},
	};
}
export const savedConnectionResolver = createConnectionResolver();
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
		try {
			await pool.reload();
		}
		catch (err) {
			log.warn({ repoPath, err: (err as Error).message }, 'pool reload failed');
		}
	}
}
export async function closeAll(): Promise<void> {
	for (const pool of CACHE.values()) {
		try {
			await pool.closeAll();
		}
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
