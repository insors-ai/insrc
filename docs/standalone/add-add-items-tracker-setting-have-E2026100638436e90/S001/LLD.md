<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

One setting, "Add items to tracker", on by default, turns tracker pushing on or off for a repo and is shown on the VS Code and JetBrains settings pages. When an item is approved and the tracker is set up (the setting is on, the gh tool is installed and signed in, and the repo has a GitHub target), the approval result carries a short tracker directive: first commit and push the approved documents, then create or update the item on GitHub. Whoever drove the approval carries it out, the model in the session or the daemon's own model; the steering tells the model to do so every time. The same directive, listed for every approved item that was never pushed, is the backfill.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

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

**Returns:** `Promise<WorkflowApproveResult>` — As today, plus a new optional field tracker[]: one entry per approved artifact that is a tracker item, { path, item: 'issue' | 'epic' | 'story' | 'tasks' | 'completion', ready: boolean, reason?: string, directive?: TrackerDirective }. ready is false, with a reason, when the tracker is not set up for the repo; then there is no directive. The function itself runs no gh and no git command that changes anything.

**Errors:**
- `none new` when Working out the tracker entry never fails or delays the approval: any error in it becomes ready false with the error as the reason.

**Preconditions:**
- Declared in src/workflow/gates.ts. Called by the daemon's 'workflow.approve' handler (src/daemon/index.ts:643), which serves insrc_workflow_approve and the plugins.

**Postconditions:**
- For each artifact it approves, the tracker entry is worked out AFTER the approval stamp is written.
- An artifact that was withheld (in skipped[]) gets no tracker entry.
- Its other fields and its decisions are unchanged.

## 3. Data model changes

### 3.1 `Setting tracker.addItems` — new

ONE flag turns tracker pushing on or off for a repo. A catalog row: path tracker.addItems, type boolean, default true, group Tracker. A catalog row has no label field (ConfigOption in src/config/config-catalog.ts has path, type, default, desc, enumValues and group), so the wording goes in desc, which both settings pages show: "Add items to tracker: when on and the gh tool is installed and signed in, approved workflow items are added to GitHub and their documents pushed". The row is the value for any repo that has none of its own. A repo's own value is stored in the same config file under tracker.byRepo.<repoPath>.addItems, the dynamic-key pattern models.byRepo already uses. One reader returns the value for a repo: the repo's own value when present, otherwise the catalog value, otherwise true. The config file's path is fixed (src/shared/paths.ts has no override), so the reader has a module-level test seam. Settings pages: a catalog row reaches VS Code as a global key (vscode-plugin/src/config/key-map.ts), which is the default for all repos; the repo's own value is shown and written in each plugin's per-repo section, whose writers are hard-wired to models.byRepo today (vscode-plugin/src/panels/repo-config.ts:154 and jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/settings/SettingsView.kt:720) and are extended to write tracker.byRepo.<repoPath>.addItems for the open project. The VS Code plugin also declares the setting in its package.json. The existing tracker config file, ~/.insrc/github.json, is not changed and resolveGithubConfig is not changed.

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

### 3.2 `Tracker setup check` — new

