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

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';

import type { DebugSection, DaemonCardModel, OrphanScanResult, OrphanProcess, KillOutcome, DebugStatusModel, McpClientStatus, LogCategory, LogCategoryId, LogLine, LogFilter } from './debug-types.js';
import type { AttachedClient, DaemonStatus } from '../../shared/types.js';
import { getStatus, DAEMON_ENTRY } from './daemon.js';
import { pidFromFile } from './lifecycle.js';
import { DAEMON_ROOT } from './maintenance.js';
import { PATHS } from '../../shared/paths.js';
import { rpc } from '../client.js';

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

// --- Story s4: attached socket clients + per-client MCP registration ----------

/** Injectable dep for the attached-client read (Story s4): fetches the raw
 *  daemon.debug-status payload (real impl is the IPC rpc). */
export interface AttachedClientsDeps {
	readonly fetch: () => Promise<{ clients: readonly AttachedClient[] }>;
}

/** The known MCP clients (claude, codex) — one McpClientStatus is always returned per. */
export const MCP_CLIENTS: readonly McpClientStatus['client'][] = ['claude', 'codex'];

/** Result of a non-throwing `<cli> mcp list` run. `spawnError` is set when the
 *  binary itself could not be launched (ENOENT — not on PATH). */
export interface McpListRun {
	readonly code: number;
	readonly stdout: string;
	readonly spawnError?: string;
}

/** Injectable dep for the MCP-status read (Story s4): runs `<cli> mcp list`. */
export interface McpStatusDeps {
	readonly runList: (bin: string) => Promise<McpListRun>;
}

/**
 * Fold the daemon.debug-status read into a discriminated view-model (Story s4).
 * A resolve yields { reachable:true; clients } sorted by connectedAt; any reject
 * (daemon not running) yields { reachable:false } — never throws to the view.
 */
export async function attachedClientsWith(deps: AttachedClientsDeps): Promise<DebugStatusModel> {
	try {
		const { clients } = await deps.fetch();
		const sorted = [...clients].sort((a, b) => a.connectedAt - b.connectedAt);
		return { reachable: true, clients: sorted };
	} catch {
		return { reachable: false };
	}
}

/** Parse one `<cli> mcp list` stdout: registered = an `insrc` server line is
 *  present (anchored to line start, matching mcp-register.ts); connected = that
 *  line reports a live connection (a positive token / ✓, and no failure token). */
function parseMcpList(stdout: string): { registered: boolean; connected: boolean } {
	const line = stdout.split('\n').find(l => /^\s*insrc\b/.test(l));
	if (line === undefined) return { registered: false, connected: false };
	const positive = /✓/.test(line) || (/\bconnected\b/i.test(line) && !/\b(?:not connected|disconnected|failed|failing|error)\b/i.test(line));
	return { registered: true, connected: positive };
}

/**
 * Per-client MCP registration/connection status (Story s4). Runs `<cli> mcp list`
 * for each known client via the injected runner, parses registered + connected
 * independently, and NEVER throws: a spawn failure / non-zero exit resolves that
 * client to { available:false, ... } while the other client is still evaluated.
 * Always returns exactly one entry per known client, in MCP_CLIENTS order.
 */
export async function mcpStatusWith(deps: McpStatusDeps): Promise<readonly McpClientStatus[]> {
	const out: McpClientStatus[] = [];
	for (const client of MCP_CLIENTS) {
		try {
			const r = await deps.runList(client);
			if (r.spawnError !== undefined || r.code !== 0) {
				out.push({ client, available: false, registered: false, connected: false });
				continue;
			}
			const { registered, connected } = parseMcpList(r.stdout);
			out.push({ client, available: true, registered, connected });
		} catch {
			out.push({ client, available: false, registered: false, connected: false });
		}
	}
	return out;
}

/** Real `<cli> mcp list` runner (POSIX/win): captures code + stdout, NEVER throws
 *  (mirrors mcp-register.ts:runCli). */
