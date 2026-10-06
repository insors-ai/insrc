<!-- insrc:artifact LLD-38436e90625a83a2-S001 -->

# LLD: E2026100638436e90:S001

## Summary

**Epic:** `add-add-items-tracker-setting-have`
**HLD base run:** `wf-1791269694769-m51qfj`
**HLD effective hash:** `38436e90625a...`

A new setting, "Add items to tracker", is on by default for every repo and can be turned off per repo from the VS Code and JetBrains settings pages. When it is on and the gh tool is installed and signed in, the daemon itself adds or updates the GitHub item each time a workflow item is approved, whichever way the approval was made: an issue record becomes a GitHub issue, an epic, its stories and its tasks are pushed as today, and a standalone story gets its own issue. The approval result and the workflow's own messages say what was added or why nothing was, and the model in the session no longer runs gh. A one-off backfill adds the approved items that were never pushed.

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
approveWorkflowTarget(req: WorkflowApproveRequest, opts?: { enforce?: boolean; tracker?: TrackerStepDeps }): Promise<WorkflowApproveResult>
```

**Parameters:**
- `req: WorkflowApproveRequest` — Unchanged: one artifact path or an epic hash, the repo path, and an optional override reason.
- `opts.tracker: TrackerStepDeps` _(optional)_ — Test seam for the tracker step (the setting reader, the gh check and the gh calls). Defaults to the real ones.

**Returns:** `Promise<WorkflowApproveResult>` — As today, plus a new optional field tracker[]: one outcome per approved artifact that is a tracker item, { path, item: 'issue' | 'epic' | 'story' | 'tasks' | 'completion', status: 'created' | 'updated' | 'already-exists' | 'closed' | 'skipped' | 'failed', ref?, reason? }.

**Errors:**
- `none new` when A tracker step that is skipped or fails never fails or undoes the approval; it is reported in tracker[] with its reason.

**Preconditions:**
- Declared in src/workflow/gates.ts. Called by the daemon's 'workflow.approve' handler (src/daemon/index.ts:643), which serves insrc_workflow_approve and the plugins.

**Postconditions:**
- For each artifact it approves, it runs the tracker step once, AFTER the approval stamp is written, serially, never in parallel.
- An artifact that was withheld (in skipped[]) gets no tracker step.
- The tracker step is the only place that decides what a given approval adds to the tracker; no caller chooses a push by itself.

### 2.2 `approve`

```typescript
approve(artifactPath: string, withTracker?: boolean, overrideReview?: string): ApproveOutcome
```

**Parameters:**
- `withTracker: boolean` _(optional)_ — Unchanged meaning: false suppresses the tracker step for this call.

**Returns:** `ApproveOutcome` — Unchanged shape. Its tracker result now comes from the shared tracker step, so the TUI adds the same items as every other path, including an issue record and a standalone story.

**Preconditions:**
- Declared in src/cli/services/workflow.ts:158. It calls approveArtifactByJsonPath directly today and then picks one of three pushes by workflow name.

**Postconditions:**
- Its own switch over the three pushes is replaced by one call to the shared tracker step.
- Its commit of the approved artifacts after the push stays as it is.

### 2.3 `autoPushStoryOnLld`

```typescript
autoPushStoryOnLld(lldJsonPath: string): AutoPushResult
```

**Parameters:**
- `lldJsonPath: string` — The approved LLD's json path.

**Returns:** `AutoPushResult` — Unchanged for a story under an epic. New for a standalone story: when the work item has an issue record with a tracker ref, the design is linked on that GitHub issue and the result is 'updated'; when it has none, one GitHub issue is created for the story from the LLD's title and summary, labelled as a story, and its ref is stored on the LLD's meta.tracker.storyRef.

**Preconditions:**
- Declared in src/workflow/tracker-auto.ts:165. Today it fails for a standalone story because it reads a parent Define that does not exist.

**Postconditions:**
- A second approval of the same LLD creates nothing: the stored ref makes it 'already-exists'.

### 2.4 `createBugfixTrackerIssue`

```typescript
createBugfixTrackerIssue(input: { repoPath: string; issueHash: string }, deps: TrackerCreateDeps): Promise<TrackerIssueResult>
```

**Parameters:**
- `input: { repoPath: string; issueHash: string }` — Unchanged.

**Returns:** `Promise<TrackerIssueResult>` — Unchanged. It is now reached: the tracker step calls it when an issue record is approved.

**Preconditions:**
- Declared in src/workflow/bugfix/tracker.ts:142. Not reached from any approval today (src/workflow/bugfix/mount.ts).

**Postconditions:**
- Its existing rule holds: a ref already on the issue record's meta.tracker means the GitHub issue exists and none is created.
- closeBugfixTrackerIssue is reached the same way when the work item's BUILD record is approved.

### 2.5 `resolveGithubConfig`

```typescript
resolveGithubConfig(repoPath: string, configPath?: string): ResolvedGithubConfig
```

**Parameters:**
- `repoPath: string` — Unchanged.

**Returns:** `ResolvedGithubConfig` — Unchanged where github.json has an entry for the repo or a default entry. New: with NO entry at all, it no longer returns type 'none'; it resolves a GitHub target from the repo's git remote with the default labels, so a repo is tracked by default. It still returns 'none' when an entry says type 'none', or when the repo has no GitHub remote.

**Preconditions:**
- Declared in src/workflow/config/github.ts. Today the implicit default with no entry is 'none'.

**Postconditions:**
- An explicit type 'none' in github.json keeps the tracker off for that repo whatever the new setting says.
- The owner and repo still never come from the default entry, only from the repo's own entry or its git remote.

## 3. Data model changes

### 3.1 `Setting tracker.addItems` — new

A catalog row: path tracker.addItems, type boolean, default true, label "Add items to tracker", in a Tracker group. It is the default for every repo. A per-repo value is stored in the same config file under tracker.byRepo.<repoPath>.addItems, the same dynamic-key pattern as models.byRepo. One reader returns the value for a repo: the per-repo value when present, otherwise the catalog value, otherwise true. Both settings pages show the row; the value they show and write is the one for the open project, and they write it with the existing config.write request using the per-repo path. The VS Code plugin also declares the setting in its package.json, as it does for every other row.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/index.ts`
- `vscode-plugin/package.json`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/settings/InsrcSettingsConfigurableTest.kt`

### 3.2 `Tracker step` — new

One function in src/workflow/tracker-auto.ts that takes an approved artifact's json path and returns one outcome. It first checks, in this order: the setting for the repo is true; the gh tool is installed; gh is signed in; the repo resolves to a GitHub target. Any of these failing returns 'skipped' with a reason that names which one. Then it acts by the kind of artifact: an ISSUE creates a GitHub issue (createBugfixTrackerIssue); an HLD pushes the epic and its stories (autoPushEpicOnHld); an LLD pushes the story, or handles a standalone story as described under autoPushStoryOnLld; a PLAN pushes its tasks (autoPushTasksOnPlan), still subject to the existing pushTasks setting; a BUILD record closes the work item's GitHub issue when it has one. Every other kind (DEF, SPEC, CR, EXT) returns no outcome. Detection of the tool is separate from sign-in so the reason can say which is missing; today the one check, ghAuthOk, reports both as one.

**Call sites:**
- `src/workflow/tracker-auto.ts`
- `src/workflow/tracker/github.ts`
- `src/workflow/bugfix/tracker.ts`
- `src/workflow/gates.ts`
- `src/cli/services/workflow.ts`

### 3.3 `What the workflow says about the tracker` — new

Three places. (1) The result of insrc_workflow_approve carries tracker[] and its description says the daemon adds or updates the tracker item on approval and that the model must not run gh for it. (2) The done response of insrc_workflow_step, which already carries pendingApproval, gains one line saying what approving this artifact will do in the tracker: the target it will be added to, or why it will not be (setting off, gh missing, gh not signed in, no GitHub remote, or a kind that is not tracked). (3) The steering source: the tracker guide and the bugfix guide say that tracking happens in the daemon at approval, which items are tracked and when, that the setting and the gh tool control it, and that the model relays the tracker outcome and never pushes by hand; the tracker.push, tracker.sync and tracker.post workflows remain for an explicit re-push or sync.

**Call sites:**
- `src/mcp/server.ts`
- `src/prompts/steering-block.md`
- `src/workflow/gates.ts`

### 3.4 `Backfill of items never pushed` — new

A daemon request that takes a repo and a dry-run flag. It lists every approved artifact that is a tracker item and carries no tracker ref (approved issue records, approved HLDs, approved LLDs, approved plans), in an order that creates parents before children, and returns the list when the dry-run flag is set. Without the flag it runs the same tracker step on each, one at a time, and returns one outcome per item. An item whose BUILD record is already approved is created and then closed, so finished work does not show as open. Items not yet approved are not pushed; they are pushed when they are approved. It is safe to run twice: an item that already has a ref is reported as already there.

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
  - Detection: resolveGithubConfig returns type 'none', or raises its configuration error.
  - Response: The outcome is 'skipped' with that reason. The approval stands.
  - User impact: The user is told no GitHub target could be found for the repo.
- **A gh call fails while creating or updating the item (network, permissions, rate limit, a label or issue type the organisation does not have).** (recoverable)
  - Detection: The gh call exits non-zero, or the push function returns status 'failed'.
  - Response: The outcome is 'failed' with gh's message. Nothing is retried in the same approval. The approval stands, and no tracker ref is written, so a later approval of the same artifact or the backfill tries again.
  - User impact: The approval result says the tracker step failed and why; the item is approved but not on the tracker.
- **The GitHub issue was created but the ref could not be written back to the artifact.** (recoverable)
  - Detection: The write of meta.tracker throws after the create call returned a ref.
  - Response: The outcome is 'failed' and names the created ref, so it can be linked by hand; the existing relink-by-label path for issue records recovers it.
  - User impact: The user sees the ref and that it was not recorded; a second approval could otherwise create a duplicate.
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
| The setting is true by default and the repo's github.json entry says type 'none'. | Skipped: the explicit opt-out in the tracker config wins. |
| A repo with no entry in github.json and a GitHub remote. | Tracked by default: the target is the git remote and the default labels are used. |
| An artifact whose item is already on the tracker is approved again. | 'already-exists' with its ref; nothing is created. |
| An LLD under an epic whose HLD was never pushed. | 'skipped' with the existing reason that the epic is not on the tracker yet; the backfill creates the epic first and then the story. |
| A standalone story whose work item has an issue record that is already on the tracker. | No second issue is created; the design is linked on the existing GitHub issue and the outcome is 'updated'. |
| A plan is approved and the tracker config has pushTasks false. | 'skipped' for the tasks with that reason; the existing setting still decides whether tasks become issues. |
| A batch approval of several artifacts under one epic. | One tracker outcome per approved artifact, run one after another in the order they were approved; withheld artifacts have none. |
| A DEF, SPEC, CR or EXT artifact is approved. | No tracker outcome: these kinds are not tracker items. |
| The backfill meets a finished work item (its BUILD record is approved). | Its GitHub issue is created and then closed, so it does not appear as open work. |
| The backfill is run with the dry-run flag. | It returns the list of items it would add, in order, and makes no gh call that changes anything. |
| An issue record that is not yet approved. | Not pushed by the approval step or the backfill; it is pushed when it is approved. |

**Invariants to preserve**

- An approval is never failed, undone or delayed past its stamp by the tracker: the stamp is written first and the tracker step only reports. [[c1]]
- The GitHub owner and repo never come from the default entry of the tracker config; only from the repo's own entry or its git remote. [[c2]]
- A stored tracker ref means the item exists: no push function creates a second item for an artifact that already carries a ref. [[c2]]
- The other-party review rule and the code-review gate decide whether an artifact is approved before any tracker step runs; a withheld artifact is never pushed. [[c1]]
- gh is never run by a test and never by the model in the session; tracker functions take their gh calls as injected dependencies. [[c6]]
- Every setting the plugins show comes from the config catalog and is written through config.write. [[c4]]

## 5. Test strategy

**Test framework:** `node:test via `npx tsx --test` under Node 22; the JetBrains plugin's tests run under Gradle`

