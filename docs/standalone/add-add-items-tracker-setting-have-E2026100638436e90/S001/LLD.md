<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

One setting, "Add items to tracker", turns tracker pushing on or off for a repo. It is on by default and is shown on the VS Code and JetBrains settings pages. When it is on and the gh tool is installed and signed in, the daemon itself adds or updates the GitHub item each time a workflow item is approved, whichever way the approval was made, and commits and pushes the documents that item refers to. An issue record becomes a GitHub issue, an epic, its stories and its tasks are pushed, a standalone story gets its own issue, and approving a build closes the issue and its tasks. The approval result and the workflow's own messages say what was done or why nothing was, and the model in the session no longer runs gh. A backfill adds the approved items that were never pushed, and closes the finished ones at once.

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

### 2.1 `approveWorkflowTarget`

```typescript
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { enforce?: boolean; tracker?: TrackerStepDeps }): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged: one artifact path or an epic hash, the repo path, and an optional override reason.
- `opts.tracker: TrackerStepDeps` _(optional)_ — Test seam for the tracker step (the setting reader, the gh check and the gh calls). Defaults to the real ones.

**Returns:** `Promise<WorkflowApproveResult>` — As today, plus a new optional field tracker[]: one TrackerOutcome per approved artifact that is a tracker item. TrackerOutcome is ONE new type used on every path: { path, item: 'issue' | 'epic' | 'story' | 'tasks' | 'completion', status: 'created' | 'updated' | 'already-exists' | 'closed' | 'skipped' | 'failed', ref?, reason?, docs?: { committed: boolean; pushed: boolean; reason?: string } }. The existing result types are mapped into it: AutoPushResult's four statuses map one to one; the issue-record function's 'reused' maps to 'already-exists'; its 'created' with reason 'ref-unrecorded' maps to 'failed' and carries the created ref.

**Errors:**
- `none new` when A tracker step that is skipped or fails never fails or undoes the approval; it is reported in tracker[] with its reason.

**Preconditions:**
- Declared in src/workflow/gates.ts. Called by the daemon's 'workflow.approve' handler (src/daemon/index.ts:643), which serves insrc_workflow_approve and the plugins.

**Postconditions:**
- For each artifact it approves, it awaits the tracker step once, AFTER the approval stamp is written, one artifact after another, never in parallel.
- An artifact that was withheld (in skipped[]) gets no tracker step.
- The tracker step is the only place that decides what a given approval adds to, updates on, or closes on the tracker; no caller chooses a push by itself.
- Its callers are unchanged in how they call it: the daemon's 'workflow.approve' handler already awaits it.

### 2.2 `approve`

```typescript
approve(artifactPath: string, withTracker?: boolean, overrideReview?: string): Promise<ApproveOutcome>
```

**Parameters:**
- `withTracker: boolean` _(optional)_ — Unchanged meaning: false suppresses the tracker step for this call.

**Returns:** `Promise<ApproveOutcome>` — CHANGED: it becomes asynchronous, because the tracker step awaits the issue-record functions, which are asynchronous. ApproveOutcome.tracker changes type from AutoPushResult to TrackerOutcome. ApproveOutcome.commit is removed: the commit and push of the documents is now part of the tracker step and is reported in TrackerOutcome.docs.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:156 and typed in the service interface at src/cli/services/index.ts:55. It is synchronous today and has two callers that use its result synchronously: src/cli/command.ts:223 and src/cli/panes/WorkflowsPane.tsx:116.

**Postconditions:**
- Its own switch over the three pushes and its own commitApprovedArtifacts call are replaced by one awaited call to the shared tracker step.
- Both callers are changed to await it: the command in src/cli/command.ts and doApprove in src/cli/panes/WorkflowsPane.tsx, and the interface in src/cli/services/index.ts declares the Promise.
- withTracker false still suppresses the tracker step, including its commit and push.

### 2.3 `autoPushStoryOnLld`

```typescript
autoPushStoryOnLld(lldJsonPath: string): AutoPushResult
```

**Parameters:**
- `lldJsonPath: string` — The approved LLD's json path.

**Returns:** `AutoPushResult` — Unchanged signature and result type. Its behaviour changes only through the config it resolves: a repo with no github.json entry is no longer skipped as disabled. It still serves only a story under an epic; a standalone story is handled by the tracker step itself, so AutoPushResult keeps its four statuses.

**Preconditions:**
- Declared in src/workflow/tracker-auto.ts:165. It reads the parent Define, so it cannot serve a standalone story; the tracker step does not call it for one.

**Postconditions:**
- Called by the tracker step for an LLD that has a parent Define. A second approval of the same LLD creates nothing: the stored ref makes it 'already-exists'.
- The same holds for autoPushEpicOnHld and autoPushTasksOnPlan: same signatures; they push for a repo tracked by default; and autoPushTasksOnPlan no longer skips on pushTasks, because the resolved config always has it true. Its remaining check on pushTasks is removed.
- The gate they share still runs its own sign-in check. The tracker step runs its checks first, so when the step reports 'gh is not installed' or 'gh is not signed in' the push function is never reached.

### 2.4 `createBugfixTrackerIssue`

```typescript
createBugfixTrackerIssue(input: { repoPath: string; issueHash: string }, deps: TrackerCreateDeps): Promise<TrackerIssueResult>
```

**Parameters:**
- `input: { repoPath: string; issueHash: string }` — Unchanged.

**Returns:** `Promise<TrackerIssueResult>` — Unchanged signature and result type. It is now reached: the tracker step awaits it when an issue record is approved, with labels supplied (see the tracker step), where today its default dependencies pass no labels.

**Preconditions:**
- Declared in src/workflow/bugfix/tracker.ts:142. Not reached from any approval today (src/workflow/bugfix/mount.ts).

**Postconditions:**
- Its existing rule holds: a ref already on the issue record's meta.tracker means the GitHub issue exists and none is created.
- New, before any create: the tracker step looks the issue up on GitHub by the record's own label and adopts it when found, so an issue whose ref was lost is never created twice.
- closeBugfixTrackerIssue is awaited by the tracker step when the work item's BUILD record is approved. It is no longer called from the bugfix follow-on in src/workflow/bugfix/mount.ts: the close has one owner.

### 2.5 `resolveGithubConfig`

```typescript
resolveGithubConfig(repoPath: string, configPath?: string): ResolvedGithubConfig
```

**Parameters:**
- `repoPath: string` — Unchanged.

**Returns:** `ResolvedGithubConfig` — CHANGED, and deliberately for every caller: the one setting decides. (1) When the setting for the repo is false it returns type 'none' with a new source, 'setting-off', whatever github.json says. (2) When the setting is true it returns a full GitHub config: the owner and repo from the repo's own github.json entry when it names them, otherwise from the repo's git remote; the labels and issue type names from the repo's entry, then the default entry, then the built-in defaults. (3) When the setting is true and no GitHub target can be found it returns type 'none' with the source 'no-target'. In the config it returns, pushTasks and commitArtifacts are always true: an entry's pushTasks, commitArtifacts and type 'none' are no longer read. The second review showed why the change belongs here and not beside it: the three push functions, the issue-record functions and the tracker workflows all resolve their config through this function, so a separate lookup in the tracker step would be contradicted by them.

**Preconditions:**
- Declared in src/workflow/config/github.ts. It has nine call sites, all of which now follow the one setting: the gate shared by the three push functions (src/workflow/tracker-auto.ts:87); the default dependencies of the issue-record create and close (src/workflow/bugfix/tracker.ts:423 and :447); the tracker.push, tracker.sync and tracker.post workflows (src/workflow/runners/tracker/context.ts:41, :114 and :144); the tracker sync (src/workflow/tracker/sync.ts:36); the question-resolution comment (src/workflow/questions.ts:474); and the TUI's commit of artifacts (src/cli/services/workflow.ts:97), which this design removes.

**Postconditions:**
- The owner and repo still never come from the default entry, only from the repo's own entry or its git remote.
- With the setting on, a repo with a GitHub remote and no github.json entry is tracked on every one of these paths: approvals, explicit tracker.push, sync and post, and question comments. With the setting off, none of them touches GitHub.
- The setting is read through one reader with a module-level test seam, so a test can replace it without passing an option down the call chain.

## 3. Data model changes

### 3.1 `Setting tracker.addItems` — new

ONE flag turns tracker pushing on or off for a repo; nothing else does. A catalog row: path tracker.addItems, type boolean, default true, label "Add items to tracker", in a Tracker group; it is the value for any repo that has none of its own. A repo's own value is stored in the same config file under tracker.byRepo.<repoPath>.addItems, the dynamic-key pattern models.byRepo already uses. One reader returns the value for a repo: the repo's own value when present, otherwise the catalog value, otherwise true. The config file's path is fixed (src/shared/paths.ts has no override), so the reader has a module-level test seam: a test, or the shared test helper, replaces the reader for the duration of a suite, which also reaches code that calls the approval indirectly. The flag replaces three older switches for the tracker step: an entry's type 'none', pushTasks and commitArtifacts in ~/.insrc/github.json are no longer read to decide whether to push. So that nobody who opted out is opted back in, a carry-over runs once at daemon start. It is guarded by a marker key in the config file, tracker.migratedFromGithubJson: when the marker is absent it writes tracker.byRepo.<repoPath>.addItems = false for every repo whose github.json entry says type 'none' AND that has no value of its own yet, writes tracker.addItems = false when the default entry says type 'none' and no value is set, and then writes the marker. When the marker is present it does nothing, so a value the user later turns on is never turned off again. The existing config migrations (src/config/reconcile.ts) only move keys inside the config file and cannot read github.json, so this is a separate step beside them. Settings pages. A catalog row reaches VS Code as a global key (vscode-plugin/src/config/key-map.ts maps every catalog path to 'insrc.' + path), which is the right place for the default. The per-repo value is shown and written in each plugin's per-repo section, whose writers are hard-wired to models.byRepo today: vscode-plugin/src/panels/repo-config.ts:154 and the base path in jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:720. Both are extended to write tracker.byRepo.<repoPath>.addItems for the open project. Each page labels the two plainly: the default for all repos, and this repo's value. The VS Code plugin also declares the setting in its package.json.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/index.ts`
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/key-map.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt`
- `src/config/reconcile.ts`
- `src/workflow/config/github.ts`
- `src/shared/paths.ts`

### 3.2 `Tracker step` — new

One asynchronous function in src/workflow/tracker-auto.ts that takes an approved artifact's json path and returns one TrackerOutcome, or none for a kind that is not tracked. CHECKS, in this order, each returning 'skipped' with its own reason: (1) the setting for the repo is true; (2) a GitHub target is found, by resolveGithubConfig as changed above (the repo's entry when it names an owner and repo, otherwise its git remote); (3) the gh tool is installed; (4) gh is signed in. The target is checked before gh so that a repo with no GitHub remote, which is every temp repo in the test suites, never runs gh. Finding the tool is separate from sign-in so the reason says which is missing; today's one check, ghAuthOk, reports both as one. BY KIND. An ISSUE record creates a GitHub issue (createBugfixTrackerIssue) carrying the label insrc:issue and a label unique to the record, insrc:issue-<first 8 of its hash>; before creating, the step looks that unique label up and adopts the issue when it exists. The lookup used for this must tell 'not found' from 'the lookup failed': today's ghFindIssueByLabels returns undefined for both (src/workflow/tracker/github.ts:215-221), so it gains a variant with a three-way result, and a failed lookup is a 'failed' outcome with NO create. The same rule applies to the standalone story's and the standalone tasks' unique labels. An HLD pushes the epic and its stories (autoPushEpicOnHld). An LLD with a parent Define pushes the story (autoPushStoryOnLld). A standalone LLD: when the work item's issue record (the ISSUE artifact with the same hash) has a tracker ref, a comment linking the design is added to that GitHub issue and the outcome is 'updated'; otherwise one GitHub issue is created for the story from the LLD's title and summary, with the story label and a unique label insrc:story-<first 8 of the hash>-<story id>, and its ref is stored on the LLD's meta.tracker.storyRef. A PLAN with a parent Define pushes its tasks (autoPushTasksOnPlan). A standalone PLAN, which has no Define for that function to read, is handled by the step itself, like the standalone LLD: it creates one task issue per task from the plan's own title, summary and task id, each under the parent taken from the LLD's meta.tracker.storyRef or, when the story only commented on its issue record's GitHub issue, from that issue record's ref; it stores the refs in the plan's meta.tracker.taskRefs. A standalone plan whose story and issue record are not on the tracker is 'skipped' with that reason. A BUILD record closes what the Story opened: the GitHub issue of the work item's issue record (closeBugfixTrackerIssue), else the story issue on the LLD's meta.tracker.storyRef, and each task issue in the plan's meta.tracker.taskRefs; the refs are found from the BUILD record's epicHash and storyId, which name the ISSUE, LLD and PLAN artifacts. DEF, SPEC, CR and EXT give no outcome. DOCUMENTS. After the item is added or updated, the step commits and pushes the documents it refers to, with the existing commitAndPushArtifacts: the approved artifact's json and markdown, and the work item's definition alongside, as the TUI does today. It commits only those paths, on the current branch, and reports the result in TrackerOutcome.docs; a commit or push that fails does not change the item's status. This is the commit the TUI made in commitApprovedArtifacts; that function is removed. ONE CLOSE OWNER. The bugfix follow-on in src/workflow/bugfix/mount.ts no longer closes the issue: its completeBugfixTracker leg and the 'bugfix-complete' entry it put in followOn are removed, and the advance leg stays. TIME. Every gh and git call the step makes gets a timeout of 30 seconds; today they are blocking calls with none (src/workflow/tracker/github.ts:25). A call that passes it is a 'failed' outcome with the reason 'gh timed out'. The calls stay blocking, so the daemon serves no other request while one runs: an issue record is 2 to 3 calls, an epic about 10, typically 1 to 2 seconds each. The backfill yields to the event loop between items so other requests are served between them.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/bugfix/tracker.ts`
- `src/workflow/bugfix/mount.ts`
- `src/workflow/bugfix/advance.ts`
- `src/workflow/gates.ts`
- `src/cli/services/workflow.ts`
- `src/cli/services/index.ts`
- `src/cli/command.ts`
- `src/cli/panes/WorkflowsPane.tsx`
- `src/daemon/index.ts`
- `src/workflow/config/github.ts`
- `src/workflow/runners/tracker/context.ts`
- `src/workflow/tracker/sync.ts`
- `src/workflow/questions.ts`

