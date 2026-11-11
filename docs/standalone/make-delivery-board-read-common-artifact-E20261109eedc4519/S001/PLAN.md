<!-- insrc:artifact PLAN-eedc4519199b24b4-s1 -->

# Plan: STORY-eedc4519199b24b4-s1

## Summary

**Epic:** `make-delivery-board-read-common-artifact`
**LLD run:** `wf-1794233694387-yokqfz`
**LLD effective hash:** `c67150e9bcc3...`

The build changes three areas in dependency order. It first makes Story and Epic completion real in the lifecycle and approval paths, and closes the path that writes records with no lifecycle. It then adds the repair modes in three steps: running the conversion's steps with exact reporting, creating missing units and Tasks, and settling units. Finally the board reads every record kind, publishes unit status and stable Task identity, and the plugin shows them.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Story completion rule | L | — | — | unit: rollUp for STORY: approved BUILD with clean review and all listed Tasks' latest rounds passed completes; unit: rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it; unit: rollUp for STORY: a listed Task with no head holds back; unit: rollUp for STORY: an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed; unit: rollUp for STORY: a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it; unit: storyTasks: a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1; an empty current listing answers not-created; with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order; unit: rollUp for STORY: a Story with no PLAN and no Tasks completes, and child TASK heads with no PLAN are the listed set; unit: rollUp for STORY: a listed withdrawn or superseded Task is not counted; a clean review is not an override; unit: rollUp for EPIC: a declared Story without a terminal head holds it; an Epic with no DEF rolls up from its counted Stories; unit: unitMembers includes TASK heads, and a held Story leaves every Task unchanged; unit: reopening a Story reopens only the Tasks it froze | [[c1]] [[c2]] |
| 2 | **`t2`** Approval completes the Story and keeps a later override | L | — | `t1` | unit: record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD; integration: handleWorkflowApprove on a BUILD: the outcome merges the approval's own followOn with the seam's, and the Story, its Tasks and its Epic complete; integration: a walk failure leaves the approval standing and reports ok false; integration: a live approval with a listed Task missing its head is held and named in the note; integration: a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen; integration: initial approval held, then re-approval with an override records it and completes the Story; integration: a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes; integration: a draft BUILD at a new revision is not passed by an earlier revision's override; integration: a held Story in signoff completes later from the stored override; integration: an Epic with a signoff hold stays open after its Story completes; integration: the CLI adapter exposes the story-completion outcome | [[c3]] [[c4]] |
| 3 | **`t3`** Every workflow head has a lifecycle | S | — | — | unit: the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them; integration: both first-write sites give a new head a draft lifecycle; integration: guard: a production content write of a delivery kind cannot create a head without a lifecycle | [[c5]] |
| 4 | **`t4`** Repair modes and step-by-step reporting | L | — | — | integration: repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved; integration: a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice; integration: a plan with a rename collision answers an error and writes nothing; integration: an unknown mode answers an error and writes nothing; integration: rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay | [[c6]] [[c7]] |
| 5 | **`t5`** Repair creates missing units and Tasks | M | — | `t4` | integration: repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set; integration: repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story; integration: a failure injected while Task rounds are back-filled lists the rounds already written; integration: a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue | [[c7]] |
| 6 | **`t6`** Repair settles units | M | — | `t1`, `t5` | integration: repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement; integration: repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override; integration: repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held; integration: repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override; integration: failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run; integration: a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit; integration: a second repair lists no changes | [[c7]] [[c1]] |
| 7 | **`t7`** Board loads every record kind | S | — | — | unit: liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice, gives a head with no lifecycle the state unmigrated, and TESTS stays skipped; unit: handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id, still accepts a one-suffix and an uppercase legacy id, and refuses a malformed id and one that escapes the store | [[c8]] |
| 8 | **`t8`** Board shows unit status | M | — | `t7` | unit: buildWorkItemGraph: unit is null for a missing head and has status unmigrated for a head with no lifecycle; unit: a missing or unmigrated unit raises needs-migration and not pending-decision; unit: storyStage is complete only with a completed STORY head, and an approved BUILD otherwise stays build-recorded with text giving the head's status, that it is not migrated, or that there is no head | [[c9]] [[c11]] |
| 9 | **`t9`** Board Task membership, order and ids | M | — | `t7` | unit: buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds; unit: buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN's rows matched by planTaskId, in the PLAN's order even when a matching Task head carries an older order; unit: board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence; unit: board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004; unit: board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id; unit: buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration; unit: gate sorts tasks by taskOrder, null last, then id; integration: verifyConversion keeps passing on a converted fixture with the changed loader, graph and gates; integration: src/daemon/__tests__/delivery-handler-contract.test.ts carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot | [[c9]] [[c12]] |
| 10 | **`t10`** Plugin shows the new status | M | — | `t8`, `t9` | unit: taskShortIdOf shows R004 for a row id; unit: board-details joins on planRowId, falling back to sourceIds only when it is null; unit: board-views shows an Epic complete only from its unit status; unit: TaskRowView carries a Task's unit status, including unmigrated; integration: vscode-plugin/src/delivery/__tests__/delivery-client.test.ts reads the same shape and opens a sequenced DIAG evidence row; smoke: Render the board webview during the build and confirm a Task row shows its unit status beside its validation result, including an unmigrated one | [[c10]] |

