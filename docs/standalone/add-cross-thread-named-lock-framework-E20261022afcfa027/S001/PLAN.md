<!-- insrc:artifact PLAN-afcfa02717f5bf7d-S001 -->

# Plan: E20261022afcfa027:S001

## Summary

**Epic:** `add-cross-thread-named-lock-framework`
**LLD run:** `wf-1792645989237-ndo9ea`
**LLD effective hash:** `afcfa02717f5...`

Building this Story means writing one new module that lays a lock table over a single SharedArrayBuffer and gives every daemon thread a Web Locks-shaped request/query API on it, with waiting done by Atomics.waitAsync and every state change behind a short per-name mutex. The work goes bottom-up: block layout and validation, then grants and release, then waiting with timeout and abort, then query and reclaim for dead workers. It ends by making the lock block a required part of every daemon worker's start and proving the semantics across real worker threads, including workers killed in the middle of a grant.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Lock block layout, name table, install and errors | M | — | unit: createLockBlock stores capacities in the header and two managers over one block read the same layout; unit: invalid arguments are refused with LockArgumentError and nothing is truncated; unit: a name resolves to one slot and a full name table gives LockCapacityError(names); unit: getLockManager without an install uses a private block | [[c4]] [[c6]] [[c8]] |
| 2 | **`t2`** request: grant, release on settle, ifAvailable, writer preference, nesting, test hooks | L | `t1` | unit: exclusive excludes exclusive and shared, shared admits shared, mode defaults to exclusive; unit: ifAvailable grants when free and otherwise calls back with null and the holders with metadata, never pending; unit: the lock is released and its holder slot cleared on resolve, reject and synchronous throw; unit: same-name nesting and unbounded nested waits fail with LockNestedError; bounded nested requests are allowed; unit: a full holder table gives LockCapacityError(holders) and leaves no grant behind; unit: the grant hook fires at its three points in order and is inert when unset | [[c1]] [[c6]] [[c8]] |
| 3 | **`t3`** Waiting requests: pending table, waitAsync, timeout, abort, arrival order | M | `t2` | unit: writer preference: a waiting exclusive blocks ifAvailable shared and runs before a waiting shared; unit: timeoutMs rejects with LockTimeoutError naming the holders and leaves no pending entry or count; unit: an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up; unit: requests for one name from one thread are served in arrival order; unit: a full pending table gives LockCapacityError(pending) and queues nothing; unit: a lock wait keeps its thread alive until it completes | [[c1]] [[c6]] [[c8]] |
| 4 | **`t4`** query, reclaim and watchWorker | M | `t3` | unit: query lists held and pending entries with mode, threadId, since and metadata; unit: query never returns a slot in its being-written state; unit: reclaim releases a thread's holds and pending requests, recounts and wakes waiters; unit: reclaim takes over a mutex and resets a name claim left by a foreign threadId | [[c2]] [[c3]] [[c5]] [[c8]] |
| 5 | **`t5`** DaemonWorkerInit.lockBlock and startDaemonWorker install | S | `t1` | integration: a daemon worker and the main thread contend for the same named lock; integration: worker-stores tests pass with the lock block passed to startDaemonWorker | [[c4]] [[c7]] |
| 6 | **`t6`** Cross-thread integration tests with real workers | L | `t4`, `t5` | integration: a worker's ifAvailable exclusive gets null while the main thread holds shared, then gets the lock; integration: a waiting worker is woken within 50 ms of another worker's release; integration: writer preference across three workers; integration: terminated holder and waiter are reclaimed and a third worker gets the lock; integration: holder metadata written on one worker is read on another; integration: opposite-order nested bounded waits end in one LockTimeoutError and nothing stays held; integration: watchWorker reclaims a terminated worker's hold and pending request without an explicit reclaim; integration: a worker terminated at each point of a grant leaves nothing held; integration: watchWorker uses the threadId captured at registration | [[c1]] [[c3]] [[c5]] [[c7]] [[c9]] |

### 1.1 E20261022afcfa027:S001:T001 — Lock block layout, name table, install and errors

Create src/shared/locks/lock-manager.ts with the block layout (header with capacities and acquisition counter; name table with claim state storing the claimer threadId, hash, length and 64 name bytes; per-name lock word, pending-exclusive count, version word and mutex word; holder and pending tables), createLockBlock(capacity?) with defaults 64/512/256, installLockManager(block) and getLockManager() (private block outside a daemon, as getStoreGuard), the error classes LockTimeoutError, LockNestedError, LockCapacityError and LockArgumentError, argument validation (name 1-64 UTF-8 bytes, activity <= 64 B, reason <= 1024 B, timeoutMs >= 0, ifAvailable not combined with signal or timeoutMs; refused, never truncated), and name resolution: find-or-claim a name slot by CAS so every thread resolves one name to one slot, with LockCapacityError('names') when full.

**Acceptance checks:**
- createLockBlock stores its capacities in the header and a second installLockManager over the same block reads the same layout
- Each invalid argument is refused with LockArgumentError naming the argument and limit, before any shared state changes
- Resolving the same name twice returns the same slot; a full name table gives LockCapacityError naming the names table
- getLockManager() without an install returns a manager over a private block