**Test levels**

- **contract** — The Story lists no acceptance criteria, so they are defined here.
  - Subjects: `ac1: a setting "Add items to tracker", default true, can be set per repo and is shown on the VS Code and JetBrains settings pages`, `ac2: with the setting on and gh installed and signed in, approving an item adds or updates it on the tracker on every approval path, done by the daemon`, `ac3: an approved issue record creates a GitHub issue; a standalone story gets one; epic, story and tasks are pushed as before`, `ac4: a tracker step that is skipped or fails never fails the approval and always says why`, `ac5: the approval result, the workflow step's done message and the steering say what the tracker did or will do, and tell the model not to run gh`, `ac6: a backfill adds the approved items that were never pushed, in parent-first order, safely repeatable, with a dry run`
- **unit** — The setting and the checks that gate the tracker step.
  - Subjects: `T1 the setting reader: per-repo value wins, then the catalog value, then true`, `T2 the catalog has the tracker.addItems row, boolean, default true; the row count in the catalog contract test is updated`, `T3 with the setting false the step is skipped and makes no gh call at all`, `T4 gh not installed, gh not signed in, and no GitHub target each give 'skipped' with their own reason`, `T5 resolveGithubConfig with no entry resolves the git remote; an entry with type 'none' still returns none; the default entry never supplies owner or repo`
  - Fixtures: `a temp config file and a temp github.json through INSRC_GITHUB_CONFIG`
