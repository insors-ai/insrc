<!-- insrc:artifact TESTS-9b04adb36cac716d-s3 -->

# Tests: 9b04adb36cac716d s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 35 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-04T19:37:48.840Z on commit `e673bdfb5`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Strict impact/disposition/projection schemas reject extras, wrong branches and bounds; old full checkpoints decode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | strict impact/disposition/projection schemas reject extras, wrong branches and bounds | `src/workflow/review/design-review/__tests__/impact-contracts.test.ts` |
| pass | old full checkpoints decode and new attempt metadata remains bounded and strict | `src/workflow/review/design-review/__tests__/impact-contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-contracts.test.ts` | 0 | 2 | 0.7 s |  |

## t2

Run at 2026-11-04T19:41:50.260Z on commit `f36004a23`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Sequential admission/replay and two checkpoint-growth branches preserve history and reject invalid statuses**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sequential admission and replay preserve immutable initial submission and complete prior attempts | `src/workflow/review/design-review/__tests__/correction-admission.test.ts` |
| pass | correction admission rejects unfinished statuses, skipped ordinals, missing reports and failed saves | `src/workflow/review/design-review/__tests__/correction-admission.test.ts` |
| pass | checkpoint evolution freezes preparation and prior prefixes and rejects partial plan-impact pairs | `src/workflow/review/design-review/__tests__/correction-admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/correction-admission.test.ts` | 0 | 3 | 0.8 s |  |

## t3

Run at 2026-11-05T03:45:41.118Z on commit `175da675c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Backward provenance eligibility matrix and incomplete-source bypass rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | backward provenance resolves eligible chains and preserves findings without copying historical bodies | `src/workflow/review/design-review/__tests__/provenance.test.ts` |
| pass | retained origin rejection matrix prevents foreign forward cyclic missing invalidated and incomplete reuse | `src/workflow/review/design-review/__tests__/provenance.test.ts` |
| pass | retained source comparison rejects an older valid result when newer mapped coverage is also valid | `src/workflow/review/design-review/__tests__/provenance.test.ts` |
| pass | correction after an invalidated first attempt and full restart can retain the restarted coverage | `src/workflow/review/design-review/__tests__/impact-qualification.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-qualification.test.ts` | 0 | 2 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/provenance.test.ts` | 0 | 3 | 0.7 s |  |

## t4

Run at 2026-11-04T19:49:39.763Z on commit `1fa0ac6a7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Full-plan partition and explicit-full versus rejected-selective retry classification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | impact validates complete partition and safe equivalent retention with fresh consistency | `src/workflow/review/design-review/__tests__/impact-selection.test.ts` |
| pass | explicit full fallback consumes no retry while unsafe selective output is classified invalid_output | `src/workflow/review/design-review/__tests__/impact-selection.test.ts` |
| pass | impact carries canonical effective finding tuples and rejects missing or invented origins | `src/workflow/review/design-review/__tests__/impact-selection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-selection.test.ts` | 0 | 3 | 0.7 s |  |

## t5

Run at 2026-11-04T19:53:18.141Z on commit `e7d6aab14`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Interleaved selected order and impact reservation kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interleaved retained coverage schedules only the selected prefix and fresh final consistency | `src/workflow/review/design-review/__tests__/selected-recovery.test.ts` |
| pass | impact reservation kinds preserve retry counters and reject mismatches without mutation | `src/workflow/review/design-review/__tests__/selected-recovery.test.ts` |

**integration: Selected work resume/mutation/generation and persisted retry counters**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | accepted selection corruption stays terminal and all-fresh checkpoints retain recovery behavior | `src/workflow/review/design-review/__tests__/selected-recovery.test.ts` |
| pass | explicit native recovery preserves accepted prefixes and durable replay reserves only unfinished work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | controller recovery rebinds only after disconnect and rejects stale generations without repeating completed chunks | `src/workflow/review/design-review/__tests__/recovery.test.ts` |
| pass | blocked native work is durably invalidated before return and restored bytes cannot accept late output | `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/recovery.test.ts` | 0 | 5 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/selected-recovery.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/subject-monitor.test.ts` | 0 | 7 | 0.8 s |  |

