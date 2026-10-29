<!-- insrc:artifact TESTS-484fcef7efaf229e-s4 -->

# Tests: 484fcef7efaf229e s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T10:08:25.734Z on commit `1df739847`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-INPUT: extend src/shared/__tests__/connection-management.test.ts for exact cleanup/status decoders, wrong mode/target and unchanged receipt keys.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-INPUT: removal state and cleanup accept only a bounded exact remove ticket | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S4-INPUT: existing remove target validation and persisted outcome shape stay unchanged | `src/shared/__tests__/connection-management.test.ts` |
| pass | CM-S1-J: protocol declarations compile in strict NodeNext including negative secret-field assignments | `src/shared/__tests__/connection-management.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-management.test.ts` | 0 | 6 | 4 s |  |

## t2

Run at 2026-10-29T10:12:55.214Z on commit `08f5e1719`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-CONFIRM/STATE: proposed pure-state tests for exact repository/ID/scope, zero-effect cancellation, unknown outcomes and independent cleanup phases.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-CONFIRM: cancellation creates no command or ticket and confirmation captures the exact generation | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: uncertain status and missing rows never become successful removal | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: committed removal tracks credential and runtime cleanup independently | `src/shared/__tests__/connection-removal.test.ts` |
| pass | CM-S4-STATE: unrelated outcomes cannot assert removal and projections never copy unsafe fields | `src/shared/__tests__/connection-removal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-removal.test.ts` | 0 | 4 | 0.3 s |  |
