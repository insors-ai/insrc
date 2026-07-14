/**
 * DuckDB process-wide singleton -- the IN-MEMORY query engine.
 *
 * plans/data-driver-duckdb-files.md Phase 0.2.
 *
 * **Scope.** This singleton is the *query engine* used by the data
 * drivers (CSV / JSON / JSONL / Parquet / .arrow attaches) and the
 * `db_file_aggregate` tool. The source files are the source of truth;
 * DuckDB attaches them at query time and the in-memory state is
 * disposable. Persistence would just bloat the file with stale
 * cached views.
 *
 * **NOT for storage.** Graph + entity rows + conversations + todos +
 * config-store live in LMDB (`db/graph/store.ts`); embeddings live in
 * LanceDB (`db/lance/conn.ts`). DuckDB no longer has a persistent
 * substrate role -- this singleton is read-only ad-hoc query against
 * user-supplied files.
 *
 * Lifecycle: lazy-init singleton, daemon-lifetime. The first call to
 * `getDuckDB()` opens an in-memory DuckDB instance, sets the memory
 * cap (`PRAGMA memory_limit`), loads the `arrow` extension (used by
 * the data-driver's `.arrow` file reader -- see
 * `daemon/db/drivers/duckdb-file.ts`), then locks down further
 * extension installs / network access. Subsequent calls share the
 * instance; concurrent first-callers collapse onto the same init
 * promise. Closed in the daemon's graceful-shutdown handler.
 *
 * Per-query: `withConnection<T>(fn)` is the canonical entry point.
 * DuckDB Connections are sub-millisecond; we acquire a fresh one per
 * query for isolation + per-query cancel and close it before the
 * helper returns.
 *
 * Memory: the `memory_limit` PRAGMA is a per-query CAP, not a
 * reservation. Idle resident size is ~50-100 MB (prepared-statement
 * cache + extension binaries); under-load usage scales up to the
 * cap. Bumpable via `~/.insrc/config.json` `duckdb.memoryMb`.
 */

import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('duckdb-pool');

// 2 GB default. Aggregate-class skills over JSON / directory globs hold
// the column buffers in memory while scanning, and 512 MB was too tight
// for real workloads (the data-analyzer's quality skills OOM'd on a
// ~30-file GRN directory). Configurable via daemon settings
// (`duckdb.memoryMb`); env-var override (`INSRC_DUCKDB_MEMORY_MB`) is
// provided as an escape hatch for ops scenarios without a config push.
const DEFAULT_MEMORY_MB = 2048;

let _instance: DuckDBInstance | null = null;
let _initPromise: Promise<DuckDBInstance> | null = null;

/**
 * Lazy-init the in-memory query-engine singleton. Concurrent first-
 * callers share the same init promise so the Database is created
 * exactly once even when two skills hit `getDuckDB()` in parallel on
 * a cold daemon.
 *
 * On init failure the cached promise is cleared so the next caller
 * re-attempts (avoids permanently-rejected-promise reuse). Production
 * callers should not need to inspect the failure -- the underlying
 * driver / converter surfaces the SQL error from the first query
 * after a failed init.
 */
