/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for review-task-binding.test.ts: a minimal review worker that sends the
// 'review-admission-saved' frame the bootstrap waits for, then stays alive and
// answers nothing (no RPCs are needed for admission binding tests).
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
nativePort.close();
