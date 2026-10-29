/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The main thread's services for its workers (Epic 86197ac6, Story s2): the
 * shared blocks (store guard, named locks, indexing), the status board, the
 * target registry, the shared step-state store and store health, all served
 * to each worker over its own channel's hub, plus a daemon.info op and the
 * embedding backend the main thread decided.
 *
 * Created only when daemon.threads.enabled is on; with it off the daemon is
 * single-threaded, as before.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { createStoreGuardBlock, installStoreGuard } from '../../db/store-guard.js';
import type { EmbedderBackend } from '../../indexer/embedder.js';
import { createLockBlock, installLockManager } from '../../shared/locks/lock-manager.js';
import { TOOL_SETTINGS_OP } from '../tools/config.js';
import type { ToolSettings } from '../tools/config.js';
import { enableMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus } from '../../shared/types.js';
import { pushToWorker, serveHub } from './channel.js';
import type { HubHandlers, MethodClass } from './channel.js';
import { createIndexingBlock } from './indexing-block.js';
import { TargetRegistry } from './registry.js';
import { StatusBoard, statusBoardHubHandlers } from './status-board.js';
import { LocalStepStateStore, installStepStateStore, stepStateHubHandlers } from './step-state.js';
import type { SharedStepStateStore } from './step-state.js';
import { wireMainStoreHealth } from './store-health-hub.js';
import { DEFAULT_MAINTENANCE_CONFIG } from './maintenance.js';
import type { MaintenanceConfig } from './maintenance.js';

/** Read daemon.threads.enabled from ~/.insrc/config.json. On by default: only an explicit false turns it off. */
export function threadsEnabled(): boolean {
	try {
		if (!existsSync(PATHS.config)) return true;
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { daemon?: { threads?: { enabled?: unknown } } };
		return raw.daemon?.threads?.enabled !== false;
	} catch {
		return true;
	}
}

/** The default daemon.threads.sessionIdleMs: a session's worker is released after 15 minutes idle (s3). */
export const DEFAULT_SESSION_IDLE_MS = 900_000;

/** daemon.threads.sessionIdleMs from ~/.insrc/config.json, read at start; the default when absent or not a non-negative number. */
export function sessionIdleMs(): number {
	try {
		if (!existsSync(PATHS.config)) return DEFAULT_SESSION_IDLE_MS;
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { daemon?: { threads?: { sessionIdleMs?: unknown } } };
		const v = raw.daemon?.threads?.sessionIdleMs;
		return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_SESSION_IDLE_MS;
	} catch {
		return DEFAULT_SESSION_IDLE_MS;
	}
}

/** daemon.maintenance.* from ~/.insrc/config.json, each falling back to its default when absent or not a non-negative number. */
export function maintenanceConfig(): MaintenanceConfig {
	let raw: Record<string, unknown> = {};
	try {
		if (existsSync(PATHS.config)) {
			const parsed = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { daemon?: { maintenance?: Record<string, unknown> } };
			raw = parsed.daemon?.maintenance ?? {};
		}
	} catch { /* defaults */ }
	const num = (key: keyof MaintenanceConfig): number => {
		const v = raw[key];
		return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_MAINTENANCE_CONFIG[key];
	};
	return { idleMs: num('idleMs'), minReclaimablePct: num('minReclaimablePct'), minReclaimableMb: num('minReclaimableMb'), pauseLimitMs: num('pauseLimitMs') };
}

/** The LMDB file's size in MiB, best-effort (undefined when absent or unreadable), as daemon.status reports it. */
export function currentLmdbFileSizeMb(): number | undefined {
	try {
		return existsSync(PATHS.lmdb) ? Math.round(statSync(PATHS.lmdb).size / 1024 / 1024) : undefined;
	} catch {
		return undefined;
	}
}

/** What daemon.info answers: the main thread's facts the admin worker needs for daemon.status. */
export interface DaemonInfo {
	readonly startedAt: number;
	readonly modelState: { status: string; pct?: number | undefined };
	readonly installedCommit: string;
	readonly lmdbFileSizeMb?: number | undefined;
	readonly maintenance?: DaemonStatus['maintenance'];
}

export const DAEMON_INFO_OP = 'daemon.info';
export const EMBEDDER_BACKEND_OP = 'embedder.backend';
/** A worker asks the main thread to shut the daemon down (daemon.shutdown and daemon.update served on the admin worker). */
export const SHUTDOWN_OP = 'daemon.shutdown';
/** The code-indexing worker's daemon.compact asks the main thread to run maintenance now; answers its CompactResult. */
export const MAINTENANCE_RUN_OP = 'maintenance.run';
/**
 * A worker's nested in-daemon call to another thread (s3): the main thread's router sends it
 * to that class's worker, or to the shared-state worker; answers the reply's result.
 */
export const ROUTE_OP = 'router.request';

/**
 * The running full indexes, pushed to every worker as the code-indexing worker publishes them
 * (s3); every worker takes them (worker-entry) and a session worker's search guard reads them
 * synchronously, as the main thread reads the board.
 */
export const INDEX_RUNS_OP = 'board.indexRuns';

