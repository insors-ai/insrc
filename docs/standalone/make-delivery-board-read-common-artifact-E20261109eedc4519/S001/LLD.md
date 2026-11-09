<!-- insrc:artifact LLD-eedc4519199b24b4-s1 -->

# LLD: STORY-eedc4519199b24b4-s1 — Make the delivery board read the common artifact model and migrate old records

## Summary

**Epic:** `make-delivery-board-read-common-artifact`
**HLD base run:** `wf-1794233694387-yokqfz`
**HLD effective hash:** `c67150e9bcc3...`

Approving a build now really completes its Story and Tasks and, once every Story the Epic declares is done, the Epic, which never happened before. A Task that failed its latest build, or was never finished, holds its Story back unless the approval carries an explicit override, which can also be given after the first approval. New records have a lifecycle from the moment they are written. A repair run brings existing records up to date at any schema version and reports, step by step, what it planned, wrote, held and could not do. The delivery board shows Epic, Story and Task status from those records.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `rollUp`

```typescript
rollUp(id: string, reader: ChildStatusReader, evidence: CompletionEvidence): Promise<Status | undefined>
```

**Parameters:**
- `id: string` — The TASK, STORY or EPIC head to evaluate
- `reader: ChildStatusReader` — Reads child listings and statuses
- `evidence: CompletionEvidence` — Build, review, Task-list, override and declared-Story facts

**Returns:** `Promise<Status | undefined>` — 'completed' when the condition holds. TASK: its latest build round passed (unchanged). STORY: its BUILD is approved, its review is clean or overridden, and either storyTasks answers none-required, or storyTasks answers listed and every listed Task that is not withdrawn or superseded has a head whose latest round passed, or the BUILD's approval carries an explicit override. A listed Task with no head, and an answer of not-created, count as unfinished. EPIC: every counted Story is completed, and every Story its DEF declares has a head that is completed, withdrawn or superseded.

**Errors:**
- `UnreadableChildError` when A head of the counted child kind cannot be read

**Preconditions:**
- id parses as an artifact id

**Postconditions:**
- Reads only
- A STORY's condition reads each Task's latest round, not its status, so a later failing round always counts

### 2.2 `unitMembers`

```typescript
unitMembers(id: string, reader: ChildStatusReader): Promise<string[]>
```

**Parameters:**
- `id: string` — The unit
- `reader: ChildStatusReader` — Reads the unit's children

**Returns:** `Promise<string[]>` — For a STORY, also its TASK children, so its open Tasks complete with it

**Postconditions:**
- A member that is completed, withdrawn or superseded is left alone, as completeMember already does
- Each frozen Task's log entry names the Story in frozenBy, and reopening the Story reopens the Tasks it froze

### 2.3 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — The approval request, naming an artifact or an Epic

**Returns:** `Promise<WorkflowApproveResult>` — As today, except that for each artifact enforceCodeReviewGate is given req.overrideReview or, for a BUILD whose status is approved or later, the override stored on its approval when the request has none

**Postconditions:**
- A draft BUILD is gated only on the request's override, so a stored reason never pre-approves a new revision
- A re-approval with no override in the request passes the gate on the stored override and retries completion

### 2.4 `approveArtifactByJsonPath`

```typescript
approveArtifactByJsonPath(jsonPath: string, opts: ApproveOptions): Promise<ApprovalResult>
```

**Parameters:**
- `jsonPath: string` — The record being approved
- `opts: ApproveOptions` — The lifecycle service, actor and any override reason

**Returns:** `Promise<ApprovalResult>` — As today. For a BUILD already approved or in signoff that is given an explicit override different from the one it carries, the override is first saved by the 'record-override' operation.

**Errors:**
- `IllegalTransitionError` when The BUILD's status does not allow an override to be recorded, for example it is completed

**Postconditions:**
- The BUILD's status, revision and approval time do not change when an override is recorded
- Other kinds, and a repeat of the same reason, record nothing
- The batch approval then runs completeThroughService, so the held Story completes when the rule now holds

### 2.5 `completeThroughService`

```typescript
completeThroughService(jsonPath: string): Promise<FollowOnOutcome | undefined>
```

**Parameters:**
- `jsonPath: string` — The approved record's path

**Returns:** `Promise<FollowOnOutcome | undefined>` — For a BUILD, an outcome of kind 'story-completion' with ok, a note and the ids completed. Undefined for other kinds. It never rejects.

**Preconditions:**
- The record was just approved or re-approved

**Postconditions:**
- The Story's and Epic's heads, and a head for every Story the DEF declares, exist before the walk
- The walk starts at the STORY, and the only path that completes a Task is its Story's cascade
- A failure leaves the approval standing and is reported with ok false
- A Story held back is reported with ok true and a note naming the Tasks that hold it, including listed Tasks with no head, or saying the Task set is not finished for the current plan

### 2.6 `handleWorkflowApprove`

```typescript
handleWorkflowApprove(params: unknown, deps?: WorkflowApproveDeps): Promise<WorkflowApproveResult | { error: string }>
```

**Parameters:**
- `params: WorkflowApproveRequest` — The approval request
- `deps: WorkflowApproveDeps` _(optional)_ — The post-approval seam

**Returns:** `Promise<WorkflowApproveResult | { error: string }>` — followOn holds the approval's own outcomes followed by the seam's; the error reply is unchanged

**Errors:**
- `{ error: string }` when The request is invalid, as today

**Postconditions:**
- A seam that returns outcomes no longer discards the story-completion outcome
- src/cli/services/workflow.ts exposes the story-completion outcome in its result

### 2.7 `handleRepoConvert`

```typescript
handleRepoConvert(params: unknown, repoEnv: string | undefined): Promise<ConversionReport | RepairReport | { error: string }>
```

**Parameters:**
- `params: RepoConvertParams` — repo and mode; mode gains 'repair-preview' and 'repair'
- `repoEnv: string | undefined` — Fallback repository path

