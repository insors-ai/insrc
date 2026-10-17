/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Asynchronous git runner with one shared deadline (Story s2).
 *
 * The refresh makes several network calls (ls-remote, fetch) under a single
 * 10 second budget. Each call gets whatever time is left; when the budget is
 * spent the next call is not started and a running one is killed. Failures are
 * values: this never throws.
 */

import { execFile } from 'node:child_process';

import { REFRESH_DEADLINE_MS } from './sighting-store.js';

export interface Deadline {
	remainingMs(): number;
}

export function createDeadline(totalMs: number = REFRESH_DEADLINE_MS, now: () => number = Date.now): Deadline {
	const end = now() + totalMs;
	return { remainingMs: () => Math.max(0, end - now()) };
}

export type GitAsyncRun =
	| { readonly ok: true;  readonly stdout: string }
	| { readonly ok: false; readonly stderr: string; readonly timedOut: boolean };

export type GitAsync = (cwd: string, args: readonly string[], deadline: Deadline) => Promise<GitAsyncRun>;

export const runGitAsync: GitAsync = (cwd, args, deadline) => new Promise(resolve => {
	const left = deadline.remainingMs();
	if (left <= 0) {
		resolve({ ok: false, stderr: 'the refresh deadline passed before git could run', timedOut: true });
		return;
	}
	execFile('git', [...args], { cwd, encoding: 'utf8', timeout: left, maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
		if (err === null) {
			resolve({ ok: true, stdout });
			return;
		}
		const e = err as NodeJS.ErrnoException & { killed?: boolean | undefined };
		const timedOut = e.killed === true;
		resolve({ ok: false, stderr: timedOut ? 'git did not finish within the refresh deadline' : (stderr.trim() || e.message), timedOut });
	});
});
