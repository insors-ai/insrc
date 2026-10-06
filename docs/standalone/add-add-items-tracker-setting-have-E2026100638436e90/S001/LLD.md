<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

One setting, "Add items to tracker", on by default, turns tracker pushing on or off for a repo and is shown on the VS Code and JetBrains settings pages. When an issue record, a standalone story or its plan is approved, the daemon checks two things: the setting is on, and a supported tracker is set up for the project (today GitHub, named in the config or inferred from the project's remote, with the gh tool installed and signed in). If both hold, the daemon calls its tracker tool for that type, which commits and pushes the approved documents, creates or updates the item, and returns its reference; approving the build closes the item. Every approval surface goes through the daemon: the chat session, both plugin panels, and now the TUI, which keeps no approval, push or commit logic of its own. The approval result says what was done or why nothing was. Epics, their stories and their tasks are a separate work item; until it lands they are pushed only by the explicit tracker.push workflow.

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
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { enforce?: boolean }): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged: one artifact path or an epic hash, the repo path, and an optional override reason.

**Returns:** `Promise<WorkflowApproveResult>` — Unchanged in what it decides and returns. WorkflowApproveResult gains one optional field, tracker[], which this function does NOT fill: the tracker flow fills it afterwards (see the data model), because the flow must run after the bugfix follow-on has stamped an issue record's parent, and that follow-on runs after this function returns.

**Errors:**
- `none new` when No new error. The tracker flow can never fail or undo an approval, because it runs after the approval is complete.

**Preconditions:**
- Declared in src/workflow/gates.ts. Called by the daemon's 'workflow.approve' handler (src/daemon/index.ts:643), which serves insrc_workflow_approve and both plugins' review panels.

**Postconditions:**
- It runs no gh or git command of the tracker flow.
- FollowOnOutcome (src/workflow/gates.ts:756) gains an optional nextCall field, so the routed next step of a bugfix reaches the caller, and loses its 'bugfix-complete' kind, which nothing produces; see the data model.

### 2.2 `approve`

```typescript
approve(artifactPath: string, withTracker?: boolean, overrideReview?: string): Promise<ApproveOutcome>
```

**Parameters:**
- `withTracker: boolean` _(optional)_ — false asks the daemon to skip the tracker flow for this approval; it is sent as a field of the approve request.

**Returns:** `Promise<ApproveOutcome>` — CHANGED. The TUI keeps no approval, push or commit logic: this function sends the daemon's 'workflow.approve' request, the same one the chat session and both plugins use, and returns what the daemon answers. It becomes asynchronous. ApproveOutcome becomes the daemon's result (approved, skipped, codeReview, followOn, tracker); its old tracker and commit fields, which reported the TUI's own push and commit, are removed.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:156 and typed in src/cli/services/index.ts:55. Today it approves in the TUI's own process (approveArtifactByJsonPath), then pushes an HLD, an LLD or a plan with autoPushEpicOnHld, autoPushStoryOnLld or autoPushTasksOnPlan, then commits with commitApprovedArtifacts (lines 158-166). Its callers use the result synchronously: src/cli/command.ts:223 and src/cli/panes/WorkflowsPane.tsx:116.

**Postconditions:**
- Its in-process approval, its switch over the three pushes and commitApprovedArtifacts are removed from the TUI. The TUI makes no git or gh call on approval.
- The service interface and both callers are changed to await it.
- The three push functions stay in src/workflow/tracker-auto.ts with no caller, for the epics work item to build on or replace. Until then an epic, its stories and its tasks are pushed only by the explicit tracker.push workflow, which is not changed.

## 3. Data model changes

### 3.1 `Setting tracker.addItems` — new

ONE flag turns tracker pushing on or off for a repo. A catalog row: path tracker.addItems, type boolean, default true, group Tracker. A catalog row has no label field (ConfigOption in src/config/config-catalog.ts has path, type, default, desc, enumValues and group), so the wording goes in desc, which both settings pages show: "Add items to tracker: when on and a supported tracker is set up for the project, approved workflow items are added to it and their documents pushed". The row is the value for any repo that has none of its own. A repo's own value is stored in the same config file under tracker.byRepo.<repoPath>.addItems, the dynamic-key pattern models.byRepo already uses. One reader returns the value for a repo: the repo's own value when present, otherwise the catalog value, otherwise true. The config file's path is fixed (src/shared/paths.ts has no override), so the reader has a module-level test seam. Settings pages: a catalog row reaches VS Code as a global key (vscode-plugin/src/config/key-map.ts), which is the default for all repos; the repo's own value is shown and written in each plugin's per-repo section, whose writers are hard-wired to models.byRepo today (vscode-plugin/src/panels/repo-config.ts:154 and jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:720) and are extended to write tracker.byRepo.<repoPath>.addItems for the open project. The VS Code plugin also declares the setting in its package.json.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/index.ts`
- `src/shared/paths.ts`
- `vscode-plugin/package.json`
- `vscode-plugin/src/config/key-map.ts`
- `vscode-plugin/src/panels/repo-config.ts`
- `vscode-plugin/src/panels/webview-host.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt`

### 3.2 `The check before any tracker action` — new

