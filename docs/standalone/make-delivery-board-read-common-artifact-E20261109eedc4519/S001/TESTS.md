<!-- insrc:artifact TESTS-eedc4519199b24b4-s1 -->

# Tests: eedc4519199b24b4 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 66 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T15:27:25.257Z on commit `ed7a49bdd`. Tests check: **passed**. 17 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: rollUp for STORY: approved BUILD with clean review and all listed Tasks' latest rounds passed completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for STORY: approved BUILD with clean review and all listed Tasks latest rounds passed completes | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |
| pass | an earlier pass followed by a failing latest round holds back, and an explicit override completes it | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: rollUp for STORY: a listed Task with no head holds back**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for STORY: a listed Task with no head holds back | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: rollUp for STORY: an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: rollUp for STORY: a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: storyTasks: a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1; an empty current listing answers not-created; with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1 | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |
| pass | an empty current listing answers not-created | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |
| pass | with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: rollUp for STORY: a Story with no PLAN and no Tasks completes, and child TASK heads with no PLAN are the listed set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for STORY: a Story with no PLAN and no Tasks completes | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |
| pass | child TASK heads with no PLAN are the listed set | `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` |

**unit: rollUp for STORY: a listed withdrawn or superseded Task is not counted; a clean review is not an override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for STORY: a listed withdrawn or superseded Task is not counted | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |
| pass | rollUp for STORY: a clean review is not an override | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: rollUp for EPIC: a declared Story without a terminal head holds it; an Epic with no DEF rolls up from its counted Stories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollUp for EPIC: a declared Story without a terminal head holds it | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |
| pass | rollUp for EPIC: an Epic with no DEF rolls up from its counted Stories | `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` |

**unit: unitMembers includes TASK heads, and a held Story leaves every Task unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unitMembers includes TASK heads, and a held Story leaves every Task unchanged | `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` |

**unit: reopening a Story reopens only the Tasks it froze**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reopening a Story reopens only the Tasks it froze | `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/completion-evidence.test.ts` | 0 | 14 | 1.1 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-completion.test.ts` | 0 | 8 | 0.7 s |  |
| `src/workflow/artifact-core/__tests__/lifecycle-rollup.test.ts` | 0 | 13 | 0.6 s |  |

## t2

Run at 2026-11-09T15:35:32.908Z on commit `dd4eefa59`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD | `src/workflow/__tests__/story-completion.test.ts` |

**integration: handleWorkflowApprove on a BUILD: the outcome merges the approval's own followOn with the seam's, and the Story, its Tasks and its Epic complete**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleWorkflowApprove on a BUILD: the outcome merges the approval's own followOn with the seam's, and the Story, its Tasks and its Epic complete | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a walk failure leaves the approval standing and reports ok false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a walk failure leaves the approval standing and reports ok false | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a live approval with a listed Task missing its head is held and named in the note**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a live approval with a listed Task missing its head is held and named in the note | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen | `src/workflow/__tests__/story-completion.test.ts` |

**integration: initial approval held, then re-approval with an override records it and completes the Story**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | initial approval held, then re-approval with an override records it and completes the Story | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a draft BUILD at a new revision is not passed by an earlier revision's override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a draft BUILD at a new revision is not passed by an earlier revision's override | `src/workflow/__tests__/story-completion.test.ts` |

**integration: a held Story in signoff completes later from the stored override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a held Story in signoff completes later from the stored override | `src/workflow/__tests__/story-completion.test.ts` |

**integration: an Epic with a signoff hold stays open after its Story completes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an Epic with a signoff hold stays open after its Story completes | `src/workflow/__tests__/story-completion.test.ts` |

**integration: the CLI adapter exposes the story-completion outcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the CLI adapter exposes the story-completion outcome | `src/workflow/__tests__/story-completion.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/story-completion.test.ts` | 0 | 11 | 1.5 s |  |

## t3

Run at 2026-11-09T15:39:54.255Z on commit `19b00a12b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them | `src/workflow/__tests__/workflow-head-lifecycle.test.ts` |

**integration: both first-write sites give a new head a draft lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | both first-write sites give a new head a draft lifecycle | `src/workflow/__tests__/workflow-head-lifecycle.test.ts` |

**integration: guard: a production content write of a delivery kind cannot create a head without a lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | guard: a production content write of a delivery kind cannot create a head without a lifecycle | `src/workflow/__tests__/workflow-head-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/workflow-head-lifecycle.test.ts` | 0 | 3 | 2.4 s |  |

## t4

Run at 2026-11-09T15:50:25.019Z on commit `60436e184`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved | `src/workflow/convert/__tests__/repair.test.ts` |

**integration: a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice | `src/workflow/convert/__tests__/repair.test.ts` |

**integration: a plan with a rename collision answers an error and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plan with a rename collision answers an error and writes nothing | `src/workflow/convert/__tests__/repair.test.ts` |

**integration: an unknown mode answers an error and writes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unknown mode answers an error and writes nothing | `src/workflow/convert/__tests__/repair.test.ts` |

**integration: rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay | `src/workflow/convert/__tests__/repair.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/repair.test.ts` | 0 | 8 | 1.9 s |  |

## t5

