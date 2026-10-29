<!-- insrc:artifact LLD-86197ac660732ceb-s4 -->

# LLD: E2026102986197ac6:S004

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**HLD base run:** `wf-1792588079400-heeqp4`
**HLD effective hash:** `cea66c896837...`

s4 makes the threaded daemon's main thread a controller and makes every thread's work visible. The main thread no longer builds the request-handler runtime at boot; it builds it only when a connection-scoped request (which cannot cross a worker channel until the logged follow-up lands) first needs it. The router, which sees every request it sends and every reply, frame and cancel, publishes each worker thread's state on the status board, so daemon.status and daemon.debug-status gain an additive `threads` list (role, class, session, busy, method, elapsed, queued, active runs) that stays correct even while a worker is CPU-bound. Session-pool workers join the supervisor's tracking, so shutdown terminates every worker and the shared-state worker gets the restart limit.

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

## 1. HLD context

> See **HLD-86197ac660732ceb** § 2. Framework summary

**Rollout phase:** Phase D — controller and thread visibility
**Consumes:** `sc1` (Store guard and per-store threading policy), `sc3` (Thread channel and target registry), `sc4` (Thread status board), `sc5` (Method-class registry), `sc6` (Session pool)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Verifying each store from several threads of one process (the LMDB graph environment, every Lance table, the in-memory DuckDB pool), including that a worker opening and later releasing its handles does not close a descriptor the process's locks depend on; the semaphore implementation over process-wide shared memory and its holder record; moving the four in-memory step state stores onto the shared step-state store with today's TTL; the status board's attached-client, sweep-progress and run-record slots; the thread channel's serialisation and the target registry's bookkeeping; the status board's hub-served layout on the main thread. As the root Story it owns every cross-cutting contract the other Stories consume. Validation: ac1 — one thread writes a repo's entities while another reads the same graph, the reader sees only whole transactions, and an entity's vectors are written only after its graph commit; ac2 — two threads write different artifacts or config entries and a third thread reads both back; ac3 — no code path outside the daemon opens a store; ac4 — a throwing LMDB transaction on one thread leaves nothing visible to another. Also: a worker opening and releasing its handles keeps the process's LMDB locks; the guard releases on success, throw, cancel and worker kill; an acquisition past its limit fails; nested acquisition is refused. Step-state compatibility: for each of the four kinds, token rotation (analyze, workflow), stable-token update (review) or consume-and-mint per stage (code-review, where a superseded token fails), read refresh of expiry, the 100-entry eviction and a missing-token error behave as today. LMDB's native environment is opened by the main thread at start and closed by it at shutdown; a worker may open and close its own handle on it (s1 verified this keeps the process's locks); lock reclaim waits for a dead worker's in-flight native calls. Per store, a quiescence observation with a time limit and an unhealthy-store outcome when it is exceeded; a guard wait never blocks its thread. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The main-thread router (connection handling, classification through the method-class registry, envelope forwarding to registered targets, writing replies and frames back, observing worker exits and reclaiming a dead worker's store locks), the admin worker, and indexing on two workers: the code-indexing worker hosting the whole index queue (both lanes, unchanged) and the file-watcher feed and serving every indexing-class method, and the document-summary worker running the summary jobs the summary lane hands it, so a summary starts only while code indexing is idle, as today. Both indexing workers publish lane state, idleness, summary-sweep progress, the full registered-repository records with each repository's completeness, and the unattributed-entity count with its reasons on the status board after every change. Session-class methods keep running on the main thread exactly as today until s3 moves them; there is no fallback worker. Shutdown and the locks-lost path keep today's behaviour with the workers included (each stops its work, the queue drains, the main thread closes the stores after the workers exit). Validation: ac1 — daemon.status and the TUI's admin reads answer within 100 ms while an indexing pass runs and another worker keeps an LMDB write transaction open; ac2 — each admin method's response matches today's recorded response; ac3 — a test enumerates every served RPC and stream method and fails on any without a class, and dispatch tests assert admin methods ran on the admin thread and indexing methods on the code-indexing thread; ac4/ac5 — a session request is answered during an indexing pass, and a file change is indexed while a session request runs; ac6 — summaries start only while code indexing is idle, and lane order and indexed results equal the single-thread baseline; ac7 — queue status and idle waiting read from another thread reflect the indexing workers' real state. Also: debug-status keeps every field including lastMethod; daemon.status and repo.list read only the status board and keep today's full response shapes. Also maintenance compaction: idle detection (30 min, configurable), the reclaimable-space threshold (25% and 256 MB), the daemon maintenance lock from the lock framework (afcfa027): every request but daemon.status takes it shared with no wait and is refused with the maintenance activity and reason while maintenance holds it exclusively; workers close and reopen their graph handles around the main thread's compaction; every started worker is registered with watchWorker, and the manual daemon.compact keeping today's responses. s2 adds the additive sc4 method publishLane and its hub binding. s2 supervises the workers it introduces (admin, code-indexing, document-summary): exit handling, lock reclaim, replacement and restart limits. ac8 — with the maintenance lock held exclusively, a request other than daemon.status and daemon.compact is refused at once with the activity and reason; daemon.status answers and reports the maintenance; a request already running finishes before compaction starts; an exclusive request that times out leaves the store open and untouched; every row written before compaction is present after it; daemon.compact returns today's CompactResult when idle and today's 'indexer is busy' refusal while the queue has work. — owns `sc5`
- `s3`: The session pool, moving every session-class method off the main thread: session-id mapping, per-session FIFO, worker creation and idle release, containment of a failing worker (its in-flight requests fail with an error, the next request gets a new worker), routing each step handler's state through the shared step-state store, the unattributed worker, inline nested calls, and ownership of detached workflow runs (records on the status board, abort routed to the owner, failure on owner exit, never idle-released while a run is active). Validation: ac1 — session B is answered while session A's worker spins; ac2 — A's second request starts only after its first completes; ac3 — requests from one client process over separate connections run on one worker, released after the idle timeout; ac4 — a worker failure fails only its session's requests; ac5 — provider calls stay serial (no Promise.all reaching a provider); ac6 — a step token minted before an idle release resumes on the new worker; ac7 — the liveness check (daemon.status) answer within 100 ms while a session worker spins the CPU for minutes. Also: unattributed requests are served apart from sessions; a nested in-daemon call completes without deadlock; a detached run survives idle time, accepts an abort from another thread, and is marked failed when its owner exits; a poll from another thread, and after the owner has gone, returns the same frames-since-cursor, model, result and error as today. The board's forgetRun operation (an additive sc4 method) is added with the detached-run move, called by the run owner's retention. Session workers take the maintenance lock shared per request like every other request, and are registered with watchWorker when started. — owns `sc6`

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DaemonStatus`

```typescript
interface DaemonStatus { /* every existing field unchanged */ threads?: ThreadView[] | undefined }; interface ThreadView { threadId: number; role: ThreadRole; cls: MethodClass | undefined; session?: SessionId | undefined; busy: boolean; method?: string | undefined; elapsedMs?: number | undefined; queued: number; activeRuns: number }; type ThreadRole = 'admin' | 'code-indexing' | 'document-summary' | 'session' | 'unattributed' | 'shared-state'
```

**Returns:** `DaemonStatus` — Today's daemon.status response plus `threads` when daemon threads are enabled: one entry per live worker thread. Absent with threads disabled, so a consumer that does not know the field sees no change (k5).

**Preconditions:**
- daemon.threads.enabled for `threads` to be present

**Postconditions:**
- Every field present today keeps its meaning (ac6)
- Each live worker thread appears once; busy is true while the router has a request of that thread in flight (for document-summary: while the summary lane is processing); method and elapsedMs are those of its oldest in-flight request
- activeRuns counts the board's runs with ownerThreadId === threadId and status 'running'

### 2.2 `adminWorkerHandlers`

```typescript
adminWorkerHandlers(deps: AdminWorkerDeps): RpcHandlers  // 'daemon.debug-status' now answers { clients: AttachedClient[]; threads: ThreadView[] }
```

**Parameters:**
- `deps: AdminWorkerDeps` — Adds threads: () => Promise<readonly ThreadView[]> read from the board snapshot

**Returns:** `RpcHandlers` — The admin worker's table; daemon.debug-status keeps `clients` exactly as today and adds `threads`.

**Postconditions:**
- daemon.debug-status.clients is byte-identical to today's for the same board state

### 2.3 `createAdminStatus`

```typescript
createAdminStatus(deps: AdminStatusDeps): AdminStatus  // daemonStatus() adds threads: threadViews(snapshot, now)
```

**Parameters:**
- `deps: AdminStatusDeps` — Unchanged deps; the thread view is derived from the same board snapshot it already reads

**Returns:** `AdminStatus` — daemonStatus() returns today's DaemonStatus plus `threads`, built from snapshot.threads, snapshot.runs (activeRuns) and snapshot.indexing.summary (document-summary busy), with elapsedMs = now - since.

**Postconditions:**
- No call into a worker other than the board snapshot hub request; a busy session worker never delays the answer

### 2.4 `StatusBoard`

```typescript
class StatusBoard { publish(status: ThreadStatus): void; forget(threadId: number): void; snapshot(): StatusSnapshot }  // ThreadStatus gains role?: ThreadRole (sc4 fieldAdd, additive)
```

**Parameters:**
- `status: ThreadStatus` — One worker thread's current state, published by the main thread's router (and by the supervisor for the document-summary worker)

**Returns:** `void` — The board's threads slot holds the latest status per thread; forget removes a thread that exited or was released.

**Preconditions:**
- Called on the main thread (the board lives there); no hub hop

**Postconditions:**
- snapshot().threads lists exactly the threads published and not forgotten

### 2.5 `Router`

```typescript
new Router(opts: RouterOptions & { board?: Pick<StatusBoard, 'publish' | 'forget'> | undefined; roleOf?: ((threadId: number) => ThreadRole | undefined) | undefined })  // attach publishes an idle status, send/terminal/cancel/detach republish, detach forgets
```

**Parameters:**
- `opts.board: Pick<StatusBoard, 'publish' | 'forget'> | undefined` _(optional)_ — Where the router publishes each worker thread's in-flight view; absent with threads disabled and in unit tests that do not care
- `opts.roleOf: (threadId: number) => ThreadRole | undefined` _(optional)_ — The thread's role from the target registry (admin, code-indexing, session, unattributed, shared-state)

**Returns:** `Router` — The router keeps, per worker thread, its in-flight requests (requestId -> method, since) and publishes ThreadStatus { threadId, cls, role, session, busy, method, since, queued } after each change.

**Postconditions:**
- A request counted in flight leaves the view at its reply, a stream's done/error frame, its cancel's end (s3 rule) or its worker's detach
- queued is the length of the session's FIFO for a session worker, 0 otherwise

### 2.6 `buildHandlerRuntime`

```typescript
buildHandlerRuntime(deps: HandlerRuntimeDeps): HandlerRuntime  // with threads enabled, called by the main thread only on its first local request
```

**Parameters:**
- `deps: HandlerRuntimeDeps` — Unchanged

**Returns:** `HandlerRuntime` — Built once, on demand, by the router's local forward for a request that must stay on the main thread (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS, an unclassified method, or the abort of a run owned by the main thread). With threads disabled it is built at boot as today.

**Errors:**
- `Error` when A build failure answers that request with its error and the next local request tries again; it never takes the daemon down

**Postconditions:**
- With threads enabled and no local request yet, the main thread has not called buildHandlerRuntime
- Shutdown stops the runtime's understanding routes only if it was built

### 2.7 `Supervisor`

```typescript
class Supervisor { track(worker: Worker, name: string): void; terminateAll(): Promise<void> }  // track: a worker started outside start() (the session pool's) joins created, gets the error log, and is terminated by terminateAll
```

**Parameters:**
- `worker: Worker` — A session-pool worker as it is created
- `name: string` — Its role for logs

**Returns:** `void` — The worker is supervised for errors and shutdown; its exit handling and replacement stay the pool's (s3).

**Postconditions:**
- terminateAll ends every worker the daemon created, session-pool workers included
- The shared-state worker's restarts count against the supervisor's restart limit (5 in 60 s), past which the daemon shuts down

### 2.8 `SessionPool`

```typescript
new SessionPool(deps: SessionPoolDeps & { onCreated?: ((worker: Worker, name: string) => void) | undefined; restarted?: ((name: string) => boolean) | undefined })
```

**Parameters:**
- `deps.onCreated: (worker: Worker, name: string) => void` _(optional)_ — Hands each created worker to Supervisor.track
- `deps.restarted: (name: string) => boolean` _(optional)_ — Asked before restarting the shared-state worker after an exit; false (the restart limit was passed) refuses the start

**Returns:** `SessionPool` — sc6 unchanged; workers are tracked by the supervisor and the shared-state worker's restarts are rate-limited.

**Errors:**
- `SessionWorkerStartError` when As s3; also when the shared-state worker's restart limit was passed (the daemon is shutting down)

## 3. Data model changes

### 3.1 `DaemonStatus` — field-add

Optional `threads?: ThreadView[]` (additive, k5). Absent with daemon threads disabled.

```
+ threads?: ThreadView[] | undefined
```

**Call sites:**
- `src/shared/types.ts:985-1028`
- `src/daemon/threads/admin-status.ts:42-93`
- `src/shared/ipc-client.ts:149-160`

### 3.2 `daemon.debug-status result` — field-add

Adds `threads: ThreadView[]` beside `clients`, which keeps today's shape and meaning.

```
{ clients: AttachedClient[] } -> { clients: AttachedClient[]; threads: ThreadView[] }
```

**Call sites:**
- `src/daemon/admin-handlers.ts:106-114`

### 3.3 `ThreadStatus` — field-add

sc4 ThreadStatus gains optional `role?: ThreadRole`, so the code-indexing and document-summary threads (both class indexing or none) and the unattributed and shared-state session workers are told apart in the view. Proposed as an additive sc4 amendment.

```
+ role?: 'admin' | 'code-indexing' | 'document-summary' | 'session' | 'unattributed' | 'shared-state' | undefined
```

**Call sites:**
- `src/daemon/threads/status-board.ts:21-30`
- `src/daemon/threads/status-board.ts:92`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Unchanged: every worker exit, session-pool workers included, still reclaims named locks and store-guard permits through the exit path before the worker is disconnected. |
| `sc3` | consumes | The router reads each target's class, session, unattributed and shared markers from the target registry to derive a thread's role; no envelope change, and wireRequest's refusal of a connection-scoped context stays (those requests run locally). |
| `sc4` | consumes | The router (on the main thread) publishes ThreadStatus per worker through StatusBoard.publish and removes it with forget; the admin worker reads snapshot().threads, runs and indexing to build the view. Adds the optional ThreadStatus.role through an additive amendment. |
| `sc5` | consumes | Classification is unchanged; the lazily built local runtime serves only what the router keeps local. |
| `sc6` | consumes | SessionPool's API is unchanged; its worker creation is handed to the supervisor's tracking and the shared-state worker's restarts are rate-limited. |

## 5. Error paths

**Error cases**

- **The lazy buildHandlerRuntime call on the first connection-scoped request throws (a handler table's module fails to load).** (recoverable)
  - Detection: The router's local forward awaits the one-time build inside a try; the rejection is caught there before directDispatch is called.
  - Response: That request is answered with the build error (an error frame for a stream); the cached promise is cleared so the next local request builds again; logged at error with the method.
  - User impact: Only the connection-scoped request fails; every routed request is unaffected and the daemon stays up.
- **A session-pool worker exits while the router has its requests in flight.** (recoverable)
  - Detection: The pool's worker 'exit' event (s3 path) calls router.failWorker, which detaches the thread; detach clears the thread's in-flight map.
  - Response: s3's failure answers are unchanged; the router calls board.forget(threadId) so the view drops the thread; the supervisor's tracked set loses the worker on its exit.
  - User impact: daemon.status stops listing the dead worker at once; no stale 'busy' entry remains.
- **The shared-state worker keeps exiting (crash loop).** (terminal)
  - Detection: The pool asks the supervisor's restart counter (restarted) before each shared-state start after an exit; past 5 restarts in 60 s it answers false.
  - Response: The start is refused with SessionWorkerStartError and the supervisor runs the daemon's shutdown with 'the shared-state worker exceeded the restart limit', as for the admin and indexing workers.
  - User impact: The daemon stops instead of spinning; clients reconnect to a restarted daemon.
- **A board.publish for a thread arrives after that thread was forgotten (a late send or terminal racing the worker's exit).** (recoverable)
  - Detection: The router publishes only for a thread it still has attached (ports.has(threadId)); detach removes the port before forget.
  - Response: No publish after detach, so no ghost thread is re-added.
  - User impact: None.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| daemon.status with daemon.threads.enabled false | No `threads` field; every other field exactly as today. |
| daemon.status before any session worker exists | `threads` lists the admin, code-indexing and document-summary threads (and the shared-state worker once it has started), each idle with queued 0 and activeRuns 0. |
| A session worker CPU-bound for minutes on one request | daemon.status answers within the s3 bound; that thread shows busy: true with the method and an elapsedMs that grows across calls; reachability stays 'running'. |
| A session worker idle between requests but owning a running detached workflow run | busy: false, activeRuns: 1 (from the board's runs with that ownerThreadId), so it is visibly working and not a release candidate. |
| The unattributed or shared-state worker serving several requests at once | busy: true; method and elapsedMs are those of the oldest request in flight; queued 0 (they keep no FIFO). |
| A session with requests waiting in its FIFO behind a long one | Its worker shows busy with the long request's method, and queued equals the FIFO length. |
| A stream cancelled by its socket while its worker still drains it | It stays in the view until its lifetime completes (the s3 end rule), then leaves it. |
| No connection-scoped request during the daemon's life | buildHandlerRuntime is never called on the main thread; shutdown skips stopping understanding routes that were never built. |

**Invariants to preserve**

- Every existing daemon.status and daemon.debug-status field keeps its value and meaning; only additive fields are added (k5). [[c4]]
- createShutdown's two timelines and its locks-lost branch (no store close, end through endAfterStoreFailure) are unchanged; closeStores still awaits maintenance.stop, sessionPool.close and supervisor.terminateAll before closing the stores. [[c4]]
- A worker's exit still fails its in-flight requests (Supervisor: "the daemon's <class> thread stopped while serving <method>; retry"; session pool: 'session worker failed: ...'), reclaims its locks and permits, then disconnects it. [[c3]]
- Connection-scoped requests (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS) keep running on the main thread through the local forward, with today's behaviour. [[c2]]
- With daemon.threads.enabled false, the main thread builds the handler runtime at boot and serves every request as today. [[c1]]
- daemon.status is answered by the admin worker from the board without calling into a busy thread. [[c4]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test); daemon-level tests spawn src/daemon/index.ts under a temp HOME with INSRC_MODE=mcp and INSRC_TEST_HOOKS=1, as src/daemon/threads/__tests__/s3-acceptance.test.ts does`

**Test levels**

- **unit** — The router's per-thread in-flight view and its publishes, the thread-view builder, the supervisor's track and restart counter, and the session pool's onCreated/restarted hooks, over fakes.
  - Subjects: `Router thread view: attach publishes idle; send marks busy with method and since; reply, stream done/error frame, cancelled-stream lifetime end and detach end it; the oldest in-flight request names method/since; queued equals the session FIFO length; no publish after detach`, `createAdminStatus thread view: role, cls, session, busy, method, elapsedMs = now - since, queued, activeRuns from the board's running runs per owner, document-summary busy from the summary lane`, `Supervisor.track: a tracked worker is terminated by terminateAll and its error is logged; the restart counter refuses past 5 in 60 s`, `SessionPool with onCreated and restarted: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError`
  - Fixtures: `The in-thread fake-worker harness of src/daemon/threads/__tests__/router-session.test.ts (MessageChannel ports served with serveRequests) with a recording board`, `The fake worker starter of src/daemon/threads/__tests__/session-pool.test.ts`
- **integration** — The threaded daemon over its socket: the main thread's handler runtime is not built until a connection-scoped request; the threads section and liveness under load; failure and replacement of each worker class; shutdown unchanged.
  - Subjects: `Main thread loads no handler runtime: with threads enabled, after routed admin/indexing/session requests a test hook reports the main thread never called buildHandlerRuntime; a connection-scoped request is still answered as today and builds it then`, `daemon.status threads section lists admin, code-indexing, document-summary, shared-state and two session threads with role, class and session`, `A session worker spinning its CPU (test.spin) shows busy with method test.spin and growing elapsedMs on successive daemon.status calls answered within 100 ms; reachability is 'running'`, `Worker failure of each class (admin, code-indexing, document-summary, session, shared-state): its in-flight request gets an error, it disappears from threads, a replacement (or the next session request's new worker) appears, other threads keep answering`, `Shutdown (SIGTERM and daemon.shutdown) exits 0 after 'bye' with session-pool workers terminated by the supervisor; the locks-lost path still ends without a store close`, `daemon.status and daemon.debug-status keep every existing field with today's values (recorded comparison) and only add threads`
  - Fixtures: `Temp HOME with a config enabling daemon.threads and a short session idle timeout, as in s3-acceptance.test.ts`, `INSRC_TEST_HOOKS test methods: test.spin, test.order with exitAfterMs, test.exit, plus a new test hook reporting whether the main thread built its handler runtime`, `The existing shutdown unit tests' injectable end deps for the locks-lost branch (src/daemon/shutdown.ts)`
- **contract** — The IPC response shapes stay compatible for existing consumers.
  - Subjects: `DaemonStatus and the debug-status result: every field present in the single-thread daemon's response is present with the same value type and meaning; threads is optional and absent with threads disabled`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: with threads enabled, routed admin, indexing and session requests leave the main thread's handler runtime unbuilt (test hook), and a connection-scoped request is answered as today and builds it on first use`, `unit: the router's local forward builds the runtime once on the first local request, answers a build failure with its error and builds again on the next` |
| `ac2` | `integration: an admin, code-indexing, document-summary, session and shared-state worker each exits mid-request; that request gets an error, the thread leaves the threads section, a replacement or new worker appears and other threads keep answering`, `unit: Supervisor.track terminates tracked session-pool workers at terminateAll and the shared-state restart counter refuses past the limit` |
| `ac3` | `integration: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated before the stores close`, `unit: createShutdown's locks-lost branch still skips closeStores and ends through endAfterStoreFailure (existing shutdown tests, unchanged)` |
| `ac4` | `integration: daemon.status threads lists admin, code-indexing, document-summary, shared-state and two session threads with role, class, session, busy, method and elapsedMs`, `unit: the router's thread view marks busy/method/since per request and queued from the FIFO; the admin thread view computes elapsedMs and activeRuns` |
| `ac5` | `integration: with a session worker spinning for the test's duration, daemon.status answers within 100 ms at p99 over repeated calls, lists that thread busy with growing elapsedMs, and IpcClient.reachability returns 'running'` |
| `ac6` | `contract: daemon.status and daemon.debug-status from the threaded daemon contain every field of the single-thread daemon's response with the same value types and meaning; threads is the only added field`, `integration: daemon.debug-status clients keep today's shape including lastMethod` |

## 7. Migration

**State before:** With daemon.threads.enabled, the main thread builds the full handler runtime at boot (buildHandlerRuntime called from main in src/daemon/index.ts) and serves the router's local forward with it; supervision is split between Supervisor (admin, code-indexing, document-summary) and SessionPool (session, unattributed, shared-state workers started with startWorker directly, closed by pool.close before supervisor.terminateAll); daemon.status and daemon.debug-status carry no thread information and the status board's ThreadStatus slot has no publisher (s1 bundles c1, c3, c4).

**State after:** With daemon.threads.enabled, the main thread builds the handler runtime only on its first local (connection-scoped or unclassified) request; the router publishes every worker thread's in-flight view on the board; daemon.status and daemon.debug-status add an optional `threads` list; session-pool workers are tracked by the Supervisor and the shared-state worker's restarts count against its limit. With the flag off, nothing changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the optional ThreadStatus.role field (sc4 additive amendment) and the optional DaemonStatus.threads / debug-status threads fields; no consumer reads them yet. — ↩ rollbackable
2. Give the Router an optional board and roleOf; when present it keeps the per-thread in-flight view and publishes on attach, send, end and detach. Wire it in index.ts only when threads are enabled. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
3. Build the thread view in the admin worker from the board snapshot and answer it in daemon.status and daemon.debug-status. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
4. Add Supervisor.track and the restart-counter query; pass the session pool onCreated (track) and restarted (shared-state restart limit) from startSessionRouting. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
5. Move buildHandlerRuntime, the in-daemon client and installStepDaemonClient behind a one-time builder the router's local forward awaits when threads are enabled; keep the boot-time build when they are disabled; guard the shutdown's understandingRoutes.stop on the runtime having been built. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_

**Backward compat:** IPC is unchanged for existing clients (k5): daemon.status and daemon.debug-status only gain optional fields (threads), absent with daemon threads disabled; every existing field keeps its value and meaning, so the TUI, daemon-ctl.sh status, IpcClient.reachability and the JetBrains/VS Code plugins see no change unless they read the new field. The sc4 ThreadStatus change is an optional field add. With daemon.threads.enabled false the boot path, handler runtime and supervision are exactly as today.

## 8. Alternatives considered

### 8.1 a1: Router-observed thread view, lazily loaded connection runtime, supervisor-tracked session workers — **CHOSEN**

The router publishes each worker's in-flight request view on the board; the main thread builds its handler runtime only on the first connection-scoped request; session-pool workers are created through the Supervisor's tracking so every class is supervised in one place.

Thread view: the router already sees every request it sends to a worker thread and every terminal reply, frame or cancel. It keeps, per worker thread, the requests in flight (method, since) and publishes a ThreadStatus (sc4, unchanged shape) through board.publish on each send and end: busy = any request in flight, method and since of the oldest, queued from the session FIFO length. Workers it does not route requests to (the document-summary worker) publish their lane state as today, and the threads view marks them from the board's lane slot. Registration and exit come from the target registry and the supervisor/pool exit paths (board.forget on exit). The admin worker adds an additive `threads` array to daemon.status and daemon.debug-status from board.snapshot().threads plus the pool's per-session info (session, createdAt, lastRequestAt, activeRuns) that the main thread publishes in the same ThreadStatus. Because the view is built on the main thread from what was sent, a worker spinning its CPU still shows busy with its method and elapsed time, and daemon.status (answered by the admin worker, s3 ac7 < 100 ms) keeps answering, so liveness = 'running' with the busy session listed. Main thread: buildHandlerRuntime is no longer called at boot when threads are enabled; the router's local forward builds it on the first request that must stay local (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS, a main-owned run's abort), so ac1 holds for every other request and the runtime is never loaded unless connection sessions are used. Supervision: SessionPool starts its workers through a Supervisor hook (track created worker, log its error, include it in terminateAll) while keeping s3's on-demand replacement (the session's next request starts a new worker) and its failure messages; the shared-state worker gets the supervisor's restart limit.

