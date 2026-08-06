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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DebugSection, DaemonCardModel } from './debug-types.js';
import type { DaemonStatus } from '../../shared/types.js';
import { getStatus } from './daemon.js';
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
