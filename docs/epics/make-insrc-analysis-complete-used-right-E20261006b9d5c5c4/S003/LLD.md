<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story adds one shared helper that divides an answer-writing model call's input into ordered parts when the HLD's table from measured size to method says so, or when the rendered input is not admitted by a provable bound: a CLI provider's declared character budget, or, for a local model, a UTF-8 byte count held under the window minus the call's output tokens minus a template reserve. A single pass keeps the configured output tokens (10,240 bytes with the checked-in configuration); part and combine calls use a stated lower output cap of 8,192 tokens (22,528 bytes), so the largest existing prompt plus the minimum room fits. On the checked-in local configuration this means code and adherence requests are always handled in parts, which departs from the wording of ac4 and was accepted by the user on 2026-11-08. The helper owns the schema-repair loop with one provider attempt and provider retries off, and measures every repair before it is sent. Each part is reasoned over serially, sections never split a code point, evidence and findings are assembled in code, and a staged combine writes only a bounded summary and always ends, falling back to the per-part results; a successful part is never discarded. Four callers use it, the handling report is typed and shown in the answer's head, and every failure keeps its true reason and its data through the existing mappings, the free-form executor, the plan walk (nested plans included) and the orchestrator.

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
- `args: SynthesizeArgs` — The existing arguments, plus the measured size used by the table.

**Returns:** `Promise<Omit<AnalyzeContextBundle, 'meta'>>` — The bundle: the one call made today when the size is XS or S and the input is admitted, else the assembled bundle of the parts.

**Errors:**
- `HandlingBudgetError` when No part can be covered and every uncovered part is unadmittable, or the fixed context leaves no room for a section; carries the lookup results and the report.
- `ShaperAnswerStepFailedError` when No part is covered and at least one uncovered part was admitted: reason 'model-failed' if any part's call threw, else 'invalid-answer'; every part's own reason is in notCovered; carries the lookup results and the report.
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.

**Preconditions:**
- The plan has been executed

**Postconditions:**
- Model calls are made one after another, each with one provider attempt and provider retries off
- A part that cannot be admitted after division is recorded as not covered while any other part is or can be covered; a covered part is never discarded
- A failed combine returns the per-part results with the failure reported, it does not throw
- Part and combine calls are given PART_MAX_OUTPUT_TOKENS (8,192) as their output tokens; a single pass keeps the configured output tokens

### 2.2 `prepareSynthesize`

```typescript
prepareSynthesize(args: Omit<SynthesizeArgs, 'runId' | 'provider'>, progress?: AnswerProgress): SynthesizePrepared
```

**Parameters:**
- `args: Omit<SynthesizeArgs, 'runId' | 'provider'>` — The existing arguments.
- `progress: AnswerProgress` _(optional)_ — The stored step progress; absent on a legacy state, read as single pass.

**Returns:** `SynthesizePrepared` — The existing prompt, user turn and schema, now with a turn field naming 'answer', 'part' or 'combine' and its identity.

**Errors:**
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.
- `HandlingBudgetError` when As for synthesize.

**Preconditions:**
- progress comes from the stored step state

**Postconditions:**
- The rendered input of the turn is admitted

### 2.3 `prepareAnswerTurn`

```typescript
prepareAnswerTurn(args: Parameters<typeof prepareSynthesize>[0] & { executed: ExecutedPlan; measure?: RequestMeasure; reportScope?: ReportScopeInput }, execution?: ConnectionExecutionContext): AnswerTurn
```

**Parameters:**
- `args: Parameters<typeof prepareSynthesize>[0] & { executed: ExecutedPlan; measure?: RequestMeasure; reportScope?: ReportScopeInput }` — The existing turn arguments plus the measure.
- `execution: ConnectionExecutionContext` _(optional)_ — The existing connection context.

**Returns:** `AnswerTurn` — As today, and on the first call when the plan phase hands over, the prepared turn carries the initial AnswerProgress made by startAnswerProgress from the measure's size and the admission of the rendered input: mode 'single' or 'partitioned'.

**Errors:**
- `SynthesizerPromptMissingError` when Mapped as today to the declared error with its data.
- `HandlingBudgetError` when Returned as the answer-step failure with its data.

**Postconditions:**
- A new state always carries progress after this call; a state without progress is a legacy state and is read as single pass

### 2.4 `startAnswerProgress`

```typescript
startAnswerProgress(args: Parameters<typeof prepareSynthesize>[0], size: RequestSize | undefined): AnswerProgress
```

**Parameters:**
- `args: Parameters<typeof prepareSynthesize>[0]` — The turn arguments whose evidence is divided.
- `size: RequestSize | undefined` — The sc3 size; undefined or undetermined is XL.

**Returns:** `AnswerProgress` — The initial progress: the partition plan (ordered blocks with ordinals and section cuts), the handling decision (mode and trigger) and the measured budgets, with no part completed.

**Errors:**
- `HandlingBudgetError` when The fixed context leaves no room for a section.

**Postconditions:**
- The progress holds everything the progress overload of finalizeSynthesize needs to decide whether another part remains and to return the HandlingReport

### 2.5 `finalizeSynthesize`

```typescript
function finalizeSynthesize(raw: unknown, execution?: ConnectionExecutionContext): Omit<AnalyzeContextBundle, 'meta'>; function finalizeSynthesize(raw: unknown, execution: ConnectionExecutionContext | undefined, progress: AnswerProgress): FinalizedAnswerTurn
```

**Parameters:**
- `raw: unknown` — The reply to validate.
- `execution: ConnectionExecutionContext | undefined` — The existing connection context.
- `progress: AnswerProgress` — The stored progress, second overload only.

**Returns:** `Omit<AnalyzeContextBundle, 'meta'> | FinalizedAnswerTurn` — Two overloads. A call without progress returns the bundle layers exactly as today, so the bundle handler's assignment to BundleLayers still type-checks. A call with progress returns {kind:'final', layers, handling} or {kind:'next', progress}.

**Errors:**
- `SynthesizerSchemaUnrecoverable` when Existing: the reply fails the schema; the bundle handler counts it in progress.retries.

**Postconditions:**
- Evidence layers are assembled in code and never taken from a combine reply
- A compile-time test proves the existing handler call and its assignment are unchanged

### 2.6 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — The existing arguments.

**Returns:** `Promise<AggregateReport>` — The report; metadata gains the optional handling field.

**Errors:**
- `HandlingBudgetError` when As for synthesize.
- `ShaperAnswerStepFailedError` when No part covered, as for synthesize.
- `Error` when With the existing aggregator prefixes: a single call fails with no part results to return.

**Preconditions:**
- The absent-input section is rendered in every part and every combine call and counted in the admission

**Postconditions:**
- Findings of covered parts are concatenated in code by ordinal; the model writes only the summary

### 2.7 `executeLeafTask`

```typescript
executeLeafTask(task: PlannedTask, intent: ClassifiedIntent, runId: string, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, absentInputs?: readonly AbsentInput[], execution?: ConnectionExecutionContext): Promise<TaskExecutionRecord>
```

**Parameters:**
- `task: PlannedTask` — The leaf task to run.
- `intent: ClassifiedIntent` — The classified intent.
- `runId: string` — The run id.
- `outputs: ReadonlyMap<string, readonly UpstreamOutput[]>` — Upstream outputs by task id.
- `absentInputs: readonly AbsentInput[]` _(optional)_ — Inputs that were absent.
- `execution: ConnectionExecutionContext` _(optional)_ — The connection context.

**Returns:** `Promise<TaskExecutionRecord>` — As today; a failed record of an aggregate task gains an optional data field.

**Postconditions:**
- For an aggregate task, the failure data is kept in TaskExecutionRecord.data for any aggregate failure: a ShaperAnswerStepFailedError or HandlingBudgetError gives its found results and HandlingReport, a plain prefixed Error gives its message and cause; the failure is never reduced to its message alone