### 3.3 `What the workflow says about the tracker` — new

Three places. (1) The result of insrc_workflow_approve carries tracker[], and its description says the daemon adds or updates the tracker item and pushes its documents on approval, and that the model must not run gh or commit the artifacts for it. (2) The done response of insrc_workflow_step: its pendingApproval block, built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a tracker line saying what approving this artifact will do: the target it will be added to, or why it will not be (setting off, no GitHub target, gh missing, gh not signed in, or a kind that is not tracked). The line is worked out by the same checks as the tracker step, without changing anything. (3) The steering source src/prompts/steering-block.md and its plugin copy vscode-plugin/assets/steering-block.md: the tracker guide and the bugfix guide say that tracking happens in the daemon at approval, which items are tracked and when, that the one setting and the gh tool control it, that a build approval closes the issue and its tasks, and that the model relays the tracker outcome and never pushes by hand; the tracker.push, tracker.sync and tracker.post workflows remain for an explicit re-push or sync.

**Call sites:**
- `src/mcp/server.ts`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/mcp/workflow-step/types.ts`
- `src/prompts/steering-block.md`
- `vscode-plugin/assets/steering-block.md`
- `src/workflow/gates.ts`

### 3.4 `Backfill of items never pushed` — new

A daemon stream request that takes a repo and a dry-run flag. It lists every approved artifact that is a tracker item and carries no tracker ref (approved issue records, approved HLDs, approved LLDs, approved plans), in an order that creates parents before children, and returns the list when the dry-run flag is set. Without the flag it runs the same tracker step on each, one at a time, yielding to the event loop between items and sending one progress frame per item, and ends with one outcome per item. An item whose BUILD record is already approved is created and then closed at once, so finished work does not show as open. Items not yet approved are not pushed; they are pushed when they are approved. It is safe to run twice: an item that already has a ref, or that is found on GitHub by its unique label, is reported as already there.

**Call sites:**
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`

