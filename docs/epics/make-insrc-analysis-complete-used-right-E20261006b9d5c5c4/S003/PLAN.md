<!-- insrc:artifact PLAN-b9d5c5c40df5a574-s3 -->

# Plan: STORY-b9d5c5c40df5a574-s3

## Summary

**Epic:** `make-insrc-analysis-complete-used-right`
**LLD run:** `wf-1794119856337-r34wvr`
**LLD effective hash:** `faa0f59939ce...`

This Story gives every analyze request size a defined way of being handled in full: a size table plus a two-unit input-admission rule decide between one pass and parts, and one shared helper does the part calls, the staged combine and the repair loop for the four callers (synthesizer, free-form lookup, aggregator and step tool). Evidence larger than a call's room is cut into code-point-safe sections that repeat their citation fields, reference context (rules, reuse candidates, anchors) travels with every part, and every failure keeps what was gathered and states what was not covered, down through the orchestrator, daemon and plan-tree mappings into the report head. The build runs from the report and error types, through the table, sections and helper, to the callers and the step tool, and ends with the broad docs regression and the one full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** HandlingReport, parseHandling, mergeHandling, applyHandling and the report head line | M | — | — | unit: handling-report.test.ts: parseHandling reads {} and malformed values as absent and accepts a record with and without trigger; unit: handling-report.test.ts: mergeHandling keeps units apart, de-duplicates budgets, sums combineStages, gives 'mixed' and keeps plan-qualified part ids distinct; unit: handling-report.test.ts: applyHandling sets complete false, adds one 'answer step / <part id>' note per uncovered part and does not mutate its input; unit: handling-report.test.ts: renderReportHead is unchanged without handling and adds one line with it; mergeAnswerReports keeps its binary signature; unit: handling-contract.test.ts: HandlingReport against the sc4 sketch plus additive fields, bundle schema open handling object still valid | [[c2]] [[c5]] |
| 2 | **`t2`** Error fields, failure data and the Vibe wording | M | — | — | unit: failure-data.test.ts: typed and plain shapes, 3-level cause bound, non-Error cause as string, JSON round trip, upstream and partFailures kept in order; unit: model-failure.test.ts: isModelCallFailure recognises 'vibe exited with' with and without the retry prefix, not in quoted text, and excludes size refusals and schema-invalid replies; unit: failure-contract.test.ts: RunFailure shape and code 'executor-aggregator-failed' unchanged; TaskExecutionRecord, LookupFailedError and ShaperAnswerStepFailedError gain only optional JSON-safe fields | [[c1]] [[c2]] [[c5]] |
| 3 | **`t3`** HANDLING_TABLE, the admission rule and the output caps | M | — | `t1` | unit: handling-table.test.ts: XS and S single pass, M, L and XL partitioned, undetermined is XL, trigger size/fit/both and no trigger for single pass; unit: handling-admission.test.ts: checked-in local values give 10,240 bytes, exact boundary, one byte over, multi-byte, 22,528 for parts, window too small gives HandlingBudgetError naming the configuration; unit: handling-admission.test.ts: real code, adherence and docs prompt sizes, CLI characters minus 16,000, units never compared, local code and adherence handled in parts with trigger 'fit'; unit: part-output-cap.test.ts: PART_MAX_OUTPUT_TOKENS 8,192 for local part and combine calls, configured tokens for single pass, no enforced cap for CLI | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Sections with envelopes, structural sectioning of nested records, per-block unadmittable | L | — | `t3` | unit: partition-sections.test.ts: 6,000 over 5,000 gives 5,000 and 1,000; emoji boundary; valid text, no overlap, none dropped; ordinals separate from keys; unit: section-envelope.test.ts: oversized real-shaped doc.constraint.enumerate record keeps sourceEntityId, file, heading and kind in every section and reconstructs the original; unit: section-envelope.test.ts: oversized aggregate upstream value with nested records repeats each nested record's citation fields plus taskId, template and params in every section; unit: section-envelope.test.ts: an envelope leaving less than 4,000 units marks only that block unadmittable and the other blocks stay admissible | [[c1]] [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Dependency table, reference context, dedupe keys and oversized reference evidence | L | — | `t4` | unit: shared-context.test.ts: selectSharedContext per target, blocks removed from partition blocks, rule-source count and restatement match the reference; unit: dependency-table.test.ts: dedupeByKey first ordinal wins and order kept; audit fails when a synthesize prompt key has no entry; unit: shared-context.test.ts: reference context in the admission rule, unfittable reference names the reference context, fitting reference leaves the stated section room; unit: shared-context.test.ts: an oversized single rule record is cut into sections, each part sees every section in sequence, rule-source count from the whole reference, no HandlingBudgetError | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Helper call layer: repair loop, admission per attempt, failure classification | M | — | `t2`, `t3` | unit: handling-call.test.ts: provider called with {maxAttempts:1, internalRetry:false}, repair note capped at 8,000 characters, every attempt admitted before it is sent, no internal retry allowed; unit: handling-call.test.ts: failure classification by cause: schema-invalid is invalid-reply, transport and Vibe exit are call-failed, size refusal divided before classification; integration: provider-failure-kinds.test.ts: real Vibe, Claude and Codex adapters make exactly one attempt on a failing reply; Ollama request carries num_predict 8,192 for parts; malformed replies give invalid-answer, transport failures give model-failed | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 7 | **`t7`** Helper division and assembly: parts, combine, adapters, terminal precedence | L | — | `t4`, `t5`, `t6` | unit: partition-combine.test.ts: serial parts, division up to three times, repair exhaustion never discards a successful part, combine terminates and a combine failure returns per-part results with 'combine' in notCovered; unit: partition-combine.test.ts: terminal precedence by cause (unadmittable, invalid-reply, call-failed) with partFailures kinds and cause chains; unit: partition-combine.test.ts: bundle and aggregate adapters keep evidence layers and findings exactly through several combine stages; integration: partition-combine.test.ts: mixed oversized-envelope and admissible blocks return the covered parts with the oversized block in notCovered; integration: shared-context.test.ts: adherence regression with rule and code sites forced into separate parts, rule in every part and combine call, every site classified; a rule too large gives HandlingBudgetError naming the reference context; integration: dependency-table.test.ts: capability and code regressions with forced partitions and deduped Related modules, Related docs and surface; integration: provider-failure-kinds.test.ts: Vibe outage on every part of a divided call gives typed model-failed with no prefix; malformed Vibe reply gives invalid-answer | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 8 | **`t8`** synthesizeHandled, the synthesize wrapper and the driver's report transition | M | — | `t1`, `t7` | integration: synthesize-handling.test.ts: XS or S admitted makes the one call of today; M or larger or not admitted divides and a failed part is named; integration: synthesize-driver-handling.test.ts: through the real context driver a partitioned success, a failed part and the combine fallback deliver the report with handling, uncovered parts and complete false; single pass keeps lookup completeness; the model's own report is never used | [[c1]] [[c2]] [[c4]] [[c5]] |
| 9 | **`t9`** Free-form lookup: size, the failure bridge and single-pass normalisation | L | — | `t2`, `t7`, `t8` | integration: freeform-handling.test.ts: size reaches runFinalStructuredEmit; fits at S returns directly with single-pass handling; at M divided although it fits; integration: freeform-handling.test.ts: HandlingBudgetError, model-failed and invalid-answer become LookupFailedError with tool results, handling and answerStepReason, errorCode 'answer-step:<reason>', through executePlan with no second synthesis; integration: freeform-handling.test.ts: single-pass final-emit failure (ShaperLlmUnavailableError, ShaperSchemaUnrecoverable) is normalised into the bridge and keeps findings | [[c1]] [[c3]] [[c4]] [[c5]] |
| 10 | **`t10`** Aggregator on the helper and aggregate failure capture | M | — | `t2`, `t7` | unit: model-failure.test.ts: classifyError keeps prefixes and messages and sets the original as cause; single-pass Vibe exit gives the 'aggregator-llm-unavailable:' prefix; integration: aggregator-handling.test.ts: aggregator divides an oversized input and keeps the absent-input section in every part and combine call; integration: aggregate-failure.test.ts: real aggregator, walker and stored task record keep failureData, original cause, upstream values with producer identities and each failed part's cause chain; integration: docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker with a final report and its handling | [[c1]] [[c3]] [[c4]] [[c5]] |
| 11 | **`t11`** Orchestrator failure route, plan sources and nested handling | M | — | `t1`, `t2`, `t10` | integration: aggregate-failure.test.ts: failure data including partFailures and upstream reaches RunFailure.data under 'executor-aggregator-failed' through the orchestrator; integration: nested-aggregate-failure.test.ts: a failed nested aggregate under a succeeding root makes the run incomplete and names it, with no run failure raised; integration: run-handling-report.test.ts: root and nested aggregates with uncovered parts make the run incomplete, handling merged and the head shows the handling line; integration: docs-aggregate-run.test.ts: the broad docs run completes through the orchestrator with a final report | [[c1]] [[c3]] [[c4]] [[c5]] |
| 12 | **`t12`** Daemon and plan-tree mappings carry partFailures | S | — | `t2` | integration: answer-failure-mapping.test.ts: HandlingBudgetError carries results and report through the daemon and plan-tree mappings; integration: answer-failure-mapping.test.ts: both mappings carry partFailures with distinct outer and inner cause messages through a JSON round trip, and a failure without partFailures maps as before | [[c3]] [[c4]] |
| 13 | **`t13`** Step tool: AnswerProgress, part and combine turns, retries | L | — | `t7`, `t8` | unit: step-tool-overload.test.ts: compile-time check that finalizeSynthesize(input.bundle, execution) resolves to the first overload and the progress call to the second; integration: step-tool-parts.test.ts: prepareAnswerTurn creates progress, state without progress reads as single pass, emit_part and emit_combine carry reference context, progress persisted with token replacement and released on terminal success and failure; integration: step-tool-parts.test.ts: invalid reply re-emits the turn with a new token and retry note, retry bound marks a part not covered across calls, retries reset on advance, typed failure returned as StepOutputError with data; integration: step-tool-parts.test.ts: the legacy emit_bundle turn still passes for an input that fits and the registered MCP bundle argument is unchanged | [[c1]] [[c2]] [[c4]] [[c5]] |
| 14 | **`t14`** Whole-Story verification and the live regression record | M | — | `t9`, `t11`, `t12`, `t13` | live: docs-broad-live.test.ts: the broad docs request on this repository runs to a final report and the run id, handling line, parts and completeness are recorded as the regression record; integration: provider-failure-kinds.test.ts: all four adapters, output cap and Vibe single-pass prefix verified together after every caller is moved | [[c4]] [[c5]] |