## t6

Run at 2026-11-04T19:57:26.797Z on commit `a4c3115ec`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Native/controller impact exchange parity and atomic plan-plus-impact save**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native impact persists one plan-selection pair and dispatches only selected chunks before mutation invalidation | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |
| pass | controller impact uses the same schema and validator with fenced exchange and durable exact replay | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |
| pass | impact acceptance save failure preserves prior bytes and dispatches no selected chunk | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-execution.test.ts` | 0 | 3 | 0.8 s |  |

## t7

Run at 2026-11-05T03:47:13.921Z on commit `175da675c`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Exact coverage partition and effective finding counts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exact fresh-retained partition counts carried blockers and derives decisions only from the accepted final result | `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` |
| pass | checkpoint report projection is derived and cannot be persisted with invented counts or origins | `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` |
| pass | stored impact reports enforce the same document and checkpoint references as live acceptance | `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` |

**unit: Final-result-only decisions, missing reconciliation carry, resolved/superseded evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | missing reconciliation is accepted incomplete with conservative carry and supersession references a real current finding | `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` |
| pass | invalid dispositions cannot close retained-only concerns or cite unknown duplicate or uninspected sources | `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-consolidation.test.ts` | 0 | 5 | 0.8 s |  |

## t8

Run at 2026-11-04T20:07:33.486Z on commit `57b35344d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Normal impact schema/IPC routing rejects foreign or stale submissions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | normal impact schema and IPC routing preserve authority and fresh-only coverage progress | `src/mcp/__tests__/design-review.test.ts` |
| pass | design schema discovery and steering expose bounded current phases and completion discipline | `src/mcp/__tests__/design-review.test.ts` |

**unit: Fresh-only progress pagination and retained breakdown**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fresh-only progress and pagination report retained scope without masking incomplete status | `src/workflow/review/design-review/__tests__/coverage-progress.test.ts` |
| pass | pre-plan and old full progress derive counts and impact tools return to impact phase | `src/workflow/review/design-review/__tests__/coverage-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/design-review.test.ts` | 0 | 5 | 12.6 s |  |
| `src/workflow/review/design-review/__tests__/coverage-progress.test.ts` | 0 | 2 | 0.7 s |  |

## t9

Run at 2026-11-04T20:15:13.377Z on commit `76d3d899a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: Disposable compiled MCP/IPC initial and corrected review call counts**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/insrc-design-impact-QBpWWv/evidence.json; /tmp/s3-compiled-impact-smoke.log; compiled=true, hostedModel=false, installedDaemonTouched=false. Exact stages: planning/keep/edit/final, impact/edit/final, impact/keep/edit/final; retained calls zero, carried HIGH preserved then resolved after indirect fresh inspection.

**integration: Epic standalone issue contexts and S1/S2 regression qualification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | native and controller correction reviews preserve Epic standalone and ISSUE workflow requirements | `src/workflow/review/design-review/__tests__/subject.test.ts` |
| pass | correction after an invalidated first attempt and full restart can retain the restarted coverage | `src/workflow/review/design-review/__tests__/impact-qualification.test.ts` |
| pass | stored initial reports cannot invent impact projections or nonimpact finding decisions | `src/workflow/review/design-review/__tests__/impact-qualification.test.ts` |
| pass | impact acceptance save failure preserves prior bytes and dispatches no selected chunk | `src/workflow/review/design-review/__tests__/impact-execution.test.ts` |
| pass | changed subject recovery latches invalidation and approved full restart refreshes party without reusing old work | `src/workflow/review/design-review/__tests__/recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/impact-execution.test.ts` | 0 | 3 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/impact-qualification.test.ts` | 0 | 2 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/recovery.test.ts` | 0 | 5 | 0.7 s |  |
| `src/workflow/review/design-review/__tests__/subject.test.ts` | 0 | 4 | 1.1 s |  |
