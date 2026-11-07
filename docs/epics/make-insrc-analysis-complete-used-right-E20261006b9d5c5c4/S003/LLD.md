<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

When the material an analyzer must reason over is larger than the answering model can take in one call, the analyzer now divides it into parts along file and directory boundaries (and one oversized item into consecutive sections), has the model reason over each part in turn, and combines the per-part results into one answer, naming any part it could not cover. A request that fits is answered in one pass exactly as before. The same rule serves the lookup pipeline's answer step, the plan tree's final report and the step tool's answer turn, and the answer reports how it was handled.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

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

**Surface level:** public

### 2.1 `synthesize`

```typescript
synthesize(args: SynthesizeArgs): Promise<Omit<AnalyzeContextBundle, 'meta'>>
```

**Parameters:**
- `args: SynthesizeArgs` — As today, plus the optional field onHandling.
- `args.onHandling: ((handling: HandlingReport) => void) | undefined` _(optional)_ — Called once with how the answer was written, so the driver can put it into the answer report; omitted by callers that do not need it.

**Returns:** `Promise<Omit<AnalyzeContextBundle, 'meta'>>` — Unchanged: the bundle written in one pass, or the bundle combined from the per-part bundles.

**Errors:**
- `ShaperAnswerStepFailedError (src/analyze/context/driver.ts), code 'answer-step-failed' declared by sc6` when The combine step fails, or every part fails; its data carries the executed results and the report with handling filled.
- `SynthesizerPromptMissingError` when Unchanged: the prompt file for the target is missing.

**Preconditions:**
- args.executed holds the results of the lookups that ran.

**Postconditions:**
- When the rendered input fits the model's budget the model is called once with the same prompt as before and handling.method is 'single-pass'.
- Otherwise the model is called once per part, serially, then to combine, and handling.method is 'partitioned' with parts equal to the number of parts.
- Every citation line of a part's artefacts is present in the combined artefacts.

### 2.2 `prepareSynthesize`

```typescript
prepareSynthesize(args: Omit<SynthesizeArgs, 'runId' | 'provider'>, completed?: readonly PartResult[]): SynthesizePrepared
```

**Parameters:**
- `args: Omit<SynthesizeArgs, 'runId' | 'provider'>` — As today.
- `completed: readonly PartResult[] | undefined` _(optional)_ — The per-part bundles the agent's model has already written on the step tool; absent on the first call.

**Returns:** `SynthesizePrepared` — The next turn for the agent's model: the whole answer prompt when it fits (unchanged), else the prompt for the next unwritten part, else the combine prompt when all parts are written. The returned value carries turn: 'answer' | 'part' | 'combine', partIndex, partCount and the handling report so far.

**Errors:**
- `SynthesizerPromptMissingError` when Unchanged.

**Preconditions:**
- completed, when given, lists the parts of this same division in order, each with a bundle that passed the bundle schema or a failure reason.

**Postconditions:**
- With completed absent and an input that fits, the result is identical to today's SynthesizePrepared with turn 'answer'.
- The division is a function of args alone, so repeating the call gives the same parts.

### 2.3 `finalizeSynthesize`

```typescript
finalizeSynthesize(raw: unknown, execution?: ConnectionExecutionContext): Omit<AnalyzeContextBundle, 'meta'>
```

**Parameters:**
- `raw: unknown` — The bundle JSON the agent's model wrote for the answer turn, a part turn or the combine turn; all three use the bundle schema.
- `execution: ConnectionExecutionContext | undefined` _(optional)_ — As today.

**Returns:** `Omit<AnalyzeContextBundle, 'meta'>` — Unchanged.

**Errors:**
- `SynthesizerSchemaUnrecoverable` when Unchanged: raw does not match the bundle schema.

**Postconditions:**
- Unchanged.

### 2.4 `runAggregator`

```typescript
runAggregator(args: RunAggregatorArgs): Promise<AggregateReport>
```

**Parameters:**
- `args: RunAggregatorArgs` — As today.

**Returns:** `Promise<AggregateReport>` — The report written in one pass when the rendered upstream section fits the model's budget; otherwise the report combined from per-part reports, with metadata.handling filled.

