<!-- insrc:artifact LLD-9a7bbe63297457c2-S001 -->

# LLD: E202610069a7bbe63:S001

## Summary

**Epic:** `tracker-epics-bring-epic-flow-under`
**HLD base run:** `wf-1791286104396-tih334`
**HLD effective hash:** `9a7bbe632974...`

Epics join the tracker flow that the approved issues design (LLD-38436e90625a83a2-S001) defines. Approving a Define creates the epic item; approving the HLD, an amendment, a story design or a plan adds a comment, a story item or task items under it; approving a story's BUILD record closes that story and its tasks, and the epic is closed when every story is done. The same setting, check and tracker tool govern all of it. The three old push functions and the three tracker workflows in which a model ran gh itself are removed, and reading states back from GitHub becomes a sync request of the tracker tool.

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

### 2.1 `autoPushEpicOnHld`

```typescript
(removed) autoPushEpicOnHld(hldJsonPath: string): AutoPushResult
```

**Returns:** `removed` — REMOVED with autoPushStoryOnLld and autoPushTasksOnPlan, their private gate() and the AutoPushResult type. Their work becomes by-kind entries of the tracker flow. The helpers they share with the flow (relink, withResolvedTail, the review comment text) move with the flow.

**Preconditions:**
- Declared in src/workflow/tracker-auto.ts:102, :165 and :245. Their only production caller is the TUI approve (src/cli/services/workflow.ts), which the issues design already removes; the issues design leaves the three functions in place unused.

**Postconditions:**
- No code path creates an epic, story or task item except the tracker flow.
- src/workflow/__tests__/tracker-auto.test.ts and tracker-tasks.test.ts, which exercise the three functions, are rewritten against the flow's epic entries.

### 2.2 `syncTracker`

```typescript
syncTracker(repoPath: string, epicHash: string): Promise<SyncResult>
```

**Parameters:**
- `repoPath: string` — The registered repo.
- `epicHash: string` — The epic whose item states are read.

**Returns:** `Promise<SyncResult>` — CHANGED. Same result as today (synced with epicStatus and storyStatus, skipped, failed) but asynchronous, run through the tracker implementation's state read so it does not block the daemon, and behind the check: its gate moves from resolveGithubConfig plus ghAuthOk to the issues design's check. It only reads GitHub and writes epicStatus, storyStatus and lastSyncedAt on the Define, as today.

**Preconditions:**
- Declared in src/workflow/tracker/sync.ts:24. Called today in process by the TUI service (src/cli/services/workflow.ts:308) and shown by the sync command (src/cli/command.ts:245).

**Postconditions:**
- It is reached through the tracker tool's new sync request (a daemon request). The TUI's sync service function becomes an asynchronous sender of that request and makes no gh call; its service type (src/cli/services/index.ts:66) declares a Promise and command.ts awaits it.

### 2.3 `approveAmendment`

```typescript
approveAmendment(repoPath: string, amendmentId: string, approvedBy: string): AmendmentRecord
```

**Returns:** `AmendmentRecord` — UNCHANGED function (src/workflow/amendments/store.ts:101). What changes is its daemon request: 'workflow.amendment.approve', which the issues design adds and says never runs the tracker flow, now runs the flow for the approved amendment after the store call and returns its outcome in a tracker[] field beside the record. Rejecting an amendment still runs no flow.

**Preconditions:**
- The request names a repo, which the daemon checks is registered, as the issues design states.

**Postconditions:**
- THIS CHANGES ONE SENTENCE OF THE ISSUES DESIGN: 'None of the three runs the tracker flow' becomes 'reject and amendment reject run no flow; amendment approve runs it'.

### 2.4 `ghLinkSubIssue`

```typescript
link(parentRef: string, childRef: string): Promise<TrackerOutcome>
```

**Returns:** `Promise<TrackerOutcome>` — The existing helper (src/workflow/tracker/github.ts:177) becomes part of the tracker implementation's addOrUpdate rather than something a caller invokes: when the flow passes linkUnder, the implementation links the item as a sub-issue of that parent after creating or adopting it. Best-effort: a refusal is reported in the outcome as 'not linked: <reason>' and the item still counts as tracked.

**Preconditions:**
- ghLinkSubIssue needs the child's numeric id, which ghCreateIssueTyped returns on create (github.ts:141-175). For an adopted item the implementation reads the id with one extra call.

## 3. Data model changes

### 3.1 `What changes in the common part (the approved issues design)` — field-add

