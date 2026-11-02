<!-- insrc:artifact LLD-b7a68147dcf72034-s8 -->

# LLD: STORY-b7a68147dcf72034-s8

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `9fcc90f081df...`

The 96 git commands and the missing operations of five existing tools that no tool reaches today become about ten new family tools and extra operations of git_stash, git_worktree, git_remote, git_branch and git_tag, all built from one table of operations. Each operation names its argv, its input rules, its approval class (destructive when it can destroy work or overwrite a file), its time limit and its answer shape; an operation that reads standard input takes the content as an input and sends it through runShellBytes. The coverage table moves each command from assigned to covered with a case that runs it against a temporary repository, or to excluded with a reason.

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
- `s9`: Private implementation of s9: Move the workflow library's and the daemon's direct git and gh calls onto the registry
- `s10`: Private implementation of s10: Move the tracker and the terminal client onto the registry and remove the old paths

## 2. Contract details

**Surface level:** internal

### 2.1 `buildGitFamilyTool`

```typescript
buildGitFamilyTool(spec: GitFamilySpec): TypedTool
```

**Parameters:**
- `spec: GitFamilySpec` — The tool id, its description and its list of GitOpSpec; each op names its fields, input rules, argv builder, optional stdin field, approval class (fixed or a function of the input), time limit and answer shape

**Returns:** `TypedTool` — A tool with a flat typebox input schema carrying an op enum, an output union whose members carry the literal op, an approval function that returns the op's class, and an execute that runs the op's argv

**Errors:**
- `Error` when thrown at build time when two ops disagree about a shared field, an op has no class, a stdin op has no stdin field, or two ops share a name

**Preconditions:**
- Every op's fields come from the field helpers imported from the gh op-table (field, fieldSchema) and the git patterns in safe-args.ts

**Postconditions:**
- An input outside the op's fields, or a value outside its pattern, is refused by the schema or the op rules before any approval request
- A ref-position value is checked with assertSafeArg and a path-position value after the option terminator
- A result that does not match the op's answer member, or whose stdout was cut, is a failure (kind schema-mismatch or rejected), never a success
- A command that did not start is missing-tool, one that was killed is timed-out and carries the unknown-outcome text when the op changes something

### 2.2 `extendGitTool`

```typescript
extendGitTool<T extends TypedTool>(base: T, extra: readonly GitOpSpec[]): TypedTool
```

**Parameters:**
- `base: T` — One of the existing multi-operation tools whose input already has an op enum (git_stash, git_worktree, git_remote, git_branch, git_tag)
- `extra: readonly GitOpSpec[]` — The operations the tool does not have yet

**Returns:** `TypedTool` — The same tool id with the op enum widened and the new fields added as optional inputs; an op the base already has runs the base's own execute unchanged

**Errors:**
- `Error` when thrown at build time when an extra op has the name of an existing op or a field it adds collides with an existing field of another type

**Preconditions:**
- The base tool's id, inputs and answers stay as they are (k7)

**Postconditions:**
- Every input that was valid for the base is valid for the extended tool and gives the same result
- The approval function returns the base's class for a base op and the extra op's class for a new op

### 2.3 `runShellBytes`

```typescript
runShellBytes(argv: readonly string[], options?: ShellBytesOptions): Promise<ShellBytesResult>
```

**Returns:** `Promise<ShellBytesResult>` — Unchanged: stdin, isolated environment and independent limits

**Preconditions:**
- The op's stdin field holds the content to send

**Postconditions:**
- A stdin write that failed (stdinError) or a stdout that was cut makes the tool's call a failure, not an empty success

### 2.4 `GIT_COVERAGE`

```typescript
const GIT_COVERAGE: readonly CoverageRow[]
```

**Returns:** `readonly CoverageRow[]` — Every row owned by s8 is covered, with toolIds and a case, or excluded with a reason; no row stays assigned

**Preconditions:**
- The recorded command list GIT_2_53_COMMANDS is unchanged

**Postconditions:**
- git-coverage.test.ts fails for a covered row without a case, an excluded row without a reason, a command of the list with no row, and any row still assigned

### 2.5 `gitToolDefinitions`

