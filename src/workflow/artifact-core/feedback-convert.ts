/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure conversion of a stored legacy `FeedbackEntry` (an entry of the feedback list a design record used to carry) into a
 * `Feedback` for the s9 conversion, by the s5 mapping: the author becomes a namespaced
 * actor (`legacy:<slug>` with the text in `properties.name`, unless it already is an
 * `os:`, `git:` or `github:` id), a feedback decision or kind is a revision request, and
 * a file other than the artifact's own document goes to `anchor.section`. Nothing is
 * dropped silently: a value that has no home in the new shape is reported in `unmapped`.
 */

import type { FeedbackDecision, FeedbackEntry } from '../artifacts/provenance/types.js';
import type { Feedback } from './types.js';

const NAMESPACED = /^(os|git|github):/i;

/** The actor an author text stands for: an already namespaced id (lower-cased) or a stable legacy:<slug>. */
function actorOfAuthor(author: string): Feedback['actor'] {
	const trimmed = author.trim();
	const id = NAMESPACED.test(trimmed)
		? trimmed.toLowerCase()
		: `legacy:${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'}`;
	return { id, kind: 'person', properties: { name: author } };
}

export interface UnmappedField {
	/** The legacy field, e.g. `target.version`. */
	readonly field:  string;
	readonly value:  string;
	readonly reason: string;
}

export interface ConvertedFeedback {
	readonly feedback: Feedback;
	/** The decision the entry was saved with; it becomes the outcome of the change log entry of its batch. */
	readonly decision?: FeedbackDecision | undefined;
	readonly unmapped:  readonly UnmappedField[];
}

/**
 * @param entry        The stored entry.
 * @param ownDocument  The artifact's own document path; a `target.file` equal to it is dropped, any other goes to `anchor.section`.
 */
export function convertLegacyFeedback(entry: FeedbackEntry, ownDocument?: string | undefined): ConvertedFeedback {
	const unmapped: UnmappedField[] = [];

	const own = ownDocument !== undefined && entry.target.file === ownDocument;
	// a file other than the artifact's own document is kept in the section, with the heading slug after a '#'
	const section = own ? entry.anchor?.sectionSlug
		: entry.anchor?.sectionSlug !== undefined ? `${entry.target.file}#${entry.anchor.sectionSlug}` : entry.target.file;
	const anchor = entry.anchor === undefined && entry.target.segment === undefined && own ? undefined : {
		...(entry.anchor !== undefined ? { quote: entry.anchor.quote } : {}),
		...(entry.anchor?.prefix !== undefined ? { prefix: entry.anchor.prefix } : {}),
		...(entry.anchor?.suffix !== undefined ? { suffix: entry.anchor.suffix } : {}),
		...(section !== undefined ? { section } : {}),
		...(entry.target.segment !== undefined ? { lines: [entry.target.segment.startLine, entry.target.segment.endLine] as [number, number] } : {}),
	};

	let revision: number | undefined;
	const version = entry.target.version;
	if (version !== undefined) {
		const n = /^[0-9]+$/.test(version) ? Number(version) : NaN;
		if (Number.isSafeInteger(n)) revision = n;
		else unmapped.push({ field: 'target.version', value: version, reason: 'not an integer revision' });
	}

	const feedback: Feedback = {
		id:        entry.id,
		text:      entry.comment,
		actor:     actorOfAuthor(entry.author),
		timestamp: entry.timestamp,
		feedback:  [],
		kind:      entry.decision === 'feedback' || entry.kind === 'feedback' ? 'revision-request' : entry.kind === 'suggestion' ? 'suggestion' : 'comment',
		...(anchor !== undefined ? { anchor } : {}),
		...(revision !== undefined ? { revision } : {}),
		...(entry.batchId !== undefined ? { batchId: entry.batchId } : {}),
	};
	return { feedback, decision: entry.decision, unmapped };
}

/** The change log outcome of each batch: the decision its entries were saved with. */
export function legacyBatchOutcomes(converted: readonly ConvertedFeedback[]): { readonly batchId: string; readonly outcome: { readonly result: FeedbackDecision; readonly summary: string } }[] {
	const out = new Map<string, FeedbackDecision>();
	for (const c of converted) {
		const batchId = c.feedback.batchId;
		if (batchId !== undefined && c.decision !== undefined && !out.has(batchId)) out.set(batchId, c.decision);
	}
	return [...out].map(([batchId, result]) => ({ batchId, outcome: { result, summary: `review decision: ${result}` } }));
}
