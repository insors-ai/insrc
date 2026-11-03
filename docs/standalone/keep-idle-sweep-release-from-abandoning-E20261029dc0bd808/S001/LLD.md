<!-- insrc:artifact LLD-dc0bd8089ce15fcd-S001 -->

# LLD: E20261031dc0bd808:S001

## Summary

**Epic:** `keep-idle-sweep-release-from-abandoning`
**HLD base run:** `wf-1793451907715-l95rtm`
**HLD effective hash:** `79a7a8031411...`

Fixes a false-safe gap in the multi-threaded daemon's idle graph compaction: compaction can be abandoned (and simply retried on the next idle window) when the idle sweep releases a session worker that had already acknowledged closing its graph handle, purely because a redundant worker-count comparison lags behind the identity check that already proves safety on its own. This Story removes only that redundant count comparison.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `MaintenanceController.compactUnderLock`

```typescript
compactUnderLock(reason: string): Promise<CompactResult>
```

**Returns:** `Promise<CompactResult>` — Resolves with the compaction result once the lock is granted, handles are closed, and the store is compacted (or rejects per the existing error paths, all unchanged by this Story).

**Preconditions:**
- Called only from MaintenanceController.run(reason), unchanged.

**Postconditions:**
- The beforeRename callback it passes to this.deps.compact(...) now evaluates to live.every(w => closed.acknowledged.has(w.threadId)) only — the this.deps.workers.created() === live.length term is removed.
- A worker that acknowledged closing its graph handle and is later released from the live set before the rename check runs no longer causes beforeRename to answer false by itself.
- A worker that is live at rename time but never acknowledged closing its handle (new, replaced, or otherwise) still makes beforeRename answer false, exactly as today.

## 3. Data model changes

### 3.1 `MaintenanceController.compactUnderLock (beforeRename callback)` — invariant-change

The rename-gating invariant changes from 'every live worker acknowledged AND the live count matches the created count' to 'every live worker acknowledged' alone. The dropped count term is proven redundant by the existing identity test (maintenance.test.ts:165, whose fake already makes the count term vacuously true) and is the sole mechanism by which the idle-sweep release/exit-event timing lag (Supervisor.createdCount decrementing only on 'exit', session-pool release() updating live() earlier) can produce a false negative. [[c1]]

**Call sites:**
- `src/daemon/threads/maintenance.ts:242`

## 4. Error paths

**Error cases**

- **A worker is live at rename time, allClosed is true, but that worker never acknowledged closing its graph handle (a brand-new worker started after closeWorkerHandles ran, or a replacement under a different threadId).** (recoverable)
  - Detection: live.every(w => closed.acknowledged.has(w.threadId)) returns false for that specific worker's threadId, which never entered the acknowledged set built during closeWorkerHandles.
  - Response: beforeRename returns false; the compact() call does not rename, the original store reopens and serves (unchanged existing behavior, matching the existing test 'the pre-rename check returns false when a worker has not acknowledged graph.close...').
  - User impact: Compaction is skipped this idle window and retried on the next one; no data is at risk, nothing is renamed.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A worker acknowledges closing its graph handle, then the idle sweep releases it (removes it from workers.live()) before the beforeRename check runs, while the Supervisor's createdCount() has not yet decremented (its 'exit' event has not fired). | beforeRename now evaluates live.every(...) over the SHRUNK live set, which still only contains workers in the acknowledged set — returns true. Compaction proceeds. This is the Story's own Fix intent: the release no longer aborts the compaction, matching single-thread/no-release behavior. |
| Every live worker is released before the rename check (live() is empty). | live.every(...) over an empty array is vacuously true — the rename proceeds, which is correct: no worker remains that could hold a graph handle. |
| closed.allClosed is false (at least one worker failed to acknowledge within the ack timeout, per closeWorkerHandles). | beforeRename's existing guard `if (!closed.allClosed) return false;` (unchanged by this Story) short-circuits before the identity check is even reached — this path is untouched. |

**Invariants to preserve**

