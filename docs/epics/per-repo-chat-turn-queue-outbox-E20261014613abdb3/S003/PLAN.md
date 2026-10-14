<!-- insrc:artifact PLAN-613abdb351c2c738-s3 -->

# Plan: E20261014613abdb3:S003

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**LLD run:** `wf-1791988197055-kf5a2u`
**LLD effective hash:** `02f5e748bf5b...`

The build adds two store reads and writes, fills the two lease stubs, then rewires the worker in three small steps: dispose keeps the presence row, the tick uses reclaim and takeOver instead of recoverDeadLease, and a closed window's head message is marked not delivered. Each store rule is one guarded transaction proved with two connections on one file; each worker rule is proved with fake timers and a fake process map. A last task pins the unchanged bound, lists the existing follow tests that carry the reload display, scores the Epic constraints, notes the HLD amendments to file, and records the two-window hand check.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Store: presenceOf read and markNotDeliveredIfHead | S | — | integration: chat-queue-store.test.ts: presenceOf returns the row, and undefined when there is none; integration: chat-queue-store.test.ts: markNotDeliveredIfHead marks the head, the next row becomes the head, and a row acknowledged first by another connection is not marked; integration: chat-queue-store.test.ts: markNotDeliveredIfHead marks a retrying head whose window closed and the next row becomes the head | [[c1]] [[c2]] |
| 2 | **`t2`** Store: takeOver and reclaim transactions | M | `t1` | integration: chat-queue-store.test.ts: takeOver takes a stale lease of another windowKey only after LEASE_TAKEOVER_MS and fails its message, and refuses when holderGone is false, absent or the heartbeat is fresh; integration: chat-queue-store.test.ts: takeOver takes a lease of the claim's own windowKey at once when holderGone is true; integration: chat-queue-store.test.ts: two connections racing takeOver on one stale lease, exactly one returns true; integration: chat-queue-store.test.ts: reclaim rewrites pid and keeps seq and cliPid for the same windowKey, and refuses another windowKey | [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Worker: dispose keeps the presence row | S | `t1` | unit: chat-queue-worker.test.ts: dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes; unit: chat-queue-worker.test.ts: the worker (the existing S001 test, its presence assertion inverted to presence kept) | [[c6]] [[c8]] |
| 4 | **`t4`** Worker: lease rules replace recoverDeadLease | M | `t2`, `t3` | unit: chat-queue-worker.test.ts: worker recovery: a reloaded window reclaims a lease whose CLI lives and does not fail the message; unit: chat-queue-worker.test.ts: worker recovery: a dead holder and dead CLI of another window is freed only after LEASE_TAKEOVER_MS and the next message runs; unit: chat-queue-worker.test.ts: worker recovery: a holder that keeps heartbeating past LEASE_TAKEOVER_MS is never taken over | [[c5]] [[c7]] [[c8]] |
| 5 | **`t5`** Worker: reclaimed-lease rule | S | `t4` | unit: chat-queue-worker.test.ts: a reclaimed lease is heartbeated while the CLI lives, then finished as detached-ended and released when the CLI exits, and the next message runs; unit: chat-queue-worker.test.ts: a reclaimed lease lost to another window clears the marker and stops heartbeating | [[c5]] [[c7]] |
| 6 | **`t6`** Worker: closed-window head rule | M | `t1`, `t3` | unit: chat-queue-worker.test.ts: a head whose window stopped refreshing presence and whose pid is dead is marked not-delivered after PRESENCE_GRACE_MS and the next message runs; unit: chat-queue-worker.test.ts: a head whose window has a fresh presence row or a live pid is never marked; no presence row and a message younger than PRESENCE_GRACE_MS is not marked; unit: chat-queue-worker.test.ts: dispose-and-recreate a worker with the same windowKey while a second window ticks, the head is not marked not-delivered; unit: chat-queue-worker.test.ts: a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend and no row is lost; unit: chat-queue-worker.test.ts: a previous-plugin window's dispose deleting its presence row: a head younger than PRESENCE_GRACE_MS is not marked, an older one is marked once | [[c3]] [[c4]] [[c6]] [[c7]] |
| 7 | **`t7`** Bound, display half of ac3, amendments and hand check | S | `t5`, `t6` | integration: chat-queue-store.test.ts: at QUEUE_RECORD_BOUND enqueue is refused with FULL_NOTE, a resend replaces its own old row, and no row is lost; unit: chat-queue-worker.test.ts: submit at the bound returns ok:false reason full; live: hand check in two windows: reload mid-turn with the CLI alive, reload with queued messages while a second window ticks, and close a window with queued messages | [[c9]] [[c10]] |

