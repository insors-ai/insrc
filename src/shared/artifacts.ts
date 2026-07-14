/**
 * Artifact tasks -- shared types.
 *
 * See design/artifacts/index.html and plans/artifact-tasks.md. These
 * types cross the daemon / browser boundary (the workbench artifact
 * event stream carries `ArtifactResult`s, and the chat widget + future
 * Artifacts Pane render them), so the module has zero runtime
 * dependencies and is imported by both sides.
 *
 * An ArtifactResult is the outcome of one tool invocation
 * (`artifact.er`, `artifact.sequence`, ...). It carries the editable
 * source (Mermaid text for diagrams; a structured spec for the
 * wireframe kind) plus two pre-rendered HTML strings:
 *
 *   - `embedded`   -- relies on the host surface to bootstrap the
 *                     renderer (Mermaid) once per session. Used inside
 *                     insrc surfaces (chat widget, panes).
 *   - `standalone` -- self-contained with an SRI-pinned CDN script
 *                     tag. Used for "copy snippet", markdown export,
 *                     and any path where the snippet leaves insrc.
 *
 * Artifacts persist as TodoItems on an auto-created session-scoped
 * Artifacts list (plans/todo-framework.md). `ArtifactItemMeta` is
 * the shape that lives under `TodoItem.meta`.
 */

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type ArtifactKind =
	| 'er'
	| 'sequence'
	| 'flow'
	| 'deployment'
	| 'wireframe'
	| 'callflow';

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
	'er',
	'sequence',
	'flow',
	'deployment',
	'wireframe',
	'callflow',
];

