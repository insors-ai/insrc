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

Three records carry the design, and both paths into the analyzer use them. A completeness record on every lookup result replaces today's mix of truncated flags, totals and free-text notes: it says whether the result is complete, how many items exist and were returned, why any are missing, and what the result rests on (text on disk, the stored graph, the document index, a live data source). No recipe, planning prompt or layout keeps a limit, and a lookup that cannot run is always the existing failed output with its reason, never an empty result. A request measure says what a request touches and maps it to the existing five sizes. It has two sources, because the size is needed at two different moments. A request that plans lookups up front (the lookup pipeline and the agent tools) is measured from what those lookups returned: items, files, characters. A request that plans no lookups up front (an unfocused request on the orchestrator path, where the size is needed before planning) is measured from the area it names: the files and entities stored in the graph under the path or repo the request points at, where today the whole repository is counted even when the request names one module. Both replace the wording-and-repository guess and the fixed default; a request that cannot be measured is treated as the largest size and says so. An answer report heads every answer: the measure and size, how the request was handled and in how many parts, and one overall completeness statement derived from the lookups' records.

Handling is a stated table from size to method. Up to the size a model can reason over together, the answer is written in one pass, exactly as today. Above it, the results are divided into parts along file and directory boundaries, each part is reasoned over in turn, and a combine step written for this pipeline joins the per-part findings into one answer; a failed part is kept out of the combined answer and named in the report. A single item too large for one pass is read in consecutive sections under the same rule; until that handling exists, such an item is read as far as one pass allows and its result says how much of it was read. Layouts are selected by question kind and source kind together; a new question kind, enumeration, is rendered directly from lookup results with no model in the path, and the six existing layouts and the older per-source layouts lose their limits and describe every lookup they may draw on.

## 3. Architecture shape

The change sits inside the existing analyze framework and adds no new subsystem. There are two paths and they differ in when the size is needed.

THE LOOKUP PIPELINE (decomposer, executePlan, synthesizer; entered by tryExplorationPipeline for a focused request and by the agent tools). The order becomes: plan the lookups; run them in full; build the request measure from their outputs; choose the handling method from the measure; then either write the answer once or divide the outputs into parts, write a per-part result for each in turn, and combine them; finally render with the layout chosen for the question kind and source kind, headed by the answer report. The combine step is new to this pipeline. The plan tree's aggregator (src/analyze/runtimes/shared/aggregator.ts) is not reused: it is a plan-task runtime that takes plan-task outputs and returns a findings report, not the seven-layer bundle, and it places every input whole into one prompt. What is reused from it is the pattern and the provider role. The combine step takes the cited per-part results, returns the seven-layer bundle, applies the same size rule to its own input (combining in stages when the per-part results together are too large for one pass), and when it fails the per-part results are returned as they are with the failure named in the report.

THE ORCHESTRATOR PATH (runAnalyze, src/analyze/orchestrator/driver.ts:80). Today the size is fixed at classification, before the bundle is built and the planner runs (:194-222, :271, :294), and an unfocused request never reaches the lookup pipeline (src/analyze/context/driver.ts:1102). So this path gets a measuring pass of its own, placed where pickScope is called today: it counts the files and entities the graph store holds under the path or repo the request names, and the size comes from that count. The model call that picks a size is removed from this path. The per-size bands keep governing only how many tasks a plan may have. A focused request on this path that does reach the lookup pipeline is measured again from its lookup results, and that second measure governs how its answer is produced.

THE AGENT TOOLS. insrc_analyze_step measures after its plan phase and no longer assumes a size. Four places assume size M today and all take the measure: the step tool's start phase (src/mcp/analyze-step/phases/start.ts:49), the one-shot insrc_analyze tool (src/mcp/server.ts:1294), the workflow request that runs an analysis (src/daemon/workflow-rpc.ts:552) and the free-form probe (src/analyze/explore/freeform-probe.ts:100). A size passed by a caller is kept as a hint and the measure decides. The step tool's narrow turn cannot carry parts, because it is bound to one lookup: it checks the lookup's id, needs a registered runner for it, and stores its result in the lookup cache (src/mcp/analyze-step/phases/narrow.ts:78-171). So the step tool gains a distinct part turn with its own stage: after the plan phase a partitioned request returns the first part to write; each part turn returns the next; the last returns the combine; per-part results are kept in the run's state, not in the lookup cache. An enumeration answer needs no model turn, so the plan phase can also return the finished answer directly.

LAYOUT SELECTION is implemented twice today and both change together: in the context driver (src/analyze/context/driver.ts:1222) and for the step tool (refineSynthesizerKey, src/mcp/analyze-step/synthesizer-key.ts:37).

LOOKUPS keep their runner table and cache; each returns the completeness record and takes no limit parameter. The shared grep primitive gains a complete mode that only the analyzer's two text lookups use, so the search tool exposed to other callers keeps its own limits. Lookups that read the stored graph mark their results as resting on the graph, because the graph's own completeness is a separate defect (ISSUE-12f70133491114c9) outside this Epic.

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
  readonly skipped?: readonly { readonly what: string; readonly reason: string }[] | undefined;       // e.g. a file that could not be read
  readonly partlyRead?: readonly { readonly what: string; readonly readChars: number; readonly totalChars: number }[] | undefined; // an item too large for one pass
}
interface WithCompleteness { readonly completeness: Completeness }
// every ExplorationOutput except 'failed' and 'unsupported' extends WithCompleteness; complete is false whenever skipped or partlyRead is non-empty
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
  readonly source: 'lookup-results' | 'named-area';
  readonly items: number;                // lookup results, or entities under the named area
  readonly files: number;
  readonly characters: number | null;    // null for a named-area measure
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

