<!-- insrc:artifact LLD-b7a68147dcf72034-s10 -->

# LLD: STORY-b7a68147dcf72034-s10

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `9fcc90f081df...`

This Story moves every tracker, commit-and-push and terminal-client git or gh call onto the tool registry. Inside the daemon the tracker code calls registry tools through callTool using one replacement table (each github.ts wrapper and commitAndPushArtifacts mapped to a tool, keeping the old result and failure shape). The terminal client stops running approval, tracker sync and team policy code in its own process and asks the daemon to run each whole operation. The old wrappers stay in place, unused by these sites, for Story s9 to delete.

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

> See **HLD-b7a68147dcf72034** § 2. Framework summary

**Rollout phase:** <not in any phase>

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step. — owns `sc1`
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s3`: The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own. — owns `sc4`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s5`: The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.
- `s6`: The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.
- `s7`: The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.
- `s8`: Private implementation of s8: Reach the rest of git through named, typed tools
- `s9`: Private implementation of s9: Move the workflow library's and the daemon's direct git and gh calls onto the registry

## 2. Contract details

**Surface level:** internal

### 2.1 `commitAndPushArtifacts`

```typescript
commitAndPushArtifacts(repoPath: string, paths: string[], message: string): CommitArtifactsResult  // old, sync, stays in place (ac5)
```

**Parameters:**
- `repoPath: string` — Repository to commit in.
- `paths: string[]` — Files to stage.
- `message: string` — Commit message.

**Returns:** `CommitArtifactsResult` — {committed, pushed, reason}; the old function is unchanged and the five callers move to its registry-based replacement in the table module.

**Errors:**
- `none thrown` when Failures are reported through reason, as today.

**Preconditions:**
- Old function stays unchanged (ac5).

**Postconditions:**
- No site in this Story calls it after the change.

### 2.2 `commitAndPushArtifactsViaRegistry`

```typescript
commitAndPushArtifactsViaRegistry(repoPath: string, paths: string[], message: string, caller: 'workflow'): Promise<CommitArtifactsResult>  // new, in the replacement-table module
```

**Parameters:**
- `repoPath: string` — Repository to commit in.
- `paths: string[]` — Files to stage.
- `message: string` — Commit message.
- `caller: 'workflow'` — Caller identity passed to callTool.

**Returns:** `Promise<CommitArtifactsResult>` — Same {committed, pushed, reason} as the old function, with the same reason texts, produced by the sequence git_rev_parse (isInsideWorkTree), git_stage, git_diff with staged true, git_commit, git_push with its new input configured: true, which runs a plain `git push` so the remote, refspec and upstream come from the repository's own git configuration exactly as the old helper did (the tool's defaults of origin and the current branch apply only when configured is absent). 'Nothing staged' is read from the typed staged-diff result (an empty diff), never from a tool failure; a failed git_diff is reported as a failure, not as changes or as nothing. A denial is never returned in the result: it is thrown as ToolDenied (so a caller that ignores the result, as questions.ts and resolve-comment.ts do today, cannot continue past it).

**Errors:**
- `ToolDenied` when A call is denied (ToolFailure.kind 'denied'): the function THROWS ToolDenied carrying the denied phase, committed (true when git_commit had succeeded), the staged paths and the denial reason, and makes no further call. Ordinary failures (not a work tree, no files, git add/commit/push failures) stay in the result as before.

**Preconditions:**
- Runs inside the daemon.

**Postconditions:**
- The same commit and push happen as before when approved; ordinary failures give the same CommitArtifactsResult reasons.
- git_stage runs before git_commit's separate approval, so a denial at git_commit leaves the paths staged (as the old function left them staged when git commit failed); no restoration is attempted and the thrown ToolDenied lists the staged paths.
- A denial at git_push after a successful git_commit throws ToolDenied with committed true; a push that fails without denial returns committed true, pushed false. A failed or denied push is not retried: a repeat call finds nothing staged and returns 'nothing to commit (already up to date)'. Retrying a publication is out of scope for s10.

### 2.3 `gitOriginOwnerRepo`

```typescript
gitOriginOwnerRepo(repoPath: string): {owner: string; repo: string} | null  // old, stays; replaced at src/workflow/config/github.ts:288 and src/workflow/config/github.ts:339 by an async registry form
```

**Parameters:**
- `repoPath: string` — Repository whose origin is read.

**Returns:** `{owner, repo} | null` — Old function unchanged; the new form reads the remote through the registry's git remote tool and parses it with parseGithubRemoteUrl.

**Postconditions:**
- Old function unchanged (ac5).

### 2.4 `ghAuthOk`

```typescript
ghAuthOk(): { readonly ok: true } | { readonly ok: false; readonly reason: string }  // old, sync, stays; src/workflow/tracker-auto.ts:94 moves to an async registry form using gh_auth status
```

**Returns:** `{ ok: true } | { ok: false; reason: string }` — Old function unchanged. The async registry form returns the same discriminated result: ok true when gh_auth status succeeds, otherwise ok false with the reason text the old function gives ('gh CLI not available or not authenticated (run `gh auth login`)'), which tracker-auto.ts reads as auth.ok and auth.reason.

**Postconditions:**
- Old function unchanged (ac5).

### 2.5 `workflow.approve`

```typescript
daemon method 'workflow.approve' (src/daemon/handler-runtime.ts:424), extended: params add withTracker?: boolean (default true); one ordered pipeline; additive followOn kinds
```

**Parameters:**
- `artifactPath: string` — Artifact to approve.
- `withTracker: boolean` _(optional)_ — Default true (so MCP callers that do not pass it behave as today). False keeps the client's early return: after the approval and, for a plan, the Task reconciliation, nothing is published, committed or attached.
- `overrideReview: string` _(optional)_ — Override reason for a review-withheld artifact, passed through unchanged.

**Returns:** `WorkflowApproveResult` — The approved and skipped lists, codeReview and followOn as today. The daemon runs ONE ordered pipeline per approved artifact: (1) approval; (2) for a plan, Task reconciliation only (syncPlanTasks), no publication; (3) if withTracker is true, ONE publication by workflow (autoPushEpicOnHld, autoPushStoryOnLld, or autoPushTasksOnPlan), which replaces the push that followOnTasksSync runs today after the sync; (4) the check-in commit; (5) attaching the approved document; (6) the attach commit. With withTracker false the pipeline ends after (2). A denial or failure at a step stops the later steps and is reported on that step's followOn entry (ac4). followOnTasksSync is split: it keeps the reconciliation and its 'tasks-sync' entry, and loses its autoPushTasksOnPlan call, which moves to step (3). The existing follow-ons bugfix-advance, bugfix-complete and BUILD tracker-attach are unchanged.

**Errors:**
- `denial or step failure` when A moved call is denied or fails: that step's followOn entry has ok false with the reason and the later steps do not run; the approval stands.
- `method-not-found` when An older daemon: the client reports it and does not fall back to local code.

**Preconditions:**
- Daemon running.

**Postconditions:**
- The client's approve calls workflow.approvePipeline and prints its result; it no longer runs approveArtifactByJsonPath, syncPlanTasks, autoPush*, commitApprovedArtifacts or attachApprovedDocuments.

### 2.6 `tracker.sync`

```typescript
daemon method 'tracker.sync' (new): params {repoPath: string; epicHash: string}; runs syncTracker in the daemon and returns SyncResult
```

**Parameters:**
- `repoPath: string` — Repository to sync.
- `epicHash: string` — Epic whose tracker records are synced (the client sync signature).

**Returns:** `SyncResult` — What the client's sync (src/cli/services/workflow.ts:413) returns today; the client's sync becomes async and command.ts awaits it before reading r.status.

**Errors:**
- `denial` when A moved call is denied; the sync fails with the denial.

**Postconditions:**
- The client's sync calls this method.

### 2.7 `team.refresh`

