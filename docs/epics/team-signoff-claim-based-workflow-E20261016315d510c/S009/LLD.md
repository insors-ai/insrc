<!-- insrc:artifact LLD-315d510cb28100e2-s9 -->

# LLD: STORY-315d510cb28100e2-s9

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**HLD base run:** `wf-1792177279312-j27596`
**HLD effective hash:** `46e3630565af...`

Issues are created when a draft is first written in any repo whose tracker setting is on, not only in team repos. Tracker status is refreshed into the artifact's tracker record by one deadline-bound function that reads issue state through the tracker port, so any adapter that declares the new status-read capability gets the same steps as GitHub. Two post-success tool hooks on git_pull and git_push run that refresh and report a failure on the tool result without failing the git operation; the tracker.sync daemon method runs the same function. The chain report shows the issue key, artifact id and revision of the Epic and of each Story that has an issue.

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
ensureDraftIssues(jsonPath: string, deps?: DraftHookDeps): Promise<IssueReadiness>
```

**Parameters:**
- `jsonPath: string` — the draft that was just written
- `deps: DraftHookDeps` _(optional)_ — test seams, now also the tracker config reader and the lenient port builder

**Returns:** `Promise<IssueReadiness>` — not-applicable when the repo has no team policy and its tracker setting is none; ready or not-ready otherwise, as today

**Errors:**
- `ToolDenied` when a registry call was declined, timed out, had no client or was cancelled: rethrown to the stage as today, never made not-ready
- `none thrown otherwise` when every other failure becomes not-ready; a GithubConfigError from resolveGithubConfig becomes not-ready with its reason, never not-applicable

**Preconditions:**
- the draft is written

**Postconditions:**
- a repo with no team policy and a tracker setting that is on gets its Epic and Story issues: the on/off check is resolveGithubConfig and the port is createGithubTracker, the pair the terminal approve uses
- a repo with no team policy and tracker type none makes no tracker call and returns not-applicable
- a team repo keeps loadTracker and behaves as today

### 2.2 `TrackerPort.readIssueStatus`

```typescript
readIssueStatus?(issue: IssueRef): Promise<PortResult<{ state: 'open' | 'closed'; labels: string[] }>>
```

**Parameters:**
- `issue: IssueRef` — the issue to read

**Returns:** `Promise<PortResult<{ state: 'open' | 'closed'; labels: string[] }>>` — the issue's state and labels, or a failure with a port kind

**Errors:**
- `PortFailure` when missing-tool, missing-signin, unreachable or rejected, as the GitHub adapter already sorts a GhCommandError
- `ToolDenied` when rethrown, not made a port failure

**Preconditions:**
- the adapter declares the status-read capability

**Postconditions:**
- read-only: nothing is changed in the tracker
- the GitHub adapter implements it with the registry table's ghGetIssueState

### 2.3 `syncTracker`

```typescript
syncTracker(repoPath: string, epicHash: string, table?: RegistryTable): Promise<SyncResult>
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the Epic whose issue and Story issues are read
- `table: RegistryTable` _(optional)_ — replaced by an options object carrying the port builder and a Deadline; the table argument stays for existing callers

**Returns:** `Promise<SyncResult>` — synced with the mapped statuses, skipped with a reason (no issue yet, tracker disabled, time limit reached), or failed with the port failure

**Errors:**
- `ToolDenied` when rethrown, as today
- `none thrown otherwise` when a tracker without the status-read capability is returned as failed, naming the capability (k8)

**Preconditions:**
- the Epic head is bound to an issue, otherwise the result is skipped

**Postconditions:**
- on success epicStatus, storyStatus and lastSyncedAt are written into the Define's meta.tracker through patchTrackerMeta and nothing else on the head changes
- the status mapping is mapIssueStatus, the one GitHub used
- the Deadline is checked before every issue read; a Story not read before it is reached is left out of storyStatus and the result says the time limit was reached
- the Deadline's signal is passed to the registry calls through the tool deps, so a call in flight is cancelled when the deadline passes

### 2.4 `refreshTrackerStatus`

```typescript
refreshTrackerStatus(repoPath: string, opts?: { epicHash?: string; deadline?: Deadline }): Promise<TrackerRefreshReport>
```

