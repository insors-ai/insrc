/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for worker-model-registry.test.ts: starts as a daemon worker
// (startDaemonWorker, which loads this thread's model registry) and reports the
// models its registry serves. A bad definitions file makes startDaemonWorker
// throw, failing the worker's start before it reports anything.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { getModelRegistry } from '../../../model-registry.js';
import { startDaemonWorker } from '../../worker-entry.js';

const { guardBlock, lockBlock, hubPort } = workerData as { guardBlock: SharedArrayBuffer; lockBlock: SharedArrayBuffer; hubPort: MessagePort };
startDaemonWorker({ guardBlock, lockBlock, hubPort });
// Reached only when startDaemonWorker returned: the test tells a failure inside the start from a later one.
parentPort!.postMessage({ op: 'started' });

const registry = getModelRegistry();
parentPort!.postMessage({
	op:      'ready',
	codex:   registry.models('cli-codex').map(m => m.id),
	ollama:  registry.models('ollama').map(m => m.id),
});