/** What ROUTE_OP carries: the call, whether it goes to the shared-state worker, and the caller's maintenance hold. */
export interface RouteRequest {
	readonly cls: MethodClass;
	readonly method: string;
	readonly params: unknown;
	readonly shared?: true | undefined;
	readonly underHold?: boolean | undefined;
}

/** A worker's connection: what its workerData carries, the port to transfer, and the main thread's end. */
export interface WorkerConnection {
	readonly workerData: {
		readonly guardBlock: SharedArrayBuffer;
		readonly lockBlock: SharedArrayBuffer;
		readonly indexingBlock: SharedArrayBuffer;
		readonly hubPort: MessagePort;
	};
	readonly transferList: MessagePort[];
	/** The main thread's end: the hub is served on it, and requests for the worker are sent on it. */
	readonly port: MessagePort;
	/** Stop serving the hub on this channel and close it. */
	disconnect(): void;
}

export class ThreadServices {
	readonly guardBlock = createStoreGuardBlock();
	readonly lockBlock = createLockBlock();
	readonly indexingBlock = createIndexingBlock();
	readonly board = new StatusBoard();
	readonly registry = new TargetRegistry();
	private readonly ports = new Set<MessagePort>();
	private readonly handlers: HubHandlers;
	private embedderBackend: EmbedderBackend | undefined;
	private toolSettings: ToolSettings | undefined;
	private shutdown: ((reason: string) => void) | undefined;
	private maintenance: (() => Promise<unknown>) | undefined;
	private route: ((request: RouteRequest) => Promise<unknown>) | undefined;

	constructor(private readonly info: () => DaemonInfo, steps: SharedStepStateStore = new LocalStepStateStore()) {
		// The main thread joins the same blocks it hands to every worker.
		installStoreGuard(this.guardBlock);
		installLockManager(this.lockBlock);
		enableMaintenanceLock();
		installStepStateStore(steps);
		this.board.onIndexRuns(runs => { for (const port of this.ports) pushToWorker(port, INDEX_RUNS_OP, runs); });
		this.handlers = {
			...statusBoardHubHandlers(this.board),
			...stepStateHubHandlers(steps),
			...wireMainStoreHealth(() => this.ports),
			[DAEMON_INFO_OP]: () => this.info(),
			[SHUTDOWN_OP]: reason => { this.shutdown?.(String(reason)); },
			[ROUTE_OP]: a => {
				if (this.route === undefined) throw new Error('the daemon cannot route a nested call yet');
				return this.route(a as RouteRequest);
			},
			[MAINTENANCE_RUN_OP]: () => {
				if (this.maintenance === undefined) throw new Error('daemon.compact: maintenance is not available yet');
				return this.maintenance();
			},
		};
	}

	/** The daemon's shutdown, which a worker's SHUTDOWN_OP starts with its reason. */
	onShutdown(shutdown: (reason: string) => void): void {
		this.shutdown = shutdown;
	}

	/** What ROUTE_OP runs: the router's request to another thread (s3). */
	onRoute(route: (request: RouteRequest) => Promise<unknown>): void {
		this.route = route;
	}

	/** What MAINTENANCE_RUN_OP runs: maintenance now. */
	onMaintenance(run: () => Promise<unknown>): void {
		this.maintenance = run;
	}

	/** Open a channel for a new worker and serve the hub on the main thread's end. */
	connectWorker(): WorkerConnection {
		const { port1, port2 } = new MessageChannel();
		const stop = serveHub(port1, this.handlers);
		this.ports.add(port1);
		// A worker started after the backend was decided gets it at once.
		if (this.embedderBackend !== undefined) pushToWorker(port1, EMBEDDER_BACKEND_OP, this.embedderBackend);
		// And the tool settings the IDE last pushed (Story 5d393a4b).
		if (this.toolSettings !== undefined) pushToWorker(port1, TOOL_SETTINGS_OP, this.toolSettings);
		// And the running full indexes as they stand now.
		if (this.board.indexRuns().length > 0) pushToWorker(port1, INDEX_RUNS_OP, this.board.indexRuns());
		return {
			workerData: { guardBlock: this.guardBlock, lockBlock: this.lockBlock, indexingBlock: this.indexingBlock, hubPort: port2 },
			transferList: [port2],
			port: port1,
			disconnect: () => { stop(); this.ports.delete(port1); port1.close(); },
		};
	}

	/**
	 * The embedding backend the main thread decided (bootstrapEmbeddingModel).
	 * The embedder's choice is per thread, so every worker is told now and
	 * every later one when it connects.
	 */
	setEmbedderBackend(backend: EmbedderBackend): void {
		this.embedderBackend = backend;
		for (const port of this.ports) pushToWorker(port, EMBEDDER_BACKEND_OP, backend);
	}

	/** The tool settings the main thread now holds (tools.config.set is served there): every worker is told now, and every later one when it connects. */
	setToolSettings(settings: ToolSettings): void {
		this.toolSettings = settings;
		for (const port of this.ports) pushToWorker(port, TOOL_SETTINGS_OP, settings);
	}
}
