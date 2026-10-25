<!-- insrc:artifact TESTS-b7a68147dcf72034-s4 -->

# Tests: b7a68147dcf72034 s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 68 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-24T19:14:12.276Z on commit `15aecaefc`. Tests check: **passed**. 19 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: spawnFail and fail return the failure kind from the process outcome and git's message and keep output, format, success and error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | spawnFail and fail return the failure kind from the process outcome and git's message and keep output, format, success and error | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: failureKind maps a ShellResult to missing-tool, timed-out, missing-signin, unreachable or rejected, and withFailure leaves output, format, success, error and data untouched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | failureKind maps a ShellResult to missing-tool, timed-out, missing-signin, unreachable or rejected, and withFailure leaves output, format, success, error and data untouched | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: the registration wrapper adds kind rejected to an unsuccessful result without a failure and leaves a set failure untouched**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the registration wrapper adds kind rejected to an unsuccessful result without a failure and leaves a set failure untouched | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: the legacy output and error text of every existing failure path is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the legacy output and error text of every existing failure path is unchanged | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |
| pass | T22: exclude removes a file from BOTH the diff body and the file list; a kept file stays in both | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T22: an excluded file does not count against maxBytes | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T23: with no exclude, and with an empty one, both argument vectors are exactly today's | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T23: the body and the numstat command receive the SAME pathspecs | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T24: path stays the positive pathspec when exclude is given, and the exclusions narrow it | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T25: a malformed exclude is invalid-input and git is not run | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | T25: the closed input schema declares exclude as an array of non-empty strings | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |
| pass | git_diff limits the body and file list to the given paths, literally | `src/daemon/tools/builtins/git/__tests__/git-diff-paths.test.ts` |
| pass | git_diff rejects paths together with path and an empty paths array | `src/daemon/tools/builtins/git/__tests__/git-diff-paths.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a git tool in a directory that is not a repository, with git missing from PATH, and past its time limit returns a failure of the right kind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a git tool in a directory that is not a repository, with git missing from PATH, and past its time limit returns a failure of the right kind | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |
| pass | git_commit and git_push keep their legacy refusals in a repository and fail before any change when a precondition read cannot run | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_merge with a conflict keeps its data and its merge conflict error and carries failure kind rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_merge with a conflict keeps its data and its merge conflict error and carries failure kind rejected | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |
| pass | the helper reads of amend and reset keep git's documented answers apart from process failures | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/diff.test.ts` | 0 | 8 | 0.5 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-diff-paths.test.ts` | 0 | 2 | 0.4 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` | 0 | 9 | 1.6 s |  |

## t2

Run at 2026-10-24T19:28:09.769Z on commit `9b930c922`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: runShellBytes returns stdout bytes unchanged, delivers stdin and applies the isolate environment**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShellBytes returns stdout bytes unchanged, delivers stdin and applies the isolate environment | `src/daemon/tools/__tests__/shell-helper-bytes.test.ts` |

**unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: runShellBytes reports a stdin write error and a cancellation and leaves runShell unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runShellBytes reports a stdin write error and a cancellation and leaves runShell unchanged | `src/daemon/tools/__tests__/shell-helper-bytes.test.ts` |
| pass | runShell decodes both streams across chunks and preserves byte-based output limits | `src/shared/__tests__/utf8-stream.test.ts` |
| pass | the shell helper says when stdout passed its cap, and not otherwise | `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` |

**unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: independently lowered stdout and stderr limits behave as the corpus reader's limits do and stderr overflow sets stderrOverflow**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | independently lowered stdout and stderr limits behave as the corpus reader's limits do and stderr overflow sets stderrOverflow | `src/daemon/tools/__tests__/shell-helper-bytes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/shell-helper-bytes.test.ts` | 0 | 3 | 0.7 s |  |
| `src/daemon/tools/builtins/search/__tests__/grep-omitted.test.ts` | 0 | 8 | 30.6 s |  |
| `src/shared/__tests__/utf8-stream.test.ts` | 0 | 12 | 0.5 s |  |

## t3

