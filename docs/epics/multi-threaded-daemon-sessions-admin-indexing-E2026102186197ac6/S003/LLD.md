<!-- insrc:artifact LLD-86197ac660732ceb-s3 -->

# LLD: E2026102886197ac6:S003

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**HLD base run:** `wf-1792588079400-heeqp4`
**HLD effective hash:** `b93e76739a25...`

s3 moves session work off the thread that reads the socket. Each client process (its validated client label and process id) gets its own worker thread, created on its first request and released when it has been idle for the idle timeout or its process has gone; a session's requests run one at a time in arrival order. The process-wide families whose state must stay single (chat, todos, understanding) run on one shared-state worker, detached workflow runs stay with the worker that started them and publish their poll state on the status board, and requests that carry no client identity go to one unattributed worker. Requests bound to a connection session stay on the main thread, because another epic forbids them crossing a worker channel.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-86197ac660732ceb** § 2. Framework summary

**Rollout phase:** Phase C — session pool
**Owns:** `sc6` (Session pool)
**Consumes:** `sc1` (Store guard and per-store threading policy), `sc2` (Shared step-state store), `sc3` (Thread channel and target registry), `sc4` (Thread status board), `sc5` (Method-class registry)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Verifying each store from several threads of one process (the LMDB graph environment, every Lance table, the in-memory DuckDB pool), including that a worker opening and later releasing its handles does not close a descriptor the process's locks depend on; the semaphore implementation over process-wide shared memory and its holder record; moving the four in-memory step state stores onto the shared step-state store with today's TTL; the status board's attached-client, sweep-progress and run-record slots; the thread channel's serialisation and the target registry's bookkeeping; the status board's hub-served layout on the main thread. As the root Story it owns every cross-cutting contract the other Stories consume. Validation: ac1 — one thread writes a repo's entities while another reads the same graph, the reader sees only whole transactions, and an entity's vectors are written only after its graph commit; ac2 — two threads write different artifacts or config entries and a third thread reads both back; ac3 — no code path outside the daemon opens a store; ac4 — a throwing LMDB transaction on one thread leaves nothing visible to another. Also: a worker opening and releasing its handles keeps the process's LMDB locks; the guard releases on success, throw, cancel and worker kill; an acquisition past its limit fails; nested acquisition is refused. Step-state compatibility: for each of the four kinds, token rotation (analyze, workflow), stable-token update (review) or consume-and-mint per stage (code-review, where a superseded token fails), read refresh of expiry, the 100-entry eviction and a missing-token error behave as today. LMDB's native environment is opened by the main thread at start and closed by it at shutdown; a worker may open and close its own handle on it (s1 verified this keeps the process's locks); lock reclaim waits for a dead worker's in-flight native calls. Per store, a quiescence observation with a time limit and an unhealthy-store outcome when it is exceeded; a guard wait never blocks its thread. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The main-thread router (connection handling, classification through the method-class registry, envelope forwarding to registered targets, writing replies and frames back, observing worker exits and reclaiming a dead worker's store locks), the admin worker, and indexing on two workers: the code-indexing worker hosting the whole index queue (both lanes, unchanged) and the file-watcher feed and serving every indexing-class method, and the document-summary worker running the summary jobs the summary lane hands it, so a summary starts only while code indexing is idle, as today. Both indexing workers publish lane state, idleness, summary-sweep progress, the full registered-repository records with each repository's completeness, and the unattributed-entity count with its reasons on the status board after every change. Session-class methods keep running on the main thread exactly as today until s3 moves them; there is no fallback worker. Shutdown and the locks-lost path keep today's behaviour with the workers included (each stops its work, the queue drains, the main thread closes the stores after the workers exit). Validation: ac1 — daemon.status and the TUI's admin reads answer within 100 ms while an indexing pass runs and another worker keeps an LMDB write transaction open; ac2 — each admin method's response matches today's recorded response; ac3 — a test enumerates every served RPC and stream method and fails on any without a class, and dispatch tests assert admin methods ran on the admin thread and indexing methods on the code-indexing thread; ac4/ac5 — a session request is answered during an indexing pass, and a file change is indexed while a session request runs; ac6 — summaries start only while code indexing is idle, and lane order and indexed results equal the single-thread baseline; ac7 — queue status and idle waiting read from another thread reflect the indexing workers' real state. Also: debug-status keeps every field including lastMethod; daemon.status and repo.list read only the status board and keep today's full response shapes. Also maintenance compaction: idle detection (30 min, configurable), the reclaimable-space threshold (25% and 256 MB), the daemon maintenance lock from the lock framework (afcfa027): every request but daemon.status takes it shared with no wait and is refused with the maintenance activity and reason while maintenance holds it exclusively; workers close and reopen their graph handles around the main thread's compaction; every started worker is registered with watchWorker, and the manual daemon.compact keeping today's responses. s2 adds the additive sc4 method publishLane and its hub binding. s2 supervises the workers it introduces (admin, code-indexing, document-summary): exit handling, lock reclaim, replacement and restart limits. ac8 — with the maintenance lock held exclusively, a request other than daemon.status and daemon.compact is refused at once with the activity and reason; daemon.status answers and reports the maintenance; a request already running finishes before compaction starts; an exclusive request that times out leaves the store open and untouched; every row written before compaction is present after it; daemon.compact returns today's CompactResult when idle and today's 'indexer is busy' refusal while the queue has work. — owns `sc5`
- `s4`: The main thread becomes the controller: it loads no handler runtime and runs no request handler, only the socket, classification, forwarding, worker supervision extended to every class and unified (s2 already supervises admin and both indexing workers; s4 adds the session pool's workers and the unattributed worker: in-flight requests failed, store locks reclaimed, the worker replaced) and shutdown coordination, including the locks-lost path. It also adds a `threads` section to daemon.status and daemon.debug-status from the status board and session pool (additive fields only) and makes the liveness answer report a busy session as busy rather than as a failure. Validation: ac1 — no request handler runs on the main thread; ac2 — a failing worker of any class fails only its own in-flight requests and is replaced; ac3 — shutdown and the locks-lost path behave as today; ac4 — daemon.status lists each thread with class, session, busy state, method and elapsed time; ac5 — with a session worker busy for minutes the liveness answer reports the daemon alive and the session busy; ac6 — every field of today's daemon.status and daemon.debug-status, including clients and sweep progress, is present with the same meaning.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `SessionPool.workerFor`

```typescript
(session: SessionId) => Promise<SessionWorkerInfo>
```

**Parameters:**
- `session: SessionId` — The validated client identity {label, pid} the request carries (src/daemon/server.ts:32-38).

**Returns:** `Promise<SessionWorkerInfo>` — The session's live worker, started (and registered in the target registry under the session's slot, attached to the router, registered with watchWorker) if it had none.

**Errors:**
- `SessionWorkerStartError` when The worker could not be started or did not report ready within the start limit; the waiting requests of that session are answered with this error and the next request tries again.

**Preconditions:**
- session.label is non-empty and session.pid is a positive integer (validClient).

**Postconditions:**
- At most one live worker per session id: concurrent calls for the same session resolve to the same worker.
- The worker's ThreadTarget is registered as {cls:'session', session} before the promise resolves.

### 2.2 `SessionPool.sessions`

```typescript
() => readonly SessionWorkerInfo[]
```

**Returns:** `readonly SessionWorkerInfo[]` — One entry per live session worker (and the unattributed and shared-state workers, identified by their slot), for s4's status and the idle sweep.

**Postconditions:**
- queued counts requests waiting in the session's FIFO, not the one running.

### 2.3 `SessionPool.options`

```typescript
SessionPoolOptions
```

**Returns:** `SessionPoolOptions` — idleTimeoutMs: release a session's worker after this long with nothing running or queued and no active detached run; default 15 minutes, read from config at start.

### 2.4 `Router.dispatch`

```typescript
(cls: MethodClass | undefined, request: LocalRequestEnvelope, deliver: DeliverEnvelope, dropped?: () => void) => () => void
```

**Parameters:**
- `cls: MethodClass | undefined` — The method's class from the method-class registry.
- `request: LocalRequestEnvelope` — The request with its session identity and trusted context.
- `deliver: DeliverEnvelope` — Where replies and frames go.
- `dropped: () => void` _(optional)_ — Called when a request held for a worker is cancelled before it is sent.

**Returns:** `() => void` — Cancel for the request (dequeues it if still queued in its session's FIFO).

**Postconditions:**
- A request with a connectionSession or session-memory execution, or a MAIN_DAEMON_CONNECTION_METHODS method, still runs on the main thread (it cannot cross a channel).
- A session-class method in the shared-state set goes to the shared-state worker; any other session-class method goes to the session's worker, or to the unattributed worker when the request has no valid identity.
- A session-class request (other than a FIFO-exempt method) is sent only after the session's previous non-exempt request has ended (its reply, its stream's done or error frame, or its cancel).
- workflow.run.abort for a run on the board is sent to the run's owner thread.

### 2.5 `Router.request`

```typescript
(cls: MethodClass, method: string, params: unknown, opts?: { readonly underHold?: boolean | undefined; readonly shared?: true | undefined }) => Promise<unknown>
```

**Parameters:**
- `cls: MethodClass` — The target class.
- `method: string` — The method to call.
- `params: unknown` — Its params, as the method's handler takes them.
- `opts: { underHold?: boolean; shared?: true }` _(optional)_ — underHold as today (src/daemon/threads/router.ts:133-152); shared: true sends a session-class call to the shared-state worker instead of a class target.

**Returns:** `Promise<unknown>` — The reply's result; rejects with its error, as today.

**Errors:**
- `Error` when The target's reply carries an error (the message is carried unchanged), as today.

**Postconditions:**
- A shared call is held, like any routed request, while the shared-state worker is unavailable, and never enters a session FIFO.

### 2.6 `TargetRegistry.targetFor`

```typescript
(cls: MethodClass, session?: SessionId, opts?: { readonly shared?: true | undefined }) => ThreadTarget | undefined
```

**Parameters:**
- `cls: MethodClass` — The request's class.
- `session: SessionId` _(optional)_ — The session identity; absent resolves to the unattributed target.
- `opts: { readonly shared?: true | undefined }` _(optional)_ — shared: true looks up the one shared-state worker's slot ('session:shared'); without it a session-class lookup with no session still resolves to the unattributed slot.

**Returns:** `ThreadTarget | undefined` — The registered target for the slot. s3 adds the shared-state slot: the registry's slot function maps a target with shared: true to 'session:shared' before its unattributed and per-session cases, and the same mapping is used by register, unregister and targetFor.

**Postconditions:**
- The registry's slot function reads ThreadTarget.shared first: a target with shared: true is keyed 'session:shared', so registering the shared-state worker never collides with the unattributed worker ('session:unattributed') and an unattributed request never resolves to the shared-state worker.
- targetFor('session', undefined) still resolves to the unattributed target; only targetFor('session', undefined, { shared: true }) resolves to the shared-state target.

### 2.7 `StatusBoard.publishRun`

```typescript
(run: RunRecord) => void
```

**Parameters:**
- `run: RunRecord` — The detached run's full poll state (status, model, frames, result, error, ownerThreadId, startedAt).

**Returns:** `void` — Replaces the run's record on the main-thread board (s1's rule: a record whose frames would shrink is refused).

**Preconditions:**
- Called by the run's owner worker after each progress frame and at its end.

**Postconditions:**
- workflow.run.poll on any thread returns the frames since the cursor, the model, the result and the error from this record, as today.

### 2.8 `StatusBoard.forgetRun`

```typescript
(runId: string) => void
```

**Parameters:**
- `runId: string` — A run the owner's retention evicted.

**Returns:** `void` — Removes the run's record; a later poll answers status 'unknown', as today.

**Postconditions:**
- Additive sc4 method with a hub binding, delivered with the detached-run move.

### 2.9 `InDaemonRoute.targetOf`

```typescript
(method: string) => { readonly cls: MethodClass; readonly shared?: true | undefined } | undefined
```

**Parameters:**
- `method: string` — The nested call's method.

**Returns:** `{ cls: MethodClass; shared?: true } | undefined` — Where the nested call runs: undefined inline, otherwise the target to send it to. Replaces the class-granular pair classOf + routed (src/daemon/steps/daemon-client.ts:79-83, 103-112), which cannot tell shared-state methods from other session-class methods because both classify as 'session'.

**Postconditions:**
- s2's admin and indexing routing is unchanged: targetOf returns { cls } for those classes whenever the old routed set held them.
- On every thread but the shared-state worker, targetOf returns { cls: 'session', shared: true } for each method in the shared-state set.

### 2.10 `createInDaemonClient`

```typescript
(unary: RpcHandlers, stream: StreamHandlers, deps?: InDaemonClientDeps) => InDaemonClient
```

**Parameters:**
- `unary: RpcHandlers` — The worker's own handler table.
- `stream: StreamHandlers` — The worker's own stream table.
- `deps: InDaemonClientDeps` _(optional)_ — The route to other threads. s3 changes its decision from class-granular to per method (InDaemonRoute.targetOf): on a session or unattributed worker an admin or indexing method goes to its class's worker, a shared-state method goes to the shared-state worker, and every other session-class method runs inline; on the shared-state worker its own families run inline.

**Returns:** `InDaemonClient` — The nested-call client a step handler uses.

**Postconditions:**
- A nested call is routed by InDaemonRoute.targetOf(method): undefined means inline on the calling worker's own table; { cls } means that class's worker; { cls: 'session', shared: true } means the shared-state worker.
- A nested session-class call that is not shared-state runs inline on the calling worker, outside the session FIFO, so it cannot deadlock on the request that made it; a nested shared-state call is sent to the shared-state worker, also outside any FIFO.

### 2.11 `buildHandlerRuntime`

```typescript
(deps: HandlerRuntimeDeps) => HandlerRuntime
```

**Parameters:**
- `deps: HandlerRuntimeDeps` — On a session or shared-state worker: its own db/config handles, the indexing port for queue and indexer, shutdown and attachedClients through the hub, and the understanding service only on the shared-state worker.

**Returns:** `HandlerRuntime` — The same handler tables the main thread builds today.

**Postconditions:**
- Handler bodies are unchanged; only their dependencies are supplied differently per thread.

### 2.12 `purgeSession`

```typescript
(sessionId: string, opts: { compact: boolean }) => Promise<PurgeCounts>
```

**Parameters:**
- `sessionId: string` — The session whose data is purged (session.delete, session.deleteBulk, agent.discard, and the expiry loop).
- `opts: { compact: boolean }` — Whether to compact Lance afterwards, as today.

**Returns:** `Promise<PurgeCounts>` — Today's counts.

**Postconditions:**
- Its chat-pool drop (src/daemon/handler-runtime.ts:174-181, today dropSessionFromPool called in-process) is made as a nested in-daemon call to an in-daemon-only method chat.dropSession on the shared-state worker, which calls dropSessionFromPool there; the socket does not serve chat.dropSession (it answers 'unknown method').
- Its todos cleanup (src/daemon/handler-runtime.ts:207, today todosRpc.cleanup in-process) is made as a nested call to todos.cleanup, which the route sends to the shared-state worker, so its todos events reach that worker's bus and its todos.subscribe streams.
- With daemon threads disabled both calls run in-process as today.
- These two calls are the only change to a handler body in s3; every other handler body is unchanged.

## 3. Data model changes

### 3.1 `SessionWorkerInfo` — new

sc6's per-worker record: session (SessionId), threadId, createdAt, lastRequestAt, queued (requests waiting in the session's FIFO), activeRuns (detached runs the worker owns; a worker with any is never idle-released). Held by the pool on the main thread.