**Returns:** `Promise<ConversionReport | RepairReport | { error: string }>` — Repair modes answer a RepairReport and work at any schema version. Once a repair has begun writing it always answers a RepairReport; { error } means nothing was written.

**Errors:**
- `{ error: string }` when Unknown mode, or a repository that is not a directory, or the plan lists a problem such as a rename collision, in which case nothing is written

**Postconditions:**
- 'repair-preview' writes nothing, and every write 'repair' makes belongs to a change the preview listed
- A second 'repair' lists no changes
- The schema marker and the preview and apply modes are unchanged

### 2.8 `createFromPlan`

```typescript
createFromPlan(planId: string, by: Actor, options?: { acceptLaterStatus?: boolean | undefined }): Promise<TaskSet>
```

**Parameters:**
- `planId: string` — The PLAN
- `by: Actor` — Who the Tasks are created by
- `options: { acceptLaterStatus?: boolean | undefined }` _(optional)_ — Repair passes true so a PLAN past approved qualifies

**Returns:** `Promise<TaskSet>` — The Task set, as today

**Errors:**
- `TaskSetError` when The PLAN does not qualify, or the TASKS head was made from a different plan revision

**Postconditions:**
- Without the option a PLAN must be approved, as today, for every live caller and for reconcile

### 2.9 `applyTasks`

```typescript
applyTasks(repo: string, deps: ConversionDeps, onWrite?: RepairRecorder): Promise<TasksResult>
```

**Parameters:**
- `repo: string` — The repository
- `deps: ConversionDeps` — Store, history and Task sets
- `onWrite: RepairRecorder` _(optional)_ — Told about each committed write during repair

**Returns:** `Promise<TasksResult>` — The Task sets created and the Tasks given a back-filled round, and in repair the Stories whose Task set could not be made

**Postconditions:**
- A BUILD result is matched to a Task by planTaskId alone, so a Task whose number equals another Task's plan row cannot receive it
- A Task that already has a build round is left as it is
- In repair a PLAN at approved or any later status qualifies
- In repair a TaskSetError for one Story is reported for that Story and the others continue

### 2.10 `liftStoreFile`

```typescript
liftStoreFile(fileName: string, parsed: unknown): ArtifactRecord | RecordLoadFailure
```

**Parameters:**
- `fileName: string` — The store file name
- `parsed: unknown` — The parsed file

**Returns:** `ArtifactRecord | RecordLoadFailure` — A record for every kind of the common model, including DIAG; TESTS stays deliberately skipped. A head with no lifecycle has approval state 'unmigrated'.

**Postconditions:**
- No legacy approval field is read

### 2.11 `handleDeliveryEvidence`

```typescript
handleDeliveryEvidence(params: DeliveryEvidenceRequest | undefined, repoEnv: string | undefined, deps?: DeliveryDeps): DeliveryEvidenceResponse
```

**Parameters:**
- `params: DeliveryEvidenceRequest | undefined` — The artifact id to read
- `repoEnv: string | undefined` — Fallback repository path
- `deps: DeliveryDeps` _(optional)_ — Store and markdown ports

**Returns:** `DeliveryEvidenceResponse` — One record's meta, body and markdown, or { error }

**Errors:**
- `{ error: 'invalid artifact id' }` when The id neither matches the one-suffix form nor parses with ArtifactIds.parse as a kind the loader admits, or it fails containment

**Postconditions:**
- A valid TASK or DIAG id, which has two suffixes, can be read
- An uppercase legacy id is still accepted until repair has renamed it
- The containment check is unchanged

### 2.12 `buildWorkItemGraph`

```typescript
buildWorkItemGraph(recordSet: ArtifactRecordSet): WorkItemGraph
```

**Parameters:**
- `recordSet: ArtifactRecordSet` — The loaded records

**Returns:** `WorkItemGraph` — Each epic, story and task node carries its unit head, or null. A story's active tasks come from its TASKS head when that was made from the current PLAN revision, else from its PLAN. A BUILD result that matches no Task and no planned row keeps its own task item.

**Postconditions:**
- Unit records are not counted as evidence; a DIAG head is evidence of the Story its id names
- Active Tasks are those the TASKS head lists and that are not withdrawn or superseded
- After an interrupted re-plan the active Tasks are the PLAN's rows, matched to Task heads by planTaskId, so a new row with no head shows unit null
- A BUILD result for a withdrawn or superseded Task is not shown as a task item; any other unmatched BUILD result still counts in validation and conflicts, with unit null and planRowId null, and is not an active Task, so it raises no needs-migration
- A task node carries planRowId and taskOrder from its TASK head; while an interrupted re-plan is being shown, taskOrder comes from the current PLAN row instead
- For a task node with a head, sourceIds holds the plan row id and not the Task's own number, so no alias can collide with another Task's plan row
- No two distinct items in a Story share a board id, as the board-id rule on WorkItemNode defines

### 2.13 `storyStage`

```typescript
storyStage(route: DeliveryRoute, evidence: readonly ArtifactRecord[], issue: ArtifactRecord | undefined, unit: UnitHead | null): { stage: DeliveryStage; text: string; artifactIds: string[] }
```

**Parameters:**
- `route: DeliveryRoute` — The story's route
- `evidence: readonly ArtifactRecord[]` — The story's records
- `issue: ArtifactRecord | undefined` — The issue behind a fix story
- `unit: UnitHead | null` — The STORY head

**Returns:** `{ stage: DeliveryStage; text: string; artifactIds: string[] }` — 'complete' only when the STORY head is completed. An approved BUILD on a Story not completed stays 'build-recorded', and its text states the STORY head's status, that the head is not migrated, or that there is no STORY head.

**Postconditions:**
- An approved BUILD alone no longer yields 'complete'

## 3. Data model changes

### 3.1 `CompletionEvidence` — field-add

