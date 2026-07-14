/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Exploration types -- the vocabulary the decomposer emits and the
 * executor dispatches on.
 *
 * plans/exploration-based-context-build.md. An `Exploration` is a
 * typed unit with a purpose, a technique (`type`), params, and an
 * expected output schema. The decomposer picks from a fixed catalog;
 * the executor runs each one; the synthesizer composes the bundle
 * from bounded exploration outputs.
 *
 * V1 catalog focuses on structural-map (Phase 1 in the plan). Docs
 * + adherence + capability + convention explorations land in later
 * phases; their type tags are declared here so the executor can
 * refuse un-implemented types with a clear error rather than
 * silently mishandling them.
 */

// ---------------------------------------------------------------------------
// The fixed catalog of exploration types
// ---------------------------------------------------------------------------

/**
 * Every exploration type the framework knows about. Grouped by
 * category for readability. See plans/exploration-based-context-build.md
 * Section 4 for the design intent per type.
 */
export type ExplorationType =
	// --- structural resolvers (deterministic) ---
	| 'concept.resolve'
	| 'module.profile'
	| 'symbol.locate'
	| 'class.hierarchy'
	| 'import.graph'
	| 'test.locate'
	| 'usage.example'
	| 'capability.reuse-check'
	// --- content search (deterministic) ---
	| 'search.text'
	// --- doc-side (mostly deterministic; some narrow LLM) ---
	| 'doc.mention'
	| 'doc.decision.trace'
	| 'doc.constraint.enumerate'
	// --- convention detection ---
	| 'convention.detect'
	| 'config.trace'
	| 'data-model.trace'
	// --- data-driver (deterministic; wraps registered DriverPool) ---
	| 'db.connections.list'
	| 'db.tables.list'
	| 'db.table.describe'
	// --- infra (deterministic; graph-backed manifest scan) ---
	| 'manifests.locate'
	// --- fallback ---
	| 'freeform.probe';

/**
 * Which answer-type recipes the decomposer picks from.
 * plans/exploration-based-context-build.md Section 5.1 lists the
 * per-type exploration ordering. V1 only implements
 * 'structural-map'; the other tags exist so the decomposer's
 * output schema is stable across phases.
 */
export type AnswerType =
	| 'structural-map'
	| 'adherence-check'
	| 'decision-trace'
	| 'capability-discovery'
	| 'how-does-it-work'
	| 'prose-retrieval'
	| 'data-inventory'
	| 'infra-inventory';

// ---------------------------------------------------------------------------
// Exploration + plan shape
// ---------------------------------------------------------------------------

export interface Exploration {
	/** Stable id within the plan (`e1`, `e2`, ...). Used by later
	 *  explorations to reference earlier outputs via dependsOn. */
	readonly id:       string;
	readonly type:     ExplorationType;
	/** 1-line human-readable rationale from the decomposer. Preserved
	 *  through the exploration output so the synthesizer + a future
	 *  UI can render why each probe fired. */
	readonly purpose:  string;
	/** Type-specific params. Shape is validated by the executor per
	 *  exploration type at dispatch time. */
	readonly params:   Readonly<Record<string, unknown>>;
	/** Ids of earlier explorations whose outputs this reads. Empty
	 *  when the exploration is standalone. */
	readonly dependsOn?: readonly string[];
}

export interface ExplorationPlan {
	readonly answerType:    AnswerType;
	readonly explorations:  readonly Exploration[];
	/** 1-2 sentence guidance to the synthesizer. E.g. "Center the
	 *  bundle on the resolved module; treat imported dependencies
	 *  as context, not focus." */
	readonly synthesisHint: string;
}

// ---------------------------------------------------------------------------
// Per-exploration output payloads
// ---------------------------------------------------------------------------

/**
 * Every runner returns a typed structured payload -- never
 * free-form prose. The synthesizer reads these + composes the
 * bundle. Bundle citations must trace back to a field in some
 * exploration output (lint-enforced downstream).
 */

