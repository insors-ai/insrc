<!-- insrc:artifact LLD-5437d6e54c9e7d48-S001 -->

# LLD: E202610165437d6e5:S001

## Summary

**Epic:** `graph-store-write-transaction-whose-callback`
**HLD base run:** `wf-1792152664803-w0wldi`
**HLD effective hash:** `5e1b1ad5a79d...`

Every write transaction of the graph store becomes all-or-nothing when its callback throws. The store's write helper, the schema migration runner and the first-boot write switch from lmdb's batched transaction, which commits a failed callback's writes, to its child transaction, which aborts them, while keeping the batching and the bounded wait for a store that lost its locks. Tests pin the library behaviour and read the results back after reopening the store.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `withWriteTxn`

```typescript
function withWriteTxn<T>(fn: (store: GraphStore) => T extends PromiseLike<unknown> ? never : T): Promise<T>  // src/db/graph/store.ts:882; the callback must be synchronous
```

**Parameters:**
- `fn: (store: GraphStore) => T (synchronous; a Promise-returning callback is a compile-time error)` — The writes of one transaction.

**Returns:** `Promise<T>` — The callback's result once its writes are committed.

**Errors:**
- `Error` when The callback threw: the promise rejects with that same error and none of the callback's writes are kept.
- `LmdbStoreLocksLostError` when The store lost its locks (as today: the bounded wait's probe, or confirmLockLoss on a thrown write error).
- `Error` when The callback returned a thenable: the child transaction is aborted and the promise rejects with 'withWriteTxn callbacks must be synchronous' (nothing is kept).

**Postconditions:**
- The callback must be synchronous: an async child callback keeps lmdb's write transaction open across its await, and a second caller arriving then would run nested inside it and lose its writes if the first throws (probed), so a thenable result is refused and aborted.
- The callback runs as an lmdb child transaction (`store.root.childTransaction(() => fn(store))` in place of `store.root.transaction(...)` at :886): if it throws, every write it made is aborted, while other callers' writes queued in the same batch are committed.
- On success the writes commit exactly as today, in lmdb's shared batch; the promise keeps its async shape, so the race against the probe timer, confirmLockLoss and recordLocksLost('a write transaction', 'write-timeout-probe', ...) are unchanged.
- withWriteTxn wraps the library's result in Promise.resolve, so a value returned by a nested child transaction (lmdb's `when` returns a plain value there) cannot break the `.then` chain at src/db/graph/store.ts:886.

### 2.2 `runMigrations`

```typescript
function runMigrations(store: GraphStore, stored: number, target: number, registry?: readonly Migration[]): Promise<number>  // src/db/graph/migrations.ts; signature unchanged
```

**Parameters:**
- `registry: readonly Migration[]` _(optional)_ — The steps (default MIGRATIONS).

**Returns:** `Promise<number>` — Steps applied, as today.

**Errors:**
- `Error` when A step threw: the run rejects with it, and neither that step's writes nor its version write are kept; earlier steps stay committed.

**Postconditions:**
- Each step and its version write run in one `store.root.childTransaction(async () => { ... })`, so a throwing step leaves the store exactly as it was before that step.
- The comment at :444-446 says what holds: a thrown step aborts its own writes and the version write.
- Steps may stay async: migrations run inside getGraphStore's open, before any caller can obtain the store, so no other writer can interleave with a step's child transaction.

### 2.3 `getGraphStore`

```typescript
function getGraphStore(): Promise<GraphStore>  // src/db/graph/store.ts; signature unchanged
```

**Returns:** `Promise<GraphStore>` — The open store, as today.

**Postconditions:**
- The first-boot write (src/db/graph/store.ts:607-610: the schema version and the shared-modules rows) runs in `root.childTransaction`, so a throw there leaves no partial first boot.

### 2.4 `withWriteTxnSync`

```typescript
function withWriteTxnSync<T>(store: GraphStore, fn: () => T): T  // src/db/graph/store.ts:935; unchanged
```

**Parameters:**
- `fn: () => T` — Synchronous writes.

**Returns:** `T` — As today.

