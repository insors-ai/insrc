<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story adds one shared helper that divides an answer-writing model call's input into ordered parts when the HLD's table from measured size to method says so, or when the rendered input is not admitted by a provable bound: a CLI provider's declared character budget, or, for a local model, a UTF-8 byte count held under the window minus the call's output tokens minus a template reserve. A single pass keeps the configured output tokens (10,240 bytes with the checked-in configuration); part and combine calls on a local model use a stated lower output cap of 8,192 tokens, enforced by the local provider as its generation limit (22,528 bytes), so the largest existing prompt plus the minimum room fits; a CLI provider enforces no output cap and needs none, because a part reply never enters a later call. On the checked-in local configuration code and adherence requests are always handled in parts, which departs from the wording of ac4 and was accepted by the user on 2026-11-08. Evidence that other evidence is judged against, such as the rule an adherence check classifies code sites against, is repeated in every part and counted in the admission, so division cannot make a part drop what it cannot classify. The helper owns the schema-repair loop with one provider attempt and provider retries off, measures every repair before it is sent, and classifies each failure by cause (call failed, invalid reply, unadmittable), recognising a Vibe call failure as well as the Claude and Codex ones. Each part is reasoned over serially, sections never split a code point, evidence and findings are assembled in code, and a staged combine writes only a bounded summary and always ends, falling back to the per-part results; a successful part is never discarded. Four callers use it; on the ordinary success path the handling and the uncovered parts are applied to the report that is stamped on the delivered bundle; the handling report is typed and shown in the answer's head; and every failure keeps its true reason, cause and data, in a JSON-safe form, including the actual inputs of a failed aggregator, through the existing mappings, the free-form executor, the aggregator boundary, the plan walk (nested plans included), the stored task record and the orchestrator.

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

**Returns:** `Promise<Omit<AnalyzeContextBundle, 'meta'>>` — The bundle layers, as today: the one call made today when the size is XS or S and the input is admitted, else the assembled bundle of the parts. A wrapper over synthesizeHandled that drops the handling.

**Errors:**
- `HandlingBudgetError` when No part can be covered and every uncovered part is unadmittable, or the fixed context (including the shared context) leaves no room for a section; carries the lookup results and the report.
- `ShaperAnswerStepFailedError` when No part is covered and at least one uncovered part was admitted: reason 'model-failed' if any part's failure kind is 'call-failed' (isModelCallFailure), else 'invalid-answer' (a reply that stayed invalid, including a schema-invalid reply thrown by completeStructured); every part's own reason is in notCovered; carries the lookup results and the report.
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.

**Preconditions:**
- The plan has been executed

**Postconditions:**
- Model calls are made one after another, each with one provider attempt and provider retries off
- A part that cannot be admitted after division is recorded as not covered while any other part is or can be covered; a covered part is never discarded
- A failed combine returns the per-part results with the failure reported, it does not throw
- Each part failure is recorded with a kind chosen by cause: 'call-failed' when isModelCallFailure(err) (whose wording list now includes 'vibe exited with', so a Vibe non-zero exit is a failed call), 'invalid-reply' for ModelResponseShapeError, SynthesizerSchemaUnrecoverable or any other validation failure thrown by completeStructured, 'unadmittable' when the rendered input is not admitted; a size refusal (InputTooLargeError) is handled by the division rule before classification and is never 'call-failed'
- On a local provider part and combine calls are given PART_MAX_OUTPUT_TOKENS (8,192) as maxTokens, which OllamaProvider enforces as num_predict; a CLI provider is given no enforced output cap; a single pass keeps the configured output tokens
- The shared context of the target is present in the rendered input of every part and every combine call

### 2.2 `synthesizeHandled`

```typescript
synthesizeHandled(args: SynthesizeArgs): Promise<{ readonly layers: Omit<AnalyzeContextBundle, 'meta'>; readonly handling: HandlingReport }>
```

**Parameters:**
- `args: SynthesizeArgs` — The same arguments as synthesize.

**Returns:** `Promise<{ layers: Omit<AnalyzeContextBundle, 'meta'>; handling: HandlingReport }>` — The bundle layers and the HandlingReport of the call (single pass: method 'single-pass', parts 1).

**Errors:**
- `HandlingBudgetError` when As for synthesize.
- `ShaperAnswerStepFailedError` when No part covered, as for synthesize.
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.

**Preconditions:**
- The plan has been executed

**Postconditions:**
- synthesize(args) returns exactly (await synthesizeHandled(args)).layers, so its signature and behaviour for existing callers are unchanged
- The context driver uses this function so the handling reaches found.report

### 2.3 `selectSharedContext`

```typescript
selectSharedContext(target: 'code' | 'docs' | 'adherence' | 'capability' | 'data' | 'infra', executed: ExecutedPlan): readonly EvidenceBlock[]
```

**Parameters:**
- `target: 'code' | 'docs' | 'adherence' | 'capability' | 'data' | 'infra'` — The synthesize target whose prompt judges some evidence against other evidence.
- `executed: ExecutedPlan` — The executed plan whose outputs are searched.

**Returns:** `readonly EvidenceBlock[]` — The blocks of evidence the other evidence is judged against, in plan order: for 'adherence' the outputs of doc.constraint.enumerate and doc.decision.trace (the rule text, verbatim, with its citations); empty for every other target, whose parts are independent.

**Postconditions:**
- The returned blocks are removed from the partition blocks, so they are not duplicated as evidence
- They are rendered in every part and every combine call, never sectioned, and counted in the fixed context of the admission rule
- The 'Rule sources retrieved' count and the rule restatement are computed in code from them, not from part replies

### 2.4 `applyHandling`

```typescript
applyHandling(report: AnswerReport, handling: HandlingReport): AnswerReport
```

**Parameters:**
- `report: AnswerReport` — The report derived from the lookups before the answer was written.
- `handling: HandlingReport` — The handling of the answer step.