- **unit** — What the tracker step does for each kind of artifact, with gh faked.
  - Subjects: `T6 an approved ISSUE creates one GitHub issue and stores its ref; approving again gives 'already-exists'`, `T7 an HLD, an LLD under an epic and a PLAN each call the existing push and return its result`, `T8 a standalone LLD with no issue record creates one story issue and stores the ref; with an issue record already on the tracker it links the design there and creates nothing`, `T9 an approved BUILD record closes the work item's GitHub issue; with no ref it does nothing`, `T10 a DEF, SPEC, CR and EXT give no outcome`, `T11 a gh failure gives 'failed' with the message and writes no ref; a failed write-back names the created ref`
  - Fixtures: `injected gh functions that record their calls`
- **integration** — Every approval path runs the same step.
  - Subjects: `T12 approveWorkflowTarget returns tracker[] with one outcome per approved tracker item, in order, and none for a withheld artifact`, `T13 a tracker step that throws or fails leaves the artifact approved and the rest of a batch approved`, `T14 the daemon's workflow.approve result carries tracker[] through to insrc_workflow_approve`, `T15 the TUI approve service produces the same outcome as approveWorkflowTarget for an ISSUE and for a standalone LLD, and withTracker false suppresses it`
  - Fixtures: `the existing approval fixtures and the shared other-party review helper`
