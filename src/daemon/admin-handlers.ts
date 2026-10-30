/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The admin methods (Epic 86197ac6, Story s2): the handlers the main thread's
 * table and the admin worker share, so both serve them from one source, and
 * the admin worker's own table, which answers status, debug-status and the
 * repository list from the status board instead of the live queue.
 */

import { readFileSync } from 'node:fs';

import { buildSettingsCatalog } from '../config/settings-catalog.js';
import { getLogger } from '../shared/logger.js';
import { PATHS } from '../shared/paths.js';
import type { AttachedClient, DaemonStatus, ThreadView } from '../shared/types.js';
import { guideGetResult, guideListResult } from './guide-sections.js';
import { probeMcpClients } from './mcp-register.js';
import { validateRepoPath } from '../db/repos.js';
import type { RpcHandlers } from './server.js';
import { readSteeringBlock } from './steering-inject.js';
import { launchUpdate, makeUpdateHandlers, readUpdateOutcome } from './update-runner.js';

const log = getLogger('daemon');

/**
 * Delay before the daemon shuts itself down after a daemon.update launch —
 * long enough for the { launched:true } result to flush to the caller's
 * socket, short enough that the detached helper's stop+start proceeds
 * promptly (Story S001 / sc1).
 */
export const UPDATE_SHUTDOWN_DELAY_MS = 250;

/**
 * config.show, config.catalog, guide.get, guide.list, daemon.shutdown,
 * daemon.update and daemon.updateOutcome, as the daemon has always served
 * them; `shutdown` starts the daemon's shutdown with a reason.
 */
export function sharedAdminHandlers(shutdown: (reason: string) => void): RpcHandlers {
	return {
		'config.show': async () => {
			try {
				const raw = readFileSync(PATHS.config, 'utf-8');
				return JSON.parse(raw) as Record<string, unknown>;
			} catch {
				return {};
			}
		},

		// The self-describing settings catalog (Story S001 / sc1): the enriched
		// CONFIG_CATALOG + role taxonomy + tier names + current values, assembled
		// by the pure buildSettingsCatalog. READ-ONLY — mirrors config.show's
		// parse-or-{} read; never writes config.json and never reloads sessions.
		'config.catalog': async () => {
			let rawConfig: Record<string, unknown> = {};
			try {
				rawConfig = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
			} catch { /* missing/invalid config → full schema with empty values */ }
			return buildSettingsCatalog(rawConfig) as unknown as Record<string, unknown>;
		},

		// insrc_guide (sc2) — read-only per-workflow guidance retrieval. Reads the
		// SAME canonical steering asset steering-inject ships (readSteeringBlock),
		// partitioned by the guide markers; a read failure is shaped as a structured
		// result inside guideGetResult/guideListResult, never escaping the IPC.
		'guide.get': async (params) => {
			const { workflow } = (params ?? {}) as { workflow?: string };
			return guideGetResult(readSteeringBlock, workflow) as unknown as Record<string, unknown>;
		},

		'guide.list': async () => {
			return guideListResult(readSteeringBlock) as unknown as Record<string, unknown>;
		},

		// Read-only probe: is the insrc MCP server already registered for each
		// known client (claude/codex via `mcp list`, vibe via its config.toml)?
		// Never throws. In sharedAdminHandlers (not only the main thread's table)
		// because the method-class table routes 'mcp.status' to the ADMIN WORKER —
		// a worker-side omission here answers 'unknown method: mcp.status' over the
		// socket even though the main table has it.
		'mcp.status': async (params) => {
			// Optional repo path: vibe's registration may live in the repo's own
			// project-layer .vibe/config.toml, so the probe checks both it and the
			// user-global config when a path is given.
			const rawPath = (params as { path?: unknown } | undefined)?.path;
			let repoPath: string | undefined;
			if (typeof rawPath === 'string' && rawPath.length > 0) {
				try { repoPath = validateRepoPath(rawPath); } catch { repoPath = undefined; }
			}
			return probeMcpClients({}, repoPath);
		},

		'daemon.shutdown': async () => {
			log.info('shutdown requested');
			shutdown('daemon.shutdown RPC');
			return { ok: true };
		},

		// Story S001 (sc1): the daemon-owned update+restart IPC. `daemon.update`
		// spawns a DETACHED helper (daemon-ctl.sh restart) that outlives this
		// process, then schedules our own shutdown so the helper's stop+start is
		// clean — the caller's socket drops and it reconnects to the fresh daemon.
		// `daemon.updateOutcome` reads back the terminal result the helper persists.
		...makeUpdateHandlers({
			launch:      launchUpdate,
			readOutcome: readUpdateOutcome,
			scheduleShutdown: () => {
				const t = setTimeout(() => shutdown('daemon.update RPC'), UPDATE_SHUTDOWN_DELAY_MS);
				t.unref();
			},
		}),
	};
}

/** What the admin worker's own three methods read. */
export interface AdminWorkerDeps {
	readonly shutdown: (reason: string) => void;
	readonly status: () => Promise<DaemonStatus>;
	readonly clients: () => Promise<readonly AttachedClient[]>;
	readonly repoList: () => Promise<unknown>;
	/** The worker threads from the status board (s4). */
	readonly threads: () => Promise<readonly ThreadView[]>;
}

/** The admin worker's table: the ten admin methods. */
export function adminWorkerHandlers(deps: AdminWorkerDeps): RpcHandlers {
	return {
		...sharedAdminHandlers(deps.shutdown),
		'daemon.status': async () => deps.status(),
		// Read-only: the clients the router published on the status board (k5).
		// With the worker threads beside them once any is published (s4); clients unchanged.
		'daemon.debug-status': async (): Promise<{ clients: AttachedClient[]; threads?: ThreadView[] }> => {
			const clients = [...await deps.clients()];
			const threads = [...await deps.threads()];
			return threads.length > 0 ? { clients, threads } : { clients };
		},
		'repo.list': async () => deps.repoList(),
	};
}
