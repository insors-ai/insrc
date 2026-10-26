/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Helpers for the process-lifecycle tests (not a test file). POSIX only. */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tmp(): string { return mkdtempSync(join(tmpdir(), 'insrc-proc-')); }
export function cleanup(dir: string): void { rmSync(dir, { recursive: true, force: true }); }

export function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}
export async function waitFor(fn: () => boolean, ms = 3000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 20)); }
	return fn();
}
export function readPid(file: string): number {
	return Number(readFileSync(file, 'utf8').trim());
}
export const fileExists = existsSync;
export const tick = (ms = 100): Promise<void> => new Promise(r => setTimeout(r, ms));

/** sh script: a background descendant in the same process group that holds the output pipes open; its pid goes to pidFile. */
export const groupDescendant = (pidFile: string): string => `sleep 30 & echo \$! > '${pidFile}'; wait`;
/** sh script: a descendant that leaves the process group (setsid) and still holds the pipes; its pid goes to pidFile. */
export const escapedDescendant = (pidFile: string): string => `setsid sleep 30 & echo \$! > '${pidFile}'; wait`;
