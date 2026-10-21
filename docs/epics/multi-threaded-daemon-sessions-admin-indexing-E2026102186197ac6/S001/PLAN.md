<!-- insrc:artifact PLAN-86197ac660732ceb-s1 -->

# Plan: E2026102186197ac6:S001

## Summary

**Epic:** `multi-threaded-daemon-sessions-admin-indexing`
**LLD run:** `wf-1792590061522-lkzz0a`
**LLD effective hash:** `b93e76739a25...`

Building s1 lays the shared groundwork for a multi-threaded daemon without moving any request off the main thread yet. It first pins, as a test, that a worker thread can open LMDB without dropping the daemon's lock, then adds the shared-memory store guard, the main-thread hub with its registry and status board, process-wide store health, and strong cross-thread reads for Lance with DuckDB behind one permit. Finally the four MCP step-state stores move onto the hub, which turns about 48 call sites async, and cross-thread tests prove the Story's acceptance criteria.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Gating test: a worker thread's LMDB open, use and release keeps the daemon's lock | S | — | integration: a worker thread's LMDB open, read, write, close and exit keep the daemon's lock, and the main thread writes after another process opens and closes the store; integration: the lock probe reports a dropped lock after a stray descriptor on the lock file is closed | [[c6]] [[c8]] |
| 2 | **`t2`** Store guard: shared-memory permits, async-chain nesting, per-acquisition holders, reclaim | L | `t1` | unit: withStore releases its permit on resolve, reject, synchronous throw and abort; unit: an acquisition past its limit fails with StoreLockTimeoutError naming the holder; unit: two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError; unit: reclaim releases after quiescence and marks the store unhealthy past limitMs; integration: a worker terminated while holding a permit has it reclaimed and another worker then acquires it | [[c1]] [[c5]] [[c6]] |
| 3 | **`t3`** Thread channel and hub client | M | — | integration: a worker's hub request is answered with its own requestId; integration: closing the port rejects every pending hub request with HubUnavailableError | [[c3]] |
| 4 | **`t4`** Target registry and status board | M | `t3` | unit: TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target; unit: a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op; unit: StatusBoard keeps the latest status per thread and snapshots empty as specified; unit: publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing; integration: a status published from a worker appears in a main-thread snapshot | [[c3]] [[c4]] |
| 5 | **`t5`** Process-wide store health | M | `t2`, `t3` | integration: locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError and write nothing; integration: after locks-lost in a worker, getStoreHealth on the main thread reports it, runReaderCheck does not probe and a second detection does not log | [[c1]] [[c6]] |
| 6 | **`t6`** Lance strong read consistency and DuckDB behind the guard | M | `t2` | integration: a Lance write in one thread is read from another with readConsistencyInterval 0 and missed with it unset; integration: two threads' DuckDB queries run one after the other behind the one permit and both succeed | [[c1]] [[c5]] |
| 7 | **`t7`** Shared step-state store on the hub | M | `t3` | unit: each step kind's token rule, 100-entry eviction, TTL with read refresh and release match today's stores; integration: a real payload of each step kind survives a structured clone through the hub; integration: step state minted in one worker is read in another after the first exits | [[c2]] [[c5]] |
| 8 | **`t8`** Analyze and workflow step callers move to the async shared store | M | `t7` | unit: src/daemon/steps/__tests__/analyze-step-state.test.ts passes unchanged in meaning against the hub-backed store; unit: src/daemon/steps/workflow-step/__tests__/state-store.test.ts passes unchanged in meaning, with today's not-found messages | [[c2]] [[c8]] |
| 9 | **`t9`** Review and code-review step callers move to the async shared store | M | `t7` | unit: src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts passes unchanged in meaning against the hub-backed stores; unit: a superseded code-review token fails with today's not-found message; integration: src/daemon/__tests__/code-review-rpc-fallback.test.ts passes unchanged in meaning | [[c2]] [[c8]] |
| 10 | **`t10`** Worker store ownership and the cross-thread store tests | M | `t2`, `t5`, `t6` | integration: a reader on one thread sees only whole LMDB transactions while a worker writes, and vectors never precede their graph row; integration: two workers' artifact-vector and config writes are read back from a third thread; integration: a worker that has not declared the store owner is refused on the live LMDB and Lance paths; unit: no module outside src/daemon and src/db calls declareLiveStoreOwner; integration: a throwing withWriteTxn callback on a worker leaves none of its writes visible to the main thread | [[c1]] [[c5]] [[c7]] |