One function, new in src/workflow/tracker-auto.ts, that answers whether the tracker is set up for a repo and, if so, where. It checks, in this order, and stops at the first that fails with a reason naming it: (1) the setting for the repo is true; (2) the repo's tracker is not turned off in github.json: an entry for the repo, or the default entry when the repo has none, that says type 'none' is an existing opt-out (src/workflow/config/github.ts:53-59) and makes the repo not ready with the reason 'tracker turned off in ~/.insrc/github.json'; (3) a GitHub target is found: the owner and repo of the repo's entry in github.json when it names them, otherwise the repo's git remote (the existing gitOriginOwnerRepo in src/workflow/tracker/github.ts); (4) the gh tool is installed; (5) gh is signed in. The sign-in check contacts GitHub and today's ghAuthOk runs it with no time limit (src/workflow/tracker/github.ts:38-40), so the setup check runs it with a 10 second limit, and a check that passes the limit is not ready with the reason 'gh did not answer in time'. The check is run ONCE per approve call and its answer reused for every artifact in a batch, not once per artifact. The target is checked before gh, so a repo with no GitHub remote, which is every temp repo in the test suites, never runs gh. It returns ready with the owner, repo and label names (from the repo's github.json entry, then its default entry, then the built-in defaults), or not ready with the reason. It reads; it changes nothing. It does not call resolveGithubConfig, so that function's nine callers behave as before.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`

### 3.3 `Tracker directive` — new

A small structured instruction, built by one function from an approved artifact and the setup check's answer, and returned in the approval result. It is the same for whoever carries it out. It has four steps, in the user's order. Step 1, commit and push the documents: an explicit list of paths (the approved artifact's json and markdown, and the work item's definition files) and a commit message; only those paths are committed (git add and git commit both name them); when the listed paths have nothing to commit, which is the normal case for an item approved and committed earlier, that is NOT a failure: the executor skips the commit and goes on; the push is a plain push of the current branch. Step 2, the tracker action for the item's kind. Step 3, the call that records the result. Step 4, commit and push the same paths again: recording writes the ref into the artifact's json after step 1 has pushed it, so without this the ref would stay uncommitted; the record phase also re-renders the artifact's markdown where it shows a tracker link, as the TUI flow does today. Step 2 by kind. ISSUE record: look for an issue with the record's unique label insrc:issue-<first 8 of its hash>; if there is one, adopt it; if the lookup fails, stop and report; otherwise create an issue with the record's title, its rendered markdown as the body, and the labels insrc:issue and the unique label. HLD: the epic, the same way as an issue record: look up the unique label insrc:epic-<first 8 of the hash>, adopt, or create an issue from the Define's title and summary with the epic label and the unique label. LLD under an epic: the story, with the unique label insrc:story-<first 8 of the hash>-<story id>, created under the epic's issue; when the epic is not on the tracker yet the directive says to do the epic's directive first. The directive does NOT use the existing tracker.push workflow for these: that workflow resolves its target through resolveGithubConfig, which returns 'none' for a repo with no github.json entry and would refuse (src/workflow/runners/tracker/context.ts:41 and :203-209), and it creates task issues only when pushTasks is set (context.ts:69). Standalone LLD: when the work item's issue record already has a ref, add a comment on that issue linking the design; otherwise create an issue for the story with the story label and a unique label insrc:story-<first 8 of the hash>-<story id>. PLAN: create one task issue per task under the story's issue (or the issue record's issue), each with a unique label, for a plan under an epic and a standalone plan alike, whatever pushTasks says: with the setting on, every item is tracked. BUILD record: close the work item's issue and each task issue, using the refs found on the ISSUE, LLD and PLAN artifacts that share the BUILD record's hash and story id; when none is found the directive says so and names nothing to close. DEF, SPEC, CR and EXT have no directive. Step 3. The result is recorded by one call, so the ref lands on the artifact's meta.tracker by code, not by the model editing json: the new record phase of the tracker tool (next entry). The directive is data plus fixed wording; it is rendered to text by one function so the controller and the daemon's model read the same words.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/gates.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/bugfix/tracker.ts`
- `src/workflow/tracker/refs.ts`
- `src/workflow/runners/tracker/context.ts`

### 3.4 `Tracker tool: list and record` — new

One new MCP tool, insrc_tracker_step, with two phases, backed by two daemon requests. Phase 'pending' takes a repo and returns every approved artifact that is a tracker item and carries no tracker ref, parents before children, each with its directive, or with the reason the tracker is not set up; an item whose BUILD record is already approved is marked finished, and its directive says to create it and close it at once. It changes nothing: it is the backfill's dry run and its work list in one. Phase 'record' takes an artifact path and what was done (a created or adopted ref, the task refs of a plan, a comment added, or closed) and writes it to the artifact's meta.tracker with the existing patch function (patchTrackerMeta in src/workflow/tracker/refs.ts). TrackerMeta (refs.ts:24-37) has no field for a comment or for closing, so two optional fields are added: commentedOn, the ref of the issue a standalone design was linked on, and closedAt, the time the item was closed. What counts as 'tracked', so that a second approval or a second backfill gives no directive to do it again: an issue record has issueRef; an HLD has epicRef; an LLD has storyRef or commentedOn; a plan has taskRefs; a BUILD record has closedAt. Both fields are optional additions, so no stored artifact needs rewriting. It refuses a ref that does not belong to the directive's target.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/refs.ts`
- `src/mcp/__tests__/schema-registry.test.ts`
- `src/prompts/steering-block.md`

### 3.5 `Who carries the directive out, and the steering` — new

In a session, the controller carries it out. The insrc_workflow_approve result carries tracker[]; the tool's description and the steering source say: after every approval, for each entry that is ready, do the directive in order (commit and push the listed documents, then the tracker action, then record), and relay each entry that is not ready with its reason; never skip it and never push anything it does not list. The steering's tracker guide and bugfix guide (src/prompts/steering-block.md and its plugin copy vscode-plugin/assets/steering-block.md) are rewritten to say this, the new tool gets a row in the steering's table of registered tools, and to say that the one setting and the gh tool decide whether there is a directive. The done response of insrc_workflow_step, whose pendingApproval block is built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a line saying whether approving this artifact will produce a tracker directive, or why not. Outside a session there is no controller. The TUI approve service keeps what it does today, unchanged: its three code pushes and its commit (src/cli/services/workflow.ts:156-166). The directive is written so that the daemon's own model can carry it out as well, since it is plain steps with fixed wording, and the user has said either executor is acceptable; wiring a daemon model session to do so for approvals made from the plugins is NOT part of this build and is left as an open question.

**Call sites:**
- `src/mcp/server.ts`
- `src/prompts/steering-block.md`
- `vscode-plugin/assets/steering-block.md`
- `src/mcp/workflow-step/phases/synthesize.ts`
- `src/mcp/workflow-step/types.ts`
- `src/cli/services/workflow.ts`

## 4. Error paths

**Error cases**

- **The gh tool is not installed, or is installed but not signed in.** (recoverable)
  - Detection: The setup check looks for the gh executable, then runs the existing sign-in check.
  - Response: The entry is ready false with the reason ('gh is not installed' or 'gh is not signed in (run gh auth login)'). No directive. The approval stands.
  - User impact: The approval result says the item was not added and why; the backfill list picks it up later.
- **The repo has no GitHub target.** (recoverable)
  - Detection: The setup check finds no owner and repo in the repo's github.json entry and no GitHub remote.
  - Response: ready false with that reason, before any gh call.
  - User impact: The user is told no GitHub target could be found.
- **Working out the tracker entry throws.** (recoverable)
  - Detection: approveWorkflowTarget wraps it in a try and catch per artifact.
  - Response: ready false with the error's message; the approval of that artifact and the rest of a batch stands.
  - User impact: One line in the result; nothing else is affected.
- **The executor's commit or push fails.** (recoverable)
  - Detection: A git command exits non-zero when the executor runs step 1 or step 4, other than the commit finding nothing to commit for the listed paths, which the directive tells it to treat as done.
  - Response: In step 1 the directive tells the executor to stop, do no tracker action, and report the git error; nothing is recorded, so the item is still pending. In step 4 the item is on the tracker and recorded; the executor reports that the ref is not pushed yet.
  - User impact: The user sees the git error; the item is retried from the pending list.
- **The lookup of the item's unique label fails.** (recoverable)
  - Detection: The gh command for the lookup exits non-zero when the executor runs it.
  - Response: The directive tells the executor to stop and create nothing, since it cannot know the item is absent.
  - User impact: No duplicate; the item stays pending.
- **The item was created on GitHub but the record call fails or is never made.** (recoverable)
  - Detection: The record phase returns an error, or the artifact still has no ref the next time it is looked at.
  - Response: The item still appears in the pending list; its directive starts with the unique-label lookup, which finds the issue, so the executor adopts and records it and creates nothing.
  - User impact: A later run repairs it without a duplicate.
- **The record phase is given a ref for a different repository than the directive's target.** (recoverable)
  - Detection: The record phase compares the ref's owner and repo with the setup check's target.
  - Response: It refuses and writes nothing.
  - User impact: The executor is told the ref does not match the target.
- **The sign-in check does not answer (slow or stalled network).** (recoverable)
  - Detection: The setup check's gh call passes its 10 second limit.
  - Response: Every entry of that approve call is ready false with the reason 'gh did not answer in time'. The approval stands; the response is delayed by at most the limit, once.
  - User impact: The items are not added now; they are in the pending list.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every entry is ready false with the reason that the setting is off; the setup check makes no gh call. |
| A repo with no entry in github.json and a GitHub remote. | Ready: the target is the git remote and the default labels are used. resolveGithubConfig still returns 'none' for it and its callers behave as before. |
| An artifact whose item is already on the tracker is approved again. | Its entry says the item is already tracked, with its ref, and carries no directive to create. |
| A standalone story whose work item has an issue record already on the tracker. | The directive is to comment on that issue with a link to the design; the record phase stores commentedOn, so it is not directed again. |
| A BUILD record is approved and nothing for its Story is on the tracker. | The entry says there is nothing to close. A bugfix built from an issue record under a different hash is the known case; the pending list still shows that issue record, marked 'completion unknown'. |
| A batch approval of several artifacts. | One entry per approved artifact, in order; the steering tells the executor to do them in that order, parents first. |
| A DEF, SPEC, CR or EXT artifact is approved. | No tracker entry. |
| The working tree holds other uncommitted or staged files when the directive is carried out. | Only the listed paths are committed, because both git add and git commit name them; other files, staged or not, are left as they are. The push sends the current branch, which also sends any earlier unpushed commits on it; the directive says so. |
| An issue record that is not yet approved. | No directive and not in the pending list; it gets one when it is approved. |
| A finished item in the pending list (its BUILD record is approved). | Its directive is to create the issue and close it at once. |
| A repo whose github.json entry, or the default entry when it has none, says type 'none'. | Not ready, with the reason that the tracker is turned off in github.json; no directive. The existing opt-out is kept. |
| A backfill item whose documents were committed and pushed long ago. | Step 1 finds nothing to commit and goes on; the item is created, recorded, and step 4 commits and pushes the recorded ref. |
| A plan under an epic is approved in a repo whose github.json has pushTasks off or no entry at all. | Its tasks get a directive all the same: the directive creates them directly and does not consult pushTasks. |

**Invariants to preserve**

- An approval is never failed, undone or delayed by the tracker: the stamp is written first, and the tracker entry is only information in the result. [[c1]]
- approveWorkflowTarget, the setup check and the pending list run no command that changes GitHub or the git history; only an executor following a directive does. [[c1]]
- resolveGithubConfig, its nine callers, and the TUI approve service behave exactly as before. [[c2]]
- A ref is written to an artifact only by code (the record phase), never by a model editing the json; a stored ref means no directive to create. [[c3]]
- gh is never run by a test. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: one setting "Add items to tracker", default true, turns tracker pushing on or off for a repo, and is shown on the VS Code and JetBrains settings pages`, `ac2: on approval, when the tracker is set up, the result carries a directive: commit and push the listed documents, then create or update the item, then record it`, `ac3: the directive covers an issue record, an epic, a story, a standalone story, tasks and completion, and never creates an item twice`, `ac4: when the tracker is not set up the approval stands and the result says why`, `ac5: the steering, the approve tool's description and the workflow step's done message tell the executor to carry the directive out, in order, on every approval`, `ac6: a pending list gives the backfill: every approved item never pushed, parents first, each with its directive, finished ones to be created and closed`
- **unit** — The setting and the setup check.
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true, group Tracker, with its wording in desc; the row count in the catalog contract test is updated`, `T3 the setup check runs setting, github.json opt-out, target, gh installed, gh signed in, in that order, and stops at the first that fails with its own reason; with the setting off, an opt-out or no GitHub target it makes no gh call; a sign-in check that passes its 10 second limit gives 'gh did not answer in time'; one approve call runs the check once for a batch`, `T4 the target is the repo's github.json entry when it names owner and repo, otherwise the git remote; an entry, or the default entry when the repo has none, with type 'none' makes it not ready; labels come from the entry, then the default entry, then the built-in defaults; resolveGithubConfig is not called and still returns 'none' with no entry`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG`, `the setting reader's module-level seam`, `the existing injectable exec in src/workflow/tracker/github.ts as a recording fake`
- **unit** — The directive, built and rendered, for each kind.
  - Subjects: `T5 an ISSUE record's directive has the four steps: commit and push its json and markdown with an explicit pathspec, lookup-by-unique-label then adopt or create with both labels, record, commit and push again`, `T6 an HLD directs a direct create of the epic by its unique label; an LLD under an epic directs the story under the epic's issue, or the epic first when it is not tracked; neither uses the tracker.push workflow; a standalone LLD directs a comment on the issue record's issue when it has a ref, otherwise a new story issue with its unique label`, `T7 a PLAN, under an epic or standalone, directs one task issue per task under the story's or the issue record's issue whatever pushTasks says; a BUILD record directs closing the refs found on the ISSUE, LLD and PLAN artifacts of the same hash and story, and says so when there are none`, `T8 a DEF, SPEC, CR and EXT have no directive; an artifact that is already tracked by its kind's field (issueRef, epicRef, storyRef or commentedOn, taskRefs, closedAt) has no directive to do it again`, `T9 the rendered text is the same whoever the executor is, names only the listed paths, tells the executor that nothing to commit for those paths is not a failure, and tells it to stop on any other git failure in step 1 or on a failed lookup`
- **integration** — The approval result and the tool.
  - Subjects: `T10 approveWorkflowTarget returns tracker[] with one entry per approved tracker item, in order, none for a withheld artifact, and runs no gh or git command that changes anything`, `T11 an error while working out an entry leaves the artifact approved and the rest of a batch approved`, `T12 the daemon's workflow.approve result carries tracker[] through to insrc_workflow_approve`, `T13 the record phase writes a created ref, task refs, commentedOn and closedAt to meta.tracker and re-renders the markdown's tracker link; refuses a ref for another repository; after it, a second approval gives no directive to do it again; an artifact stored before the two new fields existed still reads`, `T14 the pending phase lists approved untracked items parents first with their directives, marks finished ones, leaves out unapproved ones, and changes nothing; after a record it no longer lists the item`, `T15 the existing suites that call approveWorkflowTarget on temp repos make no call whose command is gh: they run under one shared helper that sets the setting reader to true and installs the recording fake, which throws for `git remote get-url` as a repo with no remote does`, `T22 the registered-tool tests know the new tool: the expected tool list and the expected phase list in src/mcp/__tests__/schema-registry.test.ts include insrc_tracker_step with its pending and record phases`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper for the setting seam and the recording fake`
- **unit** — What the workflow says, and the plugins.
  - Subjects: `T16 the steering tracker and bugfix guides, the steering's table of registered tools, the insrc_workflow_approve description and the new tool's description tell the executor to carry out each ready directive in order after every approval and to relay a not-ready reason; the plugin copy of the steering source is identical to the source`, `T17 the pendingApproval block of insrc_workflow_step's done response says whether approval will produce a directive, or why not`, `T18 VS Code: package.json declares the setting; the global key maps to the catalog row; the per-repo section writes tracker.byRepo.<repoPath>.addItems for the open workspace folder`, `T19 JetBrains: the settings page shows the default row, and its per-repo section writes tracker.byRepo.<repoPath>.addItems for the open project`
- **live** — One real run against GitHub, after the build, recorded in the build record.
  - Subjects: `T20 approving a real issue record in this repo returns a directive; carrying it out pushes the documents, creates the GitHub issue in insors-ai/insrc and records its ref`, `T21 the pending list for this repo is shown to the user before any item of the backfill is carried out`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T18`, `T19` |
| `ac2` | `T3`, `T5`, `T9`, `T10`, `T12`, `T20` |
| `ac3` | `T5`, `T6`, `T7`, `T8`, `T13`, `T22` |
| `ac4` | `T3`, `T4`, `T11` |
| `ac5` | `T16`, `T17` |
| `ac6` | `T14`, `T21` |

## 6. Migration

**State before:** Only the TUI approve service pushes to GitHub, by code, for an HLD, an LLD under an epic and a plan, and commits the artifacts. The in-chat approval returns nothing about the tracker, and the steering tells the model to push an epic itself without saying when. An approved issue record never reaches GitHub and a standalone story cannot be pushed. A repo is tracked only when ~/.insrc/github.json has an entry for it. No setting turns tracking on or off.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off. Every approval result says, per item, whether the tracker is set up, and when it is, carries a directive: commit and push the listed documents, create or update the item, record it. The steering tells the executor to carry it out every time. A pending list gives the same directives for every approved item never pushed. The TUI's own push and resolveGithubConfig are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row (wording in desc) and its per-repo reader with its test seam. — ↩ rollbackable
2. Add the setup check, with the github.json opt-out and the time limit on its sign-in call, and the shared test helper; put the existing approval suites on the helper. — ↩ rollbackable
3. Add the two optional fields to the tracker meta (commentedOn, closedAt), and the directive builder and its text rendering for each kind, creating epics, stories and tasks directly by unique label. — ↩ rollbackable
4. Return tracker[] from approveWorkflowTarget and carry it through the daemon request and insrc_workflow_approve. — ↩ rollbackable
5. Add the insrc_tracker_step tool with its pending and record phases and their two daemon requests; update the registered-tool tests and the steering's tool table. — ↩ rollbackable
6. Add the tracker line to the pendingApproval block of insrc_workflow_step; rewrite the tracker and bugfix guides in the steering source and the tool descriptions; refresh the plugin copy of the steering source. — ↩ rollbackable
7. Show the setting on the VS Code and JetBrains settings pages: the default row from the catalog and the repo's own value in the per-repo section. — ↩ rollbackable
8. After the daemon is updated and the session's tools reloaded: show the pending list for this repo to the user and, on their go-ahead, carry the directives out one by one. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the pending list`)_

