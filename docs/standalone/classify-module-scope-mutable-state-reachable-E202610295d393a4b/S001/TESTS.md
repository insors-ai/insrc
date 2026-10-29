<!-- insrc:artifact TESTS-5d393a4b122cf64a-S001 -->

# Tests: 5d393a4b122cf64a S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T12:03:40.473Z on commit `c9afc8032`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: module-state-inventory.test.ts: the scanner reports lets, constructed containers and written const literals, skips read-only and frozen tables, follows dynamic imports and skips modules outside the closure (temp project)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: the scanner reports lets, constructed containers and written const literals, skips read-only and frozen tables, follows dynamic imports and skips modules outside the closure | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**unit: module-state-inventory.test.ts: the scanner throws on an unreadable tsconfig and is deterministic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: the scanner throws on an unreadable tsconfig and is deterministic | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 2 | 1.5 s |  |

## t2

Run at 2026-10-29T12:05:12.825Z on commit `ed84114a5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: module-state-inventory.test.ts: the guard names a missing key, a stale key, an invalid class, a missing owner, a short reason and an unrouted shared-state owner, and reports nothing on a clean input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: the guard names a missing key, a stale key, an invalid class, a missing owner, a short reason and an unrouted shared-state owner, and reports nothing on a clean input | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 3 | 1.4 s |  |

## t3

Run at 2026-10-29T12:09:23.490Z on commit `340ad22bf`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: module-state-inventory.test.ts: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: every scanned key under src/daemon/ has a valid fixture entry, and the s3 families are one-owner on the shared-state worker or shared-store | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 4 | 2.8 s |  |

## t4

Run at 2026-10-29T12:13:08.214Z on commit `69befaa89`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: module-state-inventory.test.ts: every module-scope mutable value the session worker can load is classified (full guard over the repo)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: every module-scope mutable value the session worker can load is classified (full guard over the repo) | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 5 | 2.9 s |  |

## t5

Run at 2026-10-29T12:49:16.098Z on commit `0a49226b1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: module-state-inventory.test.ts: every one-owner or shared-store entry names the mechanism that gives it one copy (no unresolved candidate is left in the fixture)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | module-state inventory: every move candidate carries a recorded decision, and every one-owner or shared-store entry names its mechanism | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 6 | 3.5 s |  |

## t6

Run at 2026-10-29T12:59:29.214Z on commit `da7fc5a18`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: method-class.test.ts and a two-session-worker test per moved family: both workers reach the one owner (or, with no inline moves, method-class.test.ts still passes)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | method sets: every served chat.*, todos.*, understanding.*, models.* and codeReview.* method is in the shared-state set | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | router: two sessions' model checks and code-review turns reach the one shared-state worker; other step tools stay on the session's worker (Story 5d393a4b) | `src/daemon/threads/__tests__/router-session.test.ts` |
| pass | router: analyze.run.status and analyze.run.purge from another session reach the worker running the analyze run; a run live nowhere is answered by the session's worker | `src/daemon/threads/__tests__/analyze-run-owner.test.ts` |
| pass | live runs: the publisher hears a run id when it becomes live and when it stops, once each, however many runs share the id | `src/daemon/threads/__tests__/analyze-run-owner.test.ts` |
| pass | status board: a worker's live analyze runs reach the board through the hub; a stop from another thread or the owner's exit is handled | `src/daemon/threads/__tests__/analyze-run-owner.test.ts` |
| pass | tool settings set by one session reach every session worker, those already running and those started later | `src/daemon/threads/__tests__/module-state-moves.test.ts` |
| pass | module-state inventory: every move candidate carries a recorded decision, and every one-owner or shared-store entry names its mechanism | `src/daemon/threads/__tests__/module-state-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/analyze-run-owner.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 7 | 1 s |  |
| `src/daemon/threads/__tests__/module-state-inventory.test.ts` | 0 | 6 | 2.7 s |  |
| `src/daemon/threads/__tests__/module-state-moves.test.ts` | 0 | 1 | 2.7 s |  |
| `src/daemon/threads/__tests__/router-session.test.ts` | 0 | 18 | 1.2 s |  |

## t7

Run at 2026-10-29T13:02:53.983Z on commit `7a68f9c3d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: session-source-inventory.test.ts: the entries for files this Story edited match (or no production file was edited)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S4-GATE: reviewed removal sources include pure helpers owner boundaries and pending global affinity | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 3 | 13.2 s |  |
