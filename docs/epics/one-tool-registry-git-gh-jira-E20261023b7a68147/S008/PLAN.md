<!-- insrc:artifact PLAN-b7a68147dcf72034-s8 -->

# Plan: STORY-b7a68147dcf72034-s8

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1793616150496-2l9hup`
**LLD effective hash:** `9fcc90f081df...`

Building s8 means one new git op-table builder, then eight small steps that each add a family of operations (or widen five existing tools) and prove their own coverage rows through executeTool in a temporary repository. The no-assigned-row rule is switched on only in the last Task, which also records the excluded commands, registers the tools, updates the inventory and snapshot tests, and runs the full sweep once.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Git op table: the family builder and the extension of an existing tool | L | — | — | unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: buildGitFamilyTool makes a flat input schema with an op enum and an output union carrying the literal op; unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: buildGitFamilyTool throws at build time for a duplicate op, an op without a class, a stdin op without a stdin field and disagreeing shared fields; unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a field the op does not take and a value outside its pattern are refused before any approval request; unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a cut stdout is a rejected failure and a result outside the answer member is a schema-mismatch failure; unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a stdin delivery error is a failure with no answer; unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: extendGitTool keeps existing inputs and classes and throws for a collision | [[c1]] [[c2]] [[c4]] |
| 2 | **`t2`** git_inspect: the read-only queries | L | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_inspect covered rows run through executeTool in a temporary repository; integration: src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts: a no-match exit gives an empty answer and no git_inspect op asks for approval | [[c1]] [[c3]] [[c6]] |
| 3 | **`t3`** git_text: the filters that read standard input | M | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_text covered rows receive their content and return the command's answer; integration: src/daemon/tools/builtins/git/__tests__/git-text.test.ts: empty content, over-budget content and a failed delivery | [[c1]] [[c2]] [[c3]] [[c6]] |
| 4 | **`t4`** git_objects: object, index and ref writes | L | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_objects covered rows change the object, ref or index as the command does; integration: src/daemon/tools/builtins/git/__tests__/git-objects.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common; integration: src/daemon/tools/builtins/git/__tests__/git-objects.test.ts: a failed stdin delivery reports nothing as applied | [[c1]] [[c2]] [[c3]] [[c6]] |
| 5 | **`t5`** git_patch: patches, archives and bundles | M | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_patch covered rows produce or apply the patch, archive or bundle; integration: src/daemon/tools/builtins/git/__tests__/git-patch.test.ts: an op writing a named file is destructive, the same op without one is not, and a denial leaves the file unchanged | [[c1]] [[c3]] [[c6]] |
| 6 | **`t6`** git_tree: worktree and index operations | L | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_tree covered rows change the working tree or index as the command does; integration: src/daemon/tools/builtins/git/__tests__/git-tree.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common; integration: src/daemon/tools/builtins/git/__tests__/git-tree.test.ts: a command the installed git lacks fails with git's message and the recorded version | [[c1]] [[c3]] [[c6]] |
| 7 | **`t7`** git_maintenance, git_setup, git_refs and git_reflog | L | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_maintenance, git_setup, git_refs and git_reflog covered rows run through executeTool in a temporary repository; integration: src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts: gc with prune now, prune and reflog expire and delete are denied with no client before git starts; integration: src/daemon/tools/builtins/git/__tests__/git-setup.test.ts: init in an existing repository reinitialises and reports it | [[c1]] [[c3]] [[c6]] |
| 8 | **`t8`** Extend git_stash, git_worktree, git_remote, git_branch and git_tag | M | — | `t1` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: the new ops of git_stash, git_worktree, git_remote, git_branch and git_tag change the repository as the command does; unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: the pinned inputs of the five extended tools are unchanged and the new inputs are listed as added by s8 | [[c1]] [[c3]] [[c6]] |
| 9 | **`t9`** Close out: exclusions, registration, inventory, docs and the full sweep | M | — | `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8` | integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: no row is assigned, every excluded row has a reason and every command has a row; unit: src/daemon/tools/builtins/git/__tests__/typed-git-tools.test.ts: gitToolDefinitions matches every tool the git files export and each is registered as withFailureNet(tool) | [[c1]] [[c3]] [[c5]] [[c6]] |

### 1.1 TASK-b7a68147dcf72034-s8-t1 — Git op table: the family builder and the extension of an existing tool

Add src/daemon/tools/builtins/git/op-table.ts with GitOpSpec, buildGitFamilyTool and extendGitTool: flat input schema with an op enum built from the gh field helpers, output union with a literal op, rules that refuse fields an op does not take, ref and path checks, stdin delivery through runShellBytes, cut-output and union checks, the per-op approval class (fixed or a function of the input), time limits and typed failures. No tool uses it yet. Unit tests with a stand-in git.

**Acceptance checks:**
- buildGitFamilyTool throws at build time for a duplicate op, an op without a class, a stdin op without a stdin field and two ops that disagree about a shared field
- A field the op does not take and a value outside its pattern are refused before any approval request is built
- A cut stdout is a rejected failure whose partial text is not returned, and a result outside the op's answer member is a schema-mismatch failure with the original text kept
- A stdin delivery error is a failure and no answer is parsed
- extendGitTool keeps every existing input valid with the same result and class, and throws for a name or field collision
- The gh files are unchanged

### 1.2 TASK-b7a68147dcf72034-s8-t2 — git_inspect: the read-only queries

Add git_inspect (class none) with the read-only ops of the LLD (describe, name-rev, cherry, shortlog, show-branch, grep, last-modified, count-objects, var, version, check-attr, check-ignore, check-mailmap, check-ref-format, get-tar-commit-id, diff-files, diff-index, diff-pairs, range-diff, show-index, verify-commit, verify-tag, verify-pack, fsck, fsck-objects, pack-redundant, repo), each with its answer shape; a no-match exit gives a found false or an empty list. Mark each covered in the coverage table with a case through executeTool in a temporary repository. The no-assigned-row rule stays off until t9; this Task checks only its own rows.

**Acceptance checks:**
- Every git_inspect op has a coverage case that runs through executeTool in a temporary repository and checks the result
- A command that exits 1 to mean no match gives an empty answer, not a failure
- No git_inspect op asks for approval
- The coverage rows of these ops are covered, not assigned

### 1.3 TASK-b7a68147dcf72034-s8-t3 — git_text: the filters that read standard input

Add git_text with column, stripspace, interpret-trailers, fmt-merge-msg, patch-id, mailinfo and mailsplit, each taking its content as an input and sending it through runShellBytes, with the input-budget refusal and the empty-content case. Mark the rows covered with cases; only this Task's own rows are checked.

**Acceptance checks:**
- Each op receives the content given as its input and returns the command's answer
- Empty content is delivered as empty input
- Content over the input budget is refused before git starts
- A failed delivery is a failure of the tool with no answer

### 1.4 TASK-b7a68147dcf72034-s8-t4 — git_objects: object, index and ref writes

Add git_objects with commit-tree, mktree, mktag, write-tree, read-tree, update-index, replace, notes, fast-import, unpack-objects, index-pack and pack-objects, with the destructive classes the LLD lists (read-tree --reset, notes remove and prune, replace delete) as input-dependent functions tested for both branches, and the stdin ops. Mark the rows covered with cases and approval cases; only this Task's own rows are checked.

**Acceptance checks:**
- Each op has a coverage case that checks the object, ref or index it changes
- Each destructive input asks for approval and is denied with no client before git starts, and the safe input is common
- A stdin delivery that fails is a failure with nothing reported as applied

### 1.5 TASK-b7a68147dcf72034-s8-t5 — git_patch: patches, archives and bundles

Add git_patch with apply, am, format-patch, archive, bundle, fast-export, diagnose and bugreport. An op that writes a named file (archive --output, format-patch --output-directory, bundle create, diagnose and bugreport output, fast-export to a file) is destructive; the same op without a file is common or none. Mark the rows covered with cases; only this Task's own rows are checked.

**Acceptance checks:**
- Each op has a coverage case that checks the patch, archive or bundle it produces or applies
- An op writing over a named file is destructive and the same op without one is not, both tested
- Denied with no client before git starts leaves the repository and the file unchanged

### 1.6 TASK-b7a68147dcf72034-s8-t6 — git_tree: worktree and index operations

Add git_tree with checkout-index, clean, restore, mv, sparse-checkout, submodule, rerere, merge-file, bisect and replay, with the destructive inputs (clean, restore of the worktree, checkout-index force, mv --force, submodule deinit and forced update, merge-file writing in place) as input-dependent classes. Mark the rows covered with cases and approval cases; only this Task's own rows are checked.

**Acceptance checks:**
- Each op has a coverage case that checks the working tree or index effect
- Every destructive input asks every time and is denied with no client before git starts, and the safe input is common
- replay and other newer commands fail with git's message and the recorded version when git is older

### 1.7 TASK-b7a68147dcf72034-s8-t7 — git_maintenance, git_setup, git_refs and git_reflog

Add git_maintenance (gc, repack, prune, prune-packed, pack-refs, multi-pack-index, maintenance, commit-graph, backfill), git_setup (init, init-db, clone), git_refs (verify, migrate, optimize) and git_reflog (show, list, exists, expire, delete, write), with gc --prune=now, prune, reflog expire and delete as destructive and the rest common or none; init in an existing repository reports reinitialised true. Mark the rows covered with cases; only this Task's own rows are checked.

**Acceptance checks:**
- Each op has a coverage case through executeTool in a temporary repository
- gc with prune now, prune, reflog expire and reflog delete are destructive and denied with no client before git starts
- git init in a repository reinitialises without loss and reports it

### 1.8 TASK-b7a68147dcf72034-s8-t8 — Extend git_stash, git_worktree, git_remote, git_branch and git_tag

Use extendGitTool to add the missing ops: stash (branch, create, store, export, import), worktree (lock, unlock, repair), remote (show, prune, update, set-head, set-branches, set-url --add, set-url --delete), branch (rename, copy, set-upstream-to, unset-upstream, edit-description) and tag (verify, sign). Remote prune is destructive. Re-pin the input snapshots with the new inputs listed as added by s8, and mark the rows covered with cases; only this Task's own rows are checked.

**Acceptance checks:**
- Every input that was valid for the five tools gives the same result and class as before
- Each new op has a coverage case that checks its effect
- The pinned input snapshot lists the new inputs as added by s8 and no existing input changed

### 1.9 TASK-b7a68147dcf72034-s8-t9 — Close out: exclusions, registration, inventory, docs and the full sweep

Mark for-each-repo, hook, filter-branch, merge-octopus, merge-ours, merge-recursive, merge-recursive-ours, merge-recursive-theirs, merge-resolve, merge-subtree, subtree, request-pull and quiltimport excluded with the reasons the user gave (no program needs request-pull or quiltimport). Register the new tools in definitions.ts as withFailureNet(tool), update the inventory and registration tests, turn on the rule in git-coverage.test.ts that fails for any row still assigned, write the s8 outcome in docs/plans/tool-registry.md, then run the full sweep once.

**Acceptance checks:**
- No coverage row is assigned; every excluded row has a reason; every command of GIT_2_53_COMMANDS has a row
- Each of for-each-repo, hook, filter-branch, the seven merge strategy drivers, subtree, request-pull and quiltimport is an excluded row with a reason, and the rule fails when one is left assigned
- The inventory test compares gitToolDefinitions with every tool the git files export
- The full sweep matches the known baseline failures and adds none
- docs/plans/tool-registry.md records the s8 outcome and the user's decisions

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildGitFamilyTool makes a flat input schema with an op enum and an output union whose members carry the literal op, refuses a field the op does not take and a value outside its pattern before any approval request, and throws at build time for a duplicate op, an op without a class or a stdin op without a stdin field | `t1` |
| the approval function of a family tool returns none for a read, common for an ordinary change and destructive for each operation the destructive rule lists, and for an input-dependent class (restore with worktree, checkout-index with force, gc with prune now, archive with an output path) returns destructive for the dangerous input and common for the safe one | `t1`, `t4`, `t5`, `t6`, `t7` |
| a result that does not match the op's answer member is a schema-mismatch failure with the original text kept, and a cut stdout is a rejected failure whose partial text is not returned | `t1` |
| extendGitTool keeps every input that is valid for git_stash, git_worktree, git_remote, git_branch and git_tag giving the same result and the same class, adds the new ops, and throws at build time for a name or field collision | `t1`, `t8` |
| git-coverage.test.ts has one case for every covered row of the s8 commands and operations (git_inspect, git_text, git_objects, git_patch, git_tree, git_maintenance, git_setup, git_refs, git_reflog and the new ops of git_stash, git_worktree, git_remote, git_branch and git_tag), each through executeTool against a temporary repository with the result and the effect (the object, ref, file or listing) checked, and fails for a covered row without a case, an excluded row without a reason, a command of GIT_2_53_COMMANDS without a row and any row still assigned | `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9` |
| each operation that reads standard input (apply, am, mktree, mktag, fast-import, unpack-objects, index-pack, pack-objects, patch-id, stripspace, interpret-trailers, fmt-merge-msg, column, mailinfo, mailsplit, update-index and any other the table marks) receives the content given as its input and changes the repository as the command does, and a delivery that fails (git exits before reading) is a failure of the tool with no answer | `t3`, `t4`, `t5` |
| each destructive operation asks for approval and is denied with no client attached before git starts, so the repository is unchanged, and an input the schema refuses never builds an approval request | `t4`, `t5`, `t6`, `t7` |
| a failed command gives the typed failure kind: missing-tool when git cannot start, timed-out with the unknown-outcome text for a changing operation, rejected with git's message otherwise | `t1`, `t6` |
| the inventory test (typed-git-tools.test.ts) compares gitToolDefinitions with every tool the git files export, the registration test registers each as withFailureNet(tool), and the pinned input snapshot (git-approval.test.ts) lists the new tools and inputs as added by s8 while every input of the 40 existing tools is unchanged | `t8`, `t9` |

## 3. References

- **[[c1]]** `code` `src/daemon/tools/builtins/git/definitions.ts`
- **[[c2]]** `code` `src/daemon/tools/shell-helper.ts:250`
- **[[c3]]** `code` `src/daemon/tools/builtins/git/coverage.ts`
- **[[c4]]** `code` `src/daemon/tools/builtins/gh/op-table.ts`
- **[[c5]]** `doc` `docs/plans/tool-registry.md`
- **[[c6]]** `code` `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts`
