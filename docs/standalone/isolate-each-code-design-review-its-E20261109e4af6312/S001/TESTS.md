<!-- insrc:artifact TESTS-e4af63128c7cbec2-s1 -->

# Tests: e4af63128c7cbec2 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 62 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

Run at 2026-11-11T17:27:54.699Z on commit `f3c1b184a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: existing local broker approval binds exact guards and requires a separate resume**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | existing local broker approval binds exact guards and requires a separate resume | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |
| pass | cleared failed attempts accept only a separate explicit next submission and preserve the failed record | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-clearance.test.ts: stale partial repeated or lost-response clearance preserves remaining fences and audit receipts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stale partial repeated or lost-response clearance preserves remaining fences and audit receipts | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/review-worker-clearance.test.ts` | 0 | 9 | 12 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 2 | 5.1 s |  |

## t12

Run at 2026-11-12T01:23:20.233Z on commit `8cf777a4a`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-progress.test.ts: pending admission and cached progress stay responsive during blocked worker computation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pending admission and cached progress stay responsive during blocked worker computation | `src/daemon/threads/__tests__/review-worker-progress.test.ts` |
| pass | technical admission failures publish failed preparation without findings or provider dispatch | `src/daemon/threads/__tests__/review-worker-progress.test.ts` |
| pass | the cross-thread board read carries only review progress and excludes workflow frames | `src/daemon/threads/__tests__/review-worker-progress.test.ts` |
| pass | replay and controller admission-to-assignment retain one execution identity | `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` |

**unit: vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts: admission DTOs render preparing or failure without empty success**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admission DTOs render preparing or failure without empty success | `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` |

**unit: jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/review/ReviewWorkerProgressTest.kt: admission DTOs preserve unknown inventory and current review identity**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | admission DTOs preserve unknown inventory and current review identity | `jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/review-worker-progress-gradle.test.ts` | 0 | 1 | 12.3 s |  |
| `src/daemon/threads/__tests__/review-worker-progress.test.ts` | 0 | 7 | 8.4 s |  |
| `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` | 0 | 2 | 7.6 s |  |
| `vscode-plugin/src/chat/__tests__/review-worker-progress.test.ts` | 0 | 1 | 0.4 s |  |

## t13

Run at 2026-11-12T02:12:05.399Z on commit `f8cda8670`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-publication.test.ts: publication retry after worker exit or lost receipt performs zero provider calls**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publication retry after worker exit or lost receipt performs zero provider calls | `src/daemon/threads/__tests__/review-worker-publication.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-cleanup.test.ts: approval cleanup retains active targets and preserves both-family permanent history**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval cleanup retains active targets and preserves both-family permanent history | `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` |
| pass | artifact writes share the main queue and release only after worker reclamation | `src/daemon/threads/__tests__/artifact-write-authority.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: shutdown drains host leases before worker reclamation and replacement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | shutdown drains host leases before worker reclamation and replacement | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | disposable daemon crash reconstructs unresolved guards and leaves unrelated reviews usable | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | legacy active missing guards reconstruct only the requested review fence | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/artifact-write-authority.test.ts` | 0 | 1 | 1.6 s |  |
| `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` | 0 | 3 | 8.6 s |  |
| `src/daemon/threads/__tests__/review-worker-publication.test.ts` | 0 | 3 | 4 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 3 | 6.7 s |  |

## t14

Run at 2026-11-12T04:36:38.374Z on commit `c4a74c15e`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/__tests__/review-worker-routing.test.ts: every supported review method delegates heavy work to its dedicated owner**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every supported review method delegates heavy work to its dedicated owner | `src/daemon/__tests__/review-worker-routing.test.ts` |
| pass | production resume preserves failed qualified and no-document attempts and requires an explicit new attempt | `src/daemon/__tests__/review-worker-routing.test.ts` |
| pass | production design recovery preserves qualified failures and only an explicit next attempt starts work | `src/daemon/__tests__/review-worker-routing.test.ts` |
| pass | orderly native host disposal ignores late port closure and cannot close a replacement owner | `src/daemon/threads/__tests__/review-native-host.test.ts` |
| pass | unexpected native port loss shares explicit close work and notifies its owner once | `src/daemon/threads/__tests__/review-native-host.test.ts` |
| pass | legacy interrupted code history retains uncertainty on earlier attempts | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | pending-publication qualified failure survives new attempt publication approval cleanup and permanent reads | `src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` |

**integration: src/daemon/__tests__/review-worker-routing.test.ts: optional session threading disabled cannot enable main or session review fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | optional session threading disabled cannot enable main or session review fallback | `src/daemon/__tests__/review-worker-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/review-worker-routing.test.ts` | 0 | 4 | 54.8 s |  |
| `src/daemon/threads/__tests__/review-native-host.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 4 | 6.7 s |  |
| `src/workflow/code-review/task-review/__tests__/pending-failure-history.test.ts` | 0 | 1 | 7.4 s |  |

