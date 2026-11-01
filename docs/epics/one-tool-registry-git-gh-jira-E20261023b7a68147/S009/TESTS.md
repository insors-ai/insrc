<!-- insrc:artifact TESTS-b7a68147dcf72034-s9 -->

# Tests: b7a68147dcf72034 s9

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 44 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T12:40:10.502Z on commit `e437559bc`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: audit-rows.test.ts: every replacement row names its tool and op and says covered or names the missing input**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | audit-rows.test.ts: every replacement row names its tool and op and says covered or names the missing input | `src/workflow/__tests__/audit-rows.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/audit-rows.test.ts` | 0 | 1 | 0.4 s |  |

## t24

Run at 2026-11-01T12:48:01.265Z on commit `8c86a2e60`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: git-status-paths.test.ts: git_status limits its result to the given paths and lists each untracked file with untrackedFiles all**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-status-paths.test.ts: git_status limits its result to the given paths and lists each untracked file with untrackedFiles all | `src/daemon/tools/builtins/git/__tests__/git-status-paths.test.ts` |

**integration: git-ls-tree-full-tree.test.ts: git_ls_tree fullTree lists from the repository root when cwd is a subdirectory**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-ls-tree-full-tree.test.ts: git_ls_tree fullTree lists from the repository root when cwd is a subdirectory | `src/daemon/tools/builtins/git/__tests__/git-ls-tree-full-tree.test.ts` |

**integration: git-log-first-parent.test.ts: git_log firstParent leaves out the commits merged in from a side branch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-log-first-parent.test.ts: git_log firstParent leaves out the commits merged in from a side branch | `src/daemon/tools/builtins/git/__tests__/git-log-first-parent.test.ts` |

**integration: git-rev-list-parents.test.ts: git_rev_list parents returns each commit with its parent shas**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-rev-list-parents.test.ts: git_rev_list parents returns each commit with its parent shas | `src/daemon/tools/builtins/git/__tests__/git-rev-list-parents.test.ts` |

**integration: git-worktree-start-point.test.ts: git_worktree add with createBranch starts the new branch at startPoint**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-worktree-start-point.test.ts: git_worktree add with createBranch starts the new branch at startPoint | `src/daemon/tools/builtins/git/__tests__/git-worktree-start-point.test.ts` |

**integration: git-diff-against-worktree.test.ts: git_diff againstWorktree compares a rev with the working tree**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-diff-against-worktree.test.ts: git_diff againstWorktree compares a rev with the working tree | `src/daemon/tools/builtins/git/__tests__/git-diff-against-worktree.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-diff-against-worktree.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-log-first-parent.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-ls-tree-full-tree.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-rev-list-parents.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-status-paths.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-worktree-start-point.test.ts` | 0 | 1 | 0.7 s |  |

## t2

