<!-- insrc:artifact PLAN-b7a68147dcf72034-s9 -->

# Plan: STORY-b7a68147dcf72034-s9

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1793530094046-gzr6ly`
**LLD effective hash:** `9fcc90f081df...`

Story s9 moves the remaining 24 direct git, gh and shell call sites in 17 files onto the one tool registry, so every call is approved, signalled and recorded through callTool. The work first audits the replacement table against the live tool schemas and builds the few missing read-only git tools and inputs, then adds one git-calls helper module and flips the team policy, refresh, signoff, handoff, build-runner, validation, ignore-filter, corpus and identity sites to it, widening their consumers first so the tree stays green. It ends by moving 32 test files off the exec seam, deleting the old runners and seams, turning the forbidden-spawn scan into a failing build step, and running the full sweep once.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Audit every replacement row against the live tool input schemas | M | approved r1 | — | unit: audit-rows.test.ts: every replacement row names its tool and op and says covered or names the missing input | [[c2]] [[c5]] |
| 2 | **`t2`** Build the missing git tools and inputs | L | approved r1 | `t1` | integration: git-diff-tree.test.ts: git_diff_tree lists the changed paths of a commit in a real temporary repository; integration: git-merge-tree.test.ts: git_merge_tree reports a clean and a conflicting merge in a real temporary repository; unit: git-added-inputs.test.ts: the optional type of git_hash_object and gitPath of git_rev_parse leave existing calls unchanged | [[c1]] [[c5]] |
| 3 | **`t24`** Build the six additive git inputs found by the audit (g5 to g10) | M | — | `t1` | integration: git-status-paths.test.ts: git_status limits its result to the given paths and lists each untracked file with untrackedFiles all; integration: git-ls-tree-full-tree.test.ts: git_ls_tree fullTree lists from the repository root when cwd is a subdirectory; integration: git-log-first-parent.test.ts: git_log firstParent leaves out the commits merged in from a side branch; integration: git-rev-list-parents.test.ts: git_rev_list parents returns each commit with its parent shas; integration: git-worktree-start-point.test.ts: git_worktree add with createBranch starts the new branch at startPoint; integration: git-diff-against-worktree.test.ts: git_diff againstWorktree compares a rev with the working tree | [[c1]] [[c5]] |
| 4 | **`t3`** The git-calls helper module | M | approved r1 | `t2`, `t24` | unit: git-calls.test.ts: each helper calls its tool through callTool with the caller 'workflow', the site's signal and approval mode; unit: git-calls.test.ts: each failure kind maps to the site fallback or GitCallFailed and a denial with each reason is thrown as ToolDenied | [[c1]] [[c3]] |
| 5 | **`t4`** Deadline with an abort signal | S | approved r1 | `t3` | unit: deadline.test.ts: createDeadline aborts its signal at the budget and dispose clears the timer; unit: sighting-store.test.ts: the lock-lifetime reasoning still holds (the lock lifetime is greater than REFRESH_DEADLINE_MS plus the stop time) | [[c1]] [[c2]] |
| 6 | **`t5`** Widen PolicyReader and await it at its readers | M | approved r1 | `t3` | unit: no-floating-promises.test.ts: the PolicyReader readers await the widened return | [[c2]] [[c5]] |
| 7 | **`t6`** Widen the callers of the synchronous runners | M | approved r1 | `t3` | unit: no-floating-promises.test.ts: the callers of the runners await the widened return | [[c2]] [[c5]] |
| 8 | **`t7`** Team policy reader, anchor finder and sighting store onto the tools | L | approved r1 | `t4`, `t5` | integration: team-policy-registry.test.ts: policyReader and findAnchor run through the registry on not a repo, no remote, detached HEAD, shallow, valid policy and invalid policy; integration: team-policy-parity.test.ts: policyReader and findAnchor equal the old functions on the same repositories | [[c1]] [[c2]] [[c4]] |
| 9 | **`t8`** Refresh onto the tools with the deadline signal | M | approved r1 | `t7` | integration: refresh-deadline.test.ts: with a stand-in git that sleeps, the refresh fails with the deadline message at 10 s, starts no call after it, and the process group of the running call is gone within 2 s; integration: refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial and starts no later call | [[c1]] [[c3]] [[c4]] |
| 10 | **`t9`** Signoff and branch resolution onto the tools | M | approved r1 | `t7`, `t8` | integration: team-policy-registry.test.ts: the signoff branch checks run through the registry and equal the old results; integration: team-policy-parity.test.ts: signoff currentBranchOf and branch-resolution equal the old functions on the same repositories | [[c1]] [[c2]] [[c4]] |
| 11 | **`t10`** Handoff onto the tools | M | approved r1 | `t7`, `t8` | integration: team-policy-registry.test.ts: the handoff drafts, park plan and resume checks run through the registry and equal the old results; integration: team-policy-parity.test.ts: the handoff git reads equal the old functions on the same repositories | [[c1]] [[c2]] [[c4]] |
| 12 | **`t11`** Build range base, standalone record and the gate's head sha | L | approved r1 | `t3`, `t6` | integration: build-runners-registry.test.ts: resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, headFullSha, headShortSha and priorCommit run through the registry on real repositories; integration: build-runners-parity.test.ts: range base, build start stamp and standalone record return the old values and write the same records | [[c1]] [[c2]] [[c4]] |
| 13 | **`t12`** Story commits and changed files | L | approved r1 | `t2`, `t11` | integration: build-runners-registry.test.ts: storyChangeSet, newestStoryCommit, mergeInProgress and collectDiff run through the registry including a merge commit, a squash and an empty Story; integration: build-runners-parity.test.ts: storyChangeSet and mergeInProgress equal the old results | [[c1]] [[c2]] [[c4]] |
| 14 | **`t13`** Validation checks | M | approved r1 | `t3`, `t6` | integration: validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files | [[c1]] [[c2]] [[c4]] |
| 15 | **`t14`** Ignore filter, companion header and convert plan | M | approved r1 | `t3`, `t6` | integration: ignore-filter-header-plan-registry.test.ts: createRepoIgnoreFilter, defaultGitUserName and the convert plan reads run through the registry, with names containing spaces and newlines, a non-git directory and a git failure | [[c1]] [[c2]] [[c3]] [[c4]] |
| 16 | **`t15`** Design corpus reader | M | approved r1 | `t3` | integration: corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file | [[c1]] [[c2]] [[c4]] |
| 17 | **`t16`** Identity lookup | M | approved r1 | `t3` | integration: identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup, and on a gh without auth status --json the recorded behaviour holds | [[c1]] [[c2]] [[c4]] |
| 18 | **`t17`** Denial across the moved sites | M | approved r1 | `t7`, `t8`, `t9`, `t10`, `t11`, `t12`, `t13`, `t14`, `t15`, `t16` | integration: registry-denial-s9.test.ts: for each group of sites and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made; integration: registry-denial-s9.test.ts: a destructive-class call with no client is denied on a moved site | [[c3]] [[c4]] |
| 19 | **`t18`** Move the tracker tests off the exec seam and legacy table | M | approved r1 | `t7`, `t8`, `t9`, `t10`, `t14`, `t16` | integration: the migrated tracker test files pass on the stand-in binaries and none imports the exec seam or the legacy table | [[c2]] [[c4]] [[c5]] |
| 20 | **`t19`** Move the workflow tests off the exec seam and legacy table | L | approved r1 | `t8`, `t9`, `t10`, `t11`, `t12`, `t13`, `t14`, `t15` | integration: the migrated workflow test files pass on the stand-in binaries and none imports the exec seam or the legacy table | [[c2]] [[c4]] [[c5]] |
| 21 | **`t20`** Move the daemon and cli tests off the exec seam and legacy table | M | approved r1 | `t16`, `t18`, `t19` | integration: the migrated daemon and cli test files pass on the stand-in binaries and none of the 32 files imports the exec seam or the legacy table | [[c2]] [[c4]] [[c5]] |
| 22 | **`t21`** Delete the old paths and make the scan fail the build | M | approved r1 | `t17`, `t20` | unit: old-paths-removed.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary and _setTrackerExecForTests are not exported and the files are gone; unit: build-script.test.ts: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions | [[c1]] [[c5]] |
| 23 | **`t22`** Migration record and scans | M | approved r1 | `t21` | unit: migration-record.test.ts: docs/plans/tool-registry-migration-record.md lists every table row and every moved site with its test; unit: site-list.test.ts: every site of the replacement table is a row with a tool and a registry test, and the scan finds none outside the exemptions; unit: no-floating-promises.test.ts: the git-calls helpers and the moved functions are awaited | [[c2]] [[c4]] |
| 24 | **`t23`** Session source inventory, full sweep and outcome record | M | approved r1 | `t22` | integration: session-source-inventory.test.ts passes against the regenerated fixture; integration: the full sweep (foreground, per area, --test-force-exit) compared by test name with the checkout before s9: no new failure and no new skipped test | [[c4]] [[c5]] |

### 1.1 TASK-b7a68147dcf72034-s9-t1 — Audit every replacement row against the live tool input schemas

For each site in the LLD's replacement table read the git or gh tool's input and output schema and record whether the op carries every option the site uses. Write the result as the first draft of section 5 of docs/plans/tool-registry-migration-record.md (site, tool, op, gap or none). The audit covers all rows, not only the known gaps (git_diff_tree, git_merge_tree, git_hash_object type, git_rev_parse gitPath, git_status path filter, the diff name-only forms), and settles how each site that needs a path list gets it. The gap list it produces is final.

**Acceptance checks:**
- a table with one row per site names its tool and op and says 'covered' or names the missing input
- every gap is either in the list of tools t2 builds or is covered by deriving the value from an existing result, with the reason
- the audit is checked by reading the tool definitions, not from memory
- the gap list is stated as final; any gap beyond the four known additions becomes a further task inserted before t3 by a plan amendment, not growth of t2

### 1.2 TASK-b7a68147dcf72034-s9-t2 — Build the missing git tools and inputs

Add the read-only tools git_diff_tree and git_merge_tree, an optional type input on git_hash_object, an optional gitPath input on git_rev_parse, each with output schemas, approval class none, tests and an entry in the tool definitions list; update the coverage table so the s8 slots for diff-tree and merge-tree are marked built by s9. Existing calls of these tools are unchanged. Gaps beyond these four found by t1 are separate tasks, not part of t2.

**Acceptance checks:**
- git_diff_tree and git_merge_tree are registered, typed (satisfies TypedTool) and run against real temporary repositories in their tests
- the added inputs are optional and the existing snapshot-compat and approval-class tests pass unchanged
- coverage.ts marks diff-tree and merge-tree as built by s9

### 1.3 TASK-b7a68147dcf72034-s9-t24 — Build the six additive git inputs found by the audit (g5 to g10)

Add the optional inputs the t1 audit found missing, each leaving existing calls unchanged, with approval class unchanged and its own test, flagged for the tool owner: git_status `paths` and `untrackedFiles` (all); git_ls_tree `fullTree`; git_log `firstParent`; git_rev_list `parents` (the data gains the parent shas of each commit); git_worktree add `startPoint`; git_diff `againstWorktree` (git diff <from>). Plan amendment of 2026-11-01, made because the audit found six gaps beyond the four t2 builds.

**Acceptance checks:**
- each of g5 to g10 is an optional input; every existing call of the six tools returns what it returned before and the snapshot-compat and approval-class tests pass unchanged
- each input is covered by a test against a real temporary repository
- section 5 of the migration record marks g5 to g10 as built by t24

### 1.4 TASK-b7a68147dcf72034-s9-t3 — The git-calls helper module

Add src/workflow/git-calls.ts with the helpers the sites use (revParse, catFileExists, lsFiles, pathHistory, configGet, lsRemote, fetchRefs, forEachRef, remoteUrl, statusPaths, rootCommits and those t1 adds) built on run/must/soft and workflowToolDeps of src/workflow/tracker/registry-table.ts, plus GitCallFailed. Each helper takes the site's cwd, signal, timeout and approval mode and returns the plain value the old code used; a denial is thrown as ToolDenied and a schema or conversion failure is thrown, never a fallback.

**Acceptance checks:**
- each helper calls its tool through callTool with the caller 'workflow' and the site's signal and approval mode
- each tool failure kind maps to the site fallback or to GitCallFailed as the LLD's error paths say; a denial with each reason is thrown as ToolDenied
- no helper has a catch that swallows ToolDenied

### 1.5 TASK-b7a68147dcf72034-s9-t4 — Deadline with an abort signal

Give the Deadline of the refresh an AbortSignal and dispose(), moving createDeadline next to REFRESH_DEADLINE_MS in src/workflow/team/sighting-store.ts while the old runGitAsync still exists. The signal aborts when the budget is spent; remainingMs() and the 10 second default are unchanged.

**Acceptance checks:**
- the signal aborts at the budget and dispose clears the timer
- REFRESH_DEADLINE_MS is still 10 seconds and the sighting-store lock tests pass unchanged

### 1.6 TASK-b7a68147dcf72034-s9-t5 — Widen PolicyReader and await it at its readers

While the producers are still synchronous, widen PolicyReader to return a value or a Promise and add awaits at its seven production readers (gate.ts, signoff.ts, tracker-auto.ts, draft-issues.ts, daemon/repo-settings.ts and the two in gate.ts). Audit the callers of PolicyReader for use of opts.signal and record whether it stays. Awaiting a plain value is harmless, so the tree stays green.

**Acceptance checks:**
- tsc is clean and the existing tests of the touched modules pass unchanged
- the audit of opts.signal is written in the commit message and the type keeps or drops it accordingly
- the compiler-API no-floating-promises scan passes

### 1.7 TASK-b7a68147dcf72034-s9-t6 — Widen the callers of the synchronous runners

While the producers are still synchronous, make the call sites of range-base, story-commits, standalone-record, validation-checks, repo-ignore-filter, the companion header, the convert plan and gates accept a Promise (await at each caller), so the later moves can flip each function to async without breaking the tree.

**Acceptance checks:**
- tsc is clean and the existing tests of the touched modules pass unchanged
- the compiler-API no-floating-promises scan passes

### 1.8 TASK-b7a68147dcf72034-s9-t7 — Team policy reader, anchor finder and sighting store onto the tools

Move policyReader (probeGitRepo, probeRemote, probeRemoteHead, resolveRev, readAt, scanForPolicy), findAnchor (git_rev_parse isShallow and git_path_history) and resolveRepoIdentity onto git-calls; PolicyReader and findAnchor become async. Results and failure texts equal the old ones on the same repository.

**Acceptance checks:**
- team-policy-registry.test.ts runs the reader and the anchor finder through the registry on real temporary repositories (not a repo, no remote, detached HEAD, shallow, valid and invalid policy)
- team-policy-parity.test.ts shows the new results equal the old functions' results on the same repositories
- no runGit call remains in policy-reader.ts, anchor-finder.ts and sighting-store.ts

### 1.9 TASK-b7a68147dcf72034-s9-t8 — Refresh onto the tools with the deadline signal

Move refreshPolicy (ls-remote and fetch or fetch-refs, defaultLocalGit) onto git_ls_remote and git_fetch under one Deadline: each call takes timeoutMs from remainingMs() and the deadline signal, no call starts after the budget is spent, an outer opts.signal is combined, and a denial or cancellation ends the refresh at the first call. The injectable git seam of RefreshOptions receives the Deadline.

**Acceptance checks:**
- refresh-deadline.test.ts: a stand-in git that sleeps makes the refresh fail with the deadline message at 10 seconds, no later call starts, and the running call's process group is gone within 2 seconds
- refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial
- sighting-store.test.ts: the lock-lifetime reasoning still holds

### 1.10 TASK-b7a68147dcf72034-s9-t9 — Signoff and branch resolution onto the tools

Move signoff.ts currentBranchOf and branch-resolution.ts (default git seam) onto git-calls; the functions become async where they were sync and their callers (the gate) await.

**Acceptance checks:**
- the existing signoff and branch-resolution tests pass with awaits added
- team-policy-registry.test.ts covers the branch checks against real repositories and the old results
- no runGit call remains in signoff.ts and branch-resolution.ts

### 1.11 TASK-b7a68147dcf72034-s9-t10 — Handoff onto the tools

Move handoff.ts (unitDraftFiles, committedAtHead, parkPlan, repositoryIdOf, resumeCheck, and its git() runner built on runGitAsync with PARK_GIT_MS) onto git-calls and the Deadline; the functions become async where they were sync and the workflow-step park and resume phases and the daemon handoff rpc await them.

**Acceptance checks:**
- the existing handoff, park and resume tests pass with awaits added
- team-policy-registry.test.ts covers the draft listing, the park plan and the resume check against real repositories and the old results
- no runGit or runGitAsync call remains in handoff.ts

### 1.12 TASK-b7a68147dcf72034-s9-t11 — Build range base, standalone record and the gate's head sha

Move range-base.ts (commitExists, headFullSha, introducingCommit, resolveStoryRangeEnd, readBuildStart, stampBuildStart, resolveStoryRangeBase), standalone-record.ts (headShortSha, priorCommit) and gates.ts headFullSha onto git-calls, make them async and fix their callers (validate.ts, implement.ts, completion-record.ts and the code-review subject code).

**Acceptance checks:**
- build-runners-registry.test.ts runs each function through the registry on real repositories
- build-runners-parity.test.ts shows the same values and the same written records as the old functions
- no execFileSync call remains in range-base.ts, standalone-record.ts and gates.ts

### 1.13 TASK-b7a68147dcf72034-s9-t12 — Story commits and changed files

Move story-commits.ts (git(), scanTrailers, newestStoryCommit, storyChangeSet, mergeInProgress) onto git_log, git_rev_list, git_rev_parse, git_hash_object, git_diff_tree, git_diff, git_merge_tree and the gitPath input built in t2, and change changed-files.ts collectDiff to callTool(gitDiffTool, ...) instead of execute. The functions become async and their callers await.

**Acceptance checks:**
- build-runners-registry.test.ts covers the Story change set on real repositories including a merge commit, a squash and an empty Story
- build-runners-parity.test.ts shows storyChangeSet and mergeInProgress equal the old results
- collectDiff runs through the executor (a declined approval fails the stage)

### 1.14 TASK-b7a68147dcf72034-s9-t13 — Validation checks

Move validation-checks.ts trackedFiles, changedFiles and trivialCheckPlan onto git_ls_files and git_diff (with the path list derived from the result as t1 decided) and make them and their callers async.

**Acceptance checks:**
- validation-checks-registry.test.ts runs the three functions on real repositories and returns the old file lists, including deleted files and untracked files
- no execFileSync call remains in validation-checks.ts for git

### 1.15 TASK-b7a68147dcf72034-s9-t14 — Ignore filter, companion header and convert plan

Move createRepoIgnoreFilter (git_ls_files cached and others, degrading to the permissive filter on any ordinary failure), defaultGitUserName (git_config) and convert/plan.ts git reads onto git-calls and make them and their callers async.

**Acceptance checks:**
- ignore-filter-header-plan-registry.test.ts covers file names with spaces and newlines, a non-git directory and a git failure for the filter, the OS-user fallback for the header, and the convert plan's reads
- no execFileSync call remains in the three files

### 1.16 TASK-b7a68147dcf72034-s9-t15 — Design corpus reader

Replace createGitRunner and runGitBinary in src/design/corpus/sources/git-reader.ts with git_cat_file revs, git_ls_tree and git_show, keeping the reader's public options, validation results and error codes.

**Acceptance checks:**
- corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file
- createGitRunner and runGitBinary are no longer used by the reader

### 1.17 TASK-b7a68147dcf72034-s9-t16 — Identity lookup

Move src/understanding/identity.ts onto gh_auth (status and hosts), gh_tracker (user_by_host) and git_config, keeping the multi-host and multi-account results and the recorded older-gh behaviour; a denial is thrown, not an 'unavailable' provider.

**Acceptance checks:**
- identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup, and the older-gh case gives the recorded behaviour
- no runShell call remains in identity.ts

### 1.18 TASK-b7a68147dcf72034-s9-t17 — Denial across the moved sites

Add registry-denial-s9.test.ts: for each group of moved sites (team policy, refresh, signoff, handoff, build runners, validation checks, ignore filter and header and plan, corpus reader, identity) and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made.

**Acceptance checks:**
- registry-denial-s9.test.ts passes for every group and reason
- a destructive-class call with no client is denied on a moved site

### 1.19 TASK-b7a68147dcf72034-s9-t18 — Move the tracker tests off the exec seam and legacy table

Move the test files under src/workflow/tracker (and any other tracker-area files) that import _setTrackerExecForTests or the legacy table onto the stand-in git and gh binaries (installStandInBin, installFakeGh) or injected fakes, each file's assertions unchanged; add the small stand-in gh helper for tests that replaces the legacy table. The injected PolicyReader fakes owned by this area become async.

**Acceptance checks:**
- none of the files in this area imports the exec seam or the legacy table
- every file in this area passes
- the PolicyReader fakes in this area are async

### 1.20 TASK-b7a68147dcf72034-s9-t19 — Move the workflow tests off the exec seam and legacy table

Move the workflow-area test files (build runners, team, gates, convert, companion, workflow-step and the like) that import the exec seam or the legacy table onto stand-in binaries or injected fakes, one commit per sub-area, each file's assertions unchanged. The PolicyReader fakes owned by this area become async.

**Acceptance checks:**
- none of the files in this area imports the exec seam or the legacy table
- every file in this area passes
- the PolicyReader fakes in this area are async

### 1.21 TASK-b7a68147dcf72034-s9-t20 — Move the daemon and cli tests off the exec seam and legacy table

Move the daemon, cli, mcp and understanding test files that import the exec seam or the legacy table onto stand-in binaries or injected fakes, each file's assertions unchanged; the PolicyReader fakes owned by this area become async and the PolicyReader type is narrowed to Promise once all areas are done.

**Acceptance checks:**
- none of the 32 files across t18, t19 and t20 imports the exec seam or the legacy table
- every one of the 32 files passes
- the PolicyReader type is narrowed to Promise and all 44 fakes are async

### 1.22 TASK-b7a68147dcf72034-s9-t21 — Delete the old paths and make the scan fail the build

First grep the whole tree for the old exports as a findings pass. Then delete runGit and team/git.ts, runGitAsync and git-async.ts, runGh, commitAndPushArtifacts and the other github.ts wrappers (keep GhCommandError, parseGithubRemoteUrl and the types the table uses in a small module), createGitRunner and runGitBinary, _setTrackerExecForTests, _legacy-table.ts, _setRegistryTableFactoryForTests and _setWorkflowToolDepsForTests; replace old-paths-unchanged.test.ts with old-paths-removed.test.ts; make package.json run the scan with --fail.

**Acceptance checks:**
- a grep for the old exports over the whole tree is run before deleting and any caller outside the listed sites is recorded as a finding and fixed first
- old-paths-removed.test.ts asserts the old exports and files are gone
- node scripts/forbidden-spawn-scan.mjs --fail exits 0 on the whole tree, with only the three exemptions
- package.json build runs the scan with --fail and tsc is clean

### 1.23 TASK-b7a68147dcf72034-s9-t22 — Migration record and scans

Regenerate docs/plans/tool-registry-migration-record.md with section 5 (one row per s9 site and tool op), extend site-list.test.ts and no-floating-promises.test.ts to the git-calls helpers and moved functions, and add migration-record.test.ts.

**Acceptance checks:**
- migration-record.test.ts: the record lists every table row and every moved site with its test
- site-list.test.ts finds every site of the scan history with a row, a table entry and a registry test
- the no-floating-promises scan passes over the new helpers

### 1.24 TASK-b7a68147dcf72034-s9-t23 — Session source inventory, full sweep and outcome record

Regenerate the session source inventory fixture from the final tree, run the full sweep once in foreground per area with --test-force-exit and compare by test name with the tree before s9, and write the 's9 outcome' section in docs/plans/tool-registry.md.

**Acceptance checks:**
- session-source-inventory.test.ts passes against the regenerated fixture
- the sweep shows no new failure and no new skipped test against the tree before s9, with the pre-existing failures listed
- the 's9 outcome' section is written in docs/plans/tool-registry.md with the deviations and the open items

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/git-calls.ts | `t3` |
| createDeadline with its signal and dispose | `t4` |
| the failure mapping of GitCallFailed and ToolDenied | `t3` |
| policyReader and its seven probes (not a repo, no remote, detached HEAD, shallow, valid policy, invalid policy) | `t7` |
| findAnchor | `t7` |
| refreshPolicy with the 10 s deadline, an aborted signal and a denied ls-remote or fetch | `t8`, `t17` |
| the signoff branch checks, handoff drafts, park plan and resume checks | `t9`, `t10` |
| resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, storyChangeSet, newestStoryCommit, mergeInProgress | `t11`, `t12` |
| validation-checks trackedFiles, changedFiles, trivialCheckPlan | `t13` |
| createRepoIgnoreFilter, defaultGitUserName, convert plan git reads, headFullSha, headShortSha, priorCommit, collectDiff | `t11`, `t12`, `t14` |
| the design corpus reader through git_cat_file revs, git_ls_tree and git_show | `t15` |
| the identity lookup through gh_auth, gh_tracker and git_config including the older-gh case | `t16` |
| the compiler-API no-floating-promises scan extended to the git-calls helpers and the moved functions | `t5`, `t6`, `t22` |
| the site-list test (one table row and one registry test per site, the record lists the rows) | `t22` |
| the old-paths test inverted: the old exports no longer exist | `t21` |
| node scripts/forbidden-spawn-scan.mjs --fail on the whole tree | `t21` |
| the package.json build script runs the scan with --fail | `t21` |
| registry-denial tests per group of sites (team policy, build runners, validation, corpus reader, identity): declined, timed-out, no-client, cancelled | `t17` |
| the tracker, workflow, daemon and cli tests listed in the migration record | `t18`, `t19`, `t20` |
| src/daemon/db/__tests__/session-source-inventory.test.ts after regeneration | `t23` |
| the added inputs of the git tools (g5 to g10 of the audit) | `t24` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD b7a68147dcf72034 s9 contract: git-calls helpers, new tools, PolicyReader and Deadline signatures, replacement table`
- **[[c2]]** `prior-artifact` `LLD b7a68147dcf72034 s9 data model: sites, return types, async signature changes and their callers`
- **[[c3]]** `prior-artifact` `LLD b7a68147dcf72034 s9 error paths: failure kinds, ToolDenied, deadline and abort behaviour`
- **[[c4]]** `prior-artifact` `LLD b7a68147dcf72034 s9 test strategy and acceptance mapping`
- **[[c5]]** `prior-artifact` `LLD b7a68147dcf72034 s9 migration: order of moves, deletion of old paths, scan in failing mode`
