<!-- insrc:artifact LLD-2f27754d4ad00b8e-s7 -->

# LLD: E202610212f27754d:S007

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `bd468fd6cd6c...`

When a plan is approved, each of its Tasks becomes an artifact of its own, with its own id, revision, status, change log, feedback and issue, and the Story's Tasks sit together under one Tasks file that also hands out the next Task number. A person can refine a Task's wording, size, checks or tests without redoing the plan; the Task returns to draft and needs the local user's approval again, and the plan keeps its revision. Adding, dropping or reordering Tasks, or changing what depends on what, is refused with a pointer to a re-plan, and when a re-plan is approved the Tasks are brought into line without ever reusing an id. A Task's build rounds are written to its own history and it completes when a round passes the gate.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-2f27754d4ad00b8e** § 2. Framework summary

**Rollout phase:** Phase D — Tasks and tracker comment sync
**Owns:** `sc7` (TaskSet)
**Consumes:** `sc1` (ArtifactIdScheme), `sc2` (ArtifactEnvelope), `sc3` (HistoryRecords), `sc4` (Lifecycle), `sc6` (TrackerBinding)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The id module and its removal of the second scheme: the folder-name formatter moved into the path scheme, the date source fixed to the epic's creation time, the functional-requirement id helpers and their callers moved with stored FR ids staying valid, issue titles switched to the artifact id, and the delivery module's ordinals. The old issue-body marker is not read. Private to this Story are the exact text of the issue title and the relocation of the helpers. — owns `sc1`
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `createFromPlan`

```typescript
createFromPlan(planId: string, by: Actor): Promise<TaskSet>
```

**Parameters:**
- `planId: string` — The approved PLAN artifact id of the Story (PLAN-<hash>-s1)
- `by: Actor` — The actor recorded on every write

**Returns:** `TaskSet` — The TASKS id and the Task artifacts that now exist, in plan order

**Errors:**
- `TaskSetError` when the plan is not approved, has no head, or a Task row is malformed

**Preconditions:**
- The plan head is approved at the revision it is read at
- The TASKS head is absent, or present and made from the same plan revision (a repeat)

**Postconditions:**
- A TASKS head exists naming the plan revision, the ordered Task ids and the next number
- One TASK head per plan Task exists with parent the Story id, status draft, and a depends-on reference per dependsOn
- A repeat for the same plan revision writes nothing and returns the same set

### 2.2 `reconcile`

```typescript
reconcile(planId: string, by: Actor): Promise<{ changed: string[]; withdrawn: string[]; added: string[] }>
```

**Parameters:**
- `planId: string` — The re-planned PLAN artifact id, approved at a higher revision than the TASKS head records
- `by: Actor` — The actor recorded on every write

**Returns:** `{ changed: string[]; withdrawn: string[]; added: string[] }` — The Task ids whose content moved to a new revision, the Task ids withdrawn, and the Task ids created

**Errors:**
- `TaskSetError` when the plan is not approved, or the TASKS head is missing (use createFromPlan)

**Preconditions:**
- The plan is approved and its revision is greater than the revision the TASKS head records

**Postconditions:**
- A Task whose payload differs gets a new revision through LifecycleService.updateContent and returns to draft
- A Task absent from the plan is withdrawn through LifecycleService.apply with the withdraw operation and its issue is closed
- A Task new in the plan takes the TASKS head's next number, which then moves past it; no number is ever reused, including the number of a withdrawn Task
- The TASKS head records the new plan revision last, so a failure part-way is finished by repeating the call

### 2.3 `edit`

```typescript
edit(taskId: string, patch: Partial<TaskPayload>, by: Actor): Promise<void>
```

**Parameters:**
- `taskId: string` — The TASK artifact id
- `patch: Partial<TaskPayload>` — The fields to change: title, summary, size, acceptanceChecks, tests
- `by: Actor` — The person editing

**Returns:** `void` — Resolves when the new revision is stored

