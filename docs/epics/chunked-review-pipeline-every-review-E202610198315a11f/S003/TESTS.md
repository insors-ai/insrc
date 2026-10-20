<!-- insrc:artifact TESTS-8315a11f29fd2812-s3 -->

# Tests: 8315a11f29fd2812 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-20T16:45:32.296Z on commit `aecee5ff`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each dimension's obligations equal what today's prompt judges: clauses and plan tasks, FRs, promised tests, touched modules; adherence has none without an approved LLD or plan | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test's obligation context holds its reported result, build tasks, notes and test-file atoms chosen by name, also with empty grounding, and is identical on every rebuild'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a promised test's obligation context holds its reported result, build tasks, notes and test-file atoms chosen by name, also with empty grounding, and is identical on every rebuild | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-10-20T16:54:56.125Z on commit `7de06bfd`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adherence, functional-coverage and conventions chunk schemas have no findings field, so a missing clause or unrealized FR naming a valid chunk location cannot be recorded from a chunk | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a notes-only chunk call carries the chunk's rows, neighbour lines and context atoms within the limit, and under the limit the single prompt is today's'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a notes-only chunk call carries the chunk's rows, neighbour lines and context atoms within the limit, and under the limit the single prompt is today's | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 5 | 0.7 s |  |

## t3

Run at 2026-10-20T17:04:04.005Z on commit `eae69f84`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a quality chunk answer missing, repeating or adding a description is rejected, re-issued once, then fails the review | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 6 | 0.7 s |  |