- beforeRename's identity check (live.every(w => closed.acknowledged.has(w.threadId))) correctly rejects a replacement/new worker not in the acknowledged set, independent of count — demonstrated by the existing test 'the pre-rename check is by worker identity...' (maintenance.test.ts:165-191), whose fake trivially satisfies the count term so the test exercises identity alone. [[c1]]
- Supervisor.createdCount() (supervisor.ts:136-138) decrements ONLY on a worker's 'exit' event, which fires strictly after SessionPool's release() begins terminating it (session-pool.ts:276) — the two counters are updated by independent events and this Story does not change that relationship; it only stops MaintenanceController from depending on their count agreeing. [[c1]]
- closeWorkerHandles' own allClosed flag (created === workers.length, computed from two back-to-back synchronous reads with no await between them) is a DIFFERENT, race-free use of created()/live() and is NOT touched by this Story — only the beforeRename callback's separate, later, racy re-read is changed. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test), extending src/daemon/threads/__tests__/maintenance.test.ts's existing MaintenanceController fake-worker pattern (as used by the identity test at line 165)`

**Test levels**

- **unit** — Verify beforeRename's new identity-only semantics directly over a fake workers dependency that lets live() and created() diverge independently — unlike the existing identity test's fake, which deliberately makes them always agree.
  - Subjects: `maintenance.ts MaintenanceController.compactUnderLock's beforeRename callback`
  - Fixtures: `a fake workers dependency with INDEPENDENT live() and created() functions (not created: () => live.length), so a test can shrink live() after acknowledgement while created() stays unchanged, simulating the release/exit-event lag`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `maintenance.test.ts: the pre-rename check no longer abandons the compaction when a worker that already acknowledged graph.close is released (removed from live()) before the rename check runs, even though the supervisor's created count has not yet caught up` |
| `ac2` | `maintenance.test.ts: the existing 'pre-rename check is by worker identity...' test (a replacement worker that never acknowledged still fails the check) still passes unmodified` |
| `ac3` | `maintenance.test.ts: the existing 'pre-rename check returns false when a worker has not acknowledged graph.close' integration test still passes unmodified` |

## 6. Migration

**State before:** maintenance.ts:242's beforeRename callback checks this.deps.workers.created() === live.length && live.every(w => closed.acknowledged.has(w.threadId)). The count term can go false purely because SessionPool's release() (session-pool.ts:276) removes a worker from live() before Supervisor.createdCount() (supervisor.ts:136-138) decrements on that worker's later 'exit' event, abandoning a compaction that was otherwise safe to rename.

**State after:** beforeRename checks only live.every(w => closed.acknowledged.has(w.threadId)). A worker released after acknowledging no longer affects the outcome; a worker live but never acknowledged (new or replaced) still correctly fails the check.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Remove the this.deps.workers.created() === live.length && clause from the beforeRename callback in MaintenanceController.compactUnderLock (maintenance.ts:242), leaving only the identity-based live.every(...) check. — ↩ rollbackable

**Backward compat:** No public API or interface change: beforeRename's call signature, return type, and every other behavior (the allClosed short-circuit, closeWorkerHandles, the lock/pause-limit/health machinery) are untouched. This is a behavior-narrowing fix confined to one internal boolean expression.

## 7. Alternatives considered

### 7.1 a1: Drop the redundant count term — **CHOSEN**

Remove this.deps.workers.created() === live.length && from beforeRename, keeping only the identity-based .every() check.



### 7.2 a2: Make Supervisor.createdCount() decrement on release, not only on thread exit

Add a release-time hook so the Supervisor's created set drops a worker as soon as the session pool begins releasing it, not only when its thread later exits.



**Rejected because:** Solves a problem s1's own grounding shows does not need solving, at M cost (touches Supervisor's public contract and SessionPool's call site plus their own tests) and with a new race risk of its own (decrementing created() before the thread's exit is confirmed).

### 7.3 a3: Reuse the closeWorkerHandles() live() snapshot at rename time instead of re-querying live()

Capture live() once during closeWorkerHandles and pass that same snapshot into beforeRename, instead of calling workers.live() again at rename time.



**Rejected because:** Fails the core safety constraint outright: a worker that starts AFTER the snapshot would not appear in it at all, so .every() over the stale snapshot could pass even though a brand-new, never-asked-to-close worker is now live — silently loses the exact protection a1 keeps intact.

## 8. References

- **[[c1]]** `code` `src/daemon/threads/maintenance.ts:242` — "Direct reading confirmed: beforeRename's identity check (live.every(w => closed.acknowledged.has(w.threadId))) at maintenance.ts:242 already correctly rejects a replacement/new worker per the existing"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-31T13:07:50.078Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
