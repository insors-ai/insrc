/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The admin worker (Epic 86197ac6, Story s2): serves the admin methods —
 * daemon.status, daemon.debug-status, repo.list, config.show, config.catalog,
 * guide.list, guide.get, daemon.shutdown, daemon.update and
 * daemon.updateOutcome — from the status board and the main thread's
 * daemon.info, so they answer while other threads are busy. It loads only the
 * admin handlers, not the daemon's whole handler runtime.
 */

import { parentPort, workerData } from 'node:worker_threads';

import { getDb } from '../../db/client.js';
import { listRepos } from '../../db/repos.js';
import { adminWorkerHandlers } from '../admin-handlers.js';
import { unattributedUnwritable, withCompleteness } from '../repo-completeness.js';
import { directDispatch } from '../server.js';
import { createAdminStatus } from './admin-status.js';
import { DAEMON_INFO_OP, SHUTDOWN_OP } from './main-services.js';
import type { DaemonInfo, WorkerConnection } from './main-services.js';
import { StatusBoardClient } from './status-board.js';
import { startDaemonWorker } from './worker-entry.js';
import { serveRequests } from './worker-requests.js';

const init = workerData as WorkerConnection['workerData'];
const hub = startDaemonWorker(init);
const board = new StatusBoardClient(hub);

const status = createAdminStatus({
	snapshot: () => board.snapshot(),
	info: () => hub.request<DaemonInfo>(DAEMON_INFO_OP, null),
	readRepos: async () => withCompleteness(await listRepos(await getDb()), r => r.path),
	readUnattributed: unattributedUnwritable,
});

serveRequests(init.hubPort, directDispatch(adminWorkerHandlers({
	shutdown: reason => hub.send(SHUTDOWN_OP, reason),
	status: () => status.daemonStatus(),
	clients: async () => (await board.snapshot()).clients,
	repoList: () => status.repoList(),
})));

parentPort!.postMessage('worker-ready');
