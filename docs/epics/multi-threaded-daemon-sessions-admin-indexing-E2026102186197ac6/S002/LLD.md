<!-- insrc:artifact LLD-86197ac660732ceb-s2 -->

# LLD: E2026102186197ac6:S002

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**HLD base run:** `wf-1792588079400-heeqp4`
**HLD effective hash:** `b93e76739a25...`

s2 puts a router in front of every request and moves admin work and indexing work off the main thread. Admin methods (daemon.status, debug-status, repo.list, the TUI's config and guide reads, shutdown and update) run on an admin worker that answers from the status board; code indexing, the file watcher and every indexing method run on a code-indexing worker, and document summaries execute on a document-summary worker that still starts a summary only while code indexing is idle. Session methods keep running on the main thread as today until s3, reaching the indexing workers through a small cross-thread port. Graph compaction becomes idle maintenance: after 30 quiet minutes, when enough space is reclaimable, the daemon holds every request except daemon.status, compacts, and resumes.

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

**Rollout phase:** Phase B — router, admin worker and indexing workers
**Owns:** `sc5` (Method-class registry)
**Consumes:** `sc1` (Store guard and per-store threading policy), `sc3` (Thread channel and target registry), `sc4` (Thread status board)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Verifying each store from several threads of one process (the LMDB graph environment, every Lance table, the in-memory DuckDB pool), including that a worker opening and later releasing its handles does not close a descriptor the process's locks depend on; the semaphore implementation over process-wide shared memory and its holder record; moving the four in-memory step state stores onto the shared step-state store with today's TTL; the status board's attached-client, sweep-progress and run-record slots; the thread channel's serialisation and the target registry's bookkeeping; the status board's hub-served layout on the main thread. As the root Story it owns every cross-cutting contract the other Stories consume. Validation: ac1 — one thread writes a repo's entities while another reads the same graph, the reader sees only whole transactions, and an entity's vectors are written only after its graph commit; ac2 — two threads write different artifacts or config entries and a third thread reads both back; ac3 — no code path outside the daemon opens a store; ac4 — a throwing LMDB transaction on one thread leaves nothing visible to another. Also: a worker opening and releasing its handles keeps the process's LMDB locks; the guard releases on success, throw, cancel and worker kill; an acquisition past its limit fails; nested acquisition is refused. Step-state compatibility: for each of the four kinds, token rotation (analyze, workflow), stable-token update (review) or consume-and-mint per stage (code-review, where a superseded token fails), read refresh of expiry, the 100-entry eviction and a missing-token error behave as today. LMDB is opened once per process and never closed by a worker; lock reclaim waits for a dead worker's in-flight native calls. Per store, a quiescence observation with a time limit and an unhealthy-store outcome when it is exceeded; a guard wait never blocks its thread. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s3`: The session pool, moving every session-class method off the main thread: session-id mapping, per-session FIFO, worker creation and idle release, containment of a failing worker (its in-flight requests fail with an error, the next request gets a new worker), routing each step handler's state through the shared step-state store, the unattributed worker, inline nested calls, and ownership of detached workflow runs (records on the status board, abort routed to the owner, failure on owner exit, never idle-released while a run is active). Validation: ac1 — session B is answered while session A's worker spins; ac2 — A's second request starts only after its first completes; ac3 — requests from one client process over separate connections run on one worker, released after the idle timeout; ac4 — a worker failure fails only its session's requests; ac5 — provider calls stay serial (no Promise.all reaching a provider); ac6 — a step token minted before an idle release resumes on the new worker; ac7 — ping and daemon.status answer within 100 ms while a session worker spins the CPU for minutes. Also: unattributed requests are served apart from sessions; a nested in-daemon call completes without deadlock; a detached run survives idle time, accepts an abort from another thread, and is marked failed when its owner exits; a poll from another thread, and after the owner has gone, returns the same frames-since-cursor, model, result and error as today. The board's forgetRun operation (an additive sc4 method) is added with the detached-run move, called by the run owner's retention. Session workers take part in maintenance compaction's pause. — owns `sc6`
- `s4`: The main thread becomes the controller: it loads no handler runtime and runs no request handler, only the socket, classification, forwarding, worker supervision (admin, both indexing workers, the session pool's workers and the unattributed worker: in-flight requests failed, store locks reclaimed, the worker replaced) and shutdown coordination, including the locks-lost path. It also adds a `threads` section to daemon.status and daemon.debug-status from the status board and session pool (additive fields only) and makes the liveness answer report a busy session as busy rather than as a failure. Validation: ac1 — no request handler runs on the main thread; ac2 — a failing worker of any class fails only its own in-flight requests and is replaced; ac3 — shutdown and the locks-lost path behave as today; ac4 — daemon.status lists each thread with class, session, busy state, method and elapsed time; ac5 — with a session worker busy for minutes the liveness answer reports the daemon alive and the session busy; ac6 — every field of today's daemon.status and daemon.debug-status, including clients and sweep progress, is present with the same meaning.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `MethodClassRegistry.classOf`

```typescript
(method: string) => MethodClass | undefined
```

**Parameters:**
- `method: string` — A JSON-RPC method name, unary or stream.

**Returns:** `MethodClass | undefined` — The method's declared class; undefined for a method the daemon does not serve.

**Preconditions:**
- A frozen table in src/daemon/threads/method-class.ts that imports no handler module, so the main thread and workers can load it.

**Postconditions:**
- Admin class: daemon.status, daemon.debug-status, daemon.shutdown, daemon.update, daemon.updateOutcome, repo.list, config.show, config.catalog, guide.list, guide.get.
- Indexing class: repo.add, repo.remove, repo.reindex, repo.stats, index.file, config.enqueue, config.reindex, daemon.compact, daemon.backup, docSummary.restoreFromBackup.
- Every other served method is session class.

### 2.2 `MethodClassRegistry.entries`

```typescript
() => readonly MethodClassEntry[]
```

**Returns:** `readonly MethodClassEntry[]` — One entry per served method with its class and whether it is a stream method.

**Postconditions:**
- Its method set equals the keys of the runtime rpcHandlers and streamHandlers after every merge (the makeUpdateHandlers spread and the understanding routes) plus nothing else; a test built from the constructed tables fails on any difference.

### 2.3 `IpcServer`

```typescript
class IpcServer { constructor(forward: (request: RequestEnvelope, deliver: (envelope: ReplyEnvelope | FrameEnvelope) => void) => (() => void), now?: () => number, socketPath?: string); listen(): Promise<void>; close(): Promise<void>; attachedClients(): AttachedClient[]; flushPendingWrites(timeoutMs?: number): Promise<boolean>; disconnectClients(): void }
```

**Parameters:**
- `forward: (request: RequestEnvelope, deliver: (envelope: ReplyEnvelope | FrameEnvelope) => void) => (() => void)` — Hands one parsed request (with its requestId and the SessionId from the validated client envelope) to the router; deliver writes each reply or frame to the request's socket in today's wire shape; the returned function is called when the socket closes: for a stream it sends a CancelEnvelope (today's abort), for a unary request it only marks the reply to be dropped.
- `now: () => number` _(optional)_ — Clock for connectedAt.
- `socketPath: string` _(optional)_ — Socket path, PATHS.sockFile by default.

**Returns:** `IpcServer` — The socket server without handler tables: framing, the attached-client registry, today's reply writing.

**Errors:**
- `invalid JSON` when A line that does not parse is answered {id: -1, error: 'invalid JSON'}, as today.

**Preconditions:**
- Construction sites move to a forward function: src/daemon/index.ts:1997 (the router) and the tests and helpers that build a server with their own handler tables (including src/db/graph/__tests__/helpers/store-child.ts:178 and :212), which pass directDispatch(rpcHandlers, streamHandlers), an in-thread forward with today's dispatch rules (unknown method by table lookup, stream-to-unary fallback, failureMessage, abort on cancel).

**Postconditions:**
- new IpcServer(directDispatch(rpc, stream)) behaves on the wire exactly as today's new IpcServer(rpc, stream).
- The registry is republished through StatusBoard.publishClients on connect, on close, and after every message updates it (lastMethod, label, pid), before the request is forwarded, so debug-status reports the caller's own 'daemon.debug-status' as its lastMethod exactly as today.
- Before running any top-level request other than daemon.status and daemon.compact, its entry point (the router for main-thread session work, the worker's request entry otherwise) requests the daemon maintenance lock shared with ifAvailable and holds it until the request finishes; when it is unavailable the request is answered at once {id, error: "daemon busy: <activity> since <time> (<reason>); retry later"} built from the blocking holder's metadata, and nothing runs. Nested in-daemon calls and cross-class channel calls made under that hold do not request it again. daemon.compact is exempt because it triggers maintenance itself; every other method, daemon.shutdown included, is refused during maintenance (a SIGTERM shutdown waits for the compaction or the hard-exit backstop).
- A cross-class request made by a handler that already holds the maintenance lock (a nested in-daemon call routed to another worker) carries underHold: true on its RequestEnvelope, an additive optional field on s1's sc3 envelope delivered by s2; the receiving worker's entry skips the maintenance check for it, so a pending exclusive cannot refuse a request half-way through.

### 2.4 `TargetRegistry.targetFor`

```typescript
(cls: MethodClass, session?: SessionId) => ThreadTarget | undefined
```

**Parameters:**
- `cls: MethodClass` — The class from classOf.
- `session: SessionId` _(optional)_ — Unused in s2: session-class requests are served on the main thread.

**Returns:** `ThreadTarget | undefined` — The admin worker for admin, the code-indexing worker for indexing.

**Preconditions:**
- Consumed from s1 unchanged.

**Postconditions:**
- Router rule in s2: admin and indexing requests go to their registered target; session-class requests are dispatched in-thread on the main thread through the runtime tables, as today. When targetFor returns undefined (the worker is restarting) the router holds the request until the replacement registers, at most 30 s, then answers {error: "the daemon's <class> thread is not available"}.

### 2.5 `StatusBoard.publishLane`

```typescript
(lane: 'index' | 'summary', status: LaneStatus, sweep?: SummarySweepProgress) => void
```

**Parameters:**
- `lane: 'index' | 'summary'` — Which lane the publishing worker owns.
- `status: LaneStatus` — That lane's depth and whether a job is processing.
- `sweep: SummarySweepProgress` _(optional)_ — The running summary sweep's progress, summary lane only.

**Returns:** `void` — The board's lane slot is replaced; IndexingStatus.idle is recomputed as both lanes at depth 0 and not processing.

**Preconditions:**
- Additive sc4 method delivered by s2 with a board.publishLane hub op and a StatusBoardClient method; publishIndexing is unchanged.

**Postconditions:**
- daemon.status's queueDepth is index depth + summary depth and its QueueLanes running flags are each lane's processing, as composeQueueLanes reports today.

### 2.6 `StatusBoard.publishClients`

```typescript
(clients: readonly AttachedClientSnapshot[]) => void
```

**Parameters:**
- `clients: readonly AttachedClientSnapshot[]` — IpcServer.attachedClients() after every registry update: connect, close, and each message that sets lastMethod, label or pid.

**Returns:** `void` — The board's clients slot is replaced.

**Preconditions:**
- Consumed from s1; a local call on the main thread.

**Postconditions:**
- daemon.debug-status on the admin worker returns {clients: snapshot().clients}, equal to today's attachedClients().

### 2.7 `StoreGuard.reclaim`

```typescript
(threadId: number) => Promise<{ readonly released: readonly StoreId[]; readonly unhealthy: readonly StoreId[] }>
```

**Parameters:**
- `threadId: number` — The exited worker's thread id.

**Returns:** `{ released, unhealthy }` — Locks released for the dead worker and stores that did not quiesce within their per-store limit.

**Preconditions:**
- Consumed from s1; called by the router on every worker exit before the replacement starts.

**Postconditions:**
- reclaim logs and marks unhealthy stores itself; the router adds no marking.

### 2.8 `buildDaemonStatus`

```typescript
(src: DaemonStatusSources) => Promise<DaemonStatus>
```

**Parameters:**
- `src: DaemonStatusSources` — On the admin worker: repos with completeness and unattributedUnwritable from the board's store slot; queueDepth and queueLanes from the board's two lanes and sweep; uptime, modelState, installedCommit, lmdbFileSizeMb and the maintenance state from the router's daemon.info hub op; store health from the shared health word.

**Returns:** `Promise<DaemonStatus>` — Today's DaemonStatus, every field and meaning unchanged, plus an additive maintenance field {state: 'compacting', since, activity, reason} while maintenance holds the daemon maintenance lock.

**Preconditions:**
- Reused unchanged from src/daemon/status.ts:61; only its sources change.

**Postconditions:**
- Before the code-indexing worker's first store publish (it publishes the registry before starting its queue), the admin worker waits for it at most 5 s; past that bound it reads the registry from the store itself as today (listRepos with withCompleteness, a direct LMDB read), so repos is never answered empty for want of a publish.
- With store health locks-lost it answers with storeFailure exactly as today.

### 2.9 `IndexQueue.start`

```typescript
(processor: (job: IndexJob) => Promise<void>) => Promise<void>
```

**Parameters:**
- `processor: (job: IndexJob) => Promise<void>` — On the code-indexing worker: IndexerService.processJob for index-lane jobs; for summary-lane jobs, a remote processor that sends the job to the document-summary worker and resolves when that worker reports it finished (or failed).

**Returns:** `Promise<void>` — As today: resolves when stop() has been called and both drain loops ended.

**Preconditions:**
- IndexQueue, both lanes, the summary yield (waitForIndexIdle) and stop/drain stay in src/daemon/queue.ts unchanged and live only on the code-indexing worker.

**Postconditions:**
- Lane ordering and the summary yield are today's: a summary job is handed to the document-summary worker only when the summary lane would have started it today.
- IndexQueue additionally writes two words in a shared block on every change: code-busy (index lane in flight or queued) and stopping; and publishes its lanes with publishLane.
- A pause(): Promise<void> / resume() pair stops both lanes from taking new jobs and resolves once no job is in flight, for maintenance compaction.

### 2.10 `IndexerService.processJob`

```typescript
(job: IndexJob) => Promise<void>
```

**Parameters:**
- `job: IndexJob` — A job; on the document-summary worker only doc-summarise-repo and doc-summarise-entity jobs arrive.

**Returns:** `Promise<void>` — The job's work done, as today.

**Preconditions:**
- On the document-summary worker IndexerService is built over a queue view whose isIndexIdle and isStopping read the shared words, whose waitForIndexIdle waits on the code-busy word, and whose takeDocSummaryEdit is a request to the code-indexing worker; the sweep's progress is published with publishLane('summary', ..., sweep).
- DocSummarySweepDeps.takeEdit (src/indexer/doc-summary-sweep.ts:33) becomes async and runDocSummarySweep awaits it (:79); the guard that matters is unchanged, because the shouldStop and isCodeIdle checks that gate a summary still run after the last await and immediately before summarise (:89-91). src/indexer/__tests__/doc-summary-sweep.test.ts and summary-sweep-progress.test.ts are updated for the async hook.

**Postconditions:**
- docSummariseRepo and docSummariseEntity behave as today, including stopping between documents on shutdown and yielding to code work.

### 2.11 `compactGraphStore`

```typescript
(opts?: { readonly beforeRename?: () => Promise<boolean> }) => Promise<CompactResult>
```

**Parameters:**
- `opts: { readonly beforeRename?: () => Promise<boolean> }` _(optional)_ — A pre-rename check run after the close and before the rename: maintenance passes one that confirms the native environment really closed (no other handle open). When it resolves false, compactGraphStore removes the compacted copy, reopens the original store and rejects with LmdbStoreError('compact: the environment was still open; nothing renamed'), never touching graph.lmdb or its lock file.

**Returns:** `Promise<CompactResult>` — Today's {beforeBytes, afterBytes, savedBytes, elapsedMs}.

**Errors:**
- `LmdbStoreError` when As today (store not open, rename or close failure).

**Preconditions:**
- Called only by the main thread's maintenance while the main thread holds the daemon maintenance lock exclusively (every other request is refused and none is running), after every thread that may hold a graph handle (the admin worker, the code-indexing worker, the document-summary worker and the main thread's own session work) has acknowledged that it has no store work in flight and has closed its handle with closeGraphStore.
- Closing a worker's handle is within s1's contract: s1 verified that a worker's open, use, close and exit keep the process's LMDB locks (src/db/graph/__tests__/worker-thread-lock.test.ts), and the approved HLD's Stores section states a worker closing its handle is safe. lmdb-js shares one native environment per process and closes it only when its last handle closes, so the main thread's close inside compactGraphStore ends the environment only because every other handle is already closed; the rename and lock-file removal therefore never run under a handle that is still open.
- Change site: src/db/graph/store.ts:861-875 gains the optional beforeRename hook between root.close() and renameSync; without the hook (today's callers) behaviour is unchanged.
- The 'environment really closed' check maintenance passes as beforeRename is concrete: every live worker the router supervises has acknowledged a 'graph.close' message only after its own closeGraphStore() resolved (its module instance holds no handle), the main thread's own handle closed inside compactGraphStore, and no worker was started since the acknowledgements were collected; a missing acknowledgement makes the check return false.

**Postconditions:**
- Every thread reopens its handle lazily on next use after resume, onto the compacted file; no write is lost because nothing writes between the copy and the close.

### 2.12 `createShutdown`

```typescript
(parts: ShutdownParts) => (signal: string) => void
```

**Parameters:**
- `parts: ShutdownParts` — stopBackgroundWork tells each worker to stop (the code-indexing worker stops its queue and watcher; the summary worker stops after its current document); queueDone settles when the code-indexing worker reports its drain finished or exits; closeStores flushes and disconnects clients, waits for the workers to exit, then closes the stores on the main thread.

**Returns:** `(signal: string) => void` — Today's re-entrant shutdown.

**Preconditions:**
- The locks-lost branch is unchanged.

**Postconditions:**
- daemon.shutdown and daemon.update served on the admin worker reach shutdown through a router hub op; a shutdown during maintenance waits for the compaction to finish or the hard-exit backstop.

### 2.13 `startDaemonWorker`

```typescript
(init: DaemonWorkerInit) => HubClient
```

**Parameters:**
- `init: DaemonWorkerInit` — Guard block and hub port; the router also passes the decided embedding backend and the indexing shared block in workerData.

**Returns:** `HubClient` — The worker's hub client.

**Errors:**
- `NotADaemonWorkerError` when Called on a main thread.

**Preconditions:**
- Consumed from s1; every s2 worker calls it first.

**Postconditions:**
- Each worker also applies the embedding backend the main thread pushes ('embedder.backend') with setActiveEmbedderBackend.

### 2.14 `createInDaemonClient`

```typescript
(unary: RpcHandlers, stream: StreamHandlers, deps?: InDaemonClientDeps) => StepDaemonClient
```

**Parameters:**
- `unary: RpcHandlers` — The main thread's runtime tables.
- `stream: StreamHandlers` — As above.
- `deps: InDaemonClientDeps` _(optional)_ — Gains a route function: a nested call to a non-session method goes through the router to its class target instead of the local table.

**Returns:** `StepDaemonClient` — The in-daemon client step handlers use.

**Postconditions:**
- A step handler's nested call to an indexing or admin method runs on that method's worker; a session method runs in-process as today.

## 3. Data model changes

### 3.1 `MethodClassEntry table` — new

sc5's frozen {method, cls, stream} rows for every served handler (the rpc table at src/daemon/index.ts:507 with the makeUpdateHandlers spread at :1670, the stream table at :1906, the understanding routes merged at :1994-1995): ten admin, ten indexing, the rest session. repo.stats, daemon.backup and daemon.compact are indexing because they scan or rewrite the whole store and read the queue (src/daemon/repo-stats.ts:122-175).

**Call sites:**
- `src/daemon/index.ts:507-1999`
- `src/daemon/repo-stats.ts:122-175`
- `src/daemon/server.ts:201-300`

### 3.2 `Indexing shared block` — new

A small SharedArrayBuffer created by the router and passed to both indexing workers: a code-busy word (index lane in flight or queued, written by IndexQueue on the code-indexing worker at every lane change) and a stopping word. The document-summary worker reads them for isIndexIdle/isStopping and waits on the code-busy word for waitForIndexIdle, so the summary yield works across threads without a request.

**Call sites:**
- `src/daemon/queue.ts:262-318`
- `src/indexer/index.ts:939-992`

### 3.3 `Main-thread indexing port` — new

The queue/indexer/watcher objects the main thread's handler runtime used (src/daemon/index.ts:533, 575, 826, 844, 1076-1077, 1403, 1571-1577, 1652) are replaced on the main thread by a port: depth, laneStatus and summarySweepProgress read the board (local on main, synchronous); enqueue, codeIndexWorkFor, depthForRepo and addRepo/removeRepo are internal requests to the code-indexing worker over the channel (codeIndexWorkFor becomes async for codeReview.freshness's computeCodeReviewFreshness dependency). Indexing-class handlers never run on the main thread.

**Call sites:**
- `src/daemon/index.ts:533`
- `src/daemon/index.ts:575`
- `src/daemon/index.ts:814-850`
- `src/daemon/index.ts:1060-1088`
- `src/daemon/index.ts:1403`
- `src/daemon/index.ts:1571-1577`
- `src/daemon/index.ts:1647-1664`

### 3.4 `Router daemon.info hub op and maintenance state` — new

A main-thread hub service returning {startedAt, modelState, installedCommit, lmdbFileSizeMb, maintenance?}. bootstrapEmbeddingModel runs once on the main thread (src/daemon/lifecycle.ts:87-109); its decided backend is pushed to every worker ('embedder.backend') because the embedder's activeBackend is per isolate (src/indexer/embedder.ts:85-103). maintenance is {state: 'compacting', since, activity, reason}, read from the maintenance lock's holder metadata (LockManager.query) while the lock is held exclusively; DaemonStatus gains it as an additive optional field.

**Call sites:**
- `src/daemon/index.ts:262`
- `src/daemon/lifecycle.ts:87-109`
- `src/indexer/embedder.ts:85-103`
- `src/daemon/status.ts:61-90`

### 3.5 `Maintenance controller` — new

On the main thread, coordinated through the daemon maintenance lock (lock framework afcfa027, docs/standalone/add-cross-thread-named-lock-framework-E20261022afcfa027/S001/LLD.md). Every request other than daemon.status makes a no-wait shared request (ifAvailable) on the lock 'daemon.maintenance' before it runs, on whichever thread serves it, and holds it until it finishes; indexing jobs take it shared per job and wait (a bounded wait) rather than fail. Idle: no non-admin request has arrived and none is in flight for idleMs (config, default 30 minutes), and the board shows both lanes idle; admin requests (status polls) do not count as activity. Worth it: reclaimable = file size - pages in use * pageSize, pages in use summed from getStats() (branch + leaf + overflow pages) over every named database of the GraphStore (src/db/graph/store.ts:250-312); compaction runs only when reclaimable >= 25% of the file and >= 256 MB (config). Sequence: request the lock exclusively with metadata {activity: 'compaction', reason: '<idle time>, <reclaimable %> / <reclaimable MB> reclaimable'} and timeoutMs = the pause limit (10 minutes, config); by writer preference every new request is refused from that moment with the activity, reason and start time; requests already running finish and release; once granted, tell every live worker to close its graph handle and wait for each acknowledgement; compactGraphStore on the main thread with its pre-rename check; release the lock. Each decision (pause wait, idle time, reclaimable % and bytes, outcome) is logged. Manual daemon.compact on the code-indexing worker keeps today's busy refusal (queue.depth > 0 or processing) and otherwise asks the main thread to run maintenance now and returns its CompactResult; it does not take a shared hold itself, so it cannot block its own maintenance. Non-request store users take the lock too: the prune timer and todo-retention timer on the main thread (src/daemon/index.ts:2014, src/daemon/todos-rpc.ts:1206), the watcher path and every indexing job request it shared with a bounded wait around each run, so none writes during compaction. As a second guard, while maintenance compacts, getGraphStore on any thread other than the compactor rejects with a named MaintenanceInProgress error instead of reopening the store. Long-lived subscription streams (understanding.watch, src/daemon/understanding-rpc.ts:106-113; todos.subscribe) do not hold the lock for their lifetime and do not count as activity for idle detection: each refresh or push takes it shared with ifAvailable and is skipped while maintenance holds it. Bounded streams (workflow.run, codeReview.run, step.call, analyze.run.start, ollama.pull, workflow.review) hold it for their run like any request.

**Call sites:**
- `src/daemon/index.ts:1647-1664`
- `src/daemon/index.ts:2014`
- `src/daemon/todos-rpc.ts:1206`
- `src/daemon/understanding-rpc.ts:106-113`
- `src/db/graph/store.ts:250-312`
- `src/db/graph/store.ts:831-890`

### 3.6 `Handler runtime construction` — invariant-change

The construction of rpcHandlers/streamHandlers, the understanding routes, the registries and validations moves from main() into a runtime function taking its indexing dependencies: the main thread passes the indexing port; the code-indexing worker passes the real IndexQueue/IndexerService/Watcher. Handler bodies are unchanged. The admin worker runs only the admin module.

**Call sites:**
- `src/daemon/index.ts:127-330`
- `src/daemon/index.ts:507-1999`

### 3.7 `DocSummarySweepDeps.takeEdit` — field-modify

takeEdit(): { entityId } | undefined becomes takeEdit(): Promise<{ entityId } | undefined>, because on the document-summary worker the single-document edit jobs live in the code-indexing worker's queue. Today's invariant kept: no await between the final shouldStop/isCodeIdle checks and the summary starting (src/indexer/doc-summary-sweep.ts:89-91).

**Call sites:**
- `src/indexer/doc-summary-sweep.ts:33`
- `src/indexer/doc-summary-sweep.ts:79`
- `src/indexer/index.ts:957`

### 3.8 `RepoStatusSnapshot.completeness` — field-modify

The board's RepoStatusSnapshot (src/daemon/threads/status-board.ts:40) makes completeness optional, as today's withCompleteness leaves it out when the completeness read fails (src/daemon/repo-completeness.ts:30-36), so a published row equals today's row exactly. A loosening of s1's sc4 type, recorded with the HLD's sc4 amendments.

**Call sites:**
- `src/daemon/threads/status-board.ts:40`
- `src/daemon/repo-completeness.ts:30-36`

### 3.9 `compactGraphStore pre-rename hook` — field-add

An optional beforeRename callback in compactGraphStore, run between the close (src/db/graph/store.ts:861) and the rename (:871-875); false aborts without renaming and reopens the original. Callers that pass nothing behave as today.

**Call sites:**
- `src/db/graph/store.ts:855-886`

### 3.10 `RequestEnvelope.underHold` — field-add

Optional boolean on sc3's RequestEnvelope (src/daemon/threads/channel.ts), set by the in-daemon client's router path for a cross-class call made under an outer request's maintenance hold; the receiving worker does not request the maintenance lock for it. Additive amendment to s1's contract, delivered by s2.

**Call sites:**
- `src/daemon/threads/channel.ts`
- `src/daemon/steps/daemon-client.ts:79-91`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | One frozen class table with classOf and entries, loadable on any thread, and a coverage test over the runtime tables after all merges; s3 and s4 consume it. |
| `sc3` | consumes | The router forwards admin and indexing requests as RequestEnvelopes to the registered admin and code-indexing workers, relays reply and frame envelopes, sends a CancelEnvelope on socket close, and uses the same envelopes for internal requests to the code-indexing worker (indexing port) and between the indexing workers (summary job execution). |
| `sc4` | consumes | Router publishes clients; the code-indexing worker publishes the index lane and the store slot (repos with completeness, unattributed count) after every change; the summary worker publishes the summary lane and sweep; the admin worker reads snapshot(). s2 delivers the additive publishLane method and its hub binding. |
| `sc1` | consumes | Every worker starts through startDaemonWorker with the router's guard block; the router reclaims a dead worker's locks before replacing it. |

## 5. Error paths

**Error cases**

- **The admin worker exits (uncaught exception, import failure, out of memory).** (recoverable)
  - Detection: The router's 'exit' listener on the admin Worker fires; its in-flight admin requests are in the router's pending map.
  - Response: reclaim(threadId); unregister; answer each in-flight admin request {id, error: "the daemon's admin thread stopped while serving <method>; retry"}; start a replacement; admin requests arriving meanwhile wait for it (at most 30 s). Restarts are rate-limited (5 in 60 s); past the limit the router logs fatal and runs shutdown. s2 supervises the workers it introduces (admin, code-indexing, document-summary); s4 extends the same supervision to session workers and owns the unified view (HLD boundary note 2026-10-22). Every worker the router starts is registered with the lock framework's watchWorker, so a dead worker's maintenance-lock holds are reclaimed; the router reclaims its store-guard permits itself.
  - User impact: One status call may fail; the next is answered by the new admin worker.
- **The code-indexing worker exits mid-job.** (recoverable)
  - Detection: Its 'exit' listener fires; its pending indexing requests and internal port requests are in the router's pending map.
  - Response: reclaim; fail its pending requests with "the daemon's indexing thread stopped while serving <method>; retry"; tell the summary worker to abandon its current job; start a new code-indexing worker, which restarts the indexer from the persisted registry as a boot does (the interrupted job's file or repo is picked up by the start-up reconcile). The board keeps the last lane state until the new worker publishes.
  - User impact: An indexing request in flight errors; indexing resumes on its own.
- **The document-summary worker exits mid-summary.** (recoverable)
  - Detection: Its 'exit' listener fires while the code-indexing worker's remote summary processor awaits a job.
  - Response: The router tells the code-indexing worker, whose remote processor rejects that job (logged as 'job failed', as a throwing summary is today) so the summary lane continues; a new summary worker is started before the next summary job is handed over.
  - User impact: One document's summary is retried on the next sweep, as a failed summary is today.
- **A worker exits holding the DuckDB permit.** (terminal)
  - Detection: reclaim(threadId) reports duckdb in released, or in unhealthy past its quiescence limit.
  - Response: reclaim logs and marks; the replacement starts; daemon.status keeps answering.
  - User impact: db_file tools may fail after an unhealthy reclaim until restart.
- **The graph store loses its locks.** (terminal)
  - Detection: Any thread's recordLocksLost wins the shared health word and broadcasts (s1).
  - Response: Unchanged: every thread's next store call fails with LmdbStoreLocksLostError; status answers with storeFailure; shutdown skips the drain and the close and ends by SIGKILL. Maintenance never starts while health is not ok, and an in-progress maintenance stops waiting and takes the same path.
  - User impact: Same as today.
- **Requests already running do not finish within the pause limit after maintenance asked for the lock.** (recoverable)
  - Detection: The exclusive lock request's timeoutMs (the pause limit, 10 minutes, config) expires with a LockTimeoutError naming the shared holders.
  - Response: Maintenance is abandoned before anything is closed: the exclusive request is withdrawn (new requests are accepted again), a warning names the holders, and the idle check starts over. A manual daemon.compact in this case answers {error: 'daemon.compact: the daemon did not become idle within <limit>; try again later'}.
  - User impact: Compaction is skipped; nothing is lost and requests are served.
- **compactGraphStore fails (copy, close or rename).** (recoverable)
  - Detection: compactGraphStore rejects with LmdbStoreError.
  - Response: As today the store is left at its original path (the rename failure path restores .bak); the main thread reopens it, the workers reopen on next use, the maintenance lock is released so requests are accepted again; the failure is logged and returned to a manual daemon.compact caller as today's error message.
  - User impact: Compaction failed with an error; the daemon keeps serving.
- **A worker's reply or frame cannot be structured-cloned.** (recoverable)
  - Detection: postMessage throws DataCloneError in the worker's reply path.
  - Response: The worker sends a ReplyEnvelope with error "the result of <method> could not be returned: <message>" (or a stream error frame), so the socket is always answered.
  - User impact: One request fails with a named error instead of hanging.
- **The socket closes while its request runs on a worker.** (recoverable)
  - Detection: IpcServer's socket 'close' listener calls the cancel function from forward().
  - Response: For a stream request the router sends a CancelEnvelope and the worker aborts the stream handler's AbortSignal, as today. For a unary request nothing is aborted: the handler runs to completion as today and the router drops its late reply, as today's write to a closed socket does.
  - User impact: Same as today.
- **A background timer (conversation prune, todo retention) or a watcher-driven write fires during compaction.** (recoverable)
  - Detection: The timer's run requests the maintenance lock shared with a bounded wait; a store access that slips past it hits getGraphStore's maintenance guard.
  - Response: The run waits until maintenance releases the lock (or skips this tick at its bound and logs it); getGraphStore rejects with MaintenanceInProgress rather than reopening the original file before the rename.
  - User impact: No background write is lost or written to the file being replaced.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| daemon.status polls arrive every few seconds from the TUI and plugins while the daemon is otherwise idle. | They do not count as activity, so the idle timer still reaches 30 minutes and maintenance can run. |
| A session request arrives during maintenance. | It is refused at once with {error: "daemon busy: compaction since <time> (<reason>); retry later"}; daemon.status meanwhile reports maintenance compacting with the same activity and reason. |
| daemon.compact while the queue has work. | Today's refusal: 'daemon.compact: indexer is busy (queue=N, processing=...)'. |
| The idle timer fires but reclaimable space is below 25% or 256 MB. | No maintenance; the check runs again after the next idle period. |
| daemon.status before the first store publish. | The admin worker waits for the first publish (at most 5 s); past that it reads the registry from the store as today, so repo.list and daemon.status answer exactly today's list. |
| A stream request for a unary-only method. | The serving thread falls back to the unary handler and the client gets one {id, result} line, as today. |
| A step handler on the main thread makes a nested call to repo.reindex. | The in-daemon client routes it to the code-indexing worker and returns its reply; it never runs on the main thread. |
| A file change while a long session request runs on the main thread. | The watcher on the code-indexing worker enqueues and indexes it; the main thread's busy loop does not delay it. |
| A request arrives after maintenance asked for the lock but before the running requests finished. | Refused with the maintenance activity and reason (writer preference), even though compaction has not started yet. |
| An indexing job is due while maintenance holds the lock. | The queue's job loop waits for the lock (it has no caller to refuse) and starts the job once maintenance releases it. |
| A client keeps an understanding.watch or todos.subscribe stream open for hours. | The stream does not keep the daemon from becoming idle and does not block maintenance; refreshes due during maintenance are skipped and resume after it. |

**Invariants to preserve**

- Every response keeps today's wire shape: {id, result} | {id, error}, IpcStreamMessage lines with the request's id, 'unknown method: X', 'invalid JSON' with id -1. [[c8]]
- The summary lane starts a summary only while the index lane is idle; lane order is the queue's arrival order per lane. [[c13]]
- Shutdown is re-entrant, keeps the 20 s backstop, closes the stores after the queue drained, and on locks-lost skips the drain and close and ends by SIGKILL. [[c15]]
- The attached-client registry validates the client envelope before recording it, and debug-status returns id, label, connectedAt, pid and lastMethod sorted by connectedAt. [[c2]]
- An LMDB write transaction commits all or nothing; vectors are written after the graph commit. [[c16]]
- Only daemon threads open the stores. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test); real worker_threads tests use helper worker scripts under __tests__/helpers and a temporary HOME, as s1's thread tests do`

**Test levels**

- **unit** — Pin the class table, the board's lane merge, the router's bookkeeping and the maintenance decisions without real workers.
  - Subjects: `classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique`, `coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry`, `publishLane: two lanes merge, idle is derived from both, queueDepth and QueueLanes map as composeQueueLanes does today`, `maintenance idle detection with a fake clock: admin requests do not reset idle; a non-admin request or a busy lane does`, `reclaimable estimate: pages in use summed over every named database against the file size; the 25% and 256 MB thresholds both required`, `maintenance lock at the router: with the lock held exclusively by maintenance, a request other than daemon.status is refused with the activity, reason and start time and does not run; daemon.status is answered; a target missing for 30 s answers the not-available error`, `runDocSummarySweep with an async takeEdit: a queued edit runs before the next document, and a summary never starts while code work is queued (no await between the final checks and summarise)`, `compactGraphStore with a beforeRename hook that returns false: no rename, no lock-file removal, the compacted copy is removed and the original store reopens with its data`
- **integration** — Prove routing, isolation, the indexing split and maintenance with the real router and real workers on a temporary HOME and socket.
  - Subjects: `each admin-class method runs on the admin worker's thread id and each indexing-class method on the code-indexing worker's thread id`, `daemon.status, repo.list, debug-status, config.show, config.catalog and guide.list answer within 100 ms (p99 over 50 calls) while an indexing pass runs over a fixture repo and another worker keeps an LMDB write transaction open`, `a session request on the main thread is answered while an indexing pass runs; a file change is indexed while a session request spins the main thread`, `with the queue's two lanes on two threads, a summary starts only while the index lane is idle, and the order of jobs and the indexed and summarised results equal the single-thread queue for the same input`, `queue status from daemon.status and waitForIndexIdle on the summary worker reflect the code-indexing worker's real state`, `codeReview.freshness on the main thread gets the code-indexing worker's codeIndexWorkFor result`, `a nested in-daemon call from a step handler to repo.reindex runs on the code-indexing worker`, `maintenance: with idle forced and the threshold met, a session request and an admin read sent during compaction are refused with the maintenance activity and reason, a request already running finishes before compaction starts, daemon.status answers during it with maintenance compacting, every row written before compaction is present after it, and the file shrank`, `manual daemon.compact returns today's CompactResult when idle and today's busy refusal while the queue has work`, `a request that keeps running past the pause limit makes maintenance abandon without closing anything, and requests are accepted again afterwards`, `admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving`, `a worker started before the embedding bootstrap settles embeds with the decided backend after the push`, `maintenance with a worker that has not closed its graph handle: compaction is abandoned before any rename, and the store is untouched`, `after maintenance, writes from the main thread and from each worker land in the compacted file and the process's LMDB lock is still held (lock probe as in worker-thread-lock.test.ts)`, `a socket closed during a unary request on a worker: the handler completes (its side effect is visible) and no reply is written; during a stream request the stream's AbortSignal fires`, `a step handler's nested in-daemon call under a request's shared hold runs without re-requesting the maintenance lock; manual daemon.compact does not wait on a hold of its own`, `daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down`, `an exclusive maintenance request that becomes pending while a session request's nested call to repo.reindex is running on the code-indexing worker: the nested call completes, the outer request finishes, then maintenance proceeds`, `the pre-rename check returns false when a worker has not acknowledged 'graph.close': no rename, no lock-file removal, the original store reopens and serves`, `a prune-timer write scheduled to fire during compaction waits for the maintenance lock and lands in the compacted store; getGraphStore called on a worker during compaction rejects with MaintenanceInProgress`, `an open understanding.watch stream does not prevent idle detection or maintenance; its refresh during maintenance is skipped and the next one after maintenance is delivered`, `after every worker's closeGraphStore and the main thread's close, the native environment is really gone: a fresh open in-process sees a new environment (test before relying on it for the rename)`
  - Fixtures: `temporary HOME with the daemon started in-process on a temporary socket`, `a fixture repository with code and markdown files large enough for an indexing pass of several seconds`, `a test hook reporting the serving thread id`, `a stub summariser so summaries run without a model`
- **contract** — Keep responses identical for existing clients.
  - Subjects: `recorded responses: daemon.status, daemon.debug-status, repo.list, config.show, config.catalog, guide.list, guide.get, repo.stats and daemon.compact from the threaded daemon equal the single-thread daemon's for the same fixture state (volatile fields compared by type; maintenance absent when not compacting)`, `existing suites pass unchanged in meaning: server-registry, daemon-status-field, daemon-status-lanes, status-store-failure, shutdown-store-failure, store-failure-dispatch, repo-stats, repo-stats-handler-contract, update-handlers, understanding-rpc, queue lanes, step-host, forward-step and mcp-process-e2e (servers built with directDispatch where they build their own tables)`, `debug-status called right after other requests reports each client's lastMethod exactly as today, including 'daemon.debug-status' for the caller itself`, `repo.list and daemon.status before the first publish (publication withheld) return today's list read from the store; a repo whose completeness read fails has no completeness field, as today`, `the store suites that spawn src/db/graph/__tests__/helpers/store-child.ts pass unchanged with its server built through directDispatch`
- **smoke** — The installed daemon starts, answers daemon-ctl and stops cleanly.
  - Subjects: `scripts/daemon-ctl.sh start, then status prints the daemon status; stop leaves no pid file, socket or worker behind`, `SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: admin reads answer within 100 ms (p99) during an indexing pass with another worker holding an LMDB write transaction` |
| `ac2` | `contract: recorded responses of every admin method equal the single-thread daemon's`, `contract: existing server, status, shutdown, update and MCP suites pass unchanged in meaning` |
| `ac3` | `unit: the class table equals the constructed handler tables' keys`, `integration: admin methods run on the admin thread and indexing methods on the code-indexing thread` |
| `ac4` | `integration: a session request on the main thread is answered during an indexing pass` |
| `ac5` | `integration: a file change is indexed while a session request spins the main thread` |
| `ac6` | `integration: summaries start only while the index lane is idle, and job order and results equal the single-thread queue` |
| `ac7` | `integration: daemon.status queue fields and the summary worker's waitForIndexIdle reflect the code-indexing worker's real state`, `integration: codeReview.freshness gets codeIndexWorkFor from the code-indexing worker` |
| `ac8` | `integration: during maintenance requests are refused with the activity and reason, running requests finish first, daemon.status reports compacting, no write is lost, the file shrinks`, `integration: manual daemon.compact keeps today's result and busy refusal`, `unit: idle detection ignores admin polls; the reclaimable thresholds are both required` |

## 7. Migration

**State before:** One JavaScript thread serves everything: IpcServer (src/daemon/server.ts:79-300) calls handlers[method] directly; main() (src/daemon/index.ts:127-2099) builds the handler tables, starts IndexerService over IndexQueue and Watcher (index.ts:265-302) and wires shutdown (src/daemon/shutdown.ts:115-168). The queue's two lanes run as two drain loops on that thread with the summary lane yielding to the index lane (src/daemon/queue.ts:251-318). daemon.status reads the store and the live queue on the same thread (index.ts:1060-1088), so a long indexing step or handler delays it. daemon.compact compacts on demand when the queue is idle (index.ts:1647-1664, src/db/graph/store.ts:831-890). s1's thread pieces exist but are not wired in.

**State after:** The main thread routes: it keeps the socket, the attached-client registry (published to the board), the board, step state, the target registry, the guard block, LMDB's process-wide open and reader check, the embedding-backend decision, session handlers (until s3), the indexing port, maintenance and shutdown. Admin methods run on the admin worker from the board and daemon.info; indexing methods, IndexQueue, Watcher and IndexerService run on the code-indexing worker; summary jobs execute on the document-summary worker, still started only while code indexing is idle. Compaction runs as idle maintenance holding every request but daemon.status. Wire responses are unchanged; daemon.status gains an optional maintenance field.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the frozen method-class table and its coverage test over the constructed handler tables; nothing routes through it yet. — ↩ rollbackable
2. Move handler-table construction from main() into a runtime function taking its indexing dependencies, still called on the main thread with the real queue and indexer, so behaviour is byte-identical and every suite passes. — ↩ rollbackable
3. Give IpcServer the forward seam with today's wire writing and switch every construction site to directDispatch; existing suites pass unchanged. — ↩ rollbackable
4. Add publishLane and its hub binding to the board, the daemon.info hub op, and the admin module reading them, with recorded-response tests against the single-thread answers. — ↩ rollbackable
5. Start the admin worker and route admin methods to it behind daemon.threads.enabled. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
6. Start the code-indexing worker with the queue, watcher and indexer and the document-summary worker executing summary jobs; give the main thread's runtime the indexing port and the in-daemon client its routing; push the embedding backend; publish lanes and the store slot. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
7. Add worker supervision (exit handling, lock reclaim, restart limits) and rewire shutdown to stop the workers, wait for the drain and close the stores on the main thread after they exit. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
8. Add the maintenance controller on the daemon maintenance lock (lock framework afcfa027): every request takes it shared with no wait and is refused with the activity and reason while maintenance holds it; idle detection, the reclaimable estimate, the exclusive request with the pause limit, handle close, compaction and release; route daemon.compact through it, keeping today's responses; register every worker with watchWorker. — ↩ rollbackable _(needs: `daemon.threads.enabled`)_
9. Run the contention, routing, indexing-order, maintenance, restart and smoke tests; then default daemon.threads.enabled on and release with the installer (clients need no update). — ↩ rollbackable

**Backward compat:** The IPC contract is unchanged: socket path and permissions, method names, request shapes and every response field and meaning, including 'unknown method', 'invalid JSON', stream framing, the stream-to-unary fallback, the named LmdbStoreLocksLostError message, and daemon.compact's result and busy refusal. daemon.status gains one optional field (maintenance) present only while compaction runs. The only behavioural change clients see is that during idle maintenance their requests other than daemon.status are refused with the maintenance activity and reason and must be retried. With daemon.threads.enabled off the daemon runs single-threaded as today.

## 8. Alternatives considered

### 8.1 a1: Whole queue on the code-indexing worker; the document-summary worker executes summary jobs — **CHOSEN**

IndexQueue keeps both lanes, their ordering and the summary yield unchanged on the code-indexing worker; its summary lane's processor sends each summary job to the document-summary worker and awaits it, so lane semantics are today's by construction.

Common to every alternative: a frozen sc5 class table (src/daemon/threads/method-class.ts) with a coverage test over the runtime handler tables; a router on the main thread wrapping IpcServer with a forward seam (unknown-method check in the router), the attached-client registry published to the board, and request holding during maintenance; an admin worker running a small admin module (daemon.status, debug-status, repo.list, config.show/catalog, guide.list/get, shutdown/update via a router hub op) reading the board and a daemon.info router hub op; session handlers still on the main thread with an indexing port in place of the local queue/indexer objects (board-backed sync reads for depth and lanes, internal requests to the code-indexing worker for codeIndexWorkFor, depthForRepo, enqueue, addRepo/removeRepo); the in-daemon client sending non-session methods through the router; maintenance compaction run by the main thread. Specific to a1: the code-indexing worker hosts IndexQueue, Watcher and IndexerService exactly as main() does today and serves every indexing-class method. The summary lane's drain loop stays in that IndexQueue, with its yield to the index lane unchanged; its processor, for a summary job, sends the job to the document-summary worker over a dedicated channel and awaits completion. The document-summary worker runs IndexerService's summary paths (docSummariseRepo, docSummariseEntity) against its own store handles; their queue reads (isIndexIdle, isStopping) come from two words in a shared block the code-indexing worker writes, waitForIndexIdle waits on that word, and takeDocSummaryEdit is a request back to the code-indexing worker. Each worker publishes its own lane (publishLane) and sweep progress to the board.

### 8.2 a2: Split lanes: each indexing worker owns its lane, coordinated through a shared code-busy word

IndexQueue is split: the code-indexing worker owns the index lane, the document-summary worker owns the summary lane and the sweep; summary jobs enqueued on the code side are forwarded to the summary worker, and the yield reads a shared code-busy word.

Common parts as in a1. IndexQueue gains a per-thread lane set: on the code-indexing worker only the index lane runs and a summary job passed to enqueue is forwarded (through the router) to the document-summary worker; on the document-summary worker only the summary lane runs, and isIndexIdle / waitForIndexIdle read and wait on a shared code-busy word (index lane in flight or queued) that the code worker updates. depth, laneStatus and depthForRepo are composed from both workers' board lanes; takeDocSummaryEdit is local to the summary worker.

**Rejected because:** Self-contained workers, but ac6, ac7 and k7 are only partial because the queue's ordering is split and recomposed.

### 8.3 a3: Both lanes on one indexing worker (no second thread)

One indexing worker hosts today's queue with both lanes; no document-summary thread.

Common parts as in a1, but a single indexing worker runs IndexQueue with both lanes and IndexerService unchanged, as the original HLD's single indexing thread did.

**Rejected because:** Violates ac6 and the stakeholder's two-thread decision.

## 9. References

- **[[c1]]** `code` `src/daemon/shutdown.ts:115-168`
- **[[c2]]** `code` `src/daemon/server.ts:16-32`
- **[[c3]]** `step-output` `s1`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `code` `src/daemon/threads/worker-entry.ts:40-48`
- **[[c7]]** `code` `src/db/graph/store.ts:831-890`
- **[[c8]]** `code` `src/daemon/server.ts:201-293`
- **[[c13]]** `code` `src/daemon/queue.ts:251-318`
- **[[c15]]** `code` `src/daemon/shutdown.ts:64-71`
- **[[c16]]** `code` `src/db/entities.ts:223-330`

## 10. Open questions

- Pause-acknowledgement limit for maintenance (default 10 minutes) and the maintenance thresholds (30 min idle, 25% and 256 MB reclaimable) are config values; confirm the defaults after the first live runs.
- Supervision boundary: s2 supervises the workers it introduces (exit handling, lock reclaim, replacement, restart limit) so no s2 worker crash leaves the daemon broken until s4; s4 extends it to every worker class. Recorded as an HLD boundary note on 2026-10-22.
- Depends on the lock framework (standalone Story afcfa027, LLD approved 2026-10-22); s2's build starts after that Story's build. Session workers (s3) need no pause registry: they take the maintenance lock shared per request and are registered with watchWorker.

## Resolved questions

- `q036f006e` — Pause-acknowledgement limit for maintenance (default 10 minutes) and the maintenance thresholds (30 min idle, 25% and 256 MB reclaimable) are config values; confirm the defaults after the first live runs.
  - **resolved**: Ship defaults + instrument for tuning — Stakeholder 2026-10-22: keep 30 min idle, 25%/256 MB, 10 min pause-ack as config defaults and log each maintenance decision (pause-ack time, idle duration, reclaimable % and bytes) to tune from live runs. _(2026-10-22T04:39:45.951Z)_
- `q2590bbb2` — Supervision boundary: s2 supervises the workers it introduces (exit handling, lock reclaim, replacement, restart limit) so no s2 worker crash leaves the daemon broken until s4; s4 extends it to every worker class. Recorded as an HLD boundary note on 2026-10-22.
  - **resolved**: A: s2 owns full supervision of its own workers, built as an extensible supervisor — Stakeholder 2026-10-22: s2 builds one supervisor (exit handling, watchWorker lock reclaim plus StoreGuard.reclaim, replacement, restart limit) for the admin and two indexing workers; s4 registers the session workers with the same supervisor. _(2026-10-22T07:16:54.121Z)_

## Citations

- **[[c1]]** `code` `src/daemon/shutdown.ts:115-168`
- **[[c2]]** `code` `src/daemon/server.ts:16-32`
- **[[c3]]** `step-output` `s1`
- **[[c4]]** `step-output` `s4`
- **[[c5]]** `step-output` `s5`
- **[[c6]]** `code` `src/daemon/threads/worker-entry.ts:40-48`
- **[[c7]]** `code` `src/db/graph/store.ts:831-890`
- **[[c8]]** `code` `src/daemon/server.ts:201-293`
- **[[c13]]** `code` `src/daemon/queue.ts:251-318`
- **[[c15]]** `code` `src/daemon/shutdown.ts:64-71`
- **[[c16]]** `code` `src/db/entities.ts:223-330`