Five changes to LLD-38436e90625a83a2-S001, all additive except the last. They are applied to that design as an amendment when this one is approved, and the two are planned and built as one piece of work, the common part first. (1) THE IMPLEMENTATION'S INPUTS gain two optional fields, used by both flows: linkUnder (a parent ref: link this item as a sub-issue of it) and itemType (the tracker's own type name: for github the issue type, taken from epicIssueType, storyIssueType, taskIssueType in github.json, defaults Epic, Story, Task). The issues flow uses them too: a standalone plan's tasks are linked under their story, and a standalone story under its issue record's item when there is one. Both are best-effort: an item is still created when the type or the link is refused (ghCreateIssueTyped already retries untyped, github.ts:151-175), and the outcome says what was skipped. (2) ONE NEW ACTION, reopen(ref), beside addOrUpdate, comment and close: github.ts has no reopen helper today, so one is added. (3) THE REVIEW COMMENT. After an item is created or commented for an approved DEF, HLD, LLD or plan that carries a review, the flow adds one comment with the review report, marked `<!-- insrc:review -->` as today (tracker-auto.ts:359-365), for both flows; it is recorded in commentedOn so it is posted once per review. (4) ONE NEW REQUEST of insrc_tracker, sync, beside status, push, pending and backfill. (5) THE AMENDMENT APPROVE REQUEST runs the flow (see the approveAmendment entry). Also retired here for both flows: useMilestones in github.json is no longer read, no milestone is created or attached, and ghEnsureMilestone and ghAttachMilestone are deleted; milestoneRef stays in TrackerMeta as a field old records may carry and nothing writes.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`
- `src/workflow/tracker/refs.ts`
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `.insrc/artifacts/LLD-38436e90625a83a2-S001.json`

### 3.2 `The flow's entries for the epic kinds` — new

One entry per approved record, added to the flow's by-kind table. Every entry runs after the same check, inside the same 5 minute budget, and commits and pushes the approved documents first, exactly as the issues design states. An 'epic record' is one whose Define exists and is not standalone; a standalone record keeps the issues design's entries. DEFINE: addOrUpdate the epic item. Title: the epic's workflow id and the first sentence of the problem, as today (tracker-auto.ts:131-133). Body: renderEpicBody (conventions.ts:98) from the Define, with the story checklist built from the Define's story list and the refs it has (storyRefs), so the checklist needs no separate edit step. Labels: the epic label, epic:<slug> for grouping, and the unique label insrc:epic-<hash8>. itemType: epicIssueType. The ref is stored on the Define (meta.tracker.epicRef). Approving a Define again (after a reopen) is the same call and rewrites the body. HLD: no item of its own. If the Define has an epicRef, one comment on the epic item with renderTrackerHldSummary (conventions.ts:204), then the review comment; the epicRef is copied to the HLD's meta.tracker so its document shows the link, as today. If the Define has no epicRef (approved while the setting was off), the flow first runs the Define's entry to create the epic, then comments. EPIC STORY DESIGN (LLD): addOrUpdate the story item. Title: story workflow id and title (tracker-auto.ts:194-196). Body: renderStoryBody (conventions.ts:129). Labels: the story label, epic:<slug>, and the unique label insrc:story-<hash8>-<storyId>. linkUnder: the epic's ref. itemType: storyIssueType. The ref is stored on the LLD (storyRef) and in the Define's storyRefs[storyId]; then the epic item's body is rewritten from the Define so its checklist shows the story (this replaces updateEpicTaskList's read-edit-write, conventions.ts:154), then one comment on the story with renderTrackerLldSummary (conventions.ts:222), then the review comment. If the epic was closed (closedAt on the Define's tracker block), the flow reopens it and clears closedAt. If the Define has no epicRef the Define's entry runs first. EPIC PLAN: for each task in order, addOrUpdate a task item. Title and body as today (tracker-auto.ts:284-290, renderTaskBody conventions.ts:174). Labels: the task label, epic:<slug>, and insrc:task-<hash8>-<storyId>-<taskId>. linkUnder: the story's ref. itemType: taskIssueType. Refs are stored in the plan's taskRefs. The review comment for the plan goes on the story item. If the story has no ref yet, the story's entry runs first; if there is no approved LLD for it the tasks are reported 'skipped: the story is not tracked yet'. pushTasks is not read (the issues design retired it). AMENDMENT (approved): one comment on the epic item with renderTrackerAmendmentSummary (conventions.ts:243), recorded in the Define's commentedOn under the amendment id so it is posted once. When the amendment is storyBoundary.addStory, the epic item's body is also rewritten from the Define, because that is the moment the epic gains a story: appendStoryToDefine (gates.ts:175-186) adds the story without clearing the Define's approval, so there is no second Define approval to hang it on. EXTEND RECORD: nothing; it is not an approvable work item of its own. EPIC STORY BUILD: close each of the story's task items (from the plan's taskRefs), then the story item, recording closedAt on the plan, the LLD and the BUILD record as the issues design states. Then the epic rule below.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/gates.ts`
- `src/workflow/amendments/store.ts`
- `src/daemon/index.ts`

### 3.3 `Closing and reopening the epic` — new

After an epic story's BUILD approval has closed that story, the flow reads the Define's story list. If EVERY story in body.stories has a BUILD record with approvedAt, it closes the epic item and records closedAt in the Define's tracker block. A story with no BUILD record, or one not approved, counts as not done, so does a story that was never designed; the epic then stays open. The rule reads local records only, never GitHub states, so it is the same on every machine and does not depend on sync. When a story item is later created for an epic whose tracker block has closedAt (a story added by an extend), the flow calls reopen on the epic and clears closedAt before linking the story under it. An epic with no stories is never closed by this rule.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/storage.ts`

