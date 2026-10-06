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

**Returns:** `AmendmentRecord` — UNCHANGED function (src/workflow/amendments/store.ts:101). What changes is its daemon request: 'workflow.amendment.approve', which the issues design adds, answers { record: AmendmentRecord, tracker: TrackerOutcome[] } as that design states. This design adds the flow's entry for an amendment, so tracker carries the outcome of the comment on the epic's item. The callers that unwrap the answer are listed in the issues design: the TUI sender (src/cli/services/workflow.ts:271-272), its service type (src/cli/services/index.ts:63) and the Workflows pane (src/cli/panes/WorkflowsPane.tsx:119). Rejecting an amendment still runs no flow.

**Preconditions:**
- The request names a repo, which the daemon checks is registered, as the issues design states.

**Postconditions:**
- The issues design already states this ('Rejecting an artifact and rejecting an amendment run no tracker flow; approving an amendment runs it'); nothing in it changes for this.

### 2.4 `ghLinkSubIssue`

```typescript
link(parentRef: string, childRef: string): Promise<TrackerOutcome>
```

**Returns:** `Promise<TrackerOutcome>` — The existing helper (src/workflow/tracker/github.ts:177-179) is synchronous and is NOT called as it is; its one API call is made through the implementation's asynchronous exec, inside addOrUpdate, as the issues design states: when the flow passes linkUnder, the implementation links the item as a sub-issue of that parent after creating or adopting it. Best-effort: a refusal is reported in the outcome as 'not linked: <reason>' and the item still counts as tracked.

**Preconditions:**
- The link needs the child's numeric id. The implementation's own create returns it (the issues design; ghCreateIssueTyped is not used because it retries after any error, github.ts:164-171); for an adopted item the implementation reads the id with one extra call.

### 2.5 `renderEpicBody`

```typescript
renderEpicBody(define: DefineArtifact, epicSlug: string, repo?: RepoRef, workflowId?: string, stories?: { readonly refs: Readonly<Record<string, string>>; readonly closed: ReadonlySet<string> }): string
```

**Parameters:**
- `stories: { refs: Readonly<Record<string, string>>; closed: ReadonlySet<string> }` _(optional)_ — The story refs (storyId to ref) and the ids of the stories whose item is closed. Passed by the flow from the Define's storyRefs and from the closedAt recorded for each story.

**Returns:** `string` — CHANGED (src/workflow/tracker/conventions.ts:98). Today it never reads refs: lines :114-117 print `- [ ] <storyId>: <title>` for every story, and only updateEpicTaskList (:154-169) writes the linked form. With the new optional last parameter, a story that has a ref is printed in the linked form updateEpicTaskList uses today, `- [ ] #<number> — <storyId>: <title>`, a story whose id is in closed is printed with a ticked box `- [x]`, and a story with no ref is printed as today. Called without the parameter it returns exactly what it returns today.

**Preconditions:**
- Callers today: autoPushEpicOnHld (removed here) and the tracker.push context (src/workflow/runners/tracker/context.ts, removed here); its tests are in src/workflow/tracker/__tests__/tracker.test.ts.

**Postconditions:**
- updateEpicTaskList is deleted; the epic body is always rendered whole and written by the implementation's update action, never read from GitHub and edited.
- Rewriting the body of the two epics already on GitHub keeps their story links, because the links come from the Define's storyRefs.

## 3. Data model changes

### 3.1 `The common part this design relies on (defined in the issues design)` — invariant-change

