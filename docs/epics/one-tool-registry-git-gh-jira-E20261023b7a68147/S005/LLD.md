<!-- insrc:artifact LLD-b7a68147dcf72034-s5 -->

# LLD: STORY-b7a68147dcf72034-s5

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `e550742c2f67...`

Every operation the installed gh offers that a program can run without a person is reachable through a named, typed tool, and nothing is a raw passthrough. The 46 existing gh tools keep their ids and meaning and gain typebox input and output schemas, a per-input approval class (closing, merging and deleting are destructive) and failure kinds. Each gh job has its own time limit from one table, never shorter than the tool has today, and a command that outlives it ends with a timed-out message naming the command and the limit. The operations gh has and the registry lacks are added as 22 family tools with an op input, the pattern git_branch and git_tag use, and a per-operation table gives each operation its inputs, output, command, approval class and limit, with a coverage table for the operations the user chose to leave out.

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

**Rollout phase:** Phase B — tool families
**Consumes:** `sc2` (Tool output schema and typed call), `sc3` (Text conversion with cross-check), `sc4` (Approval class and approval exchange), `sc5` (CLI failure kinds)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: undefined — owns `sc1`
- `s2`: undefined — owns `sc2`, `sc3`, `sc5`
- `s3`: undefined — owns `sc4`
- `s4`: undefined
- `s6`: undefined
- `s7`: undefined
- `s8`: undefined

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ghTimeoutMs`

```typescript
ghTimeoutMs(key: GhLimitKey): number  // GhLimitKey = { toolId: string; op?: string }
```

**Parameters:**
- `key: GhLimitKey` — The tool and, for a family tool, the op

**Returns:** `number` — The time limit in ms from the table in GhOpContracts for that job; a key with no row takes the class of its approval (read 30 s, write 60 s) so a new op is never unbounded

**Errors:**
- `none thrown` when an unknown key takes the default class limit

**Postconditions:**
- For each existing gh tool the value is not below the limit the tool has today

### 2.2 `ghExec`

```typescript
ghExec(argv: string[], opts: { key: GhLimitKey; cwd?: string; input?: string; maxBytes?: number; cutIsAnswer?: boolean; signal?: AbortSignal }): Promise<GhOutcome>
```

**Parameters:**
- `argv: string[]` — The gh command and arguments
- `opts: { key, cwd?, input?, maxBytes?, cutIsAnswer?, signal? }` — The limit key, directory, optional standard input, the capture cap, and whether a cut capture is the tool's documented truncated answer; no timeoutMs

**Returns:** `Promise<GhOutcome>` — A normalised outcome: text stdout and stderr, code, signal, spawnError, timedOut, stdoutTruncated, stderrOverflow, stdinError, aborted, the limit applied, the command text and, when the failure text was ambiguous, the exit code of one gh auth status probe made here

**Errors:**
- `none thrown` when A spawn failure, a time-out, a stdin failure and a non-zero exit are fields of the outcome

**Preconditions:**
- argv[0] is 'gh'

**Postconditions:**
- Without input it runs through runShell; with input it runs through runShellBytes and a byte-to-text adapter decodes stdout as UTF-8, so the outcome has one shape either way
- No caller passes its own limit; the limit comes only from ghTimeoutMs
- The input text never appears in argv

### 2.3 `ghFailureOf`

```typescript
ghFailureOf(outcome: GhOutcome, opts: { mutating: boolean }): ToolFailure | undefined
```

**Parameters:**
- `outcome: GhOutcome` — What ghExec returned, including its auth probe
- `opts: { mutating: boolean }` — Whether the call changes something, which adds the unknown-outcome sentence to a time-out

**Returns:** `ToolFailure | undefined` — undefined for a clean outcome. Otherwise: missing-tool for a spawn error; timed-out with 'gh <command> timed out after <limit> s'; missing-signin when the failure text says gh is not logged in or the token was rejected, or the probe exited non-zero; unreachable for a network error; rejected for any other non-zero exit, for a stdin write error, a stderr overflow, an abort or a cut capture the tool did not mark as its answer, even when the exit code is 0

**Errors:**
- `none thrown` when synchronous and total over every outcome; the only subprocess it needs, the sign-in probe, was run by ghExec

**Postconditions:**
- Each tool's existing failure text is kept in output and error; the kind is added beside it

### 2.4 `withGhFailureNet`

```typescript
withGhFailureNet<T extends TypedTool>(tool: T): T
```

**Parameters:**
- `tool: T extends TypedTool` — A gh tool definition with typebox input and output schemas

**Returns:** `T` — The same definition, its concrete schema types kept, whose execute never throws and whose every unsuccessful result carries failure.kind

**Errors:**
- `ToolFailure rejected` when an exception inside execute becomes a failure result, not a throw

**Postconditions:**
- callTool(withGhFailureNet(tool), input, deps) type-checks against Static of the tool's own schemas; a compile-time check in call-tool.type-test.ts shows it

### 2.5 `ghApprovalClass`

```typescript
ghApprovalClass(toolId: string, input: Record<string, unknown>): ApprovalClass
```

**Parameters:**
- `toolId: string` — The gh tool being called
- `input: Record<string, unknown>` — The call's input; for a family tool its op and, for repo sync, force

**Returns:** `ApprovalClass` — none for a read, common for a change that can be undone, destructive for a close, merge, delete, transfer, rename, logout, visibility change or forced overwrite of a remote object

**Errors:**
- `none thrown` when an unknown op is classed destructive so it asks

**Postconditions:**
- Each tool's approval field is this function or a fixed class equal to its row in GhOpContracts

### 2.6 `GH_COVERAGE`

```typescript
const GH_COVERAGE: readonly { command: string; owner: 'covered' | 'excluded'; toolIds?: string[]; op?: string; reason?: string }[]
```

**Returns:** `readonly rows` — One row per gh group and subcommand of the installed gh, each served by a tool and op or excluded for a reason the user accepted

**Postconditions:**
- A test fails when the installed gh lists a command with no row, when a covered row names a tool or op that is not registered, and when an excluded row has no reason

### 2.7 `gh_issue_manage, gh_pr_manage, gh_release_asset, gh_repo_manage, gh_run_manage, gh_workflow_manage, gh_project_manage, gh_label, gh_gist, gh_secret, gh_variable, gh_cache, gh_search, gh_ssh_key, gh_gpg_key, gh_ruleset, gh_org, gh_auth, gh_status, gh_codespace, gh_config, gh_extension`

```typescript
TypedTool with inputSchema { op: enum; cwd?: string; repo?: string; ...per-op fields } and outputSchema discriminated by op
```

**Parameters:**
- `op: enum of the group's operations in GhOpContracts` — Which gh operation to run

