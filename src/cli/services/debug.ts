/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Debug service (sc1) — the `debug` facade added to `makeServices`.
 *
 * Story s1 (scaffold): the facade holds only the ordered `sections` metadata
 * registry that drives the Debug pane's inner tab strip. Each later section
 * story (s2-s5) augments the `DebugService` interface with its own read methods
 * (status card, orphan scan/kill, debug-status clients, log tail).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DebugSection, DaemonCardModel, OrphanScanResult, OrphanProcess, KillOutcome } from './debug-types.js';
import type { DaemonStatus } from '../../shared/types.js';
import { getStatus, DAEMON_ENTRY } from './daemon.js';
import { pidFromFile } from './lifecycle.js';
import { DAEMON_ROOT } from './maintenance.js';
import { PATHS } from '../../shared/paths.js';

/** The three Debug-pane sections, in `DebugSectionId` order. Single source of truth. */
export const sections: readonly DebugSection[] = [
	{ id: 'daemon', title: 'Daemon' },
	{ id: 'mcp', title: 'MCP' },
	{ id: 'logs', title: 'Logs' },
];

/**
 * Injectable dependencies for the Daemon status card (Story s2). The daemon-held
 * fields come over the daemon.status IPC (`getStatus`); socket/pid/version are
 * client-known reads. Split out so unit tests can drive resolving/rejecting
 * status + missing-field degradation without a real socket or install.
 */
export interface DaemonStatusDeps {
	readonly getStatus: () => Promise<DaemonStatus>;
	readonly socket: string;
	readonly pidFile: string;
	readonly daemonRoot: string;
}

const realDeps: DaemonStatusDeps = {
	getStatus,
	socket: PATHS.sockFile,
	pidFile: PATHS.pidFile,
	daemonRoot: DAEMON_ROOT,
};

/** Best-effort managed pid from the pidfile — undefined if absent/non-numeric. */
function readPid(pidFile: string): number | undefined {
	try {
		if (!existsSync(pidFile)) return undefined;
		const n = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
		return Number.isFinite(n) ? n : undefined;
	} catch {
		return undefined;
	}
}

