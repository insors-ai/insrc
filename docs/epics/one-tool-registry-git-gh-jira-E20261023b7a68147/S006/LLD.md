<!-- insrc:artifact LLD-b7a68147dcf72034-s6 -->

# LLD: STORY-b7a68147dcf72034-s6

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `e550742c2f67...`

Story s6 adds five Jira tools over Atlassian's acli, each one tool with an op: jira_workitem (view, search, count, create, edit, transition, assign, clone, archive, unarchive, delete, attachment-list, attachment-delete, watcher-list, watcher-remove), jira_comment (list, create, update, delete, visibility), jira_link (list, types, create, delete), jira_project (list, view, create, update, archive, restore, delete) and jira_auth (status), 32 ops in all. Their op tables, input schemas and field rules come from the exported functions of the s5 op builder in src/daemon/tools/builtins/gh/op-table.ts, which is not edited; because that builder has no maximum, no maxItems, no deduplication and checks a leading dash only on positionals, Jira adds its own bounds, key normaliser and identifier checks, and its own argv head, executor, failure mapping and answer readers, since acli's --json is a boolean, a changing command can exit 0 with a FAILURE result, and several answers are text. A change to work items is addressed by key only (at most 50 supplied), the three commands that take a limit get a finite one, transitions are driven by status name, a project is created from an existing project as acli requires, and each op is classed none, common or destructive. The tools are returned as GhFamilyTool like the gh families, so their shapes are checked at run time (an answer the reader cannot read is a rejected failure; data outside the output union is the executor's schema-mismatch) and callers get no concrete compile-time types; the LLD proposes an amendment to sc2 that records this. The acli commands and forms left out of the five tools, and the operations acli does not offer, are listed in the scope amendment to ac1 in docs/plans/tool-registry.md, which the user approves with this LLD.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-b7a68147dcf72034** § 2. Framework summary

**Rollout phase:** Phase B — tool families
**Consumes:** `sc2` (Tool output schema and typed call), `sc3` (Text conversion with cross-check), `sc4` (Approval class and approval exchange), `sc5` (CLI failure kinds)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step. — owns `sc1`
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s3`: The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own. — owns `sc4`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s5`: The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.
- `s7`: The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.
- `s8`: Private implementation of s8: Reach the rest of git through named, typed tools

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `registerJiraTools`

```typescript
registerJiraTools(): void
```

**Returns:** `void` — Registers jira_workitem, jira_comment, jira_link, jira_project and jira_auth with the tool registry; called by registerBuiltinTools in src/daemon/tools/builtins/index.ts after registerGhTools.

**Preconditions:**
- Called once at daemon start-up with the other register functions

**Postconditions:**
- Five new tool ids exist; no existing tool id changes

### 2.2 `defineJiraFamily`

```typescript
defineJiraFamily(spec: { id: string; description: string; ops: readonly OpDef[] }): GhFamilyTool
```

**Parameters:**
- `spec.id: string` — The tool id: jira_workitem, jira_comment, jira_link, jira_project or jira_auth
- `spec.ops: readonly OpDef[]` — The ops of the family; every op's out kind is 'custom' so the output union member and the argv come from the op's own shape and args; OpDef, GhFamilyTool and the schema builders are those exported by src/daemon/tools/builtins/gh/op-table.ts

**Returns:** `GhFamilyTool` — A TypedTool & { ops } exactly as defineGhFamily returns for the 22 approved gh families: inputSchema is jiraInputSchema over buildInputSchema and outputSchema is the union of the ops' shapes (members carry the literal op), both plain TSchema, wrapped by withGhFailureNet from src/daemon/tools/builtins/gh/helpers.ts, with approval a function of the op (an op the table does not know is destructive). Because the schemas are plain TSchema, callTool's Static input and output types are not concrete per family; the shapes are enforced at run time, which the proposed sc2 amendment records

**Errors:**
- `ToolFailure rejected` when refuseInput (called with dashSafe true) or checkJiraValues refuses the input (unknown op, missing or extra field, an exclusive group, an identifier that does not match its pattern); acli is not run
- `ToolFailure missing-tool` when acli is not on PATH
- `ToolFailure missing-signin` when acli failed and the one auth status probe positively says unauthorized
- `ToolFailure timed-out` when the op's limit passed; for a changing op the message adds that the outcome is unknown
- `ToolFailure rejected` when acli exited non-zero with a text that is neither a sign-in nor a network failure, or exited 0 with a FAILURE result or an answer that the reader cannot read (a reader failure, raised inside execute)
- `ToolFailure schema-mismatch` when raised by executeTool after execute, not by the family: an answer builder returned no data or data outside the op's output union (executor.ts:149 and :158); withGhFailureNet wraps execute only and does not turn this into rejected

**Preconditions:**
- acli installed and signed in with the user's own session; the daemon never reads, asks for or stores a credential

**Postconditions:**
- Only 'acli' is spawned
- Every op that has a --yes flag (edit, transition, assign, clone, archive, unarchive, delete, link create, link delete) passes it
- The commands that take a limit (workitem search, project list, comment list) pass a finite --limit within their maximum and never --paginate; the other reads (attachment list, list-watchers, link list, link type, view, visibility, auth status) take no limit, are bounded by the server and by the 4 MiB capture cap, and an output cut at the cap is a failure
- A changing op addresses work items by key list only (at most 50 supplied): --jql, --filter and --from-file are not inputs of any changing op
- No edit is made to any file under src/daemon/tools/builtins/gh
- Reader failures are rejected and executor output-validation failures are schema-mismatch; each is tested

### 2.3 `jiraInputSchema`

```typescript
jiraInputSchema(base: TSchema, ops: readonly OpDef[]): TSchema
```

**Parameters:**
- `base: TSchema` — The input schema produced by buildInputSchema from op-table.ts
- `ops: readonly OpDef[]` — The ops, whose JIRA_LIMITS entries say which fields get a maximum or maxItems

**Returns:** `TSchema` — The base schema with maximum set on the limit fields (workitem search 500, project list 200, comment list 200), maxItems 50 on every key array and a pattern on every identifier field; the base builder emits only a minimum and minItems 1, so these bounds are Jira's own

**Preconditions:**
- Pure; does not edit gh/op-table.ts

**Postconditions:**
- A limit above its maximum, more than 50 supplied keys or an identifier outside its pattern is refused by the executor's input check before acli runs

### 2.4 `normalizeKeys`

```typescript
normalizeKeys(keys: readonly string[]): string[]
```

**Parameters:**
- `keys: readonly string[]` — The supplied work item keys, already within the 50 cap and the key pattern

**Returns:** `string[]` — The keys in their first-seen order with repeats dropped; the 50 cap applies to the keys supplied, so 51 keys that contain repeats are refused before normalisation

**Postconditions:**
- Applied by the argv step so acli never receives a repeated key

### 2.5 `checkJiraValues`

```typescript
checkJiraValues(def: OpDef, input: ToolInput): ToolFailure | undefined
```

**Parameters:**
- `def: OpDef` — The op
- `input: ToolInput` — The input after the schema check

**Returns:** `ToolFailure | undefined` — undefined when every identifier matches its pattern (JIRA_PATTERNS: work item key, project key, numeric id, link type name, status name, assignee address or account id or '@me' or 'default'); a rejected failure naming the field otherwise

**Preconditions:**
- Total and synchronous

**Postconditions:**
- The builder's refuseInput only scans 'pos' and 'spread' arguments and only when dashSafe is true, and does not scan flag values; Jira therefore calls it with dashSafe true and covers every flag-valued identifier here
- Identifier patterns do not allow a leading '-', so a flag-valued key, project key (including fromProject and projectKey), id or type name is refused before it can reach acli

### 2.6 `jiraArgv`

```typescript
jiraArgv(def: OpDef, input: ToolInput): string[]
```

**Parameters:**
- `def: OpDef` — The op
- `input: ToolInput` — The checked and normalised input

**Returns:** `string[]` — The argv of the op starting with 'acli': the words of buildArgv (op-table.ts) with its first token, the literal 'gh', replaced; the op's args carry a literal boolean --json where the command takes one and no op uses an items or jsonFields out kind, so no gh-style --json field list is appended; every free-text value (summary, description, body, jql, labels, status, assignee) is joined to its flag as one token '--flag=value' so a leading dash in the value cannot be read as a flag

**Preconditions:**
- def.out.kind is 'custom' and def.repo is not true

**Postconditions:**
- The first element is 'acli' and the second 'jira'
- No element after the command words is a bare value that starts with '-' unless it is a flag the table itself wrote
- project create is built as 'acli jira project create --from-project SRC --key NEW --name N' plus the optional --description, --url and --lead-email; --from-json and --generate-json are never written

### 2.7 `acliExec`

```typescript
acliExec(argv: string[], opts: { cwd?: string; limitMs: number; signal?: AbortSignal; maxBytes?: number }): Promise<AcliOutcome>
```

**Parameters:**
- `argv: string[]` — The full command from jiraArgv
- `opts.limitMs: number` — The op's time limit in milliseconds
- `opts.maxBytes: number` _(optional)_ — The capture cap (4 MiB by default); output cut at the cap is not the answer

**Returns:** `AcliOutcome` — The fields of runShellBytes (stdout and stderr as text, code, spawnError, timedOut, signal, aborted, stdoutTruncated, stderrOverflow) plus command, limitMs and probe: the result of one 'acli jira auth status' run, present only when the command failed with a text that is not a known rejection

**Preconditions:**
- Never throws: a spawn failure, a time-out and a non-zero exit are fields of the outcome

**Postconditions:**
- The command runs with standard input closed, so a prompt that appears (a missing --yes) is cancelled and exits 1 instead of waiting
- No credential is placed in argv or the environment
- The probe runs at most once per call, after the failure, with the same cwd and a 10 s limit

### 2.8 `jiraFailureOf`

```typescript
jiraFailureOf(o: AcliOutcome, opts: { mutating: boolean }): ToolFailure | undefined
```

**Parameters:**
- `o: AcliOutcome` — What acliExec returned
- `opts.mutating: boolean` — True for an op that changes Jira; every failure after the process started then adds that the outcome is unknown

**Returns:** `ToolFailure | undefined` — undefined when the command ran clean; otherwise a failure of a sc5 kind with acli's own text in message or original

**Preconditions:**
- Total and synchronous

**Postconditions:**
- Precedence: spawn failure or exit 127 (missing-tool, 'acli is not installed (not found on PATH)'); time-out; abort; signal; stderr overflow; a cut stdout; then a non-zero exit
- A non-zero exit is missing-signin ('acli is not signed in; sign in with acli jira auth login outside the daemon') only when the probe ran, completed (no spawn failure, time-out or signal) and its text positively says unauthorized or not signed in; a probe that failed to complete, or whose text matches a network pattern, never makes it missing-signin, and the original failure is classified by its own text (network text is unreachable, otherwise rejected)
- A text that names a known rejection (Issue does not exist, failed to parse JQL query, No project could be found, Permission denied, cancelled) is rejected without a probe
- No message asks for or contains a credential

### 2.9 `readBatch`

```typescript
readBatch(stdout: string): { ok: boolean; succeeded: { id: string; message: string }[]; failed: { id: string; message: string }[] } | undefined
```

**Parameters:**
- `stdout: string` — The --json output of transition, assign, edit, clone, archive, unarchive, delete and comment create

**Returns:** `object | undefined` — Parses {results:[{status,message,id}],totalCount,successCount}; ok only when results is non-empty, every status is SUCCESS, totalCount equals results.length and successCount equals totalCount; undefined when the text is not that shape

**Postconditions:**
- A FAILURE result at exit 0 is never ok
- The answer builder of a batch op turns not-ok into a rejected failure that lists each failed id with acli's message and, when some succeeded, each succeeded id and the words 'the batch was partly applied'
- Clone's new key is read from the success message ('... cloned as https://<site>/browse/KEY') because the result id is the source key

### 2.10 `readCount`

```typescript
readCount(stdout: string): number | undefined
```

**Parameters:**
- `stdout: string` — The output of 'workitem search --count'

**Returns:** `number | undefined` — The integer N of the line 'Number of work items in the search: N' (a leading check mark and surrounding text allowed); undefined when no such line exists

**Postconditions:**
- undefined makes the count op a rejected failure with the text in original; no count is ever guessed

### 2.11 `readVisibility`

```typescript
readVisibility(stdout: string, kind: 'group' | 'role'): { groups: { name: string; id: string }[] } | { roles: string[] } | undefined
```

**Parameters:**
- `stdout: string` — The output of 'comment visibility --group' or '--role --project K', with ANSI escapes removed before reading
- `kind: 'group' | 'role'` — Which lookup

**Returns:** `object | undefined` — group: the rows of the box table (name and id columns) under 'Available Groups', accepted only when the '(N total)' count equals the number of parsed rows, and an empty list only when that count is 0; role: the '- Name' lines under 'Available Roles', accepted only when at least one such line exists and every non-blank body line is one; undefined when the heading is missing, the count does not match the rows, a body line is not recognised, or a role body has no '- Name' line

**Postconditions:**
- A heading-only or changed-format body is a rejected failure, never an empty list; an empty role list stays unreadable until real empty text is recorded by the live probe

### 2.12 `parseAuthStatus`

```typescript
parseAuthStatus(text: string): { signedIn: boolean; site?: string; email?: string; authType?: string }
```

**Parameters:**
- `text: string` — The output of 'acli jira auth status'

**Returns:** `{ signedIn: boolean; site?: string; email?: string; authType?: string }` — Read from the 'Authenticated' line and the 'Site:', 'Email:' and 'Authentication Type:' lines; no model call

**Postconditions:**
- A text with an 'unauthorized' line is signedIn false

### 2.13 `JIRA_LIMITS`

```typescript
const JIRA_LIMITS: { keysMax: 50; searchDefault: 50; searchMax: 500; projectDefault: 30; projectMax: 200; commentDefault: 50; commentMax: 200 }; const JIRA_PATTERNS: Record<'workItemKey' | 'projectKey' | 'numericId' | 'linkTypeName' | 'statusName' | 'assignee', RegExp>
```

**Returns:** `constants` — The finite bounds of the three commands that take a limit and of every key list, and the identifier patterns used by jiraInputSchema and checkJiraValues; none allows a leading '-'

**Postconditions:**
- No op passes --paginate; --recent is offered only by project list, as the alternative of limit, and acli caps it at 20

### 2.14 `jira_workitem`

```typescript
TypedTool: input { op: 'view'|'search'|'count'|'create'|'edit'|'transition'|'assign'|'clone'|'archive'|'unarchive'|'delete'|'attachment-list'|'attachment-delete'|'watcher-list'|'watcher-remove'; cwd?; ...fields of the op }; output union by literal op
```

**Parameters:**
- `key: string` _(optional)_ — view, attachment-list, watcher-list and watcher-remove: one work item key
- `keys: string[]` _(optional)_ — edit, transition, assign, clone, archive, unarchive, delete: one to 50 keys as supplied; repeats are then dropped
- `jql / filter: string` _(optional)_ — search and count: exactly one of the two
- `fields / limit: string[] / integer` _(optional)_ — view and search: the fields to return; search: limit 1 to 500, default 50
- `project / type / summary / description / assignee / labels / parent: string / string[]` _(optional)_ — create needs project, type and summary; edit needs at least one of summary, description, type, assignee, removeAssignee, labels and removeLabels; assignee is an email, an account id, '@me' or 'default'
- `removeAssignee / removeLabels: boolean / string[]` _(optional)_ — edit and assign: remove the assignee; edit: remove labels
- `status: string` _(optional)_ — transition: the target status by name (acli has no transition id)
- `toProject: string` _(optional)_ — clone: the target project key
- `id / user: string` _(optional)_ — attachment-delete: the attachment id; watcher-remove: the account id of the watcher

**Returns:** `union by op` — view {op, item}; search {op, count, items}; count {op, count}; attachment-list {op, count, attachments}; watcher-list {op, count, watchers}; every other op {op, ok, target, message} with target the key(s) changed or, for create and clone, the new key(s)

**Errors:**
- `ToolFailure` when as defineJiraFamily

**Preconditions:**
- acli signed in

**Postconditions:**
- Classes: view, search, count, attachment-list, watcher-list none; create, edit, transition, assign, clone, archive, unarchive, watcher-remove common; delete and attachment-delete destructive
- Limits: view, attachment-list, watcher-list 30 s; search and count 60 s; every changing op 60 s
- Items type only key and id (watchers accountId); the rest of the REST object is unknown, so an extra or null property never fails a call

### 2.15 `jira_comment`

```typescript
TypedTool: input { op: 'list'|'create'|'update'|'delete'|'visibility'; cwd?; ...fields of the op }; output union by literal op
```

**Parameters:**
- `key / keys: string / string[]` _(optional)_ — list, update, delete: one key; create: one to 50 keys
- `body / id: string` _(optional)_ — create needs body; update needs id and body; delete needs id
- `limit: integer` _(optional)_ — list: 1 to 200, default 50
- `group / role / project: boolean / boolean / string` _(optional)_ — visibility: exactly one of group and role; role needs project

**Returns:** `union by op` — list {op, total, isLast, comments}; visibility {op, groups} or {op, roles}; create, update, delete {op, ok, target, message}

**Errors:**
- `ToolFailure` when as defineJiraFamily

**Postconditions:**
- Classes: list, visibility none; create, update common; delete destructive
- A comment body comes from the body field only; --body-file, --body-adf and --editor are not inputs
- isLast is passed on as acli reports it; the tool does not rely on it to decide completeness (the probe showed it false for a single comment)

### 2.16 `jira_link`

```typescript
TypedTool: input { op: 'list'|'types'|'create'|'delete'; cwd?; ...fields of the op }; output union by literal op
```

**Parameters:**
- `key: string` _(optional)_ — list: the work item key
- `out / in / type: string` _(optional)_ — create: the outward and inward work item keys and the link type name as listed by types
- `id: string` _(optional)_ — delete: the link id

**Returns:** `union by op` — list {op, links}; types {op, types}; create, delete {op, ok, target, message}

**Errors:**
- `ToolFailure` when as defineJiraFamily

**Postconditions:**
- Classes: list, types none; create common; delete destructive
- A link is created or deleted only when acli's text starts with the success mark; any other exit-0 text is a rejected failure

### 2.17 `jira_project`

```typescript
TypedTool: input { op: 'list'|'view'|'create'|'update'|'archive'|'restore'|'delete'; cwd?; ...fields of the op }; output union by literal op
```

**Parameters:**
- `key: string` _(optional)_ — view, create, archive, restore, delete: the project key (for create, the key of the new project)
- `fromProject: string` _(optional)_ — create: the key of the existing project to create the new one from (acli --from-project); required for create; only a company-managed project can be the source
- `name / description / leadEmail / url: string` _(optional)_ — create needs fromProject, key and name, with description, url and leadEmail optional (the lead defaults to the source project's lead); update needs projectKey and at least one of key, name, description, leadEmail, url
- `projectKey: string` _(optional)_ — update: the key of the project to update
- `limit / recent: integer / boolean` _(optional)_ — list: exactly one of limit (1 to 200, default 30 when neither is given) and recent

**Returns:** `union by op` — list {op, count, projects}; view {op, project}; every other op {op, ok, target, message}

**Errors:**
- `ToolFailure` when as defineJiraFamily

**Preconditions:**
- For create, the source project is company-managed; acli refuses any other and its text is passed on as a rejected failure

**Postconditions:**
- Classes: list, view none; create, update, restore common; archive and delete destructive
- Projects type only key, id and name
- A project is created only from an existing project; the --from-json and --generate-json forms read or write a local file and are not inputs
- The success text of create, update, restore, archive and delete was not probed on a live site; the readers accept the success mark only, and a gated live probe (see the test strategy) records the real text of each before the readers are accepted

### 2.18 `jira_auth`

```typescript
TypedTool: input { op: 'status'; cwd? }; output { op: 'status', signedIn: boolean, site?: string, email?: string, authType?: string }
```

**Parameters:**
- `op: 'status'` — The only op; login, logout and switch handle credentials or change the session and are not offered

**Returns:** `{ op: 'status'; signedIn: boolean; site?: string; email?: string; authType?: string }` — The sign-in state read from acli's text

**Errors:**
- `ToolFailure missing-signin` when acli says unauthorized
- `ToolFailure missing-tool` when acli is not installed

**Postconditions:**
- Class none, limit 30 s

### 2.19 `JIRA_COVERAGE`

```typescript
const JIRA_COVERAGE: readonly { command: string; owner: 'covered' | 'excluded'; toolIds?: string[]; op?: string; reason?: string }[]; const JIRA_UNSUPPORTED: readonly { operation: string; reason: string }[]
```

**Returns:** `readonly rows` — One row per leaf command of 'acli jira', each served by a tool and op or excluded for a stated reason, and the named unsupported operations (a transition by id and a list of the transitions a work item can take); the acli inventory of docs/plans/tool-registry.md is the source each row cites

**Postconditions:**
- The excluded rows are exactly the commands and forms listed in the section 's6 scope amendment to ac1' of docs/plans/tool-registry.md, which the user approves with this LLD: create-bulk, the --from-json and --generate-json forms of project create and update, auth login, logout and switch, and every command of board, dashboard, field, filter and sprint
- The coverage test also checks a required-operation inventory written independently of this table: every acli command on work items, comments, links, attachments, watchers and projects, minus the amended exclusions, must be covered

## 3. Data model changes

### 3.1 `Jira family op tables (jira_workitem, jira_comment, jira_link, jira_project, jira_auth)` — new

Five lists of OpDef, 32 ops in all: jira_workitem 15, jira_comment 5, jira_link 4, jira_project 7, jira_auth 1. Each op names its acli command words, its fields, its rules, its class, its limit and its answer builder (out kind custom). Classes: 12 ops none (view, search, count, attachment-list, watcher-list, comment list, comment visibility, link list, link types, project list, project view, auth status), 14 common (create, edit, transition, assign, clone, archive, unarchive, watcher-remove, comment create, comment update, link create, project create, project update, project restore) and 6 destructive (work item delete, attachment-delete, comment delete, link delete, project archive, project delete). The acli command words come from the acli inventory and the project mutation flags section of docs/plans/tool-registry.md.

**Call sites:**
- `src/daemon/tools/builtins/jira/workitem.ts`
- `src/daemon/tools/builtins/jira/comment.ts`
- `src/daemon/tools/builtins/jira/link.ts`
- `src/daemon/tools/builtins/jira/project.ts`
- `src/daemon/tools/builtins/jira/auth.ts`

### 3.2 `Jira answer shapes` — new

view {item: {key, id, fields?, transitions?}}; search {count, items: [{key, id, fields?}]}; count {count}; attachment-list {count, attachments: unknown[]}; watcher-list {count, watchers: [{accountId?, displayName?}]}; comment list {total, isLast, comments: unknown[]}; comment visibility {groups: [{name, id}]} or {roles: string[]}; link list {links: unknown[]}; link types {types: string[]}; project list {count, projects: [{key, id, name}]}; project view {project: {key, id, name}}; auth status {signedIn, site?, email?, authType?}; every changing op {ok, target, message}. Only the properties callers need are typed; extra REST properties pass through as unknown, so acli adding a property never fails a call.

**Call sites:**
- `src/daemon/tools/builtins/jira/schemas.ts`

### 3.3 `Jira answer readers, limits and input checks` — new

readBatch, readCount, readVisibility, parseAuthStatus, JIRA_LIMITS, JIRA_PATTERNS, jiraInputSchema, normalizeKeys and checkJiraValues: pure functions and constants over acli's text and JSON and over the input, each tested against output recorded from the real acli (the inventory and the approved write probe).

**Call sites:**
- `src/daemon/tools/builtins/jira/readers.ts`
- `src/daemon/tools/builtins/jira/input.ts`

### 3.4 `Dependency of builtins/jira on builtins/gh` — new

builtins/jira imports OpDef, OutSpec, field and the argument constructors, refuseInput, buildArgv, buildInputSchema, buildOutputSchema, rejectInput and the GhFamilyTool type from builtins/gh/op-table.ts and withGhFailureNet from builtins/gh/helpers.ts; it imports nothing else from gh and edits nothing there. The dependency points one way (jira to gh). A move of the builder to a neutral folder, which would also give the gh families the bounds and checks Jira needs and could add concrete per-family types, is left to a later Story when a third CLI family needs it (alternative a2).

**Call sites:**
- `src/daemon/tools/builtins/gh/op-table.ts`
- `src/daemon/tools/builtins/gh/helpers.ts`

### 3.5 `JIRA_COVERAGE and JIRA_UNSUPPORTED` — new

A table of the leaf commands of the installed acli jira with the tool and op that serves each or the reason, from the scope amendment to ac1 in docs/plans/tool-registry.md, that it is left out, and the list of named unsupported operations. Read by the coverage test; the required-operation inventory the test checks it against is separate.

**Call sites:**
- `src/daemon/tools/builtins/jira/coverage.ts`

## 4. Diagrams

- [Component dependencies](docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S006/component-dependency.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | Each family declares a typebox inputSchema and an output union; the executor checks the input before and the result data after (failed('schema-mismatch') on data outside the union); callTool takes the definition. The declared types are plain TSchema as for the approved gh families, so callTool's static types are not concrete per family; the LLD proposes an additive sc2 amendment (fieldAdd, breaking false) that records this level and relies on its approval. |
| `sc3` | consumes | No Jira op needs convertText: every read has --json or a small fixed text form that a deterministic reader parses. The contract is consumed only in that no op may reach for a model call. |
| `sc4` | consumes | Tool.approval is a function of the op: reads none, changes common, deletes and project archive destructive; an op the table does not know is destructive. A destructive op asks every time whatever the setting; with no client attached it is denied (s3). |
| `sc5` | consumes | jiraFailureOf and the answer builders return missing-tool, missing-signin, unreachable, timed-out and rejected, with acli's own text kept in the message or original; schema-mismatch is raised by the executor, not by the family. |

## 6. Error paths

**Error cases**

- **acli is not installed** (recoverable)
  - Detection: runShellBytes reports a spawn failure or the shell exits 127 with 'acli: not found'; jiraFailureOf checks this first
  - Response: ToolFailure missing-tool 'acli is not installed (not found on PATH)'; nothing else is run
  - User impact: The caller learns to install acli; no Jira call is made
- **acli is installed but not signed in** (recoverable)
  - Detection: A command exits non-zero with a text that is not a known rejection, and the one 'acli jira auth status' probe completes and says unauthorized
  - Response: ToolFailure missing-signin telling the user to sign in outside the daemon; the daemon never asks for, reads or stores a credential
  - User impact: The user signs in with their own acli session and retries
- **The sign-in probe itself fails on network, time-out or spawn** (recoverable)
  - Detection: The probe outcome has a spawn error, timedOut, a signal, or text matching a network pattern
  - Response: The original failure is classified by its own text (network text is unreachable, otherwise rejected); it is never reported as missing-signin without positive evidence
  - User impact: A flaky network is not mistaken for a lost sign-in
- **A changing command exits 0 but every result is FAILURE** (recoverable)
  - Detection: readBatch parses {results,totalCount,successCount} and finds a status other than SUCCESS, or the counts disagree; this is a reader failure raised inside execute
  - Response: ToolFailure rejected listing each failed key with acli's message
  - User impact: A failed transition or edit is never reported as done
- **A batch is partly applied** (recoverable)
  - Detection: readBatch finds both SUCCESS and FAILURE results
  - Response: ToolFailure rejected naming the failed keys and the succeeded keys, with the words 'the batch was partly applied'
  - User impact: The caller knows which work items changed and which did not, and does not repeat the ones that changed
- **A text-result command (comment update or delete, link create or delete, project mutation) exits 0 without the success mark** (recoverable)
  - Detection: The answer builder requires stdout to contain the check mark; its absence is detected before ok is set (a reader failure raised inside execute)
  - Response: ToolFailure rejected with acli's text in original
  - User impact: No change is claimed that acli did not confirm
- **A text command exits 1 with the failure mark** (recoverable)
  - Detection: Non-zero exit; the text names the cause (Issue does not exist, Permission denied, cancelled)
  - Response: ToolFailure rejected with acli's text, no probe for a known rejection
  - User impact: The cause reaches the caller verbatim
- **project create is given a source project that is not company-managed, or one that does not exist** (recoverable)
  - Detection: acli exits non-zero with its own message; jiraFailureOf finds no sign-in or network text
  - Response: ToolFailure rejected with acli's text in message, so the company-managed restriction reaches the caller
  - User impact: The caller picks a company-managed source project
- **A time-out** (recoverable)
  - Detection: runShellBytes timedOut at the op's limit (30 s reads, 60 s search, count and changing ops)
  - Response: ToolFailure timed-out; for a changing op the message adds that the outcome is unknown
  - User impact: The caller checks the work item before retrying a change
- **Output is cut at the capture cap** (recoverable)
  - Detection: stdoutTruncated or stderrOverflow on the outcome
  - Response: ToolFailure rejected; a cut output is never parsed as the answer
  - User impact: A smaller limit or a narrower query is asked for; the reads that take no limit (attachment list, list-watchers, link list, link type) fail rather than return a partial list
- **A read answer cannot be parsed (count line, visibility heading, visibility rows that do not match the stated count, an unrecognised body line, JSON)** (terminal)
  - Detection: readCount or readVisibility returns undefined, or the JSON does not parse; a reader failure raised inside execute
  - Response: ToolFailure rejected with the raw text in original; no count or list is guessed and a heading-only body is not an empty list
  - User impact: A change in acli's text is visible as a failure, not as a wrong number or a silently shortened list
- **An answer builder returns no data, or data that does not fit the op's output union (a defect in the builder, not an acli failure)** (terminal)
  - Detection: executeTool checks the declared output after execute (executor.ts:149 and :158); withGhFailureNet wraps execute only and cannot intercept this step
  - Response: The executor returns ToolFailure schema-mismatch with the raw output kept in original; the family does not relabel it as rejected
  - User impact: A defect in an answer builder is told apart from an acli failure, and its result is not passed on
- **A prompt appears because --yes was missing** (recoverable)
  - Detection: Standard input is closed, so acli exits 1 with 'cancelled'; the argv tests also assert --yes on each op that has it
  - Response: Rejected failure; the test suite fails if an op loses its --yes
  - User impact: The daemon never hangs on a prompt
- **A destructive op is called with no client attached or denied** (recoverable)
  - Detection: Tool.approval returns destructive for the op; the approval exchange of sc4 denies it
  - Response: ToolFailure denied; acli is not run
  - User impact: Deleting a work item, comment, link, attachment or project never happens unattended
- **An unknown op, an unregistered field or a missing required field (for example project create without fromProject) reaches the tool** (recoverable)
  - Detection: refuseInput and the run-time input check find no OpDef, a field outside the op, or a required field absent; the compiler does not catch this because the schemas are plain TSchema
  - Response: ToolFailure rejected before acli is run; an unknown op is classed destructive by the approval function
  - User impact: A mistyped call fails closed at run time
- **An identifier starts with a dash or does not match its pattern (a work item key, project key, fromProject, id, link type name, status or assignee)** (recoverable)
  - Detection: The input schema pattern from jiraInputSchema refuses it at the executor's input check, and checkJiraValues refuses it again before the spawn; refuseInput runs with dashSafe true for the positionals
  - Response: ToolFailure rejected naming the field; acli is not run
  - User impact: A value cannot be read by acli as a flag, whether it is a positional or a flag value

**Edge cases**

| Input | Expected |
| :--- | :--- |
| keys contains the same key twice | Accepted within the 50 supplied; normalizeKeys drops the repeat so acli receives each key once |
| 51 keys supplied, even if some repeat | Refused by maxItems 50 in jiraInputSchema before acli runs; the cap applies to the keys supplied |
| A free-text value (summary, description, body, jql, label) that starts with '-' | Accepted and passed as one token '--flag=value', so it cannot be read as a flag |
| search or count with both jql and filter, or neither | Refused by the exclusive group; exactly one is required |
| A changing op given jql, filter or from-file | Refused as an unknown field; changing ops address work items by keys only |
| search with limit 0 or above 500, project list above 200, comment list above 200 | Refused by minimum and the Jira maximum; the defaults are 50, 30 and 50 and --paginate is never passed |
| project list with both limit and recent, or neither | Both is refused; neither uses limit 30 |
| project create with fromProject, key and name only | Runs 'acli jira project create --from-project SRC --key NEW --name N'; the lead defaults to the source project's lead |
| project create with a from-json or generate-json input | Refused as an unknown field; those forms read or write a local file and are excluded by the amendment to ac1 |
| attachment list, list-watchers, link list or link type on a very large item | No limit is passed; the server bounds the answer and an output cut at the 4 MiB cap is a failure, not a partial list |
| clone | The new key is read from the success message because the result id is the source key |
| comment list on a single comment where acli reports isLast false | isLast is passed on as reported; completeness is not decided from it |
| comment visibility with neither or both of group and role, or role without project | Refused by the input rules; acli itself exits 1 with neither |
| Group visibility with '(0 total)' and no rows | An empty groups list, because the count says zero and matches the zero rows |
| Group visibility whose '(N total)' differs from the parsed rows, or a role body with no '- Name' line | Rejected as unreadable (a reader failure), never an empty or short list |
| Coloured output of the visibility table | ANSI escapes are removed before the rows are read |
| A transition by id, or a request for the available transitions | Not offered; named unsupported in JIRA_UNSUPPORTED because acli takes a status name and returns transitions null |
| An extra or null property in the REST object | Passes through as unknown; only key, id and name are typed so the call never fails on it |
| Project create, update, restore, archive or delete success text before the live probe has recorded it | Read by the success mark only; any other exit-0 text is a rejected failure, and the gated live probe records the real text as fixtures |

**Invariants to preserve**

- Only 'acli' is spawned: no jira-cli or go-jira, and no direct REST call to Atlassian [[c2]]
- A tool's approval class is a function of the op and an unknown op is destructive; a destructive op asks every time and is denied with no client [[c4]]
- No source file under src/daemon/tools/builtins/gh is edited by this Story [[c2]]
- No op uses a model call to read acli output; every answer is read deterministically [[c3]]
- Reader failures are rejected and executor output-validation failures are schema-mismatch; the family never relabels one as the other, and missing-signin needs positive evidence [[c2]]
- A list is never returned from a malformed, cut or unrecognised answer [[c2]]

## 7. Test strategy

**Test framework:** `node:test run with npx tsx --test; files named *.test.ts under src/daemon/tools/builtins/jira/__tests__/, with a fake acli on PATH in _fakeacli.ts (same pattern as gh/__tests__/_fakegh.ts)`

**Test levels**

- **unit** — Pure functions: the answer readers, the input bounds and checks, the argv builder, the failure mapper and the approval function
  - Subjects: `readBatch: all SUCCESS, all FAILURE at exit 0, partial, count mismatch, clone key from the message`, `readCount, parseAuthStatus on recorded acli text`, `readVisibility: group with a matching '(N total)', group with '(0 total)', count that differs from the rows, heading only, unrecognised line, role with and without '- Name' lines, ANSI escapes`, `jiraInputSchema: maximum 500, 200 and 200 on the limit fields, maxItems 50 on key arrays, patterns on identifiers; 51 keys with repeats refused; normalizeKeys keeps first-seen order`, `checkJiraValues and the schema patterns: a leading-dash value in every flag-valued identifier (key, keys, project, toProject, projectKey, fromProject, id, user, type name, status, assignee) and in a positional is refused, and refuseInput runs with dashSafe true`, `jiraArgv: head acli, --yes where acli has it, literal --json, finite --limit only on search, project list and comment list, never --paginate, free text joined as one '--flag=value' token including a value that starts with '-'`, `jiraArgv for project create is exactly 'acli jira project create --from-project SRC --key NEW --name N' plus optional --description, --url and --lead-email, and never --from-json or --generate-json; project update uses --project-key; archive, restore and delete use --key and no --yes`, `jiraFailureOf precedence and the probe rules (missing-signin only on positive evidence)`, `approval function per op and an unknown op`
  - Fixtures: `Output recorded from the real acli in docs/plans/tool-registry.md, stored as fixture files`
- **integration** — Each tool run end to end against a fake acli on PATH that replays recorded output and exit codes, through executeTool
  - Subjects: `jira_workitem, jira_comment, jira_link, jira_project and jira_auth: every op returns the declared shape`, `reader failures are rejected: a FAILURE result at exit 0, a text command without the success mark, an unreadable count or visibility body each come back from executeTool as kind rejected`, `executor output validation is schema-mismatch: with an answer builder that returns data outside its op's output union (and one that returns no data), executeTool returns kind schema-mismatch and the family does not relabel it as rejected`, `not installed (exit 127), not signed in (unauthorized probe), network failure probe, time-out, truncated output on a read that takes no limit`, `project create from a non-company-managed source: acli's refusal text reaches the caller as a rejected failure`, `a spawn-only check: with fake jira, jira-cli and go-jira on PATH only acli is ever run`, `input rules at run time: exclusive groups, 50 key cap, repeated keys sent once, changing ops refuse jql, filter and from-file, a missing required field (project create without fromProject) and an unknown op are refused by the run-time input check`, `each defineJiraFamily result is a GhFamilyTool carrying its ops (the same shape the gh families return); no concrete compile-time input or output type is asserted`
  - Fixtures: `_fakeacli.ts`, `fake jira, jira-cli and go-jira executables that record any call`
- **contract** — The registry listing and the coverage tables
  - Subjects: `jira-coverage: every command of the installed acli jira is covered or in the approved exclusion list, checked against an independently written REQUIRED_OPS inventory; the exclusion list equals the table of the section 's6 scope amendment to ac1' in docs/plans/tool-registry.md`, `JIRA_UNSUPPORTED names a transition by id and the list of transitions, and neither is a registered op`, `output schemas accept the recorded answer of each op and reject a wrong literal op`, `classes: the 6 destructive ops are destructive, 12 are none, 14 are common, 32 in all`, `jira-parser against the real acli --help (canary, skipped when acli is absent), including the flags of project create, update, archive, restore and delete`
  - Fixtures: `approved EXCLUDED_BY_AMENDMENT list`
- **live** — Real acli on the user's site, gated by INSRC_LIVE_TESTS=1 and skipped cleanly otherwise
  - Subjects: `read ops: view, search, count, list, types, status, visibility`, `one create then delete of a work item in a scratch project with cleanup of any clone`, `a disposable-project probe, additionally gated by three environment variables (a company-managed source project key, a scratch project key for the new project, and a lead email): create it from the source, update, archive, restore and delete it, recording the real success text of each as a fixture file before the project mutation readers are accepted; the probe deletes the project even when a step fails, and skips with a reason when the variables are not set`
  - Fixtures: `A signed-in acli, a scratch work item project key, and for the disposable-project probe a company-managed source project key, a scratch project key and a lead email in environment variables`
- **smoke** — The tools are registered and documented
  - Subjects: `registerJiraTools adds exactly five tool ids and changes no existing one`, `docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `jira-coverage.test.ts: every required operation of the independent REQUIRED_OPS inventory is reachable through a named tool and op`, `jira-coverage.test.ts: the exclusion list equals the amended list in docs/plans/tool-registry.md`, `jira-family.test.ts: the five tools and 32 ops are registered and each op returns its declared shape`, `jira-parser.test.ts: the commands and flags of the real acli match the coverage table, including project create's --from-project` |
| `ac2` | `jira-failures.test.ts: acli missing gives missing-tool and acli unsigned gives missing-signin with a message that says which`, `jira-failures.test.ts: a failing probe on network or time-out is never missing-signin`, `jira-spawn-only.test.ts: no credential is placed in argv or environment and none is asked for` |
| `ac3` | `jira-output-schemas.test.ts: each op's recorded answer fits its declared union member and a wrong literal op does not`, `jira-parsers.test.ts: readBatch, readCount, readVisibility and parseAuthStatus on recorded text, including a FAILURE result at exit 0, a count that differs from the rows and a heading-only body`, `jira-failures.test.ts: reader failures are rejected through executeTool`, `jira-output-validation.test.ts: a builder that returns data outside its union, or no data, is schema-mismatch through executeTool`, `jira-inputs.test.ts: maximum, maxItems, repeated keys, leading-dash identifiers and a missing required field are refused or normalised before acli runs`, `jira-live.test.ts: the disposable-project probe records the real success text of each project mutation` |
| `ac4` | `jira-approval.test.ts: work item delete, attachment-delete, comment delete, link delete, project archive and project delete are destructive`, `jira-approval.test.ts: an unknown op is destructive and a destructive op is denied with no client` |
| `ac5` | `jira-spawn-only.test.ts: with fake jira, jira-cli and go-jira on PATH only acli is run, across every op` |
| `ac6` | `jira-coverage.test.ts: JIRA_UNSUPPORTED names a transition by id and the list of available transitions, and neither is a registered op`, `jira-coverage.test.ts: the excluded commands and forms equal the approved EXCLUDED_BY_AMENDMENT list` |

## 8. Migration

**State before:** No acli or Jira code exists under src (the s1 code bundle found only the word in src/shared/understanding.ts and src/understanding/identity.ts). The registry's builtins register one registerXTools() per domain in src/daemon/tools/builtins/index.ts, and the s5 op builder in builtins/gh/op-table.ts and builtins/gh/helpers.ts is used by the gh families only; the builder has no maximum, maxItems or deduplication, scans for a leading dash only on positionals with dashSafe, and its GhFamilyTool carries plain TSchema schemas; executeTool checks a declared output after execute. approval-class-mapping.test.ts compares the snapshot of the 228 builtins and does not fail for new tools.

**State after:** Five new tools (jira_workitem, jira_comment, jira_link, jira_project, jira_auth; 32 ops) are registered by registerJiraTools from a new folder src/daemon/tools/builtins/jira/, which imports the exported functions of the gh op builder and withGhFailureNet, adds its own input bounds and identifier checks, and edits no gh file. Each op has its approval class. docs/plans/tool-registry.md lists the tools, the scope amendment to ac1 (excluded commands and forms, unsupported operations) and the recorded success text of the project mutations. The sc2 amendment proposed by the LLD records the run-time-checked typing of family tools. No existing tool, its id, schema or class changes.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the jira folder with the schemas, input bounds and checks, readers, argv, executor and failure mapper, with unit tests beside them, using output recorded from the real acli — ↩ rollbackable
2. Add the five op tables and the family definer, with the coverage table and its independent required-operation inventory — ↩ rollbackable
3. Add registerJiraTools and call it from registerBuiltinTools after registerGhTools — ↩ rollbackable _(needs: `steps 1 and 2 merged`)_
4. Run the gated live probes once under INSRC_LIVE_TESTS=1, including the disposable-project probe, and store the recorded success text of each project mutation as fixtures that the readers are tested against — ↩ rollbackable _(needs: `step 3 merged`, `a signed-in acli`, `a company-managed source project key, a scratch project key and a lead email`)_
5. Document the five tools, their classes and the recorded project mutation text in docs/plans/tool-registry.md — ↩ rollbackable

**Backward compat:** Purely additive. No existing tool id, schema, approval class or file changes, and nothing under builtins/gh is edited, so every gh and git caller is unaffected. A caller that does not use the new ids sees only five more tools in the listing.

## 9. Alternatives considered

### 9.1 a1: Reuse the exported schema and rule functions of the s5 op builder, with Jira's own argv, input checks, executor and answer builders — **CHOSEN**

Five Jira family tools whose op tables and field rules come from the exported functions of src/daemon/tools/builtins/gh/op-table.ts, with Jira-owned input bounds, identifier checks, executor and answer readers; no gh file is edited.

A new src/daemon/tools/builtins/jira/ folder defines each op as an OpDef whose out kind is always 'custom'; Jira adds jiraInputSchema, normalizeKeys and checkJiraValues because the builder lacks maximum, maxItems, deduplication and a flag-value dash check, and passes free text as '--flag=value'. defineJiraFamily replaces the 'gh' head with 'acli', runs acliExec, maps failures with jiraFailureOf (reader failures are rejected), wraps the tool with withGhFailureNet and returns a GhFamilyTool exactly as the 22 approved gh families do, so callTool's static types are plain TSchema and the shapes are enforced at run time: the input check before, and the executor's output check after, where data outside the union is the executor's schema-mismatch. The LLD proposes an sc2 amendment recording that family tools are run-time-checked and typed as TSchema for callTool. 32 ops in five tools; jira_project create takes a required fromProject; the exclusions are an explicit amendment to ac1 recorded in docs/plans/tool-registry.md and approved with the LLD.

### 9.2 a2: Move the op builder to a CLI-neutral folder and make the executor an adapter

Extract op-table.ts to a shared builtins/cli-family module whose defineFamily takes a CLI adapter, and make gh and Jira two adapters.

Move the neutral parts of op-table.ts into a new module, add maximum, maxItems, deduplication and value checks to the builder, give defineFamily an adapter, rewrite defineGhFamily on top of it, and re-point the 22 gh family tools and the tests. A neutral builder could also carry concrete per-family types, which would meet sc2 without an amendment.

**Rejected because:** Gives the cleanest end state and could meet sc2 at compile time for every family, but it rewrites approved s5 code and its tests for a Story that needs only part of the builder, and designs an adapter before s8 exists; sc5 is partial because the gh failure mapping would move behind the adapter.

### 9.3 a3: One hand-written typed tool per Jira operation

About thirty tools (jira_workitem_view, jira_workitem_transition, jira_project_list, ...), each with its own input and output schema.

Each operation is a Tool with its own typebox input (with its own maximum and maxItems), output schema, approval class and execute that builds the acli argv and calls a shared acliExec; ids are jira_<family>_<operation>. Each tool would have concrete Static input and output types.

**Rejected because:** Satisfies every criterion including concrete compile-time types and needs no sc2 amendment, but repeats the key list, --yes, limit, identifier and exactly-one-of rules in about thirty tools and grows the model's tool list; the op table was built to avoid exactly that.

## 10. References

- **[[c1]]** `doc` `docs/plans/tool-registry.md` — "acli inventory for s6"
- **[[c2]]** `code` `src/daemon/tools/builtins/gh/op-table.ts`
- **[[c3]]** `code` `src/daemon/tools/builtins/gh/helpers.ts`
- **[[c4]]** `code` `src/daemon/tools/approval-policy.ts`
- **[[c5]]** `code` `src/daemon/tools/shell-helper.ts`

## 11. Open questions

- The sc2 amendment proposed in s4 (fieldAdd, breaking false: family tools are checked at run time and typed for callTool as TSchema) must be filed and approved with this LLD; adding concrete per-family types for gh and Jira together is left to a later Story (alternative a2 or a hand-written Static type per family).
- ep3: the invariants cite the schema's c<number> ids; the supporting s1 analyze bundles (approval, op builder and helpers) are not named in the field itself.
- The exact success text of project create, update, restore, archive and delete is unknown until the gated disposable-project probe records it; the readers accept the success mark only until then. The probe needs a company-managed source project key, a scratch project key and a lead email from the user.

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 9 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-25T19:20:53.452Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| change-sites | The proposed dependency relationship is adequately documented and its generated companion renders consistently. | The HTML source contains four components and three directed arrows from Jira to op-table, helpers, and shell-helper, matching §3.4 and its ownership explanation. No persistent entity relationship or UX change requires an ERD or mock. Rendering was attempted with headless Chrome but failed with 'Failed to create a unique user data directory for headless' in the restricted environment; layout and rendered labels were not verified. [files: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S006/component-dependency.html] | Render the existing companion in a writable browser environment and inspect arrows, labels, and layout. |
| error-paths | A success mark reliably identifies successful output for every project mutation. | The recorded project mutation inventory explicitly states 'The success text of these five commands is not recorded yet'. Existing write-probe evidence covers work items, comments and links, not project mutations. The LLD acknowledges this gap and requires a disposable-project probe; no recorded project success output was available to validate its readers. [files: docs/plans/tool-registry.md, docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S006/LLD.md] | Complete the authorized disposable-project probe and capture each mutation's real output before accepting those readers. |
