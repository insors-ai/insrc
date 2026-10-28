<!-- insrc:artifact LLD-b7a68147dcf72034-s9 -->

# LLD: STORY-b7a68147dcf72034-s9

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `9fcc90f081df...`

Story s9 adds one small module, a git operations facade, that the workflow library and the daemon use to run git and gh through callTool and the executor instead of spawning them. Each operation returns the same shape the old synchronous helper returned, so stages produce the same artifacts, commits and records, and a denied or failed call is reported by the stage. The synchronous helpers become async and the chains above them follow. The team policy refresh keeps its single 10 second deadline and passes it to the tools as a signal and the remaining time. The two sites with their own needs, the design corpus binary reader and the identity lookup, call callTool directly through their existing seams.

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
- `s8`: Private implementation of s8: Reach the rest of git through named, typed tools
- `s10`: Private implementation of s10: Move the tracker and the terminal client onto the registry and remove the old paths

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `gitOps (new module src/workflow/git-ops.ts)`

```typescript
type GitOpsContext = { readonly repoPath: string; readonly caller: 'workflow' | 'daemon'; readonly signal?: AbortSignal | undefined; readonly approvalMode?: 'manual' | 'edit-auto' | 'auto' | undefined; readonly timeoutMs?: number | undefined }; function toolDepsFor(ctx: GitOpsContext): ToolDeps; function callGit<T extends TypedTool>(ctx: GitOpsContext, tool: T, input: Static<T['inputSchema']>): Promise<TypedToolResult<Static<T['outputSchema']>>>
```

**Parameters:**
- `ctx: GitOpsContext` — Where and for whom the call runs: repository, caller (agent is not allowed here), the abort signal the site owns, the approval mode the stage runs under, and an optional lower time limit.
- `tool: TypedTool` — A git or gh tool DEFINITION from gitToolDefinitions or the gh definitions; callTool refuses a definition that is not the registered one.
- `input: Static<T['inputSchema']>` — The tool's typed input, with cwd set to ctx.repoPath unless the operation names another directory.

**Returns:** `Promise<TypedToolResult<...>>` — callTool's result unchanged: success with typed data and the text output, or a ToolFailure (rejected, schema-mismatch, timed out, denied, cancelled).

**Errors:**
- `ToolFailure (returned, not thrown)` when the tool failed, its result did not match its schema, the approval was denied (no client or expired) or the signal fired

**Preconditions:**
- The daemon's tool registry is loaded (the facade runs inside the daemon process, or in a stage that the daemon runs).
- ctx.caller is 'workflow' or 'daemon'.

**Postconditions:**
- Every call goes through callTool and the executor, so the approval, hook and result-check rules apply.
- toolDepsFor builds a ToolDeps with sessionId 'workflow-git', a no-op send, a fresh requestId, the signal, the caller and the approval mode, and no connectionExecution.

### 2.2 `headFullSha (reshaped)`

```typescript
function headFullSha(ctx: GitOpsContext): Promise<string | undefined>
```

**Parameters:**
- `ctx: GitOpsContext` — As above.

**Returns:** `Promise<string | undefined>` — HEAD's full 40-hex sha, or undefined when there is no HEAD, the repository is not a git repository, the call failed or the sha is not 40 hex.

**Preconditions:**
- None.

**Postconditions:**
- Never rejects; a ToolFailure reads as undefined, as the two private headFullSha functions in src/workflow/runners/build/range-base.ts and src/workflow/gates.ts do today.
- Implemented once with git_rev_parse {rev:'HEAD'} (not short) and replaces both private copies.

### 2.3 `commitExists (reshaped)`

```typescript
function commitExists(ctx: GitOpsContext, rev: string): Promise<boolean>
```

**Parameters:**
- `ctx: GitOpsContext` — As above.
- `rev: string` — A sha or ref; checked as `<rev>^{commit}`.

**Returns:** `Promise<boolean>` — true only when git_cat_file {rev, exists:true} succeeds with a positive answer.

**Preconditions:**
- None.

**Postconditions:**
- Never rejects; any failure reads as false (src/workflow/runners/build/range-base.ts:96 and src/workflow/runners/build/standalone-record.ts:297 today).

### 2.4 `mergeInProgress (reshaped)`

```typescript
function mergeInProgress(ctx: GitOpsContext): Promise<boolean>
```

**Parameters:**
- `ctx: GitOpsContext` — As above.

**Returns:** `Promise<boolean>` — true when MERGE_HEAD exists or an uncommitted squash left SQUASH_MSG; any other git failure is logged and reads as false.

**Preconditions:**
- None.

**Postconditions:**
- Keeps the exit-status distinction of src/workflow/runners/build/story-commits.ts:285: a quiet exit 1 means 'no MERGE_HEAD', any other failure is logged by getLogger('story-commits') and does not block a build.

### 2.5 `headShortSha (reshaped)`

```typescript
function headShortSha(ctx: GitOpsContext): Promise<string | undefined>
```

**Parameters:**
- `ctx: GitOpsContext` — As above.

**Returns:** `Promise<string | undefined>` — HEAD's abbreviated sha, or undefined; never an empty string.

**Preconditions:**
- None.

**Postconditions:**
- Uses git_rev_parse {rev:'HEAD', short:true}.

### 2.6 `resolveStoryRangeBase (reshaped)`

```typescript
function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string, ctx?: Omit<GitOpsContext, 'repoPath'>): Promise<string | undefined>
```

**Parameters:**
- `repoPath: string` — Repository.
- `epicHash: string` — Epic.
- `storyId: string` — Story.
- `ctx: Omit<GitOpsContext,'repoPath'>` _(optional)_ — Caller, signal and approval mode; default caller 'daemon'.

