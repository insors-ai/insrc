# Tool registry — migration record (Story s10)

The sites of the tracker and the terminal client that moved onto the tool registry, one row each: the site, the replacement-table row (or the
daemon method) it uses, the tool and op the row calls, and the test that runs it through the registry. The table is
`src/workflow/tracker/registry-table.ts`; `src/workflow/tracker/__tests__/site-list.test.ts` checks this file against the code.

Finished by Story s9: the old wrappers in `src/workflow/tracker/github.ts` (that file now holds `GhCommandError`, `parseGithubRemoteUrl` and the
result types), `runGit`, `runGitAsync`, `runGh`, `commitAndPushArtifacts`, `createGitRunner`, `runGitBinary` and `_setTrackerExecForTests` are
deleted, and `scripts/forbidden-spawn-scan.mjs --fail` runs in the build. Section 6 lists the sites s9 moved with the test that runs each one.

## 1. The 31 wrapper rows

| Row | Tool and op | Registry test |
| :--- | :--- | :--- |
| `ghAuthOk` | `gh_tracker` `current_login` | registry-table.test.ts |
| `ghCreateLabel` | `gh_label` create (force) | registry-table.test.ts |
| `ghCreateIssue` | `gh_issue_create` | registry-table.test.ts |
| `ghCreateIssueTyped` | `gh_tracker` `issue_create_typed` | registry-table.test.ts |
| `ghLinkSubIssue` | `gh_tracker` `sub_issue_link` | registry-table.test.ts |
| `ghGetIssueId` | `gh_tracker` `issue_id` | registry-table.test.ts |
| `ghGetIssueBody` | `gh_issue_view` | registry-table.test.ts |
| `ghEditIssueBody` | `gh_issue_edit` | registry-table.test.ts |
| `ghComment` | `gh_issue_comment` | registry-table.test.ts |
| `ghListIssueComments` | `gh_tracker` `comments_list` | registry-table.test.ts |
| `ghPostCommentReturningId` | `gh_tracker` `comment_post` | registry-table.test.ts |
| `ghCloseIssue` | `gh_issue_close` | registry-table.test.ts |
| `ghGetIssueState` | `gh_issue_view` (state, labels) | registry-table.test.ts |
| `ghFindIssueByLabels` | `gh_issue_list` | registry-table.test.ts |
| `ghFindIssueByLabelsStrict` | `gh_issue_list` | registry-table.test.ts |
| `ghListIssuesByLabelsStrict` | `gh_tracker` `issues_by_labels` | registry-table.test.ts |
| `ghListIssuesByTitleTokenStrict` | `gh_tracker` `issues_titles` | registry-table.test.ts |
| `ghEnsureMilestone` | `gh_tracker` `milestone_create` | registry-table.test.ts |
| `ghAttachMilestone` | `gh_issue_edit` (milestone) | registry-table.test.ts |
| `ghTokenScopes` | `gh_tracker` `token_scopes` | registry-table.test.ts |
| `ghListOrgIssueTypes` | `gh_tracker` `org_issue_types_list` | registry-table.test.ts |
| `ghCreateOrgIssueType` | `gh_tracker` `org_issue_type_create` | registry-table.test.ts |
| `ghCreateProject` | `gh_tracker` `project_create` | registry-table.test.ts |
| `ghFindProjectByTitle` | `gh_project_list` | registry-table.test.ts |
| `ghAddProjectSingleSelectField` | `gh_project_manage` field-create | registry-table.test.ts |
| `ghListRepoIssueUrls` | `gh_issue_list` (url) | registry-table.test.ts |
| `ghAddProjectItem` | `gh:project:item-add` | registry-table.test.ts |
| `ghCurrentLogin` | `gh_tracker` `current_login` | registry-table.test.ts |
| `queryTasks` | `gh_tracker` `tasks_query` | registry-table.test.ts |
| `listMyOpenTasks` | `gh_tracker` `tasks_query` | registry-table.test.ts |
| `gitOriginOwnerRepo` | `git_remote` list | registry-table.test.ts |

