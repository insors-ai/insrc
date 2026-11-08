<!-- insrc:artifact TESTS-b9d5c5c40df5a574-s3 -->

# Tests: b9d5c5c40df5a574 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 50 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-08T07:27:38.942Z on commit `9737da057`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: handling-report.test.ts: parseHandling reads {} and malformed values as absent and accepts a record with and without trigger**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseHandling reads {} and malformed values as absent and accepts a record with and without trigger | `src/analyze/__tests__/handling-report.test.ts` |

**unit: handling-report.test.ts: mergeHandling keeps units apart, de-duplicates budgets, sums combineStages, gives 'mixed' and keeps plan-qualified part ids distinct**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mergeHandling keeps units apart, de-duplicates budgets, sums combineStages, gives 'mixed' and keeps plan-qualified part ids distinct | `src/analyze/__tests__/handling-report.test.ts` |

**unit: handling-report.test.ts: applyHandling sets complete false, adds one 'answer step / <part id>' note per uncovered part and does not mutate its input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | applyHandling sets complete false, adds one 'answer step / <part id>' note per uncovered part and does not mutate its input | `src/analyze/__tests__/handling-report.test.ts` |

**unit: handling-report.test.ts: renderReportHead is unchanged without handling and adds one line with it; mergeAnswerReports keeps its binary signature**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderReportHead is unchanged without handling and adds one line with it; mergeAnswerReports keeps its binary signature | `src/analyze/__tests__/handling-report.test.ts` |

**unit: handling-contract.test.ts: HandlingReport against the sc4 sketch plus additive fields, bundle schema open handling object still valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | HandlingReport against the sc4 sketch plus additive fields, bundle schema open handling object still valid | `src/analyze/__tests__/handling-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/__tests__/handling-contract.test.ts` | 0 | 1 | 0.5 s |  |
| `src/analyze/__tests__/handling-report.test.ts` | 0 | 4 | 0.4 s |  |

## t2