**Errors:**
- `TaskStructureError` when the patch names order, or a dependency, or the Task is not in draft or approved status; the message points to a re-plan
- `ArtifactNotFoundError` when no TASK head for the id

**Preconditions:**
- The Task is not completed, withdrawn or superseded

**Postconditions:**
- The Task has a new revision, status draft, no signoff, an update log entry naming the actor, and open feedback it addresses
- The plan head and the other Tasks are untouched

### 2.4 `syncTasksOnPlanApproval`

```typescript
syncTasksOnPlanApproval(planJsonPath: string, by: Actor): Promise<{ created: string[]; changed: string[]; withdrawn: string[]; added: string[] } | { error: string }>
```

**Parameters:**
- `planJsonPath: string` — The approved plan's json path as the approve flow holds it
- `by: Actor` — The approving actor

**Returns:** `{ created: string[]; changed: string[]; withdrawn: string[]; added: string[] } | { error: string }` — What the approval did to the Task set, or why nothing was attempted

**Preconditions:**
- The artifact is an approved plan

**Postconditions:**
- Calls createFromPlan when no TASKS head exists, reconcile when the plan revision is newer, and does nothing when they agree; never throws, so a plan approval is never failed by it

### 2.5 `recordBuildRound`

```typescript
recordBuildRound(taskId: string, round: { passed: boolean; summary: string; data?: unknown }, by: Actor): Promise<void>
```

**Parameters:**
- `taskId: string` — The TASK artifact id
- `round: { passed: boolean; summary: string; data?: unknown }` — The gate's verdict for one build round
- `by: Actor` — The daemon actor that ran the gate

**Returns:** `void` — Resolves when the round is in the Task's change log

**Errors:**
- `ArtifactNotFoundError` when no TASK head for the id

**Preconditions:**
- The Task head exists

**Postconditions:**
- A log entry with operation update-free outcome {result: pass|fail, summary, data} is appended to the Task's log without moving its revision
- A passing round is what taskBuildPassed reads

### 2.6 `taskBuildPassed`

```typescript
taskBuildPassed(taskId: string): Promise<boolean>
```

**Parameters:**
- `taskId: string` — The TASK artifact id

**Returns:** `boolean` — True when the latest recorded build round of the Task passed

**Postconditions:**
- Reads the Task's own log, and falls back to the BUILD record's body.tasks only while the Task has no head (a Story built before s9)

## 3. Data model changes

### 3.1 `TaskPayload (the body of a TASK head)` — new

The typed payload of a TASK head: title, summary, size S|M|L, order (1-based position in the plan), acceptanceChecks, tests {level, name}[], and the plan row id (t1..). The TASK codec replaces the pass-through for the body; the dependency edges are References (depends-on) on the envelope, not payload.

```
interface TaskPayload { title: string; summary: string; size: 'S'|'M'|'L'; order: number; acceptanceChecks: string[]; tests: { level: 'unit'|'integration'|'live'|'smoke'; name: string }[] }
```

**Call sites:**
- `src/workflow/artifact-core/codecs.ts`
- `src/workflow/artifacts/plan.ts`

### 3.2 `TasksPayload (the body of the TASKS head)` — new

The Tasks file of a Story: the plan revision it was made from, the Task ids in plan order including withdrawn ones, and nextNumber, the number the next new Task takes. nextNumber only ever grows, which is what keeps a Task id from being reused.

```
interface TasksPayload { planRevision: number; taskIds: string[]; nextNumber: number }
```

**Call sites:**
- `src/workflow/artifact-core/codecs.ts`
- `src/workflow/artifact-core/sidecar-store.ts`

### 3.3 `Task issue record` — field-modify

A Task unit's issue record moves from the Plan's meta.tracker.units to the TASK head's meta.envelope.binding: bindingHome and readRecord in unit-issue.ts answer the TASK head for a task unit, bindArtifact and recordPosted work on it, and the Task branch of recordUnit stops writing the Plan record and taskRefs.