## 2. The adapter and attach rows

| Row | Tool and op | Registry test |
| :--- | :--- | :--- |
| `readAssignees` | `gh_issue_view` (assignees) | adapter-registry.test.ts |
| `readAssignee` | `gh_issue_view` | adapter-registry.test.ts |
| `setAssignee` | `gh_issue_edit` remove and add, then a re-read | adapter-registry.test.ts |
| `addAssignee` | `gh_issue_edit` add, then a re-read | adapter-registry.test.ts |
| `openPullRequestOf` | `gh_pr_list` | adapter-registry.test.ts |
| `openSignoffRequest` | `gh_pr_create`, then `gh_tracker` `comment_post` | adapter-registry.test.ts |
| `readSignoffState` | `gh_pr_view` (state, mergedAt, reviewDecision or reviews) | adapter-registry.test.ts |
| `readSignoffRequest` | `gh_pr_view` (headRefName, state) | adapter-registry.test.ts |
| `gitIsTracked` | `git_ls_files` (cached) | attach-tracked-check.test.ts |
| `gitHasChanges` | `git_status` | attach-tracked-check.test.ts |
| `gitLastCommitOf` | `git_log` | attach-tracked-check.test.ts |

`commitAndPushArtifacts` becomes `commitAndPushArtifactsViaRegistry` (`src/workflow/tracker/commit-and-push-registry.ts`): `git_rev_parse`,
`git_stage`, `git_diff` (staged), `git_commit`, `git_push` (configured). Test: commit-and-push-registry.test.ts, commit-denial-callers.test.ts.

## 3. The sites in `src/workflow` and `src/daemon`

| Site | Moved to | Test |
| :--- | :--- | :--- |
| `src/workflow/tracker/github-adapter.ts` (the port, its issue ops and the strict loader) | the table, async | adapter-attempt.test.ts, tracker-push-registry.test.ts |
| `src/workflow/tracker/setup.ts` | `ghAuthOk`, `ghTokenScopes`, `gitOriginOwnerRepo`, `ghCreateLabel`, the org, project and field rows | tracker-push-registry.test.ts |
| `src/workflow/tracker/sync.ts` | `ghAuthOk`, `ghGetIssueState` | tracker-push-registry.test.ts |
| `src/workflow/bugfix/tracker.ts` | the adapter and `ghAuthOk` | bugfix-tracker.test.ts |
| `src/workflow/config/github.ts` (origin lookups) | `gitOriginOwnerRepo` | github.test.ts |
| `src/workflow/tracker-auto.ts` (sign-in check) | `ghAuthOk` | tracker-auto.test.ts |
| `src/workflow/tracker/attach.ts` | `gitOriginOwnerRepo`, `gitIsTracked`, `gitHasChanges`, `gitLastCommitOf` | attach.test.ts, attach-tracked-check.test.ts |
| `src/workflow/questions.ts` (`commitAndComment`) | `commitAndPush` | commit-denial-callers.test.ts |
| `src/workflow/resolve-comment.ts` (`commitRecorded`) | `commitAndPush` | commit-denial-callers.test.ts |
| `src/workflow/team/signoff.ts` (`publishArtifactsBranch`) | `commitAndPush` | signoff tests |
| `src/daemon/approve-pipeline.ts` (check-in and attachment commits) | `commitAndPush` | workflow-approve-pipeline.test.ts |

## 4. The sites in `src/cli/services`