/** Best-effort installed-daemon version from `<DAEMON_ROOT>/package.json`. */
function readVersion(daemonRoot: string): string | undefined {
	try {
		const pkg = JSON.parse(readFileSync(join(daemonRoot, 'package.json'), 'utf8')) as { version?: unknown };
		return typeof pkg.version === 'string' ? pkg.version : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Assemble the Daemon status-card view-model. Reads daemon-held state over the
 * daemon.status IPC and folds ANY reject (socket absent, transient error) into
 * `{ reachable: false }` — it never throws to the view. Only workspace repos are
 * counted (synthetic shared-modules rows are excluded). Client-known socket/pid/
 * version are best-effort and degrade to undefined.
 */
export async function buildDaemonCard(deps: DaemonStatusDeps = realDeps): Promise<DaemonCardModel> {
	let status: DaemonStatus;
	try {
		status = await deps.getStatus();
	} catch {
		return { reachable: false };
	}
	const workspace = status.repos.filter(r => r.kind === undefined || r.kind === 'workspace');
	return {
		reachable: true,
		uptimeSec: status.uptime,
		repoCount: workspace.length,
		repos: workspace.map(r => ({ name: r.name, status: r.status })),
		socket: deps.socket,
		pid: readPid(deps.pidFile),
		version: readVersion(deps.daemonRoot),
	};
}

/** The sc1 `daemonStatus()` facade method — bound onto the `debug` entry in makeServices. */
export function daemonStatus(): Promise<DaemonCardModel> {
	return buildDaemonCard();
}

// --- Story s3: orphan daemon-process scan + guarded kill -----------------------

/** SIGTERM→SIGKILL grace window (ms), mirroring daemon-ctl.sh's stop drain. */
const KILL_GRACE_MS = 3_000;

/**
 * Injectable dependencies for the orphan scan (Story s3). Split out so unit tests
 * drive the match/exclude/degrade logic against canned `ps` text with no real
 * subprocess. `daemonEntry` is the resolved absolute daemon/index.js path a
 * candidate's command line must contain; `managedPid` is the running daemon to
 * exclude; `platform` gates the POSIX-only support.
 */
export interface OrphanScanDeps {
	readonly runPs: () => string;
	readonly platform: NodeJS.Platform;
	readonly managedPid: number | undefined;
	readonly daemonEntry: string;
}

/** Injectable dependencies for the orphan kill (Story s3). `kill(pid, 0)` is the
 *  liveness re-probe (throws when the process is gone); `wait` is the escalation
 *  clock (instant in tests). The managed pid is re-excluded as defence-in-depth. */
export interface OrphanKillDeps {
	readonly kill: (pid: number, signal: NodeJS.Signals | 0) => void;
	readonly wait: (ms: number) => Promise<void>;
	readonly platform: NodeJS.Platform;
	readonly managedPid: number | undefined;
}

/** Classify a `process.kill` failure: ESRCH (no such process) → already gone. */
function killErrorResult(err: unknown): 'not-found' | 'error' {
	return (err as { code?: string } | null)?.code === 'ESRCH' ? 'not-found' : 'error';
}

/**
 * Scan for orphan daemon processes (Story s3). POSIX-only: parses `ps` output
 * (`pid command`-per-line), keeps only lines whose command contains the resolved
 * absolute `daemonEntry`, and EXCLUDES the managed daemon's own pid — so the
 * result is strictly stray daemon-entry processes. Read-only: a recommendation,
 * never a signal (k2/lc1). Never throws to the view: a `ps` failure or parse
 * error degrades to `{ supported:true; orphans:[] }`; non-POSIX → `{ supported:false }`.
 */
export function scanOrphansWith(deps: OrphanScanDeps): OrphanScanResult {
	if (deps.platform === 'win32') return { supported: false };
	let out: string;
	try {
		out = deps.runPs();
	} catch {
		return { supported: true, orphans: [] };
	}
	const orphans: OrphanProcess[] = [];
	for (const line of out.split('\n')) {
		const m = /^\s*(\d+)\s+(.*\S)\s*$/.exec(line);
		if (m === null) continue;
		const [, pidStr, command] = m;
		if (pidStr === undefined || command === undefined) continue;
		const pid = Number.parseInt(pidStr, 10);
		if (!Number.isInteger(pid) || pid <= 0) continue;
		if (!command.includes(deps.daemonEntry)) continue;
		if (deps.managedPid !== undefined && pid === deps.managedPid) continue;
		orphans.push({ pid, command });
	}
	return { supported: true, orphans };
}

/**
 * Terminate exactly the passed orphan pids (Story s3). Acts ONLY on `pids` — no
 * 'all' overload (lc1/k2) — and re-excludes the managed pid (k5, reported
 * 'not-found'/skipped). Escalation mirrors daemon-ctl.sh: SIGTERM every target,
 * wait once (~3s), then SIGKILL only the survivors (liveness re-probed via
 * `kill(pid,0)`). Per-pid signal failures fold into that pid's KillOutcome
 * (ESRCH→'not-found', else 'error'); the call never throws and no-ops off-POSIX.
 * Outcomes are returned in the input pid order.
 */
export async function killOrphansWith(pids: readonly number[], deps: OrphanKillDeps): Promise<KillOutcome[]> {
	if (deps.platform === 'win32') return [];
	const isManaged = (pid: number): boolean => deps.managedPid !== undefined && pid === deps.managedPid;
	const targets = pids.filter(pid => !isManaged(pid));

	/** Terminal result per resolved target; `pending` awaits the grace window. */
	const result = new Map<number, KillOutcome['result']>();
	const pending: number[] = [];
	for (const pid of targets) {
		try {
			deps.kill(pid, 'SIGTERM');
			pending.push(pid);
		} catch (err) {
			result.set(pid, killErrorResult(err));
		}
	}

	if (pending.length > 0) {
		await deps.wait(KILL_GRACE_MS);
	}

	for (const pid of pending) {
		let alive = true;
		try {
			deps.kill(pid, 0);
		} catch {
			alive = false;
		}
		if (!alive) {
			result.set(pid, 'terminated');
			continue;
		}
		try {
			deps.kill(pid, 'SIGKILL');
			result.set(pid, 'forced');
		} catch (err) {
			// Gone between probe and SIGKILL counts as forced-terminated; else a real error.
			result.set(pid, killErrorResult(err) === 'not-found' ? 'forced' : 'error');
		}
	}

	// Managed pids are never signalled (k5) — reported skipped as 'not-found'.
	return pids.map(pid => ({ pid, result: isManaged(pid) ? 'not-found' : result.get(pid) ?? 'error' }));
}

/** Real `ps` scan of every process's full command line (POSIX). */
function realPs(): string {
	return execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' });
}

/** The Story-s3 `scanOrphans()` facade method — bound onto the `debug` entry. */
export function scanOrphans(): OrphanScanResult {
	return scanOrphansWith({
		runPs: realPs,
		platform: process.platform,
		managedPid: pidFromFile(),
		daemonEntry: DAEMON_ENTRY,
	});
}

/** The Story-s3 `killOrphans()` facade method — bound onto the `debug` entry. */
export function killOrphans(pids: readonly number[]): Promise<KillOutcome[]> {
	return killOrphansWith(pids, {
		kill: (pid, signal) => { process.kill(pid, signal); },
		wait: ms => new Promise<void>(resolve => { setTimeout(resolve, ms); }),
		platform: process.platform,
		managedPid: pidFromFile(),
	});
}