/** A single ranked hit from concept.resolve. */
export interface ConceptHit {
	/** Path shape:
	 *   - `dir:/abs/path/to/dir`  for directory / module matches
	 *   - `file:/abs/path/to/file` for file matches
	 *   - `entity:<entityId>`     for entity matches (function, class, ...)
	 */
	readonly kind:          'dir' | 'file' | 'entity';
	/** For `dir` / `file`, the absolute path. For `entity`, the
	 *  entity's containing file. */
	readonly path:          string;
	/** For entity hits, the entity's SHA-32 id. */
	readonly entityId?:     string;
	readonly name:          string;
	/** Composite match score in [0, 1]. Higher = better match. */
	readonly score:         number;
	/** Score breakdown, for debugging + synthesizer explainability. */
	readonly diagnostics:   {
		readonly tokenMatch?:      number;   // token-level path/name match
		readonly pathDepth?:       number;   // shallower paths score higher
		readonly graphInDegree?:   number;   // popular modules score higher
		readonly vectorSimilarity?: number;  // vector fallback
	};
}

export interface ConceptResolveOutput {
	readonly type:  'concept.resolve';
	readonly query: string;
	/** Ranked by score desc. Cap ~20. */
	readonly hits:  readonly ConceptHit[];
}

/** Compact profile of a module (directory-level) or a file. */
export interface ModuleProfile {
	readonly path:          string;
	/** kind='file' when the profile targets a single source file
	 *  rather than a directory. */
	readonly kind:          'dir' | 'file';
	readonly subdirs:       readonly string[];
	readonly filesInDir:    readonly {
		readonly file:      string;
		readonly language:  string;
		readonly bytes:     number;
		readonly kind:      string;
	}[];
	/** Names exported via `__all__` (Python), `export` (TS), etc.
	 *  Extracted from index / init files' entity list. */
	readonly exports:       readonly string[];
	/** Files with recognisable entry-point signatures (main handlers,
	 *  service registrations, HTTP routes, __init__.py, etc.). */
	readonly entrypoints:   readonly string[];
	/** Total entity count under this path (functions + classes +
	 *  methods + types + variables), non-artefact. */
	readonly entityCount:   number;
	/** Rough size in bytes across code files. */
	readonly totalBytes:    number;
}

export interface ModuleProfileOutput {
	readonly type:    'module.profile';
	readonly profile: ModuleProfile;
}

/** Symbol.locate hit -- one entity that matches the name lookup. */
export interface SymbolHit {
	readonly entityId:  string;
	readonly name:      string;
	readonly kind:      string;
	readonly file:      string;
	readonly startLine: number;
	readonly endLine:   number;
	readonly signature?: string;
}

export interface SymbolLocateOutput {
	readonly type:  'symbol.locate';
	readonly names: readonly string[];
	readonly hits:  readonly SymbolHit[];
}

/** Import-graph summary for a module or file. */
export interface ImportGraphSummary {
	readonly target:      string;
	/** Top-K importers (files that import from `target`), ranked by
	 *  edge count. */
	readonly topImporters:   readonly { file: string; edges: number }[];
	/** Top-K importees (files `target` imports from). */
	readonly topImportees:   readonly { file: string; edges: number }[];
	readonly totalInDegree:  number;
	readonly totalOutDegree: number;
}

export interface ImportGraphOutput {
	readonly type:    'import.graph';
	readonly summary: ImportGraphSummary;
}

// ---------------------------------------------------------------------------
// Doc-side exploration output payloads (Phase 2)
// ---------------------------------------------------------------------------

/** One retrieved section from doc.mention. */
export interface DocMentionHit {
	readonly entityId:  string;
	readonly file:      string;
	readonly heading:   string;
	readonly kind:      'document' | 'section' | 'config';
	readonly score:     number;
	readonly preview?:  string;
}

export interface DocMentionOutput {
	readonly type:    'doc.mention';
	readonly subject: string;
	readonly hits:    readonly DocMentionHit[];
}

