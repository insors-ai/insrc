<!-- insrc:artifact LLD-7c39e5cd2c076e86-S001 -->

# LLD: E202610297c39e5cd:S001

## Summary

**Epic:** `move-session-s-queue-forward-only`
**HLD base run:** `wf-1793269628421-nopi3f`
**HLD effective hash:** `6ef823622747...`

Every request the router sends from a session's queue asks its worker for an explicit acknowledgement, the worker's existing completion message, which the worker sends once that request's handler has settled and its follow-up work is done, cancelled or not. Only that acknowledgement moves the session's queue on; a reply, a stream's last frame or a closed socket no longer do. When an acknowledgement can never come (the worker exited, the request could not be posted, or it never reached a worker) the request is ended with an error and the queue moves on. The pool's busy count and the daemon.status thread view end such a request at the same point, and requests outside a session queue are unchanged.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `wireRequest`

```typescript
wireRequest(request: LocalRequestEnvelope, opts?: { readonly ack?: true | undefined }): RequestEnvelope
```

**Parameters:**
- `request: LocalRequestEnvelope` — The request to put on the channel
- `opts.ack: true | undefined` _(optional)_ — The router waits for this request's acknowledgement: ask the worker for its completion message whatever the request kind

**Returns:** `RequestEnvelope` — trackCompletion is set when opts.ack is set, and (as today) for a stream with a lifetime; otherwise unchanged.

**Errors:**
- `Error` when As today: a request whose trusted context carries a connection session cannot cross a worker channel (such requests never enter a session queue).

**Postconditions:**
- A request sent with ack: true is answered by the worker's serveRequests with exactly one CompletionEnvelope after its handler settled and its drains finished, cancelled or not.

### 2.2 `Router`

```typescript
class Router { /* private */ send(threadId: number, request: LocalRequestEnvelope, deliver: DeliverEnvelope, onAck?: () => void): () => void; /* Router.enqueue moves a session's FIFO only from the item's onAck */ }
```

**Parameters:**
- `onAck: () => void` _(optional)_ — Called exactly once when the request is over for good: the worker's CompletionEnvelope for it, or an end after which none can come (postMessage failure, the worker's detach)

**Returns:** `() => void` — The request's cancel, as today: it cancels the request on its worker but no longer ends it for the queue.

**Preconditions:**
- onAck is given only for requests sent from a session FIFO

**Postconditions:**
- A pending entry awaiting an ack stays pending after its reply or terminal frame (later frames and the reply are still delivered as today) and is removed only at the ack or the worker's detach
- For a request with onAck, the thread view's in-flight entry and the pool's busy count end at the ack, not at the reply or terminal frame
- Router.enqueue advances the FIFO only from onAck; a terminal envelope and the cancel of a started item no longer advance it
- Every end that cannot be acknowledged calls onAck once: toPoolWorker's failure before send (pool start failed, worker port gone, cancel before the worker resolved), send's postMessage failure, and detach (the orphan is answered as today, then acknowledged)

### 2.3 `CompletionEnvelope`

```typescript
interface CompletionEnvelope { readonly kind: 'complete'; readonly requestId: string; }  // unchanged; now also the ack of every session-queued request
```

**Returns:** `CompletionEnvelope` — Unchanged shape. Its meaning widens: for a request sent with ack, it is the explicit acknowledgement that moves the session's queue.

**Postconditions:**
- The router acts on at most one completion per request id; a completion for an unknown or already-ended request is ignored as today

### 2.4 `serveRequests`

```typescript
serveRequests(port: Port, unheld: ForwardRequest, opts: ServeRequestsOptions = {}): () => void  // unchanged
```

**Returns:** `() => void` — Unchanged: it already sends the completion message for any request whose envelope sets trackCompletion, unary or stream.

**Postconditions:**
- No worker change is needed; every worker that serves requests (admin, session, test harnesses) answers the ack the same way

## 3. Data model changes

### 3.1 `Router pending entry` — field-add

