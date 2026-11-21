<!-- insrc:artifact PLAN-03f4fd3b9102aab8-s5 -->

# Plan: STORY-03f4fd3b9102aab8-s5

## Summary

**Epic:** `review-rounds-reconciliation-recovery`
**LLD run:** `wf-1795246351382-jujbmw`
**LLD effective hash:** `6d57abfa68ac...`

Building this Story means adding one new module, checkpoint.ts, with three small functions and the same symlink-safety and atomic-publish machinery s4 already proved out in review-report.ts, plus a full named test suite covering all four acceptance criteria and every error/edge case the LLD names. Two Tasks: the module itself (t1), then its complete test suite (t2).

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReviewCheckpoint and writeCheckpoint/readCheckpoint/finalizeAndCleanup to a new checkpoint.ts | M | — | — | unit: writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Add the full named test suite for checkpoint.ts covering ac1-ac4 and all error/edge cases | M | — | `t1` | unit: readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing; unit: readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units; unit: readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content; unit: finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order; unit: if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted; unit: finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error; unit: writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history; unit: a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike; unit: when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd; unit: a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp; unit: a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup; unit: a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data; unit: finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole | [[c4]] |

### 1.1 TASK-03f4fd3b9102aab8-s5-t1 — Add ReviewCheckpoint and writeCheckpoint/readCheckpoint/finalizeAndCleanup to a new checkpoint.ts

New src/workflow/review-round/checkpoint.ts exporting the ReviewCheckpoint interface and the three functions exactly per the LLD's contract: reviewId literal-identifier validation, canonical repo resolution, lstat-based symlink safety before every write/delete, and a guarded temp-file+rename publish for writeCheckpoint (reusing review-report.ts's publishGuarded pattern) so a crash mid-write never leaves a corrupted checkpoint. finalizeAndCleanup copies finalOutput into durable storage before deleting .insrc/tmp/<reviewId>/, never the reverse, and is idempotent when called twice. readCheckpoint treats a missing or malformed checkpoint file identically (undefined), never throwing. Plus a compile-time typecheck fixture proving the exact three-function/ReviewCheckpoint shape (matching review-report.ts's own __type-tests__ convention). Sized M: this bundles three functions plus the full symlink-safety and guarded-publish scope from the start, comparable to review-report.ts's final state rather than its initial draft.

**Acceptance checks:**
- writeCheckpoint, readCheckpoint and finalizeAndCleanup exist with exactly the signatures in contractDetails.api, and ReviewCheckpoint exists with exactly dataModelChanges' shape
- writeCheckpoint publishes via a guarded temp-file+rename primitive (never a direct writeFileSync), satisfying the atomic-write error case
- finalizeAndCleanup's durable copy always precedes its .insrc/tmp/<reviewId>/ deletion, and a copy failure leaves the temp folder intact
- readCheckpoint resolves to undefined for a missing OR malformed checkpoint file, never throwing on corruption
- every write and the recursive delete are preceded by an lstat-based symlink-safety check reusing review-report.ts's established helper
- the typecheck fixture compiles and fails to compile under every @ts-expect-error negative case

### 1.2 TASK-03f4fd3b9102aab8-s5-t2 — Add the full named test suite for checkpoint.ts covering ac1-ac4 and all error/edge cases

One it() per testStrategy.testLevels[0].subjects (14 total), matching ac1-ac4's acceptanceMapping.provingTests verbatim (6 subjects), plus the 8 remaining error-case/edge-case subjects (idempotent finalize, repeated-write overwrite, path-traversal, repo-resolution, symlinked write, symlinked delete, corrupted-checkpoint, finalize-with-no-checkpoint). Mirrors reconciliation.test.ts's/review-report.test.ts's own fixture conventions: disposable .insrc/tmp/<reviewId>/ directories cleaned up per test, an injectable resolveRepoRoot test double, and an injectable durable-copy-destination double so finalizeAndCleanup's write can be forced to fail without touching real artifact storage.

**Acceptance checks:**
- All 14 named subjects from testStrategy.testLevels[0].subjects exist as individual it() cases with titles matching verbatim
- ac1, ac2, ac3 and ac4's acceptanceMapping.provingTests all pass
- npx tsc --noEmit and npx tsx --test for the new test file both pass with zero failures
- the broader sweep (src/workflow/review-round/**/*.test.ts) still passes in full, confirming no regression to s1-s4's existing suites

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId | `t1` |
| readCheckpoint resolves to undefined when no checkpoint file exists yet for a reviewId, rather than throwing | `t2` |
| readCheckpoint resolves to the last-written ReviewCheckpoint after writeCheckpoint has been called, so a resumed review can continue from lastCompletedUnit rather than re-running completed units | `t2` |
| readCheckpoint's own reviewId field, read back from the checkpoint record, is exactly the identity k8 requires -- the same string as both the temp folder name and the record's own content | `t2` |
| finalizeAndCleanup copies finalOutput into durable artifact storage before deleting the .insrc/tmp/<reviewId>/ folder, in that order | `t2` |
| if finalizeAndCleanup's durable copy write fails, the .insrc/tmp/<reviewId>/ folder is not deleted | `t2` |
| finalizeAndCleanup is idempotent: calling it a second time for a reviewId whose temp folder was already deleted by an earlier successful call succeeds without error | `t2` |
| writeCheckpoint called repeatedly for the same reviewId overwrites the prior checkpoint rather than accumulating a history | `t2` |
| a reviewId containing a path-traversal segment is rejected before any filesystem access, for writeCheckpoint, readCheckpoint, and finalizeAndCleanup alike | `t2` |
| when the reviewed repository cannot be resolved, writeCheckpoint/readCheckpoint/finalizeAndCleanup reject rather than silently defaulting to the daemon process's own cwd | `t2` |
| a symlinked review directory or checkpoint file is never written through by writeCheckpoint, even outside .insrc/tmp | `t2` |
| a symlinked .insrc/tmp/<reviewId>/ directory is never deleted through by finalizeAndCleanup | `t2` |
| a checkpoint.json file that is not valid JSON, or does not match ReviewCheckpoint's shape, is treated by readCheckpoint as though no checkpoint exists, rather than throwing or returning unvalidated data | `t2` |
| finalizeAndCleanup succeeds even when checkpoint.json was never written at all, deleting whatever the .insrc/tmp/<reviewId>/ folder currently contains as a whole | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s5 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD s5 errorPaths`
- **[[c4]]** `prior-artifact` `LLD s5 testStrategy`
