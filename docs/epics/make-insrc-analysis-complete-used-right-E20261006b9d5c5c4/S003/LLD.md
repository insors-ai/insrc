<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story adds one shared helper that measures the single rendered input of an answer-writing model call against a stated character budget and, when it is over, divides the evidence into ordered parts, reasons over each part serially, assembles evidence and findings in code and lets the model write only a bounded summary through a staged combine that always ends. Four callers use it: the lookup synthesis, the free-form short-circuit's final emit, the plan-tree aggregator and the step tool's answer turn. The handling report is typed, carried to the run's answer report (including the aggregate's, which today never reaches it), and a failed part or a failed combine is reported without losing the other parts' results.

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
- `args: SynthesizeArgs` — Existing arguments, plus the optional onHandling callback that receives the HandlingReport.

**Returns:** `Promise<Omit<AnalyzeContextBundle, 'meta'>>` — The bundle; within budget it is the one call made today, over budget the assembled bundle of the parts.

**Errors:**
- `HandlingBudgetError` when The fixed context leaves no room for the minimum section, or every part failed; carries the lookup results and the report.
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
- `progress: AnswerProgress` _(optional)_ — What the in-session model has done so far; absent on the first call.

**Returns:** `SynthesizePrepared` — The existing prompt, user turn and schema for the next turn, now with a turn field naming 'answer', 'part' or 'combine' and its identity.

**Errors:**
- `SynthesizerPromptMissingError` when Existing: no prompt for the key.
- `HandlingBudgetError` when As for synthesize.

**Preconditions:**
- progress comes from the stored step state

**Postconditions:**
- The rendered input of the turn is within the budget

### 2.3 `finalizeSynthesize`

```typescript
finalizeSynthesize(raw: unknown, progress?: AnswerProgress): FinalizedAnswerTurn
```

**Parameters:**
- `raw: unknown` — The JSON the in-session model emitted for the current turn, validated against that turn's schema.
- `progress: AnswerProgress` _(optional)_ — The progress the turn was prepared with.

**Returns:** `FinalizedAnswerTurn` — Either the final bundle, or the next progress to persist.

**Errors:**
- `SynthesizerSchemaUnrecoverable` when Existing: the reply fails the schema; the caller counts it in progress.retries.

**Postconditions:**
- Evidence layers are assembled in code and never taken from a combine reply

### 2.4 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — Existing arguments: upstream outputs and absent inputs.

**Returns:** `Promise<AggregateReport>` — The report; metadata gains the optional handling field.

**Errors:**
- `HandlingBudgetError` when As for synthesize.
- `Error with the existing aggregator prefixes` when A single call or the combine fails with no part results to return.

**Preconditions:**
- The absent-input section is rendered in every part and every combine call and counted in the measure

**Postconditions:**
- Findings of covered parts are concatenated in code by ordinal; the model writes only the summary

### 2.5 `runFinalStructuredEmit`

```typescript
runFinalStructuredEmit(provider: LLMProvider, messages: LLMMessage[], structuredOutputRetries: number, maxOutputTokens: number, onTrace?: (event: ShaperTraceEvent) => void, execution?: ConnectionExecutionContext): Promise<AnalyzeContextBundle>
```

**Parameters:**
- `messages: LLMMessage[]` — The tool-loop conversation. Over budget, its tool-result messages are the blocks the helper divides.
- `provider: LLMProvider` — Existing; its inputBudgetChars feeds the budget.
- `structuredOutputRetries: number` — Existing.
- `maxOutputTokens: number` — Existing; also the output reserve for a local model.
- `onTrace: (event: ShaperTraceEvent) => void` _(optional)_ — Existing.
- `execution: ConnectionExecutionContext` _(optional)_ — Existing.

**Returns:** `Promise<AnalyzeContextBundle>` — The bundle the free-form short-circuit returns directly when the conversation fits, or the assembled bundle when it does not.

**Errors:**
- `HandlingBudgetError` when As for synthesize.

**Postconditions:**
- A conversation within budget makes the one call made today

### 2.6 `collectPlanSources`

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

### 2.7 `concludeRun`

```typescript
concludeRun(tree: PlanTreeNode, executed: ExecutorResult, contextReport: AnswerReport | undefined, measure?: RequestMeasure): { report: AnswerReport; finalReport: unknown }
```

**Parameters:**
- `tree: PlanTreeNode` — Existing.
- `executed: ExecutorResult` — Existing.
- `contextReport: AnswerReport | undefined` — Existing: the run context's report.
- `measure: RequestMeasure` _(optional)_ — Existing.

