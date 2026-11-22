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
 * Installed source updates run through the verified current transaction owner.
 * An update preserves running/stopped state; restart starts a stopped installation.
 * Historical installations need a one-time authenticated current installer.
 * The daemon's own startup owns configuration and steering reconciliation.
 *
 * Every step streams its output through an `onLog` callback so the pane
 * can show a live log instead of `stdio:inherit` (which would corrupt
 * the ink render).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc } from '../client.js';
import { checkUpdateSource, readUpdateSource } from '../../shared/update-source.js';
import type { UpdateSource } from '../../shared/update-source.js';
import type { RegisteredRepo } from '../../shared/types.js';
import { describeStop, startDaemon, stopDaemon } from './daemon.js';
import { readManagedInstallation } from '../../shared/managed-daemon-installation.js';
import { ManagedDaemonControl } from './managed-daemon-control.js';
import { cleanNodeEnvironment, resolveOwnedToolchain } from './owned-runtime.js';
import { resolveSourceControl, runSourceControl } from '../../shared/source-routing.js';
import { PATHS } from '../../shared/paths.js';
import type { StartResult, StopOutcome } from './daemon.js';
import { loadBuiltCatalog } from '../../config/config-catalog-loader.js';
import { reconcileConfigFile, type ConfigIoOutcome } from '../../config/reconcile-io.js';
import type { SteeringRefreshDeps, SteeringRefreshReport } from '../../daemon/steering-inject.js';

/** Where the installed daemon checkout lives. */
export const DAEMON_ROOT = process.env['INSRC_DAEMON_ROOT'] ?? join(homedir(), '.insrc', 'daemon');

/**
 * The install marker (ISSUE-ca9883ca): a file in node_modules holding the git
 * blob hash of the package-lock.json the last SUCCESSFUL npm install ran from.
 * It is removed before an install and written only after npm exits 0, so a
 * failed or interrupted install -- or a deleted node_modules -- leaves no
 * marker and the next update installs again. scripts/daemon-ctl.sh and the
 * installer scripts read and write the same file with the same content.
 */
export const INSTALL_MARKER = join('node_modules', '.insrc-install-ok');

/**
 * The C++ standard every daemon npm install asks for: native dependencies whose
 * build file sets none (fs-ext) do not compile against the Node 22.22.1 headers
 * pinned in .npmrc without it. The value the project-memory package qualified
 * (packages/project-memory/README.md).
 */
export const NATIVE_CXX_STD = '-std=c++17';

/** The environment for a daemon npm install: the caller's, with {@link NATIVE_CXX_STD} appended to CXXFLAGS. */
export function nativeBuildEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const prior = env['CXXFLAGS']?.trim() ?? '';
	return { ...cleanNodeEnvironment(env), CXXFLAGS: prior === '' ? NATIVE_CXX_STD : `${prior} ${NATIVE_CXX_STD}` };
}

export interface UpdateOptions {
	readonly skipSync?:    boolean;
	readonly skipInstall?: boolean;
	readonly skipBuild?:   boolean;
	readonly branch?:      string;
	/** The git remote URL origin must point at; wins over the config. */
	readonly repoUrl?:     string;
	/** The configured update source; read from ~/.insrc/config.json when absent (a test injects it). */
	readonly source?:      UpdateSource;
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
		readonly pruned:   number;
		readonly error?:   string | undefined;
	} | undefined;
	/**
	 * Additive, optional per-file report of the post-build steering-block
	 * refresh (S001). Mirrors `configReconcile`: present on paths that reach the
	 * post-build phase, absent (or `undefined`) when the refresh could not run
	 * or was not reached. Optionality is written explicitly per
	 * exactOptionalPropertyTypes.
	 */
	readonly steeringRefresh?: SteeringRefreshReport | undefined;
}

export type LogFn = (line: string) => void;