**Parameters:**
- `repoPath: string` — the repository
- `opts: { epicHash?: string; deadline?: Deadline }` _(optional)_ — one Epic (omitted: every Epic that has a bound issue) and a Deadline for tests

**Returns:** `Promise<TrackerRefreshReport>` — one SyncResult per Epic and one line of warning text for each skipped or failed one

**Errors:**
- `ToolDenied` when rethrown to the caller (the tool hook reports it)
- `none thrown otherwise` when every other failure, including the deadline, is a skipped or failed result inside the report

**Postconditions:**
- a repo whose tracker setting is none makes no tracker call and reports nothing to refresh
- one Deadline of TRACKER_REFRESH_DEADLINE_MS (120 seconds, the user's decision of 2026-10-23, kept as the whole-refresh budget) covers the call and is checked before each read; each gh read also has its own registry limit (30 s), so the call returns within 150 s at the latest
- Epics not reached before the deadline are reported skipped with 'time limit reached'
- the calls are asynchronous registry calls: the daemon event loop is not blocked

### 2.5 `gitPullTool`

```typescript
registerToolHook({ id: 'tracker-refresh-after-pull', toolId: 'git_pull', run(ctx) }): void
```

**Parameters:**
- `ctx: ToolHookContext` — the tool id, input, result and caller; input.cwd names the repository

**Returns:** `void` — a rule that runs after a successful git_pull

**Errors:**
- `Error thrown by the rule` when the refresh was skipped or failed, or a ToolDenied was thrown: the executor keeps the tool a success and adds hookFailures and one line to output

**Preconditions:**
- registered once at daemon start-up

**Postconditions:**
- after a successful pull that is not a dry run, refreshTrackerStatus runs; its warning lines become the thrown message
- a dry-run pull runs no refresh

### 2.6 `gitPushTool`

```typescript
registerToolHook({ id: 'tracker-refresh-after-push', toolId: 'git_push', run(ctx) }): void
```

**Parameters:**
- `ctx: ToolHookContext` — as above

**Returns:** `void` — a rule that runs after a successful git_push

**Errors:**
- `Error thrown by the rule` when as for the pull rule

**Preconditions:**
- registered once at daemon start-up

**Postconditions:**
- the refresh runs only when the result's data.pushed is true; a dry-run push returns success with pushed false and runs no refresh

### 2.7 `handleTrackerSync`

```typescript
handleTrackerSync(params: unknown): Promise<SyncResult | { error: string }>
```

**Parameters:**
- `params: unknown` — { repoPath, epicHash }

**Returns:** `Promise<SyncResult | { error: string }>` — the result of the refresh for that Epic

**Errors:**
- `ToolDenied` when not caught here: it reaches the client as the error of the call

**Postconditions:**
- the daemon method tracker.sync, which the terminal client's sync() calls, runs through refreshTrackerStatus for the one Epic and returns that Epic's SyncResult (ac5 explicit refresh)

### 2.8 `patchTrackerMeta`

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
- `src/workflow/tracker/github-adapter.ts`

### 3.2 `TrackerPort` — field-add

Optional async readIssueStatus(issue) as above; the GitHub adapter implements it over the registry table's ghGetIssueState.

**Call sites:**
- `src/workflow/tracker/port.ts`
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/registry-table.ts`

### 3.3 `ChainReport.tracker` — field-add

The shown tracker record gains read-only artifactId (the Define's artifact id) and revision (its meta.revision, 0 when absent), and a stories list with issue, artifactId and revision for each Story head that has an issue. No stored field is added: the stored TrackerMeta is unchanged, so patchTrackerMeta cannot persist them and there is no second revision counter; schemaVersion is untouched.

**Call sites:**
- `src/workflow/chain.ts:67-71`
- `src/workflow/chain.ts:228-235`
- `src/workflow/chain.ts:370-376`

### 3.4 `IssueReadiness` — invariant-change

not-applicable with reason no-team-policy used to mean only 'no team policy'. It now means no team policy AND a tracker setting of none; a repo with no team policy and a tracker that is on is processed as a team repo is. This overrides epic constraint k4 for that one behaviour, by the user's decision of 2026-10-23.

**Call sites:**
- `src/workflow/draft-issues.ts:95-145`
- `src/workflow/tracker-auto.ts`

### 3.5 `TRACKER_REFRESH_DEADLINE_MS` — new

A constant of 120_000 ms in the refresh module: the whole-refresh budget. It replaces the retired GH_TIMEOUT_MS decision of 2026-10-23 ('every tracker command gets 120 seconds'): each gh call keeps the registry tool's own limit and the refresh as a whole is bounded by this deadline. The HLD's non-functional line ('every tracker command has a 10-second timeout') is retargeted by an amendment to 'every registry tool call has its own limit and the status refresh has a 120-second budget'.

**Call sites:**
- `src/workflow/tracker/sync.ts`
- `src/workflow/team/sighting-store.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Consumes the port for creation (issue-create) as today and adds one optional read, readIssueStatus, with its capability, proposed as a methodAdd amendment; the owner Story s1 keeps the contract. |
| `sc3` | consumes | Reads meta.revision and the per-unit issue record; adds no stored field to the tracker record. |

## 5. Error paths

**Error cases**

- **The tracker is down or not signed in while a draft is first written in a repo with no team policy** (recoverable)
  - Detection: the port from createGithubTracker or the unit-issue ensure returns a PortFailure (unreachable, missing-signin, missing-tool, rejected)
  - Response: ensureDraftIssues returns not-ready with the failure kind and a message; the draft stays; the next draft write or the terminal approve retries
  - User impact: A notice says the issue was not created; the author is never blocked, because a repo with no team policy has no claim to wait for
- **github.json is malformed in a repo with no team policy** (recoverable)
  - Detection: resolveGithubConfig throws GithubConfigError
  - Response: ensureDraftIssues returns not-ready with the config error as its reason, never not-applicable
  - User impact: The author is told the tracker config is invalid instead of the hook silently doing nothing
- **A registry call of the draft hook or the refresh is declined, times out, has no client or is cancelled** (recoverable)
  - Detection: the table call throws ToolDenied (isToolDenied)
  - Response: ensureDraftIssues and refreshTrackerStatus rethrow it; the stage stops as for any denied call; in the git tool hook it is thrown as the rule's error so the executor reports it as a hook failure
  - User impact: The user sees that the call was denied and by whom; the git operation is still a success
- **The tracker is slow or fails during the refresh after git_pull or git_push** (recoverable)
  - Detection: syncTracker returns failed or skipped, or the Deadline is passed before the next read
  - Response: refreshTrackerStatus returns the failed or skipped result in its report; the hook throws a one-line message; the executor keeps the tool a success and adds hookFailures and a line of output
  - User impact: The pull or push completes and the user is told that the tracker status was not refreshed and why (ac6)
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
- **A tool hook rule never settles** (recoverable)
  - Detection: the hook stage has no cancellation bound (src/daemon/tools/hooks.ts), so only the refresh's own Deadline ends it
  - Response: the Deadline signal is passed to every registry call of the refresh, so a call in flight is cancelled at the budget and the rule returns
  - User impact: A slow tracker delays the return of git_pull or git_push by at most the 120-second budget plus one cancelled call

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with no team policy and tracker type none | ensureDraftIssues returns not-applicable and makes no tracker call; nothing fails (ac3) |
| A repo with no team policy whose github.json entry has no type | the lenient reader and the lenient port agree, so the hook creates the issues as the terminal approve would; the strict loader is not consulted |
| A repo with no team policy whose Epic issue already exists, then the terminal approve is used | the shared ensure code finds the recorded or labelled issue and creates nothing; no duplicate (ac4) |
| git_pull with dryRun true | no refresh: nothing was integrated |
| git_push with dryRun true, which returns success with data.pushed false | no refresh: nothing was pushed |
| A push that git rejects | the rule does not run, because hooks run only after a tool succeeds |
| Several Epics in the repo and a slow tracker | each Epic with a bound issue is read in turn, serially; those not reached before the 120-second budget are reported skipped with 'time limit reached' |
| A team repo | the draft hook and the refresh behave as before; the team gate and claims are unaffected |
| An artifact with no meta.revision | the chain report's tracker record reads revision 0, the sc3 rule |
| A Story with an issue whose head cannot be read | the chain report leaves that Story out of the stories list and shows the Epic record |
| The chain report's sync-tracker next action | it names the explicit refresh (the tracker.sync daemon method through the terminal client's sync), not the GitHub-only tracker.sync workflow, which is left unchanged and is outside the acceptance criteria |

