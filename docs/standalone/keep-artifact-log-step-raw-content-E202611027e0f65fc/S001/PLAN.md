<!-- insrc:artifact PLAN-7e0f65fc1a518722-s1 -->

# Plan: STORY-7e0f65fc1a518722-s1

## Summary

**Epic:** `keep-artifact-log-step-raw-content`
**LLD run:** `wf-1793687550721-3iahoq`
**LLD effective hash:** `cc7b166644d5...`

The build is one change in LifecycleService.apply, with its unit cases in a new lifecycle-adopt test file beside the existing integrity tests, then integration cases through the daemon approve path and the two real raw writers, then the notes in the plans and one sweep. No writer and no stored data changes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Adopt a raw content write in LifecycleService.apply, with its unit cases | M | — | — | unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a head moved past its log by a raw content write is approved with one adopted entry before the approve; unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: the same head is reviewed and then completed with the same adoption; unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a hand-edited number, a hash mismatch, a log ahead of the head and restored content are refused with nothing written or logged; unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a head with no revision-bearing entry is approved with no adopted entry and two raw writes give one adopted entry; unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: an adopted entry that cannot be appended fails the operation and a later attempt adopts; unit: src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts: a Story completed with a member that has a raw content write follows the same rule; unit: src/workflow/artifact-core/__tests__/lifecycle-service.test.ts: the integrity cases pass unchanged | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |
| 2 | **`t2`** Integration cases: the daemon approve path and the real raw writers | M | — | `t1` | integration: src/daemon/__tests__/lifecycle-wiring.test.ts: an approved artifact redrafted by a raw content write is approved again through the daemon approve handler; integration: src/daemon/__tests__/lifecycle-wiring.test.ts: the review-decision step reviews a redrafted head at the new revision; integration: src/daemon/__tests__/lifecycle-wiring.test.ts: a redraft by the design-run writer and a revise by resolve-comment each end approved through the service | [[c1]] [[c6]] [[c7]] |
| 3 | **`t3`** Record the decision and run the affected suites | S | — | `t1`, `t2` | unit: src/workflow/__tests__/artifact-write-inventory.test.ts: the write inventory test passes with the updated note | [[c7]] [[c1]] |

### 1.1 TASK-7e0f65fc1a518722-s1-t1 — Adopt a raw content write in LifecycleService.apply, with its unit cases

In LifecycleService.apply (src/workflow/artifact-core/lifecycle-service.ts), where checkIntegrity runs for approve, review and complete inside the store.updateAndLog callback: when it answers head-ahead-of-log, checkHeadIntegrity is ok and the head's content hash differs from the last revision-bearing entry's, append an 'update' entry for the head's revision and hash by insrc:system with outcome result 'adopted' through store.history.appendLog, then check again with the entry in the log and go on. The member check of a unit's completion (the same file, the member path) uses the same rule. Decide and test the order against a later failure of the same apply (an adoption stays in the log, which is in step with the head). Add the unit cases to lifecycle-service.test.ts with the store-kit and lifecycle-kit fixtures.

**Acceptance checks:**
- A head moved one revision past its log by a raw writeArtifact content change is approved, reviewed and completed; the log ends with one adopted update by insrc:system at the head's revision and hash, then the operation's own entry
- A hand-edited revision number (content hash equal to the last logged one), a hash-mismatch head, a log-ahead-of-head head and a raw write that restores the logged content are refused as before, with nothing written or logged
- A head with no revision-bearing log entry is approved with no adopted entry; two raw writes in a row give one adopted entry at the last revision
- An adopted entry whose append fails (a History that throws) fails the operation, writes no head and leaves a later attempt able to adopt
- A Story completed with a member that has a raw content write is adopted or refused for the same reasons as a single head, shown by one unit case
- The existing integrity cases of lifecycle-service.test.ts pass unchanged, and checkIntegrity, ArtifactStore.write and writeArtifact are not changed

### 1.2 TASK-7e0f65fc1a518722-s1-t2 — Integration cases: the daemon approve path and the real raw writers

Add cases to src/daemon/__tests__/lifecycle-wiring.test.ts and the tests of the real raw writers: an approved artifact redrafted by a raw content write is approved again through the daemon approve handler and reviewed through the review-decision step, with the adopted entry in the log; the design-run writer's redraft of an approved LLD (the synthesize path) and a resolve-comment revise are carried through approval.

**Acceptance checks:**
- An approved artifact redrafted by a raw content write is approved again through the daemon approve handler; the log holds the adopted entry and the head is approved at the new revision
- The review-decision step records its review on a redrafted head at the new revision, with no head-ahead-of-log
- A redraft by the design-run writer and a revise by resolve-comment each end approved through the service

### 1.3 TASK-7e0f65fc1a518722-s1-t3 — Record the decision and run the affected suites

Record in docs/plans/core-data-model.md item 3 and the open item of docs/plans/team-workflow.md that the service adopts a raw content write, with the limit (the entry carries the time and actor of the adoption), and update the note of the raw content writers in src/workflow/artifact-write-inventory.ts. Run the artifact-core, the daemon lifecycle and the workflow suites once, in a clean checkout of the head and of the base, and compare the failing titles.

**Acceptance checks:**
- core-data-model.md item 3 and team-workflow.md say that the service adopts a raw content write and name the limit
- The write inventory test still passes with the updated note
- The artifact-core, daemon lifecycle and workflow suites, run in a clean checkout of the head and of the base with the failing titles compared, show no failure that the change added

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a head that a raw writeArtifact content change moved one revision past its log is approved: the log ends with an update by insrc:system with outcome result adopted at the head's revision and hash, followed by the approve at the same revision, and the head is approved | `t1` |
| the same head is reviewed and then completed through apply with the same adoption, one adopted entry per raw write | `t1` |
| a head whose number alone was raised by hand (content hash equal to the last logged one) is refused with head-ahead-of-log and nothing is written or logged | `t1` |
| a hash-mismatch head and a log-ahead-of-head head are refused as before, with no adopted entry | `t1` |
| a head with no revision-bearing log entry is approved with no adopted entry | `t1` |
| two raw content writes in a row are adopted as one entry at the last revision | `t1` |
| a raw write that restores the logged content (revision 3, the revision-1 hash) is refused, not adopted | `t1` |
| an adopted entry whose append fails (a History that throws) fails the operation, writes no head and leaves the next attempt able to adopt | `t1` |
| lifecycle-wiring: an approved artifact is redrafted by a raw content write and approved again through the daemon approve handler; the approval succeeds and the log holds the adopted entry | `t2` |
| a redraft by the design-run writer (synthesize writes the head with writeArtifact content) on an approved LLD, then insrc approval of the new draft, ends approved at the new revision | `t2` |
| the review-decision step reviews a redrafted head: the review is recorded at the new revision (no head-ahead-of-log) | `t2` |
| lifecycle-service.test.ts keeps its head-ahead-of-log case for a hand-edited number, and its hash-mismatch and log-ahead-of-head cases, unchanged | `t1`, `t3` |

## 3. References

- **[[c1]]** `code` `src/workflow/artifact-core/lifecycle-service.ts`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts`
- **[[c3]]** `code` `src/workflow/artifact-core/store.ts`
- **[[c4]]** `code` `src/workflow/artifact-core/history.ts`
- **[[c5]]** `code` `src/workflow/artifact-core/__tests__/lifecycle-service.test.ts`
- **[[c6]]** `code` `src/daemon/__tests__/lifecycle-wiring.test.ts`
- **[[c7]]** `doc` `docs/plans/core-data-model.md`
