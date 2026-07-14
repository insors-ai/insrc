# Analyze framework — overall design

## What "analyze" means here

Analyze is an **understanding request**, not a review request. The output answers "what is this and how does it work" with citation-backed claims; it does not score, grade, recommend changes, or judge quality.

Three top-level targets:

- **Code** — repositories / modules / specific files. Understanding their functional surface, architectural structure, dependencies, and usage.
- **Data** — datasets / databases / files / streams. Understanding schemas, distributions, relationships, format conventions, and PII / sensitivity surface.
- **Infrastructure** — what's deployed and how. IaC, container manifests, CI/CD, service topology — as detected in the repo, with the LLM responsible for interpreting beyond what static parsing surfaces.

Each target shares the same framework (classify → context → plan → iterate → aggregate). The differences live in the per-target task templates, the discovery strategy, the citation primitives, and the report shape.

## Non-goals (Phase 1)

- No code review / code quality scoring
- No remediation / refactoring suggestions
- No diff-mode (compare-two-states) — single-state understanding only
- No automatic write-back to the analyzed system
- No live cloud-resource introspection (deferred to Phase 2)

## Where it lives

Built on the post-cleanup insrc:

- LLM access: `OllamaProvider` (local) + `CliProvider` (claude + codex subprocesses) only. No direct cloud REST.
- Storage: LMDB graph (entities + relations) + Lance vectors (entity / artifact / response-segment embeddings). The indexer's existing graph is the primary code citation source.
- Tools: the surviving `daemon/tools/` registry (~110 capability wrappers — file, git, shell, http, web, gh, k8s, pkg, ssh, test, notify, search, graph, db, data, code, cloud).
- New tree: `src/insrc/analyze/`
- Persisted output: `~/.insrc/analyze/<run-id>/`
- Surfaces: daemon RPC `analyze.run` (stream) + `analyze.list` + `analyze.get` + `analyze.delete`, CLI `insrc analyze` command, IDE pane TBD.

## The analyze contract

### Scope buckets (size → depth policy, **inverted**)

The classifier produces one of five buckets. **The relationship between size and depth is inverted**: bigger scope → more structural, less per-unit; smaller scope → more detailed, more per-unit. This is the only way to honour the accuracy-primary principle for both extremes (you cannot read every function in a 2000-file repo, but you can describe its architecture; you can fully unpack a 5-file module, but a structural-only pass would waste the budget).

| Bucket | Trigger heuristic | Depth policy |
|---|---|---|
| **XS** | Single function / file / table / manifest / connection | **Maximally detailed.** ~3-8 tasks total. Full surface extraction, control-flow / data-flow walk, every input + output, every external call. Aggregate is exhaustive — no "out of scope" sections. |
| **S**  | Single module / small directory (≤ 20 files) / single small dataset | **Detailed per-unit.** ~10-20 tasks. Per-file or per-table extraction; complete dependency map; full integration surface. Aggregate is exhaustive at the unit level + one cross-unit synthesis. |
| **M**  | Subsystem / mid-sized package (20-200 files) / single DB / one IaC stack | **Component-level.** ~20-40 tasks. Per-component surface + integration; sampled deep-dives on the central components (planner picks ~5-10 via centrality / size heuristic); cross-component synthesis. |
| **L**  | Full repo / multi-module (200-2000 files) / data warehouse / multi-stack infra | **Architectural.** ~30-60 tasks. Layered: family detection → per-family structural summary → cross-family interaction map. No per-function walks; per-module summaries only. |
| **XL** | Multi-repo / org-wide / federated data / multi-cluster | **Topological.** ~40-80 tasks. Pre-pass partitions the request into per-partition planner-template tasks (each typically opens an L-bucket child Plan); each child produces a structural summary; final root-Plan task is a cross-partition topology / dependency map. No per-module detail in the top-level report — it lives in the child Plans' reports, which are persisted as siblings under the same Run. |

