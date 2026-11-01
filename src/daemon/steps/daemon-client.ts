import { reviewUnavailable } from '../../workflow/review-unavailable.js';
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
import type { MethodClass } from '../threads/channel.js';
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

/**
 * With daemon threads (Epic 86197ac6 s2): a call to a method of a routed class
 * (admin, indexing) is sent to that class's worker instead of the local table.
 */
export interface InDaemonRoute {
	readonly classOf: (method: string) => MethodClass | undefined;
	readonly routed: ReadonlySet<MethodClass>;
	readonly request: (cls: MethodClass, method: string, params: unknown) => Promise<unknown>;
}

/** Test seam: the timer the wait limit uses; and the route to the daemon's workers. */
export interface InDaemonClientDeps {
	readonly setTimer?:   ((fn: () => void, ms: number) => unknown) | undefined;
	readonly clearTimer?: ((handle: unknown) => void) | undefined;
	readonly route?:      InDaemonRoute | undefined;
}

/** The in-daemon client, plus a unary request to any served method (for nested calls). */
export interface InDaemonClient extends StepDaemonClient {
	readonly request: <T>(method: string, params: unknown) => Promise<T>;
}

/** The client that calls the daemon's own request handlers in-process. */
export function createInDaemonClient(
	unary:  RpcHandlers,
	stream: StreamHandlers,
	deps:   InDaemonClientDeps = {},
): InDaemonClient {
	const call = async <T>(method: string, params: unknown): Promise<T> => {
		const cls = deps.route?.classOf(method);
		if (deps.route !== undefined && cls !== undefined && deps.route.routed.has(cls)) {
			// Served on the class's worker, whose reply already carries the reduced error message.
			try {
				return await deps.route.request(cls, method, params) as T;
			} catch (err) {
				throw new Error(err instanceof Error ? err.message : String(err));
			}
		}
		const handler = unary[method];
		if (handler === undefined) throw new Error(`unknown method: ${method}`);
		try {
			return await handler(params) as T;
		} catch (err) {
			throw new Error(failureMessage(err, method));
		}
	};

	return {
		request: <T>(method: string, params: unknown) => call<T>(method, params),
		reviewArtifactStream: async () => reviewUnavailable(),
		codeReviewStream: async () => reviewUnavailable(),
		fetchCodeReviewGrounding: async () => reviewUnavailable(),
		fetchCodeReviewFreshness: async () => reviewUnavailable(),
		resolveRepoForCwd: (cwd) =>
			call<{ path?: string | null; error?: string }>('repo.resolveForCwd', { cwd }).then(r => {
				if (r.error !== undefined) throw new Error(r.error);
				return r.path ?? null;
			}),
	};
}
