<!-- insrc:artifact TESTS-206db3426ffd4428-s1 -->

# Tests: 206db3426ffd4428 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 27 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T15:27:24.396Z on commit `ed7a49bdd`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Recover bounded snapshots across storage failure, restart and owner revalidation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Progress storage recovers a populated snapshot and revalidates only the matching durable owner | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Progress storage withholds ambiguous publication and reconciles the replaced record | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Progress storage reserves active and terminal capacity without evicting active tasks | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Progress storage quarantines bounded corrupt records and rejects path substitution | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Progress storage rejects unsafe or oversized measurements before writing | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | The complete delivered snapshot fits the byte limit and preserves the terminal result | `src/daemon/task-progress/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/coordinator.test.ts` | 0 | 8 | 1 s |  |
| `src/daemon/task-progress/__tests__/store.test.ts` | 0 | 6 | 0.5 s |  |

## t2

Run at 2026-11-09T16:11:46.333Z on commit `ab9b6f142`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Fence async refresh, duplicate registration and old attempt callbacks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Progress coordinator fences duplicate admission, old owners and a delayed delegate after terminal commit | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress coordinator publishes no terminal outcome when the durable write fails | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress coordinator requires trusted revalidation to bind a recovered attempt to a new epoch | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Recovery publishes an ambiguously committed terminal result exactly once | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Recovery fences conflicting lifecycle evidence at the recovered nonterminal sequence | `src/daemon/task-progress/__tests__/coordinator.test.ts` |

**unit: Meaningful measurement normalization across two tasks with phase and count changes, declared units, unknown totals, duplicate samples, reads and heartbeats**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Meaningful progress revisions isolate tasks and preserve original measurements on repeats and heartbeats | `src/daemon/task-progress/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/coordinator.test.ts` | 0 | 10 | 1.9 s |  |

## t3

Run at 2026-11-09T15:28:24.512Z on commit `ed7a49bdd`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Reject cross-project and cross-conversation reads, controls and raw details**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Reject cross-project and cross-conversation reads, controls and raw details | `src/daemon/task-progress/__tests__/access.test.ts` |

**integration: Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verify trusted launch, denial of forged ordinary IPC scopes, grants across reconnect and restart, revocation and scoped project-history access after removal | `src/daemon/task-progress/__tests__/access.test.ts` |
| pass | Revocation releases exhausted observer capacity and interrupts a blocked subscription | `src/daemon/task-progress/__tests__/access.test.ts` |

**integration: First observer grant requires daemon-owned origin bootstrap or an existing origin capability**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | First observer grant requires daemon-owned origin bootstrap or an existing origin capability | `src/daemon/task-progress/__tests__/access.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/access.test.ts` | 0 | 8 | 1.8 s |  |

## t4

Run at 2026-11-09T13:08:04.186Z on commit `eb419df39`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verify monotonic 60-second fallback, transfer, suspension and unchanged suppression | `src/daemon/task-progress/__tests__/fallback.test.ts` |

**unit: Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Removing one conversation releases its activity without stopping its tasks or other conversations | `src/daemon/task-progress/__tests__/access.test.ts` |

**unit: Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Fence scheduler claim, renew, release, duplicate slots and late replies across transfer with deterministic 60-second cadence and 120-second expiry | `src/daemon/task-progress/__tests__/fallback.test.ts` |

**integration: Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination | `src/daemon/task-progress/__tests__/coordinator.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/access.test.ts` | 0 | 4 | 1 s |  |
| `src/daemon/task-progress/__tests__/coordinator.test.ts` | 0 | 6 | 0.7 s |  |
| `src/daemon/task-progress/__tests__/fallback.test.ts` | 0 | 2 | 0.4 s |  |

## t5

Run at 2026-11-09T15:29:49.800Z on commit `ed7a49bdd`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Check stop, cancel replay and verified completion races**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Check stop, cancel replay and verified completion races | `src/daemon/task-progress/__tests__/access.test.ts` |

**integration: Saturate per-project active/inactive and global reservations, coalesce full observer queues, and preserve terminal delivery and running execution**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | A full observer queue coalesces progress and reserves the verified terminal frame | `src/daemon/task-progress/__tests__/access.test.ts` |
| pass | Observation refusal at project and global capacity or on file failure leaves execution running | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Inactive retention evicts only the oldest record for the saturated project | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Revoking a conversation discards its reserved terminal frame after storage eviction | `src/daemon/task-progress/__tests__/access.test.ts` |

**integration: Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Verify S001/#42 to s1–s2, S002/#43 to s6 and S003/#44 to s5 from local predecessor records and successor scope | `src/daemon/task-progress/__tests__/predecessors.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/access.test.ts` | 0 | 8 | 1.7 s |  |
| `src/daemon/task-progress/__tests__/coordinator.test.ts` | 0 | 8 | 0.7 s |  |
| `src/daemon/task-progress/__tests__/predecessors.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/task-progress/__tests__/store.test.ts` | 0 | 6 | 0.6 s |  |

## t6

Run at 2026-11-09T14:23:30.747Z on commit `0b05fce64`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Verify merged-baseline root build and single full repository sweep with recorded results and disposition of any failures**

Reported by the builder, not run by the gate: **pass**. Evidence: This result applies to the named verification criterion, including failure disposition. The underlying combined sweep exited 1 with 485 failures and 7 cancellations. docs/epics/show-long-running-task-progress-chat-E20261109206db342/S001/VERIFICATION.md records the original run, corrected registry test with a passing focused rerun, and the authorized exception for 487 reproduced upstream signatures and three non-reproducing signatures.
