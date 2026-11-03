<!-- insrc:artifact TESTS-7e0f65fc1a518722-s1 -->

# Tests: 7e0f65fc1a518722 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T07:32:39.956Z on commit `e6f0ed2af`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a head moved past its log by a raw content write is approved with one adopted entry before the approve**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head moved past its log by a raw content write is approved with one adopted entry before the approve | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: the same head is reviewed and then completed with the same adoption**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the same head is reviewed and then completed with the same adoption | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a hand-edited number, a hash mismatch, a log ahead of the head and restored content are refused with nothing written or logged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a hand-edited number, a hash mismatch, a log ahead of the head and restored content are refused with nothing written or logged | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a head with no revision-bearing entry is approved with no adopted entry and two raw writes give one adopted entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a head with no revision-bearing entry is approved with no adopted entry and two raw writes give one adopted entry | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: an adopted entry that cannot be appended fails the operation and a later attempt adopts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an adopted entry that cannot be appended fails the operation and a later attempt adopts | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a Story completed with a member that has a raw content write follows the same rule**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Story completed with a member that has a raw content write follows the same rule | `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` |

**unit: src/workflow/artifact-core/__tests__/lifecycle-service.test.ts: the integrity cases pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | apply refuses approve, review and complete on each Integrity reason and writes nothing, while unhashed and unlogged heads are approved normally | `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` | 0 | 7 | 0.6 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` | 0 | 3 | 0.6 s |  |

## t2

Run at 2026-11-03T07:41:18.167Z on commit `23c984c80`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/lifecycle-wiring.test.ts: an approved artifact redrafted by a raw content write is approved again through the daemon approve handler**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an approved artifact redrafted by a raw content write is approved again through the daemon approve handler | `src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` |

**integration: src/daemon/__tests__/lifecycle-wiring.test.ts: the review-decision step reviews a redrafted head at the new revision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the review-decision step approves a redrafted head at the new revision, with no head-ahead-of-log | `src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` |

**integration: src/daemon/__tests__/lifecycle-wiring.test.ts: a redraft by the design-run writer and a revise by resolve-comment each end approved through the service**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a redraft by the design-run writer and a revise by resolve-comment each end approved through the service | `src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` | 0 | 3 | 0.8 s |  |

## t3

Run at 2026-11-03T07:52:02.933Z on commit `a2486c15e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/artifact-write-inventory.test.ts: the write inventory test passes with the updated note**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 10 | 1.6 s |  |
