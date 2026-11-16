<!-- insrc:artifact TESTS-206db3426ffd4428-s3 -->

# Tests: 206db3426ffd4428 s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 50 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-14T18:49:44.773Z on commit `f5c3b8c06`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-workers-progress-of.test.ts: progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | progressOf returns a clone of the last accepted progress and undefined for a closing or unknown key | `src/daemon/threads/__tests__/review-workers-progress-of.test.ts` |

**integration: src/daemon/threads/__tests__/review-workers-progress-of.test.ts: progressOf is read-only and never advances sequence or renews grace**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | progressOf is read-only and never advances sequence or renews grace | `src/daemon/threads/__tests__/review-workers-progress-of.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-workers-progress-of.test.ts` | 0 | 2 | 2.2 s |  |

## t2

Run at 2026-11-14T18:57:53.396Z on commit `462bbbf6f`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: validators accept the sc5 shapes and reject unknown kinds, extra fields and over-long labels**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validators accept the sc5 shapes and reject unknown kinds, extra fields and over-long labels | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: design review reports active chunk, reviewed against selected chunks and retained coverage separately**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | design review reports active chunk, reviewed against selected chunks and retained coverage separately | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: code review reports active task, completed against total tasks and publication state**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | code review reports active task, completed against total tasks and publication state | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: retries and follow-up stay null when the engine reports none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | retries and follow-up stay null when the engine reports none | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: foreign identity, inconsistent counts and unverified admission map to null**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | foreign identity, inconsistent counts and unverified admission map to null | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: a mapped measurement fits the 8 KiB snapshot bound**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a mapped measurement fits the 8 KiB snapshot bound | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/review-measurements.test.ts` | 0 | 6 | 0.6 s |  |

## t3

Run at 2026-11-14T19:15:38.627Z on commit `47a976f23`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: a delayed publication from an earlier incarnation does not replace the newer measurement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a delayed publication from an earlier incarnation does not replace the newer measurement | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-measurements.test.ts: heartbeat-only samples keep counts and meaningful revision unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | heartbeat-only samples keep counts and meaningful revision unchanged | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: an interrupted review reads as interrupted until the new incarnation is verified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an interrupted review reads as interrupted until the new incarnation is verified | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: a missing or closing entry returns null without throwing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing or closing entry returns null without throwing | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**integration: src/daemon/task-progress/__tests__/review-measurements.test.ts: observing progress leaves review results, publication and approval unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | observing progress leaves review results, publication and approval unchanged | `src/daemon/task-progress/__tests__/review-measurements.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/review-measurements.test.ts` | 0 | 13 | 1.4 s |  |

## t4

Run at 2026-11-14T19:36:32.247Z on commit `f4c37ecae`. Tests check: **passed**. 28 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/task-progress/__tests__/review-producers.test.ts: register both delegates through registerProducer and ProducerPort.register with a minted authorization**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | register both delegates through registerProducer and ProducerPort.register with a minted authorization | `src/daemon/task-progress/__tests__/review-producers.test.ts` |
| pass | S2 producer relay admits only a verified project origin and worker attempt | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | Progress coordinator fences duplicate admission, old owners and a delayed delegate after terminal commit | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress storage recovers a populated snapshot and revalidates only the matching durable owner | `src/daemon/task-progress/__tests__/store.test.ts` |

**integration: src/daemon/task-progress/__tests__/review-producers.test.ts: a review measurement is committed and read back through the one store and an unknown kind is rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review measurement is committed and read back through the one store and an unknown kind is rejected | `src/daemon/task-progress/__tests__/review-producers.test.ts` |
| pass | S2 workflow progress preserves streaming frames and terminal result | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | Meaningful progress revisions isolate tasks and preserve original measurements on repeats and heartbeats | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress storage withholds ambiguous publication and reconciles the replaced record | `src/daemon/task-progress/__tests__/store.test.ts` |

**integration: src/daemon/task-progress/__tests__/review-producers.test.ts: second registration of the same kind is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | second registration of the same kind is refused | `src/daemon/task-progress/__tests__/review-producers.test.ts` |
| pass | S2 detached workflow preserves poll cursor and abort behavior across observer loss | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | Progress coordinator publishes no terminal outcome when the durable write fails | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress storage reserves active and terminal capacity without evicting active tasks | `src/daemon/task-progress/__tests__/store.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-producers.test.ts: committed workflow and analysis record fixtures decode with the composed validator**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | committed workflow and analysis record fixtures decode with the composed validator | `src/daemon/task-progress/__tests__/review-producers.test.ts` |
| pass | S2 producer relay preserves early terminal evidence and releases unresolved admissions | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | Recovery publishes an ambiguously committed terminal result exactly once | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Inactive retention evicts only the oldest record for the saturated project | `src/daemon/task-progress/__tests__/store.test.ts` |