The bucket is observable: the user sees `scope=L`, the planner stamps it on every task, every output JSON carries it. When the user surfaces a small target (a function) but their question is structural ("how does this fit into the codebase") the bucket stays **XS** and the planner emits a `cross-reference` task that walks outward instead of upgrading the bucket — intent stays scoped, breadth comes from outward walks, not from re-classification.

### Intent

The classifier produces:

```ts
{
  target: 'code' | 'data' | 'infra' | 'generic';
  scope: 'XS' | 'S' | 'M' | 'L' | 'XL';
  focused: boolean;                    // generic-question vs focused-question
  focus?: string;                      // when focused, the concrete question
                                       // ("messaging patterns", "PII", "where do
                                       //  cron jobs live", ...)
  scopeRef: {                          // what the user pointed at
    kind: 'repo' | 'module' | 'file' | 'symbol' | 'connection' | 'manifest-dir' | 'workspace';
    value: string;                     // path / id / connection name
  };
  reasoning: string;                   // 1-2 sentences explaining the bucket choice
}
```

Two orthogonal axes:

- **`target`** dispatches to a per-target shaper (and per-target template family). `target='generic'` means the request is multi-lens — typically "analyze this repo" against a workspace that has code + data + infra surfaces — and routes to the **generic-shaper** for the run-level bundle. Task-level dispatch always routes by task family namespace (`code.* → code-shaper`, `data.* → data-shaper`, `infra.* → infra-shaper`), so generic-target runs produce per-task contexts via the appropriate per-target shaper.
- **`focused`** controls the planner's narration: generic-question (`focused: false`) → full understanding map for the chosen target. Focused-question (`focused: true`) → map narrowed to the focus, with out-of-focus sections collapsed.

### Citations — canonical shape

Citations are mandatory on every claim. The framework defines a **base union** that every target supports, and per-target extensions that add target-specific shapes:

```ts
// Base — every target supports these
type BaseCitation =
  | { kind: 'source';  file: string; lineStart: number; lineEnd: number;
                                     repoPath?: string }
  | { kind: 'entity';  entityId: string }      // u64 node in the indexer's LMDB graph
  | { kind: 'doc';     url: string;            anchor?: string };

// Per-target extensions
type Citation =
  | BaseCitation
  | DataCitation        // RdbmsCitation | KvCitation | FileCitation — see data doc
  // (infra + code use BaseCitation only in Phase 1)
```

Base kinds:

- **source** — the original artifact and the byte range that backs the claim. Validated by re-reading the file + asserting the span exists. Heavily used by code + infrastructure verticals.
- **entity** — points at a node the indexer materialized. Cheaper to validate (just a graph lookup) and stable across line renumbering. Used by code; used by infrastructure for the occasional Makefile / package.json script cross-reference.
- **doc** — external reference (RFC, package docs, vendor SDK page). Not validated by the framework; surfaced distinctly so the reader knows they aren't first-party-verified.

Per-target extensions:

- **Data vertical** adds `RdbmsCitation` / `KvCitation` / `FileCitation` — discriminated by driver family, validated by re-querying the live source through the data-driver pool (no separate LMDB sub-DB; live re-query is the validator). See `analyze-framework-data.md`.
- **Infra vertical** uses base citations only in Phase 1; Phase 2 may add a `cloud-resource` citation kind once live cloud SDK introspection lands.
- **Code vertical** uses base citations only.

Every typed task output carries `citations: Citation[]` per claim; the aggregator chains these into the final report. A claim with zero citations is rejected by the per-task validator and bounces back to the LLM as a retry feedback note. Per-target extensions carry their own validators dispatched on `kind`.

### Output shape

Every task emits a typed JSON payload conforming to its template's schema. The aggregator stitches per-task JSON into a target-specific report (see per-target docs). Final user-visible output formats:

- **JSON** (always written) — the raw aggregate, addressable for downstream tools.
- **Markdown** (default render) — human-readable, citations linked back to source files / entity views / external URLs.
- **HTML** (opt-in) — same content as MD, rendered standalone (no JS) with code-block highlighting + collapsible sections.
- **PDF** (opt-in, on top of HTML) — for archival / sharing.