/** Resolve the current source owner before update; incumbent build functions are never called. */
export async function update(opts: UpdateOptions, onLog: LogFn): Promise<MaintenanceResult> {
 try {
  if (opts.skipSync || opts.skipInstall || opts.skipBuild) throw new Error('Installed source updates cannot skip authentication, installation or build validation');
  const configured = opts.source ?? readUpdateSource();
  const wanted = checkUpdateSource({ repoUrl: opts.repoUrl ?? configured.repoUrl, branch: opts.branch ?? configured.branch });
  const env = { ...cleanNodeEnvironment(process.env), INSRC_DAEMON_UPDATE_REPO_URL: wanted.repoUrl ?? '', INSRC_DAEMON_UPDATE_BRANCH: wanted.branch ?? '' };
  const source = await resolveSourceControl(PATHS.insrc, process.env['INSRC_DAEMON_ROOT']);
  if (source) {
   onLog('staging update through the verified source owner');
   const outcome = await runSourceControl(source, 'update', env);
   onLog(`${outcome.decision}: ${outcome.detail}`);
   return { ok: true, steps: ['update'] };
  }
  if (process.platform === 'darwin' && await readManagedInstallation() !== undefined) {
   const root = fileURLToPath(new URL('../../../', import.meta.url));
   const entry = join(root, 'out/bin/insrc-daemon-control.js');
   if (!existsSync(entry)) throw new Error(`Current managed controller missing at ${entry}; obtain the current authenticated client or installer`);
   const args = [entry, 'update-local']; let diagnostic = '';
   const command = JSON.stringify([process.execPath, ...args]);
   onLog(`running current managed controller ${command}`);
   const code = await stream(process.execPath, args, line => { diagnostic = `${diagnostic}\n${line}`.slice(-8192); onLog(line); }, root, env);
   if (code !== 0) throw new Error(`Managed update command failed (${code}) ${command}: ${diagnostic}`);
   return { ok: true, steps: ['update'] };
  }
  throw new Error(`Obtain the current authenticated release installer for the configured channel from insors-ai/insrc GitHub Releases (or its release owner). Run it with --migrate-runtime --target ${JSON.stringify(DAEMON_ROOT)}; historical Linux recovery also needs --predecessor <known-good-full-commit> --rebuild-predecessor. The raw repository template has no release signing authority; unpublished signing/bootstrap material must be supplied before upgrading.`);
 } catch (error) {
  return { ok: false, steps: [], error: error instanceof Error ? error.message : String(error) };
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
			return { changed: false, filled: 0, repaired: 0, pruned: 0, error: 'built catalog not loadable; deferred to daemon boot' };
		}
		const outcome = reconcileConfigFile(configPath !== undefined ? { catalog, configPath } : { catalog });
		return summarizeReconcile(outcome, onLog);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		onLog(`config reconcile failed: ${message}`);
		return { changed: false, filled: 0, repaired: 0, pruned: 0, error: message };
	}
}

/** Re-stamp the freshly-built steering block into every registered repo that
 *  already carries the markers, reporting per-repo detail on `onLog` and
 *  returning the flat per-file report. Never throws — any top-level failure
 *  (block asset missing, `listRepos` rejection) is caught, logged, and yields
 *  `undefined`, so an update never fails on a best-effort refresh.
 *
 *  The block is read from the DAEMON ROOT's freshly-built `out/prompts` (not
 *  this CLI process's own build) — mirroring `runUpdateReconcile`, which loads
 *  the freshly built catalog from `root/out` rather than the resident module.
 *
 *  The registered repositories are ASKED OF THE DAEMON (`repo.list`): this runs
 *  in the CLI's process, and only the daemon may open the store. With no
 *  daemon running the refresh fails here, is logged, and is left to the
 *  daemon's own refresh at its next start.
 *
 *  `deps` is a test seam (prod asks the daemon + walks the real fs): overrides
 *  are merged AFTER the defaults, so a test can inject
 *  `listRepos`/`readFile`/`writeFile` without a daemon or touching disk. */
export async function runUpdateSteeringRefresh(
	root: string,
	onLog: LogFn,
	deps?: Partial<SteeringRefreshDeps>,
): Promise<SteeringRefreshReport | undefined> {
	try {
		const blockPath = join(root, 'out', 'prompts', 'steering-block.md');
		const block = readFileSync(blockPath, 'utf8').trim();
		if (block.length === 0) throw new Error(`steering block asset is empty: ${blockPath}`);

		const { refreshSteeringAcrossRepos } = await import('../../daemon/steering-inject.js');
		const report = await refreshSteeringAcrossRepos({ readBlock: () => block, listRepos: listReposFromDaemon, ...deps });
		const refreshed = report.filter(o => o.action === 'replaced').length;
		const skipped   = report.filter(o => o.action === 'skipped').length;
		onLog(`steering refresh: ${refreshed} refreshed, ${skipped} skipped across ${report.length} file(s)`);
		for (const o of report) {
			if (o.action === 'replaced') onLog(`  refreshed ${o.file}`);
			else if (o.note !== undefined) onLog(`  ${o.action}   ${o.file} (${o.note})`);
		}
		return report;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		onLog(`steering refresh failed: ${message}`);
		return undefined;
	}
}

/** Emit the reconcile summary + one detail line per filled / repaired key
 *  (naming the catalog dot-path, and the discarded value for a collision
 *  repair), and fold the outcome into the counts summary. Exported for tests. */
