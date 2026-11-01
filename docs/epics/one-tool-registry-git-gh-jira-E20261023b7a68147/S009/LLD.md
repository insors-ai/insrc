<!-- insrc:artifact LLD-b7a68147dcf72034-s9 -->

# LLD: STORY-b7a68147dcf72034-s9

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `9fcc90f081df...`

Story s9 moves the last direct git and gh calls of the workflow library, the daemon, the analyze path, the identity lookup and the design corpus reader onto the registry's typed tools, then deletes the old paths that s10 left in place (runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, the exec test seam) and turns the forbidden-spawn scan to failing mode. Each site calls a named git tool through callTool, keeps its own fallback for an ordinary failure and lets a denial through to the stage boundary, as s10 does. The synchronous sites and the chain above them become async; the team policy reader becomes async, and the refresh's 10 second budget becomes an abort signal plus a per-call time limit.

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

### 2.1 `PolicyReader`

```typescript
type PolicyReader = (repo: string, opts?: { readonly signal?: AbortSignal }) => Promise<PolicyResult<TeamPolicy | 'none'>>
```

**Parameters:**
- `repo: string` — absolute path of the work tree whose team policy is read
- `opts.signal: AbortSignal` _(optional)_ — aborts the git reads; the caller owns the budget

**Returns:** `Promise<PolicyResult<TeamPolicy | 'none'>>` — the same result envelope as today: ok with the policy or 'none', or a failure with its reason; an ordinary git failure is a failed result, never a throw

**Errors:**
- `ToolDenied` when a git read was denied (no client, declined, timed out, cancelled): thrown, not turned into a failed policy result

**Preconditions:**
- the registry tools are registered in the process (the daemon, or run() registers them lazily)

**Postconditions:**
- for the same repository state the result equals what the synchronous reader returned

### 2.2 `policyReader`

```typescript
export const policyReader: PolicyReader
```

**Parameters:**
- `repo: string` — work tree path

**Returns:** `Promise<PolicyResult<TeamPolicy | 'none'>>` — the policy read through git_rev_parse, git_remote, git_symbolic_ref, git_ls_tree, git_show and git_for_each_ref; replaces the runGit-based reads in probeGitRepo, probeRemote, probeRemoteHead, resolveRev, readAt and scanForPolicy

**Errors:**
- `ToolDenied` when as above

**Postconditions:**
- no call to runGit or execFileSync remains in src/workflow/team/policy-reader.ts

### 2.3 `findAnchor`

```typescript
export function findAnchor(repo: string, trackingRef: string, budget?: () => number): Promise<PolicyAnchor>
```

**Parameters:**
- `repo: string` — work tree path
- `trackingRef: string` — the remote tracking ref whose first-parent history is walked
- `budget: () => number` _(optional)_ — the time left, in milliseconds, that the callers pass to the two git calls today; it stays the per-call timeout

**Returns:** `Promise<PolicyAnchor>` — the commit that first added the policy file along the first parent, or the same unavailable results as today

**Errors:**
- `ToolDenied` when a read was denied

**Postconditions:**
- uses git_rev_parse (isShallow) and git_path_history (path, diffFilter A, firstParent, reverse), each with the time left as its timeoutMs

### 2.4 `createDeadline`

```typescript
export function createDeadline(totalMs?: number, now?: () => number): Deadline
```

**Parameters:**
- `totalMs: number` _(optional)_ — the total budget; REFRESH_DEADLINE_MS (10 s) by default
- `now: () => number` _(optional)_ — clock seam for tests

**Returns:** `Deadline = { remainingMs(): number; readonly signal: AbortSignal; dispose(): void }` — the budget plus an AbortSignal that aborts when it is spent; dispose clears its timer

**Postconditions:**
- when remainingMs() is 0 or the signal is aborted no further call is started; a running call is aborted by the signal and the executor's process-group kill ends it within 2 s
- REFRESH_DEADLINE_MS stays 10 s, so the lock-lifetime reasoning in src/workflow/team/sighting-store.ts holds

### 2.5 `refreshPolicy`

```typescript
export function refreshPolicy(repo: string, optsOrBranch?: RefreshOptions | string): Promise<PolicyResult<PolicyRefreshOutcome>>
```

**Parameters:**
- `repo: string` — work tree path
- `optsOrBranch: RefreshOptions | string` _(optional)_ — a branch name, or the options (branch, deadlineMs, and the existing injectable git seam for tests, which now receives the Deadline); RefreshOptions gains an optional outer signal. The default seam is the git tools

**Returns:** `Promise<PolicyResult<PolicyRefreshOutcome>>` — unchanged outcome kinds (fetched, absent, invalid) and failure reasons

**Errors:**
- `ToolDenied` when ls-remote or fetch was denied: thrown at the first denied call, no later call starts

**Postconditions:**
- git_ls_remote and git_fetch (or git_fetch_refs) run in order under one Deadline, each with timeoutMs = remainingMs(); a timed-out call is the same 'did not finish within the refresh deadline' failure as today (tool failure kind timed-out or the deadline signal)

### 2.6 `git-calls`

```typescript
src/workflow/git-calls.ts: revParse, catFileExists, lsFiles, pathHistory, configGet, lsRemote, fetchRefs, forEachRef, remoteUrl, statusPaths, rootCommits
```

