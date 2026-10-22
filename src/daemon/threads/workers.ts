/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Starting the daemon's workers (Epic 86197ac6, Story s2): a worker script
 * next to this module, a channel from ThreadServices, and, once the worker
 * says it is ready, its registration as the target for its class and its
 * channel attached to the router.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

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
}

/**
 * Start a worker of `cls` from `script`; resolves once it is ready, registered
 * and attached. Rejects when it exits or fails before it is ready.
 */
export async function startClassWorker(services: ThreadServices, router: Router, cls: MethodClass, script: string, extra?: WorkerExtra): Promise<StartedWorker> {
	const started = await startWorker(services, cls, script, extra);
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
export function startWorker(services: ThreadServices, name: string, script: string, extra?: WorkerExtra): Promise<StartedWorker> {
	const conn = services.connectWorker();
	const worker = new Worker(workerScript(script), {
		workerData: { ...conn.workerData, ...extra?.workerData },
		transferList: [...conn.transferList, ...(extra?.transferList ?? [])],
	});
	const threadId = worker.threadId;
	return new Promise<StartedWorker>((resolve, reject) => {
		const fail = (why: string): void => { conn.disconnect(); reject(new Error(`the ${name} worker did not start: ${why}`)); };
		const onError = (err: Error): void => fail(err.message);
		const onExit = (code: number): void => fail(`it exited with code ${code}`);
		worker.once('error', onError);
		worker.once('exit', onExit);
		worker.once('message', (m: unknown) => {
			if (m !== 'worker-ready') return;
			worker.off('error', onError);
			worker.off('exit', onExit);
			resolve({ worker, threadId, port: conn.port });
		});
	});
}
