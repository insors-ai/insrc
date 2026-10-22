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
import { PATHS } from '../../shared/paths.js';
import type { DaemonStatus } from '../../shared/types.js';
import { pushToWorker, serveHub } from './channel.js';
import type { HubHandlers } from './channel.js';
import { createIndexingBlock } from './indexing-block.js';
import { TargetRegistry } from './registry.js';
import { StatusBoard, statusBoardHubHandlers } from './status-board.js';
import { LocalStepStateStore, installStepStateStore, stepStateHubHandlers } from './step-state.js';
import type { SharedStepStateStore } from './step-state.js';
import { wireMainStoreHealth } from './store-health-hub.js';

/** Read daemon.threads.enabled from ~/.insrc/config.json. Fail-safe: off when absent, unreadable or not true. */
export function threadsEnabled(): boolean {
	try {
		if (!existsSync(PATHS.config)) return false;
		const raw = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { daemon?: { threads?: { enabled?: unknown } } };
		return raw.daemon?.threads?.enabled === true;
	} catch {
		return false;
	}
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
	private shutdown: ((reason: string) => void) | undefined;

	constructor(private readonly info: () => DaemonInfo, steps: SharedStepStateStore = new LocalStepStateStore()) {
		// The main thread joins the same blocks it hands to every worker.
		installStoreGuard(this.guardBlock);
		installLockManager(this.lockBlock);
		installStepStateStore(steps);
		this.handlers = {
			...statusBoardHubHandlers(this.board),
			...stepStateHubHandlers(steps),
			...wireMainStoreHealth(() => this.ports),
			[DAEMON_INFO_OP]: () => this.info(),
			[SHUTDOWN_OP]: reason => { this.shutdown?.(String(reason)); },
		};
	}

	/** The daemon's shutdown, which a worker's SHUTDOWN_OP starts with its reason. */
	onShutdown(shutdown: (reason: string) => void): void {
		this.shutdown = shutdown;
	}

	/** Open a channel for a new worker and serve the hub on the main thread's end. */
	connectWorker(): WorkerConnection {
		const { port1, port2 } = new MessageChannel();
		const stop = serveHub(port1, this.handlers);
		this.ports.add(port1);
		// A worker started after the backend was decided gets it at once.
		if (this.embedderBackend !== undefined) pushToWorker(port1, EMBEDDER_BACKEND_OP, this.embedderBackend);
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
}