export function summarizeReconcile(outcome: ConfigIoOutcome, onLog: LogFn): ReconcileSummary {
	switch (outcome.kind) {
		case 'written':
		case 'first-boot': {
			const { filled, repaired, pruned } = outcome.result;
			onLog(`config reconcile: ${filled.length} filled, ${repaired.length} repaired, ${pruned.length} pruned`);
			for (const p of filled) onLog(`  filled   ${p}`);
			for (const r of repaired) onLog(`  repaired ${r.path} (discarded ${JSON.stringify(r.discarded)})`);
			for (const p of pruned) onLog(`  pruned   ${p}`);
			return { changed: outcome.result.changed, filled: filled.length, repaired: repaired.length, pruned: pruned.length };
		}
		case 'unchanged':
			onLog('config reconcile: no changes needed');
			return { changed: false, filled: 0, repaired: 0, pruned: 0 };
		case 'catalog-error':
			onLog(`config reconcile: SHIPPED-CATALOG BUG at ${outcome.catalogPath}: ${outcome.message}`);
			return { changed: false, filled: 0, repaired: 0, pruned: 0, error: `shipped-catalog bug at ${outcome.catalogPath}: ${outcome.message}` };
		case 'parse-error':
			onLog(`config reconcile: config.json is not valid JSON (${outcome.message}); left untouched`);
			return { changed: false, filled: 0, repaired: 0, pruned: 0, error: `invalid config JSON: ${outcome.message}` };
		case 'read-error':
			onLog(`config reconcile: could not read config.json (${outcome.errno}): ${outcome.message}`);
			return { changed: false, filled: 0, repaired: 0, pruned: 0, error: `read error (${outcome.errno}): ${outcome.message}` };
		case 'write-error':
			onLog(`config reconcile: write failed: ${outcome.message}`);
			return { changed: outcome.result.changed, filled: outcome.result.filled.length, repaired: outcome.result.repaired.length, pruned: outcome.result.pruned.length, error: `write error: ${outcome.message}` };
		case 'concurrent-modification':
			onLog('config reconcile: config.json changed during reconcile; write abandoned');
			return { changed: outcome.result.changed, filled: outcome.result.filled.length, repaired: outcome.result.repaired.length, pruned: outcome.result.pruned.length, error: 'config changed during reconcile; write abandoned' };
	}
}

/** Drained stop then start. Faithful to `daemon-ctl.sh cmd_restart`. */
async function installedControl(): Promise<ManagedDaemonControl | undefined> {
	const installation = await readManagedInstallation();
	return installation === undefined ? undefined : new ManagedDaemonControl(installation);
}

export async function restart(onLog: LogFn, deps?: RestartDeps): Promise<MaintenanceResult> {
 if (deps === undefined) {
  try {
   const source = await resolveSourceControl(PATHS.insrc, process.env['INSRC_DAEMON_ROOT']);
   if (source) {
    onLog('restarting through the verified source owner');
    const outcome = await runSourceControl(source, 'restart');
    onLog(`${outcome.decision}: ${outcome.detail}`);
    return { ok: true, steps: outcome.forced ? ['stop', 'force-stop', 'start'] : ['stop', 'start'] };
   }
  } catch (error) { return { ok: false, steps: [], error: error instanceof Error ? error.message : String(error) }; }
 }
	if (deps === undefined || deps.managed !== undefined) {
		try {
			const control = await (deps?.managed ?? installedControl)();
			if (control !== undefined) {
				onLog('restarting managed daemon');
				const result = await control.run('restart');
				return { ok: true, steps: result.forced ? ['stop', 'force-stop', 'start'] : ['stop', 'start'] };
			}
		} catch (error) {
			return { ok: false, steps: [], error: error instanceof Error ? error.message : String(error) };
		}
	}
	if (deps === undefined) {
		try { await resolveOwnedToolchain(resolve(DAEMON_ROOT)); }
		catch (error) { return { ok: false, steps: [], error: error instanceof Error ? error.message : String(error) }; }
	}
	deps ??= { stopDaemon, startDaemon };
	onLog('stopping daemon');
	const steps = ['stop'];
	try {
		const outcome = await deps.stopDaemon();
		if (outcome.forced) {
			// A daemon that would not stop no longer ends the restart half down.
			steps.push('force-stop');
			onLog(`${describeStop(outcome)}; starting`);
		} else {
			onLog('daemon stopped; starting');
		}
	} catch (err) {
		return { ok: false, steps, error: err instanceof Error ? err.message : String(err) };
	}
	const r = await deps.startDaemon();
	steps.push('start');
	return r.started
		? { ok: true, steps }
		: { ok: false, steps, error: 'daemon did not become ready within 60 s' };
}

/** Test seam for `restart`: the stop and the start it drives. */
export interface RestartDeps {
	readonly stopDaemon:  () => Promise<StopOutcome>;
	readonly startDaemon: () => Promise<StartResult>;
	readonly managed?: () => Promise<Pick<ManagedDaemonControl, 'run'> | undefined>;
}

/** The registered repositories, asked of the daemon. Exported so a test can
 *  tell that the refresh uses it. */
export function listReposFromDaemon(): Promise<readonly RegisteredRepo[]> {
	return rpc<RegisteredRepo[]>('repo.list');
}

// ---------------------------------------------------------------------------
// spawn helpers
// ---------------------------------------------------------------------------

/** Run a command, streaming each output line to `onLog`; resolves the
 *  exit code. */
function stream(cmd: string, args: readonly string[], onLog: LogFn, cwd?: string, env?: NodeJS.ProcessEnv): Promise<number> {
	return new Promise<number>(resolve => {
		const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'], ...(cwd !== undefined ? { cwd } : {}), ...(env !== undefined ? { env } : {}) });
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