### 3.4 `Identity and existing items` — invariant-change

The issues design's rule (hidden id marker plus one unique label, three-answer lookup, a failed lookup never creates) applies to epics, stories and tasks with the unique labels named above. ONE STEP IS ADDED IN FRONT, for both flows: if the local record already holds a ref for the item (epicRef on the Define, storyRefs[storyId] on the Define or storyRef on the LLD, taskRefs[taskId] on the plan, issueRef on an issue record), that issue IS the item. The implementation is given it as the known ref with action addOrUpdate, adds the unique label and the id marker to it if it lacks them, and creates nothing; it does not rewrite the title. Only an item with no recorded ref goes to the unique-label lookup. The old adoption by the pair [epic label, epic:<slug>] (ghFindIssueByLabels, tracker-auto.ts:122-123) is NOT kept: an epic that is on GitHub but has no ref recorded locally is not recognised, appears in the pending list as 'create', and would get a second issue; the pending list is the dry run that shows this before anything is made. The epic:<slug> label stays on every epic, story and task item, because it is what groups an epic's work in GitHub's own filters. Unique labels are bounded to GitHub's 50 characters the way epicMembershipLabel is (conventions.ts:38-45).

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/refs.ts`

### 3.5 `The three tracker workflows are removed` — field-remove

tracker.push, tracker.sync and tracker.post are deleted: their runners and prompts (src/workflow/runners/tracker/index.ts, context.ts, schemas.ts), their names in WorkflowName (src/workflow/types.ts:82-84), their cases in the orchestrator (src/workflow/orchestrator.ts:179-181, :297-299, :439-441) and its tracker finalize (:2648-2880), their rows in src/workflow/synthesizer.ts:171-173, the branch in src/workflow/storage.ts:818, the TrackerArtifact type and its render (src/workflow/artifacts/tracker.ts) with its test (src/workflow/__tests__/tracker-artifact.test.ts), and linkDocsToIssues if the finalize was its only caller (src/workflow/tracker/link.ts; the build checks). Old tracker run logs and TrackerArtifact files already on disk are left alone and nothing reads them. insrc_workflow_step: the three names leave the tool's enum and description (src/mcp/server.ts:420-460); phase start (src/mcp/workflow-step/phases/start.ts:123) answers a call that names one of them with an error that says the workflow was retired and names the insrc_tracker request that replaces it (push or backfill; sync; nothing for post, since the flow comments by itself). The chain report's next action no longer proposes them (src/workflow/chain.ts:294-308): when every design is approved and the epic has no ref it proposes insrc_tracker backfill, and it proposes insrc_tracker sync where it proposed tracker.sync. The steering guide's tracker section (src/prompts/steering-block.md:296-304), the tool table, the plugin's copy of the steering, and docs/workflow.md (:53-55, :138-144, :181-247, :433) are rewritten for the tool. src/workflow/tracker/resolve.ts and setup.ts are not changed: they read refs and set up the repo's labels and types, and neither creates work items.

**Call sites:**
- `src/workflow/runners/tracker/index.ts`
- `src/workflow/runners/tracker/context.ts`
- `src/workflow/runners/tracker/schemas.ts`
- `src/workflow/types.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/synthesizer.ts`
- `src/workflow/storage.ts`
- `src/workflow/artifacts/tracker.ts`
- `src/mcp/workflow-step/phases/start.ts`
- `src/mcp/server.ts`
- `src/workflow/chain.ts`
- `src/prompts/steering-block.md`
- `docs/workflow.md`
- `src/workflow/tracker/link.ts`

### 3.6 `The sync request, the pending list and the backfill for epics` — field-add

SYNC: insrc_tracker sync takes a repo and an epic hash and is one daemon request that runs syncTracker. It reads the states of the epic item and its story items and writes epicStatus, storyStatus and lastSyncedAt on the Define, which the chain report reads (chain.ts:206-215). It changes nothing on GitHub and closes or reopens nothing locally. The TUI's sync command calls this request. PENDING: the list covers the epic kinds with the same rule as the issues design (approved and not tracked), parents before children: Define, then HLD comment, then each story design, then each plan's tasks, then amendments not yet commented, then closes owed (a story whose BUILD record is approved and whose item is not closed; an epic whose stories are all done and which is not closed). For an item with a recorded ref and no unique label it says 'adopt'; for an item with no ref it says 'create'. BACKFILL: runs those entries in that order, one at a time, within the stream request the issues design defines; a finished story is created and closed at once, and an epic whose stories are all finished is created and closed at once. It is safe to run twice.

**Call sites:**
- `src/workflow/tracker/sync.ts`
- `src/workflow/tracker-auto.ts`
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/cli/services/workflow.ts`
- `src/cli/services/index.ts`
- `src/cli/command.ts`
- `src/workflow/chain.ts`
- `src/mcp/__tests__/schema-registry.test.ts`