**Invariants to preserve**

- A team repo keeps today's draft hook behaviour and its not-ready messages [[c1]]
- The existing meta.tracker fields keep their names and meaning; the refresh writes only epicStatus, storyStatus and lastSyncedAt [[c2]]
- The terminal approve path stays as the manual fallback and creates only missing issues [[c1]]
- A tracker failure never fails a git operation or undoes a draft [[c3]]
- A denied registry call is never turned into a tracker failure or a not-ready draft [[c3]]

## 6. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests co-located in __tests__; gh and git stand-in binaries from src/workflow/__tests__/helpers/exec-stand-in.ts for registry-backed tests`

**Test levels**

- **unit** — The draft hook for team repos, repos with no team policy and a tracker that is on, and repos with tracker type none or a malformed config; the refresh and the sync over a fake port, including the deadline; the chain report record
  - Subjects: `ensureDraftIssues: a team repo; a repo with no team policy and a tracker that is on (creates the Epic and Story issues through the lenient port); a repo with no team policy and tracker type none (no tracker call, not-applicable); a repo with no team policy and a malformed github.json (not-ready with the reason); a repo with no team policy whose entry has no type, where the lenient check and the lenient port agree; a declined registry call is rethrown, not made not-ready`, `syncTracker and refreshTrackerStatus over a fake port: success writes epicStatus, storyStatus and lastSyncedAt only; a port without status-read fails naming the capability; a read that fails is a failed result; no bound issue is skipped; a fake port that is slow on every read hits the 120-second budget with an injected Deadline and the unread Epics and Stories are reported skipped with 'time limit reached'; a ToolDenied is rethrown`, `missingCapabilities reports status-read for a declared set without it; the existing capability-set assertions in src/workflow/tracker/__tests__/port.test.ts and github-adapter.test.ts are updated to include status-read`, `readTrackerMeta and the chain report carry the artifact id and revision (0 when absent) for the Epic and for each Story that has an issue, and the stored TrackerMeta gains no field; the sync-tracker next action names the explicit refresh`
  - Fixtures: `a fake TrackerPort with readIssueStatus`, `an injected Deadline`, `temp repo with a Define head and unit issue records`
