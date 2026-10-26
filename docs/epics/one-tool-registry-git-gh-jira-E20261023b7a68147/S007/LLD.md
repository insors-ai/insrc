<!-- insrc:artifact LLD-b7a68147dcf72034-s7 -->

# LLD: STORY-b7a68147dcf72034-s7

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `9fcc90f081df...`

s7 builds only the foundations the later cutover Stories need. Every subprocess a registered tool starts, in its approval preview, during the approval wait, in execute, in secondary commands and probes, and in the eight places where tools spawn processes themselves, goes through one process lifecycle: the executor resolves one effective signal for the call, and the lifecycle kills the whole process group and settles within 2 s when it aborts, so a client disconnect or the refresh's shared deadline stops the work, nothing is spawned after an abort, hooks run outside every tool's signal context, and an inventory test keeps new direct spawns out; each tool's own limit stays a ceiling and git_cat_file also takes a lowerable timeout; all 34 git tool definitions (plus four new ones) are listed in one typed list that drives registration and is checked for completeness by an inventory test, so callTool needs no cast; callTool refuses a registered tool that was not built from the definition passed, using a provenance table that only the failure-net wrappers write, and it accepts every exported gh tool and git definition; the gh tracker operations (fifteen, with every wrapper accounted for) are built on the op table through three additive internal argument variants and an additive string pattern on field specs, so owner and repo names are checked in the input schema before any approval, and the three paginated listings carry a fixed jq filter so every page is read as one line per item and returned in order; four git commands (config, ls-remote, update-ref, rm) are added with contracts taken from their real callers and every safety condition in the input schema; tools.call is a stream method that lets the terminal client run a tool with a validated caller; and a forbidden-spawn scan reports every direct git or gh spawn and direct builtin execute call. No call site moves here: s9 and s10 do that, and s10 turns the scan to failing mode.

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
- `s9`: Private implementation of s9: Move the workflow library's and the daemon's direct git and gh calls onto the registry
- `s10`: Private implementation of s10: Move the tracker and the terminal client onto the registry and remove the old paths

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `executeTool`

```typescript
executeTool(toolId: string, input: ToolInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `toolId: string` — Registry id of the tool to run
- `input: ToolInput` — Tool input, checked against its input schema (before the approval request) when the tool declares an output schema
- `deps: ToolDeps` — Caller, signal and approval mode; the executor resolves one effective signal from deps.signal and the signal already in the call context and uses it everywhere below

**Returns:** `Promise<ToolResult>` — The tool's result or a failed result; a tool failure is never thrown; a failure the tool built itself is returned unchanged

**Errors:**
- `ToolResult failure kind 'denied' with denial 'cancelled'` when the effective signal is aborted before the approval request is built, after it is built and before the ask, or immediately before execute runs; the tool is not started
- `ToolResult failure kind rejected` when the input does not fit the tool's input schema (including a field pattern); this happens before the approval request, so no approval is asked

**Preconditions:**
- deps.signal, when present, is an AbortSignal owned by the caller

**Postconditions:**
- The effective signal is resolved once, before the first cancellation check; it is deps.signal combined with the signal already in the context (AbortSignal.any), or either alone, or undefined
- buildApprovalRequest (which awaits tool.buildApprovalGate), gate().ask(request, effective) and tool.execute all run with the effective signal: the first and the last inside runWithToolSignal, the ask by receiving it, so a nested gated call with no signal of its own is cancelled while it waits for approval
- Hooks run through runWithoutToolSignal, only after a successful, checked call (sc1): inside a hook currentToolSignal() is undefined, also when the executor was entered from inside an outer tool's execute
- A destructive call still always asks and a denial is a failure value (sc4); its input has already passed the schema

### 2.2 `effectiveToolSignal`

```typescript
effectiveToolSignal(signal: AbortSignal | undefined): AbortSignal | undefined
```

**Parameters:**
- `signal: AbortSignal | undefined` — The call's own signal

**Returns:** `AbortSignal | undefined` — AbortSignal.any of signal and currentToolSignal() when both exist, whichever exists otherwise, undefined when neither

**Postconditions:**
- Pure apart from reading the context; defined in src/daemon/tools/tool-signal.ts

### 2.3 `runWithToolSignal`

```typescript
runWithToolSignal<R>(signal: AbortSignal | undefined, fn: () => R): R
```

**Parameters:**
- `signal: AbortSignal | undefined` — The effective signal of the call; undefined leaves the context unchanged
- `fn: () => R` — The work to run inside the context (executeTool passes the preview construction and tool.execute, each separately)

**Returns:** `R` — What fn returns

**Postconditions:**
- Backed by a module-private node:async_hooks AsyncLocalStorage in src/daemon/tools/tool-signal.ts; inside fn and every async continuation of it, currentToolSignal() returns signal combined with the signal already in the context; a nested call therefore inherits cancellation and cannot lose it
- Outside any context currentToolSignal() is undefined, so code that does not run under executeTool is unaffected

### 2.4 `runWithoutToolSignal`

```typescript
runWithoutToolSignal<R>(fn: () => R): R
```

**Parameters:**
- `fn: () => R` — The work that must not see any tool call's signal (executeTool passes the hook run)

**Returns:** `R` — What fn returns

**Postconditions:**
- Runs fn in the same AsyncLocalStorage with an explicit undefined store, so currentToolSignal() is undefined inside fn and in every continuation of it even when the caller is itself inside an outer tool call's context; a subprocess a hook starts is not cancelled by that outer call
- It is the only way to clear the context; runWithToolSignal(undefined, fn) leaves the context unchanged

### 2.5 `currentToolSignal`

```typescript
currentToolSignal(): AbortSignal | undefined
```

**Returns:** `AbortSignal | undefined` — The signal of the tool call the caller is running under, or undefined

**Postconditions:**
- Read only by the shared process lifecycle and by effectiveToolSignal

### 2.6 `runToolHooks`

```typescript
runToolHooks(tool: Tool, input: ToolInput, result: ToolResult, deps: ToolDeps): Promise<HookFailure[]>
```

**Parameters:**
- `tool: Tool` — The tool whose hooks run
- `input: ToolInput` — The checked input
- `result: ToolResult` — The checked, successful result
- `deps: ToolDeps` — Caller and the rest of the call's dependencies

**Returns:** `Promise<HookFailure[]>` — The failures of the hooks; unchanged

**Postconditions:**
- The executor's withHooks calls it inside runWithoutToolSignal; its behaviour is otherwise unchanged (src/daemon/tools/hooks.ts)

### 2.7 `buildApprovalRequest`

```typescript
buildApprovalRequest(opts: { tool: Pick<Tool, 'id' | 'buildApprovalGate'>; cls: 'common' | 'destructive'; input: ToolInput; deps: Pick<ToolDeps, 'repoPath'>; now?: number }): Promise<ApprovalRequest>
```

**Parameters:**
- `opts: { tool; cls; input; deps; now? }` — As today; the executor calls it inside runWithToolSignal(effective, ...), so every subprocess an async buildApprovalGate starts (the git calls in the git_push and git_reset previews) is under the call's signal

**Returns:** `Promise<ApprovalRequest>` — The request with the exact arguments and a preview; unchanged

**Postconditions:**
- Its signature and result are unchanged; a preview whose git command is killed by the signal does not throw: git_push's readBranch gives { ok: false } and the preview names the ref '(unknown: <kind>)', git_reset's currentBranch gives undefined and willNeedForcePush gives { ok: false } and the preview carries a warning line; the generic preview applies only when a builder throws; the call is stopped by the executor's cancellation check after buildApprovalRequest returns, before any ask

### 2.8 `ask`

```typescript
ask(request: ApprovalRequest, signal?: AbortSignal): Promise<ApprovalAnswer | ApprovalDenial>
```

**Parameters:**
- `request: ApprovalRequest` — The approval request
- `signal: AbortSignal` _(optional)_ — Now the call's effective signal, not only deps.signal, so the broker's cancellation listener is installed for a nested call too

**Returns:** `Promise<ApprovalAnswer | ApprovalDenial>` — Unchanged; 'cancelled' when the signal aborts while the request is pending

**Postconditions:**
- Behaviour unchanged for the broker (src/daemon/approval-broker.ts); only the signal the executor passes changes

### 2.9 `spawnManaged`

```typescript
spawnManaged(cmd: string, args: readonly string[], options?: ManagedSpawnOptions): ManagedProcess
```

**Parameters:**
- `cmd: string` — The command to run (shell false)
- `args: readonly string[]` — Its arguments
- `options: ManagedSpawnOptions` _(optional)_ — { cwd?, env?, stdio?, timeoutMs?, signal? }: the effective signal is options.signal combined with currentToolSignal(); timeoutMs is the tool's own ceiling

**Returns:** `ManagedProcess` — A discriminated union: { spawned: true; child: ChildProcess; settled: Promise<ManagedExit> } when a process was started (the tool attaches its own stdout and stderr callbacks and sends its own progress frames to the live child), or { spawned: false; settled: Promise<ManagedExit> } when the effective signal was already aborted, with settled already resolved to { code: null, signal: null, timedOut: false, aborted: true }; ManagedExit is { code: number | null; signal: string | null; timedOut: boolean; aborted: boolean }

**Errors:**
- `union branch spawned false` when the effective signal is already aborted: nothing is spawned, and a caller that reads child must narrow on spawned first (the type does not offer child on this branch)
- `child 'error' event` when the command cannot be spawned; the tool handles it as it does today and settled resolves

**Postconditions:**
- On non-win32 the child is spawned detached in its own process group; an abort or the timeoutMs ceiling kills the whole group; settled resolves on 'close' or, after a kill, within 2 s by destroying the streams, clearing every timer and listener and resolving with what was seen
- It is the one place under src/daemon/tools that imports node:child_process; runShell and runShellBytes are built on the same lifecycle

### 2.10 `runShell`

```typescript
runShell(argv: readonly string[], options?: ShellOptions): Promise<ShellResult>
```

**Parameters:**
- `argv: readonly string[]` — Command and arguments
- `options: ShellOptions` _(optional)_ — cwd, timeoutMs, maxBytes and signal; the effective signal is options.signal combined with currentToolSignal(), tested before the child is spawned

**Returns:** `Promise<ShellResult>` — The process result; for an already-aborted signal a result with code null, no spawn and the optional additive field aborted true; after a kill the result settles within 2 s even when a pipe stays open

**Errors:**
- `ShellResult with spawnError true` when the command cannot be spawned (unchanged)

**Postconditions:**
- When the effective signal is aborted on entry no process is started
- The child is spawned in its own process group on non-win32 and an abort or a time-out kills the whole group, through the shared lifecycle
- After the kill the promise settles within a bounded 2 s with what was captured and the aborted or timedOut flag, destroying the stdout and stderr streams and clearing every timer and listener
- The command stops at whichever comes first, its timeoutMs ceiling or the effective signal

### 2.11 `runShellBytes`

```typescript
runShellBytes(argv: readonly string[], options?: ShellBytesOptions): Promise<ShellBytesResult>
```

**Parameters:**
- `argv: readonly string[]` — Command and arguments
- `options: ShellBytesOptions` _(optional)_ — As today, including signal; the effective signal is combined with currentToolSignal() exactly as in runShell; git_cat_file and ghExec (including its auth probe) run through it

**Returns:** `Promise<ShellBytesResult>` — The byte result as today; after a kill (abort, time-out or stderr overflow) it now settles within 2 s even when a pipe stays open

**Postconditions:**
- Its existing behaviour for a call that is not killed, its aborted-signal check before spawn and its process-group kill are unchanged
- It uses the same shared lifecycle as runShell and spawnManaged

### 2.12 `readGit`

```typescript
readGit(label: string, argv: readonly string[], cwd: string, timeoutMs: number, signal?: AbortSignal): Promise<{ ok: true; r: ShellResult } | { ok: false; failure: ToolResult }>
```

**Parameters:**
- `label: string` — Tool label used in failures
- `argv: readonly string[]` — The git command
- `cwd: string` — Repository path
- `timeoutMs: number` — Ceiling for the command, unchanged
- `signal: AbortSignal` _(optional)_ — New optional parameter passed on to runShell

**Returns:** `Promise<...>` — The result or the failure to return; an aborted call is a rejected failure that says the call was cancelled

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted before or during the command

**Postconditions:**
- Existing callers that pass no signal behave as today

### 2.13 `fail`

```typescript
fail(label: string, r: ShellResult, opts?: { network?: boolean; mutating?: boolean }): ToolResult
```

**Parameters:**
- `label: string` — Tool label
- `r: ShellResult` — The command's result; when r.aborted is true the failure says the call was cancelled
- `opts: { network?: boolean; mutating?: boolean }` _(optional)_ — As today

**Returns:** `ToolResult` — A failed result; an aborted command gives kind rejected with a message that names the cancellation, and a mutating one adds that its outcome is unknown

**Postconditions:**
- Results for commands that were not aborted are unchanged

### 2.14 `assertSafeArg`

```typescript
assertSafeArg(value: string, position: 'ref' | 'path'): void
```

**Parameters:**
- `value: string` — A ref or a path taken from tool input
- `position: 'ref' | 'path'` — Which rule applies

**Returns:** `void` — Throws UnsafeArgError for an unsafe value; withFailureNet turns it into a rejected input failure

**Errors:**
- `UnsafeArgError` when a ref has a NUL or starts with '-', or a path has a NUL

**Postconditions:**
- Unchanged; kept as defence in depth in the four new git tools. It runs inside execute, AFTER the approval step, so it is not the only check: the input schema carries every safety condition

### 2.15 `callTool`

```typescript
callTool<T extends TypedTool>(tool: T, input: Static<T['inputSchema']>, deps: ToolDeps): Promise<TypedToolResult<Static<T['outputSchema']>>>
```

**Parameters:**
- `tool: T extends TypedTool` — A tool definition that keeps its concrete schema types: the exported object of a git tool, or the exported (already wrapped) object of a gh tool or family
- `input: Static<T['inputSchema']>` — Input typed from the concrete input schema
- `deps: ToolDeps` — Caller, signal and approval mode of the call site; caller 'workflow' reaches hooks and approvals as for an agent call

**Returns:** `Promise<TypedToolResult<...>>` — Typed data on success, a ToolFailure on failure

**Errors:**
- `ToolFailure kind rejected` when getTool(tool.id) is undefined, or walking from the registered tool through definitionOf (at most 8 steps) never reaches the object passed; nothing is run

**Preconditions:**
- The tool declares typebox inputSchema and outputSchema

**Postconditions:**
- The registered tool under tool.id is the object passed, or a wrapper copy whose chain of immediate originals reaches it, so the result data was produced by that definition's execute and checked against the schemas its type names
- A tool registered over the same id as a spread copy of the definition with a different execute, inputSchema, outputSchema or approval, or such a copy wrapped by a failure net, is not linked to the object passed and is refused
- The public signature of callTool and TypedTool is unchanged

### 2.16 `definitionOf`

```typescript
definitionOf(registered: Tool): Tool | undefined
```

**Parameters:**
- `registered: Tool` — A tool object as returned by getTool or as passed to a wrapper

**Returns:** `Tool | undefined` — The object the wrapper copy was built from (its immediate original), or undefined when the object was not produced by a wrapper

**Postconditions:**
- Backed by a module-private WeakMap in src/daemon/tools/provenance.ts that only markDefinition writes; an object produced by spreading is not in it

### 2.17 `markDefinition`

```typescript
markDefinition(copy: Tool, original: Tool): void
```

**Parameters:**
- `copy: Tool` — The wrapper copy that will be registered or exported
- `original: Tool` — The object the copy was built from, exactly as passed to the wrapper (the immediate original, even when it is itself a marked copy)

**Returns:** `void` — Records the copy-to-original link

**Postconditions:**
- definitionOf(copy) === original

### 2.18 `isDefinitionOf`

```typescript
isDefinitionOf(registered: Tool, tool: Tool): boolean
```

**Parameters:**
- `registered: Tool` — The tool found in the registry
- `tool: Tool` — The definition the caller passed to callTool

**Returns:** `boolean` — True when registered === tool or the chain registered, definitionOf(registered), definitionOf(definitionOf(registered)), ... reaches tool within 8 steps

**Postconditions:**
- Pure; reads only the provenance table; a cycle or a chain longer than 8 steps ends in false

### 2.19 `withFailureNet`

```typescript
withFailureNet(tool: Tool): Tool
```

**Parameters:**
- `tool: Tool` — A git tool definition

**Returns:** `Tool` — A spread copy whose execute turns an unsafe-argument error and other throws into rejected failures; now also marked as built from the definition passed

**Postconditions:**
- Calls markDefinition(copy, tool); behaviour of the copy is otherwise unchanged and it keeps the definition's schema objects

### 2.20 `withGhFailureNet`

```typescript
withGhFailureNet<T extends TypedTool>(tool: T): T
```

**Parameters:**
- `tool: T extends TypedTool` — The object literal of a gh tool or the family object built by defineGhFamily

**Returns:** `T` — The spread copy with the gh failure net, now also marked as built from the object passed; the legacy gh exports and the defineGhFamily result ARE this copy, and registerGhTools registers them as they are

**Postconditions:**
- Calls markDefinition(copy, tool); behaviour otherwise unchanged; callTool(ghExport, ...) passes because the registered object is the exported object

### 2.21 `registerTool`

```typescript
registerTool(tool: Tool): void
```

**Parameters:**
- `tool: Tool` — A tool to register; an existing id is overwritten with a warning, as today

**Returns:** `void` — Registers the tool

**Postconditions:**
- Behaviour unchanged; callTool's provenance check is what makes an overwrite visible to typed callers

### 2.22 `gitDiffTool`

```typescript
export const gitDiffTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_diff with concrete schema types, so callTool(gitDiffTool, ...) replaces the direct gitDiffTool.execute calls in grounding.ts and changed-files.ts in s9