**Errors:**
- `Error whose message starts 'aggregator-llm-unavailable:' (src/analyze/runtimes/shared/aggregator.ts classifyError)` when Unchanged: a call fails because the model is unavailable. In the partitioned case this fails only that part, which is kept out and named in metadata.handling.notCovered.
- `Error whose message starts 'aggregator-schema-unrecoverable:' (classifyError)` when Unchanged: a call's structured output cannot be repaired. In the partitioned case this fails only that part.
- `Error whose message starts 'aggregator-parts-failed:' (new, same family as the two above)` when Every part failed, the combining of the summaries failed, or the budget is not larger than the fixed part of the prompt. The executor records the aggregate task as failed with this reason by its existing runtime-threw path; no new error code is declared.

**Preconditions:**
- args.upstreamOutputs holds the outputs the plan produced; args.absentInputs names the ones it did not.

**Postconditions:**
- findings is the concatenation of the parts' findings in plan order: none is dropped by the combining; only the summary is written by a model from the per-part summaries.
- The absent-inputs section is part of every part and of the combine input, so no part states anything about an absent input.

### 2.5 `prepareAnswerTurn`

```typescript
prepareAnswerTurn(args: Parameters<typeof prepareSynthesize>[0] & { executed: ExecutedPlan; measure?: RequestMeasure; reportScope?: ReportScopeInput; completed?: readonly PartResult[] }, execution?: ConnectionExecutionContext): AnswerTurn
```

**Parameters:**
- `args.completed: readonly PartResult[] | undefined` _(optional)_ — Passed through to prepareSynthesize: the parts written so far.

**Returns:** `AnswerTurn` — As today, with prepared now one of the three turns above.

**Errors:**
- `ANSWER_PROMPT_MISSING` when Unchanged.

**Preconditions:**
- The lookups ran.

**Postconditions:**
- The report carried by a failed turn has handling filled when the division was made.

## 3. Data model changes

### 3.1 `HandlingReport` — new

Contract sc4, owned by this Story. method 'single-pass' | 'partitioned'; parts: number; partitionedBy?: 'directory' | 'file' | 'section'; notCovered: { part: string; reason: string }[]. Extended with three optional fields so that the answer can say how much was done: combineStages?: number (the levels of combining, 0 when one combine call sufficed, absent for single-pass), inputChars?: number (the characters of the rendered input), budgetChars?: number (the budget the decision used). Consumed by Story s4 as the contract states; adding optional fields is not a breaking change.

```
interface HandlingReport {
  readonly method: 'single-pass' | 'partitioned';
  readonly parts: number;
  readonly partitionedBy?: 'directory' | 'file' | 'section' | undefined;
  readonly notCovered: readonly { readonly part: string; readonly reason: string }[];
  readonly combineStages?: number | undefined;
  readonly inputChars?: number | undefined;
  readonly budgetChars?: number | undefined;
}
```

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/context/schema.ts:194`
- `src/analyze/measure.ts:189`

### 3.2 `AnswerReport` — field-modify

The field handling changes from unknown ("Typed by Story s3") to HandlingReport | undefined. renderReportHead gains one line, after the measure line, stating the method, the number of parts and every part not covered with its reason; the line is absent for single-pass so a small request's answer head is unchanged. The bundle schema's open handling object (src/analyze/context/schema.ts:194) is kept out of the schema given to a model, as the report is. Invariants to preserve: a small request's answer head is unchanged (c3) and a reduction is always reported (c5).

```
- readonly handling?: unknown;
+ readonly handling?: HandlingReport | undefined;
```

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/context/schema.ts:194`
- `src/daemon/steps/analyze-step/answer-turn.ts`

### 3.3 `HANDLING_TABLE and answerInputBudget` — new

