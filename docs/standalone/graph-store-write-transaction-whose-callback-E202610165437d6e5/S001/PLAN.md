<!-- insrc:artifact PLAN-5437d6e54c9e7d48-s1 -->

# Plan: E202610165437d6e5:S001

## Summary

**Epic:** `graph-store-write-transaction-whose-callback`
**LLD run:** `wf-1792152664803-w0wldi`
**LLD effective hash:** `5e1b1ad5a79d...`

Three small changes make the graph store's write transactions all-or-nothing: the write helper, then the migration runner and first boot, switch to lmdb's child transaction, and a pin test guards the library behaviour the fix rests on.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** withWriteTxn runs its synchronous callback as an lmdb child transaction | S | — | unit: src/db/graph/__tests__/write-txn-atomic.test.ts: a throwing callback leaves nothing (in-process and after a reopen); a throwing and a succeeding caller queued together; an async callback refused and keeping nothing; unit: src/db/graph/__tests__/store-health.test.ts: no library transaction (childTransaction counted) after locks-lost; the slow healthy write probed at each bound with a synchronous callback | [[c1]] [[c3]] |
| 2 | **`t2`** The migration runner and the first-boot write run as child transactions | S | `t1` | unit: src/db/graph/__tests__/migrations.test.ts: a throwing step leaves neither its rows nor its version write; earlier steps stay committed | [[c2]] [[c3]] |
| 3 | **`t3`** Pin lmdb's transaction behaviour and the store's open options | S | `t1` | integration: src/db/graph/__tests__/lmdb-txn-semantics.test.ts: in a fresh process after a reopen, root.transaction keeps a throwing callback's write, childTransaction and transactionSync discard it; the store opens without useWritemap; integration: src/db/graph/__tests__/lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged | [[c4]] [[c5]] |

### 1.1 E202610165437d6e5:S001:T001 — withWriteTxn runs its synchronous callback as an lmdb child transaction

In src/db/graph/store.ts:882-910, withWriteTxn calls `store.root.childTransaction(() => fn(store))` in place of `store.root.transaction(...)` at :886, wrapped in Promise.resolve (a nested child returns a plain value); its callback type no longer allows a Promise result, and a thenable result is refused by throwing 'withWriteTxn callbacks must be synchronous' inside the child (aborting it). The race against the probe timer, confirmLockLoss and recordLocksLost stay as they are. src/db/graph/__tests__/store-health.test.ts: the locks-lost test (:84-107) also counts childTransaction; the slow-healthy-write test (:145-165) uses a synchronous callback with store.root.childTransaction wrapped to resolve after a delay past the bound.

**Acceptance checks:**
- A withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen
- Of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept
- An async callback is refused with 'withWriteTxn callbacks must be synchronous' and keeps nothing; the type rejects it (@ts-expect-error)
- store-health.test.ts passes with childTransaction counted and the slow write probed at each bound
- All existing db and graph suites pass

### 1.2 E202610165437d6e5:S001:T002 — The migration runner and the first-boot write run as child transactions

src/db/graph/migrations.ts:442-448 runs each step and its version write in `store.root.childTransaction(async () => { ... })` (steps may stay async: they run inside the store's open before any caller can reach the store) and the comment at :444-446 says what holds; the first-boot write at src/db/graph/store.ts:607-610 uses `root.childTransaction`. src/db/graph/__tests__/migrations.test.ts gains row assertions: a step that writes rows and throws leaves neither its rows nor its version write, earlier steps stay committed.

**Acceptance checks:**
- A throwing migration step leaves neither its rows nor its version write; earlier steps stay committed
- A fresh store still boots at the current version with the shared-modules rows
- Existing migration suites pass

### 1.3 E202610165437d6e5:S001:T003 — Pin lmdb's transaction behaviour and the store's open options

New src/db/graph/__tests__/lmdb-txn-semantics.test.ts: in a fresh process after a reopen (the store-child.ts harness or a direct child), root.transaction keeps a throwing callback's write, root.childTransaction and root.transactionSync discard it. A test that the store opens without useWritemap (child transactions available). lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged.

**Acceptance checks:**
- The pin test fails if lmdb starts discarding root.transaction writes or keeping childTransaction ones
- The lock-loss suites pass unchanged

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| withWriteTxn: a callback that writes rows in two sub-DBs and throws rejects with its own error and leaves nothing behind (read back in-process and after closeGraphStore/reopen); a callback that returns commits as before (src/db/graph/__tests__/write-txn-atomic.test.ts) | `t1` |
| withWriteTxn: two callers queued together, one throwing and one succeeding: only the successful caller's writes are kept | `t1` |
| withWriteTxn: a callback that returns a Promise is refused with 'withWriteTxn callbacks must be synchronous' and leaves nothing behind (the type also rejects it at compile time, checked with // @ts-expect-error) | `t1` |
| runMigrations: a step that writes rows and throws leaves neither its rows nor the version write; earlier steps stay committed (extends src/db/graph/__tests__/migrations.test.ts with row assertions) | `t2` |
| store-health: after locks-lost no library transaction is called, counting childTransaction as well as transaction and transactionSync (src/db/graph/__tests__/store-health.test.ts) | `t1` |
| the store opens without useWritemap, so child transactions are available | `t3` |
| store-health 'slow healthy write' keeps its intent with a synchronous callback: the test wraps store.root.childTransaction so its promise resolves only after a delay past the bound (a test seam, restored afterwards; no library transaction is held open, which would nest the write instead), and asserts that the probe ran at each bound, returned every time, and the write completed | `t1` |
| lmdb behaviour pin, in a fresh process after a reopen: root.transaction keeps a throwing callback's write; root.childTransaction and root.transactionSync discard it (src/db/graph/__tests__/lmdb-txn-semantics.test.ts) | `t3` |
| src/db/graph/__tests__/lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged (withWriteTxn still reports 'write-timeout-probe' within the bound) | `t3` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD ISSUE-5437d6e5 S001 api: withWriteTxn (childTransaction, synchronous callbacks only, Promise.resolve)`
- **[[c2]]** `prior-artifact` `LLD ISSUE-5437d6e5 S001 api: runMigrations and getGraphStore's first-boot write (childTransaction)`
- **[[c3]]** `prior-artifact` `LLD ISSUE-5437d6e5 S001 errorPaths`
- **[[c4]]** `prior-artifact` `LLD ISSUE-5437d6e5 S001 testStrategy`
- **[[c5]]** `prior-artifact` `LLD ISSUE-5437d6e5 S001 migration and backwardCompat`