Adds storyBuildApproved(epicHash, storyId), true when the BUILD status is approved or later; storyApprovalOverride(epicHash, storyId), the explicit override reason on the BUILD's approval, or undefined; declaredStories(epicHash), the Story ids the DEF lists, empty when there is no DEF; and storyTasks(epicHash, storyId), answering { kind: 'listed'; taskIds: string[] } | { kind: 'not-created' } | { kind: 'none-required' }. The TASKS head is written last and marks a finished set for one plan revision. With a PLAN at approved or later: listed with the TASKS head's ids when it has at least one and its planRevision equals the PLAN's revision (read as at least 1, as readPlan does); otherwise not-created, even if some TASK heads exist, because they can be a part-way set or an interrupted re-plan. With no such PLAN: listed with a TASKS head's ids when it has at least one, else with the child TASK heads when there are any, else none-required, as on a small bugfix or trivial route. A clean review is not an override. The override extends k8 by the decision recorded in DECISIONS.md: on the BUILD approval it also waives failed or unfinished Tasks.

**Call sites:**
- `src/workflow/artifact-core/lifecycle.ts:336`
- `src/workflow/artifact-core/completion-evidence.ts:48`
- `src/workflow/tasks/types.ts:36`
- `src/workflow/tasks/task-set.ts:154`
- `src/workflow/tasks/task-set.ts:241`

### 3.2 `Lifecycle operation record-override` — new

A new lifecycle operation, valid on a BUILD whose status is approved, in-signoff or signed-off. It sets lifecycle.approval.override to the reason and leaves the status, the revision and the approval time unchanged. It appends one log entry with the actor, the time and outcome { result: 'override', summary: reason }, so the audit trail keeps each override even if a later one replaces it on the head. The reason is then found by the outer code-review gate, storedOverride and storyApprovalOverride after the request is gone, including in deferred signoff completion, a retried re-approval and repair. The relationship is one BUILD approval to at most one current override and any number of logged ones.

**Call sites:**
- `src/workflow/gates.ts:690`
- `src/workflow/gates.ts:979`
- `src/workflow/artifact-core/lifecycle.ts:41`
- `src/workflow/artifact-core/history.ts:20`
- `src/workflow/artifact-core/completion-evidence.ts:41`

### 3.3 `New and rewritten workflow heads` — invariant-change

Both sites that write a finished workflow artifact call one helper in src/workflow/storage.ts that settles meta.lifecycle before the write. No prior head, or a prior head with no lifecycle: a draft lifecycle. A prior head with a lifecycle and unchanged content: that lifecycle. A prior head with a lifecycle and changed content: a draft for the new revision, keeping its Signoff entries, because approval and review belong to the revision they were made at. Only these two sites change, so the writeArtifact behaviour that storage-signoff-history.test.ts pins stays as it is. Today such a head has no lifecycle until a lifecycle operation adds one, and a rewrite drops one that has no Signoff entries. A guard test fails if a production 'content' write of a delivery kind can create a head without a lifecycle.

**Call sites:**
- `src/daemon/steps/workflow-step/phases/synthesize.ts:93`
- `src/daemon/workflow-rpc.ts:349`
- `src/workflow/storage.ts:178`
- `src/workflow/storage.ts:224`

### 3.4 `FollowOnOutcome` — field-modify

Adds kind 'story-completion' and optional completed: string[]. Additive.

**Call sites:**
- `src/workflow/gates.ts:854`
- `src/workflow/gates.ts:881`
- `src/daemon/workflow-approve.ts:58`
- `src/cli/services/workflow.ts:152`

### 3.5 `RepairReport` — new

{ mode: 'repair-preview' | 'repair'; plan: ConversionPlan; result?: { written: RepairWrite[]; remaining: ConversionChange[]; stoppedAt?: { step: RepairStep; reason: string }; held: UnitOutcome[]; failed: UnitOutcome[] } }, where RepairWrite is { step, artifactId, action }, UnitOutcome is { artifactId, reason, completedMembers: string[] } and RepairStep is every conversion step except the marker, plus 'settle'. Each step takes an optional RepairRecorder, called at the store and history commit points themselves, including nested Task creation and completing a pending operation, and not after a public operation returns, because a log entry can commit before a head replacement fails. It covers sidecar feedback lines, migration and batch log entries, heads and Task rounds, so written is exactly what was committed even when a step throws. The conversion's own apply passes no recorder and is unchanged. remaining is the plan computed again from the files after the run: it is what a re-run would still consider, and may repeat feedback whose lines are already written until that head is migrated, which adds no line twice. A step that throws stops the run, stoppedAt names it, and later steps do not run because each depends on the one before; nothing settles after a stop. Two steps continue per Story or unit: creating Tasks reports a Story whose Task set cannot be made in failed and goes on, and settling reports held and failed units. Held units were left by the completion rule or a signoff hold, and failed ones hit a conflict or write error. completedMembers lists members already completed when a settlement failed. ConversionRule gains 'settle-unit' and 'backfill-round'; repair's planner reads each Task's log so a missing round on a Task with an existing TASKS head is listed in the preview.

**Call sites:**
- `src/workflow/convert/types.ts`
- `src/daemon/repo-convert.ts:54`
- `src/workflow/convert/apply.ts:126`
- `src/workflow/convert/feedback-rule.ts:114`
- `src/workflow/convert/tasks.ts:64`

### 3.6 `Repair order, discovery and eligibility` — new

Repair runs the conversion's own steps in their fixed order, each of which can be repeated: applyRenames, applyStamps, applyAmendments, applyFeedback, migrateHeads, applyUnits, applyTasks, applyStoryHistory, then settle. Renames come first because History refuses an uppercase Story id, and amendments before migration because migrateHeads skips a record with no meta. It does not use the progress file or write the schema marker. A plan with a problem writes nothing, as conversion does. This store has 152 uppercase heads, no collisions and no flat amendments. A Story is known from a DEF declaration or from any LLD, PLAN, BUILD or CR head naming its hash and story id, with S001 read as s1 in the preview, before the rename has run; each known hash gets an EPIC head. An ISSUE with no such record creates nothing. A PLAN qualifies for Tasks at approved or any later status, using createFromPlan's acceptLaterStatus. A part-way Task set is finished by createFromPlan. A TASKS head listing a Task with no head, or made from a different plan revision, is reported as failed and left unchanged, and the Story is not settled; this store has neither. Settling: COMPLETION_RULE_FROM is a fixed UTC timestamp with a Z suffix, written into the code when this change is committed and never recomputed, so the attribution of old approvals cannot move between releases. A Story whose BUILD approval time is strictly before it is settled with storyCodeReview answering overridden and storyApprovalOverride answering 'settled from an approved BUILD', attributed to insrc:migration, because that approval passed the gate of its time. An approval at or after it, including one made before the new daemon is running, is settled only by the live rule, using any explicit override it carries, so repair cannot complete a Story the live rule holds and such a Story is reported in result.held.

