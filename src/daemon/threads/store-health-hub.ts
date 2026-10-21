/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Store health across threads (Epic 86197ac6, Story s1, t5): the thread that
 * finds the graph store's locks lost sends its full record to the main thread,
 * which keeps it and pushes it to every worker, so every thread reports the
 * operation that failed, not only that some thread found it. (Every thread
 * already stops using the store at once through the shared health word.)
 */

import type { MessagePort } from 'node:worker_threads';

import { receiveStoreHealth, setStoreHealthBroadcaster } from '../../db/graph/store.js';
import type { StoreHealth } from '../../db/graph/store.js';
import { pushToWorker } from './channel.js';
import type { HubClient, HubHandlers } from './channel.js';

const OP = 'store.health';

type WorkerPorts = () => Iterable<Pick<MessagePort, 'postMessage'>>;

function fanOut(ports: WorkerPorts, health: StoreHealth): void {
	for (const port of ports()) pushToWorker(port, OP, health);
}

/**
 * Main thread: take a worker's record and push it to every worker, and make a
 * detection on the main thread itself go to every worker too.
 */
export function wireMainStoreHealth(ports: WorkerPorts): HubHandlers {
	setStoreHealthBroadcaster(health => fanOut(ports, health));
	return {
		[OP]: (health) => {
			receiveStoreHealth(health as StoreHealth);
			fanOut(ports, health as StoreHealth);
		},
	};
}

/** Worker: send a detection to the main thread, and take the records it pushes. */
export function wireWorkerStoreHealth(hub: HubClient): void {
	setStoreHealthBroadcaster(health => hub.send(OP, health));
	hub.onPush(OP, health => receiveStoreHealth(health as StoreHealth));
}
