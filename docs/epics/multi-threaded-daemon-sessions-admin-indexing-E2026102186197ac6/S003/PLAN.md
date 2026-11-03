<!-- insrc:artifact PLAN-86197ac660732ceb-s3 -->

# Plan: E2026102886197ac6:S003

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**LLD run:** `wf-1793162175819-ezajul`
**LLD effective hash:** `b93e76739a25...`

Building s3 means adding the session pool and two new kinds of worker (per-session and shared-state) beside the s2 workers, teaching the router to route session-class requests with a per-session queue, and moving detached workflow runs onto the status board. The small contract changes come first (registry slot, method sets, board runs, per-method nested-call routing), then the worker entries and the pool, then routing, failure handling and boot wiring, and last the acceptance tests over a running threaded daemon.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Registry shared-state slot and Router.request shared option | S | — | unit: registry: a shared target and an unattributed target register together without TargetConflictError and each lookup resolves to its own worker; unit: router: Router.request with shared reaches the shared-state target and is held while none is registered | [[c3]] [[c4]] |
| 2 | **`t2`** Shared-state and FIFO-exempt method sets | S | — | unit: method sets: every shared-state and FIFO-exempt member is a session-class method; unit: method sets: every served chat.*, todos.* and understanding.* method is in the shared-state set | [[c8]] [[c9]] |
| 3 | **`t3`** Detached runs on the status board: publishRun, forgetRun, poll from the board | M | — | integration: workflow run registry: poll from the board returns frames since cursor, model, result and error; unknown after forgetRun; integration: board: forgetRun hub binding removes a run published from a worker; ownerThreadId is the publishing thread; unit: workflow run registry: with threads disabled start/poll/abort answer as today | [[c5]] |
| 4 | **`t4`** Per-method in-daemon route and the session purge's nested calls | M | `t1`, `t2` | unit: in-daemon route: targetOf sends admin/indexing to their workers, shared-state methods to the shared-state target (inline on it), others inline; integration: purge: session.delete on a session worker drops the chat from the shared-state pool and its todos cleanup events reach an open todos.subscribe; unit: purge: chat.dropSession over the socket answers unknown method; threads off purges as today | [[c4]] [[c6]] [[c7]] |
| 5 | **`t5`** Session worker entry | M | `t4` | integration: session worker: starts, reports ready and serves a session method with today's response under the maintenance request hold; integration: session worker: a nested session-class call runs inline on the worker thread | [[c6]] |
| 6 | **`t6`** Shared-state worker entry | M | `t5` | integration: shared-state worker: chat.list, todos.listForSession and understanding.* run on its thread; the main thread starts no chat pool, understanding service or retention timer | [[c6]] [[c8]] |
| 7 | **`t7`** Session pool (sc6) with the unattributed worker | L | `t1`, `t5` | unit: session pool: concurrent workerFor calls for one session start one worker; unit: session pool: idle and pid-gone release at the sweep; never a worker with an active run or a request in flight; unit: session pool: start failure answers waiting requests with SessionWorkerStartError and the next request retries; unit: session pool: the unattributed worker starts once under session:unattributed; sessionIdleMs default 900000 from config | [[c1]] [[c10]] [[c12]] |
| 8 | **`t8`** Router session routing and per-session FIFO | L | `t2`, `t6`, `t7` | unit: router: one session's three requests reach its worker in arrival order; a stream ends at its done/error frame; unit: router: FIFO-exempt methods are forwarded during a long request; a cancelled queued request is removed; unit: router: connection-scoped requests stay local; unattributed requests interleave without a FIFO | [[c2]] [[c9]] |
| 9 | **`t9`** Worker failure containment and detached-run ownership | M | `t3`, `t8` | integration: failure: a session worker exit fails only its running and queued requests; the next request gets a new worker; integration: runs: workflow.run.abort from another session reaches the owner; an owner exit makes polls return error with the named reason; integration: shared-state worker exit ends an open todos.subscribe with an error frame and the next chat.list starts a new one | [[c5]] [[c10]] |
| 10 | **`t10`** Boot wiring behind daemon.threads.enabled | M | `t9` | smoke: boot: threads enabled serves a session method from a session worker over the socket, and SIGTERM drains and exits 0; smoke: boot: threads disabled runs every session method on the main thread as today | [[c12]] |
| 11 | **`t11`** Integration acceptance tests ac1-ac6 | L | `t10` | integration: ac1: session B is answered on its own thread while session A's worker spins; integration: ac2/ac3: one session over two connections runs in order on one worker thread, released after idle; integration: ac4: a session worker failure is contained; a throwing handler keeps its worker; unit: ac5: no Promise.all over provider calls in the new modules; integration: ac5: a recording provider shows a session method's provider calls strictly sequential; integration: ac6: a token of each step kind resumes on a new worker after an idle release | [[c11]] |
| 12 | **`t12`** Liveness smoke (ac7) and response parity for moved methods | M | `t10` | smoke: ac7: daemon.status answers within 100 ms at p99 of 200 calls while a session worker spins; integration: parity: moved session methods answer over the socket as the single-thread daemon does | [[c11]] |