### 1.1 E2026102186197ac6:S001:T001 — Gating test: a worker thread's LMDB open, use and release keeps the daemon's lock

Turn the 2026-10-21 simulation into a committed integration test on a temporary store with the production open options: the main thread opens; a real worker_thread opens, reads, writes, closes and exits; another process opens and closes; a lock probe reports the lock held at each step and the main thread's next write succeeds. A positive control (closing a stray descriptor on the lock file) proves the probe can see a dropped lock. This is the Story's gate: if it fails, the Story stops and the question goes back to the HLD before any later task.

**Acceptance checks:**
- The test passes with the lock held after every step, including worker exit and another process's open/close.
- The positive control reports the lock dropped, so a probe that always says held would fail the test.

### 1.2 E2026102186197ac6:S001:T002 — Store guard: shared-memory permits, async-chain nesting, per-acquisition holders, reclaim

Add the process-wide StoreGuardBlock (permit counters, per-acquisition holder records, the store health word) and withStore, policy, holders, reclaim and quiescence with the initial policy table (graph and lance direct, duckdb guarded with one permit). Waiting is asynchronous with a time limit and abort signal; release runs in a finally; nesting is refused per async call chain with an async-context marker; concurrent same-thread calls queue in arrival order.

**Acceptance checks:**
- withStore releases on resolve, reject, synchronous throw and abort.
- Two concurrent same-thread withStore('duckdb') calls both complete one after the other; withStore from inside a held op fails with StoreLockNestedError.
- An acquisition past its limit fails with StoreLockTimeoutError naming the holder.
- reclaim releases a terminated worker's permits after quiescence and marks a store unhealthy past limitMs.

### 1.3 E2026102186197ac6:S001:T003 — Thread channel and hub client

Add the ChannelEnvelope types, the hub request/reply protocol and the worker-side hub client, whose pending requests fail with HubUnavailableError when the port closes.

**Acceptance checks:**
- A worker's hub request is answered with the matching requestId.
- A closed port rejects every pending request with HubUnavailableError; no request hangs.

### 1.4 E2026102186197ac6:S001:T004 — Target registry and status board

Add the main-thread TargetRegistry (register, unregister, targetFor with the unattributed target) and the StatusBoard (publish, publishIndexing, publishClients, publishRun, publishStore, snapshot), reachable from workers through the hub.

**Acceptance checks:**
- register/unregister/targetFor follow the conflict rules; a re-register after unregister succeeds; an unknown unregister is a no-op.
- Each publish* is reflected in snapshot (latest per thread, runs by runId with frames only growing); an empty board snapshots as specified; a worker's publish appears in a main-thread snapshot.

### 1.5 E2026102186197ac6:S001:T005 — Process-wide store health

Make every reader of the graph store's health (getStoreHealth, recordLocksLost, getGraphStore, withWriteTxn, withWriteTxnSync, runReaderCheck, closeGraphStore) read the shared health word; recordLocksLost sets it with a compare-and-swap and publishes the full record through the hub so every thread keeps a copy.

**Acceptance checks:**
- Locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError and write nothing.
- runReaderCheck stops probing and closeGraphStore skips the library close in every thread; only the first detection logs.

### 1.6 E2026102186197ac6:S001:T006 — Lance strong read consistency and DuckDB behind the guard

Open Lance with readConsistencyInterval 0 and route DuckDB's withConnection through withStore('duckdb') so one 2 GB budget is shared; keep every existing behaviour.

**Acceptance checks:**
- A Lance write in one thread is read from another; with the interval unset the same read misses it.
- Two threads' DuckDB queries run one after the other and both succeed.

### 1.7 E2026102186197ac6:S001:T007 — Shared step-state store on the hub

Host the four step kinds on the hub behind SharedStepStateStore with per-kind lifecycle adapters (100-entry LRU, 1-hour TTL, read refresh; rotate-token for analyze and workflow, stable-token for review, consume-per-stage for code-review) and a structured-clone check per kind.

**Acceptance checks:**
- Each kind's token rule, eviction, TTL and read refresh behave as today's store.
- A real payload of each kind survives a structured clone; state minted in one worker is read in another after the first exits.

### 1.8 E2026102186197ac6:S001:T008 — Analyze and workflow step callers move to the async shared store

Switch the analyze-step and workflow-step state-store modules and their encode/reencode/decode wrappers to the async shared store, add await at their call sites (analyze-step state.ts and phases start, plan, narrow, bundle; workflow-step state.ts and phases start, plan, step, synthesize), and make their test-only helpers async for their test files.

