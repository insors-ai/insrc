/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TEST HELPER — give a fixture the review its approval requires.
 *
 * Approval of a DEF, HLD or LLD requires a review, and approval of a BUILD
 * record requires a code review of its Story; in both cases by the party that
 * did NOT author the work. A test that approves a fixture only to reach the
 * stage it is really about calls this first, so it does not have to hand-build
 * a review.
 *
 * The reviewer is the other party to the fixture's author, read with the same
 * reader the gate uses. A fixture that names no author gets a daemon review:
 * with the author unknown no reviewer can be the "same party", so the gate
 * accepts it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { authorPartyOf, otherParty } from '../../review/party.js';
import type { Party } from '../../review/party.js';
import type { ReviewReport } from '../../review/types.js';
import { codeReviewArtifactId } from '../../storage.js';

/** The model label each party's reviews carry: `client` has always meant the controller. */
const MODEL: Record<Party, string> = { controller: 'client', daemon: 'cli-claude:test-reviewer' };

export interface StampedReview {
	/** The party the review is stamped as done by. */
	readonly reviewedBy: Party;
	/** Where it was written: the artifact's own json, or the code-review record beside a BUILD record. */
	readonly path: string;
}

/**
 * Stamp a passing other-party review for the artifact at `jsonPath`.
 *
 * A BUILD record (`BUILD-…json`) gets a code-review record written beside it;
 * any other artifact gets `meta.review` on its own json. Returns who reviewed
 * and where the review was written.
 */
export function stampOtherPartyReview(jsonPath: string): StampedReview {
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta: Record<string, unknown> };
	const author = authorPartyOf(artifact.meta);
	const reviewedBy: Party = author === 'unknown' ? 'daemon' : otherParty(author);
	const at = '2026-10-05T00:00:00.000Z';

	if (basename(jsonPath).startsWith('BUILD-')) {
		const epicHash = artifact.meta['epicHash'] as string;
		const storyId = artifact.meta['storyId'] as string;
		const crPath = join(dirname(jsonPath), `${codeReviewArtifactId(epicHash, storyId)}.json`);
		const record = {
			meta: {
				workflow: 'code-review', runId: 'cr-test', repoPath: dirname(dirname(dirname(jsonPath))), createdAt: at,
				model: MODEL[reviewedBy], elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1,
				epicHash, storyId, reviewedBy,
			},
			body: {
				kind: 'code-review', epicHash, storyId, groundingMode: 'full', subject: { changedFiles: [] },
				dimensions: [], verdict: 'pass', counts: { high: 0, med: 0, low: 0 },
			},
		};
		writeFileSync(crPath, JSON.stringify(record, null, 2) + '\n');
		return { reviewedBy, path: crPath };
	}

	const stage = typeof artifact.meta['workflow'] === 'string' ? artifact.meta['workflow'] : 'unknown';
	const review: ReviewReport = {
		artifact: stage, stage, verdict: 'pass', findings: [], counts: { high: 0, med: 0, low: 0 },
		reviewedAt: at, model: MODEL[reviewedBy], reviewedBy,
	};
	writeFileSync(jsonPath, JSON.stringify({ ...artifact, meta: { ...artifact.meta, review } }, null, 2) + '\n');
	return { reviewedBy, path: jsonPath };
}
