/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The provenance vocabulary.
 *
 * A FeedbackEntry is the shape of a feedback entry as the repositories stored it before the common artifact model, in the body of a
 * design record. Nothing writes it any more: the conversion reads it once and turns it into a Feedback line of the FeedbackService,
 * and the legacy `artifact.feedback.append` request is still shaped like one. A FileChangeEntry is one entry of a build's
 * change log.
 *
 * Types and three constants — no logic, no runtime deps — so the artifact body modules and the render bindings import them
 * without a cycle.
 */

/** Where a provenance entry points: a file, optionally a version + a line span. */
export interface ProvenanceTarget {
	readonly file:     string;
	readonly version?: string | undefined;
	readonly segment?: { readonly startLine: number; readonly endLine: number } | undefined;
}

/** Common authorship stamp shared by every provenance entry. */
export interface ProvenanceAuthorship {
	readonly author:    string;
	readonly timestamp: string;
}

/** Where an inline comment sits in a document: the text it was made on, and enough
 *  around it to find that text again after the document is revised. */
export interface FeedbackAnchor {
	/** The selected text (at most FEEDBACK_QUOTE_MAX characters). */
	readonly quote:        string;
	/** The slug of the nearest heading above the selection. */
	readonly sectionSlug?: string | undefined;
	/** Up to FEEDBACK_CONTEXT_MAX characters of the block's text before / after the quote. */
	readonly prefix?:      string | undefined;
	readonly suffix?:      string | undefined;
}

/** The review decision a feedback entry was saved with. */
export type FeedbackDecision = 'approve' | 'reject' | 'feedback';

export const FEEDBACK_DECISIONS: readonly FeedbackDecision[] = ['approve', 'reject', 'feedback'];
export const FEEDBACK_QUOTE_MAX = 500;
export const FEEDBACK_CONTEXT_MAX = 40;

/** One feedback/suggestion/comment entry, as the legacy request and the stored legacy records shape it. */
export interface FeedbackEntry extends ProvenanceAuthorship {
	readonly id:      string;
	readonly target:  ProvenanceTarget;
	readonly comment: string;
	readonly kind?:   'feedback' | 'suggestion' | 'comment' | undefined;
	/** Present on an inline comment (Story E202610138d4b90c9:S001). */
	readonly anchor?:   FeedbackAnchor | undefined;
	/** The decision this entry was saved with, when it came from a review decision. */
	readonly decision?: FeedbackDecision | undefined;
	/** Shared by the entries saved by one decision. */
	readonly batchId?:  string | undefined;
}

/** One entry of a build's change log. */
export interface FileChangeEntry extends ProvenanceAuthorship {
	readonly target:   ProvenanceTarget;
	readonly summary?: string | undefined;
}

export type FileChangeLog      = readonly FileChangeEntry[];