- **contract** — The GitHub adapter's status read over the registry table and the gh stand-in
  - Subjects: `readIssueStatus maps the gh issue view output to { state, labels } through ghGetIssueState; a stand-in gh that never answers is cancelled by the Deadline signal and a gh timeout maps to unreachable, a missing gh to missing-tool and a signed-out gh to missing-signin; the adapter declares status-read; loadTracker rejects a tracker lacking it when status-read is needed`
  - Fixtures: `the gh stand-in binary (installExecStandIn / installNoPrograms)`
- **integration** — The git tools with the registered hooks, the daemon method and the terminal approve
  - Subjects: `git_pull and git_push through callTool with the two hooks registered: a successful run is followed by a refresh; a failing tracker leaves success true and adds hookFailures and a line of output; a ToolDenied from the refresh is reported the same way; a dry-run pull, a dry-run push (success with pushed false) and a failed git command run no refresh`, `the daemon method tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult`, `terminal approve after the daemon already created the issues: creates nothing and no duplicate`
  - Fixtures: `temp git repo with a bare remote`, `the gh stand-in binary`
- **smoke** — A real tracker end to end
  - Subjects: `On a sandbox GitHub repo: write a draft in a repo with no team policy and see the Epic issue created, change the issue state on GitHub, run git_pull through the daemon tool and see the status in meta.tracker`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `ensureDraftIssues in a team repo creates the stage's issue as before (unit)` |