**Postconditions:**
- Runtime behaviour, id and approval class unchanged; its two shell calls are cancelled through the ambient tool signal without any edit

### 2.23 `gitFetchTool`

```typescript
export const gitFetchTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_fetch with its concrete typebox input and output schema types; no ': Tool' or ': TypedTool' annotation that would widen them

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted before or during the command; the process tree is killed and no further command starts
- `ToolResult failure kind timed-out` when the fixed 120000 ms ceiling passes before the signal aborts

**Postconditions:**
- runShell receives deps.signal explicitly as well as through the ambient signal; the fixed limit stays a ceiling

### 2.24 `gitFetchRefsTool`

```typescript
export const gitFetchRefsTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_fetch_refs with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted

**Postconditions:**
- runShell receives deps.signal explicitly as well as through the ambient signal

### 2.25 `gitRevParseTool`

```typescript
export const gitRevParseTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_rev_parse with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted

**Postconditions:**
- readGit receives deps.signal; the 10000 ms limit stays a ceiling

### 2.26 `gitSymbolicRefTool`

```typescript
export const gitSymbolicRefTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_symbolic_ref with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted

**Postconditions:**
- runShell receives deps.signal

### 2.27 `gitShowTool`

```typescript
export const gitShowTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_show with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted before the header, the diff or the stat command

**Postconditions:**
- The signal is tested before each of the three commands and passed to each; none starts after an abort (the lifecycle's entry check gives the same result through the ambient signal)

### 2.28 `gitLsTreeTool`

```typescript
export const gitLsTreeTool = { /* definition */ } satisfies TypedTool
```

**Returns:** `the inferred definition type` — git_ls_tree with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when the signal is aborted

**Postconditions:**
- readGit receives deps.signal

### 2.29 `gitCatFileTool`

```typescript
export const gitCatFileTool = { /* definition */ } satisfies TypedTool
```

**Parameters:**
- `timeoutMs: number` _(optional)_ — Optional input field; an integer from 1 to 30000 that can only lower the fixed 30000 ms limit

**Returns:** `the inferred definition type` — git_cat_file with concrete schema types

**Errors:**
- `ToolResult failure kind rejected` when timeoutMs is not an integer or is outside 1 to 30000; nothing runs

**Postconditions:**
- Without timeoutMs the limit is 30000 ms as today; with it the limit is the lower value; deps.signal still applies on top (through runShellBytes, which now also settles within 2 s of a kill)
- Output, diagnostic and object-size limit failures keep the messages and kinds they have today

### 2.30 `defineGhFamily`

```typescript
defineGhFamily(spec: { id: string; description: string; ops: readonly OpDef[]; dashSafe?: boolean }): GhFamilyTool
```

**Parameters:**
- `spec: { id; description; ops; dashSafe? }` — Used once more to define the tracker family 'gh_tracker'; it builds the tool but does not register it

**Returns:** `GhFamilyTool` — A TypedTool with its ops, checked at run time (AMD-10); it is the object returned by withGhFailureNet, so it is both the exported and the registered object

**Postconditions:**
- Every op has a fixed endpoint template or GraphQL query (or, for project_create, a fixed gh command), an input schema and an output schema; raw gh api stays excluded and no endpoint is ever an input
- A field two ops share with different patterns makes the definition throw, as with any other field difference
- A paginated op carries a fixed constant jq filter through lit('-q', filter) so gh prints one JSON value per line across all pages; the filter is never an input

### 2.31 `fieldSchema`

```typescript
fieldSchema(spec: FieldSpec): TSchema
```

**Parameters:**
- `spec: FieldSpec` — A field description; FieldSpec gains the optional string property pattern

**Returns:** `TSchema` — The typebox schema of the field; for a 'string' field with a pattern the schema carries it as a JSON-schema pattern

**Preconditions:**
- pattern is a string (not a RegExp) because buildInputSchema compares shared fields with JSON.stringify

**Postconditions:**
- A spec without pattern builds the schema it builds today
- A value outside the pattern is rejected by the executor's input check before any approval request

### 2.32 `parseJsonLines`

```typescript
parseJsonLines(stdout: string): { ok: true; values: unknown[] } | { ok: false; line: number; text: string }
```

**Parameters:**
- `stdout: string` — The captured stdout of a paginated gh command whose fixed jq filter prints one JSON value per line

**Returns:** `{ ok: true; values: unknown[] } | { ok: false; line: number; text: string }` — The parsed values in output order (blank lines skipped; an empty output gives an empty list), or the 1-based number and the first 200 characters of the first line that is not valid JSON

**Postconditions:**
- A new helper in src/daemon/tools/builtins/gh/helpers.ts beside parseJson; pure; the custom builders of comments_list, issues_by_labels and issues_titles use it, and a bad line becomes a rejected failure that names the line number; it never throws

### 2.33 `registerGhTools`

```typescript
registerGhTools(): void
```

**Returns:** `void` — Registers every gh tool and family with registerTool

**Postconditions:**
- Also registers the gh_tracker family, so getTool('gh_tracker') and executeTool('gh_tracker', ...) find it

### 2.34 `registerGitTools`

```typescript
registerGitTools(): void
```

**Returns:** `void` — Registers the git tools, each as register(withFailureNet(tool))

**Postconditions:**
- Iterates gitToolDefinitions (the 34 existing and the four new definitions, same ids and order as today for the existing ones); the exported definitions are the inferred ones, the registered ones are the wrapped, marked copies

## 3. Data model changes

### 3.1 `Effective call signal and ambient tool-signal context` — new

Today deps.signal reaches only the approval broker, and a subprocess is cancellable only where a tool forwards the signal itself: ghExec accepts opts.signal but the legacy gh exports and its 'gh auth status' probe pass none, gitDiffTool passes none, and the approval preview of git_push and git_reset runs git before any ask. s7 adds src/daemon/tools/tool-signal.ts with a module-private node:async_hooks AsyncLocalStorage (already used in src/db/driver-work.ts), runWithToolSignal(signal, fn), runWithoutToolSignal(fn), currentToolSignal() and effectiveToolSignal(signal). executeTool resolves ONE effective signal first (deps.signal combined with the signal already in the context by AbortSignal.any, either alone, or undefined) and uses it for every cancellation check, for the preview (buildApprovalRequest runs inside runWithToolSignal(effective, ...), so the subprocesses an async buildApprovalGate starts are under the signal), for gate().ask(request, effective) (so the broker's cancellation listener exists for a nested gated call that has no signal of its own and the 300000 ms APPROVAL_WAIT_MS no longer outlives the outer call) and for tool.execute (inside runWithToolSignal(effective, ...)). PREVIEW BEHAVIOUR as it is: git_push without a ref calls readBranch (git symbolic-ref --short HEAD, 5000 ms) and git_reset calls currentBranch (the same command) and willNeedForcePush; when such a git command is killed they return { ok: false } or undefined and the builders return a preview object ('(unknown: <kind>)' for the ref, '(detached)' for the branch, a warning line for the force-push read). They do not throw, and buildApprovalRequest's generic-preview fallback applies only to a builder that throws. The call is stopped by the executor's cancellation check right after buildApprovalRequest returns, which returns the 'cancelled' denial before any ask. HOOKS: withHooks awaits runToolHooks on the continuation after execute, and an AsyncLocalStorage context follows continuations, so a nested executeTool entered from an outer tool's execute would run its hooks in the outer context (runWithToolSignal(undefined, fn) leaves a context unchanged). withHooks therefore runs runToolHooks inside runWithoutToolSignal, which runs the work with an explicit undefined store; inside a hook and every continuation of it currentToolSignal() is undefined, so a subprocess a hook starts is not cancelled by an unrelated outer call. With no signal anywhere nothing is stored and behaviour is as today. The context reaches every subprocess started on the async call chain, so no tool needs to forward the signal; the explicit deps.signal passing designed for the refresh tools stays as defence in depth. Scope of the guarantee, stated once: every SUBPROCESS of a registered tool (not of its hooks) is killed with its process group when the effective signal aborts and settles within 2 s; work that is not a subprocess (in-process HTTP, database or file operations) is not interrupted. Invariant it must not break: a call with no signal anywhere behaves as today; a tool that finishes normally is unaffected; hooks behave the same whoever called the tool.

**Call sites:**
- `src/daemon/tools/tool-signal.ts`
- `src/daemon/tools/executor.ts`
- `src/daemon/tools/hooks.ts`
- `src/daemon/tools/approval-policy.ts`
- `src/daemon/approval-broker.ts`
- `src/daemon/tools/shell-helper.ts`
- `src/daemon/tools/builtins/gh/helpers.ts`
- `src/daemon/tools/builtins/gh/project.ts`
- `src/daemon/tools/builtins/git/diff.ts`
- `src/daemon/tools/builtins/git/push.ts`
- `src/daemon/tools/builtins/git/reset.ts`
- `src/daemon/tools/builtins/git/helpers.ts`
- `src/db/driver-work.ts`

### 3.2 `One process lifecycle with a streaming entry (spawnManaged) and the migration of the eight direct-spawn sites` — invariant-change

Registered tools start processes in two ways today: through runShell and runShellBytes, and directly with node:child_process in five files, eight sites: builtins/shell/exec-detached.ts:116 (progress frames from stdout and stderr through deps.send, a maxRuntimeMs timer, 'bash -c' for the command form), builtins/k8s/index.ts:496, :641 and :769, builtins/test/index.ts:442, builtins/ssh/index.ts:237 and :503, and builtins/cloud/aws/logs.ts:104 (follow mode). Each spawns without a process group and attaches its handlers to the live child right after spawn (exec-detached calls onUtf8Data(child.stdout, ...), onUtf8Data(child.stderr, ...), child.on('error') and child.on('close')), kills only the parent (SIGKILL or SIGTERM) from its own abort listener on deps.signal, runs its own timer, and settles on 'close' with no bound; none reads the ambient signal. runShell spawns without a group and settles on 'close'; runShellBytes spawns detached and kills the group but settles only on 'error' and 'close'. s7 puts ONE lifecycle in src/daemon/tools/shell-helper.ts: before spawn it tests the effective signal (options.signal combined with currentToolSignal()); on non-win32 it spawns detached into its own process group (win32 keeps the single-process kill); on abort and on the timeoutMs ceiling (and, for runShellBytes, stderr overflow) it kills the group; if 'close' has not fired within a bounded 2 s after the kill it destroys the stdout and stderr streams, settles with what was captured and the aborted, timedOut or stderrOverflow flag, and clears its timers and listeners; a call that is not killed settles on 'close' as today. runShell and runShellBytes use it, and the new spawnManaged(cmd, args, options) exposes it for streaming tools. Its return is a DISCRIMINATED UNION: { spawned: true, child, settled } when a process was started, and { spawned: false, settled } when the effective signal was already aborted (settled is already resolved with aborted true). The eight direct-spawn sites are migrated to spawnManaged: each first checks 'spawned'; when it is false the site returns the aborted result it builds today for an abort and never reads child; when it is true the site attaches its handlers to the child exactly as before, passes its own limit as timeoutMs (exec-detached passes maxRuntimeMs), and drops its own kill timer and abort listener. A time-out or an abort now kills the group, and the result a site builds for a time-out or an abort keeps its current wording. shell:exec-detached with a command form ('bash -c') therefore ends its children too. An inventory test (child-process-inventory.test.ts) lists every .ts file under src/daemon/tools other than tests and fails when any file except shell-helper.ts imports node:child_process, so a new direct spawn cannot appear unnoticed. Invariant it must not break: a call that is not aborted or timed out produces the same output, progress frames and exit handling as today for each of the eight sites.

**Call sites:**
- `src/daemon/tools/shell-helper.ts`
- `src/daemon/tools/builtins/shell/exec-detached.ts`
- `src/daemon/tools/builtins/k8s/index.ts`
- `src/daemon/tools/builtins/test/index.ts`
- `src/daemon/tools/builtins/ssh/index.ts`
- `src/daemon/tools/builtins/cloud/aws/logs.ts`
- `src/daemon/tools/builtins/git/cat-file.ts`

### 3.3 `Shared refresh deadline signal (how the budget reaches every tool)` — invariant-change

The remaining time of the team policy refresh is carried by ONE AbortSignal, not by a per-call number. The caller (s9: src/workflow/team/policy-refresh.ts and src/workflow/team/git-async.ts, which today share one 10 s deadline and pass deadline.remainingMs() or 'timeout: left' to each call) creates the signal once at the start of the refresh from REFRESH_DEADLINE_MS (combined with its own abort) and passes it as deps.signal to every tool call it makes: git_fetch, git_fetch_refs, git_rev_parse, git_symbolic_ref, git_show, git_ls_tree, git_cat_file, git_ls_remote and git_config. Because every call watches the same signal, what is left shrinks by construction; a running command, and its whole process tree, is killed when it fires (through the explicit signal and the ambient context), the call settles within 2 s, and no later call starts (the executor and the lifecycle check it before starting). Each tool's own fixed limit stays a CEILING: the call stops at whichever comes first. git_cat_file additionally takes the lowerable timeoutMs for a caller that wants a shorter limit on one read. REFRESH_DEADLINE_MS stays 10 s and the lock-lifetime reasoning beside it is unchanged. s7 builds the receiving side and proves it with a test; s9 builds the sending side.

**Call sites:**
- `src/workflow/team/policy-refresh.ts`
- `src/workflow/team/git-async.ts`
- `src/workflow/team/sighting-store.ts`
- `src/daemon/tools/executor.ts`
- `src/daemon/tools/shell-helper.ts`

### 3.4 `callTool definition provenance` — invariant-change

callTool (src/daemon/tools/call-tool.ts) runs executeTool(tool.id, ...) and casts result.data to the passed definition's output type, while registerTool overwrites an id with a warning. docs/plans/tool-registry.md records that, before s7, callTool must check that the registered tool under tool.id is the definition passed. The two families register differently. GIT: each file exports a plain definition and git/index.ts registers register(withFailureNet(tool)), a spread copy of the exported object. GH: withGhFailureNet is applied at the declaration ('export const ghProjectListTool = withGhFailureNet({...})', and defineGhFamily returns withGhFailureNet(...)), so the exported object IS the registered object and is already the wrapped copy; the inner literal is never exported. A rule that compares only outputSchema references is too weak ('{ ...original, execute: other }' keeps the same outputSchema and would pass); a rule that compares the registered tool's recorded original with the passed object would refuse every gh export. s7 adds src/daemon/tools/provenance.ts with a module-private WeakMap from a wrapper copy to the object it was built from, written ONLY by markDefinition(copy, original), read by definitionOf(registered), and the pure function isDefinitionOf(registered, tool). withFailureNet and withGhFailureNet call markDefinition(copy, tool) with the object exactly as passed (the IMMEDIATE original). isDefinitionOf is true when registered === tool, or when walking registered, definitionOf(registered), definitionOf(definitionOf(registered)), ... (at most 8 steps, so a cycle ends) reaches tool. callTool calls getTool(tool.id); if that is undefined, or isDefinitionOf(registered, tool) is false, it returns a rejected failure that names the id and runs nothing. Results: a git definition (registered copy marked from it) passes in one step; a legacy gh export or a defineGhFamily result (the registered object is the exported object) passes at once; an object wrapped twice passes for either level; a tool registered with a plain registerTool(definition) passes; a replacement made by spreading ('{ ...original, execute: other }'), with or without changed schemas or approval, is an unmarked new object whose chain never reaches the passed object and is refused, and so is that replacement wrapped by a failure net. A property or symbol on the definition is deliberately not used as the marker because a spread copies enumerable own and symbol properties. The public signature of callTool and TypedTool does not change. Invariant it must not break: callTool(tool) still works for every tool registered by registerGitTools and registerGhTools, whether passed the git definition or the exported gh object.

**Call sites:**
- `src/daemon/tools/call-tool.ts`
- `src/daemon/tools/provenance.ts`
- `src/daemon/tools/registry.ts`
- `src/daemon/tools/builtins/git/helpers.ts`
- `src/daemon/tools/builtins/git/index.ts`
- `src/daemon/tools/builtins/gh/helpers.ts`
- `src/daemon/tools/builtins/gh/op-table.ts`
- `src/daemon/tools/builtins/gh/project.ts`
- `src/daemon/tools/builtins/gh/index.ts`
- `docs/plans/tool-registry.md`

### 3.5 `tools.call stream method` — new

Protocol. tools.call is a STREAM method, because an RpcHandler receives only (params, context) with no send and no wire request id, while a StreamHandler receives (params, send, signal, context) and the server aborts its signal when the client closes the stream socket. Request params: { toolId: string, input: object, repoPath: string, caller: 'agent' | 'daemon' | 'workflow', approvalMode?: 'manual' | 'edit-auto' | 'auto' }. The handler validates the params (a missing or wrong field, a caller outside the enum, a non-object input) and answers with one 'error' frame { code: 'invalid-params', message } and closes. Otherwise it builds ToolDeps: sessionId is the string 'tools-call:' followed by context.connectionIdentity (or 'tools-call' when the handler has no context), following the precedent of a fixed daemon-side sessionId such as 'code-review' in src/workflow/runners/build/changed-files.ts; TrustedRpcContext and TrustedConnectionSession are not changed, and the git and gh tools keep no per-session state. repoPath comes from the params, send is the stream's own, requestId is a daemon-side monotonic counter, signal is the stream signal, caller and approvalMode come from the validated params, and connectionExecution is taken only from the trusted context, never from params. It runs executeTool and sends exactly one 'done' frame { result: ToolResult } (ToolResult includes failure and hookFailures). An unknown tool id is that same single response: the 'done' frame carries a failed ToolResult of kind rejected; it is never an IPC error. Tool progress frames are whatever the tool sends through deps.send. Cancellation contract (true for every subprocess of every registered tool, through the effective call signal and the one process lifecycle): when the client closes the stream the server aborts the signal; a pending approval, including a nested call's, resolves 'cancelled'; a tool not yet started does not start; every subprocess started in the approval preview or in execute, by a tool through the shell helpers or through spawnManaged, including secondary commands and probes, is killed with its process group and the call settles within the 2 s bound; nothing is spawned after the abort; work that is not a subprocess is not interrupted. Ownership: the call belongs to the stream that carries it; approvals are not tied to that connection: the daemon-wide broker pushes 'gate' frames to every client with an open approval.subscribe stream and answers arrive on approval.answer, so a client that wants approvals must hold an approval.subscribe stream; with none open a destructive call is denied no-client and a common call asks only under manual or edit-auto. Registered on the main thread in streamHandlers; worker threads have no registry. Change sites: src/daemon/handler-runtime.ts (streamHandlers entry), src/daemon/threads/method-class.ts (['tools.call', 'session', true]), src/shared/types.ts (ToolsCallParams and ToolsCallDone), a new src/daemon/tools/call-handler.ts, tests; src/daemon/server.ts, src/daemon/request-context.ts and src/shared/ipc-client.ts are unchanged because the generic stream path is used.

**Call sites:**
- `src/daemon/handler-runtime.ts`
- `src/daemon/threads/method-class.ts`
- `src/shared/types.ts`
- `src/daemon/server.ts`
- `src/daemon/request-context.ts`
- `src/daemon/approval.ts`
- `src/shared/ipc-client.ts`
- `src/workflow/runners/build/changed-files.ts`

### 3.6 `FieldSpec pattern (additive)` — field-add

FieldSpec (src/daemon/tools/builtins/gh/op-table.ts) has kind, values, minimum, description and empty only, and fieldSchema's string branch returns Type.String with minLength 1 (unless empty) and the description, so an op field cannot carry a pattern. s7 adds an optional string property pattern to FieldSpec. fieldSchema's 'string' branch passes it to Type.String({ pattern, ...}) (the 'expr' branch ignores it). A helper field.name(description?) returns { kind: 'string', pattern: NAME_PATTERN } where NAME_PATTERN is the string '^(?!\\.{1,2}$)[A-Za-z0-9._-]+$' (an owner, repo, org or login; it refuses '.', '..', '/', '?', '#', '%', whitespace and non-ASCII). The pattern is a string, not a RegExp, because buildInputSchema compares a field two ops share with JSON.stringify of the spec minus description and values, which would hide a RegExp ({}) and now includes the pattern: two ops that give a shared field different patterns make defineGhFamily throw 'field x is declared differently by two ops'. A field in the flat input schema is Type.Optional unless every op requires it, so the pattern applies whenever the field is present. Because the executor checks the input schema before it builds the approval request, a bad owner, repo, org or login is a rejected input failure and never reaches an approval prompt; a refuse check inside execute would run after the approval step and is not used for this. Existing ops declare no pattern and build the schema they build today. Change sites: src/daemon/tools/builtins/gh/op-table.ts and its tests.

**Call sites:**
- `src/daemon/tools/builtins/gh/op-table.ts`
- `src/daemon/tools/executor.ts`

### 3.7 `Op-table argument variants path, kv and qs (internal, additive)` — field-add

OpDef.command is a readonly string[] of fixed gh words and Arg has the variants pos, spread, last, flag and lit, so buildArgv cannot build one positional from several input fields, percent-encode a value, emit 'key=value' pairs or supply a constant query value; the gh_tracker ops need all of these. s7 adds three INTERNAL Arg variants to src/daemon/tools/builtins/gh/op-table.ts and teaches buildArgv about them; existing ops use none and are unchanged. (a) { path: readonly (string | { field: string })[] }: builds ONE positional from fixed text and field values, each field value passed through encodeURIComponent (so '/', '?', '#', '%' and Unicode cannot change the path), for example ['repos/', {field:'owner'}, '/', {field:'repo'}, '/issues/', {field:'number'}]. (b) { kv: string, flag: '-f' | '-F', field: string, repeat?: boolean }: emits the flag then 'key=<value>' (a list field with repeat true emits one flag-and-pair per member, the key being for example 'labels[]'); a field that is absent emits nothing. (c) { qs: readonly QsEntry[] } where QsEntry is one of { key: string, value: string } (a FIXED CONSTANT, emitted as given, never from input) or { key: string, field: string, optional?: boolean, join?: ',' } (a value from an input field: a string or integer is encodeURIComponent'ed; a list field requires join ',' and emits its members each encoded and joined by a literal ','). The qs variant is applied to the path positional that precedes it: entries are appended in the order declared as '?key=value&key=value'; an optional field entry that is absent is skipped; a required field entry that is absent is an input error caught by the op's required list before execute; when no entry remains nothing is appended (no bare '?'). A constant is the only way a fixed query value such as per_page=100 or state=all enters the argv, so there is no normalization or defaulting stage. GraphQL ops pass a FIXED query through lit (for example 'api','graphql','-f','query=<fixed text>') and the variables through kv. PAGINATION FRAMING: the existing lit variant carries a FIXED jq filter as the last two argv entries ('-q', '<filter>') of the three paginated ops; gh api --paginate prints one JSON array per page, which together are not one JSON document, so the filter makes gh print one JSON value per line across all pages, and the op's output builder reads stdout with parseJsonLines (blank lines skipped, an empty output is an empty list, a bad line is a rejected failure that names its line number). The filter is a constant of the op definition and never comes from input. owner and repo fields are field.name (see FieldSpec pattern) and number fields are positive integers, so no endpoint is ever an input and no value can alter the path. Outputs use the existing 'custom' out kind with a builder that parses the JSON (or the x-oauth-scopes header for token_scopes) into the declared shape. Exact argv produced (the fixtures; every one ends with the '-q' pair shown in the tracker family entity): comments_list with owner o, repo r, number 5: 'gh api --paginate repos/o/r/issues/5/comments?per_page=100 -q <comments filter>' and with since '2026-10-26T00:00:00Z' (colons encoded): 'repos/o/r/issues/5/comments?per_page=100&since=2026-10-26T00%3A00%3A00Z'; issues_by_labels with labels ['a','b c']: 'repos/o/r/issues?state=all&per_page=100&labels=a,b%20c'; issues_titles: 'repos/o/r/issues?state=all&per_page=100'. Change sites: src/daemon/tools/builtins/gh/op-table.ts, src/daemon/tools/builtins/gh/helpers.ts (parseJsonLines) and their tests.

**Call sites:**
- `src/daemon/tools/builtins/gh/op-table.ts`
- `src/daemon/tools/builtins/gh/helpers.ts`
- `src/workflow/tracker/github.ts`

### 3.8 `gh tracker tool family 'gh_tracker'` — new

One op-table family defined with defineGhFamily in a new file src/daemon/tools/builtins/gh/tracker.ts, using the FieldSpec pattern and the path, kv and qs variants, and REGISTERED by adding its import and registerTool(ghTrackerTool) to registerGhTools in src/daemon/tools/builtins/gh/index.ts (defineGhFamily does not register; its result is already the wrapped object, as for every other gh export). Every op declares input and output schemas; owner, repo, org and login are field.name fields; numbers are positive integers; the tool returns what the API returns and the wrapper-level transformations listed last stay for s10. PAGINATED OPS (4, 6 and 7 below) each carry --paginate and a FIXED constant jq filter through lit('-q', filter) placed after the path positional, so gh prints one JSON value per line across all pages, exactly as the existing wrappers in src/workflow/tracker/github.ts do (lines 284, 351 and 362); the builder reads the output with parseJsonLines, keeps API order, and a line that does not parse gives a rejected failure that names the line number. NEW OPS (op name: argv after 'gh api'; input; output; class, limit; wrapper replaced): (1) issue_create_typed: -X POST, path repos/{owner}/{repo}/issues, kv -f title, -f body, repeated -f labels[], -f type when given; {owner, repo, title, body, labels?, type?}; {number, id}; common, 60 s; ghCreateIssueTyped (a command-exit rejection returns a rejected failure whose failure.original holds the API text, capped at 4000 characters by the diagnostic seam, so s10 can fall back to the untyped call and compute typed). (2) sub_issue_link: -X POST, path repos/{owner}/{repo}/issues/{number}/sub_issues, kv -F sub_issue_id; {owner, repo, number, subIssueId}; {linked: true}; common, 30 s; ghLinkSubIssue. (3) issue_id: path repos/{owner}/{repo}/issues/{number}; {owner, repo, number}; {id}; none, 30 s; ghGetIssueId. (4) comments_list: --paginate, path repos/{owner}/{repo}/issues/{number}/comments with qs [constant per_page=100, optional since], then -q '.[] | {id, author: .user.login, text: .body, at: .created_at, url: .html_url}'; {owner, repo, number, since?}; {comments: [{id, author, text, at, url?}]} in API order across all pages; none, 60 s; ghListIssueComments. (5) comment_post: -X POST, path repos/{owner}/{repo}/issues/{number}/comments, kv -f body; {owner, repo, number, body}; {id}; common, 30 s; ghPostCommentReturningId (the existing gh_issue_comment returns no id). (6) issues_by_labels: --paginate, path repos/{owner}/{repo}/issues with qs [constant state=all, constant per_page=100, labels joined by ','], then -q '.[] | select(.pull_request | not) | .number' (pull requests, which the issues endpoint also returns, are excluded by the filter); {owner, repo, labels}; {numbers}; none, 60 s; ghListIssuesByLabelsStrict. (7) issues_titles: --paginate, path repos/{owner}/{repo}/issues with qs [constant state=all, constant per_page=100], then -q '.[] | select(.pull_request | not) | {number, title}'; {owner, repo}; {issues: [{number, title}]}; none, 60 s; ghListIssuesByTitleTokenStrict. (8) milestone_create: -X POST, path repos/{owner}/{repo}/milestones, kv -f title; {owner, repo, title}; {number}; common, 30 s; ghEnsureMilestone (error swallowing stays in s10). (9) token_scopes: -i, fixed literal /user, reads the x-oauth-scopes header; {}; {scopes}; none, 30 s; ghTokenScopes. (10) org_issue_types_list: graphql with a fixed query organization(login:$owner).issueTypes(first:25){nodes{name}} and kv -f owner; {org}; {names}; none, 30 s; ghListOrgIssueTypes. (11) org_issue_type_create: -X POST, path orgs/{org}/issue-types, kv -f name, -F is_enabled (fixed literal true), -f color, -f description; {org, name, color, description}; {created: true}; common, 30 s; ghCreateOrgIssueType. (12) current_login: fixed literal user, field login; {}; {login}; none, 30 s; ghCurrentLogin. (13) user_by_host: a plain val('--hostname','host') flag, path users/{login}; {host, login}; {login, node_id}; none, 30 s; the lookup in src/understanding/identity.ts (the host and account loop stays in s9). (14) tasks_query: graphql with the fixed search query, kv -F first and -f q, and -f after when given; {q, first, after?}; {issueCount?, pageInfo: {hasNextPage, endCursor?}, nodes}; none, 60 s; queryTasks. It preserves the current behaviour: when the API gives no pageInfo the op returns pageInfo { hasNextPage: false } and omits endCursor; when the API gives hasNextPage false with a non-empty endCursor it returns both; issueCount is returned only when it is a number; the search-string building, the page-size clamp, the mapping of nodes to tasks and total stay in s10. (15) project_create: NOT a gh api call; command ['project','create'] with args val('--title','title'), val('--owner','owner'), lit('--format','json'); input {owner (field.name), title}; output {number: integer, url: string} built by a custom builder that parses the JSON the command prints and, when number is not numeric, returns a rejected failure (the wrapper returns null in that case); common, 60 s (the limit of the existing create op); wrapper replaced: ghCreateProject. It is needed because the existing gh_project_manage op 'create' has out kind 'mutation' and returns only { op, ok, target, message }, which carries neither number nor url. MAPPED TO EXISTING OPS (closed table; no op is added later): ghCreateLabel to gh_label create with force; ghCreateIssue to gh_issue_create; ghGetIssueBody and ghGetIssueState to gh_issue_view with json fields body and state,labels; ghEditIssueBody and ghAttachMilestone to gh_issue_edit; ghComment to gh_issue_comment; ghCloseIssue to gh_issue_close; ghFindIssueByLabels(+Strict) and ghListRepoIssueUrls to gh_issue_list; ghFindProjectByTitle to gh_project_list with limit 200 (its data.projects rows carry number, title, url and closed, which is all the wrapper reads); ghAddProjectSingleSelectField to gh_project_manage field-create with dataType SINGLE_SELECT and singleSelectOptions (the wrapper reads only success); ghAddProjectItem to the legacy tool gh:project:item-add with url and owner (the wrapper reads only success). The recorded mapped-ops test checks each mapping against the fields its wrapper reads; a mapping that fails the test is a defect in this design to raise, not a gap to fill with a new op during the build. STAYING IN s10: owner/repo#N ref building and the strict ref regex, the typed-issue fallback and the typed flag, the comment sort, the title-token match, the swallowing of errors by the boolean wrappers, the mapping of failures to GhCommandError, and the task query string and task mapping. Raw gh api stays excluded from the gh coverage table, which gets a note that this family is s7's amendment (the user's decision of 2026-10-26).

**Call sites:**
- `src/workflow/tracker/github.ts`
- `src/workflow/tracker/setup.ts`
- `src/understanding/identity.ts`
- `src/daemon/tools/builtins/gh/index.ts`
- `src/daemon/tools/builtins/gh/coverage.ts`
- `src/daemon/tools/builtins/gh/issue.ts`
- `src/daemon/tools/builtins/gh/manage.ts`
- `src/daemon/tools/builtins/gh/project.ts`
- `src/daemon/tools/builtins/gh/schemas.ts`

### 3.9 `OpDef diagnostic field and the gh failure path` — field-add

In ghFailureOf (src/daemon/tools/builtins/gh/helpers.ts) the spawn-error branch already returns original: o.stderr.trim(); for ordinary command-exit failures (missing-signin, unreachable, rejected) failure.original is set only from probe text, so an HTTP 422 text stays in failure.message; defineGhFamily forwards that failure before any output builder runs. The executor does NOT truncate a tool's own failure: executeTool returns a failed result from tool.execute unchanged ('if (!result.success) return result;'), and only the failed() helper it uses for its own failures slices failure.original to ORIGINAL_MAX_CHARS (4000). So the cap is applied by the seam itself. s7 adds an optional OpDef field (diagnostic: 'stderr') that defineGhFamily passes to ghFailureOf; when it is set, ghFailureOf puts the trimmed stderr (or, when stderr is empty, stdout) of a command-exit failure in failure.original, cut to FAILURE_ORIGINAL_MAX_CHARS, a constant defined once in gh/helpers.ts with the value 4000 and asserted equal to the executor's ORIGINAL_MAX_CHARS by a test. The spawn-error branch is unchanged. The cap and the text apply only to ops that opt in (issue_create_typed first); every other gh tool is unchanged, so no existing failure object changes. Change sites: src/daemon/tools/builtins/gh/op-table.ts and src/daemon/tools/builtins/gh/helpers.ts. Invariant it must not break: the failure objects of existing gh tools, including the spawn-error branch, shown by the s5 test files.

**Call sites:**
- `src/daemon/tools/builtins/gh/op-table.ts`
- `src/daemon/tools/builtins/gh/helpers.ts`
- `src/daemon/tools/executor.ts`

### 3.10 `git tools git_config, git_ls_remote, git_update_ref, git_rm (per-tool contracts)` — new

Four typed git tools, each declared with satisfies TypedTool with concrete typebox input and output schemas (additionalProperties false), listed in gitToolDefinitions and so registered by registerGitTools as register(withFailureNet(tool)), passing deps.signal to runShell. EVERY SAFETY CONDITION LIVES IN THE INPUT SCHEMA: executeTool checks the input schema before it builds the approval request, while assertSafeArg runs inside execute after the approval step, so an unsafe value such as one containing a NUL reaches the destructive approval gate unless the schema refuses it. assertSafeArg stays as defence in depth. The schema patterns equal the callers' existing rules, so they refuse nothing a caller accepts today. SAFE_REF is exactly the predicate isSafeRefName (src/workflow/team/sighting-store.ts:60) written as one Unicode-aware pattern, not an ASCII class: it accepts any script, '+', '#' and other valid punctuation and rejects an empty name, a leading '-' or '/', whitespace and control characters (including NUL), the characters ~ ^ : ? * [ and backslash, '..', '@{', '//', the name '@', and a trailing '/', '.' or '.lock'. SAFE_PATH is only 'no NUL': a path may start with '-' because the argv puts '--' before the paths (assertSafeArg and handoff.ts do the same). An equivalence test runs the SAFE_REF pattern and isSafeRefName over one corpus. A missing, wrongly typed or unsafe field is a rejected input failure produced by the executor before any approval. cwd is optional everywhere and defaults to process.cwd() as in the other git tools. CONTRACTS. (1) git_config: input {cwd?, key} where key matches ^[A-Za-z][A-Za-z0-9-]*(\\.[A-Za-z0-9_-]+)+$; argv ['git','config','--get',key]; output {found: boolean, value?: string}; exit 0 gives {found:true, value} with the trailing newline trimmed (an empty value is allowed); exit 1 with empty stdout is a SUCCESS {found:false} (identity.ts treats it as 'no email'); any other exit code, a cut output or a spawn error is a failure (kind from failureKind; identity.ts maps these to 'git identity unavailable'); ceiling 5000 ms; class none; callers: companion/header.ts reads user.name and understanding/identity.ts reads user.email. (2) git_ls_remote: input {cwd?, remote (SAFE_REF), heads?: boolean (default false), symref?: boolean (default false), patterns?: string[] (each SAFE_REF, default [], at most 8)}; argv ['git','ls-remote', '--symref' when symref, '--heads' when heads, remote, ...patterns]; output {entries: [{objectId, ref}], symrefs: [{ref, target}]} parsed from the output, where a line 'ref: refs/heads/main<TAB>HEAD' becomes the symref {ref:'HEAD', target:'refs/heads/main'} and a line '<sha><TAB><ref>' becomes an entry; an empty answer is a SUCCESS with empty lists (handoff.ts treats empty output as 'branch absent'); a non-zero exit is a failure classified with network true (an unreachable remote is 'unreachable'; git's text is in failure.message); ceiling 30000 ms; class none; callers: branch-resolution.ts uses symref true with patterns ['HEAD'] and heads true with patterns ['refs/heads/<name>']; handoff.ts uses heads true with patterns ['refs/heads/<branch>']. (3) git_update_ref: input {cwd?, ref (SAFE_REF and starting with 'refs/'), delete (the required constant true: only deletion is supported)}; argv ['git','update-ref','-d',ref]; output {ref, deleted: true}; git exits 0 when the ref is already absent, which is a success; any other exit is a failure with mutating set (a time-out says the outcome is unknown); ceiling 10000 ms; class destructive (always asks, but only for input that passed the schema); callers: team/handoff.ts deletes refs/heads/<tmpBranch> and a temporary ref. (4) git_rm: input {cwd?, paths: string[] (1 to 200 items, each SAFE_PATH), quiet?: boolean (default true)}; argv ['git','rm', '-q' when quiet, '--ignore-unmatch','--', ...paths]; output {paths: string[]} (the paths asked for); a path that matches nothing is a success because of --ignore-unmatch; any non-zero exit is a failure with mutating set; ceiling 30000 ms; class destructive (always asks, only after the schema); caller: team/handoff.ts runs it with cwd set to a worktree directory and one path. The s8 coverage table marks the four as built by s7 and s7's dependsOn stays s1 to s5. git_ls_remote and git_config are on the refresh's path and take the shared deadline signal like the other refresh tools.

**Call sites:**
- `src/workflow/artifacts/companion/header.ts`
- `src/understanding/identity.ts`
- `src/workflow/team/branch-resolution.ts`
- `src/workflow/team/handoff.ts`
- `src/workflow/team/sighting-store.ts`
- `src/daemon/tools/executor.ts`
- `src/daemon/tools/builtins/git/coverage.ts`
- `src/daemon/tools/builtins/git/definitions.ts`
- `src/daemon/tools/builtins/git/helpers.ts`

### 3.11 `gitToolDefinitions: one typed list of all git definitions, with a mandatory inventory test` — new

src/daemon/tools/builtins/git/index.ts imports the 34 definitions one by one and exports only registerGitTools, so no definition list exists for a fixture or a consumer to import. s7 adds src/daemon/tools/builtins/git/definitions.ts, which exports gitToolDefinitions: all git tool definitions (the 34 existing and git_config, git_ls_remote, git_update_ref and git_rm) as one list declared 'as const satisfies readonly TypedTool[]'. registerGitTools iterates this list and registers register(withFailureNet(tool)) for each (the existing tools keep their ids and their order), and src/daemon/tools/builtins/git/index.ts re-exports the list. The type fixture, the registration test and the s9 and s10 consumers import gitToolDefinitions directly. The satisfies clause checks only the elements that are IN the list; a definition declared in its own file and left out of the list still compiles, so the compiler does NOT guarantee that the list is complete and this design makes no such claim. Completeness is enforced by a mandatory inventory test (typed-git-tools.test.ts): it lists the .ts files of src/daemon/tools/builtins/git other than index, definitions, helpers, coverage and the tests, imports each, collects every export whose value has a string id and an execute function, and requires that set to equal gitToolDefinitions in both directions (a tool exported but not listed fails; a listed object not exported by a tool file fails), requires the ids to be unique, and requires the ids registered by registerGitTools to equal the ids of the list. The individual named exports (gitDiffTool and the rest) stay, and callTool(gitDiffTool, ...) passes the provenance check because the registered copy is marked as built from that exported object.

**Call sites:**
- `src/daemon/tools/builtins/git/index.ts`
- `src/daemon/tools/builtins/git/definitions.ts`
- `src/workflow/code-review/grounding.ts`
- `src/workflow/runners/build/changed-files.ts`

### 3.12 `ForbiddenSpawnScan` — new

A script run in the build chain after tsc, beside scripts/check-model-definitions.mjs. It reads every non-test file under src outside src/daemon/tools with the TypeScript compiler and REPORTS each place that runs git, gh or acli (execFile, execFileSync, spawn, exec, runShell or runShellBytes with one of them first, a call into a wrapper module, an injected exec seam) and each direct call of a builtin tool's execute outside the executor (for example gitDiffTool.execute in src/workflow/code-review/grounding.ts and src/workflow/runners/build/changed-files.ts). It prints file and line and exits 0 in report mode; a flag switches it to failing mode, which s10 turns on. It carries one positive-control fixture per form. Exemptions written in the script with reasons: the daemon self-update (src/cli/services/maintenance.ts, src/daemon/installed-commit.ts) and src/indexer/index.ts only. It covers code outside src/daemon/tools; the child_process inventory test covers the inside.

**Call sites:**
- `package.json`
- `scripts/check-model-definitions.mjs`
- `src/cli/services/maintenance.ts`
- `src/daemon/installed-commit.ts`
- `src/indexer/index.ts`
- `src/workflow/code-review/grounding.ts`
- `src/workflow/runners/build/changed-files.ts`

### 3.13 `All 34 git tool definitions and the compile-time type check` — field-modify

There are 34 git tool files that export their definition as ': Tool', and every one declares a typebox outputSchema. s7 changes ALL 34 (a mechanical, declaration-only edit) to inferred objects checked with satisfies TypedTool, so Static<T['inputSchema']> and Static<T['outputSchema']> stay concrete for callTool; this covers gitDiffTool, which grounding.ts and changed-files.ts call directly today, and every tool the s9 and s10 replacement tables may name. registerGitTools wraps them with withFailureNet at registration, so the registered tool is a marked spread copy and the exported definition keeps its concrete type. Their runtime behaviour, ids and approval classes are unchanged (k7). The root tsconfig.json adds '**/__type-tests__/**' to its exclude list so the normal build neither compiles nor emits the fixtures. A dedicated tsconfig.typecheck.json extends it with noEmit true, an include of the fixtures under src/daemon/tools/__type-tests__ and an exclude that does not drop them, and an npm script typecheck:tools, added to the build chain after tsc. The fixture imports gitToolDefinitions and checks it against 'readonly TypedTool[]', and has positive and negative callTool fixtures (valid input, invalid input and a misspelt result field, using @ts-expect-error for the invalid ones) for gitDiffTool and the refresh tools. Invariant it must not break: today's behaviour of each tool, shown by the s4 and s5 test files that already run them.

**Call sites:**
- `src/daemon/tools/builtins/git/diff.ts`
- `src/daemon/tools/builtins/git/fetch.ts`
- `src/daemon/tools/builtins/git/fetch-refs.ts`
- `src/daemon/tools/builtins/git/rev-parse.ts`
- `src/daemon/tools/builtins/git/symbolic-ref.ts`
- `src/daemon/tools/builtins/git/show.ts`
- `src/daemon/tools/builtins/git/ls-tree.ts`
- `src/daemon/tools/builtins/git/cat-file.ts`
- `src/daemon/tools/builtins/git/index.ts`
- `src/workflow/code-review/grounding.ts`
- `src/workflow/runners/build/changed-files.ts`
- `src/daemon/tools/call-tool.ts`
- `tsconfig.json`
- `package.json`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Hooks run inside executeTool for every caller, so a rule registered on a tool runs for a workflow call to it; they run through runWithoutToolSignal, outside every tool call's signal context (a nested call's hooks included), and only after a checked success. s7 registers no production hook; its tests register one and call the tool through callTool with caller 'workflow' and through tools.call. |
| `sc2` | consumes | The git tools keep concrete typebox schema types through satisfies TypedTool; the gh tracker family stays run-time checked per AMD-10. callTool gains the registered-definition provenance check the plan records for s7 (a side table written only by the two failure-net wrappers, walked from the registered tool to the passed object), with an unchanged signature, and TypedTool is unchanged. |
| `sc4` | consumes | A call follows shouldAsk: destructive always asks; common asks when the effective mode (deps.approvalMode, else tools.commonApproval, default auto) is manual or edit-auto. tools.call passes the validated caller and the optional approvalMode into ToolDeps; approvals travel over approval.subscribe and approval.answer as built by s3. git_update_ref and git_rm are destructive and always ask, and gh_tracker owner and repo names are pattern-checked, both only after the executor's existing input-schema check has passed. No approval rule is added and the pipeline order is unchanged; the executor resolves one effective signal, runs the preview and execute under it, passes it to the broker's ask so a pending approval of a nested call is cancelled, and returns denial 'cancelled', a value sc5 already defines. ToolDeps is not changed. |
| `sc5` | consumes | Failures use the existing kinds; an aborted call before execute is failed('denied') with denial 'cancelled'; a process stopped by the signal is a rejected failure that says it was cancelled, a limit that passes is timed-out, a callTool provenance refusal is a rejected failure, and a paginated tracker line that does not parse is a rejected failure naming the line; failure.original is an existing optional field, capped at 4000 characters by the gh diagnostic seam for the ops that opt in. No kind is added. |

## 5. Error paths

**Error cases**

- **The effective signal is already aborted, or is aborted while the approval preview is built, after the request is built and before the ask, or after the approval answer and before execute** (recoverable)
  - Detection: executeTool resolves the effective signal first and tests it before buildApprovalRequest, after it returns, before gate().ask and immediately before tool.execute
  - Response: Returns failed('denied') with denial 'cancelled'; the tool is not started and no later approval answer is acted on
  - User impact: The stage that made the call fails with the cancellation reported
- **A tools.call stream closes (or the shared refresh deadline fires) while the approval PREVIEW of git_push (no ref given) or git_reset is running git** (recoverable)
  - Detection: buildApprovalRequest runs inside runWithToolSignal(effective, ...), so the preview's runShell calls (readBranch and currentBranch run 'git symbolic-ref --short HEAD', and willNeedForcePush runs its own git read) see the ambient signal and the lifecycle's abort listener fires
  - Response: The preview's process group is killed and settles within 2 s; the helper returns { ok: false } or undefined and the builder RETURNS a preview ('(unknown: <kind>)' for the ref in git_push, '(detached)' and a warning line in git_reset); it does not throw, so the generic preview is not used; the executor's cancellation check right after buildApprovalRequest returns the 'cancelled' denial before any ask
  - User impact: No preview subprocess outlives a cancelled call and no approval is requested for it
- **A nested executeTool call to a destructive or common-under-manual tool has no signal of its own and is waiting for approval when the outer call is aborted** (recoverable)
  - Detection: The executor resolves the effective signal as the signal already in the context combined with deps.signal and passes it to gate().ask(request, effective), so the broker installs its cancellation listener on it
  - Response: The pending approval resolves 'cancelled' at once instead of waiting for the 300000 ms approval timeout, and the nested call returns the cancelled denial
  - User impact: A nested call cannot outlive the outer call's cancellation while waiting for approval
- **A nested executeTool, entered from inside an outer tool's execute, finishes its tool and runs its hooks while the outer call's signal is still live or aborts during the hook** (recoverable)
  - Detection: withHooks runs runToolHooks through runWithoutToolSignal, which runs the hooks with an explicit undefined store; currentToolSignal() is undefined inside the hook and in every continuation of it, so the inherited outer context is not seen
  - Response: A subprocess the hook starts is not killed by the outer call's abort and runs under its own limits; the nested result still returns normally
  - User impact: A hook behaves the same whoever called the tool; an unrelated outer abort cannot cancel it
- **A tools.call stream closes (or the shared refresh deadline fires) while a LEGACY tool that does not forward deps.signal is running: git_diff, a legacy gh export such as ghProjectListTool, or a multi-command tool** (recoverable)
  - Detection: executeTool ran tool.execute inside runWithToolSignal, so currentToolSignal() is the effective signal; the shared lifecycle's abort listener on the effective signal fires for every subprocess the tool has running
  - Response: The lifecycle kills each subprocess's process group and settles within 2 s with the aborted flag; the tool returns the rejected failure its own error handling builds for an aborted command; no later subprocess of that tool starts because each one tests the effective signal before spawn
  - User impact: A disconnect or deadline stops the work instead of leaving processes running until their own limit (up to 600 s for gh_repo_clone)
- **The stream closes while ghExec's ambiguous-error 'gh auth status' probe is running** (recoverable)
  - Detection: The probe's runShellBytes call runs inside the same async call chain, so its effective signal includes the ambient tool signal even though the call passes no signal option
  - Response: The probe's process group is killed and its call settles within 2 s; ghExec treats a probe it could not complete as no probe text and the tool returns its failure
  - User impact: No sign-in probe outlives a cancelled call
- **A tool that spawns its own process (shell:exec-detached including its 'bash -c' command form, a k8s tool, the test runner, an ssh tool, aws logs tail in follow mode) starts with an effective signal that is already aborted** (recoverable)
  - Detection: spawnManaged returns the union branch { spawned: false, settled } because the effective signal is aborted on entry; the site checks 'spawned' before it reads child
  - Response: Nothing is spawned and no handler is attached; the site returns the aborted result it builds today for an abort, with no progress frames
  - User impact: No process starts after a deadline or a cancel and no site touches a missing child
- **The stream closes while a tool that spawns its own process is running** (recoverable)
  - Detection: The site was migrated to spawnManaged ({ spawned: true, child, settled }), whose effective signal is options.signal combined with currentToolSignal(); the abort listener fires
  - Response: The whole process group is killed (not only the parent), settled resolves within 2 s, the tool builds its usual aborted result, and progress frames stop; a descendant that holds the stdout or stderr pipe cannot keep the call open past the bound
  - User impact: A streaming tool stops with its children instead of leaving them running
- **A tool that spawns its own process is time-limited by its own ceiling (maxRuntimeMs of exec-detached, a test or ssh time-out) and the ceiling passes** (recoverable)
  - Detection: spawnManaged's timeoutMs timer fires and sets timedOut
  - Response: The process group is killed, settled resolves with timedOut true within 2 s, and the tool builds the time-out result it builds today
  - User impact: A time-out now ends the children too; the message is unchanged
- **A new file under src/daemon/tools imports node:child_process** (recoverable)
  - Detection: The inventory test (child-process-inventory.test.ts) lists every non-test .ts file under src/daemon/tools and finds an import of node:child_process outside shell-helper.ts
  - Response: The test fails and the build's test sweep fails
  - User impact: A tool cannot add a spawn that bypasses the lifecycle without being noticed
- **runShell or runShellBytes is given an already-aborted effective signal (its own, or the ambient one)** (recoverable)
  - Detection: The lifecycle tests the effective signal on entry, before spawn
  - Response: Returns without starting a process: code null, spawnError false, aborted true; the git helper fail() turns it into a rejected failure that says the call was cancelled and nothing ran
  - User impact: No command starts after a deadline or a cancel
- **The shared refresh deadline signal fires while a refresh tool's command is running** (recoverable)
  - Detection: The abort listener the lifecycle installed kills the child's process group; the result has code null and a kill signal, so ranToExit is false
  - Response: The tool returns a rejected failure naming the cancellation; a changing command adds that its outcome is unknown; later refresh calls fail at the executor check without starting
  - User impact: The refresh stops at the shared deadline and starts no call after it
- **A command has started a descendant (a transport or helper process) that keeps the stdout or stderr pipe open after the parent is killed** (recoverable)
  - Detection: The lifecycle kills the whole process group on abort, time-out and (runShellBytes) stderr overflow; if 'close' has not fired 2 s after the kill, its bounded-settlement timer fires
  - Response: The group kill removes the descendant; if a pipe is still open the lifecycle destroys the stdout and stderr streams and resolves anyway after 2 s with what was captured and the aborted, timedOut or stderrOverflow flag, and clears its timers and listeners
  - User impact: A call cannot outlive the deadline by more than the 2 s settlement bound, and no helper process is left running
- **The shared deadline fires between two refresh calls** (recoverable)
  - Detection: executeTool tests the effective signal before the next call's approval request and before execute
  - Response: The next call returns denied with cancelled and its command never starts
  - User impact: A refresh cannot run past its 10 s budget by starting another call
- **The signal is aborted between the commands of git_show (header, diff, stat)** (recoverable)
  - Detection: git_show tests deps.signal.aborted before each command, and each shell call tests the ambient signal on entry
  - Response: The commands after the abort do not start; the tool returns a rejected failure
  - User impact: A multi-command tool does not run past the deadline
- **A registered tool does non-subprocess work (an in-process HTTP, database or file operation) when the signal aborts** (recoverable)
  - Detection: No lifecycle is involved; the work is not a subprocess
  - Response: It is not interrupted and finishes or stops by its own means; this is outside the stated guarantee and is recorded as an open question
  - User impact: Cancellation is a guarantee about subprocesses, not about every kind of work
- **callTool is given a definition whose id is not registered** (recoverable)
  - Detection: getTool(tool.id) returns undefined
  - Response: A rejected failure that names the id; nothing is run
  - User impact: A typed caller cannot run a tool that is not in the registry
- **callTool is given a definition whose id is registered to a replacement: another tool registered over the id, including a spread copy of the definition with a different execute, inputSchema, outputSchema or approval that keeps the same outputSchema object, or such a copy wrapped by a failure net** (recoverable)
  - Detection: callTool evaluates isDefinitionOf(registered, tool): registered is not the passed object, and the chain registered, definitionOf(registered), ... (provenance WeakMap written only by markDefinition in the two failure-net wrappers) never reaches it within 8 steps, because a replacement made by spreading is an unmarked new object and a wrapper around it is marked from the replacement, not from the passed object
  - Response: A rejected failure that names the id; nothing is run and no data is returned under the wrong type
  - User impact: A typed caller cannot receive data produced by a different implementation than the definition it passed
- **callTool is given a git definition whose registered tool is its withFailureNet copy** (recoverable)
  - Detection: git/index.ts registers register(withFailureNet(tool)); the wrapper called markDefinition(copy, tool), so definitionOf(registered) is the passed object
  - Response: The provenance check passes after one step and the call runs
  - User impact: None: every registered git tool stays callable
- **callTool is given an exported gh tool or family (a legacy export such as ghProjectListTool, or the defineGhFamily result including gh_tracker)** (recoverable)
  - Detection: The export is already the object returned by withGhFailureNet and registerGhTools registers it as it is, so registered === tool; its recorded original (the inner literal) is not needed and is not compared
  - Response: The provenance check passes at once and the call runs
  - User impact: None: every exported gh tool stays callable
- **callTool is given a definition that was wrapped twice, passing either level** (recoverable)
  - Detection: markDefinition records the immediate original at each wrapper, so the walk from the registered object reaches both the inner and the outer object
  - Response: The provenance check passes for either object
  - User impact: None
- **A git tool is exported from its file but missing from gitToolDefinitions, or a listed object is not exported by a tool file** (recoverable)
  - Detection: The inventory test (typed-git-tools.test.ts) imports every git tool module, collects every export that has a string id and an execute function, and compares that set with gitToolDefinitions in both directions; the compiler cannot detect the omission because 'satisfies readonly TypedTool[]' checks only listed elements
  - Response: The test fails and the build's test sweep fails; registerGitTools would otherwise leave the tool unregistered
  - User impact: A tool that exists in code but not in the list, the registry or the type check is caught before release
- **git_config reads a key that is not set** (recoverable)
  - Detection: git config --get exits 1 with empty stdout
  - Response: Success with {found: false}; no failure
  - User impact: The caller (identity lookup, header) treats it as 'no value' exactly as it does today
- **git_config fails for another reason (exit other than 0 or 1, cut output, spawn error, bad config file)** (recoverable)
  - Detection: The exit code, ShellResult.stdoutTruncated or ShellResult.spawnError
  - Response: A failure whose kind comes from failureKind (missing-tool for a spawn error, rejected otherwise)
  - User impact: The identity lookup reports 'git identity unavailable'; the header omits the name
- **A new git tool gets an unsafe value: a key that is not dotted, a ref (or remote, or pattern) that isSafeRefName refuses (leading '-' or '/', whitespace, control characters, ~ ^ : ? * [ backslash, '..', '@{', '//', '@', trailing '/', '.' or '.lock'), a ref outside refs/, a path with a NUL, delete other than true, empty or oversized paths, more than 8 patterns** (recoverable)
  - Detection: The tool's input SCHEMA (patterns, const, minItems, maxItems), which executeTool checks before it builds the approval request
  - Response: A rejected input failure produced by the executor; the approval gate is not called and nothing runs, whether or not an approval subscriber is attached
  - User impact: Unsafe input never reaches an approval prompt and the destructive tools only ever ask about input that already passed
- **A branch or remote name that the real callers accept (Unicode, '+', '#') is given to a new git tool** (recoverable)
  - Detection: SAFE_REF is the isSafeRefName predicate as one Unicode-aware pattern, so the schema accepts exactly what the callers accept
  - Response: The call proceeds as it does through the old direct git call
  - User impact: No behaviour change for existing branch and remote names; the equivalence test guards it
- **git_ls_remote cannot reach the remote** (recoverable)
  - Detection: A non-zero exit classified by failureKind with network true (a network error text gives 'unreachable', a sign-in text 'missing-signin')
  - Response: A failure whose message carries git's stderr
  - User impact: branch-resolution.ts and handoff.ts keep their 'could not be reached' refusals, reading the reason from failure.message
- **git_ls_remote returns no matching lines** (recoverable)
  - Detection: Exit 0 with empty stdout
  - Response: Success with empty entries and symrefs
  - User impact: handoff.ts treats it as 'branch absent'; branch-resolution.ts as 'does not exist on remote'
- **git_update_ref or git_rm times out or is killed** (recoverable)
  - Detection: ShellResult.timedOut or code null with a kill signal
  - Response: A failure whose message says the outcome is unknown (mutating)
  - User impact: handoff.ts cleanup sees the failure and reports what it could not remove
- **A gh_tracker owner, repo, org or login value is outside the name pattern (a '/', '?', '#', '%', whitespace, '.', '..' or a non-ASCII character), or a number is not a positive integer** (recoverable)
  - Detection: The field's pattern (FieldSpec pattern carried into the flat input schema by fieldSchema) or integer minimum, which executeTool checks before it builds the approval request
  - Response: A rejected input failure produced by the executor; the approval gate is not called and no gh command runs
  - User impact: A bad name never reaches an approval prompt and cannot steer a tracker call to another endpoint
- **Two ops of one family declare a shared field with different patterns** (recoverable)
  - Detection: buildInputSchema compares the field's spec as JSON (the pattern is a string, so it is included) and finds a difference
  - Response: defineGhFamily throws 'field x is declared differently by two ops' when the module is loaded, so the build and the registration test fail
  - User impact: A family cannot ship with an op that is checked more loosely than its neighbour
- **A gh_tracker value that passed its pattern or type (a since value, a label, a title) contains '&', '#', '/', spaces, '%' or non-ASCII where it enters a path or query** (recoverable)
  - Detection: The path and qs variants pass every field value through encodeURIComponent; constants come only from the op definition
  - Response: The value is encoded inside its path segment or query value and can neither add a segment nor a query key; a list field joined by ',' encodes each member first
  - User impact: No input can steer a tracker call to another endpoint or add a query parameter
- **An op declares a list-valued qs field without join, or a qs entry that is neither a constant nor a field entry** (recoverable)
  - Detection: buildArgv's qs handling and the type of QsEntry; a family definition with such an entry fails the gh-op-table-qs test and throws when the argv is built in the family test
  - Response: The definition does not compile or the test fails; no argv is produced at run time from a malformed entry
  - User impact: A malformed query description is caught before release
- **A paginated gh_tracker op (comments_list, issues_by_labels, issues_titles) reads a list that spans several pages** (recoverable)
  - Detection: The argv carries --paginate and a fixed lit('-q', filter), so gh prints one JSON value per line across every page, and the op's builder reads the output with parseJsonLines; gh api --paginate on its own prints one JSON array per page, which a single JSON.parse cannot read
  - Response: Every page's items are returned in API order; the two issue listings exclude pull requests in the jq filter; an empty output is an empty list; blank lines are skipped
  - User impact: A list of more than 100 items returns every item, as the current wrappers do
- **A paginated gh_tracker op prints a line that is not valid JSON** (recoverable)
  - Detection: parseJsonLines returns { ok: false, line, text } for the first line that does not parse
  - Response: A rejected failure that names the 1-based line number and the first 200 characters of the line; no partial list is returned
  - User impact: The s10 caller maps it as it maps a failed command today
- **gh project create (op project_create) prints JSON whose number is missing or not numeric, or prints text that is not JSON** (recoverable)
  - Detection: The op's custom output builder parses stdout and checks that number is a number
  - Response: A rejected failure naming the unusable output; no { number, url } is returned
  - User impact: The s10 caller maps the failure to null exactly as ghCreateProject does today
- **tools.call params are invalid: a missing field, a caller outside agent, daemon, workflow, a non-object input** (recoverable)
  - Detection: The handler validates the params before building ToolDeps
  - Response: One 'error' frame { code: 'invalid-params', message } and the stream closes; no tool runs
  - User impact: The terminal client sees an invalid-params error
- **tools.call names an unknown tool id** (terminal)
  - Detection: getTool returns undefined inside executeTool
  - Response: One 'done' frame whose result is a failed ToolResult of kind rejected; never an IPC error
  - User impact: The terminal client reports an unknown tool
- **tools.call is handled without a trusted connection context** (recoverable)
  - Detection: The handler finds context undefined when it builds ToolDeps
  - Response: sessionId is the plain string 'tools-call'; nothing else depends on it because git and gh tools keep no per-session state
  - User impact: None
- **The client closes the tools.call stream while the call or its approval is pending** (recoverable)
  - Detection: The server aborts the stream handler's signal when the socket closes
  - Response: A pending approval resolves 'cancelled'; a tool not yet started does not start; every running subprocess is killed with its process tree through the effective signal
  - User impact: The client that left sees nothing; the work is not done
- **A destructive tool is called with valid input and no approval.subscribe client attached, or nobody answers in time** (recoverable)
  - Detection: The approval gate returns 'no-client' or 'timed-out'
  - Response: failed('denied') with that denial; the tool does not run
  - User impact: The calling stage fails with the denial reported and does not continue (effective ac2)
- **gh_tracker is defined but not registered** (recoverable)
  - Detection: getTool returns undefined for gh_tracker in the registration test
  - Response: The registration test fails the build
  - User impact: A tool that exists in code but not in the registry is caught before release
- **A tracker op returns data that does not match its declared output schema** (terminal)
  - Detection: The executor's output check after execute
  - Response: failed('schema-mismatch') built by the executor, with the raw output in failure.original cut to 4000 characters by the executor's own failed() helper
  - User impact: The caller gets a failure instead of unchecked data
- **gh is not signed in or not installed when a tracker op runs** (recoverable)
  - Detection: The shared gh failure helpers classify the error text and the spawn result
  - Response: missing-signin or missing-tool failure kinds, as the other gh tools do; the spawn-error branch keeps failure.original = stderr as today
  - User impact: The s10 tracker caller maps these to its own port failure
- **A tracker op that creates an issue with a type is rejected because issue types are not enabled** (recoverable)
  - Detection: The API answer is an HTTP 422 whose text names the issue type; the op sets the diagnostic field, so ghFailureOf puts the trimmed stderr (or stdout when stderr is empty) in failure.original
  - Response: A rejected failure with the API text in failure.original, cut by the seam itself to FAILURE_ORIGINAL_MAX_CHARS (4000) because the executor returns a tool's own failure unchanged; this is the text the s10 typed-issue fallback reads
  - User impact: No change to what the tracker creates today once s10 moves the caller
- **A failing gh_tracker command writes more than 4000 characters of diagnostic text** (recoverable)
  - Detection: ghFailureOf measures the trimmed text against FAILURE_ORIGINAL_MAX_CHARS
  - Response: failure.original holds the first 4000 characters; failure.message is unchanged
  - User impact: A large error body cannot flood the result
- **The forbidden-spawn scan cannot parse a file** (recoverable)
  - Detection: The TypeScript compiler API reports a syntax error for the file
  - Response: The scan lists the file as unscanned and exits non-zero even in report mode, because a gap in the scan hides sites
  - User impact: The build shows the file to fix
- **A type fixture that must fail to compile compiles** (recoverable)
  - Detection: tsc under tsconfig.typecheck.json reports an unused @ts-expect-error directive
  - Response: typecheck:tools exits non-zero and the build fails
  - User impact: A change that widens a tool's schema types is caught at build
- **A fixture under __type-tests__ is picked up by the normal build** (recoverable)
  - Detection: The typecheck-config test finds a __type-tests__ file in the root program
  - Response: The root tsconfig.json excludes '**/__type-tests__/**', so tsc neither compiles nor emits the fixtures
  - User impact: No test code is shipped in out/

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A call with no deps.signal and no signal in the context | Behaves exactly as today: nothing is stored in the context, no check is made and the lifecycle keeps its fixed limit |
| Code that runs outside executeTool (the indexer, the daemon self-update, a plain wrapper) calling runShell | No ambient signal exists, so the helper behaves as before apart from the process-group and settlement changes |
| A shell-helper call that is never aborted and never times out | Settles on the child's 'close' as today; the process group and the 2 s bound change nothing for it |
| A streaming tool (exec-detached, a k8s tool, the test runner, an ssh tool, aws logs follow) that is neither aborted nor timed out | The same progress frames, output and result as today; only the lifecycle underneath changed |
| shell:exec-detached with the command form ('bash -c') running a pipeline whose children outlive the shell, then aborted | The whole process group is killed, so the children end too; before, only the parent shell was killed |
| A hook of a tool called directly (not nested) | currentToolSignal() is undefined inside the hook, as before the change |
| A hook of a nested tool whose outer call's signal aborts while the hook awaits | currentToolSignal() stays undefined before and after the await and a subprocess the hook started is not killed |
| A refresh tool call whose own limit (for example 10 s) passes before the shared signal fires | The tool's limit stops it first, as today: the limit is a ceiling and the signal can only make it shorter |
| A tool that finishes normally, then its signal is aborted later | Nothing happens: no process is running and the context ended with the call |
| A preview that builds without running any subprocess (most tools) | Unchanged: the preview is built as today inside the context at no cost |
| git_push with an explicit ref (its preview runs no git) | Unchanged: nothing runs in the preview, so cancellation is decided by the executor's checks alone |
| git_cat_file with timeoutMs 30000, or with no timeoutMs | The same 30000 ms limit as today |
| git_cat_file with timeoutMs 1 | Accepted; the process is stopped after 1 ms and the failure is timed-out |
| git_config for a key whose value is an empty string | Success with found true and value '' |
| git_ls_remote with symref true and patterns ['HEAD'] against a remote whose HEAD is a symref | symrefs contains {ref:'HEAD', target:'refs/heads/<branch>'} and entries contains the HEAD object id |
| git_ls_remote with heads true and a pattern that matches nothing | Success with empty entries and symrefs |
| git_ls_remote or git_update_ref with a branch name containing a non-ASCII letter, '+' or '#' | Accepted by the schema, as isSafeRefName accepts it today |
| git_update_ref -d of a ref that is already gone | Success {ref, deleted: true}, as git exits 0 |
| git_update_ref with ref 'refs/heads/x' followed by a NUL character | Rejected by the input schema before any approval request, with a subscriber attached or not |
| git_rm with a path that starts with '-' | Accepted, because the argv puts '--' before the paths and the real caller does the same |
| git_rm with a path that contains a NUL | Rejected by the input schema before any approval request |
| git_rm of a path that is not tracked | Success {paths}, because of --ignore-unmatch |
| A gh_tracker owner of '..', '.' or 'a/b', or a repo of 'x?y' | Rejected by the name pattern before any approval request; 'my-org.x_y' and 'a.b' are accepted |
| A gh_tracker comments_list call with no since | The positional is 'repos/o/r/issues/5/comments?per_page=100' (the constant only); the argv is 'api --paginate <positional> -q <comments filter>' |
| A gh_tracker comments_list call with since containing ':' , '&' or '#' | The value is percent-encoded and appended after the constant: '...?per_page=100&since=2026-10-26T00%3A00%3A00Z'; it cannot add a query key |
| A gh_tracker issues_by_labels call with labels ['a','b c'] | 'repos/o/r/issues?state=all&per_page=100&labels=a,b%20c': each label encoded, joined by a literal ',', exactly as ghListIssuesByLabelsStrict builds it, followed by -q '.[] \| select(.pull_request \| not) \| .number' |
| A gh_tracker issues_titles call | 'repos/o/r/issues?state=all&per_page=100' with both constants in that order, followed by -q '.[] \| select(.pull_request \| not) \| {number, title}' |
| A paginated op whose stdout is two pages' worth of items (for example 150 comments) as one line each | All 150 items return in order; the page boundary is invisible |
| A paginated op whose stdout is empty, or has blank lines between items | Empty output is an empty list; blank lines are skipped |
| A qs variant whose every entry is an absent optional field | Nothing is appended: no bare '?' ends the path |
| A gh_tracker project_create call with owner 'my-org' and title 'Roadmap' whose command prints {"number":7,"url":"https://github.com/orgs/my-org/projects/7"} | Success with {number: 7, url: ...}; argv is gh project create --title Roadmap --owner my-org --format json |
| ghFindProjectByTitle's lookup through gh_project_list with limit 200 on an org with a closed and an open board of the same title | The rows carry closed, so the s10 caller can still pick the open one exactly as the wrapper does |
| callTool for a git definition registered by registerGitTools | Runs: the registered copy is marked as built from the exported definition |
| callTool for an exported legacy gh tool (for example ghProjectListTool) or for ghTrackerTool | Runs: the exported object is the registered object |
| callTool for a tool registered with a plain registerTool(definition) and no wrapper | Runs: the registered object is the definition passed |
| callTool for a git definition whose id has since been overwritten by '{ ...definition, execute: other }' registered through withFailureNet | Rejected: the chain of the registered copy reaches the replacement, not the definition passed; nothing runs |
| tools.call for a common tool with approvalMode absent or 'auto' | Runs without asking (tools.commonApproval default auto); under manual or edit-auto it asks |
| The task query whose API answer has hasNextPage false and a non-empty endCursor | The op returns pageInfo with hasNextPage false and that endCursor, exactly as queryTasks does today; it never drops the cursor |
| The task query whose API answer has no pageInfo | The op returns pageInfo { hasNextPage: false } and omits endCursor |
| The scan meets src/indexer/index.ts, src/cli/services/maintenance.ts or src/daemon/installed-commit.ts | Listed as an exemption with its reason, not as a violation |

**Invariants to preserve**

- A tool whose declared output does not match, or that returns no data, fails with schema-mismatch and its result is not passed on (k2) [[c1]]
- executeTool checks a tool's input schema before it builds the approval request, returns a failure a tool built itself unchanged, and only its own failed() helper caps failure.original at 4000 characters; buildApprovalRequest keeps the generic preview only when buildApprovalGate throws [[c1]]
- A destructive call always asks whatever the caller, mode, setting or arguments say, and a denial is a failure value; the broker resolves 'cancelled' only for the signal it is given and otherwise waits for the 300000 ms approval timeout [[c1]]
- Hooks run only after a successful, checked call, on the continuation after execute, and a hook failure never changes success into failure; they must not see any tool call's signal [[c1]]
- git_push without a ref and git_reset build their approval preview by running git before any ask, outside any signal handling today; a killed read gives a failed read or undefined and a preview object, not an exception [[c2]]
- Eight direct spawn sites in five tool files (exec-detached, k8s three, test, ssh two, aws logs) attach handlers to the child right after spawn, kill only the parent from an abort listener on deps.signal, run their own timers and settle on 'close' with no bound; each keeps its own progress frames and result text [[c3]]
- A subprocess started through the shared helpers is cancellable today only where the tool forwards deps.signal (ghExec does; the legacy gh exports, the auth probe and git_diff do not); an AsyncLocalStorage context follows continuations, so clearing it takes an explicit run with an undefined store [[c4]]
- registerTool overwrites an id with a warning; the git definitions are registered as withFailureNet spread copies, while the gh exports and defineGhFamily results are already the withGhFailureNet copies and are registered as they are; callTool's provenance check must pass for every registered tool of both families and refuse an unmarked replacement [[c5]]
- Existing git tool ids, input shapes and approval classes keep their meaning (k7); the typing change is declaration-only and registration still wraps each definition with withFailureNet [[c5]]
- git/index.ts is the only inventory of git definitions today and a list checked with satisfies verifies only its listed elements, so completeness needs the inventory test [[c6]]
- FieldSpec carries no pattern and buildInputSchema rejects a field two ops declare differently (compared as JSON without description and values), so a pattern is a string and is compared; existing ops declare no pattern and keep their schemas [[c7]]
- The tracker listing wrappers build 'state=all&per_page=100&labels=' + labels.map(encodeURIComponent).join(','), 'state=all&per_page=100' and 'per_page=100' with an optional since; the qs variant must reproduce these query strings exactly [[c7]]
- The tracker listing wrappers read every page with 'gh api --paginate' plus a jq filter (-q) that prints one JSON value per line and then split the output into lines (src/workflow/tracker/github.ts lines 284, 351 and 362), because the pages of --paginate are separate JSON arrays and not one JSON document; the gh_tracker ops must return the same items in the same order [[c7]]
- queryTasks returns hasNextPage (false when absent) and endCursor independently, and total only when issueCount is a number [[c7]]
- ghCreateProject needs the JSON number and url of gh project create and returns null without a numeric number; ghFindProjectByTitle reads number, title, url and closed; the two boolean wrappers read only success [[c8]]
- Failure objects of the existing gh tools do not change: for command-exit failures failure.original from ghFailureOf is set only from probe text unless an op opts in, and the spawn-error branch keeps original = stderr; existing ops use none of the new argument variants [[c7]]
- Raw gh api stays excluded from the gh coverage table and the tracker family uses fixed endpoint templates only; no endpoint is an input [[c7]]
- The refresh deadline stays 10 s (REFRESH_DEADLINE_MS) with one shared deadline started before the first git call, and the lock-lifetime reasoning beside it still holds [[c10]]
- runShellBytes already tests an aborted signal before it starts and kills the process group; the lifecycle gains the same bounded settlement without changing results for a call that is neither aborted nor timed out [[c10]]
- The callers of the four new git tools keep their semantics: identity.ts treats exit 1 with empty stdout as 'no email' and other failures as unavailable; handoff.ts treats empty ls-remote output as 'branch absent'; update-ref -d and rm --ignore-unmatch succeed when there is nothing to remove; ref and path acceptance equals isSafeRefName and assertSafeArg [[c10]]
- The server aborts a stream handler's signal when the client closes the socket, TrustedRpcContext has no sessionId, and worker threads have no tool registry [[c11]]
- tsc via tsconfig.json includes src/**/*.ts and does not check test files, so compile-time checks need their own config and the root config must exclude the fixtures [[c12]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), files under __tests__ next to the code; the recorded executor and the approval-gate seam (_setApprovalGateForTests) are the existing fixtures; compile-time checks run with tsc under a dedicated config (npm run typecheck:tools); live gh and git tests stay behind INSRC_LIVE_TESTS`

