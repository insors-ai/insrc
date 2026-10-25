<!-- insrc:artifact PLAN-b7a68147dcf72034-s4 -->

# Plan: STORY-b7a68147dcf72034-s4

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792854081539-oscyis`
**LLD effective hash:** `8118b9bf1de5...`

Story s4 puts the 22 existing git tools on the registry's typed contract (typebox schemas that serialise to the same input JSON, a checked output shape, a failure kind on every failed result, and an approval class chosen from the call's input), adds twelve new git tools so the repository's own git reads can leave their private spawns, and records in a coverage table which of git's 169 commands are covered here, left to s8 or excluded. It starts with the shared pieces (failure helpers, runShellBytes, parsers), converts the existing tools in two groups, adds the new tools in two groups, then registers, covers and documents everything; a verification task confirms the late review fixes before the one full sweep.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Typed failures for git tools | L | — | — | unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: spawnFail and fail return the failure kind from the process outcome and git's message and keep output, format, success and error; unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: failureKind maps a ShellResult to missing-tool, timed-out, missing-signin, unreachable or rejected, and withFailure leaves output, format, success, error and data untouched; unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: the registration wrapper adds kind rejected to an unsuccessful result without a failure and leaves a set failure untouched; unit: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: the legacy output and error text of every existing failure path is unchanged; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a git tool in a directory that is not a repository, with git missing from PATH, and past its time limit returns a failure of the right kind; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_merge with a conflict keeps its data and its merge conflict error and carries failure kind rejected; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message | [[c3]] [[c5]] |
| 2 | **`t2`** runShellBytes with stdin, isolation and independent limits | M | — | — | unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: runShellBytes returns stdout bytes unchanged, delivers stdin and applies the isolate environment; unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: runShellBytes reports a stdin write error and a cancellation and leaves runShell unchanged; unit: src/daemon/tools/__tests__/shell-helper-bytes.test.ts: independently lowered stdout and stderr limits behave as the corpus reader's limits do and stderr overflow sets stderrOverflow | [[c1]] [[c4]] |
| 3 | **`t3`** Git porcelain parsers and assertSafeArg | M | — | — | unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: each parser turns fixed sample output into the expected records and handles -z paths with spaces, unicode and newlines; unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: a parser refuses cut output and unknown records; unit: src/daemon/tools/builtins/git/__tests__/git-parsers.test.ts: assertSafeArg rejects a value that starts with a dash or holds a NUL | [[c2]] [[c3]] |
| 4 | **`t4`** Typebox schemas and the five read tools (status, diff, log, show, blame) | L | — | `t1`, `t3` | integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: every git read tool's result fits its declared outputSchema; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing git_show diff read is a failure and a failing numstat read is a warning; integration: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected, git_show maxBytes 100 is clamped, and the schemas are unchanged; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_diff exclude and git_stage empty paths fail with the executor's message through executeTool and with the legacy text directly; unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: every typebox input schema serialises to the same JSON as the schema it replaced; unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: a dash-prefixed path after '--' is accepted and a dash-prefixed ref is rejected | [[c2]] [[c3]] [[c5]] |
| 5 | **`t5`** The other seventeen tools: typebox, output schemas and per-input approval classes | L | — | `t1`, `t4` | unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: each work-destroying operation is destructive and each read is none; unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: git_push deletes and forced refspecs, branch and tag delete, stash drop and clear, hard reset, worktree remove with force and checkout of a path are destructive and each read is none; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: destructive git calls ask through the executor and are not run when declined; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_push ':dev' asks in auto mode and is not run when declined; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: an existing tool called with its old input returns what it returned before; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_fetch depth 0 and 0.5 are rejected and git_fetch depth 1 runs as before; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing git_commit numstat read after a successful commit is a success with a warning; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: every secondary lookup in the git tools is in the inventory and warns on failure; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: a failing precondition read fails the call before any change, and no runShell or helper result is used outside failureKind, a warning or a listed placeholder; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_amend wasPushed, git_reset willNeedForcePush and git_merge listConflicts keep their expected non-zero answers and fail or warn on process failures | [[c1]] [[c2]] [[c3]] [[c5]] |
| 6 | **`t6`** New read tools, part 1 | L | — | `t1`, `t2`, `t3` | integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: every new read tool returns data that fits its outputSchema; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_cat_file returns a binary blob unchanged in base64, batches several revs through stdin, ignores a replacement ref when isolated, rejects an object over maxBytes and stops on cancellation; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_for_each_ref contains, merged, pointsAt and noMerged select the right refs; unit: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_cat_file reports git diagnostics exceed byte limit when stderr passes its limit | [[c2]] [[c4]] |
| 7 | **`t7`** New tools, part 2 | L | — | `t6` | integration: src/daemon/tools/builtins/git/__tests__/git-path-history.test.ts: git_path_history answers the introducing-commit and first-parent queries the callers run today; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_merge_base answers all, unrelated and isAncestor cases with data that fits its schema; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_fetch_refs applies the policy-refresh and maintenance fetches and is destructive for a forced refspec that targets a local branch; integration: src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts: git_symbolic_ref sets, reads and deletes refs/remotes/origin/HEAD with the classes none, common and destructive | [[c2]] [[c4]] |
| 8 | **`t8`** Registration, coverage table, snapshot and docs | M | — | `t5`, `t7` | unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: every command of the recorded list has exactly one owner, an assigned row is never counted as covered and every registered git tool is in the table; unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: multi-operation commands are tracked per subcommand and the operations the existing schemas lack are assigned to s8; integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: every covered row's case runs through executeTool and matches its assertion; integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_amend runs its own case and git_diff with path and paths keeps its legacy failure; integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite and list the new git tools; integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the approval-class mapping covers the new tools and classes | [[c2]] [[c4]] [[c5]] |
| 9 | **`t9`** Confirm the unreviewed review-cycle fixes | S | — | `t8` | integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_amend with no upstream, a non-ancestor and a timed-out upstream read; git_reset hard with an unknown force-push state; git_merge with a failing conflict enumeration; and git_for_each_ref noMerged; integration: src/daemon/tools/builtins/git/__tests__/git-failures.test.ts: git_commit, git_push, git_rebase and git_checkout fail before changing anything when the current-branch or staged-count read cannot run or times out | [[c3]] [[c4]] |
| 10 | **`t10`** Full test sweep | S | — | `t9` | smoke: full sweep: npx tsx --test over src, run once in foreground chunks; failures match the recorded pre-existing set | [[c5]] |

### 1.1 TASK-b7a68147dcf72034-s4-t1 — Typed failures for git tools

Add failureKind(r: ShellResult, opts) and withFailure(result, kind, original?, message?) to helpers.ts; change spawnFail and fail(label, r: ShellResult, opts) to use them (timeout warning only in failure.message); remove branch.ts's local copies; route status, diff, stage, merge, show, log, blame, rebase, cherry-pick, revert and the other failure sites through the helpers or withFailure while keeping legacy text and data; switch every runShell call site to pass the ShellResult; add the registration wrapper that gives kind rejected to any unsuccessful result lacking a failure. Expected non-zero outcomes (amend, reset, merge helper reads) stay apart from process failures.

**Acceptance checks:**
- Every failure site in the LLD inventory returns a failure.kind: missing-tool for a spawn error, timed-out for a killed command, missing-signin or unreachable for push, pull, fetch, clone and ls-remote when git's message shows it, rejected otherwise
- The registration wrapper adds kind rejected to an unsuccessful result without a failure and leaves one that has a failure untouched
- Legacy output and error text of each failing call is unchanged
- The existing git tool tests pass unchanged after this task, before t4 and t5 build on it
- Expected non-zero outcomes of the amend, reset and merge helper reads are not reported as process failures

### 1.2 TASK-b7a68147dcf72034-s4-t2 — runShellBytes with stdin, isolation and independent limits

Add runShellBytes to shell-helper.ts: stdin delivery, isolate (fresh env from PATH only, GIT_* isolation, git-reader's GIT_READ_ARGS), independent stdoutLimit and stderrLimit with stderrOverflow, binary-safe stdout. Existing runShell behaviour is unchanged.

**Acceptance checks:**
- stdin bytes reach the child and a binary stdout round-trips unchanged
- With isolate set the child sees an environment built from PATH only plus the git read arguments, not the caller's GIT_* variables
- stdoutLimit and stderrLimit apply independently and an overflowing stderr sets stderrOverflow without cutting stdout
- runShell callers and their tests are unchanged

### 1.3 TASK-b7a68147dcf72034-s4-t3 — Git porcelain parsers and assertSafeArg

Add parsers.ts with deterministic parsers for status v2 -z (moved out of status.ts), for-each-ref with a fixed format, ls-tree -z, ls-files -z, rev-list, log with a fixed format and record separator, and show-ref. Every parser fails with a rejected failure carrying the raw text in original when the output does not parse or stdoutTruncated is true. Add assertSafeArg(value, position).

**Acceptance checks:**
- Each parser returns the typed records for real git output and fails with original set for malformed output
- A truncated stdout is never turned into a partial list
- status.ts uses the moved parser with identical results
- assertSafeArg rejects a dash-prefixed value in a ref or path position

### 1.4 TASK-b7a68147dcf72034-s4-t4 — Typebox schemas and the five read tools (status, diff, log, show, blame)

Add schemas.ts with typebox result schemas built from the existing Git*Data interfaces, re-exported as Static types under the same names. For git_status, git_diff, git_log, git_show and git_blame rewrite inputSchema as typebox with identical JSON, declare outputSchema, place option terminators, apply assertSafeArg, and handle the secondary reads: git_show's diff read is a real failure and its numstat read adds data.warnings. Apply the compatibility rejections (git_log limit 0 or 501, git_diff maxBytes 100 and context 51, malformed git_diff exclude or paths, git_diff path plus paths keeps its legacy failure, git_show maxBytes stays clamped).

**Acceptance checks:**
- Each of the five tools' typebox input schema serialises to the same JSON as the schema it replaced
- Each of the five returns data that passes its outputSchema for a real temporary repository
- git_show with a failing diff read fails the call; a failing numstat read succeeds with data.warnings
- The documented compatibility inputs are rejected by the executor and the legacy ones still behave as before

### 1.5 TASK-b7a68147dcf72034-s4-t5 — The other seventeen tools: typebox, output schemas and per-input approval classes

For git_stage, git_commit, git_amend, git_push, git_pull, git_fetch, git_reset, git_merge, git_rebase, git_revert, git_cherry-pick, git_checkout, git_branch, git_tag, git_stash, git_worktree and git_remote rewrite inputSchema as typebox with identical JSON, declare outputSchema, apply assertSafeArg and terminators, and set approval as a function of the input: destructive for hard reset, force or plus-prefixed or colon-delete push, branch and tag delete, stash drop and clear, worktree remove with force, checkout of a path or with discard; common otherwise, none for reads such as branch, tag, stash, worktree and remote listing. Post-mutation secondary reads (commit numstat, stage, revert, checkout, cherry-pick) keep placeholders and add data.warnings; precondition reads (git_reset and git_push lookups) fail the call before any change. Add the grep test that pins the inventory of ignored secondary lookups. Reject empty git_stage paths and git_fetch depth below 1.

**Acceptance checks:**
- All 22 existing git tools (the five of t4 and these seventeen) declare an outputSchema
- Every destructive operation listed in the LLD asks in every mode, including auto, and is not run when declined
- Every non-destructive mutation and read resolves to common or none as listed
- A failed post-mutation secondary read leaves the mutation's result successful with data.warnings; a failed precondition read fails before anything changes
- The grep test fails when an ignored secondary lookup is added that the inventory does not list
- Typebox input schemas serialise to the same JSON as before

### 1.6 TASK-b7a68147dcf72034-s4-t6 — New read tools, part 1

Add git_rev_parse, git_rev_list, git_ls_files, git_ls_tree, git_cat_file (batch, base64, isolation via runShellBytes) and git_for_each_ref (merged, noMerged, pointsAt, contains) each with typebox input and output schema, no free-form argument list, the same spawn, timeout and failure path, and parsers from t3.

**Acceptance checks:**
- Each tool returns the documented shape against a real temporary repository
- git_cat_file batch returns binary content intact as base64 and honours the isolation
- git_for_each_ref filters by merged, noMerged, pointsAt and contains correctly
- Unsafe arguments are rejected and each tool has approval none

### 1.7 TASK-b7a68147dcf72034-s4-t7 — New tools, part 2

Add git_symbolic_ref (get, set, delete), git_show_ref (with exists), git_merge_base (with bases), git_hash_object, git_path_history and git_fetch_refs with typebox schemas. git_symbolic_ref set and delete and git_fetch_refs carry their approval classes per the LLD; the others are none.

**Acceptance checks:**
- Each tool returns the documented shape against a real temporary repository
- git_symbolic_ref set and delete change HEAD or the named ref and ask according to their class
- git_merge_base returns bases, and git_show_ref exists reports presence without failing the call
- git_fetch_refs fetches the named refs only and maps unreachable and missing-signin failures

### 1.8 TASK-b7a68147dcf72034-s4-t8 — Registration, coverage table, snapshot and docs

Register all tools in index.ts; add coverage.ts (GIT_COVERAGE with three owners: covered, assigned to s8, excluded with reason, per subcommand, git_amend's commit case included) built from git 2.53.0's 169 commands and its test that runs each covered case through executeTool in a temporary repository; update the 228-tool snapshot and approval-class mapping test for the new tools and classes; add the coverage table to docs/daemon.md.

**Acceptance checks:**
- The coverage test checks a fixed fixture of the 169 command names, not the installed git, and accounts for every one with exactly one owner
- Every covered row runs through executeTool in a temporary repository
- The tool id and input schema snapshot matches for the existing tools and lists the new ones
- The approval-class mapping test covers the new tools and the destructive classes
- docs/daemon.md shows the coverage table

### 1.9 TASK-b7a68147dcf72034-s4-t9 — Confirm the unreviewed review-cycle fixes

Verify that each fix made after the last review round has an implementation and a test: noMerged on git_for_each_ref, expected non-zero helper outcomes for amend, reset and merge kept apart from process failures, independent stdout and stderr limits on runShellBytes, git_merge_base bases, git_fetch depth below 1 in the compatibility audit, the commit numstat read as an inventoried secondary read, the three-owner coverage test, and the git_reset and git_push lookups in the secondary-read inventory with the grep test t5 built. Fill any gap found.

**Acceptance checks:**
- A written table maps each listed fix to the file that implements it and the test that pins it
- Any fix without both is implemented or tested before the task ends
- The secondary-read grep test is shown to fail when an unlisted ignored lookup is added

### 1.10 TASK-b7a68147dcf72034-s4-t10 — Full test sweep

Run the full test sweep once in foreground chunks, compare failures with the known pre-existing set (LMDB lock, config acceptance-mapping, plugin catalog and ledger, convert-repeat and build-record, workflow and build-start failures from earlier commits), and record the outcome in docs/plans/tool-registry.md.

**Acceptance checks:**
- No failing test outside the known pre-existing set
- The sweep result and the pre-existing failures are recorded in docs/plans/tool-registry.md

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| each parser in parsers.ts turns fixed sample output into the expected records, handles -z paths with spaces, unicode and newlines, and rejects a record it does not understand | `t3` |
| a parser refuses output that ShellResult.stdoutTruncated marks as cut instead of returning a partial list | `t3` |
| spawnFail returns kind missing-tool, and fail returns timed-out, missing-signin, unreachable or rejected from the process outcome and git's message while keeping output, format, success and error unchanged | `t1` |
| the approval function of each tool returns the class listed in the contract for every operation and flag, and a function given a malformed input throws or returns a class the executor treats as destructive | `t4`, `t5` |
| the GIT_COVERAGE table lists every command of the recorded git 2.53.0 list under exactly one owner (covered here, assigned to s8, or excluded with a reason), a covered row has a case and is registered, an assigned row is never counted as covered, every registered git tool is in the table, and a command only the installed git knows is logged, not failed | `t8` |
| assertSafeArg rejects a value that starts with a dash or holds a NUL, and each tool places refs and paths after the option terminator | `t3`, `t4`, `t5` |
| the registration wrapper adds failure kind rejected to an unsuccessful result that has none and leaves a failure the tool set untouched | `t1` |
| the push classifier returns destructive for force flags, a leading '+', an empty-source refspec such as ':dev' and a delete, and common for a plain branch, tag or 'src:dst' | `t5` |
| the output and error text of every spawn and non-zero failure path of the 22 existing tools, including the legacy git:status, git:diff and git:stage labels, matches a table recorded before the change | `t1`, `t4`, `t5` |
| failureKind returns missing-tool, timed-out, missing-signin, unreachable or rejected from a ShellResult, and withFailure leaves output, format, success, error and data untouched on git_diff's numstat failure and git_merge's conflict result | `t1` |
| runShellBytes returns stdout bytes unchanged, delivers stdin, applies the isolate environment, reports a stdin write error and a cancellation, and leaves runShell's behaviour unchanged | `t2` |
| the coverage table has one row per subcommand for every multi-operation command (refs, stash, worktree, remote, branch, tag, reflog), each owned by s4, s8 or excluded, and a command marked covered never hides an assigned operation | `t8` |
| runShellBytes kills the process and sets stderrOverflow when stderr passes a lowered stderrLimit independent of stdoutLimit, and git_cat_file reports 'git diagnostics exceed byte limit' | `t2`, `t6` |
| every new read tool returns data that fits its outputSchema for a repository with commits, a detached HEAD and an unborn branch | `t6`, `t7` |
| git_reset hard, git_push with force, git_branch delete, git_tag delete, git_stash drop and clear, git_worktree remove with force and git_checkout of a path ask for approval through the executor and are not run when declined, and a plain push, a soft reset and a branch create ask only under the common setting | `t5` |
| an existing tool called with its old input (git_branch list, git_reset mixed, git_push, git:cherry-pick start) returns the same output, format and error as before and now also a data payload that fits its schema | `t4`, `t5` |
| a git tool called in a directory that is not a repository, with git missing from PATH, and past its time limit returns a failure of the right kind | `t1` |
| git_merge with a conflict keeps its data and its 'merge conflict' error and carries failure kind rejected | `t1`, `t5` |
| a timed-out mutating call carries kind timed-out and the unknown-outcome sentence in failure.message while output and error match today's text | `t1` |
| git_push ':dev' and '+main' ask through the executor in auto mode and are not run when declined | `t5` |
| git_show with a failing numstat still succeeds, returns the same files-less data as before and adds data.warnings | `t4` |
| every covered row of GIT_COVERAGE runs its case through executeTool in a temporary repository and the result and the repository change match the row's assertion | `t8` |
| git_show with a failing diff read fails with the right kind, and with a failing numstat read succeeds with data.warnings | `t4` |
| git_log limit 0 and 501, git_diff maxBytes 100 and git_diff context 51 are rejected with a failure naming the field, and git_show maxBytes 100 is accepted and clamped as today | `t4` |
| git_path_history returns the introducing commit that range-base.ts's query returns for HEAD, and for a tracking branch that differs from HEAD the first-parent reversed list with sha and committerTime that anchor-finder.ts reads | `t7` |
| git_for_each_ref contains replaces branch -r --contains, git_remote list returns the urls remote get-url returns, and git_diff staged true answers 'diff --cached --quiet' | `t4`, `t5`, `t6` |
| git_merge_base returns every common ancestor with all true, an empty list for unrelated histories, and isAncestor true and false | `t7` |
| git_commit with a failing numstat read still succeeds and adds data.warnings, and git_fetch depth 0 is rejected | `t5` |
| git_reset and git_push with a failing short-sha lookup after a successful mutation still succeed and add data.warnings, and every runShell result in the git tools has its code checked or is listed in the secondary-lookup inventory | `t5` |
| git_diff with a malformed exclude fails with the executor's message through executeTool and with the legacy text when execute is called directly | `t4` |
| git_cat_file returns a binary blob unchanged in base64, batches several revs through stdin, ignores a replacement ref when isolated, rejects an object over maxBytes and stops on cancellation; the design corpus reader's own tests pass unchanged against it | `t6` |
| git_fetch_refs applies the policy-refresh and maintenance fetches (no tags, no FETCH_HEAD, explicit refspec, empty refmap) and is destructive for a forced refspec that targets a local branch | `t7` |
| git_symbolic_ref sets, reads and deletes refs/remotes/origin/HEAD with the classes none, common and destructive | `t7` |
| git_amend runs its own case in the coverage table; git_diff with path and paths keeps its legacy failure | `t4`, `t8` |
| git_commit, git_push, git_rebase and git_checkout fail before changing anything when the current-branch or staged-count read cannot run or times out, and report a detached HEAD as before; git_cat_file in isolated mode ignores inherited GIT_CONFIG_*, alternate object stores and replacement refs and never fetches lazily | `t5`, `t6`, `t9` |
| git_amend with no upstream, a non-ancestor and a timed-out upstream read; git_reset hard with an unknown force-push state; git_merge with a failing conflict enumeration; and git_for_each_ref noMerged | `t5`, `t6`, `t9` |
| the 228-tool snapshot of ids and input schemas in src/daemon/tools/__tests__/fixtures/approval-snapshot.json still matches for every tool that existed before, and lists the new git tools | `t8` |
| the approval-class mapping test passes with the new classes and the new tools | `t8` |
| every typebox input schema of the 22 existing tools serialises to the same JSON as the schema it replaced | `t4`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 section 2 Contract details (registerGitTools, spawnFail, fail, failureKind, withFailure, approval, runShellBytes)`
- **[[c2]]** `prior-artifact` `LLD s4 section 3 Data model changes (schemas, parsers, new git tools, coverage table, approval classes)`
- **[[c3]]** `prior-artifact` `LLD s4 section 5 Error paths (failure kinds, secondary and precondition reads, compatibility rejections)`
- **[[c4]]** `prior-artifact` `LLD s4 section 6 Test strategy`
- **[[c5]]** `prior-artifact` `LLD s4 section 7 Migration (steps 1 to 7)`