## t15

Run at 2026-11-12T05:28:27.176Z on commit `8fe4b316c`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/threads/__tests__/review-worker-isolation.test.ts: code code design design and mixed reviews use distinct real worker threads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | code code design design and mixed reviews use distinct real worker threads | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | production controller exchanges and disconnect reclaim only their own review | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-isolation.test.ts: blocked admission permits progress daemon status and an unrelated review before release**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | blocked admission permits progress daemon status and an unrelated review before release | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |
| pass | installed production routing bounds never-ready and pre-save-hung boot without fallback | `src/daemon/threads/__tests__/review-worker-isolation.test.ts` |

**integration: src/daemon/threads/__tests__/review-worker-recovery.test.ts: crash-boundary owner-loss and cleanup races retain targeted lifecycle guarantees**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | crash-boundary owner-loss and cleanup races retain targeted lifecycle guarantees | `src/daemon/threads/__tests__/review-worker-recovery.test.ts` |
| pass | full daemon entrypoint retains both-family crash fences and failed-attempt recovery through public routes | `src/daemon/threads/__tests__/review-worker-daemon.test.ts` |
| pass | stale owner messages and targeted disconnects cannot mutate another review | `src/daemon/threads/__tests__/review-workers.test.ts` |
| pass | pending admission and cached progress stay responsive during blocked worker computation | `src/daemon/threads/__tests__/review-worker-progress.test.ts` |
| pass | cleared failed attempts accept only a separate explicit next submission and preserve the failed record | `src/daemon/threads/__tests__/review-worker-clearance.test.ts` |
| pass | publication retry after worker exit or lost receipt performs zero provider calls | `src/daemon/threads/__tests__/review-worker-publication.test.ts` |
| pass | approval cleanup retains active targets and preserves both-family permanent history | `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` |
| pass | host leases precede spawn and enforce owner-bound replay and disposal | `src/daemon/threads/__tests__/review-processes.test.ts` |
| pass | Git shell and raw-byte commands preserve output bounds and abort semantics through leases | `src/daemon/tools/__tests__/review-worker-shell.test.ts` |
| pass | fake native review CLI streams and cancellation use host-owned leases | `src/agent/providers/__tests__/review-worker-process.test.ts` |
| pass | durable acknowledgment precedes blocked source qualification and provider dispatch | `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` |
| pass | durable admission and current workflow ancestry run in the owner worker | `src/workflow/review/design-review/__tests__/worker-admission.test.ts` |
| pass | production design recovery preserves qualified failures and only an explicit next attempt starts work | `src/daemon/__tests__/review-worker-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/review-worker-process.test.ts` | 0 | 2 | 1.7 s |  |
| `src/daemon/__tests__/review-worker-routing.test.ts` | 0 | 4 | 55.1 s |  |
| `src/daemon/threads/__tests__/review-processes.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/threads/__tests__/review-worker-cleanup.test.ts` | 0 | 3 | 8.9 s |  |
| `src/daemon/threads/__tests__/review-worker-clearance.test.ts` | 0 | 9 | 11.9 s |  |
| `src/daemon/threads/__tests__/review-worker-daemon.test.ts` | 0 | 1 | 60.7 s |  |
| `src/daemon/threads/__tests__/review-worker-isolation.test.ts` | 0 | 6 | 29.9 s |  |
| `src/daemon/threads/__tests__/review-worker-progress.test.ts` | 0 | 7 | 7.6 s |  |
| `src/daemon/threads/__tests__/review-worker-publication.test.ts` | 0 | 3 | 4 s |  |
| `src/daemon/threads/__tests__/review-worker-recovery.test.ts` | 0 | 5 | 47.7 s |  |
| `src/daemon/threads/__tests__/review-workers.test.ts` | 0 | 3 | 4.5 s |  |
| `src/daemon/tools/__tests__/review-worker-shell.test.ts` | 0 | 1 | 5.8 s |  |
| `src/workflow/code-review/task-review/__tests__/worker-admission.test.ts` | 0 | 2 | 11.8 s |  |
| `src/workflow/review/design-review/__tests__/worker-admission.test.ts` | 0 | 3 | 7.4 s |  |
