/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for review-task-binding.test.ts / review-task-signal.test.ts: a
// minimal review worker that sends the 'review-admission-saved' frame the
// bootstrap waits for, then stays alive and answers nothing (no RPCs are
// needed for admission binding or progress signalling tests). Unlike the
// native port it would normally serve, it keeps the transferred port open so
// the hub connection registered on the main side stays live.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import type { ReviewBootstrapInput } from '../../review-worker-contract.js';

const { review, nativePort } = workerData as { review: ReviewBootstrapInput; nativePort: MessagePort };
parentPort!.postMessage({
  kind: 'review-admission-saved',
  key: review.key,
  incarnation: review.incarnation,
  attempt: review.attempt,
  checkpointPath: `${review.key.project}/.insrc/tmp/stub.json`,
});
// Keep the native port open: closing it drops the hub connection on the main
// side, which closes the entry and refuses further acceptProgress calls.
nativePort.on('message', () => {});