**Returns:** `TypedToolResult` — The per-op output in GhOpContracts: {count, items} for a list, the object for a view, {ok, target, message} for a mutation, {text} for a raw read

**Errors:**
- `rejectInput` when an op the family does not offer, a missing required field, or a field the op does not take

**Preconditions:**
- gh is signed in

**Postconditions:**
- delete, remove, transfer, rename, close, logout, visibility change and forced sync are destructive

### 2.8 `gh_pr_diff, gh_run_view`

```typescript
existing tools whose answer is text: output converted through sc3
```

**Parameters:**
- `maxBytes / maxLogBytes: number` _(optional)_ — The tool's own display cap, passed to ghExec as the capture cap with cutIsAnswer true

**Returns:** `TypedToolResult` — The diff with its file list, and the run's log with its steps, each from convertText with a key-value cross-check against the raw text; a cut at the tool's own cap is a success with data.truncated, as today

**Errors:**
- `ToolFailure conversion-failed` when the converted value fails the cross-check after the one escalation; the raw text is kept in failure.original
- `ToolFailure rejected` when gh_run_view's log command fails: it is the answer, so the call fails with the stderr in error

**Postconditions:**
- A tool whose output comes from gh --json makes no model call

## 3. Data model changes

### 3.1 `GhToolOutputs` — new