**Returns:** `AnswerReport` — A new report with handling set by mergeHandling, one incomplete SourceNote per not-covered part (sourceKind 'lookup', sourceId 'answer step / <part id>', reason the part's reason), and completeness.complete false when any part is not covered; the report is otherwise unchanged.

**Postconditions:**
- A report with a single-pass handling and no uncovered part keeps complete as it was
- The input report is not mutated

### 2.5 `prepareSynthesize`

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

### 2.6 `prepareAnswerTurn`

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

### 2.7 `startAnswerProgress`

```typescript
startAnswerProgress(args: Parameters<typeof prepareSynthesize>[0], size: RequestSize | undefined): AnswerProgress
```

**Parameters:**
- `args: Parameters<typeof prepareSynthesize>[0]` — The turn arguments whose evidence is divided.
- `size: RequestSize | undefined` — The sc3 size; undefined or undetermined is XL.

**Returns:** `AnswerProgress` — The initial progress: the partition plan (ordered blocks with ordinals and section cuts, and the shared blocks), the handling decision (mode and trigger) and the measured budgets, with no part completed.

**Errors:**
- `HandlingBudgetError` when The fixed context, including the shared context, leaves no room for a section.

**Postconditions:**
- The progress holds everything the progress overload of finalizeSynthesize needs to decide whether another part remains and to return the HandlingReport

### 2.8 `finalizeSynthesize`

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

### 2.9 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — The existing arguments.

**Returns:** `Promise<AggregateReport>` — The report; metadata gains the optional handling field.

**Errors:**
- `HandlingBudgetError` when As for synthesize; found.results is [] (no lookup ran), found.report is built from the failure alone, and upstream holds the upstream outputs the call was given.
- `ShaperAnswerStepFailedError` when No part covered, as for synthesize; carries found and upstream as for HandlingBudgetError.
- `Error` when With the existing aggregator prefixes: a single call fails with no part results to return; the original error is its cause.

**Preconditions:**
- The absent-input section is rendered in every part and every combine call and counted in the admission

**Postconditions:**
- Findings of covered parts are concatenated in code by ordinal; the model writes only the summary
- A typed failure from the aggregator carries every upstream output it was given, with taskId, template, params and value

### 2.10 `classifyError`

```typescript
classifyError(err: unknown): Error
```

**Parameters:**
- `err: unknown` — The error thrown by the aggregator's model call.

**Returns:** `Error` — The prefixed Error as today ('aggregator-internal:', 'aggregator-llm-unavailable:' or 'aggregator-schema-unrecoverable:'), now carrying the original error as its cause.

**Postconditions:**
- Prefixes and messages are unchanged
- A typed ShaperAnswerStepFailedError thrown by the handling helper is not passed to classifyError and reaches executeLeafTask unwrapped
- A Vibe non-zero exit ('vibe exited with ...', with or without the retry prefix) now takes the 'aggregator-llm-unavailable:' prefix instead of 'aggregator-schema-unrecoverable:', because isModelCallFailure recognises it; this is a deliberate behaviour change

### 2.11 `isModelCallFailure`

```typescript
isModelCallFailure(err: unknown): boolean
```

**Parameters:**
- `err: unknown` — The error a provider call threw.

**Returns:** `boolean` — True for a ModelCallFailedError or for an Error whose own message (after the retry prefix is stripped, without quoted answer text) starts with a wording in MODEL_CALL_FAILURE_TEXTS.

**Postconditions:**
- CLI_FAILURE_TEXTS gains the entry 'vibe exited with' beside 'claude --print failed', 'claude exited with', 'codex emitted error event' and 'codex exited with'
- The retry prefix is still stripped before matching, so a Vibe failure wrapped by completeStructuredVibe is recognised
- A schema-invalid reply and a size refusal are not recognised as call failures

### 2.12 `failureData`

```typescript
failureData(err: unknown): AggregateFailureData
```

**Parameters:**
- `err: unknown` — The error an aggregate task threw.

**Returns:** `AggregateFailureData` — A JSON-safe value: { kind:'answer-step', reason, found, upstream, handling } for a ShaperAnswerStepFailedError (HandlingBudgetError included), else { kind:'error', name, message, cause? } where cause is failureData(cause) nested at most 3 levels.

**Postconditions:**
- The value contains no Error object, function or cyclic reference, so it survives JSON.stringify in the task and run records
- The original cause's message is present in the value
- upstream keeps taskId, template, params and value of every upstream output the failed call was given

### 2.13 `executeLeafTask`

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

**Returns:** `Promise<TaskExecutionRecord>` — As today; a failed record of an aggregate task gains an optional data field holding failureData(err).

**Postconditions:**
- For an aggregate task, the failure is kept in TaskExecutionRecord.data as failureData(err) for any aggregate failure: a ShaperAnswerStepFailedError or HandlingBudgetError gives its found results, its upstream inputs and its HandlingReport, a plain prefixed Error gives its name, message and cause; the failure is never reduced to its message alone
- TaskExecutionRecord.data survives the JSON write of the task record and the run record

### 2.14 `executePlannerTask`

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

### 2.15 `runFinalStructuredEmit`

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

### 2.16 `failedOutput`

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

### 2.17 `extractSoleFreeformResult`

```typescript
extractSoleFreeformResult(executed: Awaited<ReturnType<typeof executePlan>>): { rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null
```

**Parameters:**
- `executed: Awaited<ReturnType<typeof executePlan>>` — The executed plan.

**Returns:** `{ rawBundle: Omit<AnalyzeContextBundle, 'meta'>; toolCallCount: number; handling?: HandlingReport } | null` — As today, plus the free-form output's handling, which the pipeline puts on the report that reportFromLookups derives.

**Postconditions:**
- A failed free-form output still returns null, so it reaches the answer-step failure with its report and no second synthesis is tried

### 2.18 `collectPlanSources`

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

### 2.19 `concludeRun`

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

### 2.20 `mergeAnswerReports`

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

### 2.21 `renderReportHead`

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

### 3.3 `The report on the ordinary success path (found.report)` — field-modify

In the lookup pipeline the driver derives found.report from the lookups before any answer is written and settlePipelineOutcome passes that report to the stamp callback, which builds the delivered bundle as { ...raw, report, meta } (src/analyze/context/driver.ts around 577 and 1476); the model's own report is never used. Because synthesize returns only the seven layers, a handling report produced while synthesizing would have no path to the delivered bundle, and a successful partial answer would keep complete=true from the lookups. The transition: the driver calls synthesizeHandled, builds found' = { ...found, report: applyHandling(found.report, handling) } and returns it in the 'bundle' outcome; settlePipelineOutcome then hands the updated report to the stamp callback. applyHandling sets handling by mergeHandling, adds one incomplete source note per not-covered part (sourceKind 'lookup', sourceId 'answer step / <part id>') and sets complete false when a part is not covered, including a combine fallback ('combine' in notCovered). A single pass adds the single-pass handling and leaves completeness as it was. The free-form short-circuit applies the same function to the report that reportFromLookups derives, using the handling extractSoleFreeformResult returns. On a thrown answer-step failure the error already carries found, whose report is built from the error's handling by the same function.

**Call sites:**
- `src/analyze/context/driver.ts:577`
- `src/analyze/context/driver.ts:1476`
- `src/analyze/context/driver.ts:1664`
- `src/analyze/context/driver.ts:1715`
- `src/analyze/completeness.ts:377-420`

### 3.4 `HANDLING_TABLE, the admission rule and the output caps` — new

HANDLING_TABLE maps the sc3 size to the method: XS and S single pass, M, L and XL partitioned; an undetermined measure is XL. The size reaches every caller of the helper, the free-form final emit through the tool loop included. The admission rule decides whether a rendered input (messages, repeated context, the shared context, the absent-input section) may be sent, in two units that are never mixed. For a CLI provider: characters, against the declared inputBudgetChars minus a 16,000-character reserve (basis 'declared'). For a local model: the UTF-8 byte length against the window tokens (the figure ollamaContextWindow gives num_ctx) minus the call's output tokens minus 2,048 for template and special tokens (basis 'bytes-bound'), because every token covers at least one byte, so the byte length bounds the token count and an admitted input cannot be truncated. Output tokens are per call kind and apply to a local model only: a single pass keeps the configured ollamaNumPredict; part and combine calls use the constant PART_MAX_OUTPUT_TOKENS = 8,192, enough for a seven-layer reply with a summary capped at 2,000 characters, and OllamaProvider enforces it as num_predict (a reply cut at the cap ends mid-JSON and fails validation as an invalid reply). A CLI provider enforces no output cap: CliProvider.modelArgs ignores the completion options and the Vibe path forwards no limit. None is needed for the admission bound: a CLI provider's admission is input characters only, and a part reply's size never enters a later model call, because the combine reads only the part summaries (capped at 2,000 characters by the schema) and the evidence layers are assembled in code from the replies into the delivered answer. Worked with the checked-in configuration (a 32,768-token window and ollamaNumPredict 20,480): single pass 32,768 - 20,480 - 2,048 = 10,240 bytes; part and combine 32,768 - 8,192 - 2,048 = 22,528 bytes. The existing prompts alone are 10,652 bytes (code), 11,040 (adherence) and 6,324 (docs), so a local code or adherence request is never admitted single pass and is always handled in parts (trigger 'fit'), and a docs request is admitted single pass only if its evidence fits in 3,916 bytes. For a part the largest prompt plus the 4,000-byte minimum room is 15,040 bytes, within 22,528 with 7,488 spare; the shared context of an adherence request is counted in the fixed context, so the room left for a section is 22,528 minus the prompt minus the shared context. This departs from the wording of ac4 for local code and adherence requests; the user accepted it on 2026-11-08 (accuracy over cost), and ac4 still guarantees that a small request whose input is admitted is returned whole. If the fixed context plus the minimum room does not fit the part budget, HandlingBudgetError names the configuration (raise the window or lower PART_MAX_OUTPUT_TOKENS) and, when the shared context is what does not fit, the shared context. On a local model a part reply that outgrows the cap is cut by the provider, fails validation and is handled by the repair and division rules. With no declared limit: 60,000 characters (source 'default', also used by the step tool, which has no provider). The helper owns the repair loop: it calls completeStructured with {maxAttempts: 1, internalRetry: false} (internalRetry is an existing completion option), because maxAttempts alone is ignored by CliProvider's Vibe path and the Claude and Codex paths keep transient retries; with both set no provider retries on its own. It builds each repair prompt itself with the repair note capped at 8,000 characters of listed errors (the rest counted) and applies the rule to every attempt before it is sent. Repair exhaustion has one rule everywhere: a repair that is not admitted divides the part further, up to three times; after that the part is recorded as not covered and processing continues, so a successful part is never discarded. The input is divided when the table says partitioned OR the rule does not admit it.

**Call sites:**
- `src/shared/types.ts:199-203`
- `src/shared/types.ts:263`
- `src/analyze/context/shaper-provider.ts:205-250`
- `src/agent/providers/structured-output.ts:150-215`
- `src/daemon/tools/convert-text.ts:144`
- `src/config/analyze.ts:40-60`
- `src/config/analyze.ts:193`
- `src/agent/providers/ollama.ts:673`
- `src/agent/providers/cli-provider.ts:707-721`

### 3.5 `PartPlan, PartResult, the shared context and the caller adapters` — new

A PartPlan is the ordered blocks of the evidence with an ordinal separate from the block key, grouped by directory then file in stable order, plus the shared blocks. The shared blocks come from a SHARED_CONTEXT table keyed by synthesize target and selected by selectSharedContext: for 'adherence' they are the outputs of doc.constraint.enumerate and doc.decision.trace, because the adherence prompt classifies each code site against that rule text and drops a site it cannot classify, so a part that holds code sites but not the rule would drop them; for code, docs, data, infra and capability the table is empty because their parts are independent. A shared block is removed from the partition blocks, rendered in every part and every combine call in the same position as the absent-input section, never sectioned, and counted in the fixed context of the admission rule; the 'Rule sources retrieved' count and the rule restatement in the summary are computed in code from the shared blocks, not from part replies. When the fixed prompt plus the shared context plus the 4,000-unit minimum room is not admitted, the helper throws HandlingBudgetError naming the shared context, because the evidence is never summarised down and a part cannot be classified against a rule it cannot see. A block larger than the room is cut into consecutive sections, each the largest whole UTF-8 code-point prefix of the remainder that fits the room, so no code point is split and a section may leave up to three unused bytes; sections do not overlap; a section is short only if it is the final one or ends at a code-point boundary before the room is full; the 4,000-unit minimum applies to the room itself, and a room under it is a HandlingBudgetError. A PartResult holds the part's heading, its summary (capped at 2,000 characters by the schema) and its assembled content. The bundle adapter takes system, focus and summary from the final combine and concatenates structure, surface, artefacts and upstream of the covered parts by ordinal under part headings; the aggregate adapter takes the summary from the final combine and concatenates the findings of the covered parts by ordinal, each keeping its sources. A combine reply is never read for evidence or findings. Combine stages: N summaries become ceil(N/g) with g at least 2, so it ends in at most ceil(log2 N) stages. If a combine fails or is not admitted and at least one part is covered, the adapter's output is built from the per-part results with 'combine' in notCovered and nothing is thrown.

**Call sites:**
- `src/analyze/context/synthesizer.ts:117-169`
- `src/analyze/context/synthesizer.ts:100-106`
- `src/prompts/analyze/synthesize.adherence.system.md`
- `src/analyze/runtimes/shared/aggregator.ts:100-155`
- `src/analyze/runtimes/shared/aggregate-types.ts:28-80`

### 3.6 `HandlingBudgetError, the every-part-failed case and LookupFailedError` — new

HandlingBudgetError extends ShaperAnswerStepFailedError, with a new reason 'input-does-not-fit' added to AnswerStepFailureReason (additive; the class is declared by Story s1). ShaperAnswerStepFailedError gains one optional readonly field upstream: readonly AggregateInputRecord[] | undefined (additive; absent on the lookup path), AggregateInputRecord being { taskId, template, params, value } as in UpstreamOutput, because found is AnswerStepFound whose results are lookup results (ExecutedExploration[]) and cannot hold the aggregator's inputs. An aggregator failure (HandlingBudgetError and the every-part-failed error) sets found.results to [] because no lookup ran, builds found.report from the failure alone with the helper the lookup path uses for an empty result list, and sets upstream to the upstream outputs it was given, so nothing is invented and nothing is dropped. Every part failure is classified by cause when it happens, not by whether the call threw: 'call-failed' when isModelCallFailure(err) (src/analyze/context/model-failure.ts, the test runAggregator's classifyError already uses; its list of CLI wordings gains 'vibe exited with', because cli-provider.ts builds every CLI non-zero exit as `${cli} exited with ${code}.` and completeStructuredVibe wraps it in the retry prefix that isModelCallFailure strips, so without the entry an all-parts Vibe outage would fall through to 'invalid-answer'; the same list feeds classifyError, so a Vibe exit takes the 'aggregator-llm-unavailable:' prefix, a deliberate behaviour change; a size refusal, InputTooLargeError, is handled by the division rule before classification and is never 'call-failed'), 'invalid-reply' for ModelResponseShapeError, SynthesizerSchemaUnrecoverable or any other validation failure that completeStructured throws (the Ollama and Vibe providers throw after a single attempt when validation fails, and Codex throws ModelResponseShapeError), and 'unadmittable' when the rendered input is not admitted. Terminal precedence when no part is covered: HandlingBudgetError only when every uncovered part is unadmittable (or the fixed context leaves no room for a section); otherwise a ShaperAnswerStepFailedError with reason 'model-failed' if any part is 'call-failed', else 'invalid-answer', with every part's own reason in notCovered. The daemon's mapping (analyze-rpc.ts) and the plan tree's mapping (orchestrator/driver.ts), which test instanceof ShaperAnswerStepFailedError, carry the found results and report with no new branch, and the driver passes the error through unchanged. LookupFailedError (message, partial, cause) gains two optional fields: handling and answerStepReason (the original reason). The free-form lookup catches every ShaperAnswerStepFailedError from the tool loop and throws a LookupFailedError carrying the tool results as partial, the handling and the reason; failedOutput copies the reason into the failed output's errorCode as 'answer-step:<reason>' and keeps the cause, and the pipeline rebuilds the ShaperAnswerStepFailedError from that reason and the found results, so the three reasons are told apart and executePlan keeps the partial results and the report instead of attempting a second synthesis.

