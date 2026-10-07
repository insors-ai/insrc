<!-- insrc:artifact HLD-b9d5c5c40df5a574 -->

# HLD: make-insrc-analysis-complete-used-right

## Summary

The work is ordered so that no limit is removed before the analyzer can handle what it lets through. A broad request that asks no specific question cannot be analysed today, so that path is repaired first. In parallel, every lookup result, every analysis step and every answer says honestly whether it is complete, on both paths a request can take; and then the analyzer measures what a request actually touches, and that measurement decides how the answer is produced: at once when the results are small enough to reason over together, or part by part and then combined when they are not. Only then are the limits taken out. Finally the answer's layout is chosen by the kind of question as well as the kind of source, and a question asking for every occurrence is listed directly from the results.

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

Three records carry the design, and both paths into the analyzer use them: the lookup pipeline that serves the agent tools and builds every run context, and the plan tree above it that serves broad analyses. The plan tree does not run today for a request that asks no specific question, so two Stories first make such a request run and then make a broad analysis complete; the other Stories apply to both paths once it does. A completeness record on every lookup result and every plan-task result replaces today's mix of truncated flags, totals, free-text notes and log lines: it says whether the result is complete, how many items exist and were returned, why any are missing, what was skipped or only partly read, and what the result rests on (text on disk, the stored graph, the document index, a live data source). A lookup that cannot run is always the existing failed output with its reason, never an empty result, and a failure to write the answer is reported with what was found, not passed silently to another way of answering. An answer report heads every answer on both paths: one overall completeness statement derived from those records, the measured size, and how the request was handled.

A request measure says what a request touches and maps it to the existing five sizes. It has two sources, because the size is needed at two different moments. A request that plans lookups up front is measured from what those lookups returned. A request that plans none up front (an unfocused request on the plan-tree path, where the size is needed before planning) is measured from the area it names: the files and entities the graph store holds under the path or repo it points at. No size is taken from the wording or assumed; a request that cannot be measured is treated as the largest size and says so.

Handling is a stated table from size to method, on both paths. Up to the size a model can reason over together, the answer is written in one pass, as today. Above it, the results are divided into parts along file and directory boundaries, each part is reasoned over in turn, and a combine step joins the per-part results into one answer; a failed part is kept out and named in the report. A single item too large for one pass is read in consecutive sections under the same rule. Once that handling exists the limits are removed: no lookup, plan-task runtime, planning prompt or text search keeps a limit on how many results it returns or how much of an item it reads. Last, layouts are selected by question kind and source kind together; a new question kind, enumeration, is rendered directly from lookup results with no model in the path, and the layouts lose their limits and describe every lookup they may draw on.

## 3. Architecture shape

The change sits inside the existing analyze framework and adds no new subsystem. There are two paths, and they are nested, not separate: the plan tree's first step builds a run context, and that step is the lookup pipeline. One of them does not run today for a broad request, and two Stories repair it before the others reach it.

THE LOOKUP PIPELINE (decomposer, executePlan, synthesizer; entered by tryExplorationPipeline for a focused request, src/analyze/context/driver.ts:1083, and by the agent tools). The order becomes: plan the lookups; run them; build the request measure from their outputs; choose the handling method from the measure; then either write the answer once or divide the outputs into parts, write a per-part result for each in turn, and combine them; finally render with the layout for the question kind and source kind, headed by the answer report. Today a failure of the answer-writing call makes the pipeline return nothing (src/analyze/context/driver.ts:1254-1258), and its caller then throws a 'model unavailable' error that discards what the lookups found (:276-282); the older tool loop that once caught this case is retired for this mode. The caller, runShaper, is typed to return a bundle only (:168). After the change the failure is a typed error that carries the lookup results and the answer report, and the callers of runShaper (the three daemon requests that build a context, the plan tree's first step and the step tool's bundle phase) pass it on to their caller as a failed result with those attached.