### 2.8 `executePlannerTask`

```typescript
executePlannerTask(task: PlannedTask, parent: PlanTreeNode, intent: ClassifiedIntent, runId: string, opts: WalkOpts): Promise<PlannerTaskResult>
```

**Parameters:**
- `task: PlannedTask` — The planner task.
- `parent: PlanTreeNode` — The parent node.
- `intent: ClassifiedIntent` — The classified intent.
- `runId: string` — The run id.
- `opts: WalkOpts` — The walk options.

**Returns:** `Promise<PlannerTaskResult>` — As today: a child with no final report gives a failed record and the childResult it kept; the Story relies on that kept childResult and does not change this function.

**Postconditions:**
- childResult stays on the result of a failed planner task so the child's aggregate failure remains readable

### 2.9 `runFinalStructuredEmit`

```typescript
runFinalStructuredEmit(provider: LLMProvider, messages: LLMMessage[], structuredOutputRetries: number, maxOutputTokens: number, onTrace?: (event: ShaperTraceEvent) => void, execution?: ConnectionExecutionContext, onHandling?: (h: HandlingReport) => void, size?: RequestSize): Promise<AnalyzeContextBundle>
```

**Parameters:**
- `provider: LLMProvider` — The provider.
- `messages: LLMMessage[]` — The tool loop's conversation.
- `structuredOutputRetries: number` — The existing retry count, now spent inside the helper's repair loop.
- `maxOutputTokens: number` — The single-pass output tokens.
- `onTrace: (event: ShaperTraceEvent) => void` _(optional)_ — Trace sink.
- `execution: ConnectionExecutionContext` _(optional)_ — Connection context.
- `onHandling: (h: HandlingReport) => void` _(optional)_ — Receives the handling report.
- `size: RequestSize` _(optional)_ — The sc3 size for the table.

**Returns:** `Promise<AnalyzeContextBundle>` — The bundle: the one call made today when the size is XS or S and the conversation is admitted, else the assembled bundle.

**Errors:**
- `HandlingBudgetError` when As for synthesize.
- `ShaperAnswerStepFailedError` when No part covered, as for synthesize.

**Postconditions:**
- An M, L or XL request whose conversation is admitted is still divided, by the table

### 2.10 `failedOutput`

```typescript
failedOutput(exp: Exploration, err: unknown, execution?: ConnectionExecutionContext): FailedExplorationOutput
```

**Parameters:**
- `exp: Exploration` — The exploration that failed.
- `err: unknown` — The error.
- `execution: ConnectionExecutionContext` _(optional)_ — The connection context.

**Returns:** `FailedExplorationOutput` — The failed output with partial findings as today, and the handling report when the error carried one.

**Postconditions:**
- Any ShaperAnswerStepFailedError raised inside the free-form lookup has been turned into a LookupFailedError carrying its tool results, handling and original reason (answerStepReason)
- For such an error the failed output's errorCode is 'answer-step:<reason>' and its cause is kept; the pipeline rebuilds the ShaperAnswerStepFailedError from that reason and the found results, so 'input-does-not-fit', 'model-failed' and 'invalid-answer' are told apart

### 2.11 `extractSoleFreeformResult`

```typescript
extractSoleFreeformResult(executed: Awaited<ReturnType<typeof executePlan>>): { rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null
```

**Parameters:**
- `executed: Awaited<ReturnType<typeof executePlan>>` — The executed plan.

**Returns:** `{ rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null` — As today, plus the free-form output's handling, which the pipeline puts on the report that reportFromLookups derives.

**Postconditions:**
- A failed free-form output still returns null, so it reaches the answer-step failure with its report and no second synthesis is tried

### 2.12 `collectPlanSources`

```typescript
collectPlanSources(tree: PlanTreeNode, executed: ExecutorResult, parentPath?: string): ReportSource[]
```

**Parameters:**
- `tree: PlanTreeNode` — The plan tree.
- `executed: ExecutorResult` — The executed result.
- `parentPath: string` _(optional)_ — The path prefix.

**Returns:** `ReportSource[]` — The sources as today, plus one source per not-covered part of each plan's aggregate task, named by the aggregate task's path and the part id. For a failed planner-kind task that has a kept child result, it still reads the child's records, so the child's aggregate failure and handling become sources.

**Postconditions:**
- The aggregate task is still not a source of its own completeness; only its handling is read
- The check of a task's failure status no longer stops the read of a failed planner task's child

### 2.13 `concludeRun`

```typescript
concludeRun(tree: PlanTreeNode, executed: ExecutorResult, contextReport: AnswerReport | undefined, measure?: RequestMeasure): { report: AnswerReport; finalReport: unknown }
```

**Parameters:**
- `tree: PlanTreeNode` — The plan tree.
- `executed: ExecutorResult` — The executed result.
- `contextReport: AnswerReport | undefined` — The run context's report.
- `measure: RequestMeasure` _(optional)_ — The measure.

**Returns:** `{ report: AnswerReport; finalReport: unknown }` — The report carries handling merged from the run context and from the root and every nested aggregate, including a nested failure under a root aggregate that succeeded from sibling outputs, and its visible head shows it.

**Postconditions:**
- A partially failed aggregation, at any depth, makes the run's completeness false
- A failed root aggregate is copied to RunFailure.data under the unchanged code 'executor-aggregator-failed' from TaskExecutionRecord.data

### 2.14 `mergeAnswerReports`

```typescript
mergeAnswerReports(first: AnswerReport, second: AnswerReport, prefix?: string): AnswerReport
```

**Parameters:**
- `first: AnswerReport` — First report.
- `second: AnswerReport` — Second report.
- `prefix: string` _(optional)_ — Prefix for the first side's sources.

**Returns:** `AnswerReport` — The merge as today, plus handling merged by mergeHandling with the same prefix rule.

**Postconditions:**
- The signature and the prefix behaviour are unchanged

### 2.15 `renderReportHead`

```typescript
renderReportHead(report: AnswerReport): string
```

**Parameters:**
- `report: AnswerReport` — The report.

**Returns:** `string` — The head as today, plus one handling line after the measure line when the report has handling.

**Postconditions:**
- Both paths show the line
- A report without handling renders as today

## 3. Data model changes

### 3.1 `HandlingReport` — new

The sc4 contract typed. method, parts, partitionedBy, notCovered[{part, reason}] as sketched, plus additive fields: combineStages (optional), budgets (an array of {unit: 'chars' | 'bytes', limit, source: 'provider' | 'context-window' | 'default', basis: 'declared' | 'bytes-bound' | 'default', inputSize}, never mixing units) and trigger (optional: 'size' | 'fit' | 'both'; absent on a single pass). partitionedBy gains 'mixed'. parseHandling accepts a record with or without trigger. Counting: parts is the number of first-level parts including failed ones; a single pass has parts 1. A part id is its ordinal and heading ('part 3: docs/a'); mergeHandling qualifies it with the plan path. Composition by mergeHandling(first, second, prefix): an absent side is ignored; method is 'partitioned' if either is; parts is the sum (a single pass counts 1); notCovered is the concatenation with the first side's part ids qualified by the prefix; budgets is the concatenation de-duplicated on (unit, limit, source, basis), keeping the largest inputSize of identical entries, so a local 'bytes-bound' entry survives a merge with a CLI entry and units are never compared; combineStages is the sum when either has it; partitionedBy is the common value or 'mixed'; trigger is the union when either has one. So a single-pass root with a partitioned child reports 'partitioned' with parts one more than the child's.

