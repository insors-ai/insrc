<!-- insrc:artifact PLAN-b7a68147dcf72034-s10 -->

# Plan: STORY-b7a68147dcf72034-s10

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1793107407000-y4ukva`
**LLD effective hash:** `9fcc90f081df...`

Building s10 is a staged migration: first the shared pieces (the denial error, two small additive tool extensions, the replacement table and the registry commit-and-push), then every consumer is made await-ready while the tracker port is still synchronous so each step stays green, then the port flips to async over the table, and last the daemon gains the whole-operation methods that the terminal client now calls. A final task proves the site list, the awaiting and that the old paths are untouched for the next Story.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** ToolDenied carrier and ToolFailure mapping | S | — | — | unit: tool-denied.test.ts: every ToolFailureKind maps to the old kind or ToolDenied; conversion-failed and schema-mismatch never become a best-effort value | [[c4]] [[c2]] |
| 2 | **`t2`** gh_pr_view jsonFields extension | S | — | — | unit: pr-view-fields.test.ts: gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews; the default result is unchanged; a field outside the allowlist is rejected | [[c2]] [[c5]] |
| 3 | **`t3`** git_push configured input | S | — | — | unit: git-push-configured.test.ts: configured true runs plain git push with an alternate push remote, a differently named upstream and a missing upstream; combined inputs are rejected; existing calls are unchanged | [[c2]] [[c5]] |
| 4 | **`t4`** Replacement table: issue, comment, label and milestone rows | M | — | `t1` | unit: registry-table.test.ts: one case per issue, comment, label, milestone and task-query row, including best-effort rows and the rule that a denial is thrown, never swallowed | [[c2]] [[c4]] |
| 5 | **`t5`** Replacement table: organisation, project, scope, login and url rows | M | — | `t1`, `t4` | unit: registry-table.test.ts: one case per organisation, project, scope, login and url row, with null, false and [] only for gh failures | [[c2]] [[c4]] |
| 6 | **`t6`** Replacement table: auth, origin, adapter assignee and pull request rows | M | — | `t1`, `t2`, `t4` | unit: registry-table.test.ts: ghAuthOk form, gitOriginOwnerRepo form and the attach tracked-check rows; unit: adapter-registry.test.ts: assignee read, set and add with the re-read checks, signoff pull request list, create and view rows, a denied link comment and a retry that reuses the open pull request | [[c2]] [[c4]] |
| 7 | **`t7`** commitAndPushArtifactsViaRegistry | M | — | `t1`, `t3` | unit: commit-and-push-registry.test.ts: same results and reasons as the old function for each case; denial at each phase throws ToolDenied; denied commit leaves the paths staged; mixed and all-missing paths; three push configurations | [[c1]] [[c4]] |
| 8 | **`t8`** Team gate callers: make them await-ready | M | — | `t1` | integration: team-gate-callers.test.ts: each listed caller awaits its gate call and returns the same outcome; handler.test.ts and handler-runtime.test.ts still pass | [[c3]] [[c5]] |
| 9 | **`t9`** Team gate functions: async with denial rethrow | M | — | `t8` | unit: team-gates-async.test.ts: the gate functions return the same outcomes and refusals with an async port; unit: team-gates-denial.test.ts: a denial stops the stage as ToolDenied and is never undefined, a generic refusal or report-only | [[c3]] [[c4]] |
| 10 | **`t10`** Publication path: await and denial rethrow | M | — | `t1` | unit: unit-extras.test.ts: runUnitExtras with async steps and async comments runs in order and reconciles comments as before; integration: tracker-denial.test.ts: a denial at a milestone extra, a comment extra and the link comment stops publication with later calls forbidden and keeps the bindings | [[c3]] [[c4]] |
| 11 | **`t11`** Task reconciliation: CloseIssue async and durable pending-close | M | — | `t1` | unit: task-set-denial.test.ts: syncOnPlanApproval rethrows ToolDenied with the partial arrays, ordinary errors keep {error}, and a pending-close entry lets the next reconciliation close the issue; integration: sync-plan-tasks-denial.test.ts: through the real syncPlanTasks a denied close escapes as ToolDenied; unit: tasks-sync-async.test.ts: a withdrawn-Task close through an async CloseIssue reports ok and gh failure as before | [[c3]] [[c4]] |
| 12 | **`t12`** Identity and draft-issue loaders: await and denial rethrow | M | — | `t1` | unit: identity-draft-denial.test.ts: a denial inside idOf, resolveLearner and ensureDraftIssues stops the stage; a non-denial failure keeps the old fallback | [[c3]] [[c4]] |
| 13 | **`t13`** Flip TrackerPort, IssueOps and the adapter to async over the table | L | — | `t4`, `t5`, `t6`, `t9`, `t10`, `t11`, `t12` | integration: tracker-push-registry.test.ts: a push, sync, setup, question and comment resolution create the same objects and records as the recorded legacy sequence; a second run creates nothing; unit: adapter-attempt.test.ts: async attempt keeps the conversion of non-denial exceptions to rejected and rethrows ToolDenied | [[c3]] [[c2]] [[c5]] |
| 14 | **`t14`** Move the commit-and-push callers and the remaining wrapper callers | M | — | `t6`, `t7`, `t13` | integration: commit-denial-callers.test.ts: a denied commit posts no comment and handleResolveComment returns the error result; ordinary git failures are logged and the stage continues; unit: attach-tracked-check.test.ts: a tracked file passes and an untracked file is refused with the old reason; integration: registry-denial.test.ts: no-client, declined, timed-out and cancelled approval deny a moved call and later calls are not made | [[c1]] [[c4]] |
| 15 | **`t15`** Close-aware rpc | S | — | — | unit: ipc-client-close-aware.test.ts: rpc with closeAware rejects on premature close and sets no timer; rpc without it is unchanged | [[c4]] [[c5]] |
| 16 | **`t16`** Daemon: workflow.approvePipeline, tracker.sync, tracker.setup | L | — | `t11`, `t13`, `t14` | integration: workflow-approve-pipeline.test.ts: withTracker false stops after approval and Task reconciliation; a plan approval publishes exactly once; a denial at publication stops the check-in commit and attach; integration: workflow-approve-followon.test.ts: the additive follow-on kinds carry their payloads; integration: handler-runtime.test.ts: workflow.approvePipeline, tracker.sync and tracker.setup are registered and return the old results | [[c1]] [[c3]] [[c4]] |
| 17 | **`t17`** Daemon: team and review methods | M | — | `t9`, `t13` | integration: review-resolve-daemon.test.ts: with claims enforced, reviewArtifact and resolveFinding run through the daemon methods and return the old results and refusals; integration: handler-runtime.test.ts: team.refresh, team.claim and team.release are registered and return the old results | [[c1]] [[c3]] |
| 18 | **`t18`** Client services onto daemon methods | L | — | `t15`, `t16`, `t17` | unit: cli-services-no-spawn.test.ts: approve, sync, trackerSetup and the team services call only rpc with the named daemon methods and parameters and import no child_process or tracker or git code; unit: workflow-approve-adapter.test.ts: the client adapter rebuilds ApproveOutcome losslessly from the follow-on entries; unit: cli-services-daemon-errors.test.ts and workflow-approve-versioning.test.ts: an older or absent daemon gives a clear error, no fallback and no publication; unit: command.test.ts: sync, claim, release and resolveFinding results are awaited before status and text are read | [[c1]] [[c3]] [[c4]] |
| 19 | **`t19`** Verification: invariants, site list, no floating promises, old paths, migration rows | M | — | `t18` | unit: site-list.test.ts: the 31 gh wrapper names in the table equal the github.ts gh exports; every site has a table row and a registry test; the migration record lists the rows; unit: cli-services-sites.test.ts: the scan of src/cli/services finds two sites, one named exemption and five no-site files; unit: no-floating-promises.test.ts: the compiler-API scan finds no unawaited TrackerPort, IssueOps, CloseIssue or loader call; unit: old-paths-unchanged.test.ts: the old paths are still exported unchanged and the scan stays in report mode | [[c5]] [[c6]] |

### 1.1 TASK-b7a68147dcf72034-s10-t1 — ToolDenied carrier and ToolFailure mapping

Add the ToolDenied error class (tool id, denial reason, optional partial progress, and for commit-and-push the phase, committed flag and staged paths), the isToolDenied predicate, and one mapping function from every ToolFailureKind to the old GhCommandError kinds (command timed-out to unreachable, conversion-failed and schema-mismatch to rejected and never best-effort, denied to ToolDenied). No site uses it yet.

**Acceptance checks:**
- Every ToolFailureKind has a mapping and a test; denied maps to a thrown ToolDenied carrying the reason
- conversion-failed and schema-mismatch can never produce a best-effort false, null, [] or undefined

### 1.2 TASK-b7a68147dcf72034-s10-t2 — gh_pr_view jsonFields extension

Add the optional jsonFields input to gh_pr_view limited to the allowlist state, mergedAt, reviewDecision, reviews, headRefName, url, and admit those fields in its output schema; default fields and every existing result stay unchanged. Flag the s5 owner's objection path.

**Acceptance checks:**
- gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews; without it the result is byte-identical to before
- a field outside the allowlist is rejected as an input mismatch

### 1.3 TASK-b7a68147dcf72034-s10-t3 — git_push configured input

Add the additive configured input to git_push (boolean, mutually exclusive with remote, ref and every force input, never destructive, approval class unchanged) that runs a plain git push; every existing call is unchanged. Flag the s4 owner's objection path.

**Acceptance checks:**
- configured true runs plain git push and honours an alternate push remote, a differently named upstream and reports a missing upstream
- configured combined with remote, ref or force is rejected; calls without configured are unchanged

### 1.4 TASK-b7a68147dcf72034-s10-t4 — Replacement table: issue, comment, label and milestone rows

Create the replacement-table module in the daemon-side workflow code (its path is fixed here) with the rows for ghCreateLabel, ghCreateIssue, ghCreateIssueTyped, ghLinkSubIssue, ghGetIssueId, ghGetIssueBody, ghEditIssueBody, ghComment, ghListIssueComments, ghPostCommentReturningId, ghCloseIssue, ghGetIssueState, ghFindIssueByLabels and its Strict form, ghListIssuesByLabelsStrict, ghListIssuesByTitleTokenStrict, ghEnsureMilestone, ghAttachMilestone, queryTasks and listMyOpenTasks, each over callTool with the wrapper's old result, best-effort result and failure mapping from t1.

**Acceptance checks:**
- one recorded-executor case per row returns the old value and the old failure kind
- best-effort rows return false, undefined or [] only for gh failures and throw for denial, conversion-failed and schema-mismatch

### 1.5 TASK-b7a68147dcf72034-s10-t5 — Replacement table: organisation, project, scope, login and url rows

Add the rows for ghTokenScopes, ghListOrgIssueTypes, ghCreateOrgIssueType, ghCreateProject, ghFindProjectByTitle, ghAddProjectSingleSelectField, ghAddProjectItem (gh:project:item-add), ghListRepoIssueUrls and ghCurrentLogin with the same old-result and failure rules.

**Acceptance checks:**
- one recorded-executor case per row returns the old value and failure kind
- ghCreateProject, ghFindProjectByTitle, ghAddProjectSingleSelectField and ghAddProjectItem return null or false only for gh failures and throw on denial and on schema failures

### 1.6 TASK-b7a68147dcf72034-s10-t6 — Replacement table: auth, origin, adapter assignee and pull request rows

Add the ghAuthOk form returning the {ok, reason} result, gitOriginOwnerRepo over git_remote and parseGithubRemoteUrl, the adapter's direct rows (readAssignees, setAssignee and addAssignee with the re-read checks, openPullRequestOf, the pull request create with the PULL_URL_RE parse, readSignoffState and readSignoffRequest over gh_pr_view jsonFields), the openSignoffRequest inner catch that rethrows ToolDenied and logs other failures, and the attach.ts tracked check over git_ls_files, git_status and git_log.

**Acceptance checks:**
- assignee read, set and add keep their validations, re-read checks and error messages
- a denied signoff link comment fails the stage and a retry reuses the open pull request
- an untracked file (empty git_ls_files list) is refused with the old reason
- ghAuthOk form returns {ok:true} and {ok:false, reason} as tracker-auto reads them

### 1.7 TASK-b7a68147dcf72034-s10-t7 — commitAndPushArtifactsViaRegistry

Add the registry commit-and-push sequence git_rev_parse, existence filter, git_stage, git_diff staged, git_commit, git_push with configured true, with the old result reasons, ToolDenied thrown with phase, committed flag and staged paths on denial, and the 'nothing staged' read from the typed diff.

**Acceptance checks:**
- same CommitArtifactsResult and reasons as the old function for not a work tree, no files on disk, nothing staged, git add failure, commit failure and rejected push
- a denial at each phase throws ToolDenied with the phase, committed flag and staged paths; denied commit leaves the paths staged (index checked)
- mixed existing and missing paths stage only the existing ones; alternate push remote, differently named upstream and missing upstream behave as the old helper

### 1.8 TASK-b7a68147dcf72034-s10-t8 — Team gate callers: make them await-ready

In the callers of the team gate chain (gates.ts at :641 and :930, review/resolve.ts, review/run-artifact.ts, review-step verdicts, workflow-rpc.ts, the workflow-step and build-step phases, resume.ts, run-meta.ts) make the enclosing functions asynchronous where needed and await each gate call. The gate functions are still synchronous, so awaiting changes no value and every test stays green.

**Acceptance checks:**
- every caller listed in the LLD awaits its gate call and returns the same outcome as before
- the daemon method key-set cases in handler.test.ts and handler-runtime.test.ts still pass

### 1.9 TASK-b7a68147dcf72034-s10-t9 — Team gate functions: async with denial rethrow

Make actingUser, teamContext, readHolder, teamGate, claim, release, reviewFixDecision, claimsEnforcedFor, authorizeStageChange, authorizeApproval, authorizeFindingApply, reviewFixModeFor, assertMayAuthor, assertMayBuild, parkPlan and resumeCheck asynchronous and add the ToolDenied rethrow before every catch-all listed in the LLD (gate.ts :183 :282 :308 :338 :348, approval-gate.ts :41 :57 :84 :134).

**Acceptance checks:**
- each gate returns the same outcome or raises the same refusal as before
- a ToolDenied thrown from the port stops the stage and never becomes undefined, a generic refusal or report-only

### 1.10 TASK-b7a68147dcf72034-s10-t10 — Publication path: await and denial rethrow

Make ExtraStep.run, ExtrasDeps.comments, runUnitExtras, guarded, guardedPush, pushEpic, pushStory, pushTasks, autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan, ensureUnitIssueDetailed, postMarker and resolveUnitIssueLocal asynchronous and await them in their callers and tests, running steps strictly one after another. A ToolDenied stops the loop, keeps the issue bindings already written, and is not turned into a failed result by guardedPush or guarded.

**Acceptance checks:**
- extras run in order and comments reconcile as before
- a denial at a milestone extra, a comment extra or the link comment stops publication with later calls forbidden and keeps the created bindings

### 1.11 TASK-b7a68147dcf72034-s10-t11 — Task reconciliation: CloseIssue async and durable pending-close

Make CloseIssue and the reconcile code that awaits it asynchronous; closeIssueOf logs pending-close before rethrowing a ToolDenied; reconcile reports progress through an onProgress callback; syncOnPlanApproval and syncPlanTasks rethrow ToolDenied (TaskSyncDenied with the partial arrays) and keep the {error} conversion for ordinary errors.

**Acceptance checks:**
- a denied close of a withdrawn Task escapes syncPlanTasks as ToolDenied with the partial arrays
- after the denial the Task has a pending-close entry and the next reconciliation closes the issue
- ordinary errors still return {error}

### 1.12 TASK-b7a68147dcf72034-s10-t12 — Identity and draft-issue loaders: await and denial rethrow

Make the LoadTracker forms in draft-issues.ts and identity-service.ts asynchronous with their callers, and add the ToolDenied rethrow in idOf (both catches), resolveLearner and ensureDraftIssues.

**Acceptance checks:**
- a denial inside idOf, resolveLearner or ensureDraftIssues stops the stage with no fallback identity, no unavailable status and no not-ready result
- a non-denial failure keeps the old fallback

### 1.13 TASK-b7a68147dcf72034-s10-t13 — Flip TrackerPort, IssueOps and the adapter to async over the table

Make TrackerPort, IssueOps, attempt() and loadTracker asynchronous (attempt awaits inside try, rethrows ToolDenied, keeps the conversion of other exceptions) and move github-adapter.ts, setup.ts, sync.ts, bugfix/tracker.ts and config/github-store.ts onto the replacement-table rows. Every consumer was made await-ready in t8 to t12.

**Acceptance checks:**
- github-adapter.ts, setup.ts, sync.ts, bugfix/tracker.ts and config/github-store.ts each run through the table with a recorded executor and create and update the same issues, sub-issues, milestones, comments and labels as before
- async attempt keeps the conversion of non-denial exceptions to kind rejected and rethrows ToolDenied
- ensureMilestone, linkSubIssue, close and comment results are not discarded (runtime sequence assertions)

### 1.14 TASK-b7a68147dcf72034-s10-t14 — Move the commit-and-push callers and the remaining wrapper callers

Move questions.ts commitAndComment, resolve-comment.ts commitRecorded and handleResolveComment, team/signoff.ts:385, config/github.ts gitOriginOwnerRepo uses, tracker-auto.ts ghAuthOk and attach.ts onto the registry forms; ordinary git failures stay logged, a ToolDenied is rethrown and stops the stage, handleResolveComment returns its error result with the recorded count.

**Acceptance checks:**
- a denied commit posts no comment and handleResolveComment returns the error result, never success
- ordinary git failures are still logged and the stage continues
- tracker-auto reads the {ok, reason} result unchanged

### 1.15 TASK-b7a68147dcf72034-s10-t15 — Close-aware rpc

Add the additive opts.closeAware to rpc in src/shared/ipc-client.ts: end and close listeners that reject on premature close without any timer; rpc without it is unchanged.

**Acceptance checks:**
- rpc with closeAware rejects when the socket closes before a reply and sets no timer
- rpc without closeAware behaves as before

### 1.16 TASK-b7a68147dcf72034-s10-t16 — Daemon: workflow.approvePipeline, tracker.sync, tracker.setup

Add the versioned workflow.approvePipeline (workflow.approve delegates to it with withTracker true) with the ordered pipeline approval, Task reconciliation, one publication, check-in commit, attach, attach commit; split followOnTasksSync so publication happens once; add the additive followOn kinds and the taskSync payload; add tracker.sync {repoPath, epicHash} and tracker.setup {repoPath, opts}; register the methods in the handler contract key-set cases. The pipeline catches ToolDenied only at its step boundaries.

**Acceptance checks:**
- withTracker false stops after approval and Task reconciliation
- a plan approval publishes exactly once
- a denial at any step records that followOn entry ok false and runs no later step
- workflow.approve (MCP) behaves as today through the delegation
- handler.test.ts and handler-runtime.test.ts key-set cases list the new methods

### 1.17 TASK-b7a68147dcf72034-s10-t17 — Daemon: team and review methods

Add team.refresh {repoPath, branch?}, team.claim and team.release {repoPath, unit}, workflow.reviewArtifact {repoPath, artifactPath} and workflow.resolveFinding {artifactPath, findingId, action, note?}, each returning what the client service returns today and letting a ToolDenied reach the client as an error; register them in the handler contract key-set cases.

**Acceptance checks:**
- each method returns the old result and refusals with claims enforced
- handler.test.ts and handler-runtime.test.ts key-set cases list the new methods

### 1.18 TASK-b7a68147dcf72034-s10-t18 — Client services onto daemon methods

Change src/cli/services/workflow.ts (approve, sync, trackerSetup, reviewArtifact, resolveFinding) and team.ts (refresh, claim, release) to call the daemon methods with closeAware rpc and no local git, gh or workflow code; the approve adapter rebuilds ApproveOutcome losslessly from the followOn entries; make sync, teamClaim, teamRelease and resolveFinding asynchronous in index.ts and await them in command.ts. A missing method gives a clear error with no local fallback.

**Acceptance checks:**
- the client passes epicHash, branch, unit, setup options, withTracker and overrideReview to the named methods
- the adapter reproduces approval, tracker, tasks, commit, attach and attachCommit including error and skipped outcomes
- an older daemon gives method-not-found and nothing is published
- command.ts awaits sync, claim, release and resolveFinding

### 1.19 TASK-b7a68147dcf72034-s10-t19 — Verification: invariants, site list, no floating promises, old paths, migration rows

Check the invariants that rest on the epic constraints against the code (a schema failure is never passed on; the client reaches the daemon only through IPC; a destructive call with no client is denied; provider-reaching code awaits serially), then add the site-list test (31 gh wrappers equal the github.ts exports, the client scan finds two sites, one named exemption and five no-site files), the compiler-API no-floating-promises scan, the old-paths-unchanged test (runGit, runGitAsync, runGh, commitAndPushArtifacts, the wrappers, createGitRunner and _setTrackerExecForTests still exported; the scan in report mode), and write the migration record rows.

**Acceptance checks:**
- the site list is complete and every site has a table row and a registry test
- no unawaited TrackerPort, IssueOps, CloseIssue or loader call remains
- the old paths are still exported unchanged and the scan is in report mode
- each invariant resting on k2 to k5 has a named check that passes

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/tracker/registry-table.ts: every gh wrapper row and gitOriginOwnerRepo and ghAuthOk forms | `t4`, `t5`, `t6` |
| commitAndPushArtifactsViaRegistry: not a repo, nothing staged, committed, push rejected, denied at each step | `t7` |
| src/workflow/tracker/github-adapter.ts, setup.ts, sync.ts with async TrackerPort | `t13`, `t6` |
| questions.ts, resolve-comment.ts, team/signoff.ts commit-and-push sites | `t14` |
| daemon methods workflow.approvePipeline, tracker.sync, team.refresh, team.claim, team.release in the handler runtime | `t16`, `t17` |
| src/cli/services/workflow.ts and team.ts with a fake rpc: no child_process import, one daemon method per operation | `t18` |
| a site-list test that greps src/workflow and src/cli/services for wrapper calls and spawns and checks each has a table row and a test | `t19` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 contractDetails (api: commitAndPushArtifactsViaRegistry, workflow.approvePipeline, tracker.sync, team.refresh and the review methods)`
- **[[c2]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 dataModelChanges: Replacement table rows and tool extensions`
- **[[c3]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 dataModelChanges: TrackerPort async propagation and the client services`
- **[[c4]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 errorPaths: the ToolDenied carrier and catch-all rethrow inventory`
- **[[c5]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 testStrategy and acceptanceMapping`
- **[[c6]]** `prior-artifact` `LLD-b7a68147dcf72034-s10 migration steps and the old-paths decision (ac5)`