Run at 2026-11-08T07:30:54.523Z on commit `4f878032e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: failure-data.test.ts: typed and plain shapes, 3-level cause bound, non-Error cause as string, JSON round trip, upstream and partFailures kept in order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | typed and plain shapes, 3-level cause bound, non-Error cause as string, JSON round trip, upstream and partFailures kept in order | `src/analyze/context/__tests__/failure-data.test.ts` |

**unit: model-failure.test.ts: isModelCallFailure recognises 'vibe exited with' with and without the retry prefix, not in quoted text, and excludes size refusals and schema-invalid replies**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | isModelCallFailure recognises 'vibe exited with' with and without the retry prefix, not in quoted text, and excludes size refusals and schema-invalid replies | `src/analyze/context/__tests__/model-failure.test.ts` |

**unit: failure-contract.test.ts: RunFailure shape and code 'executor-aggregator-failed' unchanged; TaskExecutionRecord, LookupFailedError and ShaperAnswerStepFailedError gain only optional JSON-safe fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | RunFailure shape and code 'executor-aggregator-failed' unchanged; TaskExecutionRecord, LookupFailedError and ShaperAnswerStepFailedError gain only optional JSON-safe fields | `src/analyze/context/__tests__/failure-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/failure-contract.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/context/__tests__/failure-data.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/context/__tests__/model-failure.test.ts` | 0 | 12 | 0.7 s |  |

## t3

Run at 2026-11-08T07:34:09.787Z on commit `212188e17`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: handling-table.test.ts: XS and S single pass, M, L and XL partitioned, undetermined is XL, trigger size/fit/both and no trigger for single pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | XS and S single pass, M, L and XL partitioned, undetermined is XL, trigger size/fit/both and no trigger for single pass | `src/analyze/context/__tests__/handling-table.test.ts` |

**unit: handling-admission.test.ts: checked-in local values give 10,240 bytes, exact boundary, one byte over, multi-byte, 22,528 for parts, window too small gives HandlingBudgetError naming the configuration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | checked-in local values give 10,240 bytes, exact boundary, one byte over, multi-byte, 22,528 for parts, window too small gives HandlingBudgetError naming the configuration | `src/analyze/context/__tests__/handling-admission.test.ts` |

**unit: handling-admission.test.ts: real code, adherence and docs prompt sizes, CLI characters minus 16,000, units never compared, local code and adherence handled in parts with trigger 'fit'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real code, adherence and docs prompt sizes, CLI characters minus 16,000, units never compared, local code and adherence handled in parts with trigger 'fit' | `src/analyze/context/__tests__/handling-admission.test.ts` |

**unit: part-output-cap.test.ts: PART_MAX_OUTPUT_TOKENS 8,192 for local part and combine calls, configured tokens for single pass, no enforced cap for CLI**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | PART_MAX_OUTPUT_TOKENS 8,192 for local part and combine calls, configured tokens for single pass, no enforced cap for CLI | `src/analyze/context/__tests__/part-output-cap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/handling-admission.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/context/__tests__/handling-table.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/context/__tests__/part-output-cap.test.ts` | 0 | 1 | 0.7 s |  |

## t4

Run at 2026-11-08T07:41:26.980Z on commit `34ecc8199`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: partition-sections.test.ts: 6,000 over 5,000 gives 5,000 and 1,000; emoji boundary; valid text, no overlap, none dropped; ordinals separate from keys**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | 6,000 over 5,000 gives 5,000 and 1,000; emoji boundary; valid text, no overlap, none dropped; ordinals separate from keys | `src/analyze/context/__tests__/partition-sections.test.ts` |

**unit: section-envelope.test.ts: oversized real-shaped doc.constraint.enumerate record keeps sourceEntityId, file, heading and kind in every section and reconstructs the original**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | oversized real-shaped doc.constraint.enumerate record keeps sourceEntityId, file, heading and kind in every section and reconstructs the original | `src/analyze/context/__tests__/section-envelope.test.ts` |

**unit: section-envelope.test.ts: oversized aggregate upstream value with nested records repeats each nested record's citation fields plus taskId, template and params in every section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | oversized aggregate upstream value with nested records repeats each nested record's citation fields plus taskId, template and params in every section | `src/analyze/context/__tests__/section-envelope.test.ts` |

**unit: section-envelope.test.ts: an envelope leaving less than 4,000 units marks only that block unadmittable and the other blocks stay admissible**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an envelope leaving less than 4,000 units marks only that block unadmittable and the other blocks stay admissible | `src/analyze/context/__tests__/section-envelope.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/partition-sections.test.ts` | 0 | 1 | 0.7 s |  |
| `src/analyze/context/__tests__/section-envelope.test.ts` | 0 | 5 | 0.7 s |  |

## t5

Run at 2026-11-08T08:03:35.516Z on commit `b981ce8c0`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: shared-context.test.ts: selectSharedContext per target, blocks removed from partition blocks, rule-source count and restatement match the reference**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | selectSharedContext per target, blocks removed from partition blocks, rule-source count and restatement match the reference | `src/analyze/context/__tests__/shared-context.test.ts` |

**unit: dependency-table.test.ts: dedupeByKey first ordinal wins and order kept; audit fails when a synthesize prompt key has no entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | dedupeByKey first ordinal wins and order kept; audit fails when a synthesize prompt key has no entry | `src/analyze/context/__tests__/dependency-table.test.ts` |

**unit: shared-context.test.ts: reference context in the admission rule, unfittable reference names the reference context, fitting reference leaves the stated section room**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reference context in the admission rule, unfittable reference names the reference context, fitting reference leaves the stated section room | `src/analyze/context/__tests__/shared-context.test.ts` |

**unit: shared-context.test.ts: an oversized single rule record is cut into sections, each part sees every section in sequence, rule-source count from the whole reference, no HandlingBudgetError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an oversized single rule record is cut into sections, each part sees every section in sequence, rule-source count from the whole reference, no HandlingBudgetError | `src/analyze/context/__tests__/shared-context.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/dependency-table.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/context/__tests__/shared-context.test.ts` | 0 | 4 | 0.7 s |  |

## t6

Run at 2026-11-08T07:51:47.849Z on commit `9d1729343`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: handling-call.test.ts: provider called with {maxAttempts:1, internalRetry:false}, repair note capped at 8,000 characters, every attempt admitted before it is sent, no internal retry allowed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provider called with {maxAttempts:1, internalRetry:false}, repair note capped at 8,000 characters, every attempt admitted before it is sent, no internal retry allowed | `src/analyze/context/__tests__/handling-call.test.ts` |

**unit: handling-call.test.ts: failure classification by cause: schema-invalid is invalid-reply, transport and Vibe exit are call-failed, size refusal divided before classification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failure classification by cause: schema-invalid is invalid-reply, transport and Vibe exit are call-failed, size refusal divided before classification | `src/analyze/context/__tests__/handling-call.test.ts` |

**integration: provider-failure-kinds.test.ts: real Vibe, Claude and Codex adapters make exactly one attempt on a failing reply; Ollama request carries num_predict 8,192 for parts; malformed replies give invalid-answer, transport failures give model-failed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real Vibe, Claude and Codex adapters make exactly one attempt on a failing reply; Ollama request carries num_predict 8,192 for parts; malformed replies give invalid-answer, transport failures give model-failed | `src/analyze/context/__tests__/provider-failure-kinds.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/handling-call.test.ts` | 0 | 2 | 0.7 s |  |
| `src/analyze/context/__tests__/provider-failure-kinds.test.ts` | 0 | 1 | 1 s |  |

## t7

Run at 2026-11-08T08:02:09.753Z on commit `b981ce8c0`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: partition-combine.test.ts: serial parts, division up to three times, repair exhaustion never discards a successful part, combine terminates and a combine failure returns per-part results with 'combine' in notCovered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | serial parts, division up to three times, repair exhaustion never discards a successful part, combine terminates and a combine failure returns per-part results with 'combine' in notCovered | `src/analyze/context/__tests__/partition-combine.test.ts` |

**unit: partition-combine.test.ts: terminal precedence by cause (unadmittable, invalid-reply, call-failed) with partFailures kinds and cause chains**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal precedence by cause (unadmittable, invalid-reply, call-failed) with partFailures kinds and cause chains | `src/analyze/context/__tests__/partition-combine.test.ts` |

**unit: partition-combine.test.ts: bundle and aggregate adapters keep evidence layers and findings exactly through several combine stages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bundle and aggregate adapters keep evidence layers and findings exactly through several combine stages | `src/analyze/context/__tests__/partition-combine.test.ts` |

**integration: partition-combine.test.ts: mixed oversized-envelope and admissible blocks return the covered parts with the oversized block in notCovered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | mixed oversized-envelope and admissible blocks return the covered parts with the oversized block in notCovered | `src/analyze/context/__tests__/partition-combine.test.ts` |

**integration: shared-context.test.ts: adherence regression with rule and code sites forced into separate parts, rule in every part and combine call, every site classified; a rule too large gives HandlingBudgetError naming the reference context**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence regression with rule and code sites forced into separate parts, rule in every part and combine call, every site classified; a rule too large gives HandlingBudgetError naming the reference context | `src/analyze/context/__tests__/shared-context.test.ts` |

**integration: dependency-table.test.ts: capability and code regressions with forced partitions and deduped Related modules, Related docs and surface**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | capability and code regressions with forced partitions and deduped Related modules, Related docs and surface | `src/analyze/context/__tests__/dependency-table.test.ts` |

**integration: provider-failure-kinds.test.ts: Vibe outage on every part of a divided call gives typed model-failed with no prefix; malformed Vibe reply gives invalid-answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Vibe outage on every part of a divided call gives typed model-failed with no prefix; malformed Vibe reply gives invalid-answer | `src/analyze/context/__tests__/provider-failure-kinds.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/dependency-table.test.ts` | 0 | 2 | 0.8 s |  |
| `src/analyze/context/__tests__/partition-combine.test.ts` | 0 | 5 | 0.8 s |  |
| `src/analyze/context/__tests__/provider-failure-kinds.test.ts` | 0 | 2 | 1.2 s |  |
| `src/analyze/context/__tests__/shared-context.test.ts` | 0 | 4 | 0.7 s |  |

## t8

Run at 2026-11-08T08:28:49.199Z on commit `fa162a41d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: synthesize-handling.test.ts: XS or S admitted makes the one call of today; M or larger or not admitted divides and a failed part is named**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | XS or S admitted makes the one call of today; M or larger or not admitted divides and a failed part is named | `src/analyze/context/__tests__/synthesize-handling.test.ts` |

