<!-- insrc:artifact TESTS-bd3fc04540624ba3-s1 -->

# Tests: bd3fc04540624ba3 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T06:16:18.415Z on commit `c034aeb45`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Claude missing-findings repeated five times coalesces and never accepts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Claude missing-findings repeated five times coalesces and never accepts | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**unit: Codex final JSON parse/schema failure preserves finality and diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Codex final JSON parse/schema failure preserves finality and diagnostics | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**unit: Terminal CLI failure and host semantic rejection retain pointed fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Terminal CLI failure and host semantic rejection retain pointed fields | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**unit: UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | UTF-8/count/preview budgets and static correction mapping exclude reasoning and markup repair | `src/agent/providers/__tests__/review-output-diagnostics.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-output-diagnostics.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-11-02T06:32:36.497Z on commit `74fcef072`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Old checkpoint unchanged; diagnostics optional and host-owned, absent from model result schema | `src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` |

**unit: Shared attribution diagnostics stored once and projected only to applicable selected scope**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Shared attribution diagnostics stored once and projected only to applicable selected scope | `src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` |

**integration: Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Controller diagnostic exchange preserves ownership/sequence replay and never renews inactivity | `src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` |

**integration: Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure | `src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` | 0 | 6 | 1.3 s |  |

## t3

Run at 2026-11-02T07:11:43.189Z on commit `6c02faf63`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | previousRoundFeedback is concise, scoped, bounded, excludes previews/schema and respects latest same-party resolved result | `src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` |

**integration: Fake Claude/Codex failure persists on daemon route and appears in subsequent input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Fake Claude/Codex failure persists on daemon route and appears in subsequent input | `src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` |

**integration: Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Saved diagnostics survive disconnect/restart; later valid feedback does not rewrite failed attempt | `src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` |

**integration: Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Writer failure does not falsely acknowledge diagnostics; accepted feedback survives later wrapper failure | `src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` | 0 | 7 | 3.1 s |  |