**Test levels**

- **unit** — The effective signal, the ambient and cleared contexts, the executor's cancellation checks and the one process lifecycle (shell helpers and spawnManaged)
  - Subjects: `src/daemon/tools/__tests__/executor-abort.test.ts: executeTool never starts a tool when the effective signal is aborted before the request, during preview construction, after the request is built and before the ask, or between the approval answer and execute; no gate call is made for an already-aborted signal`, `src/daemon/tools/__tests__/tool-signal.test.ts: inside runWithToolSignal, currentToolSignal() aborts when the call's signal aborts, also after an await and inside a promise started by the tool; outside any context it is undefined; effectiveToolSignal combines the argument with the context signal and returns either alone or undefined; a nested runWithToolSignal with its own signal aborts when either aborts; a nested one with undefined keeps the outer signal; runWithoutToolSignal makes currentToolSignal() undefined inside it and after an await in it, even when called inside an outer runWithToolSignal, and the outer context is intact after it returns; two concurrent calls with different signals do not see each other's signal; with no signal anywhere nothing is stored`, `src/daemon/tools/__tests__/hooks-context.test.ts: a hook of a directly called tool and a hook of a NESTED executeTool (entered from inside an outer tool's execute) each read currentToolSignal() before and after an await and see undefined both times; the hook starts a subprocess and the outer call's signal is aborted while it runs: the subprocess is NOT killed and the hook completes; the same hook fails to see the outer signal when the nested call has its own signal; hook failures are still reported on the result and never turn success into failure`, `src/daemon/tools/__tests__/shell-helper-abort.test.ts: runShell, runShellBytes and spawnManaged given an already-aborted signal, explicit or ambient, start no process (a command that would write a file leaves none) and report aborted; a running process is killed on abort of either; a call with no signal and no context behaves as before`, `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts: with a git stand-in script that starts a background descendant which holds the stdout and stderr pipes open, runShell, runShellBytes and spawnManaged each settle within the 2 s bound after an abort and after a time-out (runShellBytes also after a stderr overflow), report the aborted, timedOut or stderrOverflow flag, destroy the streams, and the descendant process is gone (checked by its pid) after each; a call that is neither aborted nor timed out settles on 'close' as before; all three use the one shared lifecycle`, `src/daemon/tools/__tests__/spawn-managed.test.ts: spawnManaged returns { spawned: true, child, settled } with the live child so stdout and stderr callbacks receive data in order; settled carries code, signal, timedOut and aborted; the timeoutMs ceiling kills the group; a spawn error reaches the child's 'error' event and settled still resolves; with an already-aborted effective signal it returns { spawned: false, settled } with no child, nothing is started (a marker file is not written) and settled is already resolved with aborted true; a compile-time fixture shows that reading child without narrowing on spawned does not compile`, `src/daemon/tools/__tests__/child-process-inventory.test.ts: lists every non-test .ts file under src/daemon/tools and fails when any file other than shell-helper.ts imports node:child_process (a temporary file that imports it in a temporary tree is reported by the same logic)`, `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts: git_cat_file (through runShellBytes) with the descendant-holding-pipes stand-in settles within the bound on abort and on its time-out and returns a rejected or timed-out failure`
  - Fixtures: `a fake approval gate that answers after an abort`, `a command that sleeps or writes a marker file`, `a git stand-in script on PATH that forks a descendant holding the output pipes`
