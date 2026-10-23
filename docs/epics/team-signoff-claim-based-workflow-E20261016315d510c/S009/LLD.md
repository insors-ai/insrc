<!-- insrc:artifact LLD-315d510cb28100e2-s9 -->

# LLD: STORY-315d510cb28100e2-s9

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `46e3630565af...`

Issues are created when a draft is first written in any repo whose tracker setting is on, not only in team repos, through the one existing path (ensureDraftIssues, which reuses the unit-issue code and the lenient tracker port the terminal approve also uses, so a manual approve creates only what is missing). Tracker status is refreshed into the artifact's tracker record by one deadline-bound function that reads issue state through the tracker port with the classified gh runner, so any adapter that declares the new status-read capability gets the same steps as GitHub. The daemon's git_pull and git_push tools run that refresh after a git command that integrated or pushed and report a failure as a warning without failing the git operation; the existing explicit sync runs the same refresh. The chain report's tracker record carries the Epic's issue key, the artifact id and the artifact's revision. Every tracker command now has a 120-second timeout.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

> See **HLD-315d510cb28100e2** § 2. Framework summary

**Rollout phase:** <not in any phase>

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The GitHub adapter built by extracting src/workflow/tracker (including the existing signed-in-user read, ghCurrentLogin, behind whoAmI), the issue calls in tracker-auto.ts and the create and close calls in src/workflow/bugfix/tracker.ts behind the port; the gh command wrapper with its 10-second timeout; contract tests; detection of a missing tool or sign-in. The port receives the needed capabilities as an argument, so s1 does not read the policy. Reconciliation: the unbuilt tracker-tool design LLD-38436e90625a83a2-s1 (docs/standalone/add-add-items-tracker-setting-have-E2026100638436e90/S001/LLD.md) is not built as a second abstraction; sc1 is the one tracker abstraction and s1's LLD supersedes or amends that LLD, once its conflicting approval status is settled. Syncing tracker status on git pull and push, and an issue-status read on the port, are deferred to the define extend. — owns `sc1`
- `s2`: Reading the policy file from the remote default branch ref, the cached last-fetched copy and the offline rule, finding the first default-branch commit that carried the policy file, the starter policy and the team setup command. — owns `sc2`
- `s3`: The repo-scoped kind of row in the shared settings catalog whose reads and writes go to the per-repo map in github.json read by resolveGithubConfig; its rendering in VS Code, JetBrains and the terminal client; read-only display of policy values. Shares the single store with s1's target resolution.
- `s4`: Shared issue-creation code refactored out of autoPushEpicOnHld, autoPushStoryOnLld and autoPushTasksOnPlan, find-by-label dedupe for Story and Task issues, forcing Task issues on in team mode, daemon-side triggering when a draft is first written, the terminal approve path kept as manual fallback, the inventory and classification of artifact write paths (including the two writeFileSync writers, and both verdicts.ts and run-artifact.ts as content writes when auto-fixes change the body), the single content-write helper and the revision minting, the bypass test that also detects raw writeFileSync on artifact paths, and the rule that an artifact without meta.revision reads as revision 0. — owns `sc3`
- `s5`: The team gate and its call sites (daemon step entry points and approveArtifactByJsonPath), the acting-user read through the port, claim and release commands, live assignee reads, the guarded-action list (code-review and analyze are never guarded; review is never refused), the report-only review for a non-holder through the review-fix decision on both review paths (verdicts.ts and run-artifact.ts), the typed TeamGateRefusedError, its handling beside ReviewBlockedError in approveWorkflowTarget and its formatting in the terminal client's approve case in src/cli/command.ts, the no-issue outcome handling, administrator release, and the declaration of the completion hook, shipped unregistered. — owns `sc4`
- `s6`: Parking a draft on a handoff branch, the issue note, resuming from committed files, and reconstructing in-flight workflow state from committed artifacts instead of the opaque token.
- `s7`: Opening the signoff request with the chosen artifacts, prerequisite checks for model review and local approval, registering the completion hook to produce the awaiting-signoff outcome, the on-demand completion check, automatic release of the claim on completion, recording sign-off together, grandfathering of artifacts approved before the policy anchor, and the separate display of signoff. — owns `sc5`
- `s8`: Revision of an open request: re-run of local approval, push to the same request, discarding an earlier completion, refusing non-holders.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ensureDraftIssues`

```typescript
ensureDraftIssues(jsonPath: string, deps?: DraftHookDeps): IssueReadiness
```

**Parameters:**
- `jsonPath: string` — the draft that was just written
- `deps: DraftHookDeps` _(optional)_ — test seams, now also the tracker config reader and the lenient port builder

**Returns:** `IssueReadiness` — not-applicable when the repo has no team policy and its tracker setting is none; ready or not-ready otherwise, as today

**Errors:**
- `none thrown` when every failure becomes not-ready; the draft is never undone; a GithubConfigError from resolveGithubConfig (malformed github.json) becomes not-ready with its reason, never not-applicable

**Preconditions:**
- the draft is written

**Postconditions:**
- a repo with no team policy and a tracker setting that is on gets its Epic and Story issues: the on/off check is resolveGithubConfig and the port is createGithubTracker, the same pair the terminal approve uses, so the two paths cannot disagree (ac2)
- a repo with no team policy and tracker type none makes no tracker call and returns not-applicable (ac3)
- a team repo keeps loadTracker and behaves as today (ac1)

### 2.2 `createGithubTracker`

```typescript
createGithubTracker(owner: string, repo: string): TrackerPort
```

**Parameters:**
- `owner: string` — the GitHub owner
- `repo: string` — the GitHub repository

**Returns:** `TrackerPort` — the GitHub adapter, which now also declares status-read and implements readIssueStatus

**Errors:**
- `none thrown` when construction does not call gh

**Postconditions:**
- its declared capabilities include status-read

### 2.3 `TrackerPort.readIssueStatus`

```typescript
readIssueStatus?(issue: IssueRef): PortResult<{ state: 'open' | 'closed'; labels: string[] }>
```

**Parameters:**
- `issue: IssueRef` — the issue to read

**Returns:** `PortResult<{ state: 'open' | 'closed'; labels: string[] }>` — the issue's state and labels, or a failure with a port kind

**Errors:**
- `PortFailure` when missing-tool, missing-signin, unreachable (the 120-second runGh timeout) or rejected, as classifyGhFailure sorts them

**Preconditions:**
- the adapter declares the status-read capability

**Postconditions:**
- read-only: nothing is changed in the tracker
- the GitHub adapter runs gh through runGh with --json state,labels, not through ghGetIssueState

### 2.4 `syncTracker`

```typescript
syncTracker(repoPath: string, epicHash: string, deps?: SyncDeps): SyncResult
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the Epic whose issue and Story issues are read
- `deps: SyncDeps` _(optional)_ — the port builder, a clock and a deadline, for tests