Removing every limit on how many results a lookup returns: the sixteen sites the Define lists, and those found since: the maxSources parameter of the two document lookups (src/analyze/explore/executor.ts:315, :337), the result cut in document retrieval (src/analyze/docs-retrieval.ts:290), the cuts inside capability reuse-check (src/analyze/explore/capability-reuse-check.ts:303, :348-350), table describe (src/analyze/explore/db-table-describe.ts:175, :181) and the document family summary (src/analyze/runtimes/docs/family-summarise.ts:162), the preview-length limits of doc.mention (src/analyze/explore/doc-mention.ts:39-40), and the limit parameters, their examples and the fan-out bound in the planning prompt (src/prompts/analyze/decompose.system.md). The complete mode of the shared grep primitive, specified in full for both its ripgrep and its fallback path (src/daemon/tools/builtins/search/grep.ts): no limit on hits, no per-file match limit (:178), no cut of a matching line (:107), no skipping of a file for its size (:102), and every file that cannot be read reported in the result's skipped list where today it is skipped silently (:111); the search tool's own limits are left alone. Returning the completeness record from each lookup, with the basis each rests on. Turning every swallowed error into the failed output. For the content of one item, removing the fixed cuts (the eight sites the Define lists): an item is read in full when it fits in one pass, and when it does not, it is read as far as one pass allows and listed in partlyRead with how much was read, so nothing is cut without the result saying so; reading such an item in full is Story s3. Deriving the answer report's overall completeness from the lookups' records. The lookup cache's stored shape changes with the outputs.

### 5.2 Story E20261007b9d5c5c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`

The two measuring sources and the mapping from counts to the five sizes. From lookup results: taking the measure from completed lookups in the lookup pipeline and the agent tools, at all four places that assume size M today (src/mcp/analyze-step/phases/start.ts:49, src/mcp/server.ts:1294, src/daemon/workflow-rpc.ts:552, src/analyze/explore/freeform-probe.ts:100). From the named area: on the orchestrator path, a measuring pass placed where the scope picker is called today (src/analyze/orchestrator/driver.ts:194), counting the files and entities the graph store holds under the path or repo the request names (the store already returns a repo's entities with their file paths, src/db/entities.ts:779; today's picker counts the whole repo for a module or file request, src/analyze/classifier/scope-picker.ts:206-211), and removing the model call that picks a size. What the decomposer and planner receive as size at each moment. A size passed by a caller kept as a hint. The unmeasurable case. Filling the measure into the answer report.

### 5.3 Story E20261007b9d5c5c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`

The table from size to handling method and the size above which results are handled in parts. How lookup outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. Writing a per-part result for each part serially. The combine step of the lookup pipeline: its input (cited per-part results), its output (the seven-layer bundle), its own size rule (combining in stages), and its failure case (per-part results returned as they are, the failure named). Keeping a failed part out of the combined answer. The step tool's part turn: its stage, its input and output, how per-part results are kept in the run's state and how the combine is returned. Filling the handling report.

### 5.4 Story E20261007b9d5c5c4:S004

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today (src/analyze/context/driver.ts:1222 and src/mcp/analyze-step/synthesizer-key.ts:37). Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Rendering the answer report at the head of every answer, including whatever measure and handling fields are present, and the skipped and partly-read lists.

## 6. Non-functional targets

- **Performance:** A request small enough for one pass makes the same model calls as today, and one fewer on the orchestrator path, where the model call that picked a size is replaced by a count from the graph store. A request handled in parts makes one call per part plus the combination, serially; that time is accepted because accuracy comes before cost. Lookups run in full before sizing, so a complete text search over a large repository is the cost of sizing.
- **Security:** No change: lookups stay inside the repository's dependency closure and the existing scope checks on paths remain.
- **Observability:** Every answer states its measured size, its handling method and part count, and its completeness; each lookup result states its own. A failed lookup or part carries its reason.
- **Durability:** Cached lookup outputs written before this change lack the completeness record and are treated as absent, not as complete.

## 7. Rollout

**Phase A — complete lookups and the completeness record**

**Stories:** `s1`

Everything else reads the completeness record and the answer report, and nothing downstream can be trusted while lookups still drop results.

**Backward compat:** Lookup outputs change shape: the truncated flags, totalCallers and not-found notes are replaced by the completeness record, so every reader of those outputs (the six layouts, the agent-tool phases, the exploration cache) is updated in the same phase; cached outputs without the record are treated as absent. The limit parameters disappear from the planner's catalog; a plan that still passes one has it ignored. The search tool exposed to other callers keeps its limits. An item too large for one pass is still read only in part, as today, but the result now says so. Answers gain a completeness line and are otherwise laid out as before.

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
| Unlimited lookups on a large repository | A text search or a caller list with no limit can return a very large result, and today every output is placed whole into one model prompt. | Phase A removes the limits on how many results come back and states completeness. For the content of one item it reads as far as one pass allows and lists the item as partly read with the amounts, never cutting silently. A set of results too large to place in one prompt is reported in the answer report with its count until Phase D lands; Phase D then handles both in parts. |
| Combining parts without losing or duplicating findings | The combine step is a model call; it could drop a part's finding or merge two that differ. | Each part's findings are kept as cited records, the combination is checked against them (every part's findings accounted for), and the handling report names any part not covered. Enumerations bypass the model entirely. |
| Completeness that rests on the stored graph | The graph is known to miss cross-file import and call edges (ISSUE-12f70133491114c9), so a caller list can be complete with respect to the graph and still wrong. | The completeness record carries what a result rests on, and graph-based results carry a note that the graph's own coverage is not established; the layouts print that note. The note is removed when that issue is fixed. |

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
