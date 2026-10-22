<!-- insrc:artifact LLD-afcfa02717f5bf7d-S001 -->

# LLD: E20261022afcfa027:S001

## Summary

**Epic:** `add-cross-thread-named-lock-framework`
**HLD base run:** `wf-1792645989237-ndo9ea`
**HLD effective hash:** `afcfa02717f5...`

This Story adds a named-lock framework that every thread of the daemon shares, shaped like the browser and Node Web Locks API (navigator.locks), which Node 22 lacks. A caller asks for a lock by name in shared or exclusive mode, either waiting (with a timeout or an abort signal) or not waiting at all, and the lock is released when its callback finishes, whatever happens. A waiting exclusive request stops new shared grants so it cannot be starved, every holder can carry an activity and a reason that any thread can read, and a lock held by a worker that dies is reclaimed. Its first user is the daemon's maintenance lock (Epic 86197ac6 s2).

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `LockManager.request`

```typescript
<T>(name: string, options: LockOptions, callback: (lock: Lock | null, blockedBy: readonly LockInfo[]) => T | Promise<T>) => Promise<T>
```

**Parameters:**
- `name: string` — The lock's name, 1 to 64 UTF-8 bytes; locks with the same name are the same lock in every thread of the process.
- `options: LockOptions = { readonly mode?: 'shared' | 'exclusive'; readonly ifAvailable?: boolean; readonly signal?: AbortSignal; readonly timeoutMs?: number; readonly metadata?: { readonly activity: string; readonly reason: string } }` — mode defaults to 'exclusive' as in Web Locks; ifAvailable grants now or calls back with null; signal and timeoutMs bound a waiting request; metadata is stored with the holder for any thread to read.
- `callback: (lock: Lock | null, blockedBy: readonly LockInfo[]) => T | Promise<T>` — Runs while the lock is held (lock = {name, mode, metadata}); with ifAvailable and the lock unavailable it runs with lock = null and blockedBy = the holders (with their metadata) and, for a shared request, the pending exclusive requests that block it.

**Returns:** `Promise<T>` — The callback's result; the lock is released when the callback's promise settles, in a finally, whether it resolves, rejects or the callback throws synchronously.

**Errors:**
- `LockTimeoutError` when A waiting request was not granted within timeoutMs; carries name, waitedMs and the holders at that moment.
- `AbortError (signal.reason)` when The signal aborted while the request waited; a request whose signal is already aborted is refused before it queues.
- `LockNestedError` when The same name is requested again inside a callback holding it on the same async call chain (it would wait on itself forever); or a different name is requested inside a held callback as a waiting request with no timeoutMs (an unbounded nested wait could form a cross-name or cross-thread cycle: A holds x and waits for y while B holds y and waits for x). A nested request for another name is allowed only with ifAvailable or a timeoutMs, so any cycle ends in a null callback or a LockTimeoutError instead of waiting forever.
- `LockCapacityError` when No free name, holder or pending slot; nothing is granted or queued, and the error names which table is full.
- `LockArgumentError` when An empty or over-long name, an activity over 64 bytes or a reason over 1024 bytes, a negative timeoutMs, or ifAvailable combined with signal or timeoutMs (no waiting to bound). Values are refused, never truncated.

