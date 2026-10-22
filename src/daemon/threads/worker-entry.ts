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

import { declareLiveStoreOwner } from '../../db/graph/store.js';
import { installStoreGuard } from '../../db/store-guard.js';
import { setActiveEmbedderBackend } from '../../indexer/embedder.js';
import type { EmbedderBackend } from '../../indexer/embedder.js';
import { installLockManager } from '../../shared/locks/lock-manager.js';
import { enableMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import { HubClient } from './channel.js';
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

/** Prepare this worker thread; returns its hub client. */
export function startDaemonWorker(init: DaemonWorkerInit): HubClient {
	if (isMainThread) throw new NotADaemonWorkerError();
	declareLiveStoreOwner();
	installStoreGuard(init.guardBlock);
	installLockManager(init.lockBlock);
	enableMaintenanceLock();
	const hub = new HubClient(init.hubPort);
	wireWorkerStoreHealth(hub);
	// The embedder's backend is per thread: take the one the main thread decided (Epic 86197ac6 s2).
	hub.onPush('embedder.backend', backend => setActiveEmbedderBackend(backend as EmbedderBackend));
	installStepStateStore(new HubStepStateStore(hub));
	return hub;
}
