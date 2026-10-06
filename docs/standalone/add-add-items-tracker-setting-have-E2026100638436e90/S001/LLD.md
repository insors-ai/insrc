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

**Returns:** `AutoPushResult` — Unchanged, for a story under an epic. It is NOT given the standalone case: a standalone story is handled by the tracker step itself, so AutoPushResult keeps its four statuses.

**Preconditions:**
- Declared in src/workflow/tracker-auto.ts:165. It reads the parent Define, so it cannot serve a standalone story; the tracker step does not call it for one.

**Postconditions:**
- Called by the tracker step for an LLD that has a parent Define. A second approval of the same LLD creates nothing: the stored ref makes it 'already-exists'.

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

**Returns:** `ResolvedGithubConfig` — UNCHANGED, including its implicit default of type 'none' when github.json has no entry. The first draft of this design changed that default; it is withdrawn, because this function has three other callers that would change behaviour with it: the TUI's commit of artifacts (src/cli/services/workflow.ts:97), the question-resolution comment (src/workflow/questions.ts:474) and the tracker sync (src/workflow/tracker/sync.ts:36). The default-on behaviour lives in the tracker step's own target lookup instead.

**Preconditions:**
- Declared in src/workflow/config/github.ts. Its callers outside the tracker step are src/cli/services/workflow.ts:97, src/workflow/questions.ts:474 and src/workflow/tracker/sync.ts:36; none of them changes.

**Postconditions:**
- The owner and repo still never come from the default entry, only from the repo's own entry or its git remote.
- The tracker step reads this function for the target and the label names only. It does not read the entry's type, pushTasks or commitArtifacts to decide whether to push: the one setting decides.

## 3. Data model changes

### 3.1 `Setting tracker.addItems` — new

ONE flag turns tracker pushing on or off for a repo; nothing else does. A catalog row: path tracker.addItems, type boolean, default true, label "Add items to tracker", in a Tracker group; it is the value for any repo that has none of its own. A repo's own value is stored in the same config file under tracker.byRepo.<repoPath>.addItems, the dynamic-key pattern models.byRepo already uses. One reader returns the value for a repo: the repo's own value when present, otherwise the catalog value, otherwise true. The reader takes the config file's path as a parameter (defaulting to the real one) so a test can point it at a temp file. The flag replaces three older switches for the tracker step: an entry's type 'none', pushTasks and commitArtifacts in ~/.insrc/github.json are no longer read to decide whether to push. So that nobody who opted out is opted back in, a one-time step at daemon start writes tracker.byRepo.<repoPath>.addItems = false for every repo whose github.json entry says type 'none', and writes the catalog value false when the default entry says type 'none'. Settings pages. A catalog row reaches VS Code as a global key (vscode-plugin/src/config/key-map.ts maps every catalog path to 'insrc.' + path), which is the right place for the default. The per-repo value is shown and written in each plugin's per-repo section, whose writers are hard-wired to models.byRepo today: vscode-plugin/src/panels/repo-config.ts:154 and the base path in jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:720. Both are extended to write tracker.byRepo.<repoPath>.addItems for the open project. Each page labels the two plainly: the default for all repos, and this repo's value. The VS Code plugin also declares the setting in its package.json.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/index.ts`
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/key-map.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt`

### 3.2 `Tracker step` — new

