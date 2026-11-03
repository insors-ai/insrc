<!-- insrc:artifact PLAN-7c39e5cd2c076e86-S001 -->

# Plan: E202610297c39e5cd:S001

## Summary

**Epic:** `move-session-s-queue-forward-only`
**LLD run:** `wf-1793269628421-nopi3f`
**LLD effective hash:** `6ef823622747...`

The work is almost all in the threaded daemon's router. Queued requests ask their worker for the completion message it already knows how to send, and the router keeps such a request open until that message arrives. The ack then flows back through every send path a queued request can take, and the session queue moves only on it, with the existing failure answers also releasing the queue. Tests are updated where they pinned the old end rule, and a spawned-daemon check proves one session's requests no longer overlap after a socket closes.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** wireRequest asks for the ack on request | S | — | unit: channel.test.ts: wireRequest with ack sets trackCompletion for unary and stream requests; without it the rule is unchanged | [[c1]] [[c5]] |
| 2 | **`t2`** Router.send and the pending entry carry onAck | M | `t1` | integration: router-session.test.ts: a duplicate or unknown completion message is ignored and onAck runs once; integration: router-session.test.ts: a postMessage failure answers 'request channel unavailable' and the queue moves on; integration: router-thread-view.test.ts: a session request stays busy in the thread view and in the pool's busy count until its ack | [[c2]] [[c3]] [[c6]] |
| 3 | **`t3`** Thread onAck through every session send path | M | `t2` | integration: router-session.test.ts: a pool start failure and a cancel before the worker resolved move the queue on; integration: router-session.test.ts: a queued shared-state method waits for the shared-state worker's ack in both toShared branches | [[c2]] [[c6]] [[c8]] |
| 4 | **`t4`** The session FIFO advances only on the ack | M | `t3` | integration: router-session.test.ts: a queued unary request whose socket closes while it runs keeps the next request queued until the worker acks the first (its handler settled); integration: router-session.test.ts: a queued stream cancelled by its socket keeps the next request queued until the worker acks it; integration: router-session.test.ts: a unary reply is delivered at once but the next request starts only after the worker's ack, after work registered with registerDrain is done; integration: router-session.test.ts: a worker exit answers the running request with 'session worker failed' and the next queued request runs on the new worker; integration: router-session.test.ts: FIFO-exempt, unattributed and admin requests keep today's ends and never wait for an ack; integration: worker-requests.test.ts or router-session.test.ts: a queued request refused under the maintenance lock is still acked and the queue moves on | [[c4]] [[c6]] [[c7]] |
| 5 | **`t5`** Spawned-daemon check: no overlap after a socket close | S | `t4` | smoke: fifo-ack-acceptance.test.ts: the second connection's request starts only after the first, whose socket closed, has finished on the worker | [[c7]] |
| 6 | **`t6`** Refresh the session-source inventory | S | `t4` | unit: session-source inventory test passes with the refreshed router.ts, channel.ts and supervisor.ts entries | [[c8]] |

### 1.1 E202610297c39e5cd:S001:T001 — wireRequest asks for the ack on request

Give wireRequest (src/daemon/threads/channel.ts:59) an optional { ack } option that sets trackCompletion for any request kind, keeping today's stream-with-lifetime rule; the existing caller passes nothing and is unchanged.

**Acceptance checks:**
- wireRequest(r, { ack: true }) sets trackCompletion for a unary request and for a stream with or without a lifetime
- wireRequest(r) without options produces exactly today's envelope (local-lifetime.test.ts still passes)

### 1.2 E202610297c39e5cd:S001:T002 — Router.send and the pending entry carry onAck