The one place the method for each size is stated. HANDLING_TABLE maps XS, S and M to 'single-pass unless the characters exceed the budget' and L and XL to 'partitioned unless they fit'; the rule that decides a request is: partitioned when inputChars is greater than budgetChars, whatever the size, because files and items do not bound characters. answerInputBudget(model) returns budgetChars: the model's declared inputLimit converted to characters (a tokens limit by a stated ratio of 3 characters per token, a chars limit as declared), less the characters of the system prompt, the schema and a stated reserve for the model's output; for a model with no declared limit (the Ollama family reads its num_ctx, the agent's in-session model on the step tool declares nothing) a stated default in code. Both are constants and a function next to SIZE_THRESHOLDS in the measure module, not configuration, so no knob that truncates is added.

```
export const HANDLING_TABLE: Readonly<Record<AnalyzeScope, 'single-pass-unless-over-budget' | 'partitioned-unless-fits'>>;
export function answerInputBudget(model: ResolvedModel | undefined, fixedChars: number): number;
```

**Call sites:**
- `src/analyze/measure.ts:85`
- `src/analyze/context/shaper-provider.ts:234`
- `src/assets/models/cloud-model-catalog.json`

### 3.4 `Block, PartPlan and PartResult (the shared partition-and-combine helper)` — new

One module under src/analyze used by synthesize, runAggregator and prepareSynthesize. Block { key: string (the file path, the document section id or the task path the block belongs to); text: string (already rendered) }. partition(blocks, budgetChars) returns PartPlan { partitionedBy; parts: { key: string; blocks: Block[] }[] }: blocks are sorted by key so a part holds neighbouring files and directories, whole blocks are placed in order until the next would exceed the budget, and a block that alone exceeds the budget is cut into consecutive sections on line boundaries (partitionedBy 'section'), each section a block of its own with key '<key>#<n>/<of>'. PartResult { key: string; bundle?: Omit<AnalyzeContextBundle,'meta'> (or AggregateLLMOutput for the aggregator); failure?: string }. combine(results, budgetChars) joins in stages: when the rendered per-part results exceed the budget they are grouped in order and combined group by group until one remains, combineStages counting the levels. A non-block part of an exploration output (its headers and completeness) is repeated in every part that holds a list element of that output, so each part is understood alone.

**Call sites:**
- `src/analyze/context/synthesizer.ts:129`
- `src/analyze/runtimes/shared/aggregator.ts:103`
- `src/daemon/steps/analyze-step/answer-turn.ts`

### 3.5 `AggregateReport.metadata` — field-add

metadata gains handling?: HandlingReport, set by runAggregator and copied by the plan tree's driver into AnswerReport.handling. Reports stored before the change have no handling and are read as single-pass.

```
+ readonly handling?: HandlingReport | undefined;
```

**Call sites:**
- `src/analyze/runtimes/shared/aggregator.ts:103`
- `src/analyze/runtimes/docs/aggregate-report.ts`
- `src/analyze/orchestrator/driver.ts`

### 3.6 `StepStatePayload` — field-modify

The step tool carries the division in its opaque state token so that a repeated call gives the same parts. stage gains 'awaiting_part' and 'awaiting_combine'; a new optional field completedParts: PartResult[] holds the parts written so far. The existing phase 'bundle' accepts a part or the combine bundle when the stage says so (the same bundle schema), so the phase set of the tool, and its schema, do not change; the response's next value gains 'emit_part' and 'emit_combine' beside 'emit_bundle', which the tool description and the steering text name. Invariants to preserve: a request that fits is unchanged (c3) and no result is reduced without saying so (c5).

```
- stage: 'awaiting_plan' | 'awaiting_narrow' | 'awaiting_bundle'
+ stage: 'awaiting_plan' | 'awaiting_narrow' | 'awaiting_bundle' | 'awaiting_part' | 'awaiting_combine'
+ readonly completedParts?: readonly PartResult[] | undefined;
```

**Call sites:**
- `src/daemon/steps/analyze-step/state.ts`
- `src/daemon/steps/analyze-step/phases/plan.ts`
- `src/daemon/steps/analyze-step/phases/narrow.ts`
- `src/daemon/steps/analyze-step/phases/bundle.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | This Story owns the Handling report. It produces HandlingReport at three places (synthesize, runAggregator and the step tool's turns) from one helper, fills method, parts, partitionedBy and notCovered as the HLD sketches, and adds three optional fields. Story s4 reads it to confirm that results that were limited before are now handled in parts. |
| `sc1` | consumes | A part is built from lookup results and plan-task outputs that each carry a completeness record; the record is kept with every block of its output. The answer report's completeness is derived from the records as before. A part that fails is reported in notCovered and is never counted as a lookup that found nothing. |
| `sc2` | consumes | Fills the handling field of the answer report that Story s1 owns and renders it in the head of the answer through renderReportHead; the completeness and measure lines are unchanged. |
| `sc3` | consumes | Reads RequestMeasure.size to state which row of HANDLING_TABLE applied and RequestMeasure.characters (recorded by Story s2 'for the handling of large results') as inputChars when the lookup pipeline decides; the plan tree's aggregator measures the characters of its own rendered upstream section because it has no lookup measure. |
| `sc6` | consumes | On the lookup pipeline, a failure of the combine step, of every part, or a budget that leaves no room is raised as the typed ShaperAnswerStepFailedError (src/analyze/context/driver.ts), whose code 'answer-step-failed' Story s1 added to the list Story s6 owns; it carries the executed results and the report with handling filled. On the plan tree the aggregate task fails with an 'aggregator-parts-failed:' Error through the executor's existing path. No new error code is declared. |

## 5. Error paths

**Error cases**

- **A part is refused as too large although the division said it fits (the characters-per-token ratio or the reserve was wrong for this model).** (recoverable)
  - Detection: The per-part call throws InputTooLargeError (src/agent/providers/cli-provider.ts) or the local model's equivalent refusal; the error carries the sizes it was refused at.
  - Response: The part is divided once more into two halves on block boundaries (a block that alone is the whole part is cut into sections) and both halves are run; the division is recorded in the report. If a half is refused again at one block of one section the part is recorded in notCovered with the refusal as its reason and the rest continues.
  - User impact: The answer still arrives; the report names what could not be covered and why.
- **A part's model call fails for another reason (the model is unavailable, the structured output cannot be repaired).** (recoverable)
  - Detection: The per-part call throws; the existing classifyError of the synthesizer or the aggregator classifies it.
  - Response: The part is kept out of the combination and recorded in HandlingReport.notCovered with the classified reason; the other parts are combined. The failure is not retried beyond the existing structured-output attempts.
  - User impact: A combined answer that says it does not cover that part.
- **Every part fails, or the combine step fails.** (terminal)
  - Detection: No PartResult has a bundle, or the combine call throws after its existing attempts.
  - Response: On the lookup pipeline raise the typed ShaperAnswerStepFailedError (code 'answer-step-failed', declared by Story s6, raised by Story s1) with the executed results and the report whose handling is filled; the request is not passed to another way of answering. In the aggregator throw an Error starting 'aggregator-parts-failed:' so that the aggregate task is recorded as failed with its reason.
  - User impact: A clear error that carries what the lookups found, as Story s1 requires.
- **The combine input is itself larger than the budget.** (recoverable)
  - Detection: The rendered per-part results exceed budgetChars before the combine call.
  - Response: Combine in stages: group the per-part results in order into groups that fit, combine each group, and repeat on the results until one remains; combineStages in the report counts the levels. A group of one result is passed through and not re-written.
  - User impact: None beyond time; the report states the number of stages.
- **The combining drops a finding or a citation that a part had.** (recoverable)
  - Detection: After combining, a deterministic check compares the cite lines of every part's artefacts, and for the aggregator the findings of every part, with the combined result.
  - Response: Missing cite lines are appended to the combined artefacts; the aggregator never relies on the model for findings (they are concatenated in plan order), only for the summary.
  - User impact: No finding or citation is lost by the combining.
- **The budget is not larger than the fixed part of the prompt (the system prompt, the schema and the reserve).** (terminal)
  - Detection: answerInputBudget returns a value of zero or less for the model.
  - Response: Refuse to divide, since no division could fit: raise ShaperAnswerStepFailedError (lookup pipeline) or an 'aggregator-parts-failed:' Error (aggregator) with a message that names the model, its declared limit and the fixed characters, so a misconfigured model is seen at once and not as a loop.
  - User impact: An error that names the cause.
- **On the step tool, the agent's model returns a part or combine bundle that fails the bundle schema.** (recoverable)
  - Detection: finalizeSynthesize throws SynthesizerSchemaUnrecoverable in the 'bundle' phase while the state's stage is 'awaiting_part' or 'awaiting_combine'.
  - Response: Return the same turn again with the error message, without advancing the state, as the step tool does for an invalid bundle today; after the existing retry count the part is recorded in notCovered.
  - User impact: The agent is told what was wrong and asked for that part again.
- **On the step tool, the state token's completedParts does not belong to the division now computed (the lookups or the budget changed between calls).** (recoverable)
  - Detection: The state carries a division key (a hash of the part keys and the budget) that differs from the one recomputed from the executed results.
  - Response: Refuse with the existing state-mismatch error and ask the agent to start the request again from 'start'; no part is trusted across a different division.
  - User impact: A restart of that request.
- **The agent stops answering part turns (the call sequence is abandoned) on the step tool.** (recoverable)
  - Detection: The state token expires or is never presented again.
  - Response: Nothing is persisted beyond the token's existing life; the next 'start' begins afresh.
  - User impact: None; no half answer is stored.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The rendered input is exactly the budget. | Single-pass: the rule is partitioned only when inputChars is greater than budgetChars. |
| The division yields one part (the input is over the budget by a little but is a single block that cuts into one section). | A single section is a single-pass call on the section; the report says single-pass with the original input size noted, not partitioned with one part. |
| Zero lookups returned results, or the plan produced no outputs. | Nothing to divide: single-pass with the existing text for an empty input, as today. |
| One block is larger than the whole budget (a document section of several hundred thousand characters). | It is cut into consecutive sections on line boundaries, each reasoned over in turn, partitionedBy is 'section' and the answer takes the whole content into account. |
| A single line longer than the budget (minified text, a long JSON line). | Cut at a character boundary that does not split a surrogate pair or a multi-byte character; sections stay in order. |
| An exploration output has no list field to divide (only a long string, or a freeform.probe rawBundle). | It is one block; if it exceeds the budget it is cut into sections like any block. |
| A failed or unsupported lookup output among the results. | It is a small block carried in the part of its position; it is not dropped and its reason appears in the part's input. |
| More parts than one combine call can accept (hundreds). | Combined in stages until one result remains; the number of stages is reported. |
| Two blocks with the same key (several lookups name the same file). | They are kept adjacent in lookup order so the part sees the file's findings together. |
| A model that declares no input limit. | The stated default budget applies and the report's budgetChars shows the figure used. |

**Invariants to preserve**

- A request whose rendered input fits the model's budget is answered by exactly the model calls and the prompt text it gets today: one call, no combine step, and an unchanged answer head except that no handling line is added. [[c3]]
- No analyzer result is reduced without the answer saying so: a part that could not be covered is named in the report with its reason and is never silently left out. [[c5]]
- Calls that reach a model are made one after another, never in parallel: the per-part calls and the combine calls are serial for await loops. (the existing rule: no Promise.all on anything that reaches a model) [[c4]]
- The context builder's shaper keeps no truncation, summarize-down or token-budget knob: the budget only decides whether to divide; nothing is cut, and what a model is given is the whole of each block or consecutive sections that together are the whole block. [[c7]]
- Every claim in an answer is grounded in a real exploration output: the combining adds no path or finding that a part did not have, and a citation a part had is not lost. [[c8]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), the convention of the src/analyze and src/daemon/steps test directories (files under __tests__ named <subject>.test.ts); real graph store and real handlers where the Story touches them, a stub LLMProvider that records the prompts it was given and can be told to fail or to refuse a size`

**Test levels**

- **unit** — The partition-and-combine helper, the budget and the table, in isolation, with no model.
  - Subjects: `partition places whole blocks in key order and keeps same-key blocks adjacent; a block over the budget is cut into consecutive sections on line boundaries whose concatenation is the block; a single line over the budget is cut on a character boundary that does not split a surrogate pair`, `the decision rule: partitioned only when inputChars is greater than budgetChars, whatever the size; HANDLING_TABLE names a method for each of XS, S, M, L and XL`, `answerInputBudget converts a chars limit as declared and a tokens limit by the stated ratio, subtracts the fixed characters and reserve, returns the stated default for a model with no limit, and returns zero or less when nothing is left`, `renderReportHead renders the handling line for a partitioned report with its parts and every notCovered part with its reason, and renders nothing for single-pass`, `the combine staging groups per-part results in order until one remains and counts the levels; a group of one passes through`
  - Fixtures: `blocks of generated text with known keys and lengths`
- **integration** — The real call sites with a stub provider and the real step handler: the lookup pipeline's synthesize, the plan tree's runAggregator and the step tool's turns, with the budget lowered by a test seam so that a small fixture is large.
  - Subjects: `synthesize with an input over a lowered budget calls the stub once per part serially, then to combine, returns one bundle whose artefacts contain every part's cite lines, and reports handling through onHandling; with an input within the budget the stub is called once with exactly the prompt the pre-change code built`, `synthesize when one part's call fails keeps the other parts' content and names the failed part in notCovered; when every part fails or the combine fails it raises answer-step-failed carrying the executed results and the report`, `synthesize when a part is refused with InputTooLargeError divides that part once more and still covers it, and records the refusal if a half is refused again`, `runAggregator over a lowered budget concatenates the findings of all parts in plan order, has the model write only the summary, includes the absent-inputs section in every part, and fills metadata.handling`, `the step tool's plan and narrow phases through handleAnalyzeStep with encodeState payloads: an over-budget result returns emit_part for part 1 of N, each bundle-phase call with a valid part advances the state, the last part returns emit_combine, and the combine bundle returns the final answer with handling in the report; a part that fails the schema returns the same turn again; a state whose division key no longer matches is refused`, `a broad docs analysis through the plan walker with an aggregate input larger than the lowered budget completes with a final report and handling.parts greater than one (the case Story s7 accepted as an exception)`
  - Fixtures: `a stub LLMProvider recording prompts and able to throw a chosen error for a chosen call`, `a graph store sandbox with doc entities and the converted-repos helper`, `a test seam for the budget`
- **contract** — The shape of the Handling report that Story s4 consumes.
  - Subjects: `HandlingReport values produced by single-pass, partitioned, section-partitioned and failed-part runs match the sc4 interface, including the three optional fields, and AnswerReport.handling is typed to it`
- **live** — The real model, once, on this repository (reported by the builder, not run by the gate).
  - Subjects: `a broad docs analysis of this repository whose aggregate input is larger than the real model's input returns a final report whose head states the number of parts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: HANDLING_TABLE names a method for each of XS, S, M, L and XL and the decision rule is partitioned only when inputChars is greater than budgetChars`, `integration: the same oversized fixture is divided on the lookup pipeline, the plan tree and the step tool, and each report states method and parts` |
| `ac2` | `integration: synthesize over a lowered budget calls the stub once per part serially, then to combine, and the combined artefacts contain every part's cite lines`, `integration: runAggregator over a lowered budget concatenates every part's findings in plan order`, `unit: the combine staging joins in levels until one result remains` |
| `ac3` | `unit: renderReportHead renders the handling line with the number of parts and each notCovered part`, `integration: the step tool's final answer after emit_part and emit_combine turns carries handling.parts equal to the number of parts` |
| `ac4` | `integration: an input within the budget calls the stub once with exactly the prompt the pre-change code built and adds no handling line to the answer head` |
| `ac5` | `integration: synthesize when one part's call fails keeps the other parts' content and names the failed part in notCovered`, `integration: a part refused with InputTooLargeError is divided once more and covered, and recorded only if a half is refused again` |
| `ac6` | `unit: a block over the budget is cut into consecutive sections whose concatenation is the block, and a single over-long line is cut without splitting a surrogate pair`, `integration: a document section larger than the budget is read in sections by synthesize and every section's text reaches a part prompt` |
| `ac7` | `integration: a broad docs analysis through the plan walker with an aggregate input larger than the lowered budget completes with a final report and handling.parts greater than one`, `live: a broad docs analysis of this repository returns a final report whose head states the number of parts (reported by the builder)` |

## 7. Migration

**State before:** Every answer-writing call makes one model call from the whole of its input and has no size check: synthesize and prepareSynthesize (src/analyze/context/synthesizer.ts) build one prompt from the whole executed plan, runAggregator (src/analyze/runtimes/shared/aggregator.ts) renders every upstream task output into one user turn, and prepareAnswerTurn (src/daemon/steps/analyze-step/answer-turn.ts) hands the step tool's agent that one prompt. The only size signal is the CLI provider's InputTooLargeError after a refusal (src/agent/providers/cli-provider.ts). AnswerReport.handling is typed unknown with the comment 'Typed by Story s3' (src/analyze/completeness.ts) and the bundle schema declares an open handling object (src/analyze/context/schema.ts). A broad docs analysis whose aggregate input is larger than one model call accepts does not complete on this repository (the exception accepted for Story s7 on 2026-10-08).

**State after:** A request whose rendered input fits the answering model's budget is answered exactly as before. A larger one is divided along file and directory boundaries (an oversized item into consecutive sections), each part is reasoned over serially, and the per-part results are combined, in stages when needed; the answer's head states the method, the number of parts and any part not covered. AnswerReport.handling is typed HandlingReport, AggregateReport.metadata carries it, the step tool's state carries the parts in the stages awaiting_part and awaiting_combine, and the broad docs analysis returns a final report.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the size-to-method table, the model-budget function and the shared partition-and-combine helper, with their unit tests, behind no caller: nothing changes at run time. — ↩ rollbackable
2. Type AnswerReport.handling as HandlingReport and add the optional handling to the aggregate report's metadata and to the report head's rendering; a report without handling renders as before. — ↩ rollbackable
3. Switch synthesize to the helper: when the input fits the budget the path is the existing one; when it does not, divide, reason over the parts serially and combine. Fill handling through onHandling. — ↩ rollbackable _(needs: `step 1`, `step 2`)_
4. Switch runAggregator to the helper: findings concatenated in plan order, summary combined by the model, absent inputs repeated in every part; copy handling from the aggregate report to the answer report in the plan tree's driver. — ↩ rollbackable _(needs: `step 1`, `step 2`)_
5. Add the step tool's part and combine turns: the new stages in the state payload, the division key in the state, emit_part and emit_combine in the plan, narrow and bundle phases, and update the tool descriptions, the tool-surface golden file and the steering text that name the turns. The daemon is restarted for this step; the MCP processes are restarted after the daemon. — ↩ rollbackable _(needs: `step 3`)_
6. Run a broad docs analysis of this repository against the updated daemon and record its report as the live evidence that the exception accepted for Story s7 is closed. — ↩ rollbackable _(needs: `step 4`, `step 5`)_

**Backward compat:** The tool names and phases of insrc_analyze_step do not change; its response gains the next values emit_part and emit_combine, which a client sees only when the lookup results are larger than the model's budget (before this change that request produced an oversized emit_bundle turn that the agent's model could not take). An agent that follows the 'next' field of each response as the tool description says needs no change; the description and the steering text are updated to name the two turns. Answers to small requests are byte-for-byte the same, because the handling line is absent for single-pass. AnswerReport.handling was unknown and unset, so no stored report is invalid; a report stored before the change is read as single-pass. State tokens issued before the restart end at it, as with every daemon restart. Cached lookup outputs and the lookup cache's key are not touched.