export function isArtifactKind(value: string): value is ArtifactKind {
	return (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/**
 * Confidence the generator attaches to its output. Mirrors the analyzer's
 * three-tier scale so downstream surfaces can render a consistent badge.
 */
export type ArtifactConfidence = 'high' | 'medium' | 'low';

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

/**
 * The two rendered-HTML outputs produced by every artifact render. A
 * caller picks `embedded` for insrc-internal surfaces and `standalone`
 * when the snippet leaves the IDE.
 */
export interface RenderedArtifactHtml {
	readonly embedded: string;
	readonly standalone: string;
}

export interface ArtifactResult {
	/** Globally-unique id, hex-32 (matches the repo convention). */
	readonly id: string;
	readonly kind: ArtifactKind;
	/** Editable source: Mermaid text for diagram kinds, JSON-serialised
	 *  `WireframeSpec` for the wireframe kind. */
	readonly source: string;
	readonly renderedHtml: RenderedArtifactHtml;
	readonly title?: string | undefined;
	/** Free-form provenance metadata: `generatedAt`, `provenance`
	 *  (e.g. "live DB: primary", "prisma/schema.prisma", "free-text"),
	 *  `sourceConnection`, `sourceEntity`, etc. Keys are template-
	 *  slot-mapped by the binder; unknown keys are ignored. */
	readonly metadata: Readonly<Record<string, string>>;
	/** Fallback / degraded-source notices surfaced to the caller. */
	readonly warnings: readonly string[];
	readonly confidence: ArtifactConfidence;
}

// ---------------------------------------------------------------------------
// Persisted item meta (lives under TodoItem.meta; see plans/todo-framework.md)
// ---------------------------------------------------------------------------

export interface ArtifactRevisionRecord {
	/** ISO-8601 timestamp of when the prior revision was superseded. */
	readonly at: string;
	/** Natural-language edit request that drove the regeneration. */
	readonly edits: string;
	/** The source at that revision (pre-regeneration). */
	readonly source: string;
}

export interface ArtifactItemMeta {
	readonly kind: ArtifactKind;
	readonly source: string;
	readonly renderedHtml: RenderedArtifactHtml;
	readonly title?: string | undefined;
	readonly metadata: Readonly<Record<string, string>>;
	readonly warnings: readonly string[];
	readonly confidence: ArtifactConfidence;
	/** Last-N revisions kept on regeneration; eviction policy in
	 *  plans/artifact-tasks.md §2.1 (keep 5). */
	readonly revisions: readonly ArtifactRevisionRecord[];
}

// ---------------------------------------------------------------------------
// Template layering (repo > user > bundled; plans §1.4, design §7.2)
// ---------------------------------------------------------------------------

export type TemplateLayer = 'repo' | 'user' | 'bundled';

export interface TemplateInfo {
	readonly kind: ArtifactKind;
	readonly layer: TemplateLayer;
	/** Absolute path at which the template resolved. */
	readonly path: string;
}

// ---------------------------------------------------------------------------
// Wireframe spec -- input to the SVG renderer for the wireframe kind.
// Deliberately small: the stage-2 LLM pass produces this shape; the
// SVG renderer consumes it. Design §8.2.
// ---------------------------------------------------------------------------

export type WireframeLayout = 'desktop' | 'mobile' | 'tablet';

export type WireframeCellKind =
	| 'header'
	| 'nav'
	| 'content'
	| 'sidebar'
	| 'footer'
	| 'placeholder';

export interface WireframeCell {
	readonly kind: WireframeCellKind;
	readonly label?: string | undefined;
	/** Relative width among siblings in the same row. Defaults to 1. */
	readonly widthRatio?: number | undefined;
	/** Nested rows inside this cell (composite regions). */
	readonly children?: readonly WireframeRow[] | undefined;
}

export interface WireframeRow {
	/** Absolute pixel height or 'auto' for flex-height. */
	readonly height: number | 'auto';
	readonly cells: readonly WireframeCell[];
}

export interface WireframeSpec {
	readonly layout: WireframeLayout;
	readonly rows: readonly WireframeRow[];
}

// ---------------------------------------------------------------------------
// Tool call options -- inputs each `artifact.<kind>` tool accepts.
// Each kind has its own shape; the shared `ArtifactOptsCommon` covers
// what every kind accepts. Design §5.
// ---------------------------------------------------------------------------

export interface ArtifactOptsCommon {
	/** Caller-supplied title. If omitted, binder falls back to a
	 *  kind-specific default. */
	readonly title?: string | undefined;
	/** Free-text description. When present, acts as the source for
	 *  kinds that don't have a structured input, and as steering
	 *  context for kinds that do. */
	readonly description?: string | undefined;
}

export interface ErOptions extends ArtifactOptsCommon {
	/** Connection id from db-connections.json (phase 3+). */
	readonly connection?: string | undefined;
	/** Subset of tables to include. When omitted, the kind picks a
	 *  reasonable default (all tables in the targeted schema). */
	readonly tables?: readonly string[] | undefined;
	/** Graph-entity ids to include when the code-graph source is used. */
	readonly entityIds?: readonly string[] | undefined;
}

export interface SequenceOptions extends ArtifactOptsCommon {
	/** Entry-point entity id for graph CALLS traversal. */
	readonly entry?: string | undefined;
	/** Traversal depth. Default 3. */
	readonly depth?: number | undefined;
}

export type FlowSubKind = 'code' | 'process';

export interface FlowOptions extends ArtifactOptsCommon {
	readonly kind?: FlowSubKind | undefined;
	/** For code-flow: the function/entity to diagram. */
	readonly entity?: string | undefined;
}

export interface DeploymentOptions extends ArtifactOptsCommon {
	/** Absolute or repo-relative path to a docker-compose.yml, k8s
	 *  manifest, or Terraform plan JSON. Resolution order in
	 *  `kinds/deployment.ts`. */
	readonly fromFile?: string | undefined;
}

export interface WireframeOptions extends ArtifactOptsCommon {
	readonly layout?: WireframeLayout | undefined;
	/** Function / component entity name to introspect. When set, the
	 *  kind tries the React-introspection branch (§4.1): looks up the
	 *  function entity in the graph, reads its body, and walks the JSX
	 *  subtree to derive a low-fi `WireframeSpec`. Falls through to
	 *  free-text / LLM / default scaffold on any failure. */
	readonly component?: string | undefined;
	/** Recursive descent depth for in-tree custom components encountered
	 *  during walking. Each level reads the imported component's source
	 *  file and recurses into its JSX. Default 3. */
	readonly depth?: number | undefined;
}

export type CallflowLayout = 'sequence' | 'flowchart';

export interface CallflowOptions extends ArtifactOptsCommon {
	/** Path (absolute or repo-relative) to a JSON file holding a
	 *  trace export. Mutually optional with `traceJson`; one is
	 *  required unless the free-text fallback is desired. */
	readonly tracePath?: string | undefined;
	/** Inline JSON string. Same content shape as a trace export
	 *  file. Useful for callers that already have the trace in
	 *  memory and don't want to write to disk. */
	readonly traceJson?: string | undefined;
	/** When the input carries multiple traces, pick one. Falls
	 *  back to the first trace when omitted + only one is present. */
	readonly traceId?: string | undefined;
	/** Include only spans whose `service.name` is in this list. */
	readonly serviceFilter?: readonly string[] | undefined;
	/** Include INTERNAL-kind spans. Default false -- only cross-
	 *  service / client / server / producer / consumer spans are
	 *  rendered, since INTERNAL spans typically swamp the diagram. */
	readonly showInternal?: boolean | undefined;
	/** Layout for the rendered diagram. v1 ships `'sequence'`
	 *  (Mermaid sequenceDiagram). `'flowchart'` lands in the
	 *  follow-up that adds the topology view. */
	readonly layout?: CallflowLayout | undefined;
}

export type ArtifactOpts =
	| ({ readonly kind: 'er' } & ErOptions)
	| ({ readonly kind: 'sequence' } & SequenceOptions)
	| ({ readonly kind: 'flow' } & FlowOptions)
	| ({ readonly kind: 'deployment' } & DeploymentOptions)
	| ({ readonly kind: 'wireframe' } & WireframeOptions)
	| ({ readonly kind: 'callflow' } & CallflowOptions);

// ---------------------------------------------------------------------------
// CDN metadata for standalone-mode rendering
// ---------------------------------------------------------------------------

/**
 * Shape of src/insrc/assets/artifacts/mermaid-cdn.json. The template
 * binder reads this at standalone-render time so version bumps are a
 * JSON edit, not a code change. Hash is an SRI (`sha384-…`) string
 * computed locally from the same bundle version pinned in
 * package.json.
 */
export interface MermaidCdnMeta {
	readonly version: string;
	readonly scriptUrl: string;
	readonly integrity: string;
	readonly crossorigin: 'anonymous';
}

// ---------------------------------------------------------------------------
// Artifact event -- fires on the daemon -> browser event stream when
// a new artifact is created or an existing one is regenerated. The
// chat widget + Artifacts Pane both subscribe.
// ---------------------------------------------------------------------------

export type ArtifactEventKind = 'created' | 'updated';

export interface ArtifactEvent {
	readonly sessionId: string;
	readonly kind: ArtifactEventKind;
	readonly artifact: ArtifactResult;
}