| Site | Daemon method | Test |
| :--- | :--- | :--- |
| `workflow.ts` approve | `workflow.approvePipeline` | cli-services-no-spawn.test.ts, workflow-approve-adapter.test.ts |
| `workflow.ts` sync | `tracker.sync` | cli-services-no-spawn.test.ts |
| `workflow.ts` trackerSetup | `tracker.setup` | tracker-setup-service.test.ts |
| `workflow.ts` reviewArtifact | `workflow.reviewArtifact` | review-resolve-daemon.test.ts |
| `workflow.ts` resolveFinding | `workflow.resolveFinding` | review-resolve-daemon.test.ts |
| `team.ts` refresh | `team.refresh` | cli-services-no-spawn.test.ts, team-service.test.ts |
| `team.ts` claim | `team.claim` | team-claim-release.test.ts |
| `team.ts` release | `team.release` | team-claim-release.test.ts |

Named exemption: `src/cli/services/maintenance.ts`, the daemon self-update (it runs when the daemon may be down). No site: `approval.ts`,
`connection-maintenance.ts`, `daemon.ts`, `debug.ts`, `setup.ts` (they run programs that are not git or gh).

## 5. The s9 audit: every site against the tool input schemas

Written by task t1 of Story s9 from the tool definitions in `src/daemon/tools/builtins/git` and `src/daemon/tools/builtins/gh`, not from memory.
Status: `covered` (the op carries every option the site uses), `derived` (the value comes from an existing result, the reason is given) or
`gap` (an input or tool is missing; the gap id is defined in the list below the table). `src/workflow/__tests__/audit-rows.test.ts` checks this
section.