**Returns:** `{ report: AnswerReport; finalReport: unknown }` — The report now carries handling merged from the run context and from the root and nested aggregates.

**Postconditions:**
- A partially failed aggregation makes the run's completeness false

### 2.8 `mergeAnswerReports`

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

## 3. Data model changes

### 3.1 `HandlingReport` — new

The sc4 contract typed. method, parts, partitionedBy, notCovered[{part, reason}] as sketched, plus additive fields: combineStages, inputChars, budgetChars, budgetSource ('provider' | 'context-window' | 'default'). partitionedBy gains 'mixed' for a merged report whose sources used different divisions. Counting: parts is the number of first-level parts including failed ones; a single pass has parts 1 and method 'single-pass'. A part id is its ordinal and heading, e.g. 'part 3: docs/a'; mergeHandling qualifies it with the plan path ('t03.t05 / part 3: docs/a'), so equal local ordinals in different plans stay distinct. Merged inputChars is the maximum, budgetChars the minimum, combineStages the sum.

```
readonly combineStages?: number | undefined; readonly inputChars: number; readonly budgetChars: number; readonly budgetSource: 'provider' | 'context-window' | 'default'; partitionedBy adds 'mixed'
```

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/context/schema.ts:194`

### 3.2 `AnswerReport.handling` — field-modify

Type changes from unknown to HandlingReport | undefined. Current-behaviour invariant it might break: the bundle schema declares handling as an open object (src/analyze/context/schema.ts:194), and isAnswerReport does not validate it, so a stored value such as {} is valid today. A read-boundary guard parseHandling(value: unknown): HandlingReport | undefined accepts only a value with the required fields and treats anything else as absent; the merger, the renderer and isAnswerReport use it, and a stored {} is read as no handling, never as a report.

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/completeness.ts:404-420`
- `src/analyze/context/schema.ts:194`

### 3.3 `answerInputBudget` — new

answerInputBudget(provider?: LLMProvider, outputTokens?: number) returns {chars, source}. The budget is provider.inputBudgetChars when declared (source 'provider'); else for a local model (context window tokens minus outputTokens) times 3 characters per token (source 'context-window', the window being the figure ollamaContextWindow gives num_ctx); else 80,000 characters (source 'default'; also what the step tool uses, which has no provider). A reserve of 4,000 characters for message framing, the schema text and schema-repair retries is subtracted. The decision is single-pass when the rendered input (messages, repeated context, absent-input section) is at most the budget, and partitioned only when it is over. The truncation of a local model below its window cannot be detected through completeStructured, which returns parsed content only; the protection is the ratio and the reserve, and the HandlingReport records the budget so the limit is visible.

**Call sites:**
- `src/shared/types.ts:199-203`
- `src/analyze/context/shaper-provider.ts:205-250`
- `src/agent/providers/ollama.ts:571-605`

### 3.4 `PartPlan, PartResult and the caller adapters` — new

A PartPlan is the ordered blocks of the evidence with an ordinal separate from the block key, grouped by directory then file in stable order; one block larger than the room is cut into consecutive sections of at least 4,000 characters and its sections keep its key and an index. A PartResult holds the part's heading, its summary (capped at 2,000 characters, enforced by the schema), and the part's assembled content. Two adapters map a PartResult onto a final output without a model: the bundle adapter takes system, focus and summary from the final combine and concatenates structure, surface, artefacts and upstream of the covered parts by ordinal under part headings; the aggregate adapter takes the summary from the final combine and concatenates the findings of the covered parts by ordinal, each finding keeping its sources. A combine reply is never read for evidence or findings. Combine stages: the summaries are grouped so that fixed context plus the group fits, giving g of at least 2, and each stage turns N summaries into ceil(N/g); if fixed context plus two capped summaries does not fit, HandlingBudgetError is raised.

**Call sites:**
- `src/analyze/context/synthesizer.ts:117-169`
- `src/analyze/runtimes/shared/aggregator.ts:100-155`
- `src/analyze/runtimes/shared/aggregate-types.ts:28-80`

### 3.5 `HandlingBudgetError` — new

A typed error for the case where the fixed context leaves no room for the minimum section, a stage cannot shrink, or every part failed. It carries the lookup results and the report with every part named in notCovered, and is passed through the driver and the step tool as the answer-step failure declared by Story s1 rather than mapped to 'answer-invalid'.

