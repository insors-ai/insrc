<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story adds one shared helper that divides an answer-writing model call's input into ordered parts when either the HLD's table from measured size to method says the request is above the partition size, or the rendered input does not fit a conservative character budget measured before every provider attempt. Each part is reasoned over serially, evidence and findings are assembled in code, and a staged combine writes only a bounded summary and always ends. Four callers use it: the lookup synthesis, the free-form lookup's final emit, the plan-tree aggregator and the step tool's answer turn. The handling report is typed, carried to the delivered answer on every path (including the free-form short-circuit and the plan tree's aggregates), shown in the answer's head, and a failed part, a failed combine or a failure that carries data is reported without losing the other results.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-b9d5c5c40df5a574** § 2. Framework summary

**Rollout phase:** Phase E — handling by size
**Owns:** `sc4` (Handling report)
**Consumes:** `sc1` (Completeness record), `sc2` (Answer report), `sc3` (Request measure), `sc6` (Causes of not proceeding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: With every limit still in place: returning the completeness record from each lookup and each plan-task runtime, saying when a limit was reached (limited), what was skipped and what was only partly read, and the basis each rests on. For the text search, reporting what it leaves out today: files over its size limit, files it could not read, lines it shortened, output it discarded, and the files each backend excludes by rule. Classifying every catch clause in the lookups and the plan-task runtimes: a clause that handles a named, expected condition stays and names what it skipped in the record; a clause that swallows an error is removed or rethrows, so that the lookup becomes the failed output. Deriving the answer report's overall completeness from those records and writing the completeness line at the head of every answer on both paths, in the layouts as they are today. Reporting a failure of the answer-writing step as a typed error that carries the lookup results and the report, in place of the 'model unavailable' error that discards them today, added as one more case to the raise site and the mapping that Story s6 owns, and passed through everything that reaches the context builder (six callers, the one-shot agent tool and the daemon's workflow runner, with the error's data carried through the daemon's error mapping). Keeping the report out of the schema given to a model at both places the schema reaches one (the answer-writing call and the tool loop's final answer), and rejecting a report an agent supplies. What the step tool attaches to a bundle the agent wrote. The declared report field on the bundle, its schema version, and how bundles and run records stored before the change are treated. The lookup cache's version. The lookup cache's stored shape changes with the outputs. The free-form fallback: an optional field for partial findings on the failed output, the loop's exit at the limit attaching what it gathered, reaching its turn limit becoming a failed output, and its answer gets a report that says it rests on a search directed by a model. Reading the data drivers' cut flag into the completeness record of the table-listing lookup and the object-listing plan task. — owns `sc1`, `sc2`
- `s2`: The two measuring sources and the mapping from counts to the five sizes. From lookup results, at all four places that assume a size today. From the named area, on the plan tree: the measuring pass after both classification branches, removal of the scope picker's model call, removal of the size from the classifier's output, what the decomposer and planner receive as size at each moment, the size's effect on plan depth as well as task count, and measuring a child plan from the area it names when it is spawned, with the planner model's figure and a size on the daemon request kept as hints. A size given by a caller or a slash command kept as a hint. The unmeasurable case. Filling the measure into the answer report and showing it in the answer. The source of the measure for each of the seven kinds of scope, including counting a data connection's tables or objects from the live source through the data driver, and the fallback to XL, recorded as not determined, when a count cannot be taken. Adding a complete mode to the data drivers' listings for the count (the five relational drivers, four of the six namespace drivers, the file listing; Redis and etcd are recorded as not determined, since their listing is a sample of keys), with the limited mode kept for other callers; a listing that reports it was cut is never a determined count. — owns `sc3`
- `s4`: Removing every limit on how many results a lookup or plan-task runtime returns: the sixteen sites the Define lists and those found since, in the lookups (the maxSources parameter of the two document lookups, the result cut in document retrieval, the cuts inside capability reuse-check, table describe and the document family summary, the preview limits of doc.mention) and in the plan-task runtimes (the file-list and file caps of data and infrastructure discovery and their sample caps). Removing the fixed cuts on an item's content at nine sites: the eight found when the Epic was defined, including the three adherence checks, and the indexer's own cut of a stored body to 8,192 characters (src/indexer/parser/artifact.ts), which Story s1 reports with the item's real length. The index is a pointer: at each of the nine sites, where an item's content matters to the answer, the analyzer reads the item from its file at the place the index points to and does not rely on the body the index stores. What the index stores and how it is built are not changed. The complete mode of the text search for both backends: no limit on hits, no per-file match limit, no cut of a matching line, no skipping of a file for its size, no discarding of output (the search's output is read as a stream, not kept up to a fixed size), a stated rule for a search that runs out of time (reported as failed, never as complete), and the files each backend excludes by rule stated in the result. Removing the limit parameters, their examples and the fan-out bound from the planning prompt. What was reported as limited in Story s1 now does not occur; the larger results are handled by Story s3's method. Raising the lookup cache's version again, and dropping limit parameters before a lookup's cache key is taken. Building cancellation (a signal from each caller through the context builder to a check between turns; the run's signal into the plan walk and the classifier; the optional signal on the daemon's standard handlers; the signal parameter on the daemon's context-building functions; a signal on the step tool's plan and narrow phases, through stepPlan and the runner context; the new cancel request for the five requests received over the socket that reach a tool loop (the three context requests, the plan request and the classify request), with the daemon's table of run id to canceller; the cancelled case in the classify stage's mapping; 'aborted' in the daemon's error codes; what a cancelled loop returns), moving the table-listing lookup and the object-listing plan task to the complete mode of the data drivers' listings, and only then removing the turn limit and retiring its configuration setting (catalog row, retired list, the analyzer's configuration, the planning prompt, the VS Code extension's declaration with a release, the pages that document it, the reconcile fixture) for all three users of the loop (the free-form lookup and the classification and task modes) and giving the loop the complete mode of its search tools. Removing the error and the code for reaching the turn limit from both lists and both mappings, with the tests that import the error and the test configuration that sets the limit.
- `s5`: Adding the enumeration question kind to the planner's choices and rendering it directly from lookup results, including returning it from the step tool's plan phase with no model turn. Choosing a layout by question kind and source kind at both places a layout is selected today. Removing the limits from the six layouts and the older per-source layouts and from the summariser's output schema. Making each layout describe every lookup it may draw on, with that reference at the end of the prompt. Laying out the answer report, which Stories s1 to s3 already write, in the form each layout uses. — owns `sc5`
- `s6`: Giving a request that asks no specific question a run context: what the lookup pipeline plans for it (a broad survey of the area it names, from the lookups that exist) where today it returns at once; the same for a request started with a stated kind of source, which is always marked unfocused; serving, in the lookup pipeline, the four kinds of scope it returns for today (a file, a symbol, a manifest directory, a data connection), and how each resolves to what the lookups need. Replacing the single 'model unavailable' error with the cause of each way of not proceeding, as new codes in the existing list and new typed errors, and with the existing codes where one fits: every place the pipeline returns nothing, and the fall-through for a bundle that fails validation, is listed and given its cause. It owns the place the error is raised, the pipeline's rule for returning nothing, and the functions that map these errors to codes (the plan tree's and the daemon's, and the classify stage's mapping, through which an error from the classifier's context build is routed). The form of a symbol scope's value, its resolution to one stored entity, and the validator and classifier prompt brought in line. The one function that resolves a scope's value to a repo, a path or an entity, and moving the lookup pipeline's direct readers of the value to it (the planning prompt, the context builder's path resolution, the indexed check). Correcting the table of which kind of scope goes with which kind of source, with the classifier prompt's copy of it, the table's comment and the matrix test, and applying it on both classification branches: the plan tree's classify mapping surfaces the validator's inner code, and the branch with no classifier calls the validator's checks directly. Supplying the connection check from both callers of the classifier, and mapping a connection id to its repo. It declares all three new codes in both lists; Stories s1 and s7 raise one each. — owns `sc6`
- `s7`: Widening the plan tasks of each family (code, docs, infra, data) to exactly the kinds of scope the corrected table gives it, with the scope check the docs tasks share with the code tasks taking the family's row as an argument, and every task that reads the scope's value directly (three docs tasks, the shared adherence task, the task that lists data connections) moved to the resolution function Story s6 defines, including a data connection for the data tasks, and refusing any other pairing with the existing code for it. Running a broad analysis through classification, the run context, planning, the plan walk with its nested plans, and the aggregator, to a final report; finding and correcting what stops it at each stage. A stop the run catches is already recorded; what is added is a handler for an error nothing catches, in the plan walk and in the daemon's request, that writes the run record, and the rule that a record still in progress with no live run behind it is abandoned: the process's in-memory count of the runs it is executing per id, and the two readers that apply it, the status request and the purge, each rewriting the record as failed with the code 'run-abandoned', which Story s6 declares and this Story raises; a new run replaces a record left in progress with its own first record. Making a task's refusal of a scope a typed error the plan walk recognises, with an optional code on the failed-task record. Its design begins by running one and recording how far it gets; if what is found is more than one Story, it is brought back to be split. Two stops the first runs of 2026-10-08 found are corrected here as well: the aggregate-report task runs on the inputs that exist when a task before it failed and is told which are absent, so that a run with a failed task returns a report that names what is missing; and the daemon's run request accepts an empty prompt when the caller states the kind of source. Two further stops are not this Story's: what the code tasks treat as a module is Story s8's, and an aggregate input larger than one model call accepts is Story s3's. For the second, a broad docs analysis not completing on a repository of that size is an exception the stakeholder accepted on 2026-10-08, to be closed by Story s3.
- `s8`: Private implementation of s8: The code tasks of a broad analysis work on a repository whose graph has no modules for its directories

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `synthesize`

```typescript
synthesize(args: SynthesizeArgs): Promise<Omit<AnalyzeContextBundle, 'meta'>>
```

**Parameters:**
- `args: SynthesizeArgs` — Existing arguments, plus the optional size (the measure's size, for the table) and the optional onHandling callback that receives the HandlingReport.

**Returns:** `Promise<Omit<AnalyzeContextBundle, 'meta'>>` — The bundle: the one call made today when the size is below the partition size and the input fits, else the assembled bundle of the parts.

**Errors:**
- `HandlingBudgetError` when The fixed context leaves no room for the minimum section, a combine stage cannot shrink, or every part failed; carries the lookup results and the report.
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.

**Preconditions:**
- The plan has been executed

**Postconditions:**
- Model calls are made one after another
- A failed combine returns the per-part results with the failure reported, it does not throw

### 2.2 `prepareSynthesize`

```typescript
prepareSynthesize(args: Omit<SynthesizeArgs, 'runId' | 'provider'>, progress?: AnswerProgress): SynthesizePrepared
```

**Parameters:**
- `args: Omit<SynthesizeArgs, 'runId' | 'provider'>` — Existing arguments.
- `progress: AnswerProgress` _(optional)_ — What the in-session model has done so far; absent on the first call, and an absent progress gives today's result.

**Returns:** `SynthesizePrepared` — The existing prompt, user turn and schema, now with a turn field naming 'answer', 'part' or 'combine' and its identity.

**Errors:**
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.
- `HandlingBudgetError` when As for synthesize.

**Preconditions:**
- progress comes from the stored step state

**Postconditions:**
- The rendered input of the turn fits the budget

### 2.3 `finalizeSynthesize`

```typescript
finalizeSynthesize(raw: unknown, execution?: ConnectionExecutionContext, progress?: AnswerProgress): Omit<AnalyzeContextBundle, 'meta'> | FinalizedAnswerTurn
```

**Parameters:**
- `raw: unknown` — The JSON the in-session model emitted for the current turn.
- `execution: ConnectionExecutionContext` _(optional)_ — Existing second parameter, kept in place; validateAgainstSchema requires it for session-memory calls.
- `progress: AnswerProgress` _(optional)_ — New third parameter: the progress the turn was prepared with.

**Returns:** `Omit<AnalyzeContextBundle, 'meta'> | FinalizedAnswerTurn` — Without progress it returns the bundle exactly as today. With progress it returns a FinalizedAnswerTurn: {kind:'final', layers, handling} or {kind:'next', progress}.

**Errors:**
- `SynthesizerSchemaUnrecoverable` when Existing: the reply fails the schema; the bundle handler counts it in progress.retries.

**Postconditions:**
- Evidence layers are assembled in code and never taken from a combine reply
- A caller that passes no progress is unchanged

### 2.4 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — Existing arguments: upstream outputs and absent inputs; gains the optional size of the run.

**Returns:** `Promise<AggregateReport>` — The report; metadata gains the optional handling field.

**Errors:**
- `HandlingBudgetError` when As for synthesize.
- `Error with the existing aggregator prefixes` when A single call fails with no part results to return.

**Preconditions:**
- The absent-input section is rendered in every part and every combine call and counted in the measure

**Postconditions:**
- Findings of covered parts are concatenated in code by ordinal; the model writes only the summary

### 2.5 `runFinalStructuredEmit`

```typescript
runFinalStructuredEmit(provider: LLMProvider, messages: LLMMessage[], structuredOutputRetries: number, maxOutputTokens: number, onTrace?: (event: ShaperTraceEvent) => void, execution?: ConnectionExecutionContext, onHandling?: (h: HandlingReport) => void): Promise<AnalyzeContextBundle>
```

**Parameters:**
- `messages: LLMMessage[]` — The tool-loop conversation; over the limits its tool-result messages are the blocks the helper divides.
- `provider: LLMProvider` — Existing; its inputBudgetChars feeds the budget.
- `structuredOutputRetries: number` — Existing.
- `maxOutputTokens: number` — Existing; also the output reserve for a local model.
- `onTrace: (event: ShaperTraceEvent) => void` _(optional)_ — Existing.
- `execution: ConnectionExecutionContext` _(optional)_ — Existing.
- `onHandling: (h: HandlingReport) => void` _(optional)_ — New: receives the HandlingReport; the tool loop passes it to its result as a handling field and the free-form lookup copies it to its output.

**Returns:** `Promise<AnalyzeContextBundle>` — The bundle: the one call made today when the conversation fits, else the assembled bundle.

**Errors:**
- `HandlingBudgetError` when As for synthesize.

**Postconditions:**
- A conversation that fits makes the one call made today

### 2.6 `failedOutput`

```typescript
failedOutput(exp: Exploration, err: unknown, execution?: ConnectionExecutionContext): FailedExplorationOutput
```

**Parameters:**
- `exp: Exploration` — Existing.
- `err: unknown` — Existing: the thrown error; a LookupFailedError now also carries an optional handling report.
- `execution: ConnectionExecutionContext` _(optional)_ — Existing.

**Returns:** `FailedExplorationOutput` — The failed output with partial findings as today, and the handling report when the error carried one.

**Postconditions:**
- A HandlingBudgetError raised inside the free-form lookup has been turned into a LookupFailedError carrying its tool results and handling, so no data is lost

### 2.7 `extractSoleFreeformResult`

```typescript
extractSoleFreeformResult(executed: Awaited<ReturnType<typeof executePlan>>): { rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null
```

**Parameters:**
- `executed: Awaited<ReturnType<typeof executePlan>>` — Existing.

**Returns:** `{ rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null` — As today, plus the free-form output's handling, which the pipeline puts on the report that reportFromLookups derives.

**Postconditions:**
- A failed free-form output still returns null, so it reaches the answer-step failure with its report

### 2.8 `collectPlanSources`

```typescript
collectPlanSources(tree: PlanTreeNode, executed: ExecutorResult, parentPath?: string): ReportSource[]
```

**Parameters:**
- `tree: PlanTreeNode` — Existing.
- `executed: ExecutorResult` — Existing.
- `parentPath: string` _(optional)_ — Existing: the path of the parent plan.

**Returns:** `ReportSource[]` — The sources as today, plus one source per not-covered part of each plan's aggregate task, named by the aggregate task's path and the part id.

**Postconditions:**
- The aggregate task is still not a source of its own completeness; only its handling is read

### 2.9 `concludeRun`

```typescript
concludeRun(tree: PlanTreeNode, executed: ExecutorResult, contextReport: AnswerReport | undefined, measure?: RequestMeasure): { report: AnswerReport; finalReport: unknown }
```

**Parameters:**
- `tree: PlanTreeNode` — Existing.
- `executed: ExecutorResult` — Existing.
- `contextReport: AnswerReport | undefined` — Existing: the run context's report.
- `measure: RequestMeasure` _(optional)_ — Existing.

**Returns:** `{ report: AnswerReport; finalReport: unknown }` — The report carries handling merged from the run context and from the root and nested aggregates, and its visible head shows it.

**Postconditions:**
- A partially failed aggregation makes the run's completeness false

### 2.10 `mergeAnswerReports`

```typescript
mergeAnswerReports(first: AnswerReport, second: AnswerReport, prefix?: string): AnswerReport
```

**Parameters:**
- `first: AnswerReport` — Existing.
- `second: AnswerReport` — Existing.
- `prefix: string` _(optional)_ — Existing: tags the first report's sources.

**Returns:** `AnswerReport` — The merge as today, plus handling merged by mergeHandling with the same prefix rule.

**Postconditions:**
- The signature and the prefix behaviour are unchanged

### 2.11 `renderReportHead`

```typescript
renderReportHead(report: AnswerReport): string
```

**Parameters:**
- `report: AnswerReport` — Existing.

**Returns:** `string` — The head as today, plus one handling line after the measure line when the report has handling.

**Postconditions:**
- Both paths show the line, because the lookup path and concludeRun both build their head from this function
- A report without handling renders as today

## 3. Data model changes

### 3.1 `HandlingReport` — new

The sc4 contract typed. method, parts, partitionedBy, notCovered[{part, reason}] as sketched, plus additive fields: combineStages (optional), inputChars, budgetChars, budgetSource ('provider' | 'context-window' | 'default'), and trigger ('size' | 'fit' | 'both') saying which condition divided it. partitionedBy gains 'mixed'. Counting: parts is the number of first-level parts including failed ones; a single pass has parts 1. A part id is its ordinal and heading ('part 3: docs/a'); mergeHandling qualifies it with the plan path. Composition by mergeHandling(first, second, prefix): an absent side is ignored; method is 'partitioned' if either is; parts is the sum of the two parts counts (a single pass counts 1); notCovered is the concatenation with the first side's part ids qualified by the prefix; inputChars is the maximum; budgetChars and budgetSource are those of the side with the smaller budgetChars; combineStages is the sum when either has it; partitionedBy is the common value or 'mixed'; trigger is the union. So a single-pass root with a partitioned child reports 'partitioned' with parts one more than the child's.

```
readonly combineStages?: number | undefined; readonly inputChars: number; readonly budgetChars: number; readonly budgetSource: 'provider' | 'context-window' | 'default'; readonly trigger: 'size' | 'fit' | 'both'; partitionedBy adds 'mixed'
```

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/completeness.ts:404-420`

### 3.2 `AnswerReport.handling` — field-modify

Type changes from unknown to HandlingReport | undefined. Current-behaviour invariant it might break: the bundle schema declares handling as an open object, so a stored value such as {} is valid today, and isAnswerReport does not validate it. A read-boundary guard parseHandling(value: unknown): HandlingReport | undefined accepts only a value with the required fields and treats anything else as absent; mergeHandling, renderReportHead and isAnswerReport use it, and a stored {} is read as no handling.

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/completeness.ts:377-382`
- `src/analyze/completeness.ts:404-420`

### 3.3 `HANDLING_TABLE and answerInputBudget` — new

HANDLING_TABLE maps the sc3 size to the method: XS and S single pass, M, L and XL partitioned; 'determined: false' is XL, so an unmeasured request is partitioned. answerInputBudget(provider?, outputTokens?) returns {chars, source}: provider.inputBudgetChars when declared (source 'provider'); else for a local model (window tokens minus outputTokens) times 2 characters per token (source 'context-window'), where the window is the figure ollamaContextWindow gives num_ctx; else 60,000 characters (source 'default', also used by the step tool, which has no provider); a 16,000-character reserve is then subtracted for framing, schema text and the first repair note. The decision to divide is: the table says partitioned, OR the rendered input (messages, repeated context, absent-input section) exceeds the budget. The fit is measured before every provider attempt, including each repair retry with the actual repair note, which is capped at 8,000 characters of listed errors (the rest summarised as a count); a retry that would not fit divides the part further, up to three times. The ratio is a conservative estimate and not a bound: no character count can prove a local model's input fits, completeStructured returns parsed content only and Ollama's processed-token count is cache-dependent and not returned, so the report records the budget and its source and does not claim truncation is prevented.

**Call sites:**
- `src/shared/types.ts:199-203`
- `src/analyze/context/shaper-provider.ts:205-250`
- `src/agent/providers/structured-output.ts:150-175`
- `src/agent/providers/ollama.ts:571-605`

### 3.4 `PartPlan, PartResult and the caller adapters` — new

A PartPlan is the ordered blocks of the evidence with an ordinal separate from the block key, grouped by directory then file in stable order; one block larger than the room is cut into consecutive sections of at least 4,000 characters, each keeping its key and an index. A PartResult holds the part's heading, its summary (capped at 2,000 characters by the schema) and its assembled content. The bundle adapter takes system, focus and summary from the final combine and concatenates structure, surface, artefacts and upstream of the covered parts by ordinal under part headings; the aggregate adapter takes the summary from the final combine and concatenates the findings of the covered parts by ordinal, each keeping its sources. A combine reply is never read for evidence or findings. Combine stages: N summaries become ceil(N/g) with g at least 2, so it ends in at most ceil(log2 N) stages; if fixed context plus two capped summaries does not fit, HandlingBudgetError is raised. A combine failure returns the adapter's output from the per-part results with 'combine' in notCovered.

**Call sites:**
- `src/analyze/context/synthesizer.ts:117-169`
- `src/analyze/runtimes/shared/aggregator.ts:100-155`
- `src/analyze/runtimes/shared/aggregate-types.ts:28-80`

### 3.5 `HandlingBudgetError and LookupFailedError` — new

HandlingBudgetError is a typed error for a fixed context with no room for the minimum section, a stage that cannot shrink, or every part failed; it carries the lookup results and the report with every part named in notCovered. LookupFailedError (message, partial, cause) gains an optional handling field. The free-form lookup catches a HandlingBudgetError from the tool loop and throws a LookupFailedError carrying the tool results as partial and the handling, so executePlan keeps them in the failed output instead of dropping them, and the pipeline then raises the answer-step failure that Story s1 declares, with the report. The driver passes HandlingBudgetError through unchanged instead of mapping it to 'answer-invalid'.

**Call sites:**
- `src/analyze/explore/lookup-failed.ts:20-34`
- `src/analyze/explore/freeform-probe.ts:150-200`
- `src/analyze/explore/executor.ts:690-715`
- `src/analyze/context/driver.ts:1662-1690`

### 3.6 `AnswerProgress and StepStatePayload` — field-add

AnswerProgress is {completed: PartResult[] by ordinal, pending: {kind 'part' | 'combine', ordinal or stage and group index}, stageOutputs, failures: {part, reason}[], retries}. It is held in the step state beside the stages awaiting_part and awaiting_combine and passed to prepareSynthesize and finalizeSynthesize(raw, execution, progress); the bundle handler persists it by re-encoding the state token on every valid transition, increments retries and re-encodes on an invalid reply, records the part or the combine as failed at the retry bound and continues, and releases it on terminal success and failure. The handler consumes FinalizedAnswerTurn: 'final' continues as today with the layers and records the handling; 'next' persists the progress and emits the next turn. A state written before the change lacks progress and is read as a single-pass state.

**Call sites:**
- `src/daemon/steps/analyze-step/phases/bundle.ts:90`
- `src/daemon/steps/analyze-step/types.ts:56-157`

### 3.7 `StepOutputEmitPart and StepOutputEmitCombine` — new

Two outputs added to the StepOutput union beside StepOutputEmitBundle with the same fields plus the part ordinal and total, or the stage and group. A reply reuses the registered bundle argument of seven string layers (a part reply is a seven-layer bundle of that part with its summary within the cap; a combine reply fills system, focus and summary and leaves the four evidence layers empty), so the registered MCP schema and StepInputBundle are unchanged and the legacy emit_bundle turn is kept. A typed answer failure is returned as StepOutputError with the code Story s1 declares and its data, not as an uncaught exception.

**Call sites:**
- `src/mcp/server.ts:408-425`
- `src/daemon/steps/analyze-step/types.ts:56-157`
- `src/daemon/steps/analyze-step/handler.ts:118`

### 3.8 `AggregateReport.metadata.handling` — field-add

Carries the HandlingReport of the aggregator call, validated by parseHandling on read. collectPlanSources reads it for the aggregate task of the root plan and of each nested plan, and concludeRun merges them with the run context's handling through mergeHandling, so uncovered parts make the run's completeness false.

**Call sites:**
- `src/analyze/executor/plan-sources.ts:43-92`
- `src/analyze/orchestrator/driver.ts:605-632`

## 4. Diagrams

- [Sequence diagram](docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Types HandlingReport with additive fields (combineStages, inputChars, budgetChars, budgetSource, trigger, and 'mixed' for partitionedBy), states the composition rules, and fills it on every answer of both paths. |
| `sc2` | consumes | Fills AnswerReport.handling; keeps the binary mergeAnswerReports(first, second, prefix); renders one handling line in renderReportHead; uncovered parts add source notes and make completeness false. |
| `sc1` | consumes | A result whose part or combine failed is incomplete; plan-task completeness records are read as today and the aggregate's handling is added as sources. |
| `sc3` | consumes | Reads RequestMeasure.size for HANDLING_TABLE (an undetermined measure is XL); measure.characters stays a hint. |
| `sc6` | consumes | Uses the answer-step-failed code declared by sc6 and raised by Story s1 for HandlingBudgetError and all-parts-failed; no new code. |

## 6. Error paths

**Error cases**

- **A part's model call fails, or its reply fails the schema after the bounded retries** (recoverable)
  - Detection: The part call throws, or finalizeSynthesize raises SynthesizerSchemaUnrecoverable and progress.retries reaches the structured-output retry setting
  - Response: The part is recorded in failures and named in HandlingReport.notCovered with its qualified id and reason; the other parts are kept; completeness is false
  - User impact: The answer is delivered and names the part that was not covered and why
- **Every part fails** (terminal)
  - Detection: failures holds all parts and completed is empty
  - Response: HandlingBudgetError is raised with the lookup results and the report, and is returned as the answer-step failure that Story s1 declares
  - User impact: A typed failure that keeps what the lookups found; no empty answer is written
- **The combine call fails or its reply stays invalid after the retries** (recoverable)
  - Detection: The combine call throws, or its reply fails the schema at the retry bound
  - Response: The output is built from the per-part results unchanged by the adapter, its summary layer being the part summaries concatenated by ordinal, and 'combine' is added to notCovered; nothing is thrown
  - User impact: The per-part results are returned with the combine failure reported
- **A combine stage cannot shrink its input** (recoverable)
  - Detection: The helper checks before a stage that fixed context plus two capped summaries fits the budget, and after a stage that the count of summaries fell
  - Response: If the check before fails, HandlingBudgetError is raised; if the count did not fall, the stage is treated as a combine failure and the per-part fallback applies
  - User impact: The combine always ends
- **The fixed context alone, or one minimum section with it, exceeds the budget** (terminal)
  - Detection: Fixed rendered characters plus the minimum section of 4,000 characters is more than the budget
  - Response: HandlingBudgetError with the results and the report; dividing the evidence cannot make the call fit, so no partial answer is written
  - User impact: A typed failure that says the context is larger than the model accepts
- **A schema-repair retry would not fit** (recoverable)
  - Detection: The helper measures the actual input of the retry (the part, the schema text and the repair note, which lists every validation error and is capped at 8,000 characters with the rest counted) before the attempt
  - Response: The part is divided into smaller consecutive sections up to three times, then recorded as not covered
  - User impact: A malformed reply with many errors cannot push a call over the limit unnoticed
- **The provider refuses a part as too large** (recoverable)
  - Detection: InputTooLargeError from the provider, whose sizes may be undefined
  - Response: The part is divided into smaller consecutive sections up to three times, and then recorded as not covered
  - User impact: The part is read in full or named; nothing is silently cut
- **A local model's input is larger than the estimate said** (terminal)
  - Detection: Not detectable by the caller: completeStructured returns parsed content only and Ollama's processed-token count is cache-dependent and not returned
  - Response: Not claimed to be prevented: the estimate is conservative (2 characters per token, output tokens and a 16,000-character reserve subtracted), the budget and its source are recorded in the report, and the limitation is stated
  - User impact: A wrong window figure is visible in the report; accuracy is protected by dividing earlier, at the cost of more calls
- **A typed answer failure is thrown from inside the free-form final emit** (terminal)
  - Detection: The free-form lookup catches HandlingBudgetError from the tool loop, as executePlan would otherwise turn any error that is not a ConnectionExecutionError into a failed lookup with no data
  - Response: It throws a LookupFailedError carrying the tool results as partial and the HandlingReport; failedOutput keeps both; the pipeline raises the answer-step failure with the report and does not attempt a second synthesis
  - User impact: The caller receives the failure with what the search found and how far the handling got
- **A typed answer failure is thrown from inside synthesize** (terminal)
  - Detection: The driver's catch sees HandlingBudgetError or ShaperAnswerStepFailedError
  - Response: The driver passes it through unchanged instead of mapping it to 'answer-invalid', and the step tool returns it as StepOutputError with the declared code and its data
  - User impact: The caller receives the error with the lookup results and the report
- **A stored handling value is malformed** (recoverable)
  - Detection: parseHandling finds a missing required field or a wrong type, as for the stored {}
  - Response: The value is treated as absent by mergeHandling, renderReportHead and isAnswerReport; it is not written back
  - User impact: An old record is read without handling instead of failing
- **The aggregate of a nested plan reports uncovered parts** (recoverable)
  - Detection: collectPlanSources reads parseHandling(metadata.handling) of that plan's aggregate task and finds a non-empty notCovered
  - Response: One source per uncovered part is added, named by the aggregate task's path and the part id, so the run is incomplete
  - User impact: A partly failed aggregation never produces a run labelled complete

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A size of XS or S whose rendered input fits the budget | Single pass: the one call made today, with handling single-pass, parts 1 and trigger absent. |
| A size of M or larger whose rendered input fits the budget | The table divides it: partitioned with trigger 'size'. |
| A size of S whose rendered input exceeds the budget | The fit check divides it: partitioned with trigger 'fit'; both conditions give trigger 'both'. |
| A measure that could not be determined | Size XL: partitioned by the table. |
| Rendered input exactly at the budget | The fit check does not divide it. |
| A model with no declared limit, and the step tool | The default of 60,000 characters is used and recorded with budgetSource 'default'. |
| A single block larger than the room | It is cut into consecutive sections with its key and an index; the whole content is read and partitionedBy is 'section'. |
| A request with no results | Single pass with parts 1 if the table says so and the fixed context fits. |
| A single-pass root report merged with a partitioned child | Merged method 'partitioned', parts the sum with the single pass counted as 1, budget taken from the side with the smaller budgetChars. |
| Two nested plans that both have a part 1 | mergeHandling qualifies each part id with its plan path, so the two stay distinct. |
| A free-form conversation that fits | The short-circuit returns the one call's bundle as today with handling single-pass, copied onto the report. |
| A stored bundle with handling {} | It validates against the open schema and parseHandling reads it as absent. |
| finalizeSynthesize called as today with no progress, with a saved or a session-memory execution | It returns the bundle as today and validates with the execution it was given. |
| A step state written before the change | It lacks progress and is read as a single-pass state. |

**Invariants to preserve**

- Model calls are made one after another, never in parallel, including part and combine calls [[c1]]
- A request below the partition size whose input fits makes the same single model call as today [[c1]]
- finalizeSynthesize keeps its existing execution parameter in second place, and the bundle handler keeps passing it [[c1]]
- A failed free-form lookup does not take the free-form short-circuit and keeps the data it carries [[c2]]
- The plan's aggregate task is not a source of its own completeness; only its handling is read [[c3]]
- mergeAnswerReports keeps its binary signature and its prefix rule for the run context's sources [[c3]]
- A report without handling renders the same head as today [[c3]]
- The step tool's registered bundle argument and legacy emit_bundle turn stay valid [[c5]]

## 7. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing analyze, orchestrator, executor and daemon step-tool suites; live runs gate behind INSRC_LIVE_TESTS=1 as the project does`

**Test levels**

- **unit** — Prove the table, budget, fit check, division, assembly and combine rules without a model
  - Subjects: `HANDLING_TABLE: XS and S single pass, M, L and XL partitioned, an undetermined measure is XL`, `decision: the table alone divides (trigger 'size'), the fit check alone divides a small size (trigger 'fit'), both give 'both', and an input exactly at the budget is not divided by the fit check`, `answerInputBudget: provider budget, context window at 2 characters per token with output tokens subtracted, the 60,000 default, the 16,000 reserve, exact boundaries`, `fit measured before every attempt including a repair retry with the actual repair note, the note capped at 8,000 characters with the rest counted, and a retry that would not fit dividing the part up to three times`, `division by directory then file then consecutive sections, ordinals separate from keys, sections of one block kept in order with none dropped`, `unsplittable overhead: fixed context larger than the budget, no room for the 4,000-character minimum section, and a combine stage that cannot fit two capped summaries all raise HandlingBudgetError with results and report`, `combine terminates: N summaries become ceil(N/g) per stage, at most ceil(log2 N) stages, and a stage whose count does not fall is a combine failure`, `the bundle adapter and the aggregate adapter keep evidence layers and findings exactly, in order, through several combine stages`, `combine failure returns the per-part results with 'combine' in notCovered and throws nothing`, `parseHandling reads a stored {} and other malformed values as absent`, `mergeHandling: absent side ignored; single-pass root with partitioned child gives 'partitioned' and the summed parts; budgetChars and budgetSource from the side with the smaller budget; combineStages sum; partitionedBy 'mixed'; equal local part ordinals in two nested plans stay distinct by plan path`, `mergeAnswerReports keeps its binary signature and prefix behaviour`, `renderReportHead: a report without handling renders exactly as today; with handling it adds one line with method, parts, budget and each not-covered part with its reason`
  - Fixtures: `a scripted provider that records each call, proves no two overlap, and can fail a chosen part, the combine or a repair attempt, refuse an input as too large, or return a reply with many validation errors`, `a lowered budget so a small input divides`
- **integration** — Prove the four callers, the failure routes and the bridge into the delivered answer, through real modules and a scripted provider
  - Subjects: `synthesize: below the partition size and fitting makes the one call of today; above it or not fitting it divides, and a failed part is named`, `free-form lookup: a conversation that fits returns the loop's bundle with handling single-pass copied onto the report reportFromLookups derives; one that does not fit is divided and combined; a HandlingBudgetError becomes a LookupFailedError carrying the tool results and the handling, survives executePlan into the failed output, does not take the short-circuit and reaches the answer-step failure with the report`, `runAggregator with the absent-input section counted in every part and every combine call`, `collectPlanSources and concludeRun with a root and a nested aggregate that each have uncovered parts: the run is incomplete, the report's handling is merged and the visible head shows the handling line`, `driver passes HandlingBudgetError and ShaperAnswerStepFailedError through without mapping them to 'answer-invalid'`, `step tool through the real handler: finalizeSynthesize called with a saved and with a session-memory execution, with and without progress; emit_part and emit_combine turns; replies submitted through the registered bundle argument; progress persisted with token replacement; repeated invalid replies across separate calls reaching the retry bound; progress released on terminal success and failure; a typed failure returned as StepOutputError with data; a state written before the change read as single pass`, `the legacy emit_bundle turn still passes for an input that fits`
  - Fixtures: `step tool state fixtures including one from before the change`, `a plan tree with a nested plan whose aggregate task records have handling`
- **integration** — Prove the accepted exception of Story s7 is closed by a run, not only by a direct call to the aggregator
  - Subjects: `a broad docs analysis run through the real docs aggregate runtime and the plan walk, with an oversized terminal input and a nested aggregate: the run completes, the final report is delivered, and its head states the handling and the completeness`
  - Fixtures: `a docs plan tree with oversized upstream outputs, a scripted provider, a lowered budget`
- **live** — Reproduce the actual failure of 2026-10-08 with real run-context construction, planning and the real provider limit
  - Subjects: `the broad docs request on this repository that previously stopped at the aggregate step runs to a final report, and the recorded run (run id, handling line, parts, completeness) is kept as the regression record`
  - Fixtures: `a registered and indexed repository, a configured provider, INSRC_LIVE_TESTS=1`
- **contract** — Prove the shape other Stories consume
  - Subjects: `HandlingReport against the sc4 sketch plus the additive fields`, `the bundle schema keeps its open handling object valid and AnswerReport.handling is typed`, `the registered MCP bundle argument is unchanged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handling-table.test.ts: every size on both paths takes the table, and the fit check divides what the table would not`, `handling-budget.test.ts: exact-boundary, repair-retry and unknown-limit cases`, `synthesize-handling.test.ts: single pass versus divided decision for the lookup path and the free-form lookup` |
| `ac2` | `partition-combine.test.ts: every part is reasoned over serially and evidence and findings are kept exactly through several combine stages`, `partition-combine.test.ts: the combine terminates and a combine failure returns the per-part results` |
| `ac3` | `handling-report.test.ts: parts and notCovered with plan-qualified ids appear in the answer report and in the rendered head`, `run-handling-report.test.ts: a root and a nested aggregate with uncovered parts make the run incomplete and the visible head shows the handling line` |
| `ac4` | `synthesize-handling.test.ts: a small size whose input fits makes the same single call`, `freeform-handling.test.ts: a conversation that fits returns directly` |
| `ac5` | `partition-combine.test.ts: a failed part is kept out, the others are kept, completeness is false`, `step-tool-parts.test.ts: the retry bound marks a part not covered across separate calls`, `freeform-handling.test.ts: a HandlingBudgetError keeps the tool results and the handling through executePlan` |
| `ac6` | `partition-combine.test.ts: one block larger than the room is read in consecutive sections with none dropped` |
| `ac7` | `docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker and delivers a final report with its handling`, `aggregator-handling.test.ts: the aggregator divides an oversized input and keeps the absent-input section in every call`, `docs-broad-live.test.ts: the recorded live run of the broad docs request returns a final report` |

## 8. Migration

**State before:** synthesize and runAggregator render the whole of their inputs into one prompt and make one model call with no size check (src/analyze/context/synthesizer.ts:117-169, src/analyze/runtimes/shared/aggregator.ts:100-155). finalizeSynthesize(raw, execution?) is called by the bundle handler with the execution (src/analyze/context/synthesizer.ts:191-225, src/daemon/steps/analyze-step/phases/bundle.ts:90). The free-form lookup's final emit takes the whole conversation, a non-ConnectionExecutionError from it becomes a failed lookup that keeps data only for a LookupFailedError, and the short-circuit copies only the seven layers (src/analyze/explore/freeform-probe.ts:150-200, src/analyze/explore/executor.ts:690-715, src/analyze/context/driver.ts:1004-1044, 1662-1690). AnswerReport.handling is typed unknown (src/analyze/completeness.ts:206), mergeAnswerReports is binary with a prefix, renderReportHead shows no handling (src/analyze/completeness.ts:377-420), and collectPlanSources skips each plan's aggregate task (src/analyze/executor/plan-sources.ts:43-92). The step tool keeps no progress on a bad reply.

**State after:** The four callers use one shared helper that divides when the HLD's table says so or the rendered input does not fit a conservative budget measured before every attempt. Evidence and findings are assembled in code, a staged combine writes only the summary and always ends, a failed part or combine is named while the other results are kept. finalizeSynthesize keeps execution in second place and takes progress third. A typed failure from the free-form final emit survives the executor with its data and the handling, the handling reaches the delivered answer on every path through the report, and renderReportHead shows it. The step tool carries an AnswerProgress object persisted on every transition.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add HandlingReport, parseHandling, mergeHandling, HANDLING_TABLE and the budget policy with the single-pass decision only; nothing divides yet — ↩ rollbackable
2. Type AnswerReport.handling, merge handling in mergeAnswerReports with its unchanged signature, and render the handling line in renderReportHead — ↩ rollbackable
3. Add division, assembly adapters and the staged combine, and move synthesize and runAggregator onto them so the in-budget small case is unchanged — ↩ rollbackable
4. Move the free-form final emit onto the helper, add the handling callback and field, carry handling in LookupFailedError and failedOutput, and copy it in extractSoleFreeformResult onto the derived report — ↩ rollbackable
5. Make collectPlanSources read each plan's aggregate handling and concludeRun merge it — ↩ rollbackable
6. Add the optional AnswerProgress to the step state, the third progress parameter of finalizeSynthesize and the emit_part and emit_combine outputs, persisting progress on every transition — ↩ rollbackable
7. Pass HandlingBudgetError and the answer-step failure through the driver and the step tool as the declared typed failure — ↩ rollbackable

**Backward compat:** All new state and report fields are optional or additive, and the one addition to an existing union value (partitionedBy 'mixed') is on a contract this Story owns. finalizeSynthesize keeps raw and execution in their positions and returns the bundle exactly as before when no progress is given, so the bundle handler's existing call is unchanged. A step state written before the change lacks the progress and is read as a single-pass state. A stored bundle with an open handling object stays valid and a malformed value is read as absent. A report without handling renders the same head. A small request whose input fits makes the same calls as before. synthesize, runAggregator, runFinalStructuredEmit, mergeAnswerReports, collectPlanSources, concludeRun and renderReportHead keep their signatures with new parameters optional. The registered MCP bundle argument is unchanged and the legacy emit_bundle turn is kept.

## 9. Alternatives considered

### 9.1 a1: Size table plus a rendered-input fit check in one shared helper, with caller adapters, carried-data failures and a rendered handling line — **CHOSEN**

One helper divides an answer-writing call's input when either the HLD's size table says the request is above the partition size or the rendered input does not fit a conservative character budget, and it carries the handling report to the delivered answer on every path.

(1) Decision: the helper partitions when EITHER condition holds: the measured size (sc3) is at or above the table's partition size, or the single rendered input (messages, repeated context, absent-input section) exceeds the budget. The table maps XS and S to single pass, and M, L and XL to parts; the fit check forces division of anything that does not fit regardless of size, and it is measured before every provider attempt, including each schema-repair retry with its actual repair note (the note is capped at 8,000 characters of listed errors, the rest summarised as a count), and a retry whose input would not fit divides the part further. (2) Budget: provider.inputBudgetChars when declared; else for a local model (window tokens minus output tokens) times 2 characters per token, stated as a conservative estimate and not a bound; else 60,000 characters; a reserve of 16,000 characters for framing, schema text and the first repair note. The report records the budget and its source, and the wording never claims truncation is prevented. (3) Division and assembly as before: blocks by directory then file, one oversize block in consecutive sections of at least 4,000 characters, ordinals separate from keys, part replies capped at 2,000 characters of summary, evidence and findings assembled in code by ordinal, a staged combine of N summaries into ceil(N/g) with g at least 2 that writes only the summary layers, a combine failure returning the per-part results with the failure reported, a typed budget error carrying the results and the report when nothing can fit. (4) Callers: synthesize, runAggregator, the free-form final emit and the step tool. The free-form final emit reports its HandlingReport through a handling callback on the tool loop's arguments and a handling field on the loop's result and on the free-form lookup output; a HandlingBudgetError from it is turned by the free-form lookup into a LookupFailedError that carries the tool results as partial and the HandlingReport, so the executor keeps them and the pipeline reports the answer-step failure with the report. The short-circuit copies the handling into the report that reportFromLookups derives. finalizeSynthesize keeps its execution parameter and gains progress after it. (5) Reporting: mergeHandling composes a merged report by fixed rules, collectPlanSources reads each plan's aggregate handling, and renderReportHead renders a handling line on both paths. (6) Step tool: an AnswerProgress object, emit_part and emit_combine outputs that reuse the registered bundle argument, persisted on every transition.

### 9.2 a2: Size table only, separate implementations per path

Decide only from the five sizes with a fixed table and implement division and combine once for the lookup pipeline and once for the aggregator.

Define a table from size to single pass or partitioned with fixed part counts, and implement the division and combine separately for synthesize and for runAggregator. The size class decides; there is no check that a call fits.

**Rejected because:** Literal to the HLD but a size class does not bound characters, so an input can still overflow a call.

### 9.3 a3: Smallest: halve and retry when the provider refuses the input

Keep one pass as today and only when the provider refuses the input as too large split it in half, retry and combine the halves.

Catch the provider's size refusal in synthesize and runAggregator, split the input at a file boundary into two halves, run each and combine, repeating on refusal. No table, no budget, no step tool part turn beyond a retry.

**Rejected because:** A local model truncates silently instead of refusing, so input is lost with no signal; this violates k1, k2 and k3.

## 10. References

- **[[c1]]** `code` `src/analyze/context/synthesizer.ts:117-225`
- **[[c2]]** `code` `src/analyze/context/driver.ts:1662-1690`
- **[[c3]]** `code` `src/analyze/executor/plan-sources.ts:43-92`
- **[[c4]]** `code` `src/analyze/context/shaper-provider.ts:205-250`
- **[[c5]]** `code` `src/daemon/steps/analyze-step/types.ts:56-157`