```
readonly combineStages?: number | undefined; readonly budgets: readonly { readonly unit: 'chars' | 'bytes'; readonly limit: number; readonly source: 'provider' | 'context-window' | 'default'; readonly basis: 'declared' | 'bytes-bound' | 'default'; readonly inputSize: number }[]; readonly trigger?: 'size' | 'fit' | 'both' | undefined; partitionedBy adds 'mixed'
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

### 3.3 `HANDLING_TABLE, the admission rule and the output caps` — new

HANDLING_TABLE maps the sc3 size to the method: XS and S single pass, M, L and XL partitioned; an undetermined measure is XL. The size reaches every caller of the helper, the free-form final emit through the tool loop included. The admission rule decides whether a rendered input (messages, repeated context, absent-input section) may be sent, in two units that are never mixed. For a CLI provider: characters, against the declared inputBudgetChars minus a 16,000-character reserve (basis 'declared'). For a local model: the UTF-8 byte length against the window tokens (the figure ollamaContextWindow gives num_ctx) minus the call's output tokens minus 2,048 for template and special tokens (basis 'bytes-bound'), because every token covers at least one byte, so the byte length bounds the token count and an admitted input cannot be truncated. Output tokens are per call kind: a single pass keeps the configured ollamaNumPredict; part and combine calls use the constant PART_MAX_OUTPUT_TOKENS = 8,192, enough for a seven-layer reply with a summary capped at 2,000 characters. Worked with the checked-in configuration (a 32,768-token window and ollamaNumPredict 20,480): single pass 32,768 - 20,480 - 2,048 = 10,240 bytes; part and combine 32,768 - 8,192 - 2,048 = 22,528 bytes. The existing prompts alone are 10,652 bytes (code), 11,040 (adherence) and 6,324 (docs), so a local code or adherence request is never admitted single pass and is always handled in parts (trigger 'fit'), and a docs request is admitted single pass only if its evidence fits in 3,916 bytes. For a part the largest prompt plus the 4,000-byte minimum room is 15,040 bytes, within 22,528 with 7,488 spare. This departs from the wording of ac4 for local code and adherence requests; the user accepted it on 2026-11-08 (accuracy over cost), and ac4 still guarantees that a small request whose input is admitted is returned whole. If the fixed context plus the minimum room does not fit the part budget, HandlingBudgetError names the configuration (raise the window or lower PART_MAX_OUTPUT_TOKENS). A part reply that outgrows the cap fails validation or is cut by the provider and is handled by the repair and division rules. With no declared limit: 60,000 characters (source 'default', also used by the step tool, which has no provider). The helper owns the repair loop: it calls completeStructured with {maxAttempts: 1, internalRetry: false} (internalRetry is an existing completion option), because maxAttempts alone is ignored by CliProvider's Vibe path and the Claude and Codex paths keep transient retries; with both set no provider retries on its own. It builds each repair prompt itself with the repair note capped at 8,000 characters of listed errors (the rest counted) and applies the rule to every attempt before it is sent. Repair exhaustion has one rule everywhere: a repair that is not admitted divides the part further, up to three times; after that the part is recorded as not covered and processing continues, so a successful part is never discarded. The input is divided when the table says partitioned OR the rule does not admit it.

**Call sites:**
- `src/shared/types.ts:199-203`
- `src/shared/types.ts:263`
- `src/analyze/context/shaper-provider.ts:205-250`
- `src/agent/providers/structured-output.ts:150-215`
- `src/daemon/tools/convert-text.ts:144`
- `src/config/analyze.ts:40-60`
- `src/config/analyze.ts:193`

### 3.4 `PartPlan, PartResult and the caller adapters` — new

A PartPlan is the ordered blocks of the evidence with an ordinal separate from the block key, grouped by directory then file in stable order. A block larger than the room is cut into consecutive sections, each the largest whole UTF-8 code-point prefix of the remainder that fits the room, so no code point is split and a section may leave up to three unused bytes; sections do not overlap; a section is short only if it is the final one or ends at a code-point boundary before the room is full; the 4,000-unit minimum applies to the room itself, and a room under it is a HandlingBudgetError. A PartResult holds the part's heading, its summary (capped at 2,000 characters by the schema) and its assembled content. The bundle adapter takes system, focus and summary from the final combine and concatenates structure, surface, artefacts and upstream of the covered parts by ordinal under part headings; the aggregate adapter takes the summary from the final combine and concatenates the findings of the covered parts by ordinal, each keeping its sources. A combine reply is never read for evidence or findings. Combine stages: N summaries become ceil(N/g) with g at least 2, so it ends in at most ceil(log2 N) stages. If a combine fails or is not admitted and at least one part is covered, the adapter's output is built from the per-part results with 'combine' in notCovered and nothing is thrown.

**Call sites:**
- `src/analyze/context/synthesizer.ts:117-169`
- `src/analyze/runtimes/shared/aggregator.ts:100-155`
- `src/analyze/runtimes/shared/aggregate-types.ts:28-80`

### 3.5 `HandlingBudgetError, the every-part-failed case and LookupFailedError` — new

HandlingBudgetError extends ShaperAnswerStepFailedError, with a new reason 'input-does-not-fit' added to AnswerStepFailureReason (additive; the class is declared by Story s1). Terminal precedence when no part is covered: HandlingBudgetError only when every uncovered part is unadmittable (or the fixed context leaves no room for a section); otherwise a ShaperAnswerStepFailedError with reason 'model-failed' if any part's call threw, else 'invalid-answer', with every part's own reason in notCovered. The daemon's mapping (analyze-rpc.ts) and the plan tree's mapping (orchestrator/driver.ts), which test instanceof ShaperAnswerStepFailedError, carry the found results and report with no new branch, and the driver passes the error through unchanged. LookupFailedError (message, partial, cause) gains two optional fields: handling and answerStepReason (the original reason). The free-form lookup catches every ShaperAnswerStepFailedError from the tool loop and throws a LookupFailedError carrying the tool results as partial, the handling and the reason; failedOutput copies the reason into the failed output's errorCode as 'answer-step:<reason>' and keeps the cause, and the pipeline rebuilds the ShaperAnswerStepFailedError from that reason and the found results, so the three reasons are told apart and executePlan keeps the partial results and the report instead of attempting a second synthesis.

```
AnswerStepFailureReason adds 'input-does-not-fit'; LookupFailedError adds readonly handling?: HandlingReport | undefined and readonly answerStepReason?: AnswerStepFailureReason | undefined
```

**Call sites:**
- `src/analyze/context/driver.ts:325-362`
- `src/daemon/analyze-rpc.ts:1046`
- `src/analyze/orchestrator/driver.ts:810`
- `src/analyze/explore/lookup-failed.ts:20-34`
- `src/analyze/explore/freeform-probe.ts:150-200`
- `src/analyze/explore/executor.ts:690-715`

### 3.6 `TaskExecutionRecord.data, RunFailure.data and the failed nested plan` — field-add

executeLeafTask(task: PlannedTask, intent, runId, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, absentInputs?, execution?) currently catches an error from the aggregate task and records the failed task with its message only, and the orchestrator turns a failed aggregate task into the run failure with the code 'executor-aggregator-failed' and a message of task counts and failure strings. TaskExecutionRecord gains an optional data field kept for any aggregate failure: for a ShaperAnswerStepFailedError (HandlingBudgetError included) it holds the found results or partial outputs and the HandlingReport, for a plain prefixed Error from the aggregator it holds the message and cause. The orchestrator copies it into RunFailure.data under the unchanged code when the root aggregate fails. For a nested plan, executePlannerTask marks the parent planner task failed when its child has no final report and keeps childResult, and collectPlanSources checks failure status before recursing, so a failed nested aggregate was unreachable and a root aggregate that succeeds from sibling outputs raised no run failure. The design makes collectPlanSources read the kept child records of a failed planner-kind task and add sources for the child's aggregate failure and uncovered parts, and concludeRun merge the nested handling with the root's, so the run is incomplete and names the nested failure whether or not the root aggregate succeeded.

```
TaskExecutionRecord adds readonly data?: unknown
```

**Call sites:**
- `src/analyze/executor/walker.ts:205-275`
- `src/analyze/executor/walker.ts:338-390`
- `src/analyze/executor/plan-sources.ts:43-92`
- `src/analyze/executor/types.ts:184-205`
- `src/analyze/orchestrator/driver.ts:515-530`
- `src/analyze/orchestrator/driver.ts:605-632`
- `src/analyze/orchestrator/types.ts:265-269`
- `src/analyze/orchestrator/types.ts:307`

### 3.7 `AnswerProgress and StepStatePayload` — field-add

AnswerProgress is {mode: 'single' | 'partitioned', trigger?: 'size' | 'fit' | 'both', plan: PartPlan (the blocks with ordinals and section cuts), budgets: HandlingReport['budgets'], completed: PartResult[] by ordinal, pending: {kind 'part' | 'combine', ordinal or stage and group index}, stageOutputs, failures: {part, reason}[], retries}. Carrying the plan, the decision and the budgets lets the progress overload of finalizeSynthesize decide whether another part remains and return the HandlingReport without recomputing from the evidence. startAnswerProgress(args, size) makes the initial value: prepareAnswerTurn calls it when the plan phase hands over, from the table and the admission of the rendered input, and the state carries it from then on; a state without progress is a legacy state and is read as single pass. The bundle handler persists progress by re-encoding the state token on every valid transition. An invalid reply increments retries, is persisted, and the current turn is re-emitted with the same prompt and a new state token and a retry note, as StepOutputEmitBundle, StepOutputEmitPart or StepOutputEmitCombine, which gain an optional retry field {attempt, reason}; it is not an error output. At the retry bound the part or the combine is recorded as failed and the flow continues; retries reset to zero when a turn advances; progress is released on terminal success and failure.

**Call sites:**
- `src/daemon/steps/analyze-step/phases/bundle.ts:90`
- `src/daemon/steps/analyze-step/answer-turn.ts:37-62`
- `src/daemon/steps/analyze-step/types.ts:56-157`

### 3.8 `StepOutputEmitPart and StepOutputEmitCombine` — new

Two outputs added to the StepOutput union beside StepOutputEmitBundle with the same fields plus the part ordinal and total, or the stage and group, and the optional retry field. A reply reuses the registered bundle argument of seven string layers (a part reply is a seven-layer bundle of that part with its summary within the cap; a combine reply fills system, focus and summary and leaves the four evidence layers empty), so the registered MCP schema and StepInputBundle are unchanged and the legacy emit_bundle turn is kept. A typed answer failure is returned as StepOutputError with the declared code and its data, not as an uncaught exception.

**Call sites:**
- `src/mcp/server.ts:408-425`
- `src/daemon/steps/analyze-step/types.ts:56-157`
- `src/daemon/steps/analyze-step/handler.ts:118`

### 3.9 `AggregateReport.metadata.handling` — field-add

Carries the HandlingReport of the aggregator call, validated by parseHandling on read. collectPlanSources reads it for the aggregate task of the root plan and of each nested plan, and concludeRun merges them with the run context's handling through mergeHandling, so uncovered parts make the run's completeness false.

**Call sites:**
- `src/analyze/executor/plan-sources.ts:43-92`
- `src/analyze/orchestrator/driver.ts:605-632`

## 4. Diagrams

- [Sequence diagram](docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/sequence-diagram.html)
- [Sequence diagram](docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Types HandlingReport with additive fields (combineStages, budgets in their own units, optional trigger, and 'mixed' for partitionedBy), states the composition rules, and fills it on every answer of both paths. |
| `sc2` | consumes | Fills AnswerReport.handling; keeps the binary mergeAnswerReports(first, second, prefix); renders one handling line in renderReportHead; uncovered parts add source notes and make completeness false. |
| `sc1` | consumes | A result whose part or combine failed is incomplete; plan-task completeness records are read as today and the aggregate's handling, at any depth, is added as sources. |
| `sc3` | consumes | Reads RequestMeasure.size for HANDLING_TABLE (an undetermined measure is XL) on every path; measure.characters stays a hint. |
| `sc6` | consumes | Uses the answer-step-failed code declared by sc6 and raised by Story s1 through the existing ShaperAnswerStepFailedError mappings and keeps the existing 'executor-aggregator-failed' code with data for the aggregate task; no new code. |

## 6. Error paths

**Error cases**

- **A part's model call fails, or its reply fails the schema after the helper's bounded repair attempts** (recoverable)
  - Detection: The single-attempt call (internalRetry false) throws, or the reply fails validation and the helper's own repair count reaches the structured-output retry setting
  - Response: The part is recorded in failures and named in HandlingReport.notCovered with its qualified id and reason; the other parts are kept; completeness is false
  - User impact: The answer is delivered and names the part that was not covered and why
- **A provider retries on its own despite maxAttempts 1** (terminal)
  - Detection: Prevented by passing internalRetry false with maxAttempts 1; a test with the real CliProvider adapters (Vibe, Claude, Codex) counts provider attempts and fails if any makes more than one
  - Response: No separate response: the helper is the only code that retries, and it measures every attempt
  - User impact: No unmeasured repair note can enter a call
- **No part is covered (mixed terminal failures)** (terminal)
  - Detection: failures holds every part and completed is empty; the helper records for each part whether its call threw, its replies stayed invalid, or it was unadmittable, and applies one precedence rule
  - Response: HandlingBudgetError ('input-does-not-fit') only when every uncovered part is unadmittable, or the fixed context leaves no room for a section; otherwise a ShaperAnswerStepFailedError with reason 'model-failed' if any part's call threw, else 'invalid-answer'. Either way every part's own reason is in notCovered and the lookup results and the report are carried
  - User impact: A typed failure of the right kind that keeps what the lookups found and names what happened to each part; a mix of unadmittable and failed parts is reported as the failure of the call, not as a budget problem; no empty answer is written
- **The combine call fails, its reply stays invalid, or the combine itself is not admitted** (recoverable)
  - Detection: The combine call throws, or its reply fails validation at the repair bound, or the admission rule does not admit fixed context plus two capped summaries, with at least one part covered
  - Response: The output is built from the per-part results unchanged by the adapter, its summary layer being the part summaries concatenated by ordinal, and 'combine' is added to notCovered; nothing is thrown
  - User impact: The per-part results are returned with the combine failure reported
- **A combine stage does not reduce the count of summaries** (recoverable)
  - Detection: The helper compares the count before and after the stage
  - Response: The stage is treated as a combine failure and the per-part fallback applies
  - User impact: The combine always ends
- **The room for a section is under the 4,000-unit minimum, or the fixed context leaves no room** (terminal)
  - Detection: Fixed rendered input plus the minimum room is not admitted against the part and combine budget (with the checked-in local configuration 22,528 bytes: window 32,768 minus PART_MAX_OUTPUT_TOKENS 8,192 minus 2,048), or every part is unadmittable
  - Response: HandlingBudgetError with the results and the report, whose message names the configuration to change (raise the window or lower PART_MAX_OUTPUT_TOKENS); no partial answer is written
  - User impact: A typed failure that says the configured window and output size leave no room
- **A part reply outgrows the 8,192-token part output cap** (recoverable)
  - Detection: The provider cuts the reply or it fails validation, so the helper sees an invalid reply or a thrown call for that part
  - Response: The repair and division rules apply: one repair attempt that is admitted, otherwise the part is divided into smaller sections up to three times, then recorded as not covered; the other parts continue
  - User impact: A part whose findings do not fit one reply is read in smaller sections or named as not covered; nothing is silently cut
- **A schema-repair attempt would not be admitted** (recoverable)
  - Detection: The helper builds each repair prompt itself, from the part, the schema text and the repair note capped at 8,000 characters of listed errors (the rest counted), and applies the admission rule before the attempt
  - Response: One rule for every repair: the part is divided into smaller sections up to three times; after that the part is recorded as not covered and the other parts continue; HandlingBudgetError is raised only under the terminal precedence rule, so a successful part is never discarded
  - User impact: A malformed reply with many errors cannot push a call over the limit unnoticed, and cannot erase findings already gathered
- **A section boundary falls inside a multi-byte character** (recoverable)
  - Detection: The cutter looks for the largest whole UTF-8 code-point prefix that fits the room; for 4,999 ASCII bytes followed by a four-byte emoji in a 5,000-byte room, the emoji does not fit
  - Response: The section ends before the emoji and the next section begins with it; the unused bytes of the first section stay unused; decoding any section gives valid text and no byte is lost
  - User impact: Every character is read whole, in exactly one section
- **The provider refuses a part as too large** (recoverable)
  - Detection: InputTooLargeError from the provider, whose sizes may be undefined
  - Response: The part is divided into smaller sections up to three times, and then recorded as not covered
  - User impact: The part is read in full or named; nothing is silently cut
- **A local model's tokenizer produces more tokens than bytes** (terminal)
  - Detection: Not possible under the stated assumption that a token covers at least one input byte; template and special tokens are covered by the 2,048 reserve, and the assumption is recorded in the report as basis 'bytes-bound'
  - Response: No separate response: the rule admits an input only if its byte length fits, so the window is not exceeded; a model whose special tokens exceed the reserve would need the reserve raised, one constant
  - User impact: An admitted local input cannot be silently truncated; the cost is earlier division
- **A typed answer failure is thrown from inside the free-form final emit** (terminal)
  - Detection: The free-form lookup catches every ShaperAnswerStepFailedError from the tool loop (HandlingBudgetError, 'model-failed' and 'invalid-answer' alike); executePlan would otherwise turn any error that is not a ConnectionExecutionError into a failed lookup with no data
  - Response: It throws a LookupFailedError carrying the tool results as partial, the HandlingReport and the original reason (answerStepReason); failedOutput keeps all three, copying the reason as errorCode 'answer-step:<reason>' with the cause; the pipeline rebuilds the ShaperAnswerStepFailedError from that reason and the found results, raises the answer-step failure with the report and does not attempt a second synthesis
  - User impact: The caller receives the failure with what the search found, how far the handling got and its true reason, whatever the category of the failure
- **A typed answer failure is thrown from inside synthesize** (terminal)
  - Detection: The driver's catch sees HandlingBudgetError or ShaperAnswerStepFailedError
  - Response: The driver passes it through unchanged instead of mapping it to 'answer-invalid'; the daemon's and the plan tree's mappings, which test instanceof ShaperAnswerStepFailedError, carry its results and report; the step tool returns it as StepOutputError with the declared code and its data
  - User impact: The caller receives the error with the lookup results and the report
- **A failure is thrown from inside runAggregator** (terminal)
  - Detection: executeLeafTask catches the aggregate task's error: either a ShaperAnswerStepFailedError (HandlingBudgetError included) or a plain Error with an aggregator prefix, for example a single call that failed with no part results
  - Response: The failed record keeps the failure in its optional data field instead of only the message: the found results and HandlingReport for a typed error, the message and cause for a plain Error. When the root aggregate fails the orchestrator copies it into RunFailure.data under the unchanged code 'executor-aggregator-failed'
  - User impact: A failed aggregation keeps what it carried, whatever the kind of error, and the run says how far the handling got
- **A nested plan's aggregate fails while the root aggregate succeeds from sibling outputs** (recoverable)
  - Detection: executePlannerTask returns a failed record with the kept childResult; collectPlanSources reads the child's records of a failed planner-kind task before it would stop at the failure status
  - Response: A source for the nested aggregate's failure and for each uncovered part is added with the nested task path, and concludeRun merges the nested handling with the root's, so the run is incomplete and names the nested failure although no run failure was raised
  - User impact: A run never reports complete over a nested aggregation that failed
- **An invalid reply for a part or combine turn on the step tool** (recoverable)
  - Detection: finalizeSynthesize (the progress overload) raises SynthesizerSchemaUnrecoverable for the current turn
  - Response: The bundle handler increments progress.retries, persists the progress with a new state token and re-emits the current turn with the same prompt and a retry note; the client is never stranded without a token; at the retry bound the part or the combine is recorded as failed
  - User impact: The client sees the same turn again with the reason, and the flow cannot loop for ever
- **A stored handling value is malformed** (recoverable)
  - Detection: parseHandling finds a missing required field or a wrong type, as for the stored {}
  - Response: The value is treated as absent by mergeHandling, renderReportHead and isAnswerReport; it is not written back
  - User impact: An old record is read without handling instead of failing

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A size of XS or S whose rendered input is admitted | Single pass: the one call made today, with handling single-pass, parts 1 and no trigger. |
| A size of M or larger whose rendered input is admitted | The table divides it: partitioned with trigger 'size', on the lookup path, the aggregator and the free-form final emit alike. |
| A size of S whose rendered input is not admitted | The rule divides it: partitioned with trigger 'fit'; both conditions give trigger 'both'. |
| A measure that could not be determined | Size XL: partitioned by the table. |
| A local code or adherence request on the checked-in configuration (32,768-token window, 20,480 single-pass output tokens), whatever its size | The single-pass input limit is 10,240 bytes, below the existing prompt alone (10,652 bytes for code, 11,040 for adherence), so it is never admitted single pass and is handled in parts with trigger 'fit'. This is the accepted departure from the wording of ac4 (user, 2026-11-08); the answer states the parts. A docs request is admitted single pass only when its evidence fits in 3,916 bytes. |
| A part or combine call on the checked-in local configuration | The limit is 22,528 bytes (32,768 - 8,192 - 2,048); the largest prompt plus the 4,000-byte minimum room is 15,040 bytes, so 7,488 bytes are spare and every existing prompt fits. |
| A local configuration whose window minus PART_MAX_OUTPUT_TOKENS and the reserve leaves less than the fixed context plus 4,000 bytes | HandlingBudgetError that names the configuration to change. |
| A CLI provider with a declared character budget | Characters against the budget minus the 16,000 reserve, with budget basis 'declared'; the units are never compared with bytes. |
| Rendered input exactly at the admitted limit | It is admitted; one unit over is divided. |
| A local model and an input containing multi-byte characters | The byte length, not the character count, is compared with the limit. |
| A model with no declared limit, and the step tool | The default of 60,000 characters is used and recorded with source 'default' and basis 'default'. |
| A 6,000-byte block of ASCII with a room of 5,000 | It is cut into sections of 5,000 and 1,000 bytes, consecutive and without overlap. |
| 4,999 ASCII bytes then a four-byte emoji in a room of 5,000 | The first section is the 4,999 bytes, the second starts with the emoji; no code point is split and decoding is lossless. |
| A single-pass root report merged with a partitioned child on a CLI budget while the root used a local model | Merged method 'partitioned', parts the sum with the single pass counted as 1, and both budgets kept in their own units, so the 'bytes-bound' basis is not lost. |
| Two nested plans that both have a part 1 | mergeHandling qualifies each part id with its plan path, so the two stay distinct. |
| A free-form M request whose conversation is admitted | It is divided and combined by the table, and the handling is copied onto the report. |
| A stored bundle with handling {} | It validates against the open schema and parseHandling reads it as absent. |
| The existing bundle handler calling finalizeSynthesize(input.bundle, execution) | The first overload applies, the result is the bundle layers, and the assignment compiles unchanged. |
| A step state written before the change | It lacks progress and is read as a single-pass state. |

**Invariants to preserve**

- Model calls are made one after another, never in parallel, including part, combine and repair calls [[c1]]
- A request of size XS or S whose input is admitted makes the same single model call as today [[c1]]
- finalizeSynthesize keeps its existing execution parameter in second place and its bundle return type for a call without progress, and the bundle handler keeps passing the execution [[c1]]
- A failed free-form lookup does not take the free-form short-circuit and keeps the data it carries [[c2]]
- The daemon's and the plan tree's mappings recognise the answer-step failure by instanceof and carry its results and report [[c3]]
- The plan's aggregate task is not a source of its own completeness; only its handling is read [[c4]]
- mergeAnswerReports keeps its binary signature and its prefix rule for the run context's sources [[c4]]
- A report without handling renders the same head as today [[c4]]
- completeStructured keeps its retry behaviour for every other caller; only the handling helper passes maxAttempts 1 with internalRetry false [[c5]]
- The step tool's registered bundle argument and legacy emit_bundle turn stay valid [[c6]]
- The code 'executor-aggregator-failed' and RunFailure's shape are unchanged; only the optional data is filled; executePlannerTask keeps childResult on a failed planner task [[c7]]

## 7. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing analyze, orchestrator, executor, daemon and step-tool suites; live runs gate behind INSRC_LIVE_TESTS=1 as the project does`