## 8. Alternatives considered

### 8.1 a1: One shared partition-and-combine helper, driven by the model's input budget — **CHOSEN**

A single helper divides any ordered list of rendered blocks into parts that fit the answer model's input budget, runs one model call per part serially, and combines the per-part results; all three call sites use it.

Add one module (under src/analyze) that takes the blocks to be reasoned over (a lookup result, a plan-task output or a section of one item, each already rendered), the budget in characters of the model that will answer (from its inputLimit, converted to characters, or a configured default when the model declares none), and a per-part call and a combine call supplied by the caller. It places whole blocks into parts in order, never splitting a block unless the block alone exceeds the budget, in which case the block is cut into consecutive sections on line boundaries; it keeps the parts along directory and file boundaries by sorting blocks by file path first. It runs the per-part calls one after another, drops a failed part into HandlingReport.notCovered with its reason, and combines the rest; when the combined input still exceeds the budget it combines in stages (groups of per-part results), so any size terminates. The size-to-method table is a small exported constant (XS, S and M: single-pass unless the characters measured exceed the budget; L and XL: partitioned) so the stated method is one place, but the actual decision is the characters against the budget because files and items do not bound characters. The helper returns the combined value and a HandlingReport, which the caller writes into AnswerReport.handling. The lookup pipeline's synthesize, the plan tree's runAggregator and the step tool's part turn call it; the step tool's variant returns the next part to the agent instead of calling a model.