**Parameters:**
- `cwd: string` — work tree
- `opts: { signal?: AbortSignal; timeoutMs?: number; approvalMode?: ApprovalMode }` _(optional)_ — set by the site

**Returns:** `Promise<string | boolean | string[] | undefined>` — each helper returns the plain value its sites used (a sha, a boolean, a path list, undefined for 'not found') built from the typed tool result

**Errors:**
- `ToolDenied` when thrown
- `GitCallFailed` when any other tool failure, carrying the ToolFailure kind and message, so each site decides its fallback (a new error class of this module)

**Postconditions:**
- built on run/must/soft and workflowToolDeps of src/workflow/tracker/registry-table.ts; no helper catches a ToolDenied

### 2.7 `resolveStoryRangeBase`

```typescript
export function resolveStoryRangeBase(repoPath: string, epicHash: string, storyId: string): Promise<string | undefined>
```

**Parameters:**
- `repoPath: string` — work tree
- `epicHash: string` — Epic
- `storyId: string` — Story

**Returns:** `Promise<string | undefined>` — the Story's range base: the sha stamped by stampBuildStart if it still names a commit, else the commit that introduced the upstream approved artifact; undefined when neither can be read. Same rule as today; only the git reads (commitExists via git_cat_file, introducingCommit via git_path_history) become tool calls

**Errors:**
- `ToolDenied` when a read was denied

**Postconditions:**
- callers in build-step validate.ts, standalone-record.ts and completion-record.ts await it

### 2.8 `range-base and story-commits readers`

```typescript
readBuildStart, stampBuildStart, resolveStoryRangeEnd, newestStoryCommit, storyChangeSet, mergeInProgress, headShortSha, trackedFiles, changedFiles, trivialCheckPlan, createRepoIgnoreFilter, defaultGitUserName, collectDiff: each returns a Promise of what it returned
```

**Returns:** `Promise<same value as before>` — each function keeps its value and its failure results; its git calls use git_rev_parse, git_cat_file, git_path_history, git_log, git_rev_list, git_ls_files, git_config, git_diff

**Errors:**
- `ToolDenied` when thrown through the function

**Postconditions:**
- collectDiff calls callTool(gitDiffTool, ...) instead of gitDiffTool.execute (the executor's approval, hooks and result check now apply)

### 2.9 `design corpus git reader`

```typescript
src/design/corpus/sources/git-reader.ts: readers built on git_cat_file { revs } and git_ls_tree/git_show instead of createGitRunner/runGitBinary
```

**Returns:** `same public options and result types as today` — the reader keeps its options, validation results and error codes (ac4); the batch read becomes one git_cat_file call with the revs array

**Errors:**
- `ToolDenied` when thrown

**Preconditions:**
- git_cat_file returns bytes undecoded for the revs form (documented in its header)

**Postconditions:**
- createGitRunner and runGitBinary no longer exist

### 2.10 `identity lookup`

```typescript
src/understanding/identity.ts: the gh auth status, gh api users and git config reads become gh_auth (status, hosts), gh_tracker (user_by_host) and git_config calls
```

**Returns:** `same multi-host, multi-account results as today` — the recorded exception: on a gh version without `gh auth status --json` the sign-in hosts come from the gh_auth hosts op (built before s10, BUILD-b135647ed951c0c1-s1) and the result is as recorded in docs/plans/tool-registry.md

**Errors:**
- `ToolDenied` when thrown, not turned into an 'unavailable' provider

**Postconditions:**
- no runShell call remains in identity.ts

## 3. Data model changes

### 3.1 `GitRun (src/workflow/team/git.ts) and GitAsyncRun (src/workflow/team/git-async.ts)` — field-remove

Both result shapes are removed with their runners. The 'quiet' flag (git exited non-zero with no message) maps to the tool failure kind rejected with an empty message; the 'timedOut' flag maps to the tool failure kind timed-out or an aborted deadline signal. The denial reasons are declined, timed-out, no-client and cancelled and arrive as a thrown ToolDenied; there is no 'cancelled' tool failure kind.

**Call sites:**
- `src/workflow/team/git.ts:15`
- `src/workflow/team/git-async.ts:27`
- `src/workflow/team/policy-reader.ts:68`
- `src/workflow/team/handoff.ts:474`

### 3.2 `Deadline (src/workflow/team/git-async.ts)` — field-add

Gains `signal: AbortSignal` and `dispose()`. It moves to src/workflow/team/sighting-store.ts beside REFRESH_DEADLINE_MS (git-async.ts is deleted). Each tool call takes timeoutMs = Math.max(1, remainingMs()) and the deadline's signal; when the budget is spent the signal aborts, the running call ends, and the next call is not started because the helper checks remainingMs() first.

**Call sites:**
- `src/workflow/team/policy-refresh.ts:65`
- `src/workflow/team/handoff.ts:474`
- `src/workflow/team/branch-resolution.ts:50`

### 3.3 `PolicyResult / PolicyReader (src/workflow/team/types.ts)` — field-modify

PolicyReader returns a Promise. The 44 test files that inject a synchronous reader keep working during the change because the call sites `await` the reader (awaiting a plain value is harmless), and are tightened to async fakes at the end. The envelope PolicyResult is unchanged.

**Call sites:**
- `src/workflow/team/types.ts:52`
- `src/workflow/team/gate.ts:171`
- `src/workflow/team/gate.ts:218`
- `src/workflow/team/signoff.ts:275`
- `src/workflow/tracker-auto.ts:134`
- `src/workflow/draft-issues.ts:109`
- `src/daemon/repo-settings.ts:109`

### 3.4 `Replacement table of this Story (docs/plans/tool-registry-migration-record.md section 5)` — new

One row per site, each naming the file and function, the git or gh tool and op, the site's error policy (fallback for an ordinary failure; ToolDenied thrown) and the registry test that runs it against a stand-in git or gh binary. Rows: repo-ignore-filter createRepoIgnoreFilter -> git_ls_files {cached, others}; companion/header defaultGitUserName -> git_config; convert/plan git -> git_rev_parse, git_ls_files, git_log by case; gates headFullSha and range-base headFullSha -> git_rev_parse; range-base commitExists -> git_cat_file {exists}; range-base introducingCommit -> git_path_history {diffFilter A, limit 1}; range-base resolveStoryRangeEnd -> git_rev_parse {verify}; standalone-record headShortSha -> git_rev_parse {short}; standalone-record priorCommit -> git_cat_file {exists}; story-commits git -> git_log and git_diff reads by case; mergeInProgress -> git_rev_parse {verify, MERGE_HEAD} and the git-path SQUASH_MSG read; validation-checks trackedFiles -> git_ls_files; changedFiles and trivialCheckPlan -> git_diff / git_status; changed-files collectDiff -> callTool(gitDiffTool); team policy-reader, anchor-finder, policy-refresh, sighting-store, signoff (currentBranchOf), handoff (unitDraftFiles, committedAtHead, parkPlan, repositoryIdOf, resumeCheck), branch-resolution -> the git_* tools named in the API section; corpus reader -> git_cat_file {revs}, git_ls_tree, git_show; identity -> gh_auth, gh_tracker, git_config. A case where no tool op matches exactly is raised at the start of the build task (t1 verifies every row against the tool's input schema) and is an additive extension of that tool, made inside this Story and flagged for the tool's owner, as s10 did for git_push configured. Known gap, found while reviewing this design: the git commands src/workflow/runners/build/story-commits.ts runs (diff-tree --root -z, merge-tree --write-tree, hash-object -t tree /dev/null, and rev-parse --git-path SQUASH_MSG in mergeInProgress) have no tool or op: diff-tree and merge-tree are assigned to s8 in the coverage table (src/daemon/tools/builtins/git/coverage.ts) and not built, git_hash_object takes a path only and git_rev_parse has no git-path input. This Story builds them, as s7 did for git_config, git_ls_remote, git_update_ref and git_rm: new read-only tools git_diff_tree and git_merge_tree, an optional type input on git_hash_object and an optional gitPath input on git_rev_parse, each with its own tests, and the s8 coverage table marks the two tools built by s9.