**Test levels**

- **unit** — Prove the table, admission rule, output caps, repair loop, division, assembly and combine without a model
  - Subjects: `HANDLING_TABLE: XS and S single pass, M, L and XL partitioned, an undetermined measure is XL`, `decision: the table alone divides (trigger 'size'), the admission rule alone divides a small size ('fit'), both give 'both', a single pass has no trigger`, `admission for a local model with the checked-in values (32,768 window, 20,480 single-pass output, 2,048 reserve) is 10,240 bytes for a single pass: exactly 10,240 is admitted, one byte over is divided, multi-byte text is counted in bytes; part and combine calls use PART_MAX_OUTPUT_TOKENS 8,192 and a limit of 22,528 bytes; a window that leaves less than fixed context plus 4,000 bytes gives HandlingBudgetError naming the configuration`, `with the real code, adherence and docs prompts the single-pass decision for the checked-in local configuration is 'not admitted' for code (10,652 bytes) and adherence (11,040), and admitted for docs only when the evidence is at most 3,916 bytes; every part prompt plus the 4,000-byte minimum room (15,040 at most) fits 22,528`, `a CLI provider is admitted in characters against its declared budget minus 16,000, and the two units are never compared`, `the helper calls the provider with {maxAttempts: 1, internalRetry: false} and builds each repair prompt itself: the note is capped at 8,000 characters with the rest counted, every attempt is admitted before it is sent, and a fake provider that would retry internally is never allowed to`, `repair exhaustion has one outcome: an unadmitted repair divides the part up to three times, then the part is recorded as not covered and the others continue; a part that already succeeded is never discarded`, `terminal precedence when no part is covered: every uncovered part unadmittable gives HandlingBudgetError; a mix of unadmittable and invalid-reply parts gives ShaperAnswerStepFailedError 'invalid-answer'; any thrown call gives 'model-failed'; each part's own reason is in notCovered`, `sections are the largest whole code-point prefix that fits the room: a 6,000-byte ASCII block in a room of 5,000 gives 5,000 and 1,000; 4,999 ASCII bytes then a four-byte emoji gives 4,999 and a second section that starts with the emoji; every section decodes to valid text, none overlaps, none is dropped; ordinals separate from keys`, `combine terminates: N summaries become ceil(N/g) per stage and a stage whose count does not fall is a combine failure`, `a combine failure, including a combine that is not admitted, with at least one part covered returns the per-part results with 'combine' in notCovered and throws nothing`, `the bundle adapter and the aggregate adapter keep evidence layers and findings exactly, in order, through several combine stages`, `parseHandling reads a stored {} and other malformed values as absent, and accepts a record with and without trigger`, `mergeHandling: absent side ignored; single-pass root with partitioned child gives 'partitioned' and summed parts; budgets concatenated and de-duplicated in their own units keeping the largest inputSize, so a local 'bytes-bound' entry survives a merge with a CLI entry; combineStages sum; partitionedBy 'mixed'; equal local part ordinals in two nested plans stay distinct by plan path`, `mergeAnswerReports keeps its binary signature and prefix behaviour`, `renderReportHead: a report without handling renders exactly as today; with handling it adds one line with method, parts, each budget in its unit and each not-covered part with its reason`, `a compile-time test: the bundle handler's call finalizeSynthesize(input.bundle, execution) resolves to the first overload and its result is assignable to the bundle layers; the progress call resolves to the second overload`
  - Fixtures: `a scripted provider that records each call and its attempt count, proves no two overlap, and can fail a chosen part, the combine or a repair attempt, refuse an input as too large, or return a reply with many validation errors`, `a configurable window so a small input divides`