## Architectural overview

```
   user request                          ┌────────────────────────────────┐
   (text + scopeRef) ──────────────────▶ │ Classify                       │
                                         │   target / scope / intent      │
                                         └────────────────────────────────┘
                                                       │
                                                       ▼
                                         ┌────────────────────────────────┐
                                ┌──────▶ │ Context Builder                │
                                │        │   per-target shaper            │
                                │        │   layered budgeted bundle      │
                                │        └────────────────────────────────┘
                                │                      │
                                │                      ▼
                                │        ┌────────────────────────────────┐
                                │        │ Plan Builder                   │
                                │        │   emits ONE flat Plan          │
                                │        │   tasks ∈ {leaf, planner}      │
                                │        └────────────────────────────────┘
                                │                      │
                                │                      ▼
                                │        ┌────────────────────────────────┐
                                │        │ Task Executor                  │
                                │        │   for each task in order:      │
                                │        │     build task-scoped context  │
                                │        │     dispatch by template kind: │
                                │        │       leaf    → completeStruct │ ─┐
                                │        │       planner → ┐              │  │
                                │        │     validate citations         │  │
                                │        │     persist output             │  │
                                │        └────────────────────────────────┘  │
                                │                                            │
                                │  ◀─── recurse on planner-template task ────┘
                                │
                                │        ┌────────────────────────────────┐
                                └──────  │ Aggregator (per Plan)          │
                                         │   stitches that Plan's outputs │
                                         │   into a report value          │
                                         └────────────────────────────────┘
                                                       │
                                                       ▼
                                         ┌────────────────────────────────┐
                                         │ Renderer                       │
                                         │   root Plan's report -> MD     │
                                         │   opt-in: HTML / PDF           │
                                         └────────────────────────────────┘
                                                       │
                                                       ▼
                                  ~/.insrc/analyze/<run-id>/
                                    ├── meta.json
                                    ├── plan.json                          (root Plan)
                                    ├── tasks/
                                    │     t01.json                         (leaf)
                                    │     t02/                             (planner)
                                    │       task.json
                                    │       plan.json
                                    │       tasks/
                                    │         t02.t01.json
                                    │         t02.t02/                     (planner, deeper)
                                    │           ...
                                    │     ...
                                    │     tNN.json                         (root aggregator)
                                    ├── report.md
                                    └── report.html (opt-in)
```

The recursion is shown by the arrow back to Context Builder. Every planner-template task triggers the same pipeline (context → plan → execute → aggregate) one level deeper, with its child Plan's terminal aggregator output becoming the value materialized at the parent task's slot.

## Flow

### 1. Build classification context

Before the classifier runs, the Context Builder's **classification-shaper** produces a small target-agnostic bundle: registered repos with primary language, declared data connections, detected IaC dirs, and a kind-count per surface. This bundle gives the classifier enough workspace signal to pick a target + a scope bucket without committing to a per-target shaper before the target is known. See [`analyze-context-builder.md`](analyze-context-builder.md) for the bundle shape.

### 2. Classify

LLM call (small, local Ollama) emits the `{ target, scope, focused, focus?, scopeRef, reasoning }` shape above, consuming the classification-context bundle from step 1. The user message + any path the user surfaced (e.g. `/analyze src/foo.ts`) is the input. Validation: target ∈ enum, scope ∈ enum, scopeRef.kind matches target (a `connection` scope on a `code` target gets rejected). `target` can be `generic` when the request is broad ("analyze this repo") and the planner is expected to dispatch sub-plans across multiple per-target shapers.

If `scopeRef.value` doesn't resolve (e.g. path doesn't exist) the classifier reruns with a corrective note. After two failures, the analyze run aborts with a clear `scopeRef-unresolved` error.

### 3. Scope warning

Immediately after classification and before context-building begins, the framework emits a one-shot informational warning over the `analyze.run.start` IPC when `scope ∈ { L, XL }`:

