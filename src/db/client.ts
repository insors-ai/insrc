import kuzu from 'kuzu';
import * as lancedb from '@lancedb/lancedb';
import { mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { KUZU_STATEMENTS } from './schema.js';

export interface DbClients {
  /** Kuzu property graph — Entity stubs, relations, and Repo registry */
  graph: kuzu.Connection;
  /** LanceDB connection — entity data with embeddings and BM25 FTS */
  lance: lancedb.Connection;
}

export type DbClient = DbClients;

// Keep references alive to prevent premature GC of the Kuzu Database object
let _kuzuDb: kuzu.Database | null = null;
let _clients: DbClients | null = null;

/**
 * Opens (or returns the cached) Kuzu + LanceDB connections.
 * Only the daemon should call this — the CLI communicates via IPC.
 */
export async function getDb(): Promise<DbClients> {
  if (_clients !== null) return _clients;

  mkdirSync(PATHS.graph, { recursive: true });
  mkdirSync(PATHS.lance, { recursive: true });

  _kuzuDb = new kuzu.Database(PATHS.graph);
  const graph = new kuzu.Connection(_kuzuDb);
  const lance = await lancedb.connect(PATHS.lance);

  _clients = { graph, lance };
  return _clients;
}

/**
 * Runs all Kuzu DDL statements and ensures LanceDB tables exist.
 * Idempotent — safe to call on every daemon startup.
 */
export async function initDb(db: DbClients): Promise<void> {
  for (const stmt of KUZU_STATEMENTS) {
    await db.graph.query(stmt);
  }
}

/**
 * Clears the singleton references.
 * Note: do NOT call kuzu close() — the 0.11.x Node.js binding segfaults on
 * explicit close; GC handles cleanup safely.
 */
export async function closeDb(): Promise<void> {
  _clients = null;
  _kuzuDb  = null;
}