**Backward compat:** approveWorkflowTarget gains one optional field in its result; nothing else about it changes. resolveGithubConfig, the three push functions, the issue-record functions, the bugfix follow-on and the TUI approve service are not changed. Artifacts already on the tracker keep their refs. The tracker meta gains two optional fields; nothing stored is rewritten. A repo turned off in github.json with type 'none' stays off. One new MCP tool and two new daemon requests are added. What changes for the user: with the setting on (the default) and gh signed in, every in-chat approval of a tracked kind is followed by a commit and push of the approved documents and a GitHub item, carried out by the model on the directive; turning the setting off for the repo stops it.

## 7. Alternatives considered

### 7.1 a1: A directive in the approval result, carried out by whoever drove the approval — **CHOSEN**

The approval says what to do in the tracker; the steering tells the executor to do it: commit and push, create or update, record.

Add the one setting and a read-only check that the tracker is set up. On approval, build a small structured directive per approved item and return it in the result. The steering and the tool descriptions tell the executor, the model in the session or the daemon's model, to carry it out in order and to record the result through one small tool, which also lists every approved item never pushed.

### 7.2 a2: The daemon pushes by code inside the approval

One function in the approval path creates, updates and closes items and commits the documents, on every path.

The design of the first four revisions of this document: a tracker step awaited inside approveWorkflowTarget, with the shared config lookup changed to follow the setting, the TUI approve made asynchronous, timeouts on every gh call, one owner for the close, and a parent link made by the bugfix follow-on.

