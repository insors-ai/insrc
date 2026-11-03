/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session routing (Epic 86197ac6, Story s3): the session pool, wired to the router, the
 * target registry and the status board. A pool worker's exit fails what it was serving and
 * its session's queued requests, and ends the detached runs it owned with a named error;
 * a workflow.run.abort reaches the run's owner; a worker's nested call to another thread
 * goes through the router.
 */

import type { ThreadServices } from './main-services.js';
import type { Router } from './router.js';
import { SessionPool } from './session-pool.js';
import type { Supervisor } from './supervisor.js';
import { startWorker } from './workers.js';

/** The error a detached run's poll reports once its owner exited. */
export const OWNER_EXITED = 'the session worker running this workflow exited';

/** Make the session pool and route session work through it. */
export function startSessionRouting(services: ThreadServices, router: Router, idleTimeoutMs: number, supervisor?: Pick<Supervisor, 'track' | 'allowRestart'>): SessionPool {
	const board = services.board;
	const pool = new SessionPool({
		options: { idleTimeoutMs },
		registry: services.registry,
		start: (name, opts, onCreated) => startWorker(services, name, 'session-worker', opts?.shared ? { workerData: { shared: true }, transferList: [] } : undefined, onCreated),
		// Every pool worker is supervised for errors and shutdown; the shared-state worker's restarts count against the limit (s4).
		...(supervisor !== undefined ? {
			onCreated: (worker: Parameters<Supervisor['track']>[0], name: string) => supervisor.track(worker, name),
			restarted: (name: string) => supervisor.allowRestart(name),
		} : {}),
		attach: (threadId, port) => router.attach(threadId, port),
		// A released worker should have nothing in flight; anything that was is answered, never left hanging.
		detach: threadId => { board.forgetAnalyzeRunsOf(threadId); router.failWorker(threadId, 'it was released'); },
		activeRuns: threadId => board.snapshot().runs.filter(r => r.ownerThreadId === threadId && r.status === 'running').length,
		exited: (info, code) => {
			board.failRunsOwnedBy(info.threadId, OWNER_EXITED);
			board.forgetAnalyzeRunsOf(info.threadId);
			router.failWorker(info.threadId, `it exited with code ${code}`, info.session);
		},
	});
	router.useSessions(pool, runId => board.snapshot().runs.find(r => r.runId === runId)?.ownerThreadId, runId => board.analyzeRunOwner(runId));
	services.onRoute(r => router.request(r.cls, r.method, r.params, { underHold: r.underHold, shared: r.shared }));
	return pool;
}