### 8.2 a2: Worker-published thread status

Each worker's serveRequests publishes busy/idle with method and since on every request start and end; the admin worker reads it for daemon.status.

serveRequests (src/daemon/threads/worker-requests.ts) wraps each forward with board.publish({ threadId, cls, session, busy: true, method, since }) at start and busy: false at end, through the worker's StatusBoardClient. The admin worker renders the `threads` section from the board. Main-thread handler runtime and supervision changes as in a1.

**Rejected because:** Same coverage as a1 on paper but fails ac5 in exactly the case it exists for: a CPU-bound worker cannot publish, and a crashed worker leaves a stale busy record.

### 8.3 a3: Full controller: connection-scoped requests also leave the main thread

Deliver ac1 literally by moving connection-session ownership (or a proxy of its trusted context) onto workers, so the main thread loads no handler runtime at all.

Make the trusted connection context crossable: either proxy abort signals, assert closures, registerDrain and the connection session's overlay lookups back to the main thread, or move connection-session ownership (temporary connections, credentials and private DuckDB) onto the session's worker. Then drop buildHandlerRuntime from the main thread entirely. Thread view and supervision as in a1.

**Rejected because:** Only alternative that meets ac1 literally, but it redesigns Epic 484fcef7's connection-session ownership outside s4's boundary and against the user's explicit deferral; it belongs to the logged follow-up, not s4.