**Call sites:**
- `src/analyze/context/driver.ts:1668-1690`
- `src/daemon/steps/analyze-step/handler.ts:118`

### 3.6 `AnswerProgress and StepStatePayload` — field-add

AnswerProgress is {completed: PartResult[] by ordinal, pending: {kind 'part' | 'combine', ordinal or stage and group index}, stageOutputs: summaries of the current combine stage, failures: {part, reason}[], retries: number}. It is held in the step state beside the stages awaiting_part and awaiting_combine, passed to prepareSynthesize and finalizeSynthesize, and persisted by re-encoding the state token on every valid transition; an invalid reply for a part or combine turn increments retries and re-encodes the state, and at the bound (the structured-output retry setting) the part is recorded as failed or the combine as failed, and the flow continues. Terminal success and terminal failure release the progress.

**Call sites:**
- `src/daemon/steps/analyze-step/phases/bundle.ts:90`
- `src/daemon/steps/analyze-step/types.ts:56-157`

### 3.7 `StepOutputEmitPart and StepOutputEmitCombine` — new

Two outputs added to the StepOutput union beside StepOutputEmitBundle, with the same fields (guidance, prompt, userTurn, schema, state) plus the part ordinal and the total, or the stage and group. A reply to either reuses the registered bundle argument of seven string layers (a part reply is a seven-layer bundle of that part with its summary within the cap; a combine reply fills system, focus and summary, and the four evidence layers, which the adapter ignores, as empty strings), so the registered MCP schema and StepInputBundle are unchanged and the legacy emit_bundle turn is kept for an input that fits. A typed answer failure is returned as StepOutputError with the code declared by Story s1 and its data, not as an uncaught exception.

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
| `sc4` | implements | Types HandlingReport with additive fields (combineStages, inputChars, budgetChars, budgetSource, and 'mixed' for partitionedBy) and fills it on every answer of both paths. |
| `sc2` | consumes | Fills AnswerReport.handling; keeps the binary mergeAnswerReports(first, second, prefix) and its prefix rule; uncovered parts add source notes and make completeness false. |
| `sc1` | consumes | A result whose part or combine failed is incomplete; the plan-task completeness records are read as today and the aggregate's handling is added as sources. |
| `sc3` | consumes | measure.characters stays a hint; the decision is made on the single rendered input, which also counts the context the measure does not. |
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
  - Response: The output is built from the per-part results unchanged by the adapter, its summary layer being the part summaries concatenated by ordinal, and the failure is added to notCovered as 'combine'; nothing is thrown
  - User impact: The per-part results are returned with the combine failure reported
- **A combine stage cannot shrink its input** (recoverable)
  - Detection: The helper checks before a stage that fixed context plus two capped summaries fits the budget, and after a stage that the count of summaries fell
  - Response: If the check before fails, HandlingBudgetError is raised; if the count did not fall, the stage is treated as a combine failure and the per-part fallback applies
  - User impact: The combine always ends
- **The fixed context alone, or one minimum section with it, exceeds the budget** (terminal)
  - Detection: Fixed rendered characters plus the minimum section of 4,000 characters is more than the budget
  - Response: HandlingBudgetError with the results and the report; dividing the evidence cannot make the call fit, so no partial answer is written
  - User impact: A typed failure that says the context is larger than the model accepts
- **The provider refuses a part as too large** (recoverable)
  - Detection: InputTooLargeError from the provider, whose sizes may be undefined
  - Response: The part is cut into smaller consecutive sections up to three times, and then recorded as not covered
  - User impact: The part is read in full or named; nothing is silently cut
- **A local model truncates its input silently below its declared window** (terminal)
  - Detection: Not detectable: completeStructured returns parsed content only and the local model's processed-token count is not available to the caller and is cache-dependent
  - Response: Prevented, not detected: the budget uses 3 characters per token, subtracts the output tokens and a 4,000-character reserve, and the HandlingReport records the budget and its source
  - User impact: The limitation is stated; a window figure that is wrong is visible in the report
- **A typed answer failure is thrown from inside synthesize or the final emit** (terminal)
  - Detection: The driver's catch sees HandlingBudgetError or ShaperAnswerStepFailedError
  - Response: The driver passes it through unchanged instead of mapping it to 'answer-invalid', and the step tool returns it as StepOutputError with the declared code and its data
  - User impact: The caller receives the error with the lookup results and the report
- **A stored handling value is malformed** (recoverable)
  - Detection: parseHandling finds a missing required field or a wrong type, as for the stored {}
  - Response: The value is treated as absent by the merger, the renderer and isAnswerReport; it is not written back
  - User impact: An old record is read without handling instead of failing
