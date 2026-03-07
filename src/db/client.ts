import { Surreal } from 'surrealdb';
import { mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { SCHEMA_STATEMENTS } from './schema.js';

export type DbClient = Surreal;

let _db: Surreal | null = null;

/**
 * Opens (or returns the cached) SurrealDB connection.
 *
 * Uses surrealkv embedded storage at ~/.insrc/db/.
 * Only the daemon should call this — the CLI communicates via IPC.
 */
export async function getDb(): Promise<DbClient> {
  if (_db !== null) return _db;

  // Ensure the DB directory exists before connecting
  mkdirSync(PATHS.db, { recursive: true });

  const db = new Surreal();
  await db.connect(`surrealkv://${PATHS.db}`, {
    namespace: 'insrc',
    database:  'main',
  });

  _db = db;
  return db;
}

/**
 * Runs all schema DEFINE statements against the database.
 * Idempotent — safe to call on every daemon startup.
 */
export async function initDb(db: DbClient): Promise<void> {
  for (const stmt of SCHEMA_STATEMENTS) {
    await db.query(stmt);
  }
}

/**
 * Closes the database connection and clears the singleton.
 */
export async function closeDb(): Promise<void> {
  if (_db !== null) {
    await _db.close();
    _db = null;
  }
}