Two conditions, decided by the daemon before it calls any tool. (1) The setting is on for the repo. (2) A valid, supported tracker is set up for the project. The repo is the REGISTERED repo that contains the artifact's path: every artifact lives inside its repo, under .insrc/artifacts or docs, and the daemon holds the repo registry (listRepos in src/db/repos.ts), so the daemon matches the artifact's path against the registered repos and takes the one that contains it, the longest match when repos are nested. This works the same for every kind, including a BUILD record, whose own record stores no repo path (src/workflow/runners/build/standalone-record.ts:47-75), and for a request that carries only a path. The repo is never taken from the request's optional repo field or from the process's working directory. When no registered repo contains the path the answer is 'not ready: the artifact is not inside a registered repo', before any git or gh call. The tracker TYPE is the type set on the repo's entry in ~/.insrc/github.json when one is set, and otherwise is inferred from the project's git remote: a GitHub remote means github. Type is the kind of tracker (github today; others such as gitlab later), not an on or off switch: the value 'none', or a remote on a host with no supported tracker, means no supported tracker is set up, and the answer is 'not ready' with that reason. The target (owner and repo) comes from the repo's entry when it names them, otherwise from the remote; label names come from the entry, then the default entry, then the built-in defaults. Whether the tracker is usable is then asked of the tool for that type (next entry): for github, gh is installed and signed in. The check is run once per approve call and reused for every artifact in a batch. It does not call resolveGithubConfig and does not change it, so that function's other callers behave as before.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`
- `src/db/repos.ts`
- `src/daemon/index.ts`

### 3.3 `Tracker tool, one per tracker type` — new

A tool encapsulates the whole flow for one tracker type. It is a real tool in the daemon's tool registry, with the other built-in tools (registerTool in src/daemon/tools/registry.ts; the Tool contract in src/daemon/tools/types.ts:151 is one asynchronous execute(input, deps) returning a ToolResult). The registry is filled only in the daemon, so the tool exists only there. The daemon picks the tool by the project's type through one naming rule, tracker_<type>; adding gitlab later means adding one tool. Today there is one, tracker_github. Its input names the request (ready, addOrUpdate, comment, close, commitRef) and carries the fields below; its ToolResult's data is the TrackerOutcome. A tool knows nothing about workflow artifacts: the daemon passes it everything. It is code: plain git and gh calls, each with a time limit, made through one exec that a test replaces. WHAT THE DAEMON PASSES per item: the project's repo path; the target (owner/repo); the action (add-or-update, or close); the item's identity key, unique and stable (for an issue record 'issue-<first 8 of its hash>'; for a standalone story 'story-<first 8 of the hash>-<story id>'; for a task that plus the task id); the title; the body, which the daemon renders and which carries the existing hidden identity marker (idMarker in src/workflow/tracker/conventions.ts:61) with the artifact's id; the labels (the kind label and the names the project uses); the parent's ref when the item sits under another; the exact list of documents to commit and push; two commit messages; and the item's known ref when it was added before. Commit messages: 'docs(workflow): approve <artifact id>: <title>' for the documents and 'docs(workflow): record tracker ref for <artifact id> (<ref>)' for the ref. WHAT THE TOOL ANSWERS. ready: is this tracker usable for the project (for github: gh installed, then gh signed in, the sign-in call limited to 10 seconds); the answer names what is missing. addOrUpdate: commit and push exactly the listed documents (git add and git commit both name the paths; nothing to commit for those paths is not a failure; the push is a plain push of the current branch, which also sends earlier unpushed commits on it); find the item, by its known ref or else by its unique label 'insrc:<identity key>'; when not found, first create the two labels it needs, the kind label and the unique label, with an idempotent label create, since a create naming a label that does not exist yet may be rejected, and then create the item with both labels; when found, update its body; return the outcome and the ref. A label create that fails is a 'failed' outcome with no item created. comment: add one comment to an existing item by its ref. close: close the item by its ref. commitRef: commit and push the same documents again after the daemon has written the ref into the artifact. THE LOOKUP HAS THREE ANSWERS: found, adopt it; not found (gh ran and returned nothing), create; lookup failed (gh exited with an error or passed its time limit), stop, create nothing, report 'failed'. Today's ghFindIssueByLabels returns the same empty answer for the last two (src/workflow/tracker/github.ts:215-221), so the tool has its own lookup. A create that passes its time limit is reported as failed and NOT retried in the same run, because it may have gone through; the next run's lookup finds it by its label. The existing ghCreateIssueTyped retries untyped after any error (github.ts:164-171), so the tool does not use it for this. WHAT THE TOOL RETURNS: a TrackerOutcome, { item, status: 'created' | 'updated' | 'already-exists' | 'closed' | 'skipped' | 'failed', ref?, reason?, docs?: { committed, pushed, reason? } }. TIME. Each gh and git call has a 30 second limit. The calls block, so the daemon serves no other request while one runs; one item is about six calls, typically one to two seconds each.

**Call sites:**
- `src/daemon/tools/registry.ts`
- `src/daemon/tools/types.ts`
- `src/daemon/tools/builtins`
- `src/daemon/index.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/conventions.ts`

### 3.4 `The tracker flow` — new

One asynchronous function, new in src/workflow/tracker-auto.ts, that takes the artifacts an approve call approved and returns one TrackerOutcome per tracker item. It runs only in the daemon and has one caller for approvals: the 'workflow.approve' handler (src/daemon/index.ts:643), which awaits it AFTER approveWorkflowTarget and AFTER the bugfix follow-on and puts its outcomes in the result's tracker[] field. It must run on EVERY path out of that handler where something was approved. Today the handler returns early when the request names no repo (index.ts:667-669), before the follow-on; the VS Code review panel sends only the artifact's path (vscode-plugin/src/chat/docs-review-client.ts:119-121), so its approvals take that path. The flow runs there too, finding the repo itself from the registry; the follow-on stays skipped on that path, as today. The handler honours a tracker: false field in the request by not running the flow. The flow runs the check once, then for each artifact builds the fields above and calls the tool, one artifact after another. BY KIND, for this work item. An ISSUE record: addOrUpdate with the record's title and its rendered markdown; when the follow-on has stamped a parent on the record (meta.parentRef) the parent's ref is passed, which is why the flow runs after the follow-on. A standalone design (an LLD with no parent Define): when the work item's issue record (the ISSUE artifact with the same hash) has a ref, addOrUpdate is NOT used; the tool adds one comment on that issue linking the design; otherwise addOrUpdate creates a story issue from the design's title and summary. A standalone plan: one addOrUpdate per task, under the story's issue or the issue record's issue; with neither on the tracker it is 'skipped' with that reason. A BUILD record: close the work item's issue and each task issue, found on the ISSUE, LLD and PLAN artifacts that share the BUILD record's hash and story id; with none found it is 'skipped: nothing on the tracker to close'. A standalone design linked on its issue record's issue uses the tool's comment request. An HLD, an LLD under an epic and a plan under an epic are NOT handled by the flow: they belong to the epics work item. DEF, SPEC, CR and EXT have no outcome. RECORDING. After addOrUpdate returns a ref the flow writes it to the artifact's meta.tracker with the existing patchTrackerMeta (src/workflow/tracker/refs.ts:88), then calls the tool's commitRef. TrackerMeta (refs.ts:24-37) gains two optional fields: commentedOn, the ref of the issue a standalone design was linked on, and closedAt. What counts as tracked, so nothing is done twice: an issue record has issueRef; a standalone design has storyRef or commentedOn; a plan has taskRefs; a BUILD record has closedAt. ONE BUGFIX, ONE HASH. The close finds the issue by hash, but today a small bugfix's build has a different hash from its issue record: the routed next step is computed (advanceBugfixAfterIssue returns nextCall, src/workflow/bugfix/advance.ts:62-64) and then dropped (src/workflow/bugfix/mount.ts:140-145 keeps only kind, artifactPath, ok and note), so the build call is made by hand and the build step mints a hash from the focus text (src/mcp/build-step/phases/implement.ts:127, validate.ts:99). Two changes close this: nextAfterIssue (src/workflow/bugfix/next-after-issue.ts:52-78) puts the issue record's hash in the call it emits (standalone.epicHash on the small route, params.epicHash on the sized route), and the follow-on outcome carries that nextCall through the approve result to insrc_workflow_approve, where the steering tells the model to make exactly that call. Builds made before this keep their old hash; for them the close reports nothing to close. ONE CREATOR, ONE CLOSER. Code that creates a GitHub issue from an issue record, links it, records the ref and closes it already exists in the bugfix module and was never connected: createBugfixTrackerIssue and closeBugfixTrackerIssue with their default dependencies (src/workflow/bugfix/tracker.ts:142-188, 266-287), the hook that would call the create (the AdvanceTrackerDeps leg in src/workflow/bugfix/advance.ts:63-70 and its type in src/workflow/bugfix/types.ts:61), completeBugfixTracker (advance.ts:79-88) and the follow-on's close leg (src/workflow/bugfix/mount.ts:156-166), which fires only for a BUILD carrying meta.issueHash that nothing stamps. That code has no unique label, cannot tell a failed lookup from not found, and retries a create after any error. All of it is deleted, with its tests (src/workflow/__tests__/bugfix-tracker.test.ts) and the 'bugfix-complete' followOn kind, so the tracker tool is the only code that creates or closes a work item's issue. The follow-on keeps what it does today: it locates and stamps the parent and routes to the next stage.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/daemon/index.ts`
- `src/cli/services/workflow.ts`
- `src/cli/services/index.ts`
- `src/cli/command.ts`
- `src/cli/panes/WorkflowsPane.tsx`
- `src/workflow/gates.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/bugfix/tracker.ts`
- `src/workflow/bugfix/mount.ts`
- `src/workflow/bugfix/advance.ts`
- `src/workflow/bugfix/types.ts`
- `src/workflow/bugfix/index.ts`
- `src/workflow/bugfix/next-after-issue.ts`
- `src/mcp/build-step/phases/implement.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/server.ts`
- `vscode-plugin/src/chat/docs-review-client.ts`