export async function getDuckDB(): Promise<DuckDBInstance> {
  if (_instance !== null) return _instance;
  if (_initPromise !== null) return _initPromise;

  _initPromise = (async (): Promise<DuckDBInstance> => {
    const t0 = Date.now();
    const memoryMb = readMemoryBudget();
    // `:memory:` ensures no on-disk DuckDB state is created. The
    // file-backed storage layer for graph + user state is LMDB +
    // Lance (db/graph/store.ts + db/lance/conn.ts).
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();
    try {
      // Per-query buffer-pool cap. Sized in the plan; user can override.
      await conn.run(`SET memory_limit = '${memoryMb}MB'`);
      // Load the `arrow` extension FIRST -- INSTALL touches the
      // filesystem (downloads / unpacks the .duckdb_extension binary),
      // which the lockdown below would block. Best-effort: missing
      // extension is non-fatal at startup; .arrow file connections
      // will surface the failure on first query.
      try {
        await conn.run('INSTALL arrow');
        await conn.run('LOAD arrow');
      } catch (e) {
        log.warn(
          { err: errMessage(e) },
          'arrow extension unavailable; .arrow file connections will fail to read until installed',
        );
      }
      // Security model on the QUERY pool:
      // - This is the in-memory query engine the data-driver uses for
      //   `read_csv_auto` / `read_json_auto` / `read_parquet` /
      //   `read_arrow` over user-configured file connections.
      //   `enable_external_access=false` would block those reads
      //   (DuckDB treats local files as "external"), so the flag is
      //   NOT set here -- file access is gated by the data-driver's
      //   path-resolution + access-gate layer instead, which validates
      //   every path before it reaches DuckDB.
      // - We DO refuse network / DB-attach surface by not installing
      //   the `httpfs`, `postgres`, `mysql`, `sqlite` extensions.
      //   With `enable_extension_autoinstall=false` set below, even
      //   user-supplied SQL can't pull them in at runtime.
      // - There's no persistent DuckDB pool any more (LMDB + Lance
      //   handle storage post-Phase-6.1). This is the only DuckDB
      //   instance left; its sole job is read-only attaches against
      //   user files.
      try {
        await conn.run('SET autoinstall_known_extensions = false');
        await conn.run('SET autoload_known_extensions = false');
      } catch (e) {
        log.warn(
          { err: errMessage(e) },
          'extension auto-install/load could not be disabled; httpfs / postgres attaches still blocked by NOT being installed',
        );
      }
    } finally {
      conn.disconnectSync();
    }
    log.info({ initMs: Date.now() - t0, memoryMb }, 'duckdb singleton initialised');
    _instance = instance;
    return instance;
  })();

  try {
    return await _initPromise;
  } catch (e) {
    // Clear the cached promise so the next caller can retry instead
    // of awaiting a permanently-rejected promise.
    _initPromise = null;
    throw e;
  }
}

/**
 * Close the singleton. Called by the daemon's graceful-shutdown
 * handler. The query-engine DB has no on-disk state to flush, so
 * close is fast. Errors during close are logged but not re-thrown
 * -- the daemon is on the way down anyway.
 */
export async function closeDuckDB(): Promise<void> {
  const inst = _instance;
  _instance = null;
  _initPromise = null;
  if (inst === null) return;
  try {
    inst.closeSync();
  } catch (e) {
    log.warn({ err: errMessage(e) }, 'duckdb close failed');
  }
}

/**
 * Acquire a fresh Connection, run `fn` against it, close the
 * Connection. The canonical entry point for any DuckDB usage in the
 * daemon: file-driver reads, converter writes, the
 * `db_file_aggregate` tool. Every callsite goes through this helper
 * so query isolation + cleanup stay consistent.
 *
 * Connections are cheap (sub-millisecond). The Database singleton is
 * shared; only the per-call Connection state lives inside `fn`.
 */
export async function withConnection<T>(
  fn: (conn: DuckDBConnection) => Promise<T>,
): Promise<T> {
  const instance = await getDuckDB();
  const conn = await instance.connect();
  try {
    return await fn(conn);
  } finally {
    conn.disconnectSync();
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function readMemoryBudget(): number {
  // Env-var override is the primary path for ops; daemon-config push
  // (Phase 4 of this plan integrates the `duckdb.memoryMb` setting
  // into ~/.insrc/config.json) lands later. Until then env-var is
  // sufficient for tuning. Default 512 MB.
  const raw = process.env['INSRC_DUCKDB_MEMORY_MB'];
  if (raw === undefined || raw.length === 0) return DEFAULT_MEMORY_MB;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 64) {
    log.warn({ raw }, 'INSRC_DUCKDB_MEMORY_MB invalid; falling back to default');
    return DEFAULT_MEMORY_MB;
  }
  return parsed;
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
