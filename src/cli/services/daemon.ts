/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon service — the non-interactive operations the TUI's Daemon pane
 * drives. Pure data in / data out: no console output, no process.exit.
 * Extracted from the former `cli/commands/daemon.ts` commander actions.
 */

import { spawn } from 'node:child_process';
import { existsSync, openSync, mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { rpc } from '../client.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus } from '../../shared/types.js';
import { captureDaemon, cleanupStoppedDaemon, waitForReady, waitForStop } from './lifecycle.js';

import type { CapturedDaemon } from './lifecycle.js';
import type { StopTarget } from '../../shared/daemon-process-client.js';
import { runFileGuardConflict } from '../../shared/daemon-run-files.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Daemon entry point relative to this compiled file (out/cli/services).
 *  Exported so the debug service (Story s3) matches orphan daemon processes
 *  against the SAME resolved absolute entry path rather than a second constant. */
export const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');

export interface BackupResult {
	readonly targetDir:  string;
	readonly lmdbBytes:  number;
	readonly lanceBytes: number;
	readonly elapsedMs:  number;
}

export interface CompactResult {
	readonly beforeBytes: number;
	readonly afterBytes:  number;
	readonly savedBytes:  number;
	readonly elapsedMs:   number;
}

export interface StartResult {
	readonly started:    boolean;
	readonly logPath:    string;
	readonly alreadyRunning: boolean;
	readonly pid?:       number;
}

/** Fetch daemon health + indexing queue. Rejects with a friendly
 *  "daemon is not running" error when the socket is absent. */
export function getStatus(): Promise<DaemonStatus> {
	return rpc<DaemonStatus>('daemon.status');
}

/** Spawn the daemon detached and wait (up to 60 s) for it to become
 *  ready — pid file + socket present and the pid alive. The long
 *  window covers ONNX cold-boot on a fresh install. */
export async function startDaemon(): Promise<StartResult> {
	const conflict = runFileGuardConflict(PATHS.daemonRunGuard);
	if (conflict) throw new Error(conflict);
	const alreadyRunning = existsSync(PATHS.pidFile);
	mkdirSync(PATHS.logDir, { recursive: true });
	const logFd = openSync(PATHS.daemonLog, 'a');

	const child = spawn(
		process.execPath,
		['--import', 'tsx/esm', DAEMON_ENTRY],
		{ detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env } },
	);
	child.unref();

	const pid = await waitForReady();
	return pid !== undefined
		? { started: true, logPath: PATHS.daemonLog, alreadyRunning, pid }
		: { started: false, logPath: PATHS.daemonLog, alreadyRunning };
}

/** How a stop ended: by the daemon itself (`forced: false`) or by a forced
 *  kill after the wait (`forced: true`, with the pid that was killed). */
export interface StopOutcome {
	readonly stopped: true;
	readonly forced:  boolean;
	readonly pid?:    number;
}

/** Bound on the reply to `daemon.shutdown`. A daemon whose main thread is
 *  blocked while its socket still listens accepts the connection and never
 *  answers, so an unbounded await would never reach the wait or the kill. */
const SHUTDOWN_REPLY_BOUND_MS = 5_000;
const STOP_WAIT_MS            = 30_000;
const KILL_WAIT_MS            = 5_000;

/**
 * Injectable dependencies for the stop. Split out so unit tests drive every
 * outcome against an injected retained process capability with no
 * real daemon, and so the integration tests can shorten the waits.
 */
export interface StopDeps {
	/** Send `daemon.shutdown`; settles on the reply, rejects on a connection
	 *  error, and resolves `'no-reply'` when `boundMs` passes first. */
	readonly requestShutdown: (boundMs: number) => Promise<'replied' | 'no-reply'>;
 readonly capture: () => Promise<CapturedDaemon>;
 readonly waitForStop: (timeoutMs: number, target: StopTarget) => Promise<boolean>;
 readonly cleanup: (captured: CapturedDaemon) => void;
	readonly sleep:           (ms: number) => Promise<void>;
	readonly replyBoundMs:    number;
	readonly stopWaitMs:      number;
	readonly killWaitMs:      number;
}

function requestShutdownBounded(boundMs: number): Promise<'replied' | 'no-reply'> {
	return new Promise<'replied' | 'no-reply'>((resolve, reject) => {
		let socket: Socket | undefined;
		const timer = setTimeout(() => {
			// The request client has no time-out; drop the connection ourselves.
			socket?.destroy();
			resolve('no-reply');
		}, boundMs);
		rpc('daemon.shutdown', {}, () => (socket = createConnection(PATHS.sockFile))).then(
			() => { clearTimeout(timer); resolve('replied'); },
			(err: unknown) => { clearTimeout(timer); reject(err); },
		);
	});
}

const realStopDeps: StopDeps = {
 requestShutdown: requestShutdownBounded,
 capture: captureDaemon,
 waitForStop,
 cleanup: cleanupStoppedDaemon,
	sleep: ms => new Promise(r => setTimeout(r, ms)),
	replyBoundMs: SHUTDOWN_REPLY_BOUND_MS,
	stopWaitMs:   STOP_WAIT_MS,
	killWaitMs:   KILL_WAIT_MS,
};

/** Ask the daemon to shut down, wait (up to 30 s) for the original
 *  process to exit, and END IT when it does not: a daemon that
 *  overruns the wait is killed, its pid file and socket are removed, and the
 *  outcome says so. Rejects with "daemon is not running" when there is no
 *  daemon to stop, and when the stop cannot be completed safely (the pid is
 *  not a daemon's, or it survives the kill) — never leaving a second daemon
 *  free to start on the same store. */
export function stopDaemon(over: Partial<StopDeps> = {}): Promise<StopOutcome> {
	return stopDaemonWith({ ...realStopDeps, ...over });
}

export async function stopDaemonWith(deps: StopDeps): Promise<StopOutcome> {
 const captured = await deps.capture();
 const target = captured.target;
 if (!target) throw new Error('daemon is not running — no live original process was captured');
 try {
  // An RPC error cannot discard a target captured before the request.
  try { await deps.requestShutdown(deps.replyBoundMs); } catch { /* retain and observe original */ }
  if (await deps.waitForStop(deps.stopWaitMs, target)) {
   deps.cleanup(captured); return { stopped: true, forced: false };
  }
  try { await target.handle.terminate(); }
  catch (error) { throw new Error(`daemon (pid ${target.pid}) SIGKILL failed: ${error instanceof Error ? error.message : String(error)}; restart withheld`); }
  const deadline = Date.now() + deps.killWaitMs;
  while (!(await target.handle.hasExited())) {
   if (Date.now() >= deadline) throw new Error(`daemon (pid ${target.pid}) is still alive after SIGKILL; restart withheld`);
   await deps.sleep(100);
  }
  deps.cleanup(captured);
  return { stopped: true, forced: true, pid: target.pid };
 } finally { await target.handle.close(); }
}

/** One line for the user about how a stop ended. */
export function describeStop(outcome: StopOutcome): string {
	return outcome.forced
		? `daemon did not stop by itself; killed${outcome.pid !== undefined ? ` (pid ${outcome.pid})` : ''}`
		: 'daemon stopped';
}

/** Snapshot LMDB + Lance into `path` (resolved against cwd). */
export function backup(path: string): Promise<BackupResult> {
	const target = isAbsolute(path) ? path : resolve(process.cwd(), path);
	return rpc<BackupResult>('daemon.backup', { path: target });
}

/** Reclaim freed LMDB pages. Daemon must be idle. */
export function compact(): Promise<CompactResult> {
	return rpc<CompactResult>('daemon.compact');
}