### 1.1 E20261014613abdb3:S003:T001 — Store: presenceOf read and markNotDeliveredIfHead

In chat-queue-store.ts add presenceOf(windowKey) to ChatQueueLeases (a read returning the window's presence row, or undefined) and markNotDeliveredIfHead(seq) to ChatQueueStore: one IMMEDIATE transaction that re-reads the head with the existing LIVE_HEAD query (reused, not restated, so it cannot drift from head()) and, when the head's seq equals the given seq (state queued or retrying), sets state not-delivered with error 'its window was closed', clearing waiting_on; returns false otherwise. Both additive; no schema change.

**Acceptance checks:**
- presenceOf returns pid, pidStartedAt and heartbeatAt for a window that wrote presence, and undefined for one that did not
- markNotDeliveredIfHead marks the head and returns true; the next row becomes the head
- a row acknowledged first by another connection is not marked and the call returns false
- a retrying head is marked too

### 1.2 E20261014613abdb3:S003:T002 — Store: takeOver and reclaim transactions

Replace the two stubs in chat-queue-store.ts. takeOver(claim, now, holderGone?) runs in one IMMEDIATE transaction: re-read the lease; refuse when none, when it is this exact claim's, or when holderGone is absent or false; take it when the lease's windowKey equals the claim's, or when now - heartbeat_at >= LEASE_TAKEOVER_MS; then finish the lease's message as failed ('the window closed during the turn'), delete the lease row. reclaim(claim, holderGone?) re-reads the lease and, for the same windowKey with holderGone true, rewrites pid and pid_started_at, refreshes heartbeat_at and keeps seq and cliPid. Add the optional holderGone argument to the interface types.

**Acceptance checks:**
- a stale lease of another windowKey with holderGone true is taken after LEASE_TAKEOVER_MS and not before, and its message is failed with a resend
- a lease of the claim's own windowKey with holderGone true is taken at once
- holderGone absent or false never takes a lease, however stale
- two connections racing takeOver on the same stale lease: exactly one returns true
- reclaim for the same windowKey rewrites pid and keeps seq and cliPid and does not fail the message; for another windowKey it returns false
- a lease whose message row is gone is deleted and nothing else changes

### 1.3 E20261014613abdb3:S003:T003 — Worker: dispose keeps the presence row

In chat-queue-worker.ts dispose() stops calling store.leave(claim), so a reloading window's presence row ages out over PRESENCE_GRACE_MS instead of vanishing. Keep the rest of dispose (finish and release when the lease is this window's and its CLI is gone). Invert the S001 assertion at chat-queue-worker.test.ts:151 ('presence removed') to 'presence kept'.

**Acceptance checks:**
- after dispose the window's presence row is still there and windowAlive stays true until PRESENCE_GRACE_MS has passed
- dispose with the turn's CLI still running leaves the lease; with the CLI gone it finishes and releases, as before
- the S001 dispose test passes with its assertion inverted

### 1.4 E20261014613abdb3:S003:T004 — Worker: lease rules replace recoverDeadLease

