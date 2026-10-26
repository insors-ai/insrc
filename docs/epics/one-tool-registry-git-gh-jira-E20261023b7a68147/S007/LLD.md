<!-- insrc:artifact LLD-b7a68147dcf72034-s7 -->

# LLD: STORY-b7a68147dcf72034-s7

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `999b4ca29b1f...`

After this Story the only code that runs git, gh or acli is the tools under src/daemon/tools, plus two named exemptions: the daemon self-update and the indexer's read-only git ls-files. Every other place calls a registry tool through callTool, so approval (following the effective mode), hooks and the schema check apply to it as to an agent; the wrappers runGit, runGitAsync, runGh, commitAndPushArtifacts and the rest of github.ts are deleted. The Story builds the tools no earlier Story offered (a typed gh tracker family and the git tools config, ls-remote, update-ref and rm), makes the git tools honour the caller's abort signal so the team refresh keeps its 10 s total deadline, moves the design corpus reader onto git_cat_file, and adds one IPC request for the terminal client. A build script finds any other direct spawn by reading the code with the TypeScript compiler, and a retained record lists the moved sites with their tool and test.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-b7a68147dcf72034** § 2. Framework summary

**Rollout phase:** Phase C — cutover
**Consumes:** `sc1` (Tool hook registry), `sc2` (Tool output schema and typed call), `sc4` (Approval class and approval exchange), `sc5` (CLI failure kinds)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step. — owns `sc1`
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s3`: The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own. — owns `sc4`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s5`: The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.
- `s6`: The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.
- `s8`: Private implementation of s8: Reach the rest of git through named, typed tools

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `callTool`

```typescript
callTool<T extends TypedTool>(tool: T, input: Static<T['inputSchema']>, deps: ToolDeps): Promise<TypedToolResult<Static<T['outputSchema']>>>
```