The common part is DEFINED in the issues design, LLD-38436e90625a83a2-S001, not here. There is no amendment mechanism for a standalone design (every amendment type in src/workflow/amendments/types.ts changes an HLD), so that design was revised in place on 2026-10-06 to carry what both flows need; the revision cleared its approval, and it is reviewed by the daemon and approved again before either design is planned. The two are then planned and built as one piece of work, that design's steps first. What this design relies on from it, by name: (1) the implementation's optional inputs linkUnder and itemType, its own asynchronous create that returns the ref and the numeric id and retries untyped only on a definite refusal of the type, and the best-effort link made through the asynchronous exec; this design does not use ghCreateIssueTyped or call ghLinkSubIssue as it is; (2) adoption of a known ref (the unique label and id marker are added, the title is left alone, nothing is created); (3) the reopen action; (4) TrackerMeta's comments map (comment key to time) and its key forms '<artifact id>:design:<approvedAt>', '<artifact id>:review:<reviewedAt>' and the amendment id, with commentedOn unchanged as one ref; (5) taskClosedAt on a plan, one entry per closed task; (6) the review comment, once per review; (7) the answer of 'workflow.amendment.approve', { record, tracker }; (8) the by-kind table as the one place kinds are added, which this design extends; (9) milestones not used by the implementation; THIS design deletes the two milestone helpers ghEnsureMilestone and ghAttachMilestone (github.ts:225, :233) in the same step that deletes the three push functions, their only callers (tracker-auto.ts:40-41, :140, :214); useMilestones is left on the resolved config (src/workflow/config/github.ts:72, :110, :247, :275) because resolveGithubConfig and its test (src/workflow/config/__tests__/github.test.ts:145-168) are unchanged. For epic kinds itemType comes from epicIssueType, storyIssueType and taskIssueType in github.json (defaults Epic, Story, Task). WHAT THIS DESIGN ADDS to the tracker tool and its implementation, beyond that design: (a) the sync request, which that design lists and this one defines; (b) the first use of the implementation's state(ref) action, which that design defines (it replaces the synchronous ghGetIssueState, github.ts:204, for sync, which needs both the state and the labels for mapIssueStatus, conventions.ts:261); (c) LABELS: nothing is added; that design's addOrUpdate idempotently creates every label it is passed and applies all of them. The epic kinds pass three, and the third, epic:<slug>, is new for every new epic; today the old code creates it before use (tracker-auto.ts:129-131 and :289-291, through allTrackerLabels, conventions.ts:49), and those functions are deleted here; (d) the comment request below, for the one other place that comments on an item.

**Call sites:**
- `docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md`
- `.insrc/artifacts/LLD-38436e90625a83a2-S001.json`
- `src/workflow/amendments/types.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/config/github.ts`
- `src/workflow/config/__tests__/github.test.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/sync.ts`

### 3.2 `The flow's entries for the epic kinds` — new

One entry per approved record, added to the flow's by-kind table. Every entry runs after the same check, inside the same 5 minute budget, and commits and pushes the approved documents first, exactly as the issues design states. An 'epic record' is one whose Define exists and is not standalone; a standalone record keeps the issues design's entries. DEFINE: addOrUpdate the epic item. Title: the epic's workflow id and the first sentence of the problem, as today (tracker-auto.ts:131-133). Body: renderEpicBody (conventions.ts:98), CHANGED as its contract entry states so that the story checklist is built from the Define's story list, the story refs and which stories are closed; the checklist then needs no separate edit step. Labels: the epic label, epic:<slug> for grouping, and the unique label insrc:epic-<hash8>. itemType: epicIssueType. The ref is stored on the Define (meta.tracker.epicRef). Approving a Define again (after a reopen) is the same call and rewrites the body. HLD: no item of its own. If the Define has an epicRef, one comment on the epic item with renderTrackerHldSummary (conventions.ts:204), recorded on the HLD under the key '<HLD id>:design:<approvedAt>', then the review comment under '<HLD id>:review:<reviewedAt>'; the epicRef is copied to the HLD's meta.tracker so its document shows the link, as today. If the Define has no epicRef (approved while the setting was off), the flow first runs the Define's entry to create the epic, then comments. EPIC STORY DESIGN (LLD): addOrUpdate the story item. Title: story workflow id and title (tracker-auto.ts:194-196). Body: renderStoryBody (conventions.ts:129). Labels: the story label, epic:<slug>, and the unique label insrc:story-<hash8>-<storyId>. linkUnder: the epic's ref. itemType: storyIssueType. The ref is stored on the LLD (storyRef) and in the Define's storyRefs[storyId], as a patch of that one entry, which patchTrackerMeta merges into the map key by key (the issues design changes it to do so; the old code spread the prior map itself, tracker-auto.ts:222, and is deleted here); then the epic item's body is rewritten with the changed renderEpicBody so its checklist shows the story as a linked line (this replaces updateEpicTaskList's read-edit-write, conventions.ts:154-169, which is deleted), then one comment on the story with renderTrackerLldSummary (conventions.ts:222), then the review comment. If the epic was closed (closedAt on the Define's tracker block), the flow reopens it and clears closedAt. If the Define has no epicRef the Define's entry runs first. EPIC PLAN: for each task in order, addOrUpdate a task item. Title and body as today (tracker-auto.ts:284-290, renderTaskBody conventions.ts:174). Labels: the task label, epic:<slug>, and insrc:task-<hash8>-<storyId>-<taskId>. linkUnder: the story's ref. itemType: taskIssueType. Refs are stored in the plan's taskRefs. The review comment for the plan goes on the story item. If the story has no ref yet, the story's entry runs first; if there is no approved LLD for it the tasks are reported 'skipped: the story is not tracked yet'. pushTasks is not read (the issues design retired it). AMENDMENT (approved): one comment on the epic item with renderTrackerAmendmentSummary (conventions.ts:243), recorded in the Define's comments map under the amendment id so it is posted once. When the amendment is storyBoundary.addStory, the epic item's body is also rewritten from the Define, because that is the moment the epic gains a story: appendStoryToDefine (gates.ts:175-186) adds the story without clearing the Define's approval, so there is no second Define approval to hang it on. EXTEND RECORD: nothing; it is not an approvable work item of its own. EPIC STORY BUILD: close each of the story's task items (from the plan's taskRefs), then the story item, recording one taskClosedAt entry on the plan for each task closed, closedAt on the LLD for the story, and closedAt on the BUILD record, as the issues design states; then the epic item's body is rewritten so the story's line is ticked. Then the epic rule below.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/gates.ts`
- `src/workflow/amendments/store.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker/__tests__/tracker.test.ts`

### 3.3 `Closing and reopening the epic` — new

After an epic story's BUILD approval has closed that story, the flow reads the Define's story list. If EVERY story in body.stories has a BUILD record with approvedAt, it closes the epic item and records closedAt in the Define's tracker block. A story with no BUILD record, or one not approved, counts as not done, so does a story that was never designed; the epic then stays open. The rule reads local records only, never GitHub states, so it is the same on every machine and does not depend on sync. When a story item is later created for an epic whose tracker block has closedAt (a story added by an extend), the flow calls reopen on the epic and clears closedAt, using the remove list of patchTrackerMeta that the issues design adds, before linking the story under it. An epic with no stories is never closed by this rule.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/storage.ts`

