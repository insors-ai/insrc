<!-- insrc:artifact TESTS-34798d209cf97413-S001 -->

# Tests: 34798d209cf97413 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-27T07:31:29.606Z on commit `55e892c23`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-BUDGET**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-BUDGET: the actual schema changes planning and every issued call includes it in its budget | `src/workflow/review-pipeline/__tests__/complete-input.test.ts` |
| pass | DIFF-BUDGET: irreducible schema and explicit history are never omitted to fit | `src/workflow/review-pipeline/__tests__/complete-input.test.ts` |

**integration: DIFF-REPAIR**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-REPAIR: an oversized correction fails explicitly instead of being silently omitted | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/complete-input.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 28 | 0.7 s |  |

## t2

Run at 2026-10-27T07:41:52.432Z on commit `bcb286d2c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-TRANSPORT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TRANSPORT: bounded Claude dispatch preserves explicit input and disables ambient tools/history/project context | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | DIFF-TRANSPORT: Codex schema normalization is counted before isolation admission | `src/agent/providers/__tests__/bounded-input.test.ts` |

**integration: DIFF-ADMISSION**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-ADMISSION: unsupported CLI isolation and oversized normalized schemas make zero model calls | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | DIFF-ADMISSION: isolated pipeline calls require enforcement and forward the authoritative job cap | `src/agent/providers/__tests__/bounded-input.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/bounded-input.test.ts` | 0 | 4 | 0.7 s |  |