- **unit** — What the workflow says.
  - Subjects: `T16 the done response of insrc_workflow_step says what approval will do in the tracker, or why it will not, for each skip reason`, `T17 the steering tracker and bugfix guides and the insrc_workflow_approve description say the daemon tracks at approval, list what is tracked, and tell the model not to run gh; the plugin copy of the steering source is identical to the source`
- **integration** — The backfill, with gh faked.
  - Subjects: `T18 the dry run lists approved untracked items parent first and changes nothing`, `T19 a run creates each item once; a second run reports them as already there; an item whose BUILD record is approved is created and closed; unapproved items are not listed`, `T20 a failure part of the way through keeps the refs already written and a second run continues`
  - Fixtures: `a temp repo with a mix of approved, unapproved, tracked and finished artifacts`
- **unit** — The plugins.
  - Subjects: `T21 the VS Code package.json declares the setting and the settings page writes the per-repo path for the open workspace folder`, `T22 the JetBrains settings page shows the row and writes the per-repo path for the open project`
- **live** — One real run against GitHub, after the build, done by hand and recorded in the build record.
  - Subjects: `T23 approving a real issue record in this repo creates a GitHub issue in insors-ai/insrc and stores its ref`, `T24 the backfill's dry run on this repo is shown to the user before the real run`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `T1`, `T2`, `T21`, `T22` |
| `ac2` | `T3`, `T4`, `T5`, `T12`, `T14`, `T15` |
| `ac3` | `T6`, `T7`, `T8`, `T9`, `T10`, `T23` |
| `ac4` | `T4`, `T11`, `T13` |
| `ac5` | `T16`, `T17` |
| `ac6` | `T18`, `T19`, `T20`, `T24` |

