<!-- insrc:artifact HLD-b9d5c5c40df5a574 -->

# HLD: make-insrc-analysis-complete-used-right

## Summary

The work is ordered so that no limit is removed before the analyzer can handle what it lets through. First every lookup result, every analysis step and every answer says honestly whether it is complete, on both paths a request can take. Then the analyzer measures what a request actually touches, and that measurement decides how the answer is produced: at once when the results are small enough to reason over together, or part by part and then combined when they are not. Only then are the limits taken out. Finally the answer's layout is chosen by the kind of question as well as the kind of source, and a question asking for every occurrence is listed directly from the results.

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

Three records carry the design, and both paths into the analyzer use them: the lookup pipeline that serves focused requests and the agent tools, and the plan tree that serves unfocused requests. A completeness record on every lookup result and every plan-task result replaces today's mix of truncated flags, totals, free-text notes and log lines: it says whether the result is complete, how many items exist and were returned, why any are missing, what was skipped or only partly read, and what the result rests on (text on disk, the stored graph, the document index, a live data source). A lookup that cannot run is always the existing failed output with its reason, never an empty result, and a failure to write the answer is reported with what was found, not passed silently to another way of answering. An answer report heads every answer on both paths: one overall completeness statement derived from those records, the measured size, and how the request was handled.

A request measure says what a request touches and maps it to the existing five sizes. It has two sources, because the size is needed at two different moments. A request that plans lookups up front is measured from what those lookups returned. A request that plans none up front (an unfocused request on the plan-tree path, where the size is needed before planning) is measured from the area it names: the files and entities the graph store holds under the path or repo it points at. No size is taken from the wording or assumed; a request that cannot be measured is treated as the largest size and says so.

Handling is a stated table from size to method, on both paths. Up to the size a model can reason over together, the answer is written in one pass, as today. Above it, the results are divided into parts along file and directory boundaries, each part is reasoned over in turn, and a combine step joins the per-part results into one answer; a failed part is kept out and named in the report. A single item too large for one pass is read in consecutive sections under the same rule. Once that handling exists the limits are removed: no lookup, plan-task runtime, planning prompt or text search keeps a limit on how many results it returns or how much of an item it reads. Last, layouts are selected by question kind and source kind together; a new question kind, enumeration, is rendered directly from lookup results with no model in the path, and the layouts lose their limits and describe every lookup they may draw on.

## 3. Architecture shape

The change sits inside the existing analyze framework and adds no new subsystem. There are two paths, and every Story covers both.

THE LOOKUP PIPELINE (decomposer, executePlan, synthesizer; entered by tryExplorationPipeline for a focused request, src/analyze/context/driver.ts:1083, and by the agent tools). The order becomes: plan the lookups; run them; build the request measure from their outputs; choose the handling method from the measure; then either write the answer once or divide the outputs into parts, write a per-part result for each in turn, and combine them; finally render with the layout for the question kind and source kind, headed by the answer report. Today a failure of the answer-writing call is logged and the request falls through to the older tool loop with no report (src/analyze/context/driver.ts:1254-1258); that fall-through is removed and the failure is returned with the lookup results and the report.