- **integration** — Cancellation reaches the approval preview, the approval wait (including nested calls), running legacy tools, secondary commands, the auth probe and every tool that spawns its own process, through the real executor and the real tools.call stream path
  - Subjects: `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, git_diff: a tools.call for git_diff against a stand-in git that sleeps; closing the stream kills the stand-in's process tree (checked by pid) and the call settles within 2 s plus slack although git_diff forwards no signal`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, legacy gh export: a tools.call for gh_project_list (ghExec without a signal) against a stand-in gh that sleeps; closing the stream kills the stand-in's process tree and settles within the bound`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, auth probe: a stand-in gh that exits with an ambiguous error for the operation and then sleeps for 'auth status'; closing the stream while the probe runs kills the probe's process tree and settles within the bound, and no further gh process starts`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, multi-command tool: git_show against a stand-in git that sleeps in its second command; closing the stream stops the running command and never starts the third`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, approval preview: a tools.call for git_push WITHOUT a ref against a stand-in git that sleeps for 'symbolic-ref --short HEAD' (the command readBranch runs), with an approval subscriber attached; closing the stream while the PREVIEW runs kills the stand-in's process tree, the builder returns a preview that names the ref '(unknown: ...)' instead of throwing (asserted on a direct call of the builder with the same stand-in), the call returns the cancelled denial from the executor's check after the preview, and no approval request reaches the subscriber; the same for git_reset (hard) with a stand-in that sleeps for any git command`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, nested approval wait: a test tool that calls executeTool for a destructive tool with no signal of its own, with an approval subscriber attached that never answers; closing the stream resolves the nested approval as 'cancelled' at once (not after the 300000 ms timeout) and the nested call returns the cancelled denial`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, nested subprocess: a test tool that calls executeTool for a second tool without a signal; closing the stream kills the second tool's subprocess`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts, pending approval and not-started tool: closing the stream resolves a pending approval as cancelled and a tool not yet started never starts`, `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts: for each of the eight migrated sites (shell:exec-detached with an argv and with a 'bash -c' command that backgrounds a child, a k8s tool at each of its three spawn sites, the test runner, an ssh tool at each of its two sites, aws logs tail in follow mode) run against a stand-in executable that sleeps and forks a descendant: closing the stream (an abort of the call signal) kills the whole process group (the child and the descendant are gone, checked by pid), settles within the bound, and the tool returns its usual aborted result; the tool's own time-out ceiling (maxRuntimeMs or its time-out) kills the group and returns today's time-out wording; progress frames sent before the abort were delivered; and with an ALREADY-ABORTED signal each site takes the no-spawn branch: no process starts (a marker file is not written), no handler is attached, and the site returns the aborted result it builds today`
  - Fixtures: `stand-in git, gh, kubectl, ssh, test-runner and aws scripts on PATH that sleep, fork a descendant, or exit with a chosen error and then sleep in 'auth status'`, `an in-process daemon handler runtime with a real stream signal and an approval subscriber that never answers`
