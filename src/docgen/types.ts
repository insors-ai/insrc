/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — shared contract types (Epic 870ed3dd, Story s1 · t1).
 *
 * The four shared contracts every docgen story consumes. The load-bearing
 * design decision (HLD alt a1 → LLD alt a2) is that graph-DERIVED diagram
 * content and LLM-NARRATED content are separated STRUCTURALLY, not by a
 * per-item flag: `DocumentIR` partitions its content into `derived` and
 * `narrated`, so it is a *type error* for LLM prose to be typed into diagram
 * structure. This makes the k8 invariant ("structural diagram content is
 * graph-derived; the LLM is confined to narrative") checker-enforced.
 *
 * Zero runtime dependencies — the types cross the daemon/IPC/MCP boundary and
 * are imported by extractors, the renderer, the registry, and the tool wiring.
 */

// ---------------------------------------------------------------------------
// sc1 — DocumentIR (provenance-partitioned intermediate representation)
// ---------------------------------------------------------------------------

/** A back-reference from an IR element to the graph entity/relation it was
 *  derived from. Present on `derived` elements only. */
export interface IrCitation {
	readonly entityId?:   string | undefined;
	readonly relationId?: string | undefined;
}

/** A diagram node — always graph-derived (lives under `DerivedContent.nodes`). */
export interface IrNode {
	readonly id:        string;
	readonly label:     string;
	readonly kind:      string; // 'type' | 'module' | 'call-frame' | 'component' | ...
	readonly citation?: IrCitation | undefined;
}

/** A diagram edge — always graph-derived (lives under `DerivedContent.edges`). */
export interface IrEdge {
	readonly id:        string;
	readonly from:      string; // IrNode id
	readonly to:        string; // IrNode id
	readonly kind:      string; // 'inherits' | 'composes' | 'depends-on' | 'calls' | ...
	readonly citation?: IrCitation | undefined;
}

/** A narrated prose section — always LLM-authored (lives under `NarratedContent`).
 *  Structurally ineligible for the diagram: it carries no node/edge shape. */
export interface IrSection {
	readonly id:            string;
	readonly title:         string;
	readonly narrativeText: string;
}

/** Graph-derived content: the ONLY input the diagram is built from. */
export interface DerivedContent {
	readonly nodes: readonly IrNode[];
	readonly edges: readonly IrEdge[];
}

/** LLM-narrated content: prose sections, never part of the diagram. */
export interface NarratedContent {
	readonly sections: readonly IrSection[];
}

/**
 * The intermediate representation of one document. `derived` and `narrated`
 * are separate containers — position in the partition carries provenance, so
 * there is no per-item `provenance` flag and no way to type narrated content
 * into diagram structure. `generatedAtRevision` pins the graph index revision
 * read at extraction time, so repeated generation over unchanged code is
 * byte-identical.
 */
export interface DocumentIR {
	readonly docType:             string; // matches DocTypeRegistration.docType
	readonly scopeDescription:    string;
	readonly derived:             DerivedContent;
	readonly narrated:            NarratedContent;
	readonly generatedAtRevision: string;
}

// ---------------------------------------------------------------------------
// sc4 — DocGenOutcome (the one result/failure envelope)
// ---------------------------------------------------------------------------

/**
 * The single result/failure envelope every request resolves to. Parameterized
 * so a failure variant is raised at the exact point it is detected (the
 * extractor returns `DocGenOutcome<DocumentIR>`; the boundary returns
 * `DocGenOutcome<RenderedDocumentShell>`) and short-circuits outward with its
 * reason string intact — empty-scope, not-found, truncated, etc. are handled
 * once (see outcome.ts `map`/`flatMap`), never re-implemented per story (k11).
 */
export type DocGenOutcome<T> =
	| { readonly status: 'ok';                  readonly value: T }
	| { readonly status: 'empty-scope';         readonly reason: string }
	| { readonly status: 'not-found';           readonly symbol: string }
	| { readonly status: 'truncated';           readonly depthUsed: number }
	| { readonly status: 'fallback-unavailable'; readonly reason: string; readonly remedy: string }
	| { readonly status: 'source-not-ready';    readonly reason: string };

// ---------------------------------------------------------------------------
// sc3 — RenderedDocumentShell (the self-contained offline document shape)
// ---------------------------------------------------------------------------

/** Which renderer produced the shell. The fallback lands in the identical
 *  shape so a document is indistinguishable by backend when opened offline. */
export type RenderBackend = 'primary-inline' | 'fallback-subprocess';

/**
 * The single self-contained offline document every renderer must produce —
 * one HTML file with an inlined SVG runtime, zoom/pan, and no view-time
 * network access. Extends (not parallels) the existing `RenderedArtifactHtml`
 * / `loadMermaidCdnMeta` primitives (k5, k6, k10). Phase A emits
 * `backend: 'primary-inline'` only.
 */
export interface RenderedDocumentShell {
	readonly docType:              string;
	readonly backend:             RenderBackend;
	readonly html:                string;  // single self-contained file, no view-time fetch
	readonly inlinedRuntimeVersion: string;
	readonly diagramFormat:       'svg';   // literal — pins ac3
	readonly supportsZoomPan:     true;    // literal — pins ac3
}

// ---------------------------------------------------------------------------
// sc2 — DocTypeRegistration / DocTypeRegistry
// ---------------------------------------------------------------------------

/** The capability description shown verbatim in enumeration on every surface
 *  (daemon tool registry, IPC method table, MCP tool surface). */
export interface DocTypeCapabilityDescription {
	readonly id:      string; // 'type-structure' | 'component-dependency' | 'call-sequence' | 'narrative'
	readonly summary: string; // displayed verbatim; no surface re-words it
}

/**
 * One document type's registration record. The extractor is BOUND into the
 * record (LLD alt a2): resolving a docType to its implementation and to its
 * capability description are the same lookup, so no second dispatch map exists
 * beside the registry — the k4 drift is structurally absent. The cost: a
 * caller crossing IPC/MCP must project the serializable subset
 * (docType + capability + extractorInputSchema) since `extract` is a function.
 */
export interface DocTypeRegistration {
	readonly docType:              string;
	readonly capability:           DocTypeCapabilityDescription;
	readonly extractorInputSchema: Record<string, unknown>; // JSON schema for scope/entry-point params
	extract(input: Record<string, unknown>): Promise<DocGenOutcome<DocumentIR>>;
}

/** The serializable projection of a registration that crosses a process
 *  boundary (IPC / MCP) — everything except the bound `extract` function. */
export interface SerializableDocTypeRegistration {
	readonly docType:              string;
	readonly capability:           DocTypeCapabilityDescription;
	readonly extractorInputSchema: Record<string, unknown>;
}

/** The single registration + resolution surface. Bootstrapped once at daemon
 *  startup; every access surface enumerates it via `list()`. */
export interface DocTypeRegistry {
	register(entry: DocTypeRegistration): void;
	list(): readonly DocTypeRegistration[];
	get(docType: string): DocTypeRegistration | undefined;
}
