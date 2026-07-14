# plans/exploration-based-context-build.md

Redesign the Context Builder from a **single LLM tool-loop that decides what to look at** to a **three-stage pipeline (decompose → explore → synthesize) where the framework decides + the LLM organizes**.

Status: **DRAFT** -- not approved for implementation.

## 1. Motivation

The current shaper (`analyze/context/driver.ts`) is an LLM with a 40-turn tool loop. The LLM decides what tools to call, in what order, and what to include in the bundle. This has structural problems, observed on `insors-extraction` (see the live-test session):

- **Priors beat repo layout.** Asked to "map the payable extraction module structure", the LLM spent 33 tool calls deeply mapping `insors/core/model/invoice/` (its memory pattern for `payable`) while `insors/extraction/payable/` -- the directory that literally matches the query -- got a single line. The repo's actual structure lost to the model's training data.
- **Documentation metadata treated as ground truth.** In the matching/reconciliation test, the shaper transcribed the `Related Existing Docs` table inside `overview.md` as if the linked files existed. Six of fifteen cited paths were stale references, not actual files.
- **Reuse blindness.** Nothing in the current flow surfaces "this project already has a `common/timeUtils.ts`" before the planner emits a task that reinvents it. The shaper doesn't build a reusable-component inventory.
- **Design-principle drift.** Naming conventions, base-class idioms, factory patterns, error hierarchies -- none of these are systematically extracted. The LLM sometimes notices, often doesn't.
- **Failure locality.** When a bundle is wrong, the failure is diffuse: "the LLM decided poorly during turn 17 of 40". There's no unit of the pipeline you can point at, fix, and re-test in isolation.

The underlying cause is the interface: the shaper prompt says "here are tools, decide". The LLM's decision is driven by its priors, not by the repo's actual state. Search-quality tuning (better retriever, richer indexes) helps the LLM find things but does not change who decides what to look for.

## 2. Core insight

Context building is not an information-retrieval problem. It is an **intent-decomposition + evidence-gathering + synthesis** problem. The framework should:

1. **Understand** the intent (name the answer type)
2. **Decompose** it into explicit, structured explorations
3. **Execute** those explorations against the graph / filesystem / doc index
4. **Synthesize** the bundle from bounded exploration outputs

The LLM's role shrinks from **navigator** to **organizer**. It writes the bundle from what the explorations returned, not from what it decided to look at during a stochastic tool loop.

This recursively mirrors the outer analyze framework (classify → plan → execute → aggregate). The shaper becomes a small orchestrator of the same shape, one depth level down. The same primitives (typed classifier output, planner catalog, executor with runtimes, aggregator schema) apply.

## 3. Architecture

```
intent  →  DECOMPOSE  →  [ Exploration₁, Exploration₂, ... Explorationₙ ]
    (small LLM call)         ↓         ↓                    ↓
                          EXECUTE   EXECUTE               EXECUTE
                          (deterministic OR narrow-LLM per exploration)
                              ↓         ↓                    ↓
                          output₁    output₂             outputₙ
                              ↘        ↓                  ↙
                                 SYNTHESIZE (LLM call)  →  AnalyzeContextBundle
```

Three modules to add, one to refactor:

| Module | Job | LLM? |
|---|---|---|
| `analyze/context/decomposer.ts` (new) | Intent → `ExplorationPlan` (ordered list of explorations, each with type + params + dependsOn) | 1 LLM call, tight schema, ~30s |
| `analyze/explore/` (new) | Exploration type catalog + runners | Deterministic per type; some types use a narrow LLM call with a tight output schema |
| `analyze/context/synthesizer.ts` (new) | Exploration outputs → AnalyzeContextBundle (7 layers) | 1 LLM call, bounded input |
| `analyze/context/driver.ts` (refactor) | Orchestrate DECOMPOSE → EXECUTE → SYNTHESIZE. Keep the existing cache, meta stamping, invariants. | -- |

Existing per-target shaper prompts (`code.system.md`, `data.system.md`, `infra.system.md`, `docs.system.md`, `generic.system.md`) become per-target **synthesizer** prompts -- narrower job, same 7-layer output schema. The bundle wire shape does not change; downstream (planner, executor, aggregator) is unaffected.

The 40-turn tool loop stays available as a fallback for gaps the exploration plan didn't cover, but it stops being the primary navigation mechanism.

## 4. Exploration catalog

An exploration is a typed unit:

```ts
interface Exploration {
    readonly id:       string;              // stable id within the plan, e.g. "e1"
    readonly type:     ExplorationType;     // from the catalog below
    readonly purpose:  string;              // one-line human-readable rationale, from the decomposer
    readonly params:   Record<string, unknown>;  // type-specific
    readonly dependsOn?: readonly string[];  // ids of prior explorations whose outputs this reads
}

type ExplorationType =
    // structural resolvers (deterministic)
    | 'concept.resolve'         // text -> ranked entity/module/file paths
    | 'module.profile'          // dir -> { exports, subdirs, entrypoints, size, langs }
    | 'symbol.locate'           // name -> entity refs
    | 'class.hierarchy'         // root -> subclass tree via INHERITS
    | 'import.graph'            // module -> in-degree (importers) + out-degree
    | 'test.locate'             // module -> associated test files
    | 'usage.example'           // api -> real call sites with excerpts
    | 'capability.reuse-check'  // subject -> similar existing modules (high in-degree matches)
    // doc-side (mostly deterministic; some narrow LLM)
    | 'doc.mention'             // subject -> docs that reference it verbatim
    | 'doc.decision.trace'      // topic -> decisions from docs, verbatim + cited
    | 'doc.constraint.enumerate'// subject -> constraints from docs, verbatim + cited
    // convention detection (mostly graph stats + regex)
    | 'convention.detect'       // scope -> naming/factory/base patterns
    | 'config.trace'            // subject -> config classes/files
    | 'data-model.trace'        // entity -> tables/schemas mapped (ORM scanner)
    // fallback / gap-filler
    | 'freeform.probe';         // arbitrary read-only tool sequence bounded by turn cap
```

Every exploration runner returns a **typed structured payload** -- never free-form prose. Payloads are cacheable, comparable across runs, and directly serializable into the synthesizer's evidence pack.

### 4.1 Which are deterministic vs LLM-backed

**Deterministic** (pure graph / filesystem queries, sub-second, cacheable trivially):
- `module.profile`, `symbol.locate`, `class.hierarchy`, `import.graph`, `test.locate`, `usage.example`, `capability.reuse-check`, `convention.detect`, `config.trace`, `data-model.trace`

**Deterministic with heuristic ranking** (still no LLM):
- `concept.resolve` -- token-match + graph-degree scoring + vector similarity fusion
- `doc.mention` -- indexed doc-body grep + entity mention extraction

**Narrow LLM call** (small prompt, tight output schema):
- `doc.decision.trace` -- ALREADY IMPLEMENTED as a template runtime; reuse `docs.decision.trace` verbatim
- `doc.constraint.enumerate` -- ALREADY IMPLEMENTED; reuse `docs.constraint.enumerate`

**Fallback**:
- `freeform.probe` -- runs the existing shaper tool loop with a task-specific goal; capped at 10 turns. Only fires when the decomposer explicitly emits it.

### 4.2 Reuse of existing template runtimes

Two exploration types map 1:1 onto existing template runtimes we already built for the docs module:

| Exploration | Existing runtime | Reuse strategy |
|---|---|---|
| `doc.decision.trace` | `analyze/runtimes/docs/decision-trace.ts` | Extract the retrieval + LLM extraction into a shared `analyze/explore/doc-decision-trace.ts` runner. Template runtime becomes a thin wrapper around the shared runner. |
| `doc.constraint.enumerate` | `analyze/runtimes/docs/constraint-enumerate.ts` | Same shape. |

This is important: **the outer framework's templates and the shaper's explorations converge on the same primitives**. Recursive symmetry pays off in shared code. Same catalog, different depth.

## 5. The DECOMPOSE step

Input: the shaper's inputs (`ClassificationShapeInput | RunShapeInput | TaskShapeInput`) -- specifically `intent.target`, `intent.scope`, `intent.focused`, `intent.focus`, `intent.scopeRef`.

Output schema:

```ts
interface ExplorationPlan {
    readonly answerType:    AnswerType;             // one of: structural-map | adherence-check | decision-trace | capability-discovery | how-does-it-work | prose-retrieval | data-inventory | infra-inventory
    readonly explorations:  readonly Exploration[]; // ordered; later explorations may dependsOn earlier ones
    readonly synthesisHint: string;                 // 1-2 sentence guidance to the synthesizer
}

type AnswerType =
    | 'structural-map'         // "map the X module"
    | 'adherence-check'        // "does Y follow constraint Z?"
    | 'decision-trace'         // "why did we decide X?"
    | 'capability-discovery'   // "does the codebase already do X?"
    | 'how-does-it-work'       // "how does X work under the hood?"
    | 'prose-retrieval'        // "what does the doc say about X?"
    | 'data-inventory'         // "what tables / schemas exist?"
    | 'infra-inventory';       // "what manifests / IaC exist?"
```

