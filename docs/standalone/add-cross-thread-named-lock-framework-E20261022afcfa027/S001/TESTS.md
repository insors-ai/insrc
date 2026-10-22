<!-- insrc:artifact TESTS-afcfa02717f5bf7d-S001 -->

# Tests: afcfa02717f5bf7d S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
