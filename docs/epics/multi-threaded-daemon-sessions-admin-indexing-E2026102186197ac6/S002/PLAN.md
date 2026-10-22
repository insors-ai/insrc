<!-- insrc:artifact PLAN-86197ac660732ceb-s2 -->

# Plan: E2026102286197ac6:S002

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**LLD run:** `wf-1792614936633-6l9mmk`
**LLD effective hash:** `b93e76739a25...`

Building s2 turns the single-threaded daemon into a router with three workers: an admin worker that answers status and the TUI's reads from a shared status board, a code-indexing worker that owns the whole index queue, the watcher and every indexing method, and a document-summary worker that runs summaries only while code indexing is idle. The work starts with mechanical seams that change no behaviour (the handler runtime as a function, the method-class table, the server's forward seam, the contract amendments), then brings up each worker behind daemon.threads.enabled, adds one supervisor that recovers a crashed worker and releases its locks, and finishes with idle maintenance compaction under the daemon.maintenance lock. Session methods stay on the main thread until s3; every response stays wire-identical, and threads are switched on by default only after the end-to-end and smoke checks pass.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Handler runtime function | L | — | unit: the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | [[c14]] [[c17]] |
| 2 | **`t2`** Frozen method-class table (sc5) and its coverage test | M | `t1` | unit: classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique; unit: coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry; unit: the method-class module loads on a worker without importing a handler module | [[c1]] |
| 3 | **`t3`** IpcServer forward seam and directDispatch | M | — | integration: new IpcServer(directDispatch(rpc, stream)) is wire-identical to today, including unknown method, invalid JSON, stream framing and the stream-to-unary fallback; integration: the registry hook fires on connect, close and each message before the request is forwarded; integration: existing server, dispatch, update, understanding, step and MCP suites and the store-child suites pass with servers built through directDispatch | [[c2]] |
| 4 | **`t4`** Shared-contract amendments: publishLane, optional completeness, underHold, maintenance status field | S | — | unit: publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today; unit: a repo row without completeness is published unchanged; underHold and maintenance are absent by default | [[c4]] [[c5]] [[c11]] |
| 5 | **`t5`** compactGraphStore pre-rename hook | S | — | unit: compactGraphStore with a beforeRename hook that returns false: no rename, no lock-file removal, the compacted copy is removed and the original store reopens with its data; unit: compactGraphStore with a hook returning true or no hook returns today's CompactResult | [[c8]] |
| 6 | **`t6`** Async takeEdit in the document-summary sweep | S | — | unit: runDocSummarySweep with an async takeEdit: a queued edit runs before the next document, and a summary never starts while code work is queued (no await between the final checks and summarise) | [[c7]] |
| 7 | **`t7`** IndexQueue: shared indexing block, lane publishing, pause/resume, remote summary processor | M | `t4` | unit: the code-busy and stopping words track the index lane and stop(); unit: pause() resolves once no job is in flight and no job starts until resume(); unit: every lane change publishes the lane's depth and processing, and lane order and the summary yield are unchanged | [[c6]] |
| 8 | **`t8`** Main-thread thread services and the worker request entry | M | `t4` | integration: a worker started with the request entry answers a request, relays stream frames, aborts on cancel and names an uncloneable reply; integration: a worker started before the embedding bootstrap settles embeds with the decided backend after the push; unit: daemon.threads.enabled is a config schema key defaulting to off and daemon.info returns its four fields | [[c10]] [[c17]] |
| 9 | **`t9`** Router forward | M | `t2`, `t3`, `t8` | unit: maintenance lock at the router: a target missing for 30 s answers the not-available error, and one registering within 30 s serves the held request; integration: an admin or indexing request reaches its registered target and a session request runs on the main thread; integration: a socket closed during a unary request on a worker: the handler completes (its side effect is visible) and no reply is written; during a stream request the stream's AbortSignal fires; integration: debug-status called right after other requests reports each client's lastMethod exactly as today, including 'daemon.debug-status' for the caller itself | [[c2]] [[c3]] |
| 10 | **`t10`** Admin worker and admin module | L | `t9` | integration: each admin-class method runs on the admin worker's thread id; integration: recorded responses of daemon.status, daemon.debug-status, repo.list, config.show, config.catalog, guide.list and guide.get equal the single-thread daemon's; integration: repo.list and daemon.status before the first publish return today's list read from the store; a repo whose completeness read fails has no completeness field; integration: daemon.status answers with storeFailure when store health is locks-lost | [[c5]] [[c17]] |
| 11 | **`t11`** Code-indexing worker | L | `t1`, `t7`, `t9` | integration: each indexing-class method runs on the code-indexing worker's thread id; integration: a file change is indexed while a session request spins the main thread; integration: recorded responses of repo.stats and daemon.compact equal the single-thread daemon's | [[c6]] [[c17]] |
| 12 | **`t12`** Main-thread indexing port and routed in-daemon client | M | `t11` | integration: codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result; integration: a nested in-daemon call from a step handler to repo.reindex runs on the code-indexing worker; integration: daemon.status queue fields reflect the code-indexing worker's real lanes | [[c5]] [[c11]] [[c12]] |
| 13 | **`t13`** Document-summary worker | M | `t6`, `t11` | integration: with the queue's two lanes on two threads, a summary starts only while the index lane is idle, and the order of jobs and the indexed and summarised results equal the single-thread queue for the same input; integration: waitForIndexIdle on the summary worker reflects the code-indexing worker's real state | [[c6]] [[c7]] |
| 14 | **`t14`** Extensible worker supervisor and shutdown with workers | L | `t10`, `t12`, `t13` | integration: admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving; integration: a sixth restart within 60 s shuts the daemon down; integration: a dead worker's store-guard permits and named locks are reclaimed before its replacement starts; smoke: SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged | [[c9]] [[c15]] |
| 15 | **`t15`** Daemon maintenance lock at every entry point | L | `t9`, `t11`, `t12` | unit: maintenance lock at the router: with the lock held exclusively by maintenance, a request other than daemon.status is refused with the activity, reason and start time and does not run; daemon.status is answered; integration: a step handler's nested in-daemon call under a request's shared hold runs without re-requesting the maintenance lock; integration: an exclusive maintenance request that becomes pending while a session request's nested call to repo.reindex is running on the code-indexing worker: the nested call completes, the outer request finishes, then maintenance proceeds; integration: a prune-timer write scheduled to fire during compaction waits for the maintenance lock and lands in the compacted store; getGraphStore called on a worker during compaction rejects with MaintenanceInProgress; integration: an open understanding.watch stream does not prevent idle detection or maintenance; its refresh during maintenance is skipped and the next one after maintenance is delivered | [[c2]] [[c13]] |
| 16 | **`t16`** Maintenance controller and daemon.compact through it | L | `t5`, `t14`, `t15` | unit: maintenance idle detection with a fake clock: admin requests do not reset idle; a non-admin request or a busy lane does; unit: reclaimable estimate: pages in use summed over every named database against the file size; the 25% and 256 MB thresholds both required; integration: maintenance: with idle forced and the threshold met, requests sent during compaction are refused with the maintenance activity and reason, a running request finishes first, daemon.status reports compacting, every row is kept and the file shrank; integration: manual daemon.compact returns today's CompactResult when idle and today's busy refusal while the queue has work, and does not wait on a hold of its own; integration: a request that keeps running past the pause limit makes maintenance abandon without closing anything, and requests are accepted again afterwards; integration: the pre-rename check returns false when a worker has not acknowledged 'graph.close': no rename, no lock-file removal, the original store reopens and serves; integration: after maintenance, writes from the main thread and from each worker land in the compacted file and the process's LMDB lock is still held; integration: after every worker's closeGraphStore and the main thread's close, the native environment is really gone: a fresh open in-process sees a new environment; integration: daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down; unit: the idle time, both thresholds and the pause limit are config schema keys with the design's defaults | [[c5]] [[c8]] [[c13]] [[c15]] |
| 17 | **`t17`** End-to-end validation, smoke and enabling threads by default | M | `t16` | integration: daemon.status, repo.list, debug-status, config.show, config.catalog and guide.list answer within 100 ms (p99 over 50 calls) while an indexing pass runs and another worker keeps an LMDB write transaction open; integration: a session request on the main thread is answered while an indexing pass runs; integration: existing status, shutdown, repo-stats, queue and MCP suites pass unchanged in meaning with threads enabled; smoke: scripts/daemon-ctl.sh start, then status prints the daemon status; stop leaves no pid file, socket or worker behind | [[c16]] [[c17]] |

