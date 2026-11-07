<!-- insrc:artifact LLD-b9d5c5c40df5a574-s3 -->

# LLD: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**HLD base run:** `wf-1791349476498-tih4l4`
**HLD effective hash:** `faa0f59939ce...`

This Story adds one shared helper that decides, from the rendered input of a model call measured in characters against the answering model's input budget, whether a call is made once or in parts. Over budget, the input is divided along directory and file boundaries (one oversize item into consecutive sections), each part is reasoned over serially into a bounded part summary, evidence and findings are concatenated by ordinal outside model rewriting, and a staged combine that strictly shrinks its input joins the summaries. A failed part is kept out, named in the typed handling report and makes completeness false. The lookup pipeline (synthesize), the plan-tree aggregator (runAggregator) and the step tool's answer turn all use the helper.

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

**Surface level:** internal-shared

### 2.1 `synthesize`

```typescript
synthesize(args: SynthesizeArgs, onHandling?: (h: HandlingReport) => void): Promise<SynthesizeResult>
```

**Parameters:**
- `args: SynthesizeArgs` — Existing arguments: the executed plan, provider and bundle schema.
- `onHandling: (h: HandlingReport) => void` _(optional)_ — Receives the handling report so the driver can place it on the answer report.

**Returns:** `Promise<SynthesizeResult>` — The combined bundle; a single pass when the rendered input fits the budget.

**Errors:**
- `Error with the existing synthesize prefix` when The single pass or the combine call fails; a failed part is not an error but a notCovered entry.

**Preconditions:**
- The plan has been executed and results are rendered

**Postconditions:**
- Calls to the model are made serially
- Every part is either summarised or named in notCovered

### 2.2 `prepareSynthesize`

```typescript
prepareSynthesize(args: SynthesizeArgs, completed?: readonly PartResult[]): PreparedSynthesize
```

**Parameters:**
- `args: SynthesizeArgs` — Same arguments as synthesize.
- `completed: readonly PartResult[]` _(optional)_ — Part results the in-session model has already returned, from the step state.

**Returns:** `PreparedSynthesize` — The next turn: 'answer' (fits), 'part' (next part prompt) or 'combine' (next combine prompt).

**Errors:**
- `SynthesizerPromptMissingError` when Existing condition: no prompt can be prepared.

**Preconditions:**
- completed holds results for parts in ordinal order only

**Postconditions:**
- The turn returned has a rendered input within the budget

### 2.3 `finalizeSynthesize`

```typescript
finalizeSynthesize(args: SynthesizeArgs, raw: unknown, completed?: readonly PartResult[]): FinalizedSynthesize
```

**Parameters:**
- `args: SynthesizeArgs` — Same arguments.
- `raw: unknown` — The model's reply for the current turn.
- `completed: readonly PartResult[]` _(optional)_ — Parts finished so far.

**Returns:** `FinalizedSynthesize` — Either the validated bundle, or the next state to continue with.

**Errors:**
- `schema validation failure` when The reply fails the turn's schema; retried up to a stated bound.

**Postconditions:**
- The final bundle carries evidence and findings of every covered part by ordinal

### 2.4 `runAggregator`

```typescript
runAggregator(input: AggregatorInput): Promise<AggregateReport>
```

**Parameters:**
- `input: AggregatorInput` — Existing upstream outputs and absent inputs.

**Returns:** `Promise<AggregateReport>` — The final report; metadata.handling carries the HandlingReport.

**Errors:**
- `Error with the existing aggregator prefixes` when The single pass or the combine call fails.

**Preconditions:**
- Upstream outputs are those the walker gives, plus the absent inputs

**Postconditions:**
- Absent-input section appears in every part and every combine input it applies to, counted in the measured input

### 2.5 `prepareAnswerTurn`

```typescript
prepareAnswerTurn(state: StepStatePayload): AnswerTurn
```

**Parameters:**
- `state: StepStatePayload` — The step tool state, now with stages awaiting_part and awaiting_combine.

**Returns:** `AnswerTurn` — emit_answer, emit_part or emit_combine for the in-session model.

**Errors:**
- `SynthesizerPromptMissingError` when Mapped as today.
- `ShaperAnswerStepFailedError` when Passed through unchanged by the driver and the tool.

**Postconditions:**
- The state carries a combine cursor and a retry counter

### 2.6 `mergeAnswerReports`

```typescript
mergeAnswerReports(reports: readonly AnswerReport[]): AnswerReport
```

**Parameters:**
- `reports: readonly AnswerReport[]` — Reports of nested plans.

