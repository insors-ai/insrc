import { assertNoSessionPersistence } from '../../shared/connection-persistence.js';
/**
 * LanceDB connection lazy-init singleton.
 *
 * Phase 3.1 of docs/plans/storage-migration-lmdb-lance.md. Mirrors the
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
import { isLiveStoreOwnerDeclared, resolveStorePath } from '../graph/store.js';

const log = getLogger('lance-conn');

let _instance: lancedb.Connection | null = null;
let _initPromise: Promise<lancedb.Connection> | null = null;

/**
 * Backing-directory path. Defaults to `PATHS.lance` (`~/.insrc/lance/`).
 * Tests override via `setLanceConnPath()` to a tmpdir.
 */
let _path: string = PATHS.lance;

export function setLanceConnPath(path: string): void {
	assertNoSessionPersistence();
	_path = path;
}

/** Current backing-directory path (post any test override). */
export function getLanceConnPath(): string {
	assertNoSessionPersistence();
	return _path;
}

/**
 * This process may not open the live vector store: only the insrc daemon
 * owns it (Epic c2ba6fa6, Story s11, ac7), as Story s4 made true of the graph
 * store. Thrown before the directory is created or connected.
 */
export class LanceStoreNotOwnerError extends Error {
	readonly code = 'lance-not-owner';
	constructor(path: string) {
		super(
			`Refusing to open the live vector store at '${path}': only the insrc daemon may open it. ` +
			`A test must set a temporary store with setLanceConnPath(); any other code must ask the daemon over its socket.`,
		);
		this.name = 'LanceStoreNotOwnerError';
	}
}

/**
 * Lazy-init the LanceDB connection. Concurrent first-callers share
 * the same init promise; on init failure the cached promise is
 * cleared so the next caller re-attempts.
 */
export async function getLanceConn(): Promise<lancedb.Connection> {
	assertNoSessionPersistence();
	if (_instance !== null) return _instance;
	if (_initPromise !== null) return _initPromise;
	// Before anything touches the path: no directory, no connection.
	if (!isLiveStoreOwnerDeclared() && resolveStorePath(_path) === resolveStorePath(PATHS.lance)) {
		throw new LanceStoreNotOwnerError(_path);
	}

	_initPromise = (async (): Promise<lancedb.Connection> => {
		const t0 = Date.now();
		if (!existsSync(_path)) {
			mkdirSync(_path, { recursive: true });
		}
		// Strong read consistency: every read checks for writes committed through
		// another connection, which is what another daemon thread holds (Epic
		// 86197ac6, s1). Writes were always consistent.
		const conn = await lancedb.connect(_path, { readConsistencyInterval: 0 });
		log.info(
			{ initMs: Date.now() - t0, path: _path },
			'lance connection initialised',
		);
		_instance = guardLanceHandle(conn);
		return _instance;
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
	assertNoSessionPersistence();
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
	assertNoSessionPersistence();
	const tables = await conn.tableNames();
	if (tables.includes(name)) {
		return guardLanceHandle(await conn.openTable(name));
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
	return guardLanceHandle(await conn.createTable(name, seed as unknown as Record<string, unknown>[]));
}


const lanceHandles = new WeakMap<object, object>();
/** A connection/table captured by Saved code cannot be used later as a Session sink. */
function guardLanceHandle<T extends object>(raw: T): T {
	const existing = lanceHandles.get(raw);
	if (existing) return existing as T;
	const methods = new Map<PropertyKey, unknown>();
	const guarded = new Proxy(raw, {
		get(target, property) {
			assertNoSessionPersistence();
			const value = Reflect.get(target, property, target);
			if (typeof value !== 'function') return value;
			if (!methods.has(property)) methods.set(property, (...args: unknown[]) => {
				assertNoSessionPersistence();
				const result = value.apply(target, args);
				const protect = (value: unknown): unknown => {
					if (value === null || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Date || value instanceof Map || value instanceof Set) return value;
					const prototype = Object.getPrototypeOf(value);
					return prototype === null || prototype === Object.prototype ? value : guardLanceHandle(value);
				};
				return result instanceof Promise ? result.then(protect) : protect(result);
			});
			return methods.get(property);
		},
		set(target, property, value) { assertNoSessionPersistence(); return Reflect.set(target, property, value, target); },
	});
	lanceHandles.set(raw, guarded);
	lanceHandles.set(guarded, guarded);
	return guarded;
}