```
AnswerStepFailureReason adds 'input-does-not-fit'; ShaperAnswerStepFailedError adds readonly upstream?: readonly AggregateInputRecord[] | undefined, with AggregateInputRecord = { readonly taskId: string; readonly template: string; readonly params: Readonly<Record<string, unknown>>; readonly value: unknown }; LookupFailedError adds readonly handling?: HandlingReport | undefined and readonly answerStepReason?: AnswerStepFailureReason | undefined; CLI_FAILURE_TEXTS adds 'vibe exited with'
```

**Call sites:**
- `src/analyze/context/driver.ts:325-362`
- `src/analyze/context/driver.ts:1364-1367`
- `src/analyze/executor/types.ts:56-61`
- `src/daemon/analyze-rpc.ts:1046`
- `src/analyze/orchestrator/driver.ts:810`
- `src/analyze/explore/lookup-failed.ts:20-34`
- `src/analyze/explore/freeform-probe.ts:150-200`
- `src/analyze/explore/executor.ts:690-715`
- `src/analyze/context/model-failure.ts:25-90`
- `src/agent/providers/model-call-error.ts:1-40`
- `src/agent/providers/cli-provider.ts:972-989`
- `src/agent/providers/cli-provider.ts:1068-1095`

### 3.7 `TaskExecutionRecord.data, RunFailure.data and the failed nested plan` — field-add

executeLeafTask(task: PlannedTask, intent, runId, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, absentInputs?, execution?) currently catches an error from the aggregate task and records the failed task with its message only, and the orchestrator turns a failed aggregate task into the run failure with the code 'executor-aggregator-failed' and a message of task counts and failure strings. TaskExecutionRecord gains an optional data field kept for any aggregate failure, built by failureData(err) as a JSON-safe value, because task and run records are written with JSON.stringify (atomicWriteJson in executor/cache.ts and orchestrator/persistence.ts), which turns an Error object into {}: for a ShaperAnswerStepFailedError (HandlingBudgetError included) { kind:'answer-step', reason, found, upstream, handling }, where upstream keeps taskId, template, params and value of each upstream output (plain task outputs that are already stored in task records, so the same JSON rule applies); for a plain Error { kind:'error', name, message, cause? } with the cause nested at most 3 levels and no Error objects, functions or cycles. The original error is preserved at the classification boundary: runAggregator's classifyError builds the same prefixed Error as today but with the original error as its cause (it discarded it before), and a typed answer-step error thrown by the helper is not passed through classifyError, so executeLeafTask receives the original in both cases. The orchestrator copies it into RunFailure.data under the unchanged code when the root aggregate fails. For a nested plan, executePlannerTask marks the parent planner task failed when its child has no final report and keeps childResult, and collectPlanSources checks failure status before recursing, so a failed nested aggregate was unreachable and a root aggregate that succeeds from sibling outputs raised no run failure. The design makes collectPlanSources read the kept child records of a failed planner-kind task and add sources for the child's aggregate failure and uncovered parts, and concludeRun merge the nested handling with the root's, so the run is incomplete and names the nested failure whether or not the root aggregate succeeded.

```
TaskExecutionRecord adds readonly data?: unknown (JSON-safe: AggregateFailureData)
```

**Call sites:**
- `src/analyze/executor/walker.ts:205-275`
- `src/analyze/executor/walker.ts:338-390`
- `src/analyze/executor/plan-sources.ts:43-92`
- `src/analyze/executor/types.ts:184-205`
- `src/analyze/executor/types.ts:56-61`
- `src/analyze/orchestrator/driver.ts:515-530`
- `src/analyze/orchestrator/driver.ts:605-632`
- `src/analyze/orchestrator/types.ts:265-269`
- `src/analyze/orchestrator/types.ts:307`
- `src/analyze/runtimes/shared/aggregator.ts:145`
- `src/analyze/runtimes/shared/aggregator.ts:355`
- `src/analyze/executor/cache.ts:126`
- `src/analyze/orchestrator/persistence.ts:183`

### 3.8 `AnswerProgress and StepStatePayload` — field-add

AnswerProgress is {mode: 'single' | 'partitioned', trigger?: 'size' | 'fit' | 'both', plan: PartPlan (the blocks with ordinals and section cuts, and the shared blocks), budgets: HandlingReport['budgets'], completed: PartResult[] by ordinal, pending: {kind 'part' | 'combine', ordinal or stage and group index}, stageOutputs, failures: {part, reason}[], retries}. Carrying the plan, the decision and the budgets lets the progress overload of finalizeSynthesize decide whether another part remains and return the HandlingReport without recomputing from the evidence. startAnswerProgress(args, size) makes the initial value: prepareAnswerTurn calls it when the plan phase hands over, from the table and the admission of the rendered input, and the state carries it from then on; a state without progress is a legacy state and is read as single pass. The bundle handler persists progress by re-encoding the state token on every valid transition. An invalid reply increments retries, is persisted, and the current turn is re-emitted with the same prompt and a new state token and a retry note, as StepOutputEmitBundle, StepOutputEmitPart or StepOutputEmitCombine, which gain an optional retry field {attempt, reason}; it is not an error output. At the retry bound the part or the combine is recorded as failed and the flow continues; retries reset to zero when a turn advances; progress is released on terminal success and failure.

