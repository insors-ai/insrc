<!-- insrc:artifact TESTS-8315a11f29fd2812-s3 -->

# Tests: 8315a11f29fd2812 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-10-20T18:02:15.148Z on commit `79bfbdec`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 10 | 0.8 s |  |

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

## t4

Run at 2026-10-20T17:14:24.444Z on commit `3f3345c3`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key with no notes is adjudicated on the no-evidence statement'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a key with no notes is adjudicated on the no-evidence statement | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a conventions candidate rejected by the module judgement is absent from the merged result'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a conventions candidate rejected by the module judgement is absent from the merged result | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a promised test passed only by a reported smoke run, with no test file or reaching edge, gets that evidence in its obligation context and is not reported missing | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a key whose notes exceed the limit is reduced into notes within noteCapChars and then judged, and every gather call fits'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a key whose notes exceed the limit is reduced into notes within noteCapChars and then judged, and every gather call fits | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 10 | 0.6 s |  |

## t5

Run at 2026-10-20T18:28:43.500Z on commit `40c58e88`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a relation call carries both full summaries when they fit, else full against neighbour summary in each direction, and every call fits | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a relation answer naming a counterpart or location outside its two symbols is rejected, re-issued once, then fails the review'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a relation answer naming a counterpart or location outside its two symbols is rejected, re-issued once, then fails the review | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |
| pass | a caller and callee in different chunks whose contract disagrees: the job judges their call in a relation call, and the mismatch is reported at the caller | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 13 | 0.7 s |  |

## t6

Run at 2026-10-20T18:40:12.120Z on commit `3bb5726b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a pair answer naming a counterpart outside its two symbols is rejected'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a pair answer naming a counterpart outside its two symbols is rejected | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'every two symbols in different chunks are compared through their descriptions in calls within the limit, and no compare or pair call is made under the limit'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every two symbols in different chunks are compared through their descriptions in calls within the limit, and no compare or pair call is made under the limit | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'compare and pair calls are counted under pipelineCalls.relation, not chunk'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compare and pair calls are counted under pipelineCalls.relation, not chunk | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 16 | 0.9 s |  |

## t7

Run at 2026-10-21T04:36:46.306Z on commit `6225fb6b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | merge keeps identical findings once, accepts only file:line locations (a note id is re-asked), moves out-of-set findings to outOfScope, and normalises coverage once | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | out-of-set findings are dropped on the daemon path and kept in outOfScope on the controller path, as today | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a functional-coverage finding with an unknown expectationRef at a valid changed-file location is dropped by merge, as today | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-gather.test.ts: 'pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pipelineCalls counts chunk, obligation, relation and merge calls and is absent on a single-chunk review | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 22 | 1 s |  |