The DECOMPOSE prompt is small (~500 tokens) and tightly-scoped. Its job:

1. Name the `answerType` by matching the intent to one of the eight types
2. Emit an ordered list of explorations following the recipe for that answer type
3. Populate each exploration's params from `intent.focus` + `intent.scopeRef`
4. Wire `dependsOn` where later explorations read earlier results (e.g. `module.profile` params.path = `$e1.top.path`)

The decomposer does NOT do free-form reasoning about the repo. It picks from a fixed catalog and fills in slots. Output is structured JSON (schema enforced via Ajv + Ollama `format:` constraint).

### 5.1 Per-answer-type recipes (informal, per-target-specialized where needed)

**structural-map** (e.g. "map the payable extraction module"):
```
1. concept.resolve(query=intent.focus)                         → paths (rank 1 wins)
2. module.profile(path=$1.top.path)                            → tree, exports, entrypoints
3. import.graph(module=$1.top.path)                            → in-degree, out-degree
4. class.hierarchy(root=$2.principalClasses)                   → tree
5. test.locate(module=$1.top.path)                             → test coverage
6. doc.mention(subject=$1.top.path)                            → doc cites
7. convention.detect(scope=$1.top.path)                        → patterns
```

**adherence-check** (e.g. "does CLAUDE.md's Haiku 4.5 rule hold?"):
```
1. doc.constraint.enumerate(subject=intent.focus)              → constraint verbatim + citation
2. symbol.locate(names=extracted-from-$1.constraints)          → mention sites
3. concept.resolve(query="LLM provider config")                → central config
4. usage.example(api=$3.centralConfig)                         → actual call sites
```

**decision-trace** (e.g. "why did we choose Qdrant?"):
```
1. doc.decision.trace(topic=intent.focus)                      → decisions verbatim + cited
2. concept.resolve(query=terms-from-$1.decisions)              → related code entities
3. doc.mention(subject=$2.top)                                 → cross-refs from other docs
```

**capability-discovery** (e.g. "does the codebase already do email templating?"):
```
1. concept.resolve(query=intent.focus)                         → paths
2. capability.reuse-check(subject=intent.focus)                → similar existing modules
3. symbol.locate(names=derived-from-$1+$2)                     → concrete entities
4. usage.example(api=$3.entities)                              → usage sites
```

**how-does-it-work** (e.g. "how does the classifier route requests?"):
```
1. concept.resolve(query=intent.focus)                         → entry point
2. symbol.callees(root=$1.top, depth=3)                        → call graph forward
3. class.hierarchy(root=$1.top.class)                          → polymorphism
4. usage.example(api=$1.top)                                   → callers
5. convention.detect(scope=$1.top.module)                      → routing convention
```

**prose-retrieval** (e.g. "what does the security doc say about auth?"):
```
1. doc.decision.trace(topic=intent.focus)                      → decisions
2. doc.constraint.enumerate(subject=intent.focus)              → constraints
3. doc.mention(subject=intent.focus, filenameHint=security/)   → related sections
```

**data-inventory** and **infra-inventory** get their own recipes tied to their per-target tools (db_*, k8s_*, etc.); these mostly reuse the `discovery` templates the existing planner catalog already ships.

Recipes are baked into the decomposer's prompt as concrete templates. The LLM's job is to pick the type and fill the slots, not to invent recipes.

## 6. The SYNTHESIZE step

Input: the ordered exploration outputs (a `Map<explorationId, output>`) plus the original intent + the answerType hint.

Output: `AnalyzeContextBundle` -- the same 7-layer wire shape.

The synthesizer prompt is per-target (code / data / infra / docs / generic) but much narrower than today's shaper prompts. It says: "Given these exploration outputs, write the 7 bundle layers. Use only citations that appear in the outputs. Preserve verbatim wording on constraints + decisions. Cap each layer per scope band."

Key discipline: **the synthesizer cannot introduce facts not present in the exploration outputs**. If the outputs don't include a claim, the bundle doesn't either. A downstream lint pass can verify by checking every citation in the bundle appears in some exploration output.