- **The aggregate of a nested plan reports uncovered parts** (recoverable)
  - Detection: collectPlanSources reads parseHandling(metadata.handling) of that plan's aggregate task and finds a non-empty notCovered
  - Response: One source per uncovered part is added, named by the aggregate task's path and the part id, so the run is incomplete
  - User impact: A partly failed aggregation never produces a run labelled complete

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Rendered input exactly at the budget | Single pass; division starts only when the input is over the budget. |
| A model with no declared limit, and the step tool | The default of 80,000 characters is used and recorded with budgetSource 'default'. |
| A single block larger than the room | It is cut into consecutive sections with its key and an index; the whole content is read and the report says partitionedBy 'section'. |
| A request with no results and a fixed context within the budget | Single pass with parts 1; no division. |
| Two nested plans that both have a part 1 | mergeHandling qualifies each part id with its plan path, so the two stay distinct in notCovered. |
| Nested calls with different budgets or divisions | Merged inputChars is the maximum, budgetChars the minimum, combineStages the sum and partitionedBy 'mixed'. |
| A free-form conversation within the budget | The short-circuit returns the one call's bundle as today, with handling single-pass and parts 1. |
| A stored bundle with handling {} | It validates against the open schema and parseHandling reads it as absent. |
| The budget is lowered in a test | The same path divides a small input, so the behaviour is exercised without a large fixture. |
| A step state written before the change | It lacks progress and is read as a single-pass state. |

**Invariants to preserve**

- Model calls are made one after another, never in parallel, including part and combine calls [[c1]]
- An input within the budget makes the same single model call as today [[c1]]
- The free-form short-circuit returns the loop's bundle directly when the conversation fits, with no extra model pass [[c2]]
- The plan's aggregate task is not a source of its own completeness; only its handling is read [[c3]]
- mergeAnswerReports keeps its binary signature and its prefix rule for the run context's sources [[c3]]
- The step tool's registered bundle argument and legacy emit_bundle turn stay valid [[c5]]

## 7. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing analyze, orchestrator, executor and daemon step-tool suites`

**Test levels**

- **unit** — Prove the budget, division, assembly and combine rules without a model
  - Subjects: `answerInputBudget: provider budget, context window with the 3 characters per token ratio and output tokens, the 80,000 default, the 4,000 reserve, exact-boundary inputs (at the budget is single pass, one over is divided)`, `division by directory then file then consecutive sections, ordinals separate from keys, sections of one block kept in order with none dropped`, `unsplittable overhead: fixed context larger than the budget, no room for the 4,000-character minimum section, and a combine stage that cannot fit two capped summaries all raise HandlingBudgetError with results and report`, `combine terminates: N summaries become ceil(N/g) per stage, at most ceil(log2 N) stages, and a stage whose count does not fall is a combine failure`, `the bundle adapter and the aggregate adapter keep evidence layers and findings exactly, in order, through several combine stages`, `combine failure returns the per-part results with the failure in notCovered and throws nothing`, `parseHandling reads a stored {} and other malformed values as absent`, `mergeHandling: equal local part ordinals in two nested plans stay distinct by plan path; inputChars maximum, budgetChars minimum, combineStages sum, partitionedBy 'mixed'`, `mergeAnswerReports keeps its binary signature and prefix behaviour`
  - Fixtures: `a scripted provider that records each call, counts that no two overlap, and can fail a chosen part, the combine, or refuse an input as too large`, `a lowered budget so a small input divides`
- **integration** — Prove the four callers and the bridge into the run report end to end, through real modules and a scripted provider
  - Subjects: `synthesize: an input within the budget makes the one call of today; over the budget it divides, and a failed part is named`, `free-form short-circuit: a conversation within the budget returns the loop's bundle with handling single-pass; one over the budget is divided and combined`, `runAggregator with the absent-input section counted in every part and every combine call`, `collectPlanSources and concludeRun with a root and a nested aggregate that each have uncovered parts: the run is incomplete and the report's handling is merged`, `driver passes HandlingBudgetError and ShaperAnswerStepFailedError through without mapping them to 'answer-invalid'`, `step tool through the real handler: emit_part and emit_combine turns, replies submitted through the registered bundle argument, progress persisted with token replacement, repeated invalid replies across separate calls reaching the retry bound, progress released on terminal success and failure, a typed failure returned as StepOutputError with data, a state written before the change read as single pass`, `the legacy emit_bundle turn still passes for an input that fits`
  - Fixtures: `step tool state fixtures including one from before the change`, `a plan tree with a nested plan whose aggregate task records have handling`