### 8.4 a4: Status section only

Add the router-observed `threads` section and liveness reporting, and leave the main thread's eager handler runtime and the two supervision paths as they are.

The thread view and the additive daemon.status / debug-status fields of a1, with no change to boot or supervision; ac1 and ac2's unified supervision are documented as not delivered.

**Rejected because:** Delivers the visibility half (ac4-ac6) cheaply but leaves ac1 unaddressed and ac2's unified supervision undone, so the Story would not be complete.

## 9. References

- **[[c1]]** `code` `src/daemon/index.ts:451` — "const { rpcHandlers, streamHandlers, understandingRoutes } = buildHandlerRuntime({"
- **[[c2]]** `code` `src/daemon/threads/router.ts:213` — "if (request.trustedContext?.connectionSession !== undefined || request.trustedContext?.connectionExecution?.mode === 'session-memory'"
- **[[c3]]** `code` `src/daemon/threads/supervisor.ts:138` — "const error = `the daemon's ${thread} thread stopped while serving ${r.method}; retry`;"
- **[[c4]]** `code` `src/daemon/admin-handlers.ts:111` — "'daemon.debug-status': async (): Promise<{ clients: AttachedClient[] }> => ({ clients: [...await deps.clients()] }),"
- **[[c5]]** `code` `src/daemon/threads/__tests__/s3-acceptance.test.ts:221` — "test('ac7: daemon.status answers within 100 ms at p99 of 200 calls while a session worker spins'"
- **[[c6]]** `code` `src/daemon/threads/status-board.ts:92` — "publish(status: ThreadStatus): void { this.threads.set(status.threadId, status); }"
- **[[c7]]** `code` `src/daemon/shutdown.ts:79` — "if (health.state === 'locks-lost') endAfterStoreFailure(reason, health, deps);"
- **[[c8]]** `code` `src/shared/ipc-client.ts:153` — "return 'running';"
- **[[c9]]** `code` `src/daemon/threads/session-routing.ts:28` — "start: (name, opts) => startWorker(services, name, 'session-worker', opts?.shared ? { workerData: { shared: true }, transferList: [] } : undefined),"