```
This run is classified <scope> scope; expect significant token consumption
from your CLI provider's quota during planning + task execution.
```

The warning is **dismissable, never blocks**, and surfaces in the IDE's notification area + the CLI stdout. The user has no explicit recourse — they manage their own LLM budgets (per the project's accuracy-primary principle, the framework does not cap or compress to save tokens). The warning fires exactly once per run; it does not re-fire when nested planner-template tasks spawn child Plans whose own scope is L/XL.

### 4. Build run context

The per-target Context Builder (see [`analyze-context-builder.md`](analyze-context-builder.md)) produces the run-level bundle. Dispatch is on `intent.target`: `code → code-shaper`, `data → data-shaper`, `infra → infra-shaper`, `generic → generic-shaper`. This is the context the **Plan Builder** sees.

### 5. Plan

The Plan Builder (see `analyze-plan-builder.md`) takes the run-level bundle + the catalog of typed task templates and emits a Plan Task. Plan Task shape:

```ts
{
  goal: string;                         // 1 sentence
  scope: 'XS'|'S'|'M'|'L'|'XL';
  target: 'code'|'data'|'infra'|'generic';
  tasks: PlannedTask[];                 // serial-execution order
  reasoning: string;
}

interface PlannedTask {
  taskId: string;                       // stable within this run, e.g. 't01'
  template: string;                     // template id, e.g. 'code.surface.functional'
  params: Record<string, unknown>;      // template-specific
  outputs: string[];                    // names this task produces (e.g. ['surface'])
  dependsOnOutputs?: string[];          // names of upstream task outputs
                                        // it consumes
}
```

Invariants the validator enforces:
- `tasks` is non-empty
- Every `template` is in the catalog
- `params` validates against the template's input schema
- `taskId` is unique and stable
- `dependsOnOutputs` only references outputs declared by an earlier task in the list (DAG over outputs, but the LIST itself is a flat serial schedule)
- No task nests another task. The Plan Task is one level deep. (Per-target verticals may chain plans across iterations — see "Iteration" below — but a single Plan Task is flat.)

### 6. Task list — iterate

For each task in the current Plan's `tasks`, in order:

1. **Build task-scoped context** — the Context Builder runs again, this time with the task template's hints + the outputs of previously-completed tasks the task declared as inputs.
2. **Dispatch by template kind:**
   - **Leaf template** → render prompts, call `provider.completeStructured(messages, schema, opts)`, validate, persist `<taskId>.json`.
   - **Planner template** → invoke the Plan Builder recursively. The child Plan executes inline, in the same Run, with its results persisted under this task's directory. The parent task's output records the child plan's identity (path + summary). Execution returns control to the parent's iterator when the child Plan's terminal aggregator completes.
3. **Validate** — citation validator (re-read source / look up entities / mark `doc` citations as unverified). On failure → retry with feedback note up to template-specified `maxAttempts` (default 2). On hard failure → write a stub output that records the failure reason; downstream tasks that depended on it short-circuit with a `dependency-unavailable` claim.
4. **Persist** — the task output lands at `<task-path>.json`. If the task spawned a child Plan, the child's full tree lives under `<task-path>/` alongside.

**Nesting rule (load-bearing).** **Within a single Plan**, the task list is flat — no task contains another task. **Across Plans**, however, the Run accumulates a tree: a leaf task is a leaf in the tree; a planner-template task is an internal node whose subtree is its child Plan. Every node carries a stable path identifier (`t02` → `t02.t05` → `t02.t05.t01`) and a `parentTaskPath` field, so the full provenance from any leaf back to the root Plan is reconstructable on disk without a separate index.

The aggregator rolls up bottom-up: each Plan's terminal aggregator produces this Plan's report; the parent task that spawned this Plan consumes that report as its output value; the parent Plan's aggregator stitches those values into the parent report. The Run's final report is the root Plan's aggregator output.

### 7. Aggregate

The aggregator reads all task outputs in dependency order and stitches the target-specific report shape (see per-target docs). It:

- de-dupes citations across tasks
- chains task-output → claim provenance
- collapses out-of-focus sections when the run was focused
- renders MD (always) + HTML / PDF (opt-in)

## Task model

### Template kinds

Templates come in two kinds:

- **Leaf template** — produces a final structured output value via one `provider.completeStructured` call. The task's output is the value the leaf produces.
- **Planner template** — produces a child Plan via a recursive Plan Builder invocation. The task's output is the value the child Plan's terminal aggregator produces (always materialized under the name `report`).

The Plan Builder sees both kinds in the catalog and picks whichever fits the depth policy. A planner-template task is the framework's way to say "I know this needs deeper analysis, but I don't yet have the context to enumerate the sub-tasks — defer planning until the parent's siblings have run."

### Template definition

Every template is a TypeScript module under `src/insrc/analyze/templates/<target>/<id>.ts` exporting:

```ts
export const template: AnalyzeTaskTemplate = {
  id:              'code.surface.functional',
  target:          'code',
  family:          'surface',
  kind:            'leaf',           // or 'planner'
  description:     'Extract the functional surface (APIs, exports, endpoints) ' +
                   'of a code unit.',

  // What the template needs from context / params
  inputSchema:     TypeBox<{ scopeRef: ScopeRef; depth: 'shallow' | 'deep' }>,
  consumes:        ['discovery.modules?'],   // optional upstream output names

  // What it produces
  outputSchema:    TypeBox<{                 // leaf templates: per-template payload
    surface: Array<{
      kind: 'function' | 'class' | 'http-endpoint' | 'cli-command' | 'export';
      name: string;
      signature?: string;
      summary: string;
      citations: Citation[];
    }>;
  }>,
  produces:        ['surface'],              // leaf: arbitrary name set
                                              // planner: always exactly ['report']

  // Preconditions -- checked BEFORE the LLM call; fail-fast.
  // Lifted from the legacy data-analyzer's skill preconditions.
  preconditions:   [
    { kind: 'required-tools',       tools: ['code_locate', 'code_describe'],
      reason: 'surface extraction depends on indexer entity lookup' },
    // additional per-target precondition kinds:
    //   { kind: 'connection-family', families: [...] }     -- data target
    //   { kind: 'min-sample-size',   estimator: ..., band: ... } -- data target
    //   { kind: 'family-detected',   families: [...] }     -- infra target
  ],

  // Cross-target dependencies -- declare if this template needs a different
  // target's template to be present (e.g., data drift -> code ORM resolver).
  crossTargetDependencies: [],   // empty for code's surface family

  // Prompts -- parameterized markdown with {{placeholders}}
  // Leaf templates: prompts feed into completeStructured.
  // Planner templates: prompts feed into the recursive Plan Builder call
  //                    (they describe the sub-target + the desired scope).
  systemPrompt:    string,
  userPromptBuild: (input, context) => string,

  // Provider routing
  modelClass:      'medium',           // 'low' | 'medium' | 'high'
  maxAttempts:     2,
};
```

The template catalog is the union of every per-target catalog (see per-target docs). The Plan Builder receives a catalog summary on every plan call — `{ id, kind, description, inputSchema, outputSchema, preconditions, crossTargetDependencies }[]` — so the LLM:

- picks templates by id
- avoids emitting tasks whose `preconditions` won't hold against the resolved scope
- avoids emitting tasks whose `crossTargetDependencies` aren't registered

The validator enforces all three: kind match, precondition satisfaction at run time, cross-target presence at plan time.

### The no-fabrication rule

When a template declares `crossTargetDependencies` and a declared cross-target template isn't in the catalog, the framework's behaviour depends on the dependency's `failure` mode:

- **`hard-fail`** — the parent task fails with `cross-target-unavailable: <missing-template>`; downstream consumers see `dependency-unavailable`. The LLM is never given the chance to invent the missing target's output.
- **`low-confidence`** — the task runs, the LLM is informed in its prompt that the cross-target output is unavailable, and every emitted citation gets auto-stamped to `confidence: 'low'`. The aggregator marks the claim with `crossTargetMissing: [<missing-template>]`.