```typescript
daemon methods (new): 'team.refresh' {repoPath: string; branch?: string} -> string; 'team.claim' and 'team.release' {repoPath: string; unit: Omit<UnitRef, 'repoPath'>} -> string; 'tracker.setup' {repoPath: string; opts?: TrackerSetupOptions} -> TrackerSetupReport; plus 'workflow.reviewArtifact' {repoPath: string; artifactPath: string} -> ReviewArtifactResult and 'workflow.resolveFinding' {artifactPath: string; findingId: string; action: ReviewAction; note?: string} -> ResolveReviewResult
```

**Parameters:**
- `repoPath: string` — Repository the operation belongs to.
- `branch: string` _(optional)_ — team.refresh only: the branch whose policy is refreshed (teamRefresh in src/cli/services/team.ts).
- `unit: Omit<UnitRef, 'repoPath'>` _(optional)_ — team.claim and team.release: the unit identity (teamClaim and teamRelease take it today).
- `opts: TrackerSetupOptions` _(optional)_ — tracker.setup only: the setup options trackerSetup takes today (src/cli/services/workflow.ts:458).

**Returns:** `string | TrackerSetupReport` — team.refresh, team.claim and team.release return the text the client service returns today; tracker.setup returns the TrackerSetupReport. The client plans nothing and writes nothing itself; the daemon runs the plan and the repo.trackerConfig.ensure write.

**Errors:**
- `denial` when A moved call is denied; the operation fails with the denial.

**Postconditions:**
- src/cli/services/team.ts and trackerSetup run no git, gh or workflow code; like teamPark, teamResume and teamSettle they call the daemon through rpc.
- teamClaim, teamRelease and sync become asynchronous in src/cli/services/index.ts (:72, :95, :96) and src/cli/command.ts awaits them (:266, :346).
- The client services reviewArtifact and resolveFinding call those daemon methods; the scan of src/cli/services also finds no import of the review or team gate code.

## 3. Data model changes

### 3.1 `Replacement table` — new