### 1.1 E2026102886197ac6:S003:T001 — Registry shared-state slot and Router.request shared option

Add the additive ThreadTarget.shared field; the registry's slot function keys a shared target 'session:shared' before its unattributed and per-session cases; targetFor gains opts.shared; Router.request gains opts.shared to send a session-class call to the shared-state target (held while it is unavailable, never in a FIFO).

**Acceptance checks:**
- A shared target and an unattributed target register at the same time without TargetConflictError, and each lookup resolves to its own worker.
- targetFor('session', undefined) still resolves to the unattributed target; only targetFor('session', undefined, { shared: true }) resolves to the shared-state target.
- Router.request('session', m, p, { shared: true }) reaches the shared-state worker and is held while none is registered.

### 1.2 E2026102886197ac6:S003:T002 — Shared-state and FIFO-exempt method sets

Declare, beside the method-class table, the shared-state set (chat.*, todos.* including todos.subscribe, understanding.* including understanding.watch) and the FIFO-exempt set (understanding.watch, todos.subscribe, chat.cancel, chat.inject, chat.redirect, chat.status, workflow.run.poll, workflow.run.abort).

**Acceptance checks:**
- Every member of both sets is a session-class method in the method-class registry.
- Every served chat.*, todos.* and understanding.* method is in the shared-state set (a test enumerates the handler tables).

### 1.3 E2026102886197ac6:S003:T003 — Detached runs on the status board: publishRun, forgetRun, poll from the board

Add the additive sc4 forgetRun with its hub op and client; the workflow run registry mirrors each run (frames, status, model, result, error, ownerThreadId, startedAt) with publishRun after every frame and at its end, removes evicted runs with forgetRun, and answers workflow.run.poll from the board snapshot; with threads off the board is local and polls answer the same.

**Acceptance checks:**
- workflow.run.poll answers today's PollResult (frames since cursor, model, result, error) from the board, and 'unknown' after forgetRun.
- A poll served on a different thread than the run's owner returns the same frames and result.
- Each published RunRecord carries the publishing thread's id as ownerThreadId.
- With threads disabled, workflow.run.start/poll/abort behave as today.

### 1.4 E2026102886197ac6:S003:T004 — Per-method in-daemon route and the session purge's nested calls

Replace InDaemonRoute's classOf+routed pair with a per-method targetOf: admin and indexing to their workers as today, shared-state methods to the shared-state target (inline on the shared-state worker itself), other session methods inline. Add the in-daemon-only chat.dropSession (calls dropSessionFromPool; refused from the socket), and make purgeSession's chat drop and todos cleanup nested calls (in-process as today when threads are off).

**Acceptance checks:**
- targetOf returns { cls } for admin/indexing exactly where the old routed set did, { cls: 'session', shared: true } for shared-state methods off the shared-state worker, and undefined otherwise.
- chat.dropSession over the socket answers 'unknown method: chat.dropSession'.
- With threads disabled, session.delete purges as today (same counts).

### 1.5 E2026102886197ac6:S003:T005 — Session worker entry

