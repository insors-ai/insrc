/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A worker's request entry (Epic 86197ac6, Story s2): serves the request
 * envelopes the router sends on the worker's channel with the worker's own
 * forward (directDispatch over its handler tables), and sends each reply and
 * stream frame back. A cancel envelope aborts a stream, as a socket close does.
 *
 * A reply that cannot be copied to the main thread (a DataCloneError) is
 * answered with a named error instead, so the socket is always answered.
 */

import { threadId } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { getLogger } from '../../shared/logger.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import { RequestLifetime } from '../request-context.js';
import type { DeliverEnvelope, ForwardRequest } from '../server.js';
import type { CancelEnvelope, CompletionEnvelope, FrameEnvelope, ReplyEnvelope, RequestEnvelope } from './channel.js';
import { holdingForward } from './maintenance-entry.js';

const log = getLogger('worker-requests');

/** Test-only method (with INSRC_TEST_HOOKS=1) answering the thread that served it. */
export const SERVING_THREAD_METHOD = 'test.servingThread';
/** Test-only method (with INSRC_TEST_HOOKS=1): the worker exits with code 1 and never answers, as a crash mid-request. */
export const TEST_EXIT_METHOD = 'test.exit';

export interface ServeRequestsOptions {
	/** Run before a test.exit ends the worker (the code-indexing worker closes its watcher first). */
	readonly beforeTestExit?: (() => Promise<void>) | undefined;
}

type Port = Pick<MessagePort, 'postMessage' | 'on' | 'off'>;

const isRequest = (m: unknown): m is RequestEnvelope => (m as { kind?: unknown } | null)?.kind === 'request';
const isCancel = (m: unknown): m is CancelEnvelope => (m as { kind?: unknown } | null)?.kind === 'cancel';

/** Serve request envelopes arriving on `port` with `forward`; returns a function that stops serving. */
export function serveRequests(port: Port, unheld: ForwardRequest, opts: ServeRequestsOptions = {}): () => void {
	// Each request under the maintenance lock's request hold.
	const forward = holdingForward(unheld);
	const inflight = new Map<string, () => void>();
	const testHooks = process.env['INSRC_TEST_HOOKS'] === '1';

	const onMessage = (msg: unknown): void => {
		if (isCancel(msg)) {
			const cancel = inflight.get(msg.requestId);
			inflight.delete(msg.requestId);
			cancel?.();
			return;
		}
		if (!isRequest(msg)) return;
		const { requestId, method } = msg;
		if (testHooks && method === SERVING_THREAD_METHOD) {
			port.postMessage({ kind: 'reply', requestId, result: { threadId } } satisfies ReplyEnvelope);
			// Answered here, so done here: a session-queued request waits for this ack (ISSUE-7c39e5cd).
			if (msg.trackCompletion === true) port.postMessage({ kind: 'complete', requestId } satisfies CompletionEnvelope);
			return;
		}
		if (testHooks && method === TEST_EXIT_METHOD) {
			void (opts.beforeTestExit?.() ?? Promise.resolve()).finally(() => process.exit(1));
			return;
		}
		const lifetime = msg.trackCompletion === true ? new RequestLifetime() : undefined;
		if (lifetime) void Promise.all([lifetime.completed, lifetime.drained]).then(() => {
			inflight.delete(requestId);
			port.postMessage({ kind: 'complete', requestId } satisfies CompletionEnvelope);
		}).catch(() => { /* A closed channel owns no delivery target. */ });
		let ended = false;
		// A frame that could not be sent ended the stream with an error in its place: later frames
		// are dropped, and the handler is cancelled (at once, or when forward returns its cancel).
		let failed = false;
		let cancel: (() => void) | undefined;
		const deliver: DeliverEnvelope = (envelope) => {
			if (failed) return;
			if (envelope.kind === 'reply') { ended = true; if (!lifetime) inflight.delete(requestId); }
			else {
				const stream = (envelope.frame as IpcStreamMessage).stream;
				if (stream === 'done' || stream === 'error') { ended = true; if (!lifetime) inflight.delete(requestId); }
			}
			if (post(port, envelope, method) || envelope.kind === 'reply' || ended) return;
			failed = true;
			ended = true;
			if (!lifetime) inflight.delete(requestId);
			cancel?.();
		};
		cancel = forward(lifetime ? { ...msg, lifetime } : msg, deliver);
		if (failed) cancel();
		else if (lifetime || !ended) inflight.set(requestId, cancel);
	};
	port.on('message', onMessage);
	return () => port.off('message', onMessage);
}

/** Send a reply or frame; one that cannot be cloned is replaced by a named error (and false is returned). */
function post(port: Port, envelope: ReplyEnvelope | FrameEnvelope, method: string): boolean {
	try {
		port.postMessage(envelope);
		return true;
	} catch (err) {
		const why = err instanceof Error ? err.message : String(err);
		const error = `the result of ${method} could not be returned: ${why}`;
		log.warn({ method, err: why }, 'worker: a reply could not be sent to the main thread');
		port.postMessage(envelope.kind === 'reply'
			? { kind: 'reply', requestId: envelope.requestId, error } satisfies ReplyEnvelope
			: { kind: 'frame', requestId: envelope.requestId, frame: { id: 0, stream: 'error', data: { error, recoverable: true } } } satisfies FrameEnvelope);
		return false;
	}
}