- **unit** — The migrated direct-spawn tools behave as before when they are neither aborted nor timed out
  - Subjects: `src/daemon/tools/builtins/shell/__tests__/exec-detached-parity.test.ts, k8s/__tests__/k8s-spawn-parity.test.ts, test/__tests__/test-runner-parity.test.ts, ssh/__tests__/ssh-spawn-parity.test.ts and cloud/aws/__tests__/logs-parity.test.ts: against stand-in executables, each tool produces the same progress frames, byte counts, exit code mapping, spawn-error text and result as the recorded behaviour of the version before the migration, for argv and command forms, success and non-zero exit`
  - Fixtures: `recordings of the current progress frames and results of each of the five tool files`, `stand-in executables`
- **unit** — The refresh's git tools stop on the signal, share one diminishing budget, and git_cat_file takes a lowerable timeout
  - Subjects: `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts: git_fetch, git_fetch_refs, git_rev_parse, git_symbolic_ref, git_ls_tree, git_ls_remote, git_config and git_cat_file fail rejected on an already-aborted signal and on an abort while running; git_show starts no command after an abort between its header, diff and stat commands; the git helper fail() reports an aborted command as cancelled`, `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts: one deadline signal (a short AbortSignal.timeout, with a controlled slow command) is passed as deps.signal to successive calls of git_rev_parse, git_ls_remote, git_fetch_refs, git_ls_tree and git_cat_file through executeTool; each later call gets only what the first ones left, a running command is killed at the shared deadline, and a call started after the deadline never spawns; a tool's own limit still stops a call first when it is shorter than the signal`, `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts: timeoutMs accepts 1 to 30000, rejects 0, 30001 and a non-integer, defaults to 30000, keeps the limit failure messages, and the signal still applies on top`
  - Fixtures: `a temporary git repository with a bare remote`, `a slow command stand-in for git (a wrapper script that sleeps) on PATH for the deadline test`