**integration: synthesize-driver-handling.test.ts: through the real context driver a partitioned success, a failed part and the combine fallback deliver the report with handling, uncovered parts and complete false; single pass keeps lookup completeness; the model's own report is never used**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | through the real context driver a partitioned success, a failed part and the combine fallback deliver the report with handling, uncovered parts and complete false; single pass keeps lookup completeness; the model's own report is never used | `src/analyze/context/__tests__/synthesize-driver-handling.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/synthesize-driver-handling.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/context/__tests__/synthesize-handling.test.ts` | 0 | 1 | 0.8 s |  |

## t9

Run at 2026-11-08T08:50:36.765Z on commit `3ab99723e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: freeform-handling.test.ts: size reaches runFinalStructuredEmit; fits at S returns directly with single-pass handling; at M divided although it fits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | size reaches runFinalStructuredEmit; fits at S returns directly with single-pass handling; at M divided although it fits | `src/analyze/context/__tests__/freeform-handling.test.ts` |

**integration: freeform-handling.test.ts: HandlingBudgetError, model-failed and invalid-answer become LookupFailedError with tool results, handling and answerStepReason, errorCode 'answer-step:<reason>', through executePlan with no second synthesis**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | HandlingBudgetError, model-failed and invalid-answer become LookupFailedError with tool results, handling and answerStepReason, errorCode 'answer-step:<reason>', through executePlan with no second synthesis | `src/analyze/context/__tests__/freeform-handling.test.ts` |

**integration: freeform-handling.test.ts: single-pass final-emit failure (ShaperLlmUnavailableError, ShaperSchemaUnrecoverable) is normalised into the bridge and keeps findings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | single-pass final-emit failure (ShaperLlmUnavailableError, ShaperSchemaUnrecoverable) is normalised into the bridge and keeps findings | `src/analyze/context/__tests__/freeform-handling.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/freeform-handling.test.ts` | 0 | 5 | 1.1 s |  |

## t10

Run at 2026-11-08T08:59:40.226Z on commit `79331bbb7`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-failure.test.ts: classifyError keeps prefixes and messages and sets the original as cause; single-pass Vibe exit gives the 'aggregator-llm-unavailable:' prefix**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classifyError keeps prefixes and messages and sets the original as cause; single-pass Vibe exit gives the 'aggregator-llm-unavailable:' prefix | `src/analyze/context/__tests__/model-failure.test.ts` |

**integration: aggregator-handling.test.ts: aggregator divides an oversized input and keeps the absent-input section in every part and combine call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | aggregator divides an oversized input and keeps the absent-input section in every part and combine call | `src/analyze/runtimes/__tests__/aggregator-handling.test.ts` |

**integration: aggregate-failure.test.ts: real aggregator, walker and stored task record keep failureData, original cause, upstream values with producer identities and each failed part's cause chain**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real aggregator, walker and stored task record keep failureData, original cause, upstream values with producer identities and each failed part's cause chain | `src/analyze/runtimes/__tests__/aggregate-failure.test.ts` |

**integration: docs-aggregate-run.test.ts: a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker with a final report and its handling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a broad docs run with an oversized terminal input and a nested aggregate completes through the real docs aggregate runtime and walker with a final report and its handling | `src/analyze/runtimes/__tests__/docs-aggregate-run.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/model-failure.test.ts` | 0 | 13 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/aggregate-failure.test.ts` | 0 | 1 | 0.9 s |  |
| `src/analyze/runtimes/__tests__/aggregator-handling.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/runtimes/__tests__/docs-aggregate-run.test.ts` | 0 | 1 | 0.9 s |  |

