<!-- insrc:artifact TESTS-b7a68147dcf72034-s10 -->

# Tests: b7a68147dcf72034 s10

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 67 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-27T16:10:27.455Z on commit `ee7652e1a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: tool-denied.test.ts: every ToolFailureKind maps to the old kind or ToolDenied; conversion-failed and schema-mismatch never become a best-effort value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tool-denied: every ToolFailureKind maps to the old kind or ToolDenied; conversion-failed and schema-mismatch never become a best-effort value | `src/workflow/tracker/__tests__/tool-denied.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/tool-denied.test.ts` | 0 | 14 | 0.5 s |  |

## t2

Run at 2026-10-27T17:16:32.059Z on commit `0c6812b4a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: pr-view-fields.test.ts: gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews; the default result is unchanged; a field outside the allowlist is rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | pr-view-fields.test.ts: gh_pr_view with jsonFields returns mergedAt, reviewDecision and reviews; the default result is unchanged; a field outside the allowlist is rejected | `src/daemon/tools/builtins/gh/__tests__/pr-view-fields.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/pr-view-fields.test.ts` | 0 | 1 | 0.7 s |  |

## t3

Run at 2026-10-27T17:23:12.776Z on commit `c5cbfe37a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: git-push-configured.test.ts: configured true runs plain git push with an alternate push remote, a differently named upstream and a missing upstream; combined inputs are rejected; existing calls are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-push-configured.test.ts: configured true runs plain git push with an alternate push remote, a differently named upstream and a missing upstream; combined inputs are rejected; existing calls are unchanged | `src/daemon/tools/builtins/git/__tests__/git-push-configured.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-push-configured.test.ts` | 0 | 1 | 1 s |  |

## t4

Run at 2026-10-27T17:30:56.429Z on commit `122610a76`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry-table.test.ts: one case per issue, comment, label, milestone and task-query row, including best-effort rows and the rule that a denial is thrown, never swallowed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry-table.test.ts: one case per issue, comment, label, milestone and task-query row, including best-effort rows and the rule that a denial is thrown, never swallowed | `src/workflow/tracker/__tests__/registry-table.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/registry-table.test.ts` | 0 | 16 | 1.3 s |  |

## t5

Run at 2026-10-27T17:34:06.444Z on commit `1828329ba`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry-table.test.ts: one case per organisation, project, scope, login and url row, with null, false and [] only for gh failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry-table.test.ts: one case per organisation, project, scope, login and url row, with null, false and [] only for gh failures | `src/workflow/tracker/__tests__/registry-table.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/registry-table.test.ts` | 0 | 27 | 1.4 s |  |

## t6

Run at 2026-10-27T17:40:09.060Z on commit `c18ece038`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: registry-table.test.ts: ghAuthOk form, gitOriginOwnerRepo form and the attach tracked-check rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry-table.test.ts: ghAuthOk form, gitOriginOwnerRepo form and the attach tracked-check rows | `src/workflow/tracker/__tests__/registry-table.test.ts` |

**unit: adapter-registry.test.ts: assignee read, set and add with the re-read checks, signoff pull request list, create and view rows, a denied link comment and a retry that reuses the open pull request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adapter-registry.test.ts: assignee read, set and add with the re-read checks, signoff pull request list, create and view rows, a denied link comment and a retry that reuses the open pull request | `src/workflow/tracker/__tests__/adapter-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/adapter-registry.test.ts` | 0 | 10 | 1.3 s |  |
| `src/workflow/tracker/__tests__/registry-table.test.ts` | 0 | 31 | 1.6 s |  |

## t7

Run at 2026-10-27T17:43:26.646Z on commit `f181c153a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: commit-and-push-registry.test.ts: same results and reasons as the old function for each case; denial at each phase throws ToolDenied; denied commit leaves the paths staged; mixed and all-missing paths; three push configurations**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | commit-and-push-registry.test.ts: same results and reasons as the old function for each case; denial at each phase throws ToolDenied; denied commit leaves the paths staged; mixed and all-missing paths; three push configurations | `src/workflow/tracker/__tests__/commit-and-push-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/commit-and-push-registry.test.ts` | 0 | 11 | 1.8 s |  |

## t8

