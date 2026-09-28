/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — companion-artifact reference types.
 *
 * A COMPANION is an out-of-body artifact (a rendered ER diagram, a UX mock)
 * that a document REFERENCES by relative path — it is NEVER inlined into the
 * core markdown (k1/k5). The authored structured body element (S003: the
 * `erDefinition`) is the single source of truth; the companion is a
 * DETERMINISTIC VISUALIZATION derived from it, and validation always runs
 * against the JSON element, never by parsing the rendered companion.
 *
 * Types ONLY — no logic, no runtime deps — so the artifact body modules import
 * them without a cycle. The `companions?`/`erDefinition?` body fields are added
 * (additively + absent-safe) to HldBody/LldBody in their own modules.
 */

/** The kinds of companion a document can reference. S003 ships `diagram-mermaid`
 *  (the ER render); `diagram-html` and `ux-mock` are peers reserved for later
 *  Stories (S004 UX; deferred code-derived diagrams). */
export type CompanionKind = 'diagram-mermaid' | 'diagram-html' | 'ux-mock';

/** A reference to one out-of-body companion file. The core markdown renders this
 *  as a LINK (`relPath`), never the companion's content. `ofSectionId` optionally
 *  binds the companion to a specific document section it visualizes. */
export interface CompanionArtifactRef {
	readonly kind:        CompanionKind;
	/** Repo-relative path to the companion file (a sibling of the artifact `.md`). */
	readonly relPath:     string;
	readonly title:       string;
	/** The document section id this companion visualizes, when it targets one. */
	readonly ofSectionId?: string | undefined;
}