A typebox output schema for each of the 46 existing tools and each op of the new tools. Existing list tools keep the data they return today and the schema describes it in place: repo list {count, repos}, run list {count, runs}, workflow list {count, workflows}, the others as found when the tool is converted. gh_pr_diff and gh_run_view keep data.truncated and the fields they return. New tools follow GhOpContracts.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/pr.ts:143-149`
- `src/daemon/tools/builtins/gh/actions.ts:106-138`

### 3.2 `GhOpContracts` — new

Every new op: inputs (all ops also take cwd and repo, passed as -R), command, output, approval class, limit in seconds. Reads that gh gives with --json return {count, items} with the fields named; text reads are parsed by a tab-column parser when gh prints tab-separated text off a terminal, else returned as {text} or converted through sc3 with the key values named. Mutations return {ok, target, message} where message is the trimmed stdout (a created object's URL). gh_issue_manage: status [none 30] cmd issue status --json assignees,author,labels,number,state,title,updatedAt,url, output {groups:{createdBy,assigned,mentioned}}; delete [destructive 30] number required, cmd issue delete N --yes; develop [common 60] number required, optional name, branch-repo, base, checkout; lock [common 30] number required, optional reason; unlock/pin/unpin [common 30] number required; transfer [destructive 60] number and destinationRepo required. gh_pr_manage: status [none 30] pr status --json number,title,state,headRefName,reviewDecision,url, output as issue status; checkout [common 60] target required (number, url or branch), optional branch, detach, force, recurseSubmodules; lock [common 30] number, optional reason; unlock [common 30] number; reopen [common 30] target, optional comment. gh_release_asset: download [common 300] optional tag, pattern list, dir, clobber, skipExisting, output {files}; upload [common 300] tag and files required, optional clobber; delete-asset [destructive 30] tag and asset required, cmd --yes. gh_repo_manage: archive/unarchive [common 30] optional repository, --yes; edit [common 30, destructive when visibility is set] optional description, homepage, defaultBranch, enableIssues/Wiki/Projects/Discussions, allowForking, deleteBranchOnMerge, addTopic, removeTopic, visibility with the accept flag; rename [destructive 60] newName, --yes; set-default [common 30] repository, optional unset; sync [common 120, destructive with force] optional destination, source, branch, force; deploy-key-list [none 30] --json createdAt,id,key,readOnly,title; deploy-key-add [common 30] keyFile required, optional title, allowWrite; deploy-key-delete [destructive 30] keyId. gh_run_manage: delete [destructive 30] runId; download [common 300] optional runId, name list, pattern list, dir, output {files}. gh_workflow_manage: view [none 30] optional workflow, ref, yaml, output {text}; enable/disable [common 30] workflow. gh_project_manage (all take owner and format json): copy/create [common 60] title (and number for copy), optional target and source owner, drafts; edit [common 30] number, optional title, description, readme, visibility; close [destructive 30] number, optional undo; delete [destructive 30] number; link/unlink [common 30] number and one of repo or team; mark-template [common 30] number, optional undo; item-create [common 30] number and title, optional body; field-create [common 30] number, name, dataType, optional singleSelectOptions; field-delete [destructive 30] id. gh_label: list [none 30] --json color,createdAt,description,id,isDefault,name,updatedAt,url, optional search, sort, order, limit; create [common 30] name, optional color, description, force; edit [common 30] name, optional newName, color, description; clone [common 30] sourceRepository, optional force; delete [destructive 30] name, --yes. gh_gist: list [none 30] tab parser, columns id,description,files,visibility,updated, optional public, secret, limit; view [none 30] optional id, filename, raw, output {text}; create [common 60] files or content, optional description, public, filename; edit [common 60] id, optional add, remove, filename, description; rename [common 60] id, oldFilename, newFilename; clone [common 60] gist, optional directory; delete [destructive 30] id. gh_secret: list [none 30] --json name,numSelectedRepos,selectedReposURL,updatedAt,visibility, scope one of org, env, user or app; set [common 30] name and secretValue required, secretValue goes to stdin, optional visibility, repos, scope; delete [destructive 30] name, optional scope. gh_variable: list [none 30] --json name,numSelectedRepos,selectedReposURL,updatedAt,value,visibility; set [common 30] name and value, optional visibility, repos, scope; delete [destructive 30] name, optional scope. gh_cache: list [none 30] --json createdAt,id,key,lastAccessedAt,ref,sizeInBytes,version, optional key, ref, sort, order, limit; delete [destructive 30] one of id, key or all. gh_search: code/commits/issues/prs/repos [none 60] query required, optional limit and the group's filters, --json with the fields gh offers for that group (code: path,repository,sha,url,textMatches; commits: author,commit,committer,id,parents,repository,sha,url; issues and prs: assignees,author,body,closedAt,commentsCount,createdAt,id,isLocked,labels,number,repository,state,title,updatedAt,url, prs add isDraft; repos: fullName,description,language,stargazersCount,forksCount,isPrivate,pushedAt,url,visibility and the rest gh lists). gh_ssh_key and gh_gpg_key: list [none 30] tab parser (id,title,key,added), add [common 30] keyFile or key text on stdin, optional title (and type for ssh), delete [destructive 30] id, --yes. gh_ruleset: list [none 30] optional org, parents, limit, output through sc3 with key values the ruleset ids and names; view [none 30] optional rulesetId, org, parents, output {text}; check [none 30] optional branch, default, output {text}. gh_org: list [none 30] optional limit, tab parser, column name. gh_auth: status [none 30] optional hostname, output {hosts} converted through sc3 with key values host and login, never the token (show-token is not offered); switch [common 30] optional hostname, user; logout [destructive 30] hostname required, optional user. gh_status: status [none 60] optional exclude, org, output converted through sc3 with key values the repositories named. gh_codespace: list [none 30] --json displayName,gitStatus,lastUsedAt,name,owner,repository,state; view [none 30] codespace, --json the view fields; logs [none 60] codespace, output {text} with a 128 KiB display cap and data.truncated; ports [none 30] codespace, --json browseUrl,label,sourcePort,visibility; create [common 600] repo, optional branch, machine, displayName, idleTimeout, retentionPeriod, location, devcontainerPath; edit [common 30] codespace, optional displayName, machine; stop [common 60] codespace; rebuild [common 600] codespace, optional full; delete [destructive 60] codespace or all with days; cp [common 300] sources, dest, codespace, optional recursive, expand; ports-visibility [common 30] codespace and port:visibility pairs. gh_config: get [none 30] key, optional host, output {key, value}; list [none 30] optional host, output {entries} as key and value lines. gh_extension: list [none 30] tab parser, columns name,repository,version; search [none 60] optional query, owner, license, limit, --json the repository fields. The alias 'co' is gh_pr_manage checkout. EXISTING IDS keep these classes and limits: reads none 30 s: gh_issue_list, gh_issue_view, gh_pr_list, gh_pr_view, gh_pr_checks, gh_pr_files, gh_run_list, gh_workflow_list, gh_release_list, gh_release_view, gh_repo_view, gh_repo_list, gh_project_list, gh_project_view, gh:project:item-list, gh:project:field-list; gh_pr_diff and gh_run_view none 60 s. Common: gh_issue_create 60 s; gh_issue_comment, gh_issue_edit, gh_issue_reopen, gh_issue_link, gh_pr_edit, gh_pr_comment, gh_pr_review, gh_pr_ready, gh_run_rerun, gh_run_cancel, gh_release_edit, gh_release_publish, gh:project:item-add, gh:project:item-update, gh:project:item-archive 30 s; gh_pr_create 90 s; gh_workflow_run 60 s; gh_release_create 180 s; gh_repo_create and gh_repo_fork 120 s; gh_repo_clone 600 s. Destructive: gh_issue_close, gh_pr_close, gh_release_delete, gh_repo_delete, gh:project:item-delete 30 s; gh_pr_merge 180 s.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/pr.ts:303`
- `src/daemon/tools/builtins/gh/pr.ts:519`
- `src/daemon/tools/builtins/gh/repo.ts:278`
- `src/daemon/tools/builtins/gh/release.ts:173`