- **integration** — Prove the accepted exception of Story s7 is closed by a run, not only by a direct call to the aggregator
  - Subjects: `a broad docs analysis run through the real docs aggregate runtime and the plan walk, with an oversized terminal input and a nested aggregate: the run completes, the final report is delivered, and its head states the handling and the completeness`
  - Fixtures: `a docs plan tree with oversized upstream outputs, a scripted provider, a lowered budget`
- **contract** — Prove the shape other Stories consume
  - Subjects: `HandlingReport against the sc4 sketch plus the additive fields`, `the bundle schema keeps its open handling object valid and AnswerReport.handling is typed`, `the registered MCP bundle argument is unchanged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handling-budget.test.ts: every size and both paths take the rendered-input rule, exact-boundary and unknown-limit cases`, `synthesize-handling.test.ts: single pass versus divided decision for the lookup path and the free-form short-circuit` |
| `ac2` | `partition-combine.test.ts: every part is reasoned over serially and evidence and findings are kept exactly through several combine stages`, `partition-combine.test.ts: the combine terminates and a combine failure returns the per-part results` |
| `ac3` | `handling-report.test.ts: parts and notCovered with plan-qualified ids appear in the answer report`, `run-handling-report.test.ts: a root and a nested aggregate with uncovered parts make the run incomplete` |
| `ac4` | `synthesize-handling.test.ts: an input within the budget makes the same single call`, `freeform-handling.test.ts: a conversation within the budget returns directly` |
| `ac5` | `partition-combine.test.ts: a failed part is kept out, the others are kept, completeness is false`, `step-tool-parts.test.ts: the retry bound marks a part not covered across separate calls` |
| `ac6` | `partition-combine.test.ts: one block larger than the room is read in consecutive sections with none dropped` |
| `ac7` | `docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker and delivers a final report with its handling`, `aggregator-handling.test.ts: the aggregator divides an oversized input and keeps the absent-input section in every call` |

## 8. Migration

**State before:** synthesize and runAggregator render the whole of their inputs into one prompt and make one model call with no size check (src/analyze/context/synthesizer.ts:117-169, src/analyze/runtimes/shared/aggregator.ts:100-155). The free-form short-circuit returns the tool loop's bundle from a final emit whose input is the whole conversation (src/analyze/context/driver.ts:1004-1044, 1668-1690). prepareSynthesize returns that one prompt to the step tool. AnswerReport.handling is typed unknown (src/analyze/completeness.ts:206), mergeAnswerReports is binary with a prefix (src/analyze/completeness.ts:404-420), and collectPlanSources skips each plan's aggregate task, so nothing about an aggregate reaches the run's report (src/analyze/executor/plan-sources.ts:43-92). The step tool's bundle phase returns a retryable error on a bad reply and keeps no progress (src/daemon/steps/analyze-step/phases/bundle.ts:90).

**State after:** The four callers use one shared helper that measures the single rendered input against a stated budget. Within budget each makes the same single call. Over budget the evidence is divided into ordered parts, each part is reasoned over serially, evidence and findings are assembled in code, a staged combine writes only the summary and always ends, and a failed part or a failed combine is named while the other results are kept. AnswerReport.handling is the typed HandlingReport read through a guard, merged with plan-path-qualified part ids, and the aggregate's handling reaches the run's report. The step tool carries an AnswerProgress object persisted on every transition, with part and combine turns that reuse the registered bundle argument.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add HandlingReport, its read guard parseHandling and mergeHandling, and the budget policy with the single-pass decision only; nothing divides yet — ↩ rollbackable
2. Type AnswerReport.handling, make mergeAnswerReports merge handling through mergeHandling with its unchanged signature, and keep the bundle schema's open handling object valid — ↩ rollbackable
3. Add the division, assembly adapters and staged combine, and move synthesize, runAggregator and the free-form final emit onto them so the in-budget case is unchanged — ↩ rollbackable
4. Make collectPlanSources read each plan's aggregate handling and concludeRun merge it, so the run's completeness reflects uncovered parts — ↩ rollbackable
5. Add the optional AnswerProgress to the step state and the emit_part and emit_combine outputs, persisting progress on every transition — ↩ rollbackable
6. Pass HandlingBudgetError and the answer-step failure through the driver and the step tool as the declared typed failure — ↩ rollbackable