**Preconditions:**
- installLockManager(block) has run on this thread with the process's one block (the main thread creates it with createLockBlock() and passes it to every worker, as the store guard's block is passed: src/daemon/threads/worker-entry.ts:25-48).
- Mirrors navigator.locks.request (Node PR #58666; measured unavailable on Node 22.23.2): same name/mode/ifAvailable/signal semantics, plus timeoutMs, metadata and the blockedBy argument, which Web Locks lacks.

**Postconditions:**
- Exclusive is granted only when no shared or exclusive holder exists; shared is granted only when no exclusive holder exists and no exclusive request is pending (writer preference).
- A pending exclusive request is counted from the moment it starts waiting until it is granted, times out or aborts; while counted, every new shared request (waiting or ifAvailable) is refused or waits.
- An ifAvailable request never waits: it does a fixed number of atomic reads and at most a few compare-and-swaps on the caller's own thread.
- Requests for one name from one thread are served in arrival order; across threads, competing waiters are granted by compare-and-swap (no global FIFO).
- The holder slot (name, mode, threadId, acquisition id, since, metadata) is written before the callback runs and cleared on release.
- Nesting rule (deadlock prevention, after the store guard's 'no lock cycle forms', src/db/store-guard.ts:15-16): a thread holding a lock may ask for another name only without waiting (ifAvailable) or with a bounded wait (timeoutMs); it may never re-request a name it holds.
- Every change to one name's state (its lock word, pending-exclusive count, holder and pending records) happens inside that name's short critical section: a per-name mutex word taken by compare-and-swap with the taker's threadId as its value, held only for a few atomic writes and never across an await. A thread that finds the mutex taken retries the compare-and-swap; waits for the lock itself still use Atomics.waitAsync on the version word.

### 2.2 `LockManager.query`

```typescript
() => LockManagerSnapshot
```

**Returns:** `LockManagerSnapshot = { readonly held: readonly LockInfo[]; readonly pending: readonly LockInfo[] }; LockInfo = { readonly name: string; readonly mode: 'shared' | 'exclusive'; readonly threadId: number; readonly since: number; readonly metadata?: { readonly activity: string; readonly reason: string } }` — Every held and pending request in the process, read from shared memory, as navigator.locks.query() returns held and pending plus thread, time and metadata.

**Postconditions:**
- Synchronous and lock-free: it reads the tables and never waits; an entry being written concurrently may be omitted from one snapshot but never shown torn (slots are published with their name last and read only when published).

### 2.3 `LockManager.reclaim`

```typescript
(threadId: number) => readonly LockInfo[]
```

**Parameters:**
- `threadId: number` — A worker thread that has exited.

**Returns:** `readonly LockInfo[]` — The holds released and the pending requests removed for that thread.

**Preconditions:**
- Called on the main thread after the worker's 'exit' event, as StoreGuard.reclaim is (src/db/store-guard.ts:254-276); a lock holds no native resource, so no quiescence wait is needed.

**Postconditions:**
- Each released hold is logged as a warning with its name, mode and metadata; waiters are woken.
- A name mutex whose value is the dead threadId is taken over by reclaim; the dead thread's holder and pending records for that name are removed, and the lock word and pending-exclusive count are recomputed from the remaining published records. Because every change to a name happens under its mutex, the recount is exact even when the worker died mid-grant.
- A name-table slot left 'being claimed' by the dead thread (its claimer threadId is stored at claim time) is reset to free.

### 2.4 `createLockBlock`

```typescript
(capacity?: { readonly names?: number; readonly holders?: number; readonly pending?: number }) => SharedArrayBuffer
```

**Parameters:**
- `capacity: { names?: number; holders?: number; pending?: number }` _(optional)_ — Table sizes; defaults 64 names, 512 holders, 256 pending.

**Returns:** `SharedArrayBuffer` — The process's lock block, created once by the main thread, as createStoreGuardBlock is (src/db/store-guard.ts:95-103).

**Postconditions:**
- The capacities are stored in the block's header, so every thread reads the same layout.

### 2.5 `installLockManager`

```typescript
(block: SharedArrayBuffer) => LockManager
```

**Parameters:**
- `block: SharedArrayBuffer` — The process's lock block.

**Returns:** `LockManager` — This thread's manager over the block; getLockManager() returns it afterwards, as installStoreGuard/getStoreGuard do (src/db/store-guard.ts:380-389).

**Preconditions:**
- startDaemonWorker installs the block from DaemonWorkerInit.lockBlock, a required field beside guardBlock, so no daemon worker can run with a private lock table; on the main thread installLockManager is called once with the block it created. getLockManager() outside a daemon (single-threaded tests and tools) creates a private block, as getStoreGuard does.

### 2.6 `watchWorker`

```typescript
(worker: Worker) => void
```

**Parameters:**
- `worker: Worker` — A daemon worker the main thread has just started.

**Returns:** `void` — Registers the worker's 'exit' listener that reclaims every named lock it held or waited for.

**Preconditions:**
- Called on the main thread right after new Worker(...) for every daemon worker; it captures worker.threadId at registration and passes that captured id to reclaim on 'exit' (the field may read -1 once the thread has stopped). Epic 86197ac6 s2's worker starter is its first caller (no production code spawns daemon workers yet).

**Postconditions:**
- On the worker's exit, LockManager.reclaim(worker.threadId) runs, so no named lock outlives its holder; each reclaimed entry is logged as a warning.
- Store-guard permits are not touched here: Epic 86197ac6 s2's router owns StoreGuard.reclaim (asynchronous, with quiescence and unhealthy-store handling) on the same exit event, as its HLD assigns.

## 3. Data model changes

### 3.1 `Lock block (SharedArrayBuffer)` — new

Header: capacities, an acquisition counter. Name table (per slot): state (0 free, 1 being claimed, 2 ready), name hash, name length, name bytes (64); a slot is claimed by CAS and never freed (lock names are few and long-lived). Per name: a lock word (0 free, n > 0 shared holders, -1 exclusive), a pending-exclusive count, and a version word incremented on every change, which waiters Atomics.waitAsync on (with a keep-alive timer, as the store guard does, because a pending waitAsync does not keep a thread alive). Holder table (per slot): a state word claimed by CAS from 0 to -1 (being written) and set to name index + 1 only after every other field is written (published last), so query() reads a slot only when its state is > 0; mode, threadId, acquisition id, since (Float64), activity (64 bytes) and reason (1024 bytes) with their lengths. Pending table (per slot): the same claim/publish state word (0 free, -1 being written, name index + 1 published), then mode, threadId, since, so query() can list waiters. This claim(-1)-then-publish-last protocol is new: the store guard's record() (src/db/store-guard.ts:321-330) publishes the slot first and fills it after, so its order must not be copied. Each name also has a mutex word (0 free, else the threadId of the thread inside the name's critical section); the name table's 'being claimed' state stores the claimer's threadId so reclaim can reset a claim abandoned by a dead thread.

**Call sites:**
- `src/db/store-guard.ts:76-85`
- `src/db/store-guard.ts:303-349`

### 3.2 `DaemonWorkerInit.lockBlock` — field-add

A required lockBlock field beside guardBlock; startDaemonWorker installs it, so every daemon worker shares the main thread's locks and none can run with a private block. Callers updated: src/daemon/threads/__tests__/worker-stores.test.ts:42 and :57 (create a lock block and pass it in workerData) and :96, and src/daemon/threads/__tests__/helpers/store-worker.ts:23-24 (read it from workerData and pass it).

**Call sites:**
- `src/daemon/threads/worker-entry.ts:25-48`
- `src/daemon/threads/__tests__/worker-stores.test.ts:42`
- `src/daemon/threads/__tests__/worker-stores.test.ts:57`
- `src/daemon/threads/__tests__/worker-stores.test.ts:96`
- `src/daemon/threads/__tests__/helpers/store-worker.ts:23-24`

## 4. Error paths

**Error cases**

- **A worker dies (crash, terminate, out of memory) while holding a lock or waiting for one.** (recoverable)
  - Detection: watchWorker(worker), registered by the main thread when it starts each daemon worker, hears the worker's 'exit' and calls LockManager.reclaim(threadId), which scans the holder and pending tables for slots carrying that threadId (store-guard permits are reclaimed separately by Epic 86197ac6 s2's router).
  - Response: Each hold is released (lock word decremented or cleared, holder slot cleared, version bumped, waiters notified) and each pending entry removed (the pending-exclusive count decremented if it was an exclusive waiter), logged as a warning with name, mode and metadata.
  - User impact: Other threads waiting on the lock proceed; nothing stays locked by a dead thread.
