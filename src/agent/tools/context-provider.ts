import type { Entity } from '../../shared/types.js';
import { rpc } from '../../cli/client.js';

// ---------------------------------------------------------------------------
// Daemon-backed ContextProvider
//
// Connects to the insrc daemon via Unix socket JSON-RPC to perform
// vector similarity search and graph traversal over indexed code entities.
//
// Errors propagate to the caller — the daemon must be running.
// Use createNullContextProvider() for testing without a daemon.
// ---------------------------------------------------------------------------

export interface ContextProvider {
  /** Vector similarity search — returns entities ranked by relevance. */
  search(query: string, limit?: number, filter?: 'all' | 'code' | 'artifact'): Promise<Entity[]>;

  /** 1-hop graph expansion: callers and callees of an entity. */
  expand(entityId: string): Promise<{ callers: Entity[]; callees: Entity[] }>;

  /** All entities in a specific file. */
  byFile(filePath: string): Promise<Entity[]>;

  /** N-hop caller traversal (for refactor-style deep impact analysis). */
  callersNhop?(entityId: string, hops: number): Promise<Entity[]>;
}

/**
 * Verify the daemon is reachable by issuing a lightweight RPC call.
 * Throws with a descriptive message if the daemon is not running.
 */
export async function assertDaemonReachable(): Promise<void> {
  await rpc('daemon.status');
}

/**
 * Create a ContextProvider backed by the insrc daemon.
 *
 * This is the production implementation used when the daemon is running
 * and the repo has been indexed.
 *
 * Errors are NOT swallowed — callers must handle daemon unavailability.
 */
export function createDaemonContextProvider(): ContextProvider {
  return {
    async search(query: string, limit = 10, filter: 'all' | 'code' | 'artifact' = 'all'): Promise<Entity[]> {
      return rpc<Entity[]>('search.query', { text: query, limit, filter });
    },

    async expand(entityId: string): Promise<{ callers: Entity[]; callees: Entity[] }> {
      const [callers, callees] = await Promise.all([
        rpc<Entity[]>('search.callers', { entityId }),
        rpc<Entity[]>('search.callees', { entityId }),
      ]);
      return { callers, callees };
    },

    async byFile(filePath: string): Promise<Entity[]> {
      return rpc<Entity[]>('search.by_file', { filePath });
    },

    async callersNhop(entityId: string, hops: number): Promise<Entity[]> {
      return rpc<Entity[]>('search.callers_nhop', { entityId, hops });
    },
  };
}

/**
 * No-op ContextProvider — returns empty results for all queries.
 * Used when the daemon is not available or for testing.
 */
export function createNullContextProvider(): ContextProvider {
  return {
    async search() { return []; },
    async expand() { return { callers: [], callees: [] }; },
    async byFile() { return []; },
    async callersNhop() { return []; },
  };
}
