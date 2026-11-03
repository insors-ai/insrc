<!-- insrc:artifact PLAN-0764c4bcaa076f8e-s1 -->

# Plan: STORY-0764c4bcaa076f8e-s1

## Summary

**Epic:** `resume-frozen-review-publication-after-interruption`
**LLD run:** `wf-1793271216692-3ugmxy`
**LLD effective hash:** `24be9a22390b...`

Add recoverable publication intent and ownership fencing to the existing review runtime. Build the durable state first, then the callback and its timeout behavior, and prove the result with deterministic crash and concurrency tests. This supplies the approved Story 4 prerequisite without implementing S5 publication or activating the new engine.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Persist and replay one frozen publication binding | M | — | — | unit: Frozen publication binding validates identity checkpoint and attempt state; integration: Publication-intent fsync replay and uncertain append reconciliation | [[c1]] [[c2]] |
| 2 | **`t2`** Recover completion-requested ownership without changing intent | S | — | `t1` | unit: Frozen completion-requested takeover and legacy terminal refusal; integration: Replacement owner preserves publication intent and fences prior generation | [[c1]] [[c3]] |
| 3 | **`t3`** Expose the approved owner-fenced publication callback | M | — | `t2` | unit: Approved publication callback binding guard and null replay; integration: Callback failure and separate terminal receipt do not reenter run queue | [[c1]] [[c4]] |
| 4 | **`t4`** Bound callback responses while retaining the write fence | M | — | `t3` | unit: Callback deadline revokes authority and rejects late success; integration: Undrained callback retains write fence through caller timeout | [[c4]] [[c5]] |
| 5 | **`t5`** Prove crash reconciliation and downstream compatibility | M | — | `t4` | integration: Publication crash boundaries reconcile frozen intent and terminal receipt; integration: Concurrent publication and external-operation replay preserve one frozen scope; smoke: Focused recovery investigation compatibility suites and production build | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |

### 1.1 TASK-0764c4bcaa076f8e-s1-t1 — Persist and replay one frozen publication binding

Extend recovery-types.ts, recovery-replay.ts, recovery-lifecycle.ts and recovery-journal.ts with the nullable internal publication projection and versioned publication-intent event. Validate run-scoped immutable object/digest, checkpoint, owner and settled-attempt boundary; atomically freeze state before any publisher callback.

**Acceptance checks:**
- Existing histories initialize publication null; ReviewRecoveryV1 and sc3/sc6 public signatures remain unchanged.
- A valid intent binds one exact checkpoint through one durable event; control ordinal advances without moving accepted-block sequence.
- Foreign/missing/corrupt/non-object intent, changed checkpoint or active issued attempt refuses before acceptance.
- Identical binding replays without another event; different intent/checkpoint refuses, and uncertain append is reconciled before callback.

### 1.2 TASK-0764c4bcaa076f8e-s1-t2 — Recover completion-requested ownership without changing intent

Update lifecycle claim/replay and store admission so a valid frozen publication can be claimed under a later generation while state remains completion-requested. Preserve legacy no-intent and terminal-state refusals explicitly.

**Acceptance checks:**
- Restart/expiry takeover strictly increases generation while retaining the exact intent/digest/checkpoint and frozen state.
- Late prior owner cannot mutate progress or publish after takeover.
- Legacy completion-requested without binding is readable but explicitly unsupported for automatic publication recovery.
- Completed/cancelled/stale runs cannot gain new publication authority; completed callers use terminal receipt.

### 1.3 TASK-0764c4bcaa076f8e-s1-t3 — Expose the approved owner-fenced publication callback

Implement the exact withPublicationFence signature on RecoveryStore, with recovery-publication.ts helper only if useful. Reuse the run-root queue; accept/stabilize intent before callback and provide current-owner assertion. Keep terminal receipt persistence outside the callback queue and avoid canonical CR semantics.

**Acceptance checks:**
- Callback begins only after durable frozen binding and receives its original reference plus current-owner guard.
- Same/null reference retrieves existing binding; null without binding and conflicting references refuse before callback.
- Current-owner guard checks invocation, checkpoint/intent, generation, daemon process ownership and lease.
- Callback failure retains frozen state; successful result does not manufacture completion/CR/approval. Same-intent callback retry is allowed for S5 reconciliation, not claimed exactly-once.
- Callback cannot reenter the run queue by contract; existing normal recovery and external entrypoints retain behavior.

### 1.4 TASK-0764c4bcaa076f8e-s1-t4 — Bound callback responses while retaining the write fence

Add the ten-second callback deadline and invocation revocation. Return timeout/uncertainty promptly while retaining run serialization until the actual callback settles, so no competing write can overlap an undrained external commit.

**Acceptance checks:**
- Normal callback returns only while authority remains valid; deadline/late result cannot produce success.
- Timeout revokes the supplied guard and reports uncertainty without claiming external cancellation or a missing side effect.
- Queued takeover/mutation remains blocked until the actual callback drains; an unresponsive run stays fenced until safe daemon restart.
- Timers/listeners clean up on settlement; use deterministic mock timers/gated promises, not ten-second sleeps or live model calls.

### 1.5 TASK-0764c4bcaa076f8e-s1-t5 — Prove crash reconciliation and downstream compatibility

Extend real recovery worker/fixtures with publication boundaries and test concurrent callers, callback side effects, restart and separate receipt persistence. Verify exports/documentation and keep relevant sequence source aligned; no S5 canonical publisher or S6 activation.

**Acceptance checks:**
- Crashes before/after frozen-intent commit and after callback before receipt restore only the verified binding and preserve recovery state.
- A deterministic external-write stand-in reconciles the same operation on retry; no test or API claims arbitrary callback exactly-once.
- Concurrent same/different intents and stale callbacks cannot change frozen scope or overlap undrained writes.
- Verified terminal receipt is recorded separately after callback queue releases and replays idempotently.
- Focused recovery/investigation compatibility suites and production build pass; no whole-repo sweep, live LLM test, canonical CR changes or rollout.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Publication intent identity, run reference, checkpoint and active-attempt validation | `t1` |
| Completion-requested lease takeover preserves frozen state | `t2` |
| Identical/null binding replay and conflict refusal | `t1`, `t3` |
| Deadline revocation and undrained callback write-fence retention | `t4` |
| Crash before/after frozen intent commit and after callback before receipt | `t1`, `t5` |
| Concurrent same/different intent and stale owner callbacks | `t2`, `t3`, `t4`, `t5` |
| Successful callback followed by separately recoverable terminal receipt | `t3`, `t5` |
| Legacy pending state refusal and unaffected existing recovery | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/LLD.md#3-data-model-changes` — "RecoveryView publication binding and publication-intent journal transition."
- **[[c3]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/LLD.md#3-data-model-changes` — "Completion-requested takeover."
- **[[c4]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/LLD.md#3-data-model-changes` — "Bounded publication fence."
- **[[c5]]** `prior-artifact` `docs/standalone/resume-frozen-review-publication-after-interruption-E202610290764c4bc/S001/LLD.md#7-test-strategy`