## 6. Migration

**State before:** Only the TUI approve service pushes to GitHub, and only for an HLD, an LLD under an epic and a plan. The in-chat approval and the plugins go through approveWorkflowTarget, which pushes nothing. An approved issue record never creates a GitHub issue and a standalone story cannot be pushed. A repo is tracked only when ~/.insrc/github.json has an entry for it or a default entry. No setting turns tracking on or off, and the steering tells the model to push an epic itself without saying when.

**State after:** A setting, on by default and adjustable per repo from both plugins, controls tracking. With it on and gh installed and signed in, one tracker step runs inside the approval on every path and handles issue records, epics, stories, standalone stories, tasks and completion. A repo with a GitHub remote is tracked without any entry in github.json. The approval result and the workflow's messages report the tracker outcome, the steering tells the model the daemon does it, and a backfill has added the approved items that were never pushed.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the tracker.addItems catalog row and its per-repo reader. Nothing reads it yet. — ↩ rollbackable
2. Add the tracker step with its checks (setting, gh installed, gh signed in, target) and its handling of each artifact kind, including the standalone story and the issue record. Nothing calls it yet. — ↩ rollbackable
3. Call the tracker step from approveWorkflowTarget and return tracker[]; replace the TUI approve service's own switch with the same call; carry tracker[] through the daemon request and insrc_workflow_approve. — ↩ rollbackable
4. Make a repo with no github.json entry resolve to its git remote, so tracking is on by default. An explicit type 'none' still turns it off. — ↩ rollbackable
5. Add the tracker line to the done response of insrc_workflow_step, and rewrite the tracker and bugfix guides in the steering source and the insrc_workflow_approve description; refresh the plugin copy of the steering source. — ↩ rollbackable
6. Show the setting on the VS Code and JetBrains settings pages, reading and writing the per-repo value for the open project. — ↩ rollbackable
7. Add the backfill request with its dry run. — ↩ rollbackable
8. After the daemon is updated: run the backfill's dry run on this repo, show the list to the user, and on their go-ahead run it. Creating GitHub issues cannot be undone by reverting code; they can only be closed. — ✕ non-rollbackable _(needs: `the user's go-ahead on the dry-run list`)_

**Backward compat:** approveWorkflowTarget gains an optional field in its result and an optional test seam; its existing fields and its decisions are unchanged. The TUI approve service keeps its signature and its withTracker switch. The three existing push functions keep their signatures. Artifacts already on the tracker keep their refs and are never pushed again. The one behaviour change that reaches existing users is step 4: a repo with a GitHub remote and no tracker config starts being tracked; setting tracker.addItems to false for the repo, or type 'none' in github.json, restores the old behaviour.

## 7. Alternatives considered

### 7.1 a1: Catalog setting with a per-repo override, one tracker step inside the approval — **CHOSEN**

A catalog row gives the default; a per-repo key overrides it; approveWorkflowTarget runs one tracker function for every artifact it approves.

Add a catalog row tracker.addItems (boolean, default true) and a per-repo override stored under tracker.byRepo.<repoPath>.addItems in the same config file, read by one resolver. Add one function that, given an approved artifact, decides what to add or update in the tracker (issue record, epic, story, standalone story, tasks) and returns an outcome. approveWorkflowTarget calls it for each approved artifact and returns the outcomes in a new tracker[] field; the TUI approve service calls the same function in place of its own switch. The plugins show the row from the catalog and write the per-repo key for the open project.

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

## 9. Open questions

- When a plan is approved, should its tasks become GitHub issues whenever "Add items to tracker" is on, or stay under the existing pushTasks setting (off unless the tracker config turns it on)? The design keeps pushTasks in charge.
- The TUI commits and pushes the approved artifacts after it adds them to the tracker, so the links in the GitHub issue resolve. Should the daemon do the same on an in-chat approval? The design does not: it leaves committing to the session, so a link can be dead until the artifacts are pushed.
- In the backfill, should finished work (its BUILD record already approved) be created on GitHub and closed at once, or left off the tracker? The design creates and closes it.