### 3.5 `Pending list and backfill` — new

Two daemon requests and one new MCP tool, insrc_tracker_step, that sends them, with two phases. Phase 'pending' takes a repo and returns every approved artifact of the kinds this work item covers that is not tracked (by the rule above), parents before children, with what the flow would do for each, or the reason the check fails; an item whose BUILD record is approved is marked finished. It changes nothing; it is the backfill's dry run. Phase 'run' takes a repo and runs the flow on those items one at a time, as a stream request with one progress frame per item, yielding to the event loop between items; a finished item is created and closed at once. It is safe to run twice. A bugfix built before the one-hash change cannot be matched to its build; the list marks it 'completion unknown', and the run creates it and leaves it open. Adding a tool means the registered-tool tests (src/mcp/__tests__/schema-registry.test.ts: the expected tool list and the expected phases) and the steering's table of registered tools must list it.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/prompts/steering-block.md`

### 3.6 `What the workflow says about the tracker` — new

The result of insrc_workflow_approve carries tracker[] and, for a bugfix, the next call. The tool's description and the steering source (src/prompts/steering-block.md, its tracker and bugfix guides and its tool table, and the plugin copy vscode-plugin/assets/steering-block.md) say: the daemon adds, updates and closes tracker items and pushes their documents when an item is approved; the model relays each outcome and its reason, never runs gh or commits the artifacts for this itself, and, after approving an issue record, makes exactly the next call the result gives. They also say what is covered now (issue records, standalone stories and their tasks, completion) and that an epic, its stories and its tasks are pushed only by the explicit tracker.push workflow until the epics work item lands. The done response of insrc_workflow_step, whose pendingApproval block is built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a line saying whether approving this artifact will add it to the tracker, or why not; working that out makes no call that changes anything.

**Call sites:**
- `src/mcp/server.ts`
- `src/prompts/steering-block.md`
- `vscode-plugin/assets/steering-block.md`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/mcp/workflow-step/types.ts`

## 4. Error paths

**Error cases**

- **The approved artifact is not inside a registered repo.** (recoverable)
  - Detection: The daemon matches the artifact's path against its repo registry and finds no repo that contains it.
  - Response: 'skipped: the artifact is not inside a registered repo', before any git or gh call. The request's repo field and the process's working directory are not used.
  - User impact: The result says the item was not added and why.