## 4. Error paths

**Error cases**

- **The gh tool is not installed.** (recoverable)
  - Detection: The tracker step looks for the gh executable before it calls it.
  - Response: The outcome is 'skipped' with the reason 'gh is not installed'. The approval stands.
  - User impact: The approval result and the workflow step's message say the item was not added and why.
- **gh is installed but not signed in.** (recoverable)
  - Detection: The existing sign-in check, gh auth status, exits non-zero.
  - Response: The outcome is 'skipped' with the reason 'gh is not signed in (run gh auth login)'. The approval stands.
  - User impact: The user is told to sign in; the item can be added later by the backfill.
- **The repo has no GitHub remote and no target in the tracker config.** (recoverable)
  - Detection: The step's target lookup finds no owner and repo in the repo's github.json entry and no GitHub remote.
  - Response: The outcome is 'skipped' with that reason, before any gh call. The approval stands.
  - User impact: The user is told no GitHub target could be found for the repo.
- **A gh call fails while creating or updating the item (network, permissions, rate limit, a label or issue type the organisation does not have).** (recoverable)
  - Detection: The gh call exits non-zero, or the push function returns status 'failed'.
  - Response: The outcome is 'failed' with gh's message. Nothing is retried in the same approval. The approval stands, and no tracker ref is written, so a later approval of the same artifact or the backfill tries again.
  - User impact: The approval result says the tracker step failed and why; the item is approved but not on the tracker.