**Call sites:**
- `src/workflow/convert/apply.ts:126`
- `src/workflow/convert/rename.ts:135`
- `src/workflow/convert/amendments.ts`
- `src/workflow/convert/feedback-rule.ts:88`
- `src/workflow/convert/units.ts`
- `src/workflow/convert/tasks.ts:92`
- `src/workflow/artifact-core/history.ts:29`
- `src/workflow/tasks/task-set.ts:110`

### 3.7 `DeliveryArtifactKind` — field-modify

Adds EPIC, STORY, TASK, TASKS and DIAG. Relationship: one EPIC head has many STORY heads (by epicHash); one STORY has zero or one TASKS head, zero or more TASK heads and zero or more DIAG heads (by epicHash and storyId); a TASK references one plan row by planTaskId, and re-planning can change that row while the Task keeps its number. Each work item references at most one unit head of its own level, in the direction item to head. TESTS stays skipped by name.

**Call sites:**
- `src/workflow/delivery/types.ts`
- `src/workflow/delivery/load.ts:35`
- `src/workflow/delivery/handlers.ts:42`
- `src/workflow/delivery/graph.ts:372`
- `src/workflow/tasks/lookup.ts`
- `src/workflow/artifact-ids.ts:49`

### 3.8 `WorkItemNode, DeliveryItem and TaskValidation` — field-add

WorkItemNode and DeliveryItem add unit: { artifactId: string; status: UnitStatus } | null, where UnitStatus is Status | 'unmigrated'. unit is set for epics, stories and tasks, is null only when there is no head, and has status 'unmigrated' for a head with no lifecycle. They also add planRowId: string | null and taskOrder: number | null for tasks. TaskValidation adds taskOrder; a story's tasks array is sorted by taskOrder, with null last, then by task item id. A task's validation result stays the one in the BUILD record, and the Story roll-up uses the Task's latest round: the two can differ, in which case the row can show passed while its Story is held, and the reason is in the approval's story-completion note. board-details.ts joins PLAN rows and dependencies on planRowId, falling back to sourceIds only when it is null, and the client renders the tasks array in the order it receives. The plugin shows an Epic as complete only when its unit status is completed, keeps the child count as progress, and carries a Task's unit status through TaskRowView to the webview beside its validation result.