- **No supported tracker is set up for the project.** (recoverable)
  - Detection: The check finds no type set and no remote on a supported host, or the type is 'none' or one no tool is registered for.
  - Response: 'skipped' with the reason, before any tool is called.
  - User impact: The result says no supported tracker is set up.
- **The tracker's tool is missing or not signed in.** (recoverable)
  - Detection: The tool's ready answer: the gh executable is not found, or gh auth status exits non-zero.
  - Response: 'skipped' with 'gh is not installed' or 'gh is not signed in (run gh auth login)'.
  - User impact: The user is told what to fix; the item is in the pending list.
- **The sign-in check does not answer.** (recoverable)
  - Detection: The tool's sign-in call passes its 10 second limit.
  - Response: Every item of that approve call is 'skipped: gh did not answer in time'. The response is delayed by that limit once, not per item.
  - User impact: The items are in the pending list.
- **The commit or push of the documents fails.** (recoverable)
  - Detection: A git call exits non-zero or passes its time limit, other than a commit that finds nothing to commit for the listed paths.
  - Response: 'failed' with git's message; the tool does no tracker action for that item, so nothing is on the tracker that the remote cannot show.
  - User impact: The item is approved, not on the tracker, and in the pending list.
- **The lookup of the item fails.** (recoverable)
  - Detection: The tool's lookup returns 'lookup failed': gh exited with an error or passed its time limit.
  - Response: 'failed' with the reason. Nothing is created.
  - User impact: No duplicate is possible; the item is in the pending list.
- **A create or update fails or passes its time limit.** (recoverable)
  - Detection: The gh call exits non-zero or is stopped at 30 seconds.
  - Response: 'failed'. It is not retried in the same run. A create that did go through is found by its unique label on the next run and adopted.
  - User impact: The item is in the pending list; the next run settles it.
- **The item was created but the ref could not be written to the artifact, or the commit of the ref failed.** (recoverable)
  - Detection: patchTrackerMeta throws, or the tool's commitRef reports a git failure.
  - Response: 'failed' naming the ref when it was not written; when only the commit failed the outcome keeps its status and docs says the ref is not pushed. The next run finds the item by its label and records it.
  - User impact: The user sees the ref and what is still to do.
- **The tracker flow throws.** (recoverable)
  - Detection: The daemon's approve handler wraps the awaited flow in a try and catch.
  - Response: A 'failed' outcome with the message. The approval has already completed and is not affected.
  - User impact: One failed line in the result.
- **The backfill run stops part of the way through.** (recoverable)
  - Detection: The stream ends without its final frame, or an item fails.
  - Response: Items already recorded keep their refs; a second run continues with the rest.
  - User impact: A partial result; a second run finishes it.
- **Creating a label fails.** (recoverable)
  - Detection: The label create exits non-zero or passes its time limit.
  - Response: 'failed' with the reason; the item is not created.
  - User impact: The item is in the pending list.
- **The TUI cannot reach the daemon.** (recoverable)
  - Detection: The TUI's approve request fails to connect.
  - Response: The TUI reports that the daemon is not running. Nothing is approved, because the TUI no longer approves by itself.
  - User impact: The user starts the daemon and approves again.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every outcome is 'skipped: the setting is off' and no git or gh call is made, from a session, a plugin panel or the TUI. |
| A repo with no entry in github.json and a GitHub remote. | The type is inferred as github and the target is the remote; issue items are tracked. |
| A repo whose github.json entry says type 'none', or whose remote is on a host with no supported tracker. | No supported tracker is set up: 'skipped' with that reason. The setting stays the only on and off switch. |
| An item whose ref is on its record is approved again. | 'already-exists' with the ref; its body is not changed and nothing is created. |
| An item that is on GitHub but whose record has no ref. | The lookup finds it by its unique label; it is adopted, the ref recorded and committed. Nothing is created. |
| A bugfix whose issue record is located under an epic or story. | The follow-on stamps the parent first; the flow then creates the issue under the parent's issue. When the parent is not on the tracker the issue is created with no parent. |
| A standalone design whose issue record is already on the tracker. | One comment linking the design is added to that issue and commentedOn is recorded; approving it again adds no second comment. |
| A standalone plan. | One task issue per task under the story's or the issue record's issue; approving the build later closes them. |
| A BUILD record whose Story has nothing on the tracker. | 'skipped: nothing on the tracker to close'. |
| An HLD, an LLD under an epic or a plan under an epic is approved, from any surface including the TUI. | It is approved and nothing is pushed: the TUI's own push is gone and the epics work item has not landed. The explicit tracker.push workflow still pushes an epic. |
| A batch approval. | One outcome per covered artifact, in the order approved, run one after another. |
| The working tree holds other staged or uncommitted files. | Only the listed documents are committed, because both git add and git commit name them. The push sends the current branch, including earlier unpushed commits on it. |
| A document that was committed and pushed earlier (every backfill item). | Nothing to commit is not a failure; the tool goes on to the lookup. |
| A finished item in the backfill. | Created and closed at once. |
| The TUI approves with withTracker false. | The request carries tracker: false and the daemon does not run the flow. |
| An approve request that carries only an artifact path (the VS Code review panel). | The handler's no-repo path still runs the flow; the repo is found from the registry; the bugfix follow-on is skipped as today. |
| A BUILD record is approved from a panel that sends only its path. | Its repo is the registered repo containing the path, so the close runs. |

**Invariants to preserve**

