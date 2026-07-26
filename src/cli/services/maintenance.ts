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
import { loadBuiltCatalog } from '../../config/config-catalog-loader.js';
import { reconcileConfigFile, type ConfigIoOutcome } from '../../config/reconcile-io.js';

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
	readonly steps:  readonly string[];   // e.g. ['sync', 'install', 'build', 'reconcile']
	readonly error?: string;
	/**
	 * Additive, optional summary of the post-build config reconcile (t12).
	 * Counts only — per-key dot-path detail goes to onLog. Absent on paths
	 * that never reach the reconcile (an early `ok: false` return). Optionality
	 * is written explicitly per exactOptionalPropertyTypes.
	 */
	readonly configReconcile?: {
		readonly changed:  boolean;
		readonly filled:   number;
		readonly repaired: number;
		readonly error?:   string | undefined;
	} | undefined;
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
			// `npm install` rewrites package-lock.json; the install mirrors origin
			// exactly, so discard that churn before the cleanliness check + FF
			// (otherwise every post-install update would refuse as "dirty" and the
			// merge --ff-only would fail on the local lockfile edit). Mirrors
			// `daemon-ctl.sh sync_repo`. Failure (no changes / file absent) is fine.
			await capture('git', ['-C', root, 'checkout', '--', 'package-lock.json']);
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

		// Post-build config reconcile. Runs STRICTLY after git-pull + build,
		// unconditionally (no opt-in flag), writing at most once and only when
		// changed. It must NOT flip a successful update to failed, so it sits in
		// its OWN inner try/catch (the surrounding body early-returns ok:false on
		// every real failure; this is best-effort).
		//
		// STALE-CATALOG resolution (see src/config/config-catalog-loader.ts):
		// this CLI process holds the PRE-update catalog in memory; `npm run
		// build` just rewrote out/ underneath it, so reconciling against the
		// resident module would be a no-op for exactly the shape change an update
		// applies. We load the FRESHLY BUILT catalog via dynamic import and
		// reconcile against that; if the import fails we DEFER the authoritative
		// reconcile to the next daemon boot (t9) rather than trust the stale
		// in-memory catalog. The direct config.json write here is the s8-sbdry3
		// deviation the approver confirmed — see the deviation note in
		// src/config/reconcile-io.ts.
		const configReconcile = await runUpdateReconcile(root, onLog);   // writes ~/.insrc/config.json (PATHS.config)
		steps.push('reconcile');

		onLog('update complete (daemon NOT restarted)');
		return { ok: true, steps, configReconcile };
	} catch (err) {
		return { ok: false, steps, error: err instanceof Error ? err.message : String(err) };
	}
}

type ReconcileSummary = NonNullable<MaintenanceResult['configReconcile']>;

/** Run the post-build reconcile against the freshly built catalog, reporting
 *  per-key detail on `onLog` and returning the counts summary. Never throws —
 *  any failure is captured into the summary's `error`. Exported for tests;
 *  `configPath` is a test seam (prod reconciles the real PATHS.config). */
export async function runUpdateReconcile(root: string, onLog: LogFn, configPath?: string): Promise<ReconcileSummary> {
	try {
		const builtCatalogPath = join(root, 'out', 'config', 'config-catalog.js');
		const catalog = await loadBuiltCatalog(builtCatalogPath);
		if (catalog === null) {
			onLog('config reconcile: freshly built catalog not loadable; deferring to next daemon boot');
			return { changed: false, filled: 0, repaired: 0, error: 'built catalog not loadable; deferred to daemon boot' };
		}
		const outcome = reconcileConfigFile(configPath !== undefined ? { catalog, configPath } : { catalog });
		return summarizeReconcile(outcome, onLog);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		onLog(`config reconcile failed: ${message}`);
		return { changed: false, filled: 0, repaired: 0, error: message };
	}
}

/** Emit the reconcile summary + one detail line per filled / repaired key
 *  (naming the catalog dot-path, and the discarded value for a collision
 *  repair), and fold the outcome into the counts summary. Exported for tests. */
export function summarizeReconcile(outcome: ConfigIoOutcome, onLog: LogFn): ReconcileSummary {
	switch (outcome.kind) {
		case 'written':
		case 'first-boot': {
			const { filled, repaired } = outcome.result;
			onLog(`config reconcile: ${filled.length} filled, ${repaired.length} repaired`);
			for (const p of filled) onLog(`  filled   ${p}`);
			for (const r of repaired) onLog(`  repaired ${r.path} (discarded ${JSON.stringify(r.discarded)})`);
			return { changed: outcome.result.changed, filled: filled.length, repaired: repaired.length };
		}
		case 'unchanged':
			onLog('config reconcile: no changes needed');
			return { changed: false, filled: 0, repaired: 0 };
		case 'catalog-error':
			onLog(`config reconcile: SHIPPED-CATALOG BUG at ${outcome.catalogPath}: ${outcome.message}`);
			return { changed: false, filled: 0, repaired: 0, error: `shipped-catalog bug at ${outcome.catalogPath}: ${outcome.message}` };
		case 'parse-error':
			onLog(`config reconcile: config.json is not valid JSON (${outcome.message}); left untouched`);
			return { changed: false, filled: 0, repaired: 0, error: `invalid config JSON: ${outcome.message}` };
		case 'read-error':
			onLog(`config reconcile: could not read config.json (${outcome.errno}): ${outcome.message}`);
			return { changed: false, filled: 0, repaired: 0, error: `read error (${outcome.errno}): ${outcome.message}` };
		case 'write-error':
			onLog(`config reconcile: write failed: ${outcome.message}`);
			return { changed: outcome.result.changed, filled: outcome.result.filled.length, repaired: outcome.result.repaired.length, error: `write error: ${outcome.message}` };
		case 'concurrent-modification':
			onLog('config reconcile: config.json changed during reconcile; write abandoned');
			return { changed: outcome.result.changed, filled: outcome.result.filled.length, repaired: outcome.result.repaired.length, error: 'config changed during reconcile; write abandoned' };
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
