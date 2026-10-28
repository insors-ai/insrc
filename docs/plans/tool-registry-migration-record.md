# Tool registry — migration record (Story s10)

The sites of the tracker and the terminal client that moved onto the tool registry, one row each: the site, the replacement-table row (or the
daemon method) it uses, the tool and op the row calls, and the test that runs it through the registry. The table is
`src/workflow/tracker/registry-table.ts`; `src/workflow/tracker/__tests__/site-list.test.ts` checks this file against the code.

Not moved by s10, left for s9: the old wrappers in `src/workflow/tracker/github.ts`, `runGit`, `runGitAsync`, `runGh`,
`commitAndPushArtifacts`, `createGitRunner` and `_setTrackerExecForTests` stay exported and unchanged, and
`scripts/forbidden-spawn-scan.mjs` stays in report mode (s9 deletes them and switches the scan to `--fail`).

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