### 3.3 `GhApprovalClassMapping` — invariant-change

The mutating tools already declare approval 'common' as a fixed field (27 of them, set by s3). This Story replaces the field with ghApprovalClass where a class depends on the input and raises every close, merge, delete, transfer, rename, logout and visibility change to destructive, among the existing tools gh_issue_close, gh_pr_close, gh_pr_merge, gh_release_delete, gh_repo_delete and gh:project:item-delete. approval-class-mapping.test.ts keeps its historical 228-row snapshot untouched; the s5 changes and the new tools go in an addedByS5 list beside addedByS4, with the test extended to read it.

**Call sites:**
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts`
- `src/daemon/tools/__tests__/fixtures/approval-snapshot.json`
- `src/daemon/tools/builtins/gh/index.ts`

### 3.4 `GhCoverageRow` — new

{ command, owner: covered | excluded, toolIds?, op?, reason? }. The excluded rows are the list the user accepted in chat on 2026-10-25 (docs/plans/tool-registry.md, 's5 decisions'): browse; auth login, refresh, setup-git and token; codespace ssh, code, jupyter and ports forward; run watch; api (a raw passthrough); completion; all of alias; config set and clear-cache; extension browse, install, remove, upgrade, create and exec. They need a person, a browser or a terminal, run or fetch code, change gh itself or print a credential. auth logout, auth switch, codespace cp, logs and ports were added at the user's request.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `docs/plans/tool-registry.md`

### 3.5 `gh time limit` — invariant-change

Today the default is 30 s and ten calls pass their own: run logs and workflow run 60, issue create 60, pr diff 60, pr create 90, pr merge 180, repo create and fork 120, repo clone 600, release create 180. After the change no call passes a limit; ghTimeoutMs gives each job the limit in GhOpContracts, never lower than today's, and the timed-out message names the command and the limit. A test fails when any ghExec call outside the table passes its own timeout.

**Call sites:**
- `src/daemon/tools/builtins/gh/helpers.ts`
- `src/daemon/tools/builtins/gh/actions.ts:106-138`
- `src/daemon/tools/builtins/gh/pr.ts:146`
- `src/daemon/tools/builtins/gh/pr.ts:303`
- `src/daemon/tools/builtins/gh/pr.ts:519`
- `src/daemon/tools/builtins/gh/issue.ts:177`
- `src/daemon/tools/builtins/gh/repo.ts:278`
- `src/daemon/tools/builtins/gh/release.ts:173`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | Each gh tool declares typebox inputSchema and outputSchema; the executor checks both; withGhFailureNet keeps the concrete definition so callTool types its input and result. |
| `sc3` | consumes | gh pr diff, gh run view --log and the free-text reads of gh_auth status, gh_status and gh_ruleset go through convertText with keyValues cross-checked against the raw text; tab-separated reads use a deterministic column parser and make no model call. |
| `sc4` | consumes | Each gh tool sets the approval field to ghApprovalClass or a fixed class; destructive calls ask every time. The field of a secret value is named secretValue, so the existing key mask in approval-policy.ts hides it. |
| `sc5` | consumes | ghFailureOf attaches failure.kind from the shared kinds; a conversion failure carries the raw text in failure.original. |

## 5. Error paths

**Error cases**

- **gh is not installed or not on PATH** (recoverable)
  - Detection: ghExec returns a GhOutcome whose spawnError is true; ghFailureOf classifies it
  - Response: failure.kind missing-tool and a message that gh was not found
  - User impact: The caller learns gh is missing, not that the operation was rejected
- **gh is installed but not signed in, or its token was rejected** (recoverable)
  - Detection: A non-zero exit whose stderr says it is not logged in, needs authentication or rejected the token; when that text is ambiguous ghExec itself runs gh auth status once and stores its exit code in the GhOutcome, and a non-zero probe exit makes ghFailureOf return missing-signin
  - Response: failure.kind missing-signin and a message that names gh auth login as the user's step; the daemon reads and stores no credential
  - User impact: The user signs in with their own gh session and retries
- **A gh command outlives its job's limit** (recoverable)
  - Detection: outcome.timedOut is true, with limitMs from ghTimeoutMs for that tool and op
  - Response: failure.kind timed-out and the message 'gh <command> timed out after <limit> s'; for a mutating call it adds that the outcome is unknown
  - User impact: The caller can retry a read, or check the remote before repeating a mutation; a long transfer is not cut by a limit meant for a status read
- **A call passes its own time limit instead of using the table** (recoverable)
  - Detection: ghExec has no timeoutMs option, so the compiler rejects it; a source scan test also fails on any ghExec call whose options carry a timeout
  - Response: The build and the test fail and name the file
  - User impact: The limit of a job cannot drift from the table
- **The network or GitHub is unreachable** (recoverable)
  - Detection: stderr matches could not resolve host, connection refused, timed out or an HTTP 5xx
  - Response: failure.kind unreachable with gh's message
  - User impact: The caller waits and retries
- **gh rejects the request (not found, no permission, validation, a rate limit)** (recoverable)
  - Detection: A non-zero exit with none of the cases above
  - Response: failure.kind rejected; output, format, success and error keep what the tool returned before
  - User impact: Existing callers that read error see the same text
- **gh exits 0 but the secret on standard input was not delivered** (recoverable)
  - Detection: The runShellBytes result carries stdinError, which the byte-to-text adapter copies into the GhOutcome
  - Response: ghFailureOf returns a rejected failure naming the stdin write error although the exit code is 0; the tool does not report success
  - User impact: A secret that was never stored is not reported as set
- **gh's error output overflows its cap, or the call is aborted** (recoverable)
  - Detection: stderrOverflow or aborted is true in the outcome
  - Response: A rejected failure that says the error output overflowed, or that the call was cancelled
  - User impact: A killed command is not mistaken for a finished one
- **gh output is cut by the capture cap and the cut is not the tool's answer** (recoverable)
  - Detection: outcome.stdoutTruncated is true and the call did not set cutIsAnswer
  - Response: A rejected failure that says the output was cut, never a partial list parsed as whole
  - User impact: No partial answer is passed on as whole
- **A read that is the tool's answer fails (for example gh run view's log command)** (recoverable)
  - Detection: The secondary ghExec call returns a non-zero exit, spawnError, timedOut or an uncut-allowed truncation
  - Response: The tool fails with the log call's kind and its stderr in error; it no longer returns success with stderr as the log body
  - User impact: A caller no longer mistakes an error message for a log
- **gh --json output does not parse, or the parsed data does not match the output schema** (recoverable)
  - Detection: parseJson returns undefined for non-empty output inside the tool, or the executor's output schema check fails
  - Response: failure.kind schema-mismatch. For a parse failure inside the tool, failure.original is the raw gh stdout up to the capture cap; for an executor schema failure it is the executor's rendered output cut to 4000 characters
  - User impact: No wrong-shaped data reaches the caller, and the diagnostic is what the code actually keeps
- **The converted text of a text-only read fails the cross-check** (recoverable)
  - Detection: convertText returns ok false after the one escalation
  - Response: failure.kind conversion-failed with the raw text in failure.original
  - User impact: The caller still has the original text
- **A tab-separated read has a row with the wrong number of columns** (recoverable)
  - Detection: The deterministic column parser counts the columns of every row against the op's column list
  - Response: schema-mismatch with the raw stdout in failure.original; no model is asked to repair it
  - User impact: A format change in gh is reported, not guessed around
- **A family tool is called with an op it does not offer, a missing required field, or a field the op does not take** (recoverable)
  - Detection: The typebox input schema rejects it before the process starts
  - Response: rejectInput names the field; nothing runs
  - User impact: A clear message instead of a gh usage error
- **A destructive op is called (close, merge, delete, transfer, rename, logout, visibility change, forced sync)** (recoverable)
  - Detection: ghApprovalClass returns destructive for the tool and input
  - Response: The executor asks the attached client every time and runs nothing on a decline, a time-out or no client
  - User impact: No remote object or sign-in is closed, merged, deleted or ended without the user's yes
- **gh_secret set carries a value** (recoverable)
  - Detection: The input field is secretValue, which the approval policy's key mask hides; ghExec receives it as input, not in argv
  - Response: The value is written to gh on standard input through runShellBytes and shows in neither the process list, the approval content nor the logs
  - User impact: A secret value is not exposed
- **The installed gh lists a command that GH_COVERAGE has no row for** (recoverable)
  - Detection: The coverage test reads gh's own group and subcommand lists
  - Response: The test fails and names the command
  - User impact: A new gh release cannot silently open a gap

**Edge cases**

| Input | Expected |
| :--- | :--- |
| gh_pr_create called with the same input as before the change | The same id, arguments and text output as today (90 s limit kept), plus a data payload that fits the output schema (ac6) |
| gh_pr_diff larger than its maxBytes (default 256 KiB) | Still a success with data.truncated true and the same text, because the tool passes its own cap as the capture cap and sets cutIsAnswer |
| gh_run_view logs larger than maxLogBytes (default 128 KiB) | Still a success with data.truncated true, as today |
| gh:project:item-add and the other colon ids | Registered under the same ids with the same meaning (ac6) |
| gh_repo_list, gh_run_list or gh_workflow_list | Keep returning {count, repos}, {count, runs} and {count, workflows}; the schema describes them in place |
| A list read that returns no rows | success with count 0 and an empty list, not a failure |
| gh_project_manage close | Classed destructive like every close; with undo true it reopens the project and is common |
| gh_repo_manage edit that sets visibility | Classed destructive and passes the accept flag gh requires; without visibility it is common |
| gh_repo_manage sync with force true | Classed destructive and asks; without force it is common |
| gh_auth logout for a host the user is not signed in to | A rejected failure from gh; it still asks first because the class does not depend on the outcome |
| gh_auth status when gh is signed in to several hosts | One item per host with its login and state; the token is never requested or returned |
| gh_release_asset upload of a large file | 300 s; timed-out names the command and the limit and the caller checks the release before repeating |
| gh_codespace create or rebuild | 600 s; a slower call ends timed-out with the unknown-outcome sentence |
| A tool called from a directory that is not a repository with no repo given | A rejected failure from gh saying it could not determine the repository, with gh's wording unchanged |

**Invariants to preserve**

- All 46 existing gh tool ids, including the colon ids of the project family, keep their ids and inputs, and no existing tool gets a shorter time limit than it has today. [[c1]]
- Existing list tools keep the data fields they return today ({count, repos}, {count, runs}, {count, workflows}); a schema describes them and adds none that replaces them. [[c1]]
- gh_pr_diff and gh_run_view stay successes with data.truncated when output passes their own display cap. [[c1]]
- The gh tools never read or store credentials: they run the user's own gh session, and auth token and show-token are not offered. [[c2]]
- No gh call has a raw passthrough: there is no tool that takes an arbitrary argument list, and gh api is excluded. [[c2]]
- A failed gh call keeps its output, format, success and error fields as before, apart from gh_run_view's failed log call, which becomes a real failure; failure.kind is added beside them. [[c1]]
- The mutating tools keep approval 'common' as the minimum; none becomes less strict than it is, and the historical 228-row approval snapshot is not rewritten. [[c3]]

## 6. Test strategy

**Test framework:** `node:test with assert/strict, run with npx tsx --test (the pattern of src/daemon/tools/builtins/git/__tests__ and src/daemon/tools/__tests__)`

**Test levels**

- **unit** — Classification, limits, schemas, parsers and the approval mapping without a process
  - Subjects: `ghFailureOf classifies a GhOutcome into missing-tool, missing-signin (from text, and from a non-zero probe), timed-out, unreachable and rejected, and returns rejected for stdinError, stderrOverflow, aborted and an unmarked cut capture even when the exit code is 0`, `ghTimeoutMs returns for every row of GhOpContracts the limit in the table, never below the limit the existing tool has today, and a default class limit for an unknown key`, `ghApprovalClass equals GhOpContracts for every existing tool and every op of every family tool, including project close with and without undo, repo edit with visibility, repo sync with and without force`, `input schemas reject an unknown op, a missing required field and a field an op does not take`, `the tab-column parser accepts rows with the op's column count and rejects others`, `a source scan fails when any ghExec call passes a timeout option or when ghExec accepts one`, `the compile-time check in call-tool.type-test.ts shows withGhFailureNet keeps the concrete schema types so callTool infers input and result`