### 3.4 `Identity and existing items` — invariant-change

The issues design's rule (hidden id marker plus one unique label, three-answer lookup, a failed lookup never creates) applies to epics, stories and tasks with the unique labels named above. ONE STEP IS ADDED IN FRONT, for both flows: if the local record already holds a ref for the item (epicRef on the Define, storyRefs[storyId] on the Define or storyRef on the LLD, taskRefs[taskId] on the plan, issueRef on an issue record), that issue IS the item. The implementation is given it as the known ref with action addOrUpdate, adds the unique label and the id marker to it if it lacks them, and creates nothing; it does not rewrite the title. Only an item with no recorded ref goes to the unique-label lookup. The old adoption by the pair [epic label, epic:<slug>] (ghFindIssueByLabels, tracker-auto.ts:122-123) is NOT kept: an epic that is on GitHub but has no ref recorded locally is not recognised, appears in the pending list as 'create', and would get a second issue; the pending list is the dry run that shows this before anything is made. The epic:<slug> label stays on every epic, story and task item, because it is what groups an epic's work in GitHub's own filters. COMMENTS ALREADY POSTED BY THE OLD PUSH. The old code posted the HLD summary, each story's design summary and the review comments (tracker-auto.ts:155-156, :230-231, :284) but recorded only refs and pushedAt (:148); no record has a comments map. So for a record that has a ref and pushedAt and no comments map, the flow and the pending list treat the design key and the review key of its current approval as already posted: the first time such a record is touched its comments map is seeded with those two keys at the pushedAt time, and nothing is posted. A later re-approval has a new key and is commented as usual. Without this the backfill would repeat the design and review comments on this repo's two pushed epics and their stories. Unique labels are bounded to GitHub's 50 characters the way epicMembershipLabel is (conventions.ts:38-45).

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/conventions.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/refs.ts`
- `.insrc/artifacts/HLD-185807ba9a6b35d3.json`
- `.insrc/artifacts/HLD-6d6cfaf9a9b14bd4.json`

### 3.5 `The comment made when an open question is resolved` — invariant-change

One other place runs gh for a work item today, outside the old push functions. When an open question is resolved, recordResolution (src/workflow/questions.ts:383-393) writes the resolution and, unless its caller passes commit: false (:424), calls the private commitAndComment (:460-480), which commits the two artifact files and then posts the resolution summary on the artifact's item with the synchronous ghComment, gated on resolveGithubConfig alone (:474-476); the item is the Define's or HLD's epicRef (:317, :329) or the LLD's storyRef (:340). It ignores the setting and the check. ONLY ONE CALLER COMMENTS TODAY: the session tool server's resolve_question phase (src/mcp/workflow-step/phases/resolve-question.ts:78). The daemon's review-comment handler passes commit: false (src/workflow/resolve-comment.ts:182), commits once itself (:208-222) and posts no comment; that stays as it is, silent. It posts for every status: a question that is deferred gets a 'deferred for review' comment, and when the deferred-review phase (src/mcp/workflow-step/phases/review-deferred.ts:60-77) later sends the same question back through resolve_question, a second comment carries the decision. CHANGE, keeping recordResolution synchronous and its test seam (RecordResolutionFn, resolve-comment.ts:44) the same call shape. (1) commitAndComment loses its gh call and its trackerRef and resolveGithubConfig use; it only commits and pushes the two files, as before. (2) recordResolution's result (RecordResolutionResult) gains one optional field, comment: { artifactJsonPath, key, body }, set when it committed (commit not false): body is the resolution summary it builds today (resolutionSummary, :440-455) and key is '<artifact id>:question:<question id>:<resolvedAt>', with the resolvedAt it already stamps (:408). Because the key carries resolvedAt, the deferral and the later decision on the same question are two keys and both are posted, as today, while a repeat of the same resolution is posted once. (3) The resolve_question phase, which is already asynchronous, sends that comment to a new daemon request, 'tracker.comment' { artifactJsonPath, key, body }, after recordResolution returns, awaits it, and ignores a failure beyond logging it. (4) The daemon request finds the repo from the path as approve does, runs the check, and when it holds calls the implementation's comment action on the artifact's item, records the key in the artifact's comments map and commits that ref change like any other; when the key is already there, or the check fails, or the artifact has no item, it posts nothing and says why. So the tool server makes no gh call and the comment obeys the setting. 'tracker.comment' is a daemon request only, not a request of the insrc_tracker tool, because an agent has no reason to post free text on an item.

**Call sites:**
- `src/workflow/questions.ts`
- `src/mcp/workflow-step/phases/resolve-question.ts`
- `src/mcp/workflow-step/phases/review-deferred.ts`
- `src/workflow/resolve-comment.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/refs.ts`

### 3.6 `The three tracker workflows are removed` — field-remove

tracker.push, tracker.sync and tracker.post are deleted: their runners and prompts (src/workflow/runners/tracker/index.ts, context.ts, schemas.ts), their names in WorkflowName (src/workflow/types.ts:82-84), their cases in the orchestrator (src/workflow/orchestrator.ts:179-181, :297-299, :439-441) and its tracker finalize (:2648-2880), their rows in src/workflow/synthesizer.ts:171-173, the branch in src/workflow/storage.ts:818, the TrackerArtifact type and its render (src/workflow/artifacts/tracker.ts) with its test (src/workflow/__tests__/tracker-artifact.test.ts), and linkDocsToIssues if the finalize was its only caller (src/workflow/tracker/link.ts; the build checks). Old tracker run logs and TrackerArtifact files already on disk are left alone and nothing reads them. insrc_workflow_step: the three names leave the tool's enum and description (src/mcp/server.ts:420-460); A RETIRED LIST keeps the message reachable. The tool's accepted names are not a separate list today: src/mcp/server.ts:472 is z.enum(WORKFLOW_NAMES), the same list WorkflowName is derived from (src/workflow/types.ts:73-87), so simply removing the three names would make the input schema reject the call as an invalid argument before any handler ran. So src/workflow/types.ts gains a second exported list, RETIRED_WORKFLOW_NAMES, holding the three names; they leave WORKFLOW_NAMES and WorkflowName, so no code can run, plan, store or synthesize them. The insrc_workflow_step input accepts the live names plus the retired names; its description lists only the live ones. The handler checks for a retired name first, before any phase logic, and answers with an error that says the workflow was retired and names the insrc_tracker request that replaces it (tracker.push: push or backfill; tracker.sync: sync; tracker.post: nothing to call, the flow comments by itself). The two other entry points that accept a workflow name answer the same way from the same helper: insrc_workflow_run (src/mcp/server.ts:871, also z.enum(WORKFLOW_NAMES)) and the daemon's workflow.run request (src/daemon/workflow-rpc.ts:664). The branch in epicKeyFor (src/mcp/workflow-step/phases/start.ts:123), which only picks a trace key for the three names, is deleted. ALSO REMOVED OR CHANGED, found by searching the repo for the three names and for what is deleted: src/workflow/index.ts:19 and :34 (the import and call of registerTrackerRunners); src/mcp/workflow-step/__tests__/tracker-e2e.test.ts and tracker-tasks-coarse.test.ts, which drive tracker.push end to end through the handler and are deleted, their coverage replaced by the flow's tests; src/workflow/__tests__/chain.test.ts, which asserts the old next actions; site/tracker.html (:62, :81, :90, :106, :108, :125, :131-141), site/workflow.html (:117, :153-160, :171, :181), docs/installation.md (:21 and the config section :145-155), docs/index.html (:125 and :217-223), README.md:40 and site/index.html:69, which name the three push functions, pushTasks, useMilestones or the tracker workflows, which describe the three workflows and are rewritten for the tool; vscode-plugin/assets/steering-block.md, the plugin's steering copy. Approved design documents of earlier work that mention the names (for example docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/S001/LLD.md) are history and are not edited. The chain report's next action no longer proposes them (src/workflow/chain.ts:294-308, with the NextAction kinds 'push-tracker' and 'sync-tracker' at :76-77 and their formatter lines at :374-375, whose commands and text change to name the tool): when every design is approved and the epic has no ref it proposes insrc_tracker backfill, and it proposes insrc_tracker sync where it proposed tracker.sync. The steering guide's tracker section (src/prompts/steering-block.md:296-304), the tool table, the plugin's copy of the steering, and docs/workflow.md (:53-55, :138-144, :181-247, :433) are rewritten for the tool. src/workflow/tracker/resolve.ts and setup.ts are not changed: they read refs and set up the repo's labels and types, and neither creates work items.

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
- `src/workflow/index.ts`
- `src/mcp/workflow-step/__tests__/tracker-e2e.test.ts`
- `src/mcp/workflow-step/__tests__/tracker-tasks-coarse.test.ts`
- `src/workflow/__tests__/chain.test.ts`
- `src/workflow/__tests__/tracker-artifact.test.ts`
- `src/daemon/workflow-rpc.ts`
- `site/tracker.html`
- `docs/installation.md`
- `docs/index.html`
- `vscode-plugin/assets/steering-block.md`
- `site/workflow.html`
- `README.md`
- `site/index.html`

### 3.7 `The sync request, the pending list and the backfill for epics` — field-add

SYNC: insrc_tracker sync takes a repo and an epic hash and is one daemon request that runs syncTracker. It reads the states of the epic item and its story items with the implementation's state(ref) action and writes epicStatus, storyStatus and lastSyncedAt on the Define, which the chain report reads (chain.ts:206-215). It changes nothing on GitHub and closes or reopens nothing locally. The TUI's sync command calls this request. PENDING: the list covers the epic kinds with the same rule as the issues design (approved and not tracked), parents before children: Define, then HLD comment, then each story design, then each plan's tasks, then amendments not yet commented, then closes owed (a story whose BUILD record is approved and whose item is not closed; an epic whose stories are all done and which is not closed). For an item with a recorded ref and no unique label it says 'adopt'; for an item with no ref it says 'create'. BACKFILL: runs those entries in that order, one at a time, within the stream request the issues design defines; a finished story is created and closed at once, and an epic whose stories are all finished is created and closed at once. It is safe to run twice.

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
  - Response: The remaining tasks and the story are still attempted; each task close is recorded as its own taskClosedAt entry on the plan and the story's close as closedAt on the LLD, so the pending list shows exactly the closes still owed. The epic is not closed while a story's own close is owed.
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
  - Detection: The handler of insrc_workflow_step, insrc_workflow_run or the daemon's workflow.run finds the name in the retired list, which the input schema still accepts.
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
- **The comment for a resolved question cannot be posted.** (recoverable)
  - Detection: The 'tracker.comment' daemon request answers skipped (the check fails, or the artifact has no item) or failed, or the request itself fails.
  - Response: The resolution is recorded and committed as today; the outcome is logged; nothing is retried.
  - User impact: The decision is in the document; it may be missing from the tracker item.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A Define approved while the setting was off, then its HLD approved with the setting on. | The HLD's entry creates the epic item first, then adds the design comment. |
| A plan approved for a story whose design was approved while the setting was off. | The story's entry runs first (creating the epic too if needed), then the tasks are created under it. |
| A story added by an extend to an epic that is already closed. | Approving the amendment comments on the epic and rewrites its body; approving the new story's design reopens the epic, creates the story under it and clears closedAt. |
| The last story's BUILD record is approved but one story in the Define was never designed. | The story and its tasks are closed; the epic stays open. |
| An epic whose Define and stories already carry refs from the old push (this repo has two). | Each item is adopted: it gains its unique label and id marker, nothing is created, its title is left as it is. |
| An epic that is on GitHub under the old labels but has no ref recorded locally. | The pending list shows it as 'create'; nothing looks it up by the old label pair. |
| An HLD approved twice (reopened and approved again). | The design comment is posted once per approval of a changed design; the comment key carries the approval time, so the same approval is never commented twice and a new approval is. |
| An amendment is rejected. | No tracker action. |
| A standalone story's plan is approved. | The issues design's entry runs; with the common change its tasks are now linked under the story item. |
| An epic slug so long that a unique label would pass 50 characters. | The label is bounded the way epicMembershipLabel bounds epic:<slug>, with a short hash for uniqueness. |
| A github.json that still sets useMilestones, pushTasks or commitArtifacts. | The fields are ignored; no milestone is made. |
| The epic body is rewritten for an epic whose stories were pushed by the old code. | Each story with a ref in the Define's storyRefs keeps its linked line; closed stories are ticked. |
| The backfill runs over an epic pushed by the old code. | Its items are adopted and its design and review comments are not posted again; the comments maps are seeded. |
| A question is deferred, then resolved in the deferred-review pass. | Two comments on the item, the deferral and the decision, because each resolution has its own key. |

**Invariants to preserve**

- Every tracker action for an epic, story or task goes through the one check and the one tracker implementation; nothing else runs gh for work items. That includes the comment made when an open question is resolved, which this design moves behind the check. Tracker setup (labels, issue types, project for a repo) is not a work-item action and is unchanged. [[c1]]
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
  - Subjects: `E1 an epic story is created with linkUnder the epic's ref and a task with linkUnder the story's ref (the link itself is the issues design's T39)`, `E2 the epic kinds pass itemType from epicIssueType, storyIssueType and taskIssueType, with the defaults Epic, Story and Task when github.json names none`, `E3 reopen(ref) reopens a closed item and is harmless on an open one`, `E4 addOrUpdate with a known ref adds the unique label and the id marker when missing, creates nothing and leaves the title alone; a known ref that is not found answers failed and creates nothing`, `E5 no call creates or attaches a milestone, whatever github.json says; useMilestones, pushTasks and commitArtifacts are still resolved by resolveGithubConfig (its test is unchanged) and nothing acts on them`, `E6 unique labels for epic, story and task are built from the hash and ids and bounded to 50 characters with a short hash`, `E28 the epic kinds pass three labels, including a new epic:<slug>, and all three are on the created item (creating every passed label is the issues design's T39); sync uses state(ref)`
- **integration** — The flow's epic entries, with the implementation faked.
  - Subjects: `E7 Define approval: one addOrUpdate with the epic title, body, the three labels and the epic type; the ref is stored on the Define; a second approval updates the same item; the implementation is passed all three labels and creates each idempotently before the item, including a new epic:<slug>`, `E8 HLD approval: one comment with the design summary and one with the review on the epic item, each under its key in the HLD's comments map; a re-approval comments again under a new key and a second run of the same approval does not; the epicRef copied to the HLD; with no epicRef the Define's entry runs first`, `E9 epic story design approval: the story item with linkUnder the epic, its ref on the LLD and in the Define's storyRefs, the epic body rewritten with the story in its checklist, the design comment and the review comment on the story; with no epicRef the Define's entry runs first; when that fails the story is skipped with the reason; a second story's ref is added to storyRefs without losing the first`, `E10 epic plan approval: one task item per task in order, each linkUnder the story, refs written to taskRefs after each create; the plan's review comment goes on the story; a story with no ref is created first; no approved design means the tasks are skipped with the reason; pushTasks is not consulted`, `E11 amendment approval through the daemon request: the answer is { record, tracker } with one comment on the epic, its key (the amendment id) stored in the Define's comments map and not repeated on a second call; two amendments on one epic are each commented once; a storyBoundary.addStory amendment also rewrites the epic body; amendment reject and artifact reject run no flow`, `E12 epic story BUILD approval: every task is closed with its own taskClosedAt entry on the plan, then the story with closedAt on the LLD; one failed task close does not stop the rest and leaves exactly that task owed in the pending list`, `E13 the epic rule: closed when every story in the Define has an approved BUILD record; left open when a story has none or was never designed; never closed for a Define with no stories; closedAt recorded on the Define`, `E14 a story created for an epic with closedAt reopens the epic and clears closedAt; a failed reopen still creates the story and leaves 'reopen owed'; closedAt is gone from the Define's stored tracker block after the reopen`, `E15 the budget: tasks created before the budget ends keep their refs and the rest are 'skipped: time budget reached'`, `E16 a standalone plan's tasks are linked under their story (the common change in the issues flow)`, `E17 the review comment is posted once per review for DEF, HLD, LLD and plan in both flows`, `E27 renderEpicBody: without the new parameter its output is unchanged; with refs a story line is linked in the form `- [ ] #<number> — <storyId>: <title>`; a closed story is ticked; after a story design approval and after a story BUILD approval the epic item's body carries the linked, and then ticked, line; an epic adopted from the old push keeps its links after a rewrite`, `E30 resolving an open question: commitAndComment makes no gh call and recordResolution, still synchronous, returns the comment (path, key with resolvedAt, body) when it committed and none when called with commit: false; resolve_question sends it to 'tracker.comment' and a failure there does not fail the resolution; the daemon request runs the check, posts one comment, records the key, posts nothing for the same key again and nothing when the setting is off; a question deferred and later resolved gets both comments, under two keys; the daemon's review-comment batch posts no comment, as today; the files are still committed`
