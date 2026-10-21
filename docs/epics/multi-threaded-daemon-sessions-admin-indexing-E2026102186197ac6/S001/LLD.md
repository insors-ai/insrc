<!-- insrc:artifact LLD-86197ac660732ceb-s1 -->

# LLD: E2026102186197ac6:S001

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**HLD base run:** `wf-1792588079400-heeqp4`
**HLD effective hash:** `b93e76739a25...`

This Story makes the daemon's stores and shared state safe to use from several threads before any work moves off the main thread. It proves, per store, how each behaves when a worker thread opens, uses and releases it, and guards any store that is not safe with a process-wide semaphore that is always released. It moves the four MCP step-state stores, the status board and the worker registry into one main-thread hub that every thread reaches by message, so state outlives any worker.

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

**Rollout phase:** Phase A — store safety and shared contracts
**Owns:** `sc1` (Store guard and per-store threading policy), `sc2` (Shared step-state store), `sc3` (Thread channel and target registry), `sc4` (Thread status board)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The main-thread router (connection handling, classification, envelope forwarding, writing replies and frames back, observing worker exits, reclaiming a dead worker's store locks, coordinating shutdown and the locks-lost path), starting and supervising the admin worker, and classifying all 189 methods. Until a class's target is registered (before s3 or s4 lands) the router serves that class on a fallback worker, so each Story can ship alone. Validation: ac1 and ac2 — ping and daemon.status answer within 100 ms while a session worker spins the CPU and while an indexing pass runs, including while another worker holds the graph guard; ac3 — each admin method's response matches today's recorded response; ac4 — a test enumerates every served RPC and stream method and fails on any without a class, and a dispatch test sends each admin-class method and asserts it ran on the admin thread. Also: debug-status keeps every field including lastMethod; daemon.status and repo.list read only the status board and keep today's full response shapes (RegisteredRepo records, the unattributed count with reasons); contention tests show ping, daemon.status, repo.list and the TUI's other admin reads answer within 100 ms while an indexing pass runs and another worker holds the graph guard, including while repo.stats waits on the guard on the admin worker; shutdown and the locks-lost path behave as today. — owns `sc5`
- `s3`: Hosting the index queue, both lanes and the file-watcher feed in one indexing worker that registers as the indexing-class target, keeping today's lane ordering and summary-lane yielding, and publishing lane state, idleness, summary-sweep progress, the full registered-repository records with each repository's completeness, and the unattributed-entity count with its reasons, on the status board after every change. Validation: ac1 — a session request is answered during an indexing pass; ac2 — a file change is indexed while a session worker is busy; ac3 — lane order and indexed results equal the single-thread baseline for the same input; ac4 — queue status and idle waiting read from another thread reflect the indexing worker's real state.
- `s4`: The session pool: session-id mapping, per-session FIFO, worker creation and idle release, containment of a failing worker (its in-flight requests fail with an error, the next request gets a new worker), routing each step handler's state through the shared step-state store, the unattributed worker, inline nested calls, and ownership of detached workflow runs (records on the status board, abort routed to the owner, failure on owner exit, never idle-released while a run is active). Validation: ac1 — session B is answered while session A's worker spins; ac2 — A's second request starts only after its first completes; ac3 — requests from one client process over separate connections run on one worker, released after the idle timeout; ac4 — a worker failure fails only its session's requests; ac5 — provider calls stay serial (no Promise.all reaching a provider); ac6 — a step token minted before an idle release resumes on the new worker. Also: unattributed requests are served apart from sessions; a nested in-daemon call completes without deadlock; a detached run survives idle time, accepts an abort from another thread, and is marked failed when its owner exits; a poll from another thread, and after the owner has gone, returns the same frames-since-cursor, model, result and error as today. — owns `sc6`
- `s5`: Adding a `threads` section to daemon.status and daemon.debug-status from the status board and session pool (additive fields only), and making the liveness answer report a busy session as busy rather than as a failure. Validation: ac1 — daemon.status lists each thread with class, session, busy state, method and elapsed time; ac2 — with a session worker busy for minutes the liveness answer reports the daemon alive and the session busy; ac3 — every field of today's daemon.status and daemon.debug-status, including clients and sweep progress, is present with the same meaning.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `withStore`

```typescript
<T>(store: StoreId, op: () => Promise<T>, opts: StoreGuardOptions) => Promise<T>
```

**Parameters:**
- `store: StoreId` — Which store the operation uses.
- `op: () => Promise<T>` — The whole guarded operation; the lock is held until it settles, across its awaits.
- `opts: StoreGuardOptions` — Acquisition time limit and optional abort signal.

**Returns:** `Promise<T>` — The operation's result; for a direct-mode store the operation runs with no lock.

**Errors:**
- `StoreLockTimeoutError` when The permit was not obtained within acquireTimeoutMs.
- `StoreLockNestedError` when The same async call chain already holds a permit on any store (withStore called from inside another withStore's op), detected with an async-context marker set for the duration of op; other concurrent requests on the same thread are not nested and wait their turn instead.
- `AbortError` when opts.signal fired while waiting; nothing was acquired.
- `StoreUnhealthyError` when The store was marked unhealthy by a failed reclaim.

**Preconditions:**
- The calling thread was started with the process's shared guard block.

**Postconditions:**
- Whatever op does (resolve, reject or throw synchronously), the permit is released before the returned promise settles.
- The holder record for this thread and store is cleared on release.
- Waiting never blocks the thread: other work on the thread keeps running while it waits.
- Concurrent calls from different async call chains on the same thread queue in arrival order for the store's permit and each runs when it obtains one; only a call made from inside a held op is refused as nested.
- Holders are recorded per acquisition (acquisition id, thread id, store, acquired-at), not one slot per thread, so one thread can have several queued or running acquisitions over time.

### 2.2 `reclaim`

```typescript
(threadId: number) => Promise<{ readonly released: readonly StoreId[]; readonly unhealthy: readonly StoreId[] }>
```

**Parameters:**
- `threadId: number` — The worker that exited.

**Returns:** `Promise<{ released; unhealthy }>` — Stores whose permits the dead worker held and that were released, and stores that did not quiesce within their limit and are now unhealthy.

**Preconditions:**
- Called on the main thread after the worker's 'exit' event.

**Postconditions:**
- A permit is released only after the store's quiescence check confirms the dead worker's native calls have finished.
- A store that does not quiesce within limitMs is marked unhealthy, every later withStore on it fails, and the caller is expected to restart the daemon.

### 2.3 `mint`

```typescript
<P>(kind: StepKind, payload: P) => Promise<string>
```

**Parameters:**
- `kind: StepKind` — Which step store.
- `payload: P` — Structured-clone-safe step payload.

**Returns:** `Promise<string>` — A new 22-character URL-safe token.

**Errors:**
- `DataCloneError` when The payload holds a value structured clone cannot carry.

**Postconditions:**
- Expired entries (touched more than ttlMs ago) are swept first and the least recently touched are evicted while the kind holds maxEntries, as the four stores do today.

### 2.4 `read`

```typescript
<P>(kind: StepKind, token: string) => Promise<StepStateEntry<P> | undefined>
```

**Parameters:**
- `kind: StepKind` — Which step store.
- `token: string` — The token the client presented.

**Returns:** `Promise<StepStateEntry<P> | undefined>` — The entry, or undefined when the token is unknown, expired or superseded; callers keep raising today's kind-specific not-found errors.

**Postconditions:**
- A found entry's touchedAt is refreshed, as today's loadState does.

### 2.5 `update`

```typescript
<P>(kind: StepKind, token: string, payload: P) => Promise<string>
```

**Parameters:**
- `kind: StepKind` — Which step store; its lifecycle decides the token rule.
- `token: string` — The token being updated.
- `payload: P` — The new payload.

**Returns:** `Promise<string>` — The token to use next: the same token for review (stable-token), a new token for analyze and workflow (rotate-token, the old one released), and a new token for code-review stage transitions (consume-per-stage).

**Errors:**
- `StepStateNotFound` when The token is unknown, expired or superseded.

**Postconditions:**
- For rotate-token and consume-per-stage kinds the old token reads as undefined afterwards.

### 2.6 `release`

```typescript
(kind: StepKind, token: string) => Promise<void>
```

**Parameters:**
- `kind: StepKind` — Which step store.
- `token: string` — Token to drop.

**Returns:** `Promise<void>` — The entry is gone; releasing an unknown token is a no-op, as today.

**Postconditions:**
- read(kind, token) returns undefined.

### 2.7 `targetFor`

```typescript
(cls: MethodClass, session?: SessionId) => ThreadTarget | undefined
```

**Parameters:**
- `cls: MethodClass` — Class of the request.
- `session: SessionId` _(optional)_ — Validated session identity; absent for admin, indexing and unattributed requests.

**Returns:** `ThreadTarget | undefined` — The registered target, the unattributed target for a session-class request without identity, or undefined when nothing is registered (the router's fallback then applies).

**Preconditions:**
- Called on the main thread.

### 2.8 `register`

```typescript
(target: ThreadTarget) => void
```

**Parameters:**
- `target: ThreadTarget` — A worker announcing what it serves.

**Returns:** `void` — The target is resolvable by targetFor.

**Errors:**
- `TargetConflictError` when A second admin, indexing or unattributed target, or a second target for the same session, is registered while the first is live.

**Preconditions:**
- Called on the main thread.

### 2.9 `unregister`

```typescript
(threadId: number) => void
```

**Parameters:**
- `threadId: number` — The worker that exited, was released or was replaced.

**Returns:** `void` — Every target that thread registered is removed; targetFor no longer returns it.

**Preconditions:**
- Called on the main thread, on the worker's exit event or before an idle release.

**Postconditions:**
- A later register of the same class or session succeeds (the conflict rule applies only to live targets).
- Unregistering an unknown thread is a no-op.

### 2.10 `publish`

```typescript
(status: ThreadStatus) => void
```

**Parameters:**
- `status: ThreadStatus` — A thread's current state.

**Returns:** `void` — Fire-and-forget from a worker (one ordered message); the board keeps the latest status per thread.

**Postconditions:**
- snapshot() reflects the newest status from each thread in the order each thread sent them.

### 2.11 `publishIndexing`

```typescript
(status: IndexingStatus) => void
```

**Parameters:**
- `status: IndexingStatus` — Lane depths, processing flags, sweep progress and idleness from the indexing thread.

**Returns:** `void` — One ordered fire-and-forget message; the board keeps the latest.

**Preconditions:**
- Sent only by the thread that runs the index queue.

**Postconditions:**
- snapshot().indexing equals the last value sent.

### 2.12 `publishClients`

```typescript
(clients: readonly AttachedClientSnapshot[]) => void
```

**Parameters:**
- `clients: readonly AttachedClientSnapshot[]` — The router's attached-client registry in today's shape, lastMethod included.

**Returns:** `void` — Replaces the board's client list.

**Preconditions:**
- Sent by the router (main thread) after each registry change.

**Postconditions:**
- snapshot().clients equals the last list sent, field for field.

### 2.13 `publishRun`

```typescript
(run: RunRecord) => void
```

**Parameters:**
- `run: RunRecord` — A detached workflow run's full poll state.

**Returns:** `void` — Inserts or replaces the record with that runId.

**Preconditions:**
- Sent by the worker that owns the run, after each frame and at completion.

**Postconditions:**
- snapshot().runs holds the latest record per runId; frames only grow.

### 2.14 `publishStore`

```typescript
(store: StoreStatusSnapshot) => void
```

**Parameters:**
- `store: StoreStatusSnapshot` — Registered repositories with completeness and the unattributed count, in today's shapes.

**Returns:** `void` — Replaces the board's store snapshot.

**Preconditions:**
- Sent by the indexing thread after each change to those values.

**Postconditions:**
- snapshot().store equals the last value sent; before the first send its fields are undefined.

### 2.15 `snapshot`

```typescript
() => StatusSnapshot
```

**Returns:** `StatusSnapshot` — Threads, indexing state, clients, runs and the store snapshot as last published; a worker obtains it with one async hub request.

**Postconditions:**
- Never touches a store and never waits on a store lock.

### 2.16 `getLanceConn`

```typescript
() => Promise<lancedb.Connection>
```

**Returns:** `Promise<lancedb.Connection>` — This thread's Lance connection, opened with readConsistencyInterval 0 so every read sees writes committed by any thread.

**Errors:**
- `LanceStoreNotOwnerError` when The live path is opened by a thread of a process that has not declared itself the store owner.

**Postconditions:**
- A table handle opened from this connection sees another thread's committed writes on its next read.

### 2.17 `declareLiveStoreOwner`

```typescript
() => void
```

**Returns:** `void` — Marks this thread's module instance as belonging to the store-owning daemon process.

**Preconditions:**
- Called by the daemon's main thread at start, and by every daemon worker at start (the flag is module-scope, so each isolate needs it); never by a client process.

**Postconditions:**
- isLiveStoreOwnerDeclared() is true in that thread.

## 3. Data model changes

### 3.1 `StepStateEntry` — new

One in-memory map per StepKind on the main-thread hub, replacing the four module maps; each kind's StepLifecycle carries maxEntries 100, ttlMs 1 hour, readRefreshes true and its update rule (analyze, workflow: rotate-token; review: stable-token; code-review: consume-per-stage). Lost on daemon restart, as today. Every caller becomes async and gains an await, including the encode/reencode/decode wrappers and their callers (a missed await would hand a Promise to the stage check). The full production call-site list: src/daemon/steps/code-review-step/handler.ts:252, :262, :312, :325, :332, :364, :431, :509, :523, :586; src/daemon/steps/review-step/phases/start.ts:80, :106; src/daemon/steps/review-step/phases/claims.ts:32, :42; src/daemon/steps/review-step/phases/findings.ts:39, :87, :95; src/daemon/steps/review-step/phases/verdicts.ts:41, :89, :101; src/daemon/steps/analyze-step/state.ts:132, :150, :169 (encodeState, reencodeState, decodeState); src/daemon/steps/analyze-step/phases/start.ts:131; src/daemon/steps/analyze-step/phases/plan.ts:68, :173, :232; src/daemon/steps/analyze-step/phases/narrow.ts:64, :252, :305; src/daemon/steps/analyze-step/phases/bundle.ts:66, :132; src/daemon/steps/workflow-step/state.ts:88, :106, :119 (encodeState, reencodeState, decodeState); src/daemon/steps/workflow-step/phases/start.ts:102; src/daemon/steps/workflow-step/phases/plan.ts:36, :82, :105; src/daemon/steps/workflow-step/phases/step.ts:34, :84, :107; src/daemon/steps/workflow-step/phases/synthesize.ts:35, :95. The test-only helpers (_clear…StateStoreForTests, _…StateStoreSize, _stateStoreSize) become async helpers that act on the hub's map for that kind; their 27 test-file users await them (for example src/daemon/__tests__/code-review-rpc-fallback.test.ts, src/workflow/code-review/__tests__/diff-attribution.test.ts, src/workflow/code-review/__tests__/subject-attribution.test.ts, src/daemon/steps/__tests__/analyze-step-state.test.ts, src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts).

**Call sites:**
- `src/daemon/steps/analyze-step/state-store.ts:72`
- `src/daemon/steps/workflow-step/state-store.ts:36`
- `src/daemon/steps/review-step/state-store.ts:31`
- `src/daemon/steps/code-review-step/state-store.ts:31`
- `src/daemon/steps/code-review-step/handler.ts:252-586`
- `src/daemon/steps/review-step/phases/start.ts:80-106`
- `src/daemon/steps/review-step/phases/claims.ts:32-42`
- `src/daemon/steps/review-step/phases/findings.ts:39-95`
- `src/daemon/steps/review-step/phases/verdicts.ts:41-101`
- `src/daemon/steps/analyze-step/state.ts:132-169`
- `src/daemon/steps/analyze-step/phases/start.ts:131`
- `src/daemon/steps/analyze-step/phases/plan.ts:68-232`
- `src/daemon/steps/analyze-step/phases/narrow.ts:64-305`
- `src/daemon/steps/analyze-step/phases/bundle.ts:66-132`
- `src/daemon/steps/workflow-step/state.ts:88-119`
- `src/daemon/steps/workflow-step/phases/start.ts:102`
- `src/daemon/steps/workflow-step/phases/plan.ts:36-105`
- `src/daemon/steps/workflow-step/phases/step.ts:34-107`
- `src/daemon/steps/workflow-step/phases/synthesize.ts:35-95`

### 3.2 `StoreGuardBlock` — new

One process-wide shared-memory block created by the main thread and passed to each worker at start: per store a permit counter (graph and lance: direct, no permit taken; duckdb: guarded, 1 permit; the graph has no guarded mode, because a per-thread open is exactly what the gate tests, so until the gate passes the graph is opened only by the main thread) and holder records per acquisition (acquisition id, thread id, acquired-at). Holder records let reclaim release every permit a dead worker held. In front of the shared permit each thread keeps a local arrival-order queue, so concurrent async requests on one thread wait their turn rather than conflict. The block also holds the process-wide store health word: 0 = ok, 1 = locks-lost (with the detecting thread id). recordLocksLost sets it with an atomic compare-and-swap (so only the first detection in the process logs) and the detecting thread publishes the full health record (operation, at, detectedBy, libraryMessage) through the hub to every thread, which keeps a copy. Every reader of the health state reads the shared word first: getStoreHealth, recordLocksLost's set-once guard, getGraphStore, withWriteTxn, withWriteTxnSync, runReaderCheck (which then skips its probe) and closeGraphStore (which then skips the library close). Until a thread has received the full record, its LmdbStoreLocksLostError messages and close-skip log name the detecting thread instead of the failed operation.

**Call sites:**
- `src/daemon/db/duckdb-pool.ts:67`
- `src/db/graph/store.ts:1025`
- `src/db/graph/store.ts:441`
- `src/db/graph/store.ts:460`
- `src/db/graph/store.ts:528-531`
- `src/db/graph/store.ts:529`
- `src/db/graph/store.ts:730`
- `src/db/graph/store.ts:908-913`
- `src/db/lance/conn.ts:73-101`

### 3.3 `StatusBoardState` — new

Main-thread record holding the latest ThreadStatus per thread, IndexingStatus, AttachedClientSnapshot[], RunRecord[] and StoreStatusSnapshot exactly as sc4 defines; written by publish* calls, read by snapshot().

**Call sites:**
- `src/daemon/index.ts:1060-1091`

### 3.4 `LanceConnectionOptions` — invariant-change

lancedb.connect is called with readConsistencyInterval 0 so cross-thread writes are visible on the next read; writes were already consistent.

**Call sites:**
- `src/db/lance/conn.ts:86`

### 3.5 `StoreThreadingPolicy` — new

Initial table, each entry with its evidence. graph: direct, but only once the gating worker open-and-release test passes; if it fails, s1 records the result, no worker opens LMDB, and the question goes back to the HLD (open question) before s3 or s4 starts, since workers would then have no supported way to reach the graph. lance: direct with strong read consistency. duckdb: guarded with one permit, each thread opening its own in-memory instance behind it, which bounds total memory to one 2 GB budget. 'Guarded' always means each thread opens its own handle and takes the store's permit around every use.

**Call sites:**
- `src/db/graph/store.ts:528-531`
- `src/daemon/db/duckdb-pool.ts:40-90`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | withStore, policy, holders, reclaim and quiescence over the shared StoreGuardBlock; async wait only; nested acquisition refused per async call chain (async-context marker), concurrent requests on one thread queued in arrival order, holders recorded per acquisition; release in a finally; reclaim waits for per-store quiescence and marks a store unhealthy past limitMs. The block also carries the process-wide store health word that every thread checks before each store call. |
| `sc2` | implements | The main-thread hub hosts the four step kinds behind SharedStepStateStore with per-kind StepLifecycle adapters; workers use a hub client with the same interface over their channel port; the existing saveState/loadState/replaceState/updateState/releaseState wrappers delegate to it and become async. |
| `sc3` | implements | Defines the ChannelEnvelope types plus the hub request/reply envelopes used by the step-state and board clients, and the TargetRegistry on the main thread with register, unregister and targetFor; s2 builds the router on top. |
| `sc4` | implements | StatusBoard lives on the main thread with publish, publishIndexing, publishClients, publishRun, publishStore and snapshot; every publish* from a worker is a one-way ordered message keeping the latest value (runs keyed by runId), snapshot from a worker is one hub request; nothing in it reads a store. |

## 5. Error paths

**Error cases**

- **A worker thread opening or releasing the LMDB environment drops the process's POSIX lock on graph.lmdb-lock (the library opens and closes an extra lock-file descriptor on every open).** (recoverable)
  - Detection: The gating reproduction test: a worker opens the store, reads, closes its handle and exits; then the main thread writes and a second process opens and closes the store; the main thread's next write must succeed. In production the existing lock-loss detection (store health moving to locks-lost on MDB_LOCK_FAILURE or MDB_BAD_RSLOT) still applies.
  - Response: If the test passes, graph is direct: every worker opens its own handle and never closes the environment. If it fails, s1 records the result as the graph policy's evidence, no worker opens LMDB, and the question goes back to the HLD (an open question on this LLD) before s3 or s4 starts.
  - User impact: None if caught by the gate; otherwise the daemon would hit today's locks-lost path.
- **A guarded operation throws, rejects, or its signal aborts while it holds a permit.** (recoverable)
  - Detection: withStore wraps the operation in try/finally.
  - Response: The permit and holder slot are released in the finally before the error propagates unchanged.
  - User impact: Only the failing request sees the error.
- **A thread waits for a permit past acquireTimeoutMs.** (recoverable)
  - Detection: The async wait returns 'timed-out'.
  - Response: StoreLockTimeoutError naming the store and the current holder (thread id, held since); a warning is logged.
  - User impact: That request fails with a clear message instead of hanging.
- **Code running inside a held withStore op calls withStore again (same or different store).** (recoverable)
  - Detection: An async-context marker (set by withStore for the duration of op and inherited by everything op awaits) is present when withStore is entered.
  - Response: StoreLockNestedError, thrown before waiting, so no lock cycle can form; a concurrent request on the same thread that is not inside op carries no marker and simply queues.
  - User impact: A programming error surfaces in tests rather than as a deadlock.
- **A worker exits or is terminated while holding a permit.** (recoverable)
  - Detection: The main thread's worker 'exit' event; holder slots list that thread id.
  - Response: reclaim waits for the store's quiescence (no native call from that thread still running, observed per store) up to limitMs, then releases; past the limit the store is marked unhealthy and later withStore calls fail with StoreUnhealthyError.
  - User impact: Other threads resume once the permit is reclaimed; an unhealthy store needs a daemon restart.
- **A step payload contains a value structured clone cannot carry.** (terminal)
  - Detection: postMessage throws DataCloneError when a worker sends it to the hub.
  - Response: The error propagates to the phase handler and the request fails; the per-kind clone test is meant to catch this before release.
  - User impact: That step call fails instead of silently losing state.
- **A worker sends a hub request and the main thread never replies (the port closed).** (terminal)
  - Detection: The hub client's pending-request map is failed by the port's close event.
  - Response: Every pending request rejects with HubUnavailableError.
  - User impact: The request fails; no hang.
- **A client presents a step token that was superseded, released or expired.** (recoverable)
  - Detection: read returns undefined.
  - Response: The kind's existing not-found error (StateTokenNotFound, StepStateDecodeError 'not-found', WorkflowStateDecodeError 'not-found') with today's message.
  - User impact: Unchanged from today.
- **One thread detects lost LMDB locks (MDB_LOCK_FAILURE or MDB_BAD_RSLOT) while other threads still hold the store.** (terminal)
  - Detection: recordLocksLost in the detecting thread sets the process-wide health word with a compare-and-swap and publishes the full record through the hub; getStoreHealth, getGraphStore, withWriteTxn, withWriteTxnSync, runReaderCheck and closeGraphStore read the word before acting in every thread.
  - Response: Every thread's next store call fails with LmdbStoreLocksLostError (naming the failed operation once the record arrives, the detecting thread before that), runReaderCheck stops probing, closeGraphStore skips the library close, and only the first detection is logged, as today's single-thread path behaves.
  - User impact: Same as today's locks-lost: the daemon reports the store failure and needs a restart; no thread keeps writing to a store whose locks are gone.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A review token updated twice | Same token both times; the second read returns the latest payload. |
| An analyze token used after replaceState minted its successor | read returns undefined; the old token fails as today. |
| A code-review confirm_wait token after the run resumed | The wait token reads as undefined; only the newly minted judgement token works. |
| 101st mint for one kind | The least recently touched entry of that kind is evicted, as today; other kinds are unaffected. |
| A token read just before its TTL | The read refreshes touchedAt, so it survives another hour. |
| withStore on a direct-mode store | The operation runs with no permit taken; holders() is unchanged. |
| Two threads ask for the DuckDB permit at once | One runs; the other waits asynchronously and runs after release, in turn. |
| snapshot() before anything was published | Empty threads, idle indexing with zero depths, no clients or runs, and a store snapshot with repos and unattributedUnwritable undefined. |
| A worker publishes several statuses quickly | The board keeps the last one sent, because messages on one port arrive in order. |
| Two concurrent requests on one thread both call withStore('duckdb') | The second waits asynchronously in arrival order and runs when the first releases; neither fails as nested. |

**Invariants to preserve**

- An LMDB write is one synchronous transaction; a throwing callback inside withWriteTxn commits nothing (childTransaction), and async callbacks are refused. [[c1]]
- Only the declared store-owning daemon process opens the live LMDB and Lance stores; any other process gets the not-owner error. [[c1]]
- After locks-lost every store call fails with LmdbStoreLocksLostError and closeGraphStore skips the library close; with several threads this holds in every thread, not only the one that detected it. [[c1]]
- Each step kind keeps a 100-entry cap with least-recently-touched eviction, a 1-hour idle TTL, a read that refreshes the expiry, and its own token rule; a daemon restart loses all step state. [[c2]]
- Step tokens are 22-character URL-safe random strings. [[c2]]
- One process holds one native LMDB environment per path; a second open reuses it by reference count. [[c3]]
- Lance writes are always consistent; DuckDB stays in-memory with extensions locked down and its memory limit applied. [[c4]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (npx tsx --test), test files under __tests__/*.test.ts beside their module, as in src/db/graph/__tests__/lock-loss-reproduction.test.ts`

**Test levels**

- **integration** — Prove each store's behaviour from real worker_threads in one process on temporary stores, including the gating LMDB open-and-release case.
  - Subjects: `LMDB environment opened, read and closed from a worker while the main thread holds it`, `LMDB concurrent writer and reader on two threads`, `Lance writes in one thread read from another with readConsistencyInterval 0`, `DuckDB guarded with one permit across two threads`, `locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError`, `after locks-lost in a worker, getStoreHealth on the main thread reports locks-lost, runReaderCheck returns without probing, and a second detection does not log again`
  - Fixtures: `temporary LMDB and Lance stores (setGraphStorePath / setLanceConnPath)`, `a worker entry script that declares the store owner and runs a scripted operation`, `a second child process that opens and closes the store (as in lock-loss-reproduction.test.ts)`
- **unit** — Pin the store guard, the step-state lifecycles, the registry and the status board in isolation.
  - Subjects: `withStore release on resolve, reject, synchronous throw and abort`, `acquisition timeout and nested acquisition`, `reclaim with quiescence inside and past limitMs`, `per-kind step lifecycle: rotate-token, stable-token, consume-per-stage, LRU at 100, TTL with read refresh, release`, `TargetRegistry conflicts and the unattributed target`, `StatusBoard latest-per-thread ordering and empty snapshot`, `register/unregister: a target re-registered after unregister succeeds; unregister of an unknown thread is a no-op`, `publishIndexing, publishClients, publishRun (latest per runId, frames only grow) and publishStore each reflected in snapshot`, `two concurrent same-thread withStore('duckdb') calls both complete, one after the other; withStore called from inside a held op fails with StoreLockNestedError`
- **integration** — Prove the hub works across a real worker: step state minted in one worker is read from another after the first exits; board publishes from a worker appear in a snapshot; a closed port fails pending requests.
  - Subjects: `hub client step-state round trip across two workers`, `structured-clone safety of a real payload of each kind`, `HubUnavailableError on port close`, `guard permit reclaimed after a worker is terminated mid-operation`
  - Fixtures: `recorded real payloads of each step kind (taken from the existing step tests' fixtures)`
- **contract** — Keep today's step-state behaviour for every existing caller once the API becomes async.
  - Subjects: `src/daemon/steps/__tests__/analyze-step-state.test.ts and peer-state-store-leakfree.test.ts pass unchanged in meaning against the hub-backed stores`, `the four kinds' not-found errors keep today's messages`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: a worker writes a repo's entities in LMDB transactions while the main thread reads the same graph in a loop; every read observes a whole transaction count, never a partial one, and neither thread errors`, `integration: upsertEntities from a worker commits LMDB before writing Lance; a reader on another thread never sees an entity's vectors before its graph row` |
| `ac2` | `integration: two workers each write a different artifact vector (Lance) and config entry (LMDB); a third thread reads both back after both complete`, `integration: with readConsistencyInterval unset the cross-thread Lance read misses the write (pins why 0 is required), with 0 it sees it` |
| `ac3` | `integration: a worker that has not declared the store owner gets LanceStoreNotOwnerError and the LMDB not-owner error on the live paths`, `unit: no module outside src/daemon and src/db calls declareLiveStoreOwner (source scan, as today's ownership tests do)` |
| `ac4` | `integration: a withWriteTxn callback that throws on a worker leaves none of its writes visible to a read on the main thread afterwards`, `integration (gating): a worker opens, reads and closes the LMDB store and exits; a second process opens and closes it; the main thread's next write still succeeds`, `integration: a worker records locks-lost; the main thread's next store call fails with LmdbStoreLocksLostError and writes nothing` |

## 7. Migration

**State before:** One JavaScript thread owns every store: the graph store is a module-scope singleton opened by getGraphStore (src/db/graph/store.ts:528-531), the owner is declared once in main() (src/daemon/index.ts:130), Lance opens one connection with default (unchecked) read consistency (src/db/lance/conn.ts:86), DuckDB is one in-memory instance (src/daemon/db/duckdb-pool.ts:67). The four MCP step stores are synchronous module-scope maps with a 100-entry LRU and 1-hour TTL (src/daemon/steps/code-review-step/state-store.ts:22-100 and siblings), called from about 50 sites. There is no status board or worker registry, and no shared memory.

**State after:** Still one thread serves every request (s2-s4 move work later), but the shared pieces are ready: a main-thread hub hosts the four step kinds behind one async SharedStepStateStore with per-kind lifecycle adapters, the status board and the target registry, reachable from workers by message; the store guard's shared-memory block and per-store policy exist (graph opened only by the main thread until the worker open-and-release test passes, then direct; Lance direct with readConsistencyInterval 0, DuckDB guarded with one permit); every worker entry declares the store owner. All step-state callers await the async API with unchanged behaviour.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the gating integration test: a worker opens, reads and closes the LMDB store while the main thread holds it, then a second process opens and closes it, and the main thread writes again; record the result as the graph policy's evidence. — ↩ rollbackable
2. Add the store guard (shared-memory block with permits, holder slots and the process-wide store health word; withStore, holders, reclaim with per-store quiescence) and the initial per-store policy table; make getGraphStore, withWriteTxn, withWriteTxnSync and closeGraphStore read the shared health word; nothing calls withStore yet. — ↩ rollbackable
3. Open Lance with readConsistencyInterval 0 and add the cross-thread visibility test. — ↩ rollbackable
4. Add the channel envelope types, the hub request/reply protocol, the main-thread TargetRegistry and StatusBoard, and the worker-side hub client. — ↩ rollbackable
5. Add the SharedStepStateStore on the hub with the four lifecycle adapters and the structured-clone test per kind. — ↩ rollbackable
6. Switch the four state-store modules to delegate to the shared store, make their wrappers and the encode/reencode/decode wrappers async, add await at every listed call site in the phase handlers and the code-review handler, and turn the test-only clear/size helpers into async hub-backed helpers awaited by their test users; existing step tests must pass unchanged in meaning. — ↩ rollbackable
7. Make declareLiveStoreOwner part of the worker entry so every daemon thread declares itself, keeping the client-process refusal. — ↩ rollbackable

**Backward compat:** No IPC method, request or response changes. Step tokens keep their 22-character form, TTL, LRU cap, read refresh, per-kind token rules and not-found messages, and are still lost on a daemon restart; tokens minted before the update are lost by the update's restart, as today. The step-state module functions keep their names but return promises, which only daemon-internal callers use.

## 8. Alternatives considered

### 8.1 a1: Main-thread hub over the thread channel, semaphores in shared memory — **CHOSEN**

The step-state store, status board and target registry live on the main thread and workers reach them with async request/reply messages over the thread channel; the store guard's semaphores and holder records live in one process-wide shared-memory block so a wait is a non-blocking async wait.



### 8.2 a2: Everything in shared memory

Status board, target registry, semaphores and step state all live in SharedArrayBuffer arenas that every thread reads and writes directly with atomic operations.



**Rejected because:** Partial on sc2 and sc4 because fixed shared-memory arenas impose capacity limits today's state does not have, at the highest cost.

### 8.3 a3: LMDB-backed shared state

Step state, the status board and run records are stored in dedicated LMDB sub-databases that every thread opens through the one process-wide environment.



**Rejected because:** Violates sc4: the status board must answer when the store has failed, and it would be stored in the failing store.

### 8.4 a4: Session-local cache with write-through to the hub

Like a1, but each worker keeps a synchronous local cache of its session's step state and writes through to the main-thread hub, fetching on a cache miss.



**Rejected because:** Same as a1 on everything but sc2, where two coherent copies add risk for a latency gain the design does not need.

## 9. References

- **[[c1]]** `analyze-bundle` `src/db/graph/store.ts:528-531` — "Store lifecycle is in src/db/graph/store.ts: LmdbStoreLocksLostError (159), declareLiveStoreOwner (352) / isLiveStoreOwnerDeclared (393), the module-scope health record `_health` (439), getGraphStore "
- **[[c2]]** `analyze-bundle` `src/daemon/steps/code-review-step/state-store.ts:22-100` — "Each step state store keeps `const store = new Map<string, Entry>()` with a 22-char random token, MAX_ENTRIES = 100 with LRU eviction on save, TTL_MS = 1 hour swept on save, and a load that refreshes "
- **[[c3]]** `analyze-bundle` `node_modules/lmdb/src/env.cpp:85-117` — "mdb_env_setup_locks first opens a NEW descriptor on the lock file and passes it to the callback, which matches dev/inode against a process-wide list of open environments and reuses the existing one by"
- **[[c4]]** `analyze-bundle` `node_modules/@lancedb/lancedb/dist/native.d.ts:322-333` — "If None, then consistency is not checked. ... For strong consistency, set this to zero seconds. ... Write operations are always consistent."
- **[[c5]]** `code` `src/db/graph/store.ts:439-461` — "let _health: StoreHealth = { state: 'ok' }; ... _health = { state: 'locks-lost', ... } (module-scope, per isolate)"
- **[[c6]]** `code` `src/daemon/db/duckdb-pool.ts:168-177` — "withConnection: a fresh connection per call on the shared instance, with no serialisation"
- **[[c7]]** `code` `src/db/graph/store.ts:370-374` — "Opening and closing a second descriptor on the lock file inside the daemon drops the daemon's lock on it (Story s4)."

## 10. Open questions

- If the gating worker open-and-release test fails, workers cannot open LMDB safely and the HLD's per-worker store handles do not hold for the graph; this goes back to the HLD before s3 or s4 starts.

## Resolved questions

- `qef5484d1` — If the gating worker open-and-release test fails, workers cannot open LMDB safely and the HLD's per-worker store handles do not hold for the graph; this goes back to the HLD before s3 or s4 starts.
  - **resolved**: Single-owner process, graph direct: the daemon opens LMDB at start and keeps it open until exit; each worker opens it once and keeps its handle until the daemon exits; the semaphore rule applies wherever concurrent use needs it. Safety condition: no process other than the daemon ever opens the live store, enforced by the existing owner check (non-daemon processes are refused before touching the live path) and daemon-ctl stopping the old daemon fully before starting a new one. The gating test still runs, to document whether a worker's open drops the process's OS lock on graph.lmdb-lock, not to decide the design. — Stakeholder decision 2026-10-21: open LMDB at daemon start and keep it open until exit; nobody else should be using the DB. A dropped OS lock is only harmful when another process opens the store. Stakeholder asked for a small simulation before moving forward. _(2026-10-21T14:37:20.249Z)_

## Citations

- **[[c1]]** `analyze-bundle` `src/db/graph/store.ts:528-531` — "Store lifecycle is in src/db/graph/store.ts: LmdbStoreLocksLostError (159), declareLiveStoreOwner (352) / isLiveStoreOwnerDeclared (393), the module-scope health record `_health` (439), getGraphStore "
- **[[c2]]** `analyze-bundle` `src/daemon/steps/code-review-step/state-store.ts:22-100` — "Each step state store keeps `const store = new Map<string, Entry>()` with a 22-char random token, MAX_ENTRIES = 100 with LRU eviction on save, TTL_MS = 1 hour swept on save, and a load that refreshes "
- **[[c3]]** `analyze-bundle` `node_modules/lmdb/src/env.cpp:85-117` — "mdb_env_setup_locks first opens a NEW descriptor on the lock file and passes it to the callback, which matches dev/inode against a process-wide list of open environments and reuses the existing one by"
- **[[c4]]** `analyze-bundle` `node_modules/@lancedb/lancedb/dist/native.d.ts:322-333` — "If None, then consistency is not checked. ... For strong consistency, set this to zero seconds. ... Write operations are always consistent."
- **[[c5]]** `code` `src/db/graph/store.ts:439-461` — "let _health: StoreHealth = { state: 'ok' }; ... _health = { state: 'locks-lost', ... } (module-scope, per isolate)"
- **[[c6]]** `code` `src/daemon/db/duckdb-pool.ts:168-177` — "withConnection: a fresh connection per call on the shared instance, with no serialisation"
- **[[c7]]** `code` `src/db/graph/store.ts:370-374` — "Opening and closing a second descriptor on the lock file inside the daemon drops the daemon's lock on it (Story s4)."