- An approval is never failed, undone or delayed past its stamp by the tracker: the flow runs after the approval and the follow-on are complete. [[c1]]
- resolveGithubConfig and the tracker.push, tracker.sync and tracker.post workflows behave as before. [[c2]]
- The TUI makes no git or gh call on approval and holds no approval logic; every approval is decided by the daemon. [[c7]]
- A ref is written to an artifact only by code, and an item that is tracked is never created again. [[c3]]
- gh is never run by a test, and never by the model in the session for this flow. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]
- A work item's tracker issue is created by one piece of code and closed by one piece of code: the tracker tool. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, on every approval surface, and is shown on the VS Code and JetBrains settings pages`, `ac2: the check before any action is the setting plus a supported tracker set up for the project, its type set or inferred, its repo never guessed`, `ac3: on approval the daemon calls the tool for the project's tracker type, which pushes the documents, creates or updates the item and returns its ref; the build's approval closes it`, `ac4: an item is never created twice, and a failed or timed-out call never leads to a create`, `ac5: a skipped or failed tracker action never affects the approval and always says why; the result, the steering and the workflow messages report it and tell the model not to run gh`, `ac6: a pending list and a backfill run add the approved items never pushed, and create and close the finished ones`
- **unit** — The setting and the check.
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true, group Tracker, with its wording in desc; the row count in the catalog contract test is updated`, `T3 the repo is the registered repo whose path contains the artifact's path, the longest match for nested repos, for every kind including a BUILD record and for a request with no repo field; an artifact outside every registered repo gives 'not inside a registered repo' with no git or gh call, whatever the request's repo field and the process's working directory say`, `T4 the type is the one set on the repo's entry, else inferred from the remote; a GitHub remote gives github; type 'none', an unknown type and a remote on another host give 'no supported tracker'; the target and labels come from the entry, then the remote and the defaults; resolveGithubConfig is not called`, `T5 with the setting off no tool is asked anything; the check runs once for a batch`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG`, `the setting reader's module-level seam`, `a recording fake for the tool's one exec`
- **unit** — The github tool, with git and gh faked.
  - Subjects: `T6 ready: gh missing, gh not signed in, and a sign-in call that passes 10 seconds each give their own reason`, `T7 addOrUpdate commits only the listed paths (both git add and git commit name them) with the given message, treats nothing-to-commit as done, pushes, then looks up, then creates the kind label and the unique label idempotently, then creates the item with both labels and the identity marker in the body; a failed label create creates no item`, `T8 the lookup's three answers: found adopts and creates nothing; not found creates; lookup failed (error or time limit) creates nothing and is 'failed'`, `T9 a create that passes its time limit is 'failed' and is not retried in the same run; the next run finds the item by its label and adopts it`, `T10 a known ref gives 'already-exists' with no create; update changes the body of a found item; close closes by ref; commitRef commits and pushes the same paths with the second message`, `T11 a git failure in the first commit or push stops the tool before any gh call`, `T33 the tool is registered as tracker_github with the registry's Tool contract; its result's data is a TrackerOutcome; an unknown request name is refused; comment adds one comment by ref`
- **integration** — The flow, for each kind, with the tool faked.
  - Subjects: `T12 an approved issue record is passed with its fields, its ref recorded and committed; with a stamped parent the parent's ref is passed`, `T13 a standalone design comments on the issue record's issue when it has a ref and records commentedOn, otherwise creates a story issue; a second approval does neither again`, `T14 a standalone plan creates one task per task under the story's or the issue record's issue, and is 'skipped' with neither on the tracker`, `T15 a BUILD record closes the issue and the tasks of the same hash and story and records closedAt; with nothing to close it is 'skipped'`, `T16 an HLD, an LLD under an epic, a plan under an epic, a DEF, a SPEC, a CR and an EXT give no outcome`, `T17 an item on GitHub with no ref on its record, an issue record and a standalone story alike, is adopted and recorded and nothing is created; after a ref is recorded the pending list no longer shows it`
  - Fixtures: `temp repos with issue records, standalone designs, plans and BUILD records`, `a tool fake that records what it is passed`
- **integration** — Every approval surface, and the bugfix chain.
  - Subjects: `T18 the daemon's workflow.approve result carries tracker[], filled after the follow-on, through to insrc_workflow_approve; an approve request carrying only an artifact path runs the flow on the handler's no-repo path with the follow-on skipped; a request with tracker: false runs no flow; a flow that throws leaves the approval result intact`, `T19 the TUI approve service sends the daemon's approve request and returns its answer, with withTracker false sent as tracker: false; it is asynchronous and the command and the Workflows pane await it; it calls neither approveArtifactByJsonPath nor any push or commit function, and reports a daemon that is not running`, `T20 approving an HLD, an LLD under an epic or a plan from the TUI approves it and makes no git or gh call`, `T21 after an issue record is approved, the result carries the next call with the issue's hash, on the small route and the sized route; following it, the BUILD record shares the hash and its approval closes the issue`, `T22 the old creator and closer are gone: createBugfixTrackerIssue, closeBugfixTrackerIssue, completeBugfixTracker, the create hook in the advance and the follow-on's close leg no longer exist, followOn has no 'bugfix-complete' entry, and the follow-on still stamps the parent and routes`, `T23 the existing suites that approve an artifact on a temp repo issue no command whose name is gh: they run under one shared helper that sets the setting reader to true and installs the recording fake, which throws for `git remote get-url` as a repo with no remote does`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper for the setting seam and the recording fake`
- **integration** — The pending list and the backfill, with the tool faked.
  - Subjects: `T24 the pending phase lists approved untracked items of the covered kinds parents first, marks finished ones and 'completion unknown' ones, leaves out unapproved ones and epic items, and changes nothing`, `T25 the run phase creates each item once, creates and closes a finished one, yields between items, and a second run reports them as already there; a failure part of the way through keeps what was recorded`
- **unit** — What the workflow says, the tool's registration, and the plugins.
  - Subjects: `T26 the steering tracker and bugfix guides, its tool table, and the descriptions of insrc_workflow_approve and insrc_tracker_step say the daemon does the tracker work on approval, list what is covered, tell the model to relay outcomes, not to run gh, and to make the next call an issue approval returns; the plugin copy of the steering source is identical to the source`, `T27 the pendingApproval block of insrc_workflow_step's done response says whether approval will add the item to the tracker, or why not`, `T28 the registered-tool tests list insrc_tracker_step with its pending and run phases`, `T29 VS Code: package.json declares the setting; the global key maps to the catalog row; the per-repo section writes tracker.byRepo.<repoPath>.addItems for the open workspace folder`, `T30 JetBrains: the settings page shows the default row, and its per-repo section writes tracker.byRepo.<repoPath>.addItems for the open project`
