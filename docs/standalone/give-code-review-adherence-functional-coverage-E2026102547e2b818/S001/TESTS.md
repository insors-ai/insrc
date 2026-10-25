<!-- insrc:artifact TESTS-47e2b81827433589-s1 -->

# Tests: 47e2b81827433589 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T10:44:06.181Z on commit `573349c71`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Source-inspection opt-in reaches single, chunk, obligation, relation and reduction calls with bounded read-only sessions; unchanged dimensions retain structured mode.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source inspection routes every review role through bounded read-only sessions | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection driver propagates deadlines and retries sessions without structured fallback | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |
| pass | source-inspection missing session fails rather than fabricating a pass | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |

**unit: Shared prompts preserve source citations and uncertainty; no summary-only/closed-evidence assumptions for opted-in calls.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | source-inspecting divided prompts preserve citations and uncertainty instead of closing evidence | `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-source-inspection.test.ts` | 0 | 4 | 0.6 s |  |

## t2

Run at 2026-10-25T10:51:47.757Z on commit `d3e2891aa`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Both dimension prompts/schema/results distinguish proven breach, LOW observation and legacy missing confidence while preserving filters.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage requires source inspection and preserves proven breaches while lowering unverified observations | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |

**integration: Both dimensions in single/divided pipeline: helper implementation missing from summaries passes, genuine omission remains HIGH, missing notes/unreadable source remain LOW.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | adherence divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage single source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: implemented | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: omitted | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |
| pass | functional-coverage divided source evidence: unreadable | `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/source-evidence-regression.test.ts` | 0 | 14 | 0.6 s |  |
