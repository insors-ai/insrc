/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Derive the sc2 md-path arguments for a code-review record from its subject.
 *
 * A CR record must land in the SAME work-item folder as the story it reviews, so
 * its folder is resolved by the one derivation every Story record uses
 * ({@link storyRecordFolderArgs}) — from the work item's definition head, its
 * LLD and its persisted BUILD record — never from the CR record's own createdAt
 * (which could differ by a day and split the CR into a separate folder). Shared
 * by the runner (write) and the MCP handler (response path) so the two never
 * diverge.
 */

import type { WorkItemKind } from '../path-scheme.js';
import { storyRecordFolderArgs, workItemAnchorCreatedAt } from '../storage.js';
import type { CodeReviewSubject } from './types.js';

export function codeReviewSubjectPathArgs(subject: CodeReviewSubject): {
	readonly createdAtISO: string;
	readonly workItemKind: WorkItemKind;
	readonly epicSlug:     string | undefined;
} {
	// What the subject is holding is only the FALLBACK now: it is used when the
	// work item's own artifacts are silent. The label in particular used to be
	// read straight off the LLD's stored meta, which can disagree with the
	// definition head and sent the review to a second folder (ISSUE-b2e16601).
	const held = subject.approvedLld?.meta ?? subject.buildRecord?.meta;
	const resolved = storyRecordFolderArgs(subject.repoPath, subject.epicHash, subject.storyId, {
		standalone:   held?.standalone,
		ownCreatedAt: held !== undefined ? workItemAnchorCreatedAt(held) : new Date().toISOString(),
	});
	// The held LLD's label is the LAST resort — only when nothing on disk names
	// the work item — so the folder never degrades to a raw hash while a label is
	// in hand. An empty label counts as absent.
	const heldLabel = subject.approvedLld?.meta.epicSlug;
	return {
		...resolved,
		epicSlug: resolved.epicSlug ?? (heldLabel !== undefined && heldLabel.length > 0 ? heldLabel : undefined),
	};
}