- **unit** — The four new git tools: contracts, argv, defaults, outputs, schema-level safety matching the callers, and registration
  - Subjects: `src/daemon/tools/builtins/git/__tests__/git-config.test.ts: argv ['git','config','--get',key]; exit 0 gives {found:true, value} trimmed, including an empty value; exit 1 with empty stdout gives {found:false} as a success; exit 128, a cut output and a spawn error are failures; a key that is not dotted, or starts with '-', is rejected by the schema before anything runs; ceiling 5000 ms; class none`, `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts: argv for symref true with ['HEAD'] (symrefs parsed into {ref:'HEAD', target}) and for heads true with ['refs/heads/<name>']; defaults heads and symref false and patterns []; an empty answer is a success with empty lists; an unreachable remote is a failure with kind unreachable and git's text in failure.message; an unsafe remote or pattern and 9 patterns are rejected by the schema; ceiling 30000 ms; class none; the outputs equal what branch-resolution.ts and handoff.ts read today from the same repositories`, `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts: argv ['git','update-ref','-d',ref]; output {ref, deleted:true}; deleting an absent ref succeeds; delete false, a missing delete, a ref outside refs/, and a ref that isSafeRefName refuses are rejected by the schema; a ref with a non-ASCII letter, '+' or '#' is accepted; class destructive always asks for valid input; a timed-out call says the outcome is unknown`, `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts: argv ['git','rm','-q','--ignore-unmatch','--', ...paths]; quiet false drops -q; output {paths}; an untracked path succeeds; a path starting with '-' is ACCEPTED (it follows '--'); empty paths, 201 paths and a path with a NUL are rejected by the schema; class destructive always asks for valid input; runs in a worktree directory given as cwd`, `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts: the SAFE_REF schema pattern and isSafeRefName agree on one corpus: ASCII names, Unicode names, names with '+' and '#', and each rejected shape (empty, leading '-' or '/', whitespace, each control character including NUL, each of ~ ^ : ? * [ and backslash, '..', '@{', '//', '@', trailing '/', '.' and '.lock')`, `src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts: for git_update_ref and git_rm, unsafe input including a NUL returns a rejected input failure through executeTool and the approval gate is never called, once with an approval subscriber attached and once with none (so the result is not denied/no-client)`, `src/daemon/tools/builtins/git/__tests__/git-registration.test.ts: after registerGitTools, getTool finds git_config, git_ls_remote, git_update_ref and git_rm and executeTool runs each; the registered tool is the marked withFailureNet copy and the exported definition is unchanged`
  - Fixtures: `a temporary git repository with a bare remote and a linked worktree`, `an approval gate spy and an attached-subscriber variant`
