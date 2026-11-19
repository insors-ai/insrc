<!-- insrc:artifact TESTS-50cde239426d6e2a-s4 -->

# Tests: 50cde239426d6e2a s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-19T11:43:57.160Z on commit `239079899`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CommentParty, CommentEntry and ReviewContextRound are exported with the exact documented field shapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | are exported with the exact documented field shapes | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/comment-entry.test.ts` | 0 | 2 | 0.8 s |  |

## t2

Run at 2026-11-19T12:54:32.327Z on commit `072ca9303`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a ReviewContextRound built for attempt N carries round=N at the root level**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ReviewContextRound built for attempt N carries round=N at the root level | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: a CommentEntry carries round, party, timestamp and text as first-class fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a CommentEntry carries round, party, timestamp and text as first-class fields | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: CommentEntry's exported shape contains no verdict, severity or dimension field of any kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CommentEntry's exported shape contains no verdict, severity or dimension field of any kind | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: a CommentEntry.party value outside 'submitter'|'reviewer' is rejected at compile time (type-level check, not a runtime test)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a CommentEntry.party value outside 'submitter'\|'reviewer' is rejected at compile time (type-level check, not a runtime test) | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CommentEntry's and ReviewContextRound's exported shapes contain no artifactId or other cross-artifact scoping field of any kind | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: a ReviewContextRound with an empty comments array is structurally valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a ReviewContextRound with an empty comments array is structurally valid | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: multiple CommentEntry values in the same round from different parties with identical timestamps are both recorded**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | multiple CommentEntry values in the same round from different parties with identical timestamps are both recorded | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**unit: a CommentEntry.text that is an empty string is structurally valid**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a CommentEntry.text that is an empty string is structurally valid | `src/workflow/artifact-core/__tests__/comment-entry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/comment-entry.test.ts` | 0 | 10 | 4.6 s |  |
