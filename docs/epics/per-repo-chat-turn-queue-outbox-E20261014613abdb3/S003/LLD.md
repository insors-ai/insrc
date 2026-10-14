<!-- insrc:artifact LLD-613abdb351c2c738-s3 -->

# LLD: E20261014613abdb3:S003

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `02f5e748bf5b...`

S003 makes a dead or closed window unable to block the repository's chat queue. It fills the two lease stubs S001 left in the store (takeOver and reclaim) as guarded transactions, adds a guarded store method that marks a head message not delivered when its window is closed and a read of a window's presence row, and replaces the worker's ad-hoc recoverDeadLease with calls to these. A window that leaves no longer deletes its presence row, so a reload never looks like a closed window; the row ages out over PRESENCE_GRACE_MS. A lease reclaimed after a reload is followed by the worker until its CLI exits. The queue bound needs no new code: enqueue and resendFrom already refuse at 500 rows with a note, and finished rows are deleted at once.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)
11. [Feedback](#11-feedback)

## 1. HLD context

> See **HLD-613abdb351c2c738** § 2. Framework summary

**Rollout phase:** Phase B — the outbox and a dead window
**Consumes:** `sc1` (ChatQueueStore), `sc2` (RepoLease and WindowPresence), `sc3` (TurnOutcome), `sc4` (ChatQueueWorker)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The SQLite schema, the repo key and store location, the window key, the worker's polling cadence and timers, the turn runner and the chat host's change from starting turns to submitting them. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The outbox's markup, styles and live updates, and the handling of the outbox actions in the chat host. — owns `sc5`
- `s4`: The classification of a failed turn's error, the acted tracking, the retry schedule and the retrying row in the outbox.
- `s5`: Sending review-pane decisions through the queue, the removal of the review pane's waiting list, and keeping attachments of live messages.

## 2. Contract details

**Surface level:** internal

### 2.1 `takeOver`

```typescript
takeOver(claim: LeaseClaim, now: number, holderGone?: (lease: RepoLease) => boolean): boolean
```

**Parameters:**
- `claim: LeaseClaim` — the window taking over
- `now: number` — the clock reading the staleness is measured against
- `holderGone: (lease: RepoLease) => boolean` _(optional)_ — worker-supplied check that the holder window's process and the lease's CLI process are both gone, evaluated inside the transaction on the lease row it just read; optional and additive to the sc2 signature

**Returns:** `boolean` — true when holderGone held and either the lease was stale for LEASE_TAKEOVER_MS, or the lease's windowKey equals the claim's (a reloaded window: the staleness wait is skipped, because the same window can no longer heartbeat it, and this is today's behaviour on every platform, including those with no process start times); its message was marked failed ('the window closed during the turn') and the lease row deleted in one transaction

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Preconditions:**
- a lease row exists
- the lease is not held by this exact claim (windowKey and pid)

**Postconditions:**
- on true no lease row remains and the message is failed with a resend
- a lease of ANOTHER windowKey is taken only after LEASE_TAKEOVER_MS without a heartbeat
- on false nothing changed

### 2.2 `reclaim`

```typescript
reclaim(claim: LeaseClaim, holderGone?: (lease: RepoLease) => boolean): boolean
```

**Parameters:**
- `claim: LeaseClaim` — the reloaded window (same windowKey, new pid)
- `holderGone: (lease: RepoLease) => boolean` _(optional)_ — true when the recorded holder pid is gone

**Returns:** `boolean` — true when lease.windowKey equals claim.windowKey and the recorded holder is gone; pid and pidStartedAt are rewritten, seq and cliPid kept, heartbeat refreshed

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Preconditions:**
- a lease row exists with the same windowKey

**Postconditions:**
- on true the reloaded window holds the lease and can heartbeat it; the message is NOT failed
- the worker uses reclaim only when the lease's CLI is still alive; a same-key lease whose CLI is gone goes to takeOver and is failed at once

### 2.3 `markNotDeliveredIfHead`

```typescript
markNotDeliveredIfHead(seq: number): boolean
```

**Parameters:**
- `seq: number` — the head message whose window is closed

**Returns:** `boolean` — true when, re-reading the head inside the transaction (the store's LIVE_HEAD: the first row in seq order whose state is queued or retrying), the row's seq equals the given seq; the row is then not-delivered with error 'its window was closed' (a retrying head is marked too, so it cannot hold the queue); false when another window acknowledged, cancelled or finished it first or it is no longer the head

**Errors:**
- `StoreBusy` when the write waited past the busy timeout

**Preconditions:**
- the given seq is the head by LIVE_HEAD (state queued or retrying)

**Postconditions:**
- on true the queue moves on to the next row; the message shows as not sent with a resend

### 2.4 `windowAlive`

```typescript
windowAlive(windowKey: string, now: number): boolean
```

**Parameters:**
- `windowKey: string` — the message's window
- `now: number` — clock

**Returns:** `boolean` — a presence row refreshed within PRESENCE_GRACE_MS exists

**Postconditions:**
- existing behaviour; the worker does not call windowAlive alone to call a window closed: it combines presenceOf with isAlive (see the closed-window rule)

### 2.5 `presenceOf`

```typescript
presenceOf(windowKey: string): WindowPresence | undefined
```

**Parameters:**
- `windowKey: string` — the message's window

**Returns:** `WindowPresence | undefined` — the window's presence row (pid, pidStartedAt, heartbeatAt), or undefined when it has none

**Errors:**
- `StoreBusy` when the read waited past the busy timeout

**Postconditions:**
- a read only; no change to the store
- new on sc2 (additive): the worker needs the presence pid, which windowAlive's boolean does not give

### 2.6 `createChatQueueWorker`

```typescript
createChatQueueWorker(deps: ChatQueueWorkerDeps): ChatQueueWorker
```

**Parameters:**
- `deps: ChatQueueWorkerDeps` — unchanged

**Returns:** `ChatQueueWorker` — the worker; its tick replaces recoverDeadLease. Closed-window rule: a window is closed only when its presence row exists with heartbeatAt older than PRESENCE_GRACE_MS AND isAlive(presence.pid, presence.pidStartedAt) is false, or it has no presence row AND the message is older than PRESENCE_GRACE_MS. Lease rule: a same-key lease whose holder pid is gone is reclaim()ed when its CLI is alive and takeOver()n at once when it is not; another window's lease is takeOver()n only after LEASE_TAKEOVER_MS. Reclaimed-lease rule: while it holds a reclaimed lease the worker heartbeats it and, each tick, checks isAlive(cliPid, cliStartedAt); when the CLI has exited it writes finish(seq, detached-ended) and releases the lease. dispose() no longer calls leave(): the window's presence row is left to age out

**Postconditions:**
- a head whose window is closed no longer blocks the queue
- a dead lease is freed without a check-then-act gap
- a reload never leaves a gap in which the window looks closed: its presence row is still there, fresh within PRESENCE_GRACE_MS
- a reclaimed turn's message is finished as detached-ended when its CLI exits, so it does not stay processing

## 3. Data model changes

### 3.1 `messages (state not-delivered)` — invariant-change

No schema change. The not-delivered state and its error text already exist; S003 is the first writer of them outside tests. The bound counts failed and not-delivered rows as live rows.

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/chat/chat-queue-worker.ts`

### 3.2 `lease` — invariant-change

reclaim rewrites pid and pid_started_at and refreshes heartbeat_at on the single lease row; takeOver deletes it. No column is added.

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Adds markNotDeliveredIfHead to the store alongside the existing methods (additive); uses finish, enqueue and resendFrom unchanged. The bound is relied on as is. |
| `sc2` | consumes | Implements the takeOver and reclaim stubs S001 declared, adding an optional holderGone predicate argument (additive), and adds one read, presenceOf(windowKey), to sc2 (additive); uses windowAlive, lease, presence and release unchanged. takeOver skips the staleness wait for a lease of the claim's own windowKey. |
| `sc3` | consumes | Uses the existing failed and not-delivered outcomes; no new outcome kinds. |
| `sc4` | consumes | Changes the worker's tick: recoverDeadLease is removed and its tests moved onto reclaim, takeOver and the head rule; dispose() stops calling leave() so the presence row ages out instead of vanishing on a reload; the worker follows a reclaimed lease until its CLI exits and then finishes it as detached-ended. The display half of ac3 is existing S001 behaviour that this Story consumes unchanged: on every webview ready the chat host calls followLiveTurn (chat-panel.ts), which re-attaches the saved turn from the session file's cursor through turns.follow (turn-lifecycle.ts, follow()), and the new host takes ownership of the cursor once the old host's process is gone. So the reloaded chat shows the turn continuing without any change here; this Story only keeps the queue state (lease and message) consistent with it. |

## 5. Error paths

**Error cases**

- **Two windows both find the same stale lease and try to take it over** (recoverable)
  - Detection: takeOver runs in one IMMEDIATE transaction that re-reads the lease row and compares heartbeat_at and seq before deleting; the second caller finds no row or a different seq
  - Response: the second call returns false and changes nothing
  - User impact: none; exactly one window moves the queue on
- **The head message is marked not delivered while its window comes back** (recoverable)
  - Detection: markNotDeliveredIfHead re-reads LIVE_HEAD in its transaction and updates only when the row is still the head (state queued or retrying) with the given seq; the window's acknowledge wins the race if it commits first
  - Response: markNotDeliveredIfHead returns false; the message runs normally
  - User impact: none
- **The store is busy while the worker tries a takeover, reclaim or not-delivered marking** (recoverable)
  - Detection: StoreBusy thrown by write(); the tick's try/catch logs it
  - Response: the rule is retried on the next poll; nothing is half done because each rule is one transaction
  - User impact: the dead window's lease is freed a poll later
- **A dead holder's pid has been reused by an unrelated process** (recoverable)
  - Detection: isAlive is called with pidStartedAt and cliStartedAt where they were recorded, so a reused pid with a different start time reads as gone; where start times are not recorded (platforms without /proc), the reused pid reads as alive
  - Response: pid reuse can only make a dead holder look alive, never a live holder look gone, so it delays recovery and never causes a wrong takeover. A live holder is never taken: another window's lease additionally requires heartbeat_at older than LEASE_TAKEOVER_MS, and a same-key lease is taken only when the holder pid is gone
  - User impact: at worst the dead holder's lease is held until the reused pid exits; no running turn is ever taken over (ac2)
- **The queue is at QUEUE_RECORD_BOUND** (recoverable)
  - Detection: liveCount() >= QUEUE_RECORD_BOUND in enqueue and resendFrom
  - Response: the message is refused with FULL_NOTE; nothing is deleted
  - User impact: the user sees the note in the chat and dismisses rows to continue
- **A window reloads: it disposes its worker and creates a new one with the same windowKey while another window ticks** (recoverable)
  - Detection: dispose() no longer deletes the presence row, so presenceOf(windowKey) still returns a row refreshed within PRESENCE_GRACE_MS when the other window checks; the closed-window rule needs a stale row AND a dead presence pid, or no row AND an old message
  - Response: the other window does not mark the reloading window's head message; the new worker refreshes the row on its first tick
  - User impact: none: the outbox shows the same messages after a reload
- **A reload takes longer than PRESENCE_GRACE_MS to reach activation (a heavy workspace or slow extension start), so the old presence row goes stale with a dead pre-reload pid** (recoverable)
  - Detection: the closed-window rule sees presenceOf(windowKey).heartbeatAt older than PRESENCE_GRACE_MS and isAlive(presence.pid, presence.pidStartedAt) false; it cannot tell this from a window that was closed
  - Response: the head message of that window is marked not-delivered with a resend; it is never lost and never run again by itself. This is the accepted trade-off of using the agreed PRESENCE_GRACE_MS (30 s) as the line between reloading and closed: a longer grace would hold the queue behind a genuinely closed window for longer
  - User impact: after an unusually slow reload the message shows as not sent with a resend; the user resends it with one action

**Edge cases**

| Input | Expected |
| :--- | :--- |
| the reloaded window (same windowKey, new pid) finds the old pid dead and the CLI dead | takeOver succeeds at once (the lease is of the claim's own windowKey, on every platform): the message is marked failed with a resend and the lease freed, as recoverDeadLease does today |
| the reloaded window finds the old pid dead and the turn's CLI still alive | reclaim re-homes the lease (pid rewritten, seq and cliPid kept) so the message is not failed; the worker heartbeats it, and when the CLI exits it finishes the message as detached-ended and releases the lease |
| another window's holder pid is dead and its CLI is dead but the heartbeat is only 2 minutes old | no takeover until LEASE_TAKEOVER_MS has passed |
| a head message whose window has no presence row at all and which was queued more than PRESENCE_GRACE_MS ago | treated as closed (the window never wrote presence, or it was pruned): not-delivered. A message queued less than PRESENCE_GRACE_MS ago is not judged yet |
| a head message whose window presence was refreshed 20 s ago (inside PRESENCE_GRACE_MS) | not marked; the window is considered alive and takes it |
| a lease exists but its message row was dismissed or deleted | takeOver deletes the lease and the failed-marking is a no-op on the missing row |
| the surviving CLI of a reclaimed lease exits while the reloaded window is running | the worker's tick sees isAlive(cliPid, cliStartedAt) false, writes finish(seq, detached-ended) (the row is deleted; the turn is in the chat's transcript) and releases the lease, so the queue moves on |

**Invariants to preserve**

- Ownership: a message is taken only by the window whose windowKey matches, and acknowledge takes the lease in the same transaction, so a message is never taken twice. [[c11]]
- Every write is one short IMMEDIATE transaction; no rule spans two transactions. [[c12]]
- The lease is held and heartbeated while the turn's CLI lives; it is released only when no CLI of that turn is running. [[c13]]
- The worker decides from the database alone and holds no state that another window cannot see. [[c3]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test in vscode-plugin), assert/strict, the existing fakeTime timers, gatedRunner and repo() helpers of chat-queue-worker.test.ts, and real node:sqlite files in a temp directory`

**Test levels**

- **integration** — Prove each lease and head rule against a real SQLite file with two or more connections
  - Subjects: `takeOver: stale and holderGone takes over and fails the message; fresh heartbeat or holder alive does not`, `reclaim: same windowKey and old pid gone rewrites pid and keeps seq and cliPid; other windowKey refused`, `markNotDeliveredIfHead: head row marked; a row acknowledged first is not`, `two connections racing takeOver: exactly one returns true`, `takeOver: a lease of the claim's own windowKey with holderGone true is taken at once; another key's lease only after LEASE_TAKEOVER_MS`, `presenceOf: returns the row, and undefined when there is none`, `markNotDeliveredIfHead: a retrying head whose window closed is marked not-delivered and the next row becomes the head`
  - Fixtures: `repo() helper opening several stores on one file with a controllable clock`
- **unit** — Prove the worker's tick uses the store rules, with fake timers and a fake liveness map
  - Subjects: `tick: reloaded window reclaims a lease whose CLI lives and does not fail the message`, `tick: dead holder and dead CLI of another window freed only after LEASE_TAKEOVER_MS`, `tick: head whose window has no live presence and a dead pid is marked not delivered and the next message runs`, `tick: a heartbeating long turn is never taken over`, `enqueue and resendFrom at QUEUE_RECORD_BOUND are refused with FULL_NOTE and no row is lost`, `dispose-and-recreate a worker with the same windowKey while a second window ticks: the head is not marked not-delivered`, `dispose leaves the presence row in place`, `reclaimed lease: when the CLI exits the worker finishes the message as detached-ended and releases, and the next message runs`, `no presence row and a message younger than PRESENCE_GRACE_MS is not marked`, `existing S001 test in chat-queue-worker.test.ts (the dispose-with-CLI-running leg, line 151: assert.equal(storeB.windowAlive('w-A', ...), false, 'presence removed')) is inverted: dispose leaves the presence row in place and windowAlive stays true until PRESENCE_GRACE_MS passes`, `a reload slower than PRESENCE_GRACE_MS (same windowKey, row stale, old pid dead): the head message is marked not-delivered and resendable, and no row is lost`, `a previous-plugin window's dispose deleting its presence row: a head message younger than PRESENCE_GRACE_MS is not marked; an older one is marked once`
  - Fixtures: `fakeTime`, `gatedRunner`, `isAlive backed by a Set of pids`
- **smoke** — Hand check in a real window: reload mid-turn with the CLI alive, and close a second window with queued messages
  - Subjects: `reload during a running turn keeps the message running`, `a message from a closed window shows as not sent with a resend and the queue moves on`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: takeOver fails the stale lease's message and frees the lease only after LEASE_TAKEOVER_MS with holder and CLI gone`, `unit: worker tick in window B frees window A's dead lease after LEASE_TAKEOVER_MS and runs its own message`, `integration: takeOver of the claim's own windowKey with the CLI gone fails the message at once` |
| `ac2` | `unit: a holder that keeps heartbeating past LEASE_TAKEOVER_MS is never taken over`, `integration: takeOver refuses when holderGone is false even if heartbeat is stale` |
| `ac3` | `integration: reclaim keeps seq and cliPid and rewrites pid for the same windowKey`, `unit: reloaded window with a live CLI keeps the message processing and does not fail it`, `smoke: reload during a running turn`, `unit: reclaimed lease ends as detached-ended when the surviving CLI exits`, `unit: dispose-and-recreate with the same windowKey does not get the head marked not delivered` |
| `ac4` | `integration: markNotDeliveredIfHead marks the head and loses cleanly to a concurrent acknowledge`, `unit: head from a closed window becomes not-delivered and the next message runs`, `smoke: close a window with queued messages`, `unit: a window that stopped refreshing presence and whose presence pid is dead is judged closed after PRESENCE_GRACE_MS`, `unit: a reload slower than PRESENCE_GRACE_MS ends as not-delivered with a resend (the accepted trade-off, pinned so it is deliberate)` |
| `ac5` | `integration: enqueue and resendFrom refuse at QUEUE_RECORD_BOUND with FULL_NOTE and leave every row`, `unit: submit at the bound returns ok:false reason full` |

## 7. Migration

**State before:** takeOver and reclaim in chat-queue-store.ts return false unconditionally. The worker frees a dead lease with recoverDeadLease, which reads the lease and then calls finish() in a second transaction, and it never marks a head message whose window is closed, so that head blocks the queue. QUEUE_RECORD_BOUND already refuses at 500 rows.

**State after:** takeOver and reclaim are guarded single transactions; markNotDeliveredIfHead and presenceOf exist; dispose() leaves the presence row to age out; the worker tick calls reclaim, takeOver and markNotDeliveredIfHead instead of recoverDeadLease; a closed window's head message becomes not-delivered and the queue moves on. Schema version stays 2.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add presenceOf and markNotDeliveredIfHead to the store and implement takeOver and reclaim (additive; the stubs returned false so no caller depends on them) — ↩ rollbackable
2. Switch the worker tick from recoverDeadLease to the lease, closed-window and reclaimed-lease rules; stop calling leave() from dispose(); move the 97df9bf7 worker recovery test onto the new calls; invert the S001 dispose test's 'presence removed' assertion (chat-queue-worker.test.ts:151) to 'presence kept' — ↩ rollbackable
3. Hand check in two windows: reload mid-turn with the CLI alive, reload with queued messages in a second window ticking, and close a window with queued messages — ↩ rollbackable

**Backward compat:** No schema change and no change to any signature another story or the host calls: the new store methods and the optional holderGone argument are additive. Mixed versions, stated explicitly: a window still running the previous plugin keeps working against the same file, but its dispose() still deletes its presence row (leave()). When such a window is reloaded to take this update, a new-plugin window may see no presence row for it and, if its head message is older than PRESENCE_GRACE_MS, mark that message not-delivered once. That is accepted: the message is kept with a resend and nothing is lost; it happens only for the window that is being upgraded, once.

## 8. Alternatives considered

### 8.1 a1: Store-transaction rules (fill takeOver/reclaim, add two store methods)

Implement the takeover, reclaim, not-delivered marking and flush as single transactions in the store; the worker only decides when to call them.

Fill the two sc2 stubs with guarded transactions and give the store an injected isAlive for process liveness.

**Rejected because:** Ranked 2: makes the store know about process liveness and sketches a flush that the bound does not need.

### 8.2 a2: Worker-only rules over existing store methods

Keep and extend recoverDeadLease in the worker; no new store methods.

Extend the worker's recoverDeadLease and add a head-closed rule that calls store.finish(head.seq, not-delivered).

**Rejected because:** Ranked 3: check-then-act across transactions lets two windows both act on a stale lease or on a head another window just acknowledged, and it leaves sc2 takeOver and reclaim unimplemented.

### 8.3 a3: Hybrid: store transactions for the lease, worker for the head rule — **CHOSEN**

takeOver and reclaim become store transactions taking a liveness predicate; the not-delivered rule uses a guarded store method and the bound uses the existing enqueue refusal.

takeOver and reclaim are implemented in the store with the liveness decision passed in by the worker; markNotDeliveredIfHead updates only a still-head row; the bound needs no new code.

## 9. References

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c13]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c13 (the lease is released only when no CLI of the turn runs)`
- **[[c14]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts (takeOver and reclaim stubs, windowAlive, finish, enqueue, resendFrom, bound constants)`
- **[[c15]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts (recoverDeadLease from commit 97df9bf7, tick, dispose)`
- **[[c16]]** `code` `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts (the worker recovery test)`
- **[[c17]]** `code` `vscode-plugin/src/chat/chat-panel.ts (followLiveTurn: re-attaches a saved live turn on webview ready) and vscode-plugin/src/chat/turn-lifecycle.ts (follow(): owner takeover when the old host pid is gone)`
- **[[c18]]** `code` `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts:151 (S001 dispose test asserting presence removed; inverted by this Story)`

## 10. Open questions

- ac3, display half is carried by existing S001 code (followLiveTurn and turns.follow); it is not tested again here. The hand check in migration step 3 is the check that a reload with a live CLI shows the turn continuing; if that fails, it is an S001 defect to fix there, not a gap in this design.
- HLD wording vs this LLD: the HLD boundary lists a flush that keeps stored records within QUEUE_RECORD_BOUND. This LLD builds no deleting flush: done rows are already deleted at finish, failed and not-delivered rows are only removed by the user, and a full queue refuses a new message with a note. Confirm no age-based purge of failed rows is wanted.
- Epic constraints k1-k5 were not scored individually against the alternatives; none is contradicted.
- The invariantsToPreserve cite HLD assumption ids (c11, c12, c13, c3) rather than analyze-bundle ids.
- markNotDeliveredIfHead is a new store method not in the HLD sc1 sketch, and the optional holderGone argument deviates from the sc2 sketch signatures; both are additive.
- sc2 additions: presenceOf(windowKey) is a new read on sc2 and takeOver skips the staleness wait for the claim's own windowKey; both are additive to the HLD sketch, and sc2 is owned by S001.
- Decision for the owner: the line between a slow reload and a closed window is PRESENCE_GRACE_MS (30 s, the HLD's value). A reload slower than that marks the window's head message not delivered, with a resend, never lost. Using a longer grace for the head rule (for example LEASE_TAKEOVER_MS, 10 minutes) would avoid that but would hold the queue behind a genuinely closed window for up to that long. This LLD keeps the HLD's 30 s.

## 11. Feedback

- **Subho Ghosh** (2026-10-14T14:55:23.823Z) `comment` `approve` — `docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S003/LLD.md`: on "Using a longer grace for the head rule (for example LEASE_TAKEOVER_MS, 10 minutes) would avoid that but would hold the q…": Locking the queue for 10mins is not an option

## Resolved questions

- `q58c348fe` — ac3, display half is carried by existing S001 code (followLiveTurn and turns.follow); it is not tested again here. The hand check in migration step 3 is the check that a reload with a live CLI shows the turn continuing; if that fails, it is an S001 defect to fix there, not a gap in this design.
  - **resolved**: Point ac3 at existing S001 tests — Name real runnable S001 cases for the display half; if none exist, record the hand check as a reported live test. _(2026-10-14T15:00:11.883Z)_
- `q1614c270` — HLD wording vs this LLD: the HLD boundary lists a flush that keeps stored records within QUEUE_RECORD_BOUND. This LLD builds no deleting flush: done rows are already deleted at finish, failed and not-delivered rows are only removed by the user, and a full queue refuses a new message with a note. Confirm no age-based purge of failed rows is wanted.
  - **resolved**: Confirm, and amend the HLD wording — No deleting flush; HLD wording becomes bounded by delete-on-finish plus refuse-when-full. _(2026-10-14T15:01:26.398Z)_
- `qb1c54e0f` — Epic constraints k1-k5 were not scored individually against the alternatives; none is contradicted.
  - **resolved**: Score k1-k5 in the plan — A short constraint matrix in the plan; the approved LLD stays untouched. _(2026-10-14T15:02:20.295Z)_
- `qf24e0656` — The invariantsToPreserve cite HLD assumption ids (c11, c12, c13, c3) rather than analyze-bundle ids.
  - **resolved**: Keep HLD c-ids + crosswalk note — Consistent with the decision for Story s1. _(2026-10-14T15:03:04.902Z)_
- `qd776acfb` — markNotDeliveredIfHead is a new store method not in the HLD sc1 sketch, and the optional holderGone argument deviates from the sc2 sketch signatures; both are additive.
  - **resolved**: File a fieldAdd HLD amendment — Both additions are additive; amendment keeps sc1 and sc2 accurate for sibling Stories. _(2026-10-14T15:03:44.495Z)_

## Citations

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c13]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c13 (the lease is released only when no CLI of the turn runs)`
- **[[c14]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts (takeOver and reclaim stubs, windowAlive, finish, enqueue, resendFrom, bound constants)`
- **[[c15]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts (recoverDeadLease from commit 97df9bf7, tick, dispose)`
- **[[c16]]** `code` `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts (the worker recovery test)`
- **[[c17]]** `code` `vscode-plugin/src/chat/chat-panel.ts (followLiveTurn: re-attaches a saved live turn on webview ready) and vscode-plugin/src/chat/turn-lifecycle.ts (follow(): owner takeover when the old host pid is gone)`
- **[[c18]]** `code` `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts:151 (S001 dispose test asserting presence removed; inverted by this Story)`