### 1.1 TASK-b9d5c5c40df5a574-s3-t1 — HandlingReport, parseHandling, mergeHandling, applyHandling and the report head line

Type HandlingReport with budgets in their own units, optional trigger, combineStages and 'mixed'; add parseHandling (malformed value read as absent), mergeHandling (prefix-qualified part ids, budgets de-duplicated per unit), applyHandling (handling plus one incomplete source note per uncovered part, complete false) and the single handling line in renderReportHead; type AnswerReport.handling and merge it in mergeAnswerReports without changing its signature.

**Acceptance checks:**
- parseHandling reads a stored {} and any malformed value as absent and accepts a record with and without trigger
- mergeHandling keeps units apart, qualifies part ids with the plan path and returns 'partitioned' for a single-pass root with a partitioned child
- applyHandling sets complete false and adds an 'answer step / <part id>' note per uncovered part without mutating its input
- renderReportHead is unchanged for a report without handling and adds one line with it

### 1.2 TASK-b9d5c5c40df5a574-s3-t2 — Error fields, failure data and the Vibe wording

Add HandlingBudgetError with the 'input-does-not-fit' reason and the optional upstream and partFailures fields (with FailureCause) to ShaperAnswerStepFailedError; add failureData with the bounded JSON-safe cause builder; add 'vibe exited with' to CLI_FAILURE_TEXTS; add handling and answerStepReason to LookupFailedError; add the optional data field to TaskExecutionRecord.

