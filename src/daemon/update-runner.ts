/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon self-update runner (Story S001 / sc1 — the DaemonUpdateRestart IPC).
 *
 * A daemon cannot rebuild-and-respawn itself in-process: the update rebuilds
 * the very code it is running and the restart severs the request socket. So
 * `daemon.update` does NOT try to restart synchronously. It spawns a DETACHED,
 * unref'd helper — a fresh node process running THIS module as an entry — that
 * outlives the daemon's own exit, runs the proven `daemon-ctl.sh restart`
 * (fetch + ff-merge + rebuild + stop-stale + spawn + wait-ready) once, and on
 * completion writes a {@link DaemonUpdateOutcome} record the restarted daemon
 * surfaces via `daemon.updateOutcome`. The daemon itself never reimplements the
 * pull/rebuild/restart sequence (k2); the helper wraps daemon-ctl.sh (k3).
 *
 * The launch + outcome logic is factored behind injected seams so it is unit-
 * testable without spawning a real process or restarting a real daemon —
 * mirroring the JetBrains DaemonProvisioner (captures the spawned command +
 * treats failures as captured, not thrown).
 */

import { spawn as nodeSpawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PATHS } from '../shared/paths.js';
import { getLogger } from '../shared/logger.js';
import type { DaemonUpdateOutcome, DaemonUpdateResult } from '../shared/types.js';

const log = getLogger('daemon-update');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Where the installed daemon checkout lives. Mirrors
 *  `cli/services/maintenance.ts` DAEMON_ROOT so both resolve the same tree. */
export const DAEMON_ROOT = process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon');

/** A marker older than this (or whose pid is dead) is treated as stale and
 *  ignored, so a crashed helper never blocks updates forever — mirroring the
 *  daemon-ctl.sh pidfile staleness idiom. */
const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

/** Shape persisted to PATHS.updateLock while an update helper is in flight. */
interface UpdateLock {
  pid:       number;
  startedAt: number; // epoch ms
}

/** The subset of a spawned child the launcher needs — kept minimal so a fake
 *  spawn can satisfy it in tests. */
export interface SpawnedChild {
  readonly pid?: number | undefined;
  unref(): void;
}

/** Injectable spawn seam (mirrors node:child_process spawn's shape). */
export type SpawnFn = (command: string, args: readonly string[], options: Record<string, unknown>) => SpawnedChild;

/** Injected dependencies for the runner — every side-effecting boundary is a
 *  seam so the unit tests never touch a real process, socket, or ~/.insrc. */
export interface UpdateRunnerDeps {
  /** spawn the detached helper (default: node:child_process spawn). */
  spawn?:        SpawnFn;
  /** the installed daemon checkout root (default: DAEMON_ROOT). */
  daemonRoot?:   string;
  /** where the terminal outcome record is read/written (default: PATHS.updateOutcome). */
  outcomePath?:  string;
  /** the concurrent-launch marker file (default: PATHS.updateLock). */
  lockPath?:     string;
  /** clock, for the marker timestamp + staleness check (default: Date.now). */
  now?:          () => number;
  /** liveness probe for the marker's pid (default: process.kill(pid, 0)). */
  isPidAlive?:   (pid: number) => boolean;
  /** how old a marker may get before it is treated as stale (default 10 min). */
  staleAfterMs?: number;
  /** open the child's stdout/stderr sink (default: append PATHS.daemonLog);
   *  a test injects `() => 'ignore'` to avoid touching the real log. */
  openLog?:      () => number | 'ignore';
}

function defaultIsPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function defaultOpenLog(): number | 'ignore' {
  try {
    mkdirSync(PATHS.logDir, { recursive: true });
    return openSync(PATHS.daemonLog, 'a');
  } catch {
    return 'ignore';
  }
}

/** Resolve the daemon-ctl.sh helper under the daemon root, or throw the
 *  launch-failure error when neither the root nor the script is present. */
function resolveDaemonCtl(root: string): string {
  const script = join(root, 'scripts', 'daemon-ctl.sh');
  if (!existsSync(root) || !existsSync(script)) {
    throw new Error('daemon.update: cannot locate daemon root / helper');
  }
  return script;
}

/** Read the in-flight marker, deciding whether an update is genuinely running.
 *  A missing / unparseable / stale (dead-pid or aged) marker means "not in
 *  progress" — and a stale one is cleared as a side effect so it can't wedge. */