**Call sites:**
- `src/workflow/delivery/types.ts`
- `src/workflow/delivery/snapshot.ts`
- `src/workflow/delivery/gate.ts`
- `vscode-plugin/src/delivery/board-details.ts`
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`

### 3.9 `Task board id` — invariant-change

A task item with a TASK head takes the board id of its Task number, :T<nnn>, and every such id in the Story is reserved first. A plan row with no TASK head and a BUILD result that matches no Task are one item per row id, so a row and a BUILD result for the same row id stay together, as today. That item takes :T<nnn> for its own row number unless a real Task in the Story already holds that id, in which case it takes :R<nnn> from a new row-id form of workItemBoardId in src/workflow/path-scheme.ts. So Task t4 representing row t9 is :T004, and a new row t4 with no head is :R004. Items that do not collide keep the ids they have today. A Task whose number differs from its plan row, 20 in this store, moves to its Task number. Board ids are computed on each read and not stored. The plugin's taskShortIdOf takes the last segment, so an R004 shows as R004 with no client change. gate.ts still joins BUILD results by the ordinal of sourceIds, which holds the plan row or result id and not the board id.

**Call sites:**
- `src/workflow/path-scheme.ts:116`
- `src/workflow/delivery/graph.ts:372`
- `src/workflow/delivery/gate.ts:303`
- `vscode-plugin/src/delivery/board-details.ts:41`

### 3.10 `ApprovalState, NoticeCode and AttentionReason` — field-modify

ApprovalState adds 'unmigrated' for a head with no lifecycle. NoticeCode and AttentionReason add 'needs-migration', raised for an unmigrated record or a story, epic or active task with no head or an unmigrated head, so such a record never counts as pending-decision. The plugin gains labels for these and for the unmigrated unit status.

**Call sites:**
- `src/workflow/delivery/load.ts:35`
- `src/workflow/delivery/gate.ts`
- `vscode-plugin/src/delivery/labels.ts`
- `vscode-plugin/src/delivery/delivery-contract.ts`

## 4. Error paths

**Error cases**

- **The completion walk fails after the BUILD approval is committed, for example a child head cannot be read or a write conflicts.** (recoverable)
  - Detection: completeThroughService catches the rejection from completeIfRolledUp or from ensuring the heads.
  - Response: The approval stands. The answer carries a story-completion outcome with ok false and the failure as its note; handleWorkflowApprove merges it with the seam's outcomes so it reaches the caller.
  - User impact: The build shows as approved and the caller is told the Story did not complete and why. A re-approval, with or without restating a stored override, or a repair run finishes it.
- **A listed Task's latest build round failed, a listed Task has no round or no head, the Task set was never finished, or a re-plan was interrupted so the TASKS head is from an older plan revision, and the BUILD approval carries no explicit override.** (recoverable)
  - Detection: rollUp for the STORY reads storyTasks, which compares the TASKS head's planRevision with the PLAN's revision, then statusOf and taskBuildPassed for each listed Task, then storyApprovalOverride.
  - Response: rollUp returns undefined, so the Story and its Tasks are left unchanged. The outcome has ok true and a note naming the Tasks that hold it, or saying the Task set is not finished for the current plan.
  - User impact: The approval is recorded and the Story stays open on the board. Finishing the re-plan's reconcile, or approving the BUILD again with an explicit override, completes the Story.
- **An override is given for a BUILD whose status does not allow one to be recorded, for example it is completed.** (terminal)
  - Detection: nextLifecycle refuses 'record-override' from that status with IllegalTransitionError.
  - Response: The batch approval lists the path in skipped with the reason, and nothing changes.
  - User impact: The caller is told the override was not recorded.
- **A repair step throws part-way, for example a write fails during head migration.** (recoverable)
  - Detection: The repair runner catches the throw around each step, and the recorder has already collected each committed write at its commit point.
  - Response: The run stops, later steps do not run and nothing settles. The answer is a RepairReport with written, remaining and stoppedAt, not { error }.
  - User impact: The report shows the step, why it stopped, exactly what was written and what is left. Running repair again continues from the files and adds no line twice.
- **The repair plan lists a problem, such as a renamed file colliding with a different existing one.** (recoverable)
  - Detection: planConversion lists it in plan.problems before any write.
  - Response: It answers { error } naming the problems and writes nothing, as conversion does.
  - User impact: The store is untouched and the conflicting files are named.
- **A repair settlement fails after some of the unit's members were already completed, because members are written one at a time before the unit head.** (recoverable)
  - Detection: The settle step catches the write failure for that unit and re-reads each member's status.
  - Response: The unit is listed in result.failed with reason and completedMembers. Other units continue. A later repair run completes the rest, and completeMember skips the members already terminal.
  - User impact: The report names the unit and the members already completed; running repair again finishes it.
- **A TASKS head lists a Task id with no TASK head, or was made from a different plan revision, during repair.** (terminal)
  - Detection: The repair's Task step compares the TASKS listing with the store's TASK heads and catches TaskSetError from createFromPlan for that Story.
  - Response: The Story is listed in result.failed, is left unchanged and is not settled. Other Stories continue.
  - User impact: The report names the Story and the reason for manual attention. This store has neither today.
- **A store file is unreadable or is not a recognised artifact when the board loads.** (recoverable)
  - Detection: liftStoreFile returns a RecordLoadFailure for the file.
  - Response: The failure is reported as a load notice, as today, and the rest of the board is built.
  - User impact: The board still opens and shows a notice for that file.
- **An evidence read names an id that is malformed or escapes the store.** (terminal)
  - Detection: handleDeliveryEvidence checks the id's form and then its containment.
  - Response: It answers { error: 'invalid artifact id' } and reads nothing.
  - User impact: The evidence row shows the error.
- **repo.convert receives an unknown mode, or a repository path that is not a directory.** (recoverable)
  - Detection: handleRepoConvert validates the mode against the accepted set and checks the path.
  - Response: It answers { error } and writes nothing.
  - User impact: The caller sees the reason and nothing changes.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Story with an approved BUILD and clean review, no TASKS head, no child TASK heads and no PLAN at approved or later, such as a small bugfix or trivial route. | storyTasks answers none-required and it completes. |
| A Story with an approved PLAN and no TASKS head, with no TASK heads or with only some of them from a part-way creation. | storyTasks answers not-created, and the Story is held unless the approval carries an override, even if the existing Tasks passed. |
| A Story whose PLAN was re-approved at a newer revision and whose reconcile failed or stopped part-way, with every Task on the older TASKS head passing. | storyTasks answers not-created, and the Story is held unless the approval carries an override; no newly created unlisted Task is frozen. |
| A qualifying PLAN with stored revision 0 and a TASKS head with planRevision 1. | They match, because a PLAN revision is read as at least 1. |
| A qualifying PLAN and a TASKS head at the current revision with an empty listing. | storyTasks answers not-created. |
| A Story with child TASK heads, no TASKS head and no PLAN at approved or later. | Those Tasks are the listed set. |
| A Story held by a failed Task, then the BUILD is approved again with an explicit override. | The override is saved on the approval and logged, the status, revision and approval time do not change, and the Story completes. |
| A BUILD approved over a blocking code review with an override, its completion interrupted, then approved again with no override in the request. | The outer gate uses the stored override, the approval stands and completion is retried. |
| A draft BUILD at a new revision whose earlier revision carried an override. | The outer gate does not use the old reason, because a draft BUILD is gated only on the request. |
| A BUILD approved again with the override it already carries. | Nothing new is recorded; completion is attempted again. |
| A held Story's override was recorded, and the Story is in signoff so it completes later. | The deferred completion reads the stored override and completes it. |
| An Epic's signoff hold after its last Story completes. | The Story completes, the Epic stays open until its signoff finishes, and the outcome says so. |
| A Task's earlier round passed and its latest round failed. | The latest round decides, so the Story is held back without an override. |
| A listed Task is withdrawn or superseded. | It is not counted, and the cascade leaves it alone. |
| An Epic whose DEF declares a Story that has no head. | completeThroughService creates the head first, and the Epic stays open until that Story is completed, withdrawn or superseded. |
| An Epic with no DEF, such as a standalone ISSUE route. | declaredStories is empty and the Epic rolls up from its counted Stories only. |
| A BUILD approved before COMPLETION_RULE_FROM with Tasks whose latest round failed. | Repair settles it with the override 'settled from an approved BUILD', attributed to insrc:migration. |
| A BUILD approved exactly at COMPLETION_RULE_FROM, or later, with a failed latest round and no explicit override. | Repair does not complete it and lists it in result.held. |
| A BUILD approved after COMPLETION_RULE_FROM with a failed latest round and a stored explicit override. | Repair completes it by the live rule, using that override. |
| Task t1 represents plan row t2 and Task t2 represents plan row t1. | A BUILD result for row t1 goes to Task t2 in repair, and the board joins each Task to its own row. |
| A Task that already has a build round when repair back-fills. | Its rounds are left as they are. |
| A Task on an existing TASKS head with no round and a passing BUILD result. | The preview lists a backfill-round change and repair writes it. |
| A signed-off or completed PLAN with no TASKS head during repair. | createFromPlan accepts it with acceptLaterStatus and the Tasks are created. |
| A head with an uppercase Story id and body.feedback. | Repair renames it first, then saves the feedback under the new id, then migrates it. |
| An approved flat amendment. | Repair converts it to a head before migration, and it stays approved. |
| Repair is run twice, or again after stopping part-way. | The second run after a complete one lists no changes, and a run after a stop writes only what remained, with no feedback line added twice. |
| A repository with no artifact records. | Repair reports an empty plan and writes nothing. |
| An ISSUE with no DEF, LLD, PLAN, BUILD or CR naming its hash. | No EPIC or STORY head is created for it. |
| A head with no lifecycle is loaded by the board, including an EPIC, STORY or TASK head. | Its approval state is 'unmigrated', a unit head has unit.status 'unmigrated', it raises needs-migration and it does not count as pending-decision. |
| A DIAG or TASK id is read as evidence. | Its record is returned; a DIAG head loads with no notice and is evidence of the Story its id names. |
| A PLAN with row t1 and a BUILD with a failed result for t3, with no TASKS head. | t3 keeps its own task item, counts as failed and can raise a validation conflict, and raises no needs-migration. |
| A BUILD with task results and no PLAN. | Each result keeps its task item. |
| A BUILD result for a Task that was withdrawn. | It is not shown as a task item. |
| The board loads a Story whose TASKS head is from an older plan revision. | The active Tasks are the PLAN's rows, matched to Task heads by planTaskId, and each row's order comes from the PLAN even when its Task head still carries an older order. |
| Task t4 represents plan row t9, and an interrupted re-plan adds row t4 with no Task head. | The Task is :T004, the new row is :R004, and neither absorbs the other's validation or evidence. |
| Task t4 represents plan row t9, and a BUILD result for t4 matches no Task. | The Task is :T004 and the result is :R004, and the result's validation stays on :R004. |
| A plan row t4 with no Task head and a BUILD result for t4 in the same Story. | They are one item, as today. |
| A plan row with no Task head whose number no real Task holds. | It keeps :T<nnn>, as today. |
| A finished workflow artifact is written again over a head with a lifecycle and no Signoff entries, with changed content. | The head gets a draft lifecycle for the new revision, so it never has none. |
| The same, with unchanged content. | The lifecycle is kept. |

**Invariants to preserve**

- An approval that was committed is never undone by a later completion failure. [[c1]]
- A Task is completed only through its Story's cascade, so a held Story leaves its Tasks unchanged and an earlier status cannot hide a later failing round. A write failure part-way through a cascade can leave some members completed before the Story head; the next run finishes the unit. [[c2]]
- Approved records stay approved through repair, and repair preview writes nothing. [[c3]]
- Local feedback on a record is carried through head migration, and no line is added twice on a re-run. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx; vscode-plugin uses its own node:test run`