**Acceptance checks:**
- failureData gives the typed and plain shapes, nests a cause at most 3 levels, records a non-Error cause as a string and survives JSON.stringify and parse
- isModelCallFailure recognises a Vibe non-zero exit with and without the retry prefix, not inside quoted text, and still not a size refusal or a schema-invalid reply
- the added error and record fields are optional and existing callers compile unchanged

### 1.3 TASK-b9d5c5c40df5a574-s3-t3 — HANDLING_TABLE, the admission rule and the output caps

Add the size-to-method table (undetermined is XL), the two-unit admission rule (CLI characters minus 16,000; local UTF-8 bytes against window minus output tokens minus 2,048; default 60,000), PART_MAX_OUTPUT_TOKENS 8,192 for local part and combine calls, and the trigger decision (size, fit, both) with the budgets it records.

**Acceptance checks:**
- a local single pass is admitted at exactly 10,240 bytes and divided one byte over, with multi-byte text counted in bytes
- the real code, adherence and docs prompt sizes give the stated single-pass decisions and every part prompt plus the minimum room fits 22,528 bytes
- a CLI provider is admitted in characters and the units are never compared
- a window that leaves less than the fixed context plus 4,000 bytes raises HandlingBudgetError naming the configuration

### 1.4 TASK-b9d5c5c40df5a574-s3-t4 — Sections with envelopes, structural sectioning of nested records, per-block unadmittable

Add sectionBlock: cut only the sectionable text field into the largest whole code-point prefixes that fit the room minus the envelope, repeat the envelope (doc outputs: sourceEntityId, file, heading, kind; hits: file and line; aggregate upstream outputs: taskId, template, params) at the head of every section, and cut an aggregate upstream value structurally by its nested records so each record's sourceEntityId, file and heading head every section of it (finding 2). An envelope that leaves less than the minimum room marks only that block unadmittable, not the whole call (finding 3).