**Returns:** `AnswerReport` — Merged report; handling of every nested plan is collected, not discarded.

**Postconditions:**
- Merged handling is partitioned if any nested handling is; parts are summed; notCovered are concatenated with their source

## 3. Data model changes

### 3.1 `HandlingReport` — new

The sc4 contract typed. method single-pass|partitioned, parts, partitionedBy, notCovered[{part, reason}], plus additive combineStages, inputChars and budgetChars. Counting: parts is the number of first-level parts including failed ones; a single pass has parts 1.

```
readonly combineStages?: number | undefined; readonly inputChars: number; readonly budgetChars: number
```

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/context/schema.ts:194`

### 3.2 `AnswerReport.handling` — field-modify

Type changes from unknown to HandlingReport | undefined. A part that is not covered makes the report completeness false and adds a SourceNote.

**Call sites:**
- `src/analyze/completeness.ts:206`
- `src/analyze/completeness.ts:404`

### 3.3 `PartPlan and PartResult` — new

Internal helper types: an ordered list of blocks with a stable ordinal separate from the item key; a result holds a bounded summary plus the evidence and findings of the part, concatenated by ordinal.

**Call sites:**
- `src/analyze/context/synthesizer.ts`
- `src/analyze/runtimes/shared/aggregator.ts`

### 3.4 `answerInputBudget` — new

Budget in characters from the model's inputLimit (chars, or tokens times a conservative chars-per-token ratio); a stated default for a model with no declared limit; a check of the provider's processed-input count (prompt_eval_count) against the rendered input to detect silent truncation; bounded subdivision of a part that is still refused.

**Call sites:**
- `src/analyze/context/shaper-provider.ts:234`
- `src/agent/providers/ollama.ts:580`
- `src/agent/providers/cli-provider.ts`

### 3.5 `StepStatePayload` — field-add

stages awaiting_part and awaiting_combine; completedParts; combine cursor; retry counter; cleared on a terminal turn.

**Call sites:**
- `src/daemon/steps/analyze-step/state.ts`
- `src/daemon/steps/analyze-step/phases/bundle.ts`

### 3.6 `AggregateReport.metadata.handling` — field-add

Carries the HandlingReport of the aggregator call; merged for nested plans.

**Call sites:**
- `src/analyze/runtimes/shared/aggregator.ts`
- `src/analyze/executor/walker.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Types HandlingReport as sketched with additive fields and fills it on every answer. |
| `sc2` | consumes | Fills AnswerReport.handling; uncovered parts add SourceNote entries and make completeness false. |
| `sc1` | consumes | Part results carry their completeness; the combined result is incomplete when any part is not covered. |
| `sc3` | consumes | Uses measure.characters only as a hint; the decision is made on the single rendered-input measurement. |
| `sc6` | consumes | Uses existing codes such as shaper-llm-unavailable for a failed model call; no new code. |

## 5. Error paths

**Error cases**

- **A part's model call fails or its reply fails the schema after the bounded retries** (recoverable)
  - Detection: The part call throws or finalizeSynthesize reports a schema failure and the part retry counter reaches its bound
  - Response: The part is kept out, named in HandlingReport.notCovered with its reason, the other parts are kept, and the answer report completeness is false with a SourceNote
  - User impact: The answer is delivered and says which part was not covered and why
- **Every part fails** (terminal)
  - Detection: notCovered holds all parts and no part summary exists
  - Response: The step fails with the existing answer-step failure carrying the lookup results and the report; no empty answer is written
  - User impact: A typed failure with what was found, never a silent empty answer
- **The combine input still exceeds the budget after a stage** (recoverable)
  - Detection: The helper compares the rendered combine input with the budget and with the previous stage's size
  - Response: Combine in stages with a bounded stage count; each stage must strictly shrink its input (bounded part summaries); if a stage does not shrink, stop and report the uncombined groups as notCovered rather than loop
  - User impact: Terminates; the report names what could not be combined
- **The provider refuses a part as too large** (recoverable)
  - Detection: InputTooLargeError from the provider call, with sizes that may be undefined
  - Response: Subdivide that part into consecutive sections a bounded number of times, then record it as notCovered
  - User impact: No silent truncation; the part is either read in full or named
- **A local model processed fewer input tokens than were sent** (recoverable)
  - Detection: The response's processed-input count (prompt_eval_count) is lower than the conservative estimate of the rendered input
  - Response: Treat as truncated: subdivide the part and rerun; if still truncated after the bound, record notCovered
  - User impact: Silent truncation on a local model is detected rather than trusted