### 1.1 TASK-eedc4519199b24b4-s1-t1 — Story completion rule

Add storyBuildApproved, storyApprovalOverride, declaredStories and storyTasks to the evidence; make the STORY and EPIC roll-ups use them; add TASK heads to a Story's cascade.

**Acceptance checks:**
- A Story completes only when its BUILD is approved, its review is clean or overridden, and its Tasks pass or the approval carries an override
- A listed Task with no head, a part-way Task set and a TASKS head from an older plan revision each hold the Story
- A held Story leaves every Task unchanged, and an Epic waits for every declared Story
- Existing assertions that Tasks complete before their Story now describe the Story-owned cascade

### 1.2 TASK-eedc4519199b24b4-s1-t2 — Approval completes the Story and keeps a later override

Add the record-override operation, use a stored override at the outer code-review gate, make completeThroughService ensure heads and report a story-completion outcome, and merge outcomes through handleWorkflowApprove and the CLI.

**Acceptance checks:**
- Approving a BUILD completes its Story, Tasks and Epic when the rule holds, or reports why not
- A second approval with an override records it with an audit entry and leaves status, revision and approval time unchanged
- A re-approval with no override passes the gate on the stored one, and a draft BUILD does not
- The story-completion outcome reaches daemon and CLI callers

### 1.3 TASK-eedc4519199b24b4-s1-t3 — Every workflow head has a lifecycle

Add the storage helper that settles meta.lifecycle, call it from both finished-artifact write sites, and add the guard test.

**Acceptance checks:**
- A first write gets a draft lifecycle
- A rewrite keeps the lifecycle for unchanged content and starts a draft keeping Signoff entries for changed content
- A production content write of a delivery kind cannot create a head without a lifecycle

### 1.4 TASK-eedc4519199b24b4-s1-t4 — Repair modes and step-by-step reporting

Add repair-preview and repair to handleRepoConvert, run the conversion's steps in order at any schema version, add the RepairRecorder at commit points, and return a RepairReport with written, remaining and stoppedAt.

**Acceptance checks:**
- repair-preview writes nothing
- Repair runs renames, stamps, amendments, feedback, migration, units, Tasks and Story history in order and leaves the schema marker alone
- A step that throws stops the run and the report lists exactly what was committed
- A write committed inside a nested operation is recorded even when the outer operation then fails
- A plan with a problem writes nothing and answers an error

### 1.5 TASK-eedc4519199b24b4-s1-t5 — Repair creates missing units and Tasks

Extend unit and Task discovery to Stories known from any record, accept a PLAN past approved with createFromPlan's option, match BUILD results by planTaskId alone, list missing rounds in the preview, and report a Story whose Task set cannot be made.