Run at 2026-11-09T15:58:10.221Z on commit `bd52cff4d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set | `src/workflow/convert/__tests__/repair-tasks.test.ts` |

**integration: repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story | `src/workflow/convert/__tests__/repair-tasks.test.ts` |

**integration: a failure injected while Task rounds are back-filled lists the rounds already written**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure injected while Task rounds are back-filled lists the rounds already written | `src/workflow/convert/__tests__/repair-tasks.test.ts` |

**integration: a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue | `src/workflow/convert/__tests__/repair-tasks.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/repair-tasks.test.ts` | 0 | 4 | 1.2 s |  |

## t6

Run at 2026-11-09T16:03:54.545Z on commit `435f14567`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**integration: a second repair lists no changes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a second repair lists no changes | `src/workflow/convert/__tests__/repair-settle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/convert/__tests__/repair-settle.test.ts` | 0 | 7 | 2.8 s |  |

## t7

Run at 2026-11-09T16:07:01.126Z on commit `d6d103919`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice, gives a head with no lifecycle the state unmigrated, and TESTS stays skipped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice, gives a head with no lifecycle the state unmigrated, and TESTS stays skipped | `src/workflow/delivery/__tests__/load.test.ts` |

**unit: handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id, still accepts a one-suffix and an uppercase legacy id, and refuses a malformed id and one that escapes the store**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id, still accepts a one-suffix and an uppercase legacy id, and refuses a malformed id and one that escapes the store | `src/workflow/delivery/__tests__/handlers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/handlers.test.ts` | 0 | 8 | 2.7 s |  |
| `src/workflow/delivery/__tests__/load.test.ts` | 0 | 8 | 0.6 s |  |

## t8

Run at 2026-11-09T16:16:31.674Z on commit `60810876e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: buildWorkItemGraph: unit is null for a missing head and has status unmigrated for a head with no lifecycle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildWorkItemGraph: unit is null for a missing head and has status unmigrated for a head with no lifecycle | `src/workflow/delivery/__tests__/graph.test.ts` |

**unit: a missing or unmigrated unit raises needs-migration and not pending-decision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a missing or unmigrated unit raises needs-migration and not pending-decision | `src/workflow/delivery/__tests__/gate.test.ts` |

**unit: storyStage is complete only with a completed STORY head, and an approved BUILD otherwise stays build-recorded with text giving the head's status, that it is not migrated, or that there is no head**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | storyStage is complete only with a completed STORY head, and an approved BUILD otherwise stays build-recorded with text giving the head's status, that it is not migrated, or that there is no head | `src/workflow/delivery/__tests__/stage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/delivery/__tests__/gate.test.ts` | 0 | 17 | 0.9 s |  |
| `src/workflow/delivery/__tests__/graph.test.ts` | 0 | 31 | 0.6 s |  |
| `src/workflow/delivery/__tests__/stage.test.ts` | 0 | 17 | 0.6 s |  |

## t9

Run at 2026-11-09T16:24:38.100Z on commit `1f6edc0a1`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN's rows matched by planTaskId, in the PLAN's order even when a matching Task head carries an older order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN's rows matched by planTaskId, in the PLAN's order even when a matching Task head carries an older order | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004 | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**unit: gate sorts tasks by taskOrder, null last, then id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gate sorts tasks by taskOrder, null last, then id | `src/workflow/delivery/__tests__/task-membership.test.ts` |

**integration: verifyConversion keeps passing on a converted fixture with the changed loader, graph and gates**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | verifyConversion keeps passing on a converted fixture with the changed loader, graph and gates | `src/workflow/convert/__tests__/repair.test.ts` |

**integration: src/daemon/__tests__/delivery-handler-contract.test.ts carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow.delivery carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot | `src/daemon/__tests__/delivery-handler-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/delivery-handler-contract.test.ts` | 0 | 3 | 0.8 s |  |
| `src/workflow/convert/__tests__/repair.test.ts` | 0 | 9 | 1.4 s |  |
| `src/workflow/delivery/__tests__/task-membership.test.ts` | 0 | 7 | 0.5 s |  |

## t10

Run at 2026-11-09T16:28:26.847Z on commit `6951de5a0`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: taskShortIdOf shows R004 for a row id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | taskShortIdOf shows R004 for a row id | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: board-details joins on planRowId, falling back to sourceIds only when it is null**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board-details joins on planRowId, falling back to sourceIds only when it is null | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**unit: board-views shows an Epic complete only from its unit status**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | board-views shows an Epic complete only from its unit status | `vscode-plugin/src/delivery/__tests__/board-views.test.ts` |

**unit: TaskRowView carries a Task's unit status, including unmigrated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TaskRowView carries a Task's unit status, including unmigrated | `vscode-plugin/src/delivery/__tests__/board-details.test.ts` |

**integration: vscode-plugin/src/delivery/__tests__/delivery-client.test.ts reads the same shape and opens a sequenced DIAG evidence row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-plugin/src/delivery/__tests__/delivery-client.test.ts reads the same shape and opens a sequenced DIAG evidence row | `vscode-plugin/src/delivery/__tests__/delivery-client.test.ts` |

**smoke: Render the board webview during the build and confirm a Task row shows its unit status beside its validation result, including an unmigrated one**

Reported by the builder, not run by the gate: **pass**. Evidence: Real board host and BOARD_WEBVIEW_SCRIPT rendered in headless Chrome with CSP enforced: /tmp/insrc-scratch/board/board.png. Rows read T001 Passed / Completed, T002 Failed / Not migrated, R004 Unrecorded with no unit, T003 Unplanned / Approved.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/delivery/__tests__/board-details.test.ts` | 0 | 18 | 0.4 s |  |
| `vscode-plugin/src/delivery/__tests__/board-views.test.ts` | 0 | 11 | 0.3 s |  |
| `vscode-plugin/src/delivery/__tests__/delivery-client.test.ts` | 0 | 4 | 0.7 s |  |