Run at 2026-10-27T17:54:11.635Z on commit `ce222e3bb`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: team-gate-callers.test.ts: each listed caller awaits its gate call and returns the same outcome; handler.test.ts and handler-runtime.test.ts still pass**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-gate-callers.test.ts: each listed caller awaits its gate call and returns the same outcome; handler.test.ts and handler-runtime.test.ts still pass | `src/workflow/team/__tests__/team-gate-callers.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | src/daemon/__tests__/handler-runtime.test.ts: the recorded handler key sets are unchanged because no method is added | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/team/__tests__/team-gate-callers.test.ts` | 0 | 1 | 1 s |  |

## t9

Run at 2026-10-27T18:10:46.127Z on commit `19da264a1`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: team-gates-async.test.ts: the gate functions return the same outcomes and refusals with an async port**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-gates-async.test.ts: the gate functions return the same outcomes and refusals with an async port | `src/workflow/team/__tests__/team-gates-async.test.ts` |

**unit: team-gates-denial.test.ts: a denial stops the stage as ToolDenied and is never undefined, a generic refusal or report-only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-gates-denial.test.ts: a denial stops the stage as ToolDenied and is never undefined, a generic refusal or report-only | `src/workflow/team/__tests__/team-gates-denial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/team-gates-async.test.ts` | 0 | 12 | 0.7 s |  |
| `src/workflow/team/__tests__/team-gates-denial.test.ts` | 0 | 15 | 0.7 s |  |

## t10

Run at 2026-10-27T18:23:25.388Z on commit `565a36ce8`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: unit-extras.test.ts: runUnitExtras with async steps and async comments runs in order and reconciles comments as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | unit-extras.test.ts: runUnitExtras with async steps and async comments runs in order and reconciles comments as before | `src/workflow/tracker/__tests__/unit-extras.test.ts` |

**integration: tracker-denial.test.ts: a denial at a milestone extra, a comment extra and the link comment stops publication with later calls forbidden and keeps the bindings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker-denial.test.ts: a denial at a milestone extra, a comment extra and the link comment stops publication with later calls forbidden and keeps the bindings | `src/workflow/tracker/__tests__/tracker-denial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/tracker-denial.test.ts` | 0 | 6 | 0.7 s |  |
| `src/workflow/tracker/__tests__/unit-extras.test.ts` | 0 | 2 | 0.6 s |  |

## t11

