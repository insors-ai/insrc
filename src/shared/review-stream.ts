import { reviewUnavailable } from '../workflow/review-unavailable.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The failure type and parameter shapes of the daemon's two review requests,
 * `workflow.review` (a design artifact) and `codeReview.run` (a Story's code).
 * Shared by the socket client in src/mcp/daemon-stream.ts and by the daemon's
 * in-process client, so both report a failed review the same way (Epic
 * c2ba6fa6, Story s11).
 */

import type { CodeReviewArtifact, CodeReviewFallbackReason, CodeReviewGrounding } from '../workflow/code-review/types.js';

/** Why a review request did not produce a review. */
export type ReviewStreamFailure =
	| 'unreachable'      // the daemon is not running
	| 'unknown-method'   // the daemon is older than this request
	| 'daemon-error'     // the daemon answered with an error (frame or plain line)
	| 'closed'           // the connection ended before a final frame
	| 'timeout'          // the wait limit passed
	| 'protocol'         // a line that is not valid for a stream request
	| 'aborted';

export class ReviewStreamError extends Error {
	get timeoutKind(): 'external-review-transport' | 'external-review-idle' | 'review-freshness' | undefined {
		if (this.reason === CEILING_TIMEOUT) return 'external-review-transport';
		if (this.reason === IDLE_TIMEOUT) return 'external-review-idle';
		if (this.reason === 'freshness-timeout') return 'review-freshness';
		return undefined;
	}
	constructor(
		readonly failure: ReviewStreamFailure,
		message: string,
		/** The `reason` the daemon attached to its error frame, when it gave one. */
		readonly reason?: string | undefined,
	) {
		super(message);
		this.name = 'ReviewStreamError';
	}
}

export interface ReviewStreamOpts {
	/** How long to wait for the final frame, frames or not. */
	readonly timeoutMs: number;
	/** How long to wait without any frame; every progress or delta frame restarts
	 *  it. Absent, not above 0 or not below timeoutMs: no idle limit. */
	readonly idleMs?:   number | undefined;
	readonly onFrame?:  ((stream: 'progress' | 'delta', data: unknown) => void) | undefined;
	readonly signal?:   AbortSignal | undefined;
}

export interface ReviewArtifactStreamParams {
	/** The artifact's `.md` path. */
	readonly artifactPath: string;
	readonly repo?:        string | undefined;
}

export interface CodeReviewStreamParams {
	readonly repo?:    string | undefined;
	readonly epicHash: string;
	readonly storyId:  string;
	readonly client?:  'claude' | 'codex' | undefined;
	/** How the daemon should ground the review. Omitted means `full`. */
	readonly groundingMode?: 'full' | 'degraded' | undefined;
	/** Why a degraded review fell back to the diff (ISSUE-1102dc71). */
	readonly fallbackReason?: CodeReviewFallbackReason | undefined;
}

export interface CodeReviewStreamResult {
	readonly runId:    string;
	readonly artifact: CodeReviewArtifact;
}

// ---------------------------------------------------------------------------
// The code-review grounding and freshness replies, shaped the same way by the
// socket client and by the daemon's in-process client: a decline, an error or
// an unreachable daemon is `{ ok: false, reason }`, never a throw.
// ---------------------------------------------------------------------------

export type CodeReviewGroundingResult = { ok: true; grounding: CodeReviewGrounding } | { ok: false; reason: string };
export type CodeReviewFreshnessResult =
	| { ok: true; isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: readonly string[] }
	| { ok: false; reason: string };

/** The `codeReview.grounding` reply as a result. */
export function groundingFromReply(res: { ok?: boolean; grounding?: CodeReviewGrounding; reason?: string; error?: string }): CodeReviewGroundingResult { return reviewUnavailable(); }

/** The `codeReview.freshness` reply as a result. A reply from an older daemon
 *  (no inFlight / pendingCodeIndexJobs) reads as inFlight = isProcessing and 0. */
export function freshnessFromReply(res: { isProcessing?: boolean | undefined; inFlight?: boolean | undefined; pendingCodeIndexJobs?: number | undefined; staleFiles?: readonly string[] | undefined; error?: string | undefined }): CodeReviewFreshnessResult { return reviewUnavailable(); }

/** A rejected grounding or freshness request as a result. */
export function unavailableFromError(err: unknown): { ok: false; reason: string } { return reviewUnavailable(); }

// ---------------------------------------------------------------------------
// The review request itself, shared by the socket client (src/mcp/daemon-stream.ts)
// and the daemon's in-process client (src/daemon/steps/daemon-client.ts), so the
// two cannot drift apart. Each supplies only its transport: how the request is
// sent and how its frames come back. Everything else is here: the parameters
// of the two requests, the wait limit, an aborted signal, settling once, and
// what each frame means.
// ---------------------------------------------------------------------------

/** The parameters `workflow.review` is sent. */
export function reviewArtifactRequestParams(params: ReviewArtifactStreamParams): Record<string, unknown> { return reviewUnavailable(); }

/** The parameters `codeReview.run` is sent. */
export function codeReviewRequestParams(params: CodeReviewStreamParams): Record<string, unknown> { return reviewUnavailable(); }

/** A wait limit in words, never more than the limit: whole minutes when it is
 *  a whole number of minutes, otherwise seconds. */
export function waitText(ms: number): string {
	if (ms >= 60_000 && ms % 60_000 === 0) {
		const min = ms / 60_000;
		return `${min} minute${min === 1 ? '' : 's'}`;
	}
	const sec = Math.max(1, Math.floor(ms / 1000));
	return `${sec} second${sec === 1 ? '' : 's'}`;
}

/** A stream frame as the daemon sends it. */
export interface ReviewStreamFrame {
	readonly stream: string;
	readonly data?:  unknown;
}

/** Where a transport reports what happened to the request. Calls after the
 *  request has settled are ignored. */
export interface ReviewStreamSink {
	/** A stream frame from the daemon. */
	frame(frame: ReviewStreamFrame): void;
	/** The transport ended the request without a final frame. */
	fail(failure: ReviewStreamFailure, message: string, reason?: string): void;
}

/** A started request: `end` after a final frame, `cancel` when it failed (the
 *  wait limit, an abort, a failure), which also ends the work on the far side. */
export interface ReviewStreamHandle {
	end(): void;
	cancel(): void;
}

/** How a client sends one stream request and hears its frames. */
export type ReviewStreamTransport = (sink: ReviewStreamSink) => ReviewStreamHandle;

/** The `reason` of a 'timeout' failure: which limit ran out. */
export const CEILING_TIMEOUT = 'ceiling';
export const IDLE_TIMEOUT = 'idle';

/** Test seam: the timer the wait limit uses. */
export interface ReviewStreamTimers {
	readonly setTimer?:   ((fn: () => void, ms: number) => unknown) | undefined;
	readonly clearTimer?: ((handle: unknown) => void) | undefined;
}

/**
 * Run one review stream request over `transport`, resolved by its 'done'
 * frame's data. The wait limit, or `idleMs` without a frame, fails it with
 * 'timeout' (the message says which) and an aborted signal
 * with 'aborted' (both also cancel the transport); an 'error' frame is
 * 'daemon-error' with the frame's reason; 'progress' and 'delta' frames go to
 * `opts.onFrame`; any other frame is ignored.
 */
export function runReviewStream<T>(
	method:    string,
	opts:      ReviewStreamOpts,
	transport: ReviewStreamTransport,
	timers:    ReviewStreamTimers = {},
): Promise<T> { return reviewUnavailable(); }