/** One decision recorded in a doc + its citation. Preserves
 *  wording verbatim -- see prompts/analyze/docs.decision-trace.system.md. */
export interface DocDecisionRecord {
	readonly decision:       string;
	readonly sourceEntityId: string;
	readonly file:           string;
	readonly heading:        string;
	readonly rationale:      string;
}

export interface DocDecisionTraceOutput {
	readonly type:                  'doc.decision.trace';
	readonly topic:                 string;
	readonly decisions:             readonly DocDecisionRecord[];
	readonly notFoundNote:          string;
	readonly retrievedSectionCount: number;
}

/** One constraint stated in a doc + its citation. Preserves MUST /
 *  SHALL / HARD RULE language verbatim. */
export interface DocConstraintRecord {
	readonly constraint:     string;
	readonly kind:           'must' | 'should' | 'may' | 'hard-rule' | 'forbidden' | 'invariant';
	readonly sourceEntityId: string;
	readonly file:           string;
	readonly heading:        string;
	readonly rationale:      string;
}

export interface DocConstraintEnumerateOutput {
	readonly type:                  'doc.constraint.enumerate';
	readonly subject:               string;
	readonly constraints:           readonly DocConstraintRecord[];
	readonly notFoundNote:          string;
	readonly retrievedSectionCount: number;
}

// ---------------------------------------------------------------------------
// Code-side exploration output payloads (Phase 3)
// ---------------------------------------------------------------------------

/** One caller of a symbol -- entity + file-position anchor. Preserves
 *  the same shape as SymbolHit so the synthesizer can render callers
 *  next to definitions uniformly. */
export interface UsageExampleHit {
	readonly entityId:  string;
	readonly name:      string;
	readonly kind:      string;
	readonly file:      string;
	readonly startLine: number;
	readonly endLine:   number;
	readonly signature?: string;
}

export interface UsageExampleOutput {
	readonly type:       'usage.example';
	/** The symbol whose callers we're enumerating. Populated from
	 *  params (name OR entityId) so the synthesizer can label the
	 *  section without re-reading params. */
	readonly subject:    string;
	/** entityId of the resolved target, when known. undefined when
	 *  the runner couldn't uniquely resolve a name to an id. */
	readonly targetEntityId?: string;
	readonly callers:    readonly UsageExampleHit[];
	/** Total 1-hop callers before topK truncation. */
	readonly totalCallers: number;
}

/** Class-hierarchy record: one class + its supertypes / subtypes /
 *  interfaces. */
export interface ClassHierarchyNode {
	readonly entityId:  string;
	readonly name:      string;
	readonly kind:      string;
	readonly file:      string;
	readonly startLine: number;
	/** Direct supertypes (INHERITS out). */
	readonly extendsList:    readonly {
		readonly entityId?: string;
		readonly name:      string;
		readonly file?:     string;
	}[];
	/** Direct interfaces / mixins (IMPLEMENTS out). */
	readonly implementsList: readonly {
		readonly entityId?: string;
		readonly name:      string;
		readonly file?:     string;
	}[];
	/** Direct subclasses (INHERITS in). */
	readonly subclasses:     readonly {
		readonly entityId:  string;
		readonly name:      string;
		readonly file:      string;
	}[];
	/** Direct implementers (IMPLEMENTS in). */
	readonly implementers:   readonly {
		readonly entityId:  string;
		readonly name:      string;
		readonly file:      string;
	}[];
}

export interface ClassHierarchyOutput {
	readonly type:    'class.hierarchy';
	readonly subject: string;
	readonly nodes:   readonly ClassHierarchyNode[];
	/** notFoundNote is populated when the runner could not resolve
	 *  `subject` to any concrete class entity. */
	readonly notFoundNote: string;
}

/** One candidate module that (per the reuse-check LLM) already
 *  provides the queried capability. Each candidate carries a
 *  verdict + a short excerpt so the synthesizer can cite it. */