### 8.2 a2: Two path-specific implementations that share only the HandlingReport type

Write the partition logic once inside the lookup pipeline's synthesizer and once inside the plan tree's aggregator, with only the HandlingReport contract in common.

Keep src/analyze/context/synthesizer.ts and src/analyze/runtimes/shared/aggregator.ts self-contained. Each gets its own private partitioning (the synthesizer divides the executed explorations by file and directory of what they name; the aggregator divides the upstream task outputs by task path), its own per-part call and its own combine call, and both fill the same HandlingReport. No shared helper is introduced; the table from size to method is stated in the documentation and applied by each side with its own threshold. The step tool's part turn is added beside prepareAnswerTurn. This follows the existing layout, where the two paths already have separate message builders, and it avoids a shared interface that three callers must agree on.

**Rejected because:** Meets each criterion on each path, but two copies of the division, failed-part and staged-combine rules mean ac2, ac3 and ac5 are guaranteed only per copy; the table the HLD calls one table (ac1) is stated twice and can disagree. Cheaper to review, costlier to keep correct.

### 8.3 a3: Decide by size class only, with fixed part sizes

Use the five measured sizes as the only trigger: XS to M single-pass, L and XL partitioned into a fixed number of items per part.

Define the table in terms of the RequestMeasure size alone, with no look at characters or at the model: sizes XS, S and M are answered in one pass; L is divided into parts of a fixed number of files; XL into parts of a smaller fixed number. The fixed numbers are constants next to SIZE_THRESHOLDS in src/analyze/measure.ts. The division, the per-part calls and the combine call are as in the other alternatives. This is the smallest reading of the HLD's 'stated table from size to method': the decision needs nothing beyond the measure that Story s2 already produces.

