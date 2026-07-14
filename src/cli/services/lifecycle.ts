/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon process-lifecycle waits, mirroring `scripts/daemon-ctl.sh`'s
 * pid+socket polling. Kept dependency-free so both the daemon service
 * and the maintenance service can share them without an import cycle.
 *
 * "Stopped" = both the pid file AND the socket are gone (the socket
 * lingers briefly after exit). "Ready" = pid file + socket present and
 * the pid is alive (covers ONNX cold-boot, which can take ~30 s+).
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';

import { PATHS } from '../../shared/paths.js';

function pidFromFile(): number | undefined {
	if (!existsSync(PATHS.pidFile)) return undefined;
	try {
		const pid = Number(readFileSync(PATHS.pidFile, 'utf8').trim());
		return Number.isInteger(pid) && pid > 0 ? pid : undefined;
	} catch { return undefined; }
}

function pidAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

/** True when the daemon pid file references a live process. */
export function isRunning(): boolean {
	const pid = pidFromFile();
	return pid !== undefined && pidAlive(pid);
}

/** Wait until the daemon is fully drained (pid file + socket gone).
 *  Removes a stale pid file so a subsequent start doesn't refuse.
 *  Returns true if it stopped within `timeoutMs`. */
export async function waitForStop(timeoutMs = 30_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pid = pidFromFile();
		if (pid !== undefined && !pidAlive(pid)) {
			try { rmSync(PATHS.pidFile); } catch { /* best effort */ }
		}
		if (!existsSync(PATHS.pidFile) && !existsSync(PATHS.sockFile)) return true;
		await sleep(500);
	}
	return false;
}

/** Wait until the daemon accepted startup (pid file + socket present
 *  and pid alive). Returns the pid, or undefined on timeout. */
export async function waitForReady(timeoutMs = 60_000): Promise<number | undefined> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pid = pidFromFile();
		if (pid !== undefined && existsSync(PATHS.sockFile) && pidAlive(pid)) return pid;
		await sleep(500);
	}
	return undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise(r => setTimeout(r, ms));
}