THE PLAN TREE (runAnalyze, src/analyze/orchestrator/driver.ts:80; its only caller is the daemon's analysis request, src/daemon/analyze-rpc.ts:526). Plan tasks are run by per-source runtimes and a terminal aggregator combines them (src/analyze/runtimes/shared/aggregator.ts). Its runtimes return task results, a different type from lookup outputs, so the completeness record is carried on the task result as well, and the answer report names an incomplete or failed source by either a lookup id or a task id. The aggregator places every task output whole into one prompt (:160-178); it gets the same size rule as the lookup pipeline's combine step, combining in stages when its inputs are too large for one pass. The final report (typed unknown today, src/analyze/orchestrator/types.ts:230) gains the answer report.

SIZING. On the plan tree the size is fixed at classification, before the bundle is built and the planner runs, in two branches: with a target hint the scope picker's model call chooses it (driver.ts:172-222), and without one the classifier's model call returns it as a required field (driver.ts:234; src/analyze/classifier/schema.ts:42-46). A measuring pass is placed after both branches and its result is the size: it counts the files and entities the graph store holds under the path or repo the request names (the store returns a repo's entities with their file paths, src/db/entities.ts:779; today's picker counts the whole repo even for a module or file request, src/analyze/classifier/scope-picker.ts:206-211). The scope picker's model call is removed and the classifier no longer returns a size. A size given on a slash command or by a caller is kept as a hint. The per-size bands keep governing only how many tasks a plan may have. In the lookup pipeline and the agent tools the measure is taken from the lookup results after the plan phase; four places assume size M today and all take the measure (src/mcp/analyze-step/phases/start.ts:49, src/mcp/server.ts:1294, src/daemon/workflow-rpc.ts:552, src/analyze/explore/freeform-probe.ts:100).

THE COMBINE STEP of the lookup pipeline is new. The plan tree's aggregator is not reused for it, because it takes plan-task outputs and returns a findings report, not the seven-layer bundle; the pattern and the provider role are. The combine step takes the cited per-part results, returns the seven-layer bundle, applies the size rule to its own input, and when it fails the per-part results are returned as they are with the failure named in the report.

THE STEP TOOL'S PART TURN. insrc_analyze_step's narrow turn cannot carry parts: it is bound to one lookup, checks that lookup's id, needs a registered runner for it and stores its result in the lookup cache (src/mcp/analyze-step/phases/narrow.ts:78-171). So the step tool gains a distinct part turn with its own stage: after the plan phase a partitioned request returns the first part to write; each part turn returns the next; the last returns the combine; per-part results are kept in the run's state. An enumeration answer needs no model turn, so the plan phase can also return the finished answer.

LAYOUT SELECTION is implemented twice today and both change together: in the context driver (src/analyze/context/driver.ts:1222) and for the step tool (refineSynthesizerKey, src/mcp/analyze-step/synthesizer-key.ts:37).

THE TEXT SEARCH. The shared grep primitive (src/daemon/tools/builtins/search/grep.ts) has two backends and four callers; only the analyzer's two text lookups (search-text.ts:100, config-trace.ts:100) use the new complete mode, so the search tool exposed to other callers and the review probe keep their limits. Lookups that read the stored graph mark their results as resting on the graph, because the graph's own completeness is a separate defect (ISSUE-12f70133491114c9) outside this Epic.

## 4. Shared contracts

### 4.1 sc1: Completeness record

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The one statement every lookup result and every plan-task result carries about whether it is complete; also the rule that a lookup which cannot run is the failed output, never an empty result.

**Interface sketch (type-level):**

```
interface Completeness {
  readonly complete: boolean;            // false whenever limited, skipped or partlyRead is non-empty
  readonly total: number | null;         // items that exist; null when it cannot be counted
  readonly returned: number;
  readonly limited?: { readonly limit: number; readonly reason: string } | undefined; // a limit was reached
  readonly skipped?: readonly { readonly what: string; readonly reason: string }[] | undefined;
  readonly partlyRead?: readonly { readonly what: string; readonly readChars: number; readonly totalChars: number }[] | undefined;
  readonly basis: 'text' | 'graph' | 'doc-index' | 'data-source' | 'filesystem';
  readonly basisNote?: string | undefined; // what the basis excludes by rule, or that its own coverage is not established
}
interface WithCompleteness { readonly completeness: Completeness }
// every ExplorationOutput except 'failed' and 'unsupported', and every plan-task result, extends WithCompleteness
```

**Assumptions cited:** [[c1]]

### 4.2 sc2: Answer report

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`, `s5`

**Purpose:** The header every answer carries on both paths: overall completeness derived from the results, then the measured size and how the request was handled once those exist. Owned by the first Story so that sizing, handling and layout each fill and render their part.

**Interface sketch (type-level):**

```
interface SourceNote { readonly sourceId: string; readonly sourceKind: 'lookup' | 'plan-task'; readonly reason: string }
interface AnswerReport {
  readonly completeness: { readonly complete: boolean; readonly incomplete: readonly SourceNote[]; readonly failed: readonly SourceNote[] };
  readonly answerFailure?: string | undefined;        // the step that writes the answer failed
  readonly measure?: RequestMeasure | undefined;      // filled by sizing
  readonly handling?: HandlingReport | undefined;     // filled by handling
}
```

### 4.3 sc3: Request measure

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** What a request actually touched, from its lookup results or from the area it names, and the size it maps to.

**Interface sketch (type-level):**

```
interface RequestMeasure {
  readonly source: 'lookup-results' | 'named-area';
  readonly items: number;                // lookup results, or entities under the named area
  readonly files: number;
  readonly characters: number | null;    // null for a named-area measure
  readonly size: 'XS' | 'S' | 'M' | 'L' | 'XL';
  readonly determined: boolean;          // false: could not be measured, size is 'XL'
  readonly sizeHint?: 'XS' | 'S' | 'M' | 'L' | 'XL' | undefined; // what a caller asked for
  readonly note?: string | undefined;
}
```

**Assumptions cited:** [[c2]]

### 4.4 sc4: Handling report

**Owner Story:** `s3`
**Consumed by:** `s4`

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

**Owner Story:** `s5`

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

With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Turning every swallowed error into the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step with the lookup results, and removing the silent fall-through to the older tool loop. The lookup cache's stored shape changes with the outputs.

### 5.2 Story E20261007b9d5c5c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, and what the decomposer and planner receive as size at each moment. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer.

### 5.3 Story E20261007b9d5c5c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold.

### 5.4 Story E20261007b9d5c5c4:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`

Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content (the eight sites the Define lists, including the three adherence checks). The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method.

### 5.5 Story E20261007b9d5c5c4:S005

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses.

## 6. Non-functional targets

- **Performance:** A request small enough for one pass makes the same model calls as today, and one fewer on the plan tree, where the model call that picked a size is replaced by a count from the graph store. A request handled in parts makes one call per part plus the combination, serially; that time is accepted because accuracy comes before cost. After the limits are removed, a complete text search over a large repository is the cost of a text lookup.
- **Security:** No change: lookups stay inside the repository's dependency closure and the existing scope checks on paths remain.
- **Observability:** Every answer on both paths states its completeness, its measured size and counts, and its handling method and part count; each lookup and plan-task result states its own completeness. A failed lookup, part or answer-writing step carries its reason.
- **Durability:** Cached lookup outputs written before this change lack the completeness record and are treated as absent, not as complete.

## 7. Rollout

**Phase A — say when a result is incomplete**

**Stories:** `s1`

Everything else reads the completeness record and the answer report, and it is safe to ship alone: no limit moves, results simply stop looking complete when they are not.

**Backward compat:** Lookup and plan-task outputs change shape: the truncated flags, totalCallers, not-found notes and truncation log lines are replaced by the completeness record, so every reader of those outputs is updated in the same phase; cached outputs without the record are treated as absent. Every limit keeps its present value. Answers gain a completeness line. A request whose answer-writing step fails now returns that failure where it used to be answered by the older tool loop.

**Phase B — measured sizing**

**Stories:** `s2`

Needs the answer report to state its result; must land before handling by size.

**Backward compat:** The five size names are unchanged. A request's size can differ from what the scope picker, the classifier or the fixed default gave, which changes how many tasks the plan tree plans. The classifier's output loses its size field. A size passed by a caller is kept as a hint and the measured size is used.

**Phase C — handling by size**

**Stories:** `s3`

Needs the completeness record and the measure; must exist before any limit is removed.

**Backward compat:** A request small enough for one pass behaves as before. A larger one takes longer and, through the step tool, takes more turns, one per part.

**Phase D — remove the limits**

**Stories:** `s4`

Only now can a result of any size be handled in full.

**Backward compat:** Results get larger: a lookup that returned its first thirty hits returns all of them. The limit parameters disappear from the planner's catalog; a plan that still passes one has it ignored. The search tool exposed to other callers and the review's evidence search keep their limits.

**Phase E — answer layouts by question kind**

**Stories:** `s5`

Depends only on Phase A and could be built earlier; it is placed last so that layouts lose their limits once complete results are flowing.

**Backward compat:** The seven-layer bundle stays the shape of a model-written answer. The enumeration answer is a new shape that only a request classified as enumeration receives. Layout limits are removed, so answers to large questions get longer.

**Ordering rationale:** The order is the stakeholder's: say when a result is incomplete, then measure, then handle by size, then remove the limits, then fit the layouts, so that no limit is removed before the analyzer can handle what it lets through. It follows the Epic's dependency edges (s2 on s1; s3 on s1 and s2; s4 on s1 and s3; s5 on s1) and the contract ownership (sc1 and sc2 at s1, sc3 at s2, sc4 at s3, sc5 at s5; s4 owns no contract and consumes four).

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| Combining parts without losing or duplicating findings | The combine step and the aggregator are model calls; either could drop a part's finding or merge two that differ. | Each part's findings are kept as cited records, the combination is checked against them (every part's findings accounted for), and the handling report names any part not covered. Enumerations bypass the model entirely. |
| A text search with no limits on a large repository | With no hit limit, no size skip and its output read in full, a broad pattern can return a very large result and take a long time. | Phase D lands after handling by size, so a large result is divided, not placed whole in one prompt. A search that runs out of time is reported as failed, never as complete. |
| Completeness that rests on the stored graph | The graph is known to miss cross-file import and call edges (ISSUE-12f70133491114c9), so a caller list can be complete with respect to the graph and still wrong. | The completeness record carries what a result rests on, and graph-based results carry a note that the graph's own coverage is not established; the answer prints that note. The note is removed when that issue is fixed. |

## 8. Alternatives considered

### 8.1 a1: Complete results with a shared completeness statement, measured sizing, and partition-then-combine inside the analyzer — **CHOSEN**

Every lookup returns all results with one common completeness record; the analyzer measures the result set it actually got and, above a size it can reason over at once, splits it into parts, reasons over each in turn and combines them.

Every recipe output carries the same completeness record (complete or not, how many exist, how many were returned, why any are missing, and what the answer rests on, such as text on disk or the stored graph), and a lookup that cannot run is always the existing failed output, never an empty one. Limits come out of the recipes, the planning prompt and the layouts. Sizing stops being a guess: the deterministic lookups of a request are run first, since they are complete and cheap, and the request's size is read from what they returned (hits, files, entities, characters). That one measure is used on both paths into the analyzer, including the agent tools.

The size then selects how the answer is produced, by a stated table: a result set small enough to reason over at once is answered in one pass, as today; a larger one is divided into parts along a natural boundary (by file or directory), each part is reasoned over in turn, and the existing aggregation step combines the findings into one answer that reports how many parts there were and whether any failed. The answer layout is chosen by the kind of question and the kind of source together, and a question that asks for every occurrence is laid out directly from the results without a model rewriting it.

**Pros:**
- Completeness is established by the analyzer itself and stated in one place every reader can check
- Follows the divide-then-combine pattern the plan tree already uses for large plans, with a combine step of its own
- A small request is handled exactly as today, with no extra model calls
- An exhaustive list is produced without a model in the path, so nothing in it can be dropped or reworded

**Cons:**
- Every recipe's output type and every layout prompt changes, so the change is wide
- A large request takes more model calls, one per part plus the combination, run serially
- The threshold between 'at once' and 'in parts' must be chosen and justified
- Results that read the stored graph can only claim completeness with respect to the graph, which is known to be incomplete until ISSUE-12f70133491114c9 is fixed
- Covering both paths and removing the limits only after handling exists makes the work five phases

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
- **[[c17]]** `code` `src/analyze/orchestrator/driver.ts` — "focused: false,"
- **[[c18]]** `code` `src/db/entities.ts` — "export async function listEntitiesForRepo(_db: DbClient, repo: string): Promise<Entity[]> {"
- **[[c19]]** `code` `src/mcp/analyze-step/phases/narrow.ts`
- **[[c20]]** `code` `src/analyze/runtimes/shared/aggregator.ts`
- **[[c21]]** `stakeholder` `user, 2026-10-07` — "A, should be able to get the entity count from LMDB right?"
- **[[c22]]** `prior-artifact` `HLD-b9d5c5c40df5a574 first review of 2026-10-07 by the daemon: block, 1 HIGH and 6 MED did not hold; the user decided the two that needed a decision (size an unfocused request from the area it names; reading one large item in full moves to Story s3) and this revision applies all but the story-id rendering, which is a defect in the renderer`
- **[[c23]]** `code` `src/daemon/tools/shell-helper.ts` — "if (stdoutBytes <= maxBytes) {"
- **[[c24]]** `code` `src/analyze/classifier/schema.ts` — "required:   ['target', 'scope', 'focused', 'scopeRef', 'reasoning'],"
- **[[c25]]** `code` `src/analyze/orchestrator/types.ts`
- **[[c26]]** `code` `src/analyze/runtimes/data/discovery-objects.ts` — "const FILE_LIST_LIMIT = 200;"
- **[[c27]]** `stakeholder` `user, 2026-10-07` — "A. Both paths in this epic"
- **[[c28]]** `stakeholder` `user, 2026-10-07: 'go with A' to the order: say when a result is incomplete, measure, handle by size, remove the limits, fit the layouts`
- **[[c29]]** `prior-artifact` `HLD-b9d5c5c40df5a574 second review of 2026-10-07 by the daemon: block, 1 HIGH and 5 MED did not hold; the user decided the two that needed a decision and this revision applies all six`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**7 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T05:38:17.577Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | HIGH | The plan tree serves unfocused requests today, so sizing them from the named area and staging the aggregator builds on a working path. | runAnalyze builds the run bundle before planning (orchestrator/driver.ts:270-271 `shaperFor('run', intent.target)` / `shaper.buildRunBundle(`), which is runShaper in run mode (context/index.ts:111-117). In runShaper an unfocused intent gets no bundle: context/driver.ts:1102 `if (intent.focused !== true) return null;`, then :276 throws ShaperLlmUnavailableError for every run-mode null. The target-hint branch always sets `focused: false` (orchestrator/driver.ts:219). So, barring a bundle-cache hit, an unfocused request fails at the bundle step before the planner or aggregator runs. Read from code, not run. A focused request on the plan tree runs the whole lookup pipeline inside buildRunBundle, so the two paths are nested, not separate. [files: src/analyze/context/driver.ts, src/analyze/orchestrator/driver.ts, src/analyze/context/index.ts] | Confirm by running an unfocused request through analyze-rpc. Then decide in the HLD what builds the run bundle for an unfocused request (it must exist before named-area sizing or aggregator staging can be exercised), and state how the lookup pipeline nested inside a focused plan-tree request is measured and reported. |
| current-behaviour | MED | Today a failure of the answer-writing call falls through to the older tool loop with no report (src/analyze/context/driver.ts:1254-1258), and after the change it is reported 'where it used to be answered by the older tool loop'. | tryExplorationPipeline does return null at :1258, but it only gets that far in run mode (:1089 `if (args.invocationMode !== 'run') return null;`), and the caller then throws instead of running the tool loop: driver.ts:276-282 `if (invocationMode === 'run') { throw new ShaperLlmUnavailableError(`Run-mode exploration pipeline returned no bundle. ...`) }`. The comment at :266-275 says the legacy tool loop is retired for run mode. So the request fails today with a generic, mislabelled 'LLM unavailable' error; nothing answers it another way. Also runShaper is typed `Promise<AnalyzeContextBundle>` (:168), so 'returned with the lookup results and the report' has no carrier yet. [files: src/analyze/context/driver.ts] | Restate today's behaviour as a thrown ShaperLlmUnavailableError that discards the lookup results, correct the Phase A backward-compat line, and say how the failure plus lookup results are returned (new result shape or a typed error) and which callers of runShaper change. |
| current-behaviour | MED | The per-size bands govern only how many tasks a plan may have. | The size also sets how deep the plan tree may recurse: analyze-rpc.ts:411-412 `const rootScope = parsed.rootScope ?? parsed.intent.scope;` / `const cap = cfg.maxPlanDepth[rootScope];`, with defaults 2 to 6 for XS to XL (config-catalog.ts:118-122). The answer layouts print and cap by it too (Define c13: 'HARD CAP per scope: XS ≤10 exports, S ≤25, M ≤60, L ≤120, XL ≤250'; `Scope bucket: <intent.scope>` in six synthesize prompts). [files: src/daemon/analyze-rpc.ts, src/config/analyze.ts, src/config/config-catalog.ts, src/prompts/analyze/synthesize.code.system.md] | List plan depth (maxPlanDepth) as governed by the measured size in s2, and say that a changed size changes recursion depth as well as task count. |
| change-sites | MED | Removing the picker's model call and the classifier's size field means no size is taken from wording on the plan tree. | The planner model still writes a size for every child plan: templates/code/index.ts:113-116 `required: ['target', 'scope', 'focused', 'scopeRef', 'reasoning']` with `scope: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] }` inside childIntent; the same in templates/docs/index.ts:175-181, and recursive.ts:176-188 validates it. That size drives the child's task band. analyze-rpc.ts:1107-1109 also accepts a caller-supplied `intent.scope` over IPC. The design names none of these. [files: src/analyze/planner/templates/code/index.ts, src/analyze/planner/templates/docs/index.ts, src/analyze/planner/recursive.ts, src/daemon/analyze-rpc.ts] | Add the child-intent size to s2: either measure each child's named area when the child plan is spawned, or state why a model-written child size is acceptable. Say what the IPC intent.scope becomes (a hint). |
| data-compatibility | MED | Treating cached lookup outputs without the completeness record as absent is enough to keep the lookup cache correct through all five phases. | The cache has no shape or version check: exploration-cache.ts:14 key is `<repoId u32 BE>\|<repoLastIndexedAt ms u64 BE>\|<paramHash>` and :118-119 returns `row.output` as stored. The Phase A rule is buildable (check for the record on read). Phase D is not covered: an output cached after Phase A carries a record marked limited, and after the limits are removed the same params and same lastIndexedAt still hit that row (executor.ts:190-193), so a cut result keeps being served until the repo is re-indexed. A plan that still passes topK also hashes to a different key than one that does not. [files: src/db/exploration-cache.ts, src/analyze/explore/executor.ts] | State a cache rule for Phase D: bump a version folded into the key, or treat any cached output with `limited` set as absent, and drop ignored limit params before hashing. |
| data-compatibility | MED | The answer report can head every answer on both paths without a stated change to stored answer shapes. | The seven-layer bundle is validated with unknown fields rejected (context/schema.ts:22 'additionalProperties is FALSE so unknown fields fail validation', :89), and a bundle that fails validation is dropped (context/driver.ts:243-249). Bundles are cached on disk and returned as-is on a hit (:193-199). On the plan tree a finished run is replayed from run.json: orchestrator/driver.ts:112-129 returns `cached.finalReport` unchanged. The design says only that the bundle 'stays the shape of a model-written answer' and covers only the lookup cache under Durability. [files: src/analyze/context/schema.ts, src/analyze/context/driver.ts, src/analyze/orchestrator/driver.ts] | Say where the report is carried (bundle meta or a new field, with the schema version bump), and how cached bundles and persisted run records written before the change are treated. |
| boundaries | MED | The Story boundaries refer to the Define's Stories by their ids. | The Define and its folder use `E20261006b9d5c5c4:S001` to `:S005`; the HLD's section 5 headings read `Story E20261007b9d5c5c4:S001` to `:S005`. The HLD's own reference c22 records this as a renderer defect left unfixed. Contract ownership itself (sc1, sc2 at s1; sc3 at s2; sc4 at s3; sc5 at s5; s4 owns none) is consistent with the Define's edges and redesigns nothing owned elsewhere. [files: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md] | Fix the rendered Story ids before design.story runs, or confirm that downstream resolution keys on the short ids (s1 to s5) and not on the rendered heading. |

#### Could not verify (does not block)

_None._
