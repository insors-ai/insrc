<!-- insrc:artifact TESTS-484fcef7efaf229e-s4 -->

# Tests: 484fcef7efaf229e s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t3

Run at 2026-10-29T10:16:22.549Z on commit `0ce46e23e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S4-RETIRE: proposed private retirement-owner tests for exact tokens, 64/65 root and 256/257 daemon capacity, cancellation and already-owned shutdown drains.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-RETIRE: shared budget enforces 64 per root and 256 daemon-wide without eviction | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: opaque tokens bind owner, operation and revision and only uncommitted reservations cancel | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: failed close retains exact ownership and concurrent retries share one attempt | `src/daemon/db/__tests__/removal-retirement.test.ts` |
| pass | CM-S4-RETIRE: shutdown drains already-owned resources at capacity and keeps failures for retry | `src/daemon/db/__tests__/removal-retirement.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/removal-retirement.test.ts` | 0 | 4 | 0.5 s |  |

## t4

Run at 2026-10-29T10:21:30.021Z on commit `5d42177e7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S4-RETIRE/INVALIDATE: extend src/daemon/db/__tests__/connection-leases.test.ts with paused/failed SDK close, late construction, exact revision detachment and retained retry handles.**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S4-INVALIDATE: removal detaches an unused revision synchronously without constructing it | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: failed and paused removal cleanup retains the old handle across same-ID recreation | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: late raw construction cannot escape a removed revision and is strictly closed | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: cancellation preserves generation and unresolved preparation blocks reload and shutdown | `src/daemon/db/__tests__/connection-leases.test.ts` |
| pass | CM-S4-RETIRE: failed idle close retains its exact driver for later strict removal retry | `src/daemon/db/__tests__/connection-leases.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/connection-leases.test.ts` | 0 | 17 | 1.7 s |  |