**Returns:** `Promise<string | undefined>` — As today but async: the Story's range base, or undefined when it cannot be established.

**Preconditions:**
- None.

**Postconditions:**
- Was synchronous and read-only; now async. Its seven callers (src/daemon/code-review-rpc.ts:159, src/daemon/steps/build-step/phases/validate.ts:366, :423 and :623, src/daemon/steps/code-review-step/controller.ts:146, src/workflow/runners/build/completion-record.ts:86 and src/workflow/runners/build/standalone-record.ts:307) await it; the same applies to storyChangeSet and resolveStoryRangeEnd.
- Still read-only and never rejects.

### 2.7 `runLocalGit / runGitReadOnly (replace runGit and runGitAsync)`

```typescript
function gitRun(ctx: GitOpsContext, args: readonly string[]): Promise<GitRun>
```

**Parameters:**
- `ctx: GitOpsContext` — As above; for the team policy code the signal is derived from the refresh's Deadline and timeoutMs is its remaining time.
- `args: readonly string[]` — The git arguments the team code passes today (rev-parse, rev-list, ls-tree, show, status --porcelain, cat-file -e, remote get-url, for-each-ref, symbolic-ref, fetch).

**Returns:** `Promise<GitRun>` — The existing GitRun shape from src/workflow/team/git.ts: {ok:true, stdout} or {ok:false, stderr, quiet?}, so policy-reader, anchor-finder, handoff, signoff, sighting-store and policy-refresh keep their logic.

**Errors:**
- `none thrown` when every failure, denial or abort is returned as {ok:false}

**Preconditions:**
- Each args vector is mapped to exactly one registered git tool call by an explicit table (the replacement table), not by a generic pass-through; an args vector with no mapping is a programming error caught by a test.

**Postconditions:**
- No generic `git <args>` tool is added to the registry and no raw shell is introduced; the mapping table is the closed list of the operations the team code performs.

### 2.8 `refreshPolicy / createDeadline (reshaped)`

```typescript
function refreshPolicy(repo: string, optsOrBranch?: RefreshOptions | string): Promise<PolicyResult<PolicyRefreshOutcome>>; function createDeadline(totalMs?: number, now?: () => number): Deadline; interface Deadline { remainingMs(): number; readonly signal: AbortSignal }
```

**Parameters:**
- `optsOrBranch: RefreshOptions | string` _(optional)_ — As today, the test seams git, local, write and anchor keep their meaning but their types become the facade's.
- `totalMs: number` _(optional)_ — Total budget; default REFRESH_DEADLINE_MS = 10_000 (src/workflow/team/sighting-store.ts:46).

**Returns:** `Promise<PolicyResult<PolicyRefreshOutcome>>` — As today.

**Errors:**
- `PolicyResult ok:false` when the deadline passed before a call, or any call failed or was aborted; the call after an aborted one is never started

**Preconditions:**
- The lock is held for at most the deadline plus the facade's kill time (2 s, from s7).

**Postconditions:**
- Deadline gains a `signal` that aborts when remainingMs() reaches 0, created from AbortSignal.timeout(totalMs) so it fires without a poll.
- Every git call of the refresh passes ctx.signal = deadline.signal and timeoutMs = remainingMs(); the lock-lifetime reasoning of src/workflow/team/sighting-store.ts depends on 10_000 ms and is re-stated in the plan with the 2 s kill time added.

### 2.9 `createRepoIgnoreFilter (reshaped)`

```typescript
function createRepoIgnoreFilter(repoPath: string): Promise<RepoIgnoreFilter>
```

**Parameters:**
- `repoPath: string` — Repository.

**Returns:** `Promise<RepoIgnoreFilter>` — As today but async; reads the file list through git_ls_files {cached, others, excludeStandard, nullTerminated}.

**Preconditions:**
- None.

**Postconditions:**
- A ToolFailure (including the output limit) degrades to the permissive filter with the same warning as src/analyze/context/repo-ignore-filter.ts:116 today.

### 2.10 `githubIdentities / identity gitEmail seam (reshaped)`

```typescript
function githubIdentities(run?: IdentityCommand): Promise<IdentityLookup>
```

**Parameters:**
- `run: IdentityCommand` _(optional)_ — The existing test seam; its default changes from runShell to a function that calls the gh auth status tool through callTool.

**Returns:** `Promise<IdentityLookup>` — As today: missing-integration when gh is absent, unavailable on a non-zero exit or truncated output, otherwise the per-host identities.

**Preconditions:**
- The registry has a tool that runs `gh auth status --json hosts` and returns its raw text and exit status (see openQuestions).

**Postconditions:**
- The 15 s limit and the 256 KB output limit are kept; multi-host and multi-account semantics are unchanged (ac4).

### 2.11 `createGitRunner / BinaryGitRunner (corpus reader)`

```typescript
type BinaryGitRunner = (args: readonly string[], input: Uint8Array, options: BinaryGitOptions) => Promise<Uint8Array>
```

**Parameters:**
- `args: readonly string[]` — As today.

**Returns:** `Promise<Uint8Array>` — Git's raw stdout up to options.stdoutLimit.

**Errors:**
- `SourceReaderError` when limit.exceeded or inventory.invalid, with the same codes and messages as today

**Preconditions:**
- The corpus reader's git operations need binary stdout, stdin content and the hardened read arguments (GIT_READ_ARGS) and environment (gitEnvironment).

**Postconditions:**
- Moves onto git_cat_file (encoding base64, stdoutLimit, stderrLimit, timeoutMs, isolated true) where the operation is a read of objects; any operation of the reader that this tool cannot express is an open question for s8 (the long tail of git) and is not approximated.

### 2.12 `gitDiffTool.execute call sites (builtin-execute)`