| Site | Tool and op | Status | Missing input or derivation |
| :--- | :--- | :--- | :--- |
| `src/workflow/team/policy-reader.ts` `probeGitRepo` | `git_rev_parse` `gitDir` | covered | |
| `src/workflow/team/policy-reader.ts` `probeRemote` | `git_remote` `list` | covered | |
| `src/workflow/team/policy-reader.ts` `probeRemoteHead` | `git_symbolic_ref` `get` (quiet) | covered | |
| `src/workflow/team/policy-reader.ts` `resolveRev` | `git_rev_parse` `verify` | covered | |
| `src/workflow/team/policy-reader.ts` `readAt` (tree check) | `git_ls_tree` `nameOnly` | gap | g6: `fullTree` |
| `src/workflow/team/policy-reader.ts` `readAt` (blob) | `git_cat_file` `rev`, `path` | derived | `git_show` gives a diff, not a blob; `git_cat_file` returns the bytes of `<rev>:<path>` |
| `src/workflow/team/policy-reader.ts` `scanForPolicy` | `git_for_each_ref` `pattern`, `fields` refname, then `git_ls_tree` | gap | g6: `fullTree` |
| `src/workflow/team/anchor-finder.ts` shallow check | `git_rev_parse` `isShallow` | covered | |
| `src/workflow/team/anchor-finder.ts` first-parent history | `git_path_history` `firstParent`, `diffFilter` A, `reverse`, `rev`, `path` | covered | the committer time is `%cI`, the format the site read |
| `src/workflow/team/sighting-store.ts` `resolveRepoIdentity` | `git_rev_parse` `showToplevel` | covered | |
| `src/workflow/team/policy-refresh.ts` `refreshPolicy` | `git_fetch_refs` `noTags`, `noWriteFetchHead`, `noRecurseSubmodules`, `noPrune`, `refmap` | covered | |
| `src/workflow/team/branch-resolution.ts` | `git_ls_remote` `symref`, `heads`, `patterns` | covered | |
| `src/workflow/team/signoff.ts` `currentBranchOf` | `git_rev_parse` `abbrevRef` | covered | |
| `src/workflow/team/signoff.ts` ahead count | `git_rev_list` `count` | covered | |
| `src/workflow/team/handoff.ts` `unitDraftFiles` | `git_status` | gap | g5: `paths` and `untrackedFiles` all |
| `src/workflow/team/handoff.ts` `committedAtHead` | `git_cat_file` `exists` (`HEAD:<path>`) | covered | |
| `src/workflow/team/handoff.ts` `repositoryIdOf`, `resumeCheck` roots | `git_rev_parse`, `git_rev_list` `maxParents` 0 | covered | |
| `src/workflow/team/handoff.ts` `parkPlan` remote lookup | `git_ls_remote` `heads`, `patterns` | covered | |
| `src/workflow/team/handoff.ts` `parkPlan` fetch of the handoff branch | `git_fetch_refs` into a temporary ref, then `git_rev_parse` | derived | the tool takes explicit `src:dst` pairs, so the branch is fetched into a temporary ref (as the resume check already does) and that ref is read and deleted with `git_update_ref`; the sha is the same one `FETCH_HEAD` held |
| `src/workflow/team/handoff.ts` `parkPlan` temporary worktree | `git_worktree` `add` | gap | g9: `startPoint` |
| `src/workflow/team/handoff.ts` `parkPlan` stage, commit and push in the temporary worktree | `git_stage` `force`, `git_commit` `allowEmpty` `allowDetached`, `git_push` `ref` HEAD:refs/heads/<branch> | gap | g11: `force` on `git_stage` (`git add -f`), found while moving the park in t10 |
| `src/workflow/team/handoff.ts` `parkPlan` deleted drafts | the work tree file removed, then `git_stage` | derived | the old `git rm --ignore-unmatch` is not needed: the file is deleted in the temporary worktree and `git add` stages the deletion (`git_rm` always asks, so it is not used) |
| `src/workflow/team/handoff.ts` cleanup | the worktree directory deleted, then `git_worktree` `prune` | derived | the temporary worktree is detached, so no temporary branch is made and none is deleted; `git_branch` delete, `git_update_ref` and a forced `git_worktree` remove are destructive and would ask every time |
| `src/workflow/team/handoff.ts` cleanup checks | `git_worktree` `list` | covered | |
| `src/workflow/team/handoff.ts` `resumeCheck` url and fetch | `git_remote` `list`, `git_fetch_refs` | derived | the fetch URL is `fetchUrl` of the listed remote |
| `src/workflow/team/handoff.ts` `resumeCheck` reads | `git_cat_file` `rev`, `path` | derived | the bytes of `<tmpRef>:<path>` |
| `src/workflow/team/handoff.ts` `resumeCheck` dirty check | `git_status` | gap | g5: `paths` and `untrackedFiles` all |
| `src/workflow/convert/plan.ts` repository, merge checks | `git_rev_parse` `gitDir`, `verify` | covered | |
| `src/workflow/convert/plan.ts` protected paths status | `git_status` | gap | g5: `paths` and `untrackedFiles` all |
| `src/workflow/gates.ts` `headFullSha` | `git_rev_parse` `rev` HEAD | covered | the full sha, not `short` |
| `src/workflow/runners/build/range-base.ts` `commitExists`, `headFullSha`, `resolveStoryRangeEnd` | `git_cat_file` `exists`, `git_rev_parse` | covered | |
| `src/workflow/runners/build/range-base.ts` `introducingCommit` | `git_path_history` `diffFilter` A, `limit` 1, `path` | covered | |
| `src/workflow/runners/build/standalone-record.ts` `headShortSha`, `priorCommit` | `git_rev_parse` `short`, `git_cat_file` `exists` | covered | |
| `src/workflow/runners/build/story-commits.ts` commit scan | `git_log` | gap | g7: `firstParent`; the site treats a result of exactly the 500 commit cap as a failure |
| `src/workflow/runners/build/story-commits.ts` first-parent list | `git_rev_list` | gap | g8: `parents`; `reverse` is derived by reversing the list |
| `src/workflow/runners/build/story-commits.ts` base check | `git_rev_parse` `verify` | covered | |
| `src/workflow/runners/build/story-commits.ts` empty tree | `git_hash_object` | gap | g3: `type` |
| `src/workflow/runners/build/story-commits.ts` per-commit paths | `git_diff_tree` | gap | g1: new tool |
| `src/workflow/runners/build/story-commits.ts` `diff --name-only -z` | `git_diff` `from`, `to` | derived | `files[].path` of the numstat list, which follows the same rename policy as `--name-only` |
| `src/workflow/runners/build/story-commits.ts` merge simulation | `git_merge_tree` | gap | g2: new tool |
| `src/workflow/runners/build/story-commits.ts` `mergeInProgress` | `git_rev_parse` `verify` (MERGE_HEAD), `gitPath` | gap | g4: `gitPath` |
| `src/workflow/runners/build/changed-files.ts` `collectDiff` | `git_diff` through `callTool` | covered | |
| `src/daemon/steps/build-step/validation-checks.ts` `trackedFiles` | `git_ls_files` `cached` | covered | `maxBytes` 50 MiB, the tool's cap, where the site allowed 64 MiB |
| `src/daemon/steps/build-step/validation-checks.ts` `changedFiles` base to HEAD | `git_diff` `from`, `to` | derived | `files` whose `change` is not `deleted` (the `--diff-filter=d` leaves deleted files out) |
| `src/daemon/steps/build-step/validation-checks.ts` `changedFiles` HEAD commit | `git_show` | derived | `files` whose `change` is not `deleted` |
| `src/daemon/steps/build-step/validation-checks.ts` `changedFiles` working tree | `git_diff` against HEAD | gap | g10: `againstWorktree` |
| `src/daemon/steps/build-step/validation-checks.ts` untracked | `git_ls_files` `others` | covered | |
| `src/daemon/steps/build-step/validation-checks.ts` `trivialCheckPlan` | `git_diff`, `git_show` | derived | as `changedFiles` |
| `src/analyze/context/repo-ignore-filter.ts` | `git_ls_files` `cached`, `others` | covered | `maxBytes` 50 MiB, the limit the site had |
| `src/workflow/artifacts/companion/header.ts` `defaultGitUserName` | `git_config` | covered | |
| `src/design/corpus/sources/git-reader.ts` | `git_cat_file` `revs`, `stdoutLimit`, `stderrLimit`, `timeoutMs`, isolated | covered | |
| `src/understanding/identity.ts` sign-in hosts | `gh_auth` `hosts` | covered | |
| `src/understanding/identity.ts` user lookup | `gh_tracker` `user_by_host` | covered | |
| `src/understanding/identity.ts` git email | `git_config` | covered | |