- **integration** — Each tool through executeTool against a fake gh on PATH that answers from fixture files and records its argv and standard input
  - Subjects: `every existing gh id returns the same output, format and error text as the recorded legacy answer plus data that fits its output schema, with repo list, run list and workflow list keeping {count, repos}, {count, runs} and {count, workflows}`, `gh_pr_diff and gh_run_view stay successes with data.truncated when the output passes their default caps (256 KiB and 128 KiB) and at a maxBytes the caller sets`, `each op of each new family tool builds the expected argv and parses the fixture output into its declared shape, including the --json reads, the tab-separated reads and the text reads converted with a stub model`, `a fake gh that outlives a scaled limit ends with timed-out naming the command and that op's limit, with the unknown-outcome sentence for a mutating op; one that is absent gives missing-tool; one that prints 'not logged in' gives missing-signin, and an ambiguous failure with a failing fake gh auth status gives missing-signin`, `gh_run_view with a failing log command fails with the log call's kind and does not return stderr as a log`, `gh_secret set puts secretValue on standard input, not in argv, and the approval content hides it; a fake gh that exits 0 without reading standard input gives a rejected failure`, `a destructive call is not run when the approval is declined, times out or has no client`, `gh pr diff and gh run view --log convert through the sc3 conversion with a stub model, pass the cross-check, and fail it with the raw text kept`, `a gh --json output that does not parse gives schema-mismatch with the raw stdout in failure.original, and an executor schema failure carries the executor's rendered output cut to 4000 characters`
  - Fixtures: `a fake gh executable on PATH driven by environment variables (answer files, exit code, sleep, recorded argv and stdin, a mode that exits 0 without reading stdin)`, `recorded gh --json and tab-separated outputs for each list and view`, `a stub provider for the conversion`