**Call sites:**
- `src/daemon/threads/registry.ts:11-55`
- `src/daemon/threads/workers.ts:59-70`

### 3.2 `Session FIFO` — new

Per session id, on the main thread: the request in flight and the queue of later non-exempt requests in arrival order. A request leaves it on its reply, its stream's done/error frame, or its cancel. FIFO-exempt (forwarded at once): subscription streams (understanding.watch, todos.subscribe), and methods that observe or control an in-flight request of the same session (chat.cancel, chat.inject, chat.redirect, chat.status, workflow.run.poll, workflow.run.abort). Nested in-daemon calls never enter it.

**Call sites:**
- `src/daemon/threads/router.ts:120-152`

### 3.3 `ThreadTarget` — field-add

Additive optional field shared?: true marking the one shared-state session worker. The registry's slot function (slotOf, src/daemon/threads/registry.ts:32-35), which today keys a session-class target with no session as 'session:unattributed', is extended to check shared first and key such a target 'session:shared'; register, unregister and targetFor use that slot function, and targetFor gains the opts.shared lookup. Without the slotOf change the shared-state target would take the unattributed slot (a TargetConflictError at registration, or unattributed requests reaching the shared-state worker).

```
+ readonly shared?: true | undefined;   // ThreadTarget
  slotOf: cls !== 'session' -> cls; shared === true -> 'session:shared' (new, checked first); unattributed or no session -> 'session:unattributed'; else 'session:<label>:<pid>'
+ targetFor(cls, session?, opts?: { shared?: true })
```

