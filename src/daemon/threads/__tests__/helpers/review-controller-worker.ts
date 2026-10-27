import { parentPort, workerData } from 'node:worker_threads';
import { startDaemonWorker } from '../../worker-entry.js';
import type { DaemonWorkerInit } from '../../worker-entry.js';
import { serveRequests } from '../../worker-requests.js';
import { directDispatch } from '../../../server.js';
import { createStepCallHandler } from '../../../steps/host.js';
import { handleReviewStep } from '../../../steps/review-step/handler.js';
import { createRepoLifecycle } from '../../../../workflow/artifact-core/repo-lifecycle.js';
import { _setRepoSchemaGuardForTests } from '../../../repo-schema-guard.js';

_setRepoSchemaGuardForTests(() => undefined);
startDaemonWorker(workerData as DaemonWorkerInit);
let release: (() => void) | undefined;
parentPort!.on('message', (message: { release?: boolean | undefined }) => { if (message.release) release?.(); });
const host = createStepCallHandler({ insrc_review_step: async (args, signal) => {
	const p = args as { holdInspect?: boolean | undefined };
	return handleReviewStep(args, { signal, readEntitiesForRepo: async () => [], lifecycleFor: repo => {
		const service = createRepoLifecycle(repo).service;
		return new Proxy(service, { get(target, key) {
			if (key === 'inspect') return async (...params: Parameters<typeof service.inspect>) => {
				if (p.holdInspect) { p.holdInspect = false; await new Promise<void>(resolve => { release = resolve; parentPort!.postMessage({ event: 'inspect-held' }); signal.addEventListener('abort', () => resolve(), { once: true }); }); }
				return target.inspect(...params);
			};
			const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
		} });
	} });
} });
serveRequests((workerData as DaemonWorkerInit).hubPort, directDispatch({}, { 'step.call': host }));
parentPort!.postMessage('worker-ready');
