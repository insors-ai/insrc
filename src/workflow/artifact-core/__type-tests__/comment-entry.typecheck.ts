/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of CommentParty/CommentEntry/ReviewContextRound's exact field shapes
 * (npm run typecheck:tools). Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { CommentEntry, CommentParty, ReviewContextRound } from '../types.js';

export function positive(): void {
	const submitter: CommentParty = 'submitter';
	const reviewer: CommentParty = 'reviewer';

	const entry: CommentEntry = { round: 1, party: submitter, timestamp: '2026-11-19T00:00:00.000Z', text: 'x' };
	const round: ReviewContextRound = { round: 1, comments: [entry] };
	const emptyRound: ReviewContextRound = { round: 2, comments: [] };

	void reviewer; void round; void emptyRound;
}

export function negative(entry: CommentEntry, round: ReviewContextRound): void {
	// @ts-expect-error CommentParty has only 'submitter' | 'reviewer'
	const _p1: CommentParty = 'author';

	// @ts-expect-error CommentEntry.round is required
	const _e1: CommentEntry = { party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z', text: 'x' };
	// @ts-expect-error CommentEntry.party is required
	const _e2: CommentEntry = { round: 1, timestamp: '2026-11-19T00:00:00.000Z', text: 'x' };
	// @ts-expect-error CommentEntry.timestamp is required
	const _e3: CommentEntry = { round: 1, party: 'submitter', text: 'x' };
	// @ts-expect-error CommentEntry.text is required
	const _e4: CommentEntry = { round: 1, party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z' };
	// @ts-expect-error CommentEntry has no field named "verdict"
	const _e5: CommentEntry = { round: 1, party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z', text: 'x', verdict: 'pass' };
	// @ts-expect-error CommentEntry has no field named "severity"
	const _e6: CommentEntry = { round: 1, party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z', text: 'x', severity: 'HIGH' };
	// @ts-expect-error CommentEntry has no field named "dimension"
	const _e7: CommentEntry = { round: 1, party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z', text: 'x', dimension: 'coverage' };
	// @ts-expect-error CommentEntry has no field named "artifactId"
	const _e8: CommentEntry = { round: 1, party: 'submitter', timestamp: '2026-11-19T00:00:00.000Z', text: 'x', artifactId: 'LLD-1' };
	// @ts-expect-error CommentEntry.round is readonly
	entry.round = 2;
	// @ts-expect-error CommentEntry.party is readonly
	entry.party = 'reviewer';
	// @ts-expect-error CommentEntry.timestamp is readonly
	entry.timestamp = 'later';
	// @ts-expect-error CommentEntry.text is readonly
	entry.text = 'y';

	// @ts-expect-error ReviewContextRound.round is required
	const _r1: ReviewContextRound = { comments: [] };
	// @ts-expect-error ReviewContextRound.comments is required
	const _r2: ReviewContextRound = { round: 1 };
	// @ts-expect-error ReviewContextRound has no field named "artifactId"
	const _r3: ReviewContextRound = { round: 1, comments: [], artifactId: 'x' };
	// @ts-expect-error ReviewContextRound.round is readonly
	round.round = 2;
	// @ts-expect-error ReviewContextRound.comments is readonly
	round.comments = [];
	// @ts-expect-error ReviewContextRound.comments is readonly CommentEntry[], not mutable
	round.comments.push(entry);
}
