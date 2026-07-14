/**
 * LanceDB connection lazy-init singleton.
 *
 * Phase 3.1 of plans/storage-migration-lmdb-lance.md. Mirrors the
 * shape of `db/graph/store.ts`: lazy-init via `getLanceConn()`,
 * lifecycle close via `closeLanceConn()`, test-only path injection
 * via `setLanceConnPath()`.
 *
 * The connection backs four tables (created lazily by their owners):
 *   - `entity_vec`    -- entity embeddings + filter columns
 *                        (Phase 3.2; written by `db/entities.ts`)
 *   - `session_vec`   -- conversation-session embeddings
 *                        (Phase 3.3; written by `db/conversations.ts`)
 *   - `turn_vec`      -- conversation-turn embeddings
 *                        (Phase 3.3; written by `db/conversations.ts`)
 *   - `config_vec`    -- config-entry embeddings
 *                        (Phase 3.4; written by `config/store.ts`)
 *
 * All four tables share the same `embedding FLOAT[1024]` column shape
 * (post Phase 0.2 dim downshift). Per-table HNSW indexes are added
 * by the table owner once the row count justifies it (lazily; first
 * write doesn't pay the build cost).
 */

import { existsSync, mkdirSync } from 'node:fs';
import * as lancedb from '@lancedb/lancedb';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

const log = getLogger('lance-conn');

let _instance: lancedb.Connection | null = null;
let _initPromise: Promise<lancedb.Connection> | null = null;

/**
 * Backing-directory path. Defaults to `PATHS.lance` (`~/.insrc/lance/`).
 * Tests override via `setLanceConnPath()` to a tmpdir.
 */
let _path: string = PATHS.lance;

export function setLanceConnPath(path: string): void {
	_path = path;
}

/** Current backing-directory path (post any test override). */
export function getLanceConnPath(): string {
	return _path;
}

/**
 * Lazy-init the LanceDB connection. Concurrent first-callers share
 * the same init promise; on init failure the cached promise is
 * cleared so the next caller re-attempts.
 */
export async function getLanceConn(): Promise<lancedb.Connection> {
	if (_instance !== null) return _instance;
	if (_initPromise !== null) return _initPromise;

	_initPromise = (async (): Promise<lancedb.Connection> => {
		const t0 = Date.now();
		if (!existsSync(_path)) {
			mkdirSync(_path, { recursive: true });
		}
		const conn = await lancedb.connect(_path);
		log.info(
			{ initMs: Date.now() - t0, path: _path },
			'lance connection initialised',
		);
		_instance = conn;
		return conn;
	})();

	try {
		return await _initPromise;
	} catch (e) {
		_initPromise = null;
		throw e;
	}
}

/**
 * Close the connection. Called by the daemon's graceful-shutdown
 * handler. Errors are logged but not re-thrown.
 *
 * Note: `@lancedb/lancedb` connections don't expose an explicit
 * close()-with-flush in the public API; closing is best-effort.
 * The native handles get released when the JS object is GC'd.
 */
export async function closeLanceConn(): Promise<void> {
	const inst = _instance;
	_instance = null;
	_initPromise = null;
	if (inst === null) return;
	// Lance's connection doesn't have a public close() method that
	// returns a Promise; the underlying handles release on GC. We
	// simply drop the reference so the next getLanceConn() reopens
	// (e.g. against a new tmpdir path in tests).
	void inst;
}

/**
 * Open or create a Lance table. Wraps the listing + create / open
 * decision so callers don't need to repeat it. The seed row is used
 * only when creating the table (Lance requires schema inference from
 * a sample row); on subsequent opens the seed is ignored.
 */
export async function openOrCreateTable<T>(
	conn: lancedb.Connection,
	name: string,
	seedIfMissing: () => T[],
): Promise<lancedb.Table> {
	const tables = await conn.tableNames();
	if (tables.includes(name)) {
		return conn.openTable(name);
	}
	const seed = seedIfMissing();
	if (seed.length === 0) {
		throw new Error(
			`openOrCreateTable: cannot create '${name}' with empty seed; ` +
			`Lance needs a sample row to infer the schema`,
		);
	}
	// Lance's createTable typing requires Record<string, unknown>[] but
	// accepts any plain-object row at runtime. The cast is safe for
	// our typed seed rows.
	return conn.createTable(name, seed as unknown as Record<string, unknown>[]);
}