| `ac2` | `ensureDraftIssues in a repo with no team policy and a tracker that is on creates the Epic and Story issues (unit)`, `Write a draft in a repo with no team policy and see the issue created on a sandbox repo (smoke)` |
| `ac3` | `ensureDraftIssues with tracker type none makes no tracker call and fails nothing, and a malformed github.json is reported not-ready (unit)` |
| `ac4` | `the terminal approve over issues the daemon already created creates nothing and no duplicate (integration)` |
| `ac5` | `git_pull and git_push through the registered hooks refresh the tracker status into meta.tracker after success, and tracker.sync runs the same refresh (integration)`, `refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt (unit)`, `A git pull through the daemon tool refreshes the status of a real issue (smoke)` |
| `ac6` | `a failing, denied or slow tracker leaves git_pull and git_push successful and adds hookFailures, and a dry-run push runs no refresh (integration)`, `refreshTrackerStatus turns the deadline into skipped results and rethrows only a ToolDenied (unit)`, `readIssueStatus is cancelled by the Deadline signal and maps a gh timeout to unreachable (contract)` |
| `ac7` | `the chain report's tracker record carries the artifact id and the revision for the Epic and each Story with an issue, 0 when absent, and the stored TrackerMeta gains no field (unit)` |
| `ac8` | `syncTracker over a fake non-GitHub port writes the same fields as over the GitHub adapter, and a port without status-read fails naming it; missingCapabilities reports status-read (unit)`, `the GitHub adapter's readIssueStatus and status-read capability (contract)` |

## 7. Alternatives considered

### 7.1 a1: Port-based status read, post-success tool hooks, one bounded refresh — **CHOSEN**

Widen the draft hook to solo repos; add an optional status read to the tracker port; run one deadline-bound refresh from post-success hooks on git_pull and git_push and from the tracker.sync daemon method.

ensureDraftIssues also runs for a repo with no team policy whose tracker setting is on (the lenient on/off check and port the terminal approve uses), and keeps loadTracker for team repos. TrackerPort gains an optional async readIssueStatus(issue) and a 'status-read' capability (added to the union, ALL_CAPABILITIES and the GitHub adapter's declared set); the GitHub adapter implements it with the registry table's ghGetIssueState. syncTracker is rebuilt as a function over the port that takes a Deadline (createDeadline from src/workflow/team/sighting-store.ts) and checks it before every read, and refreshTrackerStatus wraps it for one or all Epics. Two post-success tool hooks (registerToolHook, the first production rules) on git_pull and git_push call refreshTrackerStatus after an integrating pull or a push with data.pushed true; a failure is thrown from the hook, so the executor reports it as hookFailures and a line of output while the tool stays a success. The tracker.sync daemon method and the tracker.sync workflow both call the same function. ChainReport.tracker gains read-only artifactId and revision for the Epic and one entry per Story that has an issue.

### 7.2 a2: Keep the GitHub-only sync, add the hooks and the explicit refresh

Leave syncTracker over the registry table as it is, bound it with a deadline, and trigger it from the git tool hooks.

The draft hook is widened as in a1 and the chain report gains the artifact id and revision. syncTracker keeps calling the table rows ghAuthOk and ghGetIssueState; refreshTrackerStatus adds only a Deadline and the skip report. The same two post-success hooks and the tracker.sync method call it. No port method, no capability.

**Rejected because:** Smallest, but ac8 is violated because the sync stays on GitHub-only table rows.

### 7.3 a3: Git hook scripts installed in the repository

Install git hook scripts that ask the daemon to refresh after any git pull or push, from any client.

The draft hook widening and the port read are as in a1, but the trigger is a set of git hook scripts written into .git/hooks by a setup command; each sends one request to the daemon and exits zero whatever the answer.

**Rejected because:** Git has no post-push hook, and writing scripts into the user's repository is the largest change for the same ac5.

## 8. References

- **[[c1]]** `analyze-bundle` `s1: the draft hook (src/workflow/draft-issues.ts:95-145; src/daemon/steps/workflow-step/phases/synthesize.ts:92; src/daemon/workflow-rpc.ts:350; src/workflow/tracker-auto.ts)`
- **[[c2]]** `analyze-bundle` `s1: the status sync, the daemon method and the tracker port (src/workflow/tracker/sync.ts; src/daemon/tracker-setup-handlers.ts; src/cli/services/workflow.ts:308; src/workflow/tracker/port.ts:21; src/workflow/tracker/port.ts:127-131)`
- **[[c3]]** `analyze-bundle` `s1: gh limits, ToolDenied and tool hooks (src/daemon/tools/builtins/gh/helpers.ts:54-69; src/workflow/tracker/registry-table.ts; src/workflow/tracker/tool-denied.ts; src/daemon/tools/hooks.ts; src/daemon/tools/executor.ts:65-73; src/daemon/tools/builtins/git/push.ts:155)`
- **[[c4]]** `analyze-bundle` `s1: the shown tracker record and the second sync path (src/workflow/chain.ts:67-71; src/workflow/chain.ts:228-235; src/workflow/chain.ts:327; src/workflow/runners/tracker/context.ts:111-139)`
- **[[c5]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c6]]** `doc` `docs/plans/team-workflow.md`