export interface CapabilityReuseCandidate {
	readonly path:            string;
	readonly moduleName:      string;
	/** LLM's verdict on whether this module already delivers the
	 *  requested capability. */
	readonly verdict:         'clear-match' | 'partial-match' | 'unrelated';
	/** 1-2 sentence rationale, verbatim from the LLM. */
	readonly rationale:       string;
	/** Representative entity names lifted from the module profile
	 *  that support the verdict. Small (<=5). */
	readonly evidenceEntities: readonly string[];
	/** Score from the underlying concept.resolve, kept for the
	 *  synthesizer's ranking display. */
	readonly conceptScore:    number;
}

export interface CapabilityReuseCheckOutput {
	readonly type:       'capability.reuse-check';
	readonly capability: string;
	readonly candidates: readonly CapabilityReuseCandidate[];
	/** Populated when the underlying concept.resolve returned zero
	 *  hits (nothing to check). */
	readonly notFoundNote: string;
	/** Populated when the LLM narrow pass could not be run (Ollama
	 *  unavailable, prompt missing). Synthesizer renders a diagnostic
	 *  but the candidates list still surfaces the concept.resolve
	 *  hits as `unrelated` placeholders. */
	readonly llmSkipReason?: string;
}

// ---------------------------------------------------------------------------
// Convention / config / data-model / test-locate output payloads (Phase 4)
// ---------------------------------------------------------------------------

/** Naming-case buckets used across every naming axis. `mixed` fires
 *  when no single bucket dominates -- the synthesizer surfaces the
 *  breakdown so the reader can make a judgement call. */
export type NamingCase = 'snake_case' | 'camelCase' | 'PascalCase' | 'kebab-case' | 'mixed' | 'unknown';

/** Test-file naming convention. `none` fires when the module carries
 *  no discernible test files at all. */
export type TestFileConvention = 'test_*' | '*_test' | '*.spec' | '*.test' | 'inline' | 'none' | 'mixed';

export interface ConventionNamingSchema {
	readonly functions:      NamingCase;
	readonly functionsBreakdown: Readonly<Record<string, number>>;
	readonly classes:        NamingCase;
	readonly classesBreakdown:   Readonly<Record<string, number>>;
	readonly files:          NamingCase;
	readonly filesBreakdown:     Readonly<Record<string, number>>;
	readonly testFiles:      TestFileConvention;
	/** How many entities each axis was computed from -- helps the
	 *  synthesizer decide whether a call is confident or a coin
	 *  flip. */
	readonly sampleSizes: {
		readonly functions: number;
		readonly classes:   number;
		readonly files:     number;
	};
}

/** One base-class idiom the module leans on: a supertype + its
 *  in-module subclasses. Ranked by subclass count. */
export interface ConventionBaseClassIdiom {
	readonly baseName:                  string;
	readonly baseEntityId?:             string;
	readonly subclassCount:             number;
	readonly representativeSubclasses:  readonly string[];
}

export interface ConventionDetectOutput {
	readonly type:              'convention.detect';
	readonly path:              string;
	readonly namingSchema:      ConventionNamingSchema;
	readonly baseClassIdioms:   readonly ConventionBaseClassIdiom[];
	/** Count of names starting with `_` but NOT `__` (single-underscore
	 *  private convention). Zero-signal on projects that don't lean on
	 *  the underscore convention -- surfaced as-is; the synthesizer
	 *  can suppress. */
	readonly privatePrefixCount: number;
	/** Count of names bracketed by `__` (dunder / magic-method
	 *  convention -- common in Python). */
	readonly dunderMethodCount:  number;
	/** Total non-artefact entities considered under `path`. Helps the
	 *  reader gauge confidence. */
	readonly totalEntities:      number;
	/** Populated when the runner could not resolve `path` to a
	 *  registered file/directory. Empty when the run succeeded. */
	readonly notFoundNote:       string;
}

/** How a config-key hit was classified by the runner. Deterministic
 *  file-extension heuristic; `unknown` is legitimate. */
