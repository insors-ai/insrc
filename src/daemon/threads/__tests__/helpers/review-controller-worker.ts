import { parentPort, workerData } from 'node:worker_threads';
import { startDaemonWorker } from '../../worker-entry.js';
import type { DaemonWorkerInit } from '../../worker-entry.js';
import { serveRequests } from '../../worker-requests.js';
import { directDispatch } from '../../../server.js';
import { createStepCallHandler } from '../../../steps/host.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import { _setRepoSchemaGuardForTests } from '../../../repo-schema-guard.js';

_setRepoSchemaGuardForTests(() => undefined);
startDaemonWorker(workerData as DaemonWorkerInit);
let release: (() => void) | undefined;
parentPort!.on('message', (message: { release?: boolean | undefined }) => { if (message.release) release?.(); });
parentPort!.postMessage('worker-ready');