The 7 layers get populated from the outputs by convention:

| Layer | Populated from |
|---|---|
| `system` | Fixed: role intro one-liner |
| `focus` | Fixed: rendered intent + answerType |
| `summary` | Composed from exploration purposes + top findings |
| `structure` | `module.profile`, `class.hierarchy`, `import.graph`, `convention.detect` outputs |
| `surface` | `concept.resolve` top hits + `module.profile.exports` + entry points |
| `artefacts` | `usage.example.excerpts`, `doc.decision.trace.decisions`, `doc.constraint.enumerate.constraints`, `doc.mention.sections` -- capped per scope band |
| `upstream` | Task-mode only: prior task outputs |
| `meta` | Framework-stamped (already handled by driver) |

## 7. Storage + caching

Two caches to add:

- **Exploration output cache** (LMDB, new sub-DB `explorationCache`) keyed by `(repoLastIndexedAt, exploration.type, hash(params))`. Invalidates on `repoLastIndexedAt` advance. Repeated runs of the same shaper with tiny prompt variation reuse cached results. Deterministic explorations gain a lot from this; LLM-backed ones save Ollama round-trips.
- **Plan cache** (existing bundle cache in `analyze/context/cache.ts`) keyed by intent hash. Already works. Nothing to change.

The exploration cache is per-repo (invalidated per-repo on re-index). Cross-run cache hits are the norm.

## 8. Phased rollout

Each phase is independently shippable + user-visible.

**Phase 1 -- Foundation + one exploration recipe.**
- New `analyze/explore/` module with the `Exploration` + `ExplorationOutput` types
- Implement 4 deterministic explorations: `concept.resolve`, `module.profile`, `symbol.locate`, `import.graph`
- Add a `DECOMPOSE` mini-driver + prompt that emits ONLY `structural-map` plans (the other answer types stub out to the legacy tool-loop shaper)
- Add a `SYNTHESIZE` mini-driver + one prompt (code target)
- Wire into `analyze/context/driver.ts` behind a per-invocation feature that the driver auto-picks based on answer-type detection
- **Success**: rerun the `payable extraction module` test (Test 3 from the live-test session) and confirm the bundle now centers on `insors/extraction/payable/`, not `insors/core/model/invoice/`

**Phase 2 -- Doc explorations.**
- Add `doc.mention`, `doc.decision.trace`, `doc.constraint.enumerate`
- Extract the retrieval + LLM extraction from `analyze/runtimes/docs/decision-trace.ts` + `constraint-enumerate.ts` into shared runners under `analyze/explore/`. Existing template runtimes become thin wrappers.
- Add `decision-trace` + `prose-retrieval` decomposer recipes
- Add docs-target synthesizer prompt
- **Success**: rerun the CLAUDE.md Haiku 4.5 test (Test 1) -- passes as before, faster, with tighter citations

**Phase 3 -- Adherence + capability discovery.**
- Add `usage.example`, `capability.reuse-check`, `class.hierarchy`
- Add `adherence-check` + `capability-discovery` decomposer recipes
- Add code-target adherence synthesizer prompt (extends the existing docs.aggregate-style contradictions preservation)
- **Success**: `/code does the CLAUDE.md Haiku 4.5 rule hold?` returns a real adherence report with matches / drifts / contradictions cited to actual code sites

**Phase 4 -- Conventions + config + data-model.**
- Add `convention.detect`, `config.trace`, `data-model.trace`, `test.locate`
- Add `how-does-it-work` decomposer recipe
- Per-target synthesizer prompts get a `conventions` sub-section in `structure`
- **Success**: any structural-map query surfaces the project's own idioms + reuse candidates before the planner emits tasks

**Phase 5 -- Data + infra recipes.**
- Add `data-inventory` + `infra-inventory` decomposer recipes
- Wire the existing db_*/k8s_* tools as deterministic explorations
- Retire the corresponding legacy shaper paths for data + infra targets

**Phase 6 -- Legacy tool-loop retirement + fallback consolidation.**
- Once every target has a working decomposer recipe, retire the 40-turn tool loop from the shaper's happy path
- Keep it as `freeform.probe` -- only fires when the decomposer explicitly emits it as a fallback exploration
- Update the shaper-scope-boundary HARD RULE to remain enforced on `freeform.probe`

Each phase completes at a user-visible checkpoint (a specific test passes). No phase leaves the framework in a broken intermediate state -- until every target has a decomposer recipe, un-recipe'd intents fall through to the legacy shaper.