- **integration** — Prove the four callers, the real provider adapters, the failure routes and the bridge into the delivered answer, through real modules and a scripted provider
  - Subjects: `the real CliProvider adapters (Vibe, Claude, Codex) driven through completeStructured with {maxAttempts: 1, internalRetry: false} each make exactly one attempt on a failing reply, with the underlying process stubbed`, `synthesize: XS or S and admitted makes the one call of today; M or larger, or not admitted, divides, and a failed part is named`, `free-form lookup: the request size reaches runFinalStructuredEmit through the tool loop; a conversation that fits at size S returns directly with single-pass handling copied onto the report reportFromLookups derives; at size M it is divided although it fits; HandlingBudgetError, 'model-failed' and 'invalid-answer' failures each become a LookupFailedError carrying the tool results, the handling and answerStepReason, failedOutput gives errorCode 'answer-step:<reason>', the failure survives executePlan, does not take the short-circuit and reaches the answer-step failure with the same reason and the report, with no second synthesis attempt`, `runAggregator with the absent-input section counted in every part and every combine call`, `a HandlingBudgetError and a plain prefixed aggregator Error from the root runAggregator through the real walker and the orchestrator: executeLeafTask (real signature, returning TaskExecutionRecord) keeps the data in the failed-task record, the run failure has the code 'executor-aggregator-failed' with the data in RunFailure.data, and the report names the uncovered parts`, `a nested plan whose aggregate fails while the root aggregate succeeds from sibling outputs: executePlannerTask returns the failed planner record with its kept childResult, collectPlanSources reads the child and adds the nested sources, concludeRun merges the nested handling, and the run is incomplete and names the nested failure with no run failure raised`, `collectPlanSources and concludeRun with a root and a nested aggregate that each have uncovered parts: the run is incomplete, the handling is merged and the visible head shows the handling line`, `the driver passes HandlingBudgetError through; the daemon's mapping in analyze-rpc and the plan tree's mapping in the orchestrator driver both return its results and report, tested through those mappings and not only through the driver`, `step tool through the real handler: prepareAnswerTurn creates the initial progress (plan, decision, budgets; 'single' or 'partitioned') and a state without progress is read as single pass; finalizeSynthesize with a saved and with a session-memory execution, with and without progress, the progress overload deciding from the stored plan whether another part remains and returning the HandlingReport; emit_part and emit_combine turns; replies through the registered bundle argument; progress persisted with token replacement; an invalid reply re-emits the current turn with a new token and a retry note, and the client can continue; repeated invalid replies across separate calls reach the retry bound; retries reset when a turn advances; progress released on terminal success and failure; a typed failure returned as StepOutputError with data`, `the legacy emit_bundle turn still passes for an input that fits`
  - Fixtures: `step tool state fixtures including one from before the change`, `a plan tree with a nested plan whose aggregate task fails and one whose aggregate task records have handling`, `stubs for the Vibe, Claude and Codex child processes`
