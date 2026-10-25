/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The silence limit and total cap of every daemon review and build-validation
 * call type, in one place (ISSUE-562b1bb5, LLD-697b9f8ff46b9deb-S001).
 *
 * A silence limit kills a codex run that prints nothing new on stdout for that
 * long (CliStallError; the review pipeline re-issues it). Each one sits above
 * the longest stdout silence of a HEALTHY call of its type in the 2026-10-16..24
 * survey of every daemon codex call, measured on the events codex prints on
 * stdout (tool calls, tool outputs, messages; it prints no reasoning items):
 *
 *   design-verify   754 healthy calls, longest silence  62 s ->  90 s (38/792 stalled)
 *   design-extract   19 healthy calls, longest silence 343 s ->  none
 *                   (median call 130 s: a limit above its silence would sit near its run time)
 *   design-session  132 healthy calls, longest silence 172 s -> 300 s
 *   code-review     670 gather calls 185 s, 105 judge calls 66 s -> 300 s
 *   build-validate  176 healthy calls, longest silence  29 s ->  90 s
 *
 * Evidence: docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/call-type-survey.md
 *
 * A silence limit is armed only below its call's total limit
 * (src/shared/process-group.ts), so each one stays under it.
 */

export type ReviewCallKind = 'design-verify' | 'design-extract' | 'design-session' | 'code-review' | 'build-validate';

export interface ReviewCallLimits {
	/** No new stdout for this long: the run is killed as stalled. Absent: no silence limit. */
	readonly silenceMs?: number | undefined;
	/** The call's total cap. Absent: the call keeps its own deadline. */
	readonly timeoutMs?: number | undefined;
}

export const REVIEW_CALL_LIMITS: Readonly<Record<ReviewCallKind, ReviewCallLimits>> = {
	'design-verify':  { silenceMs: 90_000, timeoutMs: 600_000 },
	'design-extract': { timeoutMs: 600_000 },
	// Beside the session's own deadline (up to 30 minutes).
	'design-session': { silenceMs: 300_000 },
	// Every code-review chunk, gather, judge and controller call.
	'code-review':    { silenceMs: 300_000, timeoutMs: 600_000 },
	// Inside the validation session's 300 s deadline, leaving time for its one retry.
	'build-validate': { silenceMs: 90_000 },
};

/** A row as structured-execution fields: `{ timeoutMs?, stallMs? }`, absent fields left out. */
export function structuredLimits(kind: ReviewCallKind): { readonly timeoutMs?: number; readonly stallMs?: number } {
	const row = REVIEW_CALL_LIMITS[kind];
	return {
		...(row.timeoutMs !== undefined ? { timeoutMs: row.timeoutMs } : {}),
		...(row.silenceMs !== undefined ? { stallMs: row.silenceMs } : {}),
	};
}
