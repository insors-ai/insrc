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
