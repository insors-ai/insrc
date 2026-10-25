<!-- insrc:artifact LLD-b7a68147dcf72034-s5 -->

# LLD: STORY-b7a68147dcf72034-s5

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `e550742c2f67...`

Every operation the installed gh offers that a program can run without a person is reachable through a named, typed tool, and nothing new is a raw passthrough (the one existing raw input, gh_repo_clone.extraArgs, is kept for compatibility and makes the call destructive). The 46 existing gh tools keep their ids and meaning and gain typebox input and output schemas, a per-input approval class (closing, merging, deleting, every rename including a release's newTag, every visibility change, every overwrite flag and a clone with extra git arguments are destructive) and failure kinds. Each gh job has its own time limit from one table, never shorter than the tool has today, and a command that outlives it ends with a timed-out message naming the command and the limit; a change that began and did not finish cleanly is reported as having an unknown outcome. The operations gh has and the registry lacks are added as 22 family tools with an op input, the pattern git_branch and git_tag use, and a per-operation table gives each operation its exact inputs, requiredness (every selector gh needs to run without a prompt is required, and codespace create always passes --default-permissions so it never prompts), output and discriminator, approval class and limit, with an input inventory, a real-CLI parser check and a coverage table for what the user chose to leave out.

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
- `s1`: The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step. — owns `sc1`
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s3`: The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own. — owns `sc4`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s6`: The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.
- `s7`: The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.
- `s8`: Private implementation of s8: Reach the rest of git through named, typed tools

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
ghExec(argv: string[], opts: { key: GhLimitKey; cwd?: string; input?: string; maxBytes?: number; cutIsAnswer?: boolean; hostname?: string; signal?: AbortSignal }): Promise<GhOutcome>
```

**Parameters:**
- `argv: string[]` — The gh command and arguments
- `opts: { key, cwd?, input?, maxBytes?, cutIsAnswer?, hostname?, signal? }` — The limit key, directory, optional standard input, the capture cap, whether a cut capture is the tool's documented truncated answer, the host the sign-in probe is scoped to, and the abort signal; no timeoutMs

**Returns:** `Promise<GhOutcome>` — One normalised outcome: text stdout and stderr, code (null for a child ended by a signal), signal, spawnError, timedOut, stdoutTruncated, stderrOverflow, stdinError, aborted, the limit applied, the command text and, when the failure text was ambiguous, the exit code and output of one gh auth status --hostname probe made here

**Errors:**
- `none thrown` when A spawn failure, a time-out, a stdin write error, a signal and a non-zero exit are fields of the outcome

**Preconditions:**
- argv[0] is 'gh'

**Postconditions:**
- It always runs through runShellBytes, with or without input, because runShell reports neither stderrOverflow nor aborted; a byte-to-text adapter decodes stdout and keeps every runShellBytes field, and shell-helper.ts is not changed
- No caller passes its own limit; the limit comes only from ghTimeoutMs
- The input text never appears in argv
- Standard-input delivery is known only as far as runShellBytes reports it: a stdin write error is stdinError, and gh's exit status carries the rest; a successful pipe write is not proof that gh read the value, and a failed one is not proof that gh did not act

### 2.3 `ghFailureOf`

```typescript
ghFailureOf(outcome: GhOutcome, opts: { mutating: boolean }): ToolFailure | undefined
```

**Parameters:**
- `outcome: GhOutcome` — What ghExec returned, including its probe
- `opts: { mutating: boolean }` — Whether the call changes something, which decides whether a failure after execution began carries the unknown-outcome sentence

**Returns:** `ToolFailure | undefined` — undefined for a clean outcome. Otherwise the first matching row of this one precedence, whatever other flags are also set: (1) spawnError: missing-tool (execution never began); (2) timedOut: timed-out with 'gh <command> timed out after <limit> s'; (3) aborted: rejected; (4) signal set with no exit code (code null and signal set): rejected, naming the signal, even when stdinError or stderrOverflow is also set; (5) stdinError: rejected, even at exit 0; (6) stderrOverflow: rejected; (7) an unmarked cut capture (stdoutTruncated while cutIsAnswer is false): rejected; (8) non-zero exit: missing-signin only with authentication-specific evidence in the failing command's own text or in the probe's output (not logged in, authentication failed, bad credentials, token invalid or expired), unreachable for network text in either, otherwise rejected carrying gh's own error text; a probe that failed without authentication evidence stays rejected. For a mutating call, rows (2) to (6) happen after execution began and add the sentence 'the outcome is unknown; check the current state before retrying'; no message says that nothing changed or that a value was not set, and a plain non-zero exit (8) carries no claim about state. The probe's output is kept in failure.original

**Errors:**
- `none thrown` when synchronous and total over every outcome, with the precedence above; the only subprocess it needs, the probe, was run by ghExec

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
- `input: Record<string, unknown>` — The call's input; for a family tool its op and the fields that change the class (force, clobber, visibility, newName, newTag, extraArgs)

**Returns:** `ApprovalClass` — none for a read; common for a change that can be undone and for an op whose purpose is create-or-update; destructive for a close, merge, delete, transfer, any rename (a newName on an edit, a newTag on gh_release_edit), logout, any visibility change, any flag whose only purpose is to overwrite existing data (force, clobber), and a non-empty extraArgs on gh_repo_clone

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

### 2.7 `GH_INPUTS`

```typescript
const GH_INPUTS: readonly { command: string; kind: 'flag' | 'positional' | 'synthetic'; name: string; field?: string; excluded?: string }[]
```

**Returns:** `readonly rows` — One row per input of each covered gh command, of three kinds: a flag (name is the gh flag, read from the FLAGS section of `gh <command> --help`), a positional argument (name is the placeholder in the USAGE line, for example oldFilename in `gh gist rename {<id> | <url>} <oldFilename> <newFilename>`) and a synthetic field (a field the tool adds that is not a gh argument: op, cwd, repo where it is passed as -R, and any flag the tool always passes itself, such as --default-permissions on codespace create and --yes where gh has it). Each row names the input field that carries it, or the reason it is not offered (excluded)

**Postconditions:**
- A test reads the flags from the FLAGS section and the positionals from the USAGE line of each covered command and fails when a flag or positional has no row; it fails when a row names a field that the op's input schema lacks; and it fails when a field of the op's input schema is accounted for by no row of any of the three kinds. op and cwd are synthetic rows of every op
- A flag that is offered as a field in one op and excluded in another is checked per command, not globally
- A safe real-CLI parser check builds each op's argv from a sample input whose value-taking flags carry representative values (the first enum member, the integer 1, the fixed --json field list, a placeholder string), appends --help as its own final token so no flag can consume it, and runs the installed gh with an empty temporary HOME and GH_CONFIG_DIR, no token and HTTPS_PROXY and HTTP_PROXY pointing at a closed local port; it asserts exit 0 and a USAGE section in the output, and fails on 'unknown flag' or any parse error, so a flag the installed gh does not know (including any flag the tool adds itself, such as --format) cannot pass. A command that executed instead of printing help would fail visibly and could not reach GitHub, and a canary case (gh issue delete 1 --help under the same conditions) must print help and make no request, which shows --help returns before the command body for the mutating ops too. The check proves flag validity only; constraints gh enforces when the command runs, such as release download needing a tag, a pattern or an archive, are carried by the schema's requiredness and tested by schema-rejection and argv tests
- A prompt sweep fails when any op of the table can reach a gh prompt: an optional positional, or an optional selector flag, whose absence makes gh ask a person; each such input is required in the schema (the one choice between two forms, codespace delete's codespace or all, is exactly-one-of), codespace create always passes --default-permissions, and the integration test runs every op under a fake gh that exits with a failure if it sees a terminal prompt request; each prompt case in the table comes from the installed gh's help, not from the fake

### 2.8 `gh_issue_manage, gh_pr_manage, gh_release_asset, gh_repo_manage, gh_run_manage, gh_workflow_manage, gh_project_manage, gh_label, gh_gist, gh_secret, gh_variable, gh_cache, gh_search, gh_ssh_key, gh_gpg_key, gh_ruleset, gh_org, gh_auth, gh_status, gh_codespace, gh_config, gh_extension`

```typescript
TypedTool with inputSchema { op: enum; cwd?: string; ...the op's own fields } and outputSchema discriminated by the literal property op
```

**Parameters:**
- `op: enum of the group's operations in GhOpContracts` — Which gh operation to run

**Returns:** `TypedToolResult` — The per-op output in GhOpContracts, always carrying op as a literal property equal to the input op: {op, count, items} or {op, count, rows} for a list, the object with op for a view, {op, ok, target, message} for a mutation, {op, text} for a raw read

**Errors:**
- `rejectInput` when an op the family does not offer, a missing required field, two fields of an exclusive pair, or a field the op's gh command does not accept

**Preconditions:**
- gh is signed in

**Postconditions:**
- delete, remove, transfer, any rename, close, logout, any visibility change, any overwrite flag and forced sync are destructive
- None of the 22 new tools takes a raw argument list; the only raw input in the family is the existing gh_repo_clone.extraArgs

### 2.9 `gh_pr_diff, gh_run_view`

```typescript
existing tools whose answer is text: output converted through sc3
```

**Parameters:**
- `maxBytes / maxLogBytes: number` _(optional)_ — The tool's own display cap, passed to ghExec as the capture cap with cutIsAnswer true

**Returns:** `TypedToolResult` — The diff with its file list, and the run's log with its steps, each from convertText with a key-value cross-check against the raw text; a cut at the tool's own cap is a success: gh_pr_diff keeps data {number, diffBytes, truncated}, gh_run_view keeps data {runId, jobs} and gains truncated as an additive field

**Errors:**
- `ToolFailure conversion-failed` when the converted value fails the cross-check after the one escalation; the raw text is kept in failure.original
- `ToolFailure rejected` when gh_run_view's log command fails: it is the answer, so the call fails with the stderr in error

**Postconditions:**
- A tool whose output comes from gh --json makes no model call
- A capture cut at the cap now keeps the prefix up to the cap (runShellBytes) instead of dropping the whole chunk that crosses it (runShell), so the text and diffBytes of a cut answer can differ from the legacy answer by up to one chunk

## 3. Data model changes

### 3.1 `GhToolOutputs` — new

A typebox output schema for each of the 46 existing tools and each op of the new tools. Existing list tools keep the data they return today and the schema describes it in place: repo list {count, repos}, run list {count, runs}, workflow list {count, workflows}, gh_pr_diff {number, diffBytes, truncated}, gh_run_view {runId, jobs} (with truncated added), the others as found when the tool is converted. New tools follow GhOpContracts, where every output carries the literal op.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/pr.ts:143-149`
- `src/daemon/tools/builtins/gh/actions.ts:106-138`

### 3.2 `GhOpContracts` — new

NOTATION. Format: tool.op [class limit-seconds] inputs => output. Inputs: a bare name is required; name? is optional; a|b means exactly one of the two is given; a/b means not both; every op also takes cwd? and every -R op also takes repo? (OWNER/NAME, default from the working directory); ops marked (no -R) take no repo field. NO PROMPTS AND NO UNRUNNABLE INPUT: an input whose absence makes gh ask a person to choose, or makes gh refuse to run, is required, and a flag that suppresses a prompt is always passed by the tool, so no op can reach a prompt. TYPES: a field that carries a value-less gh flag is boolean; a repeatable flag or a list is string[]; limit, days, port, count and ids that gh documents as exact numbers are integers; a search qualifier that gh documents as a number, a size or a date accepts comparisons and ranges (for example >100, 10..50, >=2024-01-01) and is a string holding that expression; every other field is a string, and a field documented as {a|b|c} is that enum. OUTPUTS: every output has the literal property op equal to the input op (the discriminator of the output union). A list read with --json returns {op, count, items} where items have exactly the --json fields named. A list read from tab-separated text returns {op, count, rows} where rows is string[][] (the tab-split lines, no named columns), except gist list, whose columns id, description, files, visibility, updated were verified and which returns items with those five string properties. A text read returns {op, text}. A mutation returns {op, ok, target, message} (target the object or URL gh printed or the input identifier, message the trimmed stdout). A tool never passes --web, --follow, --show-token or --expand, never passes --json, --jq or --template except to set its own fixed --json fields, and never prompts: confirmation prompts are answered by the tool's own --yes where gh has one, which is a synthetic row. The tool adds only flags that the installed gh accepts for that command, and the parser check proves it. OVERWRITE RULE: an op whose purpose is create-or-update is common; a flag whose only purpose is to overwrite existing data (force, clobber) makes the call destructive; every rename (including label edit with newName and release edit with newTag), delete, transfer, close, logout and visibility change is destructive. gh_issue_manage (-R): status [none 30] => {op, createdBy, assigned, mentioned}, each an array of items with assignees,author,labels,number,state,title,updatedAt,url; delete [destructive 30] number; develop [common 60] number, name?, branchRepo?, base?, checkout?; develop-list [none 30] number => {op, count, rows}; lock [common 30] number, reason? ({off_topic|resolved|spam|too_heated}); unlock, pin, unpin [common 30] number; transfer [destructive 60] number, destinationRepo. gh_pr_manage (-R): status [none 30] conflictStatus? => {op, currentBranch, createdBy, needsReview} with items number,title,state,headRefName,reviewDecision,url; checkout [common 60, destructive with force] target (number, URL or branch), branch?, detach?, force?, recurseSubmodules?; lock [common 30] number, reason?; unlock [common 30] number; reopen [common 30] target, comment?. The alias 'co' is gh_pr_manage checkout. gh_release_asset (-R): download [common 300, destructive with clobber] tag | pattern | archive (at least one of a tag, a non-empty pattern list or an archive, because without a tag gh requires --pattern or --archive; the schema rejects an input with none of them), tag?, pattern? (string[]), archive? ({zip|tar.gz}), dir?, output? (a file path, never '-'; not with dir), clobber?, skipExisting? (not with clobber); upload [common 300, destructive with clobber] tag, files (string[], at least one), clobber?; delete-asset [destructive 30] tag, asset. gh_repo_manage: archive, unarchive [common 30] repository (no -R); edit [common 30, destructive when visibility is set] repository (no -R), description?, homepage?, defaultBranch?, enableIssues?, enableWiki?, enableProjects?, enableDiscussions?, enableMergeCommit?, enableSquashMerge?, enableRebaseMerge?, enableAutoMerge?, allowForking?, allowUpdateBranch?, deleteBranchOnMerge?, template?, addTopic? (string[]), removeTopic? (string[]), visibility? ({public|private|internal}; gh 2.46.0 has no confirmation flag for it, so --visibility is passed alone), at least one of the optional fields; rename [destructive 60] newName (-R); set-default [common 30] repository | view | unset (no -R; exactly one of the three, so gh never prompts; view is a read of the current default and returns {op, ok, target, message}); sync [common 120, destructive with force] destination?, source?, branch?, force? (no -R); deploy-key-list [none 30] (-R) => {op, count, items} with createdAt,id,key,readOnly,title; deploy-key-add [common 30] (-R) keyFile, title?, allowWrite?; deploy-key-delete [destructive 30] (-R) keyId. gh_run_manage (-R): delete [destructive 30] runId; download [common 300] runId, name? (string[]), pattern? (string[]), dir?. gh_workflow_manage (-R): view [none 30] workflow, ref?, yaml? => {op, text}; enable, disable [common 30] workflow. gh_project_manage (no -R): the tool passes --format json only to copy, create, edit, close, delete, mark-template, item-create, field-create and field-delete, which accept it; link and unlink have no --format and return text; every project op returns {op, ok, target, message} with message the trimmed stdout. copy [common 60] number, title, sourceOwner?, targetOwner?, drafts?; create [common 60] title, owner?; edit [common 30, destructive when visibility is set] number, owner?, title?, description?, readme?, visibility? ({PUBLIC|PRIVATE}); close [destructive 30] number, owner?, undo?; delete [destructive 30] number, owner?; link, unlink [common 30] number, owner?, targetRepo/team (exactly one); mark-template [common 30] number, owner?, undo?; item-create [common 30] number, owner?, title, body?; field-create [common 30] number, owner?, name, dataType ({TEXT|SINGLE_SELECT|DATE|NUMBER}), singleSelectOptions? (string[], only with SINGLE_SELECT); field-delete [destructive 30] id. gh_label (-R): list [none 30] search?, sort? ({created|name}), order? ({asc|desc}), limit? => {op, count, items} with color,createdAt,description,id,isDefault,name,updatedAt,url; create [common 30, destructive with force] name, color?, description?, force?; edit [common 30, destructive with newName] name, newName?, color?, description?; clone [common 30, destructive with force] sourceRepository, force?; delete [destructive 30] name. gh_gist (no -R): list [none 30] public/secret (not both), limit? => {op, count, items} with id,description,files,visibility,updated; view [none 30] id, filename?, files?, raw? => {op, text}; create [common 60] files (string[]) | content (stdin text), description?, filename? (with content), public?; edit [common 60] id, add? (a local file path), remove? (a gist file name), desc?, at least one of add, remove, desc (replacing the content of an existing file needs an editor and is excluded, as the user accepted; the filename selector is an excluded input); rename [destructive 60] id, oldFilename, newFilename (three positionals, no flags); clone [common 60] gist, directory?; delete [destructive 30] id. gh_secret (-R): list [none 30] app? ({actions|codespaces|dependabot}), env?, org?, user? (at most one of env, org, user) => {op, count, items} with name,numSelectedRepos,selectedReposURL,updatedAt,visibility; set [common 30, destructive when visibility is set] name | envFile (exactly one; envFile is a local dotenv file gh reads, never echoed), secretValue? (sent on standard input, only with name and required with name), app?, env?, org?, user? (at most one of env, org, user), repos? (string[], only with org or user), visibility? ({all|private|selected}, only with org), noStore?; delete [destructive 30] name, app?, env?, org?, user?. gh_variable (-R): list [none 30] env?, org? (not both) => {op, count, items} with name,numSelectedRepos,selectedReposURL,updatedAt,value,visibility; set [common 30, destructive when visibility is set] name | envFile (exactly one), value? (required with name, sent on standard input like secretValue, never in argv), env?, org? (not both), repos? (string[], only with org), visibility? ({all|private|selected}, only with org); delete [destructive 30] name, env?, org?. gh_cache (-R): list [none 30] key?, ref?, sort? ({created_at|last_accessed_at|size_in_bytes}), order? ({asc|desc}), limit? => {op, count, items} with createdAt,id,key,lastAccessedAt,ref,sizeInBytes,version; delete [destructive 30] id | key | all (exactly one; all is boolean). gh_search (no -R; repo is a filter; the tool sets its own --json field list per group; query is a required string; limit is an integer; qualifier expressions are strings): code [none 60] query, extension?, filename?, language?, limit?, match? (string[] of {file|path}), owner? (string[]), repo? (string[]), size? => items path,repository,sha,textMatches,url; commits [none 60] query, author?, authorDate?, authorEmail?, authorName?, committer?, committerDate?, committerEmail?, committerName?, hash?, limit?, merge?, order? ({asc|desc}), owner? (string[]), parent?, repo? (string[]), sort? ({author-date|committer-date}), tree?, visibility? (string[] of {public|private|internal}) => items author,commit,committer,id,parents,repository,sha,url; issues [none 60] query, app?, archived?, assignee?, author?, closed?, commenter?, comments?, created?, includePrs?, interactions?, involves?, label? (string[]), language?, limit?, locked?, match? (string[] of {title|body|comments}), mentions?, milestone?, noAssignee?, noLabel?, noMilestone?, noProject?, order?, owner? (string[]), project?, reactions?, repo? (string[]), sort? ({comments|created|interactions|reactions|reactions-+1|reactions--1|reactions-heart|reactions-smile|reactions-tada|reactions-thinking_face|updated}), state? ({open|closed}), teamMentions?, updated?, visibility? (string[]) => items assignees,author,authorAssociation,body,closedAt,commentsCount,createdAt,id,isLocked,isPullRequest,labels,number,repository,state,title,updatedAt,url; prs [none 60] query, the issues fields except includePrs, plus base?, checks? ({pending|success|failure}), draft?, head?, merged?, mergedAt?, review? ({none|required|approved|changes_requested}), reviewRequested?, reviewedBy?, and its own sort enum ({comments|reactions|reactions-+1|reactions--1|reactions-smile|reactions-thinking_face|reactions-heart|reactions-tada|interactions|created|updated}) => items as issues plus isDraft; repos [none 60] query, archived?, created?, followers?, forks?, goodFirstIssues?, helpWantedIssues?, includeForks? ({false|true|only}), language?, license? (string[]), limit?, match? (string[] of {name|description|readme}), numberTopics?, order?, owner? (string[]), size?, sort? ({forks|help-wanted-issues|stars|updated}), stars?, topic? (string[]), updated?, visibility? (string[]) => items createdAt,defaultBranch,description,forksCount,fullName,hasDownloads,hasIssues,hasPages,hasProjects,hasWiki,homepage,id,isArchived,isDisabled,isFork,isPrivate,language,license,name,openIssuesCount,owner,pushedAt,size,stargazersCount,updatedAt,url,visibility,watchersCount; every search op returns {op, count, items}. gh_ssh_key (no -R): list [none 30] => {op, count, rows}; add [common 30] keyFile | key (exactly one; key is public-key text sent on standard input), title?, type? ({authentication|signing}); delete [destructive 30] id. gh_gpg_key (no -R): list [none 30] => {op, count, rows}; add [common 30] keyFile | key (exactly one; text on standard input), title?; delete [destructive 30] keyId. The key text of the two add ops is a public key, not a secret: approval-policy.ts does not mask a field named key, and the approval request shows it up to the existing display limit of 2000 characters (a longer string is shown as its first 2000 characters followed by its length; keyFile shows only the path), which the approval test asserts exactly. gh_ruleset (-R): list [none 30] org?, parents?, limit? => {op, count, items} with items {id: string, name: string}, through sc3 with key values the ids and names; view [none 30] rulesetId, org?, parents? => {op, text}; check [none 30] branch?, default? => {op, text}. gh_org (no -R): list [none 30] limit? => {op, count, items} with the single property name. gh_auth (no -R): status [none 30] hostname? => {op, hosts} where hosts is an array of {host: string, login: string, active: boolean, state: 'logged-in' | 'failed'}, through sc3 with key values host and login; switch [common 30] hostname, user (both required); logout [destructive 30] hostname, user (both required). gh_status (no -R): status [none 60] exclude? (string[]), org? => {op, text} through sc3 with key values the repositories named. gh_codespace (no -R): list [none 30] limit?, org?, repo?, user? => {op, count, items} with createdAt,displayName,gitStatus,lastUsedAt,machineName,name,owner,repository,state,vscsTarget; view [none 30] codespace => {op, item} with billableOwner,createdAt,devcontainerPath,displayName,environmentId,gitStatus,idleTimeoutMinutes,lastUsedAt,location,machineDisplayName,machineName,name,owner,prebuild,recentFolders,repository,retentionExpiresAt,retentionPeriodDays,state,vscsTarget; logs [none 60] codespace => {op, text, truncated} with a 128 KiB display cap; ports [none 30] codespace => {op, count, items} with browseUrl,label,sourcePort,visibility; create [common 600] repo, branch?, machine?, displayName?, idleTimeout?, retentionPeriod?, location?, devcontainerPath?, status?, and the tool always passes --default-permissions (a synthetic row, not an input field), because without it gh asks the user to accept additional permissions the codespace requests; accepting them is therefore part of the call, and the notice that the permissions the devcontainer requests are accepted without a further question is carried in the preview content the tool supplies through buildApprovalGate (the request reason is built by approval-policy.ts and is not changed); edit [common 30] codespace, displayName?, machine?; stop [common 60] codespace, org?, user?; rebuild [common 600] codespace, full?; delete [destructive 60] codespace | all (exactly one), days? (only with all), force?, org?, user?; cp [common 300] sources (string[], at least one), dest, codespace, recursive?, profile? (expand is not offered, as the user accepted: it evaluates remote names as a Bash expression); ports-visibility [destructive 30] ports (string[] of port:visibility pairs, at least one), codespace. For the codespace ops that take a codespace name, repo and repoOwner are not offered because they only narrow an interactive pick. gh_config (no -R): get [none 30] key, host? => {op, key, value}; list [none 30] host? => {op, entries} where entries is an array of {key: string, value: string} parsed deterministically from gh's key=value lines with no model call. gh_extension (no -R): list [none 30] => {op, count, rows}; search [none 60] query?, owner? (string[]), license?, sort?, order?, limit? => {op, count, items} with the extension search --json fields createdAt,defaultBranch,description,forksCount,fullName,hasDownloads,hasIssues,hasPages,hasProjects,hasWiki,homepage,id,isArchived,isDisabled,isFork,isPrivate,language,license,name,openIssuesCount,owner,pushedAt,size,stargazersCount,updatedAt,url,visibility,watchersCount. EXISTING IDS keep these classes and limits: reads none 30 s: gh_issue_list, gh_issue_view, gh_pr_list, gh_pr_view, gh_pr_checks, gh_pr_files, gh_run_list, gh_workflow_list, gh_release_list, gh_release_view, gh_repo_view, gh_repo_list, gh_project_list, gh_project_view, gh:project:item-list, gh:project:field-list; gh_pr_diff and gh_run_view none 60 s. Common: gh_issue_create 60 s; gh_issue_comment, gh_issue_edit, gh_issue_reopen, gh_issue_link, gh_pr_edit, gh_pr_comment, gh_pr_review, gh_pr_ready, gh_run_rerun, gh_run_cancel, gh_release_publish, gh:project:item-add, gh:project:item-update, gh:project:item-archive 30 s; gh_release_edit 30 s, destructive when newTag is set (it renames the release's tag); gh_pr_create 90 s; gh_workflow_run 60 s; gh_release_create 180 s; gh_repo_create and gh_repo_fork 120 s; gh_repo_clone 600 s, destructive when extraArgs is non-empty (the existing string[] input forwarded after -- to git clone, where a flag such as --upload-pack can run a command; it stays for compatibility as a listed exception to the no-raw-argument rule and the user's accepted decision of 2026-10-25). Destructive: gh_issue_close, gh_pr_close, gh_release_delete, gh_repo_delete, gh:project:item-delete 30 s; gh_pr_merge 180 s. The input inventory test (GH_INPUTS) and the parser check are the build-time checks that these field lists and the flags the tools add match the installed gh.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/pr.ts:303`
- `src/daemon/tools/builtins/gh/pr.ts:519`
- `src/daemon/tools/builtins/gh/repo.ts:251`
- `src/daemon/tools/builtins/gh/repo.ts:274`
- `src/daemon/tools/builtins/gh/repo.ts:278`
- `src/daemon/tools/builtins/gh/release.ts:173`
- `src/daemon/tools/builtins/gh/release.ts:188`
- `src/daemon/tools/builtins/gh/release.ts:220`

### 3.3 `GhInputInventory` — new

GH_INPUTS lists, for every input of every covered gh command, one row of one of three kinds: flag, positional or synthetic. Not offered, with their reason: --web (opens a browser), --follow (streams until stopped), --show-token (prints a credential), --expand (evaluates remote file names as a Bash expression: a remote-execution path), gist edit --filename and the content of an existing gist file (need an editor), --json, --jq and --template (the tools set their own output form), --yes (the tool answers the prompt itself), and prompts. Always passed by the tool as a synthetic row: --default-permissions on codespace create, --yes where gh has it. The flags of each command are read from `gh <command> --help` and the positionals from its USAGE line by the inventory test, which compares them with the op's input schema fields and with the rows, so an input that is neither a field nor listed fails, as does a field that no row accounts for. op, cwd and repo are synthetic rows. The existing gh_repo_clone.extraArgs is the one recorded exception to the no-raw-argument rule; the no-passthrough test exempts exactly that field.

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/repo.ts:251`

### 3.4 `GhApprovalClassMapping` — invariant-change

The mutating tools already declare approval 'common' as a fixed field (27 of them, set by s3). This Story replaces the field with ghApprovalClass where a class depends on the input and raises every close, merge, delete, transfer, rename, logout, visibility change and overwrite flag to destructive, among the existing tools gh_issue_close, gh_pr_close, gh_pr_merge, gh_release_delete, gh_repo_delete and gh:project:item-delete, and makes gh_release_edit (newTag) and gh_repo_clone (extraArgs) destructive per input. approval-class-mapping.test.ts changes too: its loop asserts tool.approval === 'common' for every former requiresApproval-true tool except an explicit PER_INPUT_SINCE_S4 set, so those eight join a new explicit PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 set whose members must resolve to common or destructive and never none; the 228-row snapshot is not edited; the s5 tools and classes go in an addedByS5 list read beside addedByS4; the converted typebox input schemas are written so their JSON equals the snapshot's, as s4 did for git, and any unavoidable difference is listed in an explicit S5 schema exception list in the test, never by rewriting the snapshot; old-input compatibility is tested separately in gh-compat.test.ts from schema serialisation identity.

**Call sites:**
- `src/daemon/tools/__tests__/approval-class-mapping.test.ts`
- `src/daemon/tools/__tests__/fixtures/approval-snapshot.json`
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/release.ts:220`
- `src/daemon/tools/builtins/gh/repo.ts:274`

### 3.5 `GhCoverageRow` — new

{ command, owner: covered | excluded, toolIds?, op?, reason? }. The excluded rows are the list the user accepted in chat on 2026-10-25 (docs/plans/tool-registry.md, 's5 decisions'): browse; auth login, refresh, setup-git and token; codespace ssh, code, jupyter and ports forward; run watch; api (a raw passthrough); completion; all of alias; config set and clear-cache; extension browse, install, remove, upgrade, create and exec. They need a person, a browser or a terminal, run or fetch code, change gh itself or print a credential. auth logout, auth switch, codespace cp, logs and ports were added at the user's request. The user also accepted, in the second set of decisions on 2026-10-25, the exclusion of replacing the content of an existing gist file (gh gist edit needs an editor) and of codespace cp --expand (a remote shell evaluation).

**Call sites:**
- `src/daemon/tools/builtins/gh/index.ts`
- `docs/plans/tool-registry.md`

### 3.6 `gh time limit` — invariant-change

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
| `sc3` | consumes | gh pr diff, gh run view --log and the free-text reads of gh_auth status, gh_status and gh_ruleset list go through convertText with keyValues cross-checked against the raw text; tab-separated reads and gh_config list use a deterministic parser and make no model call. |
| `sc4` | consumes | Each gh tool sets the approval field to ghApprovalClass or a fixed class; destructive calls ask every time. The field of a secret value is named secretValue, so the existing key mask in approval-policy.ts hides it. The key text of gh_ssh_key and gh_gpg_key add is a public key: a field named key is not masked by that policy and is shown in the approval request up to the existing 2000-character display limit (a longer string shows its first 2000 characters and its length). A tool-specific notice, such as the one for codespace create, goes in the preview title and content the tool supplies through buildApprovalGate, because the request reason is built by approval-policy.ts. The mask, the limit and the reason text are not changed here because sc4 is owned by s3. |
| `sc5` | consumes | ghFailureOf attaches failure.kind from the shared kinds; a conversion failure carries the raw text in failure.original. |

## 5. Error paths

**Error cases**

- **gh is not installed or cannot be spawned** (recoverable)
  - Detection: ghExec gets a spawnError from runShellBytes and sets it on the outcome; ghFailureOf maps it first
  - Response: failure.kind missing-tool; error text names gh; execution never began, so this is the one failure that may say nothing changed
  - User impact: The call fails at once with a message to install gh
- **gh is not signed in or the token is expired** (recoverable)
  - Detection: The failing command's stderr, or the output of the one gh auth status --hostname probe ghExec ran, holds authentication-specific text (not logged in, authentication failed, bad credentials, token invalid or expired)
  - Response: failure.kind missing-signin with the probe output kept in failure.original
  - User impact: The user is told to run gh auth login outside the registry
- **The network is unreachable or the host cannot be resolved** (recoverable)
  - Detection: stderr or probe output matches network text (could not resolve host, connection refused, timeout dialing)
  - Response: failure.kind unreachable
  - User impact: The call fails; a retry later can succeed, after a mutating call's state is checked
- **A command outlives its per-job limit** (recoverable)
  - Detection: runShellBytes reports timedOut; the outcome carries the limit applied from ghTimeoutMs
  - Response: failure.kind timed-out, text 'gh <command> timed out after <limit> s'; for a mutating call the text adds that the outcome is unknown and the state must be checked before retrying
  - User impact: The user learns which command and limit, and for a mutation must check the state before retrying
- **A mutating call fails after execution began: an abort, a child ended by a signal (code null and signal set, whatever other flags are set), a stdin write error (secret, variable, key adds) or a stderr overflow** (recoverable)
  - Detection: runShellBytes reports aborted, a signal with a null code, stdinError or stderrOverflow; the one precedence is timedOut, aborted, signal, stdinError, stderrOverflow, so a signal together with a stdin error is reported as the signal and a stdin error together with an overflow as the stdin error; none of them shows what the remote service did before the local failure
  - Response: failure.kind rejected with the sentence 'the outcome is unknown; check the current state before retrying'; the message never says the value was not set or that nothing changed; the secret value is never placed in argv or in the error text
  - User impact: The caller verifies the secret, variable or key with the matching list op before retrying; the value is not leaked
- **A mutating call exits with a plain non-zero status and gh's own error text** (recoverable)
  - Detection: runShellBytes reports a non-zero code with no timeout, abort, signal or stdin error
  - Response: failure.kind rejected carrying gh's error text and no claim about state
  - User impact: The caller reads gh's reason
- **A call carries a field the op's gh command does not accept, a missing required field (including any selector whose absence would make gh prompt or refuse to run, such as none of tag, pattern and archive on a release download), two fields of an exclusive pair, a field outside its enum, or an op the family does not offer** (recoverable)
  - Detection: The op's input schema in GhOpContracts rejects it before any process starts
  - Response: rejectInput with the field named
  - User impact: The caller corrects the input; nothing ran and no prompt can appear
- **A caller asks for codespace cp with expand, a gist file's content to be replaced, a codespace create with its own permissions choice, or any other input that is not offered (web, follow, show-token)** (recoverable)
  - Detection: The input schema has no such field, so the check rejects it before any process starts
  - Response: rejectInput naming the field
  - User impact: No remote shell evaluation, no editor session and no permission prompt is reachable through the tool
- **A tool would pass a flag the installed gh does not know (a version change, or a flag the tool adds itself such as --format or --default-permissions)** (recoverable)
  - Detection: The real-CLI parser check builds the argv with representative values, appends --help as its own final token, and the installed gh reports an unknown flag or a parse error
  - Response: The test fails, naming the op and the flag
  - User impact: The defect is found at build time, not by a failed call
- **A capture is cut at the cap for a tool that does not treat a cut as its answer** (recoverable)
  - Detection: runShellBytes reports stdoutTruncated or stderrOverflow while cutIsAnswer is false
  - Response: failure.kind rejected rather than a silently partial success
  - User impact: The caller is told the output was incomplete
- **sc3 conversion fails the key-value cross-check after one escalation** (recoverable)
  - Detection: convertText returns a value whose key values are missing from the raw text
  - Response: failure.kind conversion-failed with the raw text in failure.original
  - User impact: The caller still has the raw text
- **An exception is thrown inside a tool's execute** (recoverable)
  - Detection: withGhFailureNet catches it
  - Response: A failure result with failure.kind, never a throw
  - User impact: The caller always gets a typed result
- **The user declines the approval for a destructive call** (recoverable)
  - Detection: The sc4 approval exchange returns a decline
  - Response: The call does not run
  - User impact: Nothing changes

**Edge cases**

| Input | Expected |
| :--- | :--- |
| gh_pr_diff or gh_run_view output larger than the tool's display cap | A cut at the cap is a success with truncated true; the kept prefix runs to the cap, which can differ from the legacy runShell answer by up to one chunk |
| A secret set with envFile and also with name | Rejected: exactly one of name and envFile is given |
| gh_release_asset download with none of tag, pattern and archive | Rejected by the schema, because without a tag gh requires --pattern or --archive; with only a tag, only a non-empty pattern list or only an archive it is accepted |
| gh_repo_manage set-default with none of repository, view, unset, or with two of them | Rejected: exactly one is required, so gh never prompts |
| gh_auth logout or switch with only hostname or only user | Rejected: both are required, so gh never selects by prompt |
| gh_codespace create for a repository whose devcontainer requests additional permissions | The generated argv always contains --default-permissions, so gh does not ask; the preview content the tool supplies states that the requested permissions are accepted; the fake gh fails the create if the flag is missing |
| gh_codespace delete with codespace, or with all, or with both or neither | Exactly one of codespace and all is accepted; the prompt sweep treats this pair as the one allowed alternative, not as an optional selector |
| gh_repo_manage edit with visibility set | Class is destructive; without visibility it is common; the generated argv contains --visibility and no confirmation flag |
| gh_project_manage link or unlink | The generated argv has no --format; the ops that accept --format get it; the result is {op, ok, target, message} |
| gh_search with reactions set to '>100', comments to '5..20', created to '>=2024-01-01' | Accepted as expression strings and passed through unchanged as the qualifier value; an integer-only schema would have rejected them |
| release upload or download with clobber true | Class destructive; without clobber it is common |
| label create or clone with force, pr checkout with force, repo sync with force, codespace delete with force | Class destructive |
| gh_gist rename, gh_repo_manage rename, gh_label edit with newName, or the existing gh_release_edit with newTag | Each resolves to destructive, since every rename is destructive; label edit without newName and release edit without newTag are common; the test pins each resolved class |
| the existing gh_repo_clone with a non-empty extraArgs, for example --upload-pack=cmd | Class destructive, so the user sees the arguments before git runs; with no extraArgs it is common; extraArgs stays in the schema and is the one recorded exception to the no-raw-argument rule |
| gh_ssh_key or gh_gpg_key add with key text longer than 2000 characters | The approval request shows the first 2000 characters followed by the length, as approval-policy.ts does for every long string; key text up to 2000 characters is shown whole; keyFile shows only the path; a secretValue in the same request is masked |
| gh_gist edit with no add, remove or desc | Rejected: at least one is required |
| An op string the family does not offer, or an unknown op reaching ghApprovalClass | Rejected by the schema; ghApprovalClass returns destructive so it would ask |
| A gh version that lists a command, flag or positional with no GH_COVERAGE or GH_INPUTS row | The coverage tests fail, naming the command or input |
| gist rename, which has three positionals and no flags | GH_INPUTS has three positional rows, and op and cwd synthetic rows; the inventory test accounts for every schema field |
| A tool id or op missing from the time-limit table | ghTimeoutMs gives the class default (read 30 s, write 60 s), never unbounded |
| gh list command that prints tab text off a terminal | The deterministic tab parser returns rows as string arrays, or the verified gist columns; no model call |
| Output containing non-UTF-8 bytes | The byte-to-text adapter decodes stdout with replacement; the fixture for a cut crossing a multibyte character must still yield valid text |
| release download with output set to '-' | Rejected: output to standard output would be captured as the answer |

**Invariants to preserve**

- Existing gh tool ids, meanings and result data keep their shape; types, approval classes and failure kinds are added beside them [[c1]]
- No gh tool shortens the time limit it has today [[c1]]
- A secret value is never placed in argv, logs or error text [[c1]]
- Legacy failure texts stay in output and error [[c1]]

## 6. Test strategy

**Test framework:** `node:test run through tsx (npx tsx --test), assertions from node:assert/strict`

**Test levels**

- **unit** — Prove the pure pieces: the limit table, the approval class function, the failure mapping and its precedence, the tab parser, the config parser, the byte-to-text adapter, the sample-input builder of the parser check and each op's input schema (requiredness, exclusive pairs, at-least-one groups, enums, expression strings)
  - Subjects: `ghTimeoutMs`, `ghApprovalClass`, `ghFailureOf`, `tab-column parser`, `gh config list parser`, `byte-to-text adapter`, `per-op input schemas in GhOpContracts`
  - Fixtures: `GhOutcome fixtures for spawn error, time-out, abort, signal-only termination (code null, signal set, all other flags false), stdin error, stderr overflow, plain non-zero exit, cut capture, auth text, network text, and paired-flag combinations that pin the one precedence (signal with stdin error, stdin error with stderr overflow, time-out with abort)`, `tab-separated gh list output including the verified gist columns`, `key=value config output`, `stdout crossing the cap inside a multibyte UTF-8 character`
- **integration** — Run each tool end to end against a fake gh binary placed first on PATH that records argv, standard input and the environment and fails if it is asked to prompt, so flags, positionals, -R handling, stdin delivery, limits, results and the absence of prompts are checked without a network
  - Subjects: `the 22 family tools and every op in GhOpContracts`, `the 46 existing tools through typed callTool`, `gh_pr_diff and gh_run_view cut at the cap`, `secret and variable set with stdin and envFile`, `codespace create with and without --default-permissions`, `withGhFailureNet`, `approval exchange for destructive ops`, `output union discriminated by the literal op`
  - Fixtures: `fake gh script with per-command canned stdout, stderr, exit code and delay`, `fake gh that closes its stdin early`, `fake gh that exits non-zero with a prompt error when it would have asked a person, including codespace create without --default-permissions and release download with no tag, pattern or archive`, `temporary working directory`
- **contract** — Keep the registry honest against the installed gh, which is the independent oracle, and against the earlier stories' contracts
  - Subjects: `GH_COVERAGE against gh --help command listing`, `GH_INPUTS (flags from FLAGS, positionals from USAGE, synthetic fields) against each op's schema fields`, `real-CLI parser check: each op's argv built from representative values (first enum member, integer 1, the fixed --json field list, a placeholder string) with --help appended as its own final token, run against the installed gh under an empty temporary HOME and GH_CONFIG_DIR, no token and a closed-port proxy, asserting exit 0 and a USAGE section (covers the flags the tools add themselves, such as --format, --visibility and --default-permissions), plus a canary case for a mutating command; it proves flag validity only`, `prompt sweep: the prompt cases are read from the installed gh's help text (commands whose help says an interactive prompt is used when an argument is absent, or that a flag avoids a prompt), and each such argument is required in the schema or always passed`, `approval-class-mapping.test.ts with the PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 set and addedByS5 list`, `schema JSON equality with the 228-row snapshot for the existing tools`, `no ghExec call outside the table passes its own timeout`
  - Fixtures: `installed gh 2.46.0 (skips cleanly when gh is absent)`, `approval-snapshot.json unchanged`
- **live** — Read-only calls against the user's real gh session; gated by INSRC_LIVE_TESTS=1 and skipped otherwise
  - Subjects: `gh_auth status`, `gh_config list`, `gh_search repos with limit 1`, `gh_gist list columns`, `missing-signin text with a bad token in the environment`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `gh-coverage.test.ts: every command of the installed gh has a GH_COVERAGE row`, `gh-coverage.test.ts: every covered row names a registered tool and op`, `gh-coverage.test.ts: every excluded row has a reason`, `gh-inputs.test.ts: every flag of every covered command is a field or an excluded row`, `gh-inputs.test.ts: every positional of the USAGE line is a field row`, `gh-inputs.test.ts: op, cwd and repo are synthetic rows, and every schema field is accounted for by a row of one of the three kinds`, `gh-inputs.test.ts: gist rename's three positionals are rows and its schema has exactly those fields plus op and cwd`, `gh-inputs.test.ts: codespace cp has no expand field, gist edit has no content or filename field, and codespace create has no defaultPermissions field, and the schema rejects them`, `gh-inputs.test.ts: prompt sweep: set-default needs exactly one of repository, view, unset; auth logout and switch need hostname and user; every codespace op other than list and create needs codespace, except delete which needs exactly one of codespace and all; codespace create always passes --default-permissions; run download needs runId; ruleset view needs rulesetId`, `gh-inputs.test.ts: release download requires at least one of tag, a non-empty pattern list and archive: an input with none is rejected by the schema, and each of the three alone is accepted and builds the argv gh expects`, `gh-parser.test.ts: every op's argv built from representative values with --help as its own final token parses against the installed gh (exit 0 and a USAGE section; no unknown flag; project link and unlink carry no --format; repo edit carries no confirmation flag; codespace create carries --default-permissions)`, `gh-parser.test.ts: the canary mutating command (gh issue delete 1 --help) under the empty HOME, no token and closed-port proxy prints help and makes no request`, `gh-family-tools.test.ts: each op builds the argv gh expects for its fields`, `gh-family-tools.test.ts: no op under the fake gh reaches a prompt, and codespace create fails under the fake gh when --default-permissions is absent`, `gh-family-tools.test.ts: no registered gh tool takes a raw argv or passthrough field, except exactly gh_repo_clone.extraArgs` |
| `ac2` | `gh-output-schemas.test.ts: every gh tool declares an inputSchema and an outputSchema`, `gh-output-schemas.test.ts: every output of a family tool carries the literal op equal to the input op`, `gh-output-schemas.test.ts: each tool result validates against its outputSchema for success and failure`, `gh-output-schemas.test.ts: auth status hosts, config list entries and ruleset list items have the nested shapes in GhOpContracts`, `gh-output-schemas.test.ts: every project op returns {op, ok, target, message}`, `gh-typed-call.test.ts: callTool over withGhFailureNet keeps the concrete result type`, `call-tool.type-test.ts: gh tool input and result types`, `gh-convert-text.test.ts: gh_pr_diff and gh_run_view conversions cross-check against the raw text`, `gh-convert-text.test.ts: auth status and ruleset list keyValues (host and login; ids and names) are checked against the raw text`, `gh-convert-text.test.ts: a failed cross-check gives conversion-failed with the raw text in failure.original`, `gh-capture.test.ts: a cut at the cap is a success with truncated true and valid text across a multibyte character`, `gh-search-inputs.test.ts: comparison and range expressions for comments, interactions, reactions, followers, forks, stars, size and the date qualifiers are accepted and passed through unchanged` |
| `ac3` | `approval-class-mapping.test.ts: PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 members (the six destructive existing tools plus gh_release_edit and gh_repo_clone) resolve to common or destructive and never none`, `gh-approval.test.ts: close, merge, delete, transfer, logout and delete-asset are destructive`, `gh-approval.test.ts: every rename is destructive: gist rename, repo rename, label edit with newName and the existing gh_release_edit with newTag each resolve to destructive, and without the rename input the class is common`, `gh-approval.test.ts: the existing gh_repo_clone is destructive with a non-empty extraArgs and common without`, `gh-approval.test.ts: visibility set and the overwrite flags (clobber, force) make a call destructive, and without them it is common`, `gh-approval.test.ts: gh_issue_close, gh_pr_close, gh_pr_merge, gh_release_delete, gh_repo_delete and gh:project:item-delete are destructive`, `gh-approval.test.ts: an unknown op is destructive`, `gh-approval.test.ts: a destructive call asks every time and a declined call does not run gh`, `gh-approval.test.ts: secretValue is masked in the approval request; ssh-key and gpg-key add key text up to 2000 characters is shown whole, a longer key shows exactly its first 2000 characters and the length, and keyFile shows only the path`, `gh-approval.test.ts: the gate preview content the tool supplies for codespace create states that the permissions the codespace requests are accepted, while the request reason stays the one approval-policy.ts builds` |
| `ac4` | `gh-failures.test.ts: spawn error gives missing-tool naming gh`, `gh-failures.test.ts: authentication text in the command's stderr gives missing-signin`, `gh-failures.test.ts: authentication text only in the probe output gives missing-signin with the probe in failure.original`, `gh-failures.test.ts: ambiguous failure with a clean probe stays rejected, not missing-signin`, `gh-failures.test.ts: network text gives unreachable`, `gh-failures.test.ts: no call sets or reads a token of its own; the user's gh session is used`, `gh-live.test.ts: bad token in the environment gives missing-signin (live, gated)` |
| `ac5` | `gh-timeouts.test.ts: a fake gh that outlives its limit ends with timed-out and a message naming the command and the limit`, `gh-timeouts.test.ts: a mutating call's time-out adds that the outcome is unknown`, `gh-timeouts.test.ts: ghTimeoutMs gives each job the limit in the table and a missing key the class default`, `gh-timeouts.test.ts: no existing tool's limit is below its limit today`, `gh-timeouts.test.ts: no ghExec call outside the table passes its own timeout`, `gh-failures.test.ts: the one precedence timedOut, aborted, signal, stdinError, stderrOverflow, unmarked cut, non-zero exit, pinned by paired-flag fixtures: time-out with abort gives the time-out, abort with signal gives the abort, signal with stdin error gives the signal, stdin error with stderr overflow gives the stdin error`, `gh-failures.test.ts: a signal-only termination (code null, signal set, every other flag false) is rejected for a read, and for a mutating call also carries the unknown-outcome sentence`, `gh-failures.test.ts: for a mutating call a stdin write error, an abort, a stderr overflow and a signal each report an unknown outcome and never say the value was not set; a plain non-zero exit carries gh's own text and no state claim; a read call's failure carries no such sentence`, `gh-failures.test.ts: a fake gh that closes its stdin early gives a stdin error that is a failure even at exit 0, without claiming to detect an unread secret` |
| `ac6` | `gh-compat.test.ts: the 46 existing tool ids are all still registered`, `gh-compat.test.ts: each existing tool's input schema serialises identically to the snapshot, apart from the listed S5 exceptions`, `gh-compat.test.ts: gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add accept their old inputs and run the same gh argv`, `gh-compat.test.ts: gh_repo_clone keeps extraArgs and forwards it after --, and gh_release_edit keeps newTag, unchanged apart from their approval class`, `gh-compat.test.ts: existing result data (count, repos, runs, workflows, number, diffBytes, truncated, runId, jobs) keep their shape, with only truncated added to gh_run_view`, `gh-compat.test.ts: legacy failure texts stay in output and error`, `approval-class-mapping.test.ts: the 228-row snapshot is not edited and addedByS5 lists the new tools` |

## 7. Migration

**State before:** 46 gh tools in seven files under src/daemon/tools/builtins/gh/. ghExec in helpers.ts has a 30 s default and a 4 MiB capture cap; 47 calls, ten pass their own limit (60 s to 600 s). 27 mutating tools declare approval 'common' as a fixed field and none is destructive; gh_release_edit renames a tag through newTag and gh_repo_clone forwards a raw extraArgs list to git clone, both under common. No tool declares typebox input or an outputSchema. shellFail keeps only stderr text and drops the spawn, time-out and truncation flags. gh_pr_diff returns data {number, diffBytes, truncated}; gh_run_view returns {runId, jobs} and succeeds with stderr as the log body when the log command fails. Many gh operations (secrets, variables, labels, gists, codespaces, search, auth and the rest) have no tool.

**State after:** The 46 existing tools keep their ids, input meaning and result data, and gain typebox input and output schemas, per-input approval classes (close, merge, delete, transfer, every rename including a release's newTag, logout, visibility changes, overwrite flags and a clone with extraArgs destructive), failure kinds and a per-job time limit from one table that is never below today's. 22 family tools with an op input cover the rest of gh, each output carrying the literal op, no op able to reach a gh prompt or accept an input gh cannot run (codespace create always passes --default-permissions; release download needs a tag, a pattern or an archive), and every flag a tool adds checked against the installed gh by a parser check that runs --help with representative values. GH_COVERAGE and GH_INPUTS record every command and every flag, positional and synthetic input as covered or excluded with a reason, and tests check them against the installed gh. A mutating call that fails after execution began reports an unknown outcome under one precedence. gh_run_view gains the additive field truncated and now fails when its log command fails.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the shared pieces: the limit table and ghTimeoutMs, the byte-to-text adapter over runShellBytes, ghExec with the key option and the one sign-in probe, GhOutcome, ghFailureOf (with its one precedence and the unknown-outcome rule for mutating calls), withGhFailureNet and ghApprovalClass. Existing tools are not touched yet. — ↩ rollbackable
2. Convert the existing tools file by file (issue, pr, repo, release, actions, project): typebox input written to serialise identically to the snapshot, output schema describing today's data, limit passed through the key instead of a number, fixed approval replaced by ghApprovalClass where the class depends on input, the six destructive tools raised, and gh_release_edit (newTag) and gh_repo_clone (extraArgs) made destructive per input. Update approval-class-mapping.test.ts with the PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 set and addedByS5 list; the snapshot is not edited. — ↩ rollbackable _(needs: `step 1 merged`)_
3. Change gh_pr_diff and gh_run_view to the cut-is-answer capture and the sc3 conversion; add truncated to gh_run_view and make a failed log command fail the call. This is the one visible behaviour change besides the stricter approval and is covered by fixtures that cross the cap and a multibyte character. — ↩ rollbackable _(needs: `step 2 merged`)_
4. Add the 22 family tools with their op tables, the tab and config parsers and the stdin delivery for secret, variable and key adds, the codespace create preview notice, and register them in index.ts. — ↩ rollbackable _(needs: `step 1 merged`)_
5. Add GH_COVERAGE and GH_INPUTS and the coverage, input, prompt-sweep, real-CLI parser, timeout, approval, failure and compatibility tests, with the fake gh binary fixture; record the performance amendment and update docs/plans/tool-registry.md. — ↩ rollbackable _(needs: `steps 2 and 4 merged`)_

**Backward compat:** Existing tool ids, input fields and result data are unchanged; the schemas serialise identically to the 228-row snapshot apart from any listed S5 exception, and gh_repo_clone.extraArgs and gh_release_edit.newTag stay. Approval is stricter for eight tools (close, merge and delete now destructive and ask every time; a release edit that sets newTag and a clone that sets extraArgs ask too), so a caller that relied on the common class now sees a prompt. Limits only grow or stay. gh_run_view gains the additive truncated field and now fails when its log command fails; a cut capture keeps the prefix up to the cap, so text and diffBytes at the cap can differ from today by up to one chunk. Failure text stays in output and error with failure.kind added beside it.

## 8. Alternatives considered

### 8.1 a1: One tool per operation

Convert the 46 existing gh tools in place and add one new named tool for every other operation a program can run, with the shared failure net, a limit table and a coverage table.



**Rejected because:** Meets every criterion but writes about 90 new definitions for coverage that 22 family tools reach.

### 8.2 a2: Existing tools in place, new operations grouped by family with an op input — **CHOSEN**

Convert the 46 tools in place and cover the other operations with 22 family tools whose op input names the operation, with a per-op contract table giving each op its exact flags, positionals, output, command, class and time limit, and input and parser checks against the installed gh.



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

- The per-job limit table departs from the HLD's single 120 s performance line; the user decided it in chat on 2026-10-25 (docs/plans/tool-registry.md, 's5 decisions'). The nonFunctional.retarget proposal made in the contract step still has to be filed as an amendment artifact.
- gh_run_view's failed log call becomes a real failure instead of a success carrying stderr (the rule used for git_show's diff); confirm.
- gpg-key list and ssh-key list return untyped rows because gh does not document their columns and the sign-in here lacks the scopes to list them; a later change can name the columns once they are verified.
- codespace create always accepts the permissions the devcontainer requests (--default-permissions), and the notice is in the approval preview content; confirm this is acceptable, since the alternative would be to refuse codespaces that request extra permissions.
- No insrc_analyze_step bundle was run for this LLD; the bundles come from direct reads of the gh tool files, the installed gh 2.46.0 help and --json listings, and the tools folder.

## Resolved questions

- `qb765d77f` — The per-job limit table departs from the HLD's single 120 s performance line; the user decided it in chat on 2026-10-25 (docs/plans/tool-registry.md, 's5 decisions'). The nonFunctional.retarget proposal made in the contract step still has to be filed as an amendment artifact.
  - **resolved**: Amend the HLD — Records the user's 2026-10-25 per-job limit decision; the amendment is filed as a task of the plan. _(2026-10-25T13:46:57.210Z)_
- `qf61cc94b` — gh_run_view's failed log call becomes a real failure instead of a success carrying stderr (the rule used for git_show's diff); confirm.
  - **resolved**: Fail on failed log call — Same rule the user accepted for git_show's diff. _(2026-10-25T13:47:51.906Z)_

## Citations

- **[[c1]]** `code` `src/daemon/tools/builtins/gh/helpers.ts`
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/index.ts`
- **[[c3]]** `code` `src/daemon/tools/call-tool.ts`
- **[[c4]]** `code` `src/daemon/tools/approval-policy.ts:35`
- **[[c5]]** `code` `src/daemon/tools/builtins/git/coverage.ts`
- **[[c6]]** `doc` `docs/plans/tool-registry.md`