## t11

Run at 2026-11-08T09:08:42.304Z on commit `8f79bd61a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: aggregate-failure.test.ts: failure data including partFailures and upstream reaches RunFailure.data under 'executor-aggregator-failed' through the orchestrator**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failure data including partFailures and upstream reaches RunFailure.data under 'executor-aggregator-failed' through the orchestrator | `src/analyze/orchestrator/__tests__/aggregate-failure.test.ts` |

**integration: nested-aggregate-failure.test.ts: a failed nested aggregate under a succeeding root makes the run incomplete and names it, with no run failure raised**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failed nested aggregate under a succeeding root makes the run incomplete and names it, with no run failure raised | `src/analyze/orchestrator/__tests__/nested-aggregate-failure.test.ts` |

**integration: run-handling-report.test.ts: root and nested aggregates with uncovered parts make the run incomplete, handling merged and the head shows the handling line**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | root and nested aggregates with uncovered parts make the run incomplete, handling merged and the head shows the handling line | `src/analyze/orchestrator/__tests__/run-handling-report.test.ts` |

**integration: docs-aggregate-run.test.ts: the broad docs run completes through the orchestrator with a final report**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the broad docs run completes through the orchestrator with a final report | `src/analyze/orchestrator/__tests__/docs-aggregate-run.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/orchestrator/__tests__/aggregate-failure.test.ts` | 0 | 1 | 1.1 s |  |
| `src/analyze/orchestrator/__tests__/docs-aggregate-run.test.ts` | 0 | 1 | 0.9 s |  |
| `src/analyze/orchestrator/__tests__/nested-aggregate-failure.test.ts` | 0 | 1 | 0.8 s |  |
| `src/analyze/orchestrator/__tests__/run-handling-report.test.ts` | 0 | 1 | 0.8 s |  |

## t12

Run at 2026-11-08T09:12:58.287Z on commit `2cbe51e0c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: answer-failure-mapping.test.ts: HandlingBudgetError carries results and report through the daemon and plan-tree mappings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | HandlingBudgetError carries results and report through the daemon and plan-tree mappings | `src/analyze/context/__tests__/answer-failure-mapping.test.ts` |