**Acceptance checks:**
- Missing EPIC, STORY, TASKS and TASK heads are created on an already converted repository
- Crossed Task numbers and plan rows give each BUILD result to the right Task and existing rounds are left alone
- A TASKS head listing a missing Task or made from another plan revision is reported failed while other Stories continue

### 1.6 TASK-eedc4519199b24b4-s1-t6 — Repair settles units

Add the settle step with COMPLETION_RULE_FROM: approvals before it are settled with the attributed override, later ones by the live rule, with held and failed outcomes per unit.

**Acceptance checks:**
- An approval strictly before the cutoff is settled with the insrc:migration override
- An approval at or after it is settled only by the live rule, using any stored explicit override, and otherwise is listed as held
- A settlement that fails part-way lists completedMembers and the next run finishes it
- A second repair lists no changes

### 1.7 TASK-eedc4519199b24b4-s1-t7 — Board loads every record kind

Add EPIC, STORY, TASK, TASKS and DIAG to the loader, give a head with no lifecycle the state unmigrated, and let evidence reads accept ids with two suffixes.

**Acceptance checks:**
- Every common-model kind loads with no notice and TESTS stays skipped
- A head with no lifecycle has approval state unmigrated
- A TASK or sequenced DIAG id can be read as evidence, and malformed or escaping ids are refused

### 1.8 TASK-eedc4519199b24b4-s1-t8 — Board shows unit status

Publish unit on epics, stories and tasks, including the unmigrated status; derive the Story stage from the STORY head; raise needs-migration for missing or unmigrated units.

**Acceptance checks:**
- Epic, Story and Task nodes carry their unit status, null only when there is no head
- storyStage is complete only with a completed STORY head
- A missing or unmigrated unit raises needs-migration and not pending-decision

### 1.9 TASK-eedc4519199b24b4-s1-t9 — Board Task membership, order and ids

Take active Tasks from the current TASKS head or the PLAN, publish planRowId and taskOrder, keep unmatched BUILD results, and apply the :T and :R id rule.

**Acceptance checks:**
- Active Tasks come from a TASKS head made from the current plan revision, else from the PLAN's rows in the PLAN's order
- Unmatched BUILD results keep their validation and conflicts and raise no needs-migration
- No two items in a Story share a board id, and an item that does not collide keeps its id

### 1.10 TASK-eedc4519199b24b4-s1-t10 — Plugin shows the new status

Carry the new fields through the delivery contract, join plan rows on planRowId, render tasks in the order given, show an Epic complete only from its unit status, and add labels and the Task status in the webview.

