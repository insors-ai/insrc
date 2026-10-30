<!-- insrc:artifact LLD-e587866ef17ae15a-S001 -->

# LLD: E20261030e587866e:S001

## Summary

**Epic:** `answer-abort-finished-run-status-board`
**HLD base run:** `wf-1793389753301-7s0w92`
**HLD effective hash:** `8a676498eae5...`

Fixes a correctness gap in the multi-threaded daemon: aborting a FINISHED workflow run can answer {ok:false} even though the thread that ran it still remembers it, purely because the cross-thread status board forgot the run earlier than that thread did. This Story makes abort ask every live session thread directly when the board can't name an owner, so the answer matches what a single-thread daemon would have said.

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

### 2.1 `RouterSessions.liveThreadIds`

```typescript
liveThreadIds(): readonly number[]
```

**Returns:** `readonly number[]` — Every currently-live POOL-MANAGED worker thread id, from SessionPool.liveWorkers() (session-pool.ts:120-123), which iterates ALL pool entries with no filter — this includes the shared-state worker and the unattributed worker, NOT per-session entries only. This is correct, not a gap: the existing router-session.test.ts test 'workflow.run.abort reaches a worker-owned run's owner...' already uses the SHARED worker as a legitimate abort owner, confirming a workflow run can be held by any pool worker, not just a per-session one.

**Preconditions:**
- Called only from Router.dispatchSession's workflow.run.abort branch when ownerOf(runId) returned undefined.

**Postconditions:**
- The returned array reflects SessionPool's live entries at call time; a worker that exits between this call and the fan-out is simply absent from this.ports and is skipped (existing this.ports.has() guard).

### 2.2 `Router.dispatchSession`

```typescript
dispatchSession(request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped: () => void): () => void
```

**Returns:** `() => void` — A cancel function, unchanged in shape from today.

**Preconditions:**
- request.method === 'workflow.run.abort' and this.runOwner(runId) (board-derived) returned undefined — the new branch; every other method/owner combination is unchanged from today's behavior.

**Postconditions:**
- Every live id from this.sessions.liveThreadIds() that still has a port in this.ports receives a synthetic workflow.run.abort with a fresh internal requestId and the SAME params as the original request.
- deliver() is called exactly once with the ORIGINAL request's requestId: {ok:true} as soon as any fan-out target replies {ok:true}; otherwise {ok:false} once every fan-out target has replied (including immediately, with zero targets).
- The analyze.run.status / analyze.run.purge branches of the same ownerOf dispatch are UNCHANGED — this fan-out is scoped to workflow.run.abort only.

## 3. Data model changes

### 3.1 `RouterSessions` — field-add

New method liveThreadIds(): readonly number[], additive to the existing interface (workerFor, sharedWorker, started, ended, setQueued, startedOn, endedOn all unchanged). session-routing.ts wires router.useSessions(pool, ...) passing the SessionPool INSTANCE directly as the RouterSessions argument (no separate adapter object) — so the method must be implemented on the SessionPool class itself (src/daemon/threads/session-pool.ts), delegating to the existing liveWorkers() at line 122. Three test files construct a bare RouterSessions object literal and must each gain a liveThreadIds() member to keep compiling: router-session.test.ts:117, analyze-run-owner.test.ts:92, router-thread-view.test.ts:154.

**Call sites:**
- `src/daemon/threads/router.ts:75-88`
- `src/daemon/threads/session-pool.ts:120-123`
- `src/daemon/threads/session-routing.ts:24-48`
- `src/daemon/threads/__tests__/router-session.test.ts:117`
- `src/daemon/threads/__tests__/analyze-run-owner.test.ts:92`
- `src/daemon/threads/__tests__/router-thread-view.test.ts:154`

## 4. Error paths

**Error cases**

- **A fan-out target thread crashes/exits while its synthetic abort is still in flight.** (recoverable)
  - Detection: The router's existing failWorker(threadId, reason) path (router.ts:191-213) calls detach(threadId), which resolves every pending request on that thread — including the synthetic fan-out sub-request — with an error reply; this is pre-existing machinery, not new in this Story.
  - Response: The aggregator's deliver callback receives a reply with `error` set (not `result.ok===true`); it is treated the same as an ok:false reply for aggregation purposes — it does not block the aggregate from resolving once every fan-out target has answered (error or ok:false count the same toward 'this target does not hold the run').
  - User impact: No impact beyond the pre-existing crash-recovery behavior; the overall abort still resolves once every target has answered or errored.