A pending request records its onAck (the session FIFO's acknowledgement) and whether it awaits the worker's completion message; such an entry is not removed at its reply or terminal frame but at the completion message or detach. In attach()'s message handler (src/daemon/threads/router.ts:403-416) the removal and finished() guards at the reply and at a terminal frame change from `pending.lifetime` alone to 'has a lifetime OR awaits an ack': an acked entry, unary or stream, is kept and stays in flight past its reply or terminal frame. The completion branch acts on an entry that awaits an ack whether or not it has a lifetime: it removes the entry, completes its lifetime if any, calls finished() and then onAck once. Router's private cancel (src/daemon/threads/router.ts:546-552) no longer removes a lifetime-less stream's entry when that entry awaits an ack; it stays until the ack. Router.detach (src/daemon/threads/router.ts:426-441) returns each orphan with an `ack` callback (its onAck, or a no-op), and both callers of detach, failWorker (src/daemon/threads/router.ts:182-203) and the supervisor's exit handler (src/daemon/threads/supervisor.ts:165-169), call it after answering the orphan.

```
+ onAck?: () => void  (awaits the worker's 'complete' for this request)
```

**Call sites:**
- `src/daemon/threads/router.ts:182-203`
- `src/daemon/threads/router.ts:400`
- `src/daemon/threads/router.ts:403-416`
- `src/daemon/threads/router.ts:426-441`
- `src/daemon/threads/router.ts:503-514`
- `src/daemon/threads/router.ts:546-552`
- `src/daemon/threads/supervisor.ts:165-169`

### 3.2 `Session FIFO end rule` — invariant-change

Before: a session's queued request ended at its reply, its terminal frame or its socket's cancel (src/daemon/threads/router.ts:338-339, src/daemon/threads/router.ts:357-358). After: it ends only at the worker's acknowledgement or at an end that cannot be acknowledged.

```
end := ack | detach | send-failure | never-reached-worker  (was: reply | terminal frame | cancel)
```

**Call sites:**
- `src/daemon/threads/router.ts:338-339`
- `src/daemon/threads/router.ts:357-358`

### 3.3 `RequestEnvelope.trackCompletion` — invariant-change

Before: set only for a stream with a lifetime (src/daemon/threads/channel.ts:66). After: also set for every request the router sends from a session FIFO, unary included.

```
trackCompletion := (stream && lifetime) || ack
```

**Call sites:**
- `src/daemon/threads/channel.ts:43`
- `src/daemon/threads/channel.ts:66`
- `src/daemon/threads/worker-requests.ts:67-70`

## 4. Diagrams

- [Sequence diagram](docs/standalone/move-session-s-queue-forward-only-E202610297c39e5cd/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **The session's worker exits while a queued request is running on it (no ack will ever come).** (recoverable)
  - Detection: The pool's worker exit runs router.failWorker, whose detach returns the thread's pending entries, including those awaiting an ack.
  - Response: Each orphan is answered with today's 'session worker failed: <reason>' (an error frame for a stream) and its onAck is called once, so the session's FIFO moves on; the session's queued requests bound for that worker are failed as today.
  - User impact: The running request gets an error and the session's next request runs on a new worker; the session is never stuck.
- **Posting the request to the worker fails (the channel is closed or the payload cannot be cloned).** (recoverable)
  - Detection: Router.send catches the postMessage throw.
  - Response: The request is answered 'request channel unavailable' as today, its pending entry is removed, and onAck is called once.
  - User impact: That request fails; the session's next request is sent.
- **The request never reaches a worker: the pool cannot start the session's worker, its port is gone, or the request is cancelled before the worker resolved.** (recoverable)
  - Detection: toPoolWorker's fail() and its cancel-before-send path.
  - Response: The request is answered or dropped as today and onAck is called once.
  - User impact: The session's queue moves on instead of waiting for an ack that cannot come.
- **A completion message arrives twice, for an unknown request, or from a thread that does not own the request.** (recoverable)
  - Detection: attach's handler looks up the pending entry by request id and checks its thread, as today.
  - Response: Ignored; onAck runs at most once per request (it is cleared when called).
  - User impact: None.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A unary queued request whose handler replies and then finishes work it registered with registerDrain | The reply is delivered at once; the session's next request starts only after the worker's ack, i.e. after the registered work is done. |
| A queued request whose client socket closes while it runs (unary) | Its reply is dropped as today; the queue moves only when the worker acks it after its handler settles. |
| A queued stream whose client socket closes while it runs | The router cancels it on the worker as today; frames after the cancel are dropped; the queue moves on the worker's ack after the handler stops. |
| A queued request refused by the worker under the maintenance lock | The refusal is the reply; the worker's ack follows (holdingForward completes the lifetime) and the queue moves on. |
| A FIFO-exempt request (chat.cancel, workflow.run.poll, a subscription), an unattributed request, or an admin/indexing request | Unchanged: no ack is asked for beyond today's (streams with a lifetime), and it never touches a session FIFO. |
| A queued chat.list or other shared-state method sent from a session FIFO to the shared-state worker | It asks the shared-state worker for the ack the same way; the session's queue moves on that ack. |
| A queued request cancelled while still waiting in the FIFO | Unchanged: removed from the queue at once; it was never sent, so no ack is awaited. |

**Invariants to preserve**

- A worker answers every request whose envelope sets trackCompletion with one completion message after the request's lifetime completed and drained; no worker code changes. [[c2]]
- Replies and stream frames are still delivered to the client exactly as today, including the dropping of frames after a cancel and the reply of a cancelled unary request. [[c1]]
- A worker's exit still answers its in-flight requests with 'session worker failed: <reason>' and fails the session's queued requests bound for it. [[c4]]
- Requests outside a session FIFO (exempt, unattributed, admin, indexing, internal router.request calls) keep today's ends. [[c4]]
- The worker sends the completion message only once the handler settled, cancelled or not, for unary and stream requests alike. [[c3]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run with npx tsx --test (convention reported in s1: src/daemon/threads/__tests__/*.test.ts)`

**Test levels**

- **unit** — The ack contract at the channel: wireRequest asks for the completion message when opts.ack is set, for unary and stream requests, and keeps today's rule otherwise.
  - Subjects: `wireRequest (src/daemon/threads/channel.ts)`
- **integration** — The router's session FIFO over in-thread fake workers (MessageChannel ports served with serveRequests and directDispatch): the queue moves only on the worker's ack, including after a closed socket, a registered drain, a worker exit, a postMessage failure and a pool start failure; requests outside a FIFO are unchanged; the pool busy count and the thread view end at the ack.
  - Subjects: `Router.enqueue / Router.send / attach / detach (src/daemon/threads/router.ts)`, `toPoolWorker failure paths`, `SessionPool started/ended via RouterSessions`, `router thread view (inFlight/began/finished)`
  - Fixtures: `The router-session.test.ts harness: fake session workers served with serveRequests, gated handlers, a RouterSessions stub that records started/ended`, `A handler that registers a drain with registerDrain and resolves it on a gate`
- **smoke** — Over the real threaded daemon: one session's request on a second connection does not start while the first, whose socket closed, still runs on the worker.
  - Subjects: `src/daemon/threads/__tests__/s3-acceptance.test.ts style spawned daemon with test hooks (test.spin / test.servingThread)`
  - Fixtures: `helpers/daemon-socket.ts spawnDaemon/once/Conn`, `A test hook that records when a session request starts and ends on its worker`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `router-session.test.ts: a queued unary request whose socket closes while it runs keeps the next request queued until the worker acks the first (its handler settled)`, `router-session.test.ts: a queued stream cancelled by its socket keeps the next request queued until the worker acks it`, `s5-ack acceptance (spawned daemon): the second connection's request starts only after the first, whose socket closed, has finished on the worker` |
| `ac2` | `router-session.test.ts: a unary reply is delivered at once but the next request starts only after the worker's ack, after work registered with registerDrain is done`, `channel test: wireRequest with ack: true sets trackCompletion for unary and stream requests; without it the rule is unchanged` |
| `ac3` | `router-session.test.ts: a worker exit answers the running request with 'session worker failed' and the next queued request runs on the new worker`, `router-session.test.ts: a postMessage failure answers 'request channel unavailable' and the queue moves on`, `router-session.test.ts: a pool start failure and a cancel before the worker resolved move the queue on`, `router-session.test.ts: a duplicate or unknown completion message is ignored and onAck runs once` |
| `ac4` | `router-session.test.ts: FIFO-exempt, unattributed and admin requests keep today's ends and never wait for an ack`, `router-thread-view.test.ts: a session request stays busy in the thread view and in the pool's busy count until its ack` |

## 7. Migration

**State before:** Per the s1 bundles: Router.enqueue moves a session's FIFO when a delivered envelope is terminal (src/daemon/threads/router.ts:338-339) and at once when a started item is cancelled by its socket (src/daemon/threads/router.ts:357-358). wireRequest asks for the worker's completion message only for a stream with a lifetime (src/daemon/threads/channel.ts:66), and the router uses that message only to complete the stream's lifetime (src/daemon/threads/router.ts:400). The pool's busy count and the s4 thread view end a request at its reply, terminal frame, lifetime completion or detach.

**State after:** Every request the router sends from a session FIFO is wired with ack, so its worker answers it with one completion message after its handler settled and drained. Router.send keeps such a pending entry until that message or the worker's detach, and calls its onAck once; Router.enqueue advances the FIFO only from onAck. Ends that cannot be acknowledged (detach, postMessage failure, never reaching a worker) call onAck once after answering the request as today. The pool's busy count and the thread view end acked requests at the ack. Requests outside a session FIFO are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the ack option to wireRequest: set trackCompletion when ack is asked for, keeping today's stream-with-lifetime rule. — ↩ rollbackable
2. Add onAck to Router.send and its pending entry: keep the entry past its reply or terminal frame when it awaits an ack, call onAck once on the completion message, on postMessage failure, and on detach after the orphan is answered. — ↩ rollbackable
3. Thread onAck through every path a session-FIFO item's send can take: dispatchSession's send closure (src/daemon/threads/router.ts:257-262); toShared (src/daemon/threads/router.ts:266-270) in BOTH branches, the direct this.send when the shared-state worker is already attached and the toPoolWorker branch when it is not; toSessionWorker (src/daemon/threads/router.ts:273-284); and toPoolWorker (src/daemon/threads/router.ts:287-322), which passes it to this.send and calls it once on each failure before send (pool start failed, port gone, cancel before the worker resolved). For acked requests toPoolWorker's end (the pool's busy count) runs at the ack, not at a terminal envelope or, for a cancelled stream, at its lifetime's completion; the thread view's in-flight entry also ends at the ack. — ↩ rollbackable
4. Change Router.enqueue so a queue item passes onAck to its send and advances only from it; remove the advance on a terminal envelope and on the cancel of a started item. — ↩ rollbackable
5. Extend router-session.test.ts and router-thread-view.test.ts and add the spawned-daemon check; refresh the session-source inventory fixture for the edited daemon files. — ↩ rollbackable

**Backward compat:** Internal only: no IPC method, payload or client-visible field changes. Clients see the same replies and frames; the only visible change is that one session's next request now starts after the worker finished the previous one rather than at its reply or socket close. The channel envelope shape is unchanged (trackCompletion already exists and serveRequests already honours it for any request kind), and main and workers are always the same build, so there is no mixed-version channel. Threads stay behind daemon.threads.enabled (default off), so a threads-disabled daemon is untouched.

## 8. Alternatives considered

### 8.1 a1: Ack for queued requests, one end for the queue, the busy count and the thread view — **CHOSEN**

Every request the router sends from a session's FIFO asks its worker for the existing completion message; that ack (or a definite failure) is the one end of the request, which moves the FIFO and also ends the pool's busy count and the thread view.

The router's send gains an onAck option. wireRequest asks for the completion message (trackCompletion) whenever the router asks for an ack, unary or stream, as well as today for a stream with a lifetime. A pending entry that awaits an ack stays pending past its reply or terminal frame and ends when the worker's 'complete' arrives: the router completes the stream's lifetime as today and calls onAck once. Router.enqueue moves the FIFO only from onAck; the terminal-envelope advance and the advance in the started item's cancel are removed (cancel still cancels the request on the worker as today). onAck is also called, once, on each end that can never be acknowledged: the worker's detach (its orphans are answered with today's failure messages), a postMessage failure in send, and toPoolWorker ending a request that never reached a worker (start failure, worker port gone, cancel before the worker resolved). For these acked requests the pool's busy count (toPoolWorker's end) and the thread view (finished) also end at the ack, so all three agree on when a request is over. Requests outside a FIFO (FIFO-exempt methods, unattributed requests, admin and indexing classes, internal router.request calls) are unchanged.

### 8.2 a2: Ack for every routed request, every class

Ask every worker for the completion message on every request (admin, indexing, session, exempt, unattributed) and end every routed request at its ack.

wireRequest always sets trackCompletion; Router keeps every pending entry until 'complete' and ends busy counts and the thread view there for all classes; the FIFO moves on ack as in a1.

**Rejected because:** Satisfies the session constraints but changes every routed request's end, outside the issue's scope and on the liveness-critical admin channel.

### 8.3 a3: Router-side end from the request's own lifetime (no worker ack)

Move the FIFO when the router-side RequestLifetime completes, without asking the worker.

On cancel of a started item, wait for request.lifetime.completed before moving the FIFO; replies and terminal frames move it otherwise.

**Rejected because:** Does not meet the user's rule: the queue still moves on an end the router infers.

## 9. References

- **[[c1]]** `analyze-bundle` `Where the session FIFO moves forward today (insrc_analyze_step how-does-it-work over src/daemon/threads/router.ts)`
- **[[c2]]** `analyze-bundle` `The worker's completion message and who asks for it (insrc_analyze_step how-does-it-work over the ack path)`
- **[[c3]]** `analyze-bundle` `When the worker-side lifetime completes, so when the ack would be sent (direct source read of directDispatch and the maintenance hold)`
- **[[c4]]** `analyze-bundle` `Other ends of a queued request the router already handles (direct source read of src/daemon/threads/router.ts)`
- **[[c5]]** `analyze-bundle` `Tests to extend`
- **[[c6]]** `prior-artifact` `ISSUE-7c39e5cd2c076e86`
- **[[c7]]** `stakeholder` `User direction 2026-10-29: for each message in the queue there should be an explicit ack that moves the queue forward`

## 10. Open questions

- ts1 (ambiguous): the standalone Story carries no acceptance criteria; ac1-ac4 in the test strategy are derived from the ISSUE's expected behaviour and fix intent (ac1 no overlap after a socket close; ac2 the ack follows drains; ac3 never stuck on ends that cannot be acked; ac4 unqueued requests unchanged, busy count and thread view end at the ack).

## Resolved questions

- `q99f9b9e7` — ts1 (ambiguous): the standalone Story carries no acceptance criteria; ac1-ac4 in the test strategy are derived from the ISSUE's expected behaviour and fix intent (ac1 no overlap after a socket close; ac2 the ack follows drains; ac3 never stuck on ends that cannot be acked; ac4 unqueued requests unchanged, busy count and thread view end at the ack).
  - **resolved**: Adopt ac1-ac4 as-is, sourced to the ISSUE — Raised with the LLD at presentation; the user approved the LLD with ac1-ac4 as stated. _(2026-10-29T10:44:04.746Z)_

## Citations

- **[[c1]]** `analyze-bundle` `Where the session FIFO moves forward today (insrc_analyze_step how-does-it-work over src/daemon/threads/router.ts)`
- **[[c2]]** `analyze-bundle` `The worker's completion message and who asks for it (insrc_analyze_step how-does-it-work over the ack path)`
- **[[c3]]** `analyze-bundle` `When the worker-side lifetime completes, so when the ack would be sent (direct source read of directDispatch and the maintenance hold)`
- **[[c4]]** `analyze-bundle` `Other ends of a queued request the router already handles (direct source read of src/daemon/threads/router.ts)`
- **[[c5]]** `analyze-bundle` `Tests to extend`
- **[[c6]]** `prior-artifact` `ISSUE-7c39e5cd2c076e86`
- **[[c7]]** `stakeholder` `User direction 2026-10-29: for each message in the queue there should be an explicit ack that moves the queue forward`