**Call sites:**
- `src/daemon/threads/registry.ts:11-55`

### 3.4 `Shared-state method set` — new

The session-class methods whose state is one process-wide copy and that run on the shared-state worker: chat.* (chat session pool), todos.* including todos.subscribe (todos event bus and retention timer), understanding.* including understanding.watch (understanding service). A test fails if a handler in these families is reachable from another worker's dispatch.

**Call sites:**
- `src/daemon/chat-handler.ts:39-67`
- `src/daemon/todos-rpc.ts:122-138`
- `src/daemon/handler-runtime.ts:1444-1453`

### 3.5 `RunRecord publication` — invariant-change

Detached runs keep their RunState in the owner worker's registry (src/daemon/workflow-run-registry.ts:72) and now mirror it to the board after every frame and at the end; poll reads the board, abort is routed to the owner, and an owner's exit marks a running run 'error' with a named reason.

**Call sites:**
- `src/daemon/workflow-run-registry.ts:30-72`
- `src/daemon/handler-runtime.ts:1579-1598`
- `src/daemon/threads/status-board.ts:114-170`

### 3.6 `In-daemon route decision` — field-modify

InDaemonRoute's class-granular classOf + routed pair (src/daemon/steps/daemon-client.ts:79-83) is replaced by a per-method targetOf. It keeps s2's invariant that admin and indexing nested calls go to their class's worker (bundle c7), and adds the shared-state target; any other session-class nested call still runs inline.

