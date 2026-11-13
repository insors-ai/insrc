<!-- insrc:artifact TESTS-1c09e09cd985026b-s1 -->

# Tests: 1c09e09cd985026b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-11T16:07:39.723Z on commit `ced60417a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/analyze/planner/__tests__/validate.test.ts: SCOPE_BAND values match the design doc**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | SCOPE_BAND values match the design doc | `src/analyze/planner/__tests__/validate.test.ts` |

**unit: src/analyze/planner/__tests__/validate.test.ts: the band module imports nothing from the validator or the renderer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the band module imports nothing from the validator or the renderer | `src/analyze/planner/__tests__/validate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/validate.test.ts` | 0 | 29 | 0.8 s |  |

## t2

Run at 2026-11-11T16:32:14.084Z on commit `79784ad9c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/analyze/planner/__tests__/validate.test.ts: the task-count check agrees with validatePlan at every band boundary**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the task-count check agrees with validatePlan at every band boundary | `src/analyze/planner/__tests__/validate.test.ts` |

**unit: src/analyze/planner/__tests__/validate.test.ts: validatePlan keeps its invariant order and results for the existing cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validatePlan keeps its invariant order and results for the existing cases | `src/analyze/planner/__tests__/validate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/validate.test.ts` | 0 | 31 | 0.9 s |  |

## t3

Run at 2026-11-11T16:42:19.128Z on commit `1f686ad60`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/analyze/planner/__tests__/driver-unit.test.ts: renderDepthPolicy prints the INV-13 range for every scope and focus value, without halving wording**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderDepthPolicy prints the INV-13 range for every scope and focus value, without halving wording | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**unit: src/analyze/planner/__tests__/driver-unit.test.ts: no duplicate band table in the renderer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no duplicate band table in the renderer | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/driver-unit.test.ts` | 0 | 32 | 0.7 s |  |

## t4

Run at 2026-11-11T16:44:35.810Z on commit `a8144216a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/analyze/planner/__tests__/driver-unit.test.ts: appendCorrectionTurn without alsoFailing is byte-identical to the pre-change fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | appendCorrectionTurn without alsoFailing is byte-identical to the pre-change fixture | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**unit: src/analyze/planner/__tests__/driver-unit.test.ts: appendCorrectionTurn with alsoFailing states the primary first and the count second**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | appendCorrectionTurn with alsoFailing states the primary first and the count second | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**unit: src/analyze/planner/__tests__/driver-unit.test.ts: repetition banner follows primary failures only, including the secondary-to-primary transition**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repetition banner follows primary failures only, including the secondary-to-primary transition | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/driver-unit.test.ts` | 0 | 35 | 0.8 s |  |

## t5

Run at 2026-11-11T16:49:17.105Z on commit `14129f96a`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: with a recording stub provider, the initial prompt carries the enforced range**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a recording stub provider, the initial prompt carries the enforced range | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: with a recording stub provider, the correction message sent on call 2 states INV-7 and then the count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with a recording stub provider, the correction message sent on call 2 states INV-7 and then the count | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: recording-stub replay (INV-7 plus count, INV-11, valid) accepted at call 3 with primary-only feedback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | recording-stub replay (INV-7 plus count, INV-11, valid) accepted at call 3 with primary-only feedback | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: through structuredStageForTest, failures and saved feedback hold primary failures only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | through structuredStageForTest, failures and saved feedback hold primary failures only | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: an empty task list states the count and keeps INV-1 primary**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an empty task list states the count and keeps INV-1 primary | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/driver-unit.test.ts` | 0 | 40 | 0.9 s |  |

## t6

Run at 2026-11-11T16:51:33.848Z on commit `c5a00524b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: five-call acceptance and exhaustion with the planner limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | five-call acceptance and exhaustion with the planner limit | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**integration: src/analyze/planner/__tests__/driver-unit.test.ts: completeStructured receives the shared maxAttempts, not the planner limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completeStructured receives the shared maxAttempts, not the planner limit | `src/analyze/planner/__tests__/driver-unit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/planner/__tests__/driver-unit.test.ts` | 0 | 42 | 0.9 s |  |

## t7

Run at 2026-11-11T18:21:25.033Z on commit `37eb0d49f`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

no test files to run; reported as failed by the builder: src/analyze/orchestrator/__tests__/docs-broad-live.test.ts: the broad docs request runs to a final report

**live: src/analyze/orchestrator/__tests__/docs-broad-live.test.ts: the broad docs request runs to a final report**

Reported by the builder, not run by the gate: **fail**. Evidence: ~/.insrc/analyze/docs-broad-live-mwcdxpq5 (run.json, plan.json, plan.attempts/01-03, tasks/t01-t06); test output /tmp/live-run4.txt: plan stage passed, execute stage unfinished at the 40-minute test limit