- **unit** — callTool refuses a registered tool that is not linked to the definition passed, accepts every real git definition and gh export, and cannot be fooled by a spread replacement
  - Subjects: `src/daemon/tools/__tests__/call-tool-identity.test.ts, real tools: after registerGitTools and registerGhTools, callTool runs for gitDiffTool (a withFailureNet copy is registered), for several real legacy gh exports (ghProjectListTool, ghIssueListTool, ghRepoViewTool, ghRunListTool and ghReleaseListTool, which ARE the registered objects) and for the defineGhFamily exports (a family such as ghIssueManageTool and ghTrackerTool); a plain registerTool(definition) runs; a definition wrapped twice runs when either level is passed`, `src/daemon/tools/__tests__/call-tool-identity.test.ts, replacements: a replacement registered over the same id as '{ ...original, execute: other }' (same outputSchema and inputSchema) is rejected, names the id and its execute is never called; replacements that change only inputSchema, only approval, and only outputSchema are each rejected; the same replacement wrapped by withFailureNet or by withGhFailureNet is rejected; a gh export overwritten by such a replacement is rejected when the original export is passed; an unregistered id is rejected; the failure kind is rejected and the public signature is unchanged for the existing call-tool tests`, `src/daemon/tools/__tests__/provenance.test.ts: markDefinition(copy, original) makes definitionOf(copy) the original; a copy of a marked copy records its immediate original and isDefinitionOf reaches both levels; an object made by spreading a marked copy is not marked (definitionOf returns undefined); definitionOf of an unmarked object is undefined; a symbol or property copied by a spread does not mark an object; a chain of 9 wrappers is not accepted for the first object (the 8-step bound) and a cycle ends in false`
  - Fixtures: `two tool definitions that share their schema objects but have different execute functions, registered under one id`
- **contract** — All git tool definitions live in one typed list that drives registration and the type check, its completeness is proved by an inventory test, concrete types hold, and the fixtures stay out of the normal build
  - Subjects: `src/daemon/tools/__tests__/typed-git-tools.test.ts (the mandatory inventory test): it lists the .ts files of src/daemon/tools/builtins/git other than index, definitions, helpers, coverage and the tests, imports each, collects every export whose value has a string id and an execute function, and requires that set to equal gitToolDefinitions in both directions (the 34 existing and the four new); a tool exported but not listed, and a listed object not exported by a tool file, each fail it; ids are unique; the ids registered by registerGitTools equal the list's ids; every listed tool declares typebox input and output schemas at run time; a negative case runs the same comparison on a temporary directory that holds a tool file left out of a temporary list and asserts the test logic reports it`, `src/daemon/tools/__type-tests__/git-tools.typecheck.ts compiled by tsconfig.typecheck.json (npm run typecheck:tools, added to the build chain after tsc): gitToolDefinitions imported from src/daemon/tools/builtins/git/definitions.ts is checked element by element against 'readonly TypedTool[]'; callTool with valid input compiles and its result fields are concretely typed for gitDiffTool and the refresh tools; a wrong input field, a wrong input type and a misspelt result field each carry @ts-expect-error and an unused directive fails the check`, `src/daemon/tools/__tests__/typecheck-config.test.ts: the root tsconfig.json excludes '**/__type-tests__/**' (no file under it is in the root program) and tsconfig.typecheck.json includes it with noEmit`