## 9. Success criteria

Concrete verifiable outcomes:

**Phase 1** (structural-map on code):
- `/code map the payable extraction module` on insors-extraction produces a bundle whose `structure` + `surface` are dominated by `insors/extraction/payable/` and its actual subdirs (`headers/`, `items/`, `grouping/`, `matching/`, `rules/`, `validation/`, ...).
- Zero cited paths from `insors/core/model/invoice/` appear unless they are direct dependencies of the payable extraction pipeline.
- Time to bundle: <60s (vs current 3-8 min).

**Phase 2** (docs prose retrieval):
- Test 1 (CLAUDE.md Haiku 4.5 rule) passes with equal or higher verbatim preservation, faster.
- Test 2 (matching/reconciliation) -- every cited path exists on disk. Hallucinated paths from stale `Related Existing Docs` tables are gone.

**Phase 3** (adherence-check):
- `/code does the CLAUDE.md Haiku 4.5 rule hold?` returns an adherence report with:
  - The constraint verbatim + cited to CLAUDE.md
  - At least one match cited to a real code entity
  - Zero contradictions auto-resolved -- if any exist, both positions are preserved

**Phase 4** (conventions):
- Every structural-map bundle includes a `conventions` sub-section listing at least the naming schema of the target module + one detected base-class idiom.
- A `capability.reuse-check` for a topic the repo already covers surfaces the existing module in the bundle's `structure` layer.

**Overall** (post-Phase 6):
- Bundle wall-clock time: <60s for XS / S, <3min for M / L, <10min for XL (vs current 3-15 min baseline).
- Zero cited paths that don't exist on disk in any bundle (this is the "trust doc metadata as ground truth" bug fix, verified by a lint pass).
- Every claim in the bundle traceable to an exploration output (verified by lint).

## 10. Not doing

- **No new bundle wire shape.** The `AnalyzeContextBundle` 7-layer output is unchanged. Downstream (planner, executor, aggregator) sees the same shape. Wire-compat guaranteed.
- **No new shaper models.** qwen3.6:35b-a3b stays. Explorations that need LLM use the same model with tighter prompts.
- **No parallel LLM calls.** Deterministic explorations may run concurrently; LLM-backed explorations run serially per the project's memory rule (`no_parallel_llm_calls`).
- **No cross-repo exploration.** V1 is repo-scoped (per docs-module plan Section 6.3). Explorations use the shaper's `closureRepos = [repoPath]`. Cross-closure widening is a future revision.
- **No LLM-driven exploration invention.** The decomposer picks from a fixed catalog; it does not invent new exploration types. If the current catalog doesn't cover a case, the fallback is `freeform.probe` -- adding a new type is a plan-doc-level change.
- **No retriever tuning.** The docs retriever (`analyze/docs-retrieval.ts`) is used by `doc.mention` / `doc.decision.trace` / `doc.constraint.enumerate` as-is. Retriever quality improvements are orthogonal.

## 11. Design decisions locked

- **The decomposer picks from a fixed catalog.** The LLM's decision surface is bounded to (a) which answerType, (b) which explorations from the type's recipe, (c) how to fill their params. No open-ended reasoning about the repo.
- **Every exploration returns typed output.** No prose payloads. Cacheable + composable + linter-checkable.
- **Synthesizer cannot introduce ungrounded claims.** Every citation in the bundle must appear in some exploration output. Enforced by a post-synthesis lint pass in the driver.
- **Reuse of existing template runtimes.** `doc.decision.trace` + `doc.constraint.enumerate` are already implemented; extract shared runners rather than duplicating.
- **No feature flags.** Per the project's memory (`feedback_no_feature_flags`) -- when a phase lands, it replaces the old path for its target. Legacy code is deleted, not gated.
- **Shaper tool loop stays available only as `freeform.probe`.** Not the primary navigation mechanism after Phase 6.

## 12. Open questions