A session worker script: startDaemonWorker, its own db and ConfigStore, buildHandlerRuntime with the indexing port for queue/indexer and hub-backed shutdown/attachedClients, the per-method in-daemon route, and serveRequests over the handler tables (maintenance request hold per request); test-hook methods (INSRC_TEST_HOOKS=1) to spin the CPU, record start/end order and exit the worker.

**Acceptance checks:**
- A session worker started through startWorker reports ready and serves a session method with today's response.
- A nested session-class call made by a step handler on the worker runs inline on that worker's thread.
- Each request on the worker is served under the maintenance request hold.

### 1.6 E2026102886197ac6:S003:T006 — Shared-state worker entry

A shared-state worker script built like the session worker, which also starts the chat handlers, opens the understanding service and schedules the todos retention timer; the main thread stops starting those three when threads are enabled.

**Acceptance checks:**
- With threads enabled, chat.list, todos.listForSession and understanding.* are served on the shared-state worker's thread, and the main thread starts no chat pool, understanding service or retention timer.
- With threads disabled, the main thread starts all three as today.

### 1.7 E2026102886197ac6:S003:T007 — Session pool (sc6) with the unattributed worker

SessionPool.workerFor (single-flight per session id; registers the worker under 'session:<label>:<pid>', attaches it to the router, watchWorker via startWorker), sessions() and options (idleTimeoutMs from a new config key daemon.threads.sessionIdleMs, default 900000); the unattributed worker is started on first need under 'session:unattributed'; an idle sweep releases a session worker idle for idleTimeoutMs or whose client pid is gone, never one that owns an active detached run or has requests in flight; a start failure answers the session's waiting requests with SessionWorkerStartError.

**Acceptance checks:**
- Concurrent workerFor calls for one session start exactly one worker.
- A worker idle past idleTimeoutMs, or whose client pid has exited, is released at the next sweep and its slot unregistered; one owning a running detached run is not.
- The unattributed worker is started once, under 'session:unattributed', on the first request with no identity.
- A worker that fails to start answers the waiting requests 'session worker could not start: <reason>' and the next request tries again.
- daemon.threads.sessionIdleMs is in the config catalog with default 900000 and is read at start.

### 1.8 E2026102886197ac6:S003:T008 — Router session routing and per-session FIFO

Router.dispatch routes the session class: connection-scoped requests stay local; shared-state methods to the shared-state worker; others to the session's worker through the pool, or to the unattributed worker (no FIFO) without identity. A per-session FIFO sends a non-exempt request only after the previous one ended (reply, terminal frame or cancel); FIFO-exempt methods go at once; a queued request's cancel removes it from the FIFO.

**Acceptance checks:**
- Three requests from one session reach its worker one at a time in arrival order; a stream ends only at its done/error frame.
- chat.cancel and workflow.run.poll from a session are forwarded while its long request runs.
- Requests with a connection session or a MAIN_DAEMON_CONNECTION_METHODS method still run on the main thread.
- Unattributed requests interleave on the unattributed worker (two unattributed requests run at once).
- Cancelling a queued request removes it; the next one in the FIFO is sent when the running one ends.

### 1.9 E2026102886197ac6:S003:T009 — Worker failure containment and detached-run ownership

A session worker's exit fails its running and queued requests with 'session worker failed: <reason>' and unregisters its slot; workflow.run.abort is routed to the run's owner thread from the board; an owner's exit republishes its running runs as 'error' with a named reason; the shared-state worker's exit fails its in-flight requests and open subscriptions with an error frame and it is started again on the next request to its families.

**Acceptance checks:**
- A session worker exit fails exactly that session's running and queued requests; the session's next request runs on a new worker.
- workflow.run.abort sent by any session reaches the run's owner thread and the run ends 'aborted'.
- After an owner's exit, a poll from another session returns status 'error' with 'the session worker running this workflow exited' and the frames so far.
- After the shared-state worker exits, an open todos.subscribe ends with an error frame and the next chat.list starts a new shared-state worker.

