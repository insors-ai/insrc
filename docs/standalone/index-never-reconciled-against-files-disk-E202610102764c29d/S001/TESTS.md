<!-- insrc:artifact TESTS-2764c29d7ccb66a5-S001 -->

# Tests: 2764c29d7ccb66a5 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T15:41:06.406Z on commit `0d26867b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the read of a repository's stored files returns each file once, only that repository's files, and no empty path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the read of a repository's stored files returns each file once, only that repository's files, and no empty path | `src/db/__tests__/entity-files-for-repo.test.ts` |

**unit: the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the removal of one repository's unresolved relations of a file leaves another repository's unresolved relations of the same path | `src/db/__tests__/entity-files-for-repo.test.ts` |

**unit: an unregistered repository has no stored files and its removal of unresolved relations does nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unregistered repository has no stored files and its removal of unresolved relations does nothing | `src/db/__tests__/entity-files-for-repo.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/entity-files-for-repo.test.ts` | 0 | 3 | 1.4 s |  |

## t2

Run at 2026-10-10T15:43:41.783Z on commit `c8667e0b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a queued clean-up job is counted as pending for its repository, and a second one for the same repository is not queued | `src/daemon/__tests__/queue-depth-for-repo.test.ts` |

**integration: a clean-up job for a registered repository with nothing stored is processed without error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a clean-up job for a registered repository with nothing stored is processed without error | `src/indexer/__tests__/reconcile.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/queue-depth-for-repo.test.ts` | 0 | 5 | 0.5 s |  |
| `src/indexer/__tests__/reconcile.test.ts` | 0 | 1 | 0.8 s |  |