**Postconditions:**
- Unchanged: transactionSync already aborts on a throw (node_modules/lmdb/write.js:1024-1027); a test now pins it.

## 3. Error paths

**Error cases**

- **A withWriteTxn callback throws after some writes.** (recoverable)
  - Detection: The child transaction's callback throws; lmdb's batch runner catches it in the asChild branch and calls env.abortTxn() (node_modules/lmdb/write.js:663-680); the queued promise rejects with the stored error (:966-969).
  - Response: The child transaction's writes are discarded; withWriteTxn rejects with the callback's own error (confirmLockLoss still inspects it, as today).
  - User impact: The failed operation changes nothing in the store; the caller sees its error.
- **A migration step throws part-way.** (recoverable)
  - Detection: The step's child transaction callback throws inside runMigrations.
  - Response: The step's writes and its version write are aborted; the run rejects; earlier steps stay committed; the daemon's open fails as today and the next open retries the step.
  - User impact: The store is left at the last fully applied version, with no partial step.
- **The store lost its locks while a write is queued.** (terminal)
  - Detection: The child transaction's promise does not settle; withWriteTxn's timer fires and probeForLockLoss reads the store (src/db/graph/store.ts:898-909).
  - Response: As today: recordLocksLost('a write transaction', 'write-timeout-probe', ...) and LmdbStoreLocksLostError.
  - User impact: As today: the daemon reports the lost locks instead of hanging.
- **The store is ever opened in writemap mode.** (recoverable)
  - Detection: lmdb's childTransaction throws 'Child transactions are not supported in writemap mode' (node_modules/lmdb/write.js:905-908).
  - Response: Every write fails loudly; a test pins the store's open options (no useWritemap) so this cannot change unnoticed.
  - User impact: Writes would fail immediately rather than silently lose atomicity.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two callers' writes queued in the same lmdb batch, one throwing and one succeeding. | The throwing caller's writes are discarded; the other caller's writes are committed (probed). |
| A callback that returns normally. | Its writes commit and its result is returned, exactly as before. |
| withWriteTxn called from inside another withWriteTxn callback. | It is not a nested child: withWriteTxn first awaits getGraphStore(), so its child transaction runs after the outer callback's transaction (queued in a later batch); each commits or aborts on its own. |
| A callback that returns a Promise (async callback). | Refused: the child transaction is aborted and the call rejects with 'withWriteTxn callbacks must be synchronous'; what the callback wrote before returning its Promise is not kept. The part after its first await still runs, detached, and any write it makes there is committed as its own write, so the compile-time type (no Promise-returning callback) is the guard; the runtime refusal only reports misuse. |
| An async migration step, while the store is opening. | Runs as one child transaction with its version write; no other writer can reach the store until the open finishes, so nothing interleaves. |

**Invariants to preserve**

- withWriteTxn's signature and its bounded wait and lost-lock reporting are unchanged (src/db/graph/store.ts:882-910). [[c1]]
- Writes stay asynchronous and batched; no write path moves to a synchronous transaction. [[c2]]
- After locks-lost no library transaction is called (store-health.test.ts:84-107), now including childTransaction. [[c3]]

## 4. Test strategy

**Test framework:** `node:test with node:assert/strict through tsx (as src/db/graph/__tests__/*.test.ts); the fresh-process harness src/db/graph/__tests__/helpers/store-child.ts for reads after a reopen`

**Test levels**

- **unit** — withWriteTxn and the migration runner are all-or-nothing on a throw.
  - Subjects: `withWriteTxn: a callback that writes rows in two sub-DBs and throws rejects with its own error and leaves nothing behind (read back in-process and after closeGraphStore/reopen); a callback that returns commits as before (src/db/graph/__tests__/write-txn-atomic.test.ts)`, `withWriteTxn: two callers queued together, one throwing and one succeeding: only the successful caller's writes are kept`, `withWriteTxn: a callback that returns a Promise is refused with 'withWriteTxn callbacks must be synchronous' and leaves nothing behind (the type also rejects it at compile time, checked with // @ts-expect-error)`, `runMigrations: a step that writes rows and throws leaves neither its rows nor the version write; earlier steps stay committed (extends src/db/graph/__tests__/migrations.test.ts with row assertions)`, `store-health: after locks-lost no library transaction is called, counting childTransaction as well as transaction and transactionSync (src/db/graph/__tests__/store-health.test.ts)`, `the store opens without useWritemap, so child transactions are available`, `store-health 'slow healthy write' keeps its intent with a synchronous callback: the test wraps store.root.childTransaction so its promise resolves only after a delay past the bound (a test seam, restored afterwards; no library transaction is held open, which would nest the write instead), and asserts that the probe ran at each bound, returned every time, and the write completed`
  - Fixtures: `temporary store via setGraphStorePath`
