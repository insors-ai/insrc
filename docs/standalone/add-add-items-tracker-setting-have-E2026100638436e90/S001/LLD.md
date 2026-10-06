<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

One setting, "Add items to tracker", on by default, turns tracker pushing on or off for a repo and is shown on the VS Code and JetBrains settings pages. When an issue record, a standalone story or its plan is approved, from a chat session, a plugin panel or the TUI, the daemon checks two things: the setting is on, and a supported tracker is set up for the project (today GitHub, named in the config or inferred from the project's remote, with the gh tool installed and signed in). If both hold, the daemon calls the tracker tool for that type, which commits and pushes the approved documents, creates or updates the item, and returns its reference; approving the build closes the item. The approval result says what was done or why nothing was. Epics, their stories and their tasks keep their existing push for now and are a separate work item; the only change to them here is that the setting can turn that push off too.

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
- FollowOnOutcome (src/workflow/gates.ts:756) gains an optional nextCall field, so the routed next step of a bugfix reaches the caller; see the data model.

### 2.2 `approve`

```typescript
approve(artifactPath: string, withTracker?: boolean, overrideReview?: string): ApproveOutcome
```

**Parameters:**
- `withTracker: boolean` _(optional)_ — Unchanged meaning: false suppresses every tracker action for this call.

**Returns:** `ApproveOutcome` — Unchanged signature; it stays synchronous. ApproveOutcome gains an optional trackerOutcome field of the new TrackerOutcome type, filled for an issue record, a standalone design, a standalone plan and a BUILD record. Its existing tracker and commit fields are unchanged and still report the existing push for an HLD, an LLD under an epic and a plan under an epic.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:156, typed in src/cli/services/index.ts:55, and used synchronously by src/cli/command.ts:223 and src/cli/panes/WorkflowsPane.tsx:116. The TUI runs in its own process and does not go through the daemon's approve handler.

**Postconditions:**
- After the approval it calls the same tracker flow function the daemon's handler calls, in its own process, for the kinds this work item covers. The flow is synchronous, so this function and its two callers stay synchronous.
- Its existing push for epic items (autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan) and its commit stay, but run only when the setting is on for the repo: the gate those three functions share (src/workflow/tracker-auto.ts:84-96) reads the setting first and returns 'skipped' when it is off.

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

Two conditions, decided by the daemon before it calls any tool. (1) The setting is on for the repo. (2) A valid, supported tracker is set up for the project. The repo is taken from the approved artifact's own record (meta.repoPath), or from a repo the request names explicitly; it is never taken from the process's working directory, and with neither the answer is 'not ready: no repo for this artifact' before any git or gh call. The tracker TYPE is the type set on the repo's entry in ~/.insrc/github.json when one is set, and otherwise is inferred from the project's git remote: a GitHub remote means github. Type is the kind of tracker (github today; others such as gitlab later), not an on or off switch: the value 'none', or a remote on a host with no supported tracker, means no supported tracker is set up, and the answer is 'not ready' with that reason. The target (owner and repo) comes from the repo's entry when it names them, otherwise from the remote; label names come from the entry, then the default entry, then the built-in defaults. Whether the tracker is usable is then asked of the tool for that type (next entry): for github, gh is installed and signed in. The check is run once per approve call and reused for every artifact in a batch. It does not call resolveGithubConfig and does not change it, so that function's other callers behave as before.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`

### 3.3 `Tracker tool, one per tracker type` — new

A tool encapsulates the whole flow for one tracker type. It is registered in the daemon's tool registry with the other built-in tools (src/daemon/tools/registry.ts, src/daemon/tools/builtins), and the daemon picks it by the project's type; adding gitlab later means adding one tool. Today there is one, for github. A tool knows nothing about workflow artifacts: the daemon passes it everything. It is code: plain git and gh calls, each with a time limit, made through one exec that a test replaces. WHAT THE DAEMON PASSES per item: the project's repo path; the target (owner/repo); the action (add-or-update, or close); the item's identity key, unique and stable (for an issue record 'issue-<first 8 of its hash>'; for a standalone story 'story-<first 8 of the hash>-<story id>'; for a task that plus the task id); the title; the body, which the daemon renders and which carries the existing hidden identity marker (idMarker in src/workflow/tracker/conventions.ts:61) with the artifact's id; the labels (the kind label and the names the project uses); the parent's ref when the item sits under another; the exact list of documents to commit and push; two commit messages; and the item's known ref when it was added before. Commit messages: 'docs(workflow): approve <artifact id>: <title>' for the documents and 'docs(workflow): record tracker ref for <artifact id> (<ref>)' for the ref. WHAT THE TOOL ANSWERS. ready: is this tracker usable for the project (for github: gh installed, then gh signed in, the sign-in call limited to 10 seconds); the answer names what is missing. addOrUpdate: commit and push exactly the listed documents (git add and git commit both name the paths; nothing to commit for those paths is not a failure; the push is a plain push of the current branch, which also sends earlier unpushed commits on it); find the item, by its known ref or else by its unique label 'insrc:<identity key>'; create it with the kind label and the unique label when not found, update its body when found; return the outcome and the ref. close: close the item by its ref. commitRef: commit and push the same documents again after the daemon has written the ref into the artifact. THE LOOKUP HAS THREE ANSWERS: found, adopt it; not found (gh ran and returned nothing), create; lookup failed (gh exited with an error or passed its time limit), stop, create nothing, report 'failed'. Today's ghFindIssueByLabels returns the same empty answer for the last two (src/workflow/tracker/github.ts:215-221), so the tool has its own lookup. A create that passes its time limit is reported as failed and NOT retried in the same run, because it may have gone through; the next run's lookup finds it by its label. The existing ghCreateIssueTyped retries untyped after any error (github.ts:164-171), so the tool does not use it for this. WHAT THE TOOL RETURNS: a TrackerOutcome, { item, status: 'created' | 'updated' | 'already-exists' | 'closed' | 'skipped' | 'failed', ref?, reason?, docs?: { committed, pushed, reason? } }. TIME. Each gh and git call has a 30 second limit. The calls block, so the daemon serves no other request while one runs; one item is about six calls, typically one to two seconds each.

**Call sites:**
- `src/daemon/tools/registry.ts`
- `src/daemon/tools/builtins`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/conventions.ts`

### 3.4 `The tracker flow` — new

One synchronous function, new in src/workflow/tracker-auto.ts, that takes the artifacts an approve call approved and returns one TrackerOutcome per tracker item. It has two callers and no other: the daemon's 'workflow.approve' handler, which calls it AFTER approveWorkflowTarget and AFTER the bugfix follow-on (src/daemon/index.ts:652 and :671), and puts its outcomes in the result's tracker[] field; and the TUI approve service, in its own process. It runs the check once, then for each artifact builds the fields above and calls the tool. BY KIND, for this work item. An ISSUE record: addOrUpdate with the record's title and its rendered markdown; when the follow-on has stamped a parent on the record (meta.parentRef) the parent's ref is passed, which is why the flow runs after the follow-on. A standalone design (an LLD with no parent Define): when the work item's issue record (the ISSUE artifact with the same hash) has a ref, addOrUpdate is NOT used; the tool adds one comment on that issue linking the design; otherwise addOrUpdate creates a story issue from the design's title and summary. A standalone plan: one addOrUpdate per task, under the story's issue or the issue record's issue; with neither on the tracker it is 'skipped' with that reason. A BUILD record: close the work item's issue and each task issue, found on the ISSUE, LLD and PLAN artifacts that share the BUILD record's hash and story id; with none found it is 'skipped: nothing on the tracker to close'. An HLD, an LLD under an epic and a plan under an epic are NOT handled by the flow: they belong to the epics work item and keep the existing push, which only the TUI runs. DEF, SPEC, CR and EXT have no outcome. RECORDING. After addOrUpdate returns a ref the flow writes it to the artifact's meta.tracker with the existing patchTrackerMeta (src/workflow/tracker/refs.ts:88), then calls the tool's commitRef. TrackerMeta (refs.ts:24-37) gains two optional fields: commentedOn, the ref of the issue a standalone design was linked on, and closedAt. What counts as tracked, so nothing is done twice: an issue record has issueRef; a standalone design has storyRef or commentedOn; a plan has taskRefs; a BUILD record has closedAt. ONE BUGFIX, ONE HASH. The close finds the issue by hash, but today a small bugfix's build has a different hash from its issue record: the routed next step is computed (advanceBugfixAfterIssue returns nextCall, src/workflow/bugfix/advance.ts:62-64) and then dropped (src/workflow/bugfix/mount.ts:140-145 keeps only kind, artifactPath, ok and note), so the build call is made by hand and the build step mints a hash from the focus text (src/mcp/build-step/phases/implement.ts:127, validate.ts:99). Two changes close this: nextAfterIssue (src/workflow/bugfix/next-after-issue.ts:52-78) puts the issue record's hash in the call it emits (standalone.epicHash on the small route, params.epicHash on the sized route), and the follow-on outcome carries that nextCall through the approve result to insrc_workflow_approve, where the steering tells the model to make exactly that call. Builds made before this keep their old hash; for them the close reports nothing to close. ONE CLOSE OWNER. The follow-on's own close leg (completeBugfixTracker, src/workflow/bugfix/mount.ts:156-166) fires only for a BUILD carrying meta.issueHash, which nothing stamps; it and its 'bugfix-complete' followOn kind are removed.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/daemon/index.ts`
- `src/cli/services/workflow.ts`
- `src/workflow/gates.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/bugfix/mount.ts`
- `src/workflow/bugfix/advance.ts`
- `src/workflow/bugfix/next-after-issue.ts`
- `src/mcp/build-step/phases/implement.ts`
- `src/mcp/build-step/phases/validate.ts`
- `src/mcp/server.ts`

### 3.5 `Pending list and backfill` — new

Two daemon requests and one new MCP tool, insrc_tracker_step, that sends them, with two phases. Phase 'pending' takes a repo and returns every approved artifact of the kinds this work item covers that is not tracked (by the rule above), parents before children, with what the flow would do for each, or the reason the check fails; an item whose BUILD record is approved is marked finished. It changes nothing; it is the backfill's dry run. Phase 'run' takes a repo and runs the flow on those items one at a time, as a stream request with one progress frame per item, yielding to the event loop between items; a finished item is created and closed at once. It is safe to run twice. A bugfix built before the one-hash change cannot be matched to its build; the list marks it 'completion unknown', and the run creates it and leaves it open. Adding a tool means the registered-tool tests (src/mcp/__tests__/schema-registry.test.ts: the expected tool list and the expected phases) and the steering's table of registered tools must list it.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/prompts/steering-block.md`

### 3.6 `What the workflow says about the tracker` — new

The result of insrc_workflow_approve carries tracker[] and, for a bugfix, the next call. The tool's description and the steering source (src/prompts/steering-block.md, its tracker and bugfix guides and its tool table, and the plugin copy vscode-plugin/assets/steering-block.md) say: the daemon adds, updates and closes tracker items and pushes their documents when an item is approved; the model relays each outcome and its reason, never runs gh or commits the artifacts for this itself, and, after approving an issue record, makes exactly the next call the result gives. They also say what is covered now (issue records, standalone stories and their tasks, completion) and that epic items are still pushed only by the TUI. The done response of insrc_workflow_step, whose pendingApproval block is built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a line saying whether approving this artifact will add it to the tracker, or why not; working that out makes no call that changes anything.

**Call sites:**
- `src/mcp/server.ts`
- `src/prompts/steering-block.md`
- `vscode-plugin/assets/steering-block.md`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/mcp/workflow-step/types.ts`

## 4. Error paths

**Error cases**

- **No repo can be found for the approved artifact.** (recoverable)
  - Detection: The artifact's record has no repo path and the request names none.
  - Response: 'skipped: no repo for this artifact', before any git or gh call. The process's working directory is never used.
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
  - Detection: Each of its two callers wraps it in a try and catch.
  - Response: A 'failed' outcome with the message. The approval has already completed and is not affected.
  - User impact: One failed line in the result.
- **The backfill run stops part of the way through.** (recoverable)
  - Detection: The stream ends without its final frame, or an item fails.
  - Response: Items already recorded keep their refs; a second run continues with the rest.
  - User impact: A partial result; a second run finishes it.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every outcome is 'skipped: the setting is off' and no git or gh call is made, from a session, a plugin panel or the TUI. The TUI's existing push of epic items is skipped too. |
| A repo with no entry in github.json and a GitHub remote. | The type is inferred as github and the target is the remote; issue items are tracked. Epic items in that repo are still not pushed by the TUI, because its existing push resolves its own config; that belongs to the epics work item. |
| A repo whose github.json entry says type 'none', or whose remote is on a host with no supported tracker. | No supported tracker is set up: 'skipped' with that reason. The setting stays the only on and off switch. |
| An item whose ref is on its record is approved again. | 'already-exists' with the ref; its body is not changed and nothing is created. |
| An item that is on GitHub but whose record has no ref. | The lookup finds it by its unique label; it is adopted, the ref recorded and committed. Nothing is created. |
| A bugfix whose issue record is located under an epic or story. | The follow-on stamps the parent first; the flow then creates the issue under the parent's issue. When the parent is not on the tracker the issue is created with no parent. |
| A standalone design whose issue record is already on the tracker. | One comment linking the design is added to that issue and commentedOn is recorded; approving it again adds no second comment. |
| A standalone plan. | One task issue per task under the story's or the issue record's issue; approving the build later closes them. |
| A BUILD record whose Story has nothing on the tracker. | 'skipped: nothing on the tracker to close'. |
| An HLD, an LLD under an epic or a plan under an epic is approved in a chat session or a plugin panel. | No tracker outcome from this work item, as today. |
| A batch approval. | One outcome per covered artifact, in the order approved, run one after another. |
| The working tree holds other staged or uncommitted files. | Only the listed documents are committed, because both git add and git commit name them. The push sends the current branch, including earlier unpushed commits on it. |
| A document that was committed and pushed earlier (every backfill item). | Nothing to commit is not a failure; the tool goes on to the lookup. |
| A finished item in the backfill. | Created and closed at once. |
| The TUI approves with withTracker false. | No tracker flow and no existing push. |

**Invariants to preserve**

- An approval is never failed, undone or delayed past its stamp by the tracker: the flow runs after the approval and the follow-on are complete. [[c1]]
- resolveGithubConfig and the tracker.push, tracker.sync and tracker.post workflows behave as before. [[c2]]
- The epic pushes keep their behaviour when the setting is on; the TUI approve service stays synchronous. [[c7]]
- A ref is written to an artifact only by code, and an item that is tracked is never created again. [[c3]]
- gh is never run by a test, and never by the model in the session for this flow. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]
- A work item's tracker issue is closed by one piece of code only. [[c5]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, on every approval surface, and is shown on the VS Code and JetBrains settings pages`, `ac2: the check before any action is the setting plus a supported tracker set up for the project, its type set or inferred, its repo never guessed`, `ac3: on approval the daemon calls the tool for the project's tracker type, which pushes the documents, creates or updates the item and returns its ref; the build's approval closes it`, `ac4: an item is never created twice, and a failed or timed-out call never leads to a create`, `ac5: a skipped or failed tracker action never affects the approval and always says why; the result, the steering and the workflow messages report it and tell the model not to run gh`, `ac6: a pending list and a backfill run add the approved items never pushed, and create and close the finished ones`
- **unit** — The setting and the check.
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true, group Tracker, with its wording in desc; the row count in the catalog contract test is updated`, `T3 the repo comes from the artifact's record, else from a repo the request names; with neither the answer is 'no repo for this artifact' and no git or gh call is made, whatever the process's working directory`, `T4 the type is the one set on the repo's entry, else inferred from the remote; a GitHub remote gives github; type 'none', an unknown type and a remote on another host give 'no supported tracker'; the target and labels come from the entry, then the remote and the defaults; resolveGithubConfig is not called`, `T5 with the setting off no tool is asked anything; the check runs once for a batch`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG`, `the setting reader's module-level seam`, `a recording fake for the tool's one exec`
- **unit** — The github tool, with git and gh faked.
  - Subjects: `T6 ready: gh missing, gh not signed in, and a sign-in call that passes 10 seconds each give their own reason`, `T7 addOrUpdate commits only the listed paths (both git add and git commit name them) with the given message, treats nothing-to-commit as done, pushes, then looks up, then creates with the kind label and the unique label and the identity marker in the body`, `T8 the lookup's three answers: found adopts and creates nothing; not found creates; lookup failed (error or time limit) creates nothing and is 'failed'`, `T9 a create that passes its time limit is 'failed' and is not retried in the same run; the next run finds the item by its label and adopts it`, `T10 a known ref gives 'already-exists' with no create; update changes the body of a found item; close closes by ref; commitRef commits and pushes the same paths with the second message`, `T11 a git failure in the first commit or push stops the tool before any gh call`