### 1.2 E20261022afcfa027:S001:T002 — request: grant, release on settle, ifAvailable, writer preference, nesting, test hooks

Implement LockManager.request for grants without waiting: every change to a name's state happens inside its per-name mutex (CAS 0 -> threadId, a few atomic writes, never across an await); exclusive is granted only when the lock word is 0, shared only when it is >= 0 and no exclusive is pending; the holder slot is claimed by CAS 0 -> -1, filled (mode, threadId, acquisition id, since, metadata) and published last as name index + 1 before the callback runs; a full holder table gives back the lock word and throws LockCapacityError('holders'). The callback runs in try/finally and release (lock word, holder slot cleared, version bumped, notify) happens on resolve, reject or synchronous throw. ifAvailable grants now or calls back with (null, blockedBy) listing holders and, for shared, pending exclusive requests, without registering as pending. An AsyncLocalStorage set of held names refuses a same-name re-request and an unbounded nested wait for another name with LockNestedError. A test-only grant hook (set through an exported setter, a no-op by default) is called at three points: inside the critical section, after the lock word changes, and before the holder record is published, so integration tests can pause and terminate a worker mid-grant.

**Acceptance checks:**
- Exclusive excludes exclusive and shared, shared admits shared, and mode defaults to exclusive
- ifAvailable returns callback(null, blockedBy) with the holders and their metadata when unavailable and leaves no pending entry
- The lock is released and its holder slot cleared after resolve, reject and a synchronous throw, and the error is rethrown unchanged
- A same-name nested request and a nested different-name request with neither ifAvailable nor timeoutMs fail with LockNestedError; a nested different name with ifAvailable or timeoutMs is allowed
- A full holder table gives LockCapacityError naming holders and leaves the lock word unchanged
- The grant hook fires at its three points in order when set and changes nothing when unset

### 1.3 E20261022afcfa027:S001:T003 — Waiting requests: pending table, waitAsync, timeout, abort, arrival order

Add the waiting path to request: a pending slot (claim -1, publish name index + 1 last) with mode, threadId and since; an exclusive waiter increments the pending-exclusive count under the name's mutex from the moment it starts waiting until it is granted, times out or aborts (writer preference), and the count and the lock word are read and changed only under that mutex so a shared grant never interleaves with an exclusive waiter registering; waiters wait with Atomics.waitAsync on the version word with a keep-alive timer, never Atomics.wait; timeoutMs rejects with LockTimeoutError carrying name, waitedMs and holders; a signal aborted before queuing rejects with signal.reason before touching shared state, and an abort while waiting cleans up and rejects with signal.reason; clean-up removes the pending slot, decrements the count and bumps the version. Requests for one name from one thread are served in arrival order through a per-thread queue; a full pending table gives LockCapacityError('pending').

**Acceptance checks:**
- A waiting exclusive request is granted when the holder releases, and while it waits a new ifAvailable shared request gets null with it in blockedBy and a waiting shared request runs only after it
- The pending-exclusive count and the lock word are read and changed only under the name's mutex
- timeoutMs rejects with LockTimeoutError naming the holders, and afterwards the pending entry and pending-exclusive count are gone
- An already-aborted signal rejects before queuing; an abort while waiting rejects with signal.reason and cleans up
- Requests for one name from one thread are granted in arrival order
- A full pending table gives LockCapacityError naming pending and queues nothing
- A thread whose only pending work is a lock wait stays alive until the wait completes

### 1.4 E20261022afcfa027:S001:T004 — query, reclaim and watchWorker

Implement query() as a synchronous lock-free read of held and pending slots that reads a slot only when its state is published (> 0), so a slot being written is omitted but never torn; reclaim(threadId) on the main thread takes over any name mutex whose value is the dead threadId, removes that thread's holder and pending records, recomputes each affected name's lock word and pending-exclusive count from the remaining published records, releases the mutex, bumps the version and notifies, resets name slots left 'being claimed' by that thread to free, and logs each reclaimed entry as a warning with name, mode and metadata; watchWorker(worker) captures worker.threadId at registration and calls reclaim with it on 'exit'. Unit tests prove mutex takeover and name-claim reset by writing a foreign threadId into the mutex and name state words directly; the real-termination proof is t6's.

**Acceptance checks:**
- query() lists held and pending entries with mode, threadId, since and metadata, and omits metadata when none was given
- query() run concurrently with grants never returns a slot in its being-written state
- reclaim(threadId) releases that thread's holds and pending requests, recomputes the lock word and pending-exclusive count, and wakes waiters
- With a foreign threadId written into a name's mutex word and a name slot's claim state, reclaim(that threadId) takes over the mutex, recounts, and resets the claim to free
- watchWorker reclaims using the threadId captured at registration

### 1.5 E20261022afcfa027:S001:T005 — DaemonWorkerInit.lockBlock and startDaemonWorker install

