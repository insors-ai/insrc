import type { Entity } from '../../shared/types.js';
import { rpc } from '../../cli/client.js';
import type { ContextProvider } from './types.js';

// ---------------------------------------------------------------------------
// Daemon-backed ContextProvider
//
// Connects to the insrc daemon via Unix socket JSON-RPC to perform
// vector similarity search and graph traversal over indexed code entities.
//
// All methods degrade gracefully — returning empty results when the daemon
// is unreachable (e.g. not started, socket missing).
// ---------------------------------------------------------------------------

/**
 * Create a ContextProvider backed by the insrc daemon.
 *
 * This is the production implementation used by the pipeline when
 * the daemon is running and the repo has been indexed.
 */
export function createDaemonContextProvider(): ContextProvider {
  return {
    async search(query: string, limit = 10): Promise<Entity[]> {
      try {
        return await rpc<Entity[]>('search.query', { text: query, limit });
      } catch {
        return [];
      }
    },

    async expand(entityId: string): Promise<{ callers: Entity[]; callees: Entity[] }> {
      try {
        const [callers, callees] = await Promise.all([
          rpc<Entity[]>('search.callers', { entityId }),
          rpc<Entity[]>('search.callees', { entityId }),
        ]);
        return { callers, callees };
      } catch {
        return { callers: [], callees: [] };
      }
    },

    async byFile(filePath: string): Promise<Entity[]> {
      try {
        return await rpc<Entity[]>('search.by_file', { filePath });
      } catch {
        return [];
      }
    },

    async callersNhop(entityId: string, hops: number): Promise<Entity[]> {
      try {
        return await rpc<Entity[]>('search.callers_nhop', { entityId, hops });
      } catch {
        return [];
      }
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
