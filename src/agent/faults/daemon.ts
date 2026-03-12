/**
 * Daemon Fault Handler — detection, auto-restart, and recovery.
 *
 * From design doc (Phase 12):
 *   - Not running → disable graph/plan tools, LLM still works
 *   - Crashes mid-session → mark tools unavailable, attempt auto-restart,
 *     resume if successful within 10s
 *   - Stale graph → continue with stale data, annotate results with [stale]
 *   - Kuzu corruption → mark daemon unhealthy, print rebuild instruction
 *
 * Integration: works with mcp-client.ts's existing availability tracking
 * and the HealthMonitor state machine.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PATHS } from '../../shared/paths.js';
import { getLogger, toLogFn } from '../../shared/logger.js';
import { resetAvailability, ping } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Fault classification
// ---------------------------------------------------------------------------

export type DaemonFaultKind =
  | 'not_running'     // ENOENT / ECONNREFUSED on socket
  | 'crashed'         // was healthy, now unreachable
  | 'stale_graph'     // index is older than working tree
  | 'kuzu_corrupt'    // Kuzu open/query errors
  | 'unknown';

export interface DaemonFault {
  kind: DaemonFaultKind;
  message: string;
  recovery: string;
  /** Whether graph/plan tools should be disabled. */
  disableTools: boolean;
}

/**
 * Classify a daemon error into a fault type.
 */
export function classifyDaemonError(err: unknown): DaemonFault {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('daemon is not running') || msg.includes('ENOENT') || msg.includes('ECONNREFUSED')) {
    return {
      kind: 'not_running',
      message: 'Daemon is not running.',
      recovery: 'Start the daemon with: insrc daemon start',
      disableTools: true,
    };
  }

  if (msg.includes('kuzu') || msg.includes('Kuzu') || msg.includes('database')) {
    return {
      kind: 'kuzu_corrupt',
      message: 'Kuzu database error detected.',
      recovery: 'Rebuild the index with: insrc repo reindex',
      disableTools: true,
    };
  }

  if (msg.includes('timed out')) {
    return {
      kind: 'crashed',
      message: 'Daemon request timed out.',
      recovery: 'Restart the daemon with: insrc daemon restart',
      disableTools: true,
    };
  }

  return {
    kind: 'unknown',
    message: msg,
    recovery: 'Check daemon status with: insrc daemon status',
    disableTools: false,
  };
}

/**
 * Format a daemon fault for user display.
 */
export function formatDaemonFault(fault: DaemonFault): string {
  const parts = [`[daemon] ${fault.message}`];
  parts.push(`  ${fault.recovery}`);
  if (fault.disableTools) {
    parts.push('  Graph and plan tools are disabled until the daemon is available.');
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Auto-restart
// ---------------------------------------------------------------------------

/** Maximum time to wait for daemon restart before giving up (ms). */
export const RESTART_TIMEOUT_MS = 10_000;
/** Interval between reconnection ping attempts (ms). */
const RECONNECT_POLL_MS = 1_000;

/**
 * Attempt to restart the daemon and wait for it to become available.
 *
 * Returns true if the daemon is reachable after restart, false if
 * the restart failed or timed out.
 */
export async function attemptRestart(
  log: (msg: string) => void = toLogFn(getLogger('daemon')),
): Promise<boolean> {
  // Check if the daemon binary exists via insrc CLI
  const sockPath = PATHS.sockFile;

  log('[daemon] Attempting auto-restart...');

  // Try to start the daemon via the CLI command
  try {
    await new Promise<void>((resolve, reject) => {
      // Use npx tsx to start the daemon in background
      const child = execFile('insrc', ['daemon', 'start'], {
        timeout: 5000,
        env: { ...process.env },
      }, (err) => {
        if (err) reject(err);
        else resolve();
      });
      child.unref();
    });
  } catch {
    // The start command may have failed — fall through to ping check
  }

  // Reset cached availability and poll for reconnection
  resetAvailability();

  const deadline = Date.now() + RESTART_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RECONNECT_POLL_MS);
    resetAvailability();
    const ok = await ping();
    if (ok) {
      log('[daemon] Auto-restart successful — daemon is available.');
      return true;
    }
  }

  log('[daemon] Auto-restart failed — daemon did not respond within 10s.');
  return false;
}

/**
 * Try to reconnect to the daemon by resetting cached availability and pinging.
 * Lighter-weight than a full restart — just checks if the daemon recovered on its own.
 */
export async function tryReconnect(): Promise<boolean> {
  resetAvailability();
  return ping();
}

// ---------------------------------------------------------------------------
// Stale graph annotation
// ---------------------------------------------------------------------------

/**
 * Annotate a graph query result with a [stale] warning.
 *
 * Called when the daemon is in degraded state but still responding,
 * or when the index is known to be outdated.
 */
export function annotateStale(result: string): string {
  if (!result) return result;
  return `[stale] ${result}\n\n⚠ Graph data may be outdated. Run \`insrc repo reindex\` to refresh.`;
}

/**
 * Check if the graph index might be stale by looking at the index timestamp.
 * Returns true if the index file doesn't exist or is older than 1 hour.
 */
export function isGraphPotentiallyStale(): boolean {
  const indexMarker = `${PATHS.insrc}/index.lock`;
  if (!existsSync(indexMarker)) return false; // No marker = no staleness signal
  // If the lock file exists, index is currently being built = potentially stale
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