- **Answer-type classifier quality.** The decomposer's job includes picking an `AnswerType`. Is 1 LLM call reliable enough, or do we need a small pre-classifier (heuristic-first, LLM-backed fallback)? Empirical after Phase 1.
- **Exploration timeout policy.** What happens when a deterministic exploration hangs (e.g. graph query on a pathological structure)? Proposal: hard-cap each exploration at 30s; timeout produces a typed error the synthesizer renders in the bundle as "exploration X failed: timeout".
- **Freeform.probe scope discipline.** The fallback exploration reintroduces the 40-turn tool loop. Cap it at 10 turns? Require the decomposer to emit an explicit purpose sentence for it, so we can lint bundle claims against that purpose?
- **Deterministic exploration parallelism.** Node's event loop handles I/O concurrency fine. The `no_parallel_llm_calls` rule applies only to Ollama calls. Do we parallelize deterministic explorations by default? Proposal: yes, with a shared LMDB-read semaphore to prevent txn contention.
- **Convention detection quality.** How much can we detect deterministically? Naming schemas (regex + graph stats) -- yes. Base class idioms (inheritance depth + subclass count) -- yes. Factory patterns (name suffix + return-type analysis) -- yes. Semantic conventions (e.g. "this codebase uses Result types for error handling") -- maybe needs a narrow LLM call.
- **What about the classification shaper?** The classifier's own context bundle (target-agnostic workspace inventory) is a data-inventory-like flow. Fold into Phase 5's inventory recipes? Or leave as legacy since the classification shaper is small already?
- **Scope-band interaction.** The synthesizer's per-layer caps are scope-band-aware (from the docs-module tuning). Do explorations themselves need scope-band awareness (e.g. `import.graph` depth = scope-band-mapped)? Probably yes for structural explorations; deferred to first empirical data.

## 13. Concrete Phase 1 implementation sketch

To make Phase 1 immediately actionable, the concrete files + changes:

**New files:**

- `src/insrc/analyze/explore/types.ts` -- `Exploration`, `ExplorationOutput`, `ExplorationPlan`, `ExplorationType` unions
- `src/insrc/analyze/explore/concept-resolve.ts` -- `resolveConceptExploration(params)` returns ranked paths
- `src/insrc/analyze/explore/module-profile.ts` -- `runModuleProfile(params)` returns tree + exports + entrypoints
- `src/insrc/analyze/explore/symbol-locate.ts` -- `runSymbolLocate(params)` returns entity refs
- `src/insrc/analyze/explore/import-graph.ts` -- `runImportGraph(params)` returns in/out degree summary
- `src/insrc/analyze/explore/executor.ts` -- `runExploration(exp)` dispatches to the per-type runner + writes to cache
- `src/insrc/analyze/explore/index.ts` -- barrel
- `src/insrc/analyze/context/decomposer.ts` -- `decompose(intent) -> ExplorationPlan`; Phase 1 only emits `structural-map`
- `src/insrc/analyze/context/synthesizer.ts` -- `synthesize(intent, plan, outputs) -> AnalyzeContextBundle`
- `src/insrc/prompts/analyze/decompose.system.md` -- decomposer prompt with the 8 answer types + Phase 1's recipe for `structural-map`
- `src/insrc/prompts/analyze/synthesize.code.system.md` -- code-target synthesizer prompt
- `src/insrc/db/exploration-cache.ts` -- LMDB CRUD for the exploration cache sub-DB

**Modified files:**

- `src/insrc/analyze/context/driver.ts` -- `runShaper` grows a branch: when the decomposer emits a plan whose recipe is Phase-1-supported, run the new pipeline; otherwise fall back to the legacy tool-loop shaper. Same output.
- `src/insrc/db/graph/store.ts` -- register `explorationCache` sub-DB (transparent add, no schema-version bump).
- `src/insrc/analyze/context/boot-validator.ts` -- validate the new `decompose.system.md` + `synthesize.code.system.md` prompts.
- `src/insrc/analyze/context/types.ts` -- add `AnswerType` union to `ShapeOpts` for internal dispatch.

**Test coverage:**

- Unit tests for each Phase-1 exploration (fixture-backed, matches the docs-module test style)
- Unit tests for the decomposer prompt / schema validation
- Integration test: run `analyze.context.buildRun` with `target='code', intent.focus='payable extraction module'` against a seeded LMDB fixture that mirrors insors-extraction's structure; assert the bundle centers on the expected module.
- Live test (gated behind `INSRC_LIVE_TESTS=1`): rerun Test 3 against a real insors-extraction index.

**Approximate scope:** ~1500 LOC new code, ~200 LOC refactor. Two commits: one for the exploration infrastructure + Phase 1 explorations, one for the decompose/synthesize wiring + driver refactor.

---

Approval gate: this doc gets reviewed. Once approved, Phase 1 lands in one PR, Test 3 gets re-run, and the empirical result gates entry to Phase 2.