### 1.1 E2026102286197ac6:S002:T001 — Handler runtime function

Move the construction of rpcHandlers/streamHandlers (src/daemon/index.ts:507-1999, including the makeUpdateHandlers spread and the understanding-route merge), the registries and validations out of main() into a runtime function that takes its indexing dependencies (queue, indexer, watcher, or a port with the same surface) and returns the tables. main() still calls it on the main thread with the real IndexQueue/IndexerService/Watcher, so behaviour is byte-identical. Handler bodies are unchanged.

**Acceptance checks:**
- main() builds its tables only through the runtime function and every existing daemon, MCP and step suite passes unchanged
- The runtime function can be called in a test with stub indexing dependencies without starting a daemon, a socket or the indexer
- The key sets of the returned rpc and stream tables equal those main() built before the change (recorded once and compared in a test)

### 1.2 E2026102286197ac6:S002:T002 — Frozen method-class table (sc5) and its coverage test

Add src/daemon/threads/method-class.ts: a frozen {method, cls, stream} table importing no handler module, with classOf and entries. Ten admin methods (daemon.status, daemon.debug-status, daemon.shutdown, daemon.update, daemon.updateOutcome, repo.list, config.show, config.catalog, guide.list, guide.get), ten indexing methods (repo.add, repo.remove, repo.reindex, repo.stats, index.file, config.enqueue, config.reindex, daemon.compact, daemon.backup, docSummary.restoreFromBackup), every other served method session. A coverage test builds the tables through t1's runtime function and fails on any missing or stale entry.

