<!-- insrc:artifact PLAN-86197ac660732ceb-s4 -->

# Plan: E2026102986197ac6:S004

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**LLD run:** `wf-1793257999487-zc3lem`
**LLD effective hash:** `cea66c896837...`

Building s4 adds one optional field to the status board's thread record and an optional threads list to the status answers, then three independent pieces: the router records what each worker thread is serving and publishes it, the admin worker turns that into the threads list, and the session pool's workers come under the supervisor (with the shared-state worker's restart limit). Separately, the main thread's handler runtime moves behind a one-time builder used only by requests that must stay local. Two daemon-level test tasks then prove the six acceptance criteria against the real threaded daemon, including a parity check against a threads-disabled daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** ThreadStatus.role and the thread-view types | S | — | unit: board: a ThreadStatus published with a role keeps it in the snapshot, and one without a role is unchanged | [[c1]] [[c3]] |
| 2 | **`t2`** Router-published thread view | M | `t1` | unit: router thread view: attach publishes idle with the registry's role; a request marks busy with its method and since; its reply marks idle; unit: router thread view: the oldest in-flight request names method and since; a stream is busy until its done or error frame, a cancelled stream until its lifetime completes; unit: router thread view: a session worker's queued equals its FIFO length; detach forgets the thread and nothing re-adds it | [[c2]] [[c7]] |
| 3 | **`t3`** Thread view in daemon.status and daemon.debug-status | M | `t1` | unit: admin status: threads carries role, cls, session, busy, method, elapsedMs, queued and activeRuns from one board snapshot; other fields unchanged; absent when no thread is published; unit: admin status: activeRuns counts only that thread's running runs, and the document-summary thread is busy while the summary lane processes; unit: admin handlers: daemon.debug-status keeps clients as before and adds threads | [[c1]] [[c4]] |
| 4 | **`t4`** Session-pool workers under the supervisor; document-summary thread published | M | `t1` | unit: supervisor: a tracked worker is terminated by terminateAll and its error is logged; unit: supervisor: the restart query refuses past 5 restarts in 60 s and runs the daemon's shutdown; unit: session pool: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError; integration: session failure: session workers are still recreated on demand with s3's failure messages under supervisor tracking | [[c5]] [[c7]] |
| 5 | **`t5`** Main thread builds its handler runtime only on its first local request | M | — | unit: lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again; unit: lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build | [[c6]] [[c7]] [[c9]] |
| 6 | **`t6`** Integration acceptance ac1-ac3: main thread, worker failure, shutdown | M | `t4`, `t5` | integration: s4 ac1: routed requests leave the main thread's handler runtime unbuilt; a connection-scoped request is answered and builds it; integration: s4 ac2: a worker of each class exits mid-request; that request fails, the thread leaves threads and is replaced while others answer; integration: s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated | [[c8]] |
| 7 | **`t7`** Integration acceptance ac4-ac6: thread list, liveness, field parity | M | `t2`, `t3`, `t4` | integration: s4 ac4: daemon.status threads lists the admin, code-indexing, document-summary, shared-state and two session threads with role, class and session; integration: s4 ac5: with a session worker spinning, daemon.status answers within 100 ms at p99, shows it busy with growing elapsedMs, and reachability is running; integration: s4 ac6: daemon.status and debug-status keep every field of a threads-disabled daemon with the same types; threads is the only addition | [[c8]] |

### 1.1 E2026102986197ac6:S004:T001 — ThreadStatus.role and the thread-view types

Add the optional ThreadStatus.role (sc4 additive amendment AMD-86197ac660732ceb-2) and the ThreadRole union to the status board, and the optional DaemonStatus.threads with the ThreadView shape (threadId, role, cls, session, busy, method, elapsedMs, queued, activeRuns) to the shared types. Types only; no producer or consumer yet.

**Acceptance checks:**
- ThreadStatus accepts an optional role of 'admin' | 'code-indexing' | 'document-summary' | 'session' | 'unattributed' | 'shared-state'; existing ThreadStatus values still type-check.
- DaemonStatus has an optional threads?: ThreadView[]; every existing field is unchanged.

### 1.2 E2026102986197ac6:S004:T002 — Router-published thread view

Give the Router optional board (publish/forget) and roleOf options. It keeps, per attached worker thread, its in-flight requests (requestId -> method, since) and publishes ThreadStatus { threadId, cls, role, session, busy, method, since, queued } on attach (idle), on each send, and when a request ends (reply, stream done/error frame, a cancelled stream's lifetime end, or detach); detach forgets the thread; nothing is published for a thread no longer attached. queued is the session FIFO length for a session worker. Wire it in index.ts with the board and a roleOf derived from the target registry, only when threads are enabled.

**Acceptance checks:**
- Attaching a worker publishes it idle with its role; sending a request publishes busy with that method and since; its reply publishes idle again.
- Roles come from the target registry: the admin worker 'admin', the code-indexing worker 'code-indexing', a session worker 'session' with its session, the unattributed worker 'unattributed', the shared-state worker 'shared-state'.
- With two requests in flight on one thread, method and since are the oldest's; when it ends, the other's.
- A stream is busy until its done/error frame; a cancelled stream with a lifetime stays busy until the lifetime completes.
- A session worker's queued equals its FIFO length.
- Detach forgets the thread and no later publish re-adds it.
- Without a board option the router behaves exactly as before.

### 1.3 E2026102986197ac6:S004:T003 — Thread view in daemon.status and daemon.debug-status

The admin worker builds ThreadView[] from one board snapshot: each published ThreadStatus with elapsedMs = now - since while busy, activeRuns = the board's running runs owned by that thread, and the document-summary thread's busy from the summary lane. daemon.status adds threads (only when the board lists threads, so it is absent with daemon threads disabled); daemon.debug-status answers { clients, threads } with clients unchanged.

**Acceptance checks:**
- daemon.status from a board with published threads carries threads with role, cls, session, busy, method, elapsedMs, queued and activeRuns; every other field equals the answer without threads.
- activeRuns counts only running runs whose ownerThreadId is that thread.
- The document-summary thread is busy exactly while the summary lane is processing.
- daemon.debug-status keeps clients exactly as before and adds threads.
- No threads field when no thread is published (daemon threads disabled).

### 1.4 E2026102986197ac6:S004:T004 — Session-pool workers under the supervisor; document-summary thread published

Add Supervisor.track(worker, name) (joins created, logs its error, ended by terminateAll) and a restart query that counts against the supervisor's limit (5 in 60 s; past it the daemon shuts down). SessionPool gains onCreated (hands each created worker to track) and restarted (asked before restarting the shared-state worker after an exit; false refuses the start with SessionWorkerStartError). startSessionRouting passes both. The supervisor's started hook publishes the document-summary worker idle with role 'document-summary' and its exit forgets it.

**Acceptance checks:**
- Every session, unattributed and shared-state worker the pool creates is in the supervisor's created set and is terminated by terminateAll.
- Past 5 shared-state restarts in 60 s the next start is refused with SessionWorkerStartError and the daemon's shutdown runs with 'the shared-state worker exceeded the restart limit'.
- Session workers are still replaced on demand as in s3 (the next request starts a new one), with s3's failure messages.
- The document-summary worker appears on the board with role 'document-summary' once started and is forgotten when it exits.

### 1.5 E2026102986197ac6:S004:T005 — Main thread builds its handler runtime only on its first local request

With daemon threads enabled, move buildHandlerRuntime, the in-daemon client and installStepDaemonClient behind a one-time builder that the router's local forward awaits on the first request that must stay on the main thread (trusted connectionSession, session-memory execution, MAIN_DAEMON_CONNECTION_METHODS, an unclassified method, a main-owned run's abort). A build failure answers that request with its error and the next local request builds again. The build logs 'handler runtime built on the main thread'. Shutdown stops the understanding routes only if the runtime was built. With threads disabled the runtime is built at boot as today.

**Acceptance checks:**
- With threads enabled, routed admin, indexing and session requests do not build the main thread's handler runtime.
- The first connection-scoped request builds it once and is answered as today; later local requests reuse it.
- A connection-scoped request whose handler makes a nested in-daemon call is answered as today after the lazy build (the in-daemon client moves with the runtime).
- A failing build answers that request with its error and the next local request tries again.
- Shutdown with the runtime never built completes as today.
- With threads disabled the boot path is unchanged.

### 1.6 E2026102986197ac6:S004:T006 — Integration acceptance ac1-ac3: main thread, worker failure, shutdown

Daemon-level tests over the socket (spawned under a temp HOME with daemon.threads.enabled and INSRC_TEST_HOOKS=1): ac1 routed admin, indexing and session requests leave the main thread's runtime unbuilt (no 'handler runtime built on the main thread' log line) and a connection-scoped request is still answered and builds it; ac2 an admin, code-indexing, document-summary, session and shared-state worker each exits mid-request, that request gets an error, the thread leaves the threads section and a replacement (or the next session request's new worker) appears while other threads keep answering; ac3 SIGTERM and daemon.shutdown end with 'bye' and exit 0 with every worker, session-pool workers included, terminated before the stores close.