- **integration** — Retirement of the old paths.
  - Subjects: `E18 autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan are not exported; tracker-auto.test.ts and tracker-tasks.test.ts are rewritten against the flow; ghEnsureMilestone and ghAttachMilestone are not exported`, `E19 through the REGISTERED insrc_workflow_step input schema, not only the handler: tracker.push, tracker.sync and tracker.post are accepted by the schema and answered with the retired error naming the insrc_tracker request; an unknown name is still rejected by the schema; the three names are absent from WORKFLOW_NAMES, from WorkflowName and from the tool's description; insrc_workflow_run and the daemon's workflow.run answer the same retired error`, `E20 the chain report proposes insrc_tracker backfill and insrc_tracker sync and never names a tracker workflow`, `E21 the registered-tool tests list sync among insrc_tracker's requests`, `E26 registerWorkflowRunners registers no tracker runner; tracker-e2e.test.ts and tracker-tasks-coarse.test.ts are deleted; chain.test.ts asserts the new next actions`
- **integration** — Sync, the pending list and the backfill for epics, with the implementation faked.
  - Subjects: `E22 insrc_tracker sync reads each item with state(ref) and writes epicStatus, storyStatus and lastSyncedAt on the Define, changes nothing on the tracker, answers skipped for an epic with no ref, and is refused by the check when the setting is off; the TUI's sync service sends that one request and makes no gh call`, `E23 pending lists an epic's items parents first, marks a recorded ref without a unique label as 'adopt' and an item with no ref as 'create', and lists closes and reopens owed`, `E24 backfill runs them in order, creates and closes a finished story at once, closes an epic whose stories are all finished, and a second run does nothing`, `E29 a record with a ref and pushedAt and no comments map (an epic pushed by the old code): the pending list shows its design and review comments as done, the first touch seeds the two keys at pushedAt, the backfill posts no design or review comment for it, and a later re-approval is commented once`
