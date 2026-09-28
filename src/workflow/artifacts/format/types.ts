/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc3 (S002) — the declarative per-type document-format model.
 *
 * A `DocumentFormat` describes ONE artifact type's human-first layout: a short
 * H1, an unnumbered pre-TOC Summary/abstract, a generated Contents, and an
 * ordered set of numbered body `SectionSpec`s (with a repeatable per-item
 * `ItemFormat` for stories/tasks). The `renderFromFormat` engine (engine.ts)
 * fills a format from per-section content bindings the renderer supplies.
 *
 * This module is types only — no logic — so it is safe to import from the
 * artifact body modules without cycles.
 */

/** Who a section is written for. Tags the DEF Summary business/product, etc. */
export type Audience = 'business' | 'product' | 'technical';

/** A reference to an upstream artifact's section, rendered as a de-dup line
 *  ("> See **HLD-<hash>** § 2. Framework summary") instead of copied prose (ac2). */
export interface SharedContextRef {
	readonly sourceArtifactId: string;   // e.g. 'HLD-c5824e17eccf0c14'
	readonly sectionId:        string;   // a (number-prefixed) section slug on the source
}

/** Where a section's content comes from. */
export type SectionSource =
	| 'body'        // rendered from a per-section content binding the renderer supplies
	| 'shared-ref'  // rendered as a SharedContextRef reference line (de-dup)
	| 'fr'          // S001's renderFunctionalRequirementsSection, consumed unchanged
	| 'extension';  // a NAMED slot a later Story (S003 diagrams / S004 UX) fills

/** One ordered section in a document format. */
export interface SectionSpec {
	readonly id:              string;
	readonly heading:         string;
	readonly contentGuidance: string;
	readonly audience?:       Audience | undefined;
	readonly required:        boolean;
	/** Envelope sections (Summary/Contents) are unnumbered; body sections number 1..N. */
	readonly numbered:        boolean;
	readonly source:          SectionSource;
}

/** The repeatable per-item sub-layout (a story or a task), nested-numbered N.M. */
export interface ItemFormat {
	readonly itemKind: 'story' | 'task';
	readonly sections: readonly SectionSpec[];
}

/** A whole per-type document format. */
export interface DocumentFormat {
	readonly kind:       'define' | 'hld' | 'lld' | 'plan';
	/** How to derive the short H1 (a name, never the 40-word first paragraph). */
	readonly h1:         string;
	readonly summary:    SectionSpec;               // the pre-TOC abstract (unnumbered)
	readonly sections:   readonly SectionSpec[];    // ordered body sections
	readonly itemFormat?: ItemFormat | undefined;
}

/** The plain-language, item-scoped abstract each document leads with (S002).
 *  Additive + absent-safe on every artifact body. */
export interface DocumentSummary {
	readonly prose:     string;
	readonly audience?: Audience | undefined;
}