- **A typed answer-step error is thrown from inside synthesize** (terminal)
  - Detection: The driver's catch sees a ShaperAnswerStepFailedError
  - Response: The driver and the step tool pass it through unchanged instead of mapping it to 'answer-invalid'
  - User impact: The caller receives the error with the lookup results and report
- **The step tool receives a bad reply for a part or combine turn repeatedly** (recoverable)
  - Detection: The bundle phase handler's retry counter in the state reaches its bound
  - Response: Mark that part not covered (or fail the combine) and move on; the counter and the completed parts are cleared on a terminal turn
  - User impact: No endless retry loop in the session

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Rendered input exactly at the budget | Single pass; partitioning starts only when the input is over the budget. |
| A model with no declared input limit | A stated default budget is used and recorded in HandlingReport.budgetChars. |
| A single item larger than the budget | It is read in consecutive sections (partitionedBy 'section'), with the sections kept in order and none dropped. |
| Items with the same key in several parts | Ordinals, kept separate from keys, order the parts, so concatenation is deterministic. |
| A request with no results | Single pass with parts 1; no partition is created. |
| Nested plans each handled in parts | mergeAnswerReports collects every nested handling; the merged method is partitioned if any is, parts are summed and notCovered are kept with their source. |
| The threshold is lowered in a test | The same code path partitions a small input, so the behaviour is exercised without a large fixture. |
| The absent-input section and repeated context on the plan tree | They are counted in the single rendered-input measurement for every part and combine call. |

**Invariants to preserve**

- Model calls are made one after another, never in parallel, including part and combine calls [[c1]]
- A request that fits one pass makes the same single model call as today [[c1]]
- Evidence and findings are never rewritten by a model when parts are combined [[c2]]
- A failure of the answer-writing step keeps its typed error and what was found [[c3]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), matching the existing analyze and daemon test suites`

**Test levels**

- **unit** — Prove the partition, budget and combine rules without a model
  - Subjects: `answerInputBudget: chars limit, tokens limit with the conservative ratio, no declared limit default`, `partition by directory, then file, then consecutive sections of one oversize item, with ordinals separate from keys`, `combine terminates: each stage strictly shrinks, bounded stage count`, `evidence and findings concatenated by ordinal outside model rewriting`, `mergeAnswerReports keeps nested handling`, `HandlingReport counting conventions`
  - Fixtures: `a scripted fake provider that records its calls serially and can fail a chosen part`, `a lowered budget so a small input partitions`
- **integration** — Prove the three callers use the helper end to end
  - Subjects: `synthesize single-pass versus partitioned with the same results`, `runAggregator with absent inputs counted in every part`, `step tool: emit_part and emit_combine turns, retry counter, completedParts cleared on a terminal turn`, `driver passes ShaperAnswerStepFailedError through`, `docs aggregate over an input larger than the budget returns a final report`
  - Fixtures: `a docs aggregate input larger than the lowered budget`, `step tool state fixtures`
- **contract** — Prove the report shape other Stories consume
  - Subjects: `HandlingReport against the sc4 sketch`, `AnswerReport.handling typed, bundle schema keeps the open handling object valid`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handling-budget.test.ts: every size and both paths take the rendered-input rule`, `synthesize-handling.test.ts: single pass versus partitioned decision` |
| `ac2` | `partition-combine.test.ts: every part reasoned over serially and evidence concatenated with none lost`, `partition-combine.test.ts: combine terminates` |
| `ac3` | `handling-report.test.ts: parts count and notCovered named with reason in the answer` |
| `ac4` | `synthesize-handling.test.ts: input within budget makes the same single call` |
| `ac5` | `partition-combine.test.ts: failed part kept out, others kept, completeness false`, `step-tool-parts.test.ts: retry bound marks a part not covered` |
| `ac6` | `partition-combine.test.ts: one oversize item read in consecutive sections, none dropped` |
| `ac7` | `aggregator-handling.test.ts: docs aggregate over the budget is handled in parts and returns a final report` |

## 7. Migration

**State before:** synthesize and runAggregator render the whole of their inputs into one prompt and make one model call with no size check (src/analyze/context/synthesizer.ts, src/analyze/runtimes/shared/aggregator.ts). prepareSynthesize returns that one prompt to the step tool. AnswerReport.handling is typed unknown (src/analyze/completeness.ts:206) and mergeAnswerReports discards it (src/analyze/completeness.ts:404). The step tool's bundle phase has no retry counter, and the driver maps any other answer-step failure to 'answer-invalid'.

