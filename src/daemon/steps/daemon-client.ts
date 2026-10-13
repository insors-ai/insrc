/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon requests the moved step handlers make (Epic c2ba6fa6, Story s11).
 *
 * In the daemon the handlers must not connect back to the daemon's own socket.
 * createInDaemonClient builds the same five functions the socket client in
 * src/mcp/daemon-stream.ts offers from the request handler maps the daemon
 * passes to its IpcServer, so a call reaches exactly the function the socket
 * would, in-process. src/daemon/index.ts installs it at start-up.
 *
 * The failure behaviour of the socket client's review requests is kept: the
 * wait limit fails with 'timeout', an aborted signal with 'aborted', an
 * 'error' frame (or a handler that throws) with 'daemon-error' and the frame's
 * reason. 'unreachable' cannot occur in-process. A timeout or an abort also
 * aborts the review handler's own signal, so the inner run ends, as it does
 * when the socket client drops its connection.
 */

import type { WorkflowReviewDone } from '../workflow-review-rpc.js';
import type { RpcHandlers, StreamHandlers } from '../server.js';
import { failureMessage } from '../server.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import {
	codeReviewRequestParams,
	freshnessFromReply,
	groundingFromReply,
	reviewArtifactRequestParams,
	runReviewStream,
	unavailableFromError,
} from '../../shared/review-stream.js';
import type {
	CodeReviewFreshnessResult,
	CodeReviewGroundingResult,
	CodeReviewStreamParams,
	CodeReviewStreamResult,
	ReviewArtifactStreamParams,
	ReviewStreamOpts,
} from '../../shared/review-stream.js';

/** The wait limit's wording, from the shared review request (re-exported for tests). */
export { waitText } from '../../shared/review-stream.js';

/** The daemon requests a step handler makes, in the socket client's shapes. */
export interface StepDaemonClient {
	readonly reviewArtifactStream:     (params: ReviewArtifactStreamParams, opts: ReviewStreamOpts) => Promise<WorkflowReviewDone>;
	readonly codeReviewStream:         (params: CodeReviewStreamParams, opts: ReviewStreamOpts) => Promise<CodeReviewStreamResult>;
	readonly fetchCodeReviewGrounding: (params: { repo: string; epicHash: string; storyId: string }) => Promise<CodeReviewGroundingResult>;
	readonly fetchCodeReviewFreshness: (params: { repo: string; epicHash: string; storyId: string; changedFiles: readonly string[] }) => Promise<CodeReviewFreshnessResult>;
	readonly resolveRepoForCwd:        (cwd: string) => Promise<string | null>;
}

let _installed: StepDaemonClient | undefined;

/** Install the client the step handlers use in this process. */
export function installStepDaemonClient(client: StepDaemonClient | undefined): void {
	_installed = client;
}

/** The installed client. Throws when none is installed: a handler run in a
 *  process that has not said how it reaches the daemon is a wiring fault. */
export function stepDaemonClient(): StepDaemonClient {
	if (_installed === undefined) {
		throw new Error('no daemon client is installed for the step handlers in this process');
	}
	return _installed;
}

/** Test seam: the timer the wait limit uses. */
export interface InDaemonClientDeps {
	readonly setTimer?:   ((fn: () => void, ms: number) => unknown) | undefined;
	readonly clearTimer?: ((handle: unknown) => void) | undefined;
}

/** The client that calls the daemon's own request handlers in-process. */
export function createInDaemonClient(
	unary:  RpcHandlers,
	stream: StreamHandlers,
	deps:   InDaemonClientDeps = {},
): StepDaemonClient {
	const call = async <T>(method: string, params: unknown): Promise<T> => {
		const handler = unary[method];
		if (handler === undefined) throw new Error(`unknown method: ${method}`);
		try {
			return await handler(params) as T;
		} catch (err) {
			throw new Error(failureMessage(err, method));
		}
	};

	/** The in-process transport: the daemon's own stream handler, called with a
	 *  send that hands its frames to the shared request, and a signal that a
	 *  failed request (wait limit, abort) aborts so the inner run ends. */
	const streamRequest = <T>(method: string, params: Record<string, unknown>, opts: ReviewStreamOpts): Promise<T> =>
		runReviewStream<T>(method, opts, (sink) => {
			const inner = new AbortController();
			const handler = stream[method];
			if (handler === undefined) {
				sink.fail('unknown-method', `${method}: this daemon does not support the request (unknown method: ${method}).`);
				return { end: () => {}, cancel: () => inner.abort() };
			}
			const send = (msg: IpcStreamMessage): void => { sink.frame({ stream: msg.stream, data: msg.data }); };
			// Called through a resolved promise so a handler that throws synchronously
			// settles the request too, and its timer and abort listener are released.
			Promise.resolve().then(() => handler(params, send, inner.signal)).then(
				// Over the socket a handler that ends without a final frame leaves the
				// client waiting; in-process there is nothing left to wait for.
				() => sink.fail('closed', `${method}: the request ended before completion`),
				// The request server sends a handler's throw as an 'error' frame.
				(err: unknown) => sink.fail('daemon-error', failureMessage(err, method)),
			);
			return { end: () => {}, cancel: () => inner.abort() };
		}, deps);

	return {
		reviewArtifactStream: (params, opts) => streamRequest<WorkflowReviewDone>('workflow.review', reviewArtifactRequestParams(params), opts),
		codeReviewStream:     (params, opts) => streamRequest<CodeReviewStreamResult>('codeReview.run', codeReviewRequestParams(params), opts),
		fetchCodeReviewGrounding: (params) =>
			call<Parameters<typeof groundingFromReply>[0]>('codeReview.grounding', params).then(groundingFromReply, unavailableFromError),
		fetchCodeReviewFreshness: (params) =>
			call<Parameters<typeof freshnessFromReply>[0]>('codeReview.freshness', params).then(freshnessFromReply, unavailableFromError),
		resolveRepoForCwd: (cwd) =>
			call<{ path?: string | null; error?: string }>('repo.resolveForCwd', { cwd }).then(r => {
				if (r.error !== undefined) throw new Error(r.error);
				return r.path ?? null;
			}),
	};
}