One module in the daemon (the table). Rule for failures: a gh failure (missing-tool, missing-signin, unreachable, rejected) keeps the wrapper's old result (throw GhCommandError, or false, null, [] or undefined for the best-effort ones); a DENIAL (ToolFailure.kind 'denied': declined, timed-out, no-client, cancelled) is never swallowed and is thrown as a ToolDenied error that the port's attempt() wrapper rethrows so the stage fails (ac4). Rows (wrapper -> tool and op -> result mapping): ghAuthOk -> gh_auth status -> {ok:true} or {ok:false, reason: old text}. ghCreateLabel -> gh_label create with force -> true, false on gh failure. ghCreateIssue -> gh_issue_create (title, body, labels) -> ref built from the printed url, throws as before. ghCreateIssueTyped -> gh_tracker issue_create_typed -> {ref, id, typed}, with the old untyped retry when the type is refused. ghLinkSubIssue -> gh_tracker sub_issue_link -> void. ghGetIssueId -> gh_tracker issue_id -> number. ghGetIssueBody -> gh_issue_view json body -> string. ghEditIssueBody -> gh_issue_edit body -> void. ghComment -> gh_issue_comment -> void. ghListIssueComments -> gh_tracker comments_list -> TrackerComment[] sorted as before. ghPostCommentReturningId -> gh_tracker comment_post -> id string. ghCloseIssue -> gh_issue_close -> void. ghGetIssueState -> gh_issue_view json state,labels -> {state, labels}. ghFindIssueByLabels -> gh_issue_list (labels, state all, limit 1) -> ref or undefined (undefined on gh failure). ghFindIssueByLabelsStrict -> the same call, failures thrown. ghListIssuesByLabelsStrict -> gh_tracker issues_by_labels -> sorted refs. ghListIssuesByTitleTokenStrict -> gh_tracker issues_titles -> sorted refs. ghEnsureMilestone -> gh_tracker milestone_create -> void (gh failure, including already exists, swallowed). ghAttachMilestone -> gh_issue_edit milestone -> void. ghTokenScopes -> gh_tracker token_scopes -> {ok, scopes} or {ok:false, reason}. ghListOrgIssueTypes -> gh_tracker org_issue_types_list -> names, [] on gh failure. ghCreateOrgIssueType -> gh_tracker org_issue_type_create -> true, false on gh failure. ghCreateProject -> gh_tracker project_create -> {number, url} or null. ghFindProjectByTitle -> gh_project_list (owner, limit 200) -> match {number, url} or null. ghAddProjectSingleSelectField -> gh_project_manage field-create (SINGLE_SELECT, singleSelectOptions) -> true or false. ghListRepoIssueUrls -> gh_issue_list json url (state all, limit) -> urls, [] on gh failure. ghAddProjectItem -> gh:project:item-add (the existing ghProjectItemAddTool definition) -> true or false. ghCurrentLogin -> gh_tracker current_login -> login, throws on empty. queryTasks and listMyOpenTasks -> gh_tracker tasks_query -> TaskPage. gitOriginOwnerRepo -> git_remote (origin url) parsed by parseGithubRemoteUrl -> owner/repo or null. commitAndPushArtifacts -> the git sequence above. attach.ts:55 -> git_ls_files (cached true, paths [relPath]; tracked only when the returned files include the literal path), git_status (porcelain for the file) and git_log (-1 %H for the file) -> the same refusal reasons. Where a tool's output lacks a field the wrapper returned, the task adds the field to the tool inside this Story only if no other Story owns it, otherwise it is raised as a back-flow; no wrapper is left unmapped. The list of 31 gh wrappers above is checked against the exports of src/workflow/tracker/github.ts by the site-list test. Adapter direct calls (src/workflow/tracker/github-adapter.ts, not github.ts wrappers): readAssignees (:79) -> gh_issue_view json assignees, keeping the ISSUE_REF_RE validation and the 'unexpected assignee JSON' rejected error; setAssignee (:109, :110) -> gh_issue_edit removeAssignees then addAssignees as two calls, then the fresh re-read through the same view row and the same 'assignees are [..] after the update' check, with no step retried and the re-read skipped after a failed step; addAssignee (:128) -> gh_issue_edit addAssignees, re-read, same 'after the add' check; openPullRequestOf (:142) -> gh_pr_list (repo, head, state open, json url) with the same PULL_URL_RE filter, undefined on unparsable output; openSignoffRequest (:160) -> gh_pr_create (repo, head, title, body) -> the printed url parsed by PULL_URL_RE, the empty-branch and malformed-issue validations kept, and the link comment through the ghPostCommentReturningId row (its failure logged, not returned); readSignoffState (:219) -> gh_pr_view with the json fields state,mergedAt,reviewDecision or state,mergedAt,reviews; readSignoffRequest (:232) -> gh_pr_view with headRefName,state. The task confirms each tool returns those fields; a missing field is a back-flow to the owning Story (s5), not an invented tool. Both the port's attempt() wrapper and every row rethrow a denial. openSignoffRequest keeps its best-effort link comment: its inner catch logs ordinary gh failures ('the signoff request was opened but not linked from its issue') and still returns success, but RETHROWS ToolDenied, so a denied link comment fails the stage after the pull request exists; a retry reuses the open pull request through the openPullRequestOf row. gh_pr_view gets an additive extension inside this Story (a helper step like the earlier gh_auth hosts op; s5 is delivered and owns the tool): an optional jsonFields input limited to an allowlist (state, mergedAt, reviewDecision, reviews, headRefName, url) and an output schema that admits those fields; its default fields and every existing result are unchanged. This is flagged as an open question for the owner of s5's tools. Failure mapping for EVERY ToolFailureKind: missing-tool, missing-signin, unreachable and rejected map to the same GhCommandError kinds; a command 'timed-out' (not an approval timeout, which is kind 'denied' with denial timed-out) maps to GhCommandError 'unreachable' with a message naming the command's registry limit, as classifyGhFailure did for a killed gh; 'conversion-failed' and 'schema-mismatch' map to GhCommandError 'rejected' with the tool's message and are NEVER turned into a best-effort false, null, [] or undefined (they throw, even in best-effort rows); 'denied' maps to the thrown ToolDenied error. Denial carrier: ToolDenied is a thrown error class (carrying the tool id and the denial reason) with one predicate isToolDenied. Every catch-all on the call paths rethrows it before its own handling: the port's attempt() wrapper, guarded() (tracker-auto.ts:206), guardedPush (:196, which today turns any throw into 'the issue exists but a local step failed'), the runUnitExtras step loop (a failed step is recorded and the loop continues today; a denial instead stops the loop, so no later extra runs), openSignoffRequest's inner catch, the untyped retry inside the ghCreateIssueTyped row, and every best-effort row. The approve pipeline's publication step is the one place that catches ToolDenied: it records the followOn entry 'tracker-push' with ok false, the denial and the objects already created (issue bindings are written locally when each issue is created, so their identities are kept, and the entry's note names the unit and the step that was denied), and runs no later pipeline step. tracker.setup and the team methods return the denial to the client the same way. attempt() today (src/workflow/tracker/github-adapter.ts:64) catches EVERY thrown value and turns non-GhCommandError exceptions into a PortResult failure of kind 'rejected'. It becomes async: attempt<T>(fn: () => Promise<T>): Promise<PortResult<T>> awaits fn inside its try, rethrows ToolDenied first (isToolDenied), and otherwise keeps today's conversion through failure(). Task reconciliation: syncPlanTasks (src/daemon/tasks-sync.ts) wraps openTracker and sets.syncOnPlanApproval in a catch that returns {error: message}; it rethrows ToolDenied before that conversion, so a denial during a withdrawn-Task close escapes through the awaited CloseIssue and syncPlanTasks. The approve pipeline catches it at the reconciliation boundary: the 'tasks-sync' entry is ok false with the denial and the Tasks already reconciled, publication and every later step are skipped. Client transport: src/shared/ipc-client.ts installs its end/close rejection listeners only when a timeout is passed, so a plain rpc call could stay pending forever if the socket closes. rpc gains an additive opts.closeAware (default false): it installs the same end/close rejection without any timer, so no deadline competes with approval waits; the client services for workflow.approvePipeline, tracker.sync, tracker.setup, team.refresh, team.claim and team.release pass closeAware true and report 'daemon closed the connection before replying' on premature close, while the daemon finishes the pipeline on its own. Commit-and-push callers and the denial: questions.ts commitAndComment (src/workflow/questions.ts:470) and resolve-comment.ts commitRecorded (src/workflow/resolve-comment.ts:218) are best-effort for ordinary git failures (logged, not returned) and become async; their catch blocks rethrow ToolDenied before logging, and commitAndComment posts its issue comment only after the commit step returned or failed without denial, so a denied commit posts no comment. recordResolution (async) propagates the denial to its callers; handleResolveComment (both call sites, src/workflow/resolve-comment.ts:193 and :203) turns it into its existing error result 'recorded N of M before ... denied ...' (the resolutions already written stay on disk and are counted), never into success. The signoff commit (src/workflow/team/signoff.ts:385) and the client approve's two commits follow the same rule: ordinary failures in the result, denial thrown and caught only at the pipeline or stage boundary. Task reconciliation: TaskSets.syncOnPlanApproval (src/workflow/tasks/task-set.ts:381-393) wraps reconcile in a catch that returns {error: reason} for every exception; it rethrows ToolDenied first. reconcile reports its progress (created, changed, withdrawn, added) through an additive onProgress callback in ReconcileOptions as it goes, and syncOnPlanApproval rethrows ToolDenied with that progress attached (TaskSyncDenied extends ToolDenied with a partial field), which syncPlanTasks lets through and the pipeline records on the 'tasks-sync' entry (ok false, the denial, taskSync carrying the partial arrays), skipping publication and every later step. Ordinary errors keep the {error: reason} conversion. Team gates and review-fix catch sites (each rethrows ToolDenied before its own handling, and its enclosing async callers let it through to the stage boundary): src/workflow/team/gate.ts actingUser (:183, 'catch { return undefined }'), teamGate (:282), claim (:308), release (:338; these three turn every exception into a refusal outcome), reviewFixDecision (:348, 'catch { return report-only }'); src/workflow/team/approval-gate.ts :41, authorizeStageChange (:57), reviewFixModeFor (:84, report-only) and :134. A denial therefore stops the team or review stage and never becomes undefined, a generic refusal or a report-only continuation. gate.ts :117 (park-offer provider), :128 (completion hook) and :169 (policy read) do not call the port and are unchanged. Durable state for a denied withdrawn-Task close: TaskSets.closeIssueOf (src/workflow/tasks/task-set.ts:326) logs 'pending-close' only after closeIssue returns, and retryCloses (:344) retries only a Task whose latest close entry is 'pending-close', so a thrown denial would lose the retry. closeIssueOf therefore catches ToolDenied from opts.closeIssue, appends the 'pending-close' log entry (summary: the issue and the denial reason) to the Task, and rethrows the original ToolDenied; the next reconciliation's retryCloses closes the issue. Push parity: the old helper ran `git -C <repo> push` with no arguments, and git_push without remote and ref pushes origin and the current branch, which differs for another push remote, a differently named upstream or no upstream. git_push therefore gains an additive input configured (boolean, mutually exclusive with remote, ref and every force input, never destructive, approval class unchanged) that runs a plain `git push`; every existing call of the tool is unchanged. It is an extension of an s4 tool made inside this Story, as the earlier helper stories did, and flagged below for s4's owner. attach.ts tracked check: git_ls_files has no error-unmatch input and returns {files: []} for an unmatched path, so the row is git_ls_files with cached true and paths [relPath], and the file counts as tracked only when the returned files include that literal path; an empty list is the old 'error-unmatch threw' refusal. The status and log rows are unchanged. Terminal client review and finding resolution: src/cli/services/workflow.ts reviewArtifact (:325, runs reviewArtifactFile with a router and provider in the client, reaching reviewFixModeFor and the team gates) becomes a client call of the new daemon method 'workflow.reviewArtifact' {repoPath, artifactPath} -> ReviewArtifactResult, run in the daemon with the router, provider and lifecycle there (the readEntitiesForRepoFromDaemon detour is dropped); resolveFinding (:266, runs resolveReviewFinding, reaching authorizeFindingApply and so teamGate, whoAmI and possible issue creation) becomes the new daemon method 'workflow.resolveFinding' {artifactPath, findingId, action, note?} -> ResolveReviewResult and is asynchronous in src/cli/services/index.ts (:62, :64) with src/cli/command.ts awaiting it (:200 already awaits reviewArtifact; :222 does not). Identity and draft-issue catches (each rethrows ToolDenied before its own handling): src/workflow/identity/identity-service.ts idOf (the tracker catch that returns {source:'github', status:'unavailable', identities:[]} and the outer catch that returns osId()), src/understanding/identity.ts resolveLearner (the adapter.lookup catch that continues to git or OS identity), and src/workflow/draft-issues.ts ensureDraftIssues (the catch-all that returns notReady('the draft', 'rejected', ...)). A denial therefore never becomes a fallback identity, an 'unavailable' status or an advisory not-ready result; it stops the stage. The shared identity boundary is coordinated with s9, which lands after s10 and builds on these awaited signatures.

**Call sites:**
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/setup.ts`
- `src/workflow/tracker/sync.ts`
- `src/workflow/questions.ts:470`
- `src/workflow/resolve-comment.ts:218`
- `src/workflow/team/signoff.ts:385`
- `src/workflow/tracker-auto.ts:94`
- `src/workflow/config/github.ts:288`
- `src/workflow/config/github.ts:339`
- `src/workflow/tracker/attach.ts:55`
- `src/workflow/bugfix/tracker.ts`
- `src/workflow/config/github-store.ts`
- `src/workflow/tracker/attach.ts:140`
- `src/workflow/tracker/attach.ts:142`
- `src/workflow/tracker/attach.ts:143`
- `src/workflow/tracker/github-adapter.ts:79`
- `src/workflow/tracker/github-adapter.ts:109`
- `src/workflow/tracker/github-adapter.ts:128`
- `src/workflow/tracker/github-adapter.ts:142`
- `src/workflow/tracker/github-adapter.ts:160`
- `src/workflow/tracker/github-adapter.ts:219`
- `src/workflow/tracker/github-adapter.ts:232`
- `src/shared/ipc-client.ts:47`
- `src/daemon/tasks-sync.ts:56`
- `src/workflow/tracker/github-adapter.ts:64`
- `src/workflow/resolve-comment.ts:193`
- `src/workflow/resolve-comment.ts:203`
- `src/workflow/tasks/task-set.ts:381`
- `src/workflow/team/gate.ts:183`
- `src/workflow/team/gate.ts:282`
- `src/workflow/team/gate.ts:308`
- `src/workflow/team/gate.ts:338`
- `src/workflow/team/gate.ts:348`
- `src/workflow/team/approval-gate.ts:41`
- `src/workflow/team/approval-gate.ts:57`
- `src/workflow/team/approval-gate.ts:84`
- `src/workflow/team/approval-gate.ts:134`
- `src/workflow/tasks/task-set.ts:326`
- `src/workflow/tasks/task-set.ts:344`
- `src/cli/services/workflow.ts:266`
- `src/cli/services/workflow.ts:325`
- `src/cli/services/index.ts:62`
- `src/cli/services/index.ts:64`
- `src/cli/command.ts:200`
- `src/cli/command.ts:222`
- `src/daemon/tools/builtins/git/push.ts:30`
- `src/daemon/tools/builtins/git/ls-files.ts`
- `src/workflow/identity/identity-service.ts:116`
- `src/understanding/identity.ts`
- `src/workflow/draft-issues.ts:125`

### 3.2 `TrackerPort` — invariant-change

TrackerPort methods (whoAmI :95, readAssignee :96, setAssignee :97, addAssignee :99, and the rest of src/workflow/tracker/port.ts) become asynchronous. Propagation, all awaited in the same change: src/workflow/team/gate.ts teamContext (:208), readHolder (:232), teamGate (:258), claim (:299), release (:318), reviewFixDecision (:346), claimsEnforcedFor (:164) and actingUser (:176, which calls whoAmI); src/workflow/team/approval-gate.ts Decide, asking, authorizeStageChange, authorizeApproval (:68), authorizeFindingApply (:73), reviewFixModeFor (:81); src/workflow/team/author-gate.ts assertMayAuthor (:49), assertMayBuild (:76) and their callers; src/workflow/team/handoff.ts parkPlan (:382) and resumeCheck (:664); src/workflow/team/run-meta.ts (:75-76). Callers: src/workflow/gates.ts (:641, :930), src/workflow/review/resolve.ts (:110), src/daemon/steps/review-step/phases/verdicts.ts (:122), src/workflow/review/run-artifact.ts (:116), src/daemon/workflow-rpc.ts (:185, :344, :483), src/daemon/steps/workflow-step/phases/start.ts, plan.ts, step.ts, synthesize.ts, src/daemon/steps/workflow-step/resume.ts (:149), src/daemon/steps/build-step/phases/implement.ts and validate.ts, and the service interface and command consumers (src/cli/services/index.ts :72, :95, :96; src/cli/command.ts :266, :346). The result values (GateOutcome, ApprovalRefusal, ReviewFixMode) are unchanged; only their wrapping in a Promise changes, and every refusal still raises where it raised before. The analyzer's call graph was incomplete here, so the task list ends with a compiler-driven sweep: change the port, then fix every type error until none remain, and the site-list test greps for the names above. Test seams of these modules (_setGateDepsForTests and the deps arguments) keep their shape and may return promises. Callback and loader contracts that become asynchronous: IssueOps methods (create, linkSubIssue, close and the rest of port.issueOps) return Promises; CloseIssue (src/workflow/tasks/task-set.ts:67) becomes (issue: string) => Promise<{ok:true} | {ok:false; reason:string}> and the reconcile code that takes ReconcileOptions.closeIssue awaits it; the closeIssue built in src/daemon/tasks-sync.ts (const r = gate.port.issueOps.close(issue)) awaits the port; loadTracker (src/workflow/tracker/github-adapter.ts:314) returns Promise<PortResult<...>> because it reads whoAmI, and its dependency-injected forms (LoadTracker in src/workflow/draft-issues.ts:57 and src/workflow/identity/identity-service.ts:45) change to the same Promise type with their callers (draft-issues.ts:125, identity-service.ts:116, team/gate.ts) awaiting. A denial raised inside an awaited port call escapes through these callbacks as the thrown ToolDenied error; CloseIssue's {ok:false} result is for gh failures only. The compiler cannot see a discarded Promise (for example IssueOps.ensureMilestone returning Promise<void> whose result is ignored), so the sweep has two more checks: a source-scan test with the TypeScript compiler API that fails on any call of a TrackerPort, IssueOps, CloseIssue or loader method whose result is neither awaited, returned nor passed on, and runtime sequence assertions in the recorded-executor tests for the discarded-result calls (ensureMilestone, linkSubIssue, close, comment). Publication path (src/workflow/tracker/unit-issue.ts and src/workflow/tracker-auto.ts): ExtraStep.run (unit-issue.ts:513) becomes () => Promise<PortResult<void>>; ExtrasDeps.comments (:533) and the commentsOnce lister inside runUnitExtras (:573, :579) become async; runUnitExtras returns Promise<ExtrasOutcome> and still runs the steps strictly one after another and reconciles comments as before; guarded(), pushEpic, pushStory, pushTasks, guardedPush, autoPushEpicOnHld, autoPushStoryOnLld, autoPushTasksOnPlan, ensureUnitIssueDetailed, postMarker, resolveUnitIssueLocal and openTracker's callers become async, with their tests (src/workflow/tracker/__tests__/unit-extras.test.ts and the tracker-auto tests) awaiting them.

**Call sites:**
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/sync.ts`
- `src/workflow/tracker/setup.ts`
- `src/workflow/tracker/port.ts:96`
- `src/workflow/team/gate.ts:233`
- `src/workflow/team/gate.ts:248`
- `src/workflow/team/gate.ts:335`
- `src/cli/services/index.ts:72`
- `src/cli/services/index.ts:95`
- `src/cli/services/index.ts:96`
- `src/cli/command.ts:266`
- `src/cli/command.ts:346`
- `src/workflow/team/gate.ts:164`
- `src/workflow/team/gate.ts:176`
- `src/workflow/team/gate.ts:208`
- `src/workflow/team/gate.ts:232`
- `src/workflow/team/gate.ts:258`
- `src/workflow/team/gate.ts:299`
- `src/workflow/team/gate.ts:318`
- `src/workflow/team/gate.ts:346`
- `src/workflow/team/approval-gate.ts:68`
- `src/workflow/team/approval-gate.ts:73`
- `src/workflow/team/approval-gate.ts:81`
- `src/workflow/team/author-gate.ts:49`
- `src/workflow/team/author-gate.ts:76`
- `src/workflow/team/handoff.ts:382`
- `src/workflow/team/handoff.ts:664`
- `src/workflow/team/run-meta.ts:75`
- `src/workflow/gates.ts:641`
- `src/workflow/gates.ts:930`
- `src/workflow/review/resolve.ts:110`
- `src/daemon/steps/review-step/phases/verdicts.ts:122`
- `src/workflow/review/run-artifact.ts:116`
- `src/daemon/workflow-rpc.ts:185`
- `src/daemon/workflow-rpc.ts:344`
- `src/daemon/workflow-rpc.ts:483`
- `src/daemon/steps/workflow-step/phases/start.ts`
- `src/daemon/steps/workflow-step/phases/plan.ts`
- `src/daemon/steps/workflow-step/phases/step.ts`
- `src/daemon/steps/workflow-step/phases/synthesize.ts`
- `src/daemon/steps/workflow-step/resume.ts:149`
- `src/daemon/steps/build-step/phases/implement.ts`
- `src/daemon/steps/build-step/phases/validate.ts`
- `src/workflow/tasks/task-set.ts:67`
- `src/daemon/tasks-sync.ts:56`
- `src/workflow/tracker/github-adapter.ts:314`
- `src/workflow/draft-issues.ts:57`
- `src/workflow/draft-issues.ts:125`
- `src/workflow/identity/identity-service.ts:45`
- `src/workflow/identity/identity-service.ts:116`
- `src/workflow/tracker/unit-issue.ts:513`
- `src/workflow/tracker/unit-issue.ts:533`
- `src/workflow/tracker/unit-issue.ts:573`
- `src/workflow/tracker-auto.ts:147`
- `src/workflow/tracker-auto.ts:196`
- `src/workflow/tracker-auto.ts:206`
- `src/workflow/tracker-auto.ts:226`
- `src/workflow/tracker-auto.ts:259`

### 3.3 `Terminal client services` — invariant-change

src/cli/services/workflow.ts (approve :216, sync :413, trackerSetup :458) and src/cli/services/team.ts (:27, :50, :55) hold no git, gh or workflow code; each calls one daemon method. Other services (connection-maintenance, daemon, debug, maintenance, setup, index) are searched completely in the tasks and any found site gets a row.

**Call sites:**
- `src/cli/services/workflow.ts:140`
- `src/cli/services/workflow.ts:175`
- `src/cli/services/workflow.ts:216`
- `src/cli/services/workflow.ts:413`
- `src/cli/services/workflow.ts:458`
- `src/cli/services/team.ts:27`
- `src/cli/services/team.ts:50`
- `src/cli/services/team.ts:55`

### 3.4 `FollowOnOutcome (src/workflow/gates.ts:862) and the client ApproveOutcome adapter` — field-add

FollowOnOutcome.kind gains four additive kinds and the 'tasks-sync' entry gains one additive field; existing kinds and fields are unchanged and consumers that do not know a kind ignore it. 'tasks-sync' gains taskSync: the full TaskSyncResult (or {error}) that the client's ApproveOutcome.tasks holds today, so close failures are not collapsed into the note. 'tracker-push' carries pushed: AutoPushResult (status and reason). 'document-attach' carries attachResult: AttachUnitResult | {skipped: string} for design.epic, design.story and plan documents (the existing 'tracker-attach' kind stays BUILD-only). 'artifact-commit' carries commit: CommitArtifactsResult. 'attach-commit' carries commit: CommitArtifactsResult. Adapter in the client: approval from the approved entry; tasks <- tasks-sync.taskSync; tracker <- tracker-push.pushed; commit <- artifact-commit.commit; attach <- document-attach.attachResult; attachCommit <- attach-commit.commit; a missing entry leaves the field absent exactly as today, and withTracker false yields only approval and tasks. Invariant it might break: ApproveOutcome (src/cli/services/workflow.ts:96) fields and their meaning stay the same (s1 bundle: client approve).

**Call sites:**
- `src/workflow/gates.ts:862`
- `src/daemon/tasks-sync.ts:56`
- `src/daemon/tracker-attach.ts`
- `src/cli/services/workflow.ts:96`
- `src/cli/services/workflow.ts:216`
- `src/daemon/handler-runtime.ts:424`

### 3.5 `Terminal client service sites (complete search of src/cli/services)` — invariant-change

Result of the search for git, gh and workflow code in the client: sites are src/cli/services/workflow.ts (approve, sync, trackerSetup, the two commitAndPushArtifacts calls, reviewArtifact and resolveFinding, whose workflow code reaches the team gates and the tracker) and src/cli/services/team.ts (refresh, claim, release, init's starter policy write stays a local file write); each is a row with its daemon method. No site: src/cli/services/approval.ts (runs no git or gh); connection-maintenance.ts (runs ps and the node entry), daemon.ts (spawns the daemon process), debug.ts (ps and the claude and codex 'mcp list' checks) and setup.ts (ollama pull) spawn programs that are not git or gh. Named exemption: src/cli/services/maintenance.ts, the daemon self-update, which runs in the client when the daemon may be down and does git checkout, merge and remote set-url; DEF revision 5 and docs/plans/tool-registry.md (s7 decision) keep it outside the registry as the one named exemption, with the self-update's git_fetch_refs and git_symbolic_ref notes left to the build check's exemption list. The site-list test asserts this list against a scan of src/cli/services.

**Call sites:**
- `src/cli/services/workflow.ts:140`
- `src/cli/services/team.ts:27`
- `src/cli/services/maintenance.ts`
- `src/cli/services/connection-maintenance.ts`
- `src/cli/services/daemon.ts`
- `src/cli/services/debug.ts`
- `src/cli/services/setup.ts`
- `src/cli/services/workflow.ts:266`
- `src/cli/services/workflow.ts:325`

## 4. Error paths

**Error cases**

- **A moved git or gh call needs approval and no client is attached, or the approval expires** (recoverable)
  - Detection: callTool returns a failed TypedToolResult with ToolFailure.kind 'denied' and its typed denial field ('declined', 'timed-out', 'no-client' or 'cancelled') instead of a value
  - Response: The replacement-table function throws ToolDenied (a gh wrapper, commit-and-push at any phase, every row); only ordinary failures keep the old result shape (GhCommandError, the CommitArtifactsResult reasons, false/null/[]/undefined for best-effort rows). The tracker push, check-in or sync stops at that call; the pipeline entry for the step is ok false with the denial. Staged paths stay staged when git_commit is denied.
  - User impact: The approval or sync shows the denial text and the step that did not run; nothing after the denied call is attempted
- **The registry tool for a wrapper returns a value that does not match the wrapper's old result shape** (terminal)
  - Detection: The tool's declared output schema check fails in the executor (k2), or the table function's mapping finds a missing field
  - Response: The call fails with the schema failure; the mapping never invents a default and the result is not passed on
  - User impact: The tracker operation reports a schema failure naming the tool; no issue, milestone or comment is written from a bad read
- **A tracker write succeeds and a later call in the same push is denied or fails** (recoverable)
  - Detection: The await of the later callTool returns a failure after earlier calls returned values
  - Response: Stop and report which objects were created and which step failed, exactly as the old sync did for a failed gh call, so a re-run finds the existing issues by label and title and does not duplicate them
  - User impact: A partial tracker state that a re-run completes
- **gh is missing, not signed in, unreachable or the command is rejected** (recoverable)
  - Detection: The tool failure kinds missing-tool, missing-signin, unreachable and rejected (never 'denied') carry the same classes as ghFailureOf maps from runGh
  - Response: The table function maps each failure kind to the old GhCommandError kind so ghAuthOk-style checks and tracker-auto behave as before
  - User impact: The same messages as today (install gh, run gh auth login, network, rejected)
- **The client's call of a new daemon method (workflow.approvePipeline, tracker.sync, tracker.setup, team.refresh, team.claim, team.release) fails: daemon not running or an older daemon without the method** (recoverable)
  - Detection: The rpc request fails or returns a method-not-found error; the client never sends withTracker to the old workflow.approve, which ignores it
  - Response: The client service reports that the daemon is missing or too old and does not fall back to running the git or workflow code itself (ac2)
  - User impact: A clear error naming the cause; the user starts or updates the daemon and retries
- **The client dies or its socket closes while the daemon is running an extended workflow.approve** (recoverable)
  - Detection: The daemon sees the stream or connection close; the approval itself was written before the follow-ons
  - Response: The daemon runs each follow-on to its end and records its result in followOn in order; the approval is not rolled back. Tracker pushes are idempotent (existing issues are found by label and title), so a repeat approve of the artifact completes them. tracker.sync is read-only against GitHub (syncTracker never edits issues, and returns 'Epic not pushed yet' when no Epic issue exists), so it does not repair missing publication. A commit made but not pushed is not retried by repeat approve (it finds nothing staged, as today); the user pushes it. Commit-and-push stops at the first failed step.
  - User impact: Approved artifact with possibly missing tracker records, which a repeat approve completes, or a local commit that is not pushed, which the user pushes; no half-written commit.
- **Async TrackerPort ripple: a caller still treats a port method as synchronous** (terminal)
  - Detection: The compiler: the method returns Promise and a use as a value does not type-check; a test that runs the site through the registry with a recorded executor fails on an unawaited call
  - Response: Every caller is awaited in the same change; a site found by the complete search without a table row fails the site-list test (ac6)
  - User impact: None at run time if caught at build; otherwise a promise object recorded instead of a result
- **git_commit succeeded and git_push is denied** (recoverable)
  - Detection: callTool returns a failed result for git_push after git_commit returned a value
  - Response: Throw ToolDenied with committed true and the push phase; make no further call.
  - User impact: The stage fails with the denial; the commit exists locally and is not pushed, and a repeat does not push it (nothing staged), so the user runs git push.
- **git_stage succeeded and git_commit is denied** (recoverable)
  - Detection: callTool returns a failed result for git_commit after git_stage returned a value (indexAfter lists the staged paths)
  - Response: Throw ToolDenied with committed false, the commit phase and the staged paths; do not unstage.
  - User impact: The stage fails with the denial; the paths remain staged.
- **A best-effort wrapper (ghCreateLabel, ghEnsureMilestone, ghCreateOrgIssueType, ghAddProjectSingleSelectField, ghAddProjectItem, ghCreateProject, ghFindProjectByTitle, ghListOrgIssueTypes, ghListRepoIssueUrls, ghFindIssueByLabels) has its call denied** (recoverable)
  - Detection: The failed result has kind 'denied' with its denial field (declined, timed-out, no-client, cancelled), not a gh failure kind
  - Response: A denial is never swallowed: the table function throws the denial so the calling stage fails (ac4). Only gh failures (missing-tool, missing-signin, unreachable, rejected) keep the old best-effort result (false, null, [] or undefined) the wrapper returned.
  - User impact: A denied optional step fails the stage instead of being silently skipped.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| commit-and-push where nothing is staged (git diff --cached --quiet exits 0) | Returns committed false with the same reason text as the old function; no commit and no push call is made |
| commit-and-push in a repository with no origin remote or a push that is rejected | committed true and pushed false with the same reason as before (a rejected push, not a denied one; a denied push throws ToolDenied) |
| gitOriginOwnerRepo on a non-GitHub remote or an SSH remote form | Same null or same owner/repo as parseGithubRemoteUrl gives today |
| A tracker push run twice with no change | The second run finds the existing issues by label and title and creates nothing (ac3) |
| A tracker push with approval mode that asks each time and the user answers yes to each call | Same issues, sub-issues, milestones, comments and labels as before the change |
| A site found by the complete search of src/cli/services that is neither a wrapper call nor a spawn but imports workflow code that spawns (for example connection-maintenance or maintenance) | It gets a row in the table, moves behind a daemon method or tools.call, and has a recorded-executor test |
| approve called on an artifact that has no tracker configured | followOn reports the tracker step as skipped, as the client did, and the check-in commit still runs |
| approve with withTracker false | Nothing is published, committed or attached (the client early return is kept); a plan approval still reconciles its Tasks |
| a repeat commit-and-push after a commit whose push was denied | Nothing staged: committed false and reason 'nothing to commit (already up to date)', as the old function; the unpushed commit is not retried |

**Invariants to preserve**

- A tool result that does not match its declared schema is a failure and is never passed on (k2). [[c2]]
- The daemon owns all state and access; the terminal client reaches it only through IPC, including approval requests (k4). [[c2]]
- A destructive call with no client attached is denied, and common calls follow the one global approval setting (k5). [[c4]]
- The old runGit, runGitAsync, runGh, commitAndPushArtifacts, the other github.ts wrappers, createGitRunner and _setTrackerExecForTests stay in place and unchanged until s9 (ac5). [[c4]]
- Tracker pushes, check-in commits and tracker records stay the same as before: the same issues, sub-issues, milestones, comments, labels and the same CommitArtifactsResult reasons (ac3). [[c3]]
- Nothing that reaches an LLM provider runs in parallel (k3); the moved calls run one after another with sequential awaits. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test-force-exit <file>), files in src/**/__tests__/*.test.ts`

**Test levels**

- **unit** — Each row of the replacement table returns the wrapper's old value and old failure kind through callTool with a recorded executor.
  - Subjects: `src/workflow/tracker/registry-table.ts: every gh wrapper row and gitOriginOwnerRepo and ghAuthOk forms`, `commitAndPushArtifactsViaRegistry: not a repo, nothing staged, committed, push rejected, denied at each step`
  - Fixtures: `recorded executor with canned tool results per tool id`, `stand-in git and gh binaries (installStandInGit, installStandInBin)`
- **integration** — Tracker push, sync, setup, question and comment-resolution flows create and update the same objects as before when run through the registry.
  - Subjects: `src/workflow/tracker/github-adapter.ts, setup.ts, sync.ts with async TrackerPort`, `questions.ts, resolve-comment.ts, team/signoff.ts commit-and-push sites`, `daemon methods workflow.approvePipeline, tracker.sync, team.refresh, team.claim, team.release in the handler runtime`
  - Fixtures: `recorded executor that records the sequence of tool calls`, `temporary git repository with a bare origin`
- **contract** — The client services call only daemon methods and spawn nothing; the site list is complete.
  - Subjects: `src/cli/services/workflow.ts and team.ts with a fake rpc: no child_process import, one daemon method per operation`, `a site-list test that greps src/workflow and src/cli/services for wrapper calls and spawns and checks each has a table row and a test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `registry-table.test.ts: every wrapper row returns the old value and failure kind through callTool`, `commit-and-push-registry.test.ts: same CommitArtifactsResult and reasons as the old function for each case`, `commit-and-push-registry.test.ts: a real local commit followed by a denied git_push throws ToolDenied with committed true, and a non-denial push failure returns committed true, pushed false; a repeat call with no staged changes returns the old nothing-to-commit reason; an empty staged diff is nothing and a failed git_diff is a failure`, `registry-table.test.ts: ghAuthOk form returns {ok:true} and {ok:false, reason} as tracker-auto.ts reads them`, `registry-table.test.ts: one case per row of the table, including best-effort rows (false, null, [] and undefined on a gh failure) and the rule that a denial is thrown, never swallowed`, `commit-and-push-registry.test.ts: denied git_commit after git_stage throws ToolDenied and leaves the paths staged (index contents checked)`, `commit-and-push-registry.test.ts: mixed existing and missing paths stage only the existing ones; all-missing paths return the no-files reason and make no git_stage call`, `adapter-registry.test.ts: assignee read, set and add (with the re-read checks), signoff pull request list, create and view rows return the same results and errors as before, and a denial escapes attempt()`, `pr-view-fields.test.ts: gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews, and readSignoffState gives the same state for both the plain and the since paths`, `commit-and-push-registry.test.ts: denial at each phase throws ToolDenied with the phase, committed flag and staged paths; nothing is returned in the result for a denial`, `git-push-configured.test.ts: git_push with configured true runs plain git push and uses an alternate push remote, a differently named upstream branch and reports a missing upstream the way the old helper did; existing calls are unchanged; commit-and-push-registry.test.ts covers the same three configurations`, `attach-tracked-check.test.ts: a tracked file passes, an untracked file (empty files list) is refused with the old reason` |
| `ac2` | `cli-services-no-spawn.test.ts: approve, sync, team refresh/claim/release call only rpc and import no child_process or workflow tracker/git code`, `handler-runtime.test.ts: new daemon methods are registered and return the old results`, `cli-services-no-spawn.test.ts: sync passes repoPath and epicHash, teamRefresh passes branch, teamClaim and teamRelease pass the unit, trackerSetup passes its options to the named daemon methods (tracker.sync, team.refresh, team.claim, team.release, tracker.setup); approve passes withTracker and overrideReview`, `command.test.ts: sync, claim and release results are awaited before status and text are read`, `workflow-approve-followon.test.ts: the three additive follow-on kinds carry their payloads, the client adapts them to ApproveOutcome, and withTracker false stops after approval and Task reconciliation`, `workflow-approve-pipeline.test.ts: withTracker false stops after approval and Task reconciliation (no push, commit or attach); withTracker true publishes exactly once for a plan approval (no second push from the tasks-sync follow-on); a denial at publication stops the check-in commit and attach`, `workflow-approve-adapter.test.ts: the client adapter rebuilds ApproveOutcome losslessly from the follow-on entries, including TaskSyncResult with close failures, AttachUnitResult errors and skipped reasons, and both commit results`, `cli-services-daemon-errors.test.ts: an older daemon (method-not-found) and a daemon that is not running give a clear error with no local fallback; a socket closed during the follow-ons leaves the approval recorded and the daemon finishes the pipeline`, `workflow-approve-versioning.test.ts: against the existing handler (which accepts workflow.approve and ignores withTracker) the client uses only workflow.approvePipeline; a daemon without it gives the method-not-found error and no publication happens`, `cli-services-sites.test.ts: the scan of src/cli/services finds exactly the rows above (two sites, one named exemption, five no-site files)`, `ipc-client-close-aware.test.ts: rpc with closeAware rejects when the socket closes before a reply, sets no timer, and rpc without it is unchanged`, `review-resolve-daemon.test.ts: with claims enforced, reviewArtifact and resolveFinding run through workflow.reviewArtifact and workflow.resolveFinding, return the old results and refusals, and command.ts awaits both` |
| `ac3` | `tracker-push-registry.test.ts: a push, sync, setup, question and comment resolution create the same objects and records as the recorded legacy sequence`, `second run creates nothing`, `team-gates-async.test.ts: teamGate, claim, release, authorizeApproval, authorizeFindingApply, reviewFixModeFor, assertMayAuthor, assertMayBuild, parkPlan and resumeCheck return the same outcomes and refusals as before with an async port, and every refusal still raises where it did`, `tasks-sync-async.test.ts: withdrawn-Task close through an async CloseIssue reports ok and gh failure as before, and a denial fails the reconciliation stage`, `no-floating-promises.test.ts: the compiler-API scan finds no unawaited TrackerPort, IssueOps, CloseIssue or loader call`, `adapter-registry.test.ts: a denied link comment after pull request creation fails the stage and a retry reuses the open pull request; conversion-failed, schema-mismatch and command timed-out throw even in best-effort rows`, `unit-extras.test.ts: runUnitExtras with async steps and async comments runs the steps in order and reconciles comments as before`, `adapter-attempt.test.ts: async attempt keeps the conversion of non-denial exceptions to kind rejected and rethrows ToolDenied` |
| `ac4` | `registry-denial.test.ts: no-client, declined, timed-out and cancelled approval deny a moved call, the stage fails with the denial and later calls are not made`, `tracker-denial.test.ts: a denial at a milestone extra, at a comment extra and at the link comment stops the publication with later calls forbidden (recorded executor fails on any further call), keeps the created issue bindings, and the pipeline reports tracker-push ok false with the denial and runs no check-in commit`, `sync-plan-tasks-denial.test.ts: through the real syncPlanTasks wrapper a denied close of a withdrawn Task escapes as ToolDenied, the tasks-sync entry is ok false with the denial, and no tracker push or later pipeline step runs`, `commit-denial-callers.test.ts: a denied commit-and-push makes questions.ts commitAndComment post no comment and fail, and makes handleResolveComment return the error result with the recorded count (never success); ordinary git failures are still logged and the stage continues`, `task-set-denial.test.ts: syncOnPlanApproval rethrows ToolDenied carrying the partial reconciliation arrays; ordinary errors still return {error}; the pipeline tasks-sync entry holds the partial arrays and skips publication`, `team-gates-denial.test.ts: a denial inside actingUser, teamGate, claim, release, reviewFixDecision, reviewFixModeFor and authorizeStageChange stops the stage as ToolDenied and is never undefined, a generic refusal or report-only; a non-denial port failure keeps its old outcome`, `task-set-denial.test.ts: after a denied close the Task has a pending-close log entry and the next reconciliation closes the still-open issue`, `identity-draft-denial.test.ts: a denial inside idOf, resolveLearner and ensureDraftIssues stops the stage as ToolDenied, with no fallback identity, no unavailable status and no not-ready result; a non-denial failure keeps the old fallback` |
| `ac5` | `old-paths-unchanged.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the other wrappers, createGitRunner and _setTrackerExecForTests are still exported and the scan stays in report mode` |
| `ac6` | `site-list.test.ts: every site from the complete search has a table row and a registry test; the migration record lists the rows`, `site-list.test.ts: the 31 gh wrapper names in the table equal the gh exports of src/workflow/tracker/github.ts; every caller named in the TrackerPort propagation list awaits` |

## 6. Migration

**State before:** The tracker (github-adapter, setup, sync), questions, resolve-comment, signoff, tracker-auto and config/github call the synchronous github.ts wrappers, which shell out through the swappable _exec (github.ts:25-31); commitAndPushArtifacts runs git directly. The terminal client's approve (src/cli/services/workflow.ts:216), sync (:413) and team refresh/claim/release (src/cli/services/team.ts:27, :50, :55) run tracker, check-in and team code in the client process. The daemon's workflow.approve (src/daemon/handler-runtime.ts:424) runs only the bugfix advance, tasks sync and tracker attach follow-ons.

**State after:** The tracker sites and the five commit-and-push callers call registry tools through callTool from one replacement-table module, with async TrackerPort methods. The client's approve, sync, team refresh, claim and release call daemon methods (workflow.approvePipeline, tracker.sync, team.refresh, team.claim, team.release) and run no git, gh or workflow code. The old wrappers, runGit, runGitAsync, runGh, commitAndPushArtifacts, createGitRunner and _setTrackerExecForTests stay in place unused by these sites for Story s9.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Complete the site search (the callers of the github.ts wrappers, the five commit-and-push callers, every src/cli/services file that spawns git or gh or imports workflow code that does) and write the replacement table with one row per wrapper and per site, naming the tool or op and the result and failure mapping; mark any wrapper with no tool of the right shape as a gap and resolve it. — ↩ rollbackable
2. Add the replacement-table module in the daemon (tool calls through callTool with caller workflow, failure kinds mapped to the old classes) and the registry-based commit-and-push sequence, each with recorded-executor tests; change nothing that calls them yet. — ↩ rollbackable
3. Make the TrackerPort methods asynchronous and move github-adapter, setup, sync, questions, resolve-comment, signoff (check-in commit), tracker-auto, config/github, bugfix/tracker, config/github-store and attach.ts onto the table module, awaiting every caller; update the exec-seam tests to the recorded executor. — ↩ rollbackable
4. Add the daemon methods tracker.sync, team.refresh, team.claim and team.release and add the versioned daemon method workflow.approvePipeline (workflow.approve delegates to it with withTracker true) with the tracker auto-push, the artifact check-in commit and the attached-document commit, each reported in followOn, with their handler tests. — ↩ rollbackable
5. Change the client's approve, sync, trackerSetup and team services to call those daemon methods only and delete their local git, gh and workflow code paths; add the no-spawn contract test for src/cli/services. — ↩ rollbackable
6. Write the migration record rows, run the old-paths-unchanged test and the site-list test, and confirm the forbidden-spawn scan is still in report mode. — ↩ rollbackable

**Backward compat:** The terminal client and daemon ship together from one checkout, but a client talking to an older daemon without the new methods fails with a clear error and does not fall back to local git (ac2). workflow.approve (which delegates to workflow.approvePipeline with withTracker true) gains follow-on entries (tracker push, check-in commit, attach), so MCP callers of insrc_workflow_approve also see them; existing follow-on fields are unchanged. The old github.ts exports stay, so any caller outside this Story keeps working until s9.

## 7. Alternatives considered

### 7.1 a1: Run the git and gh flows in the daemon: the client asks for the whole operation — **CHOSEN**

The terminal client stops running tracker, check-in and team code; it calls daemon methods for the whole operation, and every site inside the daemon calls the registry through callTool.

Inside the daemon, the tracker (github-adapter, setup, sync), questions, resolve-comment, signoff, tracker-auto, config/github and attach call the registry through callTool with caller 'workflow' (the async git-ops facade from s9's design is not available yet, so s10 adds the small async layer it needs: a tracker tool-call module with the replacement table, mapping each of the 38 wrappers and commitAndPushArtifacts to a registry tool with the wrapper's old result and failure shape). The client's approve, sync, team refresh, claim, release and init become calls of daemon methods: workflow.approve is extended to run the tracker push, the check-in commit and the attach follow-on that the client runs today, tracker.sync and team.refresh/team.claim/team.release are new methods, and the client prints what the daemon returns. The TrackerPort methods become async and so do their callers in the daemon; the client services stay thin. The old wrappers stay in place unused by these sites (s9 deletes them).

### 7.2 a2: One async tool-call port with two transports; code stays where it runs

Rewrite the wrappers once over an async port that is callTool inside the daemon and the tools.call request in the client; the approval flow and team code keep running where they run today.

Define one small async interface (call a registry tool definition with an input and get its typed result) with two implementations: in the daemon it calls callTool with caller 'workflow', and in the terminal client it opens a tools.call stream. The 38 wrappers and commitAndPushArtifacts are rewritten once over that port (keeping their results and failure kinds), so github-adapter, setup, sync, questions, resolve-comment, signoff, tracker-auto, config/github, attach, the client's approve and the client's team refresh each keep their flow but become async and use the port of the process they run in. No new daemon method is added except where a flow needs workflow code the client cannot run.

**Rejected because:** Violates ac2 because workflow code keeps running in the client, and has a half-done-flow risk (ac4 partial).

### 7.3 a3: Per-site rewrite, no shared layer

Each site calls callTool (daemon) or tools.call (client) itself and maps the result to the old value.

Each of the 38 wrappers' call sites and the client services is rewritten to build its own tool input, call the registry (callTool in the daemon, tools.call in the client) and map the typed result and failure to what the site used before; there is no shared mapping module.

**Rejected because:** No shared layer: duplicated mapping and transports, and it violates ac2.

## 8. References

- **[[c1]]** `code` `src/workflow/tracker/github.ts:25` — "all 45 exports run synchronously through the swappable _exec"
- **[[c2]]** `convention` `CLAUDE.md#key-architectural-rules` — "Daemon owns all DB access; accuracy is primary"
- **[[c3]]** `analyze-bundle` `src/cli/services/workflow.ts:216` — "approve runs the whole approval in the client process"
- **[[c4]]** `stakeholder` `docs/plans/tool-registry.md#s10-lands-before-s9-decided-2026-10-27` — "s10 lands before s9; old paths stay unchanged until s9"

## 9. Open questions

- cd1 (partial): commitAndPushArtifactsViaRegistry, tracker.sync, team.refresh, team.claim, team.release and the replacement-table module are new names this Story creates; the table module's file path and the exact tool or op for each of the 38 wrappers (for example ghFindProjectByTitle, ghAddProjectSingleSelectField, ghEnsureMilestone) are fixed in the tasks.
- ep3 (partial): only the old-wrappers and async-port invariants are directly shown by s1 bundles; the others rest on epic constraints k2 to k5.
- sbdry4 (partial): test file names in the test strategy are proposals, not existing files.
- src/workflow/tracker/attach.ts:55 and the signoff commit-and-push are taken by s10; the three runGit calls in src/workflow/team/signoff.ts stay with s9.
- ac5 scope transfer: the DEF criteria that delete the old paths and run the scan in failing mode were moved to s9 by DEF revision 6 (approved 2026-10-27, user decision 'option 1'); this LLD relies on that approved revision, and docs/plans/tool-registry.md is updated to record it as settled.
- Retry of a push that failed after a commit is not designed here (as today); if wanted it is a separate Story.
- Overlap with s9: the async propagation edits daemon files s9 also edits (src/daemon/workflow-rpc.ts and the step phases). s10 lands first; s9's second draft is written against the awaited signatures.
- A tool lacking a field a wrapper returns is fixed inside this Story only when no other Story owns that tool; otherwise it is a back-flow. Known now: gh_pr_view lacks the review fields (extended here).
- gh_pr_view is extended additively here (jsonFields allowlist) because readSignoffState needs mergedAt, reviewDecision and reviews; the owner of s5 can object, in which case the field list moves to a back-flow before the build.
- git_push gains the additive input configured here, and the owner of s4's tools can object; in that case the push parity moves to a back-flow before the build.
- Approved with an override after 12 review rounds in 3 cycles (last round 1 HIGH: the identity and draft-issue denial catches, added to the design afterward and not re-reviewed).

## Resolved questions

- `q4cbb87cb` — cd1 (partial): commitAndPushArtifactsViaRegistry, tracker.sync, team.refresh, team.claim, team.release and the replacement-table module are new names this Story creates; the table module's file path and the exact tool or op for each of the 38 wrappers (for example ghFindProjectByTitle, ghAddProjectSingleSelectField, ghEnsureMilestone) are fixed in the tasks.
  - **resolved**: Task-defined mapping — The LLD lists every row; the plan's first task fixes the table file path. _(2026-10-27T14:35:51.497Z)_
- `qfac4af4e` — ep3 (partial): only the old-wrappers and async-port invariants are directly shown by s1 bundles; the others rest on epic constraints k2 to k5.
  - **resolved**: Plan explicit verification — One task checks the invariants resting on k2-k5 against the code. _(2026-10-27T14:38:04.394Z)_
- `q54a04be8` — sbdry4 (partial): test file names in the test strategy are proposals, not existing files.
  - **resolved**: Resolve names during planning — Each test maps to an existing file or a named new file. _(2026-10-27T14:40:12.116Z)_
- `qf649066e` — src/workflow/tracker/attach.ts:55 and the signoff commit-and-push are taken by s10; the three runGit calls in src/workflow/team/signoff.ts stay with s9.
  - **resolved**: Keep the stated split _(2026-10-27T14:42:09.048Z)_
- `qd5acbe72` — ac5 scope transfer: the DEF criteria that delete the old paths and run the scan in failing mode were moved to s9 by DEF revision 6 (approved 2026-10-27, user decision 'option 1'); this LLD relies on that approved revision, and docs/plans/tool-registry.md is updated to record it as settled.
  - **resolved**: Honor the approved transfer — User decision, DEF revision 6. _(2026-10-27T14:43:53.674Z)_
- `q24b15e66` — Retry of a push that failed after a commit is not designed here (as today); if wanted it is a separate Story.
  - **resolved**: Defer push retry _(2026-10-27T14:45:21.749Z)_
- `q126d577f` — Overlap with s9: the async propagation edits daemon files s9 also edits (src/daemon/workflow-rpc.ts and the step phases). s10 lands first; s9's second draft is written against the awaited signatures.
  - **resolved**: Update s9 after s10 lands — User decision: s10 lands first. _(2026-10-27T14:46:37.184Z)_

## Citations

- **[[c1]]** `code` `src/workflow/tracker/github.ts:25` — "all 45 exports run synchronously through the swappable _exec"
- **[[c2]]** `convention` `CLAUDE.md#key-architectural-rules` — "Daemon owns all DB access; accuracy is primary"
- **[[c3]]** `analyze-bundle` `src/cli/services/workflow.ts:216` — "approve runs the whole approval in the client process"
- **[[c4]]** `stakeholder` `docs/plans/tool-registry.md#s10-lands-before-s9-decided-2026-10-27` — "s10 lands before s9; old paths stay unchanged until s9"