- **integration** — The flow, for each kind, with the tool faked.
  - Subjects: `T12 an approved issue record is passed with its fields, its ref recorded and committed; with a stamped parent the parent's ref is passed`, `T13 a standalone design comments on the issue record's issue when it has a ref and records commentedOn, otherwise creates a story issue; a second approval does neither again`, `T14 a standalone plan creates one task per task under the story's or the issue record's issue, and is 'skipped' with neither on the tracker`, `T15 a BUILD record closes the issue and the tasks of the same hash and story and records closedAt; with nothing to close it is 'skipped'`, `T16 an HLD, an LLD under an epic, a plan under an epic, a DEF, a SPEC, a CR and an EXT give no outcome`, `T17 an item on GitHub with no ref on its record, an issue record and a standalone story alike, is adopted and recorded and nothing is created; after a ref is recorded the pending list no longer shows it`
  - Fixtures: `temp repos with issue records, standalone designs, plans and BUILD records`, `a tool fake that records what it is passed`
- **integration** — Every approval surface, and the bugfix chain.
  - Subjects: `T18 the daemon's workflow.approve result carries tracker[], filled after the follow-on, through to insrc_workflow_approve; a flow that throws leaves the approval result intact`, `T19 the TUI approve service fills trackerOutcome for the covered kinds, stays synchronous, and with withTracker false does nothing`, `T20 with the setting off the TUI's existing push of an HLD, an LLD under an epic and a plan is skipped and makes no gh call; with it on that push behaves as before`, `T21 after an issue record is approved, the result carries the next call with the issue's hash, on the small route and the sized route; following it, the BUILD record shares the hash and its approval closes the issue`, `T22 the follow-on no longer has a close leg, and followOn has no 'bugfix-complete' entry`, `T23 the existing suites that approve an artifact on a temp repo issue no command whose name is gh: they run under one shared helper that sets the setting reader to true and installs the recording fake, which throws for `git remote get-url` as a repo with no remote does`
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
| `ac3` | `T7`, `T10`, `T12`, `T13`, `T14`, `T15`, `T18`, `T19`, `T21`, `T31` |
| `ac4` | `T8`, `T9`, `T17` |
| `ac5` | `T11`, `T16`, `T18`, `T23`, `T26`, `T27` |
| `ac6` | `T24`, `T25`, `T32` |