## 4. Error paths

**Error cases**

- **A story design is approved but the epic item cannot be created or found.** (recoverable)
  - Detection: The Define has no epicRef, and running the Define's entry first answers failed or lookup failed.
  - Response: The story item is not created; the outcome for the design says 'skipped: the epic is not tracked (<reason>)'. The approval stands and the story stays in the pending list.
  - User impact: The user sees the reason in the approve result and runs the backfill once the cause is fixed.
- **GitHub refuses the sub-issue link or the item type.** (recoverable)
  - Detection: The link call or the typed create returns an error from gh.
  - Response: The item is created untyped or unlinked and counts as tracked; the outcome lists what was skipped. The link is tried again on the next addOrUpdate of that item.
  - User impact: The item exists; it may lack its type or its place under the parent.
- **Closing one task fails while closing a story.** (recoverable)
  - Detection: The close call for that task answers failed.
  - Response: The remaining tasks and the story are still attempted; each close is recorded separately with closedAt, so the pending list shows exactly the closes still owed. The epic is not closed while a story's own close is owed.
  - User impact: A later backfill finishes the closes.
- **The 5 minute budget ends partway through a plan with many tasks.** (recoverable)
  - Detection: The flow's budget check before each call.
  - Response: Tasks already created keep their refs in the plan's taskRefs, written after each create; the rest are reported 'skipped: time budget reached' and stay pending.
  - User impact: Running the backfill creates the remaining tasks and no duplicates.
- **A recorded ref points at an issue that no longer exists or is in another repository.** (recoverable)
  - Detection: The implementation's read of the known ref answers not found, or the ref's owner and repo differ from the project's target.
  - Response: The item is reported 'failed: recorded ref <ref> not found' and nothing is created; the ref is not cleared automatically.
  - User impact: The user clears or corrects the ref and runs the backfill; no duplicate is made silently.
- **A caller starts one of the retired workflows.** (recoverable)
  - Detection: insrc_workflow_step phase start sees the name tracker.push, tracker.sync or tracker.post.
  - Response: An error naming the workflow as retired and the insrc_tracker request that replaces it.
  - User impact: The agent or user is pointed at the tool.
- **Reopening the epic fails when a late story is created.** (recoverable)
  - Detection: The reopen call answers failed.
  - Response: The story item is still created and linked; closedAt stays on the Define's tracker block, so the pending list shows 'reopen owed' for the epic.
  - User impact: A closed epic may briefly have an open story under it until the backfill reopens it.
- **Sync is asked for an epic with no recorded ref.** (recoverable)
  - Detection: syncTracker finds no epicRef on the Define.
  - Response: It answers skipped with 'the epic is not tracked', as today.
  - User impact: None; nothing is written.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Define approved while the setting was off, then its HLD approved with the setting on. | The HLD's entry creates the epic item first, then adds the design comment. |
