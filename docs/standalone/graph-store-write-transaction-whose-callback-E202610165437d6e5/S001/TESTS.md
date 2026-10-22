<!-- insrc:artifact TESTS-5437d6e54c9e7d48-s1 -->

# Tests: 5437d6e54c9e7d48 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-16T12:31:24.350Z on commit `6898998f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/graph/__tests__/write-txn-atomic.test.ts: a throwing callback leaves nothing (in-process and after a reopen); a throwing and a succeeding caller queued together; an async callback refused and keeping nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen | `src/db/graph/__tests__/write-txn-atomic.test.ts` |
| pass | of two callers queued together, one throwing and one succeeding, only the successful one's writes are kept | `src/db/graph/__tests__/write-txn-atomic.test.ts` |
| pass | an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it | `src/db/graph/__tests__/write-txn-atomic.test.ts` |

**unit: src/db/graph/__tests__/store-health.test.ts: no library transaction (childTransaction counted) after locks-lost; the slow healthy write probed at each bound with a synchronous callback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | health record: after locks-lost a further store call throws the named error and closeGraphStore skips the library's close | `src/db/graph/__tests__/store-health.test.ts` |
| pass | slow healthy write: the probe runs and returns, nothing is recorded, the write completes | `src/db/graph/__tests__/store-health.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/store-health.test.ts` | 0 | 6 | 1.2 s |  |
| `src/db/graph/__tests__/write-txn-atomic.test.ts` | 0 | 3 | 0.8 s |  |

## t2

Run at 2026-10-16T12:33:54.676Z on commit `f04796f9`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/db/graph/__tests__/migrations.test.ts: a throwing step leaves neither its rows nor its version write; earlier steps stay committed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a throwing step leaves neither its rows nor its version write; earlier steps stay committed (ISSUE-5437d6e5) | `src/db/graph/__tests__/migrations.test.ts` |
| pass | runMigrations leaves intermediate version on disk after a per-step crash | `src/db/graph/__tests__/migrations.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/migrations.test.ts` | 0 | 13 | 1.5 s |  |

## t3

Run at 2026-10-16T12:36:16.256Z on commit `91892140`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/db/graph/__tests__/lmdb-txn-semantics.test.ts: in a fresh process after a reopen, root.transaction keeps a throwing callback's write, childTransaction and transactionSync discard it; the store opens without useWritemap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lmdb behaviour pin: after a reopen in a fresh process, root.transaction keeps a throwing callback's write, root.childTransaction and root.transactionSync discard it | `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` |
| pass | the store opens without writemap mode, so child transactions are available | `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` |

**integration: src/db/graph/__tests__/lock-loss-detection.test.ts and lock-loss-reproduction.test.ts pass unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | detection through the real wrappers: asynchronous write by probe, synchronous write at once | `src/db/graph/__tests__/lock-loss-detection.test.ts` |
| pass | control: the same wrappers on a store that was not broken write and record nothing | `src/db/graph/__tests__/lock-loss-detection.test.ts` |
| pass | store library after another process removed its locks | `src/db/graph/__tests__/lock-loss-reproduction.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/lmdb-txn-semantics.test.ts` | 0 | 2 | 0.7 s |  |
| `src/db/graph/__tests__/lock-loss-detection.test.ts` | 0 | 2 | 1.8 s |  |
| `src/db/graph/__tests__/lock-loss-reproduction.test.ts` | 0 | 4 | 7.7 s |  |
