<!-- insrc:artifact HLD-86197ac660732ceb -->

# HLD: multi-threaded-daemon-sessions-admin-indexing

## Summary

The daemon's main thread becomes a router that only accepts connections and hands each request to the right worker thread: one admin worker, two indexing workers (code indexing, and document summaries that yield to it), and a pool of session workers with one worker per client session, reused while the session is active and released after it sits idle. Every worker opens the stores itself; a store proven safe across threads is used directly, and any other store is guarded by a process-wide semaphore that is always released. State that must outlive a worker, such as MCP step tokens, lives in a shared store, so releasing an idle worker loses nothing.

## Contents

1. [Problem context](#1-problem-context)
2. [Framework summary](#2-framework-summary)
3. [Architecture shape](#3-architecture-shape)
4. [Diagrams](#4-diagrams)
5. [Shared contracts](#5-shared-contracts)
6. [Story boundaries](#6-story-boundaries)
7. [Non-functional targets](#7-non-functional-targets)
8. [Rollout](#8-rollout)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. Problem context

> See **DEF-86197ac660732ceb** § 1. Problem

## 2. Framework summary

Alternative a1: a routing main thread plus worker threads by class of work. The main thread owns the Unix socket, framing and the attached-client registry, and does no handler work. Each request is classified (admin, session or indexing) and forwarded over a thread channel to its target: the admin worker, the code-indexing worker, or the session's pooled worker (session id = the request's client label and process id). Workers each load the handler runtime and open their own store handles under a verified per-store threading policy: direct use where a store is proven safe, a shared semaphore with guaranteed release where it is not. MCP step state (the four step state stores) moves into a store shared by all threads, so it outlives any worker; a detached workflow run stays owned by the worker that started it, which is not released while the run is active, and the run's record is published where every thread can read it. A request that carries no valid client identity is served on one shared unattributed worker, as today's daemon serves it, kept apart from every session. A shared status board lets every thread publish what it is doing, which the admin worker reads for daemon status and liveness.

## 3. Architecture shape

Main thread (router): accepts socket connections, parses each request, looks up the method's class in the method-class registry and the session id from the request's client envelope, and sends a request envelope over the thread channel to the target registered for that class. It writes reply and stream-frame envelopes back to the originating connection and observes worker exits, failing that worker's in-flight requests with an error and reclaiming any semaphores the worker held.

Admin worker: one long-lived worker that serves every admin-class method (the liveness check daemon.status, daemon.debug-status, the TUI's and daemon-ctl's reads and controls). It never runs session or indexing work.

Indexing workers: two long-lived workers. The code-indexing worker hosts the whole IndexQueue (both lanes, their ordering, deduplication and edit-before-sweep insertion, and the summary lane's yield to the index lane, all unchanged) and the file-watcher feed; indexing-class methods route to it (repo.add/remove/reindex, index.file, config.enqueue/reindex, repo.stats, daemon.backup, daemon.compact), so repo.stats's per-repo pending count and daemon.compact's busy check read both lanes as today. The summary lane's processor hands each summary job to the document-summary worker and awaits it, so a summary still starts only when the summary lane would start it today; the document-summary worker runs the summary itself, reading a shared code-busy flag for the sweep's own yield checks and asking the code-indexing worker for queued single-document edits (takeDocSummaryEdit). Lane status, idle state and sweep progress are published on the status board so other threads read them without calling into either worker.

Session pool: a thread pool keyed by session id. A request whose session already has a mapped worker is queued to that worker, which runs its session's requests one at a time in arrival order; otherwise the pool creates a worker and maps it. A worker idle beyond the pool's idle timeout is released, unless it still owns an active detached workflow run; a later request from that session gets a new worker and finds its step state in the shared step-state store. Running a session's requests one at a time is new behaviour required by k1: today the server starts every request without waiting for earlier ones, so a session's requests can overlap. A call a running request makes to another method through the in-daemon client runs immediately on the same worker as part of that request, never queued behind it, so the in-order rule cannot deadlock a request on its own nested calls.

Unattributed worker: a session-class request whose client identity is missing or invalid (the identity field is optional on the wire and some clients do not send it) goes to one shared unattributed worker that serves such requests the way today's daemon does, overlapping, and never mixes them into a real session.

Detached workflow runs (s3 moves them with the session workers): a run started by workflow.run keeps its live execution (its driver and abort controller) in the worker that started it. The run's full poll state (status, the append-only sequence of progress frames, the model, and the terminal result or error) is written to shared run storage as it happens, so a poll from any thread returns the same frames-since-cursor, model, result and error it returns today, even after the owning worker has gone; only the live driver and its abort controller stay in the worker; an abort is sent to the owning worker over the thread channel; if the owning worker exits, the router marks its active runs failed. Retention stays today's: 64 is a soft target, cleanup runs when a run starts, and a running run is never evicted, so more than 64 runs can exist while they are running.

Stores: lmdb-js keeps one native LMDB environment per process; the main thread opens it at start and keeps it open until shutdown, and each worker opens its own handle on that shared environment (getGraphStore is a per-isolate module singleton). Story s1 verified that a worker's open, use, close and exit keep the process's LMDB locks (src/db/graph/__tests__/worker-thread-lock.test.ts), so a worker closing its handle or exiting is safe; only the main thread's close at shutdown ends the environment. Each worker opens its own handles to the other stores. Story s1 verifies each store's contract from several threads in one process (LMDB graph, each Lance table, the in-memory DuckDB pool). A store that passes is used directly; a store that does not is used only through the store guard, a process-wide counting semaphore in shared memory acquired by one helper that releases on success, throw and cancellation, and whose holder is recorded so the router can reclaim it if the holding worker exits; reclaim happens only after the dead worker's in-flight native store calls have finished, so no store call is still running when another thread takes the lock. Each store defines how that quiescence is observed (s1 verifies it per store), with a time limit: if quiescence cannot be established within it, the store is marked unhealthy and the router restarts the daemon through the shutdown path rather than let a second thread use the store. A worker holds at most one store lock at a time, so lock cycles cannot form, and an acquisition that waits past its limit fails with an error rather than hanging. A guarded operation that spans awaits keeps its lock for the whole operation, so no other thread sees it half-done. The guard serialises access; it does not make an operation atomic. Each LMDB write stays one synchronous transaction that commits all or nothing, as today, and an operation that commits LMDB and then writes Lance keeps today's order and today's recovery (a re-embed backfills vectors whose write failed after the commit).

Admin status reads never touch a store: everything daemon.status and repo.list report that comes from a store today (the full registered-repository records with each repository's index completeness, and the daemon-wide unattributed-entity count with its reasons) is published on the status board by the code-indexing worker after each change, in exactly today's response shapes, and those methods read only the board. Until the first store publish, the admin worker waits for it (at most 5 s) and then answers from it; past that bound it reads the registry from the store itself as today (a direct LMDB read), so the list is never answered empty for want of a publish. queueDepth and queueLanes come from the board's IndexingStatus (lane depths, running flags, summary-sweep progress), and storeFailure comes from the shared store health word, which every thread reads, so a status answered on the admin worker reports a lost-locks store exactly as today (buildDaemonStatus, src/daemon/status.ts:61-90, is reused unchanged). The DaemonStatus inputs that are not store-backed (uptime from the daemon's start time, the embedding model state, the installed commit and the LMDB file size) come from a router hub op, daemon.info, owned by s2: the embedding-model bootstrap runs once on the main thread, which pushes the decided backend to every worker (each thread holds its own copy of the embedder's backend). Methods that scan or rewrite a whole store (repo.stats, daemon.backup, daemon.compact) are indexing class and run on the code-indexing worker, not the admin worker: repo.stats scans every entity and edge synchronously and reads per-repo queue depth, which would hold the admin thread for the length of the scan.

Cross-class calls inside a handler (a session handler waiting for indexing to go idle, or the in-daemon step client calling another method) go through the thread channel to the method's class target instead of calling a local copy of the handler.

Shutdown: the router coordinates it. An admin request to stop (daemon.shutdown, daemon-ctl stop) asks the router, which stops accepting connections, drains the index queue and the workers, closes the stores and exits, as today's shutdown does. Store health is shared across threads: when any thread finds the LMDB locks lost, the router takes today's locks-lost path, skipping store closure and sending SIGKILL to the process.

Hub-served shared state: the status board and the shared step-state store live on the main thread (src/daemon/threads/status-board.ts, src/daemon/threads/step-state.ts); workers publish with one-way hub messages and read a snapshot or a step entry with one hub request, so those reads wait on the main thread's event loop. While session handlers still run on the main thread (Phase B, s2), a long synchronous session request delays admin answers too; s3 moves session work off the main thread and s4 leaves it running no handler, which keeps these hub services responsive.

Run retention on the board: the run's owner applies today's retention (64 soft cap, cleanup when a run starts, a running run never evicted, as gc() in src/daemon/workflow-run-registry.ts does) and removes each evicted run from the board with a forgetRun(runId) board operation, so the board's run map stays bounded and a poll for an evicted run answers 'unknown' as today.

Maintenance compaction (s2): compaction is background maintenance coordinated through the daemon maintenance lock, a named lock in the process-wide lock framework (standalone Story afcfa027: Web Locks-shaped named locks in shared memory with shared/exclusive modes, no-wait ifAvailable requests, writer preference, holder activity and reason, and reclaim of a dead worker's locks). Every top-level request other than daemon.status and daemon.compact makes a no-wait shared request on the maintenance lock at its entry (the router for main-thread work, the worker's request entry otherwise) and holds it until it finishes; nested in-daemon calls and cross-class channel calls made under that hold do not request it again (the lock framework refuses re-requesting a held name). daemon.status is exempt as the liveness probe; daemon.compact is exempt because it triggers maintenance itself and would otherwise wait on its own hold. Every other method, daemon.shutdown included, is refused during maintenance; a SIGTERM shutdown waits for the compaction to finish or the hard-exit backstop; background indexing jobs take it shared per job and wait rather than fail. When the daemon has been idle for 30 minutes (configurable: no non-admin request, no busy worker, both indexing lanes empty) and LMDB's statistics show at least 25% of the file and at least 256 MB reclaimable, the main thread requests the lock exclusively with activity 'compaction' and its reason (idle time, reclaimable percentage and bytes). From that moment, by writer preference, every new request is refused at once with that activity and reason (not queued); requests already running finish and release their shared holds, then the exclusive is granted. If they do not finish within the pause limit (10 minutes, configurable) the exclusive request times out, nothing is closed, and the daemon carries on. Holding the lock, the main thread tells every live worker to close its graph handle, compacts with compactGraphStore, which gains a new pre-rename check (not existing behaviour): after the close it verifies the native environment really closed (no other handle open) before the rename and the lock-file removal (src/db/graph/store.ts:861-875); if not, it removes the copy, reopens the original and fails without renaming or removing the lock file and releases the lock; threads reopen their handles on next use. daemon.status is the one method answered throughout, reporting maintenance with its activity, reason and start time, because it is the liveness probe daemon-ctl and the plugins use. The manual daemon.compact keeps today's contract: with indexing busy it returns today's 'indexer is busy' refusal; otherwise it runs maintenance now and returns today's CompactResult. Every decision (pause wait, idle time, reclaimable percentage and bytes) is logged for tuning. The router registers every worker it starts with the lock framework's watchWorker, so a dead worker's locks are reclaimed; s3's session workers are covered automatically.

Indexing on the board: the code-indexing worker publishes the index lane and the document-summary worker the summary lane (with sweep progress) through publishLane, an additive sc4 method s2 delivers; the board merges them and derives idle from both. buildDaemonStatus receives queueDepth as index depth plus summary depth, and its QueueLanes' running flag is the board LaneStatus.processing of each lane, so daemon.status reads exactly as today.

Amendments to sc4 (owned and delivered by s1): two additive methods are added by the Stories that first need them, with their hub bindings: publishLane (s2) and forgetRun (s3). Neither changes an existing sc4 method or shape.

Amendment to sc3 (owned and delivered by s1): RequestEnvelope gains an optional underHold flag, delivered by s2, marking a cross-class call made under an outer request's maintenance hold so the receiving worker does not request the lock again.

Non-request store users (main-thread timers such as conversation prune and todo retention, the watcher path, indexing jobs) take the maintenance lock shared with a bounded wait around each run, and getGraphStore refuses on other threads while compaction runs; long-lived subscription streams (understanding.watch, todos.subscribe) neither hold the lock for their lifetime nor count as activity, and skip refreshes during maintenance.

## 4. Diagrams

- [Sequence diagram](docs/epics/multi-threaded-daemon-sessions-admin-indexing-E2026102186197ac6/sequence-diagram.html)

## 5. Shared contracts

### 5.1 sc1: Store guard and per-store threading policy

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** Lets any thread use a store safely: records, per store, whether it is used directly or through a semaphore, and gives one helper that acquires and always releases the store's semaphore. Waiting for a lock is always asynchronous, so a waiting thread keeps serving its other work.

**Interface sketch (type-level):**

```
type StoreId = 'graph' | 'lance' | 'duckdb';
interface StoreThreadingPolicy {
  readonly store: StoreId;
  readonly mode: 'direct' | 'guarded';
  /** Counting-semaphore size for a guarded store (duckdb: 1); absent for a direct store. */
  readonly permits?: number | undefined;
  /** Why: the verification evidence (test or library contract) behind the mode. */
  readonly basis: string;
}
interface StoreQuiescence {
  readonly store: StoreId;
  /** How long reclaim waits for a dead worker's native calls before marking the store unhealthy. */
  readonly limitMs: number;
}
interface StoreGuardOptions {
  /** Fail with StoreLockTimeoutError instead of waiting past this limit. */
  readonly acquireTimeoutMs: number;
  readonly signal?: AbortSignal | undefined;
}
interface StoreLockHolder {
  readonly store: StoreId;
  readonly threadId: number;
  readonly acquiredAt: number;
}
type WithStore = <T>(store: StoreId, op: () => Promise<T>, opts: StoreGuardOptions) => Promise<T>;
interface StoreGuard {
  readonly withStore: WithStore;
  readonly policy: (store: StoreId) => StoreThreadingPolicy;
  readonly holders: () => readonly StoreLockHolder[];
  /** Router only: release every lock a dead worker held. */
  /** Waits for quiescence per store; a store that does not quiesce in time is reported unhealthy. */
  readonly reclaim: (threadId: number) => Promise<{ readonly released: readonly StoreId[]; readonly unhealthy: readonly StoreId[] }>;
  readonly quiescence: (store: StoreId) => StoreQuiescence;
}
```

**Assumptions cited:** [[c7]]

### 5.2 sc2: Shared step-state store

**Owner Story:** `s1`
**Consumed by:** `s3`

**Purpose:** Keeps MCP step tokens where every thread can read them, so a session served by a new worker after an idle release, or after its worker failed, resumes its step exactly as today. Each of the four step kinds keeps its own lifecycle through an adapter: a 100-entry least-recently-used cap, a read that refreshes the token's expiry, a 1-hour idle TTL, analyze and workflow updates that mint a new token and release the old one, review updates that keep the same token, and code-review transitions that consume the current token and mint a new one at each stage (wait → judgement, fallback), so a superseded token fails exactly as today.

**Interface sketch (type-level):**

```
type StepKind = 'analyze' | 'workflow' | 'review' | 'code-review';
interface StepStateEntry<P> {
  readonly token: string;
  readonly kind: StepKind;
  readonly payload: P;
  readonly touchedAt: number;
}
interface StepLifecycle {
  /** analyze and workflow rotate; review keeps its token; code-review consumes and mints per stage. */
  readonly update: 'rotate-token' | 'stable-token' | 'consume-per-stage';
  readonly maxEntries: number;
  readonly ttlMs: number;
  /** A read refreshes touchedAt, as today. */
  readonly readRefreshes: true;
}
interface SharedStepStateStore {
  readonly lifecycle: (kind: StepKind) => StepLifecycle;
  readonly mint: <P>(kind: StepKind, payload: P) => Promise<string>;
  readonly read: <P>(kind: StepKind, token: string) => Promise<StepStateEntry<P> | undefined>;
  /** Returns the token to use next: the same one for stable-token kinds (whose token must exist), a new one otherwise (the old one, if given, is released and then fails); an undefined token on a rotating kind behaves as mint. */
  readonly update: <P>(kind: StepKind, token: string | undefined, payload: P) => Promise<string>;
  readonly release: (kind: StepKind, token: string) => Promise<void>;
}
```

**Assumptions cited:** [[c7]]

### 5.3 sc3: Thread channel and target registry

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** The one message contract between the router and every worker: request, reply, stream frame, cancel and error envelopes, plus the registry where a worker registers as the target for a class of work. A session-class request with no valid session id resolves to the unattributed target.

**Interface sketch (type-level):**

```
type MethodClass = 'admin' | 'session' | 'indexing';
interface SessionId { readonly label: string; readonly pid: number; }
interface RequestEnvelope {
  readonly kind: 'request';
  readonly requestId: string;
  readonly method: string;
  readonly params: unknown;
  readonly stream: boolean;
  readonly session?: SessionId | undefined;
}
interface ReplyEnvelope { readonly kind: 'reply'; readonly requestId: string; readonly result?: unknown; readonly error?: string | undefined; }
interface FrameEnvelope { readonly kind: 'frame'; readonly requestId: string; readonly frame: unknown; }
interface CancelEnvelope { readonly kind: 'cancel'; readonly requestId: string; }
type ChannelEnvelope = RequestEnvelope | ReplyEnvelope | FrameEnvelope | CancelEnvelope;
interface ThreadTarget {
  readonly threadId: number;
  readonly cls: MethodClass;
  readonly session?: SessionId | undefined;
  /** The one shared worker for session-class requests that carry no valid identity. */
  readonly unattributed?: true | undefined;
}
interface TargetRegistry {
  readonly register: (target: ThreadTarget) => void;
  readonly unregister: (threadId: number) => void;
  readonly targetFor: (cls: MethodClass, session?: SessionId) => ThreadTarget | undefined;
}
```

**Assumptions cited:** [[c2]]

### 5.4 sc4: Thread status board

**Owner Story:** `s1`
**Consumed by:** `s2`, `s3`, `s4`

**Purpose:** Shared record each thread updates as it starts and finishes work: the router publishes its attached-client snapshot, the indexing workers publish lane state, summary-sweep progress, each repository's completeness and the unattributed-entity count, and detached workflow runs publish their full poll state, so the admin thread can answer status, debug-status, liveness and run polls without calling into a busy thread or touching a store.

**Interface sketch (type-level):**

```
interface ThreadStatus {
  readonly threadId: number;
  readonly cls: MethodClass | 'router';
  readonly session?: SessionId | undefined;
  readonly busy: boolean;
  readonly method?: string | undefined;
  readonly since?: number | undefined;
  readonly queued: number;
}
interface LaneStatus {
  readonly depth: number;
  readonly processing: boolean;
}
interface SummarySweepProgress {
  readonly repoPath: string;
  readonly done: number;
  readonly total: number;
}
interface IndexingStatus {
  readonly index: LaneStatus;
  readonly summary: LaneStatus;
  readonly sweep?: SummarySweepProgress | undefined;
  readonly idle: boolean;
}
/** The existing AttachedClient shape from the server, lastMethod included. */
interface AttachedClientSnapshot {
  readonly id: number;
  readonly label: string;
  readonly connectedAt: number;
  readonly pid?: number | undefined;
  readonly lastMethod?: string | undefined;
}
/** Today's shapes from src/shared/types.ts, published unchanged. */
type RepoStatusSnapshot = RegisteredRepo & { readonly completeness?: RepoCompleteness | undefined };  // optional as today's withCompleteness leaves it out on a failed read (amendment, delivered by s2)
interface StoreStatusSnapshot {
  /** undefined until first published; responses then mark the value unavailable. */
  readonly repos?: readonly RepoStatusSnapshot[] | undefined;
  readonly unattributedUnwritable?: UnattributedUnwritableCount | undefined;
  readonly publishedAt: number;
}
interface RunRecord {
  readonly runId: string;
  readonly status: 'running' | 'done' | 'error' | 'aborted';
  readonly ownerThreadId: number;
  readonly startedAt: number;
  readonly model: string;
  /** The append-only progress sequence a poll slices from its cursor. */
  readonly frames: readonly unknown[];
  readonly result?: unknown;
  readonly error?: string | undefined;
}
interface StatusSnapshot {
  readonly threads: readonly ThreadStatus[];
  readonly indexing: IndexingStatus;
  readonly clients: readonly AttachedClientSnapshot[];
  readonly runs: readonly RunRecord[];
  readonly store: StoreStatusSnapshot;
}
interface StatusBoard {
  readonly publish: (status: ThreadStatus) => void;
  readonly publishIndexing: (status: IndexingStatus) => void;
  /** Amendment (additive, delivered by s2): one indexing worker publishes only its own lane; the board keeps both and derives IndexingStatus.idle as both lanes empty and not processing. */
  readonly publishLane: (lane: 'index' | 'summary', status: LaneStatus, sweep?: SummarySweepProgress) => void;
  readonly publishClients: (clients: readonly AttachedClientSnapshot[]) => void;
  readonly publishRun: (run: RunRecord) => void;
  /** Amendment (additive, delivered by s3 with the detached-run move): removes a run the owner's retention evicted; a later poll for it answers 'unknown', as today. */
  readonly forgetRun: (runId: string) => void;
  readonly publishStore: (store: StoreStatusSnapshot) => void;
  readonly snapshot: () => StatusSnapshot;
}
```

### 5.5 sc5: Method-class registry

**Owner Story:** `s2`
**Consumed by:** `s3`, `s4`

**Purpose:** Declares the class of every RPC and stream method the daemon serves, so the router sends each request to the right kind of thread and no method is left unclassified.

**Interface sketch (type-level):**

```
interface MethodClassEntry {
  readonly method: string;
  readonly cls: MethodClass;
  readonly stream: boolean;
}
interface MethodClassRegistry {
  readonly classOf: (method: string) => MethodClass | undefined;
  readonly entries: () => readonly MethodClassEntry[];
}
```

### 5.6 sc6: Session pool

**Owner Story:** `s3`
**Consumed by:** `s4`

**Purpose:** Maps each session id to its worker, creating one on first need, queuing a session's requests to it in arrival order, running a request's nested calls inline, and releasing a worker after its idle timeout unless it owns an active detached run.

**Interface sketch (type-level):**

```
interface SessionPoolOptions {
  /** Release a session's worker after this long with no request. */
  readonly idleTimeoutMs: number;
}
interface SessionWorkerInfo {
  readonly session: SessionId;
  readonly threadId: number;
  readonly createdAt: number;
  readonly lastRequestAt: number;
  readonly queued: number;
  /** Detached workflow runs this worker owns; a worker with any is never idle-released. */
  readonly activeRuns: number;
}
interface SessionPool {
  readonly workerFor: (session: SessionId) => Promise<SessionWorkerInfo>;
  readonly sessions: () => readonly SessionWorkerInfo[];
  readonly options: SessionPoolOptions;
}
```

## 6. Story boundaries

### 6.1 Story E2026102186197ac6:S001

**Owns:** `sc1`, `sc2`, `sc3`, `sc4`

Verifying each store from several threads of one process (the LMDB graph environment, every Lance table, the in-memory DuckDB pool), including that a worker opening and later releasing its handles does not close a descriptor the process's locks depend on; the semaphore implementation over process-wide shared memory and its holder record; moving the four in-memory step state stores onto the shared step-state store with today's TTL; the status board's attached-client, sweep-progress and run-record slots; the thread channel's serialisation and the target registry's bookkeeping; the status board's hub-served layout on the main thread. As the root Story it owns every cross-cutting contract the other Stories consume. Validation: ac1 — one thread writes a repo's entities while another reads the same graph, the reader sees only whole transactions, and an entity's vectors are written only after its graph commit; ac2 — two threads write different artifacts or config entries and a third thread reads both back; ac3 — no code path outside the daemon opens a store; ac4 — a throwing LMDB transaction on one thread leaves nothing visible to another. Also: a worker opening and releasing its handles keeps the process's LMDB locks; the guard releases on success, throw, cancel and worker kill; an acquisition past its limit fails; nested acquisition is refused. Step-state compatibility: for each of the four kinds, token rotation (analyze, workflow), stable-token update (review) or consume-and-mint per stage (code-review, where a superseded token fails), read refresh of expiry, the 100-entry eviction and a missing-token error behave as today. LMDB's native environment is opened by the main thread at start and closed by it at shutdown; a worker may open and close its own handle on it (s1 verified this keeps the process's locks); lock reclaim waits for a dead worker's in-flight native calls. Per store, a quiescence observation with a time limit and an unhealthy-store outcome when it is exceeded; a guard wait never blocks its thread.

### 6.2 Story E2026102186197ac6:S002

**Owns:** `sc5`
**Depends on:** `sc1`, `sc3`, `sc4`

The main-thread router (connection handling, classification through the method-class registry, envelope forwarding to registered targets, writing replies and frames back, observing worker exits and reclaiming a dead worker's store locks), the admin worker, and indexing on two workers: the code-indexing worker hosting the whole index queue (both lanes, unchanged) and the file-watcher feed and serving every indexing-class method, and the document-summary worker running the summary jobs the summary lane hands it, so a summary starts only while code indexing is idle, as today. Both indexing workers publish lane state, idleness, summary-sweep progress, the full registered-repository records with each repository's completeness, and the unattributed-entity count with its reasons on the status board after every change. Session-class methods keep running on the main thread exactly as today until s3 moves them; there is no fallback worker. Shutdown and the locks-lost path keep today's behaviour with the workers included (each stops its work, the queue drains, the main thread closes the stores after the workers exit). Validation: ac1 — daemon.status and the TUI's admin reads answer within 100 ms while an indexing pass runs and another worker keeps an LMDB write transaction open; ac2 — each admin method's response matches today's recorded response; ac3 — a test enumerates every served RPC and stream method and fails on any without a class, and dispatch tests assert admin methods ran on the admin thread and indexing methods on the code-indexing thread; ac4/ac5 — a session request is answered during an indexing pass, and a file change is indexed while a session request runs; ac6 — summaries start only while code indexing is idle, and lane order and indexed results equal the single-thread baseline; ac7 — queue status and idle waiting read from another thread reflect the indexing workers' real state. Also: debug-status keeps every field including lastMethod; daemon.status and repo.list read only the status board and keep today's full response shapes. Also maintenance compaction: idle detection (30 min, configurable), the reclaimable-space threshold (25% and 256 MB), the daemon maintenance lock from the lock framework (afcfa027): every request but daemon.status takes it shared with no wait and is refused with the maintenance activity and reason while maintenance holds it exclusively; workers close and reopen their graph handles around the main thread's compaction; every started worker is registered with watchWorker, and the manual daemon.compact keeping today's responses. s2 adds the additive sc4 method publishLane and its hub binding. s2 supervises the workers it introduces (admin, code-indexing, document-summary): exit handling, lock reclaim, replacement and restart limits. ac8 — with the maintenance lock held exclusively, a request other than daemon.status and daemon.compact is refused at once with the activity and reason; daemon.status answers and reports the maintenance; a request already running finishes before compaction starts; an exclusive request that times out leaves the store open and untouched; every row written before compaction is present after it; daemon.compact returns today's CompactResult when idle and today's 'indexer is busy' refusal while the queue has work.

### 6.3 Story E2026102186197ac6:S003

**Owns:** `sc6`
**Depends on:** `sc1`, `sc2`, `sc3`, `sc4`, `sc5`

The session pool, moving every session-class method off the main thread: session-id mapping, per-session FIFO, worker creation and idle release, containment of a failing worker (its in-flight requests fail with an error, the next request gets a new worker), routing each step handler's state through the shared step-state store, the unattributed worker, inline nested calls, and ownership of detached workflow runs (records on the status board, abort routed to the owner, failure on owner exit, never idle-released while a run is active). Validation: ac1 — session B is answered while session A's worker spins; ac2 — A's second request starts only after its first completes; ac3 — requests from one client process over separate connections run on one worker, released after the idle timeout; ac4 — a worker failure fails only its session's requests; ac5 — provider calls stay serial (no Promise.all reaching a provider); ac6 — a step token minted before an idle release resumes on the new worker; ac7 — the liveness check (daemon.status) answer within 100 ms while a session worker spins the CPU for minutes. Also: unattributed requests are served apart from sessions; a nested in-daemon call completes without deadlock; a detached run survives idle time, accepts an abort from another thread, and is marked failed when its owner exits; a poll from another thread, and after the owner has gone, returns the same frames-since-cursor, model, result and error as today. The board's forgetRun operation (an additive sc4 method) is added with the detached-run move, called by the run owner's retention. Session workers take the maintenance lock shared per request like every other request, and are registered with watchWorker when started.

### 6.4 Story E2026102186197ac6:S004

**Depends on:** `sc1`, `sc3`, `sc4`, `sc5`, `sc6`

The main thread becomes the controller: it loads no handler runtime and runs no request handler, only the socket, classification, forwarding, worker supervision extended to every class and unified (s2 already supervises admin and both indexing workers; s4 adds the session pool's workers and the unattributed worker: in-flight requests failed, store locks reclaimed, the worker replaced) and shutdown coordination, including the locks-lost path. It also adds a `threads` section to daemon.status and daemon.debug-status from the status board and session pool (additive fields only) and makes the liveness answer report a busy session as busy rather than as a failure. Validation: ac1 — no request handler runs on the main thread; ac2 — a failing worker of any class fails only its own in-flight requests and is replaced; ac3 — shutdown and the locks-lost path behave as today; ac4 — daemon.status lists each thread with class, session, busy state, method and elapsed time; ac5 — with a session worker busy for minutes the liveness answer reports the daemon alive and the session busy; ac6 — every field of today's daemon.status and daemon.debug-status, including clients and sweep progress, is present with the same meaning.

## 7. Non-functional targets

- **Performance:** The liveness check (daemon.status) answer within 100 ms at the 99th percentile while a session worker is CPU-bound and while an indexing pass runs; routing adds no more than 5 ms per request and per stream frame. A session worker's idle timeout defaults to 15 minutes and is configurable; step state keeps its own 1-hour TTL independent of worker release.
- **Security:** No new listener or socket: the main thread keeps the existing Unix socket and its permissions; shared memory and thread channels are internal to the daemon process; clients still reach the stores only through IPC.
- **Observability:** Every log line carries its thread id and class, and the session id for session work; daemon.status lists every thread with class, session, busy state, current method and elapsed time; a store-lock wait beyond its acquisition limit and a reclaimed lock after a worker exit are logged as warnings.
- **Durability:** Step state survives a worker's release or failure because it lives in the shared step-state store; a detached workflow run lives in its owning worker, which is not released while the run is active, and is marked failed if that worker exits; its poll state lives in shared run storage, so polls still answer after the owner has gone. A worker that exits while holding a store lock has the lock reclaimed by the router. Atomicity is unchanged from today: each LMDB write transaction commits all or nothing, and an operation that writes LMDB then Lance keeps today's order and re-embed recovery. The process's one native LMDB environment is opened by the main thread at start and closed by it at shutdown; each worker opens and may close its own handle on it, which s1 verified keeps the process's locks; a lock held by a dead worker is reclaimed only after its in-flight native calls have finished.

## 8. Rollout

**Phase A — store safety and shared contracts**

**Stories:** `s1`

Every other Story consumes sc1-sc4, which s1 owns; and no work may move off the main thread until each store's behaviour from several threads is verified and the step state lives where any thread can read it.

**Backward compat:** The daemon still runs single-threaded in this phase: the store guard, shared step-state store, channel and status board are exercised by tests and used in place of today's in-memory step maps, so step tokens keep their 1-hour TTL and every existing response is unchanged.

**Phase B — router, admin worker and indexing workers**

**Stories:** `s2`
**Flag:** `daemon.threads.enabled`

s2 depends only on s1: it puts the router in front of every request, classifies all methods, and moves admin and indexing work onto their own workers, leaving session work on the main thread as today.

**Backward compat:** Session-class methods run on the main thread exactly as today; IPC method names, request shapes and response fields are untouched. Admin answers no longer wait on indexing; they can still wait on a long synchronous session request on the main thread until Phase C.

**Phase C — session pool**

**Stories:** `s3`
**Flag:** `daemon.threads.enabled`

s3 consumes sc5 from s2 and sc2 from s1, so it follows Phase B; it moves session work onto per-session workers with idle release.

**Backward compat:** Step tokens minted before the switch remain valid because they already live in the shared step-state store from Phase A. Running a session's requests one at a time in arrival order is new behaviour (today they can overlap); nested in-daemon calls from a running request run inline on the same worker, and requests without a valid client identity keep today's overlapping behaviour on the unattributed worker.

**Phase D — controller and thread visibility**

**Stories:** `s4`

s4 needs every class off the main thread (s2, s3) before the main thread can drop the handler runtime, and reads the session pool (sc6) for the threads section.

**Backward compat:** daemon.status and daemon.debug-status only gain a threads section; every existing field keeps its name and meaning for the TUI and both plugins.

**Ordering rationale:** The order follows the Epic's dependsOn edges and contract ownership, split by layer: s1 owns sc1-sc4 consumed by all others; s2 owns sc5 and moves admin and indexing work off the main thread; s3 owns sc6 and moves session work off it; s4 makes what remains on the main thread a controller and reports every thread. No Story builds a stopgap that a later one removes. One flag (daemon.threads.enabled) gates the move of work off the main thread in Phases B and C, so the single-thread path stays available until the threaded daemon has run live.

**Risky bits**

| Area | Why | Mitigation |
| :--- | :--- | :--- |
| LMDB lock file across threads | This daemon has already lost its LMDB locks when another descriptor on the lock file closed; a worker that opens the environment and later closes it on idle release could drop the process's locks for every thread. | s1 reproduced open-and-release from a worker against the production open options first (src/db/graph/__tests__/worker-thread-lock.test.ts): a worker's open, use, close and exit keep the process's locks, so a worker may close its handle. lmdb-js shares one native environment per process and closes it only with its last handle; maintenance compaction therefore closes every thread's handle before the main thread compacts and renames, and verifies the environment really closed before renaming. |
| Module-scope state that silently splits per worker | Beyond the step stores, caches and registries are module-scope (template caches, the run-record map, the repository-map cache, the chat session pool); a handler that relied on one shared copy would silently see a per-worker copy. | s1 inventories every module-scope mutable value in code reachable from a handler and classifies each as per-thread-safe, moved to a shared store, or owned by one class's worker; s2's classification refuses a method whose state is unclassified. |
| Lock leaks and deadlocks in the store guard | A guarded operation that throws, is cancelled, or whose worker dies while holding the semaphore would block every other thread; a thread taking two locks could deadlock. | One acquire-and-release helper is the only way to take a lock; it releases in every exit path, records its holder for router reclaim on worker exit, fails an acquisition past its limit with an error, and forbids nested acquisition, each covered by a test that kills or throws inside the guarded operation. |
| Nested calls under per-session ordering | Step handlers call other daemon methods through the in-daemon client; if such a call queued behind the request that made it, the request would wait on itself forever. | A nested call made from a running request executes inline on the same worker as part of that request and is never queued; s3 covers it with a test where a step handler's nested call completes. |
| Requests refused during compaction | While maintenance holds the lock, every request other than daemon.status is refused with the maintenance activity and reason; a client that does not retry sees the refusal. | Compaction starts only after 30 idle minutes and only when at least 25% and 256 MB are reclaimable; the refusal names the activity, reason and start time so clients and users can retry; daemon.status reports the maintenance; each decision is logged so the thresholds can be tuned. |

## 9. Alternatives considered

### 9.1 a1: Router on the main thread; admin, indexing and session work all in worker threads — **CHOSEN**

The main thread only accepts connections and routes each request to a dedicated admin worker, the indexing worker or the session's pooled worker; every worker runs the handler runtime and opens its own store handles, with shared semaphores guarding stores that are not thread-safe.

The main thread keeps the Unix socket and the per-connection framing and does nothing else: it reads each request's method and client identity, classifies the method as admin, session or indexing work, and forwards it to the right worker. Admin work goes to one dedicated admin worker, index-queue work to one indexing worker, and session work to a thread pool keyed by session id that reuses the session's mapped worker or creates one, and releases a worker after an idle timeout. Replies and stream frames come back to the main thread, which writes them to the originating connection.

Every worker loads the handler runtime and opens its own handles to the stores. Each store is used directly where its threading contract is verified safe, and otherwise behind a semaphore shared by all workers (process-wide shared memory), acquired and released through one helper that releases on every exit path. Session state that must outlive a worker (MCP step state, the workflow run registry) moves out of worker module memory into a shared place every worker can read, so an idle-released or failed worker loses nothing.

**Pros:**
- The main thread does no handler work at all, so no handler of any class can delay accepting or routing a request.
- Admin work cannot be delayed by routing load either: it has its own worker, satisfying k2 literally.
- A crash in any worker is contained: the main thread observes the worker exit and fails only that worker's in-flight requests.

**Cons:**
- Every request crosses a thread boundary twice (route in, reply out), adding a message hop per request and per stream frame.
- Four kinds of thread to start, supervise and shut down (main, admin, indexing, session pool), the most moving parts of the alternatives.
- Every worker re-imports the handler runtime and re-opens store handles, multiplying start-up cost and open handles by the worker count.

**Cost estimate:** L

### 9.2 a2: Store-owner main thread; workers proxy every store call to it

Workers run admin, indexing and session logic, but the stores stay open only on the main thread and every store call from a worker becomes a message to it.

Admin, indexing and session work move to worker threads as in the stakeholder's model, but no worker opens a store. The main thread keeps the single existing store handles and serves store operations as messages: a worker that reads the graph, writes an artifact or queries a table sends the operation to the main thread and awaits the result.

Consistency comes from serialising all store work on one thread, so no store needs a semaphore and no worker-level store threading contract has to be verified. Session state can stay on the main thread beside the stores.

**Pros:**
- No store is ever opened twice in the process, so no per-store threading contract has to be verified.
- Session state and store handles stay where they are today, so the smallest share of existing module-scope state moves.

**Cons:**
- All store access from every session and the indexer is serialised on one thread: a heavy indexing write pass delays every session's reads, the cross-session stall the Epic removes, for store-bound work.
- Every graph traversal becomes a message per store call; analyzer recipes that make hundreds of graph reads per request pay a thread hop on each.
- It is the owner-thread model the stakeholder declined in favour of semaphores for stores that are not thread-safe.

**Cost estimate:** L

**Rejected because:** Strongest on k7 but only partial on k1, k2 and k3, because the store-owner thread re-couples every class of work; it is also the owner-thread model the stakeholder declined.

### 9.3 a3: Main thread doubles as router and admin thread; indexing and sessions in workers

The main thread accepts connections, routes, and itself serves the admin class; indexing and session work run in workers that open their own store handles behind shared semaphores where needed.

The main thread keeps the socket and routes requests as in a1, but instead of forwarding admin requests it runs the admin handlers itself, making the main thread the one admin thread. Session work goes to the session-keyed worker pool with idle release, and index-queue work to the one indexing worker.

The main thread must therefore stay free of long work: only handlers verified to be short and bounded may be classed as admin. Store use and shared session state are handled as in a1: verified-safe stores used directly, the rest behind shared semaphores with guaranteed release, and session state that must outlive a worker kept outside worker memory.

**Pros:**
- Admin requests are answered without any thread hop, the lowest-latency path for the liveness check and status.
- One fewer thread kind to supervise than a1.

**Cons:**
- Routing and admin share one thread: a mis-classified slow admin handler blocks routing for every client, recreating today's freeze for the whole daemon.
- Admin handlers that read the stores (daemon.status reads the repository list) put store access, and any semaphore wait, on the routing thread.

**Cost estimate:** L

**Rejected because:** Matches a1 except on k2, where sharing routing with admin work puts any store wait of an admin handler on the thread every client depends on.

## 10. References

- **[[c1]]** `analyze-bundle` `src/daemon/index.ts:507-2099` — "main() in src/daemon/index.ts registers 173 RPC and 16 stream handlers (including the understanding routes merged at lines 1994-1995) and serves them through one IpcServer (line 1997)"
- **[[c2]]** `analyze-bundle` `src/daemon/server.ts` — "The IPC surface is src/daemon/server.ts (IpcServer with listen/close/attachedClients/disconnectClients; RpcHandlers/StreamHandlers maps)"
- **[[c3]]** `analyze-bundle` `src/daemon/queue.ts:41-334` — "Indexing runs through IndexQueue (src/daemon/queue.ts:41-334, instantiated at src/daemon/index.ts:269) with an index lane and a document-summary lane"
- **[[c4]]** `analyze-bundle` `src/daemon/steps/workflow-step/state-store.ts:28-36` — "the four MCP step state stores are `new Map` (src/daemon/steps/analyze-step/state-store.ts:72, code-review-step/state-store.ts:31, review-step/state-store.ts:31, workflow-step/state-store.ts:36, with "
- **[[c5]]** `stakeholder` `user 2026-10-21` — "use a threadpool, check if a thread already exists mapped to a session id else create new thread. threadpool should have a reasonable release on idle timeout."
- **[[c6]]** `stakeholder` `user 2026-10-21` — "stores that aren't thread safe should be controlled via semaphores, need to ensure lock release properly else will result in deadlocks"
- **[[c7]]** `analyze-bundle` `src/db/graph/store.ts:320` — "Store handles are module-scope singletons: the graph store `_instance` (src/db/graph/store.ts:320) behind getGraphStore(), one Lance connection `_instance` (src/db/lance/conn.ts:34) behind getLanceCon"
- **[[c8]]** `doc` `node_modules/lmdb/README.md:415` — "LMDB and this library are designed for high concurrency, and we recommend using multiple processes to achieve concurrency (processes are more robust than threads, ...)"
- **[[c9]]** `doc` `node_modules/lmdb/README.md:517` — "The object cache is stored separately for each process/worker, so if you are running across multiple workers or processes, you will either need to use messaging to invalidate cached entries when they "
- **[[c10]]** `analyze-bundle` `src/daemon/workflow-run-registry.ts:72` — "the workflow run registry (src/daemon/workflow-run-registry.ts:72) and the chat session pool (src/daemon/chat-handler.ts:39)"
- **[[c11]]** `code` `src/shared/types.ts:896` — "client?: { readonly label: string; readonly pid: number } | undefined;"
- **[[c12]]** `code` `src/daemon/server.ts:194` — "void this.handleMessage(trimmed, socket);"
- **[[c13]]** `code` `src/daemon/workflow-run-registry.ts:51-76` — "readonly abort: AbortController; ... const MAX_RUNS = 64; (a running run is never evicted)"
- **[[c14]]** `code` `src/db/entities.ts:329` — "upsertEntities: Lance write failed after LMDB commit -- vectors not persisted; rerun reembed to backfill"
- **[[c15]]** `code` `src/db/graph/store.ts:967` — "throw new Error('withWriteTxn callbacks must be synchronous');"
- **[[c16]]** `code` `src/daemon/status.ts:49` — "sweep: { repoPath: string; done: number; total: number } | undefined,"
- **[[c17]]** `code` `src/daemon/server.ts:149` — "...(c.lastMethod !== undefined ? { lastMethod: c.lastMethod } : {}),"
- **[[c18]]** `code` `src/daemon/index.ts:1074` — "listRepos: async () => withCompleteness(await listRepos(db), r => r.path),"
- **[[c19]]** `code` `src/daemon/steps/review-step/state-store.ts:22` — "const MAX_ENTRIES = 100;"
- **[[c20]]** `code` `src/daemon/shutdown.ts:12-15` — "`locks-lost`, the daemon NEVER calls `process.exit`. ... SIGKILL to itself, which runs no exit hook"
- **[[c21]]** `code` `src/daemon/steps/code-review-step/handler.ts:262-364` — "releaseState(step.state!); ... const token = saveState({"
- **[[c22]]** `code` `src/shared/types.ts:708` — "export interface RegisteredRepo {"
- **[[c23]]** `code` `src/shared/types.ts:751` — "export interface UnattributedUnwritableCount {"
- **[[c24]]** `code` `src/daemon/index.ts:585` — "'repo.list': async () => {"