| A plan approved for a story whose design was approved while the setting was off. | The story's entry runs first (creating the epic too if needed), then the tasks are created under it. |
| A story added by an extend to an epic that is already closed. | Approving the amendment comments on the epic and rewrites its body; approving the new story's design reopens the epic, creates the story under it and clears closedAt. |
| The last story's BUILD record is approved but one story in the Define was never designed. | The story and its tasks are closed; the epic stays open. |
| An epic whose Define and stories already carry refs from the old push (this repo has two). | Each item is adopted: it gains its unique label and id marker, nothing is created, its title is left as it is. |
| An epic that is on GitHub under the old labels but has no ref recorded locally. | The pending list shows it as 'create'; nothing looks it up by the old label pair. |
| An HLD approved twice (reopened and approved again). | The design comment is posted once per approval of a changed design; commentedOn prevents a repeat for the same approval. |
| An amendment is rejected. | No tracker action. |
| A standalone story's plan is approved. | The issues design's entry runs; with the common change its tasks are now linked under the story item. |
| An epic slug so long that a unique label would pass 50 characters. | The label is bounded the way epicMembershipLabel bounds epic:<slug>, with a short hash for uniqueness. |
| A github.json that still sets useMilestones, pushTasks or commitArtifacts. | The fields are ignored; no milestone is made. |

**Invariants to preserve**

- Every tracker action for an epic, story or task goes through the one check and the one tracker implementation; nothing else runs gh for work items. [[c1]]
- A failed lookup never creates an item, and a recorded ref is never replaced by a newly created issue. [[c1]]
- An approval is never undone or reported as failed because a tracker action failed. [[c1]]
- The Define stays the one place that lists an epic's story refs (storyRefs), which resolve.ts and the chain report read. [[c2]]
- Sync only reads GitHub; it never creates, edits, closes or reopens an item. [[c2]]
- src/workflow/tracker/resolve.ts and setup.ts behave as before. [[c2]]
- The daemon keeps serving other requests while epic items are created. [[c1]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), under Node 22; git and gh faked through the tracker's one exec seam; the tracker implementation faked for flow tests, as in the issues design`

**Test levels**

- **unit** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1 approving a Define creates the epic item, and approving an HLD, an amendment, an epic story design and an epic plan each do what the by-kind table says, under the one setting and check`, `ac2 approving an epic story's BUILD record closes its tasks and the story, and the epic is closed when every story in the Define is done and reopened when a later story is created`, `ac3 an item whose ref is already recorded is adopted and nothing is created for it; the old label-pair adoption is gone`, `ac4 the three tracker workflows and the three old push functions are gone, and a call for a retired workflow is pointed at the tool`, `ac5 insrc_tracker has a sync request, and the pending list and backfill cover epics`, `ac6 the common part changed for both flows: linkUnder, itemType, reopen, the review comment, amendment approval running the flow, milestones retired`
- **unit** — The common part of the implementation, with git and gh faked.
  - Subjects: `E1 addOrUpdate with linkUnder links the created item under the parent using the id the create returned; for an adopted item it reads the id first; a refused link leaves the item tracked and the outcome says 'not linked'`, `E2 addOrUpdate with itemType creates a typed item, and falls back to untyped when the type is refused, reporting it`, `E3 reopen(ref) reopens a closed item and is harmless on an open one`, `E4 addOrUpdate with a known ref adds the unique label and the id marker when missing, creates nothing and leaves the title alone; a known ref that is not found answers failed and creates nothing`, `E5 no call creates or attaches a milestone, whatever github.json says; useMilestones, pushTasks and commitArtifacts are ignored`, `E6 unique labels for epic, story and task are built from the hash and ids and bounded to 50 characters with a short hash`