Run at 2026-10-24T19:35:37.090Z on commit `cb67eaa01`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: each parser turns fixed sample output into the expected records and handles -z paths with spaces, unicode and newlines**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each parser turns fixed sample output into the expected records and handles -z paths with spaces, unicode and newlines | `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` |
| pass | each parser reads real git output | `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: a parser refuses cut output and unknown records**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a parser refuses cut output and unknown records | `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: assertSafeArg rejects a value that starts with a dash or holds a NUL**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assertSafeArg rejects a value that starts with a dash or holds a NUL | `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts` | 0 | 4 | 0.4 s |  |

## t4

Run at 2026-10-24T19:51:06.459Z on commit `098af9a2d`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: every git read tool's result fits its declared outputSchema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every git read tool's result fits its declared outputSchema | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing git_show diff read is a failure and a failing numstat read is a warning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing git_show diff read is a failure and a failing numstat read is a warning | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected, git_show maxBytes 100 is clamped, and the schemas are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected, git_show maxBytes 100 is clamped, and the schemas are unchanged | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_diff exclude and git_stage empty paths fail with the executor's message through executeTool and with the legacy text directly**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_diff exclude and git_stage empty paths fail with the executor's message through executeTool and with the legacy text directly | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: every typebox input schema serialises to the same JSON as the schema it replaced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every typebox input schema serialises to the same JSON as the schema it replaced | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: a dash-prefixed path after '--' is accepted and a dash-prefixed ref is rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a dash-prefixed path after '--' is accepted and a dash-prefixed ref is rejected | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |
| pass | T25: a malformed exclude is invalid-input and git is not run | `src/daemon/tools/builtins/git/__tests__/diff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/diff.test.ts` | 0 | 8 | 0.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` | 0 | 11 | 1.2 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` | 0 | 1 | 0.5 s |  |

## t5

Run at 2026-10-24T20:06:36.500Z on commit `d171bcb64`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: each work-destroying operation is destructive and each read is none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each work-destroying operation is destructive and each read is none | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |
| pass | approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: git_push deletes and forced refspecs, branch and tag delete, stash drop and clear, hard reset, worktree remove with force and checkout of a path are destructive and each read is none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_push deletes and forced refspecs, branch and tag delete, stash drop and clear, hard reset, worktree remove with force and checkout of a path are destructive and each read is none | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: destructive git calls ask through the executor and are not run when declined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | destructive git calls ask through the executor and are not run when declined | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_push ':dev' asks in auto mode and is not run when declined**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_push ':dev' asks in auto mode and is not run when declined | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: an existing tool called with its old input returns what it returned before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an existing tool called with its old input returns what it returned before | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_fetch depth 0 and 0.5 are rejected and git_fetch depth 1 runs as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_fetch depth 0 and 0.5 are rejected and git_fetch depth 1 runs as before | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing git_commit numstat read after a successful commit is a success with a warning**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing git_commit numstat read after a successful commit is a success with a warning | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: every secondary lookup in the git tools is in the inventory and warns on failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every secondary lookup in the git tools is in the inventory and warns on failure | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing precondition read fails the call before any change, and no runShell or helper result is used outside failureKind, a warning or a listed placeholder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a failing precondition read fails the call before any change, and no runShell or helper result is used outside failureKind, a warning or a listed placeholder | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_amend wasPushed, git_reset willNeedForcePush and git_merge listConflicts keep their expected non-zero answers and fail or warn on process failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_amend wasPushed, git_reset willNeedForcePush and git_merge listConflicts keep their expected non-zero answers and fail or warn on process failures | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-class-mapping.test.ts` | 0 | 4 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` | 0 | 5 | 6.2 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` | 0 | 15 | 7.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` | 0 | 5 | 1 s |  |

## t6