function isUpdateInProgress(deps: Required<Pick<UpdateRunnerDeps, 'lockPath' | 'now' | 'isPidAlive' | 'staleAfterMs'>>): boolean {
  let lock: UpdateLock;
  try {
    lock = JSON.parse(readFileSync(deps.lockPath, 'utf-8')) as UpdateLock;
  } catch {
    return false; // absent or unparseable → not in progress
  }
  const aged = (deps.now() - lock.startedAt) >= deps.staleAfterMs;
  const alive = typeof lock.pid === 'number' && deps.isPidAlive(lock.pid);
  if (alive && !aged) return true;
  // Stale marker: drop it so a fresh update is not permanently blocked.
  try { rmSync(deps.lockPath, { force: true }); } catch { /* best-effort */ }
  return false;
}

/**
 * Launch the detached update+restart helper. Returns a LAUNCH acknowledgement
 * ({@link DaemonUpdateResult}) — NOT the terminal outcome (the socket drops when
 * the daemon restarts). Throws (framed by the server as `result.error`) when the
 * daemon root/helper cannot be resolved, or when an update is already in flight.
 * On success the daemon should begin its own shutdown so the helper's stop+start
 * step is clean.
 */
export function launchUpdate(deps: UpdateRunnerDeps = {}): DaemonUpdateResult {
  const spawnFn      = deps.spawn        ?? (nodeSpawn as unknown as SpawnFn);
  const root         = deps.daemonRoot   ?? DAEMON_ROOT;
  const lockPath     = deps.lockPath     ?? PATHS.updateLock;
  const now          = deps.now          ?? Date.now;
  const isPidAlive   = deps.isPidAlive   ?? defaultIsPidAlive;
  const staleAfterMs = deps.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const openLog      = deps.openLog      ?? defaultOpenLog;

  // 1. Resolve the helper FIRST — a missing root/script fails the launch with
  //    nothing started and no marker written.
  const daemonCtl = resolveDaemonCtl(root);

  // 2. Concurrent-launch guard — reject a second update while one is in flight.
  if (isUpdateInProgress({ lockPath, now, isPidAlive, staleAfterMs })) {
    throw new Error('daemon.update: update already in progress');
  }

  // 3. Spawn the DETACHED helper: a fresh node process running THIS module as an
  //    entry, carrying forward this daemon's loader flags (tsx in dev, none in
  //    prod) so it resolves the same way. It outlives our own exit and runs
  //    `daemon-ctl.sh restart`, then writes the outcome + clears the marker.
  const sink = openLog();
  const child = spawnFn(
    process.execPath,
    [...process.execArgv, __filename, daemonCtl, 'restart'],
    {
      detached: true,
      stdio: ['ignore', sink, sink],
      env: { ...process.env },
    },
  );
  child.unref();
  // The child holds its own dup of the log fd; close ours so it does not leak
  // for the ~250 ms until this daemon exits.
  if (typeof sink === 'number') {
    try { closeSync(sink); } catch { /* best-effort */ }
  }

  // 4. Record the in-flight marker keyed on the helper's pid so a later launch
  //    is rejected until it clears (or ages out).
  try {
    const marker: UpdateLock = { pid: child.pid ?? process.pid, startedAt: now() };
    writeFileSync(lockPath, JSON.stringify(marker), 'utf-8');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'daemon.update: failed to write update marker (continuing)');
  }

  log.info({ daemonCtl, pid: child.pid }, 'daemon.update: spawned detached update+restart helper');
  return { launched: true, message: `updating + restarting daemon (${daemonCtl} restart)` };
}

/**
 * Read the last persisted update outcome, or null when none exists. Best-effort
 * and never throws — a missing or unparseable record answers null, mirroring the
 * never-throw guarantee of daemon.status and the pure read of daemon.debug-status.
 */
export function readUpdateOutcome(deps: UpdateRunnerDeps = {}): DaemonUpdateOutcome | null {
  const outcomePath = deps.outcomePath ?? PATHS.updateOutcome;
  try {
    const raw = JSON.parse(readFileSync(outcomePath, 'utf-8')) as DaemonUpdateOutcome;
    if (raw && (raw.state === 'succeeded' || raw.state === 'failed') && typeof raw.finishedAt === 'string') {
      return raw;
    }
    return null;
  } catch {
    return null; // absent (ENOENT) or unparseable → null
  }
}

/**
 * Persist a terminal outcome and clear the in-flight marker. Called by the
 * detached helper on completion/failure. Best-effort on the marker removal so a
 * failed unlink never masks the recorded outcome.
 */