**Acceptance checks:**
- classOf returns the declared class for the ten admin and ten indexing methods and session for the rest; undefined for an unserved method
- entries() equals the keys of the constructed rpcHandlers and streamHandlers after all merges, with the stream flag right, and the test fails on a missing or a stale entry
- The module loads on a worker without importing any handler module

### 1.3 E2026102286197ac6:S002:T003 — IpcServer forward seam and directDispatch

Give IpcServer the constructor (forward, now?, socketPath?) from the LLD: framing, the attached-client registry and today's reply writing stay; dispatch moves behind forward(request, deliver) => cancel. Add directDispatch(rpc, stream), an in-thread forward with today's rules (unknown method, stream-to-unary fallback, failureMessage, abort on cancel, late unary reply dropped on close). Add a registry-change hook so the router can republish clients on connect, close and every message before forwarding. Switch src/daemon/index.ts and the eight test/helper construction sites (including src/db/graph/__tests__/helpers/store-child.ts) to directDispatch.

**Acceptance checks:**
- new IpcServer(directDispatch(rpc, stream)) is wire-identical to today: {id,result}|{id,error}, 'unknown method: X', 'invalid JSON' with id -1, stream framing and the stream-to-unary fallback
- Closing the socket cancels a stream request's AbortSignal and only drops a unary request's late reply
- The registry hook fires on connect, close and after each message updates lastMethod/label/pid, before the request is forwarded
- server-registry, store-failure-dispatch, understanding-rpc, update-handlers, step-host, forward-step, mcp-process-e2e and the store-child suites pass unchanged

### 1.4 E2026102286197ac6:S002:T004 — Shared-contract amendments: publishLane, optional completeness, underHold, maintenance status field

Add StatusBoard.publishLane(lane, status, sweep?) with its hub op and StatusBoardClient method (board keeps both lanes, derives idle as both empty and not processing); make RepoStatusSnapshot.completeness optional (src/daemon/threads/status-board.ts:40); add the optional underHold flag to sc3's RequestEnvelope (src/daemon/threads/channel.ts); add the optional maintenance field {state:'compacting', since, activity, reason} to DaemonStatus.

