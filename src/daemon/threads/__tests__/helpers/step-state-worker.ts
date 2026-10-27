/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for step-state.test.ts: runs the main thread's step-state operations
// over the hub and reports results.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../channel.js';
import { getStepStateStore, HubStepStateStore, installStepStateStore } from '../../step-state.js';
import type { StepKind } from '../../step-state.js';

installStepStateStore(new HubStepStateStore(new HubClient((workerData as { port: MessagePort }).port)));
parentPort!.on('message', async (m: { op: 'mint' | 'mint-unclonable' | 'read' | 'pin' | 'compare'; kind: StepKind; token?: string; payload?: unknown; until?: number; revision?: number }) => {
	try {
		const store = getStepStateStore();
		if (m.op === 'compare') parentPort!.postMessage({ ok: true, replaced: await store.compareReplace(m.kind, m.token!, m.revision!, m.payload) });
  else if (m.op === 'pin') { await store.pin(m.kind, m.token!, m.until!); parentPort!.postMessage({ ok: true }); }
  else if (m.op === 'mint') parentPort!.postMessage({ ok: true, token: await store.mint(m.kind, m.payload) });
		else if (m.op === 'mint-unclonable') parentPort!.postMessage({ ok: true, token: await store.mint(m.kind, { run: () => 1 }) });
		else parentPort!.postMessage({ ok: true, entry: await store.read(m.kind, m.token!) });
	} catch (e) {
		parentPort!.postMessage({ ok: false, name: (e as Error).name, message: (e as Error).message });
	}
});
parentPort!.postMessage({ ok: true, ready: true });