### The final gap list

This list is final. A gap found later is a plan amendment, not part of t2.

| Id | Tool | Addition | Sites |
| :--- | :--- | :--- | :--- |
| g1 | `git_diff_tree` | a new read-only tool | story-commits |
| g2 | `git_merge_tree` | a new read-only tool | story-commits |
| g3 | `git_hash_object` | an optional `type` input | story-commits |
| g4 | `git_rev_parse` | an optional `gitPath` input | story-commits `mergeInProgress` |
| g5 | `git_status` | optional `paths` and `untrackedFiles` ('all') inputs, built by t24 | handoff, convert plan |
| g6 | `git_ls_tree` | an optional `fullTree` input, built by t24 | policy-reader |
| g7 | `git_log` | an optional `firstParent` input, built by t24 | story-commits |
| g8 | `git_rev_list` | an optional `parents` input (the data gains `parents`), built by t24 | story-commits |
| g9 | `git_worktree` | an optional `startPoint` input for `add`, built by t24 | handoff park |
| g10 | `git_diff` | an optional `againstWorktree` input (`git diff <from>`), built by t24 | validation-checks |

| g11 | `git_stage` | an optional `force` input (`git add -f`), found while moving the handoff park in t10 and built there | handoff park (`.insrc/handoff` files) |
| g12 | `git_diff`, `git_show` | an optional `excludeDeleted` input (`--diff-filter=d`), found while moving the validation checks in t13: the files' `change` label is a guess from the line counts, so a deleted file cannot be told from an edit that only removes lines | validation-checks |

Not gaps: the `signal` that `git_log`, `git_diff`, `git_status`, `git_rev_list`, `git_for_each_ref`, `git_ls_files` and `git_path_history` do not pass to
their process. The refresh uses only `git_ls_remote` and `git_fetch_refs`, which do; the other sites have no abort requirement.

