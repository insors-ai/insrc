/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Run a command as the leader of its own process group, so nothing it starts
 * can outlive the call (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1).
 *
 * Two teardown points, both aimed at the whole group rather than the one pid:
 *   - on timeout, the group is sent SIGKILL and the result is timedOut;
 *   - on the child's 'exit' event, anything still in the group is sent SIGKILL.
 * The second one is what lets the call finish. Node fires 'close' only after
 * every stdio pipe has closed, and a background process the child left behind
 * holds those pipes open; without the exit-time sweep a finished command would
 * wait for the timer and be reported as a timeout.
 *
 * POSIX only: on win32 there are no process groups, so the helper falls back
 * to killing the direct child.
 */

import { spawn } from 'node:child_process';

export interface ProcessGroupResult {
	readonly stdout:     string;
	readonly stderr:     string;
	/** The child's exit code; -1 when it never ran or exited by signal without a code. */
	readonly exitCode:   number;
	/** True when the time limit fired and the group was killed. */
	readonly timedOut:   boolean;
	readonly durationMs: number;
	/** Present when the command could not be spawned (e.g. ENOENT). */
	readonly spawnError?: string | undefined;
}

export interface ProcessGroupOpts {
	readonly timeoutMs: number;
	readonly cwd?:      string | undefined;
	/** Written to the child's stdin, which is then closed. */
	readonly stdin?:    string | undefined;
	readonly env?:      NodeJS.ProcessEnv | undefined;
}

const GROUPS = process.platform !== 'win32';

/** SIGKILL every process in the group led by `pid`. An empty group (ESRCH) is not an error. */
export function killProcessGroup(pid: number): void {
	try {
		process.kill(GROUPS ? -pid : pid, 'SIGKILL');
	} catch {
		/* ESRCH: the group is already gone; EPERM cannot happen for our own children */
	}
}

/** Spawn `command` in its own process group and wait for it, under `opts.timeoutMs`. Never rejects. */
export function runInProcessGroup(command: string, args: readonly string[], opts: ProcessGroupOpts): Promise<ProcessGroupResult> {
	return new Promise(resolve => {
		const start = Date.now();
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;
		const finish = (exitCode: number, spawnError?: string): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				stdout, stderr, exitCode, timedOut, durationMs: Date.now() - start,
				...(spawnError !== undefined ? { spawnError } : {}),
			});
		};

		const child = spawn(command, [...args], {
			stdio:    ['pipe', 'pipe', 'pipe'],
			detached: GROUPS,
			...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
			...(opts.env !== undefined ? { env: opts.env } : {}),
		});
		const kill = (): void => {
			if (child.pid !== undefined) killProcessGroup(child.pid);
			else child.kill('SIGKILL');
		};
		const timer = setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);

		child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
		child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
		child.stdin.on('error', () => { /* the child closed stdin early (EPIPE); its exit is reported below */ });
		child.on('exit', () => { if (child.pid !== undefined) killProcessGroup(child.pid); });
		child.on('error', err => finish(-1, err.message));
		child.on('close', code => finish(code ?? -1));
		child.stdin.end(opts.stdin ?? '');
	});
}