One asynchronous function in src/workflow/tracker-auto.ts that takes an approved artifact's json path and returns one TrackerOutcome, or none for a kind that is not tracked. CHECKS, in this order, each returning 'skipped' with its own reason: (1) the setting for the repo is true; (2) a GitHub target is found: the repo's entry in github.json when it names an owner and repo, otherwise the repo's git remote; (3) the gh tool is installed; (4) gh is signed in. The target is checked before gh so that a repo with no GitHub remote, which is every temp repo in the test suites, never runs gh. Finding the tool is separate from sign-in so the reason says which is missing; today's one check, ghAuthOk, reports both as one. BY KIND. An ISSUE record creates a GitHub issue (createBugfixTrackerIssue) carrying the label insrc:issue and a label unique to the record, insrc:issue-<first 8 of its hash>; before creating, the step looks that unique label up (ghFindIssueByLabels) and adopts the issue when it exists. An HLD pushes the epic and its stories (autoPushEpicOnHld). An LLD with a parent Define pushes the story (autoPushStoryOnLld). A standalone LLD: when the work item's issue record (the ISSUE artifact with the same hash) has a tracker ref, a comment linking the design is added to that GitHub issue and the outcome is 'updated'; otherwise one GitHub issue is created for the story from the LLD's title and summary, with the story label and a unique label insrc:story-<first 8 of the hash>-<story id>, and its ref is stored on the LLD's meta.tracker.storyRef. A PLAN pushes its tasks (autoPushTasksOnPlan) whenever the setting is on; pushTasks no longer gates it. A BUILD record closes what the Story opened: the GitHub issue of the work item's issue record (closeBugfixTrackerIssue), else the story issue on the LLD's meta.tracker.storyRef, and each task issue in the plan's meta.tracker.taskRefs; the refs are found from the BUILD record's epicHash and storyId, which name the ISSUE, LLD and PLAN artifacts. DEF, SPEC, CR and EXT give no outcome. DOCUMENTS. After the item is added or updated, the step commits and pushes the documents it refers to, with the existing commitAndPushArtifacts: the approved artifact's json and markdown, and the work item's definition alongside, as the TUI does today. It commits only those paths, on the current branch, and reports the result in TrackerOutcome.docs; a commit or push that fails does not change the item's status. This is the commit the TUI made in commitApprovedArtifacts; that function is removed. ONE CLOSE OWNER. The bugfix follow-on in src/workflow/bugfix/mount.ts no longer closes the issue: its completeBugfixTracker leg and the 'bugfix-complete' entry it put in followOn are removed, and the advance leg stays. TIME. Every gh and git call the step makes gets a timeout of 30 seconds; today they are blocking calls with none (src/workflow/tracker/github.ts:25). A call that passes it is a 'failed' outcome with the reason 'gh timed out'. The calls stay blocking, so the daemon serves no other request while one runs: an issue record is 2 to 3 calls, an epic about 10, typically 1 to 2 seconds each. The backfill yields to the event loop between items so other requests are served between them.

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
| The setting is false for the repo. | Every tracker step is 'skipped' with the reason that the setting is off; no gh call is made, not even the sign-in check. |
| A repo whose github.json entry says type 'none', after the one-time step at daemon start. | Its setting was written as false, so every tracker step is skipped. Turning the setting on later tracks the repo, using its git remote: the one flag decides. |
| A repo with no entry in github.json and a GitHub remote. | Tracked by default: the step's own lookup takes the target from the git remote and the default labels. resolveGithubConfig still returns 'none' for it, so the three other callers behave as before. |
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

**Invariants to preserve**