**Call sites:**
- `src/workflow/tracker/unit-issue.ts`
- `src/workflow/tracker/binding.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/draft-issues.ts`

### 3.4 `CompletionEvidence.taskBuildPassed` — invariant-change

Reads the Task's own build rounds instead of the BUILD record's per-task results; the BUILD record keeps its results for the delivery view.

**Call sites:**
- `src/workflow/artifact-core/completion-evidence.ts`
- `src/workflow/artifact-core/lifecycle.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc7` | implements | Owns TaskPayload, TaskSet, createFromPlan, reconcile and edit as sketched, adding the actor parameter, a typed TASKS payload with nextNumber, and syncTasksOnPlanApproval as the one entry the approve flow calls. |
| `sc2` | consumes | Every TASKS and TASK head is read and written through ArtifactStore (write, read, childrenOf); parent is the Story id and dependencies are depends-on References. |
| `sc3` | consumes | Each create, content revision, withdraw and build round is one change log entry appended by the store; Task feedback uses the shared TASKS feedback file through the sidecar store. |
| `sc4` | consumes | updateContent returns an edited Task to draft with a new revision; apply(withdraw) withdraws a dropped Task; the TASK roll-up completes the Story from Task status. |
| `sc6` | consumes | A Task's issue is bound on the TASK head with bindArtifact; the existing tracker push creates each Task's issue under the Story's issue, and a withdrawn Task's issue is closed through the tracker port. |
| `sc1` | consumes | TASK and TASKS ids come from ArtifactIds.make and are parsed with ArtifactIds.parse. |

## 5. Error paths

**Error cases**

- **The plan is approved but writing the Task set fails part-way (a TASK head written, the TASKS head not, or the process stops between the plan approval and the Task creation)** (recoverable)
  - Detection: syncTasksOnPlanApproval compares the TASKS head's planRevision and taskIds with the plan's rows and the TASK heads that exist (childrenOf the Story id); a TASKS head that is absent or older than the plan, or a plan row with no TASK head, is the gap
  - Response: createFromPlan and reconcile write the TASK heads first and the TASKS head last, and skip a head that already exists with the same content, so repeating the call finishes the job; the failure is logged and returned as { error } to the approve flow, which reports it with the approval and never fails the approval
  - User impact: The plan stays approved and the approve result names the Task set as incomplete; the next approve of the plan, or the daemon seam, finishes it
- **A Task edit names order or a dependency, or tries to add or drop a Task** (recoverable)
  - Detection: edit compares the patch keys with the editable set (title, summary, size, acceptanceChecks, tests) and checks that the target id is an existing TASK head
  - Response: Throws TaskStructureError with a message that points to re-planning the Story; nothing is written
  - User impact: The person sees why it was refused and what to do instead (run the plan workflow and approve the new plan)
- **A Task edit arrives for a Task that is completed, withdrawn or superseded** (recoverable)
  - Detection: edit reads the head's lifecycle status before writing
  - Response: Throws TaskStructureError naming the status; no write
  - User impact: A finished Task is not reopened by an edit; a person reopens it explicitly through the lifecycle first
- **Two writers change the same Task at once (an edit and a reconcile, or two edits)** (recoverable)
  - Detection: The store serialises writes per artifact; updateContent reads the head, compares its revision with the one the caller read, and the store raises LifecycleConflictError when they differ
  - Response: The second write is refused with the conflict error; the caller re-reads and retries
  - User impact: One edit lands; the other is told to retry on the new revision
- **The plan's Task rows are malformed (a duplicate id, an unknown dependsOn, an order gap, a size outside S, M, L)** (recoverable)
  - Detection: createFromPlan and reconcile validate the rows with the plan's own checkPlanTaskGraph before writing any head
  - Response: Throws TaskSetError listing the rows; nothing is written
  - User impact: The approve result shows the Task set was not made and why; the plan has to be fixed and re-approved