Add the required lockBlock field to DaemonWorkerInit beside guardBlock (src/daemon/threads/worker-entry.ts:25-30) and install it in startDaemonWorker with installLockManager; update the callers src/daemon/threads/__tests__/worker-stores.test.ts:42, :57 and :96 (create a lock block and pass it) and src/daemon/threads/__tests__/helpers/store-worker.ts:23-24 (read it from workerData and pass it).

**Acceptance checks:**
- DaemonWorkerInit.lockBlock is required and tsc fails on a call without it
- startDaemonWorker installs the lock block so getLockManager() on the worker uses the shared block
- worker-stores.test.ts passes with the updated callers

### 1.6 E20261022afcfa027:S001:T006 — Cross-thread integration tests with real workers

Add a helper worker script under src/shared/locks/__tests__/helpers that runs scripted lock operations (request with options, hold until told, release, query, nested requests, and the t2 grant hook set to pause at a chosen point) and reports outcomes, and an integration test file proving the semantics across threads sharing one block: main shared vs worker ifAvailable exclusive, wake within 50 ms of release, writer preference across three workers, reclaim of a terminated holder and waiter, metadata read across threads, startDaemonWorker sharing the lock with the main thread, opposite-order nested bounded waits ending in one LockTimeoutError, watchWorker reclaiming without an explicit call, and termination at each point of a grant leaving nothing held.

**Acceptance checks:**
- Every integration subject in the LLD test strategy has a passing test using real worker_threads
- A worker terminated at each paused point of a grant leaves nothing held after watchWorker's reclaim and another worker then gets the lock
- Two workers taking x then y and y then x with bounded nested waits: one gets LockTimeoutError, the other completes, nothing stays held

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| exclusive excludes exclusive and shared; shared admits shared; mode defaults to exclusive | `t2` |
| ifAvailable: granted when free; callback(null, blockedBy) with the holders and their metadata when not; it never registers as pending | `t2` |
| writer preference: with an exclusive request waiting, an ifAvailable shared request gets null with the pending exclusive in blockedBy and a waiting shared request waits until the exclusive has run | `t3` |
| release on resolve, reject, synchronous throw and abort, with the holder slot cleared each time | `t2`, `t3` |
| timeoutMs: LockTimeoutError naming the holders, and the pending entry and pending-exclusive count are gone afterwards | `t3` |
| signal: an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up | `t3` |
| same-name nesting on one async chain fails with LockNestedError; a nested different name is allowed with ifAvailable or timeoutMs and refused as an unbounded wait | `t2` |
| query(): held and pending entries with mode, threadId, since and metadata | `t4` |
| capacity: a full holder or pending or name table gives LockCapacityError and leaves no grant behind | `t1`, `t2`, `t3` |
| arguments: empty or over-long name, over-long activity or reason, negative timeout and ifAvailable with signal/timeout are refused with LockArgumentError and nothing is truncated | `t1` |
| requests for one name from one thread are served in arrival order | `t3` |
| holder and pending slots: query() run concurrently with grants never returns a slot in its being-written state | `t4` |
| the main thread holds shared, a worker's ifAvailable exclusive gets null with the main thread as blocker, and gets the lock after the main thread releases | `t6` |
| a worker waiting for exclusive is woken and granted when another worker releases (no polling: the wait ends within 50 ms of the release) | `t6` |
| writer preference across threads: shared holders on worker A, exclusive waiter on worker B, a new shared request on worker C is refused (ifAvailable) and B is granted when A releases | `t6` |
| a worker terminated while holding exclusive (and another while waiting) is reclaimed by reclaim(threadId) on the main thread; a third worker then gets the lock and query() shows no entry for the dead threads | `t6` |
| holder metadata written on one worker is read by query() and blockedBy on another | `t6` |
| startDaemonWorker installs the lock block, so a daemon worker and the main thread contend for the same named lock | `t5` |
| two workers taking x then y and y then x with bounded nested waits: one gets LockTimeoutError, the other completes, nothing stays held | `t6` |
| watchWorker: a worker terminated while holding a named lock and waiting for another has both reclaimed without any explicit reclaim call in the test | `t6` |
| a worker terminated at each point of a grant (test hooks pause it inside the critical section, after the lock word changes, and before publishing its record) leaves nothing held after watchWorker's reclaim; another worker then gets the lock | `t6` |
| watchWorker reclaims using the threadId captured at registration even though worker.threadId reads -1 after exit | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails.api LockManager.request`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api LockManager.query`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api LockManager.reclaim`
- **[[c4]]** `prior-artifact` `LLD S001 contractDetails.api createLockBlock and installLockManager`
- **[[c5]]** `prior-artifact` `LLD S001 contractDetails.api watchWorker`
- **[[c6]]** `prior-artifact` `LLD S001 dataModelChanges Lock block (SharedArrayBuffer)`
- **[[c7]]** `prior-artifact` `LLD S001 dataModelChanges DaemonWorkerInit.lockBlock`
- **[[c8]]** `prior-artifact` `LLD S001 errorPaths`
- **[[c9]]** `prior-artifact` `LLD S001 testStrategy`
