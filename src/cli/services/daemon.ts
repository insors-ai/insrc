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
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { rpc } from '../client.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus } from '../../shared/types.js';
import { waitForReady, waitForStop } from './lifecycle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Daemon entry point relative to this compiled file (out/cli/services). */
const DAEMON_ENTRY = join(__dirname, '../../daemon/index.js');

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

/** Ask the daemon to shut down and wait (up to 30 s) for it to fully
 *  drain (pid file + socket gone). Rejects if it doesn't stop in time. */
export async function stopDaemon(): Promise<void> {
	await rpc('daemon.shutdown');
	if (!(await waitForStop())) {
		throw new Error('daemon did not stop within 30 s');
	}
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