Run at 2026-10-24T20:12:22.293Z on commit `a45715791`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: every new read tool returns data that fits its outputSchema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every new read tool returns data that fits its outputSchema | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_cat_file returns a binary blob unchanged in base64, batches several revs through stdin, ignores a replacement ref when isolated, rejects an object over maxBytes and stops on cancellation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_cat_file returns a binary blob unchanged in base64, batches several revs through stdin, ignores a replacement ref when isolated, rejects an object over maxBytes and stops on cancellation | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_for_each_ref contains, merged, pointsAt and noMerged select the right refs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_for_each_ref contains, merged, pointsAt and noMerged select the right refs | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_cat_file reports git diagnostics exceed byte limit when stderr passes its limit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_cat_file reports git diagnostics exceed byte limit when stderr passes its limit | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` | 0 | 9 | 1.5 s |  |

## t7

Run at 2026-10-24T20:17:03.247Z on commit `044875a45`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-path-history.test.ts: git_path_history answers the introducing-commit and first-parent queries the callers run today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_path_history answers the introducing-commit and first-parent queries the callers run today | `src/daemon/tools/builtins/git/__tests__/git-path-history.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_merge_base answers all, unrelated and isAncestor cases with data that fits its schema**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_merge_base answers all, unrelated and isAncestor cases with data that fits its schema | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_fetch_refs applies the policy-refresh and maintenance fetches and is destructive for a forced refspec that targets a local branch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_fetch_refs applies the policy-refresh and maintenance fetches and is destructive for a forced refspec that targets a local branch | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_symbolic_ref sets, reads and deletes refs/remotes/origin/HEAD with the classes none, common and destructive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_symbolic_ref sets, reads and deletes refs/remotes/origin/HEAD with the classes none, common and destructive | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |
| pass | every new read tool returns data that fits its outputSchema | `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-path-history.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts` | 0 | 12 | 1.7 s |  |

## t8

Run at 2026-10-24T20:23:17.636Z on commit `4b39b2975`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: every command of the recorded list has exactly one owner, an assigned row is never counted as covered and every registered git tool is in the table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every command of the recorded list has exactly one owner, an assigned row is never counted as covered and every registered git tool is in the table | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: multi-operation commands are tracked per subcommand and the operations the existing schemas lack are assigned to s8**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | multi-operation commands are tracked per subcommand and the operations the existing schemas lack are assigned to s8 | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: every covered row's case runs through executeTool and matches its assertion**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_amend runs its own case and git_diff with path and paths keeps its legacy failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_amend runs its own case and git_diff with path and paths keeps its legacy failure | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite and list the new git tools**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |
| pass | approval-class-mapping.test.ts: the twelve git tools of Story s4 are registered, ten of them reads and two per-input | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |
| pass | docs/daemon.md shows the coverage table | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the approval-class mapping covers the new tools and classes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |
| pass | each work-destroying operation is destructive and each read is none | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-class-mapping.test.ts` | 0 | 5 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` | 0 | 5 | 0.5 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 5 | 5 s |  |

## t9

Run at 2026-10-24T20:29:04.117Z on commit `764f90787`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_amend with no upstream, a non-ancestor and a timed-out upstream read; git_reset hard with an unknown force-push state; git_merge with a failing conflict enumeration; and git_for_each_ref noMerged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_amend with no upstream, a non-ancestor and a timed-out upstream read; git_reset hard with an unknown force-push state; git_merge with a failing conflict enumeration; and git_for_each_ref noMerged | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_commit, git_push, git_rebase and git_checkout fail before changing anything when the current-branch or staged-count read cannot run or times out**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git_commit, git_push, git_rebase and git_checkout fail before changing anything when the current-branch or staged-count read cannot run or times out | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |
| pass | a failing precondition read fails the call before any change, and no runShell or helper result is used outside failureKind, a warning or a listed placeholder | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |
| pass | every secondary lookup in the git tools is in the inventory and warns on failure | `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-failures.test.ts` | 0 | 17 | 3.3 s |  |

## t10

Run at 2026-10-24T20:34:21.426Z on commit `fd9380674`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: full sweep: npx tsx --test over src, run once in foreground chunks; failures match the recorded pre-existing set**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/tool-registry.md, section 's4 full sweep (2026-10-25)': per-directory results; all failures of the s1 sweep unchanged; the one new failure (artifact-write-inventory.test.ts) is from the user's daemon-shutdown commits e5468d372, 873e425dd, a61dd8d11 and 77595a1ec, outside s4. Logs in /tmp/sweep-s4/*.log.
