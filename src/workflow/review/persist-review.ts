/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one way a design review is persisted (s9). The daemon's review (`reviewArtifactFile`) and the controller's two phases
 * (`findings`, `verdicts`) each had their own copy of inspect, head conflict check, fix, stamp, lifecycle record and markdown;
 * they all call this.
 *
 * Steps, in order: inspect (the head against its change log), head conflict check, store the auto-fix through the lifecycle
 * service with `addresses: []` (an automated fix answers no feedback, so open feedback stays open), record the review (a
 * revision-less 'review' log entry that holds the full report, then `lifecycle.review` with a Reference to that entry), render the
 * markdown. The lifecycle record comes before the markdown, so a failure leaves a state that the next run repairs: every step can
 * be repeated, the review entry has an id derived from the report, and a fix that is stored already changes nothing.
 *
 * A failure raises `ReviewPersistError` naming the step and what is stored already. Nothing is written by the first two steps.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import type { HeadPayload } from '../artifact-core/codecs.js';
import type { History } from '../artifact-core/history.js';
import type { LifecycleService } from '../artifact-core/lifecycle-service.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import { LifecycleConflictError } from '../artifact-core/types.js';
import type { Actor, Review } from '../artifact-core/types.js';
import { headConflict } from '../gates.js';
import { writeAtomic } from '../storage.js';
import { authorPartyOf, SamePartyReviewError } from './party.js';
import { reviewEntryOf, reviewReference } from './report-log.js';
import { renderReviewReport } from './report.js';
import type { ReviewReport } from './types.js';

const log = getLogger('review:persist');

/** The marker that opens the rendered review section appended to an artifact's md. */
export const REVIEW_SECTION = '<!-- insrc:review -->';

/** Strip a previously-appended review section so re-runs don't stack. */
export function stripReviewSection(md: string): string {
	const i = md.indexOf('\n' + REVIEW_SECTION);
	return i === -1 ? md : md.slice(0, i).replace(/\s+$/, '') + '\n';
}


export type PersistStep = 'inspect' | 'conflict' | 'fix' | 'record-review' | 'render';

/** A step of persistReview failed. `stored` says what is already on disk, so the caller can tell what the rerun repairs. */
export class ReviewPersistError extends Error {
	constructor(readonly step: PersistStep, readonly artifactId: string, readonly stored: readonly string[], cause: unknown) {
		super(`the review of ${artifactId} stopped at the ${step} step (${cause instanceof Error ? cause.message : String(cause)}); ${stored.length === 0 ? 'nothing is stored yet' : `stored so far: ${stored.join(', ')}`}`, { cause });
		this.name = 'ReviewPersistError';
	}
}

export interface PersistReviewInput {
	readonly artifactId: string;
	readonly jsonPath:   string;
	readonly mdPath:     string;
	readonly lifecycle:  LifecycleService;
	/** The service's store and its history unless given: a review is recorded through the store the service writes with. */
	readonly store?:     ArtifactStore | undefined;
	readonly history?:   History | undefined;
	readonly report:     ReviewReport;
	/** Who is recorded as the reviewer on the lifecycle. */
	readonly reviewer:   Actor;
	readonly party:      Review['party'];
	/** The actor the service records the writes as. */
	readonly recorder:   Actor;
	/** The auto-fix: the whole payload to store. Absent for a report-only review. */
	readonly fix?:       HeadPayload | undefined;
	/** The markdown the review section is appended to (after the fix, with any earlier review section already stripped). */
	readonly markdown:   string;
}

export interface PersistedReview {
	/** Whether the fix changed the stored content. */
	readonly fixStored:  boolean;
	/** The id of the 'review' entry that holds the full report. */
	readonly entryId:    string;
	/** Whether lifecycle.review was written (only a draft or pending-review artifact takes one). */
	readonly lifecycleRecorded: boolean;
	readonly mdPath:     string;
}

/** The id of the review entry of a report: the same report gives the same id, so a rerun appends nothing twice. */
export function reviewEntryId(artifactId: string, report: ReviewReport): string {
	return `review-${createHash('sha256').update(artifactId).update('\0').update(JSON.stringify(report)).digest('hex').slice(0, 32)}`;
}

export async function persistReview(input: PersistReviewInput): Promise<PersistedReview> {
	const { artifactId } = input;
	const store = input.store ?? input.lifecycle.store;
	const history = input.history ?? store.history;
	const stored: string[] = [];
	let step: PersistStep = 'inspect';
	try {
		// inspect: finishes a write a crash left staged, then the head against its log
		const seen = await input.lifecycle.inspect(artifactId);
		if (seen !== undefined && !seen.integrity.ok) throw new LifecycleConflictError(artifactId, seen.integrity.reason);

		step = 'conflict';
		const conflict = headConflict(input.jsonPath);
		if (conflict !== undefined) throw new LifecycleConflictError(conflict.artifactId, conflict.reason);
		const meta = (JSON.parse(readFileSync(input.jsonPath, 'utf8')) as { meta?: unknown }).meta;
		if (authorPartyOf(meta) === input.party) throw new SamePartyReviewError(input.party, `the artifact ${artifactId}`);

		step = 'fix';
		let fixStored = false;
		if (input.fix !== undefined) {
			// an automated fix is not an answer to a person's feedback: it addresses none
			fixStored = await input.lifecycle.updateContent(artifactId, input.recorder, input.fix, { addresses: [] });
			if (fixStored) stored.push('the fix');
		}

		step = 'record-review';
		const entryId = reviewEntryId(artifactId, input.report);
		await store.exclusive(artifactId, async () => {
			if ((await history.log(artifactId)).some(e => e.id === entryId)) return;
			await history.appendLog(artifactId, reviewEntryOf({ id: entryId, actor: input.recorder, timestamp: input.report.reviewedAt, report: input.report }));
		});
		stored.push('the review entry');
		const now = await input.lifecycle.inspect(artifactId);
		let lifecycleRecorded = false;
		if (now !== undefined && (now.status === 'draft' || now.status === 'pending-review')) {
			await input.lifecycle.apply(artifactId, 'review', input.recorder, {
				review: {
					reviewer: input.reviewer, party: input.party, verdict: input.report.verdict,
					counts: { high: input.report.counts.high, med: input.report.counts.med, low: input.report.counts.low },
					report: reviewReference(artifactId, entryId),
				},
			});
			lifecycleRecorded = true;
			stored.push('lifecycle.review');
		}

		step = 'render';
		// raw-write: markdown render of the review.
		writeAtomic(input.mdPath, `${input.markdown.replace(/\s+$/, '')}\n\n${REVIEW_SECTION}\n\n## Review\n\n${renderReviewReport(input.report)}\n`);

		log.info({ artifactId, verdict: input.report.verdict, fixStored, lifecycleRecorded, file: basename(input.mdPath) }, 'review persisted');
		return { fixStored, entryId, lifecycleRecorded, mdPath: input.mdPath };
	} catch (err) {
		throw new ReviewPersistError(step, artifactId, stored, err);
	}
}