Remove recoverDeadLease from the worker's tick and add the lease rules: for a lease that is not this claim's whose holder pid is gone, a same-windowKey lease whose CLI is alive is reclaim()ed and one whose CLI is gone is takeOver()n at once; another window's lease is takeOver()n only after LEASE_TAKEOVER_MS, passing a holderGone predicate built from deps.isAlive over the holder pid and the lease's CLI. Move the 97df9bf7 'worker recovery' test onto the new calls.

**Acceptance checks:**
- a reloaded window (same key, new pid) with the old CLI alive reclaims the lease and the message is not failed
- a reloaded window with the old CLI gone frees the lease at once and fails the message with a resend
- another window's dead lease is freed only after LEASE_TAKEOVER_MS, and a heartbeating holder past LEASE_TAKEOVER_MS is never taken
- a tick in a window running its own message does not touch the lease
- the 97df9bf7 worker recovery test passes on the new calls

### 1.5 E20261014613abdb3:S003:T005 — Worker: reclaimed-lease rule

After a reclaim the window holds a lease for a turn it did not start. While current is undefined and the worker holds a reclaimed lease, heartbeat it on each tick and check isAlive(cliPid, cliStartedAt); when the CLI has exited, finish(seq, detached-ended) and release the lease so the next message runs. Keep a small 'reclaimed seq' marker in the worker, cleared when the lease is finished or lost.

