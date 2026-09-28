/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (provenance/feedback) — the provenance vocabulary.
 *
 * A FEEDBACK entry is a post-hoc, human-authored note attached to an artifact
 * (a design DEF/HLD/LLD/PLAN). It is NEVER authored by the synthesizer — the
 * document-generation path leaves `body.feedback` absent, and the append API
 * (writer.ts) populates it later, append-only, preserving every other key.
 *
 * A CHANGELOG entry is declared here for Story s2 (the build change-log); it is
 * UNUSED in s1 — no reader/writer references it yet, and it is defined only so
 * s2 extends this vocabulary rather than redefining it.
 *
 * Types ONLY — no logic, no runtime deps — so the artifact body modules + the
 * render binding import them without a cycle. The additive optional `feedback?`
 * body field is added (additively + absent-safe) to each XBody in its own module.
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

/** One post-hoc feedback/suggestion/comment entry attached to an artifact. */
export interface FeedbackEntry extends ProvenanceAuthorship {
	readonly id:      string;
	readonly target:  ProvenanceTarget;
	readonly comment: string;
	readonly kind?:   'feedback' | 'suggestion' | 'comment' | undefined;
}

/** One change-log entry (declared for s2 — unused in s1). */
export interface ChangeLogEntry extends ProvenanceAuthorship {
	readonly target:   ProvenanceTarget;
	readonly summary?: string | undefined;
}

export type FeedbackRecord = readonly FeedbackEntry[];
export type ChangeLog      = readonly ChangeLogEntry[];