**Acceptance checks:**
- ac1, ac2 and ac3 each have a passing daemon-level test as described.
- The tests wait on conditions (log lines, thread entries) rather than fixed sleeps and pass repeatedly.

### 1.7 E2026102986197ac6:S004:T007 — Integration acceptance ac4-ac6: thread list, liveness, field parity

Daemon-level tests: ac4 daemon.status threads lists admin, code-indexing, document-summary, shared-state and two session threads with role, class and session; ac5 with a session worker spinning (test.spin) for the test's duration, daemon.status answers within 100 ms at p99, lists that thread busy with method test.spin and growing elapsedMs, and IpcClient.reachability returns 'running'; ac6 daemon.status and daemon.debug-status from the threaded daemon carry every field of a threads-disabled daemon's responses with the same value types, threads being the only addition, and debug-status clients keep lastMethod.

**Acceptance checks:**
- ac4, ac5 and ac6 each have a passing daemon-level test as described.
- The parity test boots a second daemon with daemon.threads.enabled false and compares field sets and value types.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Router thread view: attach publishes idle; send marks busy with method and since; reply, stream done/error frame, cancelled-stream lifetime end and detach end it; the oldest in-flight request names method/since; queued equals the session FIFO length; no publish after detach | `t2` |
| createAdminStatus thread view: role, cls, session, busy, method, elapsedMs = now - since, queued, activeRuns from the board's running runs per owner, document-summary busy from the summary lane | `t3` |
| Supervisor.track: a tracked worker is terminated by terminateAll and its error is logged; the restart counter refuses past 5 in 60 s | `t4` |
| SessionPool with onCreated and restarted: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError | `t4` |
| Main thread loads no handler runtime: with threads enabled, after routed admin/indexing/session requests a test hook reports the main thread never called buildHandlerRuntime; a connection-scoped request is still answered as today and builds it then | `t5`, `t6` |
| daemon.status threads section lists admin, code-indexing, document-summary, shared-state and two session threads with role, class and session | `t7` |
| A session worker spinning its CPU (test.spin) shows busy with method test.spin and growing elapsedMs on successive daemon.status calls answered within 100 ms; reachability is 'running' | `t7` |
| Worker failure of each class (admin, code-indexing, document-summary, session, shared-state): its in-flight request gets an error, it disappears from threads, a replacement (or the next session request's new worker) appears, other threads keep answering | `t4`, `t6` |
| Shutdown (SIGTERM and daemon.shutdown) exits 0 after 'bye' with session-pool workers terminated by the supervisor; the locks-lost path still ends without a store close | `t6` |
| daemon.status and daemon.debug-status keep every existing field with today's values (recorded comparison) and only add threads | `t3`, `t7` |
| DaemonStatus and the debug-status result: every field present in the single-thread daemon's response is present with the same value type and meaning; threads is optional and absent with threads disabled | `t1`, `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api DaemonStatus (threads?: ThreadView[]) and dataModelChanges DaemonStatus / debug-status result`
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api Router (board, roleOf; per-thread in-flight view)`
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.hld.amendmentProposal sc4 ThreadStatus.role (AMD-86197ac660732ceb-2) and dataModelChanges ThreadStatus`
- **[[c4]]** `prior-artifact` `LLD s4 contractDetails.api createAdminStatus and adminWorkerHandlers (threads view, debug-status threads)`
- **[[c5]]** `prior-artifact` `LLD s4 contractDetails.api Supervisor.track and SessionPool onCreated/restarted`
- **[[c6]]** `prior-artifact` `LLD s4 contractDetails.api buildHandlerRuntime (built lazily on the first local request)`
- **[[c7]]** `prior-artifact` `LLD s4 errorPaths (lazy build failure, worker exit mid-request, shared-state crash loop, late publish after detach)`
- **[[c8]]** `prior-artifact` `LLD s4 testStrategy (acceptanceMapping ac1-ac6, integration and contract levels)`
- **[[c9]]** `prior-artifact` `LLD s4 migration (threads-disabled path unchanged; rollbackable steps)`