- **integration** — The flow's epic entries, with the implementation faked.
  - Subjects: `E7 Define approval: one addOrUpdate with the epic title, body, the three labels and the epic type; the ref is stored on the Define; a second approval updates the same item`, `E8 HLD approval: one comment with the design summary and one with the review on the epic item, the epicRef copied to the HLD; with no epicRef the Define's entry runs first`, `E9 epic story design approval: the story item with linkUnder the epic, its ref on the LLD and in the Define's storyRefs, the epic body rewritten with the story in its checklist, the design comment and the review comment on the story; with no epicRef the Define's entry runs first; when that fails the story is skipped with the reason`, `E10 epic plan approval: one task item per task in order, each linkUnder the story, refs written to taskRefs after each create; the plan's review comment goes on the story; a story with no ref is created first; no approved design means the tasks are skipped with the reason; pushTasks is not consulted`, `E11 amendment approval through the daemon request: one comment on the epic recorded in commentedOn and not repeated on a second call; a storyBoundary.addStory amendment also rewrites the epic body; amendment reject and artifact reject run no flow`, `E12 epic story BUILD approval: every task is closed, then the story, each with closedAt; one failed task close does not stop the rest and leaves that close owed`, `E13 the epic rule: closed when every story in the Define has an approved BUILD record; left open when a story has none or was never designed; never closed for a Define with no stories; closedAt recorded on the Define`, `E14 a story created for an epic with closedAt reopens the epic and clears closedAt; a failed reopen still creates the story and leaves 'reopen owed'`, `E15 the budget: tasks created before the budget ends keep their refs and the rest are 'skipped: time budget reached'`, `E16 a standalone plan's tasks are linked under their story (the common change in the issues flow)`, `E17 the review comment is posted once per review for DEF, HLD, LLD and plan in both flows`
- **integration** — Retirement of the old paths.
  - Subjects: `E18 autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan are not exported; tracker-auto.test.ts and tracker-tasks.test.ts are rewritten against the flow`, `E19 insrc_workflow_step phase start with tracker.push, tracker.sync or tracker.post answers the retired error naming the insrc_tracker request; the three names are not in the tool's enum or description and not in WorkflowName`, `E20 the chain report proposes insrc_tracker backfill and insrc_tracker sync and never names a tracker workflow`, `E21 the registered-tool tests list sync among insrc_tracker's requests`
- **integration** — Sync, the pending list and the backfill for epics, with the implementation faked.
  - Subjects: `E22 insrc_tracker sync writes epicStatus, storyStatus and lastSyncedAt on the Define, changes nothing on the tracker, answers skipped for an epic with no ref, and is refused by the check when the setting is off; the TUI's sync service sends that one request and makes no gh call`, `E23 pending lists an epic's items parents first, marks a recorded ref without a unique label as 'adopt' and an item with no ref as 'create', and lists closes and reopens owed`, `E24 backfill runs them in order, creates and closes a finished story at once, closes an epic whose stories are all finished, and a second run does nothing`
- **live** — One real run against GitHub after the build, recorded in the build record.
  - Subjects: `E25 on this repo: show the pending list for the two epics that carry refs, confirm they read 'adopt', and run the backfill for one of them on the user's go-ahead`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `E7`, `E8`, `E9`, `E10`, `E11` |
| `ac2` | `E12`, `E13`, `E14` |
| `ac3` | `E4`, `E23` |
| `ac4` | `E18`, `E19`, `E20` |
| `ac5` | `E21`, `E22`, `E23`, `E24` |
| `ac6` | `E1`, `E2`, `E3`, `E5`, `E11`, `E16`, `E17` |

## 6. Migration

**State before:** Three synchronous functions in src/workflow/tracker-auto.ts create the epic on HLD approval, a story on LLD approval and tasks on plan approval (only with pushTasks), called only by the TUI approve. Three workflows (tracker.push, tracker.sync, tracker.post) have a model run gh itself. An epic already on GitHub is recognised by the label pair epic label plus epic:<slug>. Nothing closes an epic, story or task. The approved issues design covers issue records and standalone stories only and leaves the three functions unused.

**State after:** Epics, their stories and tasks are created, commented, closed and reopened by the one tracker flow after daemon approvals, under the one setting and check, through the one tracker implementation. The three functions and the three workflows are gone. insrc_tracker has a sync request and its pending list and backfill cover epics. Items with a recorded ref are adopted. Milestones are not used.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Amend the approved issues design (LLD-38436e90625a83a2-S001) with the five common changes and have the daemon review it again; plan and build the two designs as one piece of work, the issues design's steps first. — ↩ rollbackable
2. Extend the github implementation: optional linkUnder and itemType on addOrUpdate, the reopen action, adoption of a known ref (add the unique label and id marker, create nothing), the unique-label builders for epic, story and task; delete the milestone helpers and stop reading useMilestones. — ↩ rollbackable
3. Add the flow's entries for Define, HLD, epic story design, epic plan, amendment and epic story BUILD, the epic close and reopen rule, and the review comment for both flows; use linkUnder and itemType in the issues flow's entries. — ↩ rollbackable
4. Run the flow from the amendment approve request and return its outcome. — ↩ rollbackable
5. Make syncTracker asynchronous behind the check; add the sync request to insrc_tracker and its daemon request; make the TUI's sync an asynchronous sender; update the registered-tool tests. — ↩ rollbackable
6. Extend the pending list and the backfill to the epic kinds, with 'adopt', 'create', and closes and reopens owed. — ↩ rollbackable
7. Delete the three push functions and rewrite their two test files against the flow. — ↩ rollbackable
8. Delete the three tracker workflows: runners, names, orchestrator cases and finalize, synthesizer rows, storage branch, the TrackerArtifact type with its test; answer a start call for one of them with the retired error; change the chain report's next actions. — ↩ rollbackable
9. Rewrite the steering's tracker guide and tool table, the plugin's steering copy, the tool descriptions and the tracker sections of docs/workflow.md. — ↩ rollbackable
10. After the daemon is updated: show the pending list for this repo's epics, confirm the two epics with recorded refs read 'adopt', and run the backfill on the user's go-ahead. — ✕ non-rollbackable