- **live** — One real run against GitHub, after the build, recorded in the build record.
  - Subjects: `T31 approving a real issue record in this repo pushes its documents, creates a GitHub issue in insors-ai/insrc and records its ref`, `T32 the pending list for this repo is shown to the user before the backfill is run`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T5`, `T20`, `T29`, `T30` |
| `ac2` | `T3`, `T4`, `T6` |
| `ac3` | `T7`, `T10`, `T12`, `T13`, `T14`, `T15`, `T18`, `T19`, `T21`, `T31`, `T33` |
| `ac4` | `T8`, `T9`, `T17` |
| `ac5` | `T11`, `T16`, `T18`, `T23`, `T26`, `T27` |
| `ac6` | `T24`, `T25`, `T32` |

## 6. Migration

**State before:** Only the TUI pushes to GitHub, by code in its own process, for an HLD, an LLD under an epic and a plan, and commits the artifacts, when ~/.insrc/github.json has an entry for the repo; the TUI also approves in its own process, not through the daemon. An approved issue record never reaches GitHub, and a standalone story cannot be pushed. An approval from a chat session or a plugin panel pushes nothing. No setting turns tracking on or off. A small bugfix's build has a different hash from its issue record, and the routed next step after an issue approval is computed and dropped.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off on every surface. Every approval, including the TUI's, is made by the daemon. When an issue record, a standalone design or plan, or their BUILD record is approved, the daemon runs one flow that checks the setting and the project's tracker, finds the repo from its registry, picks the tool for the tracker type, and has it push the documents and create, update or close the item. A bugfix keeps one hash from issue record to BUILD record. A pending list and a backfill run cover what was never pushed. The TUI holds no approval, push or commit logic; epic items are pushed only by the explicit tracker.push workflow until the epics work item lands.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row (wording in desc) and its per-repo reader with its test seam. — ↩ rollbackable
2. Add the tracker_github tool to the daemon's tool registry: ready, addOrUpdate with the idempotent label create and the three-answer lookup, comment, close, commitRef, each call time-limited; add the two optional tracker fields; add the shared test helper. — ↩ rollbackable
3. Add the check (setting, the registered repo containing the artifact, type set or inferred, target) and the asynchronous tracker flow for an issue record, a standalone design, a standalone plan and a BUILD record. Nothing calls it yet. — ↩ rollbackable
4. Await the flow in the daemon's approve handler after the follow-on, on every path where something was approved including the no-repo path, and return tracker[]; honour tracker: false. Put the existing approval suites on the shared helper. — ↩ rollbackable
5. Make the TUI approve through the daemon: its approve becomes an asynchronous request to 'workflow.approve'; remove its in-process approval, its push switch and its commit; change its interface and two callers to await it. From this step epic items are pushed only by the explicit tracker.push workflow. — ↩ rollbackable
6. Give a bugfix one hash: put the issue record's hash in the next call and carry the next call on the follow-on outcome through to insrc_workflow_approve. Delete the old issue create and close code in the bugfix module, its hook, the follow-on's close leg and their tests. — ↩ rollbackable
7. Add the insrc_tracker_step tool with its pending and run phases and their daemon requests; update the registered-tool tests. — ↩ rollbackable
8. Add the tracker line to the pendingApproval block of insrc_workflow_step; rewrite the steering's tracker and bugfix guides and tool table and the tool descriptions; refresh the plugin copy. — ↩ rollbackable
9. Show the setting on the VS Code and JetBrains settings pages. — ↩ rollbackable
10. After the daemon is updated: show the pending list for this repo to the user and, on their go-ahead, run the backfill. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the pending list`)_

**Backward compat:** approveWorkflowTarget is unchanged; WorkflowApproveResult gains an optional tracker[] and FollowOnOutcome an optional nextCall and loses the 'bugfix-complete' kind, which nothing produced. The approve request gains an optional tracker field. resolveGithubConfig, the three epic push functions and the tracker workflows are unchanged. The tracker meta gains two optional fields; nothing stored is rewritten. One new MCP tool, one new daemon tool and two daemon requests are added. What changes for the user: (1) with the setting on (the default) and gh signed in, approving an issue record, a standalone design or plan commits and pushes those documents and creates a GitHub item, for any registered repo with a GitHub remote; (2) the TUI now needs the daemon running to approve, its approve is asynchronous and its result takes the daemon's shape; (3) the TUI no longer pushes an epic, its stories or its tasks, and no longer commits approved artifacts by itself: until the epics work item lands, an epic is pushed with the explicit tracker.push workflow; (4) the unused issue create and close functions of the bugfix module are deleted; (5) after an issue approval the bugfix's design, plan and build are filed under the issue's hash; builds made earlier keep their old hash.

## 7. Alternatives considered

### 7.1 a1: A tracker tool per type, called by the daemon after approval — **CHOSEN**

The daemon checks the setting and the project's tracker, picks the tool for its type, and passes it everything; the tool encapsulates the flow.