**Acceptance checks:**
- 6,000 ASCII bytes in a room of 5,000 give 5,000 and 1,000 and 4,999 bytes then an emoji give 4,999 and a section starting with the emoji, with lossless decoding
- an oversized doc.constraint.enumerate record yields sections that each carry sourceEntityId, file, heading and kind, whose cut fields concatenate to the original and that fit the room
- an aggregate upstream value with nested decision and constraint records is cut so every section repeats the nested record's sourceEntityId, file and heading as well as taskId, template and params
- an envelope too large for one block marks that block unadmittable and leaves the other blocks admissible

### 1.5 TASK-b9d5c5c40df5a574-s3-t5 — Dependency table, reference context, dedupe keys and oversized reference evidence

Add the DEPENDENCY table read from the six synthesizer prompts, selectSharedContext (adherence rule outputs, capability reuse-check outputs, code anchor extract, none for docs, data and infra), DEDUPE_KEYS with dedupeByKey, and the audit that every prompt key has an entry. Handle a reference record larger than the room without ending in HandlingBudgetError (finding 1): cut it into sections with its envelope and pair every section of the reference evidence with the parts that depend on it, so each part is judged against the whole reference in sequence, with the rule-source count and restatement still computed in code from the whole reference.

**Acceptance checks:**
- selectSharedContext returns the stated blocks per target and removes them from the partition blocks
- dedupeByKey lists an entry that appears in several parts once, first ordinal winning
- the audit test fails when a synthesize prompt key has no table entry
- an adherence request whose single rule record exceeds the room is cut into sections with its envelope, every part is judged against every section of the reference in sequence, and the rule-source count comes from the whole reference
- no code site is dropped for that oversized-reference request and it never ends in HandlingBudgetError

### 1.6 TASK-b9d5c5c40df5a574-s3-t6 — Helper call layer: repair loop, admission per attempt, failure classification

Implement the single-call layer of the shared helper: completeStructured with maxAttempts 1 and internalRetry false, repair prompt built by the helper with the note capped at 8,000 characters, admission before every attempt, and per-call failure classification by cause (call-failed, invalid-reply, unadmittable) with a size refusal reported as divisible before classification.

**Acceptance checks:**
- no provider retries: the real Vibe, Claude and Codex adapters make exactly one attempt per call
- a thrown schema-invalid reply is invalid-reply, not call-failed, and a transport failure is call-failed
- the repair note is capped at 8,000 characters and admission is checked before every attempt
- a size refusal (InputTooLargeError) is reported for division before it is classified

### 1.7 TASK-b9d5c5c40df5a574-s3-t7 — Helper division and assembly: parts, combine, adapters, terminal precedence

Build the division layer on the call layer: serial parts with division up to three times, the staged combine of N into ceil(N/g) with the per-part fallback ('combine' in notCovered), assembly adapters for the bundle and the aggregate, per-block unadmittable handling that keeps covered parts, and the terminal precedence (HandlingBudgetError only when every uncovered part is unadmittable, else model-failed or invalid-answer) with partFailures and bounded causes.

**Acceptance checks:**
- terminal precedence follows the stated rule across unadmittable, call-failed and invalid-reply parts
- a failed part is kept out, the others are kept, a combine failure returns the per-part results with 'combine' in notCovered, and a successful part is never discarded
- a mixed request with one oversized-envelope block and admissible blocks returns the covered parts with the oversized block in notCovered
- a single-pass call keeps the legacy route with the original error as cause

### 1.8 TASK-b9d5c5c40df5a574-s3-t8 — synthesizeHandled, the synthesize wrapper and the driver's report transition

Move synthesize onto the helper through synthesizeHandled (synthesize stays a wrapper returning the layers), and in the context driver apply the handling to found.report with applyHandling and return the updated found in the 'bundle' outcome so settlePipelineOutcome stamps it.

**Acceptance checks:**
- an XS or S admitted request makes the same single call as today
- through the real driver a partitioned success, a failed part and a combine fallback deliver a bundle whose report carries the handling, the uncovered parts and complete false, and a single-pass answer keeps the lookups' completeness
- the model's own report is never used

### 1.9 TASK-b9d5c5c40df5a574-s3-t9 — Free-form lookup: size, the failure bridge and single-pass normalisation

Pass the request size to runFinalStructuredEmit through the tool loop and move it onto the helper; make the free-form lookup carry every ShaperAnswerStepFailedError as a LookupFailedError with its data, handling and answerStepReason, have failedOutput copy the reason as errorCode 'answer-step:<reason>', and copy handling in extractSoleFreeformResult. Normalise a single-pass final-emit failure (ShaperLlmUnavailableError, ShaperSchemaUnrecoverable) into the same reason-preserving bridge so the gathered findings are kept and no second synthesis runs (finding 4).

