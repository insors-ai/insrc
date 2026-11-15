/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TEST HELPER — the ISSUE that heads a build with no design. A Trivial or
 * small-bugfix build is admitted only under the hash of an approved ISSUE
 * (Story c5b49ff953a9a295/s1), so a test that drives one seeds its ISSUE first.
 */

import { approvedMeta, draftMeta, writeHead } from '../lifecycle-fixtures.js';
import { issueArtifactId } from '../../storage.js';

export interface SeedIssueOptions {
	/** The ISSUE's creation time, which anchors the work item's folder. */
	readonly createdAt?: string | undefined;
	/** false seeds a draft ISSUE (default: approved). */
	readonly approved?:  boolean | undefined;
	readonly kind?:      'defect' | 'change' | undefined;
}

/** Write `ISSUE-<issueHash>` into `repo`, approved unless `approved: false`. */
export function seedIssue(repo: string, issueHash: string, opts: SeedIssueOptions = {}): void {
	const createdAt = opts.createdAt ?? '2026-07-17T07:42:28.275Z';
	writeHead(repo, issueArtifactId(issueHash), {
		meta: {
			workflow: 'issue', runId: `wf-issue-${issueHash}`, repoPath: repo, createdAt, epicCreatedAt: createdAt,
			elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1, issueHash, epicSlug: `issue-${issueHash}`,
			standalone: true, magnitude: 'small', kind: opts.kind ?? 'change', parentRef: null,
			...(opts.approved === false ? draftMeta() : approvedMeta()),
		},
		body: { title: 'A trivial change', reproduction: 'Asked for it.', rootCause: 'It helps.', fixIntent: 'It changes.' },
	});
}
