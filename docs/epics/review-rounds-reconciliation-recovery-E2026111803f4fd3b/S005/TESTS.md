<!-- insrc:artifact TESTS-03f4fd3b9102aab8-s5 -->

# Tests: 03f4fd3b9102aab8 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-21T14:39:11.960Z on commit `fe7b99bd4`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/checkpoint.test.ts` | 0 | 25 | 4.1 s |  |

## t2

Run at 2026-11-21T14:40:59.630Z on commit `fe7b99bd4`. Tests check: **passed**. 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**unit: finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole | `src/workflow/review-round/__tests__/checkpoint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-round/__tests__/checkpoint.test.ts` | 0 | 25 | 4.1 s |  |
