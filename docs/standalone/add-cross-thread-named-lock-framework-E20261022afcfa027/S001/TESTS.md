<!-- insrc:artifact TESTS-afcfa02717f5bf7d-S001 -->

# Tests: afcfa02717f5bf7d S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 20 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-22T06:28:21.549Z on commit `3d2d982b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: createLockBlock stores capacities in the header and two managers over one block read the same layout**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createLockBlock stores capacities in the header and two managers over one block read the same layout | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: invalid arguments are refused with LockArgumentError and nothing is truncated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | invalid arguments are refused with LockArgumentError and nothing is truncated | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: a name resolves to one slot and a full name table gives LockCapacityError(names)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a name resolves to one slot and a full name table gives LockCapacityError(names) | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: getLockManager without an install uses a private block**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | getLockManager without an install uses a private block | `src/shared/locks/__tests__/lock-manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/locks/__tests__/lock-manager.test.ts` | 0 | 4 | 0.5 s |  |

## t2

Run at 2026-10-22T06:31:18.142Z on commit `045e7371`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: exclusive excludes exclusive and shared, shared admits shared, mode defaults to exclusive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exclusive excludes exclusive and shared, shared admits shared, mode defaults to exclusive | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: ifAvailable grants when free and otherwise calls back with null and the holders with metadata, never pending**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ifAvailable grants when free and otherwise calls back with null and the holders with metadata, never pending | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: the lock is released and its holder slot cleared on resolve, reject and synchronous throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the lock is released and its holder slot cleared on resolve, reject and synchronous throw | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: same-name nesting and unbounded nested waits fail with LockNestedError; bounded nested requests are allowed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | same-name nesting and unbounded nested waits fail with LockNestedError; bounded nested requests are allowed | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: a full holder table gives LockCapacityError(holders) and leaves no grant behind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a full holder table gives LockCapacityError(holders) and leaves no grant behind | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: the grant hook fires at its three points in order and is inert when unset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the grant hook fires at its three points in order and is inert when unset | `src/shared/locks/__tests__/lock-manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/locks/__tests__/lock-manager.test.ts` | 0 | 10 | 0.4 s |  |

## t3

Run at 2026-10-22T06:46:38.033Z on commit `50770364`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: writer preference: a waiting exclusive blocks ifAvailable shared and runs before a waiting shared**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | writer preference: a waiting exclusive blocks ifAvailable shared and runs before a waiting shared | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: timeoutMs rejects with LockTimeoutError naming the holders and leaves no pending entry or count**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | timeoutMs rejects with LockTimeoutError naming the holders and leaves no pending entry or count | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an already-aborted signal refuses before queuing; an abort while waiting rejects with signal.reason and cleans up | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: requests for one name from one thread are served in arrival order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | requests for one name from one thread are served in arrival order | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: a full pending table gives LockCapacityError(pending) and queues nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a full pending table gives LockCapacityError(pending) and queues nothing | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: a lock wait keeps its thread alive until it completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a lock wait keeps its thread alive until it completes | `src/shared/locks/__tests__/lock-manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/locks/__tests__/lock-manager.test.ts` | 0 | 16 | 1.1 s |  |

## t4

Run at 2026-10-22T06:51:17.426Z on commit `ab7c89f5`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: query lists held and pending entries with mode, threadId, since and metadata**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | query lists held and pending entries with mode, threadId, since and metadata | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: query never returns a slot in its being-written state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | query never returns a slot in its being-written state | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: reclaim releases a thread's holds and pending requests, recounts and wakes waiters**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reclaim releases a thread's holds and pending requests, recounts and wakes waiters | `src/shared/locks/__tests__/lock-manager.test.ts` |

**unit: reclaim takes over a mutex and resets a name claim left by a foreign threadId**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reclaim takes over a mutex and resets a name claim left by a foreign threadId | `src/shared/locks/__tests__/lock-manager.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/locks/__tests__/lock-manager.test.ts` | 0 | 20 | 1.3 s |  |