**Call sites:**
- `docs/plans/tool-registry-migration-record.md`
- `src/workflow/tracker/__tests__/site-list.test.ts`

### 3.5 `Test seams (src/workflow/tracker/github.ts _setTrackerExecForTests, src/workflow/tracker/__tests__/_legacy-table.ts, registry-table.ts _setRegistryTableFactoryForTests)` — field-remove

Removed with the wrappers. The 32 test files that import them are moved to the stand-in git and gh binaries (installStandInBin, installFakeGh) and to injected port fakes; tests that need a recorded executor use the stand-in binary's call log. A helper module for the stand-in gh in tests replaces the legacy table.

**Call sites:**
- `src/workflow/tracker/github.ts:31`
- `src/workflow/tracker/__tests__/_legacy-table.ts`
- `src/workflow/tracker/registry-table.ts:192`

### 3.6 `Session source inventory (src/daemon/db/__tests__/session-source-inventory.test.ts fixture)` — invariant-change

The fixture is the connection-management epic's reviewed baseline and fails at the origin/main baseline on the files that epic and the usage code added. This Story regenerates it once, from the final tree, and records the regenerated digests; the test then lists the production files that touch the session source.

**Call sites:**
- `src/daemon/db/__tests__/session-source-inventory.test.ts`

## 4. Error paths

**Error cases**

- **A moved site's call is denied (no client attached, declined, approval timed out, or cancelled)** (recoverable)
  - Detection: callTool returns a failure of kind 'denied' with the denial reason; the helper turns it into a thrown ToolDenied via errorOfFailure (src/workflow/tracker/tool-denied.ts), and no catch-all on the way catches it (isToolDenied is checked before any fallback)
  - Response: The calling stage fails with the denial reported (tool id and reason); no later call of the stage is made. The policy reader, the build-start stamp, the range-base reads and the corpus reader let it through to the stage boundary (the gate, the build step, the daemon method), which reports it as the stage's error
  - User impact: The user sees which tool was denied and why (for example 'git_cat_file was denied: no-client'); nothing is half-written because every site reads or writes after its last call
- **A git read fails for an ordinary reason (not a work tree, unknown revision, git missing, empty output where a sha was expected)** (recoverable)
  - Detection: the tool result is a failure of kind rejected, missing-tool or unreachable, or a successful result whose payload says 'not found'; the git-calls helper maps it to undefined or to GitCallFailed carrying the kind and message
  - Response: Each site keeps the fallback it has today: the policy reader returns its failed PolicyResult with the same reason text; findAnchor returns its failure; resolveStoryRangeBase returns undefined; headFullSha returns undefined; defaultGitUserName falls back to the OS user; createRepoIgnoreFilter degrades to the permissive filter with its warning
  - User impact: None beyond today's behaviour