- **live** — One real run against GitHub after the build, recorded in the build record.
  - Subjects: `E25 on this repo: show the pending list for the two epics that carry refs, confirm they read 'adopt', and run the backfill for one of them on the user's go-ahead`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `E7`, `E8`, `E9`, `E10`, `E11`, `E27` |
| `ac2` | `E12`, `E13`, `E14` |
| `ac3` | `E4`, `E23`, `E29` |
| `ac4` | `E18`, `E19`, `E20`, `E26` |
| `ac5` | `E21`, `E22`, `E23`, `E24`, `E28` |
| `ac6` | `E1`, `E2`, `E3`, `E5`, `E11`, `E16`, `E17`, `E28`, `E30` |

## 6. Migration

**State before:** Three synchronous functions in src/workflow/tracker-auto.ts create the epic on HLD approval, a story on LLD approval and tasks on plan approval (only with pushTasks), called only by the TUI approve. Three workflows (tracker.push, tracker.sync, tracker.post) have a model run gh itself. An epic already on GitHub is recognised by the label pair epic label plus epic:<slug>. Nothing closes an epic, story or task. The approved issues design covers issue records and standalone stories only and leaves the three functions unused.

**State after:** Epics, their stories and tasks are created, commented, closed and reopened by the one tracker flow after daemon approvals, under the one setting and check, through the one tracker implementation. The three functions and the three workflows are gone. insrc_tracker has a sync request and its pending list and backfill cover epics. Items with a recorded ref are adopted. Milestones are not used.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. The issues design (LLD-38436e90625a83a2-S001) was revised in place with the common part; the daemon reviews it again and the user approves it again; then the two designs are planned and built as one piece of work, the issues design's steps first. — ↩ rollbackable
2. Use the common part for the epic kinds: the unique-label builders for epic, story and task, and itemType from epicIssueType, storyIssueType and taskIssueType. — ↩ rollbackable
3. Add the flow's entries for Define, HLD, epic story design, epic plan, amendment and epic story BUILD, the epic close and reopen rule, the review comment for both flows, and the changed renderEpicBody (delete updateEpicTaskList); use linkUnder and itemType in the issues flow's entries. Seed the comments map of records pushed by the old code. Remove the gh call from commitAndComment, return the comment from recordResolution, add the 'tracker.comment' daemon request and send to it from resolve_question. — ↩ rollbackable
4. Run the flow from the amendment approve request and return its outcome. — ↩ rollbackable
5. Make syncTracker asynchronous behind the check; add the sync request to insrc_tracker and its daemon request; make the TUI's sync an asynchronous sender; update the registered-tool tests. — ↩ rollbackable
6. Extend the pending list and the backfill to the epic kinds, with 'adopt', 'create', and closes and reopens owed. — ↩ rollbackable
7. Delete the three push functions and the two milestone helpers they alone call, and rewrite their two test files against the flow. — ↩ rollbackable
8. Delete the three tracker workflows: runners and their registration, names (moved to a retired list), orchestrator cases and finalize, synthesizer rows, storage branch, the trace-key branch, the TrackerArtifact type with its test, the two end-to-end tracker tests; answer a call for a retired name with the retired error on insrc_workflow_step, insrc_workflow_run and the daemon's workflow.run; change the chain report's next actions and its test. — ↩ rollbackable
9. Rewrite the steering's tracker guide and tool table, the plugin's steering copy, the tool descriptions, the tracker sections of docs/workflow.md, site/tracker.html, site/workflow.html, site/index.html, README.md, docs/installation.md and docs/index.html. — ↩ rollbackable
10. After the daemon is updated: show the pending list for this repo's epics, confirm the two epics with recorded refs read 'adopt', and run the backfill on the user's go-ahead. — ✕ non-rollbackable

