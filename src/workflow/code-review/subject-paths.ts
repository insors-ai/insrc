/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Derive the sc2 md-path arguments for a code-review record from its subject.
 *
 * A CR record must land in the SAME work-item folder as the story it reviews, so
 * its folder anchor (`createdAtISO`) + top-level split (`workItemKind`) come from
 * the STORY's own artifacts — the approved LLD, or the standalone build record —
 * never from the CR record's own createdAt (which could differ by a day and
 * split the CR into a separate folder). Shared by the runner (write) and the MCP
 * handler (response path) so the two never diverge.
 */

import type { WorkItemKind } from '../path-scheme.js';
import { workItemAnchorCreatedAt, workItemKindOf } from '../storage.js';
import type { CodeReviewSubject } from './types.js';

export function codeReviewSubjectPathArgs(subject: CodeReviewSubject): {
	readonly createdAtISO: string;
	readonly workItemKind: WorkItemKind;
	readonly epicSlug:     string | undefined;
} {
	// Prefer the approved LLD's meta (carries the stamped epicCreatedAt anchor +
	// slug); fall back to the standalone build record; default defensively.
	const anchorMeta = subject.approvedLld?.meta ?? subject.buildRecord?.meta;
	return {
		createdAtISO: anchorMeta !== undefined ? workItemAnchorCreatedAt(anchorMeta) : new Date().toISOString(),
		workItemKind: anchorMeta !== undefined ? workItemKindOf(anchorMeta) : 'epic',
		epicSlug:     subject.approvedLld?.meta.epicSlug,
	};
}