**Backward compat:** Breaking for callers of the three tracker workflows: insrc_workflow_step no longer accepts tracker.push, tracker.sync or tracker.post and answers with an error naming the insrc_tracker request to use. Breaking for code that imported autoPushEpicOnHld, autoPushStoryOnLld or autoPushTasksOnPlan (none outside the TUI approve, which the issues design removes). Behaviour changes: the epic item is created on Define approval, not HLD approval; tasks are created whenever the setting is on, without pushTasks; an epic on GitHub with no locally recorded ref is no longer adopted by its old labels; no milestone is created; useMilestones is ignored. The TUI's sync becomes asynchronous. Stored records are compatible: every existing TrackerMeta field keeps its meaning, and old TrackerArtifact files and tracker run logs are left on disk unread.

## 7. Alternatives considered

### 7.1 a1: Epic kinds as more rows of the one flow — **CHOSEN**

The issues design's flow gains a by-kind entry for each epic record; the same implementation does the work.

Add Define, HLD, epic LLD, epic plan, amendment and epic BUILD to the flow's by-kind table. Each entry only decides which action to ask of the tracker implementation and with which fields (title, body, labels, parent to link under, item type, documents, known ref) and where the returned ref is stored. The implementation gains three small things used by both flows: an optional sub-issue link, an optional item type, and a reopen action. The three old push functions, the three tracker workflows, their runners and their record type are removed; sync becomes a request of the tracker tool over the existing syncTracker.

### 7.2 a2: Keep the three push functions, call them from the flow

The flow calls autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan after the check.

Leave the three synchronous functions as they are, move only their gate to the issues design's check, and have the flow call them for HLD, LLD and plan approvals. Add separate code for Define approval, closing and amendments.

**Rejected because:** Goes against decisions 1 and 6 (epic created on HLD approval, adoption by the old label pair) and would block the daemon, which the issues design forbids.

### 7.3 a3: A separate epic tracker module beside the issues flow

A second flow for epics with its own by-kind logic, sharing only the implementation.

Write an epic flow as its own module with its own entry point called from the after-approval function, sharing the tracker implementation but not the flow's bookkeeping, budget or outcome reporting.

**Rejected because:** Meets the seven decisions but duplicates the flow's bookkeeping, against the user's wish for one place.

## 8. References