export type ConfigTraceRole = 'definition' | 'usage' | 'default' | 'unknown';

export interface ConfigTraceHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
	readonly role: ConfigTraceRole;
}

export interface ConfigTraceOutput {
	readonly type:      'config.trace';
	readonly key:       string;
	readonly hits:      readonly ConfigTraceHit[];
	readonly truncated: boolean;
	readonly backend:   'ripgrep' | 'node';
	readonly root:      string;
}

/** One test file or test entity that likely covers the subject. */
export interface TestLocateHit {
	readonly file:      string;
	/** entityId when the hit is an entity (a test function or class);
	 *  undefined when the hit is a bare file whose path matched. */
	readonly entityId?: string;
	readonly name:      string;
	readonly startLine?: number;
	readonly kind:      'file' | 'function' | 'class' | 'method';
}

export interface TestLocateOutput {
	readonly type:    'test.locate';
	readonly subject: string;
	readonly hits:    readonly TestLocateHit[];
	readonly notFoundNote: string;
}

/** A field / attribute / typed property of a data-model entity.
 *  Emitted per-node in DataModelTrace so the synthesizer can list
 *  the shape without re-running a per-entity probe. */
export interface DataModelField {
	readonly name:  string;
	readonly type?: string;
}

/** One node in the traced data model -- the class + its supers +
 *  subs + top usage sites. */
export interface DataModelNode {
	readonly entityId:   string;
	readonly name:       string;
	readonly kind:       string;
	readonly file:       string;
	readonly startLine:  number;
	readonly fields:     readonly DataModelField[];
	readonly extendsList:    readonly { entityId?: string; name: string; file?: string }[];
	readonly subclasses:     readonly { entityId: string; name: string; file: string }[];
	readonly topCallers:     readonly { entityId: string; name: string; file: string; line: number }[];
}

export interface DataModelTraceOutput {
	readonly type:         'data-model.trace';
	readonly subject:      string;
	readonly nodes:        readonly DataModelNode[];
	readonly notFoundNote: string;
}

// ---------------------------------------------------------------------------
// Data-driver output payloads (Phase 5)
// ---------------------------------------------------------------------------

/** One registered data-driver connection surfaced from the pool. */
export interface DbConnectionSummary {
	readonly id:     string;
	readonly kind:   string;
	readonly family: 'rdbms' | 'kv' | 'file';
	readonly label:  string;
	/** Populated for file-family connections (single file or
	 *  directory-as-table); omitted for rdbms + kv. */
	readonly path?:  string;
}

export interface DbConnectionsListOutput {
	readonly type:        'db.connections.list';
	readonly connections: readonly DbConnectionSummary[];
	/** Populated when no connections are registered for the active
	 *  repo. Synthesizer renders this as an honest "0 sources"
	 *  bundle instead of fabricating one. */
	readonly notFoundNote: string;
}

/** One entry in a connection's tables / namespaces listing. `schema`
 *  is optional so KV namespaces (no schema concept) fit the same
 *  wire shape. */
export interface DbTableSummary {
	readonly name:   string;
	readonly schema?: string;
	/** rdbms: 'table' / 'view'; kv: 'namespace'; file: 'file'. Kept
	 *  broad so future driver families slot in. */
	readonly kind:   string;
	/** Optional row-count / key-count reported by the driver when
	 *  cheap to obtain. Undefined otherwise. */
	readonly rowEstimate?: number;
}

export interface DbTablesListOutput {
	readonly type:         'db.tables.list';
	readonly connectionId: string;
	readonly family:       'rdbms' | 'kv' | 'file';
	readonly tables:       readonly DbTableSummary[];
	readonly truncated:    boolean;
	readonly notFoundNote: string;
}

/** One column / field of a described target. */
export interface DbColumnSummary {
	readonly name:        string;
	readonly type:        string;
	readonly nullable?:   boolean;
	readonly primaryKey?: boolean;
	readonly foreignKey?: { table: string; column: string };
}