**Rejected because:** Smallest decision logic, but deciding by size class alone cannot meet ac2 and ac6 for a few very large files (a medium request can still exceed the model's input) and splits tiny-file requests needlessly, so it fails k1 (accuracy first) and k2 (everything relevant is taken into account). It also leaves a model with a smaller limit to fail.

### 8.4 a4: Partition only after the model refuses the input

Run every request in one pass as today, and divide into parts only when the call fails with an InputTooLargeError.

Leave the single-pass path untouched. Catch the existing InputTooLargeError (src/agent/providers/cli-provider.ts) and the equivalent refusal of the local model at the synthesizer and aggregator call sites, and on that error re-run the same step in parts, using the sizes the error carries to choose the number of parts, then combine. There is no table and no pre-check; the report says 'partitioned' only when it happened.

**Rejected because:** Reactive splitting is the smallest change but has no stated way of handling each size (ac1), cannot detect a local model that truncates instead of refusing (findings lost silently, against ac2 and k3), pays a failed call for every large request, and has no signal at all on the step tool's agent model.

## 9. References

- **[[c1]]** `code` `src/analyze/runtimes/shared/aggregator.ts` — "llmOutput = await provider.completeStructured<AggregateLLMOutput>("
- **[[c2]]** `code` `src/analyze/context/synthesizer.ts` — "raw = await provider.completeStructured<Omit<AnalyzeContextBundle, 'meta'>>("
- **[[c3]]** `code` `src/analyze/runtimes/shared/aggregator.ts` — "const upstreamSection = renderUpstreamSection(args.upstreamOutputs, args.absentInputs);"
- **[[c4]]** `convention` `CLAUDE.md` — "Never `Promise.all` anything that reaches an LLM provider"
- **[[c5]]** `code` `src/analyze/completeness.ts` — "/** Typed by Story s3. */"
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts` — "export class InputTooLargeError extends CliExitError {"
- **[[c7]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md` — "no token budget, no summarize-down and no truncation knobs"
- **[[c8]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/DEF.md` — "Every claim in an analysis is grounded in a real exploration output"
- **[[c9]]** `code` `src/analyze/measure.ts` — "it is recorded for the handling of large results"
- **[[c10]]** `code` `src/daemon/steps/analyze-step/answer-turn.ts` — "| { readonly ok: true;  readonly prepared: ReturnType<typeof prepareSynthesize> }"
- **[[c11]]** `code` `src/analyze/context/shaper-provider.ts` — "const inputBudgetChars = model?.inputLimit?.unit === 'chars' ? model.inputLimit.max : undefined;"
- **[[c12]]** `prior-artifact` `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/HLD.md` — "Handling report"

## 10. Open questions

- What budget applies to a model that declares no input limit (an Ollama model reads its num_ctx; the agent's in-session model on the step tool declares nothing)? The design states a default in code; the figure is to be set from a measurement of the real models when the plan is made.
- What characters-per-token ratio converts a tokens limit to characters (the design states 3)? A ratio that is too high is caught by the one-more-division rule on a size refusal, but it costs a call; it is to be checked against the models in the catalog.
- The contract text of step s4 named the typed error 'AnswerStepFailedError' and the call site src/daemon/steps/analyze-step/types.ts; the audit found the class is ShaperAnswerStepFailedError (src/analyze/context/driver.ts) and the type is declared in src/daemon/steps/analyze-step/state.ts. This artifact carries the corrected names; the s4 step output is not repeated verbatim in those two places, nor in the runAggregator errors, which the audit asked to name by their real message prefixes.