**Call sites:**
- `src/daemon/steps/daemon-client.ts:98-121`

## 4. Diagrams

- [Sequence diagram](docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/S003/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | The pool maps session ids to workers, creates one on first need, holds each session's FIFO at the router, runs nested calls inline (in-daemon client), and releases a worker after idleTimeoutMs idle or when its client pid is gone, never while it owns an active detached run. |
| `sc3` | consumes | Session workers register under 'session:<label>:<pid>', the unattributed worker under 'session:unattributed', and the shared-state worker under a new 'session:shared' slot: the additive ThreadTarget field 'shared', read first by the registry's slot function, and the matching targetFor lookup. wireRequest is unchanged: a request with connection-session context is never sent to a worker. |
| `sc4` | consumes | Owner workers publish RunRecords with publishRun and remove evicted ones with the additive forgetRun; poll answers from the board snapshot. |
| `sc2` | consumes | Step handlers keep using getStepStateStore(); on a worker it is the hub store, so a token minted before an idle release resumes on the next worker. |
| `sc1` | consumes | Session workers open their own store handles under the per-store policy; a dead worker's locks are reclaimed by the router's existing exit handling. |
| `sc5` | consumes | classOf decides session class; the shared-state set and the FIFO-exempt set are declared beside the method-class table, and a test checks each member is a session-class method. |

## 6. Error paths

**Error cases**

- **A session worker exits (crash, uncaught error, process.exit) while it runs one of its session's requests and others wait in the session's FIFO.** (recoverable)
  - Detection: The router's existing worker-exit observation (s2) reports the threadId; the pool maps it to its session.
  - Response: The running request is answered with 'session worker failed: <exit reason>' (an error frame for a stream), every queued request of that session with the same error, the session's slot is unregistered and the dead worker's store locks are reclaimed by the existing path; the session's next request starts a new worker.
  - User impact: Only that session's in-flight and queued requests fail; other sessions, the admin worker and indexing keep working.
- **A session request's handler throws.** (recoverable)
  - Detection: directDispatch on the worker catches the rejection, as today.
  - Response: The request is answered with today's error text; the worker stays alive and the session's next queued request is sent.
  - User impact: The session sees the same error it sees today.
- **A session worker cannot be started (worker script fails to load, or does not report ready within the start limit).** (recoverable)
  - Detection: SessionPool.workerFor rejects (worker 'error'/'exit' before ready, or the start deadline passes).
  - Response: Every request waiting for that session is answered 'session worker could not start: <reason>' (SessionWorkerStartError); nothing is retried automatically; the next request tries once more.
  - User impact: The session gets an error instead of hanging; other sessions are unaffected.
- **A detached workflow run's owner worker exits while the run is running.** (terminal)
  - Detection: Worker-exit observation finds RunRecords on the board with ownerThreadId equal to the dead thread and status 'running'.
  - Response: Each such record is republished with status 'error' and error 'the session worker running this workflow exited', keeping its frames; later polls return that terminal state.
  - User impact: A controller polling the run sees it end with a named error instead of polling forever.
- **The shared-state worker (chat, todos, understanding) exits.** (recoverable)
  - Detection: Worker-exit observation for the 'session:shared' slot.
  - Response: Its in-flight requests and open subscription streams are answered with an error frame; the worker is started again on the next request to its families (its state, like today's after a restart, is rebuilt from the stores; chat processes it owned are gone).
  - User impact: Open chats and todo/understanding subscriptions end with an error and must be reopened; sessions' other work continues.
- **A request for a session-class method arrives with a connection session or session-memory execution.** (recoverable)
  - Detection: Router.dispatch checks trustedContext as today (src/daemon/threads/router.ts:120-125).
  - Response: It runs on the main thread exactly as today; it is not queued in the session's FIFO (its lifetime is owned by the connection session).
  - User impact: None versus today.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two connections from the same client process ({label, pid}) send requests at the same time. | Both go to the one worker for that session and run in arrival order at the router. |
| A client reuses a label but runs as a new process (new pid) after the old one exited. | A new session and worker; the old session's worker is released at the next idle sweep because its pid is gone, or at its idle timeout. |
| A request with no client identity (or an invalid label/pid). | Served by the one unattributed worker, apart from every session, in arrival order across unattributed requests. |
| A session sends chat.cancel or workflow.run.abort while its own long request is running. | Forwarded at once (FIFO-exempt), so the cancel reaches the running work instead of waiting behind it. |
| A session opens understanding.watch or todos.subscribe and keeps it open for hours. | The subscription is FIFO-exempt and runs on the shared-state worker; the session's later requests are not blocked by it. |
| A session's worker is idle for the idle timeout while it owns a running detached workflow run. | Not released; it is released only after the run ends and the idle timeout passes again. |
| A step token minted on a worker that was later released is presented by the same session. | The new worker reads it from the shared step-state store and the step resumes as today. |
| A step handler makes a nested in-daemon call to another session-class method. | Runs inline on the same worker, outside the FIFO, so it completes without waiting for the request that made it. |
| workflow.run.poll from a different client process than the one that started the run. | Answered from the board with the same frames-since-cursor, model, result and error as today. |
| session.delete on a session worker for a session that has an open chat and todo lists, while a client has todos.subscribe open. | The chat is dropped from the shared-state worker's pool and the cleanup's todos events reach the open subscription, as on today's single thread. |

**Invariants to preserve**

- A request carrying a connection session or session-memory execution, or a MAIN_DAEMON_CONNECTION_METHODS method, never crosses a worker channel (wireRequest throws for it). [[c2]]
- Step tokens of the four kinds keep today's lifecycle (rotation, stable token, consume-per-stage, 100-entry LRU, 1-hour TTL) because every step store goes through getStepStateStore(). [[c3]]
- workflow.run.poll keeps today's PollResult: frames since the cursor, model, result, error, and 'unknown' for an unregistered or evicted run. [[c4]]
- The chat session pool, the todos event bus and the understanding service each have exactly one process-wide copy. [[c5]]
- Each request on a worker is served under the maintenance lock's request hold (serveRequests), and a worker's store locks are reclaimed when it exits. [[c6]]
- A nested in-daemon call to a method whose class the worker does not route runs inline on that worker. [[c7]]
- Request handler bodies are unchanged except purgeSession's chat-pool drop and todos cleanup, which become nested calls to the shared-state worker; elsewhere only where handlers run and how their dependencies are supplied changes. [[c7]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test); daemon-thread tests under src/daemon/threads/__tests__ with worker helper scripts in src/daemon/threads/__tests__/helpers, as s2's tests do`

**Test levels**

- **unit** — The pool and FIFO logic without real workers: session-id slotting, per-session FIFO order, FIFO-exempt methods, idle and pid-gone release, never releasing a worker with active runs, failure fan-out to queued requests, the shared-state and FIFO-exempt method sets. The registry keys a shared target 'session:shared' and an unattributed target 'session:unattributed', both registered at once without a conflict, and each lookup resolves to its own worker. InDaemonRoute.targetOf sends admin/indexing to their workers, shared-state methods to the shared-state worker (inline on that worker itself), and other session methods inline.
  - Subjects: `SessionPool.workerFor`, `SessionPool.sessions`, `Router.dispatch (session routing and FIFO)`, `TargetRegistry.targetFor (shared-state slot)`, `shared-state and FIFO-exempt method sets`
  - Fixtures: `A fake worker starter (MessageChannel ports) that records which session each request reached and lets the test hold or finish a request`, `A fake clock and a pid-alive probe`
- **integration** — Real worker threads started through the pool with the real handler runtime: cross-session independence, per-session order, one worker per client over several connections, failure containment, step-token resume after an idle release, detached runs owned by a worker and polled from another, the shared-state worker for chat/todos/understanding, nested in-daemon calls inline. session.delete on a session worker drops the session's chat from the shared-state worker's pool and its cleanup events reach an open todos.subscribe.
  - Subjects: `session worker entry`, `shared-state worker entry`, `workflow run registry with publishRun/forgetRun`, `StatusBoard.forgetRun hub binding`, `createInDaemonClient on a session worker`
  - Fixtures: `A test-only session method that spins the CPU for a set time and one that records its start/end order (INSRC_TEST_HOOKS=1)`, `A test-only method that exits the worker`, `A temporary HOME with an initialised store and a registered fixture repository, as the s2 thread tests use`
- **smoke** — The daemon started as a process with threads enabled: two socket clients with different {label,pid} run concurrently, daemon.status answers within 100 ms while one session spins, and SIGTERM still drains and exits 0.
  - Subjects: `daemon boot with the session pool`, `router forwarding over the real socket`
  - Fixtures: `The threads-boot test harness (src/daemon/threads/__tests__/threads-boot.test.ts)`
- **contract** — Every session-class method resolves to exactly one target kind (session, shared-state, unattributed) or is a main-thread connection method; every response a moved method gives over the socket equals today's recorded response for the same input.
  - Subjects: `method-class table with the shared-state and FIFO-exempt sets`, `recorded responses of moved session methods`
  - Fixtures: `The recorded single-thread responses used by s2's admin/indexing parity tests`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: session A's worker spins the CPU for 5 s; session B's request on its own worker is answered before A's ends, and B's handler ran on a thread id different from A's and from the main thread` |
| `ac2` | `unit: three requests from one session reach the fake worker one at a time in arrival order, the second only after the first's reply, a stream only after its done frame`, `integration: A's second request starts after its first ends (recorded start/end order), while A's chat.cancel (FIFO-exempt) reaches the worker during the first` |
| `ac3` | `integration: one {label,pid} over two socket connections runs every request on the same worker thread id, in arrival order`, `unit: the worker is released after idleTimeoutMs with nothing running or queued, and at the next sweep after the client pid is gone; never while it owns a running detached run`, `integration: the shared-state families (chat.list, todos.listForSession, understanding.*) run on the shared-state worker, and a test fails if one is dispatched to a session worker`, `integration: session.delete run on a session worker drops the session's chat from the shared-state worker's pool, and the todos cleanup's events reach an open todos.subscribe on the shared-state worker` |
| `ac4` | `integration: a session worker exits mid-request; its running and queued requests get 'session worker failed: ...', another session's request and daemon.status are answered, an indexing pass continues, and the session's next request runs on a new worker`, `integration: a session handler that throws returns today's error and the same worker serves the next request`, `integration: a detached run's owner exits; a poll from another session returns status 'error' with the named reason and the frames so far` |
| `ac5` | `unit: a source scan of the session worker entry and the pool finds no Promise.all/allSettled over calls reaching a provider`, `integration: a session method that makes two provider calls through a recording fake provider shows them strictly sequential (second starts after first resolves)` |
| `ac6` | `integration: for each of analyze, workflow, review and code-review, a token minted on a session worker resumes on that session's next worker after an idle release, with today's rotate/stable/consume-per-stage result` |
| `ac7` | `smoke: with one session worker spinning the CPU for minutes (test hook), daemon.status over the socket answers within 100 ms at the 99th percentile of 200 calls and reports the daemon's current state` |

## 8. Migration

**State before:** With daemon threads enabled (s2), the router routes only the admin and indexing classes; every session-class method (193 entries, including workflow.run/start/poll/abort, chat.*, todos.*, understanding.*) runs on the main thread through directDispatch over buildHandlerRuntime's tables (src/daemon/threads/router.ts:120-125, src/daemon/threads/method-class.ts:226-264). Step tokens already live in the shared step-state store (src/daemon/threads/step-state.ts). Detached workflow runs live in the main thread's module-scope run map (src/daemon/workflow-run-registry.ts:72) and nothing publishes run records on the board (src/daemon/threads/status-board.ts:114-170). Requests with a connection session stay on the main thread (src/daemon/threads/channel.ts:59-62). With threads disabled, the single-thread daemon serves everything on the main thread.

**State after:** With threads enabled, the router also routes the session class: per-session workers (one per validated {label,pid}, FIFO per session at the router, idle-released after 15 minutes or when the client process has gone), one unattributed worker, and one shared-state worker for chat, todos and understanding. Detached runs are owned by the starting worker and mirrored to the board (publishRun, new forgetRun); polls answer from the board, aborts go to the owner. Connection-scoped requests still run on the main thread. With threads disabled, behaviour is unchanged.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the additive sc3 ThreadTarget field 'shared', extend the registry's slot function to key a shared target 'session:shared' (checked before the unattributed case) with the matching targetFor lookup, and add the additive sc4 forgetRun with its hub binding; nothing uses them yet. — ↩ rollbackable
2. Declare the shared-state method set and the FIFO-exempt method set beside the method-class table, with a test that every member is a session-class method. — ↩ rollbackable
3. Add the session worker entry and the shared-state worker entry (handler runtime with hub/port dependencies), started only by the pool; change the in-daemon route to the per-method targetOf (admin and indexing routing unchanged) with Router.request's shared option, add the in-daemon-only chat.dropSession on the shared-state worker, and make purgeSession's chat drop and todos cleanup nested calls; nothing routes sessions to workers yet. — ↩ rollbackable
4. Make the workflow run registry mirror each run to the board and answer poll from the board snapshot; with threads disabled the board is local, so single-thread polls answer the same. — ↩ rollbackable
5. Add the session pool and the per-session FIFO to the router, and add 'session' to the routed classes when daemon threads are enabled (behind the existing daemon.threads.enabled flag); add the config key for the session idle timeout (default 15 minutes). — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
6. Move the todos retention timer and the understanding service open onto the shared-state worker when threads are enabled. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_

**Backward compat:** The IPC contract is unchanged: same socket, method names, request shapes and response fields for every moved method (checked against recorded responses). Ordering changes in one place: a session's non-exempt requests now run one at a time in arrival order, where today they interleave on the main thread; this is the Story's ac2 and k1. Turning daemon.threads.enabled off restores today's single-thread daemon. Step tokens and run polls keep today's behaviour; open chats, todo subscriptions and understanding watches are not carried across a daemon restart, as today.

## 9. Alternatives considered

### 9.1 a1: Session pool with a main-thread exception list

Per-session workers serve every session-class method except a named set of process-wide families (chat, todos, understanding) and connection-scoped requests, which keep running on the main thread.

The router routes the session class: a session-class request is forwarded to the session pool's worker for its {label,pid} (created on first need, FIFO per session, idle-released after 15 minutes unless it owns an active detached run), or to the unattributed worker when it carries no valid identity. A declared set SHARED_STATE_METHODS (chat.*, todos.* including todos.subscribe, understanding.*) joins MAIN_DAEMON_CONNECTION_METHODS and the connection-session/session-memory requests as methods the router keeps on the main thread's local dispatch, because their state (chat session pool, todos event bus, understanding service) is one process-wide copy. Detached workflow runs move with workflow.run.start onto the starting session worker, publish RunRecords on the board (publishRun, new forgetRun), and poll is answered from the board on any thread; abort is routed to the owner worker. Nested calls run inline on the worker (createInDaemonClient's existing behaviour).

**Rejected because:** Cheapest, and it keeps process-wide state whole, but it leaves session work on the socket thread (ac1/ac4/ac7 partial) and contradicts FR4 and s4's ac1.

### 9.2 a2: Session pool plus one shared-state session worker — **CHOSEN**

Per-session workers for per-session-safe methods; the process-wide families (chat, todos, understanding) run on one dedicated shared-state worker, so the main thread serves only connection-scoped requests.

As a1 for the session pool, the unattributed worker and detached runs. The families whose state is process-wide (chat.*, todos.* with todos.subscribe and the retention timer's emits, understanding.* with the understanding service) are classified to one dedicated 'shared-state' session worker registered in its own registry slot, so their one copy of state lives on that worker and every session reaches it through the router. A nested call from a session worker into one of these families (for example the session purge dropping a chat from the pool) goes through Router.request to the shared-state worker. Connection-scoped requests (connectionSession / session-memory, MAIN_DAEMON_CONNECTION_METHODS) stay on the main thread because they cannot cross a worker channel (Epic 484fcef7); that is recorded as an open question, not built around.

### 9.3 a3: Session pool with process-wide state as main-thread hub services

Every crossable session-class method runs on its session's worker; the chat pool, todos bus and understanding service stay on the main thread as hub services that workers call, like the shared step-state store.

As a1 for the pool, unattributed worker and detached runs, with no exception list for chat, todos or understanding: their handlers run on the caller's session worker, and the state they touch is reached through new hub operations served by the main thread (chat pool operations and its stream relay, a todos emit op feeding the main-thread bus, understanding service calls). The main thread keeps the state but runs no request handler for these families.

**Rejected because:** Best on ac3, but it keeps the heaviest process-wide work (chat processes and their streams) on the main thread through three new hub surfaces, so ac4 and ac7 are only partial and the change is largest.

## 10. References

- **[[c1]]** `code` `src/daemon/threads/router.ts:120-152` — "if (request.trustedContext?.connectionSession !== undefined || request.trustedContext?.connectionExecution?.mode === 'session-memory'"
- **[[c2]]** `code` `src/daemon/threads/channel.ts:59-62` — "throw new Error('Session execution cannot cross a worker channel.');"
- **[[c3]]** `code` `src/daemon/threads/step-state.ts` — "Shared step-state store (Epic 86197ac6, Story s1, contract sc2)"
- **[[c4]]** `code` `src/daemon/workflow-run-registry.ts:72` — "const runs = new Map<string, RunState>();"
- **[[c5]]** `code` `src/daemon/chat-handler.ts:39` — "let sessionPool: ChatSessionPool | null = null;"
- **[[c6]]** `code` `src/daemon/todos-rpc.ts:122` — "const bus = new EventEmitter();"
- **[[c7]]** `code` `src/daemon/threads/registry.ts:32-35` — "return `session:${t.session.label}:${t.session.pid}`;"
- **[[c8]]** `code` `src/daemon/steps/daemon-client.ts:103-117` — "if (deps.route !== undefined && cls !== undefined && deps.route.routed.has(cls)) {"
- **[[c9]]** `code` `src/daemon/threads/status-board.ts:114` — "publishRun(run: RunRecord): void {"
- **[[c10]]** `doc` `docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/HLD.md:408` — "Module-scope state that silently splits per worker"

## 11. Open questions

- ts2 (partial): s6 names node:test via tsx under src/daemon/threads/__tests__, matching the s1 bundles' thread-test paths, but s1 did not run a test.locate pass to report the framework explicitly. The framework is the repo's only test runner (CLAUDE.md build section).
- alt2 (partial): s3 scores every alternative against ac1-ac7 and sc1-sc6, but not against the Epic constraints k1-k7 as separate entries. k1, k2, k6 and k7 are covered through the acceptance criteria that operationalize them; k3, k4 and k5 are not scored separately.
- Connection-scoped requests (a trusted connectionSession, session-memory execution, or a MAIN_DAEMON_CONNECTION_METHODS method) cannot cross a worker channel (src/daemon/threads/channel.ts:59-62, owned by Epic 484fcef7), so they keep running on the main thread; FR4 and s4's ac1 cannot be met for them until that epic lets them cross. Who owns that change?
- The HLD risk table (docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/HLD.md:408) assigned the module-scope state inventory to s1, but none exists; this LLD classifies the process-wide families it found (chat pool, todos bus, understanding service, run registry). Should the full inventory be delivered here, as a test over every module-scope mutable value reachable from a session handler, or tracked separately?
- The FIFO-exempt set (subscriptions plus chat.cancel/inject/redirect/status and workflow.run.poll/abort) is chosen from the methods that observe or control an in-flight request; confirm no other client relies on concurrent requests within one session (for example the VS Code dev chat or the MCP forwarder).
- The sc3 amendment adding ThreadTarget.shared must be approved for the shared-state worker to hold.

## Resolved questions

- `q08085234` — The sc3 amendment adding ThreadTarget.shared must be approved for the shared-state worker to hold.
  - **resolved**: Approve sc3 now — AMD-86197ac660732ceb-1 (sc3 ThreadTarget.shared, additive) was dry-run against the effective HLD and approved by the user on 2026-10-28. _(2026-10-28T05:26:51.837Z)_

## Citations

- **[[c1]]** `code` `src/daemon/threads/router.ts:120-152` — "if (request.trustedContext?.connectionSession !== undefined || request.trustedContext?.connectionExecution?.mode === 'session-memory'"
- **[[c2]]** `code` `src/daemon/threads/channel.ts:59-62` — "throw new Error('Session execution cannot cross a worker channel.');"
- **[[c3]]** `code` `src/daemon/threads/step-state.ts` — "Shared step-state store (Epic 86197ac6, Story s1, contract sc2)"
- **[[c4]]** `code` `src/daemon/workflow-run-registry.ts:72` — "const runs = new Map<string, RunState>();"
- **[[c5]]** `code` `src/daemon/chat-handler.ts:39` — "let sessionPool: ChatSessionPool | null = null;"
- **[[c6]]** `code` `src/daemon/todos-rpc.ts:122` — "const bus = new EventEmitter();"
- **[[c7]]** `code` `src/daemon/threads/registry.ts:32-35` — "return `session:${t.session.label}:${t.session.pid}`;"
- **[[c8]]** `code` `src/daemon/steps/daemon-client.ts:103-117` — "if (deps.route !== undefined && cls !== undefined && deps.route.routed.has(cls)) {"
- **[[c9]]** `code` `src/daemon/threads/status-board.ts:114` — "publishRun(run: RunRecord): void {"
- **[[c10]]** `doc` `docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/HLD.md:408` — "Module-scope state that silently splits per worker"