export interface DbTableDescribeOutput {
	readonly type:         'db.table.describe';
	readonly connectionId: string;
	readonly target:       string;
	readonly family:       'rdbms' | 'kv' | 'file';
	readonly columns:      readonly DbColumnSummary[];
	/** For kv namespaces: sample keys / value-shape metadata is not
	 *  described column-wise; we carry a short human-facing
	 *  descriptor here. Empty for rdbms. */
	readonly shapeSummary: string;
	readonly notFoundNote: string;
}

// ---------------------------------------------------------------------------
// Infra output payload (Phase 5)
// ---------------------------------------------------------------------------

/** Broad infra-artefact family recognised in the indexed graph. */
export type ManifestFamily =
	| 'kubernetes'
	| 'helm'
	| 'terraform'
	| 'docker'
	| 'ci'
	| 'other';

export interface ManifestHit {
	readonly file:       string;
	readonly family:     ManifestFamily;
	/** For kubernetes / helm: the `kind:` field extracted from the
	 *  entity metadata (Deployment / Service / ConfigMap / ...).
	 *  Undefined when the family doesn't declare a kind. */
	readonly resourceKind?: string;
	readonly name?:      string;
	readonly entityId?:  string;
}

export interface ManifestsLocateOutput {
	readonly type:      'manifests.locate';
	readonly hits:      readonly ManifestHit[];
	readonly families:  Readonly<Record<ManifestFamily, number>>;
	readonly notFoundNote: string;
}

// ---------------------------------------------------------------------------
// freeform.probe output payload (Phase 6)
// ---------------------------------------------------------------------------

/**
 * The freeform.probe exploration wraps the legacy tool-loop primitive
 * (`runShaperToolLoop`) so the target's existing 40-turn shaper prompt
 * runs as ONE exploration inside an otherwise-deterministic plan.
 * Phase 6 uses this as the escape hatch when an intent falls outside
 * every deterministic recipe. Because the tool loop already produces
 * a complete `AnalyzeContextBundle` shape, the runner returns the
 * raw layers verbatim -- the synthesizer treats them as-is (no
 * further stitching) when `freeform.probe` is the ONLY exploration
 * in a plan, and merges them selectively when it isn't.
 */
export interface FreeformProbeOutput {
	readonly type:    'freeform.probe';
	readonly purpose: string;
	/** Which target's legacy prompt drove the tool loop -- carried so
	 *  the synthesizer knows which existing prompt shaped the layers. */
	readonly shaperId: 'code' | 'docs' | 'data' | 'infra' | 'generic';
	/** The bundle content the tool loop emitted. `meta` is stamped by
	 *  the pipeline caller from framework-side info; the runner emits
	 *  the seven layer strings verbatim. */
	readonly rawBundle: {
		readonly system:    string;
		readonly focus:     string;
		readonly summary:   string;
		readonly structure: string;
		readonly surface:   string;
		readonly artefacts: string;
		readonly upstream:  string;
	};
	/** Actual tool-call count the loop performed -- carried into
	 *  `meta.toolCalls` when this exploration drives the whole
	 *  bundle. */
	readonly toolCallCount: number;
	/** Non-empty when the tool loop hit its `maxToolTurns` cap
	 *  without the model settling; the synthesizer surfaces this as
	 *  a Diagnostics note. */
	readonly exhaustedNote: string;
}

// ---------------------------------------------------------------------------
// Content-search exploration output payload (Phase 3.1)
// ---------------------------------------------------------------------------

/** One line-level match from search.text -- the file, line number,
 *  and the raw line text (up to 500 chars, matching the underlying
 *  search_grep tool's cap). */
export interface SearchTextHit {
	readonly file: string;
	readonly line: number;
	readonly text: string;
}

