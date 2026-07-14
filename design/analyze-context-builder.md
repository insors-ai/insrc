# Analyze framework — Context Builder

## Purpose

Build the **layered context bundle** that's stamped into every LLM call inside an analyze run. The shaper is **LLM-driven**: each invocation is a single local-Ollama call running a tool-loop over the read-only built-in tool registry, emitting the bundle via `completeStructured`. The TypeScript layer is thin glue.

## Invocation modes

Three modes, all sharing one bundle schema:

| Mode | When | Consumer | Bundle character |
|---|---|---|---|
| `classification` | Once per run, **before** the classifier | The classifier | Target-agnostic. Workspace summary + kind-counts. Small. |
| `run` | Once per run, **after** classification, **before** planning | The planner | Per-target (code / data / infra / generic). Big — full relevance window for the chosen target. |
| `task` | Once per leaf or planner task, **before** its `completeStructured` call | The task itself | Per-target. Same shape as `run` but trimmed to the task's focus + carries `upstream`. |

There is no `task` invocation against the classification or generic shaper; **task-level dispatch routes by task-family namespace** (`code.* → code-shaper`, `data.* → data-shaper`, `infra.* → infra-shaper`). Generic + classification shapers exist only at the `run` (and for classification, only at the `classification`) level.

## Shapers

Five per-prompt shapers, one shared TS driver:

| Shaper | Targets | Modes it implements |
|---|---|---|
| `classification` | n/a (pre-classification) | `classification` |
| `generic` | `target='generic'` | `run` |
| `code` | `target='code'` or task family `code.*` | `run`, `task` |
| `data` | `target='data'` or task family `data.*` | `run`, `task` |
| `infra` | `target='infra'` or task family `infra.*` | `run`, `task` |

Each is a **prompt + a small TS wrapper** that points the shared driver at the right prompt + bundle schema. Adding a sixth target later = one new prompt file + one factory entry.

## Architecture

```
                          ┌────────────────────────────────────┐
                          │  Caller                            │
                          │  (framework outer-loop, classifier,│
                          │   planner, or task executor)       │
                          └────────────────┬───────────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────────┐
                          │  shaperFor(mode, target)           │
                          │  → loads prompt file               │
                          │  → loads bundle schema             │
                          │  → loads read-only tool surface    │
                          └────────────────┬───────────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────────┐
                          │  OllamaProvider (local)            │
                          │  tool-loop:                        │
                          │    ─── graph.* / db.* / file.* ─── │
                          │    repeat until model emits final  │
                          │                                    │
                          │  completeStructured against        │
                          │  AnalyzeContextBundle schema       │
                          └────────────────┬───────────────────┘
                                           │
                                           ▼
                          ┌────────────────────────────────────┐
                          │  Cache write + assemble Markdown   │
                          │  (run/task bundle JSON + assembled │
                          │   .md returned to caller)          │
                          └────────────────────────────────────┘
```

The TS layer owns: prompt loading, tool-surface filtering, schema enforcement, caching, assembly to Markdown for downstream prompts. The LLM owns: identifying what's relevant in scope, traversing graph / DB / file system through tool calls, structuring its findings into bundle layers.

## The bundle

```ts
interface AnalyzeContextBundle {
  readonly system:    string;        // Stable role + posture (per-shaper prompt
                                     // emits this as the role intro it embodies)
  readonly focus:     string;        // Intent block: scope, focused question,
                                     // citation strictness, scope-bucket reminder
  readonly summary:   string;        // Target-shape summary (1-2 paragraphs)
  readonly structure: string;        // Layout / topology / hierarchy
  readonly surface:   string;        // Discovered surface (APIs / endpoints /
                                     // tables / manifests / cron jobs / ...)
  readonly artefacts: string;        // Concrete excerpts (code / schema / yaml)
                                     // -- with explicit citations
  readonly upstream:  string;        // Outputs from prior tasks the current task
                                     // consumes (task-mode only)
  readonly meta?: {
    readonly mode:        'classification' | 'run' | 'task';
    readonly shaper:      'classification' | 'generic' | 'code' | 'data' | 'infra';
    readonly toolCalls:   number;          // count of tool-loop turns the LLM took
    readonly modelId:     string;          // resolved Ollama model id
    readonly emptyLayers: string[];        // layers the LLM intentionally left blank
  };
}
```