```typescript
const gitToolDefinitions: readonly TypedTool[]
```

**Returns:** `readonly TypedTool[]` — The 40 existing definitions (five of them extended) plus the new family tools

**Preconditions:**
- registerGitTools registers each as withFailureNet(tool)

**Postconditions:**
- The inventory test (typed-git-tools.test.ts) compares this list with every tool the git files export

## 3. Data model changes

### 3.1 `GitOpSpec (new, src/daemon/tools/builtins/git/op-table.ts)` — new

{ op, fields, rules, argv(input), stdin?, class | classOf(input), timeoutMs, mutating, answer, parse }: one operation of a family tool. The destructive rule it must follow: an op is destructive when it can discard uncommitted work or an unpushed object (clean, restore of the worktree, checkout-index over existing files, read-tree --reset, reflog expire and delete, notes remove and prune, replace delete, prune, gc with --prune=now, remote prune, submodule deinit and forced update, mv --force, merge-file writing in place) or overwrite a file the call names (archive --output, format-patch --output-directory, bundle create, bugreport and diagnose output, fast-export to a file); every other change is common and a read is none. A class that depends on the input is a function and is tested for both branches.

**Call sites:**
- `src/daemon/tools/builtins/git/definitions.ts`
- `src/daemon/tools/builtins/git/helpers.ts`
- `src/daemon/tools/builtins/gh/op-table.ts`

### 3.2 `CoverageRow (src/daemon/tools/builtins/git/coverage.ts)` — invariant-change

The owner 'assigned' is removed from use: every row s8 owns becomes covered (toolIds and cases set, builtBy absent) or excluded (reason set). The three commands that run an arbitrary command (for-each-repo, hook, filter-branch) stay excluded as raw passthrough once the user confirms; the merge strategy drivers (merge-octopus, merge-ours, merge-recursive, merge-recursive-ours, merge-recursive-theirs, merge-resolve, merge-subtree), quiltimport, request-pull and subtree are decided by the user (see the open questions) and are covered in a family or excluded as internal helpers.

**Call sites:**
- `src/daemon/tools/builtins/git/coverage.ts`
- `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts`

### 3.3 `Git family tools (new, one file each under src/daemon/tools/builtins/git)` — new

git_inspect (read-only queries, class none: describe, name-rev, cherry, shortlog, show-branch, grep, last-modified, count-objects, var, version, check-attr, check-ignore, check-mailmap, check-ref-format, get-tar-commit-id, diff-files, diff-index, diff-pairs, range-diff, show-index, verify-commit, verify-tag, verify-pack, fsck, fsck-objects, pack-redundant, repo); git_text (filters that read standard input: column, stripspace, interpret-trailers, fmt-merge-msg, patch-id, mailinfo, mailsplit); git_objects (object, index and ref writes: commit-tree, mktree, mktag, write-tree, read-tree, update-index, replace, notes, fast-import, unpack-objects, index-pack, pack-objects); git_patch (apply, am, format-patch, archive, bundle, fast-export, diagnose, bugreport); git_tree (worktree and index operations: checkout-index, clean, restore, mv, sparse-checkout, submodule, rerere, merge-file, bisect, replay); git_maintenance (gc, repack, prune, prune-packed, pack-refs, multi-pack-index, maintenance, commit-graph, backfill); git_setup (init, init-db, clone); git_refs (verify, migrate, optimize); git_reflog (show, list, exists, expire, delete, write). The extra operations of git_stash (branch, create, store, export, import), git_worktree (lock, unlock, repair), git_remote (show, prune, update, set-head, set-branches, set-url --add, set-url --delete), git_branch (rename, copy, set-upstream-to, unset-upstream, edit-description) and git_tag (verify, sign) go through extendGitTool.

**Call sites:**
- `src/daemon/tools/builtins/git/stash.ts`
- `src/daemon/tools/builtins/git/worktree.ts`
- `src/daemon/tools/builtins/git/remote.ts`
- `src/daemon/tools/builtins/git/branch.ts`
- `src/daemon/tools/builtins/git/tag.ts`
- `src/daemon/tools/builtins/git/definitions.ts`

## 4. Error paths

**Error cases**