- **The look-up of an item's unique label fails (rate limit, network error, timeout).** (recoverable)
  - Detection: The label lookup returns its 'lookup failed' result, which is distinct from 'not found'.
  - Response: The outcome is 'failed' with the reason, and nothing is created: without a trustworthy answer the step cannot know the item is absent.
  - User impact: The item is not on the tracker yet; the next approval of it or the backfill tries again. No duplicate is possible.
- **A gh or git call hangs (a stalled network, a credential prompt).** (recoverable)
  - Detection: The call passes its 30 second timeout and is stopped.
  - Response: The outcome is 'failed' with the reason 'gh timed out' (or 'git timed out' for the documents). Nothing is retried in the same approval; the approval stands.
  - User impact: The approval returns after at most the timeout for that call; the daemon is not left frozen.
- **The item was added but its documents could not be committed or pushed (not a git work tree, nothing to commit, push rejected or offline).** (recoverable)
  - Detection: commitAndPushArtifacts returns committed false or pushed false with a reason.
  - Response: The item's status is unchanged; TrackerOutcome.docs carries committed, pushed and the reason. A push that failed leaves the commit local.
  - User impact: The result says the documents are not on the remote yet and why; links from the GitHub item resolve once they are pushed.
- **The GitHub issue was created but the ref could not be written back to the artifact.** (recoverable)
  - Detection: For an issue record, createBugfixTrackerIssue returns 'created' with the reason 'ref-unrecorded'; for a story, the write of meta.tracker throws after the create call returned a ref.
  - Response: The outcome is 'failed' and names the created ref. No duplicate follows: the item carries its unique label, and the next approval or the backfill finds it by that label and adopts it, writing the ref then.
  - User impact: The user sees the ref and that it was not recorded; the next run repairs it.