- **The team policy refresh runs past its 10 second budget** (recoverable)
  - Detection: createDeadline's timer aborts its AbortSignal when REFRESH_DEADLINE_MS elapses; every call also takes timeoutMs from remainingMs(), and the helper checks remainingMs() before starting a call
  - Response: The running call is aborted through deps.signal (the executor kills the process group, settled within 2 s); the refresh returns the same failure as today ('did not finish within the refresh deadline') and starts no call after it; the deadline is disposed in a finally
  - User impact: The same failure text as today; the sighting lock is never held longer than the 10 s the lock-lifetime reasoning assumes
- **The refresh's outer signal is aborted (the daemon method is cancelled or the connection closes)** (recoverable)
  - Detection: the signal passed in opts.signal is combined with the deadline signal; the executor returns a 'denied' failure with denial 'cancelled' for the aborted call
  - Response: The cancelled denial is thrown as ToolDenied reason 'cancelled' and ends the refresh at the first call; no further git call starts and the sighting lock is released by the existing finally
  - User impact: The refresh reports it was cancelled; the policy cache is unchanged
- **A tool's output does not fit its declared schema, or a text-only tool needs conversion and conversion fails** (terminal)
  - Detection: callTool returns a failure of kind schema-mismatch or conversion-failed (the s2 contract)
  - Response: Thrown as a GitCallFailed with that kind; it is never turned into a fallback value, so a wrong payload is not passed on (k2). The one exception is a site whose old code already treated every failure as 'absent' (createRepoIgnoreFilter): there the failure is logged and the permissive filter is used, as today
  - User impact: A stage that depends on the value fails with the tool's message instead of acting on bad data
- **A site that was synchronous is called by code that still treats the result as a value** (recoverable)
  - Detection: the compiler: the call's type is Promise and the use does not compile; and the compiler-API no-floating-promises scan from s10 extended to the new helpers, which flags a dropped promise statement
  - Response: The build task fixes the caller in the same change; the scan runs in the test suite and the full sweep
  - User impact: None at run time; the failure is at build time
- **The scan in failing mode finds a direct spawn or wrapper call outside the exemptions** (recoverable)
  - Detection: node scripts/forbidden-spawn-scan.mjs --fail exits 1 and lists the site; it exits 2 if a file cannot be parsed
  - Response: The build chain fails (package.json build runs the scan with --fail); the site is moved or, if it is a real exemption, added to EXEMPT with its reason in a reviewed change
  - User impact: None for users; the build breaks for a developer who adds a direct spawn
- **A test that used the exec seam is left on the removed seam** (recoverable)
  - Detection: the TypeScript import of _setTrackerExecForTests or the legacy table no longer resolves, and the old-paths test (now inverted) asserts the exports are gone
  - Response: Each of the 32 files is moved onto the stand-in git or gh binary or an injected fake in the same change
  - User impact: None

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repository with no remote, no upstream or a detached HEAD | The policy reader, the signoff branch checks and the handoff checks give the same results as today (a failed PolicyResult or 'none', a rejected branch check); each of these is one tool call with the same failure mapping |
| A shallow clone (git rev-parse --is-shallow-repository true) | findAnchor reads isShallow through git_rev_parse and returns the same 'shallow' failure as today without walking history |
| A file name with spaces, newlines or non-UTF-8 bytes in a listing (git ls-files -z today) | git_ls_files returns the paths without losing any (the tool parses -z output); a listing over maxBytes fails rather than being cut, and createRepoIgnoreFilter treats that failure as 'git failed' and degrades to the permissive filter, as it does for any git failure today |
| The corpus reader asks for many revs at once, including a missing one | git_cat_file with the revs array returns one entry per rev with found=false for the missing one; the reader keeps its per-rev validation results and error codes |
| A site calls git while the work tree is mid-merge or mid-squash (MERGE_HEAD or SQUASH_MSG present) | mergeInProgress returns true through git_rev_parse {verify} on MERGE_HEAD and a read of the git path SQUASH_MSG, exactly as the two execFileSync calls do today |
| gh is not signed in or the installed gh lacks `auth status --json` | identity.ts uses gh_auth status/hosts and reports the recorded behaviour for the older gh (the one allowed difference in ac4); a signed-out gh gives the same 'unavailable' provider diagnostic |
| A daemon method is called while no approval client is attached and a tool of the site is in the common class under manual or edit-auto mode | The call is denied with 'no-client' and the stage fails with that denial (ac5); under the default auto mode common calls run without asking, so no existing flow starts asking |

**Invariants to preserve**

