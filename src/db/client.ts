/**
 * Daemon-side database client.
 *
 * Post-LMDB-migration this module is a thin sentinel. The actual
 * persistence layer lives in:
 *   - `db/graph/store.ts`   -- LMDB env + sub-DBs (graph + plans +
 *     conversations + todos + config)
 *   - `db/lance/conn.ts`    -- LanceDB connection (entity / session /
 *     turn / config vectors)
 *
 * Every public DB function (`upsertEntities`, `upsertRelations`,
 * `saveSession`, `getEntity`, ...) opens its own substrate handle
 * lazily via `getGraphStore()` / `getLanceConn()`. The `DbClient`
 * argument they accept is now an opaque sentinel kept only so callers
 * (indexer, RPC handlers, tools) don't need a coordinated signature
 * sweep at the same time as the substrate move.
 *
 * Phase 6.1 of plans/storage-migration-lmdb-lance.md gutted this file:
 * the legacy `DbClients { duck: GraphClient }` shape, the DuckDB
 * schema bootstrap in `initDb`, and the matching `closeDb` cache
 * reset are gone. `getDb`/`initDb`/`closeDb` survive as no-ops so the
 * caller-arg sweep can run on its own schedule.
 */

/**
 * Opaque sentinel. Public DB functions accept `DbClient | null`;
 * the value is unused. Kept for caller back-compat -- callers can be
 * migrated to drop the argument on their own schedule.
 */
export type DbClient = unknown;

/** Back-compat alias for code that imported `DbClients` (always shape-equivalent to `DbClient`). */
export type DbClients = DbClient;

const SENTINEL: DbClient = Object.freeze({});

/** Return the sentinel client. The actual substrates lazy-init on first use. */
export async function getDb(): Promise<DbClient> {
	return SENTINEL;
}

/** No-op. The LMDB env applies its own schema-version check on open. */
export async function initDb(_db: DbClient): Promise<void> {
	/* no-op */
}

/** No-op. Substrate close is handled by the daemon's shutdown handler via `closeGraphStore` + `closeLanceConn`. */
export async function closeDb(): Promise<void> {
	/* no-op */
}