- **The tracker step throws unexpectedly.** (recoverable)
  - Detection: approveWorkflowTarget wraps each artifact's tracker step in a try and catch.
  - Response: The outcome is 'failed' with the error's message. The approval of that artifact and of the rest of a batch continues.
  - User impact: One failed line in the result; nothing else is affected.
- **The backfill stops part of the way through (a gh failure, or the daemon is stopped).** (recoverable)
  - Detection: The backfill request returns the outcomes gathered so far, or the connection ends.
  - Response: Items already created keep their refs. Running the backfill again skips them and continues with the rest.
  - User impact: A partial result; a second run finishes the job without duplicates.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every tracker step is 'skipped' with the reason that the setting is off, and no gh or git call is made. The explicit tracker workflows, the sync and question comments are off for the repo too. |
| A repo whose github.json entry says type 'none', after the one-time step at daemon start. | The carry-over wrote its setting as false, once, so nothing touches GitHub for it. If the user turns the setting on later it is tracked, using its git remote, and a daemon restart does not turn it off again. |
| A repo with no entry in github.json and a GitHub remote. | Tracked by default on every path: resolveGithubConfig now returns a GitHub config for it from the git remote with the default labels, so approvals, the explicit tracker workflows, the sync and question comments all work for it. |
| An artifact whose item is already on the tracker is approved again. | 'already-exists' with its ref; nothing is created. |
| An LLD under an epic whose HLD was never pushed. | 'skipped' with the existing reason that the epic is not on the tracker yet; the backfill creates the epic first and then the story. |
| A standalone story whose work item has an issue record that is already on the tracker. | No second issue is created; the design is linked on the existing GitHub issue and the outcome is 'updated'. |
| A plan is approved and the tracker config has pushTasks false. | The tasks are pushed: with the setting on, every item is tracked. pushTasks no longer decides. |
| A batch approval of several artifacts under one epic. | One tracker outcome per approved artifact, run one after another in the order they were approved; withheld artifacts have none. |
| A DEF, SPEC, CR or EXT artifact is approved. | No tracker outcome: these kinds are not tracker items. |
| The backfill meets a finished work item (its BUILD record is approved). | Its GitHub issue is created and closed at once, with its tasks, so it does not appear as open work. |
| The backfill is run with the dry-run flag. | It returns the list of items it would add, in order, and makes no gh call that changes anything. |
| An issue record that is not yet approved. | Not pushed by the approval step or the backfill; it is pushed when it is approved. |
| A BUILD record is approved for a Story whose issue, story or tasks were never pushed. | 'skipped' with the reason that there is nothing on the tracker to close; the backfill creates and closes it. |
| The TUI approves with withTracker false. | No tracker step and no commit or push of the documents. |
| The working tree holds other uncommitted files when an item is approved. | Only the approved artifact's files and its definition are added and committed; the other files are left as they are. |
| A standalone plan is approved. | Its task issues are created by the step under the story's issue, or under the issue record's issue, and their refs are stored on the plan; approving the build later closes them. |

**Invariants to preserve**