- **contract** — Coverage, the approval snapshot and the time-limit table stay complete and checkable
  - Subjects: `GH_COVERAGE has a row for every group and subcommand of the installed gh read from its own help, every covered row names a registered tool and op, and every excluded row has the reason the user accepted on 2026-10-25`, `a registry listing contains every one of the 46 existing ids and no tool that takes an arbitrary argument list`, `approval-class-mapping.test.ts reads an addedByS5 list beside addedByS4 and leaves the 228-row historical snapshot unchanged`
- **live** — The tools work against the real gh, gated by INSRC_LIVE_TESTS=1 and a signed-in session
  - Subjects: `gh_auth status, gh_repo_view and gh_issue_list on a public repository return data that fits their schemas`, `gh_auth status with a HOME that has no hosts file returns missing-signin`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `gh-coverage.test.ts: GH_COVERAGE has a row for every command of the installed gh and every covered row names a registered tool and op`, `gh-coverage.test.ts: the registry lists all 46 existing ids and no raw passthrough tool`, `gh-tools-integration.test.ts: each op of each family tool runs through executeTool against the fake gh` |
| `ac2` | `gh-tools-integration.test.ts: every gh tool's result data fits its output schema, and a result that does not fit fails with schema-mismatch`, `gh-tools-integration.test.ts: gh pr diff and gh run view --log pass and fail the cross-check with a stub model`, `call-tool.type-test.ts: callTool over a withGhFailureNet definition infers its input and result types` |
| `ac3` | `gh-approval.test.ts: ghApprovalClass equals GhOpContracts for every tool and op; issue close, pr close, pr merge, project close, release delete, repo delete, item-delete, every delete, remove, transfer and rename op, auth logout, visibility change and forced sync are destructive`, `gh-tools-integration.test.ts: a destructive call is not run when declined, timed out or with no client` |
| `ac4` | `gh-failures.test.ts: absent gh gives missing-tool, 'not logged in' gives missing-signin and the message names which; an ambiguous failure is confirmed by the probe`, `gh-live.test.ts: gh signed out gives missing-signin (live)` |
| `ac5` | `gh-failures.test.ts: a fake gh that outlives the scaled limit of its job ends with failure.kind timed-out and a message naming the command and that limit; a mutating call adds the unknown-outcome sentence`, `gh-limits.test.ts: ghTimeoutMs matches GhOpContracts, is never below an existing tool's current limit, and no ghExec call passes its own timeout` |
| `ac6` | `gh-compat.test.ts: each of the 46 existing ids, including gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add, called with its old input returns the same output, format and error text as the recorded legacy answer (apart from the gh_run_view failed log call), and the registered id list equals the recorded list`, `gh-compat.test.ts: gh_pr_diff and gh_run_view keep data.truncated at their default caps` |