Add the one setting and a check (setting on, a supported tracker set up, its type set or inferred from the remote, its repo found from the daemon's registry). Register one tool per tracker type in the daemon's tool registry; the github tool commits and pushes the listed documents, looks the item up by a unique label with a three-answer result, creates, updates, comments on or closes it, and returns the ref. One asynchronous flow function in the daemon builds the tool's inputs from an approved artifact and records the ref; the daemon's approve handler awaits it after the bugfix follow-on. Every surface approves through the daemon, including the TUI, which keeps no logic. This work item covers issue records, standalone stories, their tasks and completion.

### 7.2 a2: A directive carried out by the session's model

The approval returns steps; the steering tells the model to run git and gh.

The approval result carries a directive (commit and push, create or update, record) and the model in the session carries it out, recording the ref through a small tool.

**Rejected because:** Every approval calls the daemon, so the user chose to handle the tracker flow there, in one place, through a tool selected by tracker type (2026-10-06).

### 7.3 a3: One design for issues and epics together

Bring epics, their stories and their tasks under the same flow in this work item.

The flow also handles an HLD, an LLD under an epic and a plan under an epic, replacing or wrapping the three existing push functions and the Define's aggregate of refs.

**Rejected because:** The user split the work into two work items, one for issues and one for epics, so each can be designed properly (2026-10-06).

## 8. References

- **[[c1]]** `code` `src/workflow/gates.ts` — "approved.push({ path: jsonPath, result: approveArtifactByJsonPath(jsonPath, approveOpts) });"
- **[[c2]]** `code` `src/workflow/config/github.ts` — "return { type: 'none', source: 'default-config' };"
- **[[c3]]** `code` `src/workflow/tracker-auto.ts` — "export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {"
- **[[c4]]** `code` `src/config/config-catalog.ts` — "{ path: 'designReview.premises.issue',      type: 'number', default: 8,"
- **[[c5]]** `code` `src/workflow/bugfix/mount.ts` — "Wiring the tracker create leg + the build→issue linkage is a tracked follow-up."
- **[[c6]]** `code` `src/workflow/tracker/github.ts` — "export function ghAuthOk(): { readonly ok: true } | { readonly ok: false; readonly reason: string } {"
- **[[c7]]** `code` `src/cli/services/workflow.ts` — "if (approval.workflow === 'design.epic')       tracker = autoPushEpicOnHld(approval.path);"
- **[[c9]]** `stakeholder` `user, 2026-10-06` — "there should be a settings at the repo level, "Add items to tracker", If tracker utils are detected on the system, currently only "gh" and this flag == true then all items created should be logged to "
- **[[c10]]** `stakeholder` `user, 2026-10-06` — "Add items to tracker <- only one flag, tracker push on/off (default=on)."
- **[[c11]]** `stakeholder` `user, 2026-10-06` — "ok, let's split this into 2 epics, one for issues, one for epics. that way we can design both properly"
- **[[c12]]** `stakeholder` `user, 2026-10-06` — "wait, type is for the type of tracker, github today in future gitlab maybe others."
- **[[c13]]** `stakeholder` `user, 2026-10-06` — "so the action check is tracker flag on and a valid/supported repo is setup for the project."
- **[[c14]]** `stakeholder` `user, 2026-10-06` — "type can be inferred if not explicitely set"
- **[[c15]]** `stakeholder` `user, 2026-10-06` — "the approval calls the daemon, so this would mean the tracker flow needs to be handled by the daemon, that way we have one place"
- **[[c16]]** `stakeholder` `user, 2026-10-06` — "let's make a tool for this, tool gets selected based on the type (inferred or set) and the tool encapsulates the flow"
- **[[c17]]** `stakeholder` `user, 2026-10-06` — "staying on 3b, the daemon needs to pass the required details to the tool, such as the commit message, etc"
- **[[c18]]** `stakeholder` `user, 2026-10-06` — "marker plus a unique label"
- **[[c19]]** `stakeholder` `user, 2026-10-06` — "yes, no guessing"
- **[[c20]]** `stakeholder` `user, 2026-10-06` — "Issue/Task is closed on BUILD approval by the daemon. Create each finished item on GitHub and close it immediately"
- **[[c21]]** `code` `src/workflow/bugfix/mount.ts` — "Wiring the tracker create leg + the build→issue linkage is a tracked follow-up."
- **[[c22]]** `code` `src/workflow/tracker/conventions.ts` — "export function idMarker(workflowId: string): string {"
- **[[c23]]** `code` `src/daemon/tools/registry.ts` — "export function registerTool(tool: Tool): void {"
- **[[c24]]** `prior-artifact` `LLD-38436e90625a83a2-S001, six reviews by the daemon on 2026-10-06 of earlier shapes of this design: block each time (8, 6, 6, 4, 7 and 5 premises did not hold); this version is rewritten around the nine decisions the user made on them`
- **[[c25]]** `stakeholder` `user, 2026-10-06` — "Tool is a daemon tool, TUI needs to change to call the daemon"
- **[[c26]]** `stakeholder` `user, 2026-10-06` — "repo can always be inferred from the path right? the repo registry is also there with the daemon"
- **[[c27]]** `stakeholder` `user, 2026-10-06` — "TUI should not commit anything out of bounds. no logic in TUI, should always call the daemon"
- **[[c28]]** `stakeholder` `user, 2026-10-06` — "B, when the epic flow lands we will add the daemon based call"
- **[[c29]]** `code` `src/daemon/tools/types.ts` — "execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult>;"
- **[[c30]]** `prior-artifact` `LLD-38436e90625a83a2-S001 seventh review of 2026-10-06 by the daemon: block, 5 premises did not hold; the user decided each and this revision applies the decisions`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**6 do not hold · 1 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T09:21:22.684Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | MED | The tool registry is filled only in the daemon, so tracker_github exists only there. | src/mcp/server.ts:1242-1251, in runInsrcMcpStdio: `import('../daemon/tools/builtins/index.js') ... registerBuiltinTools();`, with the comment 'Mirrors what the main daemon does at boot'. A tool added to the built-ins is therefore also registered in every MCP server process. registry.ts:4-6 adds: 'The LLM tool-call path (agent/tools/executor.ts) and the controller task path ... both read from this registry', so a registered tool is reachable by tool id, not only by the approve handler. [files: src/mcp/server.ts, src/daemon/tools/builtins/index.ts, src/daemon/tools/registry.ts] | Either register tracker_github in the daemon boot path only (outside registerBuiltinTools), or accept that it is registered in the MCP process and say so. Also state how it is kept off LLM tool surfaces so invariant c6 holds; the existing git_* / gh_* id naming is the convention to follow. |
| change-sites | MED | Changing the TUI service's two callers to await the new approve is the complete caller change. | Both callers read the old shape: command.ts:224 `approved ${r.approval.workflow}...${r.tracker.status}` and WorkflowsPane.tsx:117 likewise. A review block reaches them today as a THROWN error: command.ts:226 `if (err instanceof Error && err.name === 'ReviewBlockedError')`, pinned by command.test.ts:232-241. The daemon instead returns a blocked artifact in `skipped[]` with `approved` empty (gates.ts:839-840). WorkflowsPane.doApprove is a synchronous `(item): void` with a try/catch that an un-awaited promise would escape. The design says only that the callers 'are changed to await it'. [files: src/cli/command.ts, src/cli/panes/WorkflowsPane.tsx, src/cli/__tests__/command.test.ts, src/cli/services/workflow.ts] | Specify for both callers how approved[], skipped[] (review block, with the --override hint), followOn and tracker[] are rendered, that doApprove becomes async, and that the two command.test.ts fakes are rewritten to the daemon's result shape. |
| change-sites | MED | The two stated changes (hash in the emitted next call; nextCall carried through the approve result) give a small bugfix one hash from issue record to BUILD record. | The emitted call is only the implement turn (next-after-issue.ts:60-66, `phase: 'implement'`). The validate turn is a separate call the model builds itself, and validate.ts:99 mints again: `ctx.epicHash ?? (producesLld ? undefined : standaloneEpicHashFromFocus(ctx.focus ?? ''))`. A validate call without standalone.epicHash writes a second BUILD record under the focus hash, while implement.ts:155 has already persisted one under the issue hash. Approving the focus-hash record then finds nothing to close. [files: src/mcp/build-step/phases/validate.ts, src/mcp/build-step/phases/implement.ts, src/workflow/bugfix/next-after-issue.ts] | Cover the validate turn: have the implement response and steering require the same standalone.epicHash on validate, or have validate refuse or resolve a trivial standalone call that lacks it. Add this to T21. |
| change-sites | MED | The change-site inventory covers every place that documents the approval-time tracker behaviour. | docs/workflow.md:138-144: 'Auto tracker. Approving an HLD or LLD automatically pushes ... Use `--no-tracker` on the approve command to opt out'. Lines 181-185: 'The tracker is opt-in. When `~/.insrc/github.json` is absent ... skipped (tracker disabled ...)'. The design reverses both (on by default, inferred from the remote; HLD and LLD no longer pushed on approval) but lists only the steering sources in 3.6; docs/workflow.md appears in no call-site list or migration step. Separately, the deleted bugfix symbols are also referenced in src/workflow/bugfix/__tests__/bugfix-mount.test.ts and src/workflow/__tests__/bugfix-orchestration.test.ts, not only the named bugfix-tracker.test.ts. [files: docs/workflow.md] | Add docs/workflow.md (and the tracker section of docs/daemon.md if it has one) to the change sites, and name the two further test files in step 6. |
| data-compatibility | MED | Existing ~/.insrc/github.json settings keep their meaning under the new check. | Three switches are honoured today that the design's check never reads. (1) A global `default` entry with `type: 'none'` disables the tracker: resolveGithubConfig, github.ts:204-210 with resolveEntry:234. The design reads type only from 'the repo's entry' and uses the default entry for label names only, so that user's repos with a GitHub remote start committing, pushing and creating issues. (2) `commitArtifacts` (github.ts:80, 'Default true') gates the commit at services/workflow.ts:98, `cfg.commitArtifacts === false`; the tool always commits and pushes. (3) `pushTasks` ('Opt-in (default false)', github.ts:77) gates task issues at tracker-auto.ts:255; the flow creates one issue per task of a standalone plan unconditionally. [files: src/workflow/config/github.ts, src/cli/services/workflow.ts, src/workflow/tracker-auto.ts] | State for each of default.type 'none', commitArtifacts and pushTasks whether it is honoured or retired. If retired, say so under backward compatibility and add an edge case and test for a default entry of type 'none'. |
| tests | MED | T18 (and T23) can be written against the code as designed: the handler's flow call, its try/catch, tracker:false and the no-repo path are testable. | The 'workflow.approve' handler is an inline closure in the daemon's handler map (daemon/index.ts:643-677), closing over `db`. No test file imports daemon/index: the only matches for `daemon/index.js` under src are path strings in debug tests. Existing tests reach approval through approveWorkflowTarget, advanceApprovedBugfixes or the MCP dispatch with a faked RPC. The design puts all the new behaviour in the handler and extracts nothing, so T18's subjects have no importable unit. T23's shared helper is aimed at 'existing suites that approve an artifact', but those call approveWorkflowTarget, which by design never runs the flow. [files: src/daemon/index.ts, src/workflow/__tests__/approve-workflow-target.test.ts, src/mcp/__tests__/workflow-approve-dispatch.test.ts] | Extract the post-approval sequence (follow-on, then flow, tracker:false, the no-repo path, the try/catch) into an exported function with injected registry and tool dependencies, in the way mount.ts was extracted for the follow-on. Point T18 at it, and narrow T23 to the suites that actually reach it. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | A blocking flow (30 s per git/gh call, about six calls per item, the whole batch inside one approve request) finishes within the timeouts of the clients that call 'workflow.approve'. | The design states the daemon serves no other request while a call runs but gives no bound for a batch and names no client timeout. I confirmed the existing helpers are synchronous (github.ts `silent` / `out` through one exec seam). I did not read the timeout of unaryRpc (src/mcp/daemon-stream.ts:289), the VS Code client.rpc or the JetBrains DaemonGateway approve, so I cannot say whether a slow or failing run (up to roughly 3 minutes per item) outlives the caller and leaves an approval reported as an error while it actually succeeded. | Record each approve client's timeout and state the worst-case flow duration against it, or cap the flow's total time per approve call and report the rest as pending. |