function realRunList(bin: string): Promise<McpListRun> {
	return new Promise(resolve => {
		const child = spawn(bin, ['mcp', 'list'], { stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		child.stdout.on('data', c => { stdout += c.toString(); });
		child.stderr.on('data', () => { /* ignored — registration state is on stdout */ });
		child.on('error', err => resolve({ code: -1, stdout, spawnError: err.message }));
		child.on('close', code => resolve({ code: code ?? 0, stdout }));
	});
}

/** The Story-s4 `attachedClients()` facade method — bound onto the `debug` entry. */
export function attachedClients(): Promise<DebugStatusModel> {
	return attachedClientsWith({ fetch: () => rpc<{ clients: readonly AttachedClient[] }>('daemon.debug-status') });
}

/** The Story-s4 `mcpStatus()` facade method — bound onto the `debug` entry. */
export function mcpStatus(): Promise<readonly McpClientStatus[]> {
	return mcpStatusWith({ runList: realRunList });
}

// --- Story s5: rotation-aware log tailer + filter -----------------------------

/** How many trailing lines the initial tail emits (bounded). */
const TAIL_MAX_LINES = 500;

/** The tailable log categories (daemon + agent), in order. */
const LOG_CATEGORIES: readonly LogCategory[] = [
	{ id: 'daemon', title: 'Daemon', stem: 'daemon' },
	{ id: 'agent', title: 'Agent', stem: 'agent' },
];

/** The Story-s5 `logCategories()` facade method — static, opens no stream. */
export function logCategories(): readonly LogCategory[] {
	return LOG_CATEGORIES;
}

/**
 * Injectable fs seam for the tailer (Story s5) — split out so rotation/append/
 * parse are unit-testable without a real disk watcher. `listSegments` returns the
 * `<stem>.*.log` files under logDir sorted ascending by rotation number (the
 * active segment is the last); `readLines` returns a file's current lines; `watch`
 * installs a directory watcher firing on any append/creation and returns an
 * unwatch. `maxLines` bounds the initial tail.
 */
export interface TailDeps {
	readonly logDir: string;
	readonly listSegments: (dir: string, stem: string) => string[];
	readonly readLines: (file: string) => string[];
	readonly watch: (dir: string, onEvent: () => void) => () => void;
	readonly maxLines: number;
}

/** Best-effort parse of a raw tail line into a LogLine. A pino-JSON line fills
 *  time/level/module(name)/msg; a non-JSON / partial line keeps only `raw`. */
function parseLogLine(raw: string): LogLine {
	try {
		const o = JSON.parse(raw) as Record<string, unknown>;
		if (o !== null && typeof o === 'object') {
			return {
				raw,
				...(typeof o['time'] === 'number' ? { time: o['time'] } : {}),
				...(typeof o['level'] === 'number' ? { level: o['level'] } : {}),
				...(typeof o['name'] === 'string' ? { module: o['name'] } : {}),
				...(typeof o['msg'] === 'string' ? { msg: o['msg'] } : {}),
			};
		}
	} catch { /* non-JSON — raw only */ }
	return { raw };
}

/**
 * Rotation-aware tail of a category `stem` (Story s5). Resolves the active
 * `<stem>.<N>.<ext>` segment (highest-N / last), emits its last-`maxLines` lines,
 * then on each fs event emits only the newly-appended lines; when a newer segment
 * appears it re-resolves and follows it (lc2). A `disposed` guard suppresses any
 * post-dispose emit. NEVER throws to the caller — a missing dir / read / watch
 * error degrades to an empty (initial) emit + a quiet retry on the next event.
 * Returns an idempotent dispose() that removes the watcher.
 */
export function tailLogWith(stem: string, onLines: (lines: readonly LogLine[]) => void, deps: TailDeps): () => void {
	let disposed = false;
	let activeFile: string | undefined;
	let seen = 0; // count of lines of activeFile already emitted

	const resolveActive = (): string | undefined => {
		try {
			const segs = deps.listSegments(deps.logDir, stem);
			return segs.length > 0 ? segs[segs.length - 1] : undefined;
		} catch {
			return undefined;
		}
	};

	const emit = (initial: boolean): void => {
		if (disposed) return;
		const active = resolveActive();
		if (active === undefined) {
			if (initial) onLines([]); // loaded-but-empty; a later event retries
			return;
		}
		if (active !== activeFile) { activeFile = active; seen = 0; } // new/rotated segment
		let lines: string[];
		try {
			lines = deps.readLines(active);
		} catch {
			return; // transient read error — retry on the next event
		}
		if (lines.length < seen) seen = 0;                                  // truncated/replaced → re-tail
		if (seen === 0 && lines.length > deps.maxLines) seen = lines.length - deps.maxLines; // initial: last-N only
		const fresh = lines.slice(seen);
		seen = lines.length;
		if (initial || fresh.length > 0) onLines(fresh.map(parseLogLine));
	};

	emit(true);
	let unwatch: () => void = () => {};
	try {
		unwatch = deps.watch(deps.logDir, () => { if (!disposed) emit(false); });
	} catch { /* no watcher installable — the initial emit still delivered */ }

	return () => {
		if (disposed) return;
		disposed = true;
		try { unwatch(); } catch { /* ignore */ }
	};
}

/**
 * Pure filter predicate over a LogLine (Story s5). minLevel keeps lines whose
 * numeric level >= minLevel (a line with no level — non-JSON — is dropped by an
 * active minLevel); module is a case-insensitive substring match on LogLine.module
 * (a line with no module is dropped by an active module filter); text is a
 * case-insensitive substring over LogLine.raw. Unset fields impose no constraint;
 * active fields are ANDed. Free-text still matches a non-JSON line via `raw`.
 */
export function matchesFilter(line: LogLine, filter: LogFilter): boolean {
	if (filter.minLevel !== undefined) {
		if (line.level === undefined || line.level < filter.minLevel) return false;
	}
	if (filter.module !== undefined && filter.module !== '') {
		if (line.module === undefined || !line.module.toLowerCase().includes(filter.module.toLowerCase())) return false;
	}
	if (filter.text !== undefined && filter.text !== '') {
		if (!line.raw.toLowerCase().includes(filter.text.toLowerCase())) return false;
	}
	return true;
}

/** Real fs seam bound to node:fs, resolving `<stem>.<N>.log` segments under logDir. */
const realTailDeps: TailDeps = {
	logDir: PATHS.logDir,
	listSegments: (dir, stem) => {
		const re = new RegExp(`^${stem}\\.(\\d+)\\.log$`);
		const matched: { file: string; n: number }[] = [];
		for (const name of readdirSync(dir)) {
			const m = re.exec(name);
			if (m !== null && m[1] !== undefined) matched.push({ file: join(dir, name), n: Number.parseInt(m[1], 10) });
		}
		matched.sort((a, b) => a.n - b.n);
		return matched.map(x => x.file);
	},
	readLines: file => {
		const lines = readFileSync(file, 'utf8').split('\n');
		if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // drop trailing empty
		return lines;
	},
	watch: (dir, onEvent) => {
		const w = fsWatch(dir, { persistent: false }, () => onEvent());
		w.on('error', () => { /* watcher error — swallow; a re-open happens on the next tailLog */ });
		return () => { try { w.close(); } catch { /* ignore */ } };
	},
	maxLines: TAIL_MAX_LINES,
};

/** The Story-s5 `tailLog()` facade method — bound onto the `debug` entry. */
export function tailLog(categoryId: LogCategoryId, onLines: (lines: readonly LogLine[]) => void): () => void {
	const stem = LOG_CATEGORIES.find(c => c.id === categoryId)?.stem ?? categoryId;
	return tailLogWith(stem, onLines, realTailDeps);
}