- A tool result that does not match its declared schema is a failure and is never passed on as a value; the helpers do not turn schema-mismatch or conversion-failed into a fallback [[c4]]
- A ToolDenied is thrown through every catch-all on the call paths and is caught only at a stage boundary; an ordinary failure keeps the site's old result [[c3]]
- The team refresh stays inside REFRESH_DEADLINE_MS = 10 s in total, starts no call after the budget is spent, and the sighting lock-lifetime reasoning that depends on it is unchanged [[c2]]
- Each moved function returns the same value, and the same failure result, as before for the same repository state; only its type changes from T to Promise<T> [[c1]]
- Nothing that reaches an LLM provider runs in parallel; the new helpers make their calls one after another with sequential awaits [[c3]]
- Every tool id agents use today keeps working with the same meaning; any extension of a git tool made by this Story only adds an optional input [[c4]]
- The old paths stay exported and unchanged until the last site has moved; the deletion is the final task and the build is green before it [[c3]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test-force-exit); stand-in binaries on PATH from src/daemon/tools/__tests__/_bin.ts (installStandInBin) and src/daemon/tools/builtins/gh/__tests__/_fakegh.ts (installFakeGh); real git repositories created in temp directories for the git sites; TypeScript compiler-API scans as in src/workflow/tracker/__tests__/no-floating-promises.test.ts`

**Test levels**

- **unit** — Each helper in src/workflow/git-calls.ts maps its tool result to the plain value its sites used, and each failure kind (rejected, missing-tool, unreachable, timed-out, schema-mismatch, denied with each denial reason) to the site's fallback or a thrown ToolDenied
  - Subjects: `src/workflow/git-calls.ts`, `createDeadline with its signal and dispose`, `the failure mapping of GitCallFailed and ToolDenied`
  - Fixtures: `a stand-in git binary answering by argument pattern`, `an approval gate that declines, times out, reports no client, or cancels`
- **integration** — Every site in the replacement table runs through the registry against a real temporary git repository or a stand-in gh, and returns what the old code returned for the same repository state (a comparison against the old function while the old paths still exist, then fixed expected values once they are deleted)
  - Subjects: `policyReader and its seven probes (not a repo, no remote, detached HEAD, shallow, valid policy, invalid policy)`, `findAnchor`, `refreshPolicy with the 10 s deadline, an aborted signal and a denied ls-remote or fetch`, `the signoff branch checks, handoff drafts, park plan and resume checks`, `resolveStoryRangeBase, stampBuildStart, readBuildStart, resolveStoryRangeEnd, storyChangeSet, newestStoryCommit, mergeInProgress`, `validation-checks trackedFiles, changedFiles, trivialCheckPlan`, `createRepoIgnoreFilter, defaultGitUserName, convert plan git reads, headFullSha, headShortSha, priorCommit, collectDiff`, `the design corpus reader through git_cat_file revs, git_ls_tree and git_show`, `the identity lookup through gh_auth, gh_tracker and git_config including the older-gh case`
  - Fixtures: `temporary repositories: bare origin plus clone, detached HEAD, shallow clone, mid-merge and mid-squash, file names with spaces and newlines`, `the stand-in gh with and without `auth status --json``
- **contract** — The shapes that other code relies on do not change: moved functions return Promise of the old value; PolicyReader is async; the Deadline carries a signal; the scan is in failing mode; the exports of the old paths are gone
  - Subjects: `the compiler-API no-floating-promises scan extended to the git-calls helpers and the moved functions`, `the site-list test (one table row and one registry test per site, the record lists the rows)`, `the old-paths test inverted: the old exports no longer exist`, `node scripts/forbidden-spawn-scan.mjs --fail on the whole tree`, `the package.json build script runs the scan with --fail`
- **integration** — Denial: a moved site whose call is denied fails its stage with the denial and starts no later call
  - Subjects: `registry-denial tests per group of sites (team policy, build runners, validation, corpus reader, identity): declined, timed-out, no-client, cancelled`
  - Fixtures: `_setApprovalGateForTests with approvalMode manual`
- **integration** — The 32 test files that used the exec seam run on the stand-in binaries or injected fakes and keep their assertions; the full sweep shows no new failure and no new skipped test against the checkout before s9, and the regenerated session source inventory passes
  - Subjects: `the tracker, workflow, daemon and cli tests listed in the migration record`, `src/daemon/db/__tests__/session-source-inventory.test.ts after regeneration`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `site-list.test.ts: every site of the replacement table is a row with a tool and a registry test, and the scan finds none outside the exemptions`, `git-calls.test.ts: each helper calls its tool through callTool with the caller 'workflow', the site's signal and approval mode`, `one registry test per site group (team-policy-registry.test.ts, build-runners-registry.test.ts, validation-checks-registry.test.ts, corpus-reader-registry.test.ts, identity-registry.test.ts, ignore-filter-header-plan-registry.test.ts)` |
