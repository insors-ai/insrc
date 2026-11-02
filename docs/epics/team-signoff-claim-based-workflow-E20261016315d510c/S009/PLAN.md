<!-- insrc:artifact PLAN-315d510cb28100e2-s9 -->

# Plan: STORY-315d510cb28100e2-s9

## Summary

**Epic:** `team-signoff-claim-based-workflow`
**LLD run:** `wf-1793558479253-eca4tv`
**LLD effective hash:** `46e3630565af...`

Building this Story gives the tracker port a status read, then uses it two ways: a deadline-bound refresh that the git_pull and git_push tools run after success (and the tracker.sync method runs on request), and issue creation at first draft for repos with no team policy when the tracker is on. The chain report also shows the issue key, artifact id and revision. The work ends with the amendments, the documentation and one full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the status read to the tracker port and the GitHub adapter | S | — | — | unit: src/workflow/tracker/__tests__/port.test.ts: missingCapabilities reports status-read for a declared set without it; unit: src/workflow/tracker/__tests__/github-adapter.test.ts: readIssueStatus maps the gh issue view output to state and labels and the adapter declares status-read; unit: src/workflow/tracker/__tests__/github-adapter.test.ts: readIssueStatus maps a gh timeout to unreachable, a missing gh to missing-tool and a signed-out gh to missing-signin, and is cancelled by the Deadline signal | [[c1]] [[c2]] |
| 2 | **`t2`** Build the deadline-bound refresh and route tracker.sync through it | M | — | `t1` | unit: src/workflow/tracker/__tests__/refresh.test.ts: refreshTrackerStatus writes epicStatus, storyStatus and lastSyncedAt only; unit: src/workflow/tracker/__tests__/refresh.test.ts: a port without status-read fails naming the capability and a read that fails is a failed result; unit: src/workflow/tracker/__tests__/refresh.test.ts: a slow port hits the budget with an injected Deadline and the unread Epics and Stories are skipped with time limit reached; unit: src/workflow/tracker/__tests__/refresh.test.ts: a ToolDenied is rethrown and a non-GitHub fake port gets the same fields; integration: src/daemon/__tests__/tracker-sync-method.test.ts: tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult | [[c1]] [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Register the two post-success hooks on git_pull and git_push | M | — | `t2` | integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: git_pull and git_push through callTool with the hooks registered refresh the status after success; integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: a failing, denied or slow tracker leaves success true and adds hookFailures and a line of output; integration: src/workflow/tracker/__tests__/refresh-hooks.test.ts: a dry-run pull, a push with pushed false, a failed git command, a missing cwd and a push from a temporary worktree run no refresh | [[c1]] [[c3]] [[c5]] |
| 4 | **`t4`** Create issues at first draft in a repo with no team policy when the tracker is on | M | — | — | unit: src/workflow/team/__tests__/draft-issues.test.ts: a team repo creates the stage's issue as before; unit: src/workflow/team/__tests__/draft-issues.test.ts: a repo with no team policy and a tracker that is on creates the Epic and Story issues; unit: src/workflow/team/__tests__/draft-issues.test.ts: tracker type none makes no tracker call, a malformed github.json is not-ready, an entry with no type agrees with the lenient port, and a declined call is rethrown; integration: src/workflow/team/__tests__/draft-issues.test.ts: the terminal approve over issues the daemon already created creates nothing and no duplicate | [[c1]] [[c4]] |
| 5 | **`t5`** Show the issue key, artifact id and revision in the chain report | S | — | — | unit: src/workflow/__tests__/chain-report-tracker.test.ts: the tracker record carries artifactId and revision for the Epic and each Story with an issue, 0 when absent; unit: src/workflow/__tests__/chain-report-tracker.test.ts: the stored TrackerMeta gains no field and the sync-tracker next action names the explicit refresh | [[c1]] [[c4]] |
| 6 | **`t6`** Record the amendments and update the documentation | S | — | `t3`, `t4`, `t5` | unit: src/workflow/team/__tests__/s9-docs-record.test.ts: team-workflow.md records the amendment and the s9 decisions and workflow.md describes the automatic refresh | [[c1]] [[c5]] |
| 7 | **`t7`** Run the full sweep once and write the s9 outcome | S | — | `t6` | unit: src/workflow/team/__tests__/s9-sweep-record.test.ts: the outcome section of team-workflow.md lists the sweep result and the open items; smoke: On a sandbox GitHub repo: write a draft in a repo with no team policy and see the Epic issue created, change the issue state on GitHub, run git_pull through the daemon tool and see the status in meta.tracker | [[c4]] [[c5]] |

### 1.1 TASK-315d510cb28100e2-s9-t1 — Add the status read to the tracker port and the GitHub adapter

Add the 'status-read' capability to the Capability union, to ALL_CAPABILITIES (so missingCapabilities reports it) and to the GitHub adapter's declared set; add the optional async readIssueStatus(issue) to TrackerPort and implement it in the GitHub adapter over the registry table's ghGetIssueState, mapping a GhCommandError to a port failure kind and rethrowing a ToolDenied. Update the tests that pin the capability set (port.test.ts, github-adapter.test.ts).

**Acceptance checks:**
- the adapter declares status-read and readIssueStatus returns { state, labels } for an issue
- a port without the capability is reported by missingCapabilities and loadTracker rejects it when status-read is needed
- a missing tool, a signed-out gh and a timeout map to the port failure kinds and a denied call is rethrown

### 1.2 TASK-315d510cb28100e2-s9-t2 — Build the deadline-bound refresh and route tracker.sync through it

Add refreshTrackerStatus(repoPath, { epicHash?, deadline? }) with TRACKER_REFRESH_DEADLINE_MS (120 s) and rebuild syncTracker over the port, keeping the SyncResult shape (synced, skipped, failed) unchanged so the terminal client and existing sync tests keep working: the Deadline is checked before every read, its signal is passed to the registry calls through workflowToolDeps so a call in flight is cancelled, an adapter without status-read is a failed result naming the capability, a ToolDenied is rethrown, other failures and the deadline are skipped or failed results with one warning line each. The tracker.sync daemon method returns the SyncResult of the one Epic through the same function (repoPath stays required and names an absolute registered repo).

**Acceptance checks:**
- success writes epicStatus, storyStatus and lastSyncedAt into meta.tracker and nothing else
- the SyncResult shape (synced, skipped, failed) is unchanged and the existing sync tests pass as they are
- a slow tracker hits the budget and the unread Epics and Stories are reported skipped with 'time limit reached'
- a gh call in flight is cancelled when the Deadline signal aborts
- a non-GitHub port gets the same steps and a port without status-read fails naming it

### 1.3 TASK-315d510cb28100e2-s9-t3 — Register the two post-success hooks on git_pull and git_push

Register tracker-refresh-after-pull and tracker-refresh-after-push at daemon start (registerToolHook, the first production rules). A rule acts only when input.cwd is present and equals the registered repository root exactly after canonicalising both paths; a linked worktree, including the detached temporary worktree the handoff park pushes from, is refused because its cwd differs from the registered path (confirmed by comparing git_rev_parse gitDir with the common directory). The pull must not be a dry run and the push must have data.pushed true. The rule calls refreshTrackerStatus with its own Deadline (the hook receives no signal) and throws one line when the refresh was skipped, failed or denied, so the executor reports it as hookFailures while the git tool stays a success.

**Acceptance checks:**
- a successful non-dry-run pull and a pushed push in a registered repo root refresh the status
- a dry run, a push with pushed false, a missing cwd and a linked worktree run no refresh
- a push from a temporary worktree (the handoff park) runs no refresh
- a failing, denied or slow tracker leaves the tool a success and adds hookFailures and a line of output

### 1.4 TASK-315d510cb28100e2-s9-t4 — Create issues at first draft in a repo with no team policy when the tracker is on

Widen ensureDraftIssues: a repo whose policy is none or not teamMode checks the tracker with resolveGithubConfig and, when it is on, ensures the Epic and Story issues through createGithubTracker (the pair the terminal approve uses); tracker type none stays not-applicable and makes no call; a malformed github.json is not-ready with its reason; a ToolDenied is rethrown; a team repo keeps loadTracker and today's behaviour. Update the draft-issues tests that pin not-applicable for any repo with no team policy.

**Acceptance checks:**
- a solo repo with the tracker on gets its Epic and Story issues at first draft
- tracker type none makes no tracker call and a malformed config is not-ready
- the terminal approve over issues the daemon already created creates nothing and no duplicate
- a team repo behaves as before

### 1.5 TASK-315d510cb28100e2-s9-t5 — Show the issue key, artifact id and revision in the chain report

ChainReport.tracker gains read-only artifactId and revision for the Epic's Define (0 when meta.revision is absent) and a stories list with issue, artifactId and revision for each Story head that has an issue; the stored TrackerMeta gains no field. The sync-tracker next action names the explicit refresh instead of the GitHub-only tracker.sync workflow.

**Acceptance checks:**
- the record carries the artifact id and revision for the Epic and each Story with an issue, 0 when absent
- the stored TrackerMeta has no new field
- the sync-tracker next action names the explicit refresh

### 1.6 TASK-315d510cb28100e2-s9-t6 — Record the amendments and update the documentation

Record the sc1 methodAdd amendment for readIssueStatus and the status-read capability and confirm the nonFunctional.retarget amendment of the LLD in docs/plans/team-workflow.md, describe the refresh, the hooks and the solo-repo issue creation in docs/workflow.md, and add the s9 decisions (scope as written, hooks only for the repo root, signal propagation verified) to the plan notes.

**Acceptance checks:**
- the amendment and the decisions are written in docs/plans/team-workflow.md
- docs/workflow.md describes the automatic refresh and its limits

### 1.7 TASK-315d510cb28100e2-s9-t7 — Run the full sweep once and write the s9 outcome

Run the full test sweep once in foreground chunks and compare by test name with the tree before s9; write the outcome section (deviations, open items) in docs/plans/team-workflow.md.

**Acceptance checks:**
- no new failure and no new skipped test against the tree before s9, with the pre-existing failures listed
- the outcome section is written

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ensureDraftIssues: a team repo; a repo with no team policy and a tracker that is on (creates the Epic and Story issues through the lenient port); a repo with no team policy and tracker type none (no tracker call, not-applicable); a repo with no team policy and a malformed github.json (not-ready with the reason); a repo with no team policy whose entry has no type, where the lenient check and the lenient port agree; a declined registry call is rethrown, not made not-ready | `t4` |
| syncTracker and refreshTrackerStatus over a fake port: success writes epicStatus, storyStatus and lastSyncedAt only; a port without status-read fails naming the capability; a read that fails is a failed result; no bound issue is skipped; a fake port that is slow on every read hits the 120-second budget with an injected Deadline and the unread Epics and Stories are reported skipped with 'time limit reached'; a ToolDenied is rethrown | `t2` |
| missingCapabilities reports status-read for a declared set without it; the existing capability-set assertions in src/workflow/tracker/__tests__/port.test.ts and github-adapter.test.ts are updated to include status-read | `t1` |
| readTrackerMeta and the chain report carry the artifact id and revision (0 when absent) for the Epic and for each Story that has an issue, and the stored TrackerMeta gains no field; the sync-tracker next action names the explicit refresh | `t5` |
| readIssueStatus maps the gh issue view output to { state, labels } through ghGetIssueState; a stand-in gh that never answers is cancelled by the Deadline signal and a gh timeout maps to unreachable, a missing gh to missing-tool and a signed-out gh to missing-signin; the adapter declares status-read; loadTracker rejects a tracker lacking it when status-read is needed | `t1` |
| git_pull and git_push through callTool with the two hooks registered: a successful run is followed by a refresh; a failing tracker leaves success true and adds hookFailures and a line of output; a ToolDenied from the refresh is reported the same way; a dry-run pull, a dry-run push (success with pushed false) and a failed git command run no refresh | `t3` |
| the daemon method tracker.sync runs refreshTrackerStatus for the one Epic and returns its SyncResult | `t2` |
| terminal approve after the daemon already created the issues: creates nothing and no duplicate | `t4` |
| On a sandbox GitHub repo: write a draft in a repo with no team policy and see the Epic issue created, change the issue state on GitHub, run git_pull through the daemon tool and see the status in meta.tracker | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s9 contract: interfaces, hooks, draft widening, refresh, chain report`
- **[[c2]]** `prior-artifact` `LLD s9 data model: TrackerPort.readIssueStatus, status-read capability, SyncResult, meta.tracker fields`
- **[[c3]]** `prior-artifact` `LLD s9 error paths: Deadline, ToolDenied rethrow, hookFailures, skipped and failed results`
- **[[c4]]** `prior-artifact` `LLD s9 test strategy: levels, subjects and acceptance mapping`
- **[[c5]]** `prior-artifact` `LLD s9 migration: behaviour for existing repos, docs and amendments`
