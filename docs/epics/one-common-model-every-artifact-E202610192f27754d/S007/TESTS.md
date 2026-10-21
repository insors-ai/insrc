<!-- insrc:artifact TESTS-2f27754d4ad00b8e-s7 -->

# Tests: 2f27754d4ad00b8e s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-21T17:47:41.683Z on commit `c2df1521`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: tasks-codec.test.ts: the TASK and TASKS codecs round-trip a Task payload and a Tasks payload and refuse a malformed body**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the TASK and TASKS codecs round-trip a Task payload and a Tasks payload and refuse a malformed body | `src/workflow/artifact-core/__tests__/tasks-codec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/tasks-codec.test.ts` | 0 | 2 | 1.2 s |  |

## t2

Run at 2026-10-21T17:50:01.413Z on commit `921758ff`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: task-diff.test.ts: a plan row maps to a Task payload, the diff reports an equal Task as unchanged, and row validation rejects a bad size, a duplicate id and an order gap**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan row maps to a Task payload, the diff reports an equal Task as unchanged, and row validation rejects a bad size, a duplicate id and an order gap | `src/workflow/tasks/__tests__/task-diff.test.ts` |

**unit: task-edit-check.test.ts: a patch that names order or a dependency, or a Task that is completed or withdrawn, is refused with a pointer to a re-plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a patch that names order or a dependency, or a Task that is completed or withdrawn, is refused with a pointer to a re-plan | `src/workflow/tasks/__tests__/task-edit-check.test.ts` |

**unit: task-numbers.test.ts: the next number only grows and never takes a withdrawn Task's id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the next number only grows and never takes a withdrawn Task's id | `src/workflow/tasks/__tests__/task-numbers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-diff.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/tasks/__tests__/task-edit-check.test.ts` | 0 | 2 | 2.3 s |  |
| `src/workflow/tasks/__tests__/task-numbers.test.ts` | 0 | 2 | 2.9 s |  |

## t3

Run at 2026-10-21T17:53:12.373Z on commit `42158a10`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-set-create.test.ts: createFromPlan writes the Tasks file and one approved Task head per plan Task with parent, dependencies and a derived-from reference, and a repeat writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createFromPlan writes the Tasks file and one approved Task head per plan Task with parent, dependencies and a derived-from reference, and a repeat writes nothing | `src/workflow/tasks/__tests__/task-set-create.test.ts` |
| pass | a plan with no Tasks writes a Tasks file with no ids, and a plan that is not approved or has bad rows makes nothing | `src/workflow/tasks/__tests__/task-set-create.test.ts` |
| pass | a Task head left by an earlier run is kept, the plan's Task record moves onto its head, and a newer plan revision is left to reconcile | `src/workflow/tasks/__tests__/task-set-create.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-set-create.test.ts` | 0 | 4 | 1.4 s |  |

## t4

Run at 2026-10-21T17:58:44.041Z on commit `5b7f79dc`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-set-reconcile.test.ts: a re-plan revises a changed Task, withdraws a dropped Task and closes its issue, adds a new Task under the next number, and never reuses an id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a re-plan revises a changed Task, withdraws a dropped Task and closes its issue, adds a new Task under the next number, and never reuses an id | `src/workflow/tasks/__tests__/task-set-reconcile.test.ts` |
| pass | a dropped Task whose issue cannot be closed is withdrawn anyway, the failure is returned, and the next call retries the close | `src/workflow/tasks/__tests__/task-set-reconcile.test.ts` |
| pass | reconcile refuses a plan with no Tasks file yet and a plan behind the Tasks | `src/workflow/tasks/__tests__/task-set-reconcile.test.ts` |

**integration: task-set-edit.test.ts: editing a Task's summary, size, checks or tests moves it to a new revision in draft with no signoff, a structural edit is refused and writes nothing, and a conflicting edit is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | editing a Task's summary, size, checks or tests moves it to a new revision in draft with no signoff, a structural edit is refused and writes nothing, and a conflicting edit is refused | `src/workflow/tasks/__tests__/task-set-edit.test.ts` |
| pass | an edit and a reconcile that read the same revision cannot both land, and a withdrawn Task cannot be edited | `src/workflow/tasks/__tests__/task-set-edit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-set-edit.test.ts` | 0 | 3 | 1.3 s |  |
| `src/workflow/tasks/__tests__/task-set-reconcile.test.ts` | 0 | 4 | 1.3 s |  |