export function writeUpdateOutcome(outcome: DaemonUpdateOutcome, deps: UpdateRunnerDeps = {}): void {
  const outcomePath = deps.outcomePath ?? PATHS.updateOutcome;
  const lockPath    = deps.lockPath    ?? PATHS.updateLock;
  writeFileSync(outcomePath, JSON.stringify(outcome), 'utf-8');
  try { rmSync(lockPath, { force: true }); } catch { /* best-effort */ }
}

/**
 * The detached helper body: run `daemon-ctl.sh restart`, capture its exit code
 * and a tail of stderr, and record the outcome. Failures are CAPTURED (never
 * thrown) and recorded as state:'failed' with the raw error — no retry, no
 * rollback (k5). Resolves once the outcome has been written.
 */
export function runDetachedUpdate(daemonCtl: string, deps: UpdateRunnerDeps = {}, subcommand = 'restart'): Promise<DaemonUpdateOutcome> {
  const spawnFn = deps.spawn ?? (nodeSpawn as unknown as SpawnFn);
  return new Promise<DaemonUpdateOutcome>((resolveP) => {
    let stderrTail = '';
    const finish = (state: DaemonUpdateOutcome['state'], error?: string): void => {
      const outcome: DaemonUpdateOutcome = {
        state,
        ...(error !== undefined ? { error } : {}),
        finishedAt: new Date().toISOString(),
      };
      try { writeUpdateOutcome(outcome, deps); } catch { /* best-effort — outcome is the point */ }
      resolveP(outcome);
    };
    // `bash <daemon-ctl.sh> <subcommand>` — the one proven update+build+respawn.
    const child = spawnFn('bash', [daemonCtl, subcommand], { stdio: ['ignore', 'pipe', 'pipe'] }) as SpawnedChild & {
      stderr?: { on(ev: 'data', cb: (c: Buffer) => void): void };
      on(ev: 'error' | 'close', cb: (arg: unknown) => void): void;
    };
    child.stderr?.on('data', (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-2000); });
    child.on('error', (err) => finish('failed', (err as Error).message));
    child.on('close', (code) => {
      if (code === 0) finish('succeeded');
      else finish('failed', stderrTail.trim() || `daemon-ctl.sh restart exited with code ${String(code)}`);
    });
  });
}

/** Handler seams the daemon.update / daemon.updateOutcome handlers depend on —
 *  injected so the integration tests never spawn a real helper or exit the
 *  test process. */
export interface UpdateHandlerDeps {
  launch:           (deps?: UpdateRunnerDeps) => DaemonUpdateResult;
  readOutcome:      (deps?: UpdateRunnerDeps) => DaemonUpdateOutcome | null;
  /** Fire the daemon's own shutdown AFTER a successful launch, so the helper's
   *  stop+start step is clean. Never called when the launch throws. */
  scheduleShutdown: () => void;
}

/** Build the two sc1 IPC handlers over injected seams, ready to spread into the
 *  daemon handler map. `daemon.update` throws (→ result.error) on a guard/resolve
 *  failure and only schedules shutdown once a launch has succeeded. */
export function makeUpdateHandlers(deps: UpdateHandlerDeps): {
  'daemon.update': (params?: unknown) => Promise<DaemonUpdateResult>;
  'daemon.updateOutcome': () => Promise<DaemonUpdateOutcome | null>;
} {
  return {
    'daemon.update': async () => {
      const result = deps.launch(); // throws on guard/resolve → framed as result.error
      deps.scheduleShutdown();      // only reached when the launch succeeded
      return result;
    },
    'daemon.updateOutcome': async () => deps.readOutcome(),
  };
}

// ---------------------------------------------------------------------------
// Detached-helper entry: `node [loader flags] update-runner.js <daemonCtl> restart`
// ---------------------------------------------------------------------------
// When this module is spawned as a process entry (by launchUpdate), run the
// helper against the daemon-ctl.sh path passed in argv. Guarded so importing
// the module (in the daemon or in tests) never triggers it.
const invokedEntry = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedEntry === __filename && process.argv[2]) {
  const daemonCtl = process.argv[2];
  const subcommand = process.argv[3] ?? 'restart';
  void runDetachedUpdate(daemonCtl, {}, subcommand).then((outcome) => {
    log.info({ outcome }, 'daemon.update helper finished');
    process.exit(outcome.state === 'succeeded' ? 0 : 1);
  });
}
