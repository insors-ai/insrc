<!-- insrc:artifact TESTS-3c0b242fcabf01e9-s1 -->

# Tests: 3c0b242fcabf01e9 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-04T08:41:18.063Z on commit `6315fc633`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lifecycle-rollup.test.ts: an unreadable head of another kind does not block a Story roll-up**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unreadable head of another kind does not block a Story roll-up | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: lifecycle-rollup.test.ts: an unreadable head of the counted kind still blocks the roll-up**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unreadable head of the counted kind still blocks the roll-up | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` | 0 | 4 | 0.6 s |  |

## t2

Run at 2026-11-04T08:43:46.870Z on commit `ff58c1a54`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: convert-lifecycle-backfill.test.ts: an approved head with a string approvedBy gets an approval actor named by it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-lifecycle-backfill.test.ts: an approved head with a string approvedBy gets an approval actor named by it | `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` |

**unit: convert-lifecycle-backfill.test.ts: a head without a string approvedBy gets the same lifecycle as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-lifecycle-backfill.test.ts: a head without a string approvedBy gets the same lifecycle as before | `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-lifecycle-backfill.test.ts` | 0 | 6 | 0.6 s |  |

## t3

Run at 2026-11-04T08:45:51.578Z on commit `3cdbbd13d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-apply.test.ts: migrateHeads with an id filter leaves heads outside the filter unchanged with no new log entries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-apply.test.ts: migrateHeads with an id filter leaves heads outside the filter unchanged with no new log entries | `src/workflow/convert/__tests__/convert-apply.test.ts` |

**integration: convert-apply.test.ts: the full conversion migrates the same heads as before with no id filter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-apply.test.ts: the full conversion migrates the same heads as before with no id filter | `src/workflow/convert/__tests__/convert-apply.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/convert-apply.test.ts` | 0 | 4 | 0.8 s |  |

## t4

Run at 2026-11-04T08:49:55.488Z on commit `fcc57c5f2`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: convert-amendments.test.ts: repairFlatAmendments makes a flat approved amendment a head the amendment store reads as approved by the original approver**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: repairFlatAmendments makes a flat approved amendment a head the amendment store reads as approved by the original approver | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**integration: convert-amendments.test.ts: repairFlatAmendments makes a flat not-yet-approved amendment a draft head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: repairFlatAmendments makes a flat not-yet-approved amendment a draft head | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**integration: convert-amendments.test.ts: repairFlatAmendments lists a flat amendment it cannot convert and leaves it flat**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: repairFlatAmendments lists a flat amendment it cannot convert and leaves it flat | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**integration: convert-amendments.test.ts: repairFlatAmendments finishes a head that was converted but not migrated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: repairFlatAmendments finishes a head that was converted but not migrated | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**integration: convert-amendments.test.ts: repairFlatAmendments on a repo at schema version 2 does nothing the second time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | convert-amendments.test.ts: repairFlatAmendments on a repo at schema version 2 does nothing the second time | `src/workflow/convert/__tests__/convert-amendments.test.ts` |

**integration: store-children-strict.test.ts: a flat amendment head is reported unreadable while real children are still listed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | store-children-strict.test.ts: a flat amendment head is reported unreadable while real children are still listed | `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/store-children-strict.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/convert/__tests__/convert-amendments.test.ts` | 0 | 8 | 0.7 s |  |

## t5

Run at 2026-11-04T08:56:14.630Z on commit `5f4895a88`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: repair on a copy then on this repository: the two amendments read as approved heads and a BUILD approval needs no move-aside (reported with the before/after output)**

Reported by the builder, not run by the gate: **pass**. Evidence: repair-copy-run.txt and repair-apply-run.txt: both amendments are read by the amendment store as approved by 'Subho Ghosh (in-chat approval)' with their original approval times. scan-unreadable-output.txt: the strict child scan that the completion roll-up uses, run with the unchanged store on this repository, lists unreadable=[] for the Story, the Epic and a Task, where it listed AMD-86197ac660732ceb-1 and -2 before; that scan result was the only cause of the refusal 'cannot roll up: unreadable children', seen on two approvals this session. The approval of this BUILD itself, with no file moved aside, is recorded after it happens.