**integration: answer-failure-mapping.test.ts: both mappings carry partFailures with distinct outer and inner cause messages through a JSON round trip, and a failure without partFailures maps as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both mappings carry partFailures with distinct outer and inner cause messages through a JSON round trip, and a failure without partFailures maps as before | `src/analyze/context/__tests__/answer-failure-mapping.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/answer-failure-mapping.test.ts` | 0 | 2 | 0.8 s |  |

## t13

Run at 2026-11-08T10:28:13.197Z on commit `25b2b0143`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: step-tool-overload.test.ts: compile-time check that finalizeSynthesize(input.bundle, execution) resolves to the first overload and the progress call to the second**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compile-time check that finalizeSynthesize(input.bundle, execution) resolves to the first overload and the progress call to the second | `src/daemon/steps/__tests__/step-tool-overload.test.ts` |

**integration: step-tool-parts.test.ts: prepareAnswerTurn creates progress, state without progress reads as single pass, emit_part and emit_combine carry reference context, progress persisted with token replacement and released on terminal success and failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prepareAnswerTurn creates progress, state without progress reads as single pass, emit_part and emit_combine carry reference context, progress persisted with token replacement and released on terminal success and failure | `src/daemon/steps/__tests__/step-tool-parts.test.ts` |

**integration: step-tool-parts.test.ts: invalid reply re-emits the turn with a new token and retry note, retry bound marks a part not covered across calls, retries reset on advance, typed failure returned as StepOutputError with data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid reply re-emits the turn with a new token and retry note, retry bound marks a part not covered across calls, retries reset on advance, typed failure returned as StepOutputError with data | `src/daemon/steps/__tests__/step-tool-parts.test.ts` |

**integration: step-tool-parts.test.ts: the legacy emit_bundle turn still passes for an input that fits and the registered MCP bundle argument is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the legacy emit_bundle turn still passes for an input that fits and the registered MCP bundle argument is unchanged | `src/daemon/steps/__tests__/step-tool-parts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/__tests__/step-tool-overload.test.ts` | 0 | 1 | 7.5 s |  |
| `src/daemon/steps/__tests__/step-tool-parts.test.ts` | 0 | 3 | 1.1 s |  |

## t14

Run at 2026-11-08T12:11:24.206Z on commit `93d763774`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**live: docs-broad-live.test.ts: the broad docs request on this repository runs to a final report and the run id, handling line, parts and completeness are recorded as the regression record**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/analyze/orchestrator/__tests__/docs-broad-live.test.ts` | 1 |

**integration: provider-failure-kinds.test.ts: all four adapters, output cap and Vibe single-pass prefix verified together after every caller is moved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all four adapters, output cap and Vibe single-pass prefix verified together after every caller is moved | `src/analyze/context/__tests__/provider-failure-kinds.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/provider-failure-kinds.test.ts` | 0 | 3 | 1.5 s |  |
| `src/analyze/orchestrator/__tests__/docs-broad-live.test.ts` | 0 | 1 | 0.4 s |  |
