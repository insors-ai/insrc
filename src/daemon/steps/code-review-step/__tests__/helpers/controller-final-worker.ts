import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { HubClient } from '../../../../threads/channel.js';
import { HubStepStateStore, installStepStateStore } from '../../../../threads/step-state.js';
import { DEFAULT_DEPS, handleCodeReviewStep } from '../../handler.js';
import { runCodeReview } from '../../../../../workflow/code-review/runner.js';

installStepStateStore(new HubStepStateStore(new HubClient((workerData as { port: MessagePort }).port)));
let release!: () => void;
const released = new Promise<void>(resolve => { release = resolve; });
parentPort!.on('message', (message: { operation: 'answer' | 'release'; input?: unknown }) => {
 if (message.operation === 'release') { release(); return; }
 void handleCodeReviewStep(message.input, { ...DEFAULT_DEPS,
  runReview: async (subject, provider, opts, deps) => { parentPort!.postMessage({ event: 'fold-entered' }); await released; return runCodeReview(subject, provider, opts, deps); },
  write: (path, content) => { parentPort!.postMessage({ event: 'write' }); DEFAULT_DEPS.write(path, content); },
 }).then(result => parentPort!.postMessage({ event: 'result', result })).catch(err => parentPort!.postMessage({ event: 'error', message: String(err) }));
});
parentPort!.postMessage({ event: 'ready' });