### 1.10 E2026102886197ac6:S003:T010 — Boot wiring behind daemon.threads.enabled

When threads are enabled, index.ts creates the session pool and the shared-state worker, adds 'session' to the routed classes, and shuts the session, unattributed and shared-state workers down with the others. With threads disabled nothing changes.

**Acceptance checks:**
- A daemon booted with threads enabled serves a session method from a session worker over the socket, and SIGTERM still drains and exits 0.
- With daemon.threads.enabled false, every session method runs on the main thread as today.

### 1.11 E2026102886197ac6:S003:T011 — Integration acceptance tests ac1-ac6

Integration tests over the threaded daemon for ac1-ac6: cross-session independence, per-session order over two connections, idle release, failure containment, provider calls sequential, step-token resume of each kind after an idle release, and a detached run polled from another session after its owner exits.

**Acceptance checks:**
- ac1: session B is answered while session A's worker spins the CPU, on a different thread.
- ac2/ac3: one session's requests over two connections run in order on one worker thread, released after idle.
- ac4: a session worker exit fails only its requests; other sessions, admin and indexing keep working; the next request gets a new worker.
- ac5: no Promise.all over provider calls in the new modules; a recording provider shows calls strictly sequential.
- ac6: a step token of each kind resumes on a new worker after an idle release with today's token rule.

### 1.12 E2026102886197ac6:S003:T012 — Liveness smoke (ac7) and response parity for moved methods

A boot-level smoke that daemon.status answers within 100 ms at p99 over the socket while a session worker spins the CPU, and recorded-response parity: moved session methods answer over the socket exactly as the single-thread daemon does for the same input.

**Acceptance checks:**
- ac7: 200 daemon.status calls over the socket answer within 100 ms at p99 while a session worker spins, each reporting the daemon's current state.
- For a recorded set of session methods, the threaded daemon's responses equal the single-thread daemon's.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| SessionPool.workerFor | `t7` |
| SessionPool.sessions | `t7` |
| Router.dispatch (session routing and FIFO) | `t8` |
| TargetRegistry.targetFor (shared-state slot) | `t1` |
| shared-state and FIFO-exempt method sets | `t2` |
| session worker entry | `t5`, `t11` |
| shared-state worker entry | `t6`, `t9` |
| workflow run registry with publishRun/forgetRun | `t3`, `t9` |
| StatusBoard.forgetRun hub binding | `t3` |
| createInDaemonClient on a session worker | `t4`, `t5` |
| daemon boot with the session pool | `t10`, `t12` |
| router forwarding over the real socket | `t10`, `t12` |
| method-class table with the shared-state and FIFO-exempt sets | `t2` |
| recorded responses of moved session methods | `t12` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contract SessionPool.workerFor / sessions / options (sc6)`
- **[[c2]]** `prior-artifact` `LLD s3 contract Router.dispatch (session routing and per-session FIFO)`
- **[[c3]]** `prior-artifact` `LLD s3 data model ThreadTarget field-add shared and TargetRegistry.targetFor`
- **[[c4]]** `prior-artifact` `LLD s3 contract Router.request shared option and InDaemonRoute.targetOf`
- **[[c5]]** `prior-artifact` `LLD s3 contract StatusBoard.publishRun / forgetRun and RunRecord publication`
- **[[c6]]** `prior-artifact` `LLD s3 contract createInDaemonClient and buildHandlerRuntime on session and shared-state workers`
- **[[c7]]** `prior-artifact` `LLD s3 contract purgeSession nested calls (chat.dropSession, todos.cleanup)`
- **[[c8]]** `prior-artifact` `LLD s3 data model shared-state method set`
- **[[c9]]** `prior-artifact` `LLD s3 data model Session FIFO and FIFO-exempt methods`
- **[[c10]]** `prior-artifact` `LLD s3 error paths (worker exit, start failure, owner exit, shared-state worker exit)`
- **[[c11]]** `prior-artifact` `LLD s3 test strategy and acceptance mapping ac1-ac7`
- **[[c12]]** `prior-artifact` `LLD s3 migration (config key, boot wiring behind daemon.threads.enabled)`