**Acceptance checks:**
- publishLane from two publishers merges both lanes; idle is true only when both lanes are at depth 0 and not processing; queueDepth and QueueLanes map as composeQueueLanes does today
- A repo row without completeness is accepted and published unchanged
- underHold and maintenance are optional and absent by default; existing board, channel and status suites pass

### 1.5 E2026102286197ac6:S002:T005 — compactGraphStore pre-rename hook

Add the optional beforeRename hook to compactGraphStore between the close and the rename (src/db/graph/store.ts:855-886). When it resolves false the compacted copy is removed, the original store reopens and the call rejects with LmdbStoreError('compact: the environment was still open; nothing renamed'), never touching graph.lmdb or its lock file. Without the hook behaviour is unchanged.

**Acceptance checks:**
- With a hook returning false: no rename, no lock-file removal, the copy is removed and the original store reopens with its data
- With a hook returning true or no hook: today's CompactResult and file swap
- Existing compaction tests pass

### 1.6 E2026102286197ac6:S002:T006 — Async takeEdit in the document-summary sweep

Make DocSummarySweepDeps.takeEdit return a Promise (src/indexer/doc-summary-sweep.ts:33) and await it in runDocSummarySweep (:79), keeping no await between the final shouldStop/isCodeIdle checks and summarise (:89-91); update IndexerService's sweep deps (src/indexer/index.ts:957) and the two sweep test files.

**Acceptance checks:**
- A queued edit still runs before the next document
- A summary never starts while code work is queued: the final checks run after the last await and immediately before summarise
- doc-summary-sweep.test.ts and summary-sweep-progress.test.ts pass with the async hook

### 1.7 E2026102286197ac6:S002:T007 — IndexQueue: shared indexing block, lane publishing, pause/resume, remote summary processor

IndexQueue (src/daemon/queue.ts) writes a code-busy word (index lane in flight or queued) and a stopping word in an indexing shared block on every change, publishes each lane with publishLane, gains pause(): Promise<void> / resume() that stop both lanes taking new jobs and resolve once none is in flight, and accepts a processor that hands summary-lane jobs elsewhere. Lane order, the summary yield and stop/drain are unchanged.

**Acceptance checks:**
- The code-busy and stopping words track the index lane and stop() exactly
- pause() resolves only once no job is in flight and no new job starts until resume()
- Lane order and the summary yield equal today's (queue lane suites pass unchanged)
- Every lane change publishes that lane's depth and processing

### 1.8 E2026102286197ac6:S002:T008 — Main-thread thread services and the worker request entry

Behind daemon.threads.enabled (a config schema key, default off until t17) the main thread creates the guard block, the lock block (installLockManager), the hub serving the board, step-state, store-health and target-registry services, a daemon.info hub op ({startedAt, modelState, installedCommit, lmdbFileSizeMb, maintenance?}) and an 'embedder.backend' push after bootstrapEmbeddingModel decides. A generic worker request entry, used by every s2 worker, dispatches RequestEnvelopes to the worker's tables with today's dispatch rules, relays frames, honours CancelEnvelope, answers a DataCloneError with a named error, and exposes a test hook reporting the serving thread id. With the flag off nothing is created and the daemon is single-threaded as today.

**Acceptance checks:**
- daemon.threads.enabled is a config schema key (catalog and reconcile) defaulting to off; flag off leaves behaviour and every existing suite unchanged
- A worker started with the entry answers a RequestEnvelope with a reply in today's result/error shape, relays stream frames and aborts on a CancelEnvelope
- A reply that cannot be cloned is answered with 'the result of <method> could not be returned: ...'
- daemon.info returns startedAt, modelState, installedCommit and lmdbFileSizeMb
- A worker started before the embedding bootstrap settles embeds with the decided backend after the push

### 1.9 E2026102286197ac6:S002:T009 — Router forward