**Test levels**

- **unit** — The completion rule, evidence, cascade and board derivation, on in-memory fixtures. Existing assertions that expect Tasks to complete before their Story are updated to the Story-owned cascade.
  - Subjects: `rollUp for STORY: approved BUILD with clean review and all listed Tasks' latest rounds passed completes`, `rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it`, `rollUp for STORY: a listed Task with no head holds back`, `rollUp for STORY: an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed`, `rollUp for STORY: a TASKS head from an older plan revision holds back even when every listed Task passed, and an explicit override completes it`, `storyTasks: a qualifying PLAN at stored revision 0 matches a TASKS head at planRevision 1; an empty current listing answers not-created; with no qualifying PLAN a TASKS listing, then child TASK heads, then none-required apply in that order`, `rollUp for STORY: a Story with no PLAN and no Tasks completes, and child TASK heads with no PLAN are the listed set`, `rollUp for STORY: a listed withdrawn or superseded Task is not counted; a clean review is not an override`, `rollUp for EPIC: a declared Story without a terminal head holds it; an Epic with no DEF rolls up from its counted Stories`, `unitMembers includes TASK heads, and a held Story leaves every Task unchanged`, `reopening a Story reopens only the Tasks it froze`, `record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD`, `liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice, gives a head with no lifecycle the state unmigrated, and TESTS stays skipped`, `handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id, still accepts a one-suffix and an uppercase legacy id, and refuses a malformed id and one that escapes the store`, `buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds`, `buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN's rows matched by planTaskId, in the PLAN's order even when a matching Task head carries an older order`, `board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence`, `board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004`, `board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id`, `taskShortIdOf shows R004 for a row id`, `buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration`, `buildWorkItemGraph: unit is null for a missing head and has status unmigrated for a head with no lifecycle`, `a missing or unmigrated unit raises needs-migration and not pending-decision`, `gate sorts tasks by taskOrder, null last, then id`, `storyStage is complete only with a completed STORY head, and an approved BUILD otherwise stays build-recorded with text giving the head's status, that it is not migrated, or that there is no head`, `board-details joins on planRowId, falling back to sourceIds only when it is null`, `board-views shows an Epic complete only from its unit status`, `TaskRowView carries a Task's unit status, including unmigrated`, `the storage helper: a first write gets a draft lifecycle; a rewrite with unchanged content keeps the lifecycle; a rewrite with changed content gets a draft and keeps Signoff entries, with no Signoff entries and with them`
  - Fixtures: `src/workflow/__tests__/lifecycle-fixtures.ts`, `in-memory delivery records as in src/workflow/delivery/__tests__`