export interface SearchTextOutput {
	readonly type:    'search.text';
	readonly pattern: string;
	readonly hits:    readonly SearchTextHit[];
	/** True when the underlying grep hit its result cap. Synthesizers
	 *  should surface this in Diagnostics so the reader knows a wider
	 *  search may exist. */
	readonly truncated: boolean;
	/** Which backend produced the hits -- ripgrep (fast, respects
	 *  .gitignore) or the Node fallback (slower, no .gitignore). Kept
	 *  for synthesizer-side transparency. */
	readonly backend:   'ripgrep' | 'node';
	/** Absolute root under which the search ran. */
	readonly root:      string;
}

/** Placeholder for the not-yet-implemented types. Executor writes
 *  this + an errorCode when a decomposer emits an unsupported
 *  exploration in Phase 1. Downstream (synthesizer) renders it as
 *  a diagnostic + continues. */
export interface UnsupportedExplorationOutput {
	readonly type:      'unsupported';
	readonly requested: ExplorationType;
	readonly reason:    string;
}

export interface FailedExplorationOutput {
	readonly type:      'failed';
	readonly requested: ExplorationType;
	readonly errorCode: string;
	readonly message:   string;
}

export type ExplorationOutput =
	| ConceptResolveOutput
	| ModuleProfileOutput
	| SymbolLocateOutput
	| ImportGraphOutput
	| DocMentionOutput
	| DocDecisionTraceOutput
	| DocConstraintEnumerateOutput
	| UsageExampleOutput
	| ClassHierarchyOutput
	| CapabilityReuseCheckOutput
	| SearchTextOutput
	| ConventionDetectOutput
	| ConfigTraceOutput
	| TestLocateOutput
	| DataModelTraceOutput
	| DbConnectionsListOutput
	| DbTablesListOutput
	| DbTableDescribeOutput
	| ManifestsLocateOutput
	| FreeformProbeOutput
	| UnsupportedExplorationOutput
	| FailedExplorationOutput;

// ---------------------------------------------------------------------------
// Execution shape
// ---------------------------------------------------------------------------

/**
 * The executor runs each exploration + returns a keyed result map.
 * Order is preserved (mirrors ExplorationPlan.explorations) so the
 * synthesizer can iterate deterministically.
 */
export interface ExecutedExploration {
	readonly exploration: Exploration;
	readonly output:      ExplorationOutput;
	readonly cached:      boolean;
	readonly elapsedMs:   number;
}

export interface ExecutedPlan {
	readonly plan:        ExplorationPlan;
	readonly results:     readonly ExecutedExploration[];
	readonly totalMs:     number;
	readonly totalCached: number;
}

// ---------------------------------------------------------------------------
// Runner interface
// ---------------------------------------------------------------------------

/**
 * Per-type runner. Each runner:
 *   - reads its params (already validated by the executor at dispatch)
 *   - reads any dependent outputs via `readDep`
 *   - returns a typed ExplorationOutput
 *
 * Runners MUST NOT throw for tool-side failures. Wrap errors in a
 * `FailedExplorationOutput` so downstream stages see a structured
 * failure rather than an exception. Runtime crashes (assertion
 * failures, LMDB txn errors) still throw as usual.
 */
export interface ExplorationRunnerContext {
	readonly runId:       string;
	readonly repoPath:    string;
	readonly closureRepos: readonly string[];
	/** Read a prior exploration's output by id. Returns undefined
	 *  when the id doesn't resolve (should not happen if the
	 *  decomposer emitted a valid dependsOn). */
	readonly readDep: (id: string) => ExplorationOutput | undefined;
	/** Repo-scoped `.gitignore` filter. Runners that walk the
	 *  filesystem via readdirSync MUST consult this before yielding
	 *  paths so build artefacts (out/, dist/, target/, .next/, ...)
	 *  don't leak into structural bundles. See
	 *  analyze/context/repo-ignore-filter.ts. */
	readonly ignoreFilter: import('../context/repo-ignore-filter.js').RepoIgnoreFilter;
}

export type ExplorationRunner = (
	exp: Exploration,
	ctx: ExplorationRunnerContext,
) => Promise<ExplorationOutput>;