**Returns:** `SyncResult` — synced with the mapped statuses, skipped with a reason (no issue yet, tracker disabled, time limit reached), or failed with the port failure

**Errors:**
- `none thrown` when a tracker without the status-read capability is returned as failed, naming the capability (k8)

**Postconditions:**
- on success epicStatus, storyStatus and lastSyncedAt are written into the Define's meta.tracker through patchTrackerMeta, and nothing else on the head changes
- the status mapping (mapIssueStatus) is the one GitHub used
- the deadline is checked before every issue read; a Story not read before it is reached is left out of storyStatus and the result says the time limit was reached

### 2.5 `refreshTrackerStatus`

```typescript
refreshTrackerStatus(repoPath: string, epicHash?: string, deps?: SyncDeps): TrackerRefreshReport
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` _(optional)_ — one Epic; omitted, every Epic that has a bound issue
- `deps: SyncDeps` _(optional)_ — test seams, the clock and the deadline

**Returns:** `TrackerRefreshReport` — one SyncResult per Epic and a single line of warning text for each skipped or failed one

**Errors:**
- `none thrown` when every failure, including the deadline, is a skipped or failed result inside the report

**Postconditions:**
- a repo whose tracker setting is none makes no tracker call and reports nothing to refresh
- one deadline of 120 seconds (TRACKER_REFRESH_DEADLINE_MS) covers the whole call and is checked before each tracker call, serially; a started gh call is bounded by its own 120-second runGh timeout, so the call returns within 240 seconds at the latest; the sign-in check counts inside the deadline
- Epics not reached before the deadline are reported skipped with 'time limit reached'
- the calls are synchronous, so the daemon event loop is blocked while they run; this is accepted until the daemon is multi-threaded

