/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for main-services.test.ts: a daemon worker that serves a few test
// methods through the worker request entry, as every s2 worker serves its own.
import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { getActiveEmbedderBackend } from '../../../../indexer/embedder.js';
import { directDispatch } from '../../../server.js';
import { StatusBoardClient } from '../../status-board.js';
import { startDaemonWorker } from '../../worker-entry.js';
import { serveRequests } from '../../worker-requests.js';

const { guardBlock, lockBlock, hubPort } = workerData as { guardBlock: SharedArrayBuffer; lockBlock: SharedArrayBuffer; hubPort: MessagePort };
const board = new StatusBoardClient(startDaemonWorker({ guardBlock, lockBlock, hubPort }));

serveRequests(hubPort, directDispatch({
	'x.echo': async params => ({ echo: params, threadId }),
	'x.fail': async () => { throw new Error('handler failed'); },
	'x.uncloneable': async () => ({ fn: () => 1 }),
	'x.backend': async () => getActiveEmbedderBackend(),
	'x.slow': async () => {
		await new Promise(r => setTimeout(r, 200));
		parentPort!.postMessage({ sideEffect: 'x.slow' });
		return 'late';
	},
	// As the admin worker answers it: the clients the router published on the board.
	'daemon.debug-status': async () => ({ clients: (await board.snapshot()).clients }),
}, {
	's.count': async (_params, send) => {
		send({ id: 0, stream: 'progress', data: { n: 1 } });
		send({ id: 0, stream: 'done', data: { n: 2 } });
	},
	's.wait': async (_params, send, signal) => {
		send({ id: 0, stream: 'progress', data: 'waiting' });
		await new Promise<void>(r => signal.addEventListener('abort', () => r()));
		parentPort!.postMessage({ aborted: 's.wait' });
	},
	's.uncloneable': async (_params, send) => { send({ id: 0, stream: 'progress', data: { fn: () => 1 } as unknown }); },
}));
parentPort!.postMessage('ready');
