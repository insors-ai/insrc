import { createConnection, type Socket } from 'node:net';
import type { IpcRequest, IpcResponse } from '../../shared/types.js';
import { PATHS } from '../../shared/paths.js';

// ---------------------------------------------------------------------------
// MCP Client — connects to the insrc daemon via Unix socket
//
// Reuses the JSON-RPC protocol from src/cli/client.ts but adds:
//   - Connection health check (ping)
//   - Cached availability state
//   - Graceful degradation (returns error result when daemon down)
// ---------------------------------------------------------------------------

let _nextId = 1;
let _available: boolean | null = null; // null = unknown

/**
 * Send a JSON-RPC request to the daemon and return the result.
 * Throws if the daemon is not running or returns an error.
 */
async function rpcRaw<T = unknown>(method: string, params: unknown = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const socket: Socket = createConnection(PATHS.sockFile);
    let buffer = '';

    socket.on('connect', () => {
      const req: IpcRequest = { id: _nextId++, method, params };
      socket.write(JSON.stringify(req) + '\n');
    });

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line) as IpcResponse;
          socket.end();
          if (res.error) reject(new Error(res.error));
          else resolve(res.result as T);
        } catch {
          socket.end();
          reject(new Error('invalid response from daemon'));
        }
      }
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      _available = false;
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('daemon is not running'));
      } else {
        reject(err);
      }
    });

    // Timeout after 30s
    socket.setTimeout(30_000, () => {
      socket.destroy();
      reject(new Error('daemon request timed out'));
    });
  });
}

/**
 * Check if the daemon is reachable.
 * Caches the result until `resetAvailability()` is called.
 */
export async function ping(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    await rpcRaw('status');
    _available = true;
    return true;
  } catch {
    _available = false;
    return false;
  }
}

/**
 * Reset the cached availability state — called when reconnecting.
 */
export function resetAvailability(): void {
  _available = null;
}

/**
 * Whether the daemon was reachable on the last check.
 * Returns null if never checked.
 */
export function isAvailable(): boolean | null {
  return _available;
}

// ---------------------------------------------------------------------------
// Session lifecycle RPC helpers (Phase 5)
// ---------------------------------------------------------------------------

/** Persist a turn to daemon LanceDB (fire-and-forget). */
export async function sessionSave(turn: {
  sessionId: string; idx: number;
  user: string; assistant: string;
  entities: string[]; vector: number[];
}): Promise<void> {
  try { await rpcRaw('session.save', turn); } catch { /* daemon may be down */ }
}

/** Close a session: promote summary, delete raw turns. */
export async function sessionClose(params: {
  id: string; repo: string; summary: string;
  seenEntities: string[]; summaryVector: number[];
}): Promise<void> {
  try { await rpcRaw('session.close', params); } catch { /* daemon may be down */ }
}

/** Seed L2 from prior session summaries for the same repo. */
export async function sessionSeed(
  repo: string, queryVector: number[], limit = 3,
): Promise<Array<{ summary: string; createdAt: string }>> {
  try {
    return await rpcRaw('session.seed', { repo, queryVector, limit });
  } catch {
    return [];
  }
}

/** Delete all session summaries for a repo (for /forget). */
export async function sessionForget(repo: string): Promise<void> {
  try { await rpcRaw('session.forget', { repo }); } catch { /* ignore */ }
}

/** Trigger pruning job. */
export async function sessionPrune(): Promise<{ expired: number; capped: number }> {
  try {
    return await rpcRaw('session.prune');
  } catch {
    return { expired: 0, capped: 0 };
  }
}

// ---------------------------------------------------------------------------
// Plan graph RPC helpers (Phase 6)
// ---------------------------------------------------------------------------

import type { Plan, PlanStep, PlanStepStatus } from '../../shared/types.js';

/** Persist a plan and its steps to Kuzu. */
export async function planSave(plan: Plan): Promise<void> {
  try { await rpcRaw('plan.save', plan); } catch { /* daemon may be down */ }
}

/** Fetch a plan by ID or the active plan for a repo. */
export async function planGet(opts: { planId?: string; repoPath?: string }): Promise<Plan | null> {
  try {
    return await rpcRaw<Plan | null>('plan.get', opts);
  } catch {
    return null;
  }
}

/** Transition a plan step's status. */
export async function planStepUpdate(
  stepId: string, status: PlanStepStatus, note?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await rpcRaw('plan.step_update', { stepId, status, note });
  } catch {
    return { ok: false, error: 'daemon not available' };
  }
}

/** Get next unblocked step for a plan. */
export async function planNextStep(planId: string): Promise<PlanStep | null> {
  try {
    return await rpcRaw<PlanStep | null>('plan.next_step', { planId });
  } catch {
    return null;
  }
}

/** Delete a plan and all its steps. */
export async function planDelete(planId: string): Promise<void> {
  try { await rpcRaw('plan.delete', { planId }); } catch { /* ignore */ }
}

/** Reset stale in_progress locks to pending (crash recovery). */
export async function planResetStale(planId: string): Promise<number> {
  try {
    const result = await rpcRaw<{ reset: number }>('plan.reset_stale', { planId });
    return result.reset;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// MCP tool calls
// ---------------------------------------------------------------------------

/**
 * Send an MCP tool call to the daemon.
 *
 * Returns the result string on success, or an error message on failure.
 * Never throws — failures are returned as `{ isError: true }` results
 * to be fed back to the LLM.
 */
export async function mcpCall(
  toolName: string,
  input: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  try {
    const result = await rpcRaw<unknown>(toolName, input);
    _available = true;
    return {
      content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (err) {
    _available = false;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: `[MCP error] ${toolName}: ${msg}`,
      isError: true,
    };
  }
}