## t5

Run at 2026-10-21T18:01:25.864Z on commit `85437dc0`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-set-sync.test.ts: syncTasksOnPlanApproval creates the set for a new plan, reconciles a newer plan revision, does nothing when they agree and returns an error instead of throwing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | syncTasksOnPlanApproval creates the set for a new plan, reconciles a newer plan revision, does nothing when they agree and returns an error instead of throwing | `src/workflow/tasks/__tests__/task-set-sync.test.ts` |

**integration: task-build-rounds.test.ts: a passing build round completes the Task, a later failing round does not, and the Story completes through the roll-up**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a passing build round completes the Task, a later failing round does not, and the Story completes through the roll-up | `src/workflow/tasks/__tests__/task-build-rounds.test.ts` |
| pass | a Task with no head is judged by the BUILD record's per-task result, and a Task with a head is not | `src/workflow/tasks/__tests__/task-build-rounds.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-build-rounds.test.ts` | 0 | 3 | 1.2 s |  |
| `src/workflow/tasks/__tests__/task-set-sync.test.ts` | 0 | 2 | 1.5 s |  |

## t6

Run at 2026-10-21T18:05:51.876Z on commit `79960f40`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-unit-issue.test.ts: a Task's issue is created under the Story's issue and bound on its Task head with no record on the Plan, the draft hook claims the Epic and the Story only, and a Task with no head resolves through the Plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a Task's issue is created under the Story's issue and bound on its Task head with no record on the Plan, the draft hook claims the Epic and the Story only, and a Task with no head resolves through the Plan | `src/workflow/tasks/__tests__/task-unit-issue.test.ts` |
| pass | Define, LLD and plan drafts create one issue per unit, a second write creates none, and failures stop and report | `src/workflow/__tests__/draft-issues.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/draft-issues.test.ts` | 0 | 4 | 1.8 s |  |
| `src/workflow/tasks/__tests__/task-unit-issue.test.ts` | 0 | 1 | 2 s |  |

## t7

Run at 2026-10-21T18:08:53.490Z on commit `74d7b8bd`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-readers.test.ts: an issue number resolves to a Task through its head's binding, the tracker runner's dedup read and the orchestrator's push result use the head, and a Task with no head resolves through the Plan**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an issue number resolves to a Task through its head's binding, the tracker runner's dedup read and the orchestrator's push result use the head, and a Task with no head resolves through the Plan | `src/workflow/tasks/__tests__/task-readers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-readers.test.ts` | 0 | 1 | 1.5 s |  |

## t8

Run at 2026-10-21T18:13:47.811Z on commit `e0f0813c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: task-set-approve.test.ts: approving a plan creates the Task set and each Task's issue is bound on its Task head under the Story's issue, through the cli approve flow and the daemon seam, and a failed sync never fails the approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approving a plan creates the Task set and each Task's issue is bound on its Task head under the Story's issue, through the cli approve flow and the daemon seam, and a failed sync never fails the approval | `src/workflow/tasks/__tests__/task-set-approve.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tasks/__tests__/task-set-approve.test.ts` | 0 | 1 | 2.4 s |  |

## t9

Run at 2026-10-21T18:16:13.387Z on commit `fecfedee`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: validate-task-round.test.ts: a validate turn records its round in the Task's own log, and a Task with no head keeps writing the BUILD record only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a validate turn records its round in the Task's own log, and a Task with no head keeps writing the BUILD record only | `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validate-task-round.test.ts` | 0 | 1 | 2 s |  |

## t10

Run at 2026-10-21T18:17:38.087Z on commit `fdc7c9e0`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: s7-handoffs.test.ts: the plans document names each s7 hand-off to s9**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the plans document names each s7 hand-off to s9 | `src/workflow/__tests__/s7-handoffs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/s7-handoffs.test.ts` | 0 | 1 | 0.4 s |  |