- **A stdin operation cannot deliver its content because git exits before reading it** (recoverable)
  - Detection: runShellBytes reports stdinError on the result, or the command ends with a non-zero code before consuming its input
  - Response: The call is a failure of kind rejected naming the command and the delivery error; no answer is parsed and nothing is reported as applied
  - User impact: The caller sees why the content did not arrive; a mutating op that may have partly run says its outcome is unknown
- **An operation's output is cut by the stdout budget** (recoverable)
  - Detection: stdoutTruncated is true on the result of runShellBytes or runShell
  - Response: The call fails with kind rejected and the text 'output cut at <limit> bytes'; the partial text is not parsed or returned as an answer
  - User impact: A long listing (fsck, grep, shortlog, show-index) is refused rather than silently shortened; the caller narrows it
- **An operation's parsed answer does not fit the declared member of the output union** (recoverable)
  - Detection: The builder checks the parsed value against the op's answer schema before returning it, and the executor checks the union again
  - Response: The call fails with kind schema-mismatch and the original text is kept in failure.original
  - User impact: A git version that prints a different shape is reported, never passed on as a wrong answer
- **A destructive operation is called with no client attached or the approval times out** (recoverable)
  - Detection: The executor's approval step for the class destructive, which asks for every call
  - Response: The call is denied before git starts; the answer is the denial with its reason
  - User impact: Nothing changes in the repository
- **An input names an option instead of a value (a ref or revision starting with '-', a NUL byte, a path outside its position)** (recoverable)
  - Detection: The input schema pattern or assertSafeArg in the builder, before any approval request
  - Response: The call is refused with kind rejected naming the field; git is not started
  - User impact: No prompt is shown for an input that cannot be run
- **A field is given that the chosen operation does not take** (recoverable)
  - Detection: The op's rule check in the builder (the flat schema accepts the union of all fields, the rules refuse the ones this op does not list)
  - Response: The call is refused with kind rejected naming the field and the op
  - User impact: A mistyped op/field pairing is a clear error instead of a silently ignored input
- **git is not installed or the working directory is not a repository** (recoverable)
  - Detection: spawnError on the result, or git's own 'not a git repository' exit
  - Response: missing-tool for a command that did not start; rejected with git's message otherwise
  - User impact: The caller knows whether to install git or pick a different directory
- **An operation times out** (recoverable)
  - Detection: timedOut on the result
  - Response: Kind timed-out; an op that changes something adds the unknown-outcome text from helpers.ts
  - User impact: The caller checks the repository before retrying
- **The installed git is older than the one the table was written for and lacks a command (replay, last-modified, diff-pairs, backfill, refs)** (recoverable)
  - Detection: git exits with 'is not a git command' or an unknown-option message
  - Response: Kind rejected with git's message and the version the table records (2.53.0); the coverage test is the only place that requires the command to exist
  - User impact: A tool of an absent command fails clearly instead of misreporting
- **A coverage row is left assigned, covered without a case, or excluded without a reason** (recoverable)
  - Detection: git-coverage.test.ts walks GIT_COVERAGE against GIT_2_53_COMMANDS
  - Response: The test fails and names the row
  - User impact: The build is stopped at its tests

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An existing input of git_stash, git_worktree, git_remote, git_branch or git_tag | Valid and gives the same result as before: the extended tool runs the base's execute for a base op (k7) |
| A destructive class that depends on the input (restore with worktree, checkout-index with force, gc with prune now, archive with an output path) | The approval function returns destructive for the dangerous input and common for the safe one, and both branches are tested |
| A read-only op whose command exits 1 with no output to mean 'no match' (check-ignore, grep, cherry on equal branches) | An answer with found false or an empty list, not a failure, as git_config already does |
| A stdin op given an empty content string | Delivered as empty input; the command's own answer decides (mktree of nothing writes the empty tree) |
| A stdin op given content larger than the input budget | Refused before git starts with kind rejected naming the limit, not truncated |
| git init in a directory that is already a repository | Reinitialises without losing anything and reports reinitialised true; class common |
| A command the user excludes after this design (a merge strategy driver, quiltimport, request-pull, subtree) | Its row is excluded with the reason the user gives, and no tool or op for it is registered |