```typescript
gitDiffTool.execute({ cwd: repoPath, ...input }, toolDeps)
```

**Parameters:**
- `input: Static<typeof gitDiffTool.inputSchema>` — As today.

**Returns:** `Promise<ToolResult>` — Replaced by callGit(ctx, gitDiffTool, input) so the executor's approval, hooks and result check apply.

**Preconditions:**
- None.

**Postconditions:**
- src/workflow/code-review/grounding.ts:417 and src/workflow/runners/build/changed-files.ts:112 no longer call execute directly.

## 3. Data model changes

### 3.1 `GitOpsContext` — new

The per-call context of the facade: repoPath, caller ('workflow' or 'daemon'), signal, approval mode and an optional lower time limit. It is not persisted. A site that has no signal passes none; a stage that has one (the refresh Deadline, a request signal) passes it.

**Call sites:**
- `src/workflow/runners/build/range-base.ts`
- `src/workflow/runners/build/story-commits.ts`
- `src/workflow/team/policy-refresh.ts`
- `src/workflow/gates.ts`

### 3.2 `Deadline` — field-add

Gains a read-only `signal: AbortSignal` that aborts when the total budget is spent; remainingMs() is unchanged.

```
interface Deadline { remainingMs(): number; readonly signal: AbortSignal }
```

**Call sites:**
- `src/workflow/team/git-async.ts:20`
- `src/workflow/team/policy-refresh.ts:60`
- `src/workflow/team/handoff.ts:471`

### 3.3 `replacement table and migration record` — new

A table in the Story's documentation: one row per site (file and line from the scan, the old call, the facade operation or the registry tool replacing it, the caller, the signal, the approval mode and the test that runs it through a recorded executor). The migration record lists the same rows with the commit that moved each. They are documents, not stored data.

**Call sites:**
- `scripts/forbidden-spawn-scan.mjs`

## 4. Error paths

**Error cases**

- **A moved call needs approval and no client is attached, or the approval request expires** (recoverable)
  - Detection: callTool returns a ToolFailure whose kind is denied (reason no-client or expired) from the executor's approval step; the facade returns it unchanged
  - Response: The facade operations that return a value (headFullSha, commitExists and the other 'never throws' helpers) read a denial as their failure value, but they log the denial at warn with the tool id and reason; a stage-level call that changes something (commit, push, update-ref) is reported by the stage as a failure naming the denial and the stage does not continue (ac5). Read-only git tools are class none and never ask, so only the changing calls of s10 and a destructive tool can be denied here.
  - User impact: A stage that would have run git silently now fails with a message naming the denied operation when its approval is denied; read-only stages are unaffected.