**Parameters:**
- `tool: T extends TypedTool` — the tool definition the site calls; its schemas type the input and the result
- `input: Static<T['inputSchema']>` — the operation's input
- `deps: ToolDeps` — sessionId, repoPath, send and requestId are required; caller ('workflow' or 'daemon'), signal (a multi-call job's deadline or a cancellation) and approvalMode are set by the site

**Returns:** `Promise<TypedToolResult<...>>` — the data typed from the tool's output schema, or a ToolFailure that carries the denial when an approval was declined, timed out or had no client

**Errors:**
- `ToolFailure kind denied` when an approval is declined, expires or has no client; the calling stage fails and does not continue
- `ToolFailure kind schema-mismatch` when the tool's data does not fit its declared output
- `ToolFailure kind timed-out` when the tool's limit or the deps.signal deadline passed while it ran

**Preconditions:**
- unchanged by this Story; it becomes the only way backend code runs git or gh
- the tool is registered on the thread that calls it (the main daemon thread)

**Postconditions:**
- hooks registered on the tool have run for a successful call, with the caller from deps
- a failure is a value, never a throw

### 2.2 `executeTool`

```typescript
executeTool(toolId: string, input: ToolInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `toolId: string` — the registered tool
- `input: ToolInput` — the tool's input
- `deps: ToolDeps` — the call's context

**Returns:** `Promise<ToolResult>` — the tool's result, or a failure

**Errors:**
- `ToolFailure kind timed-out or denied` when new in this Story: deps.signal is already aborted when the call arrives, so the tool is not run; the failure says the call was cancelled before it started

**Preconditions:**
- adds one check before the approval step: an aborted deps.signal refuses the call

**Postconditions:**
- a tool never starts after its caller's deadline or cancellation, whichever tool it is

### 2.3 `git_fetch`

```typescript
git_fetch: Tool (execute(input: ToolInput, deps?: ToolDeps): Promise<ToolResult>)
```

**Parameters:**
- `deps: ToolDeps` _(optional)_ — its signal now reaches the process and the time limit becomes the smaller of 120000 ms and the time the caller has left

**Returns:** `Promise<ToolResult>` — unchanged result shape

**Errors:**
- `ToolFailure kind timed-out` when the caller's deadline passes first; the process is killed

**Preconditions:**
- runShell already accepts a signal; the tool did not pass it

**Postconditions:**
- git_fetch_refs behaves the same way; tool ids and inputs are unchanged (k7)

### 2.4 `git_cat_file`

```typescript
git_cat_file: Tool whose inputSchema gains timeoutMs?: number (an integer from 1 to 30000)
```

**Parameters:**
- `timeoutMs: number` _(optional)_ — a time limit that can only lower the 30000 ms default, so the corpus reader keeps its lowered deadlines

**Returns:** `Promise<ToolResult>` — unchanged result shape

**Errors:**
- `ToolFailure kind rejected` when timeoutMs is not an integer from 1 to 30000

**Preconditions:**
- the default of 30000 stays when the input omits it

**Postconditions:**
- a cancelled signal still kills the process; a caller that holds its own abort signal tells a cancellation from a rejection by checking it

### 2.5 `readPinnedSources`

```typescript
readPinnedSources(localRepository: string, requestInput: unknown, options?: ReaderOptions): Promise<ValidationResult<AcquiredBlob[]>>
```

**Parameters:**
- `localRepository: string` — repository holding the pinned objects
- `requestInput: unknown` — the validated request
- `options: ReaderOptions` _(optional)_ — limits, signal and the runner seam

**Returns:** `Promise<ValidationResult<AcquiredBlob[]>>` — unchanged: the same blobs or the same SourceReaderError codes

**Preconditions:**
- its decoding, object-identity check, tree walk, cumulative budgets and error translation stay in the corpus module
- its process now runs through callTool(git_cat_file) with the batch of revs, base64 and its timeout

**Postconditions:**
- ReaderOptions and validation results are unchanged; a cancelled call still answers 'Source acquisition cancelled.' by the reader's own signal check

### 2.6 `createGitRunner`

```typescript
createGitRunner(spawnProcess?: typeof spawn): BinaryGitRunner
```

**Parameters:**
- `spawnProcess: typeof spawn` _(optional)_ — the spawn seam tests replace

**Returns:** `BinaryGitRunner` — removed: the reader's own process runner no longer exists; its tests use the recorded executor

**Preconditions:**
- removed by this Story

**Postconditions:**
- src/design/corpus/sources/git-reader.ts spawns nothing

### 2.7 `runGit`

```typescript
runGit(cwd: string, args: readonly string[], timeoutMs?: number): GitRun
```

**Parameters:**
- `cwd: string` — repository directory
- `args: readonly string[]` — git arguments
- `timeoutMs: number` _(optional)_ — limit of the one call

**Returns:** `GitRun` — removed: the users under src/workflow/team call git tools through callTool instead

**Preconditions:**
- removed by this Story

**Postconditions:**
- no file outside src/daemon/tools exports or imports it; the build scan fails if it returns

### 2.8 `runGitAsync`

```typescript
runGitAsync: (cwd: string, args: readonly string[], deadline: Deadline) => Promise<GitAsyncRun>
```

**Parameters:**
- `cwd: string` — repository directory
- `args: readonly string[]` — git arguments
- `deadline: Deadline` — the total budget of a refresh, REFRESH_DEADLINE_MS = 10000 in src/workflow/team/sighting-store.ts

**Returns:** `Promise<GitAsyncRun>` — removed: the refresh creates one AbortSignal that expires after the same 10000 ms and passes it as deps.signal to every call it makes, with ls-remote, fetch, rev-parse and the others as tool calls

**Preconditions:**
- removed by this Story
- the 10 s total, which the lock-lifetime reasoning beside REFRESH_DEADLINE_MS depends on, does not change

**Postconditions:**
- a refresh stops at its first timed-out or aborted call and starts no call after the deadline

### 2.9 `commitAndPushArtifacts`

```typescript
commitAndPushArtifacts(repoPath: string, paths: readonly string[], message: string): CommitArtifactsResult
```

**Parameters:**
- `repoPath: string` — repository directory
- `paths: readonly string[]` — artifact files to commit
- `message: string` — commit message

**Returns:** `CommitArtifactsResult` — removed: its five callers perform the same sequence through git_rev_parse, git_stage, git_diff (staged names), git_commit and git_push and build the same { committed, pushed, reason } result

**Preconditions:**
- removed by this Story

**Postconditions:**
- the sequence, the messages and the reasons ('not a git work tree', 'no artifact files on disk', 'nothing to commit (already up to date)', 'git add failed', 'git commit failed', 'committed locally; push failed') are unchanged

### 2.10 `runGh`

```typescript
runGh(args: readonly string[], opts?: { readonly discardOutput?: boolean }): string
```

**Parameters:**
- `args: readonly string[]` — gh arguments
- `opts: { discardOutput?: boolean }` _(optional)_ — whether the output is kept

**Returns:** `string` — removed with the other wrappers of src/workflow/tracker/github.ts; its operations are tool calls (existing gh tools and the new tracker family)

**Preconditions:**
- removed by this Story

**Postconditions:**
- src/workflow/tracker/github.ts has no export that spawns; parsing helpers that do not spawn stay where they are used

### 2.11 `ghAuthOk`

```typescript
ghAuthOk(): { readonly ok: true } | { readonly ok: false; readonly reason: string }
```

**Returns:** `{ ok: true } | { ok: false; reason: string }` — removed: callers call gh_auth (status) through callTool and keep the reason text 'gh CLI not available or not authenticated (run `gh auth login`)'

**Preconditions:**
- removed by this Story

**Postconditions:**
- the sign-in check is a tool call; its failure kinds missing-tool and missing-signin come from the tool

### 2.12 `_setTrackerExecForTests`

```typescript
_setTrackerExecForTests(fn?: TrackerExec): void
```

**Parameters:**
- `fn: TrackerExec` _(optional)_ — the exec stand-in tests installed

**Returns:** `void` — removed: tests record the executor instead, with fake git and gh binaries on PATH as the gh tests already do

**Preconditions:**
- removed by this Story

**Postconditions:**
- the 25 test files that used it are moved to the recorded executor

### 2.13 `githubIdentities`

```typescript
githubIdentities(run?: IdentityCommand): Promise<IdentityLookup>
```

**Parameters:**
- `run: IdentityCommand` _(optional)_ — the command seam, today typeof runShell

**Returns:** `Promise<IdentityLookup>` — the same lookup result (status and identities with authority and node id), now obtained from gh_auth (status) and a tracker-family op that returns users/<login> for a host, and from git_config for the email

**Preconditions:**
- multi-host and multi-account semantics are preserved: every host's account in state success is looked up on its own host, the returned login must equal the account's login case-insensitively, and any failure makes the whole lookup 'unavailable'

**Postconditions:**
- on the installed gh 2.46.0 the old call `gh auth status --json hosts` is an unknown flag and returned 'unavailable'; reading hosts through gh_auth (status) makes the lookup work there, which is a behaviour change the Story records

### 2.14 `registerToolHook`

```typescript
registerToolHook(hook: ToolHook): void
```

**Parameters:**
- `hook: ToolHook` — a rule keyed by tool id that runs after a successful, checked call for every caller

**Returns:** `void` — the hook is registered; its failure is reported on hookFailures

**Preconditions:**
- unchanged by this Story; the Story registers none in production

**Postconditions:**
- a hook registered on a tool runs when a workflow call to that tool succeeds, as for an agent call (the Story's test registers one)

### 2.15 `shouldAsk`

```typescript
shouldAsk(cls: ApprovalClass, deps: Pick<ToolDeps, 'approvalMode'>, flag: CommonApprovalMode): boolean
```

**Parameters:**
- `cls: ApprovalClass` — none, common or destructive
- `deps: Pick<ToolDeps, 'approvalMode'>` — the call's approval mode
- `flag: CommonApprovalMode` — tools.commonApproval, default auto

**Returns:** `boolean` — true when the call asks the user: always for destructive, and for common when the effective mode (deps.approvalMode, else the flag) is manual or edit-auto, whatever the caller

**Preconditions:**
- unchanged by this Story

**Postconditions:**
- a workflow or daemon call follows the same rule as an agent call; with the default auto, common calls do not ask, and when the mode makes them ask a denial is a failure value that stops the stage

### 2.16 `PortFailureKind`

```typescript
type PortFailureKind = 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected'
```

**Returns:** `union of four kinds` — kept as the tracker port's vocabulary; one mapping function turns a ToolFailureKind into it: missing-tool, missing-signin, unreachable and rejected map to themselves, timed-out maps to unreachable as github.ts does today, and conversion-failed, schema-mismatch and denied map to rejected with the original message in reason

**Preconditions:**
- the mapping is the only place where the two vocabularies meet

**Postconditions:**
- the tracker's tests that iterate the four kinds still hold

## 3. Data model changes

### 3.1 `ForbiddenSpawnScan` — new

A script run in the build after tsc, in package.json's build chain beside scripts/check-model-definitions.mjs. It reads every non-test file under src outside src/daemon/tools with the TypeScript compiler and fails on each place that runs git, gh or acli: a call of execFile, execFileSync, spawn or exec whose command resolves to one of them through a literal, a constant, an alias or a parameter a caller fills with one; a call of runShell or runShellBytes with one of them as the first element; a call into a wrapper module; an injected exec seam. It carries positive controls, one fixture per form, like the write-inventory test, and names the file and line of every failure. Exactly two exemptions are written in the script with their reasons: the daemon self-update (src/cli/services/maintenance.ts and src/daemon/installed-commit.ts, which must run with the daemon down) and src/indexer/index.ts (a read-only git ls-files in the indexing and summary workers, which have no tool registry). The scan fails only on spawns that remain; it never fails because old code was removed.

**Call sites:**
- `package.json`
- `scripts/check-model-definitions.mjs`
- `src/workflow/artifact-write-inventory.ts`
- `src/workflow/__tests__/artifact-write-inventory.test.ts`
- `src/cli/services/maintenance.ts`
- `src/daemon/installed-commit.ts`
- `src/indexer/index.ts`

### 3.2 `MigrationRecord` — new

A JSON file kept in the repository with the Story, the record the Story's ac6 asks to keep: one entry per moved site with the file and function, the git or gh operation, the tool that replaced it and the test that covers it through the registry; plus the two exemptions with their reasons. A test checks that every entry's file no longer contains the old form, that its tool is registered and that its test file exists and names the entry; it is regenerated by a script flag and not edited by hand, and it is kept after the old code is gone, so its history does not depend on the code that was removed. It starts from the 17 sites of the context step and is completed when the scan and the record are compared in the build's test.

**Call sites:**
- `src/workflow/tracker/github.ts`
- `src/workflow/runners/build/story-commits.ts`
- `src/workflow/runners/build/range-base.ts`
- `src/workflow/runners/build/standalone-record.ts`
- `src/daemon/steps/build-step/validation-checks.ts`
- `src/workflow/artifacts/companion/header.ts`
- `src/workflow/team/git.ts`
- `src/workflow/team/git-async.ts`
- `src/workflow/convert/plan.ts`
- `src/workflow/tracker/attach.ts`
- `src/workflow/gates.ts`
- `src/analyze/context/repo-ignore-filter.ts`
- `src/design/corpus/sources/git-reader.ts`
- `src/understanding/identity.ts`

### 3.3 `gh tracker tool family` — new

One op-table family in src/daemon/tools/builtins/gh, defined with defineGhFamily like the other families, for the operations of src/workflow/tracker/github.ts that no gh tool returns in the shape the tracker needs, and for the identity lookup: link a sub-issue, look up an issue id, list issue comments with author, text, time and url, post a comment and return its id, list issues by label or by title token, create and attach a milestone, read the current login, read the token scopes, list org issue types and project fields, and read a user by host and login (node id). Each op declares its input and output schema and uses `gh api` with a fixed endpoint; raw `gh api` stays excluded. Reads are class none, changes common, as in s5; the time limits follow s5's table. The s5 coverage table gets a note that this family is s7's amendment, which the user decided.

**Call sites:**
- `src/workflow/tracker/github.ts`
- `src/understanding/identity.ts`
- `src/daemon/tools/builtins/gh/coverage.ts`

### 3.4 `git tools config, ls-remote, update-ref and rm` — new

Four tools in src/daemon/tools/builtins/git, typed like the other git tools, for the commands the sites need and the git coverage table assigned to s8: config (read one key: user.name, user.email), ls-remote (--heads and --symref of a remote), update-ref (delete a ref, destructive when it deletes) and rm (--ignore-unmatch, destructive). The s8 coverage table marks them as built by s7, so s8 does not repeat them, and s7's dependsOn stays s1 to s5 by the user's decision.

**Call sites:**
- `src/workflow/artifacts/companion/header.ts`
- `src/understanding/identity.ts`
- `src/workflow/team/handoff.ts`
- `src/daemon/tools/builtins/git/coverage.ts`

### 3.5 `tools.call IPC request` — new

One request from the terminal client's process to the daemon, classed with the other tools.* methods in src/daemon/threads/method-class.ts and registered in src/daemon/handler-runtime.ts. Request: { toolId: string, input: object, repoPath: string, approvalMode?: 'manual' | 'edit-auto' | 'auto' }. The daemon builds ToolDeps itself: sessionId of the connection, the repoPath, send to that connection's stream, requestId of the IPC request, caller 'workflow', the approvalMode from the request, and a signal owned by the request that is aborted when the connection closes or the client cancels it; connectionExecution is never read from the request. Reply: { result: ToolResult } where ToolResult is the executor's result including failure and hookFailures, or an error for an unknown tool or invalid params. Approval requests for the call go to the attached client over the approval stream like any call; a call with no client is denied. Pending work for a closed connection is aborted, and its approvals resolve as cancelled. The request has no timeout of its own beyond the tool's limit and the approval wait.

**Call sites:**
- `src/cli/services/workflow.ts`
- `src/daemon/handler-runtime.ts`
- `src/daemon/threads/method-class.ts`
- `src/daemon/tools/executor.ts`
- `src/daemon/tools/types.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Hooks run inside executeTool for every call, so a rule registered on a tool runs for a workflow call too. The Story registers none in production (the first rules belong to Story s9 of the team-signoff epic); its test registers one and calls the tool from a workflow path. |
| `sc2` | consumes | Every moved site calls callTool with a TypedTool definition; op-table family tools are checked at run time only (amendment AMD-10), so a site does not rely on a concrete per-family type. |
| `sc4` | consumes | A call from workflow or daemon code follows shouldAsk like any call: destructive always asks; common asks when the effective mode (the call's approvalMode, else tools.commonApproval, default auto) is manual or edit-auto. A denial is a failure value and stops the stage. The terminal client answers approval requests as a client. The Story adds no approval rule. |
| `sc5` | consumes | Tool failures carry ToolFailure kinds; the tracker port keeps PortFailureKind and one mapping function converts, as stated above. The Story adds no failure kind. |

## 5. Error paths

**Error cases**

- **A workflow stage makes a destructive call, or a common call under the manual or edit-auto mode, and no client is attached or the approval expires** (recoverable)
  - Detection: executeTool's approval step returns a failure with kind 'denied' and the denial ('no-client', 'timed-out', 'declined' or 'cancelled'); callTool hands it to the site as a value
  - Response: the site does not retry and does not carry on: the stage fails with the denial in its message
  - User impact: the stage stops and says which call was denied and why; nothing ran
- **A refresh makes several git calls and its 10 s total deadline passes** (recoverable)
  - Detection: the AbortSignal the refresh created fires; a running tool is killed through the signal and returns 'timed-out', and executeTool refuses the next call because its signal is already aborted
  - Response: the refresh stops at its first failed call, starts no call after the deadline and keeps what it has, as it does today
  - User impact: the policy shows as not refreshed with the reason
- **git_fetch or git_fetch_refs runs under a caller's signal or a shorter remaining time** (recoverable)
  - Detection: the tool passes deps.signal to runShell and uses the smaller of its 120000 ms limit and the time left; runShell kills the process when the signal aborts or the limit passes
  - Response: the call returns kind timed-out with the command and the limit named
  - User impact: none beyond the stage's own failure message
- **The terminal client calls tools.call while the daemon is not running** (recoverable)
  - Detection: the IPC connection to the daemon's socket is refused
  - Response: the call fails with a message that the daemon is not running and names the operation; the self-update does not use this path
  - User impact: the command reports that the daemon must be started
- **The terminal client disconnects, or cancels, while its tools.call is running or waiting for an approval** (recoverable)
  - Detection: the daemon sees the connection close or the cancel message and aborts the request's signal
  - Response: the running tool is killed, the pending approval resolves as 'cancelled', and nothing is returned to the closed connection
  - User impact: the operation does not continue after the client has gone
- **tools.call names an unknown tool or carries input that does not fit the tool's schema** (recoverable)
  - Detection: executeTool returns a failure for the unknown tool, or the executor's input check returns it before execute
  - Response: the reply is the failure; nothing runs
  - User impact: the command shows the failure message
- **A tool returns data that does not fit its declared output (gh changed a JSON field, a tracker op got an unexpected answer)** (recoverable)
  - Detection: the executor's output check returns kind 'schema-mismatch' with the tool's original output kept on the failure
  - Response: the tracker port maps it to 'rejected' with the original text in reason; no value is passed on
  - User impact: the tracker action is reported as rejected and is not recorded as done
- **The identity lookup finds a host whose account is not in state success, or a returned login that differs from the account's** (recoverable)
  - Detection: the lookup checks the state from gh_auth (status) and compares the login returned by the tracker op for that host with the account's login, case-insensitively
  - Response: the whole lookup returns 'unavailable' with no identities, exactly as today
  - User impact: no identity is attributed
- **The design corpus reader gets a failure from git_cat_file** (recoverable)
  - Detection: the reader checks its own abort signal first: if it is aborted the failure is a cancellation; otherwise it translates the tool's failure kind (timed-out to limit.exceeded, rejected and the rest to inventory.invalid or reference.missing by the object header)
  - Response: the reader returns the same SourceReaderError codes and messages as before, and still recomputes every object's hash from the bytes the tool returns
  - User impact: none: the reader's results and codes are unchanged
- **A hook registered on a tool fails after a successful call** (recoverable)
  - Detection: executeTool catches it and reports it in hookFailures on the result
  - Response: the site keeps its successful result and reports the hook failure; it does not undo the operation
  - User impact: the stage continues and the report names the rule that failed
- **A new direct spawn is written in a form the build scan does not recognise** (recoverable)
  - Detection: the scan's positive controls fail when a form it claims to catch stops being caught; a form no control covers is a residual risk, found by review
  - Response: the scan is extended with a control for the new form in the same change that found it
  - User impact: none at runtime; the build fails until the form is covered
- **The migration record and the source disagree (an entry's tool is not registered, its test does not exist, or the old form is still in its file)** (recoverable)
  - Detection: the test of the migration record compares each entry with the registry, the test files and the file's text
  - Response: the test fails naming the entry; the record is regenerated by its script flag after the cause is fixed
  - User impact: none at runtime
- **A moved function is now asynchronous and a caller does not await it** (recoverable)
  - Detection: the per-site test that runs the stage through the registry fails because the effect (commit, issue, signoff record) is missing or arrives late; the compiler does not flag a dropped promise
  - Response: the caller is fixed in the same task that changed the function; no site moves without its test
  - User impact: none after the fix

**Edge cases**

| Input | Expected |
| :--- | :--- |
| commitAndPushArtifacts's 'nothing staged' test used the exit code of git diff --cached --quiet | the replacement reads the staged file names from the tool's typed result and takes 'nothing to commit (already up to date)' when there are none, with the same reason text |
| git push with no upstream or no remote at the end of the commit sequence | the commit stays and the result is { committed: true, pushed: false, reason: 'committed locally; push failed: ...' } exactly as today |
| A repository path with spaces or a symbolic link, or the terminal client's relative path | the tool receives the path as cwd and resolves it; the site does not pass -C in argv |
| A workflow stage calls a tool before registerBuiltinTools() has run at daemon start | the executor reports the tool as unknown (a failure value), and the daemon's start order registers the tools before the first workflow can run |
| git_cat_file called with timeoutMs above 30000, below 1 or not an integer | the call is rejected with a message naming the field; the default stays 30000 when it is omitted |
| gh 2.46.0, where `gh auth status --json` is an unknown flag | the identity lookup reads the hosts through gh_auth (status), so on this version it returns identities where the old call returned 'unavailable'; this behaviour change is recorded in the migration record |
| The self-update in the terminal client runs git checkout and merge with the daemon down, and the indexer lists files in a worker | both still spawn git directly; they are the two named exemptions, each with its reason in the scan and the record |

**Invariants to preserve**

- commitAndPushArtifacts's order and its reasons are kept: rev-parse --is-inside-work-tree, add, a staged check, commit -m, push, with the reasons 'not a git work tree', 'no artifact files on disk', 'nothing to commit (already up to date)', 'git add failed', 'git commit failed' and 'committed locally; push failed' [[c2]]
- A workflow stage that pushes, signs off or hands over produces the same artifacts, commits and tracker records as before the cutover [[c2]]
- A call from workflow or daemon code follows shouldAsk exactly as an agent call does: destructive always asks, common asks under manual and edit-auto (call mode, else tools.commonApproval), and a denial stops the calling stage [[c3]]
- The refresh's total deadline stays 10 s (REFRESH_DEADLINE_MS), because the lock-lifetime reasoning beside it depends on it [[c4]]
- The identity lookup keeps its multi-host and multi-account semantics: each account in state success is looked up on its own host, the returned login must equal the account's login, and any failure makes the lookup unavailable [[c5]]
- The design corpus reader keeps its public options, its validation results, its object-identity check and its error codes [[c6]]
- The tracker port's PortFailureKind keeps its four values and timed-out maps to unreachable as github.ts does today [[c1]]
- Raw gh api stays excluded: the tracker family's operations use fixed endpoints with declared output schemas [[c1]]
- The session source inventory baseline of origin/main is regenerated, with its inspection recorded, whenever this Story edits production files under src [[c7]]

## 6. Test strategy

**Test framework:** `node:test run with npx tsx --test`

**Test levels**

- **unit** — The build scan finds every form of direct spawn it claims to and passes code without one; the failure mapping, the commit-sequence result, the abort handling of the tools and the new tools keep their declared behaviour
  - Subjects: `the forbidden-spawn scan (its scanner module and the script run in the build) with a positive control for each spawn form and for runShell with git or gh as its command`, `the ToolFailureKind to PortFailureKind mapping of the tracker port`, `the replacement of commitAndPushArtifacts's sequence and its result`, `executeTool's refusal of a call whose signal is already aborted`, `git_fetch and git_fetch_refs under a caller's signal and a shorter remaining time, and git_cat_file with timeoutMs`, `the gh tracker tool family and the git tools config, ls-remote, update-ref and rm, each against the recorded executor`
  - Fixtures: `one fixture file for each spawn form: literal, constant, alias, parameter filled by a caller, wrapper call, runShell call, injected exec seam`, `a recorded executor: fake gh and fake git binaries on PATH, the way src/daemon/tools/builtins/gh/__tests__/_fakegh.ts does it`, `an AbortController the test aborts before and during a call`
- **integration** — Each moved site runs through the registry with a recorded executor and produces the effect it produced before, including a hook, a denial under the effective approval mode, the 10 s refresh deadline, the identity lookup and the corpus reader
  - Subjects: `src/workflow/runners/build/story-commits.ts, range-base.ts and standalone-record.ts`, `src/workflow/gates.ts, src/workflow/convert/plan.ts, src/workflow/tracker/attach.ts and src/workflow/artifacts/companion/header.ts`, `src/workflow/team/anchor-finder.ts, handoff.ts, policy-reader.ts, policy-refresh.ts, sighting-store.ts and signoff.ts, with the refresh under its 10 s deadline`, `src/workflow/questions.ts, resolve-comment.ts, bugfix/tracker.ts, config/github.ts, tracker-auto.ts, tracker/github-adapter.ts, tracker/setup.ts and tracker/sync.ts`, `src/cli/services/workflow.ts through the daemon's tools.call request, with a real daemon connection`, `src/daemon/steps/build-step/validation-checks.ts and src/analyze/context/repo-ignore-filter.ts`, `src/understanding/identity.ts with two hosts, two accounts and a login mismatch`, `src/design/corpus/sources/git-reader.ts and stage.ts over git_cat_file with a real temporary repository`
  - Fixtures: `a temporary git repository with a remote`, `the recorded executor`, `a hook registered on one tool for the hook test`, `no client attached, and a client that answers, for the approval tests under the manual and the auto mode`
- **contract** — The retained migration record agrees with the registry, the test files and the source, and the scan finds nothing but the two named exemptions
  - Subjects: `the migration record file`, `the two exemptions: the daemon self-update and src/indexer/index.ts`
  - Fixtures: `the real source tree and the registered tools`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `for every entry of the migration record, a test calls the stage or function that held the site with a recorded executor and asserts the tool id and arguments the executor saw`, `the terminal client's workflow service performs its commit and push through the daemon's tools.call request, not by a process of its own, with a real daemon connection` |
| `ac2` | `the build scan fails on each fixture spawn form (literal, constant, alias, parameter, wrapper call, runShell call, injected exec seam) and passes on the source tree except the two named exemptions`, `no file under src outside src/daemon/tools exports or imports runGit, runGitAsync, runGh or commitAndPushArtifacts, and the build chain runs the scan after tsc` |
| `ac3` | `a stage that pushes, signs off or hands over produces the same artifact files, commit messages and tracker records as the recorded results of the old path, compared field by field`, `the commit sequence gives the same result and reason text for not a git work tree, no artifact files, nothing to commit, add failed, commit failed and push failed`, `the identity lookup, the policy refresh and the corpus reader return the same results as before for the same inputs, except the recorded gh 2.46.0 identity behaviour change` |
| `ac4` | `a hook registered on git_commit runs when a workflow stage commits, with caller 'workflow', and its failure is reported on hookFailures without undoing the commit` |
| `ac5` | `a workflow stage that makes a destructive call with no client attached fails with kind denied and the denial and does not run its next step`, `a workflow stage that makes a common call under the manual mode with no client fails the same way, and under the auto mode runs without asking`, `a refresh whose 10 s signal expires stops at its first aborted call and starts none after it` |
| `ac6` | `the migration record equals the sites of the context step plus what the scan finds, every entry names a registered tool and an existing test, and no entry's file still holds the old form`, `the record keeps its entries after the wrappers are deleted, and the scan does not fail because old code is gone` |

## 7. Migration

**State before:** On 2026-10-26 seventeen non-test files outside src/daemon/tools run git or gh themselves, with synchronous execFileSync or execFile or through runShell (src/understanding/identity.ts), plus the wrapper modules src/workflow/tracker/github.ts (about 45 exports, about 30 wrappers, eight of them gh api calls, commitAndPushArtifacts with five callers, a test seam _setTrackerExecForTests used by 25 test files), src/workflow/team/git.ts and git-async.ts (used by six files under src/workflow/team, under a 10 s total refresh deadline), and the terminal client's calls in src/cli/services/workflow.ts and maintenance.ts. None runs through the executor, so none is subject to approval, hooks or the schema check. The registry has no tool for git config, ls-remote, update-ref or rm (assigned to s8) and none for the gh api operations; git_fetch and git_fetch_refs ignore the caller's signal; executeTool does not refuse an aborted call; git_cat_file has a fixed 30 s timeout; the identity lookup's gh auth status --json call fails on the installed gh 2.46.0 (bundles c1 to c7).

**State after:** No file outside src/daemon/tools runs git, gh or acli except the daemon self-update (src/cli/services/maintenance.ts and src/daemon/installed-commit.ts) and src/indexer/index.ts, both named with their reasons in the build scan. Every other place calls a registry tool with callTool; the wrappers runGit, runGitAsync, runGh, commitAndPushArtifacts, createGitRunner and _setTrackerExecForTests no longer exist; the gh tracker family and the four git tools exist; git_fetch, git_fetch_refs and executeTool honour the caller's signal, git_cat_file takes a lowerable timeout; the refresh keeps its 10 s total deadline; a script in the build chain fails the build on any other spawn; the retained migration record matches the registry, the tests and the source; every site has a test that runs through the registry with a recorded executor.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Build the forbidden-spawn scan with its positive controls (one per spawn form and for runShell with git or gh as its command), with the two named exemptions, and run it in report mode so it lists the current sites without failing the build; generate the first migration record from its output — ↩ rollbackable
2. Add the recorded-executor test helper that puts fake git and gh binaries on PATH and records the calls, shared by the workflow tests, and write the mapping from the tool failure kinds to the tracker port's kinds — ↩ rollbackable
3. Make the executor and the tools cancellable: refuse a call whose signal is already aborted, pass the caller's signal and the remaining time through git_fetch and git_fetch_refs, and add the optional lowerable timeout to git_cat_file — ↩ rollbackable
4. Build the tools no earlier Story offered: the gh tracker family, including the user-by-host read, and the git tools config, ls-remote, update-ref and rm; record them in the s5 and s8 coverage tables — ↩ rollbackable
5. Add the daemon's tools.call request for the terminal client, with the connection-owned signal and the daemon-built deps, and class it with the other tools methods — ↩ rollbackable
6. Move the sites in groups, each group with its tests: the build runners, gates, plan, attach, header and validation-checks and the ignore filter; the six users of runGit under src/workflow/team with the 10 s refresh signal; the identity lookup; the design corpus reader; the tracker modules and the importers of github.ts with the five callers of commitAndPushArtifacts; the terminal client's workflow service — ↩ rollbackable
7. Delete runGit, runGitAsync, runGh, commitAndPushArtifacts, the other github.ts wrappers, createGitRunner and the test seam, and move the 25 test files that used them to the recorded executor — ✕ non-rollbackable
8. Switch the scan from report mode to failing mode in the build chain after tsc, regenerate the migration record, and regenerate the session source inventory baseline of origin/main with its inspection recorded — ↩ rollbackable
9. Run the full test sweep in foreground chunks and compare with the baseline recorded for the merged tree — ↩ rollbackable

**Backward compat:** No tool id changes (every id agents use keeps its meaning) and no existing tool input changes except the optional timeoutMs of git_cat_file; the artifacts, commits and tracker records of the workflow stages are unchanged; the removed names are internal modules with no external consumer. One recorded behaviour change: the identity lookup works on gh versions without `gh auth status --json`, which returned 'unavailable' before. The daemon IPC gains tools.call, and the daemon must be running for the terminal client's commit and push, as it already must be for workflow runs. The self-update and the indexer keep working as they do.

## 8. Alternatives considered

### 8.1 a1: Async cutover through callTool with two named exemptions, the tools s7 itself builds, and a split between the spawn scan and the migration record — **CHOSEN**

Every listed site calls a registry tool with callTool and becomes asynchronous; s7 builds the gh tracker family and four git tools; the build check forbids any other spawn except the self-update and the indexer; the record of moved sites is a separate file.

Each site is rewritten to call callTool(<tool definition>, input, deps) with caller 'workflow' or 'daemon'; functions that returned a value become async and their callers follow. s7 builds what no tool offers: one op-table family in src/daemon/tools/builtins/gh for the gh api operations of github.ts and the identity lookup's users/<login> by host, each with a fixed endpoint and output schema (raw gh api stays excluded), and the git tools config, ls-remote, update-ref and rm, with a note in the s5 and s8 coverage tables. commitAndPushArtifacts becomes the same sequence of git_rev_parse, git_stage, git_diff (staged names), git_commit and git_push calls, with the same result and reasons. The refresh budget of 10 s becomes an AbortSignal that expires at 10 s, passed in deps and honoured by every git tool the refresh uses: git_fetch and git_fetch_refs pass deps.signal to runShell and use the smaller of their limit and the remaining time, and executeTool refuses a call whose signal is already aborted before the tool runs. The design corpus reader keeps its decoding and moves its process onto git_cat_file, which gains an optional timeout that can only lower its 30 s default. The terminal client's calls go to the daemon over one new IPC request, tools.call, with exact payloads. Two build artifacts replace the earlier single inventory: a forbidden-spawn scan that runs in the build and fails on any spawn of git, gh or acli outside src/daemon/tools except two named exemptions (the self-update and src/indexer/index.ts), and a retained migration record, a JSON file kept with the code, that lists each moved site with the tool that replaced it and the test that covers it; the check verifies that every entry's tool and test exist, and never fails because old code was removed.

### 8.2 a2: Wider exemptions for sites that are awkward to move

As a1, but the analyze ignore filter, the build validation checks and the corpus reader also stay direct, listed with reasons.

The same rewrite and checks as a1, with the exemption list extended by src/analyze/context/repo-ignore-filter.ts, src/daemon/steps/build-step/validation-checks.ts and src/design/corpus/sources/git-reader.ts, each with a reason. No change to git_cat_file or to the executor's cancellation handling is needed for the corpus reader.

**Rejected because:** Violates k6 and the user's decision that only two sites are exempt; ac1, ac2, ac4, ac6 and k2 are partial.

### 8.3 a3: Two domain ports over callTool, consumers depend on the ports

A git port and a tracker port, each implemented once over callTool, replace the wrappers; consumers call the port methods and tests fake the port.

Instead of rewriting each site to call a tool directly, define a GitPort (the commands the workflow needs, asynchronous) and extend the existing tracker port (src/workflow/tracker/port.ts) with the operations of github.ts. Both are implemented over callTool in one module each, so the failure mapping, caller value and deps live in two places, and every consumer receives the port. Tests inject a fake port instead of _setTrackerExecForTests. The two exemptions, the tools s7 builds, the corpus reader move and the checks are as in a1.

**Rejected because:** Same results as a1 with a smaller test diff, but a port that mirrors the old wrappers risks being the shim k6 forbids and adds a layer the Story does not ask for (ac1 and k6 partial).

### 8.4 a4: Synchronous bridge to the executor

Keep the synchronous call shapes and add a blocking bridge that runs the asynchronous executor and waits for its result.

Provide a callToolSync that starts executeTool elsewhere and blocks the caller with Atomics.wait until the result arrives, so no site becomes asynchronous. Everything else is as a1.

**Rejected because:** Violates ac5, sc4 and k5: the thread that must receive the approval answer is the one blocked waiting for it.

## 9. References

- **[[c1]]** `code` `src/workflow/tracker/port.ts`
- **[[c2]]** `code` `src/workflow/tracker/github.ts`
- **[[c3]]** `code` `src/daemon/tools/approval-policy.ts`
- **[[c4]]** `code` `src/workflow/team/sighting-store.ts`
- **[[c5]]** `code` `src/understanding/identity.ts`
- **[[c6]]** `code` `src/design/corpus/sources/git-reader.ts`
- **[[c7]]** `code` `src/daemon/db/__tests__/session-source-inventory.test.ts`

## 10. Open questions

- Production hooks: the Story registers none (the first rules belong to Story s9 of the team-signoff epic); its test registers one. This was assumed, not confirmed by the user.
- The HLD boundary text for s7 still says the indexer is included and that there is no allowlist; the user's decision of 2026-10-26 makes the indexer a second named exemption, and no typed HLD amendment edits a story boundary's text, so the difference is recorded in docs/plans/tool-registry.md.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**8 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-26T11:42:53.048Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | The replacement tool inventory covers the operations needed to delete all github.ts process wrappers while preserving tracker behavior. | github.ts implements queryTasks using GraphQL search with issueCount, hasNextPage and endCursor, and ghCreateOrgIssueType using POST /orgs/{org}/issue-types; setup.ts calls the latter. Neither operation appears in the proposed tracker family. Existing gh_search issues returns a bounded items result rather than the cursor-page contract. Deleting these wrappers without designing replacements loses existing behavior. [files: src/workflow/tracker/github.ts, src/workflow/tracker/setup.ts, src/daemon/tools/builtins/gh/account.ts] | Add fixed-schema operations and caller migrations for cursor-based task queries and organization issue-type creation; complete a function-by-function replacement table before deleting github.ts. |
| new-versus-reuse | HIGH | Existing git definitions can be passed unchanged to the stated callTool<T extends TypedTool> helper. | TypedTool requires inputSchema: TSchema and a required outputSchema: TSchema, but gitFetchTool, gitCatFileTool and gitRevParseTool are explicitly exported as Tool. Tool exposes inputSchema as Record<string, unknown> and outputSchema as optional. These exports do not satisfy the helper's parameter type, despite having schemas at runtime. [files: src/daemon/tools/call-tool.ts, src/daemon/tools/types.ts, src/daemon/tools/builtins/git/fetch.ts, src/daemon/tools/builtins/git/cat-file.ts, src/daemon/tools/builtins/git/rev-parse.ts] | Include definition typing changes that retain concrete schemas, or explicitly design an approved runtime-typed calling contract. Do not solve this with unchecked casts. |
| new-versus-reuse | HIGH | gh_auth status supplies the account shape and dependencies assumed by the identity migration. | The existing schema is hosts: Array<{host, login, active, state: 'logged-in' \| 'failed'}>, whereas the design repeatedly specifies checking state success. buildAuthStatus uses ghConvert with required: true; ghConvert fails with 'no conversion provider is configured' when deps.conversion is absent. The proposed ToolDeps construction does not supply conversion providers. [files: src/daemon/tools/builtins/gh/account.ts, src/daemon/tools/builtins/gh/convert.ts, src/understanding/identity.ts, src/daemon/tools/types.ts] | Specify adaptation from the actual flat host/account schema, including logged-in state, and wire daemon-owned conversion providers for identity and auth calls. |
| change-sites | HIGH | The inventory and scan enforce that every workflow tool invocation passes through the executor. | grounding.ts calls 'await gitDiffTool.execute({ cwd: repoPath, ...input }, toolDeps)' and changed-files.ts does the same. Neither appears in the migration record or integration subjects. docs/plans/tool-registry.md explicitly names both as s7 migrations. A scan for spawns and old wrappers will not detect these direct execute bypasses. [files: src/workflow/code-review/grounding.ts, src/workflow/runners/build/changed-files.ts, docs/plans/tool-registry.md] | Add both sites and their callers/tests to the inventory, and detect direct builtin execute calls outside the executor where they bypass approval, hooks and validation. |
| change-sites | HIGH | Changing the two fetch tools is sufficient to preserve the refresh's total deadline and cancellation contract. | refreshLocked also resolves revisions, reads a tree and policy content, finds an anchor and updates symbolic refs. git_rev_parse calls readGit with a fixed 10_000 ms and no deps; git_symbolic_ref calls runShell with a fixed 10_000 ms and no signal; git_show performs calls with 15_000/30_000 ms limits and no signal. The design promises cancellation for every refresh call but specifies concrete changes only for fetch and cat-file. [files: src/workflow/team/policy-refresh.ts, src/daemon/tools/builtins/git/rev-parse.ts, src/daemon/tools/builtins/git/symbolic-ref.ts, src/daemon/tools/builtins/git/show.ts, src/daemon/tools/builtins/git/helpers.ts] | Inventory every refresh and anchor operation, name its replacement tool, and explicitly add signal/deadline propagation to all subprocesses it can start, including multi-command tools. |
| data-compatibility | HIGH | The proposed corpus failure translation preserves existing SourceReaderError codes and messages. | createGitRunner currently reports stdout overflow as limit.exceeded/'Git output exceeds byte limit.' and stderr overflow as limit.exceeded/'Git diagnostics exceed byte limit.'. git_cat_file reports these conditions as rejected, while the design maps rejected and remaining failures to inventory.invalid or reference.missing. Thus the stated translation changes observable validation results for valid lower reader budgets. [files: src/design/corpus/sources/git-reader.ts, src/daemon/tools/builtins/git/cat-file.ts] | Define explicit translations for output, diagnostic and object-size limit failures, missing objects, malformed frames and cancellation; preserve the current codes/messages and add regression cases using lowered ReaderOptions limits. |
| error-paths | HIGH | A single aborted-signal check before approval guarantees that no tool starts after cancellation or the deadline. | executeTool awaits buildApprovalRequest and gate().ask before invoking tool.execute. Cancellation can occur during those awaits or immediately after an approval is returned. The proposed pre-approval check does not cover this interval, and several reused tools do not inspect the signal themselves. [files: src/daemon/tools/executor.ts, src/daemon/tools/approval-policy.ts, src/daemon/tools/builtins/git/rev-parse.ts] | Recheck cancellation immediately before tool.execute, propagate it through every relevant subprocess helper, and test cancellation during preview construction and approval completion. |
| boundaries | MED | Hardcoding tools.call caller to workflow preserves the shared IPC contract. | The s3 built-contract section states the request 'MUST carry caller' with agent, daemon or workflow and that the daemon must set deps.caller from it. The proposed request omits caller and always sets workflow, despite declaring sc4 unchanged. [files: docs/plans/tool-registry.md, src/daemon/tools/types.ts] | Preserve the documented caller field and validate its enum, or record an explicit shared-contract amendment separating the terminal-only method from the general tool-call surface. |

#### Could not verify (does not block)

_None._
