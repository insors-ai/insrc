/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon maintenance — the `update` / `restart` lifecycle the TUI's
 * Daemon pane drives, a TypeScript port of `scripts/daemon-ctl.sh`
 * (which lives in the IDE repo; this backend repo keeps its own copy so
 * it stays self-contained).
 *
 * `update` targets the daemon install root — `$INSRC_DAEMON_ROOT` or
 * `~/.insrc/daemon` — and does: fast-forward sync against origin →
 * `npm install` when the lockfile changed → `npm run build`. It does
 * NOT (re)start the daemon. `restart` does a drained stop then a start
 * of the daemon spawned from the running tree.
 *
 * Every step streams its output through an `onLog` callback so the pane
 * can show a live log instead of `stdio:inherit` (which would corrupt
 * the ink render).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { startDaemon, stopDaemon } from './daemon.js';

/** Where the installed daemon checkout lives. */
export const DAEMON_ROOT = process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon');

export interface UpdateOptions {
	readonly skipSync?:    boolean;
	readonly skipInstall?: boolean;
	readonly skipBuild?:   boolean;
	readonly branch?:      string;
}

export interface MaintenanceResult {
	readonly ok:     boolean;
	readonly steps:  readonly string[];   // e.g. ['sync', 'install', 'build']
	readonly error?: string;
}

export type LogFn = (line: string) => void;

/** Fast-forward sync + conditional install + build against DAEMON_ROOT.
 *  Never starts the daemon. Faithful to `daemon-ctl.sh cmd_update`. */
export async function update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult> {
	const root = DAEMON_ROOT;
	const steps: string[] = [];

	if (!existsSync(join(root, '.git')) || !existsSync(join(root, 'package.json')) || !existsSync(join(root, 'src'))) {
		return { ok: false, steps, error: `not a daemon git checkout: ${root}` };
	}

	try {
		const branch = opts.branch ?? (await capture('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
		const lockBefore = (await capture('git', ['-C', root, 'hash-object', 'package-lock.json'])).stdout.trim();

		if (opts.skipSync !== true) {
			onLog(`syncing ${root} against origin/${branch}`);
			if (await stream('git', ['-C', root, 'fetch', '--quiet', 'origin', branch], onLog) !== 0) {
				return { ok: false, steps, error: `git fetch origin/${branch} failed` };
			}
			const dirty = (await capture('git', ['-C', root, 'status', '--porcelain'])).stdout.trim();
			if (dirty.length > 0) {
				return { ok: false, steps, error: 'daemon checkout has uncommitted changes; refusing to overwrite' };
			}
			const current  = (await capture('git', ['-C', root, 'rev-parse', 'HEAD'])).stdout.trim();
			const incoming = (await capture('git', ['-C', root, 'rev-parse', `origin/${branch}`])).stdout.trim();
			if (current === incoming) {
				onLog(`already at ${incoming.slice(0, 8)} (no-op)`);
			} else {
				const anc = await capture('git', ['-C', root, 'merge-base', '--is-ancestor', current, incoming]);
				if (anc.code !== 0) {
					return { ok: false, steps, error: `HEAD diverged from origin/${branch}; resolve manually` };
				}
				onLog(`fast-forward: ${current.slice(0, 8)} -> ${incoming.slice(0, 8)}`);
				if (await stream('git', ['-C', root, 'merge', '--ff-only', incoming], onLog) !== 0) {
					return { ok: false, steps, error: 'git merge --ff-only failed' };
				}
			}
			steps.push('sync');
		}

		const lockAfter = (await capture('git', ['-C', root, 'hash-object', 'package-lock.json'])).stdout.trim();
		const lockChanged = lockBefore !== lockAfter || !existsSync(join(root, 'node_modules'));
		if (opts.skipInstall !== true && lockChanged) {
			onLog('npm install (lockfile changed)');
			if (await stream('npm', ['install'], onLog, root) !== 0) {
				return { ok: false, steps, error: 'npm install failed' };
			}
			steps.push('install');
		} else if (opts.skipInstall !== true) {
			onLog('npm install: package-lock.json unchanged; skipping');
		}

		if (opts.skipBuild !== true) {
			onLog('npm run build');
			if (await stream('npm', ['run', 'build'], onLog, root) !== 0) {
				return { ok: false, steps, error: 'npm run build failed' };
			}
			steps.push('build');
		}

		onLog('update complete (daemon NOT restarted)');
		return { ok: true, steps };
	} catch (err) {
		return { ok: false, steps, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Drained stop then start. Faithful to `daemon-ctl.sh cmd_restart`. */
export async function restart(onLog: LogFn): Promise<MaintenanceResult> {
	onLog('stopping daemon');
	try {
		await stopDaemon();
	} catch (err) {
		return { ok: false, steps: ['stop'], error: err instanceof Error ? err.message : String(err) };
	}
	onLog('daemon stopped; starting');
	const r = await startDaemon();
	return r.started
		? { ok: true, steps: ['stop', 'start'] }
		: { ok: false, steps: ['stop', 'start'], error: 'daemon did not become ready within 60 s' };
}

// ---------------------------------------------------------------------------
// spawn helpers
// ---------------------------------------------------------------------------

/** Run a command, streaming each output line to `onLog`; resolves the
 *  exit code. */
function stream(cmd: string, args: readonly string[], onLog: LogFn, cwd?: string): Promise<number> {
	return new Promise<number>(resolve => {
		const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'], ...(cwd !== undefined ? { cwd } : {}) });
		const emit = (chunk: Buffer): void => {
			for (const line of chunk.toString().split(/\r?\n/)) {
				const t = line.trimEnd();
				if (t.length > 0) onLog(t);
			}
		};
		child.stdout.on('data', emit);
		child.stderr.on('data', emit);
		child.on('error', err => { onLog(`error: ${err.message}`); resolve(1); });
		child.on('close', code => resolve(code ?? 0));
	});
}

/** Run a command and capture its stdout (for git plumbing queries). */
function capture(cmd: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise(resolve => {
		const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', c => { stdout += c.toString(); });
		child.stderr.on('data', c => { stderr += c.toString(); });
		child.on('error', () => resolve({ code: 1, stdout, stderr }));
		child.on('close', code => resolve({ code: code ?? 0, stdout, stderr }));
	});
}