Router.send gains onAck: an entry with onAck is wired with ack, stays pending (and in flight) past its reply or terminal frame in attach's handler, is ended by the completion message (remove, complete lifetime if any, finished(), then onAck once) and is not removed by the private cancel. A postMessage failure answers as today and calls onAck. detach returns each orphan with an ack callback, and failWorker and the supervisor's exited() call it after answering (a no-op for the supervisor's admin/indexing workers today). No caller passes onAck yet, so behaviour is unchanged.

**Acceptance checks:**
- A request sent with onAck gets its reply delivered, stays pending and busy in the thread view until the worker's 'complete', then onAck runs once
- A second or unknown 'complete' is ignored
- A postMessage failure answers 'request channel unavailable' and calls onAck once
- detach's orphans carry ack and failWorker calls it after answering; the supervisor's exited() calls it after answering and the existing supervisor suites pass
- Requests sent without onAck behave exactly as before (existing router suites pass)

### 1.3 E202610297c39e5cd:S001:T003 — Thread onAck through every session send path

Pass onAck from dispatchSession's send closure through toShared (both the direct-send branch and the toPoolWorker branch), toSessionWorker and toPoolWorker. toPoolWorker gives it to Router.send, calls it once on each failure before send (start failure, port gone, cancel before the worker resolved), and for an acked request ends its done() (the pool's busy count) at the ack instead of at a terminal envelope or a cancelled stream's lifetime completion.

**Acceptance checks:**
- Each of toShared's two branches, toSessionWorker and toPoolWorker forwards onAck
- Pool start failure, a missing port and a cancel before the worker resolved each call onAck once
- For an acked request the pool's ended() runs at the ack, not at the reply or terminal frame

### 1.4 E202610297c39e5cd:S001:T004 — The session FIFO advances only on the ack

Router.enqueue gives each item's send an onAck that calls next(); the advance on a terminal envelope and on the cancel of a started item are removed (the cancel still cancels on the worker). Update the existing tests that pinned the old end rule (router-session.test.ts:224-245, router-thread-view.test.ts:147-176) and add the ack-rule tests.

**Acceptance checks:**
- A queued unary request whose socket closed keeps the next one queued until its handler settled on the worker
- A queued stream cancelled by its socket keeps the next one queued until the worker acks it
- A reply is delivered at once but the next request starts only after work registered with registerDrain is done
- A worker exit, a send failure, a start failure and a cancel before resolve each move the queue on
- A queued shared-state method waits for the shared-state worker's ack both when that worker is already attached and when the pool is still starting it
- A queued request refused under the maintenance lock still moves the queue on its ack (or, if the harness cannot hold the lock, a worker-requests check that a refused tracked request still gets 'complete')
- FIFO-exempt, unattributed and admin requests keep today's ends

### 1.5 E202610297c39e5cd:S001:T005 — Spawned-daemon check: no overlap after a socket close

Over the real threaded daemon (helpers/daemon-socket.ts), one session sends test.spin on a connection, closes it while it runs, and sends a request on a second connection; that request is answered only after the spin finished on the worker.

**Acceptance checks:**
- The second connection's request is answered no earlier than the first request's spin end, measured from the first send
- The bound has a stated margin the old rule could not meet: the old rule answered the second request at the socket close, well before the spin end

### 1.6 E202610297c39e5cd:S001:T006 — Refresh the session-source inventory

Refresh src/daemon/db/__tests__/fixtures/session-source-inventory.json for the edited src/daemon/threads/channel.ts, src/daemon/threads/router.ts and src/daemon/threads/supervisor.ts with the refresh tool, then run the inventory test.

**Acceptance checks:**
- The inventory test passes with the refreshed entries for the three edited files

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| wireRequest (src/daemon/threads/channel.ts) | `t1` |
| Router.enqueue / Router.send / attach / detach (src/daemon/threads/router.ts) | `t2`, `t4` |
| toPoolWorker failure paths | `t3` |
| SessionPool started/ended via RouterSessions | `t2`, `t3` |
| router thread view (inFlight/began/finished) | `t2` |
| src/daemon/threads/__tests__/s3-acceptance.test.ts style spawned daemon with test hooks (test.spin / test.servingThread) | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api wireRequest`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api Router (send onAck, enqueue advance rule)`
- **[[c3]]** `prior-artifact` `LLD S001 dataModelChanges Router pending entry`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges Session FIFO end rule`
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges RequestEnvelope.trackCompletion`
- **[[c6]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c7]]** `prior-artifact` `LLD S001 testStrategy`
- **[[c8]]** `prior-artifact` `LLD S001 migration`
