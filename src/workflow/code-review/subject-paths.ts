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
import { MissingAnchorError } from '../artifact-ids.js';
import { storyRecordFolderArgs } from '../storage.js';
import type { CodeReviewSubject } from './types.js';

export function codeReviewSubjectPathArgs(subject: CodeReviewSubject): {
	readonly epicCreatedAt: string;
	readonly workItemKind: WorkItemKind;
	readonly epicSlug:     string | undefined;
} {
	// What the subject is holding is only the FALLBACK now: it is used when the
	// work item's own artifacts are silent. The label in particular used to be
	// read straight off the LLD's stored meta, which can disagree with the
	// definition head and sent the review to a second folder (ISSUE-b2e16601).
	const held = subject.approvedLld?.meta ?? subject.buildRecord?.meta;
	// The anchor is what the work item's records say. A subject also holds the
	// persisted LLD or BUILD record it was built from, so that record's own stamp
	// answers when the work item on disk is silent; with neither, the review has
	// no folder and the read fails (no clock is substituted).
	const heldStamp = held?.epicCreatedAt;
	let resolved: ReturnType<typeof storyRecordFolderArgs>;
	try {
		resolved = storyRecordFolderArgs(subject.repoPath, subject.epicHash, subject.storyId, { standalone: held?.standalone }, { kind: 'read' });
	} catch (err) {
		if (!(err instanceof MissingAnchorError) || heldStamp === undefined || heldStamp.length === 0) throw err;
		resolved = storyRecordFolderArgs(subject.repoPath, subject.epicHash, subject.storyId, { standalone: held?.standalone }, { kind: 'write', root: { createdAt: heldStamp } });
	}
	// The held LLD's label is the LAST resort — only when nothing on disk names
	// the work item — so the folder never degrades to a raw hash while a label is
	// in hand. An empty label counts as absent.
	const heldLabel = subject.approvedLld?.meta.epicSlug;
	return {
		...resolved,
		epicSlug: resolved.epicSlug ?? (heldLabel !== undefined && heldLabel.length > 0 ? heldLabel : undefined),
	};
}