- An approval is never failed or undone by the tracker: the stamp is written first and the tracker step only reports. The approval's response waits for the step, which is bounded by the timeout on each call. [[c1]]
- The GitHub owner and repo never come from the default entry of the tracker config; only from the repo's own entry or its git remote. [[c2]]
- A stored tracker ref means the item exists: no push function creates a second item for an artifact that already carries a ref. [[c2]]
- The other-party review rule and the code-review gate decide whether an artifact is approved before any tracker step runs; a withheld artifact is never pushed. [[c1]]
- gh is never run by a test and never by the model in the session; tracker functions take their gh calls as injected dependencies. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]
- resolveGithubConfig and its three callers outside the tracker step behave exactly as before. [[c2]]
- A work item's GitHub issue is closed by one piece of code only. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, and is shown on the VS Code and JetBrains settings pages`, `ac2: with the setting on and gh installed and signed in, approving an item adds or updates it on the tracker and pushes its documents, on every approval path, done by the daemon`, `ac3: an approved issue record creates a GitHub issue; a standalone story gets one; epic, story and tasks are pushed; approving a BUILD record closes the issue and its tasks`, `ac4: a tracker step that is skipped or fails never fails the approval and always says why`, `ac5: the approval result, the workflow step's done message and the steering say what the tracker did or will do, and tell the model not to run gh`, `ac6: a backfill adds the approved items that were never pushed, in parent-first order, safely repeatable, with a dry run`
- **unit** — The setting and the checks that gate the tracker step.
  - Subjects: `T1 the setting reader, pointed at a temp config file: the repo's own value wins, then the catalog value, then true`, `T2 the catalog has the tracker.addItems row, boolean, default true; the row count in the catalog contract test is updated`, `T3 with the setting false the step is skipped and makes no gh or git call at all`, `T4 the checks run in the order setting, target, gh installed, gh signed in, each 'skipped' with its own reason; a repo with no GitHub target never reaches a gh call`, `T5 the step's target lookup: the repo's github.json entry when it names owner and repo, otherwise the git remote; resolveGithubConfig itself is unchanged and still returns 'none' with no entry; pushTasks, commitArtifacts and type 'none' are not read by the step`, `T25 the one-time step at daemon start writes the setting false for each repo whose github.json entry says type 'none', and changes nothing on a second run`
  - Fixtures: `a temp config file and a temp github.json through INSRC_GITHUB_CONFIG`
- **unit** — What the tracker step does for each kind of artifact, with gh faked.
  - Subjects: `T6 an approved ISSUE creates one GitHub issue with the insrc:issue label and its unique label, and stores its ref; approving again gives 'already-exists'; 'reused' maps to 'already-exists'`, `T7 an HLD, an LLD under an epic and a PLAN each call the existing push and return its result as a TrackerOutcome; a PLAN pushes its tasks with pushTasks false`, `T8 a standalone LLD with no issue record creates one story issue with its unique label and stores the ref; with an issue record already on the tracker it comments there and creates nothing`, `T9 an approved BUILD record closes the work item's issue (or the story issue) and each task issue; with nothing on the tracker it is 'skipped'`, `T10 a DEF, SPEC, CR and EXT give no outcome`, `T11 a gh failure gives 'failed' with the message and writes no ref; 'created' with 'ref-unrecorded' gives 'failed' naming the ref; the next run finds the item by its unique label and adopts it without creating a second one`, `T26 a gh call and a git call that pass the timeout each give 'failed' with 'timed out', and the step returns`, `T27 after the item is added the step commits and pushes only the artifact's files and its definition, and reports docs; a failed push leaves the item's status unchanged; other uncommitted files are not committed`
  - Fixtures: `injected gh functions that record their calls`
