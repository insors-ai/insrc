<!-- insrc:artifact TESTS-86197ac660732ceb-s4 -->

# Tests: 86197ac660732ceb s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t5

Run at 2026-10-29T08:13:45.184Z on commit `804daf0bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again | `src/daemon/threads/__tests__/lazy-runtime.test.ts` |

**unit: lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build | `src/daemon/threads/__tests__/lazy-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/lazy-runtime.test.ts` | 0 | 2 | 0.5 s |  |