| `ac2` | `team-policy-parity.test.ts: policyReader, findAnchor and the signoff and handoff git reads equal the old functions on the same repositories (compared before the old paths are deleted, fixed expectations after)`, `build-runners-parity.test.ts: range base, build start stamp, story commits, standalone record and changed files return the old values and write the same records`, `the existing stage tests (build-step, gates, handoff, signoff, convert) pass unchanged except for awaits` |
| `ac3` | `refresh-deadline.test.ts: with a stand-in git that sleeps, the refresh fails with the deadline message at 10 s, starts no call after it, and the process group of the running call is gone within 2 s`, `refresh-abort.test.ts: an aborted outer signal ends the refresh at the first aborted call with a cancelled denial and starts no later call`, `sighting-store.test.ts: the lock-lifetime reasoning still holds (the lock lifetime is greater than REFRESH_DEADLINE_MS plus the stop time)` |
| `ac4` | `identity-registry.test.ts: multi-host and multi-account results, public options and error codes equal the old lookup; on a gh without `auth status --json` the recorded behaviour holds`, `corpus-reader-registry.test.ts: options, validation results and error codes equal the old reader, including a missing rev in a batch and a binary file` |
| `ac5` | `registry-denial-s9.test.ts: for each group of sites and each denial reason (declined, timed-out, no-client, cancelled) the stage fails with the denial and no later git call is made`, `a destructive-class call with no client is denied (reuses the s10 k4 check on a moved site)` |
| `ac6` | `site-list.test.ts (extended for s9): the scan's 24 non-tracker sites plus the callers of the removed runners each have a row in the migration record, a table row and a registry test`, `cli-services-sites.test.ts and no-floating-promises.test.ts still pass` |
| `ac7` | `old-paths-removed.test.ts: runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary and _setTrackerExecForTests are not exported and the files are gone`, `the build script test: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions (src/cli/services/maintenance.ts, src/daemon/installed-commit.ts, src/indexer/index.ts)`, `the 32 migrated test files pass (listed in the migration record)` |
| `ac8` | `migration-record.test.ts: docs/plans/tool-registry-migration-record.md lists every table row and every moved site with its test`, `session-source-inventory.test.ts passes against the regenerated fixture`, `the full sweep (foreground, per area, --test-force-exit) compared by test name with the checkout before s9: no new failure and no new skipped test` |

## 6. Migration

**State before:** After Story s10 the tracker, the terminal client and the commit-and-push callers go through the registry, but 24 sites in 17 files still run git or gh themselves or call a builtin's execute (forbidden-spawn scan, report mode, 45 sites with the 21 old wrappers): the team module's runGit (sync) and runGitAsync, the synchronous build runners (range-base, story-commits, standalone-record), the validation checks, the repo-ignore filter, the companion header, the convert plan, gates.headFullSha, the corpus reader's createGitRunner, and the identity lookup's runShell calls (analyze bundles c1 and c2). The old github.ts wrappers, runGh, commitAndPushArtifacts and the exec test seam are still exported and unchanged, with the legacy-table and registry-table factory test seams that stand in for them in 32 test files (bundle c3). PolicyReader is synchronous and read by seven production sites and faked synchronously in 44 test files.

**State after:** No file outside src/daemon/tools, the daemon self-update (src/cli/services/maintenance.ts), src/daemon/installed-commit.ts and src/indexer/index.ts runs git, gh or acli itself or calls a builtin's execute: every site calls a named typed tool through callTool with its own caller, signal and approval mode. The old paths (runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, runGitBinary, _setTrackerExecForTests, the legacy table and the registry-table factory seams) no longer exist. The scan runs with --fail in the build chain. PolicyReader is async; the refresh budget is a Deadline with an AbortSignal. The migration record and the session source inventory are regenerated and the full sweep shows no new failure or skipped test against the tree before s9.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Verify the replacement table against the tool input schemas: for each of the 24 sites check that the named tool op carries the options the site uses (git_ls_files cached and others, git_path_history diffFilter A and firstParent, git_cat_file exists and revs, git_status path filter, git_rev_parse verify and short, git_config get); where an optional input is missing, add it to that tool as an additive optional input with its own test, flagged for the tool's owner. Add src/workflow/git-calls.ts with its unit tests. Nothing else changes; the build is green. The gap already found: the git commands src/workflow/runners/build/story-commits.ts runs (diff-tree --root -z, merge-tree --write-tree, hash-object -t tree /dev/null, and rev-parse --git-path SQUASH_MSG in mergeInProgress) have no tool or op: diff-tree and merge-tree are assigned to s8 in the coverage table (src/daemon/tools/builtins/git/coverage.ts) and not built, git_hash_object takes a path only and git_rev_parse has no git-path input. This Story builds them, as s7 did for git_config, git_ls_remote, git_update_ref and git_rm: new read-only tools git_diff_tree and git_merge_tree, an optional type input on git_hash_object and an optional gitPath input on git_rev_parse, each with its own tests, and the s8 coverage table marks the two tools built by s9. — ↩ rollbackable
2. Make the consumers await-ready while the producers are still synchronous: widen PolicyReader to return a value or a Promise, add awaits at its seven production readers and in the injected fakes' call sites, and widen the call sites of the synchronous runners (range-base, story-commits, standalone-record, validation-checks, repo-ignore-filter, companion header, convert plan, gates) so each can accept a Promise. Awaiting a plain value is harmless, so the tree stays green and every task is its own commit — ↩ rollbackable _(needs: `step 1 done`)_
3. Move the team module: policyReader, findAnchor, sighting-store resolveRepoIdentity, the signoff branch checks, handoff drafts, park plan and resume checks, and branch-resolution onto git-calls; replace createDeadline's result with a Deadline that carries an AbortSignal and dispose(); refreshPolicy passes the deadline signal and timeoutMs to ls-remote and fetch. Add a registry test and a denial test per group — ↩ rollbackable _(needs: `step 2 done`)_
4. Move the build runners and the daemon's build step: range-base, story-commits, standalone-record, changed-files (callTool instead of execute), validation-checks, gates.headFullSha; make their callers async. Compare each function with its old version on real repositories in the test while the old version still exists — ↩ rollbackable _(needs: `step 2 done`)_
5. Move the analyze ignore filter, the companion header's git user name and the convert plan's git reads; make their callers async — ↩ rollbackable _(needs: `step 2 done`)_
6. Move the design corpus reader onto git_cat_file revs, git_ls_tree and git_show, keeping its public options, validation results and error codes; move the identity lookup onto gh_auth, gh_tracker and git_config, keeping its multi-host and multi-account results and the recorded older-gh behaviour — ↩ rollbackable _(needs: `step 1 done`)_
7. Move the 32 test files off the exec seam and the legacy table onto the stand-in binaries or injected fakes, one commit per area, each file's assertions unchanged. Tighten the injected PolicyReader fakes to async — ↩ rollbackable _(needs: `steps 3 to 6 done`)_
8. Delete the old paths in one commit: runGit and src/workflow/team/git.ts, runGitAsync and git-async.ts, runGh, commitAndPushArtifacts and the other github.ts wrappers (keep GhCommandError, parseGithubRemoteUrl and the types the table uses, moved to a small module), createGitRunner and runGitBinary, _setTrackerExecForTests, src/workflow/tracker/__tests__/_legacy-table.ts, _setRegistryTableFactoryForTests and _setWorkflowToolDepsForTests; invert old-paths-unchanged.test.ts into old-paths-removed.test.ts; switch package.json build to run the scan with --fail — ↩ rollbackable _(needs: `step 7 done`)_
9. Regenerate the migration record and the session source inventory fixture from the final tree, extend site-list.test.ts and the no-floating-promises scan to the new helpers, run the full sweep once in foreground chunks per area and compare by test name with the tree before s9 — ↩ rollbackable _(needs: `step 8 done`)_