## 10. Open questions

- ac1 scope (sbdry3 partial, needs a user decision): the HLD says the main thread loads no handler runtime and runs no request handler. Connection-scoped requests (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS) cannot cross a worker channel until plans/connection-session-worker-crossing.md lands, which the user deferred until Epic 484fcef7 and Story 34798d20 complete. The chosen design (a1) builds the main thread's handler runtime lazily on the first such request, so ac1 holds for every other request. Options: (A) accept ac1 scoped this way now and close the gap in the follow-up [recommended]; (B) hold s4 until the follow-up is done.

## Resolved questions

- `q1e5c7d26` — ac1 scope (sbdry3 partial, needs a user decision): the HLD says the main thread loads no handler runtime and runs no request handler. Connection-scoped requests (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS) cannot cross a worker channel until plans/connection-session-worker-crossing.md lands, which the user deferred until Epic 484fcef7 and Story 34798d20 complete. The chosen design (a1) builds the main thread's handler runtime lazily on the first such request, so ac1 holds for every other request. Options: (A) accept ac1 scoped this way now and close the gap in the follow-up [recommended]; (B) hold s4 until the follow-up is done.
  - **resolved**: (A) accept ac1 scoped this way now and close the gap in the follow-up — User decision 2026-10-29: connection-scoped requests stay on the main thread (lazily built runtime) until plans/connection-session-worker-crossing.md lands after Epic 484fcef7 and Story 34798d20. _(2026-10-29T07:28:25.378Z)_