- **integration** — Every approval path runs the same step.
  - Subjects: `T12 approveWorkflowTarget returns tracker[] with one outcome per approved tracker item, in order, and none for a withheld artifact`, `T13 a tracker step that throws or fails leaves the artifact approved and the rest of a batch approved`, `T14 the daemon's workflow.approve result carries tracker[] through to insrc_workflow_approve`, `T15 the TUI approve service, now asynchronous, produces the same outcome as approveWorkflowTarget for an ISSUE and for a standalone LLD; withTracker false suppresses the step and the commit; the command and the Workflows pane await it`, `T28 the bugfix follow-on no longer closes the issue: a completed bugfix BUILD is closed once, by the tracker step, and followOn has no 'bugfix-complete' entry`, `T29 the existing suites that call approveWorkflowTarget or the TUI approve service on temp repos make no gh call and read no real config: src/workflow/__tests__/approve-workflow-target.test.ts, approve-codereview-gate.test.ts, approve-build-completion.test.ts, approve-build-record-completion.test.ts, other-party-review-gate.test.ts, bugfix-orchestration.test.ts, src/mcp/build-step/__tests__/build-start.test.ts and build-step.test.ts, and src/workflow/runners/build/__tests__/build-record.test.ts each run with a recording gh fake and a temp config path, and assert the fake was never called`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper that installs a recording gh fake (the existing injectable exec in src/workflow/tracker/github.ts) and a temp config path`
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
| `ac2` | `T3`, `T4`, `T5`, `T12`, `T14`, `T15`, `T27`, `T29` |
| `ac3` | `T6`, `T7`, `T8`, `T9`, `T10`, `T28`, `T23` |
| `ac4` | `T4`, `T11`, `T13`, `T26` |
| `ac5` | `T16`, `T17` |
| `ac6` | `T18`, `T19`, `T20`, `T24` |

## 6. Migration

**State before:** Only the TUI approve service pushes to GitHub, and only for an HLD, an LLD under an epic and a plan. The in-chat approval and the plugins go through approveWorkflowTarget, which pushes nothing. An approved issue record never creates a GitHub issue and a standalone story cannot be pushed. A repo is tracked only when ~/.insrc/github.json has an entry for it or a default entry. No setting turns tracking on or off, and the steering tells the model to push an epic itself without saying when.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off. With it on and gh installed and signed in, one tracker step runs inside the approval on every path: it adds or updates issue records, epics, stories, standalone stories and tasks, closes them when the build is approved, and commits and pushes their documents. A repo with a GitHub remote is tracked without any entry in github.json; resolveGithubConfig and its other callers are unchanged. The approval result and the workflow's messages report the outcome, the steering tells the model the daemon does it, and a backfill has added the approved items that were never pushed and closed the finished ones.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row, its per-repo reader, and the one-time step at daemon start that writes the setting false for repos whose github.json entry says type 'none'. Nothing else reads the setting yet. — ↩ rollbackable
2. Add a timeout to the tracker's gh and git calls, and the shared test helper that installs a recording gh fake and a temp config path. — ↩ rollbackable
3. Add the tracker step: its checks in the order setting, target, gh installed, gh signed in; its handling of each kind, with the unique labels and the look-up-before-create; the close on a BUILD record; and the commit and push of the documents. Nothing calls it yet. — ↩ rollbackable
4. Call the tracker step from approveWorkflowTarget and return tracker[]; carry it through the daemon request and insrc_workflow_approve. In the same step, give the existing approval suites the shared helper so they make no gh call. — ↩ rollbackable
5. Make the TUI approve service asynchronous and replace its switch and its commit with the tracker step; change its interface and its two callers to await it. — ↩ rollbackable
6. Remove the close leg and its followOn entry from the bugfix follow-on, so the tracker step is the one owner of the close. — ↩ rollbackable
7. Add the tracker line to the pendingApproval block of insrc_workflow_step, and rewrite the tracker and bugfix guides in the steering source and the insrc_workflow_approve description; refresh the plugin copy of the steering source. — ↩ rollbackable
8. Show the setting on the VS Code and JetBrains settings pages: the default row from the catalog and the repo's own value in the per-repo section. — ↩ rollbackable
9. Add the backfill stream request with its dry run. — ↩ rollbackable
10. After the daemon is updated: run the backfill's dry run on this repo, show the list to the user, and on their go-ahead run it. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the dry-run list`)_

**Backward compat:** approveWorkflowTarget gains an optional field in its result and an optional test seam; its existing fields and decisions are unchanged. resolveGithubConfig and the three push functions keep their signatures and behaviour. Artifacts already on the tracker keep their refs and are never pushed again. Four things change for existing users. (1) The TUI approve service becomes asynchronous and its result's tracker field changes type and its commit field goes; its interface and two callers change with it. (2) A repo with a GitHub remote and no tracker config starts being tracked, and an in-chat approval now commits and pushes the approved documents, as the TUI already did; turning the setting off for the repo restores the old behaviour. (3) pushTasks, commitArtifacts and type 'none' in github.json no longer decide whether the tracker step pushes; repos that had type 'none' are given the setting false once, so they stay off. (4) The bugfix follow-on no longer reports 'bugfix-complete' in followOn; the close is reported in tracker[].

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