**Backward compat:** No external interface changes. The IPC methods, the MCP tools, the tool ids and their inputs and outputs are unchanged; any extension made to a git tool is an additive optional input. Internal TypeScript interfaces change: PolicyReader and the listed workflow functions return Promises, and the exports of the old paths disappear; nothing outside this repository imports them (the IDE fork reaches the daemon only through IPC). Artifacts, commits, tracker records and the policy cache files written by the moved stages are byte-for-byte the same as before, which the parity tests check.

## 7. Alternatives considered

### 7.1 a1: Rewrite each site onto the typed git and gh tools, asynchronously, through one small call helper — **CHOSEN**

Every remaining site calls the named git tool (git_rev_parse, git_ls_files, git_log, git_cat_file, git_config, git_ls_remote, git_fetch, git_for_each_ref, git_remote and so on) through callTool; the synchronous functions among them, and the chain above them, become async.

A new module in the s10 table's style (src/workflow/git-calls.ts, built on run/must/soft and workflowToolDeps of src/workflow/tracker/registry-table.ts) offers one function per operation the sites need (revParse, catFileExists, lsFiles, logFirst, configGet, lsRemote, fetchRefs, forEachRef, remoteUrl, status, checkIgnore) that calls the tool with the site's cwd, abort signal and approval mode and returns the plain value the site used (a string, a boolean, a list) or the site's old failure value. Each site keeps its own error policy: an ordinary failure gives the site's old fallback, a ToolDenied is thrown through every catch-all and caught only at the stage boundary (the s10 rule). The team module's two runners are replaced: the policy reader, the anchor finder, the sighting store, the signoff branch checks and the handoff checks call the helpers; the refresh passes one shared deadline as a per-call timeoutMs and one AbortSignal that the 10 s deadline aborts. PolicyReader becomes async (Promise<PolicyResult>), with the type widened to accept both forms during the change and narrowed at the end. The corpus reader's createGitRunner is replaced by git_cat_file with the revs array (git cat-file --batch) and git_ls_tree/git_show; identity.ts calls gh_auth and gh_tracker ops instead of runShell. Then runGit, runGitAsync, runGh, commitAndPushArtifacts, the github.ts wrappers, createGitRunner, _setTrackerExecForTests, the legacy-table test seam and the registry-table factory seam are deleted, and the scan is switched to failing mode.

### 7.2 a2: Keep the call shapes: one argv-compatible adapter over the tools

A single gitViaTools(cwd, argv, opts) returns the old GitRun shape and maps the known argv forms to tools, so the sites change only at the call line.

Add gitViaTools with the signature of runGit/runGitAsync (cwd, argv, timeout or Deadline) that matches argv against a table of the forms the sites use (rev-parse --verify, ls-tree, show, status --porcelain, ls-remote, fetch and so on) and calls the matching tool, returning {ok, stdout} / {ok:false, stderr, quiet|timedOut} built from the tool result. Sites keep their code; only the import changes. An argv with no table entry is refused with a clear error so a new site cannot run git around the registry.

**Rejected because:** It adds an argv-matching layer that is a shim in the sense of k6, scores partial on ac1, ac2, ac6 and ac7, and still needs the same async cascade as a1.

### 7.3 a3: Serve the team policy from a daemon-held snapshot and keep PolicyReader synchronous

A daemon-side cache of the policy per repo, filled by the tools and refreshed on team.refresh and on a git event, lets the synchronous readers stay synchronous.

Add a policy snapshot store in the daemon (per repo: the resolved policy or 'none', the ref and sha it came from, when it was read) filled by an async reader that uses the git tools. PolicyReader stays (repo) => PolicyResult and returns the snapshot, reading it from the store; if there is none yet it returns a 'not read yet' failure that the callers already treat as a refusal. The refresh and a file watcher on .git refs update the snapshot. The other sites move as in a1.