- **A dropped Task's issue cannot be closed (offline, gh failure)** (recoverable)
  - Detection: The tracker port returns a failed PortResult for the close
  - Response: The Task is still withdrawn; the failed close is recorded as a pending close on the TASK head's binding (pendingLink-style bookkeeping from s6) and returned in the reconcile result, and the next sync retries it
  - User impact: The Task shows withdrawn locally and its issue closes on the next sync
- **A build round is recorded for a Task that has no head (a Story planned and built before s9 created Task artifacts)** (recoverable)
  - Detection: recordBuildRound reads the TASK head and gets ArtifactNotFoundError
  - Response: The build step logs the miss and keeps writing the BUILD record's per-task result as it does today; taskBuildPassed falls back to the BUILD record only when the Task has no head
  - User impact: No change for an old Story; a new Story's Task rounds go to the Task

**Edge cases**

| Input | Expected |
| :--- | :--- |
| createFromPlan is called a second time for the same plan revision | Nothing is written and the same TaskSet is returned |
| A plan with no Tasks is approved | A TASKS head with an empty taskIds list and nextNumber 1 is written, no TASK head and no issue |
| A re-plan drops t2 and adds a new Task | t2 is withdrawn, its id stays recorded in taskIds, and the new Task takes the TASKS head's nextNumber (t3 or higher), never t2 |
| A re-plan reorders two Tasks without changing their content | Each Task's order changes in its payload so each moves to a new revision, and the plan, not a person, made the change |
| A re-plan changes nothing in the Tasks | No Task moves; the TASKS head records the new plan revision and nothing else is written |
| An edit whose patch equals the current content | No revision moves, no log entry is written (an identical rewrite does not move a revision) |
| A Task is edited after it was approved | It returns to draft with a new revision and needs the local user's approval again; its signoffs are not opened |
| A build round passes, then a later round fails | taskBuildPassed answers from the latest round, so the Task is not complete on the earlier pass; completion is the roll-up's, recorded once |

**Invariants to preserve**

- A Task id is never reused: nextNumber on the TASKS head only grows, and a withdrawn Task keeps its id in taskIds [[c1]]
- A revision moves only when content changes; a build round, a binding write or an identical rewrite does not move it [[c1]]
- The plan's own revision and head are never written by a Task edit or a reconcile [[c1]]
- Heads are replaced atomically and the log entry is appended before the head, so a failure leaves a repairable gap rather than a torn Task [[c1]]
- A plan approval is never failed by the Task set; a failure is reported beside it [[c6]]

## 6. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — The pure parts: the diff of a Task against a plan row, the editable-field check, number allocation from the TASKS head, and the TASK and TASKS codecs
  - Subjects: `the Task diff and the plan-row to TaskPayload mapping`, `the edit patch check that names order, dependencies and structural changes`, `nextNumber allocation that only grows and skips withdrawn ids`, `the TASK and TASKS payload codecs (encode, decode, refusal of a malformed body)`
  - Fixtures: `a plan fixture with Task rows (the approve-fallback kit's seed)`