Run at 2026-10-27T18:30:40.175Z on commit `d5a2fe22e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: task-set-denial.test.ts: syncOnPlanApproval rethrows ToolDenied with the partial arrays, ordinary errors keep {error}, and a pending-close entry lets the next reconciliation close the issue**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | task-set-denial.test.ts: syncOnPlanApproval rethrows ToolDenied with the partial arrays, ordinary errors keep {error}, and a pending-close entry lets the next reconciliation close the issue | `src/workflow/tasks/__tests__/task-set-denial.test.ts` |

**integration: sync-plan-tasks-denial.test.ts: through the real syncPlanTasks a denied close escapes as ToolDenied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-plan-tasks-denial.test.ts: through the real syncPlanTasks a denied close escapes as ToolDenied | `src/daemon/__tests__/sync-plan-tasks-denial.test.ts` |

**unit: tasks-sync-async.test.ts: a withdrawn-Task close through an async CloseIssue reports ok and gh failure as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tasks-sync-async.test.ts: a withdrawn-Task close through an async CloseIssue reports ok and gh failure as before | `src/daemon/__tests__/tasks-sync-async.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/sync-plan-tasks-denial.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/__tests__/tasks-sync-async.test.ts` | 0 | 3 | 0.7 s |  |
| `src/workflow/tasks/__tests__/task-set-denial.test.ts` | 0 | 4 | 0.6 s |  |

## t12

Run at 2026-10-27T18:34:53.243Z on commit `89c02cfd6`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: identity-draft-denial.test.ts: a denial inside idOf, resolveLearner and ensureDraftIssues stops the stage; a non-denial failure keeps the old fallback**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync: currentActor throws the denial from the tracker loader and from whoAmI, and is never the OS user | `src/workflow/identity/__tests__/identity-draft-denial.test.ts` |
| pass | async: currentActor throws the denial from the tracker loader and from whoAmI, and is never the OS user | `src/workflow/identity/__tests__/identity-draft-denial.test.ts` |
| pass | sync: a non-denial failure of the tracker keeps the fallback to git, then the OS user, and a working tracker still names the login | `src/workflow/identity/__tests__/identity-draft-denial.test.ts` |
| pass | resolveLearner throws a provider lookup that was denied and does not fall back to git or the OS user; an ordinary lookup error is still an unavailable provider | `src/workflow/identity/__tests__/identity-draft-denial.test.ts` |
| pass | a denial from the tracker loader or from a lookup while the Epic issue is ensured is thrown, not a "not ready" draft; any other failure is still not ready | `src/workflow/identity/__tests__/identity-draft-denial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/identity/__tests__/identity-draft-denial.test.ts` | 0 | 8 | 0.6 s |  |

## t13

Run at 2026-10-28T04:45:29.159Z on commit `9ca391631`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tracker-push-registry.test.ts: a push, sync, setup, question and comment resolution create the same objects and records as the recorded legacy sequence; a second run creates nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a push creates the issue typed, links it under its parent, comments and closes it, in that order, through the registry | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |
| pass | a second run finds the issue by its labels and creates nothing | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |
| pass | setup ensures the fixed labels through the registry and skips the steps that need scopes it was not given; the same run again ensures the same labels | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |
| pass | sync reads the Epic issue state through the registry and records its status on the Define; it writes nothing to GitHub | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |
| pass | a question resolution and a comment resolution post their tracker comment through the registry as one issue comment each | `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` |

**unit: adapter-attempt.test.ts: async attempt keeps the conversion of non-denial exceptions to rejected and rethrows ToolDenied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a plain exception is a rejected result carrying its message, and a gh failure keeps its kind | `src/workflow/tracker/__tests__/adapter-attempt.test.ts` |
| pass | a denial is thrown from every kind of call, never returned as a result | `src/workflow/tracker/__tests__/adapter-attempt.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/adapter-attempt.test.ts` | 0 | 4 | 0.7 s |  |
| `src/workflow/tracker/__tests__/tracker-push-registry.test.ts` | 0 | 8 | 0.8 s |  |

## t14

Run at 2026-10-28T05:42:57.013Z on commit `c821dfd2c`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: commit-denial-callers.test.ts: a denied commit posts no comment and handleResolveComment returns the error result; ordinary git failures are logged and the stage continues**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a denied commit makes handleResolveComment answer its error result with the recorded count, never success | `src/workflow/__tests__/commit-denial-callers.test.ts` |
| pass | an ordinary git failure (not a work tree) is logged and the recording still succeeds | `src/workflow/__tests__/commit-denial-callers.test.ts` |
| pass | a denied commit makes recordResolution throw the denial and posts no tracker comment | `src/workflow/__tests__/commit-denial-callers.test.ts` |

**unit: attach-tracked-check.test.ts: a tracked file passes and an untracked file is refused with the old reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a tracked clean file is tracked, has no changes and names its last commit; an untracked one is not tracked; an edited one has changes | `src/workflow/tracker/__tests__/attach-tracked-check.test.ts` |
| pass | attachDocuments builds a link to the file at the last commit that touched it, refuses a dirty or untracked file, skips a recorded (target, revision), adds a new link for a new commit and keeps the old attachment, and records a link found already posted without posting it again | `src/workflow/tracker/__tests__/attach.test.ts` |

**integration: registry-denial.test.ts: no-client, declined, timed-out and cancelled approval deny a moved call and later calls are not made**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | declined: the staging is denied with that reason, nothing is committed and no later call asks | `src/workflow/tracker/__tests__/registry-denial.test.ts` |
| pass | timed-out: the staging is denied with that reason, nothing is committed and no later call asks | `src/workflow/tracker/__tests__/registry-denial.test.ts` |
| pass | no-client: the staging is denied with that reason, nothing is committed and no later call asks | `src/workflow/tracker/__tests__/registry-denial.test.ts` |
| pass | cancelled: the staging is denied with that reason, nothing is committed and no later call asks | `src/workflow/tracker/__tests__/registry-denial.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/commit-denial-callers.test.ts` | 0 | 4 | 0.7 s |  |
| `src/workflow/tracker/__tests__/attach-tracked-check.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/tracker/__tests__/attach.test.ts` | 0 | 2 | 0.8 s |  |
| `src/workflow/tracker/__tests__/registry-denial.test.ts` | 0 | 5 | 0.7 s |  |

## t15

Run at 2026-10-28T05:44:41.374Z on commit `fae7439e1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: ipc-client-close-aware.test.ts: rpc with closeAware rejects on premature close and sets no timer; rpc without it is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ipc-client-close-aware.test.ts: rpc with closeAware rejects on premature close and sets no timer; rpc without it is unchanged | `src/shared/__tests__/ipc-client-close-aware.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/ipc-client-close-aware.test.ts` | 0 | 1 | 0.6 s |  |