### 2.6 `sync`

```typescript
sync(repoPath: string, epicHash: string): SyncResult
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the Epic to refresh

**Returns:** `SyncResult` — the result of the refresh for that Epic

**Errors:**
- `none thrown` when as refreshTrackerStatus

**Postconditions:**
- the existing explicit refresh in src/cli/services/workflow.ts now runs through refreshTrackerStatus, and a daemon IPC method tracker.refresh runs the same function for clients that cannot call the terminal service (ac5)

### 2.7 `gitPullTool`

```typescript
gitPullTool.execute(input: ToolInput): Promise<ToolResult>
```

**Parameters:**
- `input: ToolInput` — cwd, remote, branch, mode, dryRun

**Returns:** `ToolResult` — the git result; after an integrating pull it also carries the tracker refresh warning, if any

**Errors:**
- `unchanged` when a failed git command is returned as before; the refresh does not run

**Postconditions:**
- after a successful pull that is not a dry run, refreshTrackerStatus runs and its failure is added as a warning to the result, never turning success into failure (ac6)
- a dry-run pull runs no refresh

### 2.8 `gitPushTool`

```typescript
gitPushTool.execute(input: ToolInput): Promise<ToolResult>
```

**Parameters:**
- `input: ToolInput` — cwd, remote, ref, dryRun

**Returns:** `ToolResult` — the git result; after a push that pushed it also carries the tracker refresh warning, if any

**Errors:**
- `unchanged` when a failed git command is returned as before; the refresh does not run

**Postconditions:**
- the refresh runs only when the result's data.pushed is true; a dry-run push, which returns success with pushed false, runs no refresh
- a refresh failure is added as a warning (ac6)

### 2.9 `patchTrackerMeta`

```typescript
patchTrackerMeta(jsonPath: string, patch: Readonly<Partial<TrackerMeta>>): TrackerMeta
```

**Parameters:**
- `jsonPath: string` — the head to patch
- `patch: Readonly<Partial<TrackerMeta>>` — the fields to set

**Returns:** `TrackerMeta` — the merged tracker block

**Postconditions:**
- unchanged; the refresh is its only new caller

## 3. Data model changes

### 3.1 `Capability` — field-modify

The union gains 'status-read', declared by an adapter that implements readIssueStatus. It is added in three places: the union, the ALL_CAPABILITIES list that missingCapabilities filters (without it a tracker lacking the capability would never be reported missing and the k8 error path would not fire), and the GitHub adapter's declared set.

**Call sites:**
- `src/workflow/tracker/port.ts:21`
- `src/workflow/tracker/port.ts:127-131`
- `src/workflow/tracker/github-adapter.ts:57`

### 3.2 `TrackerPort` — field-add

Optional readIssueStatus(issue) as above; the GitHub adapter implements it with runGh.

**Call sites:**
- `src/workflow/tracker/port.ts:90-114`
- `src/workflow/tracker/github.ts:86-97`

### 3.3 `GH_TIMEOUT_MS` — field-modify

The per-command timeout of every tracker gh call goes from 10_000 to 120_000 ms by the user's decision of 2026-10-23. It changes the bound of every gh command, not only the new read, and the HLD's non-functional line ('every tracker command has a 10-second timeout') is retargeted by an amendment. The constant also builds the 'gh timed out after N s' message, which then says 120 s.

**Call sites:**
- `src/workflow/tracker/github.ts:49`
- `src/workflow/tracker/github.ts:86-97`

### 3.4 `ChainReport.tracker` — field-add

The shown tracker record gains read-only artifactId (the Define's artifact id) and revision (its meta.revision, 0 when absent), built by readTrackerMeta and printed by the tracker section of the chain report, next to epicRef and lastSyncedAt. No stored field is added: the stored TrackerMeta is unchanged, so patchTrackerMeta cannot persist them and there is no second revision counter; schemaVersion is untouched.

**Call sites:**
- `src/workflow/chain.ts:67-71`
- `src/workflow/chain.ts:228-235`
- `src/workflow/chain.ts:370-376`

### 3.5 `IssueReadiness` — invariant-change

not-applicable with reason no-team-policy used to mean only 'no team policy'. It now means no team policy AND a tracker setting of none; a repo with no team policy and a tracker that is on is processed as a team repo is. This overrides epic constraint k4 for that one behaviour, by the user's decision of 2026-10-23: the terminal-only creation was a bug this Story replaces, and the tracker type is the switch, with no new setting.

**Call sites:**
- `src/workflow/draft-issues.ts:94-145`
- `src/workflow/tracker-auto.ts:85-103`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes the port for creation (issue-create) as today and adds one optional read, readIssueStatus, with its capability, proposed as a methodAdd amendment; the owner Story s1 keeps the contract. |
| `sc3` | consumes | Reads meta.revision and the per-unit issue record; adds no stored field to the tracker record. |

## 5. Error paths

**Error cases**

- **The tracker is slow or down while a draft is first written in a repo with no team policy** (recoverable)
  - Detection: the port from createGithubTracker or the unit-issue ensure returns a PortFailure (unreachable after the 120-second runGh timeout, missing-signin, missing-tool)
  - Response: ensureDraftIssues returns not-ready with the failure kind and a message; the draft stays; the next draft write or the terminal approve retries
  - User impact: A notice says the issue was not created; the author is never blocked, because a repo with no team policy has no claim to wait for
- **github.json is malformed in a repo with no team policy** (recoverable)
  - Detection: resolveGithubConfig throws GithubConfigError
  - Response: ensureDraftIssues returns not-ready with the config error as its reason, never not-applicable
  - User impact: The author is told the tracker config is invalid instead of the hook silently doing nothing
- **The tracker is slow or fails during the refresh after git_pull or git_push** (recoverable)
  - Detection: syncTracker returns failed or skipped, or the 120-second deadline is reached before the next tracker call
  - Response: refreshTrackerStatus returns the failed or skipped result in its report; the tool result stays success true and gains a one-line warning
  - User impact: The pull or push completes, later than usual because the synchronous refresh blocks the daemon, and the user is told that the tracker status was not refreshed and why (ac6)
- **A configured tracker whose adapter does not declare status-read is asked to refresh** (terminal)
  - Detection: the capability check, missingCapabilities, which filters ALL_CAPABILITIES, reports status-read
  - Response: SyncResult failed with a reason naming status-read; nothing is written into meta.tracker
  - User impact: A clear message instead of a silent skip (k8)
- **The status was read but could not be written into the Define's meta.tracker** (recoverable)
  - Detection: patchTrackerMeta throws on the atomic write
  - Response: SyncResult failed with the error; the head is untouched because the write is atomic
  - User impact: A warning on the refresh; the next refresh retries
- **The Epic's Define head is unreadable or the Epic has no bound issue** (recoverable)
  - Detection: unitIssueOf returns nothing, or readDefineArtifact throws while listing Stories
  - Response: skipped with the reason for no issue; an unreadable Story list yields no Story statuses, as today
  - User impact: A skipped line in the report, no failure

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no team policy and tracker type none | ensureDraftIssues returns not-applicable and makes no tracker call; nothing fails (ac3) |
| A repo with no team policy whose github.json entry has no type | the lenient reader and the lenient port agree, so the hook creates the issues as the terminal approve would; the strict loader is not consulted |
| A repo with no team policy whose Epic issue already exists, then the terminal approve is used | the shared ensure code finds the recorded or labelled issue and creates nothing; no duplicate (ac4) |
| git_pull with dryRun true | no refresh: nothing was integrated |
| git_push with dryRun true, which returns success with data.pushed false | no refresh: nothing was pushed |
| A push that git rejects | the failed git result is returned as before and no refresh runs |
| Several Epics in the repo and a slow tracker | each Epic with a bound issue is read in turn, serially; those not reached before the 120-second deadline are reported skipped with 'time limit reached' |
| A team repo | the hook and the refresh behave as before; the team gate and claims are unaffected |
| An artifact with no meta.revision | the chain report's tracker record reads revision 0, the sc3 rule |

**Invariants to preserve**

- A team repo keeps today's draft hook behaviour and its not-ready messages [[c1]]
- The existing meta.tracker fields keep their names and meaning; the refresh writes only epicStatus, storyStatus and lastSyncedAt [[c3]]
- The terminal approve path stays as the manual fallback and creates only missing issues [[c2]]
- A tracker failure never fails a git operation or undoes a draft [[c3]]

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests co-located in __tests__`