- **integration** — The library behaviour the fix rests on, pinned against an lmdb-js upgrade, and the lost-lock path unchanged.
  - Subjects: `lmdb behaviour pin, in a fresh process after a reopen: root.transaction keeps a throwing callback's write; root.childTransaction and root.transactionSync discard it (src/db/graph/__tests__/lmdb-txn-semantics.test.ts)`, `src/db/graph/__tests__/lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged (withWriteTxn still reports 'write-timeout-probe' within the bound)`
  - Fixtures: `store-child.ts child process`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `write-txn-atomic.test.ts: a throwing withWriteTxn callback leaves nothing, in-process and after a reopen (mutation check: back to root.transaction, the test fails)`, `write-txn-atomic.test.ts: an async callback is refused and keeps nothing` |
| `ac2` | `migrations.test.ts: a throwing step leaves neither its rows nor its version write (mutation check: runner back to root.transaction, the rows survive and the test fails)` |
| `ac3` | `lock-loss-detection.test.ts unchanged and passing`, `store-health.test.ts: no library transaction (including childTransaction) after locks-lost` |
| `ac4` | `lmdb-txn-semantics.test.ts: the library's keep/discard behaviour pinned after a reopen` |

## 5. Migration

**State before:** withWriteTxn (src/db/graph/store.ts:886), the migration runner (src/db/graph/migrations.ts:442-448) and the first-boot write (src/db/graph/store.ts:607-610) run their callbacks with lmdb-js root.transaction, which commits a callback's writes even when the callback throws (s1 bundle 2: node_modules/lmdb/write.js:655-704, probes). No stored data changes form.

**State after:** The three run their callbacks with root.childTransaction: a throwing callback's writes are aborted, other callers' batched writes commit, the async shape and the bounded lost-lock wait are unchanged. Tests pin the library behaviour.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Switch the three call sites from root.transaction to root.childTransaction and correct the migration runner's comment; no stored data, schema version or key changes. — ↩ rollbackable
2. Add the regression tests (write-txn atomicity, migration step atomicity, library behaviour pin, store-health counting childTransaction, open options). — ↩ rollbackable
3. Update the installed daemon so the fix runs. — ↩ rollbackable

**Backward compat:** withWriteTxn's callback type is narrowed to synchronous callbacks (all 52 production callers already are; the one async test callback, src/db/graph/__tests__/store-health.test.ts:152, is rewritten to a synchronous one, with the library's childTransaction wrapped to resolve late so the bound is still exceeded); withWriteTxnSync, runMigrations and getGraphStore keep their signatures. The one behaviour change is the fix itself: a callback that throws no longer leaves its earlier writes behind. Four callbacks throw part-way today: upsertEntities (src/db/entities.ts:242, :254, UnregisteredRepoError for an unregistered repository part-way through a batch), reindexFile (src/db/entities.ts:410) and writeDocSummary (src/db/doc-summaries.ts:155); after the fix a batch that throws writes none of its entities instead of those before the bad one. That is the intended all-or-nothing outcome; the mixed-batch test src/db/__tests__/repo-strict-contract.test.ts:187-195 asserts only the registry and is unaffected. No store data is rewritten and SCHEMA_VERSION does not change.

## 6. Alternatives considered

### 6.1 a1: Run every store write callback as an lmdb child transaction — **CHOSEN**

withWriteTxn, the migration runner and the first-boot write call root.childTransaction instead of root.transaction, so a throwing callback's writes are aborted while the batch, the async shape and the bounded lock-loss wait stay as they are.