## 9. Open questions

- Only git_pull and git_push run through the daemon's tools can trigger the automatic refresh; git typed in a terminal or an IDE cannot. The LLD assumes the explicit refresh plus the daemon tools are enough for ac5 and that a git-hook installer would be its own later Story; the user has not yet confirmed this.
- int1 (ambiguous): the HLD context slice lists no shared contracts, so sc1 and sc3 cannot be checked against a list; they are the contracts the adjacent Stories s1 and s4 own.
- Does the registry table pass a signal from workflowToolDeps to the gh tool call, so the refresh Deadline can cancel a call in flight? Not verified in this design; the plan checks it first and, if it does not, bounds a call only by the registry tool's own limit (30 s).

## Resolved questions

- `q993cc792` — Only git_pull and git_push run through the daemon's tools can trigger the automatic refresh; git typed in a terminal or an IDE cannot. The LLD assumes the explicit refresh plus the daemon tools are enough for ac5 and that a git-hook installer would be its own later Story; the user has not yet confirmed this.
  - **resolved**: Confirm scope as written — The approved LLD scopes ac5 to the daemon's git_pull and git_push hooks plus the explicit refresh; a git-hook installer is a later Story. Flagged to the user in the plan summary. _(2026-11-02T05:39:26.184Z)_
- `q71b0bc75` — int1 (ambiguous): the HLD context slice lists no shared contracts, so sc1 and sc3 cannot be checked against a list; they are the contracts the adjacent Stories s1 and s4 own.
  - **resolved**: Ground sc1/sc3 against s1/s4's own artifacts — Check sc1 (the tracker port) and sc3 (meta.revision) against the built code and the s1 and s4 LLDs. _(2026-11-02T05:40:25.323Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: the draft hook (src/workflow/draft-issues.ts:95-145; src/daemon/steps/workflow-step/phases/synthesize.ts:92; src/daemon/workflow-rpc.ts:350; src/workflow/tracker-auto.ts)`
- **[[c2]]** `analyze-bundle` `s1: the status sync, the daemon method and the tracker port (src/workflow/tracker/sync.ts; src/daemon/tracker-setup-handlers.ts; src/cli/services/workflow.ts:308; src/workflow/tracker/port.ts:21; src/workflow/tracker/port.ts:127-131)`
- **[[c3]]** `analyze-bundle` `s1: gh limits, ToolDenied and tool hooks (src/daemon/tools/builtins/gh/helpers.ts:54-69; src/workflow/tracker/registry-table.ts; src/workflow/tracker/tool-denied.ts; src/daemon/tools/hooks.ts; src/daemon/tools/executor.ts:65-73; src/daemon/tools/builtins/git/push.ts:155)`
- **[[c4]]** `analyze-bundle` `s1: the shown tracker record and the second sync path (src/workflow/chain.ts:67-71; src/workflow/chain.ts:228-235; src/workflow/chain.ts:327; src/workflow/runners/tracker/context.ts:111-139)`
- **[[c5]]** `doc` `docs/epics/team-signoff-claim-based-workflow-E20261016315d510c/HLD.md`
- **[[c6]]** `doc` `docs/plans/team-workflow.md`
