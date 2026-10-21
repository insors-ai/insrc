<!-- insrc:artifact TESTS-86197ac660732ceb-s1 -->

# Tests: 86197ac660732ceb s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T15:03:00.014Z on commit `b038c9e4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a worker thread's LMDB open, read, write, close and exit keep the daemon's lock, and the main thread writes after another process opens and closes the store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker thread's open, write, close and exit keep the daemon's lock, and the daemon writes after another process opens and closes the store | `src/db/graph/__tests__/worker-thread-lock.test.ts` |

**integration: the lock probe reports a dropped lock after a stray descriptor on the lock file is closed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | control: the lock check reports a dropped lock after a stray descriptor on the lock file is closed | `src/db/graph/__tests__/worker-thread-lock.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/worker-thread-lock.test.ts` | 0 | 3 | 0.8 s |  |
