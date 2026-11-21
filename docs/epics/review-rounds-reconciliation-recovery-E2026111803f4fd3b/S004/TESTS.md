<!-- insrc:artifact TESTS-03f4fd3b9102aab8-s4 -->

# Tests: 03f4fd3b9102aab8 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T05:47:51.052Z on commit `7dc847b01`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | renderReviewReport writes a persisted Markdown file under the review's own .insrc/tmp/<reviewId>/ directory and returns its path | `src/workflow/review-round/__tests__/review-report.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/review-report.test.ts` | 0 | 17 | 3.1 s |  |

## t2

Run at 2026-11-21T05:49:17.406Z on commit `7dc847b01`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the written Markdown renders every finding in this round's own findings array, each annotated with its category and severity | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | for round 1, the rendered Markdown carries no reconciliation annotation section at all, since no prior round exists to reconcile against | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | for round greater than 1, the rendered Markdown inlines each reconciliation result's verdict next to the prior finding it refers to (via priorFindings), limited to only the findings this round's own reconciliation classified -- never a running audit of all history | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: a reviewId containing a path-traversal segment is rejected before any filesystem access**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reviewId containing a path-traversal segment is rejected before any filesystem access | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: a non-positive-integer round is rejected with a RangeError before any write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a non-positive-integer round is rejected with a RangeError before any write | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the reviewed repository cannot be resolved, renderReviewReport rejects rather than silently defaulting to the daemon process's own cwd | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a rejecting filesystem write propagates its rejection rather than returning a path to a file that was never actually written | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: an empty findings array still renders successfully with an explicit statement that no findings were produced this round**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an empty findings array still renders successfully with an explicit statement that no findings were produced this round | `src/workflow/review-round/__tests__/review-report.test.ts` |

**unit: the returned markdown is exactly the persisted file's own content, which the caller presents directly to satisfy ac3 -- insrc_present (confirmed against its real handler) never applies to a review-report**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the returned markdown is exactly the persisted file's own content, which the caller presents directly to satisfy ac3 -- insrc_present (confirmed against its real handler) never applies to a review-report | `src/workflow/review-round/__tests__/review-report.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/review-report.test.ts` | 0 | 17 | 3.1 s |  |
