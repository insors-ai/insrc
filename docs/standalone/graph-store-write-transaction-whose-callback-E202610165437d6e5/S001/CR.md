<!-- insrc:artifact CR-5437d6e54c9e7d48-S001 -->

# Code review: 5437d6e54c9e7d48:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 4 · model `claude:opus`

**Changed files:** 6

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/db/graph/__tests__/write-txn-atomic.test.ts:1 | Present but unverified: all four promised new or changed test files (write-txn-atomic, store-health, migrations, lmdb-txn-semantics) are in the diff, and each one calls the changed code by name: withWriteTxn, runMigrations, and getGraphStore on a fresh path. No build record exists, and I was not allowed to run the suites here, so whether they pass is unconfirmed. The empty testsReaching edges on store.ts and migrations.ts come from file-level diff entities, which the graph does not link to tests. They are not evidence of a coverage gap, so I have not reported them as HIGH breaches. |
| MED | src/db/graph/store.ts:607 | The first-boot write in getGraphStore now runs in root.childTransaction so that a throw leaves no partial first boot. No test makes writeSchemaVersion or provisionSharedModulesRows throw and then checks that nothing was kept. Every fresh-path test (for example the second lmdb-txn-semantics case) only covers the successful first boot. The new rollback behaviour of this call site is therefore not exercised. The lmdb-txn-semantics pin covers the library's child-transaction semantics, but not this call site. |
| LOW | src/db/graph/store.ts:916 | withWriteTxn now wraps the childTransaction result in Promise.resolve because a child transaction opened inside an already-open transaction returns a plain value. No test calls withWriteTxn while a transaction is already open, so this nested-return branch is not exercised. |
| LOW | src/db/graph/__tests__/store-health.test.ts:93 | The plan promised that lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged. Neither file is in the diff, and there is no build record, so I cannot confirm from here that they pass. Their pass-state is unverified, not missing. |

## quality — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/db/graph/store.ts:909 | The compile-time guard `SyncResult<T>` is the only thing that stops a partial write. When a callback's return type is `any` (for example a helper typed `(s) => any` that is actually async), `SyncResult<any>` resolves to `any`, so the callback type-checks. At run time the thenable is refused and the writes made before the first await are aborted. The refused Promise keeps running, though, so every write it makes after an await commits as a standalone lmdb write while the caller sees a rejection. The doc comment says this. The hole is narrow (it needs an `any`-typed callback), but the result is the same partial-write state this Story set out to remove. A lint rule or an explicit `unknown` constraint on callers would close it. |
| LOW | src/db/graph/__tests__/lmdb-txn-semantics.test.ts:56 | `root.close()` is only reached on the success path. If any of the three assert.rejects/assert.throws calls above it fails, the finally block calls `rmSync` on a directory whose LMDB environment is still open in this process, and the handle leaks for the rest of the test run. Moving the close into the finally block, guarded so it runs once, keeps a failing pin from leaving an open environment behind. |

