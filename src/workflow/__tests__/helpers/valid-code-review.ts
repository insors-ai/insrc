/**
 * A code review record that satisfies the completion gate's freshness rule
 * (`reviewBuildGap` in `../../code-review/build-freshness.ts`): a readable verdict, the files it
 * changed, and the fingerprint of the BUILD it reviewed. Tests that need a review the gate accepts
 * build it here instead of hand-writing a bare `{ verdict, counts }` body, so a change to the rule
 * is followed in one place.
 */

import { reviewedBuildFingerprint } from '../../code-review/build-freshness.js';

export type ReviewVerdict = 'pass' | 'warn' | 'block';

export interface ValidReviewOpts {
	/** Meta of the record, e.g. the author and reviewer parties a test sets. */
	readonly meta?: Record<string, unknown> | undefined;
	readonly counts?: { high: number; med: number; low: number } | undefined;
}

const record = (v: unknown): Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** The files of the BUILD's change log, in the form `reviewBuildGap` compares them. */
export function changedFilesOf(build: unknown): string[] {
	const log = record(record(build)['body'])['changeLog'];
	if (!Array.isArray(log)) return [];
	const files: string[] = [];
	for (const e of log) {
		const f = record(record(e)['target'])['file'];
		if (typeof f === 'string' && !files.includes(f)) files.push(f);
	}
	return files;
}

/** The record to write as `CR-<epic>-<story>.json`, bound to the BUILD as it is NOW: write the BUILD first. */
export function validCodeReview(build: unknown, verdict: ReviewVerdict, opts: ValidReviewOpts = {}): { meta: Record<string, unknown>; body: Record<string, unknown> } {
	return {
		meta: opts.meta ?? {},
		body: {
			verdict,
			counts: opts.counts ?? { high: verdict === 'block' ? 2 : 0, med: 1, low: 3 },
			subject: { changedFiles: changedFilesOf(build), buildFingerprint: reviewedBuildFingerprint(build) },
		},
	};
}