withWriteTxn (src/db/graph/store.ts:882-910) accepts only a synchronous callback (its type no longer allows a Promise result, and a thenable result is refused by aborting the child transaction with a named error), because an async child callback holds lmdb's write transaction open across its await and a second caller arriving then would run nested inside it and lose its writes if the first throws (probed). It changes one call: `store.root.childTransaction(() => fn(store))` in place of `store.root.transaction(...)` at :886. Outside a write transaction lmdb queues it into the same shared batch as asChild (node_modules/lmdb/write.js:939), where the batch runner opens an abortable nested transaction and aborts it on a throw (:663-680); the promise still rejects with the caller's own error and still never settles on a store that lost its locks, so the race against the probe timer, confirmLockLoss and recordLocksLost are untouched. The migration runner (src/db/graph/migrations.ts:442-448), which keeps async steps because it runs inside the store's open before any caller can reach the store, and the first-boot write (src/db/graph/store.ts:607-610) make the same switch, so a throwing step leaves neither its rows nor the version write behind; the runner's comment is corrected. withWriteTxnSync already uses transactionSync, which aborts on a throw, and is unchanged. A regression test in the fresh-process harness pins the library behaviour (root.transaction keeps, childTransaction and transactionSync discard) so an lmdb upgrade that changes it fails a test.

### 6.2 a2: Run every store write callback synchronously (transactionSync)

withWriteTxn wraps root.transactionSync in a promise, and the migration runner requires synchronous steps, so a throw aborts the whole transaction.

withWriteTxn calls `store.root.transactionSync(() => fn(store))` and returns its result as a resolved promise; the migration runner runs each step and its version write in one transactionSync, which requires every step's run to be synchronous; the first-boot write likewise. The bounded wait for a lost store is replaced by the synchronous path's handling (confirmLockLoss on the thrown error), since a synchronous call cannot be raced against a timer.

**Rejected because:** Atomic, but breaks the bounded lost-lock wait and blocks the event loop on every write.

### 6.3 a3: Keep root.transaction and undo a failed callback's writes

withWriteTxn records the keys a callback writes through a store proxy and, when the callback throws, writes their previous values back in the same batch.

withWriteTxn hands the callback a proxy GraphStore whose sub-DB handles record every put and remove with the key's previous value; on a throw it restores those values before rethrowing. The migration runner and first-boot write use the same proxy.

**Rejected because:** Partial guarantees at the highest cost and risk.

## 7. References

- **[[c1]]** `step-output` `s1 context.assemble bundle 1: the store write paths (src/db/graph/store.ts:882-910, :607-610, :935-947; src/db/graph/migrations.ts:442-448)`
- **[[c2]]** `step-output` `s1 context.assemble bundle 2: lmdb-js 3.5.4 transaction semantics (node_modules/lmdb/write.js:655-704, :663-680, :897-939, :1024-1027) and the 2026-10-16 probes`
- **[[c3]]** `step-output` `s1 context.assemble bundle 3: tests that pin the write paths (src/db/graph/__tests__/migrations.test.ts:151-176, lock-loss-detection.test.ts, store-health.test.ts:84-107)`
- **[[c4]]** `prior-artifact` `docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/ISSUE.md`
- **[[c5]]** `step-output` `s2-s8 alternatives, judgment, contract, error paths, test strategy, migration and audit`
- **[[c6]]** `step-output` `s1 context.assemble bundle 4: interleaving of child transactions (node_modules/lmdb/write.js:666-671, :898, :909) and the probe of a caller nested during an async callback`

## 8. Open questions

- ts1 (partial): the standalone story carries no acceptance criteria; the test strategy maps four derived from the approved issue's fix intent (ac1 a throwing withWriteTxn callback leaves nothing; ac2 a throwing migration step leaves neither rows nor version; ac3 the lost-lock path unchanged; ac4 the lmdb behaviour pinned) [c4] [c5].

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 6 hold** · template `design-issue` · model `cli-claude:opus` · reviewed 2026-10-16T12:11:05.873Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