**Acceptance checks:**
- HandlingBudgetError, model-failed and invalid-answer each reach the answer-step failure with their reason and the report through the real executor and context driver
- an admitted XS or S conversation whose final emission fails by transport or by an invalid reply keeps its tool results and ends in the terminal answer-step failure with no second synthesis attempt
- a conversation that fits at size S returns directly with single-pass handling and at size M is divided

### 1.10 TASK-b9d5c5c40df5a574-s3-t10 — Aggregator on the helper and aggregate failure capture

Move runAggregator onto the helper (absent-input section counted in every part and combine call), make classifyError keep the original as cause for a single-pass call, and keep any aggregate failure as failureData in TaskExecutionRecord.data in executeLeafTask.

**Acceptance checks:**
- through the real aggregator, walker and stored task record the failure data, the original cause and, for typed errors, the upstream values, producer identities and each failed part's cause chain are present in the task record
- a single-pass aggregate failure keeps the prefixed error with the original as cause
- the absent-input section is counted in admission of every part and combine call
- a broad docs aggregate with an oversized terminal input completes through the real docs aggregate runtime and walker and delivers a final report with its handling

### 1.11 TASK-b9d5c5c40df5a574-s3-t11 — Orchestrator failure route, plan sources and nested handling

Copy the kept task failure data to RunFailure.data in the orchestrator, make collectPlanSources read a failed planner task's kept child result and each aggregate's handling, and have concludeRun merge nested handling.

**Acceptance checks:**
- through the orchestrator the failure data of a failed aggregate, including partFailures and upstream, is present in RunFailure.data
- a failed nested aggregate under a succeeding root makes the run incomplete and names it
- a nested plan's handling is merged with prefix-qualified part ids in the final report
- the broad docs run check is repeated here through the orchestrator so a regression fails early

### 1.12 TASK-b9d5c5c40df5a574-s3-t12 — Daemon and plan-tree mappings carry partFailures

Extend the data the daemon mapping in src/daemon/analyze-rpc.ts and the plan tree's mapping in src/analyze/orchestrator/driver.ts build for a ShaperAnswerStepFailedError so it carries the JSON-safe partFailures and upstream with reason, results and report (finding 5).

**Acceptance checks:**
- through both mappings distinct outer and inner cause messages of several failed parts are present in the data and survive a JSON round trip
- the existing fields of the data are unchanged and a lookup-path failure without partFailures maps as before

### 1.13 TASK-b9d5c5c40df5a574-s3-t13 — Step tool: AnswerProgress, part and combine turns, retries

Add the optional AnswerProgress (plan with reference blocks and envelopes, decision, budgets, parts) to the step state, startAnswerProgress in prepareAnswerTurn, the progress overload of finalizeSynthesize beside the unchanged bundle overload, the emit_part and emit_combine outputs with the retry field, persistence on every transition and a typed failure as StepOutputError with data.

**Acceptance checks:**
- finalizeSynthesize(input.bundle, execution) still resolves to the first overload and compiles unchanged
- an invalid reply re-emits the current turn with a new token and a retry note, repeated invalid replies reach the retry bound, and a state without progress is read as single pass
- emit_part and emit_combine turns carry the reference context for the targets that have it

### 1.14 TASK-b9d5c5c40df5a574-s3-t14 — Whole-Story verification and the live regression record

Run the remaining cross-path integration tests the other tasks leave open (provider failure kinds across all four adapters, output cap, dependency regressions with forced partitions, nested-plan handling) and the INSRC_LIVE_TESTS regression of the broad docs request, repeating the docs run live and keeping the recorded run as the regression record; then the one full sweep in foreground chunks.

