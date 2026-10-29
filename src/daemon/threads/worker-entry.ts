/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The start of every daemon worker (Epic 86197ac6, Story s1, t10). Module state
 * is per thread, so each worker must declare itself part of the store-owning
 * daemon, join the process's store guard and named locks and reach the main
 * thread's hub before it touches a store, a lock or a step's state.
 *
 * Only a worker the daemon started calls this: a client process never runs
 * daemon worker code, so it is still refused on the live stores.
 */

import { isMainThread } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { closeGraphStore, declareLiveStoreOwner } from '../../db/graph/store.js';
import { installStoreGuard } from '../../db/store-guard.js';
import { setActiveEmbedderBackend } from '../../indexer/embedder.js';
import type { EmbedderBackend } from '../../indexer/embedder.js';
import type { IndexRunView } from '../../indexer/run-record.js';
import { installLockManager } from '../../shared/locks/lock-manager.js';
import { enableMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import { getModelRegistry } from '../model-registry.js';
import { TOOL_SETTINGS_OP, replaceToolSettings } from '../tools/config.js';
import type { ToolSettings } from '../tools/config.js';
import { HubClient } from './channel.js';
import { INDEX_RUNS_OP } from './main-services.js';
import { HubStepStateStore, installStepStateStore } from './step-state.js';
import { wireWorkerStoreHealth } from './store-health-hub.js';

export interface DaemonWorkerInit {
	/** The store guard's shared block, created once by the main thread. */
	readonly guardBlock: SharedArrayBuffer;
	/** The named locks' shared block (createLockBlock), created once by the main thread. */
	readonly lockBlock: SharedArrayBuffer;
	/** This worker's end of its channel to the main thread's hub. */
	readonly hubPort: MessagePort;
}

export class NotADaemonWorkerError extends Error {
	constructor() {
		super('startDaemonWorker runs only in a worker thread the insrc daemon started, never on a main thread.');
		this.name = 'NotADaemonWorkerError';
	}
}

/**
 * Daemon maintenance asks every worker to close its graph store handle before
 * it compacts: the worker closes it and answers 'closed' on the port it was
 * given. Its next use reopens it, once maintenance has released its lock.
 */
export const GRAPH_CLOSE_OP = 'graph.close';

/** The running full indexes as the main thread last pushed them (s3); every worker takes the push. */
let indexRuns: readonly IndexRunView[] = [];

/** The running full index of `repoPath`, from the last push (a session worker's search guard reads it). */
export function pushedIndexRun(repoPath: string): IndexRunView | undefined {
	return indexRuns.find(r => r.repoPath === repoPath);
}

/** Prepare this worker thread; returns its hub client. */
export function startDaemonWorker(init: DaemonWorkerInit): HubClient {
	if (isMainThread) throw new NotADaemonWorkerError();
	// Load and validate this thread's model registry first (Epic ce99b720 s1): a bad
	// definitions file throws ModelCatalogValidationError and fails this worker's start.
	getModelRegistry();
	declareLiveStoreOwner();
	installStoreGuard(init.guardBlock);
	installLockManager(init.lockBlock);
	enableMaintenanceLock();
	const hub = new HubClient(init.hubPort);
	wireWorkerStoreHealth(hub);
	// The embedder's backend is per thread: take the one the main thread decided (Epic 86197ac6 s2).
	hub.onPush('embedder.backend', backend => setActiveEmbedderBackend(backend as EmbedderBackend));
	installStepStateStore(new HubStepStateStore(hub));
	// The tool settings live on the main thread, which pushes each change (Story 5d393a4b).
	hub.onPush(TOOL_SETTINGS_OP, settings => replaceToolSettings(settings as ToolSettings));
	hub.onPush(INDEX_RUNS_OP, runs => { indexRuns = runs as readonly IndexRunView[]; });
	hub.onPush(GRAPH_CLOSE_OP, async ack => {
		await closeGraphStore();
		(ack as MessagePort).postMessage('closed');
		(ack as MessagePort).close();
	});
	return hub;
}