## 6. Migration

**State before:** Only the TUI pushes to GitHub, by code, for an HLD, an LLD under an epic and a plan, and only when ~/.insrc/github.json has an entry for the repo. An approved issue record never reaches GitHub, and a standalone story cannot be pushed. An approval from a chat session or a plugin panel pushes nothing. No setting turns tracking on or off. A small bugfix's build has a different hash from its issue record, and the routed next step after an issue approval is computed and dropped.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off on every surface. When an issue record, a standalone design or plan, or their BUILD record is approved, the daemon (or the TUI in its own process) runs one flow that checks the setting and the project's tracker, picks the tool for the tracker type, and has it push the documents and create, update or close the item. A bugfix keeps one hash from issue record to BUILD record. A pending list and a backfill run cover what was never pushed. Epic items are unchanged except that the setting can turn their existing push off.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row (wording in desc) and its per-repo reader with its test seam. — ↩ rollbackable
2. Add the github tracker tool to the daemon's tool registry: ready, addOrUpdate with the three-answer lookup, close, commitRef, each call time-limited; add the two optional tracker fields; add the shared test helper. — ↩ rollbackable
3. Add the check (setting, repo, type set or inferred, target) and the tracker flow for an issue record, a standalone design, a standalone plan and a BUILD record. Nothing calls it yet. — ↩ rollbackable
4. Call the flow from the daemon's approve handler after the follow-on and return tracker[]; call it from the TUI approve service; make the shared gate of the three existing pushes read the setting. Put the existing approval suites on the shared helper. — ↩ rollbackable
5. Give a bugfix one hash: put the issue record's hash in the next call, carry the next call on the follow-on outcome through to insrc_workflow_approve, and remove the follow-on's dead close leg. — ↩ rollbackable
6. Add the insrc_tracker_step tool with its pending and run phases and their daemon requests; update the registered-tool tests. — ↩ rollbackable
7. Add the tracker line to the pendingApproval block of insrc_workflow_step; rewrite the steering's tracker and bugfix guides and tool table and the tool descriptions; refresh the plugin copy. — ↩ rollbackable
8. Show the setting on the VS Code and JetBrains settings pages. — ↩ rollbackable
9. After the daemon is updated: show the pending list for this repo to the user and, on their go-ahead, run the backfill. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the pending list`)_

**Backward compat:** approveWorkflowTarget is unchanged; WorkflowApproveResult gains an optional tracker[] and FollowOnOutcome an optional nextCall and loses the 'bugfix-complete' kind, which nothing produced. The TUI approve service keeps its signature and stays synchronous; its result gains an optional field. resolveGithubConfig, the three push functions' signatures and the tracker workflows are unchanged. The tracker meta gains two optional fields; nothing stored is rewritten. One new MCP tool and two daemon requests are added. What changes for the user: (1) with the setting on (the default) and gh signed in, approving an issue record, a standalone design or plan commits and pushes those documents and creates a GitHub item, for any repo with a GitHub remote; (2) with the setting off, the TUI's existing push of epic items is off too; (3) after an issue approval the bugfix's design, plan and build are filed under the issue's hash; builds made earlier keep their old hash.

## 7. Alternatives considered

### 7.1 a1: A tracker tool per type, called by the daemon after approval — **CHOSEN**

The daemon checks the setting and the project's tracker, picks the tool for its type, and passes it everything; the tool encapsulates the flow.

Add the one setting and a check (setting on, a supported tracker set up, its type set or inferred from the remote, its repo taken from the artifact). Register one tool per tracker type in the daemon's tool registry; the github tool commits and pushes the listed documents, looks the item up by a unique label with a three-answer result, creates, updates or closes it, and returns the ref. One flow function builds the tool's inputs from an approved artifact and records the ref; the daemon's approve handler calls it after the bugfix follow-on and the TUI calls the same function. This work item covers issue records, standalone stories, their tasks and completion.

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

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 1 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T08:49:00.926Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | HIGH | The tracker tool is registered in the daemon's existing tool registry (src/daemon/tools/registry.ts, builtins) and called by ONE SYNCHRONOUS flow function that both the daemon handler and the TUI (in its own process) call; the tool answers ready / addOrUpdate / close / commitRef and returns a TrackerOutcome. | The registry's contract does not have that shape. src/daemon/tools/types.ts:151: `execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult>;` — one async entry point, returning `{ output: string; format; success; error?; data? }` (lines 33-48), and requiring ToolDeps `{ sessionId, repoPath, send, requestId, ... }` (lines 50-81). A synchronous flow cannot obtain a result from a Promise-returning execute, so either the flow becomes async (and the TUI approve() at src/cli/services/workflow.ts:156, used synchronously at src/cli/command.ts:223 and src/cli/panes/WorkflowsPane.tsx:116, cannot stay synchronous) or the tool is not called through the registry. Also the registry is only populated in the daemon (src/daemon/index.ts:310-311) and the MCP server (src/mcp/server.ts:1251); nothing in src/cli registers builtins, so a lookup by type in the TUI process finds no tool. [files: src/daemon/tools/types.ts, src/daemon/tools/registry.ts, src/daemon/index.ts, src/cli/services/workflow.ts, src/cli/command.ts, src/cli/panes/WorkflowsPane.tsx] | Decide and state one of: (a) the tracker tool is a plain synchronous module with its own per-type map (not a daemon/tools Tool), optionally wrapped by a thin registered Tool for discoverability; or (b) it is a real registered Tool, the flow is async, and the TUI approve() and its two callers become async. Either way say how the TUI process gets the tool. |
| change-sites | HIGH | Calling the flow in the daemon's 'workflow.approve' handler after approveWorkflowTarget (index.ts:652) and after the bugfix follow-on (index.ts:671) covers approvals from a chat session and from both plugin panels. | Between those two lines the handler returns early: src/daemon/index.ts:667-669 `if (result.approved.length === 0 \|\| repoPath.length === 0) { return result; }`, where repoPath is `p.repo ?? process.env['INSRC_REPO'] ?? ''` (line 645). The VS Code review panel sends no repo: vscode-plugin/src/chat/docs-review-client.ts:119-121 `client.rpc('workflow.approve', { artifactPath: resolvePath(idOrPath) })`. So a VS Code panel approval leaves the handler before line 671 and a flow placed 'after the follow-on' never runs for it (JetBrains does pass repo: DaemonGateway.kt:943-945). The design neither mentions this early return nor lists the VS Code client as a change site. [files: src/daemon/index.ts, vscode-plugin/src/chat/docs-review-client.ts] | State that the flow runs on every exit of the handler where approved[] is non-empty, including the no-repo path (the flow resolves the repo itself from the artifact), and that the follow-on is simply skipped there; or have the VS Code client send the workspace repo and list docs-review-client.ts as a change site. Add a T18 case for an approve request carrying only artifactPath. |
| data-compatibility | HIGH | The repo for the check is taken from the approved artifact's own record (meta.repoPath) or from a repo the request names, and this works for every covered kind on every surface, including a BUILD record approved from the TUI (ApproveOutcome.trackerOutcome is 'filled for ... a BUILD record'). | BUILD records do not store repoPath. The BuildRecord meta type (src/workflow/runners/build/standalone-record.ts:47-75) has workflow, standalone, sizeClass, epicHash, storyId, createdAt, updatedAt, authoredBy, approvedAt... and no repoPath; the validate writer builds `meta: { workflow: 'build', epicHash, storyId, createdAt: now, updatedAt: now, authoredBy: 'controller', ... }` (src/mcp/build-step/phases/validate.ts:226-234). On disk, `"repoPath"` appears in 1 of the BUILD-*.json files under .insrc/artifacts. The TUI approve takes only a path (`approve(artifactPath, withTracker, overrideReview)`, workflow.ts:156; command.ts:223 passes `rest[0], true, override`) and the VS Code panel sends only artifactPath (docs-review-client.ts:121). On those surfaces a BUILD approval has neither source, so by the design's own rule the answer is 'no repo for this artifact' and the issue is never closed. ISSUE / LLD / PLAN artifacts do carry it (ArtifactMetaBase.repoPath, src/workflow/types.ts:299-302). [files: src/workflow/runners/build/standalone-record.ts, src/mcp/build-step/phases/validate.ts, src/cli/services/workflow.ts, vscode-plugin/src/chat/docs-review-client.ts, src/workflow/types.ts] | Say how the repo is found for a BUILD record: stamp meta.repoPath on BUILD records going forward and, for existing ones, derive it from the artifact's location (<repo>/.insrc/artifacts/BUILD-*.json) or from the sibling ISSUE/LLD of the same hash; or have the TUI and VS Code approve pass the repo. Add the BUILD-from-TUI case to T19 and T3. |
| current-behaviour | MED | The TUI's existing epic push AND its commit run only when the setting is on, because the gate the three push functions share reads the setting first (section 2.2); with the setting off no git or gh call is made from the TUI (edge-case table). | The commit does not go through gate(). approve() calls commitApprovedArtifacts(approval) unconditionally at src/cli/services/workflow.ts:166; that function (lines 90-118) does its own `const cfg = resolveGithubConfig(repoPath); if (cfg.type !== 'github' \|\| cfg.commitArtifacts === false) return undefined;` and then commitAndPushArtifacts(...) which runs git add / commit / push (src/workflow/tracker/github.ts:63-85). Putting the setting read in tracker-auto.ts gate() leaves this commit and push running with the setting off. [files: src/cli/services/workflow.ts, src/workflow/tracker/github.ts, src/workflow/tracker-auto.ts] | Name commitApprovedArtifacts as a change site: read the setting there too (or skip it in approve() when the setting is off), and make T20 assert no git call as well as no gh call. |
| new-versus-reuse | MED | Creating and closing a GitHub issue for an approved issue record is new, and after removing the mount's close leg a work item's issue is closed by one piece of code only (invariant c5). | A create + link + record + close implementation for issue records already exists and the design never mentions it: src/workflow/bugfix/tracker.ts exports createBugfixTrackerIssue (lines 142-188: resolves config, creates via ghCreateIssueTyped, links under meta.parentRef, records meta.tracker.issueRef) and closeBugfixTrackerIssue (lines 266-287), with defaultTrackerCreateDeps / defaultTrackerCloseDeps; src/workflow/bugfix/advance.ts:63-70 calls `opts.tracker.createTrackerIssue(...)` when AdvanceTrackerDeps are injected, and advance.ts:79-88 exports completeBugfixTracker. The design removes only the mount's leg (mount.ts:156-166) and lists advance.ts as a call site without saying what happens to these. Left as is, a second creator (using the retry-untyped create and no unique label) and a second closer stay exported and tested (src/workflow/__tests__/bugfix-tracker.test.ts). [files: src/workflow/bugfix/tracker.ts, src/workflow/bugfix/advance.ts, src/workflow/bugfix/mount.ts] | State the fate of createBugfixTrackerIssue, closeBugfixTrackerIssue, completeBugfixTracker and the AdvanceTrackerDeps leg in advance.ts: delete them with their tests, or keep them and explain why c5 still holds. Add them to the change-site list. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | addOrUpdate can 'create it with the kind label and the unique label insrc:<identity key>' with no stated step that creates those labels first, and a failure there is covered by the listed error cases. | The design does not say which gh verb the tool's own create uses, nor that labels are created beforehand. The existing code always creates labels before creating an issue (`ghCreateLabel(..., '--force')` at src/workflow/tracker-auto.ts:129-131 and 289-291, defined at tracker/github.ts:122-129), which suggests a create with an unknown label is not relied on. Whether `gh issue create --label <new>` or `gh api POST .../issues -f labels[]=<new>` accepts a label that does not exist yet cannot be confirmed from the repo; it needs a run against GitHub, which I did not do. If it is rejected, every first create fails with 'failed' and the per-item unique label can never be applied. [files: src/workflow/tracker-auto.ts, src/workflow/tracker/github.ts] | State the create verb and add an explicit, idempotent label-create step (kind label and the unique label) before the create, with its failure mapped to 'failed'; cover it in T7. Confirm the behaviour in the live run T31. |
