<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

One setting, "Add items to tracker", on by default, turns tracker pushing on or off for a repo and is shown on the VS Code and JetBrains settings pages. When an issue record, a standalone story or its plan is approved, the daemon checks two things: the setting is on, and a supported tracker is set up for the project (today GitHub, named in the config or inferred from the project's remote, with the gh tool installed and signed in). If both hold, the daemon calls the tracker tool's implementation for that type, which commits and pushes the approved documents, creates or updates the item, and returns its reference; approving the build closes the item. The same tracker tool is a normal insrc tool that Claude, Codex or any other agent can call, to push one item, list what is pending, or run the backfill. Every approval surface goes through the daemon: the chat session, both plugin panels, and now the TUI, which keeps no approval, rejection, push or commit logic of its own: approving an artifact, rejecting one, and approving or rejecting an amendment are each one daemon request. The approval result says what was done or why nothing was. Epics, their stories and their tasks are a separate work item; until it lands they are pushed only by the explicit tracker.push workflow.

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
- Both callers read the old result and are rewritten to show the daemon's answer: the approve command (src/cli/command.ts:223-226) and doApprove in the Workflows pane (src/cli/panes/WorkflowsPane.tsx:116-117) show what was approved, what was withheld and why, what the bugfix follow-on did, and each tracker outcome. A review block no longer arrives as a thrown ReviewBlockedError (command.ts:226) but as an entry in skipped[] with nothing approved; both callers render it with the same override hint as today. doApprove, a synchronous handler today, becomes asynchronous so its error handling still covers the request.
- The service interface (src/cli/services/index.ts:55) declares the Promise. Four TUI test fakes return the old synchronous result and are rewritten to a Promise of the daemon's result shape: the shared default context (src/cli/__tests__/command.test.ts:50), the --override test (command.test.ts:220-230, which reads the approval from the result), the review-block test (command.test.ts:232-241) and the fake behind the rendered Workflows pane (src/cli/__tests__/tui.test.ts:72). The type check does not cover test files, so these are found only by running them.
- The three push functions stay in src/workflow/tracker-auto.ts with no caller, for the epics work item to build on or replace. Until then an epic, its stories and its tasks are pushed only by the explicit tracker.push workflow, which is not changed.
- A fifth test calls the REAL TUI approve: T7 of src/workflow/__tests__/other-party-review-gate.test.ts (:254-272, import at :20) calls it synchronously and reads `approval` from its result. It is rewritten to give the service a fake daemon client and assert that the service sends one workflow.approve request carrying the absolute path (a relative one typed by the user is made absolute against the TUI's working directory first) and the override reason, and nothing else (no repo: the daemon finds it from the path; no approver: the request has no such field), and returns the daemon's answer unchanged, including a blocked artifact in skipped[]; the gate rules themselves stay proven by that file's other tests against the daemon-side function. Two comments in src/workflow/gates.ts go stale and are corrected: :801-802 ("that stays in the cli-services approve() used by the TUI") and :833 ("the TUI calls it directly").

### 2.3 `reject`

```typescript
reject(artifactPath: string, reason: string): Promise<RejectionResult>
```

**Returns:** `Promise<RejectionResult>` — CHANGED. Sends the daemon's 'workflow.reject' request with the absolute path and the reason and returns the daemon's answer; it no longer stamps the record in the TUI's process. It becomes asynchronous.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:171; today it calls rejectArtifactByJsonPath in process.

**Postconditions:**
- Callers await it: src/cli/command.ts:234 and src/cli/panes/WorkflowsPane.tsx:128.
- A relative path is made absolute against the TUI's working directory before sending.

### 2.4 `approveAmendmentById / rejectAmendmentById`

```typescript
approveAmendmentById(repoPath, amendmentId, approvedBy): Promise<AmendmentRecord>; rejectAmendmentById(repoPath, amendmentId, reason): Promise<AmendmentRecord>
```

**Returns:** `Promise<AmendmentRecord>` — CHANGED. Each sends its daemon request ('workflow.amendment.approve', 'workflow.amendment.reject') and returns the daemon's answer; neither touches the amendment store in the TUI's process. Both become asynchronous.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:271-277; today they call the amendment store in process.

**Postconditions:**
- The one caller awaits them: src/cli/panes/WorkflowsPane.tsx:119 and :129.

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

Two conditions, decided by the daemon before it calls any tool. (1) The setting is on for the repo. (2) A valid, supported tracker is set up for the project. The repo is the REGISTERED repo that contains the artifact's path: every artifact lives inside its repo, under .insrc/artifacts or docs, and the daemon holds the repo registry (listRepos in src/db/repos.ts), so the daemon matches the artifact's path against the registered repos and takes the one that contains it, the longest match when repos are nested. This works the same for every kind, including a BUILD record, whose own record stores no repo path (src/workflow/runners/build/standalone-record.ts:47-75), and for a request that carries only a path. The repo is never taken from the request's optional repo field or from the process's working directory. When no registered repo contains the path the answer is 'not ready: the artifact is not inside a registered repo', before any git or gh call. The tracker TYPE is the type named on the repo's entry in ~/.insrc/github.json, else the type named on the file's default entry, else it is inferred from the project's git remote: a GitHub remote means github. Type is the kind of tracker (github today; others such as gitlab later), never an on or off switch. The value 'none', in a repo's entry or in the default entry, is read as 'no type named', so the type is then inferred from the remote; today 'none' turns the tracker off (resolveGithubConfig, src/workflow/config/github.ts:204-210 and :234), and that meaning is retired for this flow. The project is 'not ready' only when no supported tracker can be found for it: the named type has no tool, or nothing is named and the remote is on a host with no supported tracker. Two other switches in that file are retired for this flow as well and are not read by it: commitArtifacts (github.ts:80) and pushTasks (github.ts:77). With the setting on, the documents are always pushed and every task is tracked; the one setting decides. The target (owner and repo) comes from the repo's entry when it names them, otherwise from the remote; label names come from the entry, then the default entry, then the built-in defaults. Whether the tracker is usable is then asked of the tool for that type (next entry): for github, gh is installed and signed in. The check is run once per approve call and reused for every artifact in a batch. It does not call resolveGithubConfig and does not change it, so that function's other callers behave as before.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`
- `src/db/repos.ts`
- `src/daemon/index.ts`

### 3.3 `Tracker tool, one per tracker type` — new

ONE tracker tool, with one implementation per tracker type. The tool is a normal insrc MCP tool, insrc_tracker, registered in src/mcp/server.ts with the other insrc_* tools, so Claude, Codex and any other agent that speaks MCP can call it; like every insrc tool it forwards to the daemon, where the implementation lives. It is NOT put in the daemon's internal list of built-in tools (src/daemon/tools): nothing in that list reaches a coding agent, and the only model that sees any of it is the daemon's analysis model, through a fixed read-only allowlist (src/analyze/context/tool-surface.ts:69-153) that a writing tool must not join. There are two ways in and one implementation. The daemon calls the implementation itself, in process, after every approval (the tracker flow, next entry). An agent calls insrc_tracker, whose requests are: status (is the tracker ready for this repo, and if not why), push (run the flow for one approved artifact, given its path), pending (list approved items not yet tracked), and backfill (run the flow over the pending items). Each is one daemon request; backfill is a stream request with one progress frame per item. The checks live inside the implementation (the setting is on, a supported tracker is set up for the repo, the tracker is usable), so a direct call by an agent is held to the same rules as an approval. The implementation for a type is a module the daemon selects by the project's type from one small map (type to implementation); adding gitlab later means adding one implementation and one map entry. Today there is one, for github. An implementation knows nothing about workflow artifacts: the flow passes it everything. It is code: plain git and gh calls, each with a time limit, made through one exec that a test replaces. The calls do NOT block the daemon: each command runs without holding the event loop, so plugins, indexing and other sessions are served while a push is slow. WHAT THE DAEMON PASSES per item: the project's repo path; the target (owner/repo); the action (add-or-update, or close); the item's identity key, unique and stable (for an issue record 'issue-<first 8 of its hash>'; for a standalone story 'story-<first 8 of the hash>-<story id>'; for a task that plus the task id); the title; the body, which the daemon renders and which carries the existing hidden identity marker (idMarker in src/workflow/tracker/conventions.ts:61) with the artifact's id; the labels (the kind label and the names the project uses); the parent's ref when the item sits under another; the exact list of documents to commit and push; two commit messages; and the item's known ref when it was added before. Commit messages: 'docs(workflow): approve <artifact id>: <title>' for the documents and 'docs(workflow): record tracker ref for <artifact id> (<ref>)' for the ref. WHAT AN IMPLEMENTATION ANSWERS. ready: is this tracker usable for the project (for github: gh installed, then gh signed in, the sign-in call limited to 10 seconds); the answer names what is missing. addOrUpdate: commit and push exactly the listed documents (git add and git commit both name the paths; nothing to commit for those paths is not a failure; the push is a plain push of the current branch, which also sends earlier unpushed commits on it); find the item, by its known ref or else by its unique label 'insrc:<identity key>'; when not found, first create the two labels it needs, the kind label and the unique label, with an idempotent label create, since a create naming a label that does not exist yet may be rejected, and then create the item with both labels; when found, update its body; return the outcome and the ref. A label create that fails is a 'failed' outcome with no item created. comment: add one comment to an existing item by its ref. close: close the item by its ref. commitRef: commit and push the same documents again after the daemon has written the ref into the artifact. THE LOOKUP HAS THREE ANSWERS: found, adopt it; not found (gh ran and returned nothing), create; lookup failed (gh exited with an error or passed its time limit), stop, create nothing, report 'failed'. Today's ghFindIssueByLabels returns the same empty answer for the last two (src/workflow/tracker/github.ts:215-221), so the tool has its own lookup. A create that passes its time limit is reported as failed and NOT retried in the same run, because it may have gone through; the next run's lookup finds it by its label. The existing ghCreateIssueTyped retries untyped after any error (github.ts:164-171), so the tool does not use it for this. WHAT THE TOOL RETURNS: a TrackerOutcome, { item, status: 'created' | 'updated' | 'already-exists' | 'closed' | 'skipped' | 'failed', ref?, reason?, docs?: { committed, pushed, reason? } }. TIME. Each gh and git call has a 30 second limit; one item is about eight calls, typically one to two seconds each.

**Call sites:**
- `src/mcp/server.ts`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/conventions.ts`
- `src/prompts/steering-block.md`
- `src/analyze/context/tool-surface.ts`

### 3.4 `The tracker flow` — new

One asynchronous function, new in src/workflow/tracker-auto.ts, that takes the artifacts an approve call approved and returns one TrackerOutcome per tracker item. It runs only in the daemon. The steps that follow an approval are moved out of the 'workflow.approve' handler, which is an inline block in the daemon's startup file that no test can call (src/daemon/index.ts:643-677), into ONE exported function with its collaborators passed in (the repo registry, the tracker implementation, the bugfix follow-on), the way the follow-on itself was separated into src/workflow/bugfix/mount.ts. That function runs the follow-on, then awaits the flow, honours the request's tracker: false, works the same whether or not the request named a repo, catches any error from the flow, and puts the outcomes in the result's tracker[] field; the handler only calls it. It must run on EVERY path out of that handler where something was approved. THE DAEMON FINDS THE REPO, ONCE, FOR EVERYTHING. Today the handler returns early when the request names no repo (index.ts:667-669), before the follow-on, and passes the request's possibly empty repo path into the code-review gate and the BUILD-record step (gates.ts:821, :854); the VS Code review panel and the TUI send only the artifact's path (vscode-plugin/src/chat/docs-review-client.ts:119-121, src/cli/command.ts:223). That early return goes. For a request that names an artifact path, the handler finds the registered repo that contains the path, before approving, and that one repo is what the approval's own gates, the follow-on and the flow all use; the request's repo field is not used. So an approval from the TUI or a review panel stamps the bugfix parent, returns the next call and runs the flow exactly as an approval from chat does. A path inside no registered repo is refused before anything is stamped, naming the path. THE PATH IS ABSOLUTE. The registry matches by prefix on absolute paths (src/db/repos.ts:233-241), and the daemon's working directory is not the user's, so a relative path cannot be looked up there. Today the TUI resolves the typed path in its own process (jsonPathForMd, gates.ts:973-990), and that only works for a path that contains `/docs/epics/` or `/docs/standalone/` with the leading slash (repoRootFromDocsPath, gates.ts:1014-1021): an absolute path or `./docs/...` is accepted, and a bare `docs/...` is refused with 'Path is not under docs/epics|standalone/' (gates.ts:992-996). The example in docs/workflow.md:133 (`docs/defines/DEF-<h16>.md`) is the old layout and is refused the same way; it is corrected with the rest of that guide. NEW BEHAVIOUR: the TUI approve service resolves any typed relative path with path.resolve against the TUI's working directory before it sends the request, so a bare `docs/...` now works. That is the form of the argument, not approval logic. The daemon refuses a relative artifact path from any client, naming it and saying an absolute path is required, and never resolves one against its own working directory. A request that names an epic hash and no path has no path to look up, so it must name the repo, and the daemon checks that repo is registered. The handler honours a tracker: false field in the request by not running the flow. The flow runs the check once, then for each artifact builds the fields above and calls the tool, one artifact after another. TIME BUDGET: the flow has 5 minutes in total per approve request, enough for a slow connection. When the budget runs out the remaining items are not attempted; each is reported 'skipped: time budget reached' and stays in the pending list. The approval itself is always reported as approved. Every client that waits for an approve request must wait longer than the budget. None of the four sets a time limit on this request today, so nothing needs raising: the session tool server's unaryRpc sets no timer (src/mcp/daemon-stream.ts:204-238); the TUI's rpc is a re-export (src/cli/client.ts:6) of src/shared/ipc-client.ts, which sets none; the VS Code panel uses that same shared client (vscode-plugin/src/chat/docs-review-client.ts:17, :119); and the JetBrains socket client (jetbrains-plugin/.../daemon/UnixSocketDaemonRpc.kt, behind DaemonGateway.kt) sets none. The build confirms each by reading it, and a limit added to any of them later must stay above 5 and a half minutes for this request, so an approval is never shown as failed while the daemon is still working. BY KIND, for this work item. An ISSUE record: addOrUpdate with the record's title and its rendered markdown; when the follow-on has stamped a parent on the record (meta.parentRef) the parent's ref is passed, which is why the flow runs after the follow-on. A standalone design (an LLD with no parent Define): when the work item's issue record (the ISSUE artifact with the same hash) has a ref, addOrUpdate is NOT used; the tool adds one comment on that issue linking the design; otherwise addOrUpdate creates a story issue from the design's title and summary. A standalone plan: one addOrUpdate per task, under the story's issue or the issue record's issue; with neither on the tracker it is 'skipped' with that reason. A BUILD record: close the work item's issue and each task issue, found on the ISSUE, LLD and PLAN artifacts that share the BUILD record's hash and story id; with none found it is 'skipped: nothing on the tracker to close'. A standalone design linked on its issue record's issue uses the tool's comment request. An HLD, an LLD under an epic and a plan under an epic are NOT handled by the flow: they belong to the epics work item. DEF, SPEC, CR and EXT have no outcome. RECORDING. After addOrUpdate returns a ref the flow writes it to the artifact's meta.tracker with the existing patchTrackerMeta (src/workflow/tracker/refs.ts:88), then calls the tool's commitRef. TrackerMeta (refs.ts:24-37) gains two optional fields: commentedOn, the ref of the issue a standalone design was linked on, and closedAt. What counts as tracked, so nothing is done twice: an issue record has issueRef; a standalone design has storyRef or commentedOn; a plan has taskRefs; a BUILD record has closedAt. ONE BUGFIX, ONE HASH. The close finds the issue by hash, but today a small bugfix's build has a different hash from its issue record: the routed next step is computed (advanceBugfixAfterIssue returns nextCall, src/workflow/bugfix/advance.ts:62-64) and then dropped (src/workflow/bugfix/mount.ts:140-145 keeps only kind, artifactPath, ok and note), so the build call is made by hand and the build step mints a hash from the focus text (src/mcp/build-step/phases/implement.ts:127, validate.ts:99). Two changes close this: nextAfterIssue (src/workflow/bugfix/next-after-issue.ts:52-78) puts the issue record's hash in the call it emits (standalone.epicHash on the small route, params.epicHash on the sized route), and the follow-on outcome carries that nextCall through the approve result to insrc_workflow_approve, where the steering tells the model to make exactly that call. The emitted call is only the build's first turn, implement; its second turn, validate, is composed separately and mints a hash again when none is given (validate.ts:99), which would write a second BUILD record under a different hash. So the implement response states the hash and says validate must repeat it, and the steering says the same. For a validate call that still arrives without a hash the rule is exact, because a bugfix build and an ordinary small build look the same to the build step (both are a trivial standalone context with a focus, and every such build uses story S001), and for an ordinary one minting the hash from the focus is correct and must keep working. The implement turn already writes the BUILD record with the task's focus stored on it (src/mcp/build-step/phases/implement.ts:155-164). validate, given no hash, looks for BUILD records that are not yet approved and whose stored focus equals the call's focus. Both sides are compared after the same normalisation: implement stores the focus trimmed (implement.ts:119), validate reads it raw today (validate.ts:99), and a bugfix focus is the issue's title, reproduction, root cause and fix intent joined together (next-after-issue.ts:42-47), so it ends in whitespace whenever the fix intent does. validate therefore trims the call's focus through the one helper implement uses before it compares or mints. Then: with exactly one it uses that record's hash (the bugfix case, whose implement call was given the issue's hash); with none it mints the hash from the focus as today (the ordinary small build, unchanged); with more than one it refuses and names the matching records. Builds made before this keep their old hash; for them the close reports nothing to close. ONE CREATOR, ONE CLOSER. Code that creates a GitHub issue from an issue record, links it, records the ref and closes it already exists in the bugfix module and was never connected: createBugfixTrackerIssue and closeBugfixTrackerIssue with their default dependencies (src/workflow/bugfix/tracker.ts:142-188, 266-287), the hook that would call the create (the AdvanceTrackerDeps leg in src/workflow/bugfix/advance.ts:63-70 and its type in src/workflow/bugfix/types.ts:61), completeBugfixTracker (advance.ts:79-88) and the follow-on's close leg (src/workflow/bugfix/mount.ts:156-166), which fires only for a BUILD carrying meta.issueHash that nothing stamps. That code has no unique label, cannot tell a failed lookup from not found, and retries a create after any error. All of it is deleted, with its tests (src/workflow/__tests__/bugfix-tracker.test.ts, and the parts of src/workflow/bugfix/__tests__/bugfix-mount.test.ts and src/workflow/__tests__/bugfix-orchestration.test.ts that exercise it) and the 'bugfix-complete' followOn kind, so the tracker implementation is the only code that creates or closes a work item's issue. The follow-on keeps what it does today: it locates and stamps the parent and routes to the next stage.

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
- `src/mcp/daemon-stream.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/DaemonGateway.kt`
- `src/cli/client.ts`
- `src/cli/__tests__/command.test.ts`
- `src/workflow/bugfix/__tests__/bugfix-mount.test.ts`
- `src/workflow/__tests__/bugfix-orchestration.test.ts`
- `src/workflow/__tests__/bugfix-tracker.test.ts`
- `src/cli/__tests__/tui.test.ts`
- `src/workflow/__tests__/other-party-review-gate.test.ts`
- `src/db/repos.ts`
- `docs/workflow.md`
- `src/shared/ipc-client.ts`
- `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`

### 3.5 `Rejection and amendment decisions through the daemon` — new

The TUI has three more decisions that it makes today in its own process, and all three move to the daemon in this work item, so the daemon is the one place that decides. (1) Rejecting an artifact: the TUI's reject (src/cli/services/workflow.ts:171-173) calls rejectArtifactByJsonPath (src/workflow/gates.ts:942) and stamps the record itself; callers are the reject command (src/cli/command.ts:232-235) and the Workflows pane (src/cli/panes/WorkflowsPane.tsx:128). (2) Approving an amendment and (3) rejecting an amendment: the TUI's approveAmendmentById and rejectAmendmentById (workflow.ts:271-277) call the amendment store (src/workflow/amendments/store.ts:101, :122); the only caller is the Workflows pane (:119, :129). Three daemon requests are added beside 'workflow.approve' (src/daemon/index.ts:643): 'workflow.reject' takes an absolute artifact path and a reason; 'workflow.amendment.approve' takes a repo, an amendment id and who approved; 'workflow.amendment.reject' takes a repo, an amendment id and a reason. Each calls the same function the TUI calls today and returns that function's result unchanged (RejectionResult, AmendmentRecord), so the rules and the stored records do not change; only where the code runs does. The path rule is the one approve follows: the path must be absolute and inside a registered repo, the TUI makes a typed relative path absolute first, and the daemon refuses otherwise with nothing stamped. An amendment has an id and no path, so its request must name the repo, and the daemon checks that repo is registered. The three TUI service functions become asynchronous senders of those requests and hold nothing else; the service interface (src/cli/services/index.ts:60, :63, :64) declares Promises; the reject command and the Workflows pane await them and show the toast or the error after the answer. Their test fakes (src/cli/__tests__/command.test.ts:51, :54, :55 and src/cli/__tests__/tui.test.ts:73, :76, :77) are rewritten to return Promises. None of the three runs the tracker flow: a rejected artifact has no tracker item to change in this work item, and amendments belong to epics, the second work item. The TUI's other commands (review, findings, resolve, ack-stale, sync, run) and its read-only views are not approval decisions and are not changed here.

**Call sites:**
- `src/daemon/index.ts`
- `src/cli/services/workflow.ts`
- `src/cli/services/index.ts`
- `src/cli/command.ts`
- `src/cli/panes/WorkflowsPane.tsx`
- `src/workflow/gates.ts`
- `src/workflow/amendments/store.ts`
- `src/cli/__tests__/command.test.ts`
- `src/cli/__tests__/tui.test.ts`
- `docs/daemon.md`

### 3.6 `Pending list and backfill` — new

Two requests of the insrc_tracker tool (there is no separate tool for them). pending takes a repo and returns every approved artifact of the kinds this work item covers that is not tracked (by the rule above), parents before children, with what the flow would do for each, or the reason the check fails; an item whose BUILD record is approved is marked finished. It changes nothing; it is the backfill's dry run. backfill takes a repo and runs the flow on those items one at a time, as a stream request with one progress frame per item; a finished item is created and closed at once. It is safe to run twice. A bugfix built before the one-hash change cannot be matched to its build; the list marks it 'completion unknown', and the run creates it and leaves it open. Adding the tool means the registered-tool tests (src/mcp/__tests__/schema-registry.test.ts: the expected tool list, and the expected requests if it is registered as a multi-request tool) and the steering's table of registered tools must list it.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/prompts/steering-block.md`

### 3.7 `What the workflow says about the tracker` — new

The result of insrc_workflow_approve carries tracker[] and, for a bugfix, the next call. The descriptions of insrc_workflow_approve and insrc_tracker and the steering source (src/prompts/steering-block.md, its tracker and bugfix guides and its tool table, and the plugin copy vscode-plugin/assets/steering-block.md) say: the daemon adds, updates and closes tracker items and pushes their documents when an item is approved; the model relays each outcome and its reason, never runs gh or commits the artifacts for this itself, and, after approving an issue record, makes exactly the next call the result gives. They also say what is covered now (issue records, standalone stories and their tasks, completion) and that an epic, its stories and its tasks are pushed only by the explicit tracker.push workflow until the epics work item lands. The done response of insrc_workflow_step, whose pendingApproval block is built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a line saying whether approving this artifact will add it to the tracker, or why not; working that out makes no call that changes anything. The workflow user guide is rewritten too: docs/workflow.md says today that approving an HLD or LLD pushes it automatically and that --no-tracker opts out (lines 138-144), and that the tracker is opt-in through github.json (lines 181-185); all three become wrong. Its tracker sections are rewritten to describe the setting, on by default; the tracker type, named or inferred from the remote; what is pushed on approval now; that commitArtifacts, pushTasks and type 'none' no longer decide anything for this flow; and that an epic is pushed only by the explicit tracker.push workflow for now. docs/daemon.md is checked for a tracker section and updated the same way if it has one.

**Call sites:**
- `src/mcp/server.ts`
- `src/prompts/steering-block.md`
- `vscode-plugin/assets/steering-block.md`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/mcp/workflow-step/types.ts`
- `docs/workflow.md`
- `docs/daemon.md`

## 4. Error paths

**Error cases**

- **The approved artifact is not inside a registered repo.** (recoverable)
  - Detection: The daemon matches the artifact's path against its repo registry and finds no repo that contains it.
  - Response: 'skipped: the artifact is not inside a registered repo', before any git or gh call. The request's repo field and the process's working directory are not used. For an approve request the refusal comes before anything is stamped.
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
- **The flow's 5 minute budget for one approve request runs out.** (recoverable)
  - Detection: Before each item the flow compares the time used with the budget.
  - Response: The items not yet attempted are each 'skipped: time budget reached'; nothing is cut off mid-item beyond the 30 second limit of the call in progress.
  - User impact: The approval is reported approved; the remaining items are in the pending list.
- **A build's validate call arrives without the hash its implement call was given.** (recoverable)
  - Detection: The build step finds no hash on the call, trims the call's focus as implement does, and looks for unapproved BUILD records whose stored focus equals it.
  - Response: Exactly one: it uses that record's hash. None: it mints the hash from the focus, as an ordinary small build always has. More than one: it refuses and names the matching records.
  - User impact: One BUILD record per bugfix, under the issue's hash; ordinary small builds are unchanged.
- **An approve request carries a relative artifact path.** (recoverable)
  - Detection: The daemon checks the path is absolute before the registry lookup.
  - Response: Refused, naming the path and saying an absolute path is required; nothing is stamped and the daemon's working directory is not used.
  - User impact: A clear refusal instead of an approval against the wrong directory.
- **A reject or amendment request reaches the daemon with a relative path, a path in no registered repo, or an unregistered repo.** (recoverable)
  - Detection: The same absolute-path and registry checks the approve request uses.
  - Response: Refused, naming the path or repo; nothing is stamped.
  - User impact: The TUI shows the refusal as an error toast or command line.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every outcome is 'skipped: the setting is off' and no git or gh call is made, from a session, a plugin panel or the TUI. |
| A repo with no entry in github.json and a GitHub remote. | The type is inferred as github and the target is the remote; issue items are tracked. |
| A repo whose github.json entry, or the file's default entry, says type 'none'. | Read as no type named: the type is inferred from the remote, and a GitHub remote is tracked. Someone who relied on 'none' to keep the tracker off turns the setting off instead; the release notes and the setting's description say so. |
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
| An approve request that carries only an artifact path (the VS Code review panel). | The daemon finds the repo from the registry by the path and uses it for the approval's gates, the bugfix follow-on and the flow; the result is the same as for a request that named the repo. |
| A BUILD record is approved from a panel that sends only its path. | Its repo is the registered repo containing the path, so the close runs. |
| A repo whose remote is on a host with no supported tracker, and no type named. | 'skipped: no supported tracker is set up for the project'. |
| github.json has commitArtifacts false or pushTasks false for the repo. | Neither is read by this flow: the documents are pushed and the tasks tracked when the setting is on. |
| An agent calls insrc_tracker push for an artifact in a repo whose setting is off. | The implementation applies the check itself and answers 'skipped: the setting is off'; nothing is pushed. |
| An agent calls insrc_tracker push for an artifact that is not approved. | Refused: only an approved artifact is pushed, the same rule the approval path follows. |
| An ordinary small build (not a bugfix) is validated with no hash on the call. | No unapproved BUILD record carries its focus under another hash, so the hash is minted from the focus exactly as today. |
| A bugfix whose fix intent ends in a newline is validated with no hash on the call. | The call's focus is trimmed before comparison, so it matches the stored focus and the build lands on the one BUILD record under the issue's hash. |
| An issue record is approved from the TUI or a plugin's review panel. | The bugfix parent is stamped and the result carries the next call, as from chat, because the daemon found the repo itself. |
| `insrc workflow approve docs/standalone/.../LLD.md` typed in the TUI with a relative path. | The TUI sends the absolute path; the daemon finds the repo and approves as for any other client. |
| An artifact is rejected, or an amendment approved or rejected, from the TUI. | One daemon request; the stored record is the same as today's; no tracker action. |

**Invariants to preserve**

- An approval is never failed, undone or delayed past its stamp by the tracker: the flow runs after the approval and the follow-on are complete. [[c1]]
- resolveGithubConfig and the tracker.push, tracker.sync and tracker.post workflows behave as before. [[c2]]
- The TUI makes no git or gh call and decides nothing itself: approving an artifact, rejecting an artifact, approving an amendment and rejecting an amendment are each one daemon request. Its read-only views (lists, chain, findings) and the other TUI commands are outside this work item. [[c7]]
- A ref is written to an artifact only by code, and an item that is tracked is never created again. [[c3]]
- gh is never run by a test, and for this flow nobody, model or code, runs raw gh or git commands: everything goes through the tracker tool's implementation, which applies the setting and the tracker check itself. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]
- A work item's tracker issue is created by one piece of code and closed by one piece of code: the tracker implementation. [[c5]]
- The daemon keeps serving other requests while the tracker implementation waits on git or gh. [[c1]]
- The daemon's read-only tool allowlist for its analysis model gains no writing tool. [[c1]]
- An ordinary trivial build's hash is still minted from its focus. [[c1]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, on every approval surface, and is shown on the VS Code and JetBrains settings pages`, `ac2: the check before any action is the setting plus a supported tracker set up for the project, its type set or inferred, its repo never guessed`, `ac3: on approval the daemon calls the tool for the project's tracker type, which pushes the documents, creates or updates the item and returns its ref; the build's approval closes it`, `ac4: an item is never created twice, and a failed or timed-out call never leads to a create`, `ac5: a skipped or failed tracker action never affects the approval and always says why; the result, the steering and the workflow messages report it and tell the model not to run gh`, `ac6: a pending list and a backfill run add the approved items never pushed, and create and close the finished ones`
- **unit** — The setting and the check.
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true, group Tracker, with its wording in desc; the row count in the catalog contract test is updated`, `T3 the repo is the registered repo whose path contains the artifact's path, the longest match for nested repos, for every kind including a BUILD record and for a request with no repo field; an artifact outside every registered repo gives 'not inside a registered repo' with no git or gh call, whatever the request's repo field and the process's working directory say`, `T4 the type is the one named on the repo's entry, else on the default entry, else inferred from the remote; a GitHub remote gives github; type 'none' in either entry is read as not named and the remote decides; an unknown type, or nothing named and a remote on another host, gives 'no supported tracker'; the target and labels come from the entry, then the remote and the defaults; commitArtifacts and pushTasks are not read; resolveGithubConfig is not called`, `T5 with the setting off no tool is asked anything; the check runs once for a batch`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG`, `the setting reader's module-level seam`, `a recording fake for the tool's one exec`
- **unit** — The github tool, with git and gh faked.
  - Subjects: `T6 ready: gh missing, gh not signed in, and a sign-in call that passes 10 seconds each give their own reason`, `T7 addOrUpdate commits only the listed paths (both git add and git commit name them) with the given message, treats nothing-to-commit as done, pushes, then looks up, then creates the kind label and the unique label idempotently, then creates the item with both labels and the identity marker in the body; a failed label create creates no item`, `T8 the lookup's three answers: found adopts and creates nothing; not found creates; lookup failed (error or time limit) creates nothing and is 'failed'`, `T9 a create that passes its time limit is 'failed' and is not retried in the same run; the next run finds the item by its label and adopts it`, `T10 a known ref gives 'already-exists' with no create; update changes the body of a found item; close closes by ref; commitRef commits and pushes the same paths with the second message`, `T11 a git failure in the first commit or push stops the tool before any gh call`, `T33 the github implementation is selected by type from the one map and an unknown type has none; its answer is a TrackerOutcome; comment adds one comment by ref; called for a repo whose setting is off, or with no supported tracker, it answers 'skipped' and makes no git or gh call; its calls do not block: another task runs while a faked call is pending`
- **integration** — The flow, for each kind, with the tool faked.
  - Subjects: `T12 an approved issue record is passed with its fields, its ref recorded and committed; with a stamped parent the parent's ref is passed`, `T13 a standalone design comments on the issue record's issue when it has a ref and records commentedOn, otherwise creates a story issue; a second approval does neither again`, `T14 a standalone plan creates one task per task under the story's or the issue record's issue, and is 'skipped' with neither on the tracker`, `T15 a BUILD record closes the issue and the tasks of the same hash and story and records closedAt; with nothing to close it is 'skipped'`, `T16 an HLD, an LLD under an epic, a plan under an epic, a DEF, a SPEC, a CR and an EXT give no outcome`, `T17 an item on GitHub with no ref on its record, an issue record and a standalone story alike, is adopted and recorded and nothing is created; after a ref is recorded the pending list no longer shows it`
  - Fixtures: `temp repos with issue records, standalone designs, plans and BUILD records`, `a tool fake that records what it is passed`
- **integration** — Every approval surface, and the bugfix chain.
  - Subjects: `T18 the after-approval function, called directly with a fake registry, tracker implementation and follow-on: it runs the follow-on then the flow and fills tracker[]; a request with only an artifact path gets its repo from the registry and runs the gates, the follow-on and the flow with it, and a request that names a different repo than the path's still uses the path's; a path in no registered repo is refused with nothing stamped; a relative path is refused with nothing stamped and is not resolved against the daemon's working directory; an epic-hash request with an unregistered repo is refused; tracker: false runs no flow; a flow that throws leaves the approval result intact; when the 5 minute budget is used up the remaining items are 'skipped: time budget reached'. The daemon's handler does nothing but call it, and insrc_workflow_approve relays tracker[]`, `T19 the TUI approve service sends the daemon's approve request and returns its answer, with withTracker false sent as tracker: false; the approve command and the Workflows pane await it and show approved, withheld (with the override hint, from skipped[] and not from a thrown error), follow-on and tracker outcomes; it calls neither approveArtifactByJsonPath nor any push or commit function, and reports a daemon that is not running; the four TUI fakes (command.test.ts:50, :220-230, :232-241 and tui.test.ts:72) return a Promise of the daemon's result shape; T7 of other-party-review-gate.test.ts gives the TUI service a fake daemon client and asserts one workflow.approve request with the path and override reason only, the path absolute both when typed absolute and when typed relative (resolved against the TUI's working directory), and the daemon's answer returned unchanged`, `T20 approving an HLD, an LLD under an epic or a plan from the TUI approves it and makes no git or gh call`, `T21 after an issue record is approved, the result carries the next call with the issue's hash, on the small route and the sized route; the implement response states the hash; validate with the hash, and validate without it when exactly one unapproved BUILD record carries the same focus, both land on that record, including when the call's focus has leading or trailing whitespace the stored one does not; validate without a hash and with no such record mints from the focus as an ordinary small build does; validate with more than one such record is refused and names them; approving the bugfix's BUILD record closes the issue`, `T22 the old creator and closer are gone: createBugfixTrackerIssue, closeBugfixTrackerIssue, completeBugfixTracker, the create hook in the advance and the follow-on's close leg no longer exist, followOn has no 'bugfix-complete' entry, and the follow-on still stamps the parent and routes`, `T23 the suites that reach the tracker flow issue no command whose name is gh: they run under one shared helper that sets the setting reader to true and installs the recording fake, which throws for `git remote get-url` as a repo with no remote does. The suites that call approveWorkflowTarget directly never reach the flow, by design, and need no change`, `T34 each client's wait for an approve request is longer than the flow's 5 minute budget: the session tool server, the VS Code panel's client, the JetBrains gateway and the TUI's client`, `T36 'workflow.reject', 'workflow.amendment.approve' and 'workflow.amendment.reject': each daemon request calls the existing function and returns its result; reject refuses a relative path and a path in no registered repo with nothing stamped; the amendment requests refuse an unregistered repo; none runs the tracker flow. The three TUI service functions, given a fake daemon client, each send exactly one request with their arguments and return the answer unchanged; the reject command and the Workflows pane show the result after awaiting; the six TUI fakes return Promises`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper for the setting seam and the recording fake`
- **integration** — The pending list and the backfill, with the tool faked.
  - Subjects: `T24 the pending phase lists approved untracked items of the covered kinds parents first, marks finished ones and 'completion unknown' ones, leaves out unapproved ones and epic items, and changes nothing`, `T25 the run phase creates each item once, creates and closes a finished one, yields between items, and a second run reports them as already there; a failure part of the way through keeps what was recorded`, `T35 insrc_tracker: status reports ready or the reason; push runs the flow for one approved artifact and refuses an unapproved one; pending and backfill are its other two requests; each forwards to its daemon request`
- **unit** — What the workflow says, the tool's registration, and the plugins.
  - Subjects: `T26 the steering tracker and bugfix guides, its tool table, and the descriptions of insrc_workflow_approve and insrc_tracker say the daemon does the tracker work on approval, list what is covered, tell the model to relay outcomes, not to run raw gh, to make the next call an issue approval returns and to repeat the build's hash on validate; the plugin copy of the steering source is identical to the source; docs/workflow.md no longer says approval pushes an HLD or LLD, that --no-tracker opts out, or that the tracker is opt-in`, `T27 the pendingApproval block of insrc_workflow_step's done response says whether approval will add the item to the tracker, or why not`, `T28 the registered-tool tests list insrc_tracker (and its requests, if registered as a multi-request tool); the daemon's read-only tool allowlist is unchanged`, `T29 VS Code: package.json declares the setting; the global key maps to the catalog row; the per-repo section writes tracker.byRepo.<repoPath>.addItems for the open workspace folder`, `T30 JetBrains: the settings page shows the default row, and its per-repo section writes tracker.byRepo.<repoPath>.addItems for the open project`
- **live** — One real run against GitHub, after the build, recorded in the build record.
  - Subjects: `T31 approving a real issue record in this repo pushes its documents, creates a GitHub issue in insors-ai/insrc and records its ref`, `T32 the pending list for this repo is shown to the user before the backfill is run`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T5`, `T20`, `T29`, `T30` |
| `ac2` | `T3`, `T4`, `T6` |
| `ac3` | `T7`, `T10`, `T12`, `T13`, `T14`, `T15`, `T18`, `T19`, `T21`, `T31`, `T33` |
| `ac4` | `T8`, `T9`, `T17` |
| `ac5` | `T11`, `T16`, `T18`, `T23`, `T26`, `T27`, `T34` |
| `ac6` | `T24`, `T25`, `T32`, `T35` |

## 6. Migration

**State before:** Only the TUI pushes to GitHub, by code in its own process, for an HLD, an LLD under an epic and a plan, and commits the artifacts, when ~/.insrc/github.json has an entry for the repo; the TUI also approves in its own process, not through the daemon. An approved issue record never reaches GitHub, and a standalone story cannot be pushed. An approval from a chat session or a plugin panel pushes nothing. No setting turns tracking on or off. A small bugfix's build has a different hash from its issue record, and the routed next step after an issue approval is computed and dropped.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off on every surface. Every approval, including the TUI's, is made by the daemon. When an issue record, a standalone design or plan, or their BUILD record is approved, the daemon runs one flow that checks the setting and the project's tracker, finds the repo from its registry, picks the tool for the tracker type, and has it push the documents and create, update or close the item. A bugfix keeps one hash from issue record to BUILD record. A pending list and a backfill run cover what was never pushed. The TUI holds no approval, rejection, amendment-decision, push or commit logic; epic items are pushed only by the explicit tracker.push workflow until the epics work item lands.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row (wording in desc) and its per-repo reader with its test seam. — ↩ rollbackable
2. Add the github tracker implementation and the type-to-implementation map: the check applied inside it, ready, addOrUpdate with the idempotent label create and the three-answer lookup, comment, close, commitRef, each call time-limited and none blocking the daemon; add the two optional tracker fields; add the shared test helper. — ↩ rollbackable
3. Add the check (setting, the registered repo containing the artifact, type named or inferred, target; commitArtifacts, pushTasks and type 'none' not read) and the asynchronous tracker flow with its 5 minute budget, for an issue record, a standalone design, a standalone plan and a BUILD record. Nothing calls it yet. — ↩ rollbackable
4. Move the steps that follow an approval out of the daemon's handler into one exported function with its collaborators passed in; it runs the follow-on, then the flow, on every path where something was approved; have the handler find the repo from the registry by the artifact's path before approving and drop its early return for a request with no repo, honours tracker: false, and returns tracker[]. Raise each client's wait for an approve request above the budget. — ↩ rollbackable
5. Make the TUI approve through the daemon: its approve becomes an asynchronous request to 'workflow.approve'; remove its in-process approval, its push switch and its commit; rewrite the approve command and the Workflows pane to show the daemon's answer, and the TUI tests to its shape. From this step epic items are pushed only by the explicit tracker.push workflow. — ↩ rollbackable
6. Add the daemon requests workflow.reject, workflow.amendment.approve and workflow.amendment.reject over the existing functions; make the TUI's reject, approveAmendmentById and rejectAmendmentById asynchronous senders; await them in the reject command and the Workflows pane; rewrite their six test fakes. — ↩ rollbackable
7. Give a bugfix one hash: put the issue record's hash in the next call, carry the next call on the follow-on outcome through to insrc_workflow_approve, state the hash in the implement response, and have validate with no hash use the one unapproved BUILD record with the same focus, mint as today when there is none, and refuse when there are several. Delete the old issue create and close code in the bugfix module, its hook, the follow-on's close leg and the tests that exercise them. — ↩ rollbackable
8. Add the insrc_tracker MCP tool with its status, push, pending and backfill requests and their daemon requests; update the registered-tool tests. — ↩ rollbackable
9. Add the tracker line to the pendingApproval block of insrc_workflow_step; rewrite the steering's tracker and bugfix guides and tool table and the tool descriptions; refresh the plugin copy; rewrite the tracker sections of docs/workflow.md (and docs/daemon.md if it has one). — ↩ rollbackable
10. Show the setting on the VS Code and JetBrains settings pages. — ↩ rollbackable
11. After the daemon is updated: show the pending list for this repo to the user and, on their go-ahead, run the backfill. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the pending list`)_

**Backward compat:** approveWorkflowTarget is unchanged; WorkflowApproveResult gains an optional tracker[] and FollowOnOutcome an optional nextCall and loses the 'bugfix-complete' kind, which nothing produced. The approve request gains an optional tracker field. resolveGithubConfig, the three epic push functions and the tracker workflows are unchanged. The tracker meta gains two optional fields; nothing stored is rewritten. One new MCP tool, insrc_tracker, and its four daemon requests are added; nothing is added to the daemon's internal tool list. What changes for the user: (1) with the setting on (the default) and gh signed in, approving an issue record, a standalone design or plan commits and pushes those documents and creates a GitHub item, for any registered repo with a GitHub remote; three older switches in ~/.insrc/github.json no longer decide anything for this flow: type 'none' (in a repo's entry or the default entry) is read as no type named, and commitArtifacts and pushTasks are not read, so someone who relied on any of them turns the setting off instead, which the release notes and the setting's description say; (2) the TUI now needs the daemon running to approve, its approve is asynchronous and its result takes the daemon's shape; (3) the TUI no longer pushes an epic, its stories or its tasks, and no longer commits approved artifacts by itself: until the epics work item lands, an epic is pushed with the explicit tracker.push workflow; (4) the unused issue create and close functions of the bugfix module are deleted; (5) after an issue approval the bugfix's design, plan and build are filed under the issue's hash; builds made earlier keep their old hash. (6) a validate call with no hash uses an unapproved BUILD record with the same focus when exactly one exists, and otherwise behaves as before; (7) the clients wait up to five and a half minutes for an approve request.

## 7. Alternatives considered

### 7.1 a1: One tracker tool with an implementation per type, called by the daemon after approval and by agents over MCP — **CHOSEN**

The daemon checks the setting and the project's tracker, picks the tool for its type, and passes it everything; the tool encapsulates the flow.

Add the one setting and a check (setting on, a supported tracker set up, its type set or inferred from the remote, its repo found from the daemon's registry). Add one tracker tool, insrc_tracker, a normal insrc MCP tool any agent can call, with one implementation per tracker type living in the daemon; the github implementation commits and pushes the listed documents, looks the item up by a unique label with a three-answer result, creates, updates, comments on or closes it, and returns the ref. One asynchronous flow function in the daemon builds the tool's inputs from an approved artifact and records the ref; the daemon's approve handler awaits it after the bugfix follow-on. Every surface approves through the daemon, including the TUI, which keeps no logic. This work item covers issue records, standalone stories, their tasks and completion.

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
- **[[c31]]** `stakeholder` `user, 2026-10-06 (on retiring commitArtifacts, pushTasks and type 'none' as switches)` — "A"
- **[[c32]]** `stakeholder` `user, 2026-10-06` — "no, i think the intenet was not model runs "gh" doesn't mean a model can't call the encapsulated tool"
- **[[c33]]** `stakeholder` `user, 2026-10-06` — "60 seconds <- might be too little if connection is slow, 5mins"
- **[[c34]]** `doc` `docs/workflow.md` — "The tracker is opt-in."
- **[[c35]]** `prior-artifact` `LLD-38436e90625a83a2-S001 eighth review of 2026-10-06 by the daemon: block, 6 MED premises did not hold; the user decided each and this revision applies the decisions`
- **[[c36]]** `stakeholder` `user, 2026-10-06` — "why this delegation? why can't it be registered as a normal tool in claude/codex? or any other coding agent?"
- **[[c37]]** `code` `src/analyze/context/tool-surface.ts` — "READ_ONLY_TOOL_IDS"
- **[[c38]]** `prior-artifact` `LLD-38436e90625a83a2-S001 ninth review of 2026-10-06 by the daemon: block, 3 MED premises did not hold; the user decided each and this revision applies the decisions`
- **[[c39]]** `prior-artifact` `LLD-38436e90625a83a2-S001 tenth review of 2026-10-06 by the daemon: block, 2 MED premises did not hold (a fifth caller of the TUI approve; focus compared without trimming); this revision applies both`
- **[[c40]]** `stakeholder` `user, 2026-10-06` — "we alrady resolved this, the daemon resolves repo from path and registered repos"
- **[[c41]]** `stakeholder` `user, 2026-10-06` — "add both to this work item."

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 1 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T10:49:40.817Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| error-paths | MED | Every failure of the TUI's (and the panels') approve request is detectable: the design covers a failed connect and a daemon that is still working. | src/shared/ipc-client.ts:46-84 `rpc` registers only 'connect', 'data' and 'error' handlers; there is no 'close' or 'end' handler and no timer. src/mcp/daemon-stream.ts:204-238 unaryRpc is the same. If the daemon exits or restarts while an approve is in flight (now up to 5 minutes, and the daemon self-updates), the socket closes without a result line and the promise never settles. The design's only stated case is "The TUI's approve request fails to connect"; a connection dropped mid-request is not listed, and the TUI now has no in-process fallback. [files: src/shared/ipc-client.ts, src/mcp/daemon-stream.ts] | Add an error path for a connection closed before a result: reject in the shared rpc and unaryRpc on 'close' without a response, say the approval may already be stamped and the items are in the pending list, and add a test with a fake socket that closes early. |
| tests | MED | Each acceptance criterion maps to a test that can be written as stated; in particular T34 (each client's wait for an approve request is longer than the 5 minute budget) is a well-defined assertion. | The acceptance table maps ac1-ac6 to T1-T35, but T34 contradicts the design's own finding. Section 3.4 says "None of the four sets a time limit on this request today, so nothing needs raising", which the code confirms (ipc-client.ts:46-84 and daemon-stream.ts:204-238 arm no timer; no timeout in the JetBrains daemon package). Yet migration step 4 says "Raise each client's wait for an approve request above the budget" and backward-compat item (7) says "the clients wait up to five and a half minutes". With no timer there is nothing for T34 to measure, and a builder following step 4 would add a five-and-a-half-minute limit that does not exist today. [files: src/shared/ipc-client.ts, src/mcp/daemon-stream.ts] | Pick one: either keep the clients unlimited, delete the 'raise' wording in step 4 and compat item (7), and restate T34 as 'no client arms a timer on workflow.approve'; or decide to add a limit and specify it per client. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| data-compatibility | closedAt written into a BUILD record's meta.tracker stays there, so an approved BUILD is not closed twice and the pending list can trust it. | BuildRecord.meta (src/workflow/runners/build/standalone-record.ts:47-75) declares no `tracker` field, and its comment says stamps are carried "so an upsert can PRESERVE them" for the named fields approvedAt, rejectedAt, rejectReason and reviewOverride. I did not read mergeWithPrior or the completion-record writer, so I cannot say whether an unlisted meta key such as `tracker` survives a later upsert (a re-validate, or ensureBuildRecordOnCompletion at gates.ts:854). [files: src/workflow/runners/build/standalone-record.ts, src/workflow/gates.ts] | Check mergeWithPrior and the completion-record writer; if they rebuild meta from the declared fields, add `tracker` to BuildRecord.meta and to the preserved set, and add a test. |