## t16

Run at 2026-10-28T05:50:42.763Z on commit `7a2fef08e`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: workflow-approve-pipeline.test.ts: withTracker false stops after approval and Task reconciliation; a plan approval publishes exactly once; a denial at publication stops the check-in commit and attach**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withTracker false reconciles the Tasks and does nothing after: no publication, no commit, no attachment | `src/daemon/__tests__/workflow-approve-pipeline.test.ts` |
| pass | a plan approval publishes the Task issues exactly once: one tracker-push entry, and the reconciliation entry does not publish | `src/daemon/__tests__/workflow-approve-pipeline.test.ts` |
| pass | a denial at publication is a tracker-push entry with ok false and the denial, and the check-in commit and the attachment do not run | `src/daemon/__tests__/workflow-approve-pipeline.test.ts` |

**integration: workflow-approve-followon.test.ts: the additive follow-on kinds carry their payloads**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tasks-sync carries the Task ids and the whole reconciliation, tracker-push the publication result, artifact-commit the commit result | `src/daemon/__tests__/workflow-approve-followon.test.ts` |
| pass | handleApprovePipeline answers the approval and the entries of the follow-on it was given, and a bad request is an error | `src/daemon/__tests__/workflow-approve-followon.test.ts` |

**integration: handler-runtime.test.ts: workflow.approvePipeline, tracker.sync and tracker.setup are registered and return the old results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow.approvePipeline, tracker.sync and tracker.setup are registered and answer their requests | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 3 | 0.8 s |  |
| `src/daemon/__tests__/workflow-approve-followon.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/__tests__/workflow-approve-pipeline.test.ts` | 0 | 4 | 0.7 s |  |

## t17

Run at 2026-10-28T05:56:44.425Z on commit `b9d7f3f42`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: review-resolve-daemon.test.ts: with claims enforced, reviewArtifact and resolveFinding run through the daemon methods and return the old results and refusals**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resolveFinding: apply by a non-holder is refused and writes nothing, accept records, and the holder applies | `src/daemon/__tests__/review-resolve-daemon.test.ts` |
| pass | reviewArtifact: runs the review in the daemon with the repository and the artifact it was given and returns its result; a missing path is the error of the call | `src/daemon/__tests__/review-resolve-daemon.test.ts` |
| pass | claim and release print the terminal's lines: a tick when allowed, a cross naming the holder when the stage is held by someone else | `src/daemon/__tests__/review-resolve-daemon.test.ts` |

**integration: handler-runtime.test.ts: team.refresh, team.claim and team.release are registered and return the old results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team.refresh, team.claim and team.release are registered and return the old results | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets plus the methods added since | `src/daemon/__tests__/handler-runtime.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/__tests__/review-resolve-daemon.test.ts` | 0 | 4 | 0.7 s |  |

## t18

Run at 2026-10-28T06:11:39.613Z on commit `7d93d7a11`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-services-no-spawn.test.ts: approve, sync, trackerSetup and the team services call only rpc with the named daemon methods and parameters and import no child_process or tracker or git code**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-services-no-spawn.test.ts: approve, sync, trackerSetup and the team services call only rpc with the named daemon methods and parameters and import no child_process or tracker or git code | `src/cli/__tests__/cli-services-no-spawn.test.ts` |

**unit: workflow-approve-adapter.test.ts: the client adapter rebuilds ApproveOutcome losslessly from the follow-on entries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | workflow-approve-adapter.test.ts: the client adapter rebuilds ApproveOutcome losslessly from the follow-on entries | `src/cli/__tests__/workflow-approve-adapter.test.ts` |