## 7. Migration

**State before:** 46 gh tools in src/daemon/tools/builtins/gh run gh through ghExec with a 30 s default and ten calls that pass their own limit (60, 60, 60, 60, 90, 180, 120, 120, 600 and 180 s). 27 mutating tools already declare approval 'common' as a fixed field and none is destructive. They declare no output schema or typebox input, return text failures with no kind (shellFail drops the spawn, time-out and truncation flags), gh_run_view returns success with stderr as the log when its log command fails, gh_pr_diff and gh_run_view pass their own display cap as the capture cap and return a truncated success, and about 113 of gh's 159 operations have no tool (bundles c1 and c2).

**State after:** The same 46 ids with typebox schemas, per-input approval, failure kinds classified at the ghExec boundary and a limit per job from one table; the two display-cap tools still return a truncated success; 22 family tools with an op input cover every operation not on the user's exclusion list, each op with its inputs, output, command, class and limit in GhOpContracts; a coverage table accounts for every gh command and a test keeps it in step with the installed gh.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Record the legacy answers (output, format, error, data.truncated) of every existing gh tool for a set of inputs against the fake gh, before any tool is converted. — ↩ rollbackable
2. Change ghExec to take a limit key, standard input and a cut-is-answer flag and to return the normalised outcome, with the sign-in probe made there; add ghTimeoutMs with the limit table, the synchronous ghFailureOf and withGhFailureNet, and replace the ten per-call limits by table rows equal to today's values. — ↩ rollbackable
3. Convert the 46 existing tools in place to typebox input and output schemas with ghApprovalClass, one file at a time, keeping each tool's current data fields and truncation behavior and running the compatibility test after each file; make gh_run_view's failed log call a failure. — ↩ rollbackable
4. Add the 22 family tools and register them behind the failure net, with the stdin path for gh_secret set and the tab-column parser for the text lists. — ↩ rollbackable
5. Add GH_COVERAGE with the user's accepted exclusions and its test against the installed gh, and the limit and approval inventory tests. — ↩ rollbackable
6. Add an addedByS5 list to the approval snapshot and extend approval-class-mapping.test.ts to read it, leaving the historical 228-row snapshot unchanged. — ↩ rollbackable

**Backward compat:** All 46 gh ids, inputs, output text, format and error text are unchanged, and no existing tool gets a shorter time limit; the data payload and failure.kind are additive fields; gh_pr_diff and gh_run_view keep their truncated successes and data.truncated at their default caps and at a caller's cap. Visible changes: calls that ran past the old 30 s default now succeed up to their job's limit; gh_run_view returns a failure, not a success carrying stderr, when its log command fails; and a capture cut at the 4 MiB cap fails for tools that do not set their own display cap. Callers outside src/daemon/tools (src/workflow/gates.ts, tracker-auto.ts, bugfix/tracker.ts and the github.ts wrappers) are not touched by this Story; s7 moves them.

## 8. Alternatives considered

### 8.1 a1: One tool per operation

Convert the 46 existing gh tools in place and add one new named tool for every other operation a program can run, with the shared failure net, a limit table and a coverage table.



