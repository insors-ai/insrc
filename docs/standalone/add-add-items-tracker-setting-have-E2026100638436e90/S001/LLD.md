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

One function, new in src/workflow/tracker-auto.ts, that answers whether the tracker is set up for a repo and, if so, where. It checks, in this order, and stops at the first that fails with a reason naming it: (1) the setting for the repo is true; (2) a GitHub target is found: the owner and repo of the repo's entry in github.json when it names them, otherwise the repo's git remote (the existing gitOriginOwnerRepo in src/workflow/tracker/github.ts); (3) the gh tool is installed; (4) gh is signed in (the existing ghAuthOk). The target is checked before gh, so a repo with no GitHub remote, which is every temp repo in the test suites, never runs gh. It returns ready with the owner, repo and label names (from the repo's github.json entry, then its default entry, then the built-in defaults), or not ready with the reason. It reads; it changes nothing. It does not call resolveGithubConfig, so that function's nine callers behave as before.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/config/github.ts`

### 3.3 `Tracker directive` — new

A small structured instruction, built by one function from an approved artifact and the setup check's answer, and returned in the approval result. It is the same for whoever carries it out. It has: the target (owner/repo); step 1, the documents to commit and push, as an explicit list of paths (the approved artifact's json and markdown, and the work item's definition files) with a commit message, and the rule that ONLY those paths are committed (git add and git commit both with the explicit pathspec) and that the push is a plain push of the current branch; step 2, the tracker action for the item's kind; and step 3, the call that records the result. Step 2 by kind. ISSUE record: look for an issue with the record's unique label insrc:issue-<first 8 of its hash>; if there is one, adopt it; if the lookup fails, stop and report; otherwise create an issue with the record's title, its rendered markdown as the body, and the labels insrc:issue and the unique label. HLD: push the epic and its stories by running the existing tracker.push workflow for the epic. LLD under an epic: the same workflow, which adds the story. Standalone LLD: when the work item's issue record already has a ref, add a comment on that issue linking the design; otherwise create an issue for the story with the story label and a unique label insrc:story-<first 8 of the hash>-<story id>. PLAN: create one task issue per task under the story's issue (or the issue record's issue), each with a unique label; under an epic the tracker.push workflow does it. BUILD record: close the work item's issue and each task issue, using the refs found on the ISSUE, LLD and PLAN artifacts that share the BUILD record's hash and story id; when none is found the directive says so and names nothing to close. DEF, SPEC, CR and EXT have no directive. Step 3. The result is recorded by one call, so the ref lands on the artifact's meta.tracker by code, not by the model editing json: the new record phase of the tracker tool (next entry). The directive is data plus fixed wording; it is rendered to text by one function so the controller and the daemon's model read the same words.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/gates.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/bugfix/tracker.ts`

### 3.4 `Tracker tool: list and record` — new

One new MCP tool, insrc_tracker_step, with two phases, backed by two daemon requests. Phase 'pending' takes a repo and returns every approved artifact that is a tracker item and carries no tracker ref, parents before children, each with its directive, or with the reason the tracker is not set up; an item whose BUILD record is already approved is marked finished, and its directive says to create it and close it at once. It changes nothing: it is the backfill's dry run and its work list in one. Phase 'record' takes an artifact path and what was done (a created or adopted ref, the task refs of a plan, a comment added, or closed) and writes it to the artifact's meta.tracker with the existing patch function (src/workflow/tracker/refs.ts and patchTrackerMeta), so a second approval or a second backfill finds the ref and gives no directive to create again. It refuses a ref that does not belong to the directive's target.

**Call sites:**
- `src/mcp/server.ts`
- `src/daemon/index.ts`
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/refs.ts`

### 3.5 `Who carries the directive out, and the steering` — new

In a session, the controller carries it out. The insrc_workflow_approve result carries tracker[]; the tool's description and the steering source say: after every approval, for each entry that is ready, do the directive in order (commit and push the listed documents, then the tracker action, then record), and relay each entry that is not ready with its reason; never skip it and never push anything it does not list. The steering's tracker guide and bugfix guide (src/prompts/steering-block.md and its plugin copy vscode-plugin/assets/steering-block.md) are rewritten to say this, and to say that the one setting and the gh tool decide whether there is a directive. The done response of insrc_workflow_step, whose pendingApproval block is built in src/mcp/workflow-step/phases/synthesize.ts:109 and typed in src/mcp/workflow-step/types.ts:129, gains a line saying whether approving this artifact will produce a tracker directive, or why not. Outside a session there is no controller. The TUI approve service keeps what it does today, unchanged: its three code pushes and its commit (src/cli/services/workflow.ts:156-166). The directive is written so that the daemon's own model can carry it out as well, since it is plain steps with fixed wording, and the user has said either executor is acceptable; wiring a daemon model session to do so for approvals made from the plugins is NOT part of this build and is left as an open question.

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
  - Detection: The git command exits non-zero when the executor runs step 1.
  - Response: The directive tells the executor to stop, do no tracker action, and report the git error. Nothing is recorded, so the item is still listed as pending.
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

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The setting is false for the repo. | Every entry is ready false with the reason that the setting is off; the setup check makes no gh call. |
| A repo with no entry in github.json and a GitHub remote. | Ready: the target is the git remote and the default labels are used. resolveGithubConfig still returns 'none' for it and its callers behave as before. |
| An artifact whose item is already on the tracker is approved again. | Its entry says the item is already tracked, with its ref, and carries no directive to create. |
| A standalone story whose work item has an issue record already on the tracker. | The directive is to comment on that issue with a link to the design; no second issue. |
| A BUILD record is approved and nothing for its Story is on the tracker. | The entry says there is nothing to close. A bugfix built from an issue record under a different hash is the known case; the pending list still shows that issue record, marked 'completion unknown'. |
| A batch approval of several artifacts. | One entry per approved artifact, in order; the steering tells the executor to do them in that order, parents first. |
| A DEF, SPEC, CR or EXT artifact is approved. | No tracker entry. |
| The working tree holds other uncommitted or staged files when the directive is carried out. | Only the listed paths are committed, because both git add and git commit name them; other files, staged or not, are left as they are. The push sends the current branch, which also sends any earlier unpushed commits on it; the directive says so. |
| An issue record that is not yet approved. | No directive and not in the pending list; it gets one when it is approved. |
| A finished item in the pending list (its BUILD record is approved). | Its directive is to create the issue and close it at once. |

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
  - Subjects: `T1 the setting reader: the repo's own value wins, then the catalog value, then true; the module-level seam replaces it for a suite`, `T2 the catalog has the tracker.addItems row, boolean, default true, group Tracker, with its wording in desc; the row count in the catalog contract test is updated`, `T3 the setup check runs setting, target, gh installed, gh signed in, in that order, and stops at the first that fails with its own reason; with the setting off it makes no gh call; with no GitHub target it makes no gh call`, `T4 the target is the repo's github.json entry when it names owner and repo, otherwise the git remote; labels come from the entry, then the default entry, then the built-in defaults; resolveGithubConfig is not called and still returns 'none' with no entry`
  - Fixtures: `a temp github.json through INSRC_GITHUB_CONFIG`, `the setting reader's module-level seam`, `the existing injectable exec in src/workflow/tracker/github.ts as a recording fake`
- **unit** — The directive, built and rendered, for each kind.
  - Subjects: `T5 an ISSUE record's directive lists its json and markdown to commit with an explicit pathspec, then lookup-by-unique-label, adopt or create with both labels, then record`, `T6 an HLD and an LLD under an epic direct the existing tracker.push workflow; a standalone LLD directs a comment on the issue record's issue when it has a ref, otherwise a new story issue with its unique label`, `T7 a PLAN directs one task issue per task under the story's or the issue record's issue; a BUILD record directs closing the refs found on the ISSUE, LLD and PLAN artifacts of the same hash and story, and says so when there are none`, `T8 a DEF, SPEC, CR and EXT have no directive; an artifact that already carries a ref has no directive to create`, `T9 the rendered text is the same whoever the executor is, names only the listed paths, and tells the executor to stop on a git failure or a failed lookup`
- **integration** — The approval result and the tool.
  - Subjects: `T10 approveWorkflowTarget returns tracker[] with one entry per approved tracker item, in order, none for a withheld artifact, and runs no gh or git command that changes anything`, `T11 an error while working out an entry leaves the artifact approved and the rest of a batch approved`, `T12 the daemon's workflow.approve result carries tracker[] through to insrc_workflow_approve`, `T13 the record phase writes a created ref, task refs, a comment and closed to meta.tracker; refuses a ref for another repository; after it, a second approval gives no directive to create`, `T14 the pending phase lists approved untracked items parents first with their directives, marks finished ones, leaves out unapproved ones, and changes nothing; after a record it no longer lists the item`, `T15 the existing suites that call approveWorkflowTarget on temp repos make no call whose command is gh: they run under one shared helper that sets the setting reader to true and installs the recording fake, which throws for `git remote get-url` as a repo with no remote does`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`, `one shared test helper for the setting seam and the recording fake`
- **unit** — What the workflow says, and the plugins.
  - Subjects: `T16 the steering tracker and bugfix guides, the insrc_workflow_approve description and the new tool's description tell the executor to carry out each ready directive in order after every approval and to relay a not-ready reason; the plugin copy of the steering source is identical to the source`, `T17 the pendingApproval block of insrc_workflow_step's done response says whether approval will produce a directive, or why not`, `T18 VS Code: package.json declares the setting; the global key maps to the catalog row; the per-repo section writes tracker.byRepo.<repoPath>.addItems for the open workspace folder`, `T19 JetBrains: the settings page shows the default row, and its per-repo section writes tracker.byRepo.<repoPath>.addItems for the open project`
- **live** — One real run against GitHub, after the build, recorded in the build record.
  - Subjects: `T20 approving a real issue record in this repo returns a directive; carrying it out pushes the documents, creates the GitHub issue in insors-ai/insrc and records its ref`, `T21 the pending list for this repo is shown to the user before any item of the backfill is carried out`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T18`, `T19` |
| `ac2` | `T3`, `T5`, `T9`, `T10`, `T12`, `T20` |
| `ac3` | `T5`, `T6`, `T7`, `T8`, `T13` |
| `ac4` | `T3`, `T4`, `T11` |
| `ac5` | `T16`, `T17` |
| `ac6` | `T14`, `T21` |

## 6. Migration

**State before:** Only the TUI approve service pushes to GitHub, by code, for an HLD, an LLD under an epic and a plan, and commits the artifacts. The in-chat approval returns nothing about the tracker, and the steering tells the model to push an epic itself without saying when. An approved issue record never reaches GitHub and a standalone story cannot be pushed. A repo is tracked only when ~/.insrc/github.json has an entry for it. No setting turns tracking on or off.

**State after:** One setting, on by default and adjustable per repo from both plugins, turns tracker pushing on or off. Every approval result says, per item, whether the tracker is set up, and when it is, carries a directive: commit and push the listed documents, create or update the item, record it. The steering tells the executor to carry it out every time. A pending list gives the same directives for every approved item never pushed. The TUI's own push and resolveGithubConfig are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row (wording in desc) and its per-repo reader with its test seam. — ↩ rollbackable
2. Add the setup check and the shared test helper; put the existing approval suites on the helper. — ↩ rollbackable
3. Add the directive builder and its text rendering for each kind. — ↩ rollbackable
4. Return tracker[] from approveWorkflowTarget and carry it through the daemon request and insrc_workflow_approve. — ↩ rollbackable
5. Add the insrc_tracker_step tool with its pending and record phases and their two daemon requests. — ↩ rollbackable
6. Add the tracker line to the pendingApproval block of insrc_workflow_step; rewrite the tracker and bugfix guides in the steering source and the tool descriptions; refresh the plugin copy of the steering source. — ↩ rollbackable
7. Show the setting on the VS Code and JetBrains settings pages: the default row from the catalog and the repo's own value in the per-repo section. — ↩ rollbackable
8. After the daemon is updated and the session's tools reloaded: show the pending list for this repo to the user and, on their go-ahead, carry the directives out one by one. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the pending list`)_

**Backward compat:** approveWorkflowTarget gains one optional field in its result; nothing else about it changes. resolveGithubConfig, the three push functions, the issue-record functions, the bugfix follow-on and the TUI approve service are not changed. Artifacts already on the tracker keep their refs. One new MCP tool and two new daemon requests are added. What changes for the user: with the setting on (the default) and gh signed in, every in-chat approval of a tracked kind is followed by a commit and push of the approved documents and a GitHub item, carried out by the model on the directive; turning the setting off for the repo stops it.

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

## 9. Open questions

- An approval made from the VS Code or JetBrains plugin has no model driving it, so its directive is not carried out until someone works the pending list. Should the daemon carry it out with its own model in that case? The user has said either executor is acceptable; this build does not wire the daemon's model, and leaves the TUI's existing code push as it is.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**7 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-06T08:08:08.076Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | HIGH | For an HLD, an LLD under an epic and a PLAN under an epic, the directive can reuse the existing tracker.push workflow whenever the new setup check says ready, including a repo with no github.json entry and a GitHub remote. | tracker.push resolves its target through the unchanged resolveGithubConfig: runners/tracker/context.ts:41 `requireGithubAdapter(resolveGithubConfig(ctx.intent.repoPath), ...)`, and :203-209 throws 'tracker is disabled via config (type: none ...)' when the result is 'none'. The design's own edge case says resolveGithubConfig 'still returns none' for a repo with no entry, so in the default setup the directive is ready but its step 2 refuses. Task issues are also only pushed when pushTasks is set (context.ts:69 `if (gh.pushTasks)`, default false at config/github.ts:77), so 'under an epic the tracker.push workflow does it' creates no task issues by default. [files: src/workflow/runners/tracker/context.ts, src/workflow/config/github.ts] | Either give the epic kinds a directive that does not go through resolveGithubConfig (direct create by unique label, as for the other kinds), or mark the entry not ready when resolveGithubConfig returns 'none' and say so in the reason. State what happens to PLAN tasks when pushTasks is off. |
| error-paths | HIGH | 'The executor's commit or push fails: stop, do no tracker action' is safe for the backfill, where the documents are already committed. | The existing helper treats this as a normal case, not a failure: tracker/github.ts:73-78 runs `git diff --cached --quiet` and returns 'nothing to commit (already up to date)' before it would commit. The directive instead has the executor run git add and git commit with the pathspec and stop on a non-zero exit; git commit exits non-zero when the listed paths have no changes. The backfill items are approved documents that are already committed (the working tree is clean and the recent commits are these docs), so each stops at step 1 and no GitHub item is created. The same happens on a retry after a push that succeeded. No test covers it. [files: src/workflow/tracker/github.ts] | Have the directive say that 'nothing to commit' for the listed paths is not a failure and the executor continues to the push and step 2; add it to the error table and to T9. |
| change-sites | MED | The inventory for the new MCP tool insrc_tracker_step (src/mcp/server.ts, src/daemon/index.ts, tracker-auto.ts, refs.ts) is complete. | src/mcp/__tests__/schema-registry.test.ts:25-38 pins EXPECTED_TOOLS to the exact registered set and :44-52 pins EXPECTED_PHASES per multi-turn tool ('a second copy independent of server.ts's TOOL_SCHEMA_META'); both fail when a tool is added. The steering source also carries a 'Tool catalog (all registered insrc_* MCP tools)' table. Neither the test nor the catalog table is in the design's call sites or tests (T16 covers only the guides and descriptions). [files: src/mcp/__tests__/schema-registry.test.ts, src/prompts/steering-block.md] | Add the schema-registry test (tool list and phase list) and the steering tool catalog table to the call sites and to the test list. |
| data-compatibility | MED | The record phase can write 'a comment added' and 'closed' to meta.tracker with the existing patch function, and a stored ref then stops a second directive. | tracker/refs.ts:24-37 TrackerMeta has adapter, epicRef, storyRef, issueRef, storyRefs, taskRefs, milestoneRef, labelsCreated, epicStatus, storyStatus, pushedAt, lastSyncedAt. It has no field for a comment or for closed, and patchTrackerMeta (:88) takes Partial<TrackerMeta>. The design adds no field and says 'Data rewrite: no'. A standalone LLD whose directive was 'comment on the issue' ends with no ref of its own, so the pending list ('carries no tracker ref') lists it again and directs a second comment; a closed BUILD record has nothing that marks it closed. [files: src/workflow/tracker/refs.ts] | Name the new TrackerMeta fields (for example commentedOn and closedAt), state which field per kind counts as 'tracked', and add them to section 3. |
| data-compatibility | MED | Committing and pushing the documents first and recording the ref last leaves the stored documents consistent. | patchTrackerMeta rewrites the artifact json in place (refs.ts:89-96), and the design's step 3 runs it after step 1 has committed and pushed that same json. Every carried-out directive therefore leaves the artifact modified and uncommitted, and the ref never reaches the remote. The existing TUI flow orders it the other way for this reason: workflow.ts:164-165 'Commit + push AFTER the tracker push, so the checked-in MD carries the re-rendered **Tracker:** link'. The design also does not re-render the markdown. [files: src/workflow/tracker/refs.ts, src/cli/services/workflow.ts] | State who commits the recorded ref (a second commit of the same paths after record, or record before the commit) and whether the markdown is re-rendered. |
| data-compatibility | MED | A repo whose github.json entry (or default entry) turns the tracker off keeps that choice under the new setup check. | config/github.ts:53-59: `'none'` disables all tracker integration ... the tracker is opt-in', and resolveEntry returns none for `entry.type === 'none'` (:234). The new check reads only owner and repo from the entry, otherwise the git remote, and does not call resolveGithubConfig; the setting defaults to true. A repo with `"type": "none"` and a GitHub remote becomes ready and gets create directives. The design does not mention type 'none'. [files: src/workflow/config/github.ts] | Make an explicit type 'none' (per-repo, and decide for default) a not-ready reason in the setup check, and add the case to T4 and the edge-case table. |
| error-paths | MED | Working out the tracker entry never delays the approval. | The setup check reuses ghAuthOk, which runs `gh auth status` synchronously with no timeout: tracker/github.ts:38-40 `_exec(cmd, args, { stdio: 'ignore' })` via execFileSync. `gh auth status` contacts GitHub, so a slow or hanging network holds the daemon's workflow.approve response (and the daemon's event loop) for each approved artifact in a batch. The design removed the timeouts the rejected alternative a2 had and has no error row for a slow gh. [files: src/workflow/tracker/github.ts] | Give the check's gh call a timeout that becomes ready false with a reason, and run the check once per approve call rather than once per artifact. |

#### Could not verify (does not block)

_None._