The router's forward function for IpcServer: classify with classOf; admin and indexing requests go as RequestEnvelopes to their registered target and their replies and frames are relayed in today's wire shape; session requests run in-thread through the runtime tables; a socket close sends a CancelEnvelope for a stream and drops a unary request's late reply; a missing target holds the request up to 30 s, then answers {error: "the daemon's <class> thread is not available"}; the attached-client registry is republished to the board (publishClients) on every registry change before the request is forwarded.

**Acceptance checks:**
- An admin or indexing request reaches its registered target and its reply is written in today's wire shape; a session request runs on the main thread
- A target missing for 30 s answers the not-available error; a target that registers within 30 s serves the held request
- A stream's socket close aborts the worker's handler; a unary close drops the late reply and the handler's side effect is still visible
- debug-status data on the board reflects the caller's own lastMethod before its request is forwarded

### 1.10 E2026102286197ac6:S002:T010 — Admin worker and admin module

An admin worker (startDaemonWorker, registered as the admin target) runs a small admin module: daemon.status via buildDaemonStatus with sources from the board (repos/completeness/unattributed from the store slot; queueDepth and QueueLanes from the two lanes and sweep), daemon.info and the shared health word; it waits at most 5 s for the first store publish, then reads the registry from the store as today. daemon.debug-status returns snapshot().clients; repo.list from the board (same fallback); config.show, config.catalog, guide.list and guide.get as today; daemon.shutdown and daemon.update reach shutdown through a router hub op.

**Acceptance checks:**
- Each admin method's response equals the single-thread daemon's recorded response for the same fixture state (volatile fields by type)
- debug-status reports each client's lastMethod as today, including 'daemon.debug-status' for the caller
- Before the first publish repo.list and daemon.status return today's list read from the store; a repo whose completeness read fails has no completeness field
- With store health locks-lost daemon.status answers with storeFailure as today
- Each admin method runs on the admin worker's thread id

### 1.11 E2026102286197ac6:S002:T011 — Code-indexing worker

A code-indexing worker hosts IndexQueue (both lanes), Watcher and IndexerService as main() does today, built through t1's runtime with the real indexing objects, serves every indexing-class method, publishes the index lane and the store slot (repos with completeness, unattributed count with reasons) after every change, and answers internal port requests (enqueue, codeIndexWorkFor, depthForRepo, addRepo, removeRepo, takeDocSummaryEdit).

**Acceptance checks:**
- Every indexing-class method runs on the code-indexing worker's thread id; none runs on the main thread
- A file change is indexed while a session request spins the main thread
- The store slot is published after every registry change and before the queue starts
- repo.stats and daemon.compact responses equal today's for the same fixture state

### 1.12 E2026102286197ac6:S002:T012 — Main-thread indexing port and routed in-daemon client

On the main thread the runtime gets an indexing port in place of the local queue/indexer/watcher: depth, laneStatus and summarySweepProgress read the board synchronously; enqueue, codeIndexWorkFor (now async for codeReview.freshness), depthForRepo and addRepo/removeRepo are internal requests to the code-indexing worker. createInDaemonClient gains a route function so a nested call to an admin or indexing method goes through the router to its worker, carrying underHold when made under a maintenance hold; session methods run in-process as today.

**Acceptance checks:**
- codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result
- A step handler's nested repo.reindex runs on the code-indexing worker and returns its reply
- daemon.status queue fields reflect the code-indexing worker's real lanes
- No indexing object is constructed on the main thread with the flag on

### 1.13 E2026102286197ac6:S002:T013 — Document-summary worker

A document-summary worker runs the summary jobs the summary lane hands it: IndexerService's summary paths over a queue view whose isIndexIdle/isStopping read the shared words, whose waitForIndexIdle waits on the code-busy word, and whose takeDocSummaryEdit is a request to the code-indexing worker; the sweep's progress is published with publishLane('summary', ..., sweep). The code-indexing worker's summary-lane processor sends each job to it and resolves when it reports done or failed. Adds the stub-summariser fixture used to compare single-thread and two-thread runs without a model.

