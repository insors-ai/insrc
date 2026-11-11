<!-- insrc:artifact TESTS-e4af63128c7cbec2-s1 -->

# Tests: e4af63128c7cbec2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 24 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T07:52:13.312Z on commit `1191a5352`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts: unverified admission and resource guards preserve pinned code history and refuse approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unverified admission and resource guards preserve pinned code history and refuse approval | `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/shared/__tests__/review-resources.test.ts: bounded exact review lease and clearance receipt contracts reject invalid input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | bounded exact review lease and clearance receipt contracts reject invalid input | `src/shared/__tests__/review-resources.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/review-resources.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/code-review/task-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 1 s |  |

## t2

Run at 2026-11-09T08:05:19.987Z on commit `81edc5d07`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts: historical design attempts and unverified admission retain separate semantics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | historical design attempts and unverified admission retain separate semantics | `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` |

**unit: src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts: serialized resource and progress updates cannot lose open intents**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | serialized resource and progress updates cannot lose open intents | `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/admission-checkpoint.test.ts` | 0 | 1 | 0.8 s |  |
| `src/workflow/review/design-review/__tests__/checkpoint-progress.test.ts` | 0 | 5 | 0.8 s |  |

## t3

Run at 2026-11-09T09:08:06.224Z on commit `35c9f815f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/admission-history.test.ts: failed admission survives successful next attempt publication and post-cleanup reads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failed admission survives successful next attempt publication and post-cleanup reads | `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` |

**integration: src/workflow/review/design-review/__tests__/admission-history.test.ts: technical admission diagnostics remain non-review evidence across publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | technical admission diagnostics remain non-review evidence across publication | `src/workflow/review/design-review/__tests__/admission-history.test.ts` |

**unit: src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts: guard-only updates preserve report identity while reviewed-input or result mutations do not**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guard-only updates preserve report identity while reviewed-input or result mutations do not | `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/admission-history.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/code-review/task-review/__tests__/resource-preservation.test.ts` | 0 | 1 | 1 s |  |
| `src/workflow/review/design-review/__tests__/admission-history.test.ts` | 0 | 1 | 0.9 s |  |

## t4

Run at 2026-11-09T10:00:23.617Z on commit `9f8c8c660`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-processes.test.ts: host leases precede spawn and enforce owner-bound replay and disposal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | host leases precede spawn and enforce owner-bound replay and disposal | `src/daemon/threads/__tests__/review-processes.test.ts` |

**integration: src/daemon/threads/__tests__/review-processes.test.ts: worker loss and unknown child cleanup fence only the owning review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker loss and unknown child cleanup fence only the owning review | `src/daemon/threads/__tests__/review-processes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-processes.test.ts` | 0 | 2 | 1 s |  |

## t5

Run at 2026-11-11T12:23:50.106Z on commit `4fc8bee23`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/agent/providers/__tests__/review-worker-process.test.ts: fake native review CLI streams and cancellation use host-owned leases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | fake native review CLI streams and cancellation use host-owned leases | `src/agent/providers/__tests__/review-worker-process.test.ts` |

**unit: src/agent/providers/__tests__/review-worker-process.test.ts: review binary lookup cannot spawn synchronously on the worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review binary lookup cannot spawn synchronously on the worker | `src/agent/providers/__tests__/review-worker-process.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-worker-process.test.ts` | 0 | 2 | 1.8 s |  |

## t6

Run at 2026-11-11T12:51:57.103Z on commit `43d69ad70`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/__tests__/review-worker-shell.test.ts: Git shell and raw-byte commands preserve output bounds and abort semantics through leases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Git shell and raw-byte commands preserve output bounds and abort semantics through leases | `src/daemon/tools/__tests__/review-worker-shell.test.ts` |

**unit: src/daemon/threads/__tests__/review-spawn-inventory.test.ts: all review-reachable native spawn and exec paths use the host bridge**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | all review-reachable native spawn and exec paths use the host bridge | `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-spawn-inventory.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/__tests__/review-worker-shell.test.ts` | 0 | 1 | 5.9 s |  |

## t7

Run at 2026-11-11T13:38:50.061Z on commit `8e26d2c88`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-bootstrap.test.ts: real worker joins guards and starts from the registered entrypoint**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | real worker joins guards and starts from the registered entrypoint | `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-bootstrap.test.ts: never-ready and pre-save-hung workers fail within the parent bound and reject late acknowledgments**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | never-ready and pre-save-hung workers fail within the parent bound and reject late acknowledgments | `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-worker-bootstrap.test.ts` | 0 | 3 | 19.6 s |  |

## t8

Run at 2026-11-11T15:06:26.825Z on commit `1635e86d6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/threads/__tests__/review-workers.test.ts: canonical identities own one incarnation and preserve subject and cleanup exclusions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | canonical identities own one incarnation and preserve subject and cleanup exclusions | `src/daemon/threads/__tests__/review-workers.test.ts` |

**integration: src/daemon/threads/__tests__/review-workers.test.ts: stale owner messages and targeted disconnects cannot mutate another review**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale owner messages and targeted disconnects cannot mutate another review | `src/daemon/threads/__tests__/review-workers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-workers.test.ts` | 0 | 3 | 4.6 s |  |

## t9

Run at 2026-11-11T15:27:53.328Z on commit `76e049edb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/code-review/task-review/__tests__/worker-admission.test.ts: durable acknowledgment precedes blocked source qualification and provider dispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | durable acknowledgment precedes blocked source qualification and provider dispatch | `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` |

**integration: src/workflow/code-review/task-review/__tests__/worker-admission.test.ts: replay and controller admission-to-assignment retain one execution identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | replay and controller admission-to-assignment retain one execution identity | `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` | 0 | 2 | 7 s |  |

## t10

Run at 2026-11-11T16:04:20.516Z on commit `aa9aa072f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/review/design-review/__tests__/worker-admission.test.ts: durable admission and current workflow ancestry run in the owner worker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | durable admission and current workflow ancestry run in the owner worker | `src/workflow/review/design-review/__tests__/worker-admission.test.ts` |

**integration: src/workflow/review/design-review/__tests__/worker-admission.test.ts: subject invalidation explicit recovery and impact-selected chunks preserve saved feedback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | subject invalidation explicit recovery and impact-selected chunks preserve saved feedback | `src/workflow/review/design-review/__tests__/worker-admission.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review/design-review/__tests__/worker-admission.test.ts` | 0 | 3 | 7.9 s |  |

## t11

Run at 2026-11-11T16:37:26.694Z on commit `58667fd89`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: existing local broker approval binds exact guards and requires a separate resume**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | existing local broker approval binds exact guards and requires a separate resume | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: stale partial repeated or lost-response clearance preserves remaining fences and audit receipts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale partial repeated or lost-response clearance preserves remaining fences and audit receipts | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-worker-clearance.test.ts` | 0 | 6 | 9.7 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 2 | 4.5 s |  |