**Rejected because:** The user replaced it on 2026-10-06 with the simple flow: steering, on approval, if the tracker is set up, commit and push the artifacts, then create or update the tracker; who executes does not matter.

### 7.3 a3: Steering only

Rewrite the steering to say when to push and let the model work everything out with gh.

No setting check in code, no directive and no record tool: the steering lists the kinds and the model composes the gh commands and edits the artifact's json to store the ref.

**Rejected because:** It cannot honour the setting or keep refs reliable; the user asked for a setting on the settings pages.

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
- **[[c12]]** `stakeholder` `user, 2026-10-06` — "ok, here's the simple flow (steering) -> on approval -> if tracker is setup -> commit/push artifacts -> create/update tracker"
- **[[c13]]** `stakeholder` `user, 2026-10-06` — "the daemon is also a model, so why can't the steering be sent to the daemon? actually it really doesn't matter who executes, can happen on both daemon or controller"
- **[[c14]]** `prior-artifact` `LLD-38436e90625a83a2-S001, four reviews by the daemon on 2026-10-06 of the daemon-side design: block each time (8, 6, 6 and 4 premises did not hold)`
- **[[c15]]** `prior-artifact` `LLD-38436e90625a83a2-S001 fifth review of 2026-10-06 by the daemon, the first of the simple flow: block, 7 premises did not hold; this revision answers each`
- **[[c16]]** `code` `src/workflow/tracker/refs.ts` — "export function patchTrackerMeta(jsonPath: string, patch: Readonly<Partial<TrackerMeta>>): TrackerMeta {"