## Citations

- **[[c1]]** `code` `src/daemon/index.ts:451` — "const { rpcHandlers, streamHandlers, understandingRoutes } = buildHandlerRuntime({"
- **[[c2]]** `code` `src/daemon/threads/router.ts:213` — "if (request.trustedContext?.connectionSession !== undefined || request.trustedContext?.connectionExecution?.mode === 'session-memory'"
- **[[c3]]** `code` `src/daemon/threads/supervisor.ts:138` — "const error = `the daemon's ${thread} thread stopped while serving ${r.method}; retry`;"
- **[[c4]]** `code` `src/daemon/admin-handlers.ts:111` — "'daemon.debug-status': async (): Promise<{ clients: AttachedClient[] }> => ({ clients: [...await deps.clients()] }),"
- **[[c5]]** `code` `src/daemon/threads/__tests__/s3-acceptance.test.ts:221` — "test('ac7: daemon.status answers within 100 ms at p99 of 200 calls while a session worker spins'"
- **[[c6]]** `code` `src/daemon/threads/status-board.ts:92` — "publish(status: ThreadStatus): void { this.threads.set(status.threadId, status); }"
- **[[c7]]** `code` `src/daemon/shutdown.ts:79` — "if (health.state === 'locks-lost') endAfterStoreFailure(reason, health, deps);"
- **[[c8]]** `code` `src/shared/ipc-client.ts:153` — "return 'running';"
- **[[c9]]** `code` `src/daemon/threads/session-routing.ts:28` — "start: (name, opts) => startWorker(services, name, 'session-worker', opts?.shared ? { workerData: { shared: true }, transferList: [] } : undefined),"
