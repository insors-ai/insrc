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

import type { CodeReviewArtifact } from '../workflow/code-review/types.js';

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
