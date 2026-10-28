/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A session worker (Epic 86197ac6, Story s3): serves one client session's session-class
 * requests (or, as the unattributed worker, those with no client identity) with the
 * daemon's own handler runtime, each under the maintenance lock's request hold.
 *
 * Started with `shared: true` it is the shared-state worker instead: it hosts the one copy
 * of the chat session pool, the understanding service and the todos retention sweep, serves
 * the chat, todos and understanding families (and the in-daemon-only chat.dropSession), and
 * runs those families' nested calls inline.
 *
 * Its queue and indexer are the indexing port, reached through the main thread's router;
 * a step handler's nested call runs here unless inDaemonTarget names another thread (an
 * admin or indexing method, or a chat, todos or understanding method, which the
 * shared-state worker serves).
 */

import { parentPort, threadId, workerData } from 'node:worker_threads';

import { ConfigStore } from '../../config/store.js';
import { UnderstandingService } from '../../understanding/service.js';
import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import { initChatHandlers } from '../chat-handler.js';
import { scheduleTodosRetention } from '../todos-rpc.js';
import { getDb } from '../../db/client.js';
import { holdsMaintenanceLock } from '../../shared/locks/maintenance-lock.js';
import { buildHandlerRuntime, inDaemonOnlyHandlers } from '../handler-runtime.js';
import { directDispatch } from '../server.js';
import type { RpcHandlers } from '../server.js';
import type { LLMProvider } from '../../shared/types.js';
import type { PreparedWorkflowRun } from '../workflow-rpc.js';
import { createInDaemonClient, installStepDaemonClient } from '../steps/daemon-client.js';
import type { InDaemonClient } from '../steps/daemon-client.js';
import { setRunBoard } from '../workflow-run-registry.js';
import type { MethodClass } from './channel.js';
import { IndexingPortClient } from './indexing-port.js';
import { ROUTE_OP, SHUTDOWN_OP } from './main-services.js';
import type { RouteRequest, WorkerConnection } from './main-services.js';
import { inDaemonTarget } from './method-class.js';
import { StatusBoardClient } from './status-board.js';
import type { StatusSnapshot } from './status-board.js';
import { startDaemonWorker } from './worker-entry.js';
import { serveRequests } from './worker-requests.js';

const log = getLogger('session-worker');
const init = workerData as WorkerConnection['workerData'] & { readonly shared?: true | undefined };
const onSharedWorker = init.shared === true;
const hub = startDaemonWorker(init);
const board = new StatusBoardClient(hub);
// Detached runs started here are mirrored to the board, so any thread answers their polls.
setRunBoard(board);

const db = await getDb();
const configStore = new ConfigStore(db);

/** A nested call to another thread, through the main thread's router, carrying this context's maintenance hold. */
const route = (cls: MethodClass, method: string, params: unknown, opts: { readonly shared?: true | undefined } = {}): Promise<unknown> =>
	hub.request<unknown>(ROUTE_OP, { cls, method, params, ...(opts.shared ? { shared: true } : {}), underHold: holdsMaintenanceLock() } satisfies RouteRequest);

/** The queue's live state is read on the admin worker; no session handler reads it, so it is refused here, not faked. */
const noQueueState = {
	snapshot: (): StatusSnapshot => { throw new Error('the indexing queue\'s state is read on the admin worker, not on a session worker'); },
};
const port = new IndexingPortClient((method, params) => route('indexing', method, params), noQueueState);

let inDaemon: InDaemonClient | undefined;
let understanding: UnderstandingService | undefined;
const runtime = buildHandlerRuntime({
	db, configStore, queue: port, indexer: port, startedAt: Date.now(),
	shutdown: reason => hub.send(SHUTDOWN_OP, reason),
	attachedClients: () => [],
	understandingService: () => understanding,
	nestedCall: (method, params) => inDaemon!.request(method, params),
});
const routed: ReadonlySet<MethodClass> = new Set<MethodClass>(['admin', 'indexing', 'session']);
inDaemon = createInDaemonClient(runtime.rpcHandlers, runtime.streamHandlers, {
	inDaemonOnly: inDaemonOnlyHandlers(),
	route: { targetOf: method => inDaemonTarget(method, { routed, onSharedWorker }), request: route },
});
installStepDaemonClient(inDaemon);

/** Test-only methods (INSRC_TEST_HOOKS=1): CPU-bound work, ordered work, and a nested session-class call. */
function testHandlers(): RpcHandlers {
	return {
		'test.spin': async (params) => {
			const until = Date.now() + Number((params as { ms?: number } | null)?.ms ?? 0);
			while (Date.now() < until) { /* spins this thread's CPU */ }
			return { threadId };
		},
		'test.order': async (params) => {
			const startedAt = Date.now();
			// exitAfterMs: the worker exits while this request is still running (a crashed session worker).
			const exitAfterMs = (params as { exitAfterMs?: number } | null)?.exitAfterMs;
			if (exitAfterMs !== undefined) setTimeout(() => process.exit(1), exitAfterMs);
			await new Promise(r => setTimeout(r, Number((params as { ms?: number } | null)?.ms ?? 0)));
			return { threadId, tag: (params as { tag?: unknown } | null)?.tag, startedAt, endedAt: Date.now() };
		},
		'test.nested': async () => ({ threadId, nested: await inDaemon!.request('session.list', {}) }),
		// A detached stub workflow run owned by this worker, whose model never answers, so it stays running.
		'test.startRun': async (params) => {
			const { repo, runId } = params as { repo: string; runId: string };
			const { startWorkflowRun } = await import('../workflow-run-registry.js');
			const silent = {
				supportsTools: false,
				capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
				complete: () => new Promise<never>(() => {}),
				stream: () => { throw new Error('unused'); },
				embed: async () => [],
				completeStructured: () => new Promise<never>(() => {}),
			} as unknown as LLMProvider;
			return startWorkflowRun({ workflow: 'stub', focus: 'test run', repo }, {
				// As the registry's own tests prepare a stub run: no router or config is reached before the model.
				prepare: () => ({
					intent: { workflow: 'stub', focus: 'test run', repoPath: repo, repoIndexedAt: null, params: {} },
					runId, epicKey: `test-${runId}`, provider: silent, modelLabel: 'test:silent', clientDefault: undefined, review: false,
				}) as unknown as PreparedWorkflowRun,
			});
		},
	};
}

if (onSharedWorker) {
	initChatHandlers();
	// The daemon's socket listens before this worker starts; the service is a client of it.
	try { understanding = await UnderstandingService.open(PATHS.sockFile); }
	catch { log.warn('understanding service unavailable: initialization checks failed'); }
	scheduleTodosRetention(db);
}

const rpc: RpcHandlers = {
	...runtime.rpcHandlers,
	// Sent here only by other threads' nested calls: the socket never routes to it by name.
	...(onSharedWorker ? inDaemonOnlyHandlers() : {}),
	...(process.env['INSRC_TEST_HOOKS'] === '1' ? testHandlers() : {}),
};
serveRequests(init.hubPort, directDispatch(rpc, runtime.streamHandlers));
parentPort!.postMessage('worker-ready');
