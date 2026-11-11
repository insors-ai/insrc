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
import type { ChildProcess } from 'node:child_process';
import { reviewNativeTransport, runReviewNativeProcess } from './review-process-bridge.js';

export type ProcessDisposal =
 | { readonly state: 'confirmed'; readonly reason: 'not_started' | 'closed' }
 | { readonly state: 'unknown'; readonly reason: 'child_not_closed' | 'group_not_empty' | 'group_state_unknown' };

/** Observe a child we actually own. Signals and helper settlement are not
 * proof. Querying this function never signals a PID or starts another process. */
export function observeOwnedProcessDisposal(child: ChildProcess): () => ProcessDisposal {
 let exited = false, closed = false, spawnFailed = false;
 child.once('exit', () => { exited = true; });
 child.once('close', () => { closed = true; });
 child.once('error', () => { spawnFailed = child.pid === undefined; });
 return () => {
  if (spawnFailed) return { state: 'confirmed', reason: 'not_started' };
  if (!exited || !closed) return { state: 'unknown', reason: 'child_not_closed' };
  // The Windows fallback kills only the direct child; it cannot establish
  // that its descendants are gone. Keep that limitation explicit.
  if (process.platform === 'win32' || child.pid === undefined) return { state: 'unknown', reason: 'group_state_unknown' };
  try { process.kill(-child.pid, 0); return { state: 'unknown', reason: 'group_not_empty' }; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH'
   ? { state: 'confirmed', reason: 'closed' } : { state: 'unknown', reason: 'group_state_unknown' }; }
 };
}

export interface ProcessGroupResult {
	readonly stdout:     string;
	readonly stderr:     string;
	/** The child's exit code; -1 when it never ran or exited by signal without a code. */
	readonly exitCode:   number;
	/** True when the time limit fired and the group was killed. */
	readonly timedOut:   boolean;
	/** True when the stall watchdog fired and the group was killed. */
	readonly stalled?:   boolean | undefined;
	/** True when `opts.signal` fired: the group was killed (or never spawned). */
	readonly aborted?:   boolean | undefined;
	readonly durationMs: number;
	/** Present when the command could not be spawned (e.g. ENOENT). */
	readonly spawnError?: string | undefined;
}

export interface ProcessGroupCommonOpts {
	readonly cwd?:      string | undefined;
	/** Written to the child's stdin, which is then closed. */
	readonly stdin?:    string | undefined;
	readonly env?:      NodeJS.ProcessEnv | undefined;
	/**
	 * Stall watchdog: when `started(stdout)` is still false `ms` after the spawn,
	 * the child has produced nothing it counts as output; the group is killed and
	 * the result says `stalled`. ISSUE-d4b2cd1c.
	 *
	 * With `silence: true` the limit restarts on every stdout chunk instead: the
	 * group is killed once the child has printed nothing for `ms`, at the start or
	 * after earlier output, and `started` is not consulted. ISSUE-562b1bb5.
	 */
	readonly stall?:    { readonly ms: number; readonly started: (stdout: string) => boolean; readonly silence?: boolean | undefined } | undefined;
	/** Cancels the run: the group is killed as on timeout and the result says
	 *  `aborted`. An already-aborted signal spawns nothing. Epic 8315a11f s1. */
	readonly signal?:   AbortSignal | undefined;
}

export type ProcessGroupOpts = ProcessGroupCommonOpts & (
 | { readonly mode?: 'bounded' | undefined; readonly timeoutMs: number; readonly onStdoutChunk?: never }
 | { readonly mode: 'activity'; readonly timeoutMs?: never; readonly stall?: never; readonly signal: AbortSignal; readonly onStdoutChunk: (chunk: Buffer) => Promise<void> }
);

const GROUPS = process.platform !== 'win32';

/** SIGKILL every process in the group led by `pid`. An empty group (ESRCH) is not an error. */
export function killProcessGroup(pid: number): void {
	try {
		process.kill(GROUPS ? -pid : pid, 'SIGKILL');
	} catch {
		/* ESRCH: the group is already gone; EPERM cannot happen for our own children */
	}
}

/** Spawn `command` in its own process group and wait for it, under a bounded deadline or explicit activity-mode cancellation. Activity observer failures reject. */
export function runInProcessGroup(command: string, args: readonly string[], opts: ProcessGroupOpts): Promise<ProcessGroupResult> {
	if (opts.mode === 'activity' && ('timeoutMs' in opts || 'stall' in opts || !(opts.signal instanceof AbortSignal) || typeof opts.onStdoutChunk !== 'function')) throw new TypeError('Invalid activity process options');
	const review = reviewNativeTransport();
	if (review) return runReviewNativeProcess(review, command, args, opts);
	return new Promise((resolve, reject) => {
		const start = Date.now();
		if (opts.signal?.aborted === true) {
			resolve({ stdout: '', stderr: '', exitCode: -1, timedOut: false, durationMs: 0, aborted: true });
			return;
		}
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let stalled = false;
		let aborted = false;
		let settled = false;
		let observerError: unknown;
		let consumption: Promise<void> = Promise.resolve();
		const finish = (exitCode: number, spawnError?: string): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (stallTimer !== undefined) clearTimeout(stallTimer);
			opts.signal?.removeEventListener('abort', onAbort);
			if (observerError !== undefined) { reject(observerError); return; }
			resolve({
				stdout, stderr, exitCode, timedOut, durationMs: Date.now() - start,
				...(stalled ? { stalled } : {}),
				...(aborted ? { aborted } : {}),
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
		const timer = opts.mode === 'activity' ? undefined : setTimeout(() => { timedOut = true; kill(); }, opts.timeoutMs);
		const stall = opts.mode !== 'activity' && opts.stall !== undefined && opts.stall.ms < opts.timeoutMs ? opts.stall : undefined;
		const onStall = (): void => {
			if (stall !== undefined && (stall.silence === true || !stall.started(stdout))) { stalled = true; kill(); }
		};
		let stallTimer = stall !== undefined ? setTimeout(onStall, stall.ms) : undefined;

		const onAbort = (): void => { aborted = true; kill(); };
		opts.signal?.addEventListener('abort', onAbort, { once: true });
		if (opts.signal?.aborted) onAbort();

		if (opts.mode === 'activity') {
			consumption = (async () => {
				try { for await (const chunk of child.stdout) await opts.onStdoutChunk(chunk as Buffer); }
				catch (error) { observerError = error; kill(); }
			})();
		} else child.stdout.on('data', (c: Buffer) => {
			stdout += c.toString();
			if (stall?.silence === true && stallTimer !== undefined && !stalled) {
				clearTimeout(stallTimer);
				stallTimer = setTimeout(onStall, stall.ms);
			}
		});
		child.stderr.on('data', (c: Buffer) => { stderr = opts.mode === 'activity' ? Buffer.concat([Buffer.from(stderr),c]).subarray(-65536).toString() : stderr+c.toString(); });
		child.stdin.on('error', () => { /* the child closed stdin early (EPIPE); its exit is reported below */ });
		child.on('exit', () => { if (child.pid !== undefined) killProcessGroup(child.pid); });
		child.on('error', err => finish(-1, err.message));
		child.on('close', code => { void consumption.then(() => finish(code ?? -1)); });
		child.stdin.end(opts.stdin ?? '');
	});
}