**unit: src/daemon/task-progress/__tests__/review-producers.test.ts: DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DesignReviewDetails and CodeReviewDetails pass the bounded measurement schema and stay under 8 KiB | `src/daemon/task-progress/__tests__/review-producers.test.ts` |
| pass | S2 quiet owner renews activity and worker loss fences stale evidence | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | S2 analysis progress preserves stage frames and the analyze.result then done sequence | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | S2 analysis preserves cached completion cancellation and persisted status | `src/daemon/task-progress/__tests__/executor-relay.test.ts` |
| pass | Recovery fences conflicting lifecycle evidence at the recovered nonterminal sequence | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | The complete delivered snapshot fits the byte limit and preserves the terminal result | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress coordinator requires trusted revalidation to bind a recovered attempt to a new epoch | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Verify 30-second owner renewal and 120-second expiry with no observers, separate tasks in one chat, removal, and stale callbacks | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Restart repeatedly without owners, preserve the recovery deadline, release expired reservations and refuse stale revalidation without inventing termination | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Observation refusal at project and global capacity or on file failure leaves execution running | `src/daemon/task-progress/__tests__/coordinator.test.ts` |
| pass | Progress storage quarantines bounded corrupt records and rejects path substitution | `src/daemon/task-progress/__tests__/store.test.ts` |
| pass | Progress storage rejects unsafe or oversized measurements before writing | `src/daemon/task-progress/__tests__/store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/task-progress/__tests__/coordinator.test.ts` | 0 | 10 | 0.7 s |  |
| `src/daemon/task-progress/__tests__/executor-relay.test.ts` | 0 | 7 | 1.3 s |  |
| `src/daemon/task-progress/__tests__/review-producers.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/task-progress/__tests__/store.test.ts` | 0 | 6 | 0.6 s |  |

## t5

Run at 2026-11-15T18:16:31.539Z on commit `5a87d0ec6`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-task-binding.test.ts: an observed review is registered as a task of kind design-review or code-review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an observed review is registered as a task of kind design-review or code-review | `src/daemon/threads/__tests__/review-task-binding.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-binding.test.ts: a review without an origin, session or capacity is admitted exactly as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a review without an origin, session or capacity is admitted exactly as before | `src/daemon/threads/__tests__/review-task-binding.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-binding.test.ts: a failure to launch or register never fails or slows the review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure to launch or register never fails or slows the review | `src/daemon/threads/__tests__/review-task-binding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-task-binding.test.ts` | 0 | 3 | 1.1 s |  |

## t6

Run at 2026-11-15T19:29:48.813Z on commit `049aefd38`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: an observed review's task progress changes as publications are accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an observed review's task progress changes as publications are accepted | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: terminal evidence follows the owner's terminal phase and never the review verdict**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | terminal evidence follows the owner's terminal phase and never the review verdict | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: a coordinator error is swallowed without altering acceptProgress, the board publication or reclaim**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a coordinator error is swallowed without altering acceptProgress, the board publication or reclaim | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: snapshot after interruption shows interrupted or stale, then a newer incarnation is verified**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | snapshot after interruption shows interrupted or stale, then a newer incarnation is verified | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: a delayed publication from the earlier incarnation does not overwrite the newer snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a delayed publication from the earlier incarnation does not overwrite the newer snapshot | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-task-signal.test.ts` | 0 | 5 | 1 s |  |

## t7

Run at 2026-11-15T19:42:14.306Z on commit `88f2014e5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-task-signal.test.ts: the normalized projection of an unobserved review is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the normalized projection of an unobserved review is unchanged | `src/daemon/threads/__tests__/review-task-signal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-task-signal.test.ts` | 0 | 6 | 1.1 s |  |