## 6. The sites s9 moved, each with its test

One row per file of the Story's replacement table. The tool and op of each call are in section 5; the test is the file that runs the site through
the registry (a stand-in `git` or `gh` binary or an injected tool hook), and `src/workflow/tracker/__tests__/migration-record.test.ts` checks that the
file exists. The scan finds no site outside the three exemptions: `src/cli/services/maintenance.ts` (the daemon self-update), `src/daemon/installed-commit.ts`
(read before the registry exists) and `src/indexer/file-filter.ts` (the indexer's own file walk; temporary, after the merge of origin/main moved the git listing there from `src/indexer/index.ts`).

| Site | Tool family | Test |
| :--- | :--- | :--- |
| `src/workflow/team/policy-reader.ts` | `git_rev_parse`, `git_remote`, `git_symbolic_ref`, `git_ls_tree`, `git_cat_file`, `git_for_each_ref` | `src/workflow/team/__tests__/team-policy-registry.test.ts` |
| `src/workflow/team/anchor-finder.ts` | `git_rev_parse`, `git_path_history` | `src/workflow/team/__tests__/team-policy-registry.test.ts` |
| `src/workflow/team/sighting-store.ts` | `git_rev_parse` | `src/workflow/team/__tests__/refresh-deadline.test.ts` |
| `src/workflow/team/policy-refresh.ts` | `git_fetch_refs` | `src/workflow/team/__tests__/refresh-abort.test.ts` |
| `src/workflow/team/branch-resolution.ts` | `git_ls_remote` | `src/workflow/team/__tests__/team-policy-registry.test.ts` |
| `src/workflow/team/signoff.ts` | `git_rev_parse`, `git_rev_list` | `src/workflow/team/__tests__/team-policy-registry.test.ts` |
| `src/workflow/team/handoff.ts` | `git_status`, `git_cat_file`, `git_rev_parse`, `git_rev_list`, `git_ls_remote`, `git_fetch_refs`, `git_worktree`, `git_stage`, `git_commit`, `git_push`, `git_remote` | `src/workflow/team/__tests__/team-policy-registry.test.ts` |
| `src/workflow/convert/plan.ts` | `git_rev_parse`, `git_status` | `src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts` |
| `src/workflow/gates.ts` | `git_rev_parse` | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |
| `src/workflow/runners/build/range-base.ts` | `git_cat_file`, `git_rev_parse`, `git_path_history` | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |
| `src/workflow/runners/build/standalone-record.ts` | `git_rev_parse`, `git_cat_file` | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |
| `src/workflow/runners/build/story-commits.ts` | `git_log`, `git_rev_list`, `git_rev_parse`, `git_hash_object`, `git_diff_tree`, `git_diff`, `git_merge_tree` | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |
| `src/workflow/runners/build/changed-files.ts` | `git_diff` | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |
| `src/daemon/steps/build-step/validation-checks.ts` | `git_ls_files`, `git_diff`, `git_show` | `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` |
| `src/analyze/context/repo-ignore-filter.ts` | `git_ls_files` | `src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts` |
| `src/workflow/artifacts/companion/header.ts` | `git_config` | `src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts` |
| `src/design/corpus/sources/git-reader.ts` | `git_cat_file` | `src/design/corpus/sources/__tests__/corpus-reader-registry.test.ts` |
| `src/understanding/identity.ts` | `gh_auth`, `gh_tracker`, `git_config` | `src/understanding/__tests__/identity-registry.test.ts` |

Denial: every site above throws `ToolDenied` when its call is declined, cancelled, given no client or hook-denied, and a destructive call is never made
without asking (`src/workflow/__tests__/registry-denial-s9.test.ts`). The shared helpers are in `src/workflow/git-calls.ts`
(`src/workflow/__tests__/git-calls.test.ts`).
