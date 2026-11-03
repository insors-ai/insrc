<!-- insrc:artifact TESTS-0764c4bcaa076f8e-s1 -->

# Tests: 0764c4bcaa076f8e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T11:26:31.450Z on commit `01628c2d9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Frozen publication binding validates identity checkpoint and attempt state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Frozen publication binding validates identity checkpoint and attempt state | `src/workflow/code-review/investigation/__tests__/publication-binding.test.ts` |

**integration: Publication-intent fsync replay and uncertain append reconciliation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Publication-intent fsync replay and uncertain append reconciliation | `src/workflow/code-review/investigation/__tests__/publication-binding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/publication-binding.test.ts` | 0 | 2 | 1 s |  |

## t2

Run at 2026-10-29T11:29:50.463Z on commit `da9667728`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Frozen completion-requested takeover and legacy terminal refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Frozen completion-requested takeover and legacy terminal refusal | `src/workflow/code-review/investigation/__tests__/publication-owner.test.ts` |

**integration: Replacement owner preserves publication intent and fences prior generation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Replacement owner preserves publication intent and fences prior generation | `src/workflow/code-review/investigation/__tests__/publication-owner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/publication-owner.test.ts` | 0 | 2 | 1 s |  |

## t3

Run at 2026-10-29T11:34:08.546Z on commit `8d545a463`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Approved publication callback binding guard and null replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Approved publication callback binding guard and null replay | `src/workflow/code-review/investigation/__tests__/publication-callback.test.ts` |

**integration: Callback failure and separate terminal receipt do not reenter run queue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Callback failure and separate terminal receipt do not reenter run queue | `src/workflow/code-review/investigation/__tests__/publication-callback.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/publication-callback.test.ts` | 0 | 2 | 0.9 s |  |

## t4

Run at 2026-10-29T11:38:01.260Z on commit `df4ba3b83`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Callback deadline revokes authority and rejects late success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Callback deadline revokes authority and rejects late success | `src/workflow/code-review/investigation/__tests__/publication-deadline.test.ts` |

**integration: Undrained callback retains write fence through caller timeout**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Undrained callback retains write fence through caller timeout | `src/workflow/code-review/investigation/__tests__/publication-deadline.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/publication-deadline.test.ts` | 0 | 2 | 0.9 s |  |

## t5

Run at 2026-10-29T11:41:54.756Z on commit `f227a4b07`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: Publication crash boundaries reconcile frozen intent and terminal receipt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Publication crash boundaries reconcile frozen intent and terminal receipt | `src/workflow/code-review/investigation/__tests__/publication-integration.test.ts` |

**integration: Concurrent publication and external-operation replay preserve one frozen scope**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Concurrent publication and external-operation replay preserve one frozen scope | `src/workflow/code-review/investigation/__tests__/publication-integration.test.ts` |

**smoke: Focused recovery investigation compatibility suites and production build**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/publication-prerequisite-compatibility.tap:focused investigation, publication/recovery, legacy diff-attribution and read-only loop suites pass; /tmp/publication-prerequisite-build.log: npm run build passes.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/investigation/__tests__/publication-integration.test.ts` | 0 | 2 | 3 s |  |