**Test levels**

- **unit** — The draft hook for team repos, repos with no team policy and a tracker that is on, and repos with tracker type none or a malformed config; the refresh and the sync over a fake port, including the deadline; the chain report record
  - Subjects: `ensureDraftIssues: a team repo; a repo with no team policy and a tracker that is on (creates the Epic and Story issues through the lenient port); a repo with no team policy and tracker type none (no tracker call, not-applicable); a repo with no team policy and a malformed github.json (not-ready with the reason); a repo with no team policy whose entry has no type, where the lenient check and the lenient port agree`, `syncTracker and refreshTrackerStatus over a fake port: success writes epicStatus, storyStatus and lastSyncedAt only; a port without status-read fails naming the capability; a read that fails is a failed result; no bound issue is skipped; a fake port that is slow on every read hits the 120-second deadline with an injected clock and the unread Epics and Stories are reported skipped with 'time limit reached'`, `missingCapabilities reports status-read for a declared set without it`, `readTrackerMeta and the chain report carry the artifact id and revision (0 when absent) next to epicRef and lastSyncedAt, and the stored TrackerMeta gains no field`, `sync() in cli/services/workflow.ts runs through refreshTrackerStatus`
  - Fixtures: `a fake TrackerPort with readIssueStatus`, `an injected clock`, `temp repo with a Define head and unit issue records`