**Call sites:**
- `src/daemon/steps/analyze-step/phases/bundle.ts:90`
- `src/daemon/steps/analyze-step/answer-turn.ts:37-62`
- `src/daemon/steps/analyze-step/types.ts:56-157`

### 3.9 `StepOutputEmitPart and StepOutputEmitCombine` — new

Two outputs added to the StepOutput union beside StepOutputEmitBundle with the same fields plus the part ordinal and total, or the stage and group, and the optional retry field. A reply reuses the registered bundle argument of seven string layers (a part reply is a seven-layer bundle of that part with its summary within the cap; a combine reply fills system, focus and summary and leaves the four evidence layers empty), so the registered MCP schema and StepInputBundle are unchanged and the legacy emit_bundle turn is kept. A typed answer failure is returned as StepOutputError with the declared code and its data, not as an uncaught exception.

**Call sites:**
- `src/mcp/server.ts:408-425`
- `src/daemon/steps/analyze-step/types.ts:56-157`
- `src/daemon/steps/analyze-step/handler.ts:118`

### 3.10 `AggregateReport.metadata.handling` — field-add

Carries the HandlingReport of the aggregator call, validated by parseHandling on read. collectPlanSources reads it for the aggregate task of the root plan and of each nested plan, and concludeRun merges them with the run context's handling through mergeHandling, so uncovered parts make the run's completeness false.

**Call sites:**
- `src/analyze/executor/plan-sources.ts:43-92`
- `src/analyze/orchestrator/driver.ts:605-632`

## 4. Diagrams