- **integration** — The module against a real durable store and lifecycle service in a temp repository: creation, reconcile, edit, withdrawal, build rounds and completion
  - Subjects: `createFromPlan writes the TASKS head and a TASK head per row, once`, `reconcile revises, withdraws and adds without reusing an id`, `edit returns a Task to draft with a new revision and leaves the plan and the other Tasks alone`, `a structural edit is refused with a pointer to a re-plan`, `recordBuildRound and taskBuildPassed complete a Task and, through the roll-up, the Story`, `the approve flow and the daemon seam both create the Task set, and each Task issue is bound on its TASK head under the Story's issue`
  - Fixtures: `durableKit (a temp repo with a durable store)`, `the fake tracker of the approve-fallback kit`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac20` | `unit: tasks-codec.test.ts: the TASK and TASKS codecs round-trip a Task payload and a Tasks payload and refuse a malformed body`, `integration: task-set-create.test.ts: createFromPlan writes the Tasks file and one Task head per plan Task with parent, dependencies and status draft, and a repeat writes nothing`, `integration: task-set-approve.test.ts: approving a plan creates the Task set and each Task's issue is bound on its Task head under the Story's issue, through the cli approve flow and the daemon seam` |
| `ac21` | `integration: task-set-edit.test.ts: editing a Task's summary, size, checks or tests moves it to a new revision in draft with no signoff and leaves the plan and the other Tasks untouched` |
| `ac22` | `unit: task-edit-check.test.ts: a patch that names order or a dependency, or a Task that is completed or withdrawn, is refused with a pointer to a re-plan`, `integration: task-set-edit.test.ts: a refused structural edit writes nothing` |
| `ac23` | `unit: task-numbers.test.ts: the next number only grows and never takes a withdrawn Task's id`, `integration: task-set-reconcile.test.ts: a re-plan revises a changed Task, withdraws a dropped Task and closes its issue, adds a new Task under the next number, and never reuses an id`, `integration: task-build-rounds.test.ts: a passing build round completes the Task, a later failing round does not, and the Story completes through the roll-up` |

## 7. Migration

**State before:** A Task is only a row in the Plan's body.tasks. Its issue record is in the Plan's meta.tracker.units and taskRefs (s6 left a two-home accessor, bindingHome and readRecord, in src/workflow/tracker/unit-issue.ts). The codec registry holds pass-through codecs for TASKS and TASK, and the sidecar store already points every TASK at its Story's TASKS log and feedback files. CompletionEvidence.taskBuildPassed reads the BUILD record's body.tasks[].passed, and a Task's build rounds are in no Task history (src/workflow/artifact-core/completion-evidence.ts, src/workflow/artifacts/plan.ts, src/workflow/tracker/unit-issue.ts).

**State after:** Approving a plan creates a TASKS head and a TASK head per plan Task, each Task with its own revision, status, log, feedback and binding; the Task unit's issue record lives on its TASK head under the Story's issue; edits go through the Task's own revision; a re-plan reconciles the set without reusing an id; a Task's build rounds are in its own log and taskBuildPassed reads them. The Plan no longer carries Task issue records.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Type the TASK and TASKS payload codecs (replace the two pass-through bodies) and add TaskStructureError and TaskSetError; no stored data changes yet — ↩ rollbackable
2. Add the TaskSets module (createFromPlan, reconcile, edit, syncTasksOnPlanApproval, recordBuildRound) with its Task diff, number allocation and edit check; nothing calls it yet — ↩ rollbackable
3. Call syncTasksOnPlanApproval from the cli approve service before the Task push, and from the daemon's post-approval seam as a second follow-on kind, so a plan approved from either path gets its Task set — ↩ rollbackable
4. Point bindingHome and readRecord at the TASK head for a task unit, make recordUnit stop writing the Plan's units and taskRefs for a Task, and make the draft-issues hook and pushTasks resolve the Task's head before creating its issue — ✕ non-rollbackable _(needs: `step 3 is in place, so every newly approved plan has its Task heads`)_
5. Write each build round to the Task's log from the build validate phase and make taskBuildPassed read it, with the BUILD record read only for a Task that has no head — ↩ rollbackable
6. Record the hand-offs in docs/plans/core-data-model.md: s9 creates Task heads for the stories planned before this Story and then removes the BUILD-record fallback and the Plan's Task record fields — ↩ rollbackable

**Backward compat:** A Story planned and approved before this Story has no TASKS or TASK heads, and its Task issue records are still in the Plan. Nothing rewrites them here: bindingHome answers the Plan only for a Task that has no head, and taskBuildPassed reads the BUILD record only for a Task that has no head. s9 creates the heads for those Stories and removes both fallbacks. The public surfaces (the approve result, the tracker.attach method) gain fields and a follow-on kind and lose none.

