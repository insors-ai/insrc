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

import type { CodeReviewArtifact, CodeReviewGrounding } from '../workflow/code-review/types.js';

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
	/** How long to wait for the final frame. */
	readonly timeoutMs: number;
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
export type CodeReviewFreshnessResult = { ok: true; isProcessing: boolean; staleFiles: readonly string[] } | { ok: false; reason: string };

/** The `codeReview.grounding` reply as a result. */
export function groundingFromReply(res: { ok?: boolean; grounding?: CodeReviewGrounding; reason?: string; error?: string }): CodeReviewGroundingResult {
	if (res.ok === true && res.grounding !== undefined) return { ok: true, grounding: res.grounding };
	return { ok: false, reason: res.reason ?? res.error ?? 'code-review grounding unavailable' };
}

/** The `codeReview.freshness` reply as a result. */
export function freshnessFromReply(res: { isProcessing?: boolean; staleFiles?: readonly string[]; error?: string }): CodeReviewFreshnessResult {
	if (res.error === undefined && typeof res.isProcessing === 'boolean') {
		return { ok: true, isProcessing: res.isProcessing, staleFiles: res.staleFiles ?? [] };
	}
	return { ok: false, reason: res.error ?? 'code-review freshness unavailable' };
}

/** A rejected grounding or freshness request as a result. */
export function unavailableFromError(err: unknown): { ok: false; reason: string } {
	return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

// ---------------------------------------------------------------------------
// The review request itself, shared by the socket client (src/mcp/daemon-stream.ts)
// and the daemon's in-process client (src/daemon/steps/daemon-client.ts), so the
// two cannot drift apart. Each supplies only its transport: how the request is
// sent and how its frames come back. Everything else is here: the parameters
// of the two requests, the wait limit, an aborted signal, settling once, and
// what each frame means.
// ---------------------------------------------------------------------------

/** The parameters `workflow.review` is sent. */
export function reviewArtifactRequestParams(params: ReviewArtifactStreamParams): Record<string, unknown> {
	return {
		artifactPath: params.artifactPath,
		...(params.repo !== undefined ? { repo: params.repo } : {}),
	};
}

/** The parameters `codeReview.run` is sent. */
export function codeReviewRequestParams(params: CodeReviewStreamParams): Record<string, unknown> {
	return {
		epicHash: params.epicHash,
		storyId:  params.storyId,
		...(params.repo          !== undefined ? { repo:          params.repo }          : {}),
		...(params.client        !== undefined ? { client:        params.client }        : {}),
		...(params.groundingMode !== undefined ? { groundingMode: params.groundingMode } : {}),
	};
}

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

/** Test seam: the timer the wait limit uses. */
export interface ReviewStreamTimers {
	readonly setTimer?:   ((fn: () => void, ms: number) => unknown) | undefined;
	readonly clearTimer?: ((handle: unknown) => void) | undefined;
}

/**
 * Run one review stream request over `transport`, resolved by its 'done'
 * frame's data. The wait limit fails it with 'timeout' and an aborted signal
 * with 'aborted' (both also cancel the transport); an 'error' frame is
 * 'daemon-error' with the frame's reason; 'progress' and 'delta' frames go to
 * `opts.onFrame`; any other frame is ignored.
 */
export function runReviewStream<T>(
	method:    string,
	opts:      ReviewStreamOpts,
	transport: ReviewStreamTransport,
	timers:    ReviewStreamTimers = {},
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const setTimer   = timers.setTimer   ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
		const clearTimer = timers.clearTimer ?? ((h: unknown) => clearTimeout(h as NodeJS.Timeout));
		let settled = false;
		let timer: unknown;
		let handle: ReviewStreamHandle | undefined;
		let pending: 'end' | 'cancel' | undefined;   // settled while the transport was still starting

		const release = (how: 'end' | 'cancel'): void => {
			if (handle === undefined) { pending = how; return; }
			if (how === 'end') handle.end(); else handle.cancel();
		};
		const finish = (how: 'end' | 'cancel', action: () => void): void => {
			if (settled) return;
			settled = true;
			if (timer !== undefined) clearTimer(timer);
			opts.signal?.removeEventListener('abort', onAbort);
			release(how);
			action();
		};
		const failWith = (failure: ReviewStreamFailure, message: string, reason?: string): void =>
			finish('cancel', () => reject(new ReviewStreamError(failure, message, reason)));

		function onAbort(): void { failWith('aborted', `${method}: aborted by client`); }
		if (opts.signal?.aborted) { onAbort(); return; }
		opts.signal?.addEventListener('abort', onAbort);
		timer = setTimer(
			() => failWith('timeout', `${method}: no result from the daemon within ${waitText(opts.timeoutMs)}`),
			opts.timeoutMs,
		);

		const sink: ReviewStreamSink = {
			frame: (f) => {
				if (settled) return;
				if (f.stream === 'progress' || f.stream === 'delta') {
					opts.onFrame?.(f.stream, f.data);
				} else if (f.stream === 'done') {
					finish('end', () => resolve(f.data as T));
				} else if (f.stream === 'error') {
					const data = f.data as { error?: string; reason?: string } | undefined;
					finish('end', () => reject(new ReviewStreamError('daemon-error', data?.error ?? `${method}: daemon error`, data?.reason)));
				}
				// Any other kind: ignored (forward-compatible).
			},
			fail: (failure, message, reason) => { if (!settled) failWith(failure, message, reason); },
		};
		// A transport that throws while opening (a connection refused before any
		// event) settles here like any other failure, so the wait timer and the
		// abort listener are released rather than left armed.
		try {
			handle = transport(sink);
		} catch (err) {
			failWith('unreachable', `${method}: cannot reach the daemon (${err instanceof Error ? err.message : String(err)})`);
			return;
		}
		if (pending !== undefined) release(pending);
	});
}