- **[[c1]]** `prior-artifact` `LLD-38436e90625a83a2-S001, approved 2026-10-06 after a passing daemon review: the setting, the check, the tracker tool and implementation, the after-approval flow, identity and the outcome rules`
- **[[c2]]** `code` `src/workflow/tracker/refs.ts` — "readonly storyRefs?:     Readonly<Record<string, string>>;  // aggregate on the Epic (batch push)"
- **[[c3]]** `code` `src/workflow/tracker-auto.ts` — "export function autoPushEpicOnHld(hldJsonPath: string): AutoPushResult {"
- **[[c4]]** `code` `src/workflow/runners/tracker/index.ts` — "The framework does NOT wrap `gh`. Every real interaction is in"
- **[[c5]]** `code` `src/workflow/gates.ts` — "export function appendStoryToDefine(repoPath: string, epicHash: string, story: DefineStory): DefineArtifact {"
- **[[c6]]** `code` `src/workflow/tracker/sync.ts` — "export function syncTracker(repoPath: string, epicHash: string): SyncResult {"
- **[[c7]]** `code` `src/workflow/tracker/github.ts` — "export function ghLinkSubIssue(owner: string, repo: string, parentRef: string, childId: number): void {"
- **[[c8]]** `stakeholder` `user, 2026-10-06` — "aprrove, but don't go to plan. let's finalize the same for the epic flows. there might be commonality that needs to be updated"
- **[[c9]]** `stakeholder` `user, 2026-10-06: seven decisions taken one at a time: epic item on Define approval; story item on its LLD approval; epic closed automatically when all stories are done and reopened on a later story; amendments comment on the epic and a story added to the Define rewrites its body; the three tracker workflows retired with sync as a tool request; adopt by recorded ref only; keep sub-issue links, the epic task list, issue types and review comments, drop milestones`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 0 could not be verified · 11 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T11:34:53.819Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | MED | renderEpicBody (conventions.ts:98) can produce the epic body 'with the story checklist built from the Define's story list and the refs it has (storyRefs), so the checklist needs no separate edit step'. | src/workflow/tracker/conventions.ts:98 `renderEpicBody(define, epicSlug, repo?, workflowId?)` never reads refs: :114-117 emit `- [ ] ${s.id}: ${s.title}${size}` for every story. The linked form `- [ ] #${num} — ${storyId}: ${storyTitle}` exists only in updateEpicTaskList (:154-169), which the design retires. Rewriting the body with renderEpicBody as it stands removes the story links from the checklist on every rewrite, including on the two already-pushed epics. It also always emits unchecked boxes, so the design is silent on what a closed story's line looks like after a rewrite. [files: src/workflow/tracker/conventions.ts] | Add renderEpicBody to the contract section as CHANGED: state how it receives storyRefs (the Define's meta.tracker or a parameter), the linked line format, and whether a closed story renders checked. Add a test for the rewritten checklist. |
| change-sites | MED | The inventory for removing the three tracker workflows (section 3.5 and its call sites) is complete. | Sites that reference what is deleted and appear in neither design: (1) src/workflow/index.ts:19 and :34 import and call `registerTrackerRunners` from the deleted runners file. (2) src/mcp/workflow-step/__tests__/tracker-e2e.test.ts and tracker-tasks-coarse.test.ts drive `handleWorkflowStep({ phase: 'start', workflow: 'tracker.push' ... })` end to end; only tracker-artifact.test.ts is named for deletion, and tests are outside tsc, so these fail only when run. (3) site/tracker.html:131-141 and docs/installation.md:21 document the three workflows; only docs/workflow.md and the steering are listed. (4) src/mcp/server.ts:871 (insrc_workflow_run) and src/daemon/workflow-rpc.ts:664 also accept workflows by WORKFLOW_NAMES. (5) src/workflow/config/__tests__/github.test.ts:145-168 asserts `cfg.useMilestones`, which breaks if the field leaves the resolved config. A grep of both LLD JSONs for these paths returns no match. [files: src/workflow/index.ts, src/mcp/workflow-step/__tests__/tracker-e2e.test.ts, src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts, site/tracker.html, docs/installation.md, src/daemon/workflow-rpc.ts, src/mcp/server.ts, src/workflow/config/__tests__/github.test.ts] | Add to 3.5: src/workflow/index.ts (drop registerTrackerRunners); delete or rewrite tracker-e2e.test.ts and tracker-tasks-coarse.test.ts; site/tracker.html and docs/installation.md; insrc_workflow_run and workflow-rpc.ts behaviour for the retired names; state whether useMilestones stays on the resolved config type. |
| error-paths | MED | A caller that starts a retired workflow reaches insrc_workflow_step phase start, which answers with the retired error naming the insrc_tracker request, while the three names are also removed from the tool's enum and from WorkflowName. | The tool's enum is not a separate list: src/mcp/server.ts:472 is `workflow: z.enum(WORKFLOW_NAMES)` with WORKFLOW_NAMES imported from src/workflow/types.ts (:57). Once the three names leave WorkflowName, the MCP input schema rejects `workflow: 'tracker.push'` before the handler runs, so the caller gets a generic invalid-argument error and never the retired message. src/mcp/workflow-step/phases/start.ts:123 is inside `epicKeyFor(workflow: string, ...)`, which only picks the trace key. E19 asserts both halves; a test that calls the handler directly would pass while the real tool path never shows the message. src/daemon/workflow-rpc.ts:664 rejects by the same list for workflow.run. [files: src/mcp/server.ts, src/workflow/types.ts, src/mcp/workflow-step/phases/start.ts, src/daemon/workflow-rpc.ts] | Choose one: keep the tool's input as the live names plus the three retired names (a separate retired list that only the start phase answers), or drop the retired-error promise and say the schema rejects the names. Make E19 exercise the registered tool schema, not just the handler. |

#### Could not verify (does not block)

_None._