- An approval is never failed or undone by the tracker: the stamp is written first and the tracker step only reports. The approval's response waits for the step, which is bounded by the timeout on each call. [[c1]]
- The GitHub owner and repo never come from the default entry of the tracker config; only from the repo's own entry or its git remote. [[c2]]
- A stored tracker ref means the item exists: no push function creates a second item for an artifact that already carries a ref. [[c2]]
- The other-party review rule and the code-review gate decide whether an artifact is approved before any tracker step runs; a withheld artifact is never pushed. [[c1]]
- gh is never run by a test and never by the model in the session; tracker functions take their gh calls as injected dependencies. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]
- With the setting off for a repo, no code path touches GitHub or commits artifacts for it; with it on, every path that resolves the tracker config agrees on the same target and labels. [[c2]]
- A work item's GitHub issue is closed by one piece of code only. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, and is shown on the VS Code and JetBrains settings pages`, `ac2: with the setting on and gh installed and signed in, approving an item adds or updates it on the tracker and pushes its documents, on every approval path, done by the daemon`, `ac3: an approved issue record creates a GitHub issue; a standalone story gets one; epic, story and tasks are pushed; approving a BUILD record closes the issue and its tasks`, `ac4: a tracker step that is skipped or fails never fails the approval and always says why`, `ac5: the approval result, the workflow step's done message and the steering say what the tracker did or will do, and tell the model not to run gh`, `ac6: a backfill adds the approved items that were never pushed, in parent-first order, safely repeatable, with a dry run`
- **unit** — The setting and the checks that gate the tracker step.
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true; the row count in the catalog contract test is updated`, `T3 with the setting false the step is skipped and makes no gh or git call at all`, `T4 the checks run in the order setting, target, gh installed, gh signed in, each 'skipped' with its own reason; a repo with no GitHub target never reaches a gh call`, `T5 resolveGithubConfig: setting false gives 'none' with source 'setting-off' whatever github.json says; setting true with an entry naming owner and repo uses it; setting true with no entry uses the git remote and the default labels; setting true with no target gives 'none' with source 'no-target'; pushTasks and commitArtifacts are always true in the result; the owner and repo never come from the default entry`, `T25 the carry-over from github.json: with no marker it writes false only for repos with type 'none' and no value of their own, then writes the marker; a user who then sets true keeps true across a daemon restart; with the marker present it writes nothing`, `T30 each of the other callers follows the setting: with it off the tracker workflows refuse, the sync is skipped and no question comment is posted; with it on and no github.json entry they resolve the git remote`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG; the setting reader's module-level seam; a temp config object for the carry-over`
- **unit** — What the tracker step does for each kind of artifact, with gh faked.
  - Subjects: `T6 an approved ISSUE creates one GitHub issue with the insrc:issue label and its unique label, and stores its ref; approving again gives 'already-exists'; 'reused' maps to 'already-exists'`, `T7 an HLD, an LLD under an epic and a PLAN under an epic each call the existing push and return its result as a TrackerOutcome, for a repo with no github.json entry; the PLAN pushes its tasks whatever pushTasks says`, `T8 a standalone LLD with no issue record creates one story issue with its unique label and stores the ref; with an issue record already on the tracker it comments there and creates nothing`, `T9 an approved BUILD record closes the work item's issue (or the story issue) and each task issue; with nothing on the tracker it is 'skipped'`, `T10 a DEF, SPEC, CR and EXT give no outcome`, `T11 a gh failure gives 'failed' with the message and writes no ref; 'created' with 'ref-unrecorded' gives 'failed' naming the ref; the next run finds the item by its unique label and adopts it without creating a second one`, `T26 a gh call and a git call that pass the timeout each give 'failed' with 'timed out', and the step returns`, `T27 after the item is added the step commits and pushes only the artifact's files and its definition, and reports docs; a failed push leaves the item's status unchanged; other uncommitted files are not committed`, `T31 a standalone PLAN creates one task issue per task under the story's issue, or under the issue record's issue, with unique labels, and stores the refs; with neither on the tracker it is 'skipped'`, `T32 a label lookup that fails gives 'failed' and creates nothing; a lookup that finds nothing creates; a lookup that finds the item adopts it`
  - Fixtures: `injected gh functions that record their calls`
- **integration** — Every approval path runs the same step.
  - Subjects: `T12 approveWorkflowTarget returns tracker[] with one outcome per approved tracker item, in order, and none for a withheld artifact`, `T13 a tracker step that throws or fails leaves the artifact approved and the rest of a batch approved`, `T14 the daemon's workflow.approve result carries tracker[] through to insrc_workflow_approve`, `T15 the TUI approve service, now asynchronous, produces the same outcome as approveWorkflowTarget for an ISSUE and for a standalone LLD; withTracker false suppresses the step and the commit; the command and the Workflows pane await it`, `T28 the bugfix follow-on no longer closes the issue: a completed bugfix BUILD is closed once, by the tracker step, and followOn has no 'bugfix-complete' entry`, `T29 the existing suites that call approveWorkflowTarget or the TUI approve service on temp repos make no gh call and read no real config: src/workflow/__tests__/approve-workflow-target.test.ts, approve-codereview-gate.test.ts, approve-build-completion.test.ts, approve-build-record-completion.test.ts, other-party-review-gate.test.ts, bugfix-orchestration.test.ts, src/mcp/build-step/__tests__/build-start.test.ts and build-step.test.ts, and src/workflow/runners/build/__tests__/build-record.test.ts each run under the shared helper, which installs a recording gh fake (the existing _setTrackerExecForTests in src/workflow/tracker/github.ts) and replaces the setting reader through its module-level seam, and assert the fake was never called`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper that installs a recording gh fake through the existing injectable exec in src/workflow/tracker/github.ts and replaces the setting reader through its module-level seam`
- **unit** — What the workflow says.
  - Subjects: `T16 the pendingApproval block of insrc_workflow_step's done response says what approval will do in the tracker, or why it will not, for each skip reason, and working it out makes no gh call that changes anything`, `T17 the steering tracker and bugfix guides and the insrc_workflow_approve description say the daemon tracks at approval, list what is tracked, and tell the model not to run gh; the plugin copy of the steering source is identical to the source`