Run at 2026-11-01T12:53:33.134Z on commit `1ca21ac6e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: git-diff-tree.test.ts: git_diff_tree lists the changed paths of a commit in a real temporary repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-diff-tree.test.ts: git_diff_tree lists the changed paths of a commit in a real temporary repository | `src/daemon/tools/builtins/git/__tests__/git-diff-tree.test.ts` |

**integration: git-merge-tree.test.ts: git_merge_tree reports a clean and a conflicting merge in a real temporary repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-merge-tree.test.ts: git_merge_tree reports a clean and a conflicting merge in a real temporary repository | `src/daemon/tools/builtins/git/__tests__/git-merge-tree.test.ts` |

**unit: git-added-inputs.test.ts: the optional type of git_hash_object and gitPath of git_rev_parse leave existing calls unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-added-inputs.test.ts: the optional type of git_hash_object and gitPath of git_rev_parse leave existing calls unchanged | `src/daemon/tools/builtins/git/__tests__/git-added-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-added-inputs.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-diff-tree.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-merge-tree.test.ts` | 0 | 1 | 0.7 s |  |

## t3

Run at 2026-11-01T12:57:55.413Z on commit `641fa4769`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: git-calls.test.ts: each helper calls its tool through callTool with the caller 'workflow', the site's signal and approval mode**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-calls.test.ts: each helper calls its tool through callTool with the caller 'workflow', the site's signal and approval mode | `src/workflow/__tests__/git-calls.test.ts` |

**unit: git-calls.test.ts: each failure kind maps to the site fallback or GitCallFailed and a denial with each reason is thrown as ToolDenied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-calls.test.ts: each failure kind maps to the site fallback or GitCallFailed and a denial with each reason is thrown as ToolDenied | `src/workflow/__tests__/git-calls.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/git-calls.test.ts` | 0 | 2 | 0.8 s |  |

## t4

Run at 2026-11-01T13:00:38.299Z on commit `b869864a0`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: deadline.test.ts: createDeadline aborts its signal at the budget and dispose clears the timer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deadline.test.ts: createDeadline aborts its signal at the budget and dispose clears the timer | `src/workflow/team/__tests__/deadline.test.ts` |

**unit: sighting-store.test.ts: the lock-lifetime reasoning still holds (the lock lifetime is greater than REFRESH_DEADLINE_MS plus the stop time)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sighting-store.test.ts: the lock-lifetime reasoning still holds (the lock lifetime is greater than REFRESH_DEADLINE_MS plus the stop time) | `src/workflow/team/__tests__/sighting-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/deadline.test.ts` | 0 | 1 | 0.5 s |  |
| `src/workflow/team/__tests__/sighting-store.test.ts` | 0 | 9 | 0.5 s |  |

## t5

Run at 2026-11-01T13:16:09.530Z on commit `36580350e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: no-floating-promises.test.ts: the PolicyReader readers await the widened return**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no-floating-promises.test.ts: the PolicyReader readers await the widened return | `src/workflow/tracker/__tests__/no-floating-promises.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/no-floating-promises.test.ts` | 0 | 3 | 9.3 s |  |

## t6

Run at 2026-11-01T13:50:18.072Z on commit `edbfd36f8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: no-floating-promises.test.ts: the callers of the runners await the widened return**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no-floating-promises.test.ts: the callers of the runners await the widened return | `src/workflow/tracker/__tests__/no-floating-promises.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/no-floating-promises.test.ts` | 0 | 4 | 10.8 s |  |

## t7

Run at 2026-11-01T14:00:19.986Z on commit `3090ca220`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: team-policy-registry.test.ts: policyReader and findAnchor run through the registry on not a repo, no remote, detached HEAD, shallow, valid policy and invalid policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-registry.test.ts: policyReader and findAnchor run through the registry on not a repo, no remote, detached HEAD, shallow, valid policy and invalid policy | `src/workflow/team/__tests__/team-policy-registry.test.ts` |

**integration: team-policy-parity.test.ts: policyReader and findAnchor equal the old functions on the same repositories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-parity.test.ts: policyReader and findAnchor equal the old functions on the same repositories | `src/workflow/team/__tests__/team-policy-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/team-policy-parity.test.ts` | 0 | 1 | 1.5 s |  |
| `src/workflow/team/__tests__/team-policy-registry.test.ts` | 0 | 2 | 1.5 s |  |

## t8

Run at 2026-11-01T14:07:11.524Z on commit `aa19d9697`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: refresh-deadline.test.ts: with a stand-in git that sleeps, the refresh fails with the deadline message at 10 s, starts no call after it, and the process group of the running call is gone within 2 s**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refresh-deadline.test.ts: with a stand-in git that sleeps, the refresh fails with the deadline message at 10 s, starts no call after it, and the process group of the running call is gone within 2 s | `src/workflow/team/__tests__/refresh-deadline.test.ts` |

**integration: refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial and starts no later call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial and starts no later call | `src/workflow/team/__tests__/refresh-abort.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/refresh-abort.test.ts` | 0 | 1 | 1.2 s |  |
| `src/workflow/team/__tests__/refresh-deadline.test.ts` | 0 | 1 | 12.6 s |  |

## t9

Run at 2026-11-01T14:12:13.673Z on commit `68e7b6fcb`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: team-policy-registry.test.ts: the signoff branch checks run through the registry and equal the old results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-registry.test.ts: the signoff branch checks run through the registry and equal the old results | `src/workflow/team/__tests__/team-policy-registry.test.ts` |

**integration: team-policy-parity.test.ts: signoff currentBranchOf and branch-resolution equal the old functions on the same repositories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-parity.test.ts: signoff currentBranchOf and branch-resolution equal the old functions on the same repositories | `src/workflow/team/__tests__/team-policy-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/team-policy-parity.test.ts` | 0 | 2 | 2.2 s |  |
| `src/workflow/team/__tests__/team-policy-registry.test.ts` | 0 | 4 | 2.2 s |  |

## t10

Run at 2026-11-01T14:22:52.694Z on commit `07437c08a`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: team-policy-registry.test.ts: the handoff drafts, park plan and resume checks run through the registry and equal the old results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-registry.test.ts: the handoff drafts, park plan and resume checks run through the registry and equal the old results | `src/workflow/team/__tests__/team-policy-registry.test.ts` |

**integration: team-policy-parity.test.ts: the handoff git reads equal the old functions on the same repositories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | team-policy-parity.test.ts: the handoff git reads equal the old functions on the same repositories | `src/workflow/team/__tests__/team-policy-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/team-policy-parity.test.ts` | 0 | 3 | 2.3 s |  |
| `src/workflow/team/__tests__/team-policy-registry.test.ts` | 0 | 6 | 2.4 s |  |

## t11

Run at 2026-11-01T14:37:11.307Z on commit `9419ae51b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-runners-registry.test.ts: resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, headFullSha, headShortSha and priorCommit run through the registry on real repositories**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-runners-registry.test.ts: resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, headFullSha, headShortSha and priorCommit run through the registry on real repositories | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |

**integration: build-runners-parity.test.ts: range base, build start stamp and standalone record return the old values and write the same records**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-runners-parity.test.ts: range base, build start stamp and standalone record return the old values and write the same records | `src/workflow/runners/build/__tests__/build-runners-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/build-runners-parity.test.ts` | 0 | 1 | 0.9 s |  |
| `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` | 0 | 2 | 0.9 s |  |

## t12

Run at 2026-11-01T14:43:30.952Z on commit `c9b9c6c5e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: build-runners-registry.test.ts: storyChangeSet, newestStoryCommit, mergeInProgress and collectDiff run through the registry including a merge commit, a squash and an empty Story**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-runners-registry.test.ts: storyChangeSet, newestStoryCommit, mergeInProgress and collectDiff run through the registry including a merge commit, a squash and an empty Story | `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` |

**integration: build-runners-parity.test.ts: storyChangeSet and mergeInProgress equal the old results**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-runners-parity.test.ts: storyChangeSet and mergeInProgress equal the old results | `src/workflow/runners/build/__tests__/build-runners-parity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/build-runners-parity.test.ts` | 0 | 2 | 1.8 s |  |
| `src/workflow/runners/build/__tests__/build-runners-registry.test.ts` | 0 | 4 | 2 s |  |

## t13

Run at 2026-11-01T14:48:27.441Z on commit `8c0e4cab8`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | validation-checks-registry.test.ts: trackedFiles, changedFiles and trivialCheckPlan return the old file lists including deleted and untracked files | `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts` | 0 | 2 | 0.7 s |  |

## t14

Run at 2026-11-01T15:04:01.774Z on commit `ddc09371e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: ignore-filter-header-plan-registry.test.ts: createRepoIgnoreFilter, defaultGitUserName and the convert plan reads run through the registry, with names containing spaces and newlines, a non-git directory and a git failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ignore-filter-header-plan-registry.test.ts: createRepoIgnoreFilter, defaultGitUserName and the convert plan reads run through the registry, with names containing spaces and newlines, a non-git directory and a git failure | `src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/ignore-filter-header-plan-registry.test.ts` | 0 | 2 | 0.7 s |  |

## t15

Run at 2026-11-01T15:08:03.291Z on commit `f0f589ca1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file | `src/design/corpus/sources/__tests__/corpus-reader-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/sources/__tests__/corpus-reader-registry.test.ts` | 0 | 3 | 0.9 s |  |

## t16

Run at 2026-11-01T15:11:34.556Z on commit `00639c47e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup, and on a gh without auth status --json the recorded behaviour holds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup, and on a gh without auth status --json the recorded behaviour holds | `src/understanding/__tests__/identity-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/understanding/__tests__/identity-registry.test.ts` | 0 | 2 | 0.6 s |  |

## t17