- [Sequence diagram](docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Types HandlingReport with additive fields (combineStages, budgets in their own units, optional trigger, and 'mixed' for partitionedBy), states the composition rules, and fills it on every answer of both paths. |
| `sc2` | consumes | Fills AnswerReport.handling through applyHandling (which also adds the uncovered parts as incomplete source notes and sets complete false); keeps the binary mergeAnswerReports(first, second, prefix); renders one handling line in renderReportHead; the driver passes the updated report to the stamp callback that sets the delivered bundle's report. |
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
  - Detection: failures holds every part and completed is empty; the helper records for each part a failure kind chosen by cause when it happened: 'call-failed' (isModelCallFailure(err), whose wording list includes the Claude, Codex and Vibe exits), 'invalid-reply' (ModelResponseShapeError, SynthesizerSchemaUnrecoverable or any other validation failure thrown by completeStructured, which the Ollama, Vibe and Codex adapters throw for a schema-invalid reply) or 'unadmittable'; it applies one precedence rule
  - Response: HandlingBudgetError ('input-does-not-fit') only when every uncovered part is 'unadmittable', or the fixed context leaves no room for a section; otherwise a ShaperAnswerStepFailedError with reason 'model-failed' if any part is 'call-failed', else 'invalid-answer'. Either way every part's own reason is in notCovered and the lookup results and the report are carried
  - User impact: A typed failure of the right kind that keeps what the lookups found and names what happened to each part; malformed replies are reported as 'invalid-answer' and not as a failed model call even though the adapter threw; a mix of unadmittable and failed parts is reported as the failure of the call, not as a budget problem; no empty answer is written
- **Every part fails with a Vibe non-zero exit (an API or runtime outage)** (terminal)
  - Detection: completeStructuredVibe wraps the CliExitError ('vibe exited with <code>. ...') in the 'structured-output: validation failed after N attempts: ' prefix; isModelCallFailure strips the prefix and, with 'vibe exited with' in CLI_FAILURE_TEXTS, recognises it; a size refusal (InputTooLargeError) is excluded because the division rule handles it first
  - Response: Each part is recorded as 'call-failed'; with no part covered the terminal failure is ShaperAnswerStepFailedError 'model-failed' with every part's reason in notCovered; in the aggregator, classifyError gives the 'aggregator-llm-unavailable:' prefix with the original error as its cause
  - User impact: A Vibe outage is reported as a failed model call, not as a malformed answer
- **The shared context of the target (the rule an adherence check classifies against) does not fit with the fixed prompt and the minimum room** (terminal)
  - Detection: The admission rule counts the shared context in the fixed context; fixed prompt plus shared context plus the 4,000-unit minimum room is not admitted against the part and combine budget
  - Response: HandlingBudgetError whose message names the shared context and the configuration to change; the shared context is not sectioned and not summarised down, because a part cannot be classified against a rule it cannot see; no partial answer is written
  - User impact: A typed failure that says the rule evidence is too large to accompany every part, instead of an answer whose sites were silently dropped
- **A dependent part would lose the evidence it is judged against (an adherence request with the rule under docs/ and the code sites under src/)** (recoverable)
  - Detection: selectSharedContext returns the rule outputs for the 'adherence' target; the partition blocks exclude them, so no part is built without them
  - Response: The rule text is rendered in every part and every combine call, each part classifies its code sites against it, and the 'Rule sources retrieved' count and rule restatement are computed in code from the shared blocks
  - User impact: Sites in a different directory from the rule are classified as match, drift or contradiction instead of being dropped
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
- **A part reply outgrows the 8,192-token part output cap on a local model** (recoverable)
  - Detection: OllamaProvider passes maxTokens as num_predict, so the provider cuts the reply mid-JSON and it fails validation; the helper sees an invalid reply for that part. A CLI provider enforces no output cap, so this case does not arise there and is not needed: a part reply never enters a later model call
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
- **A partitioned answer succeeds in part on the ordinary lookup path (a part or the combine is not covered)** (recoverable)
  - Detection: synthesizeHandled returns layers and a HandlingReport whose notCovered is non-empty; the driver calls applyHandling on found.report before returning the 'bundle' outcome
  - Response: applyHandling sets report.handling, adds one incomplete source note per uncovered part ('answer step / <part id>') and sets completeness.complete false; settlePipelineOutcome passes this updated report to the stamp callback, so the delivered bundle's report carries the handling, the uncovered parts and complete=false instead of the lookups' complete=true
  - User impact: A partial answer is never delivered as complete; the head names the parts that were not covered and why
- **The aggregator's classifyError would discard the original error** (terminal)
  - Detection: classifyError builds a fresh prefixed Error; before this Story it passed no cause, so nothing downstream could read the original
  - Response: classifyError keeps the prefix and message and sets the original error as the new Error's cause; a typed ShaperAnswerStepFailedError from the helper is thrown unwrapped and is not passed to classifyError; failureData reads the cause chain
  - User impact: The run's failure data names the real cause of an aggregate failure
- **A typed failure is raised by the aggregator, whose inputs are upstream task outputs and not lookup results** (terminal)
  - Detection: The typed error's found is AnswerStepFound, whose results are lookup results, so it cannot hold the aggregator's UpstreamOutput records; the aggregator failure sets found.results to [] (no lookup ran) and the error's optional upstream field to the upstream outputs it was given
  - Response: found.report is built from the failure alone with the helper the lookup path uses for an empty result list; upstream keeps taskId, template, params and value of every output; failureData serialises found, upstream and handling together, so nothing is invented and nothing is dropped
  - User impact: A failed aggregation keeps the actual outputs it was asked to combine and who produced them
- **A failure is thrown from inside runAggregator** (terminal)
  - Detection: executeLeafTask catches the aggregate task's error: either a ShaperAnswerStepFailedError (HandlingBudgetError included), thrown unwrapped by the helper, or a plain Error built by classifyError with an aggregator prefix and the original error as its cause, for example a single call that failed with no part results
  - Response: The failed record keeps the failure in its optional data field as failureData(err), a JSON-safe value: { kind:'answer-step', reason, found, upstream, handling } for a typed error, { kind:'error', name, message, cause? } for a plain Error with the cause nested at most 3 levels and no Error objects (task and run records are written with JSON.stringify, which turns an Error into {}). When the root aggregate fails the orchestrator copies it into RunFailure.data under the unchanged code 'executor-aggregator-failed'
  - User impact: A failed aggregation keeps what it carried, including the original cause message and its upstream inputs, whatever the kind of error, and survives being stored and read back; the run says how far the handling got
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
| A part or combine call on the checked-in local configuration | The limit is 22,528 bytes (32,768 - 8,192 - 2,048); the largest prompt plus the 4,000-byte minimum room is 15,040 bytes, so 7,488 bytes are spare and every existing prompt fits; for an adherence request the shared context comes out of those spare bytes. |
| An adherence request with the rule outputs under docs/ and the code sites under src/, forced into separate parts | The rule outputs are shared context: they appear in the prompt of every part and every combine call and not as partition blocks; each part classifies its sites against the rule; the delivered answer has the sites classified, not dropped; the rule-source count is computed in code. |
| An adherence request whose rule evidence is too large to accompany every part | HandlingBudgetError naming the shared context and the configuration; nothing is summarised down. |
| A code, docs, data, infra or capability request | The shared context is empty and the parts are independent, as before. |
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
| Malformed replies from every part through the real Ollama, Vibe, Codex and Claude adapters | Each adapter throws after its single attempt; the helper classifies the failure as 'invalid-reply', so the terminal failure is ShaperAnswerStepFailedError 'invalid-answer', not 'model-failed'. |
| A part or combine call on a CLI provider | No output cap is passed or enforced (the adapters ignore maxTokens); admission is input characters only; the size of a part reply does not enter any later call because the combine reads only the capped summaries. |
| A cause chain deeper than 3 levels, or a cause that is not an Error | failureData stops at 3 levels and records a non-Error cause as its string; the value stays JSON-safe. |
| A Vibe non-zero exit with and without the retry prefix, and a Vibe size refusal | The two non-size exits are recognised by isModelCallFailure (the prefix is stripped first); the size refusal (InputTooLargeError) is divided before classification and never counted as 'call-failed'; a Vibe malformed reply stays 'invalid-reply'. |
| An aggregator failure with several upstream outputs from different producers | found.results is [], and upstream lists every output with its taskId, template, params and value, in the order the aggregator received them; after the task record is written and read back the same values and producers are present. |

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

- **unit** — Prove the table, admission rule, output caps, shared context, repair loop, division, assembly and combine without a model
  - Subjects: `HANDLING_TABLE: XS and S single pass, M, L and XL partitioned, an undetermined measure is XL`, `decision: the table alone divides (trigger 'size'), the admission rule alone divides a small size ('fit'), both give 'both', a single pass has no trigger`, `admission for a local model with the checked-in values (32,768 window, 20,480 single-pass output, 2,048 reserve) is 10,240 bytes for a single pass: exactly 10,240 is admitted, one byte over is divided, multi-byte text is counted in bytes; part and combine calls use PART_MAX_OUTPUT_TOKENS 8,192 and a limit of 22,528 bytes; a window that leaves less than fixed context plus 4,000 bytes gives HandlingBudgetError naming the configuration`, `with the real code, adherence and docs prompts the single-pass decision for the checked-in local configuration is 'not admitted' for code (10,652 bytes) and adherence (11,040), and admitted for docs only when the evidence is at most 3,916 bytes; every part prompt plus the 4,000-byte minimum room (15,040 at most) fits 22,528`, `a CLI provider is admitted in characters against its declared budget minus 16,000, and the two units are never compared`, `the helper calls the provider with {maxAttempts: 1, internalRetry: false} and builds each repair prompt itself: the note is capped at 8,000 characters with the rest counted, every attempt is admitted before it is sent, and a fake provider that would retry internally is never allowed to`, `repair exhaustion has one outcome: an unadmitted repair divides the part up to three times, then the part is recorded as not covered and the others continue; a part that already succeeded is never discarded`, `terminal precedence when no part is covered, with failures classified by cause: every uncovered part 'unadmittable' gives HandlingBudgetError; a mix of unadmittable and 'invalid-reply' parts gives ShaperAnswerStepFailedError 'invalid-answer'; any 'call-failed' part (isModelCallFailure, including a Vibe non-zero exit) gives 'model-failed'; a thrown schema-invalid error (ModelResponseShapeError, SynthesizerSchemaUnrecoverable) is 'invalid-reply', not 'call-failed'; each part's own reason is in notCovered`, `sections are the largest whole code-point prefix that fits the room: a 6,000-byte ASCII block in a room of 5,000 gives 5,000 and 1,000; 4,999 ASCII bytes then a four-byte emoji gives 4,999 and a second section that starts with the emoji; every section decodes to valid text, none overlaps, none is dropped; ordinals separate from keys`, `combine terminates: N summaries become ceil(N/g) per stage and a stage whose count does not fall is a combine failure`, `a combine failure, including a combine that is not admitted, with at least one part covered returns the per-part results with 'combine' in notCovered and throws nothing`, `the bundle adapter and the aggregate adapter keep evidence layers and findings exactly, in order, through several combine stages`, `parseHandling reads a stored {} and other malformed values as absent, and accepts a record with and without trigger`, `mergeHandling: absent side ignored; single-pass root with partitioned child gives 'partitioned' and summed parts; budgets concatenated and de-duplicated in their own units keeping the largest inputSize, so a local 'bytes-bound' entry survives a merge with a CLI entry; combineStages sum; partitionedBy 'mixed'; equal local part ordinals in two nested plans stay distinct by plan path`, `mergeAnswerReports keeps its binary signature and prefix behaviour`, `renderReportHead: a report without handling renders exactly as today; with handling it adds one line with method, parts, each budget in its unit and each not-covered part with its reason`, `a compile-time test: the bundle handler's call finalizeSynthesize(input.bundle, execution) resolves to the first overload and its result is assignable to the bundle layers; the progress call resolves to the second overload`, `applyHandling: a single-pass handling with no uncovered part keeps complete as it was; a partitioned handling with an uncovered part or a 'combine' entry sets complete false and adds one incomplete source note 'answer step / <part id>' per uncovered part; the input report is not mutated`, `failureData: a typed error gives { kind:'answer-step', reason, found, upstream, handling }; a plain Error gives { kind:'error', name, message, cause } nested at most 3 levels; a non-Error cause is recorded as its string; the value contains no Error object or cycle and survives JSON.stringify and JSON.parse unchanged; upstream keeps taskId, template, params and value of every output in order`, `classifyError keeps its prefixes and messages and sets the original error as the cause; the cause chain of 'aggregator-llm-unavailable:' and 'aggregator-schema-unrecoverable:' errors holds the provider's original error`, `the part and combine output cap: for a local model the helper passes maxTokens 8,192 (PART_MAX_OUTPUT_TOKENS) and a single pass passes the configured output tokens; for a CLI provider it passes no enforced output cap and the admission is input characters only`, `isModelCallFailure: 'vibe exited with 1.' is a call failure with and without the 'structured-output: validation failed after 2 attempts: ' prefix; 'vibe exited with' inside quoted answer text is not; a Vibe size refusal message (InputTooLargeError) is excluded by the division rule before classification; Claude and Codex wordings are unchanged; a schema-invalid reply is not a call failure`, `classifyError on a Vibe exit gives the 'aggregator-llm-unavailable:' prefix (previously 'aggregator-schema-unrecoverable:') with the original error as the cause; Claude and Codex exits keep their prefix`, `selectSharedContext: for 'adherence' it returns the doc.constraint.enumerate and doc.decision.trace outputs in plan order; for code, docs, data, infra and capability it returns nothing; the returned blocks are absent from the partition blocks; the rule-source count and the rule restatement computed in code match the shared blocks`, `shared context in the admission rule: fixed prompt plus shared context plus the 4,000-unit minimum room that does not fit gives HandlingBudgetError whose message names the shared context; one that fits leaves the room for a section equal to the budget minus the prompt minus the shared context, and the shared context is not sectioned`
  - Fixtures: `a scripted provider that records each call and its attempt count and prompt text, proves no two overlap, and can fail a chosen part, the combine or a repair attempt, refuse an input as too large, or return a reply with many validation errors`, `a configurable window so a small input divides`
- **integration** — Prove the four callers, the real provider adapters, the failure routes and the bridge into the delivered answer, through real modules and a scripted provider
  - Subjects: `the real adapters driven through completeStructured with {maxAttempts: 1, internalRetry: false}: Vibe, Claude and Codex (CliProvider with the underlying process stubbed) each make exactly one attempt on a failing reply; the CLI adapters are checked for the single attempt only, since they do not enforce maxTokens (this is asserted, so a later change is noticed)`, `adapter-level output cap and malformed-reply tests: the OllamaProvider request for a part or combine call carries num_predict 8,192 and a single-pass request carries the configured output tokens; a reply cut at the cap (truncated JSON) is handled as an invalid reply; malformed replies from every part through the real Ollama, Vibe, Codex and Claude adapters give ShaperAnswerStepFailedError 'invalid-answer' and a transport failure gives 'model-failed'`, `a non-size Vibe exit failure through the real Vibe adapter (child process stubbed to exit non-zero) for every part gives 'call-failed' per part and the terminal ShaperAnswerStepFailedError 'model-failed'; a Vibe malformed reply for every part still gives 'invalid-answer'; the same Vibe exit through the real runAggregator gives the 'aggregator-llm-unavailable:' prefix`, `adherence regression with the rule and the code sites forced into separate parts, through the real synthesizer and a scripted provider: the rule outputs (docs/) and the code sites (src/) are placed so that division puts them in different parts; the scripted provider asserts that the rule text is present in the prompt of every part and every combine call, that no partition block repeats the rule as evidence, and that its reply classifies each site against the rule; the delivered answer has every site classified as match, drift or contradiction and none dropped, and the rule-source count equals the number of rule outputs; the same request with a rule too large to accompany every part gives HandlingBudgetError naming the shared context`, `the ordinary lookup path through the real context driver (steps.synthesizeHandled, applyHandling, settlePipelineOutcome and the stamp callback) with a scripted provider: a successful partitioned answer delivers a bundle whose report.handling is the partitioned handling; a run with a failed part delivers a bundle whose report.handling.notCovered names the part, whose incomplete sources include 'answer step / <part id>' and whose completeness.complete is false; the combine fallback delivers the per-part results with 'combine' in notCovered and complete false; a single-pass answer keeps the lookups' completeness; the model's own report is never used`, `synthesize: XS or S and admitted makes the one call of today; M or larger, or not admitted, divides, and a failed part is named`, `free-form lookup: the request size reaches runFinalStructuredEmit through the tool loop; a conversation that fits at size S returns directly with single-pass handling copied onto the report reportFromLookups derives; at size M it is divided although it fits; HandlingBudgetError, 'model-failed' and 'invalid-answer' failures each become a LookupFailedError carrying the tool results, the handling and answerStepReason, failedOutput gives errorCode 'answer-step:<reason>', the failure survives executePlan, does not take the short-circuit and reaches the answer-step failure with the same reason and the report, with no second synthesis attempt`, `runAggregator with the absent-input section counted in every part and every combine call`, `a HandlingBudgetError, an every-part-failed ShaperAnswerStepFailedError and a plain aggregator Error from the root runAggregator through the real aggregator, the real walker and the orchestrator: classifyError keeps the original as the cause, executeLeafTask (real signature, returning TaskExecutionRecord) keeps failureData in the failed-task record, the record is written and read back through the real store (JSON), and the run failure has the code 'executor-aggregator-failed' with the data in RunFailure.data; for the typed errors found.results is [] and upstream holds the actual upstream values with their taskId, template and params, which are compared with the inputs the aggregator was given at every stage; the original cause's message is checked for the plain error, and the report names the uncovered parts`, `a nested plan whose aggregate fails while the root aggregate succeeds from sibling outputs: executePlannerTask returns the failed planner record with its kept childResult, collectPlanSources reads the child and adds the nested sources, concludeRun merges the nested handling, and the run is incomplete and names the nested failure with no run failure raised`, `collectPlanSources and concludeRun with a root and a nested aggregate that each have uncovered parts: the run is incomplete, the handling is merged and the visible head shows the handling line`, `the driver passes HandlingBudgetError through; the daemon's mapping in analyze-rpc and the plan tree's mapping in the orchestrator driver both return its results and report, tested through those mappings and not only through the driver`, `step tool through the real handler: prepareAnswerTurn creates the initial progress (plan with shared blocks, decision, budgets; 'single' or 'partitioned') and a state without progress is read as single pass; finalizeSynthesize with a saved and with a session-memory execution, with and without progress, the progress overload deciding from the stored plan whether another part remains and returning the HandlingReport; emit_part and emit_combine turns, each carrying the shared context for an adherence request; replies through the registered bundle argument; progress persisted with token replacement; an invalid reply re-emits the current turn with a new token and a retry note, and the client can continue; repeated invalid replies across separate calls reach the retry bound; retries reset when a turn advances; progress released on terminal success and failure; a typed failure returned as StepOutputError with data`, `the legacy emit_bundle turn still passes for an input that fits`
  - Fixtures: `step tool state fixtures including one from before the change`, `a plan tree with a nested plan whose aggregate task fails and one whose aggregate task records have handling`, `an adherence plan whose rule outputs and code-site outputs are in different directories`, `stubs for the Vibe, Claude and Codex child processes`
- **integration** — Prove the accepted exception of Story s7 is closed by a run, not only by a direct call to the aggregator
  - Subjects: `a broad docs analysis run through the real docs aggregate runtime and the plan walk, with an oversized terminal input and a nested aggregate: the run completes, the final report is delivered, and its head states the handling and the completeness`
  - Fixtures: `a docs plan tree with oversized upstream outputs, a scripted provider, a lowered window`
- **live** — Reproduce the actual failure of 2026-10-08 with real run-context construction, planning and the real provider limit
  - Subjects: `the broad docs request on this repository that previously stopped at the aggregate step runs to a final report, and the recorded run (run id, handling line, parts, completeness) is kept as the regression record`
  - Fixtures: `a registered and indexed repository, a configured provider, INSRC_LIVE_TESTS=1`
- **contract** — Prove the shape other Stories consume
  - Subjects: `HandlingReport against the sc4 sketch plus the additive fields, with and without trigger, budgets in their own units`, `the bundle schema keeps its open handling object valid and AnswerReport.handling is typed`, `the registered MCP bundle argument is unchanged`, `RunFailure's shape and the code 'executor-aggregator-failed' are unchanged`, `TaskExecutionRecord gains only the optional data field, LookupFailedError only the optional handling and answerStepReason, and ShaperAnswerStepFailedError only the optional upstream field`, `AggregateFailureData and the added optional fields (TaskExecutionRecord.data, LookupFailedError.handling and answerStepReason, ShaperAnswerStepFailedError.upstream) are JSON-safe and additive`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handling-table.test.ts: every size on every path takes the table, the free-form final emit included, and the admission rule divides what the table would not`, `handling-admission.test.ts: the checked-in local configuration (10,240 bytes single pass, 22,528 part and combine), the real prompt sizes, exact-boundary, multi-byte, CLI characters, repair-loop and unknown-limit cases`, `synthesize-handling.test.ts: single pass versus divided decision for the lookup path and the free-form lookup`, `part-output-cap.test.ts: the Ollama request carries num_predict 8,192 for part and combine calls and the configured tokens for a single pass; a CLI provider is given no enforced output cap` |
| `ac2` | `partition-combine.test.ts: every part is reasoned over serially and evidence and findings are kept exactly through several combine stages`, `partition-combine.test.ts: the combine terminates and a combine failure returns the per-part results`, `shared-context.test.ts: an adherence request with the rule and the code sites forced into separate parts has the rule in every part and every combine call and every site classified, none dropped (semantic coverage, not only concatenation)` |
| `ac3` | `handling-report.test.ts: parts, budgets in their units and notCovered with plan-qualified ids appear in the answer report and in the rendered head`, `run-handling-report.test.ts: a root and a nested aggregate with uncovered parts make the run incomplete and the visible head shows the handling line`, `synthesize-driver-handling.test.ts: through the real context driver, the delivered bundle's report carries the handling, the uncovered parts and complete false on the ordinary path` |
| `ac4` | `synthesize-handling.test.ts: a small size whose input is admitted makes the same single call`, `freeform-handling.test.ts: a small conversation that fits returns directly`, `handling-admission.test.ts: a local code or adherence request on the checked-in configuration is handled in parts with trigger 'fit' and states its parts (the departure from ac4's wording accepted on 2026-11-08)` |
| `ac5` | `partition-combine.test.ts: a failed part is kept out, the others are kept, completeness is false, repair exhaustion never discards a successful part, and all parts failing follows the terminal precedence rule with failures classified by cause`, `step-tool-parts.test.ts: the retry bound marks a part not covered across separate calls`, `freeform-handling.test.ts: all three typed failures keep the tool results, the handling and their reason through executePlan`, `answer-failure-mapping.test.ts: HandlingBudgetError carries results and report through the daemon and plan tree mappings`, `aggregate-failure.test.ts: the real aggregator, walker, stored task record and orchestrator keep the root aggregate failure's data and original cause, typed or plain, in RunFailure.data, and for the typed errors the actual upstream values and producer identities (taskId, template, params) survive`, `nested-aggregate-failure.test.ts: a failed nested aggregate under a succeeding root aggregate makes the run incomplete and names it`, `provider-failure-kinds.test.ts: malformed replies through the real Ollama, Vibe, Codex and Claude adapters give 'invalid-answer' and transport failures give 'model-failed'`, `synthesize-driver-handling.test.ts: a failed part and the combine fallback on the ordinary path are named in the delivered report`, `model-failure.test.ts: isModelCallFailure recognises 'vibe exited with' with and without the retry prefix; classifyError gives the 'aggregator-llm-unavailable:' prefix for a Vibe exit; provider-failure-kinds.test.ts covers a non-size Vibe exit giving 'model-failed' and a Vibe malformed reply giving 'invalid-answer'`, `shared-context.test.ts: a rule too large to accompany every part gives HandlingBudgetError naming the shared context, not a silently reduced answer` |
| `ac6` | `partition-combine.test.ts: one block larger than the room is read in consecutive sections with none dropped, the 6,000 over 5,000 case and the emoji boundary case included` |
| `ac7` | `docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker and delivers a final report with its handling`, `aggregator-handling.test.ts: the aggregator divides an oversized input and keeps the absent-input section in every call`, `docs-broad-live.test.ts: the recorded live run of the broad docs request returns a final report` |

## 8. Migration

**State before:** synthesize and runAggregator render the whole of their inputs into one prompt and make one model call with no size check (src/analyze/context/synthesizer.ts:117-169, src/analyze/runtimes/shared/aggregator.ts:100-155). Structured calls retry inside the provider with an uncapped repair note appended after the caller's measurement, and maxAttempts alone does not stop CliProvider's Vibe path (src/agent/providers/structured-output.ts:150-215, src/shared/types.ts:263). finalizeSynthesize(raw, execution?) is called by the bundle handler with the execution and its result assigned to the bundle layers (src/analyze/context/synthesizer.ts:191-225, src/daemon/steps/analyze-step/phases/bundle.ts:90). The free-form lookup's final emit takes the whole conversation and the request's size is not passed to it, a non-ConnectionExecutionError from it becomes a failed lookup that keeps data only for a LookupFailedError, and the short-circuit copies only the seven layers (src/analyze/explore/freeform-probe.ts:150-200, src/analyze/explore/executor.ts:690-715, src/analyze/context/driver.ts:1004-1044, 1640-1690). The daemon and the plan tree map ShaperAnswerStepFailedError with its results and report (src/daemon/analyze-rpc.ts:1046, src/analyze/orchestrator/driver.ts:810), but ShaperAnswerStepFailedError.found is AnswerStepFound, whose results are lookup results and cannot hold the aggregator's UpstreamOutput records (src/analyze/context/driver.ts:1364-1367, src/analyze/executor/types.ts:56-61); runAggregator's classifyError builds a fresh prefixed Error with no cause (so the original is gone before anything else sees it), executeLeafTask returns a TaskExecutionRecord for a failed aggregate task that holds only the message, task and run records are written with JSON.stringify (an Error object becomes {}), and the run failure 'executor-aggregator-failed' is built from it, and a failed nested plan is unreachable from collectPlanSources because it checks failure status before recursing (src/analyze/executor/walker.ts:205-275, 338-390, src/analyze/executor/plan-sources.ts:43-92, src/analyze/executor/types.ts:184-205, src/analyze/orchestrator/driver.ts:515-530). AnswerReport.handling is typed unknown (src/analyze/completeness.ts:206), mergeAnswerReports is binary with a prefix, renderReportHead shows no handling (src/analyze/completeness.ts:377-420). The step tool keeps no progress, and a bad reply returns a retryable error without a new token (src/daemon/steps/analyze-step/phases/bundle.ts:90). On the ordinary lookup path the driver derives found.report before synthesizing and the stamp callback sets the delivered bundle's report from it, so nothing synthesis produces reaches the report (src/analyze/context/driver.ts:577, 1476, 1664, 1715). OllamaProvider enforces maxTokens as num_predict, while CliProvider ignores completion options (src/agent/providers/ollama.ts:673, src/agent/providers/cli-provider.ts:707-721). The wording list isModelCallFailure matches (CLI_FAILURE_TEXTS in src/analyze/context/model-failure.ts) names Claude and Codex but not Vibe, although cli-provider.ts builds every CLI exit as `${cli} exited with ${code}.` and completeStructuredVibe wraps it in the retry prefix, so a Vibe outage is classified as an invalid answer (src/analyze/context/model-failure.ts:25-90, src/agent/providers/cli-provider.ts:1068-1095). The adherence prompt classifies each code site against the rule text from doc.constraint.enumerate or doc.decision.trace and drops a site it cannot classify, so a part that holds code sites without the rule cannot do its job (src/prompts/analyze/synthesize.adherence.system.md).

**State after:** The four callers use one shared helper that divides when the HLD's table says so or when the rendered input is not admitted by a provable bound, in characters for a CLI provider and in UTF-8 bytes for a local model, applied before every attempt. A single pass keeps the configured output tokens (10,240 bytes of input with the checked-in configuration); part and combine calls on a local model use PART_MAX_OUTPUT_TOKENS 8,192, which OllamaProvider enforces as num_predict (22,528 bytes), so every existing prompt plus the minimum room fits; a CLI provider is given no enforced output cap and needs none, because a part reply never enters a later call. On the checked-in local configuration code and adherence requests are therefore always handled in parts, a departure from the wording of ac4 accepted by the user on 2026-11-08. Evidence that other evidence is judged against (the rule text of an adherence request) is shared context: it is rendered in every part and every combine call, never sectioned, counted in the admission, and a HandlingBudgetError names it when it cannot fit. The helper owns the repair loop and calls the provider with maxAttempts 1 and internalRetry false, so no provider retries. Sections never split a code point. Evidence and findings are assembled in code, a staged combine writes only the summary and always ends, a failed part or combine is named while the other results are kept, a repair that cannot be admitted ends as a not-covered part and never discards a successful one, each part failure is classified by cause (call-failed, invalid-reply, unadmittable) with a Vibe non-zero exit recognised as call-failed, and when no part is covered the terminal failure follows one precedence rule (budget error only when all uncovered parts are unadmittable, else 'model-failed' if any part is call-failed, else 'invalid-answer'). finalizeSynthesize has two overloads: the bundle return for a call without progress, FinalizedAnswerTurn for a call with it. The request size reaches the free-form final emit, and every ShaperAnswerStepFailedError from it is carried through the executor with its data and its reason (answerStepReason, errorCode 'answer-step:<reason>'). On the ordinary lookup path the driver applies the handling to found.report (applyHandling) so the delivered bundle's report carries the handling, the uncovered parts and complete=false. An aggregator's typed failure sets found.results to [] and carries its actual inputs in the new optional upstream field (taskId, template, params, value). Any aggregate failure, typed or plain, keeps its data in TaskExecutionRecord.data and RunFailure.data as a JSON-safe value built by failureData, with the original error kept as the cause by classifyError, a failed nested aggregate is read through the kept child result and merged even when the root aggregate succeeded, and the handling, with budgets in their own units, reaches the delivered answer on every path and is shown by renderReportHead. The step tool creates an initial AnswerProgress holding the plan (with the shared blocks), the decision and the budgets, persists it on every transition and re-emits the current turn with a new token after an invalid reply.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add HandlingReport (budgets, optional trigger), parseHandling, mergeHandling, applyHandling, HANDLING_TABLE, PART_MAX_OUTPUT_TOKENS (local model only) and the admission rule with the single-pass decision only; nothing divides yet — ↩ rollbackable
2. Type AnswerReport.handling, merge handling in mergeAnswerReports with its unchanged signature, and render the handling line in renderReportHead — ↩ rollbackable
3. Add HandlingBudgetError as a ShaperAnswerStepFailedError with the additive reason, add the optional upstream field to ShaperAnswerStepFailedError, and pass the error through the driver — ↩ rollbackable
4. Add 'vibe exited with' to CLI_FAILURE_TEXTS in model-failure.ts, then add the helper's own repair loop (maxAttempts 1 and internalRetry false, capped repair note, admission before every attempt), failure classification by cause with size refusals divided before classification, code-point-safe division, the shared context table and selectSharedContext (rendered in every part and combine call and counted in the admission), assembly adapters, the terminal precedence rule and the staged combine with the per-part fallback, and move synthesize (through synthesizeHandled, with synthesize kept as a wrapper) and runAggregator onto them so a small admitted request is unchanged — ↩ rollbackable
5. In the context driver call synthesizeHandled, apply the handling to found.report with applyHandling and return the updated found in the 'bundle' outcome, so settlePipelineOutcome stamps the updated report on the delivered bundle — ↩ rollbackable
6. Pass the request size through the tool loop to runFinalStructuredEmit, move the free-form final emit onto the helper, add the handling callback and field, make the free-form lookup carry every ShaperAnswerStepFailedError as a LookupFailedError with its data, handling and answerStepReason, have failedOutput copy the reason as errorCode 'answer-step:<reason>', and copy the handling in extractSoleFreeformResult onto the derived report — ↩ rollbackable
7. Make classifyError keep the original error as the cause, make the aggregator's typed failures carry found.results [] and the upstream inputs, keep any aggregate failure's data as failureData (JSON-safe, upstream included) in the optional data field of TaskExecutionRecord in executeLeafTask and copy it into RunFailure.data in the orchestrator; make collectPlanSources read the kept child result of a failed planner task and each plan's aggregate handling, and concludeRun merge nested handling even when the root aggregate succeeded — ↩ rollbackable
8. Add the optional AnswerProgress (plan with shared blocks, decision, budgets, parts) to the step state, startAnswerProgress in prepareAnswerTurn, the progress overload of finalizeSynthesize beside the unchanged bundle overload, the emit_part and emit_combine outputs and the retry field, persisting progress on every transition — ↩ rollbackable

**Backward compat:** All new state and report fields are optional or additive, and the one addition to an existing union value (partitionedBy 'mixed') is on a contract this Story owns; the added failure reason is additive on a class Story s1 declares, and so is the optional upstream field on the same class (absent on the lookup path, so the daemon's and the plan tree's mappings, which read found, need no change); TaskExecutionRecord gains an optional JSON-safe data field, runAggregator's thrown Error keeps its prefix and message and gains a cause, synthesize keeps its signature as a wrapper over the new synthesizeHandled, LookupFailedError gains optional handling and answerStepReason, and RunFailure already has an optional data, with the code 'executor-aggregator-failed' unchanged. finalizeSynthesize keeps raw and execution in their positions and its first overload keeps the bundle return type, so the bundle handler's existing call and assignment compile and behave as before. completeStructured keeps its retry behaviour for every other caller; only the handling helper passes maxAttempts 1 with internalRetry false. executePlannerTask is not changed. A step state written before the change lacks the progress and is read as single pass. A stored bundle with an open handling object stays valid and a malformed value is read as absent; a handling record without a trigger is valid. A report without handling renders the same head. A Vibe non-zero exit in the aggregator now takes the 'aggregator-llm-unavailable:' prefix instead of 'aggregator-schema-unrecoverable:' because isModelCallFailure recognises it (a deliberate behaviour change; the message after the prefix is unchanged, and Claude and Codex exits are unchanged). The shared context changes an adherence request's parts: the rule outputs are no longer partition blocks but appear in every part. A request of size XS or S whose input is admitted makes the same calls as before; the one behaviour change, local code and adherence requests on the checked-in configuration being handled in parts, is the accepted departure from ac4's wording. synthesize, runAggregator, runFinalStructuredEmit, mergeAnswerReports, collectPlanSources, concludeRun and renderReportHead keep their signatures with new parameters optional. The registered MCP bundle argument is unchanged and the legacy emit_bundle turn is kept.

## 9. Alternatives considered

### 9.1 a1: Size table plus an enforced input-admission rule with per-call output caps, in one shared helper that owns the repair loop, with shared context for dependent parts, cause-classified failures, carried-data failures and a rendered handling line — **CHOSEN**

One helper divides an answer-writing call's input when the HLD's size table says so or when the rendered input is not admitted by a provable bound, repeats the evidence that dependent parts need in every part, gives part and combine calls on a local model a lower stated output cap, owns the schema-repair loop with provider retries off, classifies every failure by cause, and carries the handling report and any failure's reason, inputs and data to the delivered answer on every path.

(1) Decision: partition when EITHER the measured size (sc3) is M, L or XL (undetermined is XL), OR the rendered input is not admitted. (2) Admission in two units never mixed. CLI provider: declared inputBudgetChars minus a 16,000-character reserve (characters); no output cap is enforced or needed for a CLI provider, because the CLI adapters do not enforce maxTokens (modelArgs ignores the completion options, Vibe forwards no limit) and a part reply's size never enters a later model call: the combine reads only the part summaries, capped at 2,000 characters by the schema, and the evidence layers are assembled in code from the replies into the delivered answer. Local model: the UTF-8 byte length must not exceed window tokens minus the call's output tokens minus 2,048 (bytes), because every token covers at least one byte. A single-pass call keeps the full configured output tokens (no truncation knob): with the checked-in configuration 32,768 - 20,480 - 2,048 = 10,240 bytes, and since the existing prompts alone are 10,652 (code), 11,040 (adherence) and 6,324 (docs) bytes, a local code or adherence request is never admitted single-pass and is handled in parts (trigger 'fit'); a docs request is admitted only if its evidence fits in 3,916 bytes. Part and combine calls on a local model use a stated lower output cap PART_MAX_OUTPUT_TOKENS = 8,192, enforced by OllamaProvider as num_predict: 32,768 - 8,192 - 2,048 = 22,528 bytes, which holds the largest prompt (11,040) plus the 4,000-byte minimum room (15,040) and leaves 7,488 spare. A part reply cut at 8,192 tokens ends mid-JSON, fails validation and is handled as an invalid reply by the repair and division rules. This departs from the wording of ac4 for local code and adherence requests, which the user accepted on 2026-11-08 under accuracy over cost; ac4 still guarantees that a small request whose input is admitted is returned whole. (3) The helper owns the repair loop with {maxAttempts: 1, internalRetry: false}, a repair note capped at 8,000 characters, and admission before every attempt; tests run the real adapters. (4) Failures are classified by cause when they happen: each part records a failure kind. A size refusal (InputTooLargeError, a CliExitError subclass) is handled by the division rule before classification and is never 'call-failed'. 'call-failed' is isModelCallFailure(err) from src/analyze/context/model-failure.ts, extended by one entry: 'vibe exited with' is added to CLI_FAILURE_TEXTS beside the Claude and Codex wordings, because cli-provider.ts builds every CLI non-zero exit as `${cli} exited with ${code}.` and completeStructuredVibe wraps it in the retry prefix, which isModelCallFailure strips; without the entry an all-parts Vibe outage would be classified 'invalid-answer'. The list is the single source also used by runAggregator's classifyError, so a Vibe exit moves from the 'aggregator-schema-unrecoverable:' prefix to the correct 'aggregator-llm-unavailable:' prefix, a deliberate behaviour change. 'invalid-reply' is ModelResponseShapeError, SynthesizerSchemaUnrecoverable or any other validation failure thrown by completeStructured (which the Ollama, Vibe and Codex adapters throw for a schema-invalid reply); 'unadmittable' is a rendered input that is not admitted. Terminal precedence when no part is covered: HandlingBudgetError only when every uncovered part is unadmittable; otherwise ShaperAnswerStepFailedError with 'model-failed' if any part is 'call-failed', else 'invalid-answer', with every part's own reason in notCovered. (5) Division by directory then file, sections the largest whole code-point prefix that fits the room, a room under 4,000 refused, ordinals separate from keys, part summaries capped at 2,000 characters, evidence and findings assembled in code, a staged combine of N into ceil(N/g). Shared context: a SHARED_CONTEXT table keyed by synthesize target names the evidence that other evidence is judged against; for 'adherence' it is the outputs of doc.constraint.enumerate and doc.decision.trace (the rule text, verbatim, with its citations), because the adherence prompt classifies each code site against that rule and drops a site it cannot classify; for code, docs, data, infra and capability it is empty because their parts are independent. selectSharedContext(target, executed) returns the shared blocks; they are removed from the partition blocks, rendered in every part and every combine call like the absent-input section, never sectioned, and counted in the fixed context of the admission rule; the 'Rule sources retrieved' count and the rule restatement are computed in code from them, not taken from part replies. If shared context plus the fixed prompt plus the 4,000-unit minimum room is not admitted, the helper throws HandlingBudgetError naming the shared context and the configuration, since a part cannot be classified against a rule it cannot see and the evidence is never summarised down. One repair-exhaustion rule: an unadmitted repair divides the part up to three times, then the part is recorded as not covered. A combine failure or unadmitted combine with a covered part returns the per-part results with 'combine' in notCovered. (6) Ordinary synthesis success transition: synthesizeHandled(args) returns { layers, handling } and synthesize(args) stays as a wrapper returning the layers; applyHandling(report, handling) in completeness.ts sets report.handling by mergeHandling, adds one incomplete source note per not-covered part and sets complete false when a part is not covered; the context driver builds found' with that report and returns it in the 'bundle' outcome, so settlePipelineOutcome hands the updated report to the stamp callback that sets the delivered bundle's report. (7) Callers and failure routes: LookupFailedError carries partial, handling and the original reason (answerStepReason); failedOutput copies the reason as errorCode 'answer-step:<reason>' and keeps the cause, and the pipeline rebuilds the ShaperAnswerStepFailedError from reason and found. ShaperAnswerStepFailedError.found is AnswerStepFound, whose results are lookup results and cannot hold the aggregator's inputs, so the error gains one optional readonly field upstream: readonly AggregateInputRecord[] (additive, absent on the lookup path), AggregateInputRecord being { taskId, template, params, value } as in UpstreamOutput; an aggregator failure (HandlingBudgetError and the every-part-failed error) sets found.results to [] because no lookup ran, builds found.report from the failure alone with the helper the lookup path uses for an empty result list, and sets upstream to the upstream outputs it was given, so nothing is invented and nothing is dropped. runAggregator's classifyError keeps the original error as the cause of the prefixed Error (prefixes unchanged) and leaves a typed answer-step error unwrapped. executeLeafTask(task: PlannedTask, intent, runId, outputs: ReadonlyMap<string, readonly UpstreamOutput[]>, absentInputs?, execution?): Promise<TaskExecutionRecord> keeps failure data for any aggregate failure in the optional data field of TaskExecutionRecord as a JSON-safe value built by failureData(err): { kind:'answer-step', reason, found, upstream, handling } for a typed error, { kind:'error', name, message, cause? } for a plain Error with the cause nested at most 3 levels and no Error objects or functions, because records are written with JSON.stringify; upstream holds plain task outputs that are already stored in task records, and keeps taskId, template and params with each value; the orchestrator puts the data in RunFailure.data under 'executor-aggregator-failed'. For a failed nested plan, collectPlanSources reads the kept child records and concludeRun merges nested handling even when the root aggregate succeeded. (8) Reporting: HandlingReport with budgets in their own units, optional trigger, mergeHandling, parseHandling, renderReportHead line. (9) Step tool: AnswerProgress carries the partition plan (blocks with ordinals and section cuts, and the shared blocks), the handling decision (mode and trigger) and the measured budgets as well as the completed parts, the cursor, stage outputs, failures and retries, so the progress overload of finalizeSynthesize can decide whether another part remains and return the HandlingReport; startAnswerProgress creates it; an invalid reply re-emits the turn with a new token and a retry note.

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