- **integration** — The backfill, with gh faked.
  - Subjects: `T18 the dry run lists approved untracked items parent first and changes nothing`, `T19 a run creates each item once; a second run reports them as already there; an item whose BUILD record is approved is created and closed at once with its tasks; unapproved items are not listed; it yields between items`, `T20 a failure part of the way through keeps the refs already written and a second run continues`
  - Fixtures: `a temp repo with a mix of approved, unapproved, tracked and finished artifacts`
- **unit** — The plugins.
  - Subjects: `T21 VS Code: package.json declares the setting; the global key maps to the catalog row; the per-repo section writes tracker.byRepo.<repoPath>.addItems for the open workspace folder and shows the repo's value`, `T22 JetBrains: the settings page shows the default row, and its per-repo section writes tracker.byRepo.<repoPath>.addItems for the open project`
- **live** — One real run against GitHub, after the build, done by hand and recorded in the build record.
  - Subjects: `T23 approving a real issue record in this repo creates a GitHub issue in insors-ai/insrc and stores its ref`, `T24 the backfill's dry run on this repo is shown to the user before the real run`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T25`, `T21`, `T22` |
| `ac2` | `T3`, `T4`, `T5`, `T12`, `T14`, `T15`, `T27`, `T29`, `T30` |
| `ac3` | `T6`, `T7`, `T8`, `T9`, `T10`, `T28`, `T23`, `T31` |
| `ac4` | `T4`, `T11`, `T13`, `T26`, `T32` |
| `ac5` | `T16`, `T17` |
| `ac6` | `T18`, `T19`, `T20`, `T24` |

## 6. Migration

**State before:** Only the TUI approve service pushes to GitHub, and only for an HLD, an LLD under an epic and a plan. The in-chat approval and the plugins go through approveWorkflowTarget, which pushes nothing. An approved issue record never creates a GitHub issue and a standalone story cannot be pushed. A repo is tracked only when ~/.insrc/github.json has an entry for it or a default entry. No setting turns tracking on or off, and the steering tells the model to push an epic itself without saying when.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off. With it on and gh installed and signed in, one tracker step runs inside the approval on every path: it adds or updates issue records, epics, stories, standalone stories and tasks, closes them when the build is approved, and commits and pushes their documents. A repo with a GitHub remote is tracked without any entry in github.json, on every path, because the shared config lookup follows the setting. The approval result and the workflow's messages report the outcome, the steering tells the model the daemon does it, and a backfill has added the approved items that were never pushed and closed the finished ones.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row, its per-repo reader with its test seam, and the guarded carry-over at daemon start that writes the setting false, once, for repos whose github.json entry says type 'none'. Nothing else reads the setting yet. — ↩ rollbackable
2. Add a timeout to the tracker's gh and git calls, the label lookup that tells 'not found' from 'lookup failed', and the shared test helper (recording gh fake plus the setting reader's seam). Put the existing approval and tracker suites on the helper. — ↩ rollbackable
3. Make resolveGithubConfig follow the setting (off gives 'none'; on gives the entry's target or the git remote, with default labels, and pushTasks and commitArtifacts always true) and remove the pushTasks check from autoPushTasksOnPlan. From this step a repo with a GitHub remote is tracked by default on every path that resolves the config. — ↩ rollbackable
4. Add the tracker step: its checks in the order setting, target, gh installed, gh signed in; its handling of each kind, including the standalone story and the standalone plan, with the unique labels and the look-up-before-create; the close on a BUILD record; and the commit and push of the documents. Nothing calls it yet. — ↩ rollbackable
5. Call the tracker step from approveWorkflowTarget and return tracker[]; carry it through the daemon request and insrc_workflow_approve. — ↩ rollbackable
6. Make the TUI approve service asynchronous and replace its switch and its commit with the tracker step; change its interface and its two callers to await it. — ↩ rollbackable
7. Remove the close leg and its followOn entry from the bugfix follow-on, so the tracker step is the one owner of the close. — ↩ rollbackable
8. Add the tracker line to the pendingApproval block of insrc_workflow_step, and rewrite the tracker and bugfix guides in the steering source and the insrc_workflow_approve description; refresh the plugin copy of the steering source. — ↩ rollbackable
9. Show the setting on the VS Code and JetBrains settings pages: the default row from the catalog and the repo's own value in the per-repo section. — ↩ rollbackable
10. Add the backfill stream request with its dry run. — ↩ rollbackable
11. After the daemon is updated: run the backfill's dry run on this repo, show the list to the user, and on their go-ahead run it. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the dry-run list`)_