**Acceptance checks:**
- With the stub summariser, a summary starts only while the index lane is idle, and job order and summarised results equal the single-thread queue for the same input
- waitForIndexIdle on the summary worker reflects the code-indexing worker's real state
- Shutdown stops the sweep between documents as today

### 1.14 E2026102286197ac6:S002:T014 — Extensible worker supervisor and shutdown with workers

One supervisor on the main thread, built so s4 can register the session workers with it: every started worker is registered with the lock framework's watchWorker; on a worker's exit it runs StoreGuard.reclaim, unregisters the target, fails that worker's in-flight requests with "the daemon's <class> thread stopped while serving <method>; retry", and starts a replacement (requests wait for it up to 30 s); restarts are limited to 5 in 60 s, past which it logs fatal and runs shutdown. A dead summary worker makes the code-indexing worker's remote processor reject that job; a dead code-indexing worker makes the summary worker abandon its job, and the new code-indexing worker restarts from the persisted registry. Shutdown: stopBackgroundWork stops each worker, queueDone settles on the code-indexing worker's drain or exit, closeStores closes the stores on the main thread after the workers exit; the locks-lost branch is unchanged.

**Acceptance checks:**
- Killing the admin, code-indexing and summary workers in turn: in-flight requests error, each worker is replaced, other threads keep serving
- A sixth restart within 60 s logs fatal and shuts the daemon down
- A dead worker's store-guard permits and named locks are reclaimed before its replacement starts
- SIGTERM during an indexing pass: workers stop, the queue drains, the stores close after the workers exit, 'bye' is logged; locks-lost still skips drain and close

### 1.15 E2026102286197ac6:S002:T015 — Daemon maintenance lock at every entry point

Every top-level request except daemon.status and daemon.compact takes 'daemon.maintenance' shared with ifAvailable at its entry (the router for main-thread session work, the worker request entry otherwise) and holds it until it finishes; when refused it is answered {error: "daemon busy: <activity> since <time> (<reason>); retry later"} from the holder's metadata and nothing runs. Nested in-daemon calls and underHold cross-class requests do not request it again. The prune and todo-retention timers, the watcher path and every indexing job take it shared with a bounded wait; understanding.watch and todos.subscribe take it per refresh with ifAvailable and skip during maintenance; getGraphStore on any thread other than the compactor rejects with MaintenanceInProgress while maintenance compacts.

**Acceptance checks:**
- With the lock held exclusively, a request other than daemon.status and daemon.compact is refused at once with the activity, reason and start time and does not run; daemon.status answers
- A nested call under a request's hold runs without re-requesting the lock
- A timer write due during maintenance waits and lands after it; an indexing job waits rather than fails
- An open understanding.watch stream neither holds the lock nor blocks it; a refresh during maintenance is skipped and the next is delivered
- getGraphStore on a non-compacting thread rejects with MaintenanceInProgress during compaction

### 1.16 E2026102286197ac6:S002:T016 — Maintenance controller and daemon.compact through it

On the main thread: idle detection (no non-admin request arriving or in flight for idleMs, default 30 min, and both lanes idle; admin polls do not count), the reclaimable estimate (file size minus pages in use from getStats over every named database) with both thresholds (25% and 256 MB), the exclusive request on 'daemon.maintenance' with metadata {activity:'compaction', reason} and the pause limit (10 min); the idle time, thresholds and pause limit are config schema keys with these defaults. Once granted, 'graph.close' to every live worker and their acknowledgements, compactGraphStore with a beforeRename check built from the acknowledgements, then release. Each decision is logged. daemon.compact on the code-indexing worker keeps today's busy refusal and otherwise asks the main thread to run maintenance now, returning its CompactResult (or the not-idle-in-time error); daemon.status reports maintenance from LockManager.query. Maintenance never starts unless store health is ok; a shutdown during maintenance waits for it or the hard-exit backstop.