The driver renders these into prompt Markdown in the fixed order `system → focus → summary → structure → surface → artefacts → upstream`. **Structural reference goes trailing** per the project prompt convention (the LLM's attention is recency-weighted; schemas and catalogs land at the tail). Empty layers (the LLM declared "nothing to report here") are omitted entirely from the assembled Markdown, not rendered as empty headers.

A bundle's footer always carries a fixed contract reminder loaded from `src/insrc/analyze/contract.ts` — single-sourced across the shaper and the planner so both stamp identical citation guidance.

## Tool surface

The shaper exposes the **full built-in tool registry minus mutation tools** to Ollama:

| Family | In | Out |
|---|---|---|
| Graph | `graph.find_callers`, `graph.find_callees`, `graph.transitive_closure`, `graph.find_by_kind`, `graph.in_edges`, `graph.out_edges`, `graph.unreachable` | (none — graph is read-only by construction) |
| DB | `db.list_tables`, `db.describe`, `db.sample`, `db.list_connections`, `db_file_describe`, `db_file_list_files`, `db_file_sample` | `db_sql_execute` with mutating verbs |
| File | `file.read`, `file.read_lines`, `file.glob`, `file.list_dir`, `file.stat` | `file.write`, `file.delete` |
| Manifest | `code.list_manifests`, `code.parse_manifest` | (none — read-only) |
| Repo | `repo.list`, `repo.get_closure` | `repo.add`, `repo.remove`, `repo.reindex` (one exception below) |
| Shell / network / k8s / pkg / ssh | (none exposed) | All |

The one exception: when the run-level shaper detects an empty graph closure it can trigger `repo.reindex` — but this is not exposed as a tool the LLM calls; the TS wrapper invokes it directly as part of the empty-graph failure path. The LLM cannot reindex repos.

The read-only filter is implemented in `src/insrc/analyze/context/tool-surface.ts` and reused by any future LLM-driven framework module that needs the same "read-only registry slice."

## Per-shaper prompts

Each shaper's system prompt lives in `prompts/analyze/<shaper>.system.md` and is loaded at boot. Missing file → fail fast at daemon start. The framework loads, hashes, and pins the prompt content into the bundle's cache key so a prompt edit forces a rebuild.

What each prompt directs the LLM to do (sketch — the actual prompt files are the source of truth):

**`classification.system.md`** — "You are the analyze-intent classifier's context builder. Your job is to produce a target-agnostic bundle describing the workspace so the classifier can pick a target (code / data / infra / generic) and a scope bucket (XS-XL). Tool-use: list registered repos, run a quick kind-count per repo, list registered data connections, glob the workspace for known IaC dirs. **Do not** traverse the full graph. **Do not** read source bodies. Emit a small, kind-counted summary."

**`generic.system.md`** — "You are the generic-target run-level context builder. The intent is broad ('analyze this repo / workspace'). Survey what surfaces exist (code modules, data connections, infra manifests) and produce a cross-cutting bundle. Each `summary` / `surface` / `structure` layer should mention every detected surface kind. The planner will dispatch sub-plans by family namespace."

**`code.system.md`** — "You are the code-shaper. For mode=run, produce a complete relevance-windowed bundle: every public API, every detected endpoint, every CLI command, full module tree, full dep-closure summary. Source excerpts in `artefacts` for central modules. For mode=task, drop `surface` to a one-line pointer (the planner already saw it) and pull in `upstream` from prior task outputs. **Be lossless** within the closure: if 50 modules have high in-degree, include all 50; do not top-N."

**`data.system.md`** — "You are the data-shaper. For mode=run: enumerate every registered connection; for each, list every table / file / collection; for each, list every column / field. Schema previews in `surface`. Schema DDL + sample rows in `artefacts` (no redaction — IDE has no production data access). For mode=task, focus on the task's declared connection/object subset."

**`infra.system.md`** — "You are the infra-shaper. For mode=run: detect every IaC family present (TF / k8s / Helm / GHA / GLCI / docker-compose / etc), list every manifest, list every resource kind per family. Topology grid in `structure`. One representative excerpt per family in `artefacts`."

All five prompts share the same trailing contract reminder (loaded from `analyze/contract.ts`) and the same bundle schema.

## What each layer holds, per shaper

| Layer | classification | generic | code | data | infra |
|---|---|---|---|---|---|
| `system` | "classifier context" intro | "generic-target analyst" intro | "code analyst" intro | "data analyst" intro | "infra analyst" intro |
| `focus` | Raw user prompt + scopeRef | Intent block (target=generic, scope) | Intent block + task pointer (task-mode) | same | same |
| `summary` | Registered repos w/ primary language; declared data connections; detected IaC dirs | Cross-cutting workspace summary | Repo name, top-level packages, language mix, primary build system | Connection list, table/file count, dominant formats | IaC families detected, CI/CD systems |
| `structure` | (omitted — classifier doesn't need it) | Top-level structural map per detected surface | Module tree + dependency-closure summary | ER sketch + connection topology | Deployment topology (services × namespaces × environments) |
| `surface` | Top-level kind-counts per registered repo | Surface inventory per detected target | All exports / public APIs / HTTP endpoints / CLI commands | Schema preview (tables × columns; file shapes) | Manifest listings + resource kinds |
| `artefacts` | (omitted) | (omitted — generic mode is high-level) | Source excerpts for central modules (citations attached) | Schema DDL + sample rows (citations attached) | One representative manifest excerpt per family (citations attached) |
| `upstream` | (omitted) | (omitted) | (task-mode) JSON-from-prior-tasks the current declared as `consumes` | same | same |

## Caching

Two cache tiers:

- **Run-level bundle** caches to `~/.insrc/analyze/<run-id>/context/run-bundle.json`. On resume, the cached file wins — no rebuild.
- **Task-level bundle** caches to `~/.insrc/analyze/<run-id>/context/<task-id>.bundle.json`. On replay (the task re-runs because the user re-ran an aggregate without re-running upstream), the cached bundle is used until any input it depends on changes.

The per-layer cross-run content cache from earlier drafts is **dropped**: without the summarize-down LLM step, there's no expensive per-layer compute to amortize across runs.

**Cache key** for each tier: `sha256(prompt_content + bundle_schema_version + invocation_inputs)`. The `invocation_inputs` slot carries the scope reference + intent + (for task-mode) task descriptor + upstream output hash.

**Cache invalidation**:
- Indexer's last-indexed timestamp (read from `db/repos.ts` repo registry) advances → invalidate any cached bundle whose `repoLastIndexedAt` predates the current value. The shaper records `repoLastIndexedAt` into the cached bundle's `meta` at write time.
- Prompt content hash changes → invalidate (handled by inclusion in cache key).
- Bundle schema version bumps → invalidate (handled by inclusion in cache key).
- No `--no-cache` flag. To force a fresh build, user nukes `~/.insrc/analyze/cache/` or the per-run directory.

## Sizing

The shaper has **no token budget, no summarize-down, no truncation knobs**. The project principle (accuracy primary, cost least) dictates: include everything relevant in the shaper's relevance window, organized for the LLM to find. Sizing is the LLM's editorial responsibility within the prompt's "be lossless" instruction.

Two operational implications:
- The run-level bundle for an XL scope may be tens of thousands of tokens. That's intended.
- The framework's outer-loop emits a **one-shot L/XL scope warning** at run-start ("this run is `<bucket>` scope; expect significant token consumption from your CLI provider") immediately after classification. The warning is informational, dismissable, and never blocks the run.

The warning is not a context-builder concern; it's specified in `design/analyze-framework.md` against the `analyze.run.start` IPC.

## Failure modes

| Mode | Cause | Behavior |
|---|---|---|
| Local Ollama unavailable | Daemon down / model missing / connection error | **Hard fail.** The shaper throws `ShaperLlmUnavailableError`; the run aborts before downstream LLM calls. Matches the project's "Ollama is always available" assumption. |
| Tool-loop exceeds turn cap | LLM keeps querying without converging | Cap at `models.analyze.shaper.maxToolTurns` (default 40). On overshoot, throw `ShaperToolLoopExhausted`. |
| Schema-mismatch in final emit | LLM emits a bundle that fails `AnalyzeContextBundle` schema | Standard `completeStructured` corrective-retry loop (3 attempts). If exhausted, throw `ShaperSchemaUnrecoverable`. |
| Upstream task output missing | Earlier task failed | The shaper is given `upstreamTasks = Map<taskId, null \| output>`. For missing entries, the prompt is instructed to emit a `[unavailable: <taskId> failed; downstream claims may be limited]` placeholder into the `upstream` layer and proceed. The task's prompt later surfaces this in its `reasoning` field. |
| Graph query returns nothing | Closure repos empty / scope target not indexed | The TS wrapper detects empty closure pre-Ollama-call, runs `repo.reindex` via direct IPC (not via tool), then retries. If the reindex also returns empty, throw `ScopeNotIndexedError`. |
| Prompt file missing at boot | A required `prompts/analyze/<shaper>.system.md` is absent | Daemon refuses to start. Logged with the missing path. |

## Public API

```ts
// src/insrc/analyze/context/index.ts

export interface ShapeOpts {
  readonly runId: string;
  readonly bypassCache?: boolean;   // for testing only; no CLI surface
}

export interface ClassificationShapeInput {
  readonly scopeRef:     string;          // workspace path / repo / connection ref
  readonly userPrompt:   string;
}

export interface RunShapeInput {
  readonly intent: ClassifiedIntent;
}

export interface TaskShapeInput {
  readonly intent:        ClassifiedIntent;
  readonly task:          PlannedTask;
  readonly template:      AnalyzeTaskTemplate;
  readonly upstreamTasks: Map<string, unknown>;  // taskId → output JSON (or null)
}

export interface Shaper {
  buildClassificationBundle?(i: ClassificationShapeInput, o: ShapeOpts): Promise<AnalyzeContextBundle>;
  buildRunBundle?           (i: RunShapeInput,            o: ShapeOpts): Promise<AnalyzeContextBundle>;
  buildTaskBundle?          (i: TaskShapeInput,           o: ShapeOpts): Promise<AnalyzeContextBundle>;
}

export function shaperFor(
  mode: 'classification',
): Shaper & { buildClassificationBundle: NonNullable<Shaper['buildClassificationBundle']> };
export function shaperFor(
  mode: 'run',
  target: 'code' | 'data' | 'infra' | 'generic',
): Shaper & { buildRunBundle: NonNullable<Shaper['buildRunBundle']> };
export function shaperFor(
  mode: 'task',
  target: 'code' | 'data' | 'infra',
): Shaper & { buildTaskBundle: NonNullable<Shaper['buildTaskBundle']> };
```

## Configuration

```jsonc
"models": {
  "analyze": {
    "shaperModel": "qwen3-coder:14b",         // resolved Ollama model id
    "shaper": {
      "maxToolTurns":              40,         // tool-loop turn cap
      "structuredOutputRetries":    3,         // completeStructured retry budget
      "ollamaNumCtx":              32768       // context window for the call
    }
  }
}
```

No budget keys. No sizing knobs. No redaction config. No `--no-cache` flag.

## Extension points

- **New target** → add `prompts/analyze/<name>.system.md` + register in `shaperFor`. The framework dispatches on `intent.target`. The new shaper inherits the same bundle schema + read-only tool surface.
- **New layer** → add it to `AnalyzeContextBundle`, add a sentence to every system prompt explaining what goes in it, update the assembled-Markdown render order in `bundle.ts`. No budget table to update.

## What's deliberately deferred

- **Cross-run knowledge transfer** — bundle re-use across analyze runs against the same scope is keyed on cache hash identity only. A more aggressive content-level dedup ("I shaped this repo last week; reuse the structure layer verbatim") is Phase 2.
- **Streaming bundle assembly** — the shaper assembles the full bundle then emits. Streaming partial bundles into the planner is Phase 2 and only matters if XL runs start exceeding 30s of bundle-build time.
- **Adaptive shaper model selection** — model id is a fixed config value. Auto-routing to a bigger model for XL scope + smaller for XS is Phase 2.

## See also

- [`analyze-framework.md`](analyze-framework.md) — the overall framework, classifier, L/XL warning, and outer-loop IPC
- [`analyze-plan-builder.md`](analyze-plan-builder.md) — what consumes the run-level bundle
- [`analyze-framework-{code,data,infrastructure}.md`](analyze-framework-code.md) — per-target template families