- **integration** — Prove the accepted exception of Story s7 is closed by a run, not only by a direct call to the aggregator
  - Subjects: `a broad docs analysis run through the real docs aggregate runtime and the plan walk, with an oversized terminal input and a nested aggregate: the run completes, the final report is delivered, and its head states the handling and the completeness`
  - Fixtures: `a docs plan tree with oversized upstream outputs, a scripted provider, a lowered window`
- **live** — Reproduce the actual failure of 2026-10-08 with real run-context construction, planning and the real provider limit
  - Subjects: `the broad docs request on this repository that previously stopped at the aggregate step runs to a final report, and the recorded run (run id, handling line, parts, completeness) is kept as the regression record`
  - Fixtures: `a registered and indexed repository, a configured provider, INSRC_LIVE_TESTS=1`
- **contract** — Prove the shape other Stories consume
  - Subjects: `HandlingReport against the sc4 sketch plus the additive fields, with and without trigger, budgets in their own units`, `the bundle schema keeps its open handling object valid and AnswerReport.handling is typed`, `the registered MCP bundle argument is unchanged`, `RunFailure's shape and the code 'executor-aggregator-failed' are unchanged`, `TaskExecutionRecord gains only the optional data field and LookupFailedError only the optional handling and answerStepReason`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handling-table.test.ts: every size on every path takes the table, the free-form final emit included, and the admission rule divides what the table would not`, `handling-admission.test.ts: the checked-in local configuration (10,240 bytes single pass, 22,528 part and combine), the real prompt sizes, exact-boundary, multi-byte, CLI characters, repair-loop and unknown-limit cases`, `synthesize-handling.test.ts: single pass versus divided decision for the lookup path and the free-form lookup` |
| `ac2` | `partition-combine.test.ts: every part is reasoned over serially and evidence and findings are kept exactly through several combine stages`, `partition-combine.test.ts: the combine terminates and a combine failure returns the per-part results` |
| `ac3` | `handling-report.test.ts: parts, budgets in their units and notCovered with plan-qualified ids appear in the answer report and in the rendered head`, `run-handling-report.test.ts: a root and a nested aggregate with uncovered parts make the run incomplete and the visible head shows the handling line` |
| `ac4` | `synthesize-handling.test.ts: a small size whose input is admitted makes the same single call`, `freeform-handling.test.ts: a small conversation that fits returns directly`, `handling-admission.test.ts: a local code or adherence request on the checked-in configuration is handled in parts with trigger 'fit' and states its parts (the departure from ac4's wording accepted on 2026-11-08)` |
| `ac5` | `partition-combine.test.ts: a failed part is kept out, the others are kept, completeness is false, repair exhaustion never discards a successful part, and all parts failing follows the terminal precedence rule`, `step-tool-parts.test.ts: the retry bound marks a part not covered across separate calls`, `freeform-handling.test.ts: all three typed failures keep the tool results, the handling and their reason through executePlan`, `answer-failure-mapping.test.ts: HandlingBudgetError carries results and report through the daemon and plan tree mappings`, `aggregate-failure.test.ts: the walker and the orchestrator keep the root aggregate failure's data, typed or plain, in RunFailure.data`, `nested-aggregate-failure.test.ts: a failed nested aggregate under a succeeding root aggregate makes the run incomplete and names it` |
| `ac6` | `partition-combine.test.ts: one block larger than the room is read in consecutive sections with none dropped, the 6,000 over 5,000 case and the emoji boundary case included` |
| `ac7` | `docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker and delivers a final report with its handling`, `aggregator-handling.test.ts: the aggregator divides an oversized input and keeps the absent-input section in every call`, `docs-broad-live.test.ts: the recorded live run of the broad docs request returns a final report` |

## 8. Migration

**State before:** synthesize and runAggregator render the whole of their inputs into one prompt and make one model call with no size check (src/analyze/context/synthesizer.ts:117-169, src/analyze/runtimes/shared/aggregator.ts:100-155). Structured calls retry inside the provider with an uncapped repair note appended after the caller's measurement, and maxAttempts alone does not stop CliProvider's Vibe path (src/agent/providers/structured-output.ts:150-215, src/shared/types.ts:263). finalizeSynthesize(raw, execution?) is called by the bundle handler with the execution and its result assigned to the bundle layers (src/analyze/context/synthesizer.ts:191-225, src/daemon/steps/analyze-step/phases/bundle.ts:90). The free-form lookup's final emit takes the whole conversation and the request's size is not passed to it, a non-ConnectionExecutionError from it becomes a failed lookup that keeps data only for a LookupFailedError, and the short-circuit copies only the seven layers (src/analyze/explore/freeform-probe.ts:150-200, src/analyze/explore/executor.ts:690-715, src/analyze/context/driver.ts:1004-1044, 1640-1690). The daemon and the plan tree map ShaperAnswerStepFailedError with its results and report (src/daemon/analyze-rpc.ts:1046, src/analyze/orchestrator/driver.ts:810), but executeLeafTask returns a TaskExecutionRecord for a failed aggregate task that holds only the message, and the run failure 'executor-aggregator-failed' is built from it, and a failed nested plan is unreachable from collectPlanSources because it checks failure status before recursing (src/analyze/executor/walker.ts:205-275, 338-390, src/analyze/executor/plan-sources.ts:43-92, src/analyze/executor/types.ts:184-205, src/analyze/orchestrator/driver.ts:515-530). AnswerReport.handling is typed unknown (src/analyze/completeness.ts:206), mergeAnswerReports is binary with a prefix, renderReportHead shows no handling (src/analyze/completeness.ts:377-420). The step tool keeps no progress, and a bad reply returns a retryable error without a new token (src/daemon/steps/analyze-step/phases/bundle.ts:90).

**State after:** The four callers use one shared helper that divides when the HLD's table says so or when the rendered input is not admitted by a provable bound, in characters for a CLI provider and in UTF-8 bytes for a local model, applied before every attempt. A single pass keeps the configured output tokens (10,240 bytes of input with the checked-in configuration); part and combine calls use PART_MAX_OUTPUT_TOKENS 8,192 (22,528 bytes), so every existing prompt plus the minimum room fits. On the checked-in local configuration code and adherence requests are therefore always handled in parts, a departure from the wording of ac4 accepted by the user on 2026-11-08. The helper owns the repair loop and calls the provider with maxAttempts 1 and internalRetry false, so no provider retries. Sections never split a code point. Evidence and findings are assembled in code, a staged combine writes only the summary and always ends, a failed part or combine is named while the other results are kept, a repair that cannot be admitted ends as a not-covered part and never discards a successful one, and when no part is covered the terminal failure follows one precedence rule (budget error only when all uncovered parts are unadmittable, else 'model-failed' or 'invalid-answer'). finalizeSynthesize has two overloads: the bundle return for a call without progress, FinalizedAnswerTurn for a call with it. The request size reaches the free-form final emit, and every ShaperAnswerStepFailedError from it is carried through the executor with its data and its reason (answerStepReason, errorCode 'answer-step:<reason>'). Any aggregate failure, typed or plain, keeps its data in TaskExecutionRecord.data and RunFailure.data, a failed nested aggregate is read through the kept child result and merged even when the root aggregate succeeded, and the handling, with budgets in their own units, reaches the delivered answer on every path and is shown by renderReportHead. The step tool creates an initial AnswerProgress holding the plan, the decision and the budgets, persists it on every transition and re-emits the current turn with a new token after an invalid reply.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add HandlingReport (budgets, optional trigger), parseHandling, mergeHandling, HANDLING_TABLE, PART_MAX_OUTPUT_TOKENS and the admission rule with the single-pass decision only; nothing divides yet — ↩ rollbackable
2. Type AnswerReport.handling, merge handling in mergeAnswerReports with its unchanged signature, and render the handling line in renderReportHead — ↩ rollbackable
3. Add HandlingBudgetError as a ShaperAnswerStepFailedError with the additive reason, and pass it through the driver — ↩ rollbackable
4. Add the helper's own repair loop (maxAttempts 1 and internalRetry false, capped repair note, admission before every attempt), code-point-safe division, assembly adapters, the terminal precedence rule and the staged combine with the per-part fallback, and move synthesize and runAggregator onto them so a small admitted request is unchanged — ↩ rollbackable
5. Pass the request size through the tool loop to runFinalStructuredEmit, move the free-form final emit onto the helper, add the handling callback and field, make the free-form lookup carry every ShaperAnswerStepFailedError as a LookupFailedError with its data, handling and answerStepReason, have failedOutput copy the reason as errorCode 'answer-step:<reason>', and copy the handling in extractSoleFreeformResult onto the derived report — ↩ rollbackable
6. Keep any aggregate failure's data in the optional data field of TaskExecutionRecord in executeLeafTask and copy it into RunFailure.data in the orchestrator; make collectPlanSources read the kept child result of a failed planner task and each plan's aggregate handling, and concludeRun merge nested handling even when the root aggregate succeeded — ↩ rollbackable
7. Add the optional AnswerProgress (plan, decision, budgets, parts) to the step state, startAnswerProgress in prepareAnswerTurn, the progress overload of finalizeSynthesize beside the unchanged bundle overload, the emit_part and emit_combine outputs and the retry field, persisting progress on every transition — ↩ rollbackable

**Backward compat:** All new state and report fields are optional or additive, and the one addition to an existing union value (partitionedBy 'mixed') is on a contract this Story owns; the added failure reason is additive on a class Story s1 declares; TaskExecutionRecord gains an optional data field, LookupFailedError gains optional handling and answerStepReason, and RunFailure already has an optional data, with the code 'executor-aggregator-failed' unchanged. finalizeSynthesize keeps raw and execution in their positions and its first overload keeps the bundle return type, so the bundle handler's existing call and assignment compile and behave as before. completeStructured keeps its retry behaviour for every other caller; only the handling helper passes maxAttempts 1 with internalRetry false. executePlannerTask is not changed. A step state written before the change lacks the progress and is read as single pass. A stored bundle with an open handling object stays valid and a malformed value is read as absent; a handling record without a trigger is valid. A report without handling renders the same head. A request of size XS or S whose input is admitted makes the same calls as before; the one behaviour change, local code and adherence requests on the checked-in configuration being handled in parts, is the accepted departure from ac4's wording. synthesize, runAggregator, runFinalStructuredEmit, mergeAnswerReports, collectPlanSources, concludeRun and renderReportHead keep their signatures with new parameters optional. The registered MCP bundle argument is unchanged and the legacy emit_bundle turn is kept.

## 9. Alternatives considered

### 9.1 a1: Size table plus an enforced input-admission rule with per-call output caps, in one shared helper that owns the repair loop, with carried-data failures and a rendered handling line — **CHOSEN**

One helper divides an answer-writing call's input when the HLD's size table says so or when the rendered input is not admitted by a provable bound, gives part and combine calls a lower stated output cap, owns the schema-repair loop with provider retries off, and carries the handling report and any failure's reason and data to the delivered answer on every path.

(1) Decision: partition when EITHER the measured size (sc3) is M, L or XL (undetermined is XL), OR the rendered input is not admitted. (2) Admission in two units never mixed. CLI provider: declared inputBudgetChars minus a 16,000-character reserve (characters). Local model: the UTF-8 byte length must not exceed window tokens minus the call's output tokens minus 2,048 (bytes), because every token covers at least one byte. A single-pass call keeps the full configured output tokens (no truncation knob): with the checked-in configuration 32,768 - 20,480 - 2,048 = 10,240 bytes, and since the existing prompts alone are 10,652 (code), 11,040 (adherence) and 6,324 (docs) bytes, a local code or adherence request is never admitted single-pass and is handled in parts (trigger 'fit'); a docs request is admitted only if its evidence fits in 3,916 bytes. Part and combine calls use a stated lower output cap PART_MAX_OUTPUT_TOKENS = 8,192, because a part reply is a seven-layer reply with a summary capped at 2,000 characters and the evidence layers of its own section: 32,768 - 8,192 - 2,048 = 22,528 bytes, which holds the largest prompt (11,040) plus the 4,000-byte minimum room (15,040) and leaves 7,488 spare. A part reply that outgrows 8,192 tokens fails validation or is cut by the provider and is handled by the repair and division rules. This departs from the wording of ac4 for local code and adherence requests, which the user accepted on 2026-11-08 under accuracy over cost; ac4 still guarantees that a small request whose input is admitted is returned whole. (3) The helper owns the repair loop with {maxAttempts: 1, internalRetry: false}, a repair note capped at 8,000 characters, and admission before every attempt; tests run the real adapters. (4) Division by directory then file, sections the largest whole code-point prefix that fits the room, a room under 4,000 refused, ordinals separate from keys, part summaries capped at 2,000 characters, evidence and findings assembled in code, a staged combine of N into ceil(N/g). One repair-exhaustion rule: an unadmitted repair divides the part up to three times, then the part is recorded as not covered. Terminal precedence when no part is covered: HandlingBudgetError only when every uncovered part is unadmittable; otherwise ShaperAnswerStepFailedError with 'model-failed' if any part's call threw, else 'invalid-answer', with every part's own reason in notCovered. A combine failure or unadmitted combine with a covered part returns the per-part results with 'combine' in notCovered. (5) Callers and failure routes: LookupFailedError carries partial, handling and the original reason (answerStepReason); failedOutput copies the reason as errorCode 'answer-step:<reason>' and keeps the cause, and the pipeline rebuilds the ShaperAnswerStepFailedError from reason and found. executeLeafTask(task: PlannedTask, intent, runId, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, absentInputs?, execution?): Promise<TaskExecutionRecord> keeps failure data for any aggregate failure, typed or a plain prefixed Error, in the optional data field of TaskExecutionRecord; the orchestrator puts it in RunFailure.data under 'executor-aggregator-failed'. For a failed nested plan, collectPlanSources reads the kept child records and concludeRun merges nested handling even when the root aggregate succeeded. (6) Reporting: HandlingReport with budgets in their own units, optional trigger, mergeHandling, parseHandling, renderReportHead line. (7) Step tool: AnswerProgress carries the partition plan (blocks with ordinals and section cuts), the handling decision (mode and trigger) and the measured budgets as well as the completed parts, the cursor, stage outputs, failures and retries, so the progress overload of finalizeSynthesize can decide whether another part remains and return the HandlingReport; startAnswerProgress creates it; an invalid reply re-emits the turn with a new token and a retry note.

### 9.2 a2: Size table only, separate implementations per path

Decide only from the five sizes with a fixed table and implement division and combine once for the lookup pipeline and once for the aggregator.

Define a table from size to single pass or partitioned with fixed part counts, and implement the division and combine separately for synthesize and for runAggregator. The size class decides; there is no check that a call is admitted.

**Rejected because:** Literal to the HLD but a size class does not bound what a model accepts.

### 9.3 a3: Smallest: halve and retry when the provider refuses the input

Keep one pass as today and only when the provider refuses the input as too large split it in half, retry and combine the halves.

Catch the provider's size refusal in synthesize and runAggregator, split the input at a file boundary into two halves, run each and combine, repeating on refusal. No table, no budget, no step tool part turn beyond a retry.

**Rejected because:** A local model truncates silently instead of refusing, so input is lost with no signal; this violates k1, k2 and k3.

## 10. References

- **[[c1]]** `code` `src/analyze/context/synthesizer.ts:117-225`
- **[[c2]]** `code` `src/analyze/context/driver.ts:1640-1690`
- **[[c3]]** `code` `src/analyze/context/driver.ts:325-362`
- **[[c4]]** `code` `src/analyze/executor/plan-sources.ts:43-92`
- **[[c5]]** `code` `src/shared/types.ts:263`
- **[[c6]]** `code` `src/daemon/steps/analyze-step/types.ts:56-157`
- **[[c7]]** `code` `src/analyze/executor/walker.ts:338-390`