**Acceptance checks:**
- With idle forced and the threshold met, requests are refused during compaction, a running request finishes first, daemon.status reports compacting, every row written before is present after, and the file shrank
- Admin polls do not reset idle; below either threshold no maintenance runs
- A request running past the pause limit makes maintenance abandon without closing anything, and requests are accepted again
- A worker that did not acknowledge graph.close makes the pre-rename check fail: no rename, the store reopens and serves
- Manual daemon.compact returns today's CompactResult when idle and today's busy refusal while the queue has work
- After maintenance, writes from every thread land in the compacted file and the process's LMDB lock is still held
- The idle time, both thresholds and the pause limit are config schema keys with the design's defaults

### 1.17 E2026102286197ac6:S002:T017 — End-to-end validation, smoke and enabling threads by default

Run the Story's cross-cutting proof with the real router and workers on a temporary HOME and socket: admin reads within 100 ms (p99 over 50) during an indexing pass with another worker holding an LMDB write transaction; a session request answered during an indexing pass; the contract suites unchanged in meaning; the daemon-ctl smoke (start, status, stop leaves no pid file, socket or worker). Then default daemon.threads.enabled on.

**Acceptance checks:**
- The p99 latency, isolation and contract tests pass with the flag on
- daemon-ctl start/status/stop works with no worker left behind
- daemon.threads.enabled defaults on and the full suite passes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique | `t2` |
| coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `t2` |
| publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today | `t4` |
| maintenance idle detection with a fake clock: admin requests do not reset idle; a non-admin request or a busy lane does | `t16` |
| reclaimable estimate: pages in use summed over every named database against the file size; the 25% and 256 MB thresholds both required | `t16` |
| maintenance lock at the router: with the lock held exclusively by maintenance, a request other than daemon.status is refused with the activity, reason and start time and does not run; daemon.status is answered; a target missing for 30 s answers the not-available error | `t9`, `t15` |
| runDocSummarySweep with an async takeEdit: a queued edit runs before the next document, and a summary never starts while code work is queued (no await between the final checks and summarise) | `t6` |
| compactGraphStore with a beforeRename hook that returns false: no rename, no lock-file removal, the compacted copy is removed and the original store reopens with its data | `t5` |
| each admin-class method runs on the admin worker's thread id and each indexing-class method on the code-indexing worker's thread id | `t10`, `t11` |
| daemon.status, repo.list, debug-status, config.show, config.catalog and guide.list answer within 100 ms (p99 over 50 calls) while an indexing pass runs over a fixture repo and another worker keeps an LMDB write transaction open | `t17` |
| a session request on the main thread is answered while an indexing pass runs; a file change is indexed while a session request spins the main thread | `t11`, `t17` |
| with the queue's two lanes on two threads, a summary starts only while the index lane is idle, and the order of jobs and the indexed and summarised results equal the single-thread queue for the same input | `t13` |
| queue status from daemon.status and waitForIndexIdle on the summary worker reflect the code-indexing worker's real state | `t12`, `t13` |
| codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result | `t12` |
| a nested in-daemon call from a step handler to repo.reindex runs on the code-indexing worker | `t12` |
| maintenance: with idle forced and the threshold met, a session request and an admin read sent during compaction are refused with the maintenance activity and reason, a request already running finishes before compaction starts, daemon.status answers during it with maintenance compacting, every row written before compaction is present after it, and the file shrank | `t16` |
| manual daemon.compact returns today's CompactResult when idle and today's busy refusal while the queue has work | `t16` |
| a request that keeps running past the pause limit makes maintenance abandon without closing anything, and requests are accepted again afterwards | `t16` |
| admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving | `t14` |
| a worker started before the embedding bootstrap settles embeds with the decided backend after the push | `t8` |
| maintenance with a worker that has not closed its graph handle: compaction is abandoned before any rename, and the store is untouched | `t16` |
| after maintenance, writes from the main thread and from each worker land in the compacted file and the process's LMDB lock is still held (lock probe as in worker-thread-lock.test.ts) | `t16` |
| a socket closed during a unary request on a worker: the handler completes (its side effect is visible) and no reply is written; during a stream request the stream's AbortSignal fires | `t9` |
| a step handler's nested in-daemon call under a request's shared hold runs without re-requesting the maintenance lock; manual daemon.compact does not wait on a hold of its own | `t15`, `t16` |
| daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down | `t16` |
| an exclusive maintenance request that becomes pending while a session request's nested call to repo.reindex is running on the code-indexing worker: the nested call completes, the outer request finishes, then maintenance proceeds | `t15` |
| the pre-rename check returns false when a worker has not acknowledged 'graph.close': no rename, no lock-file removal, the original store reopens and serves | `t16` |
| a prune-timer write scheduled to fire during compaction waits for the maintenance lock and lands in the compacted store; getGraphStore called on a worker during compaction rejects with MaintenanceInProgress | `t15` |
| an open understanding.watch stream does not prevent idle detection or maintenance; its refresh during maintenance is skipped and the next one after maintenance is delivered | `t15` |
| after every worker's closeGraphStore and the main thread's close, the native environment is really gone: a fresh open in-process sees a new environment (test before relying on it for the rename) | `t16` |
| recorded responses: daemon.status, daemon.debug-status, repo.list, config.show, config.catalog, guide.list, guide.get, repo.stats and daemon.compact from the threaded daemon equal the single-thread daemon's for the same fixture state (volatile fields compared by type; maintenance absent when not compacting) | `t10`, `t11` |
| existing suites pass unchanged in meaning: server-registry, daemon-status-field, daemon-status-lanes, status-store-failure, shutdown-store-failure, store-failure-dispatch, repo-stats, repo-stats-handler-contract, update-handlers, understanding-rpc, queue lanes, step-host, forward-step and mcp-process-e2e (servers built with directDispatch where they build their own tables) | `t3`, `t17` |
| debug-status called right after other requests reports each client's lastMethod exactly as today, including 'daemon.debug-status' for the caller itself | `t9` |
| repo.list and daemon.status before the first publish (publication withheld) return today's list read from the store; a repo whose completeness read fails has no completeness field, as today | `t10` |
| the store suites that spawn src/db/graph/__tests__/helpers/store-child.ts pass unchanged with its server built through directDispatch | `t3` |
| scripts/daemon-ctl.sh start, then status prints the daemon status; stop leaves no pid file, socket or worker behind | `t17` |
| SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged | `t14` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails.api MethodClassRegistry.classOf and MethodClassRegistry.entries`
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails.api IpcServer`
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails.api TargetRegistry.targetFor`
- **[[c4]]** `prior-artifact` `LLD s2 contractDetails.api StatusBoard.publishLane and dataModelChanges RepoStatusSnapshot.completeness`
- **[[c5]]** `prior-artifact` `LLD s2 contractDetails.api buildDaemonStatus and dataModelChanges Router daemon.info hub op and maintenance state`
- **[[c6]]** `prior-artifact` `LLD s2 contractDetails.api IndexQueue.start and dataModelChanges Indexing shared block`
- **[[c7]]** `prior-artifact` `LLD s2 contractDetails.api IndexerService.processJob and dataModelChanges DocSummarySweepDeps.takeEdit`
- **[[c8]]** `prior-artifact` `LLD s2 contractDetails.api compactGraphStore and dataModelChanges compactGraphStore pre-rename hook`
- **[[c9]]** `prior-artifact` `LLD s2 contractDetails.api createShutdown`
- **[[c10]]** `prior-artifact` `LLD s2 contractDetails.api startDaemonWorker`
- **[[c11]]** `prior-artifact` `LLD s2 contractDetails.api createInDaemonClient and dataModelChanges RequestEnvelope.underHold`
- **[[c12]]** `prior-artifact` `LLD s2 dataModelChanges Main-thread indexing port`
- **[[c13]]** `prior-artifact` `LLD s2 dataModelChanges Maintenance controller`
- **[[c14]]** `prior-artifact` `LLD s2 dataModelChanges Handler runtime construction`
- **[[c15]]** `prior-artifact` `LLD s2 errorPaths`
- **[[c16]]** `prior-artifact` `LLD s2 testStrategy`
- **[[c17]]** `prior-artifact` `LLD s2 migration`