**Backward compat:** All new state and report fields are optional or additive, and the one addition to an existing union value (partitionedBy 'mixed') is on a contract this Story owns. A step state written before the change lacks the progress and is read as a single-pass state. A stored bundle with an open handling object stays valid and a malformed value is read as absent. An input within the budget produces the same calls and the same result as before. synthesize, runAggregator, mergeAnswerReports, collectPlanSources and concludeRun keep their signatures; prepareSynthesize and finalizeSynthesize gain an optional progress parameter and the existing callers are unchanged. The registered MCP bundle argument is unchanged and the legacy emit_bundle turn is kept.

## 9. Alternatives considered

### 9.1 a1: One shared partition-and-combine helper with a stated budget policy, caller adapters and a resumable progress object — **CHOSEN**

One helper measures the single rendered input of a model call against a stated character budget and, over budget, divides the evidence into ordered parts, runs one call per part serially, assembles evidence and findings deterministically in code and has the model write only a bounded summary through a terminating staged combine; four callers use it through small adapters.

A helper module with three parts. (1) Budget policy: the budget is provider.inputBudgetChars when the provider declares it; else, for a local model, (context window tokens minus the output tokens) times 3 characters per token; else a stated default of 80,000 characters; a reserve of 4,000 characters is kept for message framing, the schema text and the schema-repair retries; the step tool, which has no provider, uses the default. The report records the budget and where it came from. A local model that silently truncates below its declared window cannot be detected from the provider contract, so the protection is the conservative ratio and the reserve, and the limitation is stated. (2) Division and assembly: the rendered input is measured once, including repeated context and the absent-input section, which is counted in every part and every combine call. Over budget, the evidence blocks are grouped by directory then file in stable order, and one block larger than the room is cut into consecutive sections; blocks carry an ordinal that is separate from their key. Each part reply is a seven-layer bundle (or an aggregate summary plus findings) whose summary is capped at 2,000 characters; the caller adapter assembles the final output in code: evidence layers and findings are concatenated by ordinal with part headings and are never passed through the combine model, which writes only the summary-level layers from the bounded part summaries. The combine groups summaries so that each call fits, and each stage turns N summaries into ceil(N/g) summaries with g at least 2, so it ends in at most ceil(log2 N) stages; if fixed context plus two capped summaries does not fit, or one block cannot be given the minimum 4,000-character section, a typed budget error carries the results and the report. A provider size refusal subdivides the part a bounded three times. A failed part is named in notCovered and makes completeness false; if the combine fails, the output is built from the per-part results unchanged with the combine failure reported. All-parts-failed is the typed answer failure. (3) Callers: synthesize, runAggregator, the tool loop's final emit that feeds the free-form short-circuit, and the step tool's answer turn. The step tool carries an AnswerProgress object (completed parts, the pending part or combine group, intermediate combine outputs, failures, retry count) through prepare and finalize, persisted on every transition with token replacement. The aggregate's handling reaches the run through collectPlanSources and concludeRun for the root and nested plans, with plan-path-qualified part ids.

### 9.2 a2: Handling table keyed by size class, separate implementations per path

Pick single pass or parts from the five sizes with a fixed table, with one implementation in the lookup pipeline and another in the plan-tree aggregator.

Define a table from size (XS..XL) to single-pass or partitioned with fixed part counts, and implement the division and combine separately for synthesize and for runAggregator. The size class from the measure decides, not the rendered input. The step tool and the free-form short-circuit get their own handling.

**Rejected because:** Literal to the HLD wording but a size class does not bound characters, and two implementations can drift.

### 9.3 a3: Smallest: halve and retry when the provider refuses the input

Keep one pass as today and only when the provider refuses the input as too large split it in half, retry, and combine the halves.

Catch the provider's size refusal in synthesize and runAggregator, split the input at a file boundary into two halves, run each and combine, repeating on refusal. No budget policy, no step tool part turn beyond a retry.

**Rejected because:** A local model truncates silently instead of refusing, so input is lost with no signal; this violates k1, k2 and k3.

## 10. References

- **[[c1]]** `code` `src/analyze/context/synthesizer.ts:117-169`
- **[[c2]]** `code` `src/analyze/context/driver.ts:1668-1690`
- **[[c3]]** `code` `src/analyze/executor/plan-sources.ts:43-92`
- **[[c4]]** `code` `src/analyze/context/shaper-provider.ts:205-250`
- **[[c5]]** `code` `src/daemon/steps/analyze-step/types.ts:56-157`