Run at 2026-11-01T15:15:11.147Z on commit `1aa0d0e4e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: registry-denial-s9.test.ts: for each group of sites and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry-denial-s9.test.ts: for each group of sites and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made | `src/workflow/__tests__/registry-denial-s9.test.ts` |

**integration: registry-denial-s9.test.ts: a destructive-class call with no client is denied on a moved site**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | registry-denial-s9.test.ts: a destructive-class call with no client is denied on a moved site | `src/workflow/__tests__/registry-denial-s9.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/registry-denial-s9.test.ts` | 0 | 2 | 3.3 s |  |

## t18

Run at 2026-11-01T16:01:20.988Z on commit `06743cc43`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the migrated tracker test files pass on the stand-in binaries and none imports the exec seam or the legacy table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the migrated tracker test files pass on the stand-in binaries and none imports the exec seam or the legacy table | `src/workflow/__tests__/migrated-test-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrated-test-files.test.ts` | 0 | 3 | 0.4 s |  |

## t19

Run at 2026-11-01T16:15:13.794Z on commit `f359be1c3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the migrated workflow test files pass on the stand-in binaries and none imports the exec seam or the legacy table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the migrated workflow test files pass on the stand-in binaries and none imports the exec seam or the legacy table | `src/workflow/__tests__/migrated-test-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrated-test-files.test.ts` | 0 | 3 | 23.4 s |  |

## t20

Run at 2026-11-01T16:18:37.462Z on commit `f359be1c3`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: the migrated daemon and cli test files pass on the stand-in binaries and none of the 32 files imports the exec seam or the legacy table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the migrated daemon and cli test files pass on the stand-in binaries and none of the 32 files imports the exec seam or the legacy table | `src/workflow/__tests__/migrated-test-files.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/migrated-test-files.test.ts` | 0 | 3 | 23 s |  |

## t21

Run at 2026-11-01T16:28:03.119Z on commit `3d4187d8b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: old-paths-removed.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary and _setTrackerExecForTests are not exported and the files are gone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | old-paths-removed.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary and _setTrackerExecForTests are not exported and the files are gone | `src/workflow/tracker/__tests__/old-paths-removed.test.ts` |

**unit: build-script.test.ts: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | build-script.test.ts: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions | `scripts/__tests__/build-script.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/build-script.test.ts` | 0 | 1 | 3.4 s |  |
| `src/workflow/tracker/__tests__/old-paths-removed.test.ts` | 0 | 1 | 0.6 s |  |

## t22

Run at 2026-11-01T16:31:08.430Z on commit `11fa643c1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: migration-record.test.ts: docs/plans/tool-registry-migration-record.md lists every table row and every moved site with its test**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | migration-record.test.ts: docs/plans/tool-registry-migration-record.md lists every table row and every moved site with its test | `src/workflow/tracker/__tests__/migration-record.test.ts` |

**unit: site-list.test.ts: every site of the replacement table is a row with a tool and a registry test, and the scan finds none outside the exemptions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | site-list.test.ts: every site of the replacement table is a row with a tool and a registry test, and the scan finds none outside the exemptions | `src/workflow/tracker/__tests__/site-list.test.ts` |

**unit: no-floating-promises.test.ts: the git-calls helpers and the moved functions are awaited**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no-floating-promises.test.ts: the git-calls helpers and the moved functions are awaited | `src/workflow/tracker/__tests__/no-floating-promises.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/migration-record.test.ts` | 0 | 1 | 0.6 s |  |
| `src/workflow/tracker/__tests__/no-floating-promises.test.ts` | 0 | 5 | 12.6 s |  |
| `src/workflow/tracker/__tests__/site-list.test.ts` | 0 | 2 | 3.7 s |  |

## t23

Run at 2026-11-01T16:57:06.958Z on commit `077508d23`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: session-source-inventory.test.ts passes against the regenerated fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**integration: the full sweep (foreground, per area, --test-force-exit) compared by test name with the checkout before s9: no new failure and no new skipped test**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the full sweep (foreground, per area, --test-force-exit) compared by test name with the checkout before s9: no new failure and no new skipped test | `src/workflow/__tests__/s9-sweep-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 15.2 s |  |
| `src/workflow/__tests__/s9-sweep-record.test.ts` | 0 | 1 | 0.4 s |  |