- **liveThreadIds() returns an id no longer present in this.ports (a worker exited between the enumeration call and the fan-out send).** (recoverable)
  - Detection: The fan-out loop checks this.ports.has(id) before sending, mirroring every other existing Router dispatch site's same guard (e.g. router.ts:246, :263, :284, :418).
  - Response: That id is simply skipped — not counted as a fan-out target, so it cannot block or delay the aggregate.
  - User impact: None; matches the existing pattern used everywhere else in the file for a target that may have gone stale between lookup and send.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| liveThreadIds() returns an empty array (no live session workers at all, e.g. right after daemon startup with no sessions yet). | Zero fan-out targets — the aggregate resolves immediately to {ok:false}, matching the Fix intent's 'a run that no thread holds still answers {ok:false}'. |
| Two or more fan-out targets reply {ok:true} (should not happen — a given runId is only ever held by one worker's registry — but the aggregator must not assume exactly one true). | The FIRST {ok:true} reply resolves the aggregate to {ok:true}; any later replies (true or false) from the remaining targets are received and discarded, not delivered again (deliver() is called exactly once per the s4 postcondition). |
| A fan-out target thread is alive but never replies (e.g. stuck on a long synchronous task) — no router-level per-request timeout exists anywhere else in this file for an already-dispatched request (confirmed by s1/s4 reading: only hold()'s holdMs applies to a request waiting for a worker to REGISTER, not one already sent). | This Story does not add a new timeout; the abort waits exactly as long as any other in-flight request to that worker would, matching the system's existing accepted behavior rather than introducing new timeout machinery out of this bugfix's scope. |
| The original workflow.run.abort request itself is cancelled (socket closed) while the fan-out is still in flight. | The returned cancel function (dispatchSession's existing return shape, unchanged per s4) is invoked; it cancels every outstanding fan-out sub-request the same way a single dispatched request is cancelled today (router.ts's existing per-request cancel() mechanism), so no fan-out sub-request outlives the client's interest in the answer. |

**Invariants to preserve**

- The analyze.run.status / analyze.run.purge ownerOf-for-abort-style dispatch (router.ts:258-261, sharing the same ownerOf lookup mechanism as workflow.run.abort) is completely unchanged by this Story — the new fan-out branch fires ONLY for request.method === 'workflow.run.abort'. [[c1]]
- Every existing Router dispatch site guards a target with this.ports.has(threadId) before sending (router.ts:246, :263, :284, :418) — the new fan-out loop must follow the same guard, not assume liveThreadIds() and this.ports stay in sync. [[c2]]
- StatusBoard's MAX_RUNS global eviction (status-board.ts:78, :124-142) and WorkflowRunRegistry's own per-worker gc() (workflow-run-registry.ts:224-236) are completely unchanged by this Story — the fix is confined to the router's dispatch, not the board's retention policy. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test), extending the existing src/daemon/threads/__tests__/router-session.test.ts harness() fixture`

**Test levels**

- **unit** — Verify the broadcast-fallback abort dispatch in isolation over the existing router-session.test.ts in-thread fake-worker harness, extended with multiple named session workers whose workflow.run.abort responses are parameterized per runId (unlike today's harness, which has every worker answer {ok:true} unconditionally).
  - Subjects: `router.ts Router.dispatchSession (the new owner===undefined fan-out branch for workflow.run.abort)`, `router.ts RouterSessions.liveThreadIds (new interface member)`, `session-routing.ts startSessionRouting's wiring of liveThreadIds to pool.liveWorkers().map(w => w.threadId)`
  - Fixtures: `an extended harness() with 2+ named session workers whose workflow.run.abort handler answers {ok:true} only for a specific runId it 'owns' and {ok:false} for any other runId (replacing the current unconditional {ok:true} stub)`, `a runOwner callback returning undefined for the test's target runId (simulating board eviction) while a live worker still 'holds' it`, `a fake liveThreadIds() returning the harness's current worker thread ids`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `router-session.test.ts: workflow.run.abort with an unknown-to-the-board runId answers {ok:true} when a live session worker still holds that run, broadcasting to every live session thread rather than only the asking session's own worker` |
| `ac2` | `router-session.test.ts: workflow.run.abort with a runId no live worker holds (board unknown AND every live worker answers {ok:false}) still answers {ok:false}, matching today's behavior for a genuinely unknown run` |
| `ac3` | `router-session.test.ts: the existing 'workflow.run.abort reaches a worker-owned run's owner as a busy request, and a main-thread run here' test (the mainThreadId / known-owner branches) still passes unmodified — this Story does not change those paths` |
| `ac4` | `router-session.test.ts: an unrelated workflow.run.poll / analyze.run.status request is routed exactly as before (no new fan-out) — the broadcast is scoped to workflow.run.abort only` |

## 6. Migration

**State before:** RouterSessions (router.ts:75-88) has no enumeration method. Router.dispatchSession's ownerOf-undefined case for workflow.run.abort (router.ts:258-276) falls through to toSessionWorker/toShared, reaching only the ASKING session's own worker, which answers {ok:false} if it never held the run — even when a different live session worker still does.

**State after:** RouterSessions gains liveThreadIds(): readonly number[], wired in session-routing.ts to pool.liveWorkers().map(w => w.threadId). Router.dispatchSession's workflow.run.abort branch, when ownerOf(runId) is undefined, fans out a synthetic abort to every live id from liveThreadIds() with a port in this.ports, and answers {ok:true} on the first {ok:true} reply, else {ok:false} once all have replied (or immediately with zero targets). analyze.run.status/purge and every other dispatch path are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add liveThreadIds(): readonly number[] to the RouterSessions interface (router.ts:75-88). — ↩ rollbackable
2. Implement liveThreadIds(): readonly number[] on the SessionPool class itself (session-pool.ts, near the existing liveWorkers() at line 122), delegating to liveWorkers().map(w => w.threadId) — this returns every live pool-managed worker (per-session, shared-state, and unattributed alike), which is the correct broadcast scope since any of them can own a workflow run. session-routing.ts needs NO separate wiring change: it already passes the SessionPool instance (pool) directly as the RouterSessions argument to router.useSessions(), so the new method is picked up automatically once SessionPool implements it. — ↩ rollbackable
3. In Router.dispatchSession's existing ownerOf-for-abort branch, replace the owner===undefined fall-through (for workflow.run.abort only) with a fan-out over liveThreadIds() filtered by this.ports.has(id), aggregating replies to a single {ok:true}-on-first-true / {ok:false}-once-all-replied answer delivered once to the original caller. — ↩ rollbackable
4. Add a liveThreadIds() member to the three test files that construct a bare RouterSessions object literal: router-session.test.ts:117, analyze-run-owner.test.ts:92, router-thread-view.test.ts:154 — required for them to keep typechecking once the interface gains the member. — ↩ rollbackable

**Backward compat:** Purely additive at the type level (one new interface method); the only caller of RouterSessions in production code is session-routing.ts, updated in the same Story. Any OTHER RouterSessions implementation (e.g. a test fake) that omits liveThreadIds would fail to typecheck, which is the correct signal for an interface method with no safe default (there is no meaningful 'no live threads' default distinct from an empty array, and a silently-empty array would quietly restore today's buggy ok:false-always behavior) — every production and test call site is updated in this Story's own task list, not left broken.

## 7. Alternatives considered

### 7.1 a1: Broadcast-fallback abort over enumerated live session threads — **CHOSEN**

When the board can't name an owner for workflow.run.abort, ask every live session-class worker thread directly and answer ok:true if any of them does.



### 7.2 a2: Per-owner-capped board retention

Replace StatusBoard's single global MAX_RUNS=64 cap with a per-owner-thread cap, so a run stays on the board for at least as long as its owning worker's own registry would keep it.



**Rejected because:** Addresses the symptom but, by its own stated gap, is not safe to ship alone — it reopens a memory-leak risk for released/crashed owner threads that would need a second story to close.

### 7.3 a3: Leave the fallback as-is; only correct the ISSUE's documentation

Treat the gap as accepted behavior and update comments/docs to say so explicitly, rather than changing code.



**Rejected because:** Safe only because it does nothing; leaves the caller-visible correctness gap between threads-on and threads-off that the multi-threading Epic was meant to eliminate.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 symbol.locate+read: Router/RouterSessions/StatusBoard/abortWorkflowRun/startSessionRouting (src/daemon/threads/router.ts:75-88,152-594,258-276; src/daemon/threads/status-board.ts:78,82-179,124-142; src/daemon/workflow-run-registry.ts:216-222,224-236; src/daemon/threads/session-routing.ts:24-48)`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate+read: TargetRegistry.targets()/ThreadTarget vs SessionPool.liveWorkers()/StartedWorker (src/daemon/threads/registry.ts:18-26,43-69; src/daemon/threads/workers.ts:35-41; src/daemon/threads/router.ts:75-88)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 5 hold** · template `design-issue` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T19:59:31.558Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
