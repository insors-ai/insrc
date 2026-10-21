/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for registry-board.test.ts: publishes its status twice, then reads a
// snapshot back through the hub and reports it.
import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../channel.js';
import { StatusBoardClient } from '../../status-board.js';

const board = new StatusBoardClient(new HubClient((workerData as { port: MessagePort }).port));
board.publish({ threadId, cls: 'session', session: { label: 'mcp', pid: 7 }, busy: true, method: 'first', since: 1, queued: 0 });
board.publish({ threadId, cls: 'session', session: { label: 'mcp', pid: 7 }, busy: true, method: 'analyze.step', since: 2, queued: 1 });
board.snapshot().then(s => parentPort!.postMessage({ threadId, snapshot: s }), (e: Error) => parentPort!.postMessage({ error: e.message }));
