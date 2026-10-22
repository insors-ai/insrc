<!-- insrc:artifact TESTS-86197ac660732ceb-s2 -->

# Tests: 86197ac660732ceb s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-22T08:05:05.885Z on commit `e3f1203a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 1 | 0.9 s |  |

## t2

Run at 2026-10-22T08:08:05.117Z on commit `6ce2d867`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |

**unit: the method-class module loads on a worker without importing a handler module**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the method-class module loads on a worker without importing a handler module | `src/daemon/threads/__tests__/method-class.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 3 | 0.9 s |  |
