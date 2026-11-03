<!-- insrc:artifact TESTS-7d42b5dceb62afec-S001 -->

# Tests: 7d42b5dceb62afec S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-03T14:39:01.676Z on commit `f8e36664f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: every change site records its source file in the same transaction, and a non-grouping kind records nothing | `src/db/__tests__/subsystem-changes.test.ts` |

**integration: S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: entity-row removal records its file on every path, and a whole-repository delete drops the contributions and bumps the reset counter | `src/db/__tests__/subsystem-changes.test.ts` |

**integration: S001 t1: a record entry is consumed only while its stamp is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: a record entry is consumed only while its stamp is unchanged | `src/db/__tests__/subsystem-changes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/__tests__/subsystem-changes.test.ts` | 0 | 3 | 1.3 s |  |