- **integration** — Real store writes through approval, first write and repair.
  - Subjects: `handleWorkflowApprove on a BUILD: the outcome merges the approval's own followOn with the seam's, and the Story, its Tasks and its Epic complete`, `a walk failure leaves the approval standing and reports ok false`, `a live approval with a listed Task missing its head is held and named in the note`, `a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen`, `initial approval held, then re-approval with an override records it and completes the Story`, `a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes`, `a draft BUILD at a new revision is not passed by an earlier revision's override`, `a held Story in signoff completes later from the stored override`, `an Epic with a signoff hold stays open after its Story completes`, `the CLI adapter exposes the story-completion outcome`, `both first-write sites give a new head a draft lifecycle`, `guard: a production content write of a delivery kind cannot create a head without a lifecycle`, `repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement`, `repair on a store with an uppercase head holding body.feedback and an approved flat amendment: the head is renamed, the feedback survives under the new id, and the amendment stays approved`, `repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set`, `repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story`, `repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override`, `repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held`, `repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override`, `a failure injected in the head migration step answers a RepairReport whose written lists the committed feedback lines and migration entries, with stoppedAt and remaining, and settles nothing; the next run finishes with no feedback line added twice`, `a failure injected while Task rounds are back-filled lists the rounds already written`, `failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run`, `a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit`, `a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue`, `a plan with a rename collision answers an error and writes nothing`, `a second repair lists no changes`, `an unknown mode answers an error and writes nothing`, `rollback: after a staged write fails before head replacement, restoring the copied artifacts, journal and docs with the daemon stopped leaves no pending operation to replay`, `verifyConversion keeps passing on a converted fixture with the changed loader, graph and gates`
  - Fixtures: `a temporary repository with a seeded .insrc/artifacts store`
- **contract** — The daemon and plugin agree on the new board fields and labels.
  - Subjects: `src/daemon/__tests__/delivery-handler-contract.test.ts carries unit (including status unmigrated), planRowId, taskOrder, unmigrated and needs-migration through the snapshot`, `vscode-plugin/src/delivery/__tests__/delivery-client.test.ts reads the same shape and opens a sequenced DIAG evidence row`