**Backward compat:** Breaking for callers of the three tracker workflows: insrc_workflow_step, insrc_workflow_run and the daemon's workflow.run no longer run tracker.push, tracker.sync or tracker.post; the three names are still accepted as input only to be answered with an error naming the insrc_tracker request to use. Breaking for code that imported autoPushEpicOnHld, autoPushStoryOnLld or autoPushTasksOnPlan (none outside the TUI approve, which the issues design removes). Behaviour changes: the epic item is created on Define approval, not HLD approval; tasks are created whenever the setting is on, without pushTasks; an epic on GitHub with no locally recorded ref is no longer adopted by its old labels; no milestone is created; useMilestones is ignored. The TUI's sync becomes asynchronous. Stored records are compatible: every existing TrackerMeta field keeps its meaning, and old TrackerArtifact files and tracker run logs are left on disk unread. The comment posted when an open question is resolved now obeys the setting and the check, so it is no longer posted when the setting is off.

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
- **[[c10]]** `code` `src/mcp/server.ts` — "workflow: z.enum(WORKFLOW_NAMES)"
- **[[c11]]** `stakeholder` `user, 2026-10-06` — "go with A"
- **[[c12]]** `prior-artifact` `LLD-9a7bbe63297457c2-S001 first review of 2026-10-06 by the daemon: block, 3 MED premises did not hold (epic body loses story links; incomplete removal inventory; retired message unreachable); this revision applies all three, the third as the user decided`
- **[[c13]]** `prior-artifact` `LLD-9a7bbe63297457c2-S001 second review of 2026-10-06 by the daemon: block, 1 HIGH and 5 MED did not hold; the common-part findings were applied to the issues design in place, as the user decided, and this revision points at it`
- **[[c14]]** `code` `src/workflow/questions.ts` — "ghComment(cfg.owner, cfg.repo, trackerRef, summary);"
- **[[c15]]** `prior-artifact` `LLD-9a7bbe63297457c2-S001 third review of 2026-10-06 by the daemon: block, 5 MED did not hold (a stale sentence; the third label; the question-resolution comment; no state read; old comments repeated by the backfill); this revision applies all five`
- **[[c16]]** `code` `src/workflow/resolve-comment.ts` — "{ commit: false }"

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T13:55:33.748Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | Approval of a storyBoundary.addStory amendment is the moment the epic gains a story (section 3.2, AMENDMENT). | appendStoryToDefine (gates.ts:175-186) does preserve approvedAt as the design says, but its only caller is the extend finalize at src/workflow/orchestrator.ts:1325, which appends the story when the extend record is written and files the amendment as pending. The story is therefore in the Define's body.stories before the amendment is approved, and stays there whatever happens to the amendment. The designed behaviour (rewrite the epic body on amendment approval) still produces a correct body; only the stated reason is wrong. Two consequences the design does not spell out: any earlier body rewrite (another story's design or BUILD approval) already shows the new story line, and the close rule counts that story as not done from the extend onward. I did not read the code around orchestrator.ts:1325 beyond the call itself. [files: src/workflow/gates.ts, src/workflow/orchestrator.ts] | Reword the rationale: the story joins the Define at extend time; amendment approval is the first approvable event after it, so the body is rewritten there. Say what happens to the checklist line if the amendment is rejected. |

#### Could not verify (does not block)

_None._