This rule was introduced by the legacy data-analyzer after a regression where the data-side ORM-drift task ran without the code-side ORM resolver and fabricated a class definition. Generalized to the whole framework because the same failure mode applies to any cross-target reasoning (data referencing code, infra referencing code's Makefile entities, etc.).

### Output dependencies

Tasks declare which named outputs they consume (`consumes`) and produce (`produces`). The aggregator builds a DAG over output names and validates the planner's serial order is a topological linearization.

A consumed output is **always** a JSON value — never a free-text blob. The downstream task's prompt builder reads the producer's output JSON, traverses with a JSON path the template hard-codes, and stamps the value into the prompt.

### Citations enforcement

Each output type whose schema includes `citations: Citation[]` runs through the citation validator before persisting:

- `kind: 'source'` → re-read `file`, assert `lineStart` ≤ `lineEnd`, assert `lineEnd` ≤ file line count. Soft-warn if the span is > 200 lines (suggests over-broad citation).
- `kind: 'entity'` → lookup in the LMDB graph; reject if the entity doesn't exist.
- `kind: 'doc'` → marked `verified: false` in the persisted output, surfaced distinctly in the report.

A task whose output has at least one claim with no citation → validation fails → retry. After `maxAttempts` exhausted, the task lands a stub with `status: 'failed-no-citation'` and downstream consumers short-circuit.

## Working folder layout

The layout mirrors the Plan tree: every Plan is one directory with a `plan.json` + a `tasks/` subdirectory; planner-template tasks become directories of their own, holding their child Plan.

```
~/.insrc/analyze/<run-id>/
  meta.json                — { runId, target, scope, intent, scopeRef,
                               createdAt, completedAt, status, rootPlanPath }
  plan.json                — the root Plan
  context/
    run-bundle.json        — top-level context bundle the root planner saw
  tasks/
    t01.json               — leaf task output
    t01.input.json         — frozen params + context snapshot
    t01.prompts.json       — { system, user } prompts as actually sent
    t01.bundle.json        — task-scoped context bundle

    t02/                   — planner-template task: directory with child Plan
      task.json            — parent task's own output (carries the child plan ref)
      task.input.json
      task.prompts.json
      task.bundle.json
      plan.json            — child Plan
      tasks/
        t02.t01.json
        t02.t02/           — recursion to arbitrary depth
          task.json
          plan.json
          tasks/
            t02.t02.t01.json
            ...
        t02.tNN.json       — child Plan's terminal aggregator output

    t03.json
    ...
    tNN.json               — root Plan's terminal aggregator output

  report.md                — human-readable aggregate (root Plan's report)
  report.html              — opt-in
  report.pdf               — opt-in
  errors.json              — collected per-task failures across the whole tree
                             (empty if clean), each entry carries its taskPath
```

Every leaf-task file stores its path identifier verbatim (`taskPath: "t02.t02.t01"`) so the file's location and the in-payload identity match. Every planner-task directory stores a `task.json` with the same `taskPath` + a `childPlan: { path, summary, terminalOutput }` field linking to the child Plan's identity.

A run is **resumable across the whole tree** because every artefact lands as a separate file. On a daemon-restart mid-run, the executor walks the tree depth-first, finds the lowest level with an incomplete task, and resumes there. A failed planner-task is retried as a whole (its child Plan is discarded and re-built); a failed leaf-task is retried per its own retry policy.

## Surfaces

### Daemon RPC

```ts
// Stream — emits progress events end-to-end
'analyze.run': StreamHandler<{
  message:  string;                    // user request
  scopeRef?: { kind: ScopeKind; value: string };
  format?:  ('json' | 'md' | 'html' | 'pdf')[];   // default ['json', 'md']
}>;
// Stream events:
//   classifyDone   { target, scope, focused, focus?, reasoning }
//   planDone       { taskCount }
//   taskStart      { taskId, template }
//   taskDone       { taskId, status, outputPath }
//   aggregateDone  { reportPaths: { format: string; path: string }[] }
//   error          { phase: ..., message, recoverable }
//   done           { runId }

'analyze.list':   RpcHandler<{ limit?: number }>;    // recent runs
'analyze.get':    RpcHandler<{ runId: string }>;     // meta + report paths
'analyze.delete': RpcHandler<{ runId: string }>;
```

### CLI

```sh
insrc analyze [options] <message>

  --scope <path|id>        explicit scopeRef
  --format <list>          json,md,html,pdf (comma-separated)
  --out <dir>              write the run to a custom location
                           (default ~/.insrc/analyze/<run-id>/)
  --resume <run-id>        resume an interrupted run

Examples:
  insrc analyze "what does this repo do?"
  insrc analyze --scope src/auth "what are the auth flows here?"
  insrc analyze --format json,html "analyze the PII surface in this dataset"
  insrc analyze --resume 2026-06-22-3f4a
```

### IDE

A new "Analyze" pane is **out of Phase-1 scope**. The reports are addressable on disk; the user opens them in the editor. A pane wiring + report-open command lands in a follow-up.

## Configurations

Stored under `models.analyze` in `~/.insrc/config.json`:

```jsonc
{
  "models": {
    "analyze": {
      "defaultProvider": "claude-cli",        // 'claude-cli' | 'codex-cli' | 'local'
      "modelClassMap": {
        "low":    "haiku",
        "medium": "sonnet",
        "high":   "opus"
      },
      "maxConcurrentTasks": 1,                // serial execution by spec
      "citationStrictness": "strict",         // 'strict' | 'permissive'
                                              //   strict   = fail run on any unverifiable
                                              //              source/entity citation
                                              //   permissive = surface warning, continue
      "scopeBucketOverride": null,            // force a specific bucket; null = LLM-classified
      "maxPlanDepth": {                       // by ROOT Run's scope bucket; sets the
                                              // absolute depth ceiling across the
                                              // whole Plan tree. The root's intent
                                              // governs, not the deepest child Plan's
                                              // local scope.
        "XS": 2,                              // a function rarely needs recursion
        "S":  3,                              // module -> file
        "M":  4,                              // subsystem -> central component -> sub
        "L":  5,                              // repo -> family -> module -> central -> sub
        "XL": 6                               // org -> repo cluster -> repo -> family
                                              //   -> module -> central component
      },
      "outputFormats": ["json", "md"],
      "workingDir": "~/.insrc/analyze"
    }
  }
}
```

The `maxPlanDepth` map is keyed on the **root Run's classified scope**, not on the local Plan's scope. This is deliberate: a child Plan classified as M inside an XL Run is still entitled to the XL ceiling, because the user's original intent (the root's scope) is what governs how deep the analysis is allowed to go. Local plans get to recurse up to (root-ceiling − current-depth) further levels.

Override at run time via `--max-depth N` on the CLI for ad-hoc tightening or loosening.

## Open / Phase boundaries

| Item | Phase 1 | Phase 2+ |
|---|---|---|
| Three targets | ✓ | — |
| Single-state understanding | ✓ | — |
| Citations: source / entity / doc | ✓ | — |
| Plan Task w/ flat list + output deps | ✓ | — |
| Multi-format output (JSON / MD / HTML) | ✓ | PDF |
| Per-target task catalogs | ✓ | — |
| Resumable runs | ✓ | — |
| IDE pane | — | ✓ |
| Live cloud SDK introspection (infra) | — | ✓ |
| Diff-mode (compare two states) | — | ✓ |
| Cross-run aggregation | — | ✓ |
| Parallel task execution within a run | — | ✓ |

## See also

- `design/analyze-context-builder.md` — generalized context builder
- `design/analyze-plan-builder.md` — generalized plan builder
- `design/analyze-framework-code.md` — code vertical
- `design/analyze-framework-data.md` — data vertical
- `design/analyze-framework-infrastructure.md` — infrastructure vertical