**Rejected because:** It violates ac2: a policy read after a local change can differ from today's until the snapshot refreshes, and it adds a store and a watcher nobody asked for while the other sites still go async.

## 8. References

- **[[c1]]** `analyze-bundle` `the sites left after s10 (forbidden-spawn scan, report mode, 45 sites, 3 exempt files)`
- **[[c2]]** `analyze-bundle` `the team module's use of runGit and runGitAsync (the largest group of sites)`
- **[[c3]]** `analyze-bundle` `what Story s10 left in place for s9 to build on`
- **[[c4]]** `analyze-bundle` `git tools available to the replacement and their failure model`
- **[[c5]]** `doc` `docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md#6.9` — "once the last site has moved the old wrappers and seams are gone so no code can run git or gh around the registry"
- **[[c6]]** `doc` `docs/plans/tool-registry.md#s10-lands-before-s9`
- **[[c7]]** `code` `scripts/forbidden-spawn-scan.mjs`

## 9. Open questions

- Decision needed: the git commands src/workflow/runners/build/story-commits.ts runs (diff-tree --root -z, merge-tree --write-tree, hash-object -t tree /dev/null, and rev-parse --git-path SQUASH_MSG in mergeInProgress) have no tool or op: diff-tree and merge-tree are assigned to s8 in the coverage table (src/daemon/tools/builtins/git/coverage.ts) and not built, git_hash_object takes a path only and git_rev_parse has no git-path input. This Story builds them, as s7 did for git_config, git_ls_remote, git_update_ref and git_rm: new read-only tools git_diff_tree and git_merge_tree, an optional type input on git_hash_object and an optional gitPath input on git_rev_parse, each with its own tests, and the s8 coverage table marks the two tools built by s9. The alternative is to build s8 first (its long-tail tools) and let this Story depend on it; the recommended route is the first, so the cutover is not held up by the 93-command long tail.
- Which exact tool ops lack an input a site needs (git_status path filter, git_log or git_path_history options for story-commits, git_config scope)? Task t1 of the plan checks every row against the tool input schemas and adds any missing optional input as an additive extension flagged for the tool's owner.
- Does any caller of PolicyReader need the opts.signal, or can the signal be dropped from the type to keep the 44 injected fakes' signature unchanged? The default is to keep it optional.
- The nine migration steps are written at the level of the area moved and are not the plan's task list; the plan stage decides the tasks and their order.

## Resolved questions

- `q660011fb` — Decision needed: the git commands src/workflow/runners/build/story-commits.ts runs (diff-tree --root -z, merge-tree --write-tree, hash-object -t tree /dev/null, and rev-parse --git-path SQUASH_MSG in mergeInProgress) have no tool or op: diff-tree and merge-tree are assigned to s8 in the coverage table (src/daemon/tools/builtins/git/coverage.ts) and not built, git_hash_object takes a path only and git_rev_parse has no git-path input. This Story builds them, as s7 did for git_config, git_ls_remote, git_update_ref and git_rm: new read-only tools git_diff_tree and git_merge_tree, an optional type input on git_hash_object and an optional gitPath input on git_rev_parse, each with its own tests, and the s8 coverage table marks the two tools built by s9. The alternative is to build s8 first (its long-tail tools) and let this Story depend on it; the recommended route is the first, so the cutover is not held up by the 93-command long tail.
  - **resolved**: Build-in-s9 (full ownership) — User approved the LLD on 2026-11-01 with this route recommended; follows the s7 precedent and keeps the cutover off s8's long tail. _(2026-11-01T11:29:18.716Z)_
- `q733bd0c7` — Which exact tool ops lack an input a site needs (git_status path filter, git_log or git_path_history options for story-commits, git_config scope)? Task t1 of the plan checks every row against the tool input schemas and adds any missing optional input as an additive extension flagged for the tool's owner.
  - **resolved**: Full independent audit — Accuracy first: derive the gap list from every row against the live tool schemas. _(2026-11-01T11:30:40.599Z)_
- `qaa98b407` — Does any caller of PolicyReader need the opts.signal, or can the signal be dropped from the type to keep the 44 injected fakes' signature unchanged? The default is to keep it optional.
  - **resolved**: Keep optional, but audit callers first — The approved LLD keeps opts.signal optional; the audit decides whether it can be dropped later. _(2026-11-01T11:31:24.778Z)_
- `q5abca151` — The nine migration steps are written at the level of the area moved and are not the plan's task list; the plan stage decides the tasks and their order.
  - **resolved**: Dependency-ordered decomposition — Order from the real dependencies so no consumer points at an area that has not moved. _(2026-11-01T11:31:51.218Z)_

## Citations

- **[[c1]]** `analyze-bundle` `the sites left after s10 (forbidden-spawn scan, report mode, 45 sites, 3 exempt files)`
- **[[c2]]** `analyze-bundle` `the team module's use of runGit and runGitAsync (the largest group of sites)`
- **[[c3]]** `analyze-bundle` `what Story s10 left in place for s9 to build on`
- **[[c4]]** `analyze-bundle` `git tools available to the replacement and their failure model`
- **[[c5]]** `doc` `docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/DEF.md#6.9` — "once the last site has moved the old wrappers and seams are gone so no code can run git or gh around the registry"
- **[[c6]]** `doc` `docs/plans/tool-registry.md#s10-lands-before-s9`
- **[[c7]]** `code` `scripts/forbidden-spawn-scan.mjs`