**Rejected because:** Meets every criterion but writes about 90 new definitions for coverage that 22 family tools reach.

### 8.2 a2: Existing tools in place, new operations grouped by family with an op input — **CHOSEN**

Convert the 46 tools in place and cover the other operations with 22 family tools whose op input names the operation, with a per-op contract table giving each op its inputs, output, command, class and time limit.



### 8.3 a3: Convert the existing tools now, cover the rest in a second Story

Type and classify only the 46 existing gh tools here and assign every other operation to a follow-on Story.



**Rejected because:** Smallest, but ac1 is not met by this Story.

## 9. References

- **[[c1]]** `code` `src/daemon/tools/builtins/gh/helpers.ts`
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/index.ts`
- **[[c3]]** `code` `src/daemon/tools/call-tool.ts`
- **[[c4]]** `code` `src/daemon/tools/approval-policy.ts:35`
- **[[c5]]** `code` `src/daemon/tools/builtins/git/coverage.ts`
- **[[c6]]** `doc` `docs/plans/tool-registry.md`

## 10. Open questions

- The per-job limit table departs from the HLD's single 120 s performance line; the user decided it in chat on 2026-10-25 (docs/plans/tool-registry.md, 's5 decisions', commit a3d4990ea), and the nonFunctional.retarget proposal in the contract step still has to be filed as an amendment artifact.
- gh_run_view's failed log call becomes a real failure instead of a success carrying stderr (the rule used for git_show's diff); confirm.
- The exact typebox field names of each op follow GhOpContracts and are fixed in the plan.
- No insrc_analyze_step bundle was run for this LLD; the bundles come from direct reads of the gh tool files, the installed gh 2.46.0 help and the tools folder (audit item ep3 was partial).

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**6 do not hold · 0 could not be verified · 5 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T10:38:57.529Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | HIGH | Every visibility change receives destructive approval. | The design assigns codespace ports-visibility 'common 30', contradicting its destructive-visibility invariant. Installed gh help describes this command as 'Change the visibility of the forwarded port', including public visibility. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S005/LLD.md, src/daemon/tools/approval-policy.ts] | Classify ports-visibility as destructive and include it in approval tests. |
| new-versus-reuse | HIGH | The proposed no-input runShell path can supply stderrOverflow and aborted in the normalized outcome. | ShellResult has neither field. runShell silently drops stderr beyond maxBytes; its abort handler only calls child.kill('SIGKILL'). runShellBytes separately reports both 'stderrOverflow: boolean' and 'aborted: boolean'. Thus the specified adapter cannot detect these conditions for ordinary gh calls. [files: src/daemon/tools/shell-helper.ts, src/daemon/tools/builtins/gh/helpers.ts] | Use runShellBytes for both paths or explicitly design the necessary shared-helper change with its ownership and callers addressed. |
| change-sites | HIGH | Every new operation can accept repo and pass it as -R as specified by GhOpContracts. | Installed gh 2.46.0 help for project create exposes --owner and --format, not -R; project field-delete exposes --id and --format, without --owner or -R. Config list exposes --host, without -R. The design nevertheless says 'all ops also take cwd and repo, passed as -R' and all project operations take owner. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S005/LLD.md, src/daemon/tools/builtins/gh/index.ts] | Specify supported flags individually; omit or explicitly reject repo/owner for operations that do not support them. Define exact per-op schemas and argv rather than universal flags. |
| data-compatibility | HIGH | Preserving the historical snapshot and adding addedByS5 is sufficient for the planned approval and schema conversions. | approval-class-mapping.test.ts still asserts 'assert.equal(tool.approval, common)' for historical requiresApproval-true tools except three git exceptions. It also deep-compares every historical input schema. Reading an addedByS5 list alone will not exempt the six historical gh tools becoming destructive or account for schema representation changes. [files: src/daemon/tools/__tests__/approval-class-mapping.test.ts, src/daemon/tools/__tests__/fixtures/approval-snapshot.json] | Specify S5 exceptions in the historical comparison loops, preserve baseline records, and test old-input compatibility separately from schema serialization identity. |
| error-paths | HIGH | Any nonzero auth-status probe establishes missing-signin. | Installed gh auth status help says it will 'test your authentication state for each GitHub host'. A failing probe is not proof of absent credentials: connectivity failures and failures for another configured host are not excluded. The design classifies any nonzero probe as missing-signin, overriding its separate unreachable/rejected semantics. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S005/LLD.md, src/daemon/tools/builtins/gh/helpers.ts] | Scope probes to the command's host and retain probe diagnostics. Classify network/probe failures separately; require authentication-specific evidence for missing-signin. |
| current-behaviour | MED | Both existing display-cap tools already return data.truncated. | ghPrDiffTool returns 'data: { number: n, diffBytes: body.length, truncated }'. ghRunViewTool instead returns 'data: { runId: id, jobs: payload.jobs ?? [] }'; truncation only affects its rendered heading/body. Its failed log command does currently use stderr as the log body. [files: src/daemon/tools/builtins/gh/pr.ts, src/daemon/tools/builtins/gh/actions.ts] | Describe run-view data.truncated as an additive change, correct legacy fixtures and distinguish existing behavior from proposed behavior. |

#### Could not verify (does not block)

_None._
