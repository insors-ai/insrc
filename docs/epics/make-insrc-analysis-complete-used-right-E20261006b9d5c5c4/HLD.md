<!-- insrc:artifact HLD-b9d5c5c40df5a574 -->

# HLD: make-insrc-analysis-complete-used-right

## Summary

Every analyzer lookup returns all of its results together with one common record saying whether they are complete and what they rest on. The analyzer then measures the results it actually got, and that measurement, not a guess from the wording, decides how the answer is produced: at once when the results are small enough to reason over together, or part by part and then combined when they are not. The answer's layout is chosen by the kind of question as well as the kind of source, a question asking for every occurrence is listed directly from the results, and every answer opens with a short report of its size, how it was handled and whether it is complete.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Shared contracts](#4-shared-contracts)
5. [Story boundaries](#5-story-boundaries)
6. [Non-functional targets](#6-non-functional-targets)
7. [Rollout](#7-rollout)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Problem context

> See **DEF-b9d5c5c40df5a574** § 1. Problem

## 2. Framework summary

Three records carry the design, and both paths into the analyzer use them. A completeness record on every lookup result replaces today's mix of truncated flags, totals and free-text notes: it says whether the result is complete, how many items exist and were returned, why any are missing, and what the result rests on (text on disk, the stored graph, the document index, a live data source). No recipe, planning prompt or layout keeps a limit, and a lookup that cannot run is always the existing failed output with its reason, never an empty result. A request measure is taken from the completed deterministic lookups of a request (items, files, characters) and mapped to the existing five sizes, replacing the wording-and-repository guess on the orchestrator path and the fixed default on the agent-tool path; a request that cannot be measured is treated as the largest size and says so. An answer report heads every answer: the measure and size, how the request was handled and in how many parts, and one overall completeness statement derived from the lookups' records.

Handling is a stated table from size to method. Up to the size a model can reason over together, the answer is written in one pass, exactly as today. Above it, the results are divided into parts along file and directory boundaries, each part is reasoned over in turn, and the framework's existing aggregation step combines the findings; a failed part is kept out of the combined answer and named in the report. A single item too large for one pass is read in consecutive sections under the same rule. Layouts are selected by question kind and source kind together; a new question kind, enumeration, is rendered directly from lookup results with no model in the path, and the six existing layouts and the older per-source layouts lose their limits and describe every lookup they may draw on.

## 3. Architecture shape

The change sits inside the existing analyze framework and adds no new subsystem. In the exploration pipeline (decomposer, executePlan, synthesizer) the order becomes: plan the lookups; run the deterministic ones in full; build the request measure from their outputs; choose the handling method from the measure; then either synthesize once or partition, synthesize each part serially, and aggregate; finally render with the layout chosen for the question kind and source kind, headed by the answer report. The orchestrator path keeps its plan tree and child plans, but its scope comes from the same measure instead of pickScope's repository-wide counts, and its per-scope bands keep governing only how many tasks a plan may have. The MCP agent tools reach the same code: insrc_analyze_step measures after its plan phase instead of assuming size M, and for a request handled in parts it hands the caller one part at a time through the narrow turn it already has. Recipes keep their runner table and cache; each returns the completeness record and takes no limit parameter. The shared grep primitive gains an unlimited mode that only the analyzer's recipes use, so the search tool exposed to other callers keeps its own limits. Recipes that read the stored graph mark their results as resting on the graph, because the graph's own completeness is a separate defect (ISSUE-12f70133491114c9) outside this Epic.

## 4. Shared contracts

### 4.1 sc1: Completeness record

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The one statement every lookup result carries about whether it is complete, replacing truncated flags, totals and not-found notes; also the rule that a lookup which cannot run is the failed output, never an empty result.

**Interface sketch (type-level):**

```
interface Completeness {
  readonly complete: boolean;
  readonly total: number | null;        // items that exist; null when it cannot be counted
  readonly returned: number;
  readonly reason?: string | undefined; // required when complete is false
  readonly basis: 'text' | 'graph' | 'doc-index' | 'data-source' | 'filesystem';
  readonly basisNote?: string | undefined; // e.g. the graph's own coverage is not established
}
interface WithCompleteness { readonly completeness: Completeness }
// every ExplorationOutput except 'failed' and 'unsupported' extends WithCompleteness
```

**Assumptions cited:** [[c1]]

### 4.2 sc2: Answer report

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The header every answer carries: overall completeness derived from the lookups, the measured size and its counts, and how the request was handled. Owned by the first Story so that sizing, handling and layout can each fill and render their part.

**Interface sketch (type-level):**

```
interface AnswerReport {
  readonly completeness: { readonly complete: boolean; readonly incomplete: readonly { readonly explorationId: string; readonly reason: string }[]; readonly failed: readonly { readonly explorationId: string; readonly reason: string }[] };
  readonly measure?: RequestMeasure | undefined;     // filled by sizing
  readonly handling?: HandlingReport | undefined;    // filled by handling
}
```

### 4.3 sc3: Request measure

**Owner Story:** `s2`
**Consumed by:** `s3`

**Purpose:** What a request actually touched, taken from its completed lookups, and the size it maps to.

**Interface sketch (type-level):**

```
interface RequestMeasure {
  readonly items: number;
  readonly files: number;
  readonly characters: number;
  readonly size: 'XS' | 'S' | 'M' | 'L' | 'XL';
  readonly determined: boolean;          // false: could not be measured, size is 'XL'
  readonly note?: string | undefined;
}
```

**Assumptions cited:** [[c2]]

### 4.4 sc4: Handling report

**Owner Story:** `s3`

**Purpose:** How a request was handled: at once or in parts, how many parts, and which parts were not covered.

**Interface sketch (type-level):**

```
interface HandlingReport {
  readonly method: 'single-pass' | 'partitioned';
  readonly parts: number;
  readonly partitionedBy?: 'directory' | 'file' | 'section' | undefined;
  readonly notCovered: readonly { readonly part: string; readonly reason: string }[];
}
```

**Assumptions cited:** [[c10]]

### 4.5 sc5: Question kind and layout selection

**Owner Story:** `s4`

**Purpose:** The kinds of question an answer can be laid out for, including enumeration, and the rule that a layout is chosen by question kind and source kind together.

**Interface sketch (type-level):**

```
type QuestionKind = 'structural-map' | 'adherence-check' | 'decision-trace' | 'capability-discovery' | 'how-does-it-work' | 'prose-retrieval' | 'data-inventory' | 'infra-inventory' | 'enumeration';
interface LayoutKey { readonly question: QuestionKind; readonly source: 'code' | 'docs' | 'data' | 'infra' | 'generic' }
interface LayoutChoice { readonly key: LayoutKey; readonly rendered: 'by-model' | 'direct' }
```

## 5. Story boundaries

### 5.1 Story E20261007b9d5c5c4:S001

**Owns:** `sc1`, `sc2`

Removing the limits from each recipe and from the cuts on item content, and the limit parameters and their examples from the planning prompt; returning the completeness record from each recipe, with the basis each rests on; turning every swallowed error into the failed output; the unlimited mode of the shared grep primitive for the analyzer's two text recipes, leaving the search tool's own limits alone; deriving the answer report's overall completeness from the lookups' records; reading a single large item in full. The exploration cache's stored shape changes with the outputs.

### 5.2 Story E20261007b9d5c5c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

Taking the measure from completed deterministic lookups; the mapping from counts to the five sizes; using the measure in place of the scope picker's repository-wide counts on the orchestrator path and in place of the fixed default on the agent-tool path; the unmeasurable case; filling the measure into the answer report.

### 5.3 Story E20261007b9d5c5c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The table from size to handling method and the size above which results are handled in parts; how results are divided along directory and file boundaries and a single large item into sections; reasoning over parts serially and combining them through the existing aggregation step; keeping a failed part out of the combined answer; how the agent tool hands the caller one part at a time; filling the handling report.

### 5.4 Story E20261007b9d5c5c4:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results; choosing a layout by question kind and source kind; removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema; making each layout describe every lookup it may draw on, with that reference at the end of the prompt; rendering the answer report at the head of every answer, including whatever measure and handling fields are present.

## 6. Non-functional targets

- **Performance:** A request small enough for one pass makes the same model calls as today. A request handled in parts makes one call per part plus the combination, serially; that time is accepted because accuracy comes before cost. Deterministic lookups run in full before sizing, so an unlimited text search over a large repository is the cost of sizing.
- **Security:** No change: lookups stay inside the repository's dependency closure and the existing scope checks on paths remain.
- **Observability:** Every answer states its measured size, its handling method and part count, and its completeness; each lookup result states its own. A failed lookup or part carries its reason.
- **Durability:** Cached lookup outputs written before this change lack the completeness record and are treated as absent, not as complete.

## 7. Rollout

**Phase A — complete lookups and the completeness record**

**Stories:** `s1`

Everything else reads the completeness record and the answer report, and nothing downstream can be trusted while lookups still drop results.

**Backward compat:** Lookup outputs change shape: the truncated flags, totalCallers and not-found notes are replaced by the completeness record, so every reader of those outputs (the six layouts, the agent-tool phases, the exploration cache) is updated in the same phase; cached outputs without the record are treated as absent. The limit parameters disappear from the planner's catalog; a plan that still passes one has it ignored. The search tool exposed to other callers keeps its limits. Answers gain a completeness line and are otherwise laid out as before.

**Phase B — answer layouts by question kind**

**Stories:** `s4`

Depends only on Phase A, removes the last place results are held back, and gives the direct enumeration answer; it can be built alongside Phase C.

**Backward compat:** The seven-layer bundle stays the shape of a model-written answer, so callers that read its layers keep working. The enumeration answer is a new shape that only a request classified as enumeration receives. Layout limits are removed, so answers to large questions get longer.

**Phase C — measured sizing**

**Stories:** `s2`

Needs complete lookups to measure from; must land before handling by size.

**Backward compat:** The five size names are unchanged. A request's size can differ from what the scope picker or the fixed default gave, which changes how many tasks the orchestrator plans. A caller that passes a size explicitly has it recorded as a hint and the measured size is used.

**Phase D — handling by size**

**Stories:** `s3`

Needs both the completeness record and the measure.

**Backward compat:** A request small enough for one pass behaves as before. A larger one takes longer and, through the agent tool, takes more turns, one per part.

**Ordering rationale:** s1 owns the two records every other Story reads, so it is first. s4 depends only on s1 and s2 only on s1, so Phases B and C are independent of each other and are ordered B then C only so that the layouts are free of limits before larger answers start flowing through them. s3 consumes s2's measure and comes last. This follows the Epic's dependency edges (s2 on s1; s3 on s1 and s2; s4 on s1) and the contract ownership (sc1 and sc2 at s1, sc3 at s2, sc4 at s3, sc5 at s4).

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Unlimited lookups on a large repository | A text search or a caller list with no limit can return a very large result, and today every output is placed whole into one model prompt. | Phase A removes the limits and states completeness; until Phase D lands, a result too large to place in one prompt is reported as not covered in the answer report with its count, never cut silently. Phase D then handles it in parts. |
| Combining parts without losing or duplicating findings | The aggregation step is a model call; it could drop a part's finding or merge two that differ. | Each part's findings are kept as cited records, the combination is checked against them (every part's findings accounted for), and the handling report names any part not covered. Enumerations bypass the model entirely. |
| Completeness that rests on the stored graph | The graph is known to miss cross-file import and call edges (ISSUE-12f70133491114c9), so a caller list can be complete with respect to the graph and still wrong. | The completeness record carries what a result rests on, and graph-based results carry a note that the graph's own coverage is not established; the layouts print that note. The note is removed when that issue is fixed. |

## 8. Alternatives considered

### 8.1 a1: Complete results with a shared completeness statement, measured sizing, and partition-then-combine inside the analyzer — **CHOSEN**

Every lookup returns all results with one common completeness record; the analyzer measures the result set it actually got and, above a size it can reason over at once, splits it into parts, reasons over each in turn and combines them.

Every recipe output carries the same completeness record (complete or not, how many exist, how many were returned, why any are missing, and what the answer rests on, such as text on disk or the stored graph), and a lookup that cannot run is always the existing failed output, never an empty one. Limits come out of the recipes, the planning prompt and the layouts. Sizing stops being a guess: the deterministic lookups of a request are run first, since they are complete and cheap, and the request's size is read from what they returned (hits, files, entities, characters). That one measure is used on both paths into the analyzer, including the agent tools.

The size then selects how the answer is produced, by a stated table: a result set small enough to reason over at once is answered in one pass, as today; a larger one is divided into parts along a natural boundary (by file or directory), each part is reasoned over in turn, and the existing aggregation step combines the findings into one answer that reports how many parts there were and whether any failed. The answer layout is chosen by the kind of question and the kind of source together, and a question that asks for every occurrence is laid out directly from the results without a model rewriting it.

**Pros:**
- Completeness is established by the analyzer itself and stated in one place every reader can check
- Reuses the child-plan and aggregator mechanism the framework already has for large plans
- A small request is handled exactly as today, with no extra model calls
- An exhaustive list is produced without a model in the path, so nothing in it can be dropped or reworded

**Cons:**
- Every recipe's output type and every layout prompt changes, so the change is wide
- A large request takes more model calls, one per part plus the combination, run serially
- The threshold between 'at once' and 'in parts' must be chosen and justified
- Results that read the stored graph can only claim completeness with respect to the graph, which is known to be incomplete until ISSUE-12f70133491114c9 is fixed

**Cost estimate:** L

### 8.2 a2: Paged results the caller walks

Each lookup returns a page and a cursor with the total; the caller, a model or a workflow step, asks for further pages until it has them all.

Recipes keep a page size but lose their maximum: each returns one page, the total count and a cursor for the next page. Completeness is the caller's to achieve by following cursors. The analyzer's own answer writer does the same when it needs more than one page, and the agent tools expose the cursor so an agent can continue.

Sizing comes from the total the first page reports. Layouts are changed to state how many of the total they cover. No partitioning is introduced: a large result is consumed page by page by whoever asked.

**Pros:**
- Smallest change to each recipe: add a total and a cursor
- No single response becomes very large
- The total count gives a measured size for free

**Cons:**
- Completeness depends on the caller choosing to follow every cursor; a caller that stops early has a partial answer that looks finished, which is the present defect in another form
- A model walking pages still has to hold all of them to reason over the whole, so the too-large-to-reason-at-once case is not solved
- Adds turns to an exchange that is already several turns long

**Cost estimate:** M

**Rejected because:** Removes the ceiling but makes completeness depend on the caller following every cursor, and leaves the too-large-to-reason-at-once case unsolved.

### 8.3 a3: Raise the limits and report truncation

Keep limits but set them very high, add a truncated flag and total to every recipe, and have layouts say when they were cut.

Each recipe keeps a ceiling, raised by one or two orders of magnitude, and every output gains a truncated flag and a total. Failed lookups are reported as failed. Layout limits are raised and each layout must print a notice when any input was truncated.

Sizing uses the totals. Nothing is partitioned: a request beyond the raised ceilings is answered from the first results and marked partial.

**Pros:**
- Least effort and least risk to existing behaviour
- A reader can at least see that an answer is partial

**Cons:**
- Results are still dropped above the ceiling, which the stakeholder ruled out in terms
- The large case is reported as partial, not handled in full
- A ceiling chosen today is wrong for a larger repository tomorrow

**Cost estimate:** S

**Rejected because:** Keeps a ceiling, so results are still dropped above it, which the stakeholder ruled out.

## 9. References

- **[[c1]]** `prior-artifact` `DEF-b9d5c5c40df5a574 citation c1: the 16 result limits and 8 content cuts in src/analyze, by file and line`
- **[[c2]]** `code` `src/analyze/classifier/scope-picker.ts` — "readonly totalEntityCount: number;"
- **[[c3]]** `doc` `CLAUDE.md` — "Accuracy is primary; cost is the least priority."
- **[[c4]]** `doc` `design/analyze-context-builder.md` — "The shaper has **no token budget, no summarize-down, no truncation knobs**."
- **[[c5]]** `stakeholder` `user, 2026-10-06` — "Analyzer's text search is capped, why? this will result in inconsistencies/incorrect analysis. REMOVE ANY CAPS from insrc analyzer."
- **[[c6]]** `stakeholder` `user, 2026-10-06` — "Analyzer should scope the size the of the request - Have plans for handling different sizes. - Check the analyzer output template, there are different types of analyzers that were developed."
- **[[c7]]** `stakeholder` `user, 2026-10-06` — "the agent needs to be able to differentiate between and analysis request and a simple search"
- **[[c8]]** `analyze-bundle` `s1: insrc_analyze_step structural-map run of 2026-10-07 over src/analyze (module.profile, four import.graph, four usage.example, convention.detect)`
- **[[c9]]** `doc` `site/analyze.html` — "Every claim is grounded in a real exploration output"
- **[[c10]]** `doc` `design/analyze-plan-builder.md` — "its terminal aggregator's output becomes the value materialized at"
- **[[c11]]** `code` `src/mcp/analyze-step/phases/start.ts` — "const scope  = input.scope  ?? 'M';"
- **[[c12]]** `code` `src/analyze/context/driver.ts` — "const synthesizeTarget: 'code' | 'docs' | 'adherence' | 'capability' | 'data' | 'infra' ="
- **[[c13]]** `code` `src/analyze/explore/executor.ts` — "export async function executePlan(args: ExecutePlanArgs): Promise<ExecutedPlan> {"
- **[[c14]]** `code` `src/analyze/explore/types.ts` — "readonly truncated: boolean;"
- **[[c15]]** `code` `src/daemon/tools/builtins/search/grep.ts` — "const MAX_LIMIT = 5000;"
- **[[c16]]** `prior-artifact` `ISSUE-12f70133491114c9, filed 2026-10-07: the code graph loses cross-file import and call edges`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**7 do not hold · 0 could not be verified · 7 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T05:09:15.049Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | On the orchestrator path the scope can come from the measure of completed deterministic lookups in place of pickScope. | The branch that calls pickScope builds the intent with 'focused: false' (orchestrator/driver.ts:219), and the exploration pipeline exits for such an intent: 'if (intent.focused !== true) return null;' (context/driver.ts:1102), falling to the legacy shaper tool loop. So on exactly the path where pickScope runs, executePlan never runs and there are no deterministic lookups to measure; under the HLD's own rule every such request is 'unmeasurable' and becomes XL. Separately, the scope is consumed before any lookup: it is fixed at classify (driver.ts:216-222), then passed to shaper.buildRunBundle({ intent }) (line 271) and runRecursivePlanner (line 294); the lookups run inside buildRunBundle. [files: src/analyze/orchestrator/driver.ts, src/analyze/context/driver.ts] | Redesign orchestrator sizing in s2: either define a measuring pass that runs for unfocused intents before the bundle and planner (which lookups, from what plan), or keep a separate sizing source for that path and say so. State the new stage order in runAnalyze and what the decomposer receives as scope before the measure exists. |
| coverage-of-intent | MED | S001 ac4 (a single large item is read in full, whole content taken into account) and the non-goal 'no removing input-protecting limits without a replacement' are both met by the phase that removes the cuts (Phase A / s1). | DEF S001 ac4: 'its whole content is taken into account, not only its beginning'. HLD 5.1 gives s1 'reading a single large item in full' and removal of the content cuts, but HLD 5.3 gives s3 'a single large item into sections', and the risk table says 'until Phase D lands, a result too large to place in one prompt is reported as not covered'. Today synthesizer.ts:228 places every output whole into one prompt ('JSON.stringify(r.output, null, 2)'). So between Phase A and Phase D the cut is removed with no replacement and ac4 is answered by 'not covered'. The 'too large for one prompt' threshold and the notCovered field belong to sc4/s3, and the measure to sc3/s2; nothing in s1's contracts (sc1, sc2) can carry or decide it. [files: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md, src/analyze/context/synthesizer.ts] | Either move sectioned reading of a single item into s1 (with its own threshold and a place in sc2 to report it), or state that s1's ac4 is only met when s3 lands and re-scope s1's acceptance in the Define; name which contract field carries the interim 'not covered' in Phase A. |
| new-versus-reuse | MED | The framework's existing aggregation step can combine per-part findings inside the exploration pipeline (decomposer, executePlan, synthesizer) while a model-written answer stays the seven-layer bundle. | The aggregator belongs to the other pipeline: it is a plan-tree task runtime ('Terminal aggregator for code-target plans', aggregate-report.ts) run by executor/walker.ts. runAggregator takes 'upstreamOutputs: ReadonlyMap<string, unknown>' of plan tasks plus a per-target prompt and returns 'AggregateReport { summary, findings, metadata }' (aggregator.ts:114-123), not an AnalyzeContextBundle. tryExplorationPipeline (context/driver.ts:1083-1260) goes decompose -> executePlan -> synthesize with no aggregation step. renderUpstreamSection also stringifies every upstream output whole into one prompt (aggregator.ts:175), so combining many parts can itself exceed one pass. [files: src/analyze/runtimes/shared/aggregator.ts, src/analyze/runtimes/code/aggregate-report.ts, src/analyze/context/driver.ts, src/analyze/executor/walker.ts] | Say what is actually reused (the provider role and prompt pattern, or nothing) and design a combine step for the exploration pipeline: its input (cited per-part findings), its output shape (seven-layer bundle), its own size rule, and what happens when the combine call fails. |
| new-versus-reuse | MED | insrc_analyze_step can hand the caller one part at a time 'through the narrow turn it already has'. | The narrow turn is bound to one exploration: narrow.ts:78 rejects when 'input.explorationId !== state.narrow.explorationId', line 89 requires 'getNarrowRunner(state.narrow.explorationType)' (only doc.decision.trace, doc.constraint.enumerate, capability.reuse-check are registered, executor.ts:306), line 132 writes the result into the exploration cache, and line 171 resumes stepPlan. It runs before synthesis and always ends in emit_bundle (plan.ts:205). A synthesis part has no exploration id, no runner, and must not be cached as an exploration output. [files: src/mcp/analyze-step/phases/narrow.ts, src/mcp/analyze-step/phases/plan.ts, src/analyze/explore/executor.ts] | Design a distinct part turn (state stage, input shape, schema, how per-part outputs accumulate, how the final combine is emitted) or state exactly how the narrow phase contract is extended; also state how a direct enumeration answer is returned from the plan phase, which today can only return emit_bundle, emit_narrow or error. |
| change-sites | MED | The inventory of fixed-default and layout-selection sites is complete (start.ts for the default, context/driver.ts for the layout key). | Three more fixed defaults exist: the one-shot insrc_analyze tool, mcp/server.ts:1294 'scope:     args.scope ?? 'M','; daemon/workflow-rpc.ts:552 'scope:     'M','; explore/freeform-probe.ts:100 'scope:    'M','. Layout selection is implemented twice: context/driver.ts:1222 (synthesizeTarget) and mcp/analyze-step/synthesizer-key.ts:37 refineSynthesizerKey, used by plan.ts:118. The HLD names only start.ts (c11) and context/driver.ts (c12). [files: src/mcp/server.ts, src/daemon/workflow-rpc.ts, src/analyze/explore/freeform-probe.ts, src/mcp/analyze-step/synthesizer-key.ts] | List all four default sites and both selection sites in s2 and s4, and say whether the one-shot tool and the workflow RPC are measured the same way. |
| change-sites | MED | The Define's c1 inventory (16 result limits, 8 content cuts), which s1 relies on, covers every place results or content are dropped. | The listed constants do exist (e.g. search-text.ts:39-40, symbol-locate.ts:37-38, concept-resolve.ts:64). Not listed: grep.ts:107 '.slice(0, 500)' on each hit line, grep.ts:102 'if (stat.size > 2 * 1024 * 1024) { continue; }', silent skip of unreadable files (grep.ts:111) and per-file 'argv.push('-m', String(opts.limit))' (line 178); doc-mention.ts:39-40 DEFAULT_PREVIEW_CHARS=300 / MAX_PREVIEW_CHARS=1_500; capability-reuse-check.ts:303 'exports.slice(0, 5)' and 348-350 'slice(0, 8)'; db-table-describe.ts:175/181 'slice(0, 8)' / 'slice(0, 5)'; docs-retrieval.ts:290 '.slice(0, maxResults)'; family-summarise.ts:162 '.slice(0, 20)'; the maxSources parameter of doc.decision.trace / doc.constraint.enumerate (executor.ts:315, 337); decompose.system.md:249 'bound the fan-out to ≤5 connections'. An unlimited grep mode that only lifts the hit limit would still report complete while skipping large files and cutting lines. [files: src/daemon/tools/builtins/search/grep.ts, src/analyze/explore/doc-mention.ts, src/analyze/explore/capability-reuse-check.ts, src/analyze/explore/db-table-describe.ts, src/analyze/docs-retrieval.ts, src/analyze/runtimes/docs/family-summarise.ts, src/prompts/analyze/decompose.system.md] | Extend the inventory in s1 with these sites, and specify the unlimited grep mode fully: hit limit, per-file -m, line cut, 2 MB skip and skipped-file reporting, in both the ripgrep and the Node fallback path. |
| boundaries | MED | The HLD's Story boundaries refer to the Define's Stories and keep its ownership and dependency edges. | The Define's Story ids are 'E20261006b9d5c5c4:S001' to ':S004' (16 occurrences, matching the folder anchor E20261006b9d5c5c4). The HLD's section 5 headings are 'Story E20261007b9d5c5c4:S001' to ':S004', a different date anchor, so the four boundaries name Stories that do not exist upstream. The edges themselves match the Define (s2 on s1; s3 on s1 and s2; s4 on s1) and no contract is owned twice. [files: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md, docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/HLD.md] | Regenerate the HLD's Story ids from the Define's anchor (E20261006) before any design.story run resolves a Story by id. |

#### Could not verify (does not block)

_None._