- **contract** — The GitHub adapter's status read, run by the classified gh runner with the new timeout
  - Subjects: `readIssueStatus maps gh issue view --json state,labels to { state, labels }; the exec seam sees the 120000 ms timeout; a timeout maps to unreachable with the message 'gh timed out after 120 s', a missing gh to missing-tool and a signed-out gh to missing-signin; the adapter declares status-read; loadTracker rejects a tracker lacking it`
  - Fixtures: `the fake gh through the exec seam, which also records the timeout option`
- **integration** — The git tools, the daemon method and the terminal approve with the refresh and the hook wired
  - Subjects: `git_pull and git_push: a successful run is followed by a refresh; a failing tracker leaves success true and adds a warning; a dry-run pull, a dry-run push (success with pushed false) and a failed git command run no refresh`, `the daemon method tracker.refresh runs the same function and returns its report`, `terminal approve after the daemon already created the issues: creates nothing and no duplicate`
  - Fixtures: `temp git repo with a bare remote`, `fake tracker`
- **smoke** — A real tracker end to end
  - Subjects: `On a sandbox GitHub repo: write a draft in a repo with no team policy and see the Epic issue created, change the issue state on GitHub, run git_pull through the daemon tool and see the status in meta.tracker`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `ensureDraftIssues in a team repo creates the stage's issue as before (unit)` |
| `ac2` | `ensureDraftIssues in a repo with no team policy and a tracker that is on creates the Epic and Story issues (unit)`, `Write a draft in a repo with no team policy and see the issue created on a sandbox repo (smoke)` |
| `ac3` | `ensureDraftIssues with tracker type none makes no tracker call and fails nothing, and a malformed github.json is reported not-ready (unit)` |
| `ac4` | `the terminal approve over issues the daemon already created creates nothing and no duplicate (integration)` |
| `ac5` | `git_pull and git_push refresh the tracker status into meta.tracker after success, and tracker.refresh and sync() run the same refresh (integration)`, `refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt (unit)`, `A git pull through the daemon tool refreshes the status of a real issue (smoke)` |
| `ac6` | `a failing or slow tracker leaves git_pull and git_push successful and adds a warning, and a dry-run push runs no refresh (integration)`, `refreshTrackerStatus turns the deadline into skipped results and never throws (unit)`, `readIssueStatus sees the 120-second timeout and maps a gh timeout to unreachable (contract)` |
| `ac7` | `the chain report's tracker record carries the artifact id and the revision, 0 when absent, and the stored TrackerMeta gains no field (unit)` |
| `ac8` | `syncTracker over a fake non-GitHub port writes the same fields as over the GitHub adapter, and a port without status-read fails naming it; missingCapabilities reports status-read (unit)`, `the GitHub adapter's readIssueStatus and status-read capability (contract)` |

