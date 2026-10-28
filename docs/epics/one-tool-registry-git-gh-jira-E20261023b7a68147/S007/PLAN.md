<!-- insrc:artifact PLAN-b7a68147dcf72034-s7 -->

# Plan: STORY-b7a68147dcf72034-s7

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1793034050493-kwsc16`
**LLD effective hash:** `9fcc90f081df...`

Twelve tasks build the s7 foundations in dependency order: the effective signal and executor checks, then the one process lifecycle and the migration of the eight direct-spawn sites, the refresh git tools and callTool provenance, the typed git list and four new git tools, the op-table additions and the gh_tracker family, tools.call, the report-mode scan, and the plan-note record. Each task has parity or behaviour tests that run before and after, and nothing moves a call site: s9 and s10 do that.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Effective call signal, cleared hook context and executor checks | M | — | — | unit: src/daemon/tools/__tests__/executor-abort.test.ts; unit: src/daemon/tools/__tests__/tool-signal.test.ts; unit: src/daemon/tools/__tests__/hooks-context.test.ts | [[c1]] |
| 2 | **`t2`** Shared process lifecycle and spawnManaged | L | — | `t1` | unit: src/daemon/tools/__tests__/shell-helper-abort.test.ts; unit: src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts; unit: src/daemon/tools/__tests__/spawn-managed.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts | [[c2]] |
| 3 | **`t3`** Git helper aborted case, readGit signal and refresh tool signal passing | M | — | `t2` | unit: src/daemon/tools/builtins/git/__tests__/git-abort.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts | [[c3]] |
| 4 | **`t4`** Migrate the eight direct-spawn sites to spawnManaged | L | — | `t2` | unit: src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts and the k8s, test-runner, ssh and aws logs parity tests; integration: src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts; unit: src/daemon/tools/__tests__/child-process-inventory.test.ts | [[c4]] |
| 5 | **`t5`** callTool provenance | M | — | — | unit: src/daemon/tools/__tests__/call-tool-identity.test.ts; unit: src/daemon/tools/__tests__/provenance.test.ts | [[c5]] |
| 6 | **`t6`** Typed git definitions list and compile-time check | L | — | `t3`, `t5` | unit: src/daemon/tools/__tests__/typed-git-tools.test.ts; unit: src/daemon/tools/__tests__/typecheck-config.test.ts; unit: src/daemon/tools/__type-tests__/git-tools.typecheck.ts via npm run typecheck:tools | [[c6]] |
| 7 | **`t7`** Four new git tools | L | — | `t6` | unit: src/daemon/tools/builtins/git/__tests__/git-config.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-rm.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-registration.test.ts; unit: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts | [[c7]] |
| 8 | **`t8`** FieldSpec pattern, op-table variants and parseJsonLines | M | — | — | unit: src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts | [[c8]] |
| 9 | **`t9`** gh_tracker family | L | — | `t5`, `t8` | unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts; unit: src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts | [[c9]] |
| 10 | **`t10`** tools.call stream method | M | — | `t1`, `t2` | integration: src/daemon/tools/__tests__/call-handler.test.ts; integration: src/daemon/tools/__tests__/call-tool-workflow.test.ts; integration: src/daemon/tools/__tests__/tools-call-cancellation.test.ts; integration: src/daemon/threads/__tests__/method-class.test.ts | [[c10]] |
| 11 | **`t11`** Forbidden-spawn scan in report mode | M | — | — | unit: scripts/__tests__/forbidden-spawn-scan.test.ts | [[c11]] |
| 12 | **`t12`** Record the s7 build in the plan note | S | — | `t4`, `t6`, `t7`, `t9`, `t10`, `t11` | unit: src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts | [[c12]] |

### 1.1 TASK-b7a68147dcf72034-s7-t1 — Effective call signal, cleared hook context and executor checks

Add tool-signal.ts (module-private AsyncLocalStorage, runWithToolSignal, runWithoutToolSignal, currentToolSignal, effectiveToolSignal). In executeTool resolve one effective signal, run buildApprovalRequest and tool.execute inside it, run hooks through runWithoutToolSignal, pass the signal to the broker's ask and to every cancellation check; keep runToolHooks' real signature (input unknown, readonly result).

**Acceptance checks:**
- An aborted effective signal returns denied with cancelled before the preview, after it, before the ask and before execute
- A nested call's pending approval resolves cancelled when the outer signal aborts
- currentToolSignal() is undefined inside hooks, nested calls included
- A call with no signal behaves as before

### 1.2 TASK-b7a68147dcf72034-s7-t2 — Shared process lifecycle and spawnManaged

In shell-helper.ts add one lifecycle: effective signal tested before spawn, own process group on non-win32, group kill on abort/time-out/stderr overflow, 2 s bounded settlement destroying streams and clearing timers. runShell and runShellBytes use it (additive aborted field); add spawnManaged returning the discriminated union.

**Acceptance checks:**
- An already-aborted signal starts no process in runShell, runShellBytes or spawnManaged
- A descendant holding the pipes is killed and the call settles within 2 s after abort and time-out
- A call that is neither aborted nor timed out settles on close as before
- spawnManaged child is unreadable without narrowing on spawned

### 1.3 TASK-b7a68147dcf72034-s7-t3 — Git helper aborted case, readGit signal and refresh tool signal passing

Add the aborted case to fail(), the optional signal to readGit, pass deps.signal explicitly in git_fetch, git_fetch_refs, git_rev_parse, git_symbolic_ref, git_ls_tree and git_show (checked between its three commands), and add the lowerable timeoutMs (1 to 30000) to git_cat_file.

**Acceptance checks:**
- Each refresh tool returns a rejected failure on an aborted signal and starts no later command
- Successive calls sharing one deadline signal stop at the deadline and later calls never spawn
- git_cat_file timeoutMs accepts 1 to 30000 and keeps today's default and messages

### 1.4 TASK-b7a68147dcf72034-s7-t4 — Migrate the eight direct-spawn sites to spawnManaged

Migrate shell/exec-detached.ts, k8s/index.ts (three sites), test/index.ts, ssh/index.ts (two sites) and cloud/aws/logs.ts one file at a time, parity tests first so each file is its own rollback point: branch on spawned first and return the usual aborted result, keep output, progress frames and wording, pass own limit as timeoutMs, drop own kill timers and abort listeners. Add the child_process inventory test.

**Acceptance checks:**
- Parity tests show unchanged progress frames, output and results for non-aborted runs at each site
- Abort and time-out kill the whole group at each site and keep today's wording
- An already-aborted signal takes the no-spawn branch at each site
- The inventory test fails when any file other than shell-helper.ts imports node:child_process

### 1.5 TASK-b7a68147dcf72034-s7-t5 — callTool provenance

Add provenance.ts (WeakMap, markDefinition, definitionOf, isDefinitionOf with an 8-step bound); mark copies in withFailureNet (keeping its UnsafeArgError-only conversion and rethrow) and withGhFailureNet; add the registered-definition check to callTool with an unchanged signature.

**Acceptance checks:**
- callTool runs for git definitions, exported gh tools, defineGhFamily results and plain registerTool tools
- A spread replacement, alone or wrapped by a failure net, is rejected and its execute never runs
- withFailureNet still rethrows non-UnsafeArgError exceptions

### 1.6 TASK-b7a68147dcf72034-s7-t6 — Typed git definitions list and compile-time check

Change all 34 git definitions to inferred objects with satisfies TypedTool; add git/definitions.ts with gitToolDefinitions and make registerGitTools iterate it; add the inventory test; exclude __type-tests__ in tsconfig.json; add tsconfig.typecheck.json, the fixtures and typecheck:tools in the build chain.

**Acceptance checks:**
- The inventory test compares exports and list in both directions and ids are unique
- Negative fixtures fail to compile and an unused expect-error fails typecheck:tools
- The root build neither compiles nor emits the fixtures
- Existing ids, order and approval classes are unchanged

### 1.7 TASK-b7a68147dcf72034-s7-t7 — Four new git tools

Add git_config, git_ls_remote, git_update_ref and git_rm with the LLD's argv, outputs, limits and classes, SAFE_REF equal to isSafeRefName as one Unicode pattern, SAFE_PATH forbidding only NUL, every safety condition in the input schema; list them and mark them built by s7 in the coverage table.

**Acceptance checks:**
- The SAFE_REF pattern and isSafeRefName agree over one corpus
- Unsafe input is rejected by the schema before any approval, with or without a subscriber
- git_config exit 1 with empty stdout is found false; empty ls-remote output is a success with empty lists
- update-ref of an absent ref and rm of an untracked path succeed; both ask for valid input

### 1.8 TASK-b7a68147dcf72034-s7-t8 — FieldSpec pattern, op-table variants and parseJsonLines

Add the optional string pattern and field.name, the path, kv and qs argument variants to buildArgv, the parseJsonLines helper beside parseJson, and the OpDef diagnostic field with FAILURE_ORIGINAL_MAX_CHARS (command-exit failures only).

**Acceptance checks:**
- A bad owner is rejected before any approval; shared fields with different patterns make defineGhFamily throw
- Exact argv fixtures for path, kv and qs including encoding and no bare question mark
- parseJsonLines skips blank lines, handles empty output and reports the first bad line with its number
- Existing ops build the argv and failures they build today

### 1.9 TASK-b7a68147dcf72034-s7-t9 — gh_tracker family

Define the 15 ops in gh/tracker.ts in the LLD's order, running the family test after each group (the three paginated listings with --paginate and a fixed -q filter read through parseJsonLines), register it in registerGhTools, add the closed mapped-ops test last and record the amendment in the gh coverage table.

**Acceptance checks:**
- Each op has the exact argv, schemas, class and limit of the LLD
- Multi-page, empty and malformed output cases behave as designed and match the wrappers' results
- tasks_query pageInfo and issueCount cases match queryTasks
- project_create returns number and url or a rejected failure
- getTool and callTool find gh_tracker and every mapped op returns the fields its wrapper reads

### 1.10 TASK-b7a68147dcf72034-s7-t10 — tools.call stream method

Add call-handler.ts, ToolsCallParams and ToolsCallDone types, the streamHandlers entry and the method-class entry; validate params, build ToolDeps with the sessionId rule, send one done frame, abort on stream close.

**Acceptance checks:**
- Invalid params give one invalid-params error frame; an unknown tool gives a done frame with a rejected result
- Closing the stream cancels the preview, nested approvals and running subprocess trees within the bound
- A hook runs for caller workflow and a destructive call with no subscriber is denied no-client

### 1.11 TASK-b7a68147dcf72034-s7-t11 — Forbidden-spawn scan in report mode

Add the scan script run after tsc in the build chain with positive-control fixtures, the three exemptions and report and failing modes.

**Acceptance checks:**
- One positive control per form is reported; report mode exits 0 and failing mode exits 1
- An unparseable file exits non-zero
- A run over src lists the direct gitDiffTool.execute calls

### 1.12 TASK-b7a68147dcf72034-s7-t12 — Record the s7 build in the plan note

Update docs/plans/tool-registry.md with the tool list, mark the callTool prerequisite done and note the hand-over of the shared deadline sender to s9 and the rest to s10.

**Acceptance checks:**
- The note lists the new tools and the callTool prerequisite is marked done
- The s9 and s10 hand-over is stated

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/tools/__tests__/executor-abort.test.ts: executeTool never starts a tool when the effective signal is aborted before the request, during preview construction, after the request is built and before the ask, or between the approval answer and execute; no gate call is made for an already-aborted signal | `t1` |
| src/daemon/tools/__tests__/tool-signal.test.ts: inside runWithToolSignal, currentToolSignal() aborts when the call's signal aborts, also after an await and inside a promise started by the tool; outside any context it is undefined; effectiveToolSignal combines the argument with the context signal and returns either alone or undefined; a nested runWithToolSignal with its own signal aborts when either aborts; a nested one with undefined keeps the outer signal; runWithoutToolSignal makes currentToolSignal() undefined inside it and after an await in it, even when called inside an outer runWithToolSignal, and the outer context is intact after it returns; two concurrent calls with different signals do not see each other's signal; with no signal anywhere nothing is stored | `t1` |
| src/daemon/tools/__tests__/hooks-context.test.ts: a hook of a directly called tool and a hook of a NESTED executeTool (entered from inside an outer tool's execute) each read currentToolSignal() before and after an await and see undefined both times; the hook starts a subprocess and the outer call's signal is aborted while it runs: the subprocess is NOT killed and the hook completes; the same hook fails to see the outer signal when the nested call has its own signal; hook failures are still reported on the result and never turn success into failure | `t1` |
| src/daemon/tools/__tests__/shell-helper-abort.test.ts: runShell, runShellBytes and spawnManaged given an already-aborted signal, explicit or ambient, start no process (a command that would write a file leaves none) and report aborted; a running process is killed on abort of either; a call with no signal and no context behaves as before | `t2` |
| src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts: with a git stand-in script that starts a background descendant which holds the stdout and stderr pipes open, runShell, runShellBytes and spawnManaged each settle within the 2 s bound after an abort and after a time-out (runShellBytes also after a stderr overflow), report the aborted, timedOut or stderrOverflow flag, destroy the streams, and the descendant process is gone (checked by its pid) after each; a call that is neither aborted nor timed out settles on 'close' as before; all three use the one shared lifecycle | `t2` |
| src/daemon/tools/__tests__/spawn-managed.test.ts: spawnManaged returns { spawned: true, child, settled } with the live child so stdout and stderr callbacks receive data in order; settled carries code, signal, timedOut and aborted; the timeoutMs ceiling kills the group; a spawn error reaches the child's 'error' event and settled still resolves; with an already-aborted effective signal it returns { spawned: false, settled } with no child, nothing is started (a marker file is not written) and settled is already resolved with aborted true; a compile-time fixture shows that reading child without narrowing on spawned does not compile | `t2` |
| src/daemon/tools/__tests__/child-process-inventory.test.ts: lists every non-test .ts file under src/daemon/tools and fails when any file other than shell-helper.ts imports node:child_process (a temporary file that imports it in a temporary tree is reported by the same logic) | `t4` |
| src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts: git_cat_file (through runShellBytes) with the descendant-holding-pipes stand-in settles within the bound on abort and on its time-out and returns a rejected or timed-out failure | `t2` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, git_diff: a tools.call for git_diff against a stand-in git that sleeps; closing the stream kills the stand-in's process tree (checked by pid) and the call settles within 2 s plus slack although git_diff forwards no signal | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, legacy gh export: a tools.call for gh_project_list (ghExec without a signal) against a stand-in gh that sleeps; closing the stream kills the stand-in's process tree and settles within the bound | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, auth probe: a stand-in gh that exits with an ambiguous error for the operation and then sleeps for 'auth status'; closing the stream while the probe runs kills the probe's process tree and settles within the bound, and no further gh process starts | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, multi-command tool: git_show against a stand-in git that sleeps in its second command; closing the stream stops the running command and never starts the third | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, approval preview: a tools.call for git_push WITHOUT a ref against a stand-in git that sleeps for 'symbolic-ref --short HEAD' (the command readBranch runs), with an approval subscriber attached; closing the stream while the PREVIEW runs kills the stand-in's process tree, the builder returns a preview that names the ref '(unknown: ...)' instead of throwing (asserted on a direct call of the builder with the same stand-in), the call returns the cancelled denial from the executor's check after the preview, and no approval request reaches the subscriber; the same for git_reset (hard) with a stand-in that sleeps for any git command | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, nested approval wait: a test tool that calls executeTool for a destructive tool with no signal of its own, with an approval subscriber attached that never answers; closing the stream resolves the nested approval as 'cancelled' at once (not after the 300000 ms timeout) and the nested call returns the cancelled denial | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, nested subprocess: a test tool that calls executeTool for a second tool without a signal; closing the stream kills the second tool's subprocess | `t10` |
| src/daemon/tools/__tests__/tools-call-cancellation.test.ts, pending approval and not-started tool: closing the stream resolves a pending approval as cancelled and a tool not yet started never starts | `t10` |
| src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts: for each of the eight migrated sites (shell:exec-detached with an argv and with a 'bash -c' command that backgrounds a child, a k8s tool at each of its three spawn sites, the test runner, an ssh tool at each of its two sites, aws logs tail in follow mode) run against a stand-in executable that sleeps and forks a descendant: closing the stream (an abort of the call signal) kills the whole process group (the child and the descendant are gone, checked by pid), settles within the bound, and the tool returns its usual aborted result; the tool's own time-out ceiling (maxRuntimeMs or its time-out) kills the group and returns today's time-out wording; progress frames sent before the abort were delivered; and with an ALREADY-ABORTED signal each site takes the no-spawn branch: no process starts (a marker file is not written), no handler is attached, and the site returns the aborted result it builds today | `t4` |
| src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts, k8s/__tests__/k8s-spawn-parity.test.ts, test/__tests__/test-runner-parity.test.ts, ssh/__tests__/ssh-spawn-parity.test.ts and cloud/aws/__tests__/logs-parity.test.ts: against stand-in executables, each tool produces the same progress frames, byte counts, exit code mapping, spawn-error text and result as the recorded behaviour of the version before the migration, for argv and command forms, success and non-zero exit | `t4` |
| src/daemon/tools/builtins/git/__tests__/git-abort.test.ts: git_fetch, git_fetch_refs, git_rev_parse, git_symbolic_ref, git_ls_tree, git_ls_remote, git_config and git_cat_file fail rejected on an already-aborted signal and on an abort while running; git_show starts no command after an abort between its header, diff and stat commands; the git helper fail() reports an aborted command as cancelled | `t3` |
| src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts: one deadline signal (a short AbortSignal.timeout, with a controlled slow command) is passed as deps.signal to successive calls of git_rev_parse, git_ls_remote, git_fetch_refs, git_ls_tree and git_cat_file through executeTool; each later call gets only what the first ones left, a running command is killed at the shared deadline, and a call started after the deadline never spawns; a tool's own limit still stops a call first when it is shorter than the signal | `t3` |
| src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts: timeoutMs accepts 1 to 30000, rejects 0, 30001 and a non-integer, defaults to 30000, keeps the limit failure messages, and the signal still applies on top | `t3` |
| src/daemon/tools/builtins/git/__tests__/git-config.test.ts: argv ['git','config','--get',key]; exit 0 gives {found:true, value} trimmed, including an empty value; exit 1 with empty stdout gives {found:false} as a success; exit 128, a cut output and a spawn error are failures; a key that is not dotted, or starts with '-', is rejected by the schema before anything runs; ceiling 5000 ms; class none | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts: argv for symref true with ['HEAD'] (symrefs parsed into {ref:'HEAD', target}) and for heads true with ['refs/heads/<name>']; defaults heads and symref false and patterns []; an empty answer is a success with empty lists; an unreachable remote is a failure with kind unreachable and git's text in failure.message; an unsafe remote or pattern and 9 patterns are rejected by the schema; ceiling 30000 ms; class none; the outputs equal what branch-resolution.ts and handoff.ts read today from the same repositories | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts: argv ['git','update-ref','-d',ref]; output {ref, deleted:true}; deleting an absent ref succeeds; delete false, a missing delete, a ref outside refs/, and a ref that isSafeRefName refuses are rejected by the schema; a ref with a non-ASCII letter, '+' or '#' is accepted; class destructive always asks for valid input; a timed-out call says the outcome is unknown | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-rm.test.ts: argv ['git','rm','-q','--ignore-unmatch','--', ...paths]; quiet false drops -q; output {paths}; an untracked path succeeds; a path starting with '-' is ACCEPTED (it follows '--'); empty paths, 201 paths and a path with a NUL are rejected by the schema; class destructive always asks for valid input; runs in a worktree directory given as cwd | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts: the SAFE_REF schema pattern and isSafeRefName agree on one corpus: ASCII names, Unicode names, names with '+' and '#', and each rejected shape (empty, leading '-' or '/', whitespace, each control character including NUL, each of ~ ^ : ? * [ and backslash, '..', '@{', '//', '@', trailing '/', '.' and '.lock') | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts: for git_update_ref and git_rm, unsafe input including a NUL returns a rejected input failure through executeTool and the approval gate is never called, once with an approval subscriber attached and once with none (so the result is not denied/no-client) | `t7` |
| src/daemon/tools/builtins/git/__tests__/git-registration.test.ts: after registerGitTools, getTool finds git_config, git_ls_remote, git_update_ref and git_rm and executeTool runs each; the registered tool is the marked withFailureNet copy and the exported definition is unchanged | `t7` |
| src/daemon/tools/__tests__/call-tool-identity.test.ts, real tools: after registerGitTools and registerGhTools, callTool runs for gitDiffTool (a withFailureNet copy is registered), for several real legacy gh exports (ghProjectListTool, ghIssueListTool, ghRepoViewTool, ghRunListTool and ghReleaseListTool, which ARE the registered objects) and for the defineGhFamily exports (a family such as ghIssueManageTool and ghTrackerTool); a plain registerTool(definition) runs; a definition wrapped twice runs when either level is passed | `t5` |
| src/daemon/tools/__tests__/call-tool-identity.test.ts, replacements: a replacement registered over the same id as '{ ...original, execute: other }' (same outputSchema and inputSchema) is rejected, names the id and its execute is never called; replacements that change only inputSchema, only approval, and only outputSchema are each rejected; the same replacement wrapped by withFailureNet or by withGhFailureNet is rejected; a gh export overwritten by such a replacement is rejected when the original export is passed; an unregistered id is rejected; the failure kind is rejected and the public signature is unchanged for the existing call-tool tests | `t5` |
| src/daemon/tools/__tests__/provenance.test.ts: markDefinition(copy, original) makes definitionOf(copy) the original; a copy of a marked copy records its immediate original and isDefinitionOf reaches both levels; an object made by spreading a marked copy is not marked (definitionOf returns undefined); definitionOf of an unmarked object is undefined; a symbol or property copied by a spread does not mark an object; a chain of 9 wrappers is not accepted for the first object (the 8-step bound) and a cycle ends in false | `t5` |
| src/daemon/tools/__tests__/typed-git-tools.test.ts (the mandatory inventory test): it lists the .ts files of src/daemon/tools/builtins/git other than index, definitions, helpers, coverage and the tests, imports each, collects every export whose value has a string id and an execute function, and requires that set to equal gitToolDefinitions in both directions (the 34 existing and the four new); a tool exported but not listed, and a listed object not exported by a tool file, each fail it; ids are unique; the ids registered by registerGitTools equal the list's ids; every listed tool declares typebox input and output schemas at run time; a negative case runs the same comparison on a temporary directory that holds a tool file left out of a temporary list and asserts the test logic reports it | `t6` |
| src/daemon/tools/__type-tests__/git-tools.typecheck.ts compiled by tsconfig.typecheck.json (npm run typecheck:tools, added to the build chain after tsc): gitToolDefinitions imported from src/daemon/tools/builtins/git/definitions.ts is checked element by element against 'readonly TypedTool[]'; callTool with valid input compiles and its result fields are concretely typed for gitDiffTool and the refresh tools; a wrong input field, a wrong input type and a misspelt result field each carry @ts-expect-error and an unused directive fails the check | `t6` |
| src/daemon/tools/__tests__/typecheck-config.test.ts: the root tsconfig.json excludes '**/__type-tests__/**' (no file under it is in the root program) and tsconfig.typecheck.json includes it with noEmit | `t6` |
| src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts: fieldSchema of a string spec with a pattern carries the pattern and one without builds today's schema; field.name accepts 'octo-org', 'my.repo_1' and 'a.b', and rejects '', '.', '..', 'a/b', 'x?y', 'a#b', 'a%2Fb', names with whitespace and non-ASCII names; two ops that declare a shared field with different patterns make defineGhFamily throw while identical patterns and differing descriptions do not; through executeTool a bad owner returns a rejected input failure, the approval gate is not called (an approval spy, with a subscriber attached and with none), and no gh command runs | `t8` |
| src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts: the path variant encodes '/', '?', '#', '%' and Unicode in a field value and never splices it; the kv variant emits the flag and key=value, and with repeat one pair per list member (labels[]); existing ops build exactly the argv they build today | `t8` |
| src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts: exact argv fixtures for the qs variant: constants only ('?per_page=100'); a constant followed by an optional field present ('?per_page=100&since=2026-10-26T00%3A00%3A00Z') and absent ('?per_page=100'); two constants and a list field with join ',' ('?state=all&per_page=100&labels=a,b%20c', each member encoded, joined by a literal comma, the order of entries as declared); a value with '&', '#', '/' and Unicode is encoded and adds no key; every entry an absent optional field appends nothing (no bare '?'); a list field without join and a malformed entry are refused; the complete argv of the three paginated ops is 'api --paginate <positional> -q <filter>' with the fixed filters (comments '.[] \| {id, author: .user.login, text: .body, at: .created_at, url: .html_url}', labels '.[] \| select(.pull_request \| not) \| .number', titles '.[] \| select(.pull_request \| not) \| {number, title}'), and no filter can come from input; the positionals equal the query strings of ghListIssueComments, ghListIssuesByLabelsStrict and ghListIssuesByTitleTokenStrict in src/workflow/tracker/github.ts for the same inputs | `t8` |
| src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts: for each of the 15 ops the exact argv (path template, kv pairs, qs, fixed literals; for project_create gh project create --title T --owner O --format json), the input and output schemas, the owner, repo and org name pattern and the positive-integer number fields, the approval class and limit; the three paginated ops are run against stand-in gh output of two pages concatenated as lines: more than 100 items return all in API order, pull requests are absent from the two issue listings, empty output gives an empty list, blank lines are skipped and a malformed line gives a rejected failure that names its line number; parseJsonLines unit cases (values in order, blank lines, empty input, a bad line with its number and the 200-character cut); tasks_query returns pageInfo { hasNextPage: false } without endCursor when the API gives no pageInfo, returns hasNextPage false with the non-empty endCursor when the API gives both, and returns issueCount only when it is a number; project_create returns {number, url} for the JSON ghCreateProject reads and a rejected failure for a missing or non-numeric number and for non-JSON output | `t9` |
| src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts: after registerGhTools, getTool finds gh_tracker and executeTool runs one op of it through the registry; callTool of the exported gh_tracker object runs | `t9` |
| src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts: issue_create_typed on an HTTP 422 that names issue types returns a rejected failure whose failure.original is the exact trimmed API text the s10 fallback reads; a diagnostic text of 5000 characters is cut to 4000 in failure.original by the seam (read through executeTool, which returns the tool's failure unchanged) and failure.message is unchanged; FAILURE_ORIGINAL_MAX_CHARS equals the executor's ORIGINAL_MAX_CHARS; the same 422 from an existing gh tool still has no failure.original, and a spawn error from the same op and from an existing tool still has failure.original equal to the trimmed stderr (existing failure objects are unchanged) | `t9` |
| src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts (a closed table): each wrapper mapped to an existing op returns the fields the wrapper reads, from recordings of today's wrapper behaviour: gh_label create, gh_issue_create, gh_issue_view (body, state, labels), gh_issue_edit, gh_issue_comment, gh_issue_close, gh_issue_list, gh_project_list with limit 200 (rows with number, title, url, closed, a closed and an open board of one title), gh_project_manage field-create with SINGLE_SELECT options (success only) and gh:project:item-add (success only); the test fails the build if any mapped op lacks a field its wrapper reads, and no op is added to make it pass | `t9` |
| src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts: the coverage table names the tracker family as s7's amendment and keeps raw gh api excluded | `t9`, `t12` |
| src/daemon/tools/__tests__/call-handler.test.ts: params validation (an invalid caller, a missing field and a non-object input give one error frame and run nothing), ToolDeps built with sessionId 'tools-call:' plus the connection identity ('tools-call' without a context) and the validated params, one done frame with the ToolResult, an unknown tool gives a done frame with a failed ToolResult of kind rejected, closing the stream aborts the signal and resolves a pending approval as cancelled, an approval request reaches an approval.subscribe client, no subscriber denies a destructive call with no-client, a registered hook runs for caller 'workflow' as for 'agent' and runs outside the signal context | `t10` |
| src/daemon/tools/__tests__/call-tool-workflow.test.ts: callTool with caller 'workflow' runs the hook, honours manual and edit-auto for a common tool and always asks for a destructive one | `t10` |
| src/daemon/threads/__tests__/method-class.test.ts: tools.call is classed 'session' and stream, and equals the handler table | `t10` |
| scripts/__tests__/forbidden-spawn-scan.test.ts: one positive-control fixture per form (execFile, spawn, runShell, wrapper call, injected exec seam, direct builtin execute), the exemptions with their reasons, report mode exits 0 and failing mode exits 1, an unparseable file exits non-zero, and a run over src lists gitDiffTool.execute in grounding.ts and changed-files.ts | `t11` |
| src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: config, ls-remote, update-ref and rm are marked as built by s7 and are in gitToolDefinitions | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s7 executeTool effective signal, hook context and approval preview (migration step 1)`
- **[[c2]]** `prior-artifact` `LLD s7 shared process lifecycle and spawnManaged (migration step 2)`
- **[[c3]]** `prior-artifact` `LLD s7 refresh git tool signal passing and git_cat_file timeoutMs (migration step 4)`
- **[[c4]]** `prior-artifact` `LLD s7 migration of the eight direct-spawn sites and the child_process inventory (migration step 3)`
- **[[c5]]** `prior-artifact` `LLD s7 callTool definition provenance (migration step 5)`
- **[[c6]]** `prior-artifact` `LLD s7 typed git definitions list and compile-time check (migration step 6)`
- **[[c7]]** `prior-artifact` `LLD s7 git_config, git_ls_remote, git_update_ref and git_rm contracts (migration step 7)`
- **[[c8]]** `prior-artifact` `LLD s7 FieldSpec pattern, op-table variants, parseJsonLines and the diagnostic seam (migration step 8)`
- **[[c9]]** `prior-artifact` `LLD s7 gh_tracker family and mapped ops (migration step 8)`
- **[[c10]]** `prior-artifact` `LLD s7 tools.call stream method (migration step 9)`
- **[[c11]]** `prior-artifact` `LLD s7 forbidden-spawn scan (migration step 10)`
- **[[c12]]** `prior-artifact` `LLD s7 plan note record and s9 and s10 hand-over (migration step 11)`
