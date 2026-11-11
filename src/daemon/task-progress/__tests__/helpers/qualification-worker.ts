import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { serveRequests } from '../../../threads/worker-requests.js';
import { controlledExecutors } from './qualification-executors.js';

let release!: () => void;
const running = new Promise<void>(resolve => { release = resolve; });
const executor = controlledExecutors(() => running);
const { port } = workerData as { port: MessagePort };
serveRequests(port, executor.dispatch({}));
parentPort?.on('message', message => {
  if (message === 'release') release();
  if (message === 'calls') parentPort?.postMessage(executor.calls);
});
parentPort?.postMessage('ready');