## 7. Alternatives considered

### 7.1 a1: Widen the existing hook, port-based status read, daemon git hook — **CHOSEN**

ensureDraftIssues also runs for a repo with no team policy whose tracker setting is on; syncTracker moves onto the port through an optional status read run by the classified gh runner; the daemon's git_pull and git_push tools call one deadline-bound refresh after they succeed; the existing explicit sync calls the same function.

Five changes inside the existing seams: the draft hook uses the lenient on/off check and port of the terminal approve for repos with no team policy and keeps loadTracker for team repos; the port gains an optional readIssueStatus and a status-read capability implemented with runGh; the gh timeout becomes 120 seconds by the user's decision; refreshTrackerStatus wraps syncTracker with a 120-second deadline checked before each tracker call; git_pull and git_push call it after a git command that integrated or pushed and add a failure as a warning, and the explicit sync and a daemon method use the same function. ac7's fields go on ChainReport.tracker.

### 7.2 a2: Git hooks installed in the repository

Install git hook scripts that call the daemon to refresh, so every git pull and push, from any client, triggers the refresh.

Same hook widening and port read as a1, but the trigger is a set of git hook scripts written into the repository's hooks directory by a setup command; each hook sends one IPC request to the daemon and exits zero whatever the answer.

**Rejected because:** Scores partial on ac5 and ac6 because git has no post-push hook and a hook can only report later; larger and less reliable for the same ac5.

### 7.3 a3: Smallest: widen the draft hook and add only the explicit refresh

Widen the draft hook for repos with no team policy and move the explicit sync onto a bounded refresh; leave git pull and push alone.

Only ac2, ac3, ac4, ac7 and the explicit half of ac5: the hook runs for any repo whose tracker setting is on, the explicit sync is bounded, and the shown record gains artifactId and revision. No port change, no git integration.

**Rejected because:** Smallest, but violates ac6 and ac8 and meets ac5 only by an explicit refresh.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: the draft-issue hook (src/workflow/draft-issues.ts:94-145; src/daemon/steps/workflow-step/phases/synthesize.ts:90-93)`
- **[[c2]]** `analyze-bundle` `s1: the tracker config readers and the terminal approve (src/workflow/config/github.ts:349-373; src/workflow/tracker-auto.ts:85-103; src/workflow/tracker-auto.ts:142-156; src/cli/services/workflow.ts:158-171)`
- **[[c3]]** `analyze-bundle` `s1: the status refresh, the explicit sync, the gh runner and the port's capability list (src/workflow/tracker/sync.ts:27-65; src/workflow/tracker/github.ts:86-97; src/workflow/tracker/port.ts:127-131; src/cli/services/workflow.ts:410-411)`
- **[[c4]]** `analyze-bundle` `s1: the shown tracker record and the daemon's git tools (src/workflow/chain.ts:67-71; src/daemon/tools/builtins/git/pull.ts; src/daemon/tools/builtins/git/push.ts:110-135)`
- **[[c5]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c6]]** `doc` `docs/plans/team-workflow.md`

## 9. Open questions