- **The abort signal fires (the team refresh's Deadline, a request signal) while a call is running or before it starts** (recoverable)
  - Detection: The executor rechecks the effective signal before execute (s7) and kills the process group on abort; callTool returns a ToolFailure of kind cancelled or timed out
  - Response: gitRun returns {ok:false, stderr, timedOut:true} in the shape runGitAsync returned; refreshPolicy returns ok:false at the first aborted call and starts none after it (it checks deadline.signal.aborted before each call).
  - User impact: A refresh that runs past 10 s fails with 'the refresh deadline passed' as today; the lock is released after the kill time (up to 2 s).
- **A tool result does not match its declared output schema** (recoverable)
  - Detection: The executor's schema check returns a ToolFailure kind schema-mismatch; callTool passes it on
  - Response: The facade never passes the result on: the helper reads it as its failure value and logs the mismatch at warn. No output is parsed by the site any more.
  - User impact: A git version whose output differs from the schema yields 'undefined' or 'false' results where the old code parsed it leniently; this is the k2 rule (a mismatch is a failure) and is visible in the log.
- **The tool registry is not loaded or the definition passed is not the registered one** (terminal)
  - Detection: callTool returns kind rejected with 'No tool registered' or 'is not the definition that was passed'
  - Response: Treated as a failure value like any other; a test per facade operation proves each definition it passes is the registered one.
  - User impact: Would show as a stage that cannot read git; caught by the tests at build time rather than at run time.
- **A caller in a code path that runs outside the daemon process (the terminal client, a script) reaches a moved helper** (terminal)
  - Detection: toolDepsFor needs the daemon's registry; getTool returns undefined and callTool returns rejected
  - Response: The helper's failure value; the design records which moved modules are reachable only inside the daemon (the build runners, the gates, the team code are, but src/workflow/team/* is also used by the terminal client's workflow service in s10's scope) and an open question asks how the terminal client reaches them (through tools.call, per s10 ac2).
  - User impact: A terminal-client path that imports a moved helper directly would get failures instead of git results; s10 owns the terminal client.
- **The sync-to-async change leaves a caller that still treats the result as a value** (terminal)
  - Detection: tsc: a Promise is not assignable to string, boolean or undefined at every caller; an ESLint no-floating-promises style check is not available, so a forgotten await in a condition (if (mergeInProgress(...))) is a Promise and always truthy
  - Response: Every moved helper keeps its name, so a missed await would compile in a boolean position; to prevent it the plan changes the helper names that return booleans (commitExists, mergeInProgress) to a form tsc rejects in a condition, or adds a unit test per caller that fails if the awaited value is ignored.
  - User impact: Without this, a merge in progress would never block a build (the Promise is truthy the other way: it would always block).

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with no commits (unborn HEAD) | headFullSha and headShortSha return undefined, commitExists returns false, as today; the ToolFailure kind is not shown to the caller. |
| A directory that is not a git repository | Each helper returns its failure value; mergeInProgress logs the same warn as today and returns false; createRepoIgnoreFilter returns the permissive filter without calling git when .git is missing (that check stays). |
| A sha in a stored range base that no longer exists (garbage collected) | commitExists returns false and resolveStoryRangeBase returns the 'invalid' result with the same reason text as range-base.ts:128 today. |
| git rev-parse -q --verify MERGE_HEAD exits 1 without a message (no merge) | The tool reports a quiet failure; mergeInProgress then checks SQUASH_MSG; exit codes other than 1 are logged and read as false, as at story-commits.ts:285. |
| A listing of 50 MB of file names (createRepoIgnoreFilter on a large repository) | git_ls_files has its own output budget; if the budget is below the old 50 MB maxBuffer the filter degrades to permissive with the warning, so the tool's limit must be at least the old one (checked in the plan); this is an open question for the git family Story if the limit is lower. |
| The refresh deadline is 0 or negative at the first call | refreshPolicy returns 'the refresh deadline passed before it started' before any call, as today. |
| The gh auth status output is larger than 256 KB or truncated | githubIdentities returns unavailable, as today; the limit is passed to the tool as its output budget. |
| Two sites call the same read at the same moment (for example validate and the code review both read HEAD) | Each is an independent executor call; there is no cache in the facade, so results are as fresh as today. |

**Invariants to preserve**

- A moved helper that documents 'never throws' (commitExists, headFullSha, introducingCommit, resolveStoryRangeEnd, mergeInProgress, headShortSha, priorCommit, resolveStoryRangeBase) still never rejects and returns the same failure value for the same git outcome. [[c3]]
- The team policy refresh uses one Deadline for the whole refresh, started before its first git call, and holds its lock for no longer than that deadline plus the kill time; the deadline stays 10_000 ms (REFRESH_DEADLINE_MS). [[c3]]
- The range base stored in a persisted artifact is a full 40-hex sha, never an abbreviation (gates.ts headFullSha comment): headFullSha must call git_rev_parse without short. [[c3]]
- The story commit set is the commits carrying the Insrc-Story trailer, listed in the same order and with the same squash and merge handling as story-commits.ts git() produces today (exit codes in okCodes are not failures). [[c3]]
- The design corpus reader keeps its hardening: no inherited GIT_CONFIG_* or alternate object stores, replacement refs off, protocol.allow never, hooks and fsmonitor off, and its own byte and time limits and process-group kill. [[c3]]
- Every tool id agents use today keeps its meaning (k7); s9 adds no tool and changes no input or output of an existing one. [[c3]]
- The identity lookup keeps its per-host, per-account output and its status vocabulary (available, disconnected, missing-integration, unavailable). [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), assert/strict; tests co-located in __tests__ folders; real temporary git repositories for integration cases; a recorded executor (a test double registered for executeTool/getTool that records tool id, input and deps and returns canned ToolResults) for the facade; use --test-force-exit for suites that start git processes.`

**Test levels**

- **unit** — The facade maps every ToolFailure kind to the old helper's failure value and builds ToolDeps correctly.
  - Subjects: `src/workflow/__tests__/git-ops.test.ts: toolDepsFor sets the caller, the signal, the approval mode and sessionId workflow-git, and rejects the agent caller`, `src/workflow/__tests__/git-ops.test.ts: each facade operation (headFullSha, commitExists, mergeInProgress, headShortSha) returns its old failure value for rejected, schema-mismatch, denied no-client, denied expired, timed-out and cancelled failures, and never rejects`, `src/workflow/__tests__/git-ops.test.ts: headFullSha asks git_rev_parse without short and returns undefined for a result that is not 40 hex`, `src/workflow/__tests__/git-ops.test.ts: gitRun maps each args vector of the team code to one registered git tool call and an unmapped vector fails the test`
  - Fixtures: `recorded executor double`, `temporary git repository helper (existing in src/workflow/team/__tests__)`
- **integration** — The moved sites behave as before against a real repository and the real registry.
  - Subjects: `src/workflow/runners/build/__tests__/range-base-registry.test.ts: resolveStoryRangeBase returns the same base as the old synchronous version for a stamped repository, a garbage-collected sha, an unborn HEAD and a non-repository`, `src/workflow/runners/build/__tests__/story-commits-registry.test.ts: storyChangeSet and mergeInProgress give the old results for a merge in progress, a squash leftover and a clean tree`, `src/workflow/__tests__/gates-stamp-registry.test.ts: the gate stamp stores a full 40-hex range base`, `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts: the validation checks list the same files as the old git ls-files and diff calls`, `src/analyze/context/__tests__/repo-ignore-filter-registry.test.ts: createRepoIgnoreFilter gives the same filter as before and degrades to permissive when the tool fails`, `src/workflow/team/__tests__/policy-refresh-registry.test.ts: refreshPolicy against a local bare remote returns the same outcome as before`
  - Fixtures: `real temporary git repositories`, `a local bare remote`
- **contract** — The identity lookup and the corpus reader keep their public behaviour through the registry, and the scan covers every site.
  - Subjects: `src/understanding/__tests__/identity-registry.test.ts: githubIdentities keeps missing-integration, unavailable (non-zero exit, truncated output) and the per-host per-account result when the call goes through the registry`, `src/design/corpus/__tests__/git-reader-registry.test.ts: the corpus reader keeps its limit.exceeded and inventory.invalid codes and its byte and time bounds through the registry`, `scripts/__tests__/forbidden-spawn-scan-s9.test.ts: the scan reports none of the s9 files, including the githubIdentities site, and its builtin-execute detection covers gitDiffTool.execute`
  - Fixtures: `identity provider doubles`, `corpus fixture repository`
- **unit** — The refresh deadline and the abort behaviour (ac3, ac5).
  - Subjects: `src/workflow/team/__tests__/policy-refresh-deadline.test.ts: when the Deadline signal aborts during a call, the refresh stops at that call, starts no call after it and releases its lock within the deadline plus the kill time`, `src/workflow/team/__tests__/policy-refresh-deadline.test.ts: a deadline of 0 returns the 'deadline passed before it started' result with no call`, `src/workflow/__tests__/git-ops-denial.test.ts: a call denied for no client or an expired approval makes the calling stage report the denial and not continue`
  - Fixtures: `fake clock`, `recorded executor double`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `scripts/__tests__/forbidden-spawn-scan-s9.test.ts: the scan reports none of the s9 files, including the githubIdentities site, and its builtin-execute detection covers gitDiffTool.execute`, `src/workflow/__tests__/git-ops.test.ts: toolDepsFor sets the caller, the signal, the approval mode and sessionId workflow-git, and rejects the agent caller` |
| `ac2` | `src/workflow/runners/build/__tests__/range-base-registry.test.ts: resolveStoryRangeBase returns the same base as the old synchronous version for a stamped repository, a garbage-collected sha, an unborn HEAD and a non-repository`, `src/workflow/runners/build/__tests__/story-commits-registry.test.ts: storyChangeSet and mergeInProgress give the old results for a merge in progress, a squash leftover and a clean tree`, `src/workflow/__tests__/gates-stamp-registry.test.ts: the gate stamp stores a full 40-hex range base`, `src/daemon/steps/build-step/__tests__/validation-checks-registry.test.ts: the validation checks list the same files as the old git ls-files and diff calls` |
| `ac3` | `src/workflow/team/__tests__/policy-refresh-deadline.test.ts: when the Deadline signal aborts during a call, the refresh stops at that call, starts no call after it and releases its lock within the deadline plus the kill time`, `src/workflow/team/__tests__/policy-refresh-deadline.test.ts: a deadline of 0 returns the 'deadline passed before it started' result with no call`, `src/workflow/team/__tests__/policy-refresh-registry.test.ts: refreshPolicy against a local bare remote returns the same outcome as before` |
| `ac4` | `src/understanding/__tests__/identity-registry.test.ts: githubIdentities keeps missing-integration, unavailable (non-zero exit, truncated output) and the per-host per-account result when the call goes through the registry`, `src/design/corpus/__tests__/git-reader-registry.test.ts: the corpus reader keeps its limit.exceeded and inventory.invalid codes and its byte and time bounds through the registry` |
| `ac5` | `src/workflow/__tests__/git-ops-denial.test.ts: a call denied for no client or an expired approval makes the calling stage report the denial and not continue`, `src/workflow/__tests__/git-ops.test.ts: each facade operation (headFullSha, commitExists, mergeInProgress, headShortSha) returns its old failure value for rejected, schema-mismatch, denied no-client, denied expired, timed-out and cancelled failures, and never rejects` |
| `ac6` | `scripts/__tests__/forbidden-spawn-scan-s9.test.ts: the scan reports none of the s9 files, including the githubIdentities site, and its builtin-execute detection covers gitDiffTool.execute`, `src/workflow/__tests__/git-ops.test.ts: gitRun maps each args vector of the team code to one registered git tool call and an unmapped vector fails the test`, `src/workflow/__tests__/git-ops.test.ts: headFullSha asks git_rev_parse without short and returns undefined for a result that is not 40 hex` |

## 6. Migration

**State before:** About 20 production sites in the workflow library, the daemon, the analyze path, the understanding identity lookup and the design corpus reader run git directly: execFileSync in src/workflow/runners/build/range-base.ts, story-commits.ts, standalone-record.ts, src/workflow/gates.ts, src/workflow/convert/plan.ts, src/workflow/artifacts/companion/header.ts, src/daemon/steps/build-step/validation-checks.ts and src/analyze/context/repo-ignore-filter.ts; the synchronous runGit and the Deadline-based runGitAsync in src/workflow/team; a hardened spawn runner in src/design/corpus/sources/git-reader.ts; gh auth status through runShell in src/understanding/identity.ts; and two direct gitDiffTool.execute calls in src/workflow/code-review/grounding.ts and src/workflow/runners/build/changed-files.ts. Their helpers are synchronous and documented 'never throws'. The registry (s1 to s7) is ready: callTool, the executor with approval, hooks and result check, tools.call, the abort signal and process-group kill, and the forbidden-spawn scan in report mode listing 55 sites (bundle 1 and bundle 4 of the s1 context).

**State after:** src/workflow/git-ops.ts holds a closed list of async operations over callTool (GitOpsContext, toolDepsFor, callGit, headFullSha, commitExists, mergeInProgress, headShortSha, gitRun and the others the replacement table lists). Every s9 site calls it or callTool directly. The helpers are async and their callers await them. Deadline carries an abort signal and the policy refresh passes it with the remaining time. runGit and runGitAsync in src/workflow/team have no remaining caller in s9's scope (s10 deletes them). The scan reports none of the s9 files, including githubIdentities, and the replacement table and migration record list every site with its test.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Fix the scan first: make forbidden-spawn-scan.mjs detect runShell and other helpers whose argv is a named constant or parameter when the file imports them, so githubIdentities appears, and add the s9 replacement table as a document listing every scan site and the open sites (tracker/attach.ts, the signoff runGit calls). Commit with the report-mode output attached. — ↩ rollbackable
2. Add src/workflow/git-ops.ts with GitOpsContext, toolDepsFor, callGit and the failure mapping, plus its unit tests with a recorded executor. No site uses it yet. — ↩ rollbackable
3. Add Deadline.signal to createDeadline and test it with a fake clock. Nothing reads it yet. — ↩ rollbackable
4. Move the leaf helpers one file at a time, each with its async ripple and tests in the same commit: range-base.ts (commitExists, headFullSha, introducingCommit, resolveStoryRangeEnd, resolveStoryRangeBase) with its seven callers, then story-commits.ts (git(), mergeInProgress, storyChangeSet) with implement.ts and validate.ts, then standalone-record.ts, gates.ts, validation-checks.ts, convert/plan.ts, companion/header.ts, changed-files.ts and grounding.ts (replacing the direct execute calls). — ↩ rollbackable
5. Move the team code: add gitRun to the facade with the closed args-to-tool table, move policy-reader, anchor-finder, sighting-store, handoff and the three signoff runGit calls (if the user assigns them to s9), then policy-refresh with the Deadline signal. — ↩ rollbackable
6. Move the repo ignore filter, the identity lookup and the corpus reader, each only when the registry has a tool shape that expresses its operation; any operation without one stops the step and is reported as an open question to the family Story, never approximated. — ↩ rollbackable
7. Run the scan and require it to report none of the s9 files; run the full sweep once; write the migration record with the commit of each row. — ↩ rollbackable

**Backward compat:** No public interface outside the repository changes. Inside it, the signatures of the moved helpers change from synchronous to async (a source-level break handled in the same commits as their callers; tsc finds every caller, and the boolean-returning helpers are renamed so a missing await cannot compile in a condition). RefreshOptions keeps its seams git, local, write and anchor with the facade's types; tests that pass doubles are updated. Persisted artifacts, commits, tracker records and the IPC methods are unchanged. s10 still finds runGit, runGitAsync and createGitRunner in place until it deletes them, so s9 can land before s10.

## 7. Alternatives considered

### 7.1 a1: Inline callTool at every site

Each site calls callTool with the git or gh definition itself and maps the typed result to what the old helper returned.

Every moved helper keeps its name and its documented result (a boolean, an optional sha, a thrown NoBuildChangesError, a GitRun) but its body becomes `await callTool(gitXxxTool, input, deps)` with deps built at the site: caller 'workflow' or 'daemon', the signal the site already owns or a new one, the approval mode the stage runs under, and repoPath. A synchronous helper becomes async, and every caller up the chain becomes async to the first function that is already async (the stage handlers in src/daemon/steps/build-step/phases and the code review controller are async; resolveStoryRangeBase, storyChangeSet, mergeInProgress, the team policy-reader functions and the gates stamp path are not). The error mapping from ToolFailure back to each helper's old 'never throws' result is written at each site.

**Rejected because:** Partial on ac2, ac5 and ac6 (s3 scores): the failure mapping is repeated at about 20 sites, so the 'never throws' results can drift and no fixture is shared.

### 7.2 a2: One workflow git facade over callTool — **CHOSEN**

A small module of named async operations (head sha, commit exists, merge in progress, config value, list files, run a read) built once over callTool, imported by every s9 site.

Add one module in the workflow library (for example src/workflow/git-ops.ts) that exports the operations the s9 sites actually perform, each an async function taking repoPath and an options object {signal, approvalMode, caller} and returning the old helper's result shape. It owns the deps construction, the caller ('workflow' from the workflow library, 'daemon' from daemon code), the mapping of ToolFailure to the 'never throws' results, and the stderr text the callers display. The tools it calls are the existing git definitions (git_rev_parse, git_cat_file, git_log, git_diff, git_ls_files, git_config, git_status) and gh_auth/gh_api where an operation exists, and nothing new is added to the registry unless a site needs an input a tool lacks, in which case that need is an open question for the family Story and not a silent addition. The async ripple is as in a1. The team policy code passes the shared Deadline as a signal and the remaining time through the facade.

### 7.3 a3: Gather git facts once per stage, keep leaf helpers pure

Each stage entry reads the git facts it needs through the registry once, asynchronously, and the old synchronous helpers become pure functions over those facts.

Instead of making every helper async, each entry point that is already async (the build-step phases, the code review controller, the gates stamp caller) first gathers a typed GitFacts snapshot through callTool (head sha, whether named commits exist, merge state, the story commit list, the changed paths) and passes it down; resolveStoryRangeBase, storyChangeSet and mergeInProgress take the facts as an argument and stay synchronous. The facts are read at one moment per stage.

**Rejected because:** Violates ac2 (a snapshot can differ from the moment-of-use reads) and ac4, and leaves the team, identity and corpus sites unaddressed.

## 8. References

- **[[c1]]** `analyze-bundle` `the sites s9 owns, from node scripts/forbidden-spawn-scan.mjs (report mode, 55 sites on 2026-10-27)` — "src/workflow/runners/build/range-base.ts (4 execFileSync: commitExists cat-file -e line 97, headFullSha rev-parse HEAD line 235, introducingCommit git log --diff-filter=A line 315, resolveStoryRangeEn"
- **[[c2]]** `analyze-bundle` `which sites belong to s10, not s9 (adjacent boundary)` — "Two sites are not clearly in either DEF: src/workflow/tracker/attach.ts:55 and the team signoff runGit calls at src/workflow/team/signoff.ts:388, :395 and :569"
- **[[c3]]** `analyze-bundle` `callers of the team runGit wrapper (sync) and of the build-runner git helpers: the sync-to-async question` — "callTool in src/daemon/tools/call-tool.ts is async only (it awaits executeTool), takes the tool DEFINITION, requires a TypedTool"
- **[[c4]]** `analyze-bundle` `what s7 built that s9 consumes (docs/plans/tool-registry.md, section 's7 built (2026-10-27)')` — "s7 left the sending side of the shared deadline signal to s9"
- **[[c5]]** `code` `src/daemon/tools/call-tool.ts:28` — "export async function callTool<T extends TypedTool>("
- **[[c6]]** `code` `src/workflow/team/sighting-store.ts:46` — "export const REFRESH_DEADLINE_MS = 10_000;"
- **[[c7]]** `code` `src/daemon/tools/builtins/git/ls-files.ts:34` — "const argv = ['git', '--literal-pathspecs', 'ls-files', '-z'];"
- **[[c8]]** `doc` `docs/plans/tool-registry.md#s7-built-2026-10-27-what-s9-and-s10-build-against` — "s9 builds the sending side of the shared deadline signal"
- **[[c9]]** `doc` `docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md#69-story-b7a68147dcf72034-s9--move-the-workflow-librarys-and-the-daemons-direct-git-and-gh-calls-onto-the-registry`
- **[[c10]]** `stakeholder` `user decision 2026-10-26: split s7 into s7, s9 and s10 (docs/plans/tool-registry.md#s7-split-into-s7-s9-and-s10-decided-2026-10-26)`

## 9. Open questions

- Ownership gap (needs the user): src/workflow/tracker/attach.ts:55 runs git directly but is neither a src/workflow/tracker/github.ts caller (s10 ac1) nor named in s9; and the runGit calls at src/workflow/team/signoff.ts:388, :395 and :569 sit beside the s10-owned commitAndPushArtifacts call at :385. s9 plans to take the runGit callers (s10 deletes runGit and runGitAsync, so no caller may remain) and leaves attach.ts to s10 unless told otherwise.
- Correction to the createRepoIgnoreFilter entry: git_ls_files has no excludeStandard or nullTerminated input. It adds --exclude-standard whenever others or ignored is set and always passes -z (src/daemon/tools/builtins/git/ls-files.ts:34-42); the intended call is {cached:true, others:true}. Whether its read budget (readGit, 30 s) is at least the old 50 MB maxBuffer and 'git ls-files' time of src/analyze/context/repo-ignore-filter.ts:111 is not checked; if lower, it is a need for the git family Story, not an approximation here.
- githubIdentities (src/understanding/identity.ts) must run `gh auth status --json hosts` with a 15 s limit and a 256 KB output limit and read the raw text and exit status. The registered tool is gh_auth (src/daemon/tools/builtins/gh/account.ts:171); whether its status op returns that raw text, the exit status and the spawn-error distinction (missing-integration) has not been verified. If it does not, s5's gh account family needs the shape; s9 does not approximate it.
- The design corpus reader (src/design/corpus/sources/git-reader.ts:37) needs stdin input, binary stdout, GIT_READ_ARGS hardening and its own byte, time and process-group limits. git_cat_file expresses a read of objects with base64, stdoutLimit, stderrLimit, timeoutMs and isolated, but the exact set of git commands the reader runs through createGitRunner has not been listed here; any command the tools cannot express is a need for s8 (the long tail of git).
- The scan misses src/understanding/identity.ts githubIdentities (runShell with a non-literal argv). Step 1 of the migration extends the scan; the replacement table lists the site by hand until then.
- Call graph not run: the caller lists of runGit, resolveStoryRangeBase, storyChangeSet, mergeInProgress and headShortSha come from text search and reading the files. The plan must re-verify them with the analyzer before the async ripple is sized, and test.locate was not run, so which existing tests change is open.
- src/workflow/team/* is also used by the terminal client's workflow service (s10 ac2). How a client process reaches the moved team helpers, which need the daemon's registry, is s10's decision through tools.call.
- Alternative scoring (alt2): the constraints k1, k3, k4 and k5 were not scored for any alternative. k1, k3 and k4 are unaffected by the choice and k5 is covered by ac5.
- Invariant sources (ep3): each invariant is shown by an s1 bundle (never-throws helpers and the stamp in bundles 1 and 3, the Deadline in bundle 3, the corpus hardening in bundle 1) but the source field names only the epic capability c3.
- A missed await on a boolean helper (commitExists, mergeInProgress) compiles; the plan must rename them or add a per-caller test, as the error paths state.
- The HLD framework summary says the cutover is one change; the split into s7, s9 and s10 is the user's recorded decision of 2026-10-26 (docs/plans/tool-registry.md). The HLD keeps its text.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**10 do not hold · 0 could not be verified · 3 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-27T10:58:17.042Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| current-behaviour | HIGH | resolveStoryRangeBase returns an invalid result for a stored base whose commit no longer exists. | readBuildStart returns { kind: 'invalid', reason: 'rangeBase names a commit this repository does not have' }. resolveStoryRangeBase instead logs 'ignoring an invalid build-start file' and continues through upstream stamps and introducing commits, ultimately returning string \| undefined. Upstream stampedBase values are not checked for commit existence. [files: src/workflow/runners/build/range-base.ts] | Correct the edge case and preserve the distinction between stamp validation and range resolution, including fallback precedence. |
| new-versus-reuse | HIGH | The existing gh_auth status operation can support the specified identity-command replacement. | gh_auth status runs ['auth', 'status'] with only an optional hostname, limitS: 30, and converts text through ghConvert into { hosts: [...] }. githubIdentities requires '--json hosts', preserves spawn/truncation distinctions, and additionally calls 'gh api --hostname ... users/<login>' to obtain node_id. Replacing its command seam with an auth-status-only function cannot preserve these operations. [files: src/daemon/tools/builtins/gh/account.ts, src/understanding/identity.ts, docs/plans/tool-registry.md] | Resolve the s5 dependency before approval: specify exact tools and adapters for both JSON status and per-host user lookup, retaining budgets and node_id semantics. |
| change-sites | HIGH | The seven listed resolveStoryRangeBase callers and described leaf migration cover its async ripple. | src/workflow/code-review/subject.ts also calls '(deps.resolveRangeBase ?? resolveStoryRangeBase)(repoPath, epicHash, storyId)' and immediately consumes the base. Within range-base.ts, readBuildStart calls commitExists and stampBuildStart calls both readBuildStart and headFullSha; implement.ts consumes stampBuildStart synchronously. These contracts are absent from the enumerated reshaping. [files: src/workflow/code-review/subject.ts, src/workflow/runners/build/range-base.ts, src/daemon/steps/build-step/phases/implement.ts] | Add resolveCodeReviewSubject and its dependency seam, readBuildStart, stampBuildStart and their callers/tests to the explicit async migration inventory. The analyzer returned incomplete graph coverage, so reconcile it with source searches. |
| change-sites | HIGH | The corpus BinaryGitRunner replacement is specified sufficiently to preserve its byte contract. | readPinnedSources calls only ['cat-file', '--batch'] and passes the returned framed bytes to decodeObject. git_cat_file instead returns parsed objects with contentBase64 and defaults maxBytes to 4 MiB. The LLD specifies neither reconstruction of the expected frame nor maxBytes selection, and incorrectly leaves the actual command inventory unknown. [files: src/design/corpus/sources/git-reader.ts, src/daemon/tools/builtins/git/cat-file.ts] | Document the exact one-command adapter, frame reconstruction or deliberate reader-interface change, maxBytes and aggregate budgets, and error-code mapping. Retain identity/hash validation. |
| data-compatibility | HIGH | The existing git_ls_files tool preserves the ignore filter's supported output budget. | The old filter uses 'maxBuffer: 50 * 1024 * 1024'. git_ls_files calls readGit without an output-budget override; runShell defaults DEFAULT_MAX_BYTES to 10 * 1024 * 1024. Thus the design's open budget question is a confirmed incompatibility: repositories previously supported can degrade to permissive filtering. [files: src/analyze/context/repo-ignore-filter.ts, src/daemon/tools/builtins/git/ls-files.ts, src/daemon/tools/builtins/git/helpers.ts, src/daemon/tools/shell-helper.ts] | Resolve the family-tool budget dependency and specify the supported limit before migration; reconcile §2.9 with the corrected {cached:true, others:true} input. |
| boundaries | HIGH | s9 can land before s10 while moved team helpers require a daemon-local registry. | src/cli/services/team.ts imports refreshPolicy directly and teamRefresh awaits it in the client process; it also directly invokes team gate helpers. The split note makes s10 depend on s9, but the proposed daemon-only facade would make these existing paths return registry failures during that interval. Naming only workflow.ts misses this concrete consumer. [files: src/cli/services/team.ts, src/cli/services/index.ts, src/workflow/team/policy-refresh.ts, docs/plans/tool-registry.md] | Agree a compatible transition with s10 and document client → daemon ownership and execution flow for team.ts and related services. Prose or a small sequence diagram is sufficient; do not leave the boundary as an unresolved runtime break. |
| error-paths | HIGH | The proposed failure handling matches the executor's cancellation and approval-timeout discriminants. | ToolDenialReason is 'declined' \| 'timed-out' \| 'no-client' \| 'cancelled', rather than 'expired'. Executor cancellation before execution produces kind 'denied' with cancellation denial; cancelledFail for running git produces kind 'rejected' and cancellation text. There is no top-level ToolFailure kind 'cancelled'. GitRun also lacks the timedOut property the LLD later promises. [files: src/daemon/tools/types.ts, src/daemon/tools/executor.ts, src/daemon/tools/builtins/git/helpers.ts, src/workflow/team/git.ts, src/workflow/team/git-async.ts] | Use the actual shared union values and define a precise adapter for pre-execution cancellation, in-flight cancellation, timeout and approval timeout. Define a result type that retains the refresh's required timedOut information. |
| error-paths | HIGH | Every failed or aborted refresh call stops further work, consistently with the documented preservation behavior. | refreshLocked currently performs anchor lookup after a failed show, may write a sighting before reporting unreadable policy, and treats setRemoteHead failure as a warning on the normal success path. A blanket 'any call failed' stop changes these semantics, while retaining the old flow after cancellation would violate ac3. [files: src/workflow/team/policy-refresh.ts, docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md] | Separate ordinary failure handling from abort/deadline handling per call. Specify where records must still be written, where cosmetic failure remains a warning, and where cancellation stops all subsequent calls. |
| coverage-of-intent | MED | The design supplies the complete per-site replacement and verification mapping required by s9 ac6. | DEF §6.9 requires 'every site has an entry in the replacement table, a test that runs through the registry with a recorded executor'. The LLD describes a future table but supplies no rows; identity API calls, stamp helpers, and the team operation mappings remain unspecified. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md, src/understanding/identity.ts, src/workflow/runners/build/range-base.ts, src/workflow/team/policy-refresh.ts] | Include the replacement table in the design, with exact tool inputs, execution context, result adaptation and a recorded-executor test for every site. |
| tests | MED | The proposed tests fully demonstrate ac2 and ac6 rather than only representative helper behavior. | DEF ac2 explicitly includes stages that 'converts, hands over or signs off'; its LLD test mapping lists range resolution, story changes, gate stamps and validation only. ac6 requires a recorded-executor test per site, but no such mapping is provided for convert/plan, companion/header, handoff, signoff, identity user lookup or the omitted stamp-chain contracts. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md, src/workflow/runners/build/range-base.ts, src/workflow/team/policy-refresh.ts, src/understanding/identity.ts] | Add per-site executor assertions and behavioral cases for conversion, companion headers, handoff/signoff artifacts and records, identity node_id resolution, and build-start stamp retention/rebuild logic. Tie each to the replacement-table row. |

#### Could not verify (does not block)

_None._