- **unit** — The FieldSpec pattern, the op-table argument variants (path, kv, qs), the gh tracker family (fifteen ops) with line-delimited pagination, registration, the capped failure seam and the closed mapping of the other wrappers
  - Subjects: `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts: fieldSchema of a string spec with a pattern carries the pattern and one without builds today's schema; field.name accepts 'octo-org', 'my.repo_1' and 'a.b', and rejects '', '.', '..', 'a/b', 'x?y', 'a#b', 'a%2Fb', names with whitespace and non-ASCII names; two ops that declare a shared field with different patterns make defineGhFamily throw while identical patterns and differing descriptions do not; through executeTool a bad owner returns a rejected input failure, the approval gate is not called (an approval spy, with a subscriber attached and with none), and no gh command runs`, `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts: the path variant encodes '/', '?', '#', '%' and Unicode in a field value and never splices it; the kv variant emits the flag and key=value, and with repeat one pair per list member (labels[]); existing ops build exactly the argv they build today`, `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts: exact argv fixtures for the qs variant: constants only ('?per_page=100'); a constant followed by an optional field present ('?per_page=100&since=2026-10-26T00%3A00%3A00Z') and absent ('?per_page=100'); two constants and a list field with join ',' ('?state=all&per_page=100&labels=a,b%20c', each member encoded, joined by a literal comma, the order of entries as declared); a value with '&', '#', '/' and Unicode is encoded and adds no key; every entry an absent optional field appends nothing (no bare '?'); a list field without join and a malformed entry are refused; the complete argv of the three paginated ops is 'api --paginate <positional> -q <filter>' with the fixed filters (comments '.[] | {id, author: .user.login, text: .body, at: .created_at, url: .html_url}', labels '.[] | select(.pull_request | not) | .number', titles '.[] | select(.pull_request | not) | {number, title}'), and no filter can come from input; the positionals equal the query strings of ghListIssueComments, ghListIssuesByLabelsStrict and ghListIssuesByTitleTokenStrict in src/workflow/tracker/github.ts for the same inputs`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts: for each of the 15 ops the exact argv (path template, kv pairs, qs, fixed literals; for project_create gh project create --title T --owner O --format json), the input and output schemas, the owner, repo and org name pattern and the positive-integer number fields, the approval class and limit; the three paginated ops are run against stand-in gh output of two pages concatenated as lines: more than 100 items return all in API order, pull requests are absent from the two issue listings, empty output gives an empty list, blank lines are skipped and a malformed line gives a rejected failure that names its line number; parseJsonLines unit cases (values in order, blank lines, empty input, a bad line with its number and the 200-character cut); tasks_query returns pageInfo { hasNextPage: false } without endCursor when the API gives no pageInfo, returns hasNextPage false with the non-empty endCursor when the API gives both, and returns issueCount only when it is a number; project_create returns {number, url} for the JSON ghCreateProject reads and a rejected failure for a missing or non-numeric number and for non-JSON output`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts: after registerGhTools, getTool finds gh_tracker and executeTool runs one op of it through the registry; callTool of the exported gh_tracker object runs`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts: issue_create_typed on an HTTP 422 that names issue types returns a rejected failure whose failure.original is the exact trimmed API text the s10 fallback reads; a diagnostic text of 5000 characters is cut to 4000 in failure.original by the seam (read through executeTool, which returns the tool's failure unchanged) and failure.message is unchanged; FAILURE_ORIGINAL_MAX_CHARS equals the executor's ORIGINAL_MAX_CHARS; the same 422 from an existing gh tool still has no failure.original, and a spawn error from the same op and from an existing tool still has failure.original equal to the trimmed stderr (existing failure objects are unchanged)`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts (a closed table): each wrapper mapped to an existing op returns the fields the wrapper reads, from recordings of today's wrapper behaviour: gh_label create, gh_issue_create, gh_issue_view (body, state, labels), gh_issue_edit, gh_issue_comment, gh_issue_close, gh_issue_list, gh_project_list with limit 200 (rows with number, title, url, closed, a closed and an open board of one title), gh_project_manage field-create with SINGLE_SELECT options (success only) and gh:project:item-add (success only); the test fails the build if any mapped op lacks a field its wrapper reads, and no op is added to make it pass`, `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts: the coverage table names the tracker family as s7's amendment and keeps raw gh api excluded`
  - Fixtures: `recordings of gh output for each op, taken from the current github.ts behaviour, including multi-page line output for the three paginated listings, a 422 issue-type rejection, a 5000-character error body, a spawn error and the output of gh project create`, `an approval gate spy and an attached-subscriber variant`
- **integration** — tools.call through the daemon handler and callTool with caller 'workflow'
  - Subjects: `src/daemon/tools/__tests__/call-handler.test.ts: params validation (an invalid caller, a missing field and a non-object input give one error frame and run nothing), ToolDeps built with sessionId 'tools-call:' plus the connection identity ('tools-call' without a context) and the validated params, one done frame with the ToolResult, an unknown tool gives a done frame with a failed ToolResult of kind rejected, closing the stream aborts the signal and resolves a pending approval as cancelled, an approval request reaches an approval.subscribe client, no subscriber denies a destructive call with no-client, a registered hook runs for caller 'workflow' as for 'agent' and runs outside the signal context`, `src/daemon/tools/__tests__/call-tool-workflow.test.ts: callTool with caller 'workflow' runs the hook, honours manual and edit-auto for a common tool and always asks for a destructive one`, `src/daemon/threads/__tests__/method-class.test.ts: tools.call is classed 'session' and stream, and equals the handler table`
  - Fixtures: `an in-process daemon handler runtime with an approval subscriber`
- **unit** — The forbidden-spawn scan in report mode
  - Subjects: `scripts/__tests__/forbidden-spawn-scan.test.ts: one positive-control fixture per form (execFile, spawn, runShell, wrapper call, injected exec seam, direct builtin execute), the exemptions with their reasons, report mode exits 0 and failing mode exits 1, an unparseable file exits non-zero, and a run over src lists gitDiffTool.execute in grounding.ts and changed-files.ts`
  - Fixtures: `fixture files under scripts/__tests__/fixtures`
- **contract** — The coverage tables mark the tools built by s7
  - Subjects: `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: config, ls-remote, update-ref and rm are marked as built by s7 and are in gitToolDefinitions`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/tools/__tests__/call-tool-workflow.test.ts: a rule registered on a tool runs for a callTool call with caller 'workflow' as for 'agent'`, `src/daemon/tools/__tests__/call-handler.test.ts: a registered hook runs for a tools.call with caller 'workflow'`, `src/daemon/tools/__tests__/hooks-context.test.ts: hooks run outside every tool's signal context, nested calls included` |
| `ac2` | `src/daemon/tools/__tests__/call-handler.test.ts: no approval.subscribe client denies a destructive call with no-client and the done frame carries the denial`, `src/daemon/tools/__tests__/call-tool-workflow.test.ts: a destructive callTool with a gate that times out returns a denied failure and the caller does not continue`, `src/daemon/tools/__tests__/executor-abort.test.ts: an abort after the approval answer returns denied with cancelled`, `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts and git-rm.test.ts: the destructive git tools always ask for valid input`, `src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts: unsafe input is rejected before any approval request`, `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts: a bad owner is rejected before any approval request` |
| `ac3` | `src/daemon/tools/__tests__/executor-abort.test.ts`, `src/daemon/tools/__tests__/tool-signal.test.ts`, `src/daemon/tools/__tests__/shell-helper-abort.test.ts`, `src/daemon/tools/__tests__/shell-helper-tree-kill.test.ts`, `src/daemon/tools/__tests__/spawn-managed.test.ts`, `src/daemon/tools/__tests__/child-process-inventory.test.ts`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts: running legacy tools, secondary commands, the auth probe, the approval preview and nested calls are cancelled`, `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts: every migrated direct-spawn tool is cancelled and time-limited with its whole process group, and spawns nothing for an already-aborted signal`, `src/daemon/tools/builtins/git/__tests__/git-cat-file-tree-kill.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-abort.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-shared-deadline.test.ts: successive refresh-tool calls (including git_cat_file) share one deadline signal and a running command and its tree are killed at it`, `src/daemon/tools/builtins/git/__tests__/git-cat-file-timeout.test.ts` |
| `ac4` | `src/daemon/tools/__type-tests__/git-tools.typecheck.ts via npm run typecheck:tools`, `src/daemon/tools/__tests__/typecheck-config.test.ts`, `src/daemon/tools/__tests__/typed-git-tools.test.ts`, `src/daemon/tools/__tests__/call-tool-identity.test.ts`, `src/daemon/tools/__tests__/provenance.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-op-table-args.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-op-table-qs.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-family.test.ts: including the multi-page, empty-output and malformed-line cases of the three paginated ops`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-registration.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-diagnostic.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-tracker-mapped-ops.test.ts`, `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-config.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-ls-remote.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-rm.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-safe-ref-equivalence.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-registration.test.ts`, `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |
| `ac5` | `src/daemon/tools/__tests__/call-handler.test.ts: caller validation, ToolDeps and sessionId, one done frame, unknown tool, cancellation and approval ownership`, `src/daemon/tools/__tests__/tools-call-cancellation.test.ts: closing the stream cancels the preview, a nested approval wait, running legacy git and gh tools, a multi-command tool, a nested call and the auth probe, within the bound`, `src/daemon/tools/__tests__/direct-spawn-tools-cancellation.test.ts`, `src/daemon/threads/__tests__/method-class.test.ts`, `scripts/__tests__/forbidden-spawn-scan.test.ts: the scan reports every direct spawn and direct builtin execute call in report mode` |
| `ac6` | `scripts/__tests__/forbidden-spawn-scan.test.ts: the scan over src produces the complete site list. This is an s9 and s10 obligation (the old criteria on sites, deletion, same artifacts and the complete list); s7 only supplies the list, and those Stories prove the moves with replacement-table tests` |

## 7. Migration

**State before:** executeTool passes deps.signal only to the approval broker, checks a tool's input schema before the approval request, awaits buildApprovalRequest (which awaits a tool's buildApprovalGate) with no signal context, calls gate().ask(request, deps.signal), starts tool.execute with no recheck and no context for the signal, runs hooks on the continuation after execute, and returns a tool's own failure unchanged (src/daemon/tools/executor.ts, approval-policy.ts, hooks.ts, approval-broker.ts). A subprocess is cancellable only where the tool forwards deps.signal: ghExec accepts opts.signal, but the legacy gh exports, ghExec's 'gh auth status' probe, git_diff and the previews of git_push (without a ref) and git_reset do not forward it; and eight spawn sites in five tool files (shell/exec-detached.ts, k8s/index.ts three, test/index.ts, ssh/index.ts two, cloud/aws/logs.ts) spawn without a process group, attach their handlers to the child right after spawn, kill only the parent from their own abort listener, and settle on 'close' with no bound. callTool runs executeTool(tool.id, ...) and casts result.data without comparing the passed definition with the registered one, and registerTool overwrites an id with a warning (call-tool.ts, registry.ts; the plan records the check as open). The git definitions are exported as plain objects and registered as withFailureNet spread copies (git/index.ts, git/helpers.ts:122); the gh exports and defineGhFamily results are already the withGhFailureNet copies and are registered as they are (gh/helpers.ts:216, gh/op-table.ts:446, gh/index.ts). runShell spawns the child in the parent's process group, kills only the parent on abort, settles on 'close', and never tests an already-aborted signal; runShellBytes tests the signal and kills the process group but settles only on 'error' and 'close', so neither helper bounds settlement after a kill (src/daemon/tools/shell-helper.ts). git_fetch and git_fetch_refs run with a fixed 120 s limit and no signal; git_symbolic_ref and git_show (three commands) run with fixed limits and no signal; git_rev_parse and git_ls_tree use readGit, which takes no signal; git_cat_file passes the signal through runShellBytes but has a fixed 30 s limit. The refresh gives each local call deadline.remainingMs() or 'timeout: left'. All 34 git tool definitions are exported as Tool, imported one by one in git/index.ts, which is the only inventory of them; no list of definitions is exported; the git helper fail() has no aborted case. git config, ls-remote, update-ref and rm are run directly by companion/header.ts, identity.ts, branch-resolution.ts and handoff.ts under the safety rules isSafeRefName and assertSafeArg; gitDiffTool is called directly by grounding.ts and changed-files.ts. The tracker operations exist only as the shell-calling wrappers of src/workflow/tracker/github.ts, which read the paginated lists with 'gh api --paginate' plus a jq filter that prints one value per line and split the output into lines (github.ts lines 284, 351 and 362); the existing gh_project_manage create op returns only { op, ok, target, message }, so ghCreateProject (which needs number and url) has no registry equivalent; FieldSpec has no pattern; the gh op table cannot build an endpoint path from fields, encode a value, emit key=value pairs or supply a constant query value, and its parseJson helper parses one JSON document; registerGhTools registers each gh tool by hand; for command-exit failures ghFailureOf sets failure.original only from probe text, and its spawn-error branch sets original from stderr. There is no tools.call method, no forbidden-spawn scan, no check on which files under src/daemon/tools import node:child_process, and the root tsconfig.json compiles every src/**/*.ts except tests.

**State after:** The executor resolves one effective signal per call (deps.signal combined with the signal already in the call context) and uses it for every cancellation check, for the approval preview (inside the ambient context), for the broker's ask (so a nested gated call is cancelled while it waits) and for tool.execute (inside the ambient context); hooks run in an explicitly cleared context (runWithoutToolSignal), so they never see any tool call's signal, nested calls included. One process lifecycle in shell-helper.ts tests the effective signal before spawn, runs every child in its own process group on non-win32, kills the group on abort or time-out, and settles within 2 s of a kill; runShell and runShellBytes use it and a new streaming entry, spawnManaged, exposes it as a discriminated union ({ spawned: true, child, settled } or { spawned: false, settled } for an already-aborted signal); the eight direct-spawn sites are migrated to spawnManaged, each branching on 'spawned' before it touches the child, with output handling, progress frames and result wording unchanged; an inventory test fails if any other file under src/daemon/tools imports node:child_process. So a tools.call disconnect or the refresh's shared deadline stops every subprocess of every registered tool, previews, probes and secondary commands included, nothing is spawned after an abort, each tool's own limit stays a ceiling, and non-subprocess work is not interrupted (an open question). git_cat_file takes an optional lowerable timeoutMs; a provenance table written only by the two failure-net wrappers records each copy's immediate original, and callTool refuses any registered tool whose chain does not reach the definition passed, while accepting every git definition and every exported gh tool, with an unchanged signature; all git definitions (34 existing plus four new) are inferred objects checked with satisfies TypedTool and listed in one typed gitToolDefinitions list that registerGitTools iterates, whose completeness is enforced by an inventory test, the normal build excludes the type fixtures and a dedicated compile-time check runs in the build; git_config, git_ls_remote, git_update_ref and git_rm exist with contracts that reproduce what their callers read today, schemas equal to the callers' safety rules with every safety condition in the schema so unsafe input is rejected before any approval; FieldSpec has an optional string pattern carried into the input schema and the shared-field comparison; the op table has three additive internal argument variants (path, kv, and qs with constant and field entries and comma join) and a parseJsonLines helper; gh_tracker with 15 ops (including project_create) is defined on them with owner, repo and org names pattern-checked, registered, where the three paginated listings carry --paginate and a fixed -q jq filter so every page is read as one line per item and returned in API order (a bad line is a rejected failure), and keeps the API text in failure.original for command-exit failures, capped at 4000 characters by the seam itself, through an opt-in OpDef field, with every other wrapper mapped to an existing op in a closed, tested table; tools.call exists as a stream method with a validated caller, a defined session id and the cancellation guarantee above; the forbidden-spawn scan runs in the build in report mode. The old wrappers and every call site are unchanged: s9 builds the shared deadline signal and moves the sites, and s10 deletes the wrappers and switches the scan to failing mode.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/daemon/tools/tool-signal.ts (the module-private AsyncLocalStorage, runWithToolSignal, runWithoutToolSignal, currentToolSignal and effectiveToolSignal); in executeTool resolve the effective signal first, run buildApprovalRequest and tool.execute each inside runWithToolSignal(effective, ...), run the hooks (withHooks, runToolHooks) inside runWithoutToolSignal, pass the effective signal to gate().ask and to every cancellation check (before the preview, after it, before the ask and before execute); add the aborted case to the git fail() helper and the optional signal parameter to readGit — ↩ rollbackable
2. Move the process-group kill logic of runShellBytes into one shared lifecycle in shell-helper.ts with the 2 s settlement bound (destroy the streams, settle with what was captured, clear timers and listeners) that tests the effective signal (its own combined with currentToolSignal()) before spawn; make runShell spawn detached on non-win32 and use it, give runShellBytes the same bound (additive aborted field), and add the spawnManaged streaming entry returning the discriminated union { spawned: true, child, settled } or { spawned: false, settled } — ↩ rollbackable _(needs: `step 1 merged so the lifecycle reads the ambient signal`)_
3. Migrate the eight direct-spawn sites to spawnManaged one file at a time (shell/exec-detached.ts, k8s/index.ts three sites, test/index.ts, ssh/index.ts two sites, cloud/aws/logs.ts): branch on 'spawned' first and return the site's usual aborted result when it is false, keep each site's argv, output handling, progress frames and result wording, pass its own limit as timeoutMs, and drop its kill timer and abort listener; add the parity tests before the change and the cancellation tests (including the no-spawn branch) after it; add the child_process inventory test — ↩ rollbackable _(needs: `step 2 merged`)_
4. Pass deps.signal explicitly in git_fetch, git_fetch_refs, git_rev_parse, git_symbolic_ref, git_ls_tree and git_show (checking between its three commands) as defence in depth; add the lowerable timeoutMs input to git_cat_file; keep each fixed limit as a ceiling — ↩ rollbackable
5. Add src/daemon/tools/provenance.ts (the module-private WeakMap, markDefinition, definitionOf and isDefinitionOf); make withFailureNet and withGhFailureNet mark the copy they return with the object passed (the immediate original); add the registered-definition provenance check to callTool (rejected failure when the id is unregistered or isDefinitionOf(registered, tool) is false), leaving its signature unchanged — ↩ rollbackable
6. Change all 34 git tool definitions to inferred objects checked with satisfies TypedTool; add src/daemon/tools/builtins/git/definitions.ts with the typed gitToolDefinitions list and make registerGitTools iterate it; add the inventory test that proves the list is complete; exclude '**/__type-tests__/**' in the root tsconfig.json; add tsconfig.typecheck.json, the type fixtures importing the list and the typecheck:tools script, and add the script to the build chain after tsc — ↩ rollbackable _(needs: `steps 4 and 5 merged so the definitions are edited once`)_
7. Add git_config, git_ls_remote, git_update_ref and git_rm with the contracts in the data model (fields, defaults, argv, outputs, limits, classes, SAFE_REF equal to isSafeRefName, SAFE_PATH forbidding only a NUL, every safety condition in the input schema), add them to gitToolDefinitions, and mark them as built by s7 in the git coverage table — ↩ rollbackable
8. Add the optional string pattern to FieldSpec, pass it in fieldSchema's string branch and add field.name; add the path, kv and qs (constant and field entries, comma join) argument variants to the op table and buildArgv (additive; existing ops untouched); add the parseJsonLines helper beside parseJson; add the optional OpDef diagnostic field and the FAILURE_ORIGINAL_MAX_CHARS constant to the gh op table and ghFailureOf (command-exit failures only; the spawn-error branch is untouched); add the gh_tracker family with its 15 ops (including project_create; the three paginated listings carry --paginate and a fixed -q filter and read their output with parseJsonLines), register it in registerGhTools, add the closed mapped-ops test for the wrappers that map to existing ops, and record the family as s7's amendment in the gh coverage table — ↩ rollbackable
9. Add the tools.call stream handler with its sessionId rule, its params and done types in src/shared/types.ts, its entry in streamHandlers and in the method-class table — ↩ rollbackable _(needs: `steps 1 to 3 merged so the tools it runs honour the signal`)_
10. Add the forbidden-spawn scan to the build chain in report mode with its positive controls and its exemptions — ↩ rollbackable
11. Record the s7 build in docs/plans/tool-registry.md with the tool list, mark the callTool prerequisite done, and note the hand-over to s9 (the shared deadline signal in the refresh) and s10 — ↩ rollbackable

**Backward compat:** Every existing tool id, input shape and approval class is unchanged (k7), and no existing tool definition changes for cancellation except the five tool files that spawn their own processes, whose output, progress frames and result wording stay as recorded by the parity tests. A call without a signal and outside any context behaves as today; the ambient context is absent for code that does not run under executeTool (the indexer, the self-update, plain wrappers); a preview that runs no subprocess is built exactly as today; hooks behave as they do for a direct call whoever called the tool, because they run with no tool signal. The new ShellResult field, the readGit parameter, the OpDef diagnostic field, the FieldSpec pattern, the op-table argument variants, the parseJsonLines helper and the git_cat_file timeoutMs are optional or additive and no existing op uses the new variants or a pattern. A call that is neither aborted nor timed out settles as before; one that is killed now ends its whole process group and settles within 2 s, including for the five tool files (shell:exec-detached with a command form now ends its children too, which is the intended change); an already-aborted call spawns nothing. A tool run through executeTool with a signal now has its subprocesses killed when that signal aborts. callTool keeps its signature and works for every tool registered by registerGitTools (the wrapper marks its copy from the exported definition) and registerGhTools (the exported object is the registered object), and for a tool registered without a wrapper; only an unlinked replacement of a definition is refused. The existing git tools keep their ids and registration order; registration now iterates gitToolDefinitions. The new git tools accept every ref, remote and path their callers accept today. The tracker listing ops return the same items in the same order as the current wrappers. Existing gh failure objects, including the spawn-error branch, are unchanged because only the gh_tracker ops opt in, and the executor's treatment of failures is unchanged. The new tools and the new method are additive. The type check only adds a build step and the root build now excludes the fixtures. The scan runs in report mode, so the build does not fail on the sites s9 and s10 will move. The old wrappers and all call sites remain until s9 and s10.

## 8. Alternatives considered

### 8.1 a1: Revision 11 design with line-delimited framing for the paginated tracker ops — **CHOSEN**

Keep the universal lifecycle, discriminated spawnManaged, cleared hook context and corrected preview; give comments_list, issues_by_labels and issues_titles a fixed -q jq filter and a line-splitting builder.

Everything in revision 11 stays. The three paginated gh_tracker ops keep --paginate and the path with qs, and add lit('-q', <fixed jq filter>) so gh prints one JSON object (or number) per line across all pages: comments_list '.[] | {id, author: .user.login, text: .body, at: .created_at, url: .html_url}', issues_by_labels '.[] | select(.pull_request | not) | .number', issues_titles '.[] | select(.pull_request | not) | {number, title}'. The filter is a constant of the op definition, never an input. Each op's custom builder splits stdout by lines through parseJsonLines, skips blank lines, JSON-parses each line in order and returns a rejected failure naming the first line that does not parse. Tests gain exact argv fixtures ending with -q and the filter and multi-page fixtures (two pages concatenated as lines, more than 100 items, empty output, a malformed line).

### 8.2 a2: Use gh api --slurp and flatten the page arrays

Replace the line framing by --slurp, which wraps all pages in one outer JSON array that the builder flattens.

Pass --slurp with --paginate so stdout is one JSON array of page arrays; the builder JSON-parses once, flattens one level and filters pull requests in code.

**Rejected because:** Partial on ac1 and ac3: it depends on a gh release that is not verified here and re-derives the wrappers' filtering in code.

### 8.3 a3: Leave --paginate with a single JSON parse

Keep the revision 11 contract and accept that multi-page results are not guaranteed.

Do not change the framing; document that results over 100 items may fail to parse.

**Rejected because:** Violates ac1 and ac3: any list longer than one page fails to parse, so callers cannot move onto it and tracker records would differ from today.

## 9. References

- **[[c1]]** `analyze-bundle` `executor pipeline, approval preview, approval ask and hooks` — "then calls gate().ask(request, deps.signal) (executor.ts:129)"
- **[[c2]]** `analyze-bundle` `approval-preview constructors that start subprocesses, and what they do when a read fails` — "Neither builder throws when its git command is killed: each returns a preview object."
- **[[c3]]** `analyze-bundle` `registered tools that spawn processes themselves, and how they consume the child` — "That is eight spawn sites in five files."
- **[[c4]]** `analyze-bundle` `where a running tool's subprocess gets its cancellation signal today, via the shared helpers` — "clearing a context needs an explicit run with an undefined store"
- **[[c5]]** `analyze-bundle` `registration and the failure-net wrappers` — "the gh exports and defineGhFamily results are already the withGhFailureNet copies and registerGhTools registers them as they are"
- **[[c6]]** `analyze-bundle` `git/index.ts as the only inventory of git tool definitions` — "a list declared 'as const satisfies readonly TypedTool[]' checks only its listed elements"
- **[[c7]]** `analyze-bundle` `gh op table FieldSpec, Arg variants, the tracker wrappers and how they read paginated gh api output` — "gh api --paginate prints one JSON array per page, so concatenated pages are not a single JSON document; the line-delimited jq output is what makes multi-page results parseable"
- **[[c8]]** `analyze-bundle` `the project wrappers of the tracker and the existing project tools` — "the existing gh_project_manage op 'create' (src/daemon/tools/builtins/gh/manage.ts:217) returns only { op, ok, target, message }"
- **[[c9]]** `doc` `docs/plans/tool-registry.md` — "s7 split into s7, s9 and s10 (decided 2026-10-26)"
- **[[c10]]** `analyze-bundle` `the real callers of the four new git tools, their safety rules, the refresh deadline and the shell helpers (revision 6 bundle)` — "isSafeRefName (src/workflow/team/sighting-store.ts:60) accepts any script, '+', '#' and Unicode"
- **[[c11]]** `analyze-bundle` `IPC handler shapes, the trusted context and the session id (revision 6 bundle)` — "TrustedRpcContext (src/daemon/request-context.ts) has connectionIdentity (string) and no sessionId"
- **[[c12]]** `analyze-bundle` `how type checks and tests run (revision 6 bundle)` — "tsconfig.json includes 'src/**/*.ts' and 'src/**/*.tsx'"

## 10. Open questions

- The HLD boundary for s7 and DEF section 6.7 still describe the whole cutover (old ac1 to ac6, size XL); the narrowing to five foundation criteria is recorded only in docs/plans/tool-registry.md because the amendment tool is HLD-only. This LLD numbers its acceptance mapping by the five effective criteria (ac1 to ac5) and uses ac6 for the moved site list that s9 and s10 own. The DEF may need a revision for s7 (title, size L, five criteria).
- The cancellation guarantee covers subprocesses. Registered tools that do non-subprocess work (in-process HTTP calls, database or file operations) are not interrupted by the signal; whether they should be is not decided here.
- Audit items graded partial: dm1 (the call sites for the scan exemptions, the IPC handler and the tsconfig come from earlier bundles and the plan note, not from an s1 bundle of this run) and sbdry5 (the four s8 git commands, the callTool provenance check and the universal cancellation lifecycle, which migrates five non-git tool files, are built here by the user's decisions of 2026-10-26 and the plan note, and the sending side of the shared deadline is s9's).

## Resolved questions

- `q2fffee10` — The HLD boundary for s7 and DEF section 6.7 still describe the whole cutover (old ac1 to ac6, size XL); the narrowing to five foundation criteria is recorded only in docs/plans/tool-registry.md because the amendment tool is HLD-only. This LLD numbers its acceptance mapping by the five effective criteria (ac1 to ac5) and uses ac6 for the moved site list that s9 and s10 own. The DEF may need a revision for s7 (title, size L, five criteria).
  - **resolved**: Align DEF now; retain HLD history — User chose option 3: revise the DEF for s7 (title, size L, five criteria) while the HLD keeps its whole-cutover description with a reference to the narrowing. _(2026-10-26T18:11:35.078Z)_
- `q729df4d8` — The cancellation guarantee covers subprocesses. Registered tools that do non-subprocess work (in-process HTTP calls, database or file operations) are not interrupted by the signal; whether they should be is not decided here.
  - **resolved**: Subprocess-only cancellation — User chose option 1. _(2026-10-26T18:12:36.503Z)_
- `q9926b80d` — Audit items graded partial: dm1 (the call sites for the scan exemptions, the IPC handler and the tsconfig come from earlier bundles and the plan note, not from an s1 bundle of this run) and sbdry5 (the four s8 git commands, the callTool provenance check and the universal cancellation lifecycle, which migrates five non-git tool files, are built here by the user's decisions of 2026-10-26 and the plan note, and the sending side of the shared deadline is s9's).
  - **resolved**: Proceed with explicit provenance and boundaries — User chose option 1. _(2026-10-26T18:13:27.676Z)_

## Citations

- **[[c1]]** `analyze-bundle` `executor pipeline, approval preview, approval ask and hooks` — "then calls gate().ask(request, deps.signal) (executor.ts:129)"
- **[[c2]]** `analyze-bundle` `approval-preview constructors that start subprocesses, and what they do when a read fails` — "Neither builder throws when its git command is killed: each returns a preview object."
- **[[c3]]** `analyze-bundle` `registered tools that spawn processes themselves, and how they consume the child` — "That is eight spawn sites in five files."
- **[[c4]]** `analyze-bundle` `where a running tool's subprocess gets its cancellation signal today, via the shared helpers` — "clearing a context needs an explicit run with an undefined store"
- **[[c5]]** `analyze-bundle` `registration and the failure-net wrappers` — "the gh exports and defineGhFamily results are already the withGhFailureNet copies and registerGhTools registers them as they are"
- **[[c6]]** `analyze-bundle` `git/index.ts as the only inventory of git tool definitions` — "a list declared 'as const satisfies readonly TypedTool[]' checks only its listed elements"
- **[[c7]]** `analyze-bundle` `gh op table FieldSpec, Arg variants, the tracker wrappers and how they read paginated gh api output` — "gh api --paginate prints one JSON array per page, so concatenated pages are not a single JSON document; the line-delimited jq output is what makes multi-page results parseable"
- **[[c8]]** `analyze-bundle` `the project wrappers of the tracker and the existing project tools` — "the existing gh_project_manage op 'create' (src/daemon/tools/builtins/gh/manage.ts:217) returns only { op, ok, target, message }"
- **[[c9]]** `doc` `docs/plans/tool-registry.md` — "s7 split into s7, s9 and s10 (decided 2026-10-26)"
- **[[c10]]** `analyze-bundle` `the real callers of the four new git tools, their safety rules, the refresh deadline and the shell helpers (revision 6 bundle)` — "isSafeRefName (src/workflow/team/sighting-store.ts:60) accepts any script, '+', '#' and Unicode"
- **[[c11]]** `analyze-bundle` `IPC handler shapes, the trusted context and the session id (revision 6 bundle)` — "TrustedRpcContext (src/daemon/request-context.ts) has connectionIdentity (string) and no sessionId"
- **[[c12]]** `analyze-bundle` `how type checks and tests run (revision 6 bundle)` — "tsconfig.json includes 'src/**/*.ts' and 'src/**/*.tsx'"