**unit: cli-services-daemon-errors.test.ts and workflow-approve-versioning.test.ts: an older or absent daemon gives a clear error, no fallback and no publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-services-daemon-errors.test.ts: an older daemon (method-not-found) and a daemon that is not running give a clear error with no local fallback; a socket closed during the follow-ons leaves the approval recorded and the daemon finishes the pipeline | `src/cli/__tests__/cli-services-daemon-errors.test.ts` |
| pass | workflow-approve-versioning.test.ts: against the existing handler (which accepts workflow.approve and ignores withTracker) the client uses only workflow.approvePipeline; a daemon without it gives the method-not-found error and no publication happens | `src/cli/__tests__/workflow-approve-versioning.test.ts` |

**unit: command.test.ts: sync, claim, release and resolveFinding results are awaited before status and text are read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | command.test.ts: sync, claim, release and resolveFinding results are awaited before status and text are read | `src/cli/__tests__/command.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/cli-services-daemon-errors.test.ts` | 0 | 1 | 0.7 s |  |
| `src/cli/__tests__/cli-services-no-spawn.test.ts` | 0 | 1 | 0.7 s |  |
| `src/cli/__tests__/command.test.ts` | 0 | 27 | 0.4 s |  |
| `src/cli/__tests__/workflow-approve-adapter.test.ts` | 0 | 1 | 0.7 s |  |
| `src/cli/__tests__/workflow-approve-versioning.test.ts` | 0 | 1 | 0.7 s |  |

## t19

Run at 2026-10-28T06:18:39.652Z on commit `b2fea0c7c`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: site-list.test.ts: the 31 gh wrapper names in the table equal the github.ts gh exports; every site has a table row and a registry test; the migration record lists the rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | site-list.test.ts: the 31 gh wrapper names in the table equal the github.ts gh exports; every site has a table row and a registry test; the migration record lists the rows | `src/workflow/tracker/__tests__/site-list.test.ts` |
| pass | site-list.test.ts: every site named in the migration record exists, and no production file outside github.ts calls a wrapper | `src/workflow/tracker/__tests__/site-list.test.ts` |
| pass | k2: a schema failure is never passed on as a value, even by a row that swallows gh failures | `src/workflow/tracker/__tests__/s10-invariants.test.ts` |
| pass | k3: the terminal reaches the daemon only through IPC: its services import no daemon internals, store or tracker code | `src/workflow/tracker/__tests__/s10-invariants.test.ts` |
| pass | k4: a destructive call with no client attached is denied, not run | `src/workflow/tracker/__tests__/s10-invariants.test.ts` |
| pass | k5: provider-reaching code awaits serially: the new pipeline, table and handler modules start no calls together | `src/workflow/tracker/__tests__/s10-invariants.test.ts` |

**unit: cli-services-sites.test.ts: the scan of src/cli/services finds two sites, one named exemption and five no-site files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-services-sites.test.ts: the scan of src/cli/services finds two sites, one named exemption and five no-site files | `src/cli/__tests__/cli-services-sites.test.ts` |

**unit: no-floating-promises.test.ts: the compiler-API scan finds no unawaited TrackerPort, IssueOps, CloseIssue or loader call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no-floating-promises.test.ts: the compiler-API scan finds no unawaited TrackerPort, IssueOps, CloseIssue or loader call | `src/workflow/tracker/__tests__/no-floating-promises.test.ts` |
| pass | no-floating-promises.test.ts: the scan reports a dropped port call, a dropped issue-op call and a dropped CloseIssue or loader, and accepts the awaited and returned forms | `src/workflow/tracker/__tests__/no-floating-promises.test.ts` |

**unit: old-paths-unchanged.test.ts: the old paths are still exported unchanged and the scan stays in report mode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | old-paths-unchanged.test.ts: the old paths are still exported unchanged and the scan stays in report mode | `src/workflow/tracker/__tests__/old-paths-unchanged.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/cli-services-sites.test.ts` | 0 | 1 | 0.5 s |  |
| `src/workflow/tracker/__tests__/no-floating-promises.test.ts` | 0 | 2 | 5.3 s |  |
| `src/workflow/tracker/__tests__/old-paths-unchanged.test.ts` | 0 | 1 | 4.5 s |  |
| `src/workflow/tracker/__tests__/s10-invariants.test.ts` | 0 | 5 | 0.8 s |  |
| `src/workflow/tracker/__tests__/site-list.test.ts` | 0 | 2 | 0.7 s |  |
