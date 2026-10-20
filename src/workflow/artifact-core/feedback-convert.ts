/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure conversion of a stored legacy `FeedbackEntry` (`body.feedback`) into a
 * `Feedback` for the s9 conversion. Nothing is dropped silently: a value that has
 * no home in the new shape is reported in `unmapped`.
 */

import type { FeedbackDecision, FeedbackEntry } from '../artifacts/provenance/types.js';
import type { Feedback } from './types.js';

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
 * @param ownDocument  The artifact's own document path; a `target.file` equal to it is dropped, any other is reported.
 */
export function convertLegacyFeedback(entry: FeedbackEntry, ownDocument?: string | undefined): ConvertedFeedback {
	const unmapped: UnmappedField[] = [];

	const anchor = entry.anchor === undefined && entry.target.segment === undefined ? undefined : {
		...(entry.anchor !== undefined ? { quote: entry.anchor.quote } : {}),
		...(entry.anchor?.prefix !== undefined ? { prefix: entry.anchor.prefix } : {}),
		...(entry.anchor?.suffix !== undefined ? { suffix: entry.anchor.suffix } : {}),
		...(entry.anchor?.sectionSlug !== undefined ? { section: entry.anchor.sectionSlug } : {}),
		...(entry.target.segment !== undefined ? { lines: [entry.target.segment.startLine, entry.target.segment.endLine] as [number, number] } : {}),
	};

	let revision: number | undefined;
	const version = entry.target.version;
	if (version !== undefined) {
		const n = /^[0-9]+$/.test(version) ? Number(version) : NaN;
		if (Number.isSafeInteger(n)) revision = n;
		else unmapped.push({ field: 'target.version', value: version, reason: 'not an integer revision' });
	}
	if (ownDocument === undefined || entry.target.file !== ownDocument) {
		unmapped.push({ field: 'target.file', value: entry.target.file, reason: 'not the artifact\'s own document' });
	}

	const feedback: Feedback = {
		id:        entry.id,
		text:      entry.comment,
		actor:     { id: `unknown:${entry.author}`, kind: 'person', properties: {} },
		timestamp: entry.timestamp,
		feedback:  [],
		kind:      entry.kind === 'suggestion' ? 'suggestion' : 'comment',
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
