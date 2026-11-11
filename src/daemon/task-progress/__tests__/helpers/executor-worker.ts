import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { beginExecutorProgress } from '../../executor-relay.js';

beginExecutorProgress((workerData as { port: MessagePort }).port);
parentPort?.on('message', () => {});