## 8. Alternatives considered

### 8.1 a1: A TaskSets module, run once from the approve flow, beside the tracker push — **CHOSEN**

One new module creates the TASKS head and a TASK head per plan Task after a plan approval, reconciles a later plan revision, and handles edits; the cli approve service calls it before the Task issues are pushed.

A new src/workflow/tasks module implements sc7: createFromPlan writes the TASKS head (the ordered Task ids, the plan revision it was made from, and the next number to hand out) and one TASK head per PlanTask through ArtifactStore.write, each with parent = the Story id and a depends-on reference per dependsOn. reconcile(planId) diffs the plan's current Tasks against the TASK heads: a Task whose payload differs gets a content revision through LifecycleService.updateContent, a Task missing from the plan is withdrawn through apply(withdraw) and its issue closed, a new plan Task takes the next number from the TASKS head and is created. edit(taskId, patch, by) accepts only title/summary/size/acceptanceChecks/tests, writes through updateContent (new revision, status back to draft, no signoff), and refuses a patch that touches order or dependsOn with a message pointing to a re-plan. The cli approve service (src/cli/services/workflow.ts approve) calls createFromPlan or reconcile right after the plan approval and before autoPushTasksOnPlan, whose Task units then bind on the TASK head (bindingHome for a task unit points there). The build validate phase appends the round to the Task's log (updateAndLog with an outcome) and taskBuildPassed reads the latest round of the TASK head.

### 8.2 a2: Create the Tasks inside approveWorkflowTarget through the lifecycle service

The Task set is created in the gate itself, in the same function that stamps the plan approval, so every approval path creates it.

approveWorkflowTarget in src/workflow/gates.ts gains a step after the plan approval is applied through the lifecycle service: with the service present it calls TaskSets.createFromPlan or reconcile. The cli approve service and the daemon handler both reach it because both call the gate. The TASK heads are written by the same service instance the gate holds, so the approval and the Tasks share one actor and one clock.

**Rejected because:** Reaches every approval path with one call site, but puts a second responsibility in a gate other Stories own and needs an async seam in synchronous code.

### 8.3 a3: Create a Task head lazily, on first build or first edit

A TASK head is written when something first needs it, with the plan row as the source until then.

The plan keeps the Task rows. A TASK head is created from its plan row the first time a build round, an edit or a comment sync touches that Task. The TASKS file is not written at approval.

**Rejected because:** Smallest, but fails the first criterion and leaves two sources for a Task.

### 8.4 a4: Keep the Tasks in the TASKS head body only

One TASKS head holds every Task as a row with its own status and issue fields; there are no TASK heads.

The TASKS head's body carries the ordered Task rows, each with its status, revision, binding and build rounds. Edits rewrite the one head and the shared log carries per-Task entries.

**Rejected because:** Breaks the model the lifecycle roll-up and sc7 already assume.

## 9. References

- **[[c1]]** `analyze-bundle` `the store, lifecycle service and completion evidence s7 consumes` — "ArtifactStore.write/update/updateAndLog/childrenOfStrict write one head with its log entry through a journal; LifecycleService.apply runs one lifecycle operation, updateContent writes content with a r"
- **[[c2]]** `analyze-bundle` `ids and parentage of TASKS and TASK` — "FileSidecarStore.filesOf gives every TASK the change log and feedback files of its Story's TASKS id"
- **[[c3]]** `analyze-bundle` `the build gate and the BUILD record's per-task results` — "A Task's build rounds are not recorded in any Task history today."
- **[[c4]]** `doc` `docs/plans/core-data-model.md`
- **[[c5]]** `code` `src/workflow/artifact-core/completion-evidence.ts`
- **[[c6]]** `analyze-bundle` `the plan, its tasks and where Task issue records live` — "approval of a plan runs approveWorkflowTarget in src/workflow/gates.ts, then the cli approve service pushes Task issues through pushTasks in src/workflow/tracker-auto.ts"
- **[[c7]]** `code` `src/workflow/artifact-core/sidecar-store.ts`
- **[[c8]]** `code` `src/workflow/tracker/unit-issue.ts`