**Acceptance checks:**
- the capability, code and dedupe forced-partition regressions pass
- the live broad docs request returns a final report and its run is recorded
- the full sweep passes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| HANDLING_TABLE: XS and S single pass, M, L and XL partitioned, an undetermined measure is XL | `t3` |
| decision: the table alone divides (trigger 'size'), the admission rule alone divides a small size ('fit'), both give 'both', a single pass has no trigger | `t3` |
| admission for a local model with the checked-in values (32,768 window, 20,480 single-pass output, 2,048 reserve) is 10,240 bytes for a single pass: exactly 10,240 is admitted, one byte over is divided, multi-byte text is counted in bytes; part and combine calls use PART_MAX_OUTPUT_TOKENS 8,192 and a limit of 22,528 bytes; a window that leaves less than fixed context plus 4,000 bytes gives HandlingBudgetError naming the configuration | `t3` |
| with the real code, adherence and docs prompts the single-pass decision for the checked-in local configuration is 'not admitted' for code (10,652 bytes) and adherence (11,040), and admitted for docs only when the evidence is at most 3,916 bytes; every part prompt plus the 4,000-byte minimum room (15,040 at most) fits 22,528 | `t3` |
| a CLI provider is admitted in characters against its declared budget minus 16,000, and the two units are never compared | `t3` |
| the helper calls the provider with {maxAttempts: 1, internalRetry: false} and builds each repair prompt itself: the note is capped at 8,000 characters with the rest counted, every attempt is admitted before it is sent, and a fake provider that would retry internally is never allowed to | `t6` |
| repair exhaustion has one outcome: an unadmitted repair divides the part up to three times, then the part is recorded as not covered and the others continue; a part that already succeeded is never discarded | `t7` |
| terminal precedence when no part is covered, with failures classified by cause: every uncovered part 'unadmittable' gives HandlingBudgetError; a mix of unadmittable and 'invalid-reply' parts gives ShaperAnswerStepFailedError 'invalid-answer'; any 'call-failed' part (isModelCallFailure, including a Vibe non-zero exit) gives 'model-failed'; a thrown schema-invalid error (ModelResponseShapeError, SynthesizerSchemaUnrecoverable) is 'invalid-reply', not 'call-failed'; each part's own reason is in notCovered and its kind and cause chain in partFailures | `t6`, `t7` |
| sections cut only the sectionable text field, into the largest whole code-point prefix that fits the room: a 6,000-byte ASCII block in a room of 5,000 gives 5,000 and 1,000; 4,999 ASCII bytes then a four-byte emoji gives 4,999 and a second section that starts with the emoji; every section decodes to valid text, none overlaps, none is dropped; ordinals separate from keys | `t4` |
| section envelopes: an oversized real-shaped doc.constraint.enumerate record whose constraint text and rationale cross section boundaries yields sections that each carry sourceEntityId, file, heading and kind, whose cut fields concatenate to the original, and that each fit the room (room minus envelope); an aggregate upstream value larger than the room yields sections that each carry taskId, template and params; an envelope that leaves less than the 4,000-unit minimum gives HandlingBudgetError naming the envelope | `t4` |
| combine terminates: N summaries become ceil(N/g) per stage and a stage whose count does not fall is a combine failure | `t7` |
| a combine failure, including a combine that is not admitted, with at least one part covered returns the per-part results with 'combine' in notCovered and throws nothing | `t7` |
| the bundle adapter and the aggregate adapter keep evidence layers and findings exactly, in order, through several combine stages | `t7` |
| parseHandling reads a stored {} and other malformed values as absent, and accepts a record with and without trigger | `t1` |
| mergeHandling: absent side ignored; single-pass root with partitioned child gives 'partitioned' and summed parts; budgets concatenated and de-duplicated in their own units keeping the largest inputSize, so a local 'bytes-bound' entry survives a merge with a CLI entry; combineStages sum; partitionedBy 'mixed'; equal local part ordinals in two nested plans stay distinct by plan path | `t1` |
| mergeAnswerReports keeps its binary signature and prefix behaviour | `t1` |
| renderReportHead: a report without handling renders exactly as today; with handling it adds one line with method, parts, each budget in its unit and each not-covered part with its reason | `t1` |
| a compile-time test: the bundle handler's call finalizeSynthesize(input.bundle, execution) resolves to the first overload and its result is assignable to the bundle layers; the progress call resolves to the second overload | `t13` |
| applyHandling: a single-pass handling with no uncovered part keeps complete as it was; a partitioned handling with an uncovered part or a 'combine' entry sets complete false and adds one incomplete source note 'answer step / <part id>' per uncovered part; the input report is not mutated | `t1` |
| failureData: a typed error gives { kind:'answer-step', reason, found, upstream, partFailures, handling }; a plain Error gives { kind:'error', name, message, cause } nested at most 3 levels; a non-Error cause is recorded as its string; the value contains no Error object or cycle and survives JSON.stringify and JSON.parse unchanged; upstream keeps taskId, template, params and value of every output in order; partFailures keeps one entry per failed part with its kind, reason and cause chain | `t2` |
| classifyError keeps its prefixes and messages and sets the original error as the cause; the cause chain of 'aggregator-llm-unavailable:' and 'aggregator-schema-unrecoverable:' errors holds the provider's original error; it is applied only to a single-pass call | `t10` |
| the part and combine output cap: for a local model the helper passes maxTokens 8,192 (PART_MAX_OUTPUT_TOKENS) and a single pass passes the configured output tokens; for a CLI provider it passes no enforced output cap and the admission is input characters only | `t3` |
| isModelCallFailure: 'vibe exited with 1.' is a call failure with and without the 'structured-output: validation failed after 2 attempts: ' prefix; 'vibe exited with' inside quoted answer text is not; a Vibe size refusal message (InputTooLargeError) is excluded by the division rule before classification; Claude and Codex wordings are unchanged; a schema-invalid reply is not a call failure | `t2`, `t6` |
| classifyError on a single-pass Vibe exit gives the 'aggregator-llm-unavailable:' prefix (previously 'aggregator-schema-unrecoverable:') with the original error as the cause; Claude and Codex exits keep their prefix | `t10` |
| selectSharedContext (reference context): for 'adherence' it returns the doc.constraint.enumerate and doc.decision.trace outputs, for 'capability' the capability.reuse-check outputs, for 'code' the anchor record of concept.resolve (anchor.source, anchor identity and, when ranked, hits[0]) as a structural extract, in plan order; for 'docs', 'data' and 'infra' it returns nothing; the returned blocks are absent from the partition blocks; the rule-source count and the rule restatement computed in code match the reference blocks | `t5` |
| dedupeByKey: with DEDUPE_KEYS, an entry that appears in the Related docs, Related modules or surface sub-section of several parts is listed once, the first occurrence by part ordinal winning, and the order of the rest is kept | `t5` |
| the DEPENDENCY audit: every registered synthesize prompt key (code, docs, adherence, capability, data, infra) has an entry in the table, each entry names its reference blocks and deduped sub-sections or records that it has none and why, and the test fails when a key is added without an entry | `t5` |
| reference context in the admission rule: fixed prompt plus reference context plus the 4,000-unit minimum room that does not fit gives HandlingBudgetError whose message names the reference context; one that fits leaves the room for a section equal to the budget minus the prompt minus the reference context minus the envelope, and the reference context is not sectioned | `t5` |
| the real adapters driven through completeStructured with {maxAttempts: 1, internalRetry: false}: Vibe, Claude and Codex (CliProvider with the underlying process stubbed) each make exactly one attempt on a failing reply; the CLI adapters are checked for the single attempt only, since they do not enforce maxTokens (this is asserted, so a later change is noticed) | `t6` |
| adapter-level output cap and malformed-reply tests: the OllamaProvider request for a part or combine call carries num_predict 8,192 and a single-pass request carries the configured output tokens; a reply cut at the cap (truncated JSON) is handled as an invalid reply; malformed replies from every part through the real Ollama, Vibe, Codex and Claude adapters give ShaperAnswerStepFailedError 'invalid-answer' and a transport failure gives 'model-failed' | `t6`, `t14` |
| a non-size Vibe exit failure through the real Vibe adapter (child process stubbed to exit non-zero) for every part of a divided call gives 'call-failed' per part and the terminal typed ShaperAnswerStepFailedError 'model-failed' with no aggregator prefix; a Vibe malformed reply for every part still gives 'invalid-answer'; the same Vibe exit on a single-pass aggregator call through the real runAggregator gives the Error with the 'aggregator-llm-unavailable:' prefix and the original as its cause | `t7`, `t10` |
| adherence regression with the rule and the code sites forced into separate parts, through the real synthesizer and a scripted provider: the rule outputs (docs/) and the code sites (src/) are placed so that division puts them in different parts; the scripted provider asserts that the rule text is present in the prompt of every part and every combine call, that no partition block repeats the rule as evidence, and that its reply classifies each site against the rule; the delivered answer has every site classified as match, drift or contradiction and none dropped, and the rule-source count equals the number of rule outputs; the same request with a rule too large to accompany every part gives HandlingBudgetError naming the reference context | `t7`, `t5` |
| capability and code regressions with forced partitions: a capability request whose concept.resolve hit equals a capability.reuse-check candidate, with the hit and the candidates in different parts, does not list the hit under Related modules (the prompt of the part holding the hit contains the candidates), and a module seen in two parts is listed once; a code request with the concept.resolve anchor and the anchor's callers in different parts has the anchor record in the prompt of every part and the delivered bundle is centred on it; a file seen in the Related docs or surface sub-sections of two parts is listed once | `t7`, `t5` |
| the ordinary lookup path through the real context driver (steps.synthesizeHandled, applyHandling, settlePipelineOutcome and the stamp callback) with a scripted provider: a successful partitioned answer delivers a bundle whose report.handling is the partitioned handling; a run with a failed part delivers a bundle whose report.handling.notCovered names the part, whose incomplete sources include 'answer step / <part id>' and whose completeness.complete is false; the combine fallback delivers the per-part results with 'combine' in notCovered and complete false; a single-pass answer keeps the lookups' completeness; the model's own report is never used | `t8` |
| synthesize: XS or S and admitted makes the one call of today; M or larger, or not admitted, divides, and a failed part is named | `t8` |
| free-form lookup: the request size reaches runFinalStructuredEmit through the tool loop; a conversation that fits at size S returns directly with single-pass handling copied onto the report reportFromLookups derives; at size M it is divided although it fits; HandlingBudgetError, 'model-failed' and 'invalid-answer' failures each become a LookupFailedError carrying the tool results, the handling and answerStepReason, failedOutput gives errorCode 'answer-step:<reason>', the failure survives executePlan, does not take the short-circuit and reaches the answer-step failure with the same reason and the report, with no second synthesis attempt | `t9` |
| runAggregator with the absent-input section counted in every part and every combine call | `t10` |
| a HandlingBudgetError, an every-part-failed ShaperAnswerStepFailedError and a plain single-pass aggregator Error from the root runAggregator through the real aggregator, the real walker and the orchestrator: classifyError keeps the original as the cause, executeLeafTask (real signature, returning TaskExecutionRecord) keeps failureData in the failed-task record, the record is written and read back through the real store (JSON), and the run failure has the code 'executor-aggregator-failed' with the data in RunFailure.data; for the typed errors found.results is [], upstream holds the actual upstream values with their taskId, template and params, which are compared with the inputs the aggregator was given at every stage, and with several failed parts partFailures keeps each part's kind, reason and distinct outer and inner cause messages; the original cause's message is checked for the plain error, and the report names the uncovered parts | `t10`, `t11` |
| a nested plan whose aggregate fails while the root aggregate succeeds from sibling outputs: executePlannerTask returns the failed planner record with its kept childResult, collectPlanSources reads the child and adds the nested sources, concludeRun merges the nested handling, and the run is incomplete and names the nested failure with no run failure raised | `t11` |
| collectPlanSources and concludeRun with a root and a nested aggregate that each have uncovered parts: the run is incomplete, the handling is merged and the visible head shows the handling line | `t11` |
| the driver passes HandlingBudgetError through; the daemon's mapping in analyze-rpc and the plan tree's mapping in the orchestrator driver both return its results and report, tested through those mappings and not only through the driver | `t12` |
| step tool through the real handler: prepareAnswerTurn creates the initial progress (plan with reference blocks and envelopes, decision, budgets; 'single' or 'partitioned') and a state without progress is read as single pass; finalizeSynthesize with a saved and with a session-memory execution, with and without progress, the progress overload deciding from the stored plan whether another part remains and returning the HandlingReport; emit_part and emit_combine turns, each carrying the reference context for the targets that have it; replies through the registered bundle argument; progress persisted with token replacement; an invalid reply re-emits the current turn with a new token and a retry note, and the client can continue; repeated invalid replies across separate calls reach the retry bound; retries reset when a turn advances; progress released on terminal success and failure; a typed failure returned as StepOutputError with data | `t13` |
| the legacy emit_bundle turn still passes for an input that fits | `t13` |
| a broad docs analysis run through the real docs aggregate runtime and the plan walk, with an oversized terminal input and a nested aggregate: the run completes, the final report is delivered, and its head states the handling and the completeness | `t10`, `t11` |
| the broad docs request on this repository that previously stopped at the aggregate step runs to a final report, and the recorded run (run id, handling line, parts, completeness) is kept as the regression record | `t14` |
| HandlingReport against the sc4 sketch plus the additive fields, with and without trigger, budgets in their own units | `t1` |
| the bundle schema keeps its open handling object valid and AnswerReport.handling is typed | `t1` |
| the registered MCP bundle argument is unchanged | `t13` |
| RunFailure's shape and the code 'executor-aggregator-failed' are unchanged | `t2` |
| TaskExecutionRecord gains only the optional data field, LookupFailedError only the optional handling and answerStepReason, and ShaperAnswerStepFailedError only the optional upstream and partFailures fields | `t2` |
| AggregateFailureData and the added optional fields (TaskExecutionRecord.data, LookupFailedError.handling and answerStepReason, ShaperAnswerStepFailedError.upstream and partFailures) are JSON-safe and additive | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contract: the size table, admission rule and shared helper for four callers`
- **[[c2]]** `prior-artifact` `LLD s3 data model: HandlingReport, section envelopes, reference context and failure data`
- **[[c3]]** `prior-artifact` `LLD s3 error paths: failure kinds, terminal precedence and the answer-step bridge`
- **[[c4]]** `prior-artifact` `LLD s3 test strategy: unit, integration, live and contract levels`
- **[[c5]]** `prior-artifact` `LLD s3 migration: the order in which callers move onto the helper`
