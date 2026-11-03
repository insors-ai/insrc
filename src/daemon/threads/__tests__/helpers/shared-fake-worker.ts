/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for purge-shared.test.ts: plays the shared-state worker. It records the purge's nested
// calls, and its todos.cleanup emits a todos event to every open todos.subscribe stream it serves.
import { parentPort, threadId, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { directDispatch } from '../../../server.js';
import { serveRequests } from '../../worker-requests.js';

const subscribers = new Set<(event: unknown) => void>();
serveRequests((workerData as { port: MessagePort }).port, directDispatch({
	'chat.dropSession': async (params) => { parentPort!.postMessage({ method: 'chat.dropSession', params, threadId }); return { ok: true }; },
	'todos.cleanup': async (params) => {
		parentPort!.postMessage({ method: 'todos.cleanup', params, threadId });
		for (const send of subscribers) send({ kind: 'cleanup', sessionIds: (params as { sessionIds: string[] }).sessionIds });
		return { deletedListCount: 2, deletedItemCount: 5 };
	},
}, {
	'todos.subscribe': async (_params, send, abort) => {
		const push = (event: unknown): void => send({ id: 0, stream: 'todos', data: event });
		subscribers.add(push);
		send({ id: 0, stream: 'todos', data: { kind: 'subscribed' } });
		await new Promise<void>(resolve => abort.addEventListener('abort', () => resolve(), { once: true }));
		subscribers.delete(push);
		send({ id: 0, stream: 'done', data: null });
	},
}));
parentPort!.postMessage('worker-ready');