**State after:** Both calls and the step tool's answer turn use one shared helper that measures the rendered input against the answering model's budget. Within budget the call is the same single pass. Over budget the input is divided, each part is reasoned over serially, evidence and findings are concatenated by ordinal and a bounded staged combine joins the summaries. AnswerReport.handling is the typed HandlingReport and is merged across nested plans; the step state carries part and combine progress with a retry counter.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the HandlingReport type and the answer input budget, with the single-pass decision only; nothing partitions yet — ↩ rollbackable
2. Type AnswerReport.handling, make mergeAnswerReports collect nested handling, and keep the bundle schema's open handling object valid — ↩ rollbackable
3. Add the partition and combine helper and move synthesize and runAggregator onto it, so the in-budget case is unchanged — ↩ rollbackable
4. Add the optional step state fields (stages awaiting_part and awaiting_combine, completed parts, combine cursor, retry counter) and the part and combine turns of the step tool — ↩ rollbackable
5. Pass the typed answer-step error through the driver and the step tool — ↩ rollbackable

**Backward compat:** All new state and report fields are optional or additive. A step state written before the change lacks them and is read as a single-pass state. A stored bundle with an open handling object stays valid. An input within budget produces the same calls and the same result as before. Callers of synthesize, prepareSynthesize and runAggregator keep their signatures, with new parameters optional.

## 8. Alternatives considered

### 8.1 a1: One shared partition-and-combine helper, decided by rendered-input size against the model's input budget — **CHOSEN**

A single helper measures the rendered input of a model call in characters, compares it to the answering model's input budget, and if it is over, divides the input into parts, runs one call per part serially, and combines the per-part results with a bounded, terminating combine.

Add one helper module used by synthesize (lookup pipeline), runAggregator (plan tree) and the step tool's answer turn. It measures the single rendered input (including repeated context and absent-input sections) against a budget taken from the model's declared inputLimit (chars, or tokens through a conservative chars-per-token ratio), with a stated default for a model with no declared limit. Over budget: divide along directory then file boundaries, and one oversize item into consecutive sections; each part yields a bounded per-part summary plus its evidence and findings, which the helper concatenates deterministically by ordinal outside model rewriting; the combine step receives only the bounded summaries, and when they still exceed the budget it combines in stages with a bounded number of stages that strictly shrinks the input. A failed part is kept out, named in HandlingReport.notCovered, and makes completeness false. HandlingReport is typed (method, parts, partitionedBy, notCovered, plus combineStages, inputChars, budgetChars) and fills AnswerReport.handling and the aggregate metadata. The step tool reuses phase 'bundle' with next values emit_part and emit_combine, with the progress held in StepStatePayload (awaiting_part / awaiting_combine, completed parts, a combine cursor and a retry counter).

### 8.2 a2: Handling table keyed by size class, separate implementations per path

Use the five sizes from sc3 to pick the method from a fixed table, with one partitioning implementation in the lookup pipeline and another in the plan-tree aggregator.

Define HANDLING_TABLE from size (XS..XL) to single-pass or partitioned, with part counts per size, and implement the partition and combine separately for synthesize and for runAggregator. The step tool gets its own part turn. The size class from the measure decides, not the rendered input.

**Rejected because:** Literal to the HLD wording but the size class does not bound characters, and two implementations can drift.

### 8.3 a3: Smallest: retry-on-input-too-large with halving

Keep one pass as today and, only when the provider refuses the input as too large, split the input in half and retry recursively, combining the halves.

Catch InputTooLargeError from the provider call in synthesize and runAggregator, split the input at a file boundary into two halves, run each, and combine the results, repeating on refusal. No budget table, no step tool part turn beyond a retry.

**Rejected because:** Local models truncate silently instead of refusing, so accuracy is lost without any signal; this violates k1, k2 and k3.

## 9. References

- **[[c1]]** `analyze-bundle` `Who calls runAggregator, synthesize and prepareSynthesize and what bounds the size of the input of those model calls (insrc_analyze_step over src/anal`
- **[[c2]]** `analyze-bundle` `Where Story s3 plugs in: the size table and the report fields the earlier Stories left for it`
- **[[c3]]** `analyze-bundle` `The lookup driver's handling of an answer-step failure, the step tool's bundle phase and the local model's input handling`

## 10. Open questions

- dm2 (partial): AnswerReport.handling changes from unknown to HandlingReport; the invariant it might break is the open handling object in the bundle schema (src/analyze/context/schema.ts:194), which stays valid; it is stated in the migration's backwardCompat rather than in the data-model details.
