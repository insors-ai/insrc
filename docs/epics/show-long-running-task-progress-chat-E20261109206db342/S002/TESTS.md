<!-- insrc:artifact TESTS-206db3426ffd4428-s2 -->

# Tests: 206db3426ffd4428 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-11T12:19:05.191Z on commit `960da97bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: S2 workflow measurements count provider output chunks and preserve legacy token batches**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 workflow measurements count provider output chunks and preserve legacy token batches | `src/daemon/task-progress/__tests__/executor-measurements.test.ts` |

**unit: S2 analysis measurements ignore previews and isolate nested task identities**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 analysis measurements ignore previews and isolate nested task identities | `src/daemon/task-progress/__tests__/executor-measurements.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/executor-measurements.test.ts` | 0 | 2 | 2 s |  |

## t2

Run at 2026-11-11T12:28:54.973Z on commit `dfa56cd4b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S2 producer relay admits only a verified project origin and worker attempt**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 producer relay admits only a verified project origin and worker attempt | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**integration: S2 producer relay preserves early terminal evidence and releases unresolved admissions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 producer relay preserves early terminal evidence and releases unresolved admissions | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**integration: S2 quiet owner renews activity and worker loss fences stale evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 quiet owner renews activity and worker loss fences stale evidence | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/executor-relay.test.ts` | 0 | 3 | 1.1 s |  |

## t3

Run at 2026-11-11T12:37:48.459Z on commit `76ee13aa4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S2 workflow progress preserves streaming frames and terminal result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 workflow progress preserves streaming frames and terminal result | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**integration: S2 detached workflow preserves poll cursor and abort behavior across observer loss**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 detached workflow preserves poll cursor and abort behavior across observer loss | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/executor-relay.test.ts` | 0 | 5 | 21.1 s |  |

## t4

Run at 2026-11-11T12:45:34.126Z on commit `61f7b29ab`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S2 analysis progress preserves stage frames and the analyze.result then done sequence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 analysis progress preserves stage frames and the analyze.result then done sequence | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**integration: S2 analysis preserves cached completion cancellation and persisted status**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S2 analysis preserves cached completion cancellation and persisted status | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/executor-relay.test.ts` | 0 | 7 | 3.9 s |  |