- **smoke** — The Task status renders in the real board webview.
  - Subjects: `Render the board webview during the build and confirm a Task row shows its unit status beside its validation result, including an unmigrated one`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Requirement: the board reads every record type of the common model as its source`, `liftStoreFile admits EPIC, STORY, TASK, TASKS and a valid DIAG with no notice`, `buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder`, `board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence`, `handleDeliveryEvidence reads a valid TASK id and a sequenced DIAG id`, `the contract tests carry the new fields` |
| `ac2` | `Requirement: the status of epics, stories and tasks comes from their lifecycles, and approving a build completes its Story when the rule holds`, `handleWorkflowApprove on a BUILD completes the Story, its Tasks and its Epic`, `storyStage is complete only with a completed STORY head`, `board-views shows an Epic complete only from its unit status` |
| `ac3` | `Requirement: a failed or unfinished Task holds back its Story unless the approval carries an explicit override, including one recorded later`, `rollUp for STORY: an earlier pass followed by a failing latest round holds back, and an explicit override completes it`, `rollUp for STORY: an approved PLAN with no TASKS head holds back, with no TASK heads and with a part-way set whose Tasks passed`, `rollUp for STORY: a TASKS head from an older plan revision holds back even when every listed Task passed`, `a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen`, `a live approval with a listed Task missing its head is held and named in the note`, `initial approval held, then re-approval with an override records it and completes the Story`, `a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request`, `a held Story leaves every Task unchanged` |
| `ac4` | `Requirement: the path that writes records without a lifecycle is closed`, `both first-write sites give a new head a draft lifecycle`, `the storage helper: a rewrite never leaves a head with no lifecycle`, `guard: a production content write of a delivery kind cannot create a head without a lifecycle` |
| `ac5` | `Requirement: records not yet in the common model are migrated on any repository, approved records stay approved and missing units are created`, `repair on an already converted repository creates missing heads`, `repair on a store with an uppercase head holding body.feedback and an approved flat amendment`, `repair with crossed Task numbers and plan rows`, `repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override`, `repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed`, `verifyConversion keeps passing on a converted fixture` |
| `ac6` | `Requirement: the migration can be previewed and re-run safely and reports what it did at every step`, `repair-preview writes nothing, and every write repair makes belongs to a change the preview listed`, `a second repair lists no changes`, `a failure injected in the head migration step answers a RepairReport whose written lists the committed writes, and the next run finishes`, `a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit`, `rollback: restoring the copied artifacts, journal and docs leaves no pending operation to replay` |

## 6. Migration

**State before:** No unit ever reaches completed: the walk in src/workflow/gates.ts:959 starts at the STORY, rollUp (src/workflow/artifact-core/lifecycle.ts:336) needs every Task completed, and nothing completes a Task. The store has EPIC 53 draft, STORY 250 draft, TASK 1,972 approved and 42 draft, and 252 approved builds have no STORY head. A second approval of an approved BUILD records nothing (src/workflow/gates.ts:690), and the gate before it (src/workflow/gates.ts:979) reads only the request's override. Two sources leave heads with no lifecycle. First, src/daemon/steps/workflow-step/phases/synthesize.ts:93 and src/daemon/workflow-rpc.ts:349 still write a new head without one, and src/workflow/storage.ts:178 only reconciles a lifecycle the next head carries; 4 records created on 2026-11-09 and awaiting approval have none (3 ISSUE, 1 LLD). Second, the installed daemon ran commit 5c5bc0cf1 from main, which has no lifecycle code, until 2026-11-07. In all, 273 records have no lifecycle, and 152 heads have an uppercase Story id. The board (src/workflow/delivery/load.ts:35) admits neither EPIC, STORY, TASK, TASKS nor DIAG, and storyStage calls any approved BUILD complete. planConversion (src/workflow/convert/plan.ts:121) does nothing at schema version 2, so a converted repository cannot be repaired.

**State after:** Approving a BUILD completes the Story, its Tasks and, when every declared Story is done, its Epic, or reports why not. A Task whose latest round failed, or that is unfinished, holds its Story back unless the approval carries an explicit override, which can be recorded after the first approval, is kept with an audit entry, and is honoured by every gate on a retry. A Task set counts only when it was made from the current plan revision. Every workflow head has a lifecycle from its first write and through any rewrite. Repair brings existing records into the common model and settles units at any schema version, is previewable and re-runnable, and reports the writes each step actually made. The board reads the status of Epics, Stories and Tasks from their heads, keeps BUILD results that match no Task, gives every item in a Story its own id, labels anything not yet migrated, and no longer calls an approved BUILD complete on its own.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

1. Ship the code: the completion rule, the record-override operation, the stored override at the outer gate, the first-write lifecycle, the follow-on merge, the board's new kinds, fields and task ids, and the repair modes. Write COMPLETION_RULE_FROM as a fixed UTC timestamp in that commit. — ↩ rollbackable
2. Update and restart the daemon, and release the plugin with the new fields and labels. — ↩ rollbackable
3. Run repair-preview on the repository and read the plan, including the renames, round back-fills and the Stories it would settle. — ↩ rollbackable
4. Make sure no workflow is writing to the repository, then copy .insrc/artifacts, .insrc/journal and the docs folder aside. Repair renames files, rewrites references and stages journal operations, so all three are the way back. — ↩ rollbackable
5. Run repair, with the steps in order: rename ids and files, stamp, convert flat amendments, save body.feedback, migrate heads, create missing EPIC and STORY heads, create missing TASKS and TASK heads, move Story history, settle units. — ✕ non-rollbackable
6. Read result.written, remaining, stoppedAt, held and failed. Re-run repair after a stop or a failed unit that can finish, and act by hand on those it cannot. — ✕ non-rollbackable
7. To roll back steps 5 and 6: stop the daemon, replace .insrc/artifacts, .insrc/journal and docs with the copies from step 4, so that no operation staged by repair remains to be replayed, then start the daemon. — ↩ rollbackable
8. Open the board and confirm that no record still raises needs-migration, then commit the changed store. — ↩ rollbackable

**Backward compat:** New fields on the board's types, FollowOnOutcome, the new lifecycle operation and the repair modes are additive. The existing preview and apply modes of repo.convert and the schema marker are unchanged, and the conversion's own apply passes no recorder. handleWorkflowApprove now returns the approval's own outcomes and the seam's together instead of only the seam's, and its error reply is unchanged. A second approval of an approved BUILD with a new override now records it, where before it did nothing, and a re-approval with no override now passes the outer gate on the stored one. A consumer of the operation list sees one more operation. applyTasks no longer matches a BUILD result on a Task's number or id; every Task in this store has a planTaskId. createFromPlan keeps its approved-only rule for live callers and reconcile. handleDeliveryEvidence still accepts every id it accepted. Task board ids are computed on each read and not stored: a Task whose number differs from its plan row moves to its Task number, and only an item that would collide with a real Task takes :R<nnn>. An older plugin against the new daemon ignores the new fields but will see Stories it used to call complete shown as build-recorded until repair settles them. The STORY rule deliberately diverges from S007:FR001: a Task completes with its Story rather than before it, so a held Story cannot be hidden by an earlier Task status. Heads written by a daemon on main still have no lifecycle; the board labels them needs-migration and repair handles them. writeArtifact itself is unchanged.

## 7. Alternatives considered

### 7.1 a1: Tasks complete with their Story at BUILD approval — **CHOSEN**

At BUILD approval a Story completes, with all its open Tasks, when every Task it lists has a latest round that passed or the approval carries an explicit override.

The Story roll-up reads the Tasks the current TASKS head lists and each one's latest build round rather than its status. When the rule holds, completing the Story freezes its open Tasks through the cascade; when it does not, the Story and its Tasks stay as they are, and the outcome names the Tasks. A later explicit override is saved on the approved BUILD by its own audited operation and honoured at every gate. New records carry a draft lifecycle from their first write. A repair mode runs the conversion's ordered steps at any schema version, records what each step wrote, then settles units, applying the old approval rule only to approvals older than the new one. The board publishes unit status, a plan row key and an order.

### 7.2 a2: Complete passing Tasks first, then roll up

BUILD approval completes each passing Task, then rolls up the Story by Task status.

Walk each counted Task so passing ones complete, then roll up the Story by Task status, reopening a completed Task when a later round fails. Repair and the board change are the same as a1.

**Rejected because:** Partial on status-is-reliable: a Task completed before its Story can be hidden by a later failing round, and it would need its own reopen path.

### 7.3 a3: Any approved BUILD completes the Story

A Story completes on an approved BUILD with a clean or overridden review, whatever its Tasks show.

Drop the Task condition from the Story roll-up and cascade to all open Tasks. Repair and the board change are the same as a1.

**Rejected because:** Violates failed-task-holds-story: any approved BUILD would complete a Story with a failed Task.

## 8. References

- **[[c1]]** `code` `src/workflow/gates.ts:959`
- **[[c2]]** `code` `src/workflow/artifact-core/lifecycle.ts:336`
- **[[c3]]** `code` `src/workflow/convert/repair-amendments.ts:29`
- **[[c4]]** `code` `src/workflow/convert/feedback-rule.ts:114`
- **[[c5]]** `code` `src/workflow/convert/plan.ts:121`
- **[[c6]]** `code` `src/workflow/delivery/load.ts:35`
- **[[c7]]** `doc` `docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md`
- **[[c8]]** `prior-artifact` `docs/standalone/make-delivery-board-read-common-artifact-E20261109eedc4519/ISSUE.md`
- **[[c9]]** `doc` `docs/standalone/make-delivery-board-read-common-artifact-E20261109eedc4519/S001/DECISIONS.md`
- **[[c10]]** `doc` `/Users/subhagho/.insrc/daemon` — "git reflog: 756d5adf4 HEAD@{2026-11-07 17:54:07 +0530} checkout: moving from main to v2"
- **[[c11]]** `code` `src/workflow/gates.ts:690`
- **[[c12]]** `code` `src/workflow/convert/apply.ts:126`
- **[[c13]]** `code` `src/workflow/gates.ts:979`
- **[[c14]]** `code` `src/workflow/tasks/task-set.ts:241`
- **[[c15]]** `code` `src/workflow/path-scheme.ts:116`