THE PLAN TREE (runAnalyze, src/analyze/orchestrator/driver.ts:80; its only caller is the daemon's analysis request, src/daemon/analyze-rpc.ts:526, which no client in this repository sends). Its first step builds the run context (driver.ts:270-271), which is the lookup pipeline. For a request with a focus that step runs today. For a request without one it does not: the pipeline returns for an unfocused intent (src/analyze/context/driver.ts:1102) and the caller throws the 'model unavailable' error, though no model was called; a request started with a stated kind of source is always marked unfocused (driver.ts:219); a request that names a single file or symbol returns the same way (:1109-1111). Checked live on 2026-10-07: the unfocused request fails at once and the same request with a focus returns a bundle. Story s6 gives an unfocused request a context: the pipeline plans a broad survey of the named area for it, using the lookups it already has, where today it returns; and every way of not proceeding gets its own cause in the error. Story s7 then runs a broad analysis through planning, the plan walk and the aggregator to a final report and corrects what stops it; no completed run is on record, so what it will find is not known, and its design begins with that run. The remaining plan-tree design below is what Stories s2 to s4 add once the path runs. Plan tasks are run by per-source runtimes and a terminal aggregator combines them (src/analyze/runtimes/shared/aggregator.ts). Its runtimes return task results, a different type from lookup outputs, so the completeness record is carried on the task result as well, and the answer report names an incomplete or failed source by either a lookup id or a task id. The aggregator places every task output whole into one prompt (:160-178); it gets the same size rule as the lookup pipeline's combine step, combining in stages when its inputs are too large for one pass. The final report (typed unknown today, src/analyze/orchestrator/types.ts:230) gains the answer report, and it includes the report of the first step's lookups.

SIZING. On the plan tree the size is fixed at classification, before the bundle is built and the planner runs, in two branches: with a target hint the scope picker's model call chooses it (driver.ts:172-222), and without one the classifier's model call returns it as a required field (driver.ts:234; src/analyze/classifier/schema.ts:42-46). A measuring pass is placed after both branches and its result is the size: it counts the files and entities the graph store holds under the path or repo the request names (the store returns a repo's entities with their file paths, src/db/entities.ts:779; today's picker counts the whole repo even for a module or file request, src/analyze/classifier/scope-picker.ts:206-211). The scope picker's model call is removed and the classifier no longer returns a size. A size given on a slash command or by a caller is kept as a hint. The size governs two things on the plan tree, and a changed size changes both: how many tasks a plan may have (the per-size bands) and how deep the plan may nest (maxPlanDepth, 2 for XS up to 6 for XL, src/daemon/analyze-rpc.ts:411-412). The planner model also writes a size for every child plan it spawns (src/analyze/planner/templates/code/index.ts:113-116, templates/docs/index.ts:175-181, validated in src/analyze/planner/recursive.ts:176-188): a child plan is measured from the area it names when it is spawned, by the same measuring pass, and the model's figure is kept as a hint. A size on the daemon request's intent (analyze-rpc.ts:1107-1109) is a hint too. A focused request on the plan tree is measured twice, for two purposes: from its named area for the plan's bands and depth, and inside its first step from its lookup results for how that step's answer is produced. In the lookup pipeline and the agent tools the measure is taken from the lookup results after the plan phase; four places assume size M today and all take the measure (src/mcp/analyze-step/phases/start.ts:49, src/mcp/server.ts:1294, src/daemon/workflow-rpc.ts:552, src/analyze/explore/freeform-probe.ts:100).

THE COMBINE STEP of the lookup pipeline is new. The plan tree's aggregator is not reused for it, because it takes plan-task outputs and returns a findings report, not the seven-layer bundle; the pattern and the provider role are. The combine step takes the cited per-part results, returns the seven-layer bundle, applies the size rule to its own input, and when it fails the per-part results are returned as they are with the failure named in the report.

THE STEP TOOL'S PART TURN. insrc_analyze_step's narrow turn cannot carry parts: it is bound to one lookup, checks that lookup's id, needs a registered runner for it and stores its result in the lookup cache (src/mcp/analyze-step/phases/narrow.ts:78-171). So the step tool gains a distinct part turn with its own stage: after the plan phase a partitioned request returns the first part to write; each part turn returns the next; the last returns the combine; per-part results are kept in the run's state. An enumeration answer needs no model turn, so the plan phase can also return the finished answer.

LAYOUT SELECTION is implemented twice today and both change together: in the context driver (src/analyze/context/driver.ts:1222) and for the step tool (refineSynthesizerKey, src/mcp/analyze-step/synthesizer-key.ts:37).

THE TEXT SEARCH. The shared grep primitive (src/daemon/tools/builtins/search/grep.ts) has two backends and four callers; only the analyzer's two text lookups (search-text.ts:100, config-trace.ts:100) use the new complete mode, so the search tool exposed to other callers and the review probe keep their limits. Lookups that read the stored graph mark their results as resting on the graph, because the graph's own completeness is a separate defect (ISSUE-12f70133491114c9) outside this Epic.

WHERE THE ANSWER REPORT IS STORED. The seven-layer bundle is validated with unknown fields rejected (src/analyze/context/schema.ts:22, :89) and a bundle that fails validation is dropped, so the report cannot simply be added. The bundle gains one declared optional field, report, and the bundle's schema version (SCHEMA_VERSION, schema.ts:40) is raised; that version is part of the bundle cache's key (src/analyze/context/cache.ts:19), so bundles cached before the change are not returned and are built again. A finished plan-tree run is replayed from its stored record (src/analyze/orchestrator/driver.ts:112-129); a record written before the change has no report, and it is replayed as it is with a report that says completeness was not recorded for this run. THE LOOKUP CACHE has no version: its key is the repo, the repo's last-indexed time and a hash of the lookup's parameters (src/db/exploration-cache.ts:14), and a hit returns the stored output as it is (:118-119). It gains a version in the key, raised in Phase A (outputs gain the completeness record) and again in Phase D (limits removed), so an output cut by a limit is never served after the limits are gone. Limit parameters that a plan still passes are dropped before the hash is taken, so the same lookup has one key.

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

### 4.6 sc6: Run failure cause

**Owner Story:** `s6`
**Consumed by:** `s7`, `s2`, `s3`, `s4`

**Purpose:** What a request that cannot proceed reports: the stage it stopped at and the actual cause, with 'model unavailable' reserved for a failed model call.

**Interface sketch (type-level):**

```
type RunFailureCause = 'model-call-failed' | 'no-plan-for-request' | 'scope-not-supported' | 'scope-not-indexed' | 'answer-step-failed' | 'stage-failed';
interface RunFailure {
  readonly stage: 'classify' | 'context' | 'plan' | 'walk' | 'aggregate';
  readonly cause: RunFailureCause;
  readonly message: string;
}
```

**Assumptions cited:** [[c1]]

## 5. Story boundaries

### 5.1 Story E20261007b9d5c5c4:S001

**Owns:** `sc1`, `sc2`

With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Turning every swallowed error into the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, and passing it through every caller of the context builder. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs.

### 5.2 Story E20261007b9d5c5c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`, `sc6`

The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer.

### 5.3 Story E20261007b9d5c5c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc6`

The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold.

### 5.4 Story E20261007b9d5c5c4:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content (the eight sites the Define lists, including the three adherence checks). The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken.

### 5.5 Story E20261007b9d5c5c4:S005

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses.

### 5.6 Story E20261007b9d5c5c4:S006

**Owns:** `sc6`

Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; what happens for a request that names a single file or symbol. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, and the daemon's mapping of those causes to error codes.

### 5.7 Story E20261007b9d5c5c4:S007

**Depends on:** `sc6`

Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. Recording, when a run stops, the stage and the cause, so that a run is not left reading as in progress. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split.

## 6. Non-functional targets

- **Performance:** A request small enough for one pass makes the same model calls as today, and one fewer on the plan tree, where the model call that picked a size is replaced by a count from the graph store. A request handled in parts makes one call per part plus the combination, serially; that time is accepted because accuracy comes before cost. After the limits are removed, a complete text search over a large repository is the cost of a text lookup.
- **Security:** No change: lookups stay inside the repository's dependency closure and the existing scope checks on paths remain.
- **Observability:** Every answer on both paths states its completeness, its measured size and counts, and its handling method and part count; each lookup and plan-task result states its own completeness. A failed lookup, part or answer-writing step carries its reason.
- **Durability:** Cached lookup outputs written before this change lack the completeness record and are treated as absent, not as complete.

## 7. Rollout

**Phase A — say when a result is incomplete; make an unfocused request run**

**Stories:** `s1`, `s6`

The two touch different code and neither needs the other: one adds the completeness record and the answer report with every limit still in place, the other gives an unfocused request a run context and honest failure causes.

**Backward compat:** Lookup and plan-task outputs change shape: the truncated flags, totalCallers, not-found notes and truncation log lines are replaced by the completeness record, so every reader of those outputs is updated in the same phase. The bundle gains a declared report field and its schema version rises, so bundles cached before are built again; the lookup cache gains a version, so its entries are too. Every limit keeps its present value. Answers gain a completeness line. A request whose answer-writing step fails returns a failure that carries what the lookups found, where it used to return a 'model unavailable' error. An unfocused request that failed at once now gets a context; the error codes for not proceeding change from one to several.

**Phase B — a broad analysis completes**

**Stories:** `s7`

Needs an unfocused request to get past its first step. Everything the later phases do on the plan tree needs a run that completes.

**Backward compat:** A run that stopped part of the way used to be left reading as in progress; it now records where and why it stopped. A completed run is replayed from its record as before.

**Phase C — measured sizing**

**Stories:** `s2`

Needs the answer report to state its result and a plan tree that runs; must land before handling by size.

**Backward compat:** The five size names are unchanged. A request's size can differ from what the scope picker, the classifier, the planner model or a fixed default gave, which changes how many tasks the plan tree plans and how deep it nests. The classifier's output loses its size field. A size passed by a caller is kept as a hint and the measured size is used.

**Phase D — handling by size**

**Stories:** `s3`

Needs the completeness record and the measure; must exist before any limit is removed.

**Backward compat:** A request small enough for one pass behaves as before. A larger one takes longer and, through the step tool, takes more turns, one per part.

**Phase E — remove the limits**

**Stories:** `s4`

Only now can a result of any size be handled in full.

**Backward compat:** Results get larger: a lookup that returned its first thirty hits returns all of them. The lookup cache's version rises again, so no output cut by a limit is served. The limit parameters disappear from the planner's catalog; a plan that still passes one has it ignored. The search tool exposed to other callers and the review's evidence search keep their limits.

**Phase F — answer layouts by question kind**

**Stories:** `s5`

Depends only on Phase A and could be built earlier; it is placed last so that layouts lose their limits once complete results are flowing.

**Backward compat:** The seven-layer bundle stays the shape of a model-written answer. The enumeration answer is a new shape that only a request classified as enumeration receives. Layout limits are removed, so answers to large questions get longer.

**Ordering rationale:** The order is the stakeholder's: say when a result is incomplete, then measure, then handle by size, then remove the limits, then fit the layouts, so that no limit is removed before the analyzer can handle what it lets through; and, since those cover both paths, the path that does not run today is repaired first. It follows the Epic's dependency edges (s7 on s6; s2 on s1 and s7; s3 on s1, s2 and s7; s4 on s1, s3 and s7; s5 on s1) and the contract ownership (sc1 and sc2 at s1, sc6 at s6, sc3 at s2, sc4 at s3, sc5 at s5; s4 and s7 own no contract).

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| What lies behind the plan tree's first step | No completed broad analysis is on record on this machine and no client in this repository starts one, so planning, the plan walk and the aggregator may have further defects that are not yet known. | Story s7's design begins by running a broad analysis and recording how far it gets, so the Story is sized from what is found. If that is more than one Story it is brought back to be split. Stories s1, s5 and s6 do not wait for it. |
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
- **[[c30]]** `prior-artifact` `DEF-b9d5c5c40df5a574 citation c21: live check of 2026-10-07 (an unfocused run-context request fails at once; the same request with a focus returns a bundle in 30 seconds), the saved run records, and the absence of any client that sends analyze.run.start`
- **[[c31]]** `code` `src/analyze/context/schema.ts` — "export const SCHEMA_VERSION = 1;"
- **[[c32]]** `code` `src/db/exploration-cache.ts`
- **[[c33]]** `code` `src/daemon/analyze-rpc.ts` — "const cap = cfg.maxPlanDepth[rootScope];"
- **[[c34]]** `code` `src/analyze/planner/recursive.ts`
- **[[c35]]** `stakeholder` `user, 2026-10-07` — "traige this and then decide one or more new stories"
- **[[c36]]** `prior-artifact` `HLD-b9d5c5c40df5a574 third review of 2026-10-07 by the daemon: block, 1 HIGH and 6 MED did not hold. The HIGH (the plan tree does not run for an unfocused request) was confirmed live and taken into the Epic as Stories s6 and s7; this revision applies the others. The Story ids in section 5 still render with the wrong date: the renderer uses this document's creation date where it should use the Epic's (src/workflow/artifacts/hld.ts:169), a defect outside this Epic; Stories are resolved by their short ids s1 to s7.`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**6 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T06:05:28.100Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | A plan-tree run that stops part of the way is left reading as in progress today, and Story s7's 'record the stage and the cause when a run stops' is what fixes that (Phase B backward-compat note). | runAnalyze already records stage, status 'failed' and a typed error for every stop it catches: abort (src/analyze/orchestrator/driver.ts:153-159), classify (:240-241), run-context build (:280-281), planner (:312-313) and a missing aggregate report (:372-379). A record stays 'in-progress' only when nothing is caught: `runExecutor` at :337 has no try/catch, the daemon's uncaught handler (src/daemon/analyze-rpc.ts:527-533) logs and sends a frame but does not patch run.json, and a hang or process death writes nothing. The Define's own evidence (two records left at 'classify' in progress) is the hang/death case, which 'record the cause when the run stops' cannot reach because the run never reaches a stop. [files: src/analyze/orchestrator/driver.ts, src/daemon/analyze-rpc.ts] | Restate the s7 scope: the typed stops are already recorded; what is missing is (a) a catch around the executor and in the daemon's uncaught path that patches the record, and (b) a rule for a record whose process died or hung (for example, treating an in-progress record with no live run as abandoned when it is read). Correct the Phase B backward-compat sentence. |
| new-versus-reuse | MED | sc6's RunFailure { stage: 'classify'\|'context'\|'plan'\|'walk'\|'aggregate'; cause; message } is a new contract with nothing of that name or role in the code. | src/analyze/orchestrator/types.ts:250-254 already exports `interface RunFailure { readonly code: RunErrorCode; readonly message: string; readonly data?: ... }`, used by RunAnalyzeFail.error and RunRecord.error and imported by the orchestrator driver. The stage vocabulary also exists and differs: `RunStage = 'classify' \| 'plan' \| 'execute' \| 'done'` (:30-34), persisted in run.json and tested by the replay check `cached.stage === 'done'` (driver.ts:116). RunErrorCode (:263-289) already carries 'scope-not-indexed', 'shaper-llm-unavailable' and 'executor-aggregator-failed', which overlap sc6's causes. The HLD does not say whether sc6 replaces, extends or sits beside these. [files: src/analyze/orchestrator/types.ts, src/analyze/orchestrator/driver.ts] | State sc6 in terms of the existing types: either extend RunErrorCode with the new causes (no-plan-for-request, scope-not-supported, answer-step-failed) and keep RunFailure/RunStage, or rename the new type and say how 'context'/'walk'/'aggregate' map onto the persisted 'plan'/'execute' stages and how older run.json records are read. |
| new-versus-reuse | MED | The chosen alternative a1 is consistent with section 3 on what is reused for combining parts, and with the rollout. | Section 8.1 says 'the existing aggregation step combines the findings into one answer' and lists 'five phases'; section 3 says 'THE COMBINE STEP of the lookup pipeline is new. The plan tree's aggregator is not reused for it', and section 7 has six phases (A-F). The code supports section 3: src/analyze/runtimes/shared/aggregator.ts:130-178 takes a Map of plan-task outputs and renders them into one prompt for a findings report, not a seven-layer bundle. The risk table also says 'Phase D lands after handling by size' for the unlimited text search, but limits are removed in Phase E; Phase D is handling by size itself. [files: src/analyze/runtimes/shared/aggregator.ts] | Bring section 8.1 and the risk table in line with sections 3 and 7: the combine step is new (pattern and provider role reused), six phases, and limit removal is Phase E. |
| change-sites | MED | The callers of runShaper that must pass on the typed answer-step failure are: the three daemon requests that build a context, the plan tree's first step, and the step tool's bundle phase. | runShaper is called only from shaperFor's three builders (src/analyze/context/index.ts:95, :115, :140). Their callers are: src/daemon/analyze-rpc.ts:259, :272, :300 (the three context requests), src/analyze/orchestrator/driver.ts:271 (plan tree first step), src/daemon/analyze-rpc.ts:420 (the daemon's `plan` request, which builds the run bundle before planning) and src/analyze/classifier/driver.ts:120 (classification bundle). The `plan` request and the classifier are not in the HLD's list. The step tool's bundle phase does not call runShaper at all: src/mcp/analyze-step/phases/bundle.ts:75 validates a client-written bundle with finalizeSynthesize and stamps meta; no synthesize() runs there, so there is no answer-writing failure of this kind to pass on. The one-shot MCP tool reaches runShaper through the analyze.context.buildRun request (src/mcp/server.ts:1290-1340) and is also a reader of the new failure. [files: src/analyze/context/index.ts, src/daemon/analyze-rpc.ts, src/mcp/analyze-step/phases/bundle.ts, src/analyze/classifier/driver.ts, src/mcp/server.ts] | Correct the inventory: add analyze-rpc.ts:420 (plan request) and the one-shot MCP caller at server.ts:1340; drop the step tool's bundle phase from the runShaper callers and say separately what the step tool returns when the client's bundle fails (today a retryable 'bundle-schema' error) and where its report is attached. |
| boundaries | MED | Stories s1 and s6 'touch different code and neither needs the other', so they can share Phase A independently. | Both rewrite the same function and the same throw. s6 owns the early returns of tryExplorationPipeline (src/analyze/context/driver.ts:1102, :1109-1111) and 'replacing the single model unavailable error with the cause of each way of not proceeding', which is the throw at :276-281. s1 owns the synthesize-failure return in the same function (:1245-1258) and replacing that same throw with a typed error carrying the lookup results, 'passing it through every caller of the context builder'. Both also change the single error mapper classifyShaperError (src/analyze/orchestrator/driver.ts:428-441) and the daemon's error-code mapping. And sc6, owned by s6, defines the cause 'answer-step-failed', which is the failure s1 produces, yet s1 lists no dependency on sc6. [files: src/analyze/context/driver.ts, src/analyze/orchestrator/driver.ts] | Either order the two inside Phase A (s6 first, s1 consuming sc6) or give one Story ownership of the throw site, the pipeline's null-return contract and classifyShaperError, with the other adding only its cause. Add sc6 to s1's dependencies if s1 emits 'answer-step-failed'. |
| error-paths | MED | The named-area measure (files and entities the graph store holds under the path or repo the request names) can size the requests the plan tree accepts, with 'cannot be measured, so XL' as the exception. | A scope ref can be 'repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir' or 'workspace' (src/analyze/classifier/schema.ts:28-36; src/daemon/analyze-rpc.ts:1087). A 'connection' ref names a data source, not a path, and the graph store holds no entities under it; today's picker says as much (src/analyze/classifier/scope-picker.ts:206 counts only repo/module/file, :227 'Scope ref does not target a single indexed repo (workspace / connection / manifest-dir)'). Under the design every data-target request on a connection is therefore unmeasurable and becomes XL, which sets the largest task bands and maxPlanDepth 6 (src/config/analyze.ts:209-215). The design states the XL rule but not that it is the normal outcome for a whole kind of source, nor what the measure is for 'workspace' (several repos) or 'symbol'. [files: src/analyze/classifier/schema.ts, src/analyze/classifier/scope-picker.ts, src/config/analyze.ts, src/db/entities.ts] | Give the measuring pass a stated source per scope kind: workspace = sum over its repos; symbol/file = the entity or file itself; connection = a count from the live data source (objects or tables), or an explicit decision that connection requests are XL, with that consequence for plan size accepted. listEntitiesForRepo (src/db/entities.ts:779-793) does return a repo's entities with file paths, so the repo/module/file case is sound. |

#### Could not verify (does not block)

_None._