**Acceptance checks:**
- a reclaimed lease is heartbeated while the CLI lives, so no other window takes it over
- when the surviving CLI exits the message is finished as detached-ended, the lease released and the next message runs
- if the lease is lost to another window the worker clears its marker and stops heartbeating
- the display of the reloaded turn is not changed (S001's followLiveTurn)

### 1.6 E20261014613abdb3:S003:T006 — Worker: closed-window head rule

In the worker's tick, when the head message belongs to another window and the lease is free, decide whether that window is closed: presenceOf(head.windowKey) exists with heartbeatAt older than PRESENCE_GRACE_MS and isAlive(presence.pid, presence.pidStartedAt) false, or it has no presence row and head.createdAt is older than PRESENCE_GRACE_MS. When closed, call markNotDeliveredIfHead(head.seq) so the queue moves on; a false return is ignored. Log the marking with the message key and window key.

**Acceptance checks:**
- a head whose window stopped refreshing presence for more than PRESENCE_GRACE_MS with a dead pid is marked not-delivered and the next message runs
- a window whose presence row is fresh, or whose pid is alive, is never marked
- a head with no presence row younger than PRESENCE_GRACE_MS is not marked; an older one is
- dispose-and-recreate of a worker with the same windowKey while a second window ticks does not get the head marked
- a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend and no row is lost
- a retrying head of a closed window is marked too
- mixed versions: a previous-plugin window's dispose deleting its presence row does not get a head younger than PRESENCE_GRACE_MS marked, and an older one is marked once

### 1.7 E20261014613abdb3:S003:T007 — Bound, display half of ac3, amendments and hand check

Pin ac5 with tests over the existing bound (enqueue refuses at QUEUE_RECORD_BOUND with FULL_NOTE and leaves every row; a resend frees its own old row first, so at the bound it replaces that row and is never refused, as S001 built it; submit at the bound returns ok:false reason full) without new production code. List the existing S001 tests that carry ac3's display half in the TESTS record (turn-lifecycle.test.ts follow tests and chat-panel.test.ts reload-follow tests). Score k1-k5 against the finished change in the BUILD summary. List the three HLD amendments the question resolutions chose (sc1 methodAdd markNotDeliveredIfHead; sc2 methodAdd presenceOf plus the takeOver holderGone and own-key rule; the HLD 'flush' wording) as to be filed for the owner's approval, and say in the BUILD summary whether they were filed; they are not code and do not block the code tasks. Run the hand check in two windows: reload mid-turn with the CLI alive, reload with queued messages while a second window ticks, and close a window with queued messages.

**Acceptance checks:**
- enqueue at the bound is refused with FULL_NOTE, a resend at the bound replaces its own old row and is not refused, and no row is lost
- submit at the bound returns ok:false reason full
- the TESTS record names the S001 follow tests for ac3's display half
- the BUILD summary scores k1-k5 and states whether the three HLD amendments were filed
- the hand check is recorded as a reported live test with its evidence

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| takeOver: stale and holderGone takes over and fails the message; fresh heartbeat or holder alive does not | `t2` |
| reclaim: same windowKey and old pid gone rewrites pid and keeps seq and cliPid; other windowKey refused | `t2` |
| markNotDeliveredIfHead: head row marked; a row acknowledged first is not | `t1` |
| two connections racing takeOver: exactly one returns true | `t2` |
| takeOver: a lease of the claim's own windowKey with holderGone true is taken at once; another key's lease only after LEASE_TAKEOVER_MS | `t2` |
| presenceOf: returns the row, and undefined when there is none | `t1` |
| markNotDeliveredIfHead: a retrying head whose window closed is marked not-delivered and the next row becomes the head | `t1` |
| tick: reloaded window reclaims a lease whose CLI lives and does not fail the message | `t4` |
| tick: dead holder and dead CLI of another window freed only after LEASE_TAKEOVER_MS | `t4` |
| tick: head whose window has no live presence and a dead pid is marked not delivered and the next message runs | `t6` |
| tick: a heartbeating long turn is never taken over | `t4` |
| enqueue and resendFrom at QUEUE_RECORD_BOUND are refused with FULL_NOTE and no row is lost | `t7` |
| dispose-and-recreate a worker with the same windowKey while a second window ticks: the head is not marked not-delivered | `t6` |
| dispose leaves the presence row in place | `t3` |
| reclaimed lease: when the CLI exits the worker finishes the message as detached-ended and releases, and the next message runs | `t5` |
| no presence row and a message younger than PRESENCE_GRACE_MS is not marked | `t6` |
| existing S001 test in chat-queue-worker.test.ts (the dispose-with-CLI-running leg, line 151: assert.equal(storeB.windowAlive('w-A', ...), false, 'presence removed')) is inverted: dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes | `t3` |
| a reload slower than PRESENCE_GRACE_MS (same windowKey, row stale, old pid dead): the head message is marked not-delivered and resendable, and no row is lost | `t6` |
| a previous-plugin window's dispose deleting its presence row: a head message younger than PRESENCE_GRACE_MS is not marked; an older one is marked once | `t6` |
| reload during a running turn keeps the message running | `t7` |
| a message from a closed window shows as not sent with a resend and the queue moves on | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails: presenceOf(windowKey) read on sc2`
- **[[c2]]** `prior-artifact` `LLD s3 contractDetails: markNotDeliveredIfHead(seq), re-reading LIVE_HEAD`
- **[[c3]]** `prior-artifact` `LLD s3 createChatQueueWorker: closed-window rule and head rule`
- **[[c4]]** `prior-artifact` `LLD s3 errorPaths: head marked while its window comes back; a window reloads; a reload slower than PRESENCE_GRACE_MS`
- **[[c5]]** `prior-artifact` `LLD s3 contractDetails: takeOver and reclaim, and the lease and reclaimed-lease rules`
- **[[c6]]** `prior-artifact` `LLD s3 interactionWithShared sc4: dispose no longer calls leave(), presence row ages out; migration backwardCompat (mixed versions)`
- **[[c7]]** `prior-artifact` `LLD s3 errorPaths and edge cases: reload with CLI alive or dead, another window's dead lease, surviving CLI exits`
- **[[c8]]** `prior-artifact` `LLD s3 migration steps 1-3 and testStrategy: the 97df9bf7 recovery test moved, the S001 dispose test inverted`
- **[[c9]]** `prior-artifact` `LLD s3 dataModelChanges and openQuestions: the unchanged bound (ac5), ac3 display half carried by S001 followLiveTurn and turns.follow`
- **[[c10]]** `prior-artifact` `LLD s3 openQuestions and Epic constraints k1-k5: the HLD amendments and the constraint scoring`