## 10. Open questions

- A Task head is written in draft status by createFromPlan (contract postcondition), but a Task whose edit 'returns to draft' and 'needs re-approval' (ac21) and whose build is admitted by the plan's approval must start approved. Resolve: after writing each head, createFromPlan applies the approve operation through LifecycleService.apply as the plan's approving actor, so a new Task is approved on the plan's approval and an edit later returns it to draft (recommended), or leave new Tasks in draft and add a separate Task approval step before build (a change to the build admission gate).
- recordBuildRound is a log entry that moves no revision (a build round is not content, so k3 forbids a revision move). The store has no log-only method; the contract says it is appended to the Task's log. Resolve: append a revision-less entry with History.appendLog under ArtifactStore.exclusive, which the integrity check already skips when it looks for the log tail with a revision (recommended), or add a log-only write to ArtifactStore (a change to s2's store).
- Until s9 creates Task heads for the Stories planned before this one, bindingHome falls back to the Plan's Task record and taskBuildPassed to the BUILD record for a Task with no head, which is compatibility code the Epic's no-compatibility rule discourages. Resolve: accept both fallbacks as s9-bound and record them in docs/plans/core-data-model.md for s9 to remove (recommended), or drop them and fail for a Task with no head (no Story planned before this one is still open to build).
- The daemon's workflow.approve path does not run the cli approve service, so the Task set would be missed when a plan is approved there. Resolve: add a 'tasks-sync' follow-on kind to FollowOnOutcome beside s6's 'tracker-attach' and call syncTasksOnPlanApproval from the same seam at both daemon sites (recommended), or call it from approveWorkflowTarget (a change to the gate s3 and s4 own).

## Resolved questions

- `qd6a1430f` — A Task head is written in draft status by createFromPlan (contract postcondition), but a Task whose edit 'returns to draft' and 'needs re-approval' (ac21) and whose build is admitted by the plan's approval must start approved. Resolve: after writing each head, createFromPlan applies the approve operation through LifecycleService.apply as the plan's approving actor, so a new Task is approved on the plan's approval and an edit later returns it to draft (recommended), or leave new Tasks in draft and add a separate Task approval step before build (a change to the build admission gate).
  - **resolved**: createFromPlan applies approve through LifecycleService.apply as the plan's approving actor after writing each head; an edit later returns the Task to draft (recommended) — Approved with the LLD (owner chose A, recommended answers). _(2026-10-21T17:23:21.736Z)_

## Citations

- **[[c1]]** `analyze-bundle` `the store, lifecycle service and completion evidence s7 consumes` — "ArtifactStore.write/update/updateAndLog/childrenOfStrict write one head with its log entry through a journal; LifecycleService.apply runs one lifecycle operation, updateContent writes content with a r"
- **[[c2]]** `analyze-bundle` `ids and parentage of TASKS and TASK` — "FileSidecarStore.filesOf gives every TASK the change log and feedback files of its Story's TASKS id"
- **[[c3]]** `analyze-bundle` `the build gate and the BUILD record's per-task results` — "A Task's build rounds are not recorded in any Task history today."
- **[[c4]]** `doc` `docs/plans/core-data-model.md`
- **[[c5]]** `code` `src/workflow/artifact-core/completion-evidence.ts`
- **[[c6]]** `analyze-bundle` `the plan, its tasks and where Task issue records live` — "approval of a plan runs approveWorkflowTarget in src/workflow/gates.ts, then the cli approve service pushes Task issues through pushTasks in src/workflow/tracker-auto.ts"
- **[[c7]]** `code` `src/workflow/artifact-core/sidecar-store.ts`
- **[[c8]]** `code` `src/workflow/tracker/unit-issue.ts`
