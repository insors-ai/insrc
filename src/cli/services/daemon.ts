/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon service — the non-interactive operations the TUI's Daemon pane
 * drives. Pure data in / data out: no console output, no process.exit.
 * Extracted from the former `cli/commands/daemon.ts` commander actions.
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, openSync, mkdirSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { rpc } from '../client.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus } from '../../shared/types.js';
import { pidFromFile, waitForReady, waitForStop } from './lifecycle.js';

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

/** A daemon process is recognised by the tail of its command line, not by
 *  DAEMON_ENTRY: that is the entry of the CLI's OWN checkout, while the control
 *  script starts the daemon from the installed one, so a CLI run from a
 *  development checkout would not match a live installed daemon. */
const DAEMON_ENTRY_SUFFIX = 'daemon/index.js';

/** Bound on the reply to `daemon.shutdown`. A daemon whose main thread is
 *  blocked while its socket still listens accepts the connection and never
 *  answers, so an unbounded await would never reach the wait or the kill. */
const SHUTDOWN_REPLY_BOUND_MS = 5_000;
const STOP_WAIT_MS            = 30_000;
const KILL_WAIT_MS            = 5_000;

/**
 * Injectable dependencies for the stop. Split out so unit tests drive every
 * outcome against a fake process table (alive / command line / kill) with no
 * real daemon, and so the integration tests can shorten the waits.
 */
export interface StopDeps {
	/** Send `daemon.shutdown`; settles on the reply, rejects on a connection
	 *  error, and resolves `'no-reply'` when `boundMs` passes first. */
	readonly requestShutdown: (boundMs: number) => Promise<'replied' | 'no-reply'>;
	readonly waitForStop:     (timeoutMs: number) => Promise<boolean>;
	readonly pidFromFile:     () => number | undefined;
	readonly pidAlive:        (pid: number) => boolean;
	/** The pid's command line, or undefined when it cannot be read. */
	readonly commandLine:     (pid: number) => string | undefined;
	readonly kill:            (pid: number, signal: NodeJS.Signals) => void;
	/** Remove the pid file and the socket file (after a forced kill only). */
	readonly removeRunFiles:  () => void;
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

function readCommandLine(pid: number): string | undefined {
	try {
		const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return out.length > 0 ? out : undefined;
	} catch { return undefined; }
}

const realStopDeps: StopDeps = {
	requestShutdown: requestShutdownBounded,
	waitForStop,
	pidFromFile,
	pidAlive: pid => { try { process.kill(pid, 0); return true; } catch { return false; } },
	commandLine: readCommandLine,
	kill: (pid, signal) => { process.kill(pid, signal); },
	removeRunFiles: () => {
		rmSync(PATHS.pidFile,  { force: true });
		rmSync(PATHS.sockFile, { force: true });
	},
	sleep: ms => new Promise(r => setTimeout(r, ms)),
	replyBoundMs: SHUTDOWN_REPLY_BOUND_MS,
	stopWaitMs:   STOP_WAIT_MS,
	killWaitMs:   KILL_WAIT_MS,
};

/** Ask the daemon to shut down, wait (up to 30 s) for it to fully drain
 *  (pid file + socket gone), and END IT when it does not: a daemon that
 *  overruns the wait is killed, its pid file and socket are removed, and the
 *  outcome says so. Rejects with "daemon is not running" when there is no
 *  daemon to stop, and when the stop cannot be completed safely (the pid is
 *  not a daemon's, or it survives the kill) — never leaving a second daemon
 *  free to start on the same store. */
export function stopDaemon(over: Partial<StopDeps> = {}): Promise<StopOutcome> {
	return stopDaemonWith({ ...realStopDeps, ...over });
}

export async function stopDaemonWith(deps: StopDeps): Promise<StopOutcome> {
	const livePid = (): number | undefined => {
		const pid = deps.pidFromFile();
		return pid !== undefined && deps.pidAlive(pid) ? pid : undefined;
	};

	try {
		await deps.requestShutdown(deps.replyBoundMs);
	} catch (err) {
		// A request that failed is "already stopped" only when no daemon process
		// is alive. With a live pid (socket gone, or the daemon answered with an
		// error) go on to the wait and the forced kill.
		if (livePid() === undefined) throw err;
	}

	if (await deps.waitForStop(deps.stopWaitMs)) return { stopped: true, forced: false };

	const waited = `${Math.round(deps.stopWaitMs / 1000)} s`;
	const pid = livePid();
	if (pid === undefined) {
		// No process to end, yet the socket file remains: we cannot tell whose it is.
		throw new Error(`daemon did not stop within ${waited}: its socket file is still present and the pid file names no live process`);
	}

	const command = deps.commandLine(pid);
	if (command === undefined || !command.trimEnd().endsWith(DAEMON_ENTRY_SUFFIX)) {
		throw new Error(
			`daemon did not stop within ${waited}, and pid ${pid} from the pid file is not a daemon process ` +
			`(command line: ${command ?? 'unreadable'}); it was not killed and its pid file was left in place`,
		);
	}

	try {
		deps.kill(pid, 'SIGKILL');
	} catch (err) {
		if (deps.pidAlive(pid)) {
			const why = err instanceof Error ? err.message : String(err);
			throw new Error(`daemon (pid ${pid}) did not stop within ${waited} and SIGKILL failed: ${why}; its pid file was left in place`);
		}
	}
	const deadline = Date.now() + deps.killWaitMs;
	while (deps.pidAlive(pid) && Date.now() < deadline) await deps.sleep(100);
	if (deps.pidAlive(pid)) {
		throw new Error(`daemon (pid ${pid}) did not stop within ${waited} and is still alive after SIGKILL; its pid file was left in place`);
	}

	deps.removeRunFiles();
	return { stopped: true, forced: true, pid };
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
