<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s7 -->

# Plan: E202610212f27754d:S007

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792602267744-a9vl16`
**LLD effective hash:** `bd468fd6cd6c...`

Building this Story turns each plan Task into an artifact of its own. First the Task and Tasks payloads are typed and the pure rules (row checks, the edit check, number allocation) are written; then the module that creates the Task set at plan approval, reconciles a re-plan and edits a Task; then the tracker bookkeeping and every reader of the old Plan record move onto the Task heads; and last the approve flow, the daemon seam and the build gate are wired to it.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Type the TASK and TASKS payload codecs | M | — | unit: tasks-codec.test.ts: the TASK and TASKS codecs round-trip a Task payload and a Tasks payload and refuse a malformed body | [[c4]] |
| 2 | **`t2`** Add the pure Task diff, row validation, edit check and number allocation | M | `t1` | unit: task-diff.test.ts: a plan row maps to a Task payload, the diff reports an equal Task as unchanged, and row validation rejects a bad size, a duplicate id and an order gap; unit: task-edit-check.test.ts: a patch that names order or a dependency, or a Task that is completed or withdrawn, is refused with a pointer to a re-plan; unit: task-numbers.test.ts: the next number only grows and never takes a withdrawn Task's id | [[c1]] [[c4]] |
| 3 | **`t3`** Implement createFromPlan | L | `t2` | integration: task-set-create.test.ts: createFromPlan writes the Tasks file and one approved Task head per plan Task with parent, dependencies and a derived-from reference, and a repeat writes nothing | [[c1]] [[c5]] |
| 4 | **`t4`** Implement reconcile and edit | L | `t3` | integration: task-set-reconcile.test.ts: a re-plan revises a changed Task, withdraws a dropped Task and closes its issue, adds a new Task under the next number, and never reuses an id; integration: task-set-edit.test.ts: editing a Task's summary, size, checks or tests moves it to a new revision in draft with no signoff, a structural edit is refused and writes nothing, and a conflicting edit is refused | [[c1]] [[c5]] |
| 5 | **`t5`** Add syncTasksOnPlanApproval, build rounds and the Task-based completion evidence | M | `t4` | integration: task-set-sync.test.ts: syncTasksOnPlanApproval creates the set for a new plan, reconciles a newer plan revision, does nothing when they agree and returns an error instead of throwing; integration: task-build-rounds.test.ts: a passing build round completes the Task, a later failing round does not, and the Story completes through the roll-up | [[c2]] [[c3]] |
| 6 | **`t6`** Move the Task unit's issue record onto the TASK head | L | `t5` | integration: task-unit-issue.test.ts: a Task's issue is created under the Story's issue and bound on its Task head with no record on the Plan, the draft hook claims the Epic and the Story only, and a Task with no head resolves through the Plan | [[c4]] [[c5]] |
| 7 | **`t7`** Move the remaining Plan Task-record readers | M | `t6` | integration: task-readers.test.ts: an issue number resolves to a Task through its head's binding, the tracker runner's dedup read and the orchestrator's push result use the head, and a Task with no head resolves through the Plan | [[c5]] [[c6]] |
| 8 | **`t8`** Run the Task sync from the approve flow and the daemon seam | L | `t7` | integration: task-set-approve.test.ts: approving a plan creates the Task set and each Task's issue is bound on its Task head under the Story's issue, through the cli approve flow and the daemon seam, and a failed sync never fails the approval | [[c2]] [[c5]] |
| 9 | **`t9`** Record a Task's build round from the build validate phase | S | `t5` | integration: validate-task-round.test.ts: a validate turn records its round in the Task's own log, and a Task with no head keeps writing the BUILD record only | [[c3]] |
| 10 | **`t10`** Record the s9 hand-offs | S | `t8`, `t9` | integration: s7-handoffs.test.ts: the plans document names each s7 hand-off to s9 | [[c6]] |

### 1.1 E202610212f27754d:S007:T001 — Type the TASK and TASKS payload codecs

Add src/workflow/tasks/types.ts with TaskPayload (title, summary, size, order, acceptanceChecks, tests, planTaskId), TasksPayload (planRevision, taskIds, nextNumber), TaskSetError and TaskStructureError, and replace the pass-through bodies of the TASK and TASKS codecs in src/workflow/artifact-core/codecs.ts with decoders that refuse a malformed body.

**Acceptance checks:**
- The TASK and TASKS codecs round-trip a typed payload and refuse a body with a missing or wrongly typed field
- TaskPayload carries planTaskId and TasksPayload carries planRevision, taskIds and nextNumber
- No other kind's codec changes behaviour

### 1.2 E202610212f27754d:S007:T002 — Add the pure Task diff, row validation, edit check and number allocation

Add src/workflow/tasks/pure.ts: map a plan row to a TaskPayload, diff a Task against a row, validate the plan rows (size S/M/L, unique ids, contiguous order, plus checkPlanTaskGraph with the plan's citations), check an edit patch against the editable fields and the Task's status with a pointer to a re-plan, and allocate the next number from a TasksPayload so it only grows.

**Acceptance checks:**
- A patch naming order or a dependency, or a Task that is completed, withdrawn or superseded, is refused with a message that points to a re-plan
- Row validation rejects a bad size, a duplicate id and an order gap and passes the plan's own citations to checkPlanTaskGraph
- Number allocation only grows and never returns the number of a withdrawn Task
- The diff reports a Task as unchanged when its payload equals the row

### 1.3 E202610212f27754d:S007:T003 — Implement createFromPlan

Add src/workflow/tasks/task-set.ts with createFromPlan: validate the rows, write one TASK head per row (parent the Story, a depends-on reference per dependsOn and a derived-from reference to the approved PLAN at its revision), approve each through LifecycleService.apply as the plan's approving actor, move a Task record found on the Plan onto the head's binding, and write the TASKS head last; a repeat for the same plan revision writes nothing.

**Acceptance checks:**
- createFromPlan writes the TASKS head and one approved TASK head per plan Task, each with parent, depends-on and derived-from references
- A repeat for the same plan revision writes nothing and returns the same set
- A plan with no Tasks writes a TASKS head with no ids and nextNumber 1
- A Task record already on the Plan is moved onto its TASK head's binding

### 1.4 E202610212f27754d:S007:T004 — Implement reconcile and edit

Extend src/workflow/tasks/task-set.ts with reconcile (revise a changed Task matched by planTaskId, withdraw a dropped Task and close its issue through an injected tracker port or record the pending close, create a new Task under nextNumber, then record the plan revision last) and edit (editable fields only, applied inside an ArtifactStore.update mutator that refuses with LifecycleConflictError when the head's revision differs from the one read).

**Acceptance checks:**
- A changed Task moves to a new revision and returns to draft, a dropped Task is withdrawn and its issue closed, a new Task takes the next number and no id is reused
- edit moves the Task to a new revision in draft with no signoff and leaves the plan head and the other Tasks untouched
- A structural edit is refused and writes nothing; an identical edit writes nothing
- An edit and a reconcile that read the same revision cannot both land: the second is refused with LifecycleConflictError
- A failed issue close is recorded as a pending close and returned in the result

### 1.5 E202610212f27754d:S007:T005 — Add syncTasksOnPlanApproval, build rounds and the Task-based completion evidence

Add syncTasksOnPlanApproval (create, reconcile or nothing; never throws, returns { error }), recordBuildRound (a revision-less History.appendLog entry under ArtifactStore.exclusive) in src/workflow/tasks/task-set.ts, and make taskBuildPassed in src/workflow/artifact-core/completion-evidence.ts read the latest round of the Task's own log, falling back to the BUILD record only for a Task with no head.

**Acceptance checks:**
- syncTasksOnPlanApproval creates the set for a new plan, reconciles a newer plan revision, does nothing when they agree, and returns { error } instead of throwing
- recordBuildRound appends a log entry that moves no revision
- taskBuildPassed answers from the latest round, so a later failing round un-passes the Task, and falls back to the BUILD record only for a Task with no head
- A passing round completes the Task and the Story through the roll-up

### 1.6 E202610212f27754d:S007:T006 — Move the Task unit's issue record onto the TASK head

Point bindingHome and readRecord in src/workflow/tracker/unit-issue.ts at the TASK head for a task unit (the Plan only for a Task with no head), stop recordUnit writing the Plan's units and taskRefs for a Task, make src/workflow/tracker-auto.ts pushTasks map a plan row to its TASK id through the TASKS head, and stop src/workflow/draft-issues.ts claiming Task units.

**Acceptance checks:**
- A Task's issue is created under the Story's issue and bound on its TASK head, with no Task record written on the Plan
- The draft hook claims the Epic and the Story only
- pushTasks maps each plan row to its TASK id and a Task with no head still resolves through the Plan fallback
- Existing Epic and Story unit-issue behaviour is unchanged

### 1.7 E202610212f27754d:S007:T007 — Move the remaining Plan Task-record readers

Make the Task branch of buildRef and resolveByIssue in src/workflow/tracker/resolve.ts, the prior-taskRefs dedup read in src/workflow/runners/tracker/context.ts and the taskRefs write in src/workflow/orchestrator.ts read the TASK head's binding, keeping the Plan fallback only for a Task with no head.

**Acceptance checks:**
- #N resolves to a new Task through its head's binding and buildRef carries its issueRef
- The tracker runner's dedup read and the orchestrator's push result use the TASK head's binding for a Task that has a head
- A Task with no head still resolves through the Plan fallback

### 1.8 E202610212f27754d:S007:T008 — Run the Task sync from the approve flow and the daemon seam

Make approve() in src/cli/services/workflow.ts async and call syncTasksOnPlanApproval before the Task push, update its type in src/cli/services/index.ts and its callers in src/cli/panes/WorkflowsPane.tsx and src/cli/command.ts, add a 'tasks-sync' kind to FollowOnOutcome in src/workflow/gates.ts, and add src/daemon/tasks-sync.ts called at both follow-on sites in src/daemon/index.ts, running the sync and then the Task push.

**Acceptance checks:**
- Approving a plan through the cli flow and through the daemon seam creates the Task set and binds each Task's issue on its TASK head under the Story's issue
- approve() is async and its callers await it
- A failed sync is reported beside the approval and never fails it, and shows as ok:false in the daemon follow-on

### 1.9 E202610212f27754d:S007:T009 — Record a Task's build round from the build validate phase

Make src/daemon/steps/build-step/phases/validate.ts call recordBuildRound with the gate's verdict for the Task being validated, keeping the BUILD record write, and log and skip the Task write when the Task has no head.

**Acceptance checks:**
- A validate turn records its round (passed or failed, with the summary) in the Task's own log
- A Task with no head keeps writing the BUILD record only

### 1.10 E202610212f27754d:S007:T010 — Record the s9 hand-offs

Add a section to docs/plans/core-data-model.md naming what s7 leaves for s9: creating Task heads for the Stories planned before s7 and then removing the two head-less fallbacks (the Plan's Task record and the BUILD record's per-task result) and the Plan's taskRefs fields, the PLAN document's task table rendered from the Tasks (Gap 11.4), and the revision-less build-round entries.

**Acceptance checks:**
- The plans document names each s7 hand-off to s9
- No code changes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the Task diff and the plan-row to TaskPayload mapping | `t2` |
| the edit patch check that names order, dependencies and structural changes | `t2`, `t4` |
| nextNumber allocation that only grows and skips withdrawn ids | `t2`, `t4` |
| the TASK and TASKS payload codecs (encode, decode, refusal of a malformed body) | `t1` |
| createFromPlan writes the TASKS head and a TASK head per row, once | `t3` |
| reconcile revises, withdraws and adds without reusing an id | `t4` |
| edit returns a Task to draft with a new revision and leaves the plan and the other Tasks alone | `t4` |
| a structural edit is refused with a pointer to a re-plan | `t2`, `t4` |
| recordBuildRound and taskBuildPassed complete a Task and, through the roll-up, the Story | `t5`, `t9` |
| the approve flow and the daemon seam both create the Task set, and each Task issue is bound on its TASK head under the Story's issue | `t6`, `t7`, `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 the api of createFromPlan, reconcile and edit (sc7)`
- **[[c2]]** `prior-artifact` `LLD s7 the api of syncTasksOnPlanApproval and the daemon seam`
- **[[c3]]** `prior-artifact` `LLD s7 the api of recordBuildRound and taskBuildPassed`
- **[[c4]]** `prior-artifact` `LLD s7 the data model: TaskPayload, TasksPayload, the Task issue record, taskBuildPassed`
- **[[c5]]** `prior-artifact` `LLD s7 the binding requirements recorded with its approval in docs/plans/core-data-model.md`
- **[[c6]]** `prior-artifact` `LLD s7 the migration steps and the s9 hand-offs`