## 9. Open questions

- An approval made from the VS Code or JetBrains plugin has no model driving it, so its directive is not carried out until someone works the pending list. Should the daemon carry it out with its own model in that case? The user has said either executor is acceptable; this build does not wire the daemon's model, and leaves the TUI's existing code push as it is.
- The first design round was told "only one flag". This design keeps one more switch: a github.json entry with type 'none' still turns the tracker off for a repo, so nobody who opted out is opted in. Should that old opt-out be honoured, as designed, or ignored so that the setting alone decides?

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 1 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T08:12:16.494Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | The record phase writing the ref to "the artifact's meta.tracker" is a complete inventory of where a ref must land (3.4: HLD has epicRef; LLD has storyRef). | The Define is the epic-level aggregate that existing code reads, and the design never writes it. tracker-auto.ts:148-150 writes epicRef to BOTH the HLD and the Define; :222 writes `storyRefs` on the Define. Readers of the Define only: chain.ts:208-209 `if (meta.tracker === undefined \|\| typeof meta.tracker.epicRef !== 'string') return { pushed: false };`; sync.ts:25-29 reads the Define and returns 'Epic not pushed yet (no epicRef in meta.tracker)'; tracker-auto.ts:187-190 (TUI LLD approve) 'Epic not pushed yet; approve the HLD (with tracker) first'; context.ts:58-63 builds tracker.push's `existingRefs` from `epic.meta.tracker` and context.ts:115-120 / :151-153 throw 'has no tracker refs'. An epic created by a directive and recorded only on the HLD is therefore reported as not pushed by the chain report and sync, and a later tracker.push sees no existing epicRef and is told to create the epic again. [files: src/workflow/tracker-auto.ts, src/workflow/tracker/sync.ts, src/workflow/chain.ts, src/workflow/runners/tracker/context.ts] | Have the record phase also patch the Define aggregate: epicRef on an HLD record, storyRefs[storyId] on an epic LLD record (as autoPushEpicOnHld / autoPushStoryOnLld do), add the Define json and md to the step-4 path list, and add a test that chain / syncTracker see a directive-recorded epic. |
| data-compatibility | HIGH | "What counts as 'tracked' ... an HLD has epicRef; an LLD has storyRef or commentedOn" is enough that a second approval or the backfill never creates an item that is already on GitHub. | Older records can hold a story's ref only on the Define. tracker.push creates an issue for every story of the epic (context.ts:49 `const stories = epic.body.stories.map(...)`) and records `storyRefs` on the Define (orchestrator.ts:2847-2848), then linkDocsToIssues patches each LLD json (link.ts:43-46); when the LLD does not exist yet, relinkDoc's patchTrackerMeta throws and is swallowed (link.ts:49-55 'doc→issue linkage skipped'). An LLD written and approved later has no storyRef although its story issue exists. The existing code handles exactly this: tracker-auto.ts:193-197 'Duplicate guard: adopt from the Epic's storyRefs map if present'. The design's test looks only at the LLD, and its fallback lookup is by a new unique label `insrc:story-<hash8>-<storyId>` that issues created by the existing code never carry (they get `[cfg.storyLabel, epicMembershipLabel(epicSlug)]`, tracker-auto.ts:206; epics get `[cfg.epicLabel, membership]`, :138). So the directive, and the backfill for every such story, creates a second issue. The same applies to an HLD approved after its Define already holds epicRef. [files: src/workflow/tracker/link.ts, src/workflow/orchestrator.ts, src/workflow/tracker-auto.ts, src/workflow/runners/tracker/context.ts] | Define 'tracked' for an HLD as HLD.epicRef OR Define.epicRef, and for an epic LLD as LLD.storyRef OR Define.storyRefs[storyId]; in that case the entry is 'adopt and record', not create. Also have the directive's lookup fall back to the existing label pair (epic/story label + epicMembershipLabel) before creating. Add both cases to T8/T14. |
| coverage-of-intent | MED | "ONE flag turns tracker pushing on or off for a repo" (3.1) while "The TUI approve service keeps what it does today, unchanged" (3.5). | The TUI approve() (src/cli/services/workflow.ts:156-166) calls autoPushEpicOnHld / autoPushStoryOnLld / autoPushTasksOnPlan, whose gate() (src/workflow/tracker-auto.ts:84-96) decides only on resolveGithubConfig(repoPath) and ghAuthOk(). Nothing on that path reads tracker.addItems. So with the setting false and a github.json entry for the repo, a TUI approval still creates the epic/story/task issues and commits; with the setting true and no github.json entry it still pushes nothing. The flag does not govern that path, and the design's open questions do not list this. [files: src/cli/services/workflow.ts, src/workflow/tracker-auto.ts] | Either make gate() in tracker-auto.ts consult the setting reader first (skip when false), or state plainly in the design and the setting's desc that the flag does not govern TUI approvals and record it as an open question. |
| change-sites | MED | The setup check and the setting reader can key on the request's repo path: "req ... the repo path" is always the repo of the approved artifact. | For a single-artifact approval the repo is optional. mcp/server.ts:1100-1106: `const repo = await resolveRepoPath(args.repo); ... repo: repo ?? ''`. daemon/index.ts:645-647: `const repoPath = (p.repo ... : process.env['INSRC_REPO']) ?? ''; // repo is only needed to locate the epic's artifacts dir for a batch`. With repoPath '' the per-repo setting lookup finds nothing (falls to true), no github.json entry matches, and gitOriginOwnerRepo runs `git -C '' remote get-url origin` (github.ts:92), which git resolves against the daemon process's own working directory, not the artifact's repo. The existing push code avoids this by reading `meta.repoPath` off the artifact (tracker-auto.ts:107-110). The design does not say which path the check uses. I did not run the daemon to confirm its working directory. [files: src/mcp/server.ts, src/daemon/index.ts, src/workflow/tracker/github.ts] | Specify that the setup check takes the repo from the approved artifact's meta.repoPath (falling back to req.repoPath), and that an empty or missing repo path gives ready false with a reason, before any git or gh call. Add that case to T3. |
| tests | MED | ac3's "never creates an item twice" is proven by T5-T8, T13, T22. | T8 covers only 'an artifact that is already tracked by its kind's field (issueRef, epicRef, storyRef or commentedOn, taskRefs, closedAt)'. No test covers an item that is on GitHub with its ref held elsewhere: a story whose ref is only in the Define's storyRefs (the case tracker-auto.ts:193-197 guards against and link.ts:49-55 can leave behind), or an issue created by the existing code that carries the old labels and not the new unique label. T22 is a tool-registration test and proves nothing about duplicates. [files: src/workflow/tracker-auto.ts, src/workflow/tracker/link.ts] | Add tests: an LLD with no storyRef whose Define has storyRefs[storyId] gets no create directive; an HLD whose Define has epicRef gets none; the pending list does not list either. Drop T22 from the ac3 row. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | A failed unique-label lookup is detectable by the executor ("The gh command for the lookup exits non-zero") as distinct from 'no such issue'. | The directive is carried out by a model running gh itself, so the code offers no check. The existing wrapper ghFindIssueByLabels (tracker/github.ts:215) returns `string \| undefined`; I did not read its body to see whether it turns a gh failure into undefined, and the design does not give the exact gh command or how the executor tells an empty result from an error. No test can cover this, since tests never run gh (T15). | Put the exact lookup command and the rule for 'empty result' versus 'non-zero exit' in the directive's fixed wording, and assert that wording in T9. |