- **A waiting request reaches its timeoutMs.** (recoverable)
  - Detection: The deadline check after each waitAsync wake (or the wait's own timeout) finds the deadline passed.
  - Response: The request removes its pending entry (and decrements the pending-exclusive count for an exclusive request, then bumps the version so shared waiters re-check) and rejects with LockTimeoutError carrying the name, the time waited and the current holders.
  - User impact: The caller gets a named error with who held the lock; no state is left behind.
- **The AbortSignal fires while a request waits.** (recoverable)
  - Detection: The abort listener attached while waiting rejects the wait (as waitOrAbort does in the store guard).
  - Response: Same clean-up as a timeout, then reject with signal.reason.
  - User impact: As with Web Locks, the caller sees its abort reason.
- **The callback throws synchronously or its promise rejects.** (recoverable)
  - Detection: The try/finally around the callback's invocation and awaited result.
  - Response: The lock is released in finally and the error is rethrown to the caller unchanged.
  - User impact: The error surfaces; the lock does not leak.
- **A callback requests the same name again, or another name with an unbounded wait, on the same async call chain.** (recoverable)
  - Detection: An AsyncLocalStorage set of names held by the current chain, as the store guard's nesting check; a nested request is checked for the same name, and for a different name, for ifAvailable or timeoutMs.
  - Response: LockNestedError at once; the outer hold is unaffected.
  - User impact: A self-deadlock, or a cross-name cycle that could wait forever, becomes an immediate error.
- **A table (names, holders or pending) is full.** (recoverable)
  - Detection: The CAS scan for a free slot finds none.
  - Response: LockCapacityError naming the table; for a holder slot, a lock word already taken is given back first (as the store guard's record() returns its permit), so nothing is granted without a record.
  - User impact: Loud failure instead of a hold that cannot be reclaimed or queried.
- **Invalid arguments: empty or over-long name, activity over 64 bytes, reason over 1024 bytes, negative timeoutMs, ifAvailable with signal or timeoutMs.** (recoverable)
  - Detection: Validation at the start of request, before any shared state is touched.
  - Response: LockArgumentError naming the argument and its limit; nothing is truncated.
  - User impact: The caller fixes its input; shared state is untouched.
- **Two threads take two names in opposite order with bounded nested waits (A holds x and waits for y; B holds y and waits for x).** (recoverable)
  - Detection: The nested waits carry timeoutMs (required for nested waiting requests), so the deadline check fires.
  - Response: The first nested wait to reach its deadline rejects with LockTimeoutError naming the holder; its callback unwinds and releases its outer lock, which lets the other thread proceed.
  - User impact: A cycle costs at most one timeout and an error, never a hang.
- **A worker is killed in the middle of a grant or release (between taking the lock word and publishing its holder record, or while claiming a name slot).** (recoverable)
  - Detection: reclaim(threadId) finds a name mutex or a 'being claimed' name slot carrying the dead threadId.
  - Response: reclaim takes over that mutex, removes the dead thread's records for the name, recomputes the lock word and pending-exclusive count from the remaining published records, releases the mutex and bumps the version; an abandoned name claim is reset to free.
  - User impact: No lock leaks because of where a worker happened to die.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An ifAvailable shared request while an exclusive request is pending but no exclusive holder exists. | Refused: callback(null, blockedBy) with the pending exclusive request in blockedBy (writer preference). |
| An ifAvailable exclusive request while only shared holders exist. | callback(null, blockedBy) listing the shared holders; it does not register as pending (it never waits), so it does not block new shared grants. |
| Many shared holders from several threads, then one exclusive waiter. | New shared requests are refused or wait from the moment the exclusive waiter counts itself; the exclusive is granted when the last shared holder releases. |
| Two threads race for an exclusive lock that just became free. | Exactly one CAS wins; the other waits again on the version word. |
| A lock name first used on a worker before the main thread ever used it. | The worker claims the name slot by CAS; every thread then resolves the same name to that slot. |
| A request whose signal is already aborted. | Rejects with signal.reason before touching shared state, as Web Locks does. |
| A thread whose only pending work is a lock wait. | A keep-alive timer for the wait's duration keeps the thread alive, as in the store guard, so the wait completes. |
| metadata omitted. | The holder is recorded without metadata; query() and blockedBy omit it. |
| A worker started without startDaemonWorker's lock block (a test or tool calling getLockManager() alone). | Outside a daemon it gets a private block, as getStoreGuard does; inside the daemon this cannot happen because DaemonWorkerInit.lockBlock is required. |

**Invariants to preserve**

- Waiting never blocks a thread's event loop: Atomics.waitAsync only, never Atomics.wait. [[c1]]
- Release runs in finally on every exit path, and a grant is never left without its holder record. [[c1]]
- A shared block is created once by the main thread and installed by each worker at start. [[c2]]
- request/query keep Web Locks' meaning for name, mode, ifAvailable, signal and release-on-settle, so a later swap to navigator.locks is mechanical. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with node:assert/strict through tsx; real worker_threads via helper scripts under __tests__/helpers, as src/db/__tests__/store-guard.test.ts does`

**Test levels**

- **unit** — Pin the lock semantics on one thread.
  - Subjects: `exclusive excludes exclusive and shared; shared admits shared; mode defaults to exclusive`, `ifAvailable: granted when free; callback(null, blockedBy) with the holders and their metadata when not; it never registers as pending`, `writer preference: with an exclusive request waiting, an ifAvailable shared request gets null with the pending exclusive in blockedBy and a waiting shared request waits until the exclusive has run`, `release on resolve, reject, synchronous throw and abort, with the holder slot cleared each time`, `timeoutMs: LockTimeoutError naming the holders, and the pending entry and pending-exclusive count are gone afterwards`, `signal: an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up`, `same-name nesting on one async chain fails with LockNestedError; a nested different name is allowed with ifAvailable or timeoutMs and refused as an unbounded wait`, `query(): held and pending entries with mode, threadId, since and metadata`, `capacity: a full holder or pending or name table gives LockCapacityError and leaves no grant behind`, `arguments: empty or over-long name, over-long activity or reason, negative timeout and ifAvailable with signal/timeout are refused with LockArgumentError and nothing is truncated`, `requests for one name from one thread are served in arrival order`, `holder and pending slots: query() run concurrently with grants never returns a slot in its being-written state`
- **integration** — Prove the same semantics across real worker threads sharing one block.
  - Subjects: `the main thread holds shared, a worker's ifAvailable exclusive gets null with the main thread as blocker, and gets the lock after the main thread releases`, `a worker waiting for exclusive is woken and granted when another worker releases (no polling: the wait ends within 50 ms of the release)`, `writer preference across threads: shared holders on worker A, exclusive waiter on worker B, a new shared request on worker C is refused (ifAvailable) and B is granted when A releases`, `a worker terminated while holding exclusive (and another while waiting) is reclaimed by reclaim(threadId) on the main thread; a third worker then gets the lock and query() shows no entry for the dead threads`, `holder metadata written on one worker is read by query() and blockedBy on another`, `startDaemonWorker installs the lock block, so a daemon worker and the main thread contend for the same named lock`, `two workers taking x then y and y then x with bounded nested waits: one gets LockTimeoutError, the other completes, nothing stays held`, `watchWorker: a worker terminated while holding a named lock and waiting for another has both reclaimed without any explicit reclaim call in the test`, `a worker terminated at each point of a grant (test hooks pause it inside the critical section, after the lock word changes, and before publishing its record) leaves nothing held after watchWorker's reclaim; another worker then gets the lock`, `watchWorker reclaims using the threadId captured at registration even though worker.threadId reads -1 after exit`
  - Fixtures: `a helper worker script that runs scripted lock operations and reports outcomes`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: exclusive and shared modes`, `integration: main thread and worker contend for the same named lock` |
| `ac2` | `unit: ifAvailable grants or calls back with null and blockedBy`, `integration: worker's ifAvailable exclusive gets null while the main thread holds shared` |
| `ac3` | `unit: timeoutMs and signal clean up and reject`, `integration: a waiting worker is woken and granted on release` |
| `ac4` | `unit: release on resolve, reject, synchronous throw and abort`, `integration: a terminated worker's hold and pending request are reclaimed and another worker then gets the lock`, `integration: a worker terminated mid-grant leaves nothing held after reclaim` |
| `ac5` | `unit: writer preference on one thread`, `integration: writer preference across three workers` |
| `ac6` | `unit: query() lists held and pending with metadata`, `integration: metadata written on one worker is read on another` |

## 6. Migration

**State before:** The only cross-thread lock is the s1 store guard (src/db/store-guard.ts), a per-store counting semaphore with no named locks, modes, writer preference or holder metadata; startDaemonWorker installs only the guard block (src/daemon/threads/worker-entry.ts:25-48). Node 22's runtime has no navigator.locks.

**State after:** A LockManager module (src/shared/locks/lock-manager.ts) with named shared/exclusive locks, ifAvailable, timeout and abort, release on settle, writer preference, holder metadata, query and reclaim over one process-wide block; startDaemonWorker installs that block beside the guard block. Nothing uses it yet; Epic 86197ac6 s2's maintenance lock is the first consumer. The store guard is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the lock module with its unit tests on one thread. — ↩ rollbackable
2. Add the required lockBlock field to DaemonWorkerInit, install it in startDaemonWorker, update its callers, add watchWorker, and add the cross-thread integration tests with real workers. — ↩ rollbackable

**Backward compat:** A new module, a new required DaemonWorkerInit field whose only callers are two test files updated in this Story, and watchWorker; no existing production API, store or IPC behaviour changes, and the store guard keeps its own block and reclaim.

## 7. Alternatives considered

### 7.1 a1: Lock table in shared memory, no coordinator — **CHOSEN**

A Web Locks-shaped LockManager over one SharedArrayBuffer: a name table, per-lock state words, holder and pending slot tables with metadata bytes; every thread grants, waits (Atomics.waitAsync) and releases by compare-and-swap, with no thread in the middle.

A new module (src/shared/locks/lock-manager.ts) with createLockBlock() on the main thread and installLockManager(block) on each thread, passed to workers like the store guard's block. request(name, options, callback) mirrors navigator.locks.request: options.mode 'shared' | 'exclusive', ifAvailable (grant now or call back with null plus the blocking holders), signal and timeoutMs for waiting requests, and metadata {activity, reason} stored with the holder. The callback's settlement releases the lock in finally. Per lock: a state word (exclusive bit plus shared count), a pending-exclusive count that blocks new shared grants (writer preference), and a version word bumped on every change that waiters wait on. A holder table records [lock, mode, threadId, acquisition id, since, metadata bytes] for query() and reclaim(threadId); a pending table records waiting requests for query(). Nested requests for the same name on one async chain are refused (AsyncLocalStorage) to prevent self-deadlock.

### 7.2 a2: Coordinator on the main thread over the hub

A plain-JS LockManager lives on the main thread with exact Web Locks queue semantics; workers request, release and query over hub messages.

The main thread hosts a Map of named locks with FIFO request queues and holder records; workers send lock.request / lock.release / lock.query hub requests and get grants back; the main thread's own calls are local. Reclaim is a removal of a dead worker's entries on its exit.

**Rejected because:** Exact FIFO and unbounded names, but the no-wait check and release depend on the main thread's event loop, which defeats the s2 use case.

### 7.3 a3: Shared-memory fast path with a main-thread coordinator for waiters

No-wait checks and uncontended grants by CAS in shared memory; contended requests queue at a main-thread coordinator for exact FIFO.

As a1 for the state words and ifAvailable; a request that must wait registers with a coordinator on the main thread, which hands out grants in FIFO order and notifies the waiter.

**Rejected because:** Instant no-wait checks, but waiting grants still depend on the main thread and two mechanisms must stay consistent, for an ordering guarantee nobody asked for.

## 8. References

- **[[c1]]** `code` `src/db/store-guard.ts:160-389`
- **[[c2]]** `code` `src/daemon/threads/worker-entry.ts:25-48`
- **[[c3]]** `doc` `https://developer.mozilla.org/docs/Web/API/Web_Locks_API`
- **[[c4]]** `step-output` `s1`

## 9. Open questions

- Epic 86197ac6 s2 must be amended to use this framework: its maintenance lock (exclusive, held by maintenance with activity and reason; every request takes an ifAvailable shared hold and is refused with the holder's metadata), and its router calls watchWorker for every worker it starts beside its own StoreGuard.reclaim on exit.

## Resolved questions

- `qb472bde2` — Epic 86197ac6 s2 must be amended to use this framework: its maintenance lock (exclusive, held by maintenance with activity and reason; every request takes an ifAvailable shared hold and is refused with the holder's metadata), and its router calls watchWorker for every worker it starts beside its own StoreGuard.reclaim on exit.
  - **resolved**: Amend s2 now, before planning — Stakeholder 2026-10-22: amend Epic 86197ac6's DEF, HLD and s2 LLD to use the lock framework (maintenance takes the exclusive lock with activity and reason; every request takes an ifAvailable shared hold and is refused with the holder's metadata; the router calls watchWorker) before planning the framework. _(2026-10-22T05:56:03.030Z)_

## Citations

- **[[c1]]** `code` `src/db/store-guard.ts:160-389`
- **[[c2]]** `code` `src/daemon/threads/worker-entry.ts:25-48`
- **[[c3]]** `doc` `https://developer.mozilla.org/docs/Web/API/Web_Locks_API`
- **[[c4]]** `step-output` `s1`