**Acceptance checks:**
- The plugin reads the new snapshot fields
- An Epic shows complete only when its unit status is completed
- A Task row shows its unit status beside its validation result, including unmigrated, in the real webview

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| rollUp for STORY: approved BUILD with clean review and all listed Tasks' latest rounds passed completes | `t1` |
| rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it | `t1` |
| rollUp for STORY: a listed Task with no head holds back | `t1` |
| rollUp for STORY: an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed | `t1` |
| rollUp for STORY: a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it | `t1` |
| storyTasks: a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1; an empty current listing answers not-created; with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order | `t1` |
| rollUp for STORY: a Story with no PLAN and no Tasks completes, and child TASK heads with no PLAN are the listed set | `t1` |
| rollUp for STORY: a listed withdrawn or superseded Task is not counted; a clean review is not an override | `t1` |
| rollUp for EPIC: a declared Story without a terminal head holds it; an Epic with no DEF rolls up from its counted Stories | `t1` |
| unitMembers includes TASK heads, and a held Story leaves every Task unchanged | `t1` |
| reopening a Story reopens only the Tasks it froze | `t1` |
| record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD | `t2` |
| liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice, gives a head with no lifecycle the state unmigrated, and TESTS stays skipped | `t7` |
| handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id, still accepts a one-suffix and an uppercase legacy id, and refuses a malformed id and one that escapes the store | `t7` |
| buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds | `t9` |
| buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN's rows matched by planTaskId, in the PLAN's order even when a matching Task head carries an older order | `t9` |
| board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence | `t9` |
| board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004 | `t9` |
| board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id | `t9` |
| taskShortIdOf shows R004 for a row id | `t10` |
| buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration | `t9` |
| buildWorkItemGraph: unit is null for a missing head and has status unmigrated for a head with no lifecycle | `t8` |
| a missing or unmigrated unit raises needs-migration and not pending-decision | `t8` |
| gate sorts tasks by taskOrder, null last, then id | `t9` |
| storyStage is complete only with a completed STORY head, and an approved BUILD otherwise stays build-recorded with text giving the head's status, that it is not migrated, or that there is no head | `t8` |
| board-details joins on planRowId, falling back to sourceIds only when it is null | `t10` |
| board-views shows an Epic complete only from its unit status | `t10` |
| TaskRowView carries a Task's unit status, including unmigrated | `t10` |
| the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them | `t3` |
| handleWorkflowApprove on a BUILD: the outcome merges the approval's own followOn with the seam's, and the Story, its Tasks and its Epic complete | `t2` |
| a walk failure leaves the approval standing and reports ok false | `t2` |
| a live approval with a listed Task missing its head is held and named in the note | `t2` |
| a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen | `t2` |
| initial approval held, then re-approval with an override records it and completes the Story | `t2` |
| a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes | `t2` |
| a draft BUILD at a new revision is not passed by an earlier revision's override | `t2` |
| a held Story in signoff completes later from the stored override | `t2` |
| an Epic with a signoff hold stays open after its Story completes | `t2` |
| the CLI adapter exposes the story-completion outcome | `t2` |
| both first-write sites give a new head a draft lifecycle | `t3` |
| guard: a production content write of a delivery kind cannot create a head without a lifecycle | `t3` |
| repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement | `t6` |
| repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved | `t4` |
| repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set | `t5` |
| repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story | `t5` |
| repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override | `t6` |
| repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held | `t6` |
| repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override | `t6` |
| a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice | `t4` |
| a failure injected while Task rounds are back-filled lists the rounds already written | `t5` |
| failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run | `t6` |
| a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit | `t6` |
| a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue | `t5` |
| a plan with a rename collision answers an error and writes nothing | `t4` |
| a second repair lists no changes | `t6` |
| an unknown mode answers an error and writes nothing | `t4` |
| rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay | `t4` |
| verifyConversion keeps passing on a converted fixture with the changed loader, graph and gates | `t9` |
| src/daemon/__tests__/delivery-handler-contract.test.ts carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot | `t9` |
| vscode-plugin/src/delivery/__tests__/delivery-client.test.ts reads the same shape and opens a sequenced DIAG evidence row | `t10` |
| Render the board webview during the build and confirm a Task row shows its unit status beside its validation result, including an unmigrated one | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 rollUp`
- **[[c2]]** `prior-artifact` `LLD s1 unitMembers and CompletionEvidence`
- **[[c3]]** `prior-artifact` `LLD s1 approveWorkflowTarget, approveArtifactByJsonPath and record-override`
- **[[c4]]** `prior-artifact` `LLD s1 completeThroughService, handleWorkflowApprove and FollowOnOutcome`
- **[[c5]]** `prior-artifact` `LLD s1 New and rewritten workflow heads`
- **[[c6]]** `prior-artifact` `LLD s1 handleRepoConvert and RepairReport`
- **[[c7]]** `prior-artifact` `LLD s1 Repair order, discovery and eligibility`
- **[[c8]]** `prior-artifact` `LLD s1 liftStoreFile, handleDeliveryEvidence and DeliveryArtifactKind`
- **[[c9]]** `prior-artifact` `LLD s1 buildWorkItemGraph and WorkItemNode`
- **[[c10]]** `prior-artifact` `LLD s1 plugin changes in WorkItemNode, DeliveryItem and TaskValidation`
- **[[c11]]** `prior-artifact` `LLD s1 storyStage and needs-migration`
- **[[c12]]** `prior-artifact` `LLD s1 Task board id`