**Invariants to preserve**

- Every git tool id and every input that is valid today keeps its meaning and its result; new operations are additive [[c1]]
- A destructive operation asks every time and is denied with no client; no input, setting or caller can skip the approval [[c5]]
- An input the schema refuses is refused before any approval request is built [[c1]]
- A result that does not fit its declared shape, or whose output was cut, is a failure and is never passed on [[c2]]
- The coverage test counts a command as covered only when a case runs it through executeTool in a temporary repository and checks the effect; an assigned row never counts [[c3]]
- The gh family files are not changed by this Story [[c4]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests co-located in src/daemon/tools/builtins/git/__tests__ with the _repo.ts temporary-repository fixture and the _standin.ts stand-in; git 2.53.0 is the installed version`

**Test levels**

- **unit** — The builder: the schema it makes, the rules between fields, the class of each operation, the stdin and cut-output handling and the extension of an existing tool
  - Subjects: `buildGitFamilyTool makes a flat input schema with an op enum and an output union whose members carry the literal op, refuses a field the op does not take and a value outside its pattern before any approval request, and throws at build time for a duplicate op, an op without a class or a stdin op without a stdin field`, `the approval function of a family tool returns none for a read, common for an ordinary change and destructive for each operation the destructive rule lists, and for an input-dependent class (restore with worktree, checkout-index with force, gc with prune now, archive with an output path) returns destructive for the dangerous input and common for the safe one`, `a result that does not match the op's answer member is a schema-mismatch failure with the original text kept, and a cut stdout is a rejected failure whose partial text is not returned`, `extendGitTool keeps every input that is valid for git_stash, git_worktree, git_remote, git_branch and git_tag giving the same result and the same class, adds the new ops, and throws at build time for a name or field collision`
  - Fixtures: `a stand-in git that returns scripted output, exit codes, a cut stdout and a stdin error`, `the pinned input snapshots of the five existing tools`
- **integration** — Every command and operation the Story owns runs through executeTool in a temporary repository and its result and effect are checked
  - Subjects: `git-coverage.test.ts has one case for every covered row of the s8 commands and operations (git_inspect, git_text, git_objects, git_patch, git_tree, git_maintenance, git_setup, git_refs, git_reflog and the new ops of git_stash, git_worktree, git_remote, git_branch and git_tag), each through executeTool against a temporary repository with the result and the effect (the object, ref, file or listing) checked, and fails for a covered row without a case, an excluded row without a reason, a command of GIT_2_53_COMMANDS without a row and any row still assigned`, `each operation that reads standard input (apply, am, mktree, mktag, fast-import, unpack-objects, index-pack, pack-objects, patch-id, stripspace, interpret-trailers, fmt-merge-msg, column, mailinfo, mailsplit, update-index and any other the table marks) receives the content given as its input and changes the repository as the command does, and a delivery that fails (git exits before reading) is a failure of the tool with no answer`, `each destructive operation asks for approval and is denied with no client attached before git starts, so the repository is unchanged, and an input the schema refuses never builds an approval request`, `a failed command gives the typed failure kind: missing-tool when git cannot start, timed-out with the unknown-outcome text for a changing operation, rejected with git's message otherwise`
  - Fixtures: `_repo.ts temporary repositories with history, a remote, a stash, notes and a reflog`, `an approval gate stub that records requests and answers none`, `a mail sample and a patch for the stdin operations`
- **contract** — The registry as the agents see it
  - Subjects: `the inventory test (typed-git-tools.test.ts) compares gitToolDefinitions with every tool the git files export, the registration test registers each as withFailureNet(tool), and the pinned input snapshot (git-approval.test.ts) lists the new tools and inputs as added by s8 while every input of the 40 existing tools is unchanged`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `git-coverage.test.ts has one case per covered row of the s8 commands and operations, each through executeTool in a temporary repository (integration)`, `the inventory test lists every new family tool in gitToolDefinitions (contract)` |
| `ac2` | `each operation that reads standard input receives the content given as its input and a failed delivery is a failure of the tool (integration)` |
| `ac3` | `a result that does not match the op's answer member is a schema-mismatch failure and a cut stdout is a rejected failure (unit)`, `a failed command gives the typed failure kind (integration)` |
| `ac4` | `the approval function of a family tool returns the right class for every operation and both branches of an input-dependent class (unit)`, `each destructive operation asks for approval and is denied with no client before git starts (integration)` |
| `ac5` | `git-coverage.test.ts fails for a covered row without a case, an excluded row without a reason, a command without a row and any row still assigned (integration)` |

## 6. Migration

**State before:** 40 git tools are registered (c1); 118 coverage rows are owned by s8 and none has a tool (c3); the five multi-operation tools have an op enum without the operations the table assigns to s8 (c4); the gh family has an op-table builder the git family does not use (c4); runShellBytes already delivers stdin and reports delivery errors and cut output (c2).

**State after:** About ten new family tools and the extra operations of five existing tools are registered and built from one git op table; every row s8 owns is covered by a case that runs it through executeTool in a temporary repository, or excluded with a reason the user accepted; no row is assigned; the 40 existing tools keep their ids, inputs and results.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the git op table (the builder, the extension of an existing tool, the stdin path and the cut-output and union checks) with its unit tests, and no tool using it yet — ↩ rollbackable
2. Add the read-only family (git_inspect) and the text filters (git_text), the lowest-risk families, with their coverage cases — ↩ rollbackable
3. Add the families that change objects, refs, the index or the worktree (git_objects, git_patch, git_tree, git_maintenance, git_setup, git_refs, git_reflog) with their classes, the approval cases and the coverage cases — ↩ rollbackable
4. Extend git_stash, git_worktree, git_remote, git_branch and git_tag with their missing operations and re-pin their input snapshots with the new inputs listed as added by s8 — ↩ rollbackable
5. Settle the user's decisions on the commands left open (for-each-repo, hook, filter-branch, the merge strategy drivers, quiltimport, request-pull, subtree) as covered or excluded rows, and make the coverage test fail for any row still assigned — ↩ rollbackable
6. Register the new tools in definitions.ts, update the inventory and registration tests, write the s8 outcome in docs/plans/tool-registry.md and run the full sweep once — ↩ rollbackable

**Backward compat:** Additive. No tool id changes and no existing input changes meaning: an existing input of git_stash, git_worktree, git_remote, git_branch or git_tag is valid and gives the same result, and the new operations are new values of the op enum with new optional fields. About ten new tool names appear in the registry and in every agent's tool list; the pinned snapshots of tool inputs list them as added by s8. Operations that are destructive now ask every time, as the approval design already requires for the class. The gh family is not changed. Nothing is stored, so there is no data to migrate.

## 7. Alternatives considered

### 7.1 a1: One hand-written tool per command

Add a git_<command> tool file for each of the 96 assigned commands, in the style of the existing 40, with the multi-operation commands carrying their own op input.

Each assigned command gets its own file under src/daemon/tools/builtins/git: a typebox input and output schema in schemas.ts, an execute that builds the argv and parses the answer, an approval class or function, and its case in the coverage table. A command that reads stdin takes its content as an input and runs through runShellBytes. The operations of the five existing multi-operation tools and the new refs and reflog tools are added as ops of those files. The registry grows from 40 to about 136 git tools.

**Rejected because:** Meets every criterion but with about 96 hand-written tools: ac1 is met as a named tool per command rather than an operation-selecting input, and the repetition of the destructive-class and stdin code raises the chance of a slip in ac2 and ac4.

### 7.2 a2: Family tools from a git op table, reusing the gh builder's exports — **CHOSEN**

About a dozen operation-selecting git family tools built from a table of ops by a git builder that imports the field and schema helpers op-table.ts already exports, leaving the gh files unchanged.

A new src/daemon/tools/builtins/git/op-table.ts builds a tool from a list of ops: a FieldSpec per input field (imported from the gh op-table), a flat typebox input schema with an op enum, an output union whose members carry the literal op, the argv builder, the stdin field of an op that reads standard input (delivered through runShellBytes), the approval class per op or per input, the time limit per op and the typed failure from the git helpers. Commands group into families by purpose, the five existing multi-operation tools gain their missing ops through the same table, and the coverage table gains a case per command or operation. The gh files are not touched.

### 7.3 a3: Family tools from one shared builder used by gh and git

Move the neutral parts of the gh op table (fields, schema builders, the output union, the rules) into a shared module and build the git family and the gh family on it.

Extract field, FieldSpec, fieldSchema, the flat input schema builder, the output union and the op-rule machinery from src/daemon/tools/builtins/gh/op-table.ts into a family-neutral module, parameterised by the exec function, the failure mapping, the approval registration and the time-limit registration. The gh family and the new git family both build on it. The git families and ops are the same as in a2.

**Rejected because:** Same git result as a2 and a cleaner dependency, but it rewrites the gh builder that s5 built and approved; that risk and cost are outside this Story's boundary for no change in ac1 to ac5.

### 7.4 a4: Hand-written family tools without a builder

About a dozen family tools with an op input, each written by hand in the style of git_stash, with no shared builder.

Group the assigned commands into the same families as a2, but write each family tool as an ordinary file: an op enum, a hand-written switch over the ops that builds the argv, a hand-written output union, and the approval function. The stdin ops call runShellBytes directly. Shared pieces stay the existing helpers.

**Rejected because:** No shared builder means about a hundred hand-written argv builders, input rules and output unions; ac2, ac3 and ac4 are met only as well as each file is written, with no single place that enforces them.

## 8. References

- **[[c1]]** `code` `src/daemon/tools/builtins/git/definitions.ts`
- **[[c2]]** `code` `src/daemon/tools/shell-helper.ts:250`
- **[[c3]]** `code` `src/daemon/tools/builtins/git/coverage.ts`
- **[[c4]]** `code` `src/daemon/tools/builtins/gh/op-table.ts`
- **[[c5]]** `doc` `docs/plans/tool-registry.md`
- **[[c6]]** `code` `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts`

## 9. Open questions

- Exclusion of for-each-repo, hook and filter-branch: confirm they stay excluded as commands that run an arbitrary command (a raw passthrough), as the coverage table has recorded since the s4 split
- The merge strategy drivers (merge-octopus, merge-ours, merge-recursive, merge-recursive-ours, merge-recursive-theirs, merge-resolve, merge-subtree), quiltimport, request-pull and the contrib subtree command: offered through a family, or excluded as helpers a person does not run directly? Recommended: exclude the merge strategy drivers and subtree (git merge runs them) and keep request-pull and quiltimport only if a program needs them
- The missing operations of git_stash, git_worktree, git_remote, git_branch and git_tag: this design adds them to those tools as new values of their op enum (additive, existing inputs unchanged); the alternative is new tools for them

## Resolved questions

- `q4e06d056` — Exclusion of for-each-repo, hook and filter-branch: confirm they stay excluded as commands that run an arbitrary command (a raw passthrough), as the coverage table has recorded since the s4 split
  - **resolved**: Confirm exclusion as-is — User decision 2026-11-02: for-each-repo, hook and filter-branch stay excluded as raw passthrough. _(2026-11-02T11:16:29.678Z)_
- `q09348323` — The merge strategy drivers (merge-octopus, merge-ours, merge-recursive, merge-recursive-ours, merge-recursive-theirs, merge-resolve, merge-subtree), quiltimport, request-pull and the contrib subtree command: offered through a family, or excluded as helpers a person does not run directly? Recommended: exclude the merge strategy drivers and subtree (git merge runs them) and keep request-pull and quiltimport only if a program needs them
  - **resolved**: Exclude merge drivers + subtree; keep request-pull/quiltimport only if a program needs them — User decision 2026-11-02: follow the recommendation; no program needs request-pull or quiltimport today, so they are excluded with a reason that says so. _(2026-11-02T11:17:07.645Z)_

## Citations

- **[[c1]]** `code` `src/daemon/tools/builtins/git/definitions.ts`
- **[[c2]]** `code` `src/daemon/tools/shell-helper.ts:250`
- **[[c3]]** `code` `src/daemon/tools/builtins/git/coverage.ts`
- **[[c4]]** `code` `src/daemon/tools/builtins/gh/op-table.ts`
- **[[c5]]** `doc` `docs/plans/tool-registry.md`
- **[[c6]]** `code` `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts`
