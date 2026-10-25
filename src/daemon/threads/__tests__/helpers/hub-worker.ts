/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for channel.test.ts: sends hub requests over the port it was given and
// reports each answer or error to its parent.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../channel.js';

const { port, calls } = workerData as { port: MessagePort; calls: readonly { op: string; args: unknown }[] };
const hub = new HubClient(port);
for (const call of calls) {
	hub.request(call.op, call.args).then(
		value => parentPort!.postMessage({ op: call.op, ok: true, value }),
		(e: Error) => parentPort!.postMessage({ op: call.op, ok: false, name: e.name, message: e.message }),
	);
}
parentPort!.postMessage({ op: 'sent', ok: true, value: hub.pendingCount });
