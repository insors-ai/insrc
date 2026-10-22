/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Starting the daemon's workers (Epic 86197ac6, Story s2): a worker script
 * next to this module, a channel from ThreadServices, and, once the worker
 * says it is ready, its registration as the target for its class and its
 * channel attached to the router.
 *
 * From its creation, every worker's exit is followed by the reclaim of the
 * named locks it held (watchWorker) and then of its store-guard permits.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { getStoreGuard } from '../../db/store-guard.js';
import type { StoreId } from '../../db/store-guard.js';
import { watchWorker } from '../../shared/locks/lock-manager.js';
import type { LockInfo } from '../../shared/locks/lock-manager.js';
import type { MethodClass } from './channel.js';
import type { ThreadServices } from './main-services.js';
import type { Router } from './router.js';

/** The worker script `name` beside this module: the compiled .js, or the .ts when run from source. */
export function workerScript(name: string): URL {
	const js = new URL(`./${name}.js`, import.meta.url);
	return existsSync(fileURLToPath(js)) ? js : new URL(`./${name}.ts`, import.meta.url);
}

export interface StartedWorker {
	readonly worker: Worker;
	readonly threadId: number;
	/** The main thread's end of the worker's channel (requests, hub, pushes). */
	readonly port: MessagePort;
	/** Settles after the worker exited and its locks and store-guard permits were reclaimed. */
	readonly reclaimed: Promise<Reclaimed>;
	/** Stop serving the worker's hub and close its channel (after it exited). */
	disconnect(): void;
}

/** What was reclaimed from a worker that exited. */
export interface Reclaimed {
	readonly locks: readonly LockInfo[];
	readonly stores: { readonly released: readonly StoreId[]; readonly unhealthy: readonly StoreId[] };
}

/** Observes each worker as it is created, before it is ready (the supervisor's shutdown terminates it). */
export type OnWorkerCreated = (worker: Worker) => void;

/**
 * Start a worker of `cls` from `script`; resolves once it is ready, registered
 * and attached. Rejects when it exits or fails before it is ready.
 */
export async function startClassWorker(services: ThreadServices, router: Router, cls: MethodClass, script: string, extra?: WorkerExtra, onCreated?: OnWorkerCreated): Promise<StartedWorker> {
	const started = await startWorker(services, cls, script, extra, onCreated);
	services.registry.register({ threadId: started.threadId, cls });
	router.attach(started.threadId, started.port);
	return started;
}

/** Extra workerData for a worker (and the ports in it, which are transferred). */
export interface WorkerExtra {
	readonly workerData: Record<string, unknown>;
	readonly transferList: MessagePort[];
}

/** Start a worker from `script` and resolve once it is ready; `name` is for errors. Not registered as a request target. */
export function startWorker(services: ThreadServices, name: string, script: string, extra?: WorkerExtra, onCreated?: OnWorkerCreated): Promise<StartedWorker> {
	const conn = services.connectWorker();
	const worker = new Worker(workerScript(script), {
		workerData: { ...conn.workerData, ...extra?.workerData },
		transferList: [...conn.transferList, ...(extra?.transferList ?? [])],
	});
	const threadId = worker.threadId;
	const reclaimed = watchWorker(worker).then(async locks => ({ locks, stores: await getStoreGuard().reclaim(threadId) }));
	onCreated?.(worker);
	return new Promise<StartedWorker>((resolve, reject) => {
		// It rejects once the worker exited and was reclaimed, so a retry starts after the reclaim.
		let error: string | undefined;
		const onError = (err: Error): void => { error = err.message; };
		const onExit = (code: number): void => {
			void reclaimed.then(() => {
				conn.disconnect();
				reject(new Error(`the ${name} worker did not start: ${error ?? `it exited with code ${code}`}`));
			});
		};
		worker.on('error', onError);
		worker.once('exit', onExit);
		worker.once('message', (m: unknown) => {
			if (m !== 'worker-ready') return;
			worker.off('error', onError);
			worker.off('exit', onExit);
			resolve({ worker, threadId, port: conn.port, reclaimed, disconnect: conn.disconnect });
		});
	});
}