- Only git_pull and git_push run through the daemon's tools can trigger the automatic refresh; git typed in a terminal or an IDE cannot. The LLD assumes the explicit refresh plus the daemon tools are enough for ac5 and that a git-hook installer would be its own later Story; the user has not yet confirmed this.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-23T06:52:02.150Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | ac7 ('an issue the daemon has created for an artifact … carries the issue key, the artifact id and a revision') is met by adding artifactId/revision to ChainReport.tracker for the Define only | chain.ts:227-235 readTrackerMeta builds the record from the Define and the Epic's issue only (unitIssueOf(repoPath, epicHash)). ac7 is per artifact, but the design also creates Story issues (ensureDraftIssues for an LLD/plan covers [epic, story], draft-issues.ts:76-78). No Story or Task artifact is shown with its issue key, artifact id and revision. The design covers only the Epic's Define. [files: src/workflow/chain.ts, src/workflow/draft-issues.ts] | Either show issue key, artifact id and revision for each Story head that has an issue (e.g. per-story entries in the chain report), or record in team-workflow.md that ac7 is satisfied by the Epic record alone. |
| change-sites | MED | The explicit refresh inventory is complete: 'the existing explicit sync' is sync() in cli/services/workflow.ts, plus a new tracker.refresh IPC method | cli/services/workflow.ts:410-411 sync() → syncTracker. There is a second explicit sync path the LLD does not name: the `tracker.sync` workflow (runners/tracker/context.ts:114-139, assembleSyncContext). It calls requireGithubAdapter(resolveGithubConfig(...)) directly. chain.ts:325-328 recommends exactly this path as the 'sync-tracker' next action. That path stays GitHub-only and off the port and the deadline, which conflicts with ac8 and with 'one function'. [files: src/workflow/runners/tracker/context.ts, src/workflow/chain.ts, src/cli/services/workflow.ts] | State what happens to the tracker.sync workflow: route it through refreshTrackerStatus, or change the chain report's sync-tracker next action to the new refresh. Otherwise record that it is left as is and why. |
| change-sites | MED | The change sites for adding status-read and moving GH_TIMEOUT_MS to 120_000 are complete | Existing tests pin the old values and will fail. port.test.ts:173 `assert.deepEqual([...r.value.capabilities].sort(), ['claim','issue-create','signoff-request'])`. github-adapter.test.ts:62 `/timed out after 10 s/`, :85 `assert.equal(GH_TIMEOUT_MS, 10_000)`, :92/:94 timeout 10_000. setup.test.ts:202 `timeout, 10_000`. github-adapter.test.ts:219-220 checks the capability set. None of these is listed among the LLD's call sites or test changes. [files: src/workflow/tracker/__tests__/port.test.ts, src/workflow/tracker/__tests__/github-adapter.test.ts, src/workflow/tracker/__tests__/setup.test.ts] | Add these test files to the change sites and the test strategy: update the expected capability set and the 10 s timeout assertions. |
| change-sites | MED | The git tools can 'add a warning to the result' within the existing ToolResult contract | daemon/tools/types.ts:33-48: ToolResult is { output, format, success, error?, data? }. There is no warning field. The LLD (2.7, 2.8, 5) says the refresh failure is 'added as a warning' but does not say where it goes (appended to output, or a field on data). The integration tests assert 'adds a warning' against an unspecified shape. [files: src/daemon/tools/types.ts, src/daemon/tools/builtins/git/push.ts, src/daemon/tools/builtins/git/pull.ts] | Specify the carrier, e.g. a `trackerRefresh` / `warnings` entry on data plus a line appended to output, and name it in the tests. |
| error-paths | MED | Every tracker call in the refresh is bounded, so refreshTrackerStatus returns within 240 s ('a started gh call is bounded by its own 120-second runGh timeout … the sign-in check counts inside the deadline') | The only sign-in check syncTracker uses today is ghAuthOk (sync.ts:47). It runs `silent('gh', ['auth','status'])` (github.ts:168-175), the legacy exec with NO timeout. legacy-exec.test.ts:23 pins ghAuthOk as retained on the legacy path. The 240 s bound and the 'Every tracker command now has a 120-second timeout' summary hold only for calls through runGh. If the refactored syncTracker keeps ghAuthOk, the refresh after git_pull/git_push can block without bound. [files: src/workflow/tracker/sync.ts, src/workflow/tracker/github.ts, src/workflow/tracker/__tests__/legacy-exec.test.ts] | State that the refresh's sign-in check is the port's whoAmI (ghCurrentLogin → runGh, github.ts:558-559) or that ghAuthOk moves onto runGh. Narrow the summary's 'every tracker command' wording to runGh calls, or move the remaining legacy calls. |

#### Could not verify (does not block)

_None._
