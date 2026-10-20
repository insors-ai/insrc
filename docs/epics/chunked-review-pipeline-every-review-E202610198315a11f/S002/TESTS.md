<!-- insrc:artifact TESTS-8315a11f29fd2812-s2 -->

# Tests: 8315a11f29fd2812 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 17 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-20T13:35:58.242Z on commit `e17479ed`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a duplicate entityId throws an error naming it'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a duplicate entityId throws an error naming it | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the same grounding gives identical material and identical neighbour summaries every time | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` | 0 | 6 | 0.5 s |  |

## t2

Run at 2026-10-20T13:33:35.019Z on commit `57ccc141`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'the same grounding gives identical material and identical neighbour summaries every time'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the same grounding gives identical material and identical neighbour summaries every time | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` | 0 | 6 | 0.4 s |  |

## t3

Run at 2026-10-20T16:06:55.434Z on commit `0d07c80a`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review-pipeline/__tests__/code-review-material.test.ts: 'coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence | `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | over the limit, symbols that call each other share a chunk before symbols that only share a file, and those before symbols that only share a directory | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a call relation cut between two chunks gives each chunk a neighbour summary of the other symbol | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every changed symbol is whole in exactly one chunk and every chunk fits the limit'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every changed symbol is whole in exactly one chunk and every chunk fits the limit | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a summary larger than the limit on its own raises AtomTooLargeError naming its file#name'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a summary larger than the limit on its own raises AtomTooLargeError naming its file#name | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'under the limit the plan is one chunk and the dimension prompt is unchanged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | under the limit the plan is one chunk and the dimension prompt is unchanged | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every rendered chunk call, with array formatting, neighbours, context and envelope, measures within limitChars | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a row whose JSON fits the limit but whose rendered singleton call does not raises AtomTooLargeError before any provider call | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'an atom whose singleton call with every same-directory line exceeds the limit is packed, its lines added only while they fit, and not reported as too large'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an atom whose singleton call with every same-directory line exceeds the limit is packed, its lines added only while they fit, and not reported as too large | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**integration: src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts: 'a symbol that cannot hold its call summaries beside it is kept whole, the summaries that do not fit are left out, and the omission is logged'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a symbol that cannot hold its call summaries beside it is kept whole, the summaries that do not fit are left out, and the omission is logged | `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/code-review-chunking.test.ts` | 0 | 9 | 0.7 s |  |
| `src/workflow/review-pipeline/__tests__/code-review-material.test.ts` | 0 | 7 | 0.6 s |  |

## t4

Run at 2026-10-20T16:10:08.667Z on commit `ad90a4c2`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Installed daemon: runs the build containing the code-review material (recorded in the BUILD record)**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/chunked-review-pipeline-every-review-E202610198315a11f/S002/live-evidence/t4-daemon-update.txt section 'The running process loaded this build': daemon.status installedCommit 749857e075fc55b55b5010527a0cd1fb24f166b5 from the running daemon; process start 21:38:29 after build mtimes 21:38:13-14; compiled code-review.js lines 21/100/101 use codeReviewMaterial + neighbourSummary. Also stated in this BUILD record's summary.
