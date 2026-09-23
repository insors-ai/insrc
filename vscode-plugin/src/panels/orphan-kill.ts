/**
 * Story E20260923401ae5fb:S006 / t3 — the consent-gated OrphanKill seam (sc9 Debug).
 *
 * The plugin-local kill for stray insrc daemon/mcp processes the Debug tab offers
 * to clean up. It is DELIBERATELY off the read-only DaemonDataGateway (which only
 * enumerates, S004) — killing is a mutation, gated behind sc4 consent in
 * extension.ts (k4). It MIRRORS the daemon CLI's `killOrphansWith`
 * (src/cli/services/debug.ts) but does NOT import it (k5 thin bundle). VS-Code-free
 * + reads only the local pidfile; over an injected kill/wait so the escalation is
 * unit-testable with no real signals.
 *
 * `createOrphanKill` acts ONLY on the explicitly-passed pids and re-excludes the
 * managed daemon (reported 'not-found'/skipped, defence-in-depth): SIGTERM every
 * target, wait one grace window, then SIGKILL only the survivors (liveness
 * re-probed via kill(pid,0)). Per-pid signal failures fold into that pid's
 * KillOutcome; the call never throws and no-ops off-POSIX. Outcomes are returned
 * in the input pid order.
 */

import { existsSync, readFileSync } from 'node:fs';

/** SIGTERM→SIGKILL grace window (ms), mirroring the CLI / daemon-ctl.sh stop drain. */
const KILL_GRACE_MS = 3_000;

/** One terminated pid's outcome, in the input order. */
export interface KillOutcome {
  readonly pid: number;
  readonly result: 'terminated' | 'forced' | 'not-found' | 'error';
}

/**
 * Injected dependencies for the kill. `kill(pid, 0)` is the liveness re-probe
 * (throws when the process is gone); `wait` is the escalation clock (instant in
 * tests); `managedPid` resolves the running daemon to exclude; `platform` gates
 * the POSIX-only support.
 */
export interface OrphanKillDeps {
  readonly kill: (pid: number, signal: NodeJS.Signals | 0) => void;
  readonly wait: (ms: number) => Promise<void>;
  readonly managedPid: () => number | undefined;
  readonly platform: NodeJS.Platform;
}

/** Classify a `process.kill` failure: ESRCH (no such process) → already gone. */
function killErrorResult(err: unknown): 'not-found' | 'error' {
  return (err as { code?: string } | null)?.code === 'ESRCH' ? 'not-found' : 'error';
}

/**
 * Best-effort managed daemon pid from the pidfile — undefined if absent /
 * non-numeric. Shared by the Debug renderer (to exclude the managed daemon from
 * the offered orphans) and this kill (defence-in-depth re-exclusion), so both
 * agree on what the managed process is. Never throws.
 */
export function readManagedPid(pidFile: string): number | undefined {
  try {
    if (!existsSync(pidFile)) return undefined;
    const n = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the consent-gated orphan kill over the injected signal/clock deps. The
 * returned fn terminates exactly the passed pids (never the managed daemon) and
 * resolves one KillOutcome per input pid, in order. Never throws; no-ops off-POSIX.
 */
export function createOrphanKill(deps: OrphanKillDeps): (pids: readonly number[]) => Promise<KillOutcome[]> {
  return async (pids: readonly number[]): Promise<KillOutcome[]> => {
    if (deps.platform === 'win32') {
      return pids.map((pid) => ({ pid, result: 'error' as const }));
    }
    const managed = deps.managedPid();
    const isManaged = (pid: number): boolean => managed !== undefined && pid === managed;
    const targets = pids.filter((pid) => !isManaged(pid));

    /** Terminal result per resolved target; `pending` awaits the grace window. */
    const result = new Map<number, KillOutcome['result']>();
    const pending: number[] = [];
    for (const pid of targets) {
      try {
        deps.kill(pid, 'SIGTERM');
        pending.push(pid);
      } catch (err) {
        result.set(pid, killErrorResult(err));
      }
    }

    if (pending.length > 0) {
      await deps.wait(KILL_GRACE_MS);
    }

    for (const pid of pending) {
      let alive = true;
      try {
        deps.kill(pid, 0);
      } catch {
        alive = false;
      }
      if (!alive) {
        result.set(pid, 'terminated');
        continue;
      }
      try {
        deps.kill(pid, 'SIGKILL');
        result.set(pid, 'forced');
      } catch (err) {
        // Gone between probe and SIGKILL counts as forced-terminated; else a real error.
        result.set(pid, killErrorResult(err) === 'not-found' ? 'forced' : 'error');
      }
    }

    // Managed pids are never signalled (k4/k5) — reported skipped as 'not-found'.
    return pids.map((pid) => ({ pid, result: isManaged(pid) ? 'not-found' : result.get(pid) ?? 'error' }));
  };
}
