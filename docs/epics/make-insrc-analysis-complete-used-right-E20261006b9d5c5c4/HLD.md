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

THE LOOKUP PIPELINE (decomposer, executePlan, synthesizer; entered by tryExplorationPipeline for a focused request, src/analyze/context/driver.ts:1083, and by the agent tools). The order becomes: plan the lookups; run them; build the request measure from their outputs; choose the handling method from the measure; then either write the answer once or divide the outputs into parts, write a per-part result for each in turn, and combine them; finally render with the layout for the question kind and source kind, headed by the answer report. Today a failure of the answer-writing call makes the pipeline return nothing (src/analyze/context/driver.ts:1254-1258), and its caller then throws a 'model unavailable' error that discards what the lookups found (:276-282); the older tool loop that once caught this case is retired for this mode. The caller, runShaper, is typed to return a bundle only (:168). After the change the failure is a typed error that carries the lookup results and the answer report, and it is passed on as a failed result with those attached by everything that reaches runShaper. runShaper is called only by the three context builders (src/analyze/context/index.ts:95, :115, :140), and they are called from six places: the daemon's three context requests (src/daemon/analyze-rpc.ts:259, :272, :300), the daemon's plan request, which builds the run context before it plans (:420), the plan tree's first step (src/analyze/orchestrator/driver.ts:271), and the classifier (src/analyze/classifier/driver.ts:120). The daemon's run-context request has two further readers of the same failure. The one-shot agent tool calls it (src/mcp/server.ts:1290-1340) and today prints only the error's code and message. The daemon's workflow runner calls it to ground a step (src/daemon/workflow-rpc.ts:226-229) and today keeps only the message; it fails the step with the cause and with what the lookups found. Neither the one-shot tool nor the daemon's error mapping passes the error's data today, so both are changed to carry it. The step tool does not call runShaper: there the agent writes the bundle and the tool validates it (src/mcp/analyze-step/phases/bundle.ts:75), so there is no answer-writing call to fail; a bundle that fails validation stays the retryable 'bundle-schema' error it is today, and the step tool attaches the answer report itself, to the bundle it accepts.