**Backward compat:** approveWorkflowTarget gains an optional field in its result and an optional test seam; its existing fields and decisions are unchanged. The three push functions and the issue-record functions keep their signatures. Artifacts already on the tracker keep their refs and are never pushed again. Five things change for existing users. (1) resolveGithubConfig follows the one setting, for all nine of its call sites: a repo with a GitHub remote and no tracker config starts being tracked, and with the setting off nothing touches GitHub for the repo. (2) pushTasks, commitArtifacts and type 'none' in github.json are no longer read; tasks are always pushed when the setting is on; repos that had type 'none' are given the setting false once, guarded by a marker, so they stay off until the user turns them on. (3) An in-chat approval now commits and pushes the approved documents, as the TUI already did. (4) The TUI approve service becomes asynchronous, its result's tracker field changes type and its commit field goes; its interface and two callers change with it. (5) The bugfix follow-on no longer reports 'bugfix-complete' in followOn; the close is reported in tracker[].

## 7. Alternatives considered

### 7.1 a1: Catalog setting with a per-repo override, one tracker step inside the approval — **CHOSEN**

A catalog row gives the default; a per-repo key overrides it; approveWorkflowTarget runs one tracker function for every artifact it approves.

Add a catalog row tracker.addItems (boolean, default true) and a per-repo value stored under tracker.byRepo.<repoPath>.addItems in the same config file, read by one reader. Add one asynchronous function that, given an approved artifact, decides what to add, update or close in the tracker (issue record, epic, story, standalone story, tasks, completion), pushes the documents it refers to, and returns an outcome. approveWorkflowTarget awaits it for each approved artifact and returns the outcomes in a new tracker[] field; the TUI approve service awaits the same function in place of its own switch and its own commit. The plugins show the default row from the catalog and write the per-repo value for the open project.

### 7.2 a2: Per-repo flag in the tracker config file, new IPC for the plugins

Store addItems on the repo's entry in github.json beside the other tracker settings and give the plugins a dedicated get and set request.

Add an addItems field to GithubEntry and to the default entry in ~/.insrc/github.json, read by resolveGithubConfig. Add two daemon requests, one to read and one to write the flag for a repo, and a dedicated row on each plugin's settings page that uses them. The push logic is the same single function as in a1.

**Rejected because:** Meets the requirements but needs a second settings mechanism (two new requests and bespoke rows in both plugins) for one boolean.

### 7.3 a3: Push from the daemon's approve handler only

Keep the approval function free of side effects and run the tracker step in the daemon's workflow.approve handler, beside the bugfix follow-on.

The setting is stored as in a1. The tracker function is called from the 'workflow.approve' handler in the daemon after approveWorkflowTarget returns, and its outcomes are added to the result there. The TUI approve service keeps its own push.

**Rejected because:** Leaves two callers holding the push. That split is why in-chat approvals stopped pushing; keeping it invites the same defect.

## 8. References

- **[[c1]]** `code` `src/workflow/gates.ts` — "approved.push({ path: jsonPath, result: approveArtifactByJsonPath(jsonPath, approveOpts) });"
- **[[c2]]** `code` `src/workflow/config/github.ts` — "return { type: 'none', source: 'default-config' };"
- **[[c3]]** `code` `src/workflow/tracker-auto.ts` — "export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {"
- **[[c4]]** `code` `src/config/config-catalog.ts` — "{ path: 'designReview.premises.issue',      type: 'number', default: 8,"
- **[[c5]]** `code` `src/workflow/bugfix/mount.ts` — "Wiring the tracker create leg + the build→issue linkage is a tracked follow-up."
- **[[c6]]** `code` `src/workflow/tracker/github.ts` — "export function ghAuthOk(): { readonly ok: true } | { readonly ok: false; readonly reason: string } {"
- **[[c7]]** `code` `src/cli/services/workflow.ts` — "if (approval.workflow === 'design.epic')       tracker = autoPushEpicOnHld(approval.path);"
- **[[c8]]** `stakeholder` `user, 2026-10-06` — "1. daemon run it. 2. An issue record creates a GitHub issue when it is approved. 3. yes, backfill the issues/stories"
- **[[c9]]** `stakeholder` `user, 2026-10-06` — "there should be a settings at the repo level, "Add items to tracker", If tracker utils are detected on the system, currently only "gh" and this flag == true then all items created should be logged to "
- **[[c10]]** `stakeholder` `user, 2026-10-06` — "Add items to tracker <- only one flag, tracker push on/off (default=on). Should the daemon do the same on an in-chat approval? <- yes, the tracker add/update should push referenced docs also. Issue/Ta"
- **[[c11]]** `code` `src/workflow/tracker/github.ts` — "export function commitAndPushArtifacts(repoPath: string, paths: readonly string[], message: string): CommitArtifactsResult {"
- **[[c12]]** `prior-artifact` `LLD-38436e90625a83a2-S001 review of 2026-10-06 by the daemon: block, 8 premises did not hold; this revision answers each`
- **[[c13]]** `prior-artifact` `LLD-38436e90625a83a2-S001 second review of 2026-10-06 by the daemon: block, 6 premises did not hold; this revision answers each`
- **[[c14]]** `code` `src/workflow/tracker-auto.ts` — "try { define = readDefineArtifact(repoPath, epicHash); }"