**Acceptance checks:**
- Every analyze and workflow call site awaits the async API; tsc is clean.
- The analyze-step and workflow-step suites, including analyze-step-state.test.ts and workflow-step/__tests__/state-store.test.ts, pass unchanged in meaning with today's not-found messages.

### 1.9 E2026102186197ac6:S001:T009 — Review and code-review step callers move to the async shared store

Switch the review-step and code-review-step state-store modules to the async shared store, add await at their call sites (review-step phases start, claims, findings, verdicts; code-review-step handler), and make their test-only helpers async for their test files, including the code-review attribution tests.

**Acceptance checks:**
- Every review and code-review call site awaits the async API; tsc is clean.
- The review-step and code-review-step suites, peer-state-store-leakfree.test.ts, code-review-rpc-fallback.test.ts and the code-review attribution tests pass unchanged in meaning; a superseded code-review token still fails.

### 1.10 E2026102186197ac6:S001:T010 — Worker store ownership and the cross-thread store tests

Make declareLiveStoreOwner part of the worker entry (client processes still refused) and add the acceptance tests: concurrent writer/reader on two threads, two threads' writes read by a third, a throwing transaction on a worker leaving nothing visible, and non-owner refusal.

**Acceptance checks:**
- ac1: a reader on one thread sees only whole transactions while another writes, and vectors never precede their graph row.
- ac2: two threads' artifact and config writes are read back from a third.
- ac3: a non-owner worker is refused on the live paths.
- ac4: a throwing transaction on a worker leaves nothing visible.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| LMDB environment opened, read and closed from a worker while the main thread holds it | `t1` |
| LMDB concurrent writer and reader on two threads | `t10` |
| Lance writes in one thread read from another with readConsistencyInterval 0 | `t6` |
| DuckDB guarded with one permit across two threads | `t6` |
| locks-lost recorded in a worker makes the main thread's next getGraphStore and withWriteTxn fail with LmdbStoreLocksLostError | `t5` |
| after locks-lost in a worker, getStoreHealth on the main thread reports locks-lost, runReaderCheck returns without probing, and a second detection does not log again | `t5` |
| withStore release on resolve, reject, synchronous throw and abort | `t2` |
| acquisition timeout and nested acquisition | `t2` |
| reclaim with quiescence inside and past limitMs | `t2` |
| per-kind step lifecycle: rotate-token, stable-token, consume-per-stage, LRU at 100, TTL with read refresh, release | `t7` |
| TargetRegistry conflicts and the unattributed target | `t4` |
| StatusBoard latest-per-thread ordering and empty snapshot | `t4` |
| register/unregister: a target re-registered after unregister succeeds; unregister of an unknown thread is a no-op | `t4` |
| publishIndexing, publishClients, publishRun (latest per runId, frames only grow) and publishStore each reflected in snapshot | `t4` |
| two concurrent same-thread withStore('duckdb') calls both complete, one after the other; withStore called from inside a held op fails with StoreLockNestedError | `t2` |
| hub client step-state round trip across two workers | `t7` |
| structured-clone safety of a real payload of each kind | `t7` |
| HubUnavailableError on port close | `t3` |
| guard permit reclaimed after a worker is terminated mid-operation | `t2` |
| src/daemon/steps/__tests__/analyze-step-state.test.ts and peer-state-store-leakfree.test.ts pass unchanged in meaning against the hub-backed stores | `t8`, `t9` |
| the four kinds' not-found errors keep today's messages | `t8`, `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails (sc1 store guard: withStore, reclaim; getLanceConn; declareLiveStoreOwner)`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails (sc2 shared step-state store: mint, read, update, release)`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails (sc3 thread channel and target registry: register, unregister, targetFor)`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails (sc4 status board: publish, publishIndexing, publishClients, publishRun, publishStore, snapshot)`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges (StepStateEntry, StoreGuardBlock, StatusBoardState, LanceConnectionOptions, StoreThreadingPolicy)`
- **[[c6]]** `prior-artifact` `LLD s1 errorPaths (gating LMDB test, guard release, timeout, nesting, reclaim, locks-lost across threads)`
- **[[c7]]** `prior-artifact` `LLD s1 testStrategy (acceptance mapping ac1-ac4)`
- **[[c8]]** `prior-artifact` `LLD s1 migration (steps 1-7)`