THE PLAN TREE (runAnalyze, src/analyze/orchestrator/driver.ts:80; its only caller is the daemon's analysis request, src/daemon/analyze-rpc.ts:526, which no client in this repository sends). Its first step builds the run context (driver.ts:270-271), which is the lookup pipeline. For a request with a focus that step runs today. For a request without one it does not: the pipeline returns for an unfocused intent (src/analyze/context/driver.ts:1102) and the caller throws the 'model unavailable' error, though no model was called; a request started with a stated kind of source is always marked unfocused (driver.ts:219); and the pipeline also returns for four of the seven kinds of scope a request can name: it serves a repo, a module and a workspace, and returns for a file, a symbol, a manifest directory and a data connection (:1108-1111). Checked live on 2026-10-07: the unfocused request fails at once and the same request with a focus returns a bundle. By the stakeholder's decision all seven kinds of scope are served. Story s6 serves the four in the lookup pipeline: a file and a manifest directory resolve to a path inside a registered repo, which is what the lookups need. A symbol does not resolve to anything defined today: a scope is a kind and a text value (src/shared/analyze-types.ts:33-43), and the three places that read a symbol's value disagree on its form (the validator expects something like a file and a name and checks only that the directory exists, src/analyze/classifier/validate.ts:163-167; the classifier's prompt asks for a directory, src/prompts/analyze/classify.system.md:44; the pipeline takes the value's directory, src/analyze/context/driver.ts:968-975). Story s6 defines the form (the absolute path of the file, then '#', then the entity's name), the rule that resolves it to one stored entity and its registered repo, and the existing code 'scope-ref-unresolved' for a value that names no entity or more than one, and brings the validator and the classifier's prompt in line with it; a data connection resolves to its registered connection (the classifier already checks that it is registered, src/analyze/classifier/validate.ts:120-131) and to the repo it is registered for, where today the pipeline's path for a connection is the daemon's working directory (src/analyze/context/driver.ts:976-977). The plan tasks are narrower still, and Story s7 widens them, since a broad analysis runs through them: the code tasks accept a repo or a manifest directory (src/analyze/runtimes/code/_shared.ts:58-70), the infra tasks those and a workspace (src/analyze/runtimes/infra/_shared.ts:47-59), and the data tasks a workspace, a repo or a manifest directory, rejecting a connection in terms (src/analyze/runtimes/data/_shared.ts:25-41). Each family of tasks accepts every kind that has a meaning for it: a data task given a connection works on that connection alone; a code task given a module, a file or a symbol works on that part of its repo. A kind with no meaning for a family (a data connection given to a code task) is refused with 'scope-not-supported', which is then a statement about that pairing and not a gap. A task's refusal has no way to carry a code today: it is a plain error, the plan walk turns any error from a task into the text 'runtime-threw: …' (src/analyze/executor/walker.ts:229-232), and the run reports failed tasks as an id and a reason (src/analyze/orchestrator/types.ts:232). Story s7 makes the refusal a typed error that the plan walk recognises and adds an optional code to the failed-task record, so a refused pairing can be told from a task that broke. Story s6 gives an unfocused request a context: the pipeline plans a broad survey of the named area for it, using the lookups it already has, where today it returns; and every way of not proceeding gets its own cause. The causes are added to what exists, not set beside it: the plan tree already has a failure type (RunFailure, with a code, a message and data, src/analyze/orchestrator/types.ts:250-254), a list of codes (RunErrorCode, :263-289, which already has 'scope-not-indexed' and 'shaper-llm-unavailable') and a stage (RunStage: classify, plan, execute, done, :30-34, stored in the run record and read by the replay check). This Epic adds four codes to that list and to the daemon's list of error codes (AnalyzeRpcErrorCode). Story s6 declares all four in both lists, with the matching typed errors in the context builder; Story s1 only raises 'answer-step-failed' and Story s7 only raises 'run-abandoned'. This and changes neither the failure type nor the stages, so run records already stored read as before; 'shaper-llm-unavailable' is kept for a model call that failed. Every way the pipeline returns nothing today ends in that one error, and each gets its cause: an unfocused request (:1102) and an unserved kind of scope (:1108-1111) are served, as above; a pairing with no meaning is 'scope-not-supported'; an unknown kind of source or a request with no intent (:1095-1100) is the existing 'invalid-input'; a missing prompt file for the planning call or the answer-writing call (:1124-1131, :1246-1253), which today reads as the model being unavailable, is the existing 'shaper-prompt-missing'; a planning call whose model failed keeps 'shaper-llm-unavailable'; a plan with nothing in it is 'no-plan-for-request'; a failed answer-writing call, and a bundle the pipeline produced that fails validation (:243-249, which also covers a free-form answer), are 'answer-step-failed' with the lookup results. Story s6 owns the place the error is raised (src/analyze/context/driver.ts:276-281), the pipeline's rule for returning nothing (:1102, :1109-1111) and the functions that map these errors to codes: the two that share a name (classifyShaperError, src/analyze/orchestrator/driver.ts:428-441 for the plan tree and src/daemon/analyze-rpc.ts:882 for the daemon's requests), and the mapping for the classify stage (classifyClassifierError, src/analyze/orchestrator/driver.ts:414-426, with the daemon's counterpart), which today knows only the classifier's own errors and records anything raised by the classifier's context build as 'internal-error'. Story s6 routes an error from that context build through the context mapping, so it keeps its cause, and Story s4 adds the cancelled case there as 'aborted'; Story s1 is built after it and adds only its own case, the failed answer-writing step, to them. Story s7 then runs a broad analysis through planning, the plan walk and the aggregator to a final report and corrects what stops it. A stop that the run catches is already recorded with its stage, a failed status and a code (driver.ts:153-159, :240-241, :280-281, :312-313, :372-379). Two cases are not, and Story s7 covers both: an error nothing catches (the plan walk at :337 has no handler, and the daemon's handler for an uncaught error, src/daemon/analyze-rpc.ts:527-533, reports it and leaves the record as it was), which gets a handler that writes the record; and a run whose process hung or died, which can write nothing, so a record still marked in progress with no live run behind it is treated as abandoned when it is read. Nothing records which runs are live today, so the rule is stated here: the daemon keeps, in memory, the set of run ids it is executing, adding an id when a run starts and removing it when the run returns or throws. A record in progress whose id is not in that set is abandoned; after a daemon restart the set is empty, so every such record is. The three readers apply the rule: the status request (src/daemon/analyze-rpc.ts:745-760), the purge, which today refuses any record in progress (src/analyze/orchestrator/persistence.ts:93-101) and then allows an abandoned one, and the resume check (src/analyze/orchestrator/driver.ts:112-119), which starts an abandoned run afresh. The first reader to find one rewrites the record as failed with the fourth new code, 'run-abandoned', and the stage it had reached, so that every later reader sees the same thing. The two records on this machine left at 'classify' are of that second case; no completed run is on record, so what it will find is not known, and its design begins with that run. The remaining plan-tree design below is what Stories s2 to s4 add once the path runs. Plan tasks are run by per-source runtimes and a terminal aggregator combines them (src/analyze/runtimes/shared/aggregator.ts). Its runtimes return task results, a different type from lookup outputs, so the completeness record is carried on the task result as well, and the answer report names an incomplete or failed source by either a lookup id or a task id. The aggregator places every task output whole into one prompt (:160-178); it gets the same size rule as the lookup pipeline's combine step, combining in stages when its inputs are too large for one pass. The final report (typed unknown today, src/analyze/orchestrator/types.ts:230) gains the answer report, and it includes the report of the first step's lookups.

SIZING. On the plan tree the size is fixed at classification, before the bundle is built and the planner runs, in two branches: with a target hint the scope picker's model call chooses it (driver.ts:172-222), and without one the classifier's model call returns it as a required field (driver.ts:234; src/analyze/classifier/schema.ts:42-46). A measuring pass is placed after both branches and its result is the size: it counts the files and entities the graph store holds under the path or repo the request names (the store returns a repo's entities with their file paths, src/db/entities.ts:779; today's picker counts the whole repo even for a module or file request, src/analyze/classifier/scope-picker.ts:206-211). The scope picker's model call is removed and the classifier no longer returns a size. A size given on a slash command or by a caller is kept as a hint. The size governs two things on the plan tree, and a changed size changes both: how many tasks a plan may have (the per-size bands) and how deep the plan may nest (maxPlanDepth, 2 for XS up to 6 for XL, src/daemon/analyze-rpc.ts:411-412). The planner model also writes a size for every child plan it spawns (src/analyze/planner/templates/code/index.ts:113-116, templates/docs/index.ts:175-181, validated in src/analyze/planner/recursive.ts:176-188): a child plan is measured from the area it names when it is spawned, by the same measuring pass, and the model's figure is kept as a hint. A size on the daemon request's intent (analyze-rpc.ts:1107-1109) is a hint too. WHAT IS MEASURED, BY KIND OF SCOPE. A request names one of seven kinds of scope (src/analyze/classifier/schema.ts:28-36), and each has a stated source. A repo, a module or a manifest directory: the files and entities the graph store holds under that path (listEntitiesForRepo, src/db/entities.ts:779-793, returns a repo's entities with their file paths). A workspace: the sum of that over its repos. A file or a symbol: that file or that entity alone. A data connection: the tables or objects of the live data source, counted through the data driver's own listing, by family of source: a relational source through its table listing (listTables, src/shared/db-driver.ts:672), a key-value or document source through its namespace listing (listNamespaces, :711), a file source through its file listing (listFilesForConnection, src/daemon/db/list-files.ts:44). These listings are themselves limited today, and a call with no limit is not unlimited: the relational drivers return 500 when no limit is given and at most 5,000 (clampListLimit, src/daemon/db/drivers/sqlite.ts:359-362, and the same in pg.ts, mysql.ts, mssql.ts and oracle.ts), and the six drivers with a namespace listing 200 and at most 1,000 (mongodb.ts:117, cassandra.ts:158, dynamodb.ts:169, etcd.ts:115, nats.ts:110, redis.ts:137). The file listing takes a required limit and stops its walk there (src/daemon/db/list-files.ts:37, :66, :71). For two of the six a listing is not a count at all: Redis and etcd have no namespaces, and their drivers derive them from a sample of keys (redis.ts:134-152, at most 5,000 keys; etcd.ts:116). Story s2 therefore adds a complete mode to these listings, which the measure uses, and the limited mode stays for the data tools exposed to other callers, as with the search tool. The complete mode is: for the relational drivers and for the MongoDB, Cassandra, DynamoDB and NATS drivers, the listing with no limit; for the file listing, a walk to the end with the limit made optional. Redis and etcd get no complete mode in this Epic: their measure is recorded as not determined, with the reason that the source has no namespaces to count, and a listing from them carries a completeness record that says it is a sample; a full scan of a live store's keys is not something the analyzer starts on its own. A listing that reports it was cut is never recorded as a determined count. A source with no listing (a key-value store with no namespaces answers that it is not supported; the ClickHouse driver's listing is not implemented) cannot be counted. This is needed since the graph holds nothing under a connection and today's picker says so (src/analyze/classifier/scope-picker.ts:206, :227). A request about data that names a repo, a workspace or a manifest directory, which are the forms the data plan tasks accept today (src/analyze/runtimes/data/_shared.ts:25-41), is measured the same way, as the sum over the connections registered there. Where a count cannot be taken (the driver has no table listing, which is optional in the driver interface; the source cannot be reached; the scope is not indexed) the request is sized XL, the measure records that it was not determined and why, and the answer report says so; XL is the fallback for a source that cannot be counted, not the normal result for any kind of scope. A focused request on the plan tree is measured twice, for two purposes: from its named area for the plan's bands and depth, and inside its first step from its lookup results for how that step's answer is produced. In the lookup pipeline and the agent tools the measure is taken from the lookup results after the plan phase; four places assume size M today and all take the measure (src/mcp/analyze-step/phases/start.ts:49, src/mcp/server.ts:1294, src/daemon/workflow-rpc.ts:552, src/analyze/explore/freeform-probe.ts:100).

THE FREE-FORM FALLBACK is part of the design. When no lookup fits a request the pipeline plans a single free-form lookup (src/analyze/context/driver.ts:1136, :1171), which is a model tool loop over the read-only tools (src/analyze/explore/freeform-probe.ts). It has a turn limit (models.shaper.maxToolTurns, 40 by default, src/config/analyze.ts:197, enforced at src/analyze/context/driver.ts:686); when the limit is reached it returns an empty answer with a note, not a failure (freeform-probe.ts:126-141); its search tools (src/analyze/context/tool-surface.ts:119-122) are the general ones with their limits; and when it is the only lookup its answer is returned as it is, without the answer-writing step (driver.ts:1194-1208). Story s1 makes reaching the turn limit the existing failed output, with whatever the loop had gathered, and gives a free-form answer an answer report, built by the pipeline at the point the answer is returned, whose completeness record says the answer rests on a search directed by a model. Story s4 then removes the turn limit, by the stakeholder's decision, and gives the loop the complete mode of the search tools, so nothing the loop asks for is cut. The loop is shared. One function runs it (runToolLoop, src/analyze/context/driver.ts:593-687), with the read-only tools (:601), for the free-form lookup (:571-577) and also for the classification and task modes of the context builder (:301-307; the classification loop runs on every classified plan-tree request, src/analyze/classifier/driver.ts:120), and all three take the same turn limit. Story s4 treats the three alike: each loses the turn limit and gets the complete mode of the search tools, and the setting is removed from the configuration catalog. A loop with no turn limit needs a way to be stopped, and there is none today: the loop takes no cancellation signal and its only exits are the model's answer, a failed call and the turn limit; nothing under src/analyze/context or src/analyze/explore reads a signal; and the plan tree's own signal, which its comment says is checked between stages and tasks (src/analyze/orchestrator/types.ts:84-93), is in code read only before the classify, plan and execute stages (src/analyze/orchestrator/driver.ts:148, :166, :253, :327): the plan walk is called without it (:337-360) and so is the classifier (:234), so a run cannot be stopped once its longest stage has begun. The daemon's requests cannot carry a cancellation either: a standard request handler receives its parameters and nothing else (src/daemon/server.ts:38, :193), only stream handlers get a signal that fires when the connection closes (:206-227), and the four context requests are standard handlers (src/daemon/index.ts:1718-1748). So Story s4 builds cancellation before it removes the limit, and the limit is not removed until that path exists: a signal on the context builder's options, carried through runShaper, the plan executor, the free-form lookup and the loop, and checked between turns; the run's signal carried into the plan walk, checked between tasks, and into the classifier; the daemon's standard-handler contract given an optional second argument, a signal that fires when the requesting connection closes, which existing handlers ignore; the daemon's context-building functions (buildRun and the other three, src/daemon/analyze-rpc.ts:262) given that signal as a parameter, since the one-shot tool and the workflow runner call them directly; a new daemon request that cancels a context request by its run id; and 'aborted' added to the daemon's error codes, where it is missing (src/daemon/analyze-rpc.ts:132-154), with its mapping. The new request and the new codes are part of the contract mirrored in the IDE repository. It comes from the caller in each case: for the daemon's three context requests and its plan request, received over the socket, the daemon cancels when the requesting connection closes or a cancel request names the run, and for that it keeps an in-memory table of run id to canceller, filled when such a request starts and cleared when it returns; the one-shot agent tool does not send a daemon request but runs the context build inside its own process (src/mcp/server.ts:41, :1326-1335), and the daemon's workflow runner calls the same function directly, so both cancel through the signal they pass as that function's new parameter (the tool call's own signal, the workflow run's abort), and the cancel request does not apply to them; the plan tree's first step and the classifier pass the run's existing signal. A cancelled loop returns the failed output with what it had gathered, under the existing code 'aborted'. With no turn limit the loop then ends when the model writes its answer, when a call fails, or when it is cancelled. The answer still goes through the measure: a free-form result too large for one pass is divided and combined like any other.

THE COMBINE STEP of the lookup pipeline is new. The plan tree's aggregator is not reused for it, because it takes plan-task outputs and returns a findings report, not the seven-layer bundle; the pattern and the provider role are. The combine step takes the cited per-part results, returns the seven-layer bundle, applies the size rule to its own input, and when it fails the per-part results are returned as they are with the failure named in the report.

THE STEP TOOL'S PART TURN. insrc_analyze_step's narrow turn cannot carry parts: it is bound to one lookup, checks that lookup's id, needs a registered runner for it and stores its result in the lookup cache (src/mcp/analyze-step/phases/narrow.ts:78-171). So the step tool gains a distinct part turn with its own stage: after the plan phase a partitioned request returns the first part to write; each part turn returns the next; the last returns the combine; per-part results are kept in the run's state. An enumeration answer needs no model turn, so the plan phase can also return the finished answer.

LAYOUT SELECTION is implemented twice today and both change together: in the context driver (src/analyze/context/driver.ts:1222) and for the step tool (refineSynthesizerKey, src/mcp/analyze-step/synthesizer-key.ts:37).

THE TEXT SEARCH. The shared grep primitive (src/daemon/tools/builtins/search/grep.ts) has two backends and four callers; the analyzer's two text lookups (search-text.ts:100, config-trace.ts:100) and the search tools given to the free-form loop use the new complete mode; the search tool exposed to callers outside the analyzer and the review probe keep their limits. Lookups that read the stored graph mark their results as resting on the graph, because the graph's own completeness is a separate defect (ISSUE-12f70133491114c9) outside this Epic.

WHERE THE ANSWER REPORT IS STORED. The seven-layer bundle is validated with unknown fields rejected (src/analyze/context/schema.ts:22, :89) and a bundle that fails validation is dropped, so the report cannot simply be added. The bundle gains one declared optional field, report, in the schema of a stored bundle only. That same schema is what the answer-writing model is given as its output schema, with only meta taken out (stripMetaFromSchema, src/analyze/context/synthesizer.ts:126, :184-186, :198-203, :274), so report is taken out of the model-facing schema in the same way: the report is always derived from the completeness records and never written by a model. The step tool's bundle phase rejects a bundle in which the agent supplied a report. The bundle's schema version (SCHEMA_VERSION, schema.ts:40) is raised; that version is part of the bundle cache's key (src/analyze/context/cache.ts:19), so bundles cached before the change are not returned and are built again. A finished plan-tree run is replayed from its stored record (src/analyze/orchestrator/driver.ts:112-129); a record written before the change has no report, and it is replayed as it is with a report that says completeness was not recorded for this run. THE DATA DRIVERS' LISTINGS are limit sites that the Define's inventory does not list. The lookup that lists tables (src/analyze/explore/db-tables-list.ts:106, :124) and the plan task that lists a source's objects (src/analyze/runtimes/data/discovery-objects.ts:88) go through the drivers' limits described under sizing, and the plan task never reads the listing's cut flag, so a source with more than 500 tables is cut silently today. Story s1 reads the cut flag into the completeness record of both; Story s4 moves both to the complete mode that Story s2 adds. THE LOOKUP CACHE has no version: its key is the repo, the repo's last-indexed time and a hash of the lookup's parameters (src/db/exploration-cache.ts:14), and a hit returns the stored output as it is (:118-119). It gains a version in the key, raised by Story s1 (outputs gain the completeness record) and again by Story s4 (limits removed), so an output cut by a limit is never served after the limits are gone. Limit parameters that a plan still passes are dropped before the hash is taken, so the same lookup has one key.

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
  readonly source: 'lookup-results' | 'named-area' | 'data-source';
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

### 4.6 sc6: Causes of not proceeding

**Owner Story:** `s6`
**Consumed by:** `s1`, `s7`, `s2`, `s3`, `s4`

**Purpose:** What a request that cannot proceed reports. Four codes are added, all declared by Story s6, to the plan tree's existing list (RunErrorCode) and to the daemon's error codes (AnalyzeRpcErrorCode); its failure type (RunFailure) and its stages (RunStage) are kept as they are, and 'shaper-llm-unavailable' is kept for a model call that failed.

**Interface sketch (type-level):**

```
// added to RunErrorCode (src/analyze/orchestrator/types.ts) and to the daemon's context error codes
| 'no-plan-for-request'   // the plan for this request has nothing in it
| 'scope-not-supported'   // this kind of scope has no meaning for this kind of source (a data connection given to a code task)
| 'answer-step-failed'    // the answer-writing step failed; data carries the lookup results and the report (raised by Story s1)
| 'run-abandoned'         // a record left in progress with no live run behind it (raised by Story s7)
// 'aborted' exists in RunErrorCode; Story s4 adds it to AnalyzeRpcErrorCode with cancellation
// RunFailure { code, message, data? } and RunStage are unchanged
```

**Assumptions cited:** [[c1]]

## 5. Story boundaries

### 5.1 Story E20261007b9d5c5c4:S001

**Owns:** `sc1`, `sc2`
**Depends on:** `sc6`

With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Turning every swallowed error into the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to the answer-writing model, and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: reaching its turn limit becomes a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task.

### 5.2 Story E20261007b9d5c5c4:S002

**Owns:** `sc3`
**Depends on:** `sc1`, `sc2`, `sc6`

The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count.

### 5.3 Story E20261007b9d5c5c4:S003

**Owns:** `sc4`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc6`

The table from size to handling method and the size above which results are handled in parts. How outputs are divided along directory and file boundaries, and one large item into consecutive sections, so that a single item is read in full. In the lookup pipeline: writing a per-part result for each part serially and the new combine step (its input, its output, its own size rule, its failure case). On the plan tree: the same size rule on the aggregator's input, combining in stages. Keeping a failed part out of the combined answer. The step tool's part turn. Filling the handling report and showing it in the answer. The limits are still in place, so this is exercised by results that are large within them and by tests that lower the threshold.

### 5.4 Story E20261007b9d5c5c4:S004

**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc6`

Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content (the eight sites the Define lists, including the three adherence checks). The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; the new cancel request for context requests received over the socket, with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and its configuration setting for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools.

### 5.5 Story E20261007b9d5c5c4:S005

**Owns:** `sc5`
**Depends on:** `sc1`, `sc2`

Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses.

### 5.6 Story E20261007b9d5c5c4:S006

**Owns:** `sc6`

Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. It declares all four new codes in both lists; Stories s1 and s7 raise one each.

### 5.7 Story E20261007b9d5c5c4:S007

**Depends on:** `sc6`

Widening the plan tasks of each family (code, infra, data) to every kind of scope that has a meaning for it, including a data connection for the data tasks, and refusing a pairing with no meaning with 'scope-not-supported'. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the daemon's in-memory set of running ids, the three readers that apply it, and the rewrite of the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split.

## 6. Non-functional targets

- **Performance:** A request small enough for one pass makes the same model calls as today, and one fewer on the plan tree, where the model call that picked a size is replaced by a count from the graph store. A request handled in parts makes one call per part plus the combination, serially; that time is accepted because accuracy comes before cost. After the limits are removed, a complete text search over a large repository is the cost of a text lookup.
- **Security:** No change: lookups stay inside the repository's dependency closure and the existing scope checks on paths remain.
- **Observability:** Every answer on both paths states its completeness, its measured size and counts, and its handling method and part count; each lookup and plan-task result states its own completeness. A failed lookup, part or answer-writing step carries its reason.
- **Durability:** Cached lookup outputs written before this change lack the completeness record and are treated as absent, not as complete.

## 7. Rollout

**Phase A — an unfocused request runs, and a request that cannot proceed says why**

**Stories:** `s6`

Depends on nothing. It owns the error path that the next Story adds a case to, so it goes first.

**Backward compat:** An unfocused request that failed at once now gets a context. The one 'model unavailable' code for not proceeding becomes several: four codes are added to the existing list and to the daemon's error codes, all declared here (one is first raised in Phase B and one in Phase C), none is removed, a missing prompt file is reported as that and not as an unavailable model, and run records already stored read as before.

**Phase B — say when a result is incomplete**

**Stories:** `s1`

Adds the completeness record and the answer report with every limit still in place. It follows Phase A because its failure case is added to the error path that Phase A sets up.

**Backward compat:** Lookup and plan-task outputs change shape: the truncated flags, totalCallers, not-found notes and truncation log lines are replaced by the completeness record, so every reader of those outputs is updated in the same phase. The bundle gains a declared report field and its schema version rises, so bundles cached before are built again; the lookup cache gains a version, so its entries are too. Every limit keeps its present value. Answers gain a completeness line. A request whose answer-writing step fails returns a failure that carries what the lookups found, where it used to return a 'model unavailable' error.

**Phase C — a broad analysis completes**

**Stories:** `s7`

Needs an unfocused request to get past its first step. Everything the later phases do on the plan tree needs a run that completes.

**Backward compat:** A run that stopped on an error nothing caught used to leave its record reading as in progress; the record now says it failed and why. A record left in progress by a process that died is read as abandoned. A completed run is replayed from its record as before.

**Phase D — measured sizing**

**Stories:** `s2`

Needs the answer report to state its result and a plan tree that runs; must land before handling by size.

**Backward compat:** The five size names are unchanged. A request's size can differ from what the scope picker, the classifier, the planner model or a fixed default gave, which changes how many tasks the plan tree plans and how deep it nests. The classifier's output loses its size field. A size passed by a caller is kept as a hint and the measured size is used.

**Phase E — handling by size**

**Stories:** `s3`

Needs the completeness record and the measure; must exist before any limit is removed.

**Backward compat:** A request small enough for one pass behaves as before. A larger one takes longer and, through the step tool, takes more turns, one per part.

**Phase F — remove the limits**

**Stories:** `s4`

Only now can a result of any size be handled in full.

**Backward compat:** Results get larger: a lookup that returned its first thirty hits returns all of them. The lookup cache's version rises again, so no output cut by a limit is served. The limit parameters disappear from the planner's catalog; a plan that still passes one has it ignored. Cancellation is built first: the context requests stop when their caller's connection closes or when a new cancel request names their run, and a plan-tree run can be stopped between tasks. The daemon's standard request handlers gain an optional signal argument. The data drivers' listings lose their limits for the analyzer through a complete mode; the data tools exposed to other callers keep theirs. The tool loop of the free-form lookup and of the classification and task modes loses its turn limit and its setting, models.shaper.maxToolTurns, is removed from the configuration; a value already stored is dropped when the configuration is reconciled. The search tool exposed to callers outside the analyzer and the review's evidence search keep their limits.

**Phase G — answer layouts by question kind**

**Stories:** `s5`

Depends only on Phase B and could be built earlier; it is placed last so that layouts lose their limits once complete results are flowing.

**Backward compat:** The seven-layer bundle stays the shape of a model-written answer. The enumeration answer is a new shape that only a request classified as enumeration receives. Layout limits are removed, so answers to large questions get longer.

**Ordering rationale:** The order is the stakeholder's: say when a result is incomplete, then measure, then handle by size, then remove the limits, then fit the layouts, so that no limit is removed before the analyzer can handle what it lets through; and, since those cover both paths, the path that does not run today is repaired first. It follows the Epic's dependency edges (s1 on s6; s7 on s6; s2 on s1 and s7; s3 on s1, s2 and s7; s4 on s1, s3 and s7; s5 on s1) and the contract ownership (sc1 and sc2 at s1, sc6 at s6, sc3 at s2, sc4 at s3, sc5 at s5; s4 and s7 own no contract).

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| What lies behind the plan tree's first step | No completed broad analysis is on record on this machine and no client in this repository starts one, so planning, the plan walk and the aggregator may have further defects that are not yet known. Serving every kind of scope adds to this Story the widening of the plan tasks of three families. | Story s7's design begins by running a broad analysis and recording how far it gets, so the Story is sized from what is found. If that is more than one Story it is brought back to be split. Stories s1, s5 and s6 do not wait for it. |
| Combining parts without losing or duplicating findings | The combine step and the aggregator are model calls; either could drop a part's finding or merge two that differ. | Each part's findings are kept as cited records, the combination is checked against them (every part's findings accounted for), and the handling report names any part not covered. Enumerations bypass the model entirely. |
| A text search with no limits on a large repository | With no hit limit, no size skip and its output read in full, a broad pattern can return a very large result and take a long time. | The limits are removed (Story s4) only after handling by size exists (Story s3), so a large result is divided, not placed whole in one prompt. A search that runs out of time is reported as failed, never as complete. |
| Completeness that rests on the stored graph | The graph is known to miss cross-file import and call edges (ISSUE-12f70133491114c9), so a caller list can be complete with respect to the graph and still wrong. | The completeness record carries what a result rests on, and graph-based results carry a note that the graph's own coverage is not established; the answer prints that note. The note is removed when that issue is fixed. |
| Counting a live data source to size a request | The count needs the data source to be reachable at the moment the request is sized, and the table listing is optional in the driver interface, so some drivers may not have it. | A count that cannot be taken sizes the request XL and the measure records that it was not determined and why, so the request still runs and the report says how it was sized. Story s2's design lists which drivers have the listing. |
| A tool loop with no turn limit | A model that never settles on an answer keeps calling tools; with no turn limit nothing in the loop stops it. | The loop ends on the model's answer, on a failed call or on the caller cancelling, and each turn is reported as progress so a caller can see a run that is not converging. Cancellation does not exist for this loop today, so Story s4 builds it, from every caller down to a check between turns, before it removes the limit. |

## 8. Alternatives considered

### 8.1 a1: Complete results with a shared completeness statement, measured sizing, and partition-then-combine inside the analyzer — **CHOSEN**

Every lookup returns all results with one common completeness record; the analyzer measures the result set it actually got and, above a size it can reason over at once, splits it into parts, reasons over each in turn and combines them.

Every recipe output carries the same completeness record (complete or not, how many exist, how many were returned, why any are missing, and what the answer rests on, such as text on disk or the stored graph), and a lookup that cannot run is always the existing failed output, never an empty one. Limits come out of the recipes, the planning prompt and the layouts. Sizing stops being a guess: the deterministic lookups of a request are run first, since they are complete and cheap, and the request's size is read from what they returned (hits, files, entities, characters). That one measure is used on both paths into the analyzer, including the agent tools.

The size then selects how the answer is produced, by a stated table: a result set small enough to reason over at once is answered in one pass, as today; a larger one is divided into parts along a natural boundary (by file or directory), each part is reasoned over in turn, and a new combine step, modelled on the plan tree's aggregator but not that code, combines the findings into one answer that reports how many parts there were and whether any failed. The answer layout is chosen by the kind of question and the kind of source together, and a question that asks for every occurrence is laid out directly from the results without a model rewriting it.

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
- Covering both paths and removing the limits only after handling exists makes the work seven phases

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
- **[[c37]]** `code` `src/shared/db-driver.ts` — "listTables?(opts?: { readonly schema?: string; readonly limit?: number }): Promise<TableListing>;"
- **[[c38]]** `stakeholder` `user, 2026-10-07: a request on a data connection is sized by counting from the live data source, not fixed at XL` — "go with A"
- **[[c39]]** `prior-artifact` `HLD-b9d5c5c40df5a574 fourth review of 2026-10-07 by the daemon: block, 6 MED did not hold, none HIGH. All six are applied in this revision.`
- **[[c40]]** `code` `src/analyze/explore/freeform-probe.ts` — "`Tool loop exhausted its maxTurns cap without settling on a bundle; ` +"
- **[[c41]]** `stakeholder` `user, 2026-10-07: the free-form fallback is brought fully into story 4; its turn limit is removed and its search tools are unlimited` — "B"
- **[[c42]]** `code` `src/analyze/runtimes/data/_shared.ts` — "'Data runtimes require workspace, repo, or manifest-dir scope.',"
- **[[c43]]** `stakeholder` `user, 2026-10-07: story 6 serves all seven kinds of scope, including a data connection` — "B"
- **[[c44]]** `prior-artifact` `HLD-b9d5c5c40df5a574 fifth review of 2026-10-07 by the daemon: block, 5 MED did not hold, none HIGH. All five are applied in this revision, two of them by the stakeholder's decisions.`
- **[[c45]]** `code` `src/analyze/orchestrator/types.ts` — "same code. In-flight LLM calls cannot currently be"
- **[[c46]]** `prior-artifact` `HLD-b9d5c5c40df5a574 sixth review of 2026-10-07 by the daemon: block, 1 HIGH and 3 MED did not hold. All four are applied in this revision. The classification and task modes share the free-form loop and its turn limit; they are treated the same as the free-form lookup, following the stakeholder's decision on that lookup, and this extension is put to the stakeholder.`
- **[[c47]]** `code` `src/daemon/db/drivers/sqlite.ts` — "return Math.min(Math.max(1, Math.floor(n)), 5000);"
- **[[c48]]** `code` `src/daemon/server.ts` — "export type RpcHandler = (params: unknown) => Promise<unknown>;"
- **[[c49]]** `code` `src/analyze/executor/walker.ts` — "return failedRecord(task, `runtime-threw: ${msg}`);"
- **[[c50]]** `prior-artifact` `HLD-b9d5c5c40df5a574 seventh review of 2026-10-07 by the daemon: block, 2 HIGH and 4 MED did not hold. All six are applied in this revision.`
- **[[c51]]** `code` `src/daemon/db/drivers/redis.ts`
- **[[c52]]** `code` `src/daemon/db/list-files.ts`
- **[[c53]]** `code` `src/analyze/classifier/validate.ts`
- **[[c54]]** `prior-artifact` `HLD-b9d5c5c40df5a574 eighth review of 2026-10-07 by the daemon: block, 4 MED did not hold, none HIGH. All four are applied in this revision. Redis and etcd are given no complete listing (it would mean scanning every key of a live store); this is put to the stakeholder.`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.epic (design.epic)

**2 do not hold · 1 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-07T06:39:53.640Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | Story s4 meets DEF S004 ac1 ('every result is returned and none is dropped ... in any kind of source the analyzer covers') for every data source. | The HLD gives Redis and etcd no complete listing ('Redis and etcd get no complete mode in this Epic ... a listing from them carries a completeness record that says it is a sample'), and c54 says 'this is put to the stakeholder', so it is not yet decided. The code confirms the listing is a bounded sample: redis.ts:137-138 `const limit = Math.min(Math.max(1, Math.floor(opts?.limit ?? 200)), 1000); const samplePool = Math.min(limit * 50, 5000);`, and the same at etcd.ts:115-116. After s4 the table-listing lookup and the object-listing plan task still return a cut listing for these two sources, which S004 ac1 forbids as written. The same applies to c46 (treating the classification and task loops like the free-form lookup), which is also 'put to the stakeholder'. [files: docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md, src/daemon/db/drivers/redis.ts, src/daemon/db/drivers/etcd.ts] | Record the stakeholder's decision on Redis/etcd (and on c46) in the HLD, and either amend DEF S004 ac1 to except sources with no countable namespaces or design a complete listing for them. |
| change-sites | MED | The cancellation inventory covers every caller that reaches a tool loop whose turn limit Story s4 removes: the daemon's three context requests and its plan request (socket), the one-shot tool and workflow runner (direct), and the plan tree's first step and the classifier (the run's signal). | The classifier has a second caller the design does not list for cancellation. daemon/index.ts:1737-1739 registers a fifth standard handler in the cited range, `'analyze.classify': async (params) => { ... return mod.classify(params); }`, and daemon/analyze-rpc.ts:319-322 runs `const opts: ClassifyOpts = { runId: parsed.runId }; ... const intent = await runClassifier({ input, opts });`. That reaches the classification loop at classifier/driver.ts:120 (`shaper.buildClassificationBundle`). The design names 'four context requests' at index.ts:1718-1748 and gives the signal parameter to 'buildRun and the other three'; for the classifier it says only that the plan tree 'pass[es] the run's existing signal'. An analyze.classify request has no run signal, is not one of the four functions given a signal parameter, and is not in the run-id-to-canceller table. Built as written, after s4 a classify request received over the socket runs a loop with no turn limit and no way to be stopped, which breaks the design's own rule that the limit is not removed until cancellation exists on every path. [files: src/daemon/analyze-rpc.ts, src/daemon/index.ts, src/analyze/classifier/driver.ts] | Add the daemon's classify request (analyze-rpc.ts:307, handler at index.ts:1737) to Story s4's cancellation inventory: give it the standard-handler signal, register it in the canceller table by run id, pass the signal into runClassifier, and map the cancelled case to 'aborted' in the daemon's classifier error mapping (analyze-rpc.ts:343). Correct the count of context-reaching standard handlers from four to five. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | The design states what becomes of the existing 'shaper-tool-loop-exhausted' failure once the turn limit is removed. | The code has a typed error and a code for reaching the limit in both lists: context/driver.ts:142 `super(`Shaper tool-loop exceeded maxToolTurns=${turns}`)`, :686 `throw new ShaperToolLoopExhausted(maxToolTurns)`, orchestrator/types.ts:275 and analyze-rpc.ts:136 'shaper-tool-loop-exhausted', mapped at orchestrator/driver.ts:437 and analyze-rpc.ts:896, and freeform-probe.ts:29 imports the class. I searched the HLD for the code and the class name and found no statement on whether Story s4 removes them, keeps them unused, or what Story s1's 'failed output' uses in the interval. It is not a contradiction, only unstated. | State in Story s4 (or sc6) whether 'shaper-tool-loop-exhausted' and ShaperToolLoopExhausted are removed from both code lists and both mappings with the limit, and note the mirrored IDE contract if they are. |
