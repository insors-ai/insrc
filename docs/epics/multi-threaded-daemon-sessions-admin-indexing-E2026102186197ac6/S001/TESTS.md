<!-- insrc:artifact TESTS-86197ac660732ceb-s1 -->

# Tests: 86197ac660732ceb s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t2

Run at 2026-10-21T15:16:42.801Z on commit `e61cc5a3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: withStore releases its permit on resolve, reject, synchronous throw and abort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withStore releases its permit on resolve, reject, synchronous throw and abort | `src/db/__tests__/store-guard.test.ts` |

**unit: an acquisition past its limit fails with StoreLockTimeoutError naming the holder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an acquisition past its limit fails with StoreLockTimeoutError naming the holder | `src/db/__tests__/store-guard.test.ts` |

**unit: two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two concurrent same-thread withStore calls on a one-permit store both complete in turn; withStore inside a held op fails with StoreLockNestedError | `src/db/__tests__/store-guard.test.ts` |

**unit: reclaim releases after quiescence and marks the store unhealthy past limitMs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reclaim releases after quiescence and marks the store unhealthy past limitMs | `src/db/__tests__/store-guard.test.ts` |

**integration: a worker terminated while holding a permit has it reclaimed and another worker then acquires it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker terminated while holding a permit has it reclaimed and another worker then acquires it | `src/db/__tests__/store-guard.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/store-guard.test.ts` | 0 | 5 | 0.9 s |  |

## t3

Run at 2026-10-21T15:18:51.724Z on commit `ce92f270`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a worker's hub request is answered with its own requestId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker's hub request is answered with its own requestId | `src/daemon/threads/__tests__/channel.test.ts` |

**integration: closing the port rejects every pending hub request with HubUnavailableError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | closing the port rejects every pending hub request with HubUnavailableError | `src/daemon/threads/__tests__/channel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/channel.test.ts` | 0 | 2 | 0.6 s |  |

## t4

Run at 2026-10-21T15:20:58.413Z on commit `b2c89fda`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TargetRegistry refuses a second live admin, indexing, unattributed or same-session target and resolves an identity-less session request to the unattributed target | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a target re-registered after unregister succeeds and unregistering an unknown thread is a no-op | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: StatusBoard keeps the latest status per thread and snapshots empty as specified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | StatusBoard keeps the latest status per thread and snapshots empty as specified | `src/daemon/threads/__tests__/registry-board.test.ts` |

**unit: publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publishIndexing, publishClients, publishRun and publishStore are each reflected in snapshot, runs by runId with frames only growing | `src/daemon/threads/__tests__/registry-board.test.ts` |

**integration: a status published from a worker appears in a main-thread snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a status published from a worker appears in a main-thread snapshot | `src/daemon/threads/__tests__/registry-board.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/registry-board.test.ts` | 0 | 5 | 0.5 s |  |
