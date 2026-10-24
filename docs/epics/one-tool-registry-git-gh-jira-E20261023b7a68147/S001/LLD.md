<!-- insrc:artifact LLD-b7a68147dcf72034-s1 -->

# LLD: STORY-b7a68147dcf72034-s1

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `8118b9bf1de5...`

A rule that must follow an operation, such as refreshing tracker status after a push, is registered once against the tool's id and then runs after every successful call of that tool, whoever made the call. The executor runs the rules one after another in registration order at its two success exits; a rule that fails is reported on the result (and in the result's text) and never turns the success into a failure. Failed and denied calls run no rule.

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

**Rollout phase:** Phase A — executor pipeline stages
**Owns:** `sc1` (Tool hook registry)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s3`: The approval step at step 2 of the pipeline: the single approval field on a tool definition, the global approval setting for the common class and its default, the IPC request and answer methods, the timeout value, the daemon-side holder of the pending requests, the terminal-client, editor and chat implementations of the answer, and removal of the 'auto-approving' fallback in executor.ts. It maps every existing requiresApproval flag, in every family, to the common class, and lists the tools that change. It does not choose which individual git, gh or Jira operations are destructive; each family Story marks its own. — owns `sc4`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s5`: The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.
- `s6`: The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.
- `s7`: The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `registerToolHook`

```typescript
registerToolHook(hook: ToolHook): void
```

**Parameters:**
- `hook: ToolHook` — The rule: its id, the canonical id of the tool it follows and its run function.

**Returns:** `void` — The hook is appended to the list for hook.toolId; it runs on every later successful call of that tool.

**Errors:**
- `Error` when A hook with the same toolId and id is already registered, or hook.id or hook.toolId is empty. This is a programming error found at start-up, so it throws. It also throws when a tool is already registered and hook.toolId resolves, through getTool, to a tool with a different id (an alias given in place of the canonical id).

**Preconditions:**
- Called from daemon start-up code, not from a request handler
- The tool need not be registered yet; tools and hooks may register in either order

**Postconditions:**
- Hooks for one tool run in the order they were registered
- A hook for a tool id that is never registered never runs and is not an error
- A hook is registered under the tool's canonical id; a call that reaches the tool through an alias runs the same hooks, once

### 2.2 `runToolHooks`

```typescript
runToolHooks(tool: Tool, input: unknown, result: ToolResult, deps: ToolDeps): Promise<readonly HookFailure[]>
```

**Parameters:**
- `tool: Tool` — The tool definition getTool resolved for the call; hooks are looked up by tool.id, its canonical id, never by the name the caller used.
- `input: unknown` — The input the tool ran with; each hook receives its own deep copy.
- `result: ToolResult` — The successful, checked result. Each hook receives its own deep copy (structuredClone), so nothing a hook does to it reaches the caller.
- `deps: ToolDeps` — Supplies the caller identity for the hook context.

**Returns:** `readonly HookFailure[]` — One entry per hook that threw or rejected, in registration order; empty when every hook passed or none is registered.

**Preconditions:**
- result.success is true and, where the tool declares an output schema, the data fit it

**Postconditions:**
- Never throws: each hook runs in its own try/catch and a failing hook does not stop the next
- Hooks run strictly one after another, never in parallel
- Each failure is logged with the hook id, the tool id and the caller
- Each hook gets a fresh structuredClone of input and result; a hook that mutates its copy, nested data included, changes nothing the caller or a later hook sees
- The stage has no cancellation bound: a hook that never settles holds the call (see error paths)

### 2.3 `executeTool`

```typescript
executeTool(toolId: string, input: ToolInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `toolId: string` — Unchanged.
- `input: ToolInput` — Unchanged.
- `deps: ToolDeps` — Unchanged.

**Returns:** `Promise<ToolResult>` — Unchanged except that a successful result may carry hookFailures and, when it does, its output text ends with one line per failed rule.

**Postconditions:**
- Hooks run only at the two success exits (no output schema, and output schema check passed), never on a failed, denied, rejected or schema-mismatch result
- A result with a hook failure keeps success true and keeps data and format as the tool returned them
- A call with no hook registered returns exactly the object the tool returned, as today
- Hooks are chosen by the resolved tool.id, so an alias call and a canonical-id call run the same hooks exactly once

### 2.4 `callTool`

```typescript
callTool<T extends TypedTool>(tool: T, input: Static<T['inputSchema']>, deps: ToolDeps): Promise<TypedToolResult<Static<T['outputSchema']>>>
```

**Parameters:**
- `tool: T` — Unchanged.
- `input: Static<T['inputSchema']>` — Unchanged.
- `deps: ToolDeps` — Unchanged.

**Returns:** `Promise<TypedToolResult<...>>` — The success variant gains an optional hookFailures copied from the executor's result.

**Postconditions:**
- hookFailures is present on the success variant only when at least one rule failed

## 3. Data model changes

### 3.1 `ToolHook` — new

interface ToolHook { readonly id: string; readonly toolId: string; run(ctx: ToolHookContext): Promise<void> }. toolId is a canonical tool id. The id is unique per tool id. A hook signals failure by throwing or rejecting; a returned value is ignored.

**Call sites:**
- `src/daemon/tools/executor.ts:132`
- `src/daemon/tools/executor.ts:138`

### 3.2 `ToolHookContext` — new

interface ToolHookContext { readonly toolId: string; readonly input: unknown; readonly result: Readonly<ToolResult>; readonly caller: 'agent' | 'daemon' | 'workflow' | undefined }. toolId is the canonical tool.id. input and result are per-hook deep copies. The caller is deps.caller, which s3 made optional; the HLD sketch shows it required, so a hook must accept an unset caller. The context carries no signal.

**Call sites:**
- `src/daemon/tools/types.ts`

### 3.3 `HookFailure` — new

interface HookFailure { readonly hookId: string; readonly message: string }. The message is the thrown error's message, cut to 500 characters.

**Call sites:**
- `src/daemon/tools/types.ts`

### 3.4 `ToolResult` — field-add

Adds hookFailures?: readonly HookFailure[] | undefined (the ToolResultHookReport of the sketch, merged into ToolResult). Set only when at least one rule failed; absent otherwise, so a result with no failed rule is unchanged (ac5). When set, the executor also appends one line per failure to output in the form `[hook failed] <hookId>: <message>`, so a consumer that only reads the text (the agent loop) is told too.

```
+ hookFailures?: readonly HookFailure[] | undefined
```

**Call sites:**
- `src/daemon/tools/types.ts:76-93`
- `src/agent/read-only-tool-loop.ts:78`

### 3.5 `TypedToolResult` — field-add

The success variant gains hookFailures?: readonly HookFailure[] | undefined; callTool copies it from the executor result, otherwise the typed workflow path would lose the report.

```
+ readonly hookFailures?: readonly HookFailure[] | undefined  (success variant)
```

**Call sites:**
- `src/daemon/tools/call-tool.ts:26-39`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | s1 owns sc1. ToolHook, ToolHookContext, HookFailure and registerToolHook follow the HLD sketch. Two refinements: ToolHookContext.caller accepts undefined because ToolDeps.caller is optional, and ToolResultHookReport is merged into ToolResult as the optional hookFailures field. runToolHooks is the executor-internal run point and is also exported for tests. s7 consumes sc1 by calling registerToolHook for the tracker-status refresh and similar rules. Hooks are keyed by the canonical tool.id that getTool resolves, so aliases share their tool's hooks. |

## 5. Error paths

**Error cases**

- **A rule throws or its promise rejects after the tool succeeded** (recoverable)
  - Detection: runToolHooks awaits each hook inside its own try/catch and catches the thrown value
  - Response: The failure is recorded as a HookFailure {hookId, message}, logged with the tool id and caller, the next rule still runs, and the result stays success:true with hookFailures set and one `[hook failed] <hookId>: <message>` line appended to output
  - User impact: The caller sees the tool's success and a clear note that a follow-on rule did not complete
- **A rule throws something that is not an Error (a string, an object or undefined)** (recoverable)
  - Detection: The catch calls a describe step that is itself guarded by try/catch: an Error gives its message; anything else is converted with String(value) inside that guard; a conversion that throws (a null-prototype object, a throwing toString or Symbol.toPrimitive) or gives empty text falls back to a fixed text ('the rule failed with a value that could not be described' or 'the rule failed with no message')
  - Response: Same as above; the failure line is always non-empty and building it cannot throw, so it can neither stop later rules nor reach executeTool's outer catch
  - User impact: A readable failure line instead of a crash in the executor
- **A rule never settles** (terminal)
  - Detection: Not detected by the hook stage. The stage awaits the rule; ToolHookContext carries no signal, and neither executeTool nor callTool races a call against cancellation (the read-only tool loop races its own signal around dispatch, which bounds what that caller waits for, not the rule)
  - Response: The call waits as long as the rule does. A rule is code registered at start-up by this repository, so a hanging rule is a defect in that rule. The LLD states this limit and designs no cancellation, because abandoning the call would leave the rule running after its failure was reported
  - User impact: A hung rule holds the caller; it is found by the per-hook log line written before the rule starts
- **registerToolHook is called twice with the same toolId and hook id, or with an empty id or toolId** (terminal)
  - Detection: Checked at registration against the existing list for that tool id
  - Response: Throws an Error naming the hook; nothing is added
  - User impact: The daemon fails at start-up with a clear message, not later at run time
- **A hook mutates the input or result it was given, including nested data** (recoverable)
  - Detection: Each hook receives its own structuredClone of input and result taken just before it runs, so the mutation lands on a copy; nothing needs to be detected
  - Response: The copy is discarded when the hook returns or throws; the object the caller receives, nested data included, is the executor's own and is untouched, and a later hook starts from a fresh copy. If the clone itself fails (a function or other non-cloneable value inside data) that hook is reported as failed with 'the result could not be copied for the rule' and its run is skipped, the remaining hooks still run
  - User impact: A rule cannot change what the caller gets back, even by editing nested data after the schema check

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tool with no hook registered succeeds | executeTool returns the very object the tool returned, with no hookFailures key and no change to output |
| A tool fails, is denied, is rejected by the input check or fails the output check | No rule runs and hookFailures is absent (ac3) |
| A tool succeeds with no outputSchema declared | Rules run at the no-schema exit, so a hook is not skipped just because the tool has no schema |
| Two rules are registered for one tool, the first throws | The second still runs and the report holds only the first rule's failure (ac4) |
| Rules registered for two different tools, one tool called | Only that tool's rules run |
| A call whose deps.caller is not set | The hook context carries caller undefined and the rule runs |
| A rule's error message is very long | The HookFailure message is cut to 500 characters; the output line uses the cut text |
| A rule calls executeTool for another tool that also has rules | The inner call runs its own rules once; a rule on the same tool id calling itself is the rule author's loop and is not guarded |
| A tool is called through an alias (getTool resolves aliases to the canonical tool) | The hooks registered for the canonical id run exactly once; the call by the canonical id and by the alias behave the same |
| A rule is registered under an alias name instead of the canonical id | registerToolHook throws, naming the canonical id to use, when the tool is already registered and hook.toolId resolves to a tool with a different id. When the tool is not registered yet the hook is stored as given (registration order between tools and hooks is free), and a hook left under a name no tool resolves to never runs. |
| A rule throws a null-prototype object or a value whose toString throws | The failure line reads 'the rule failed with a value that could not be described' and the next rule still runs |
| A rule changes result.data.total on its copy, then throws | The caller's result.data.total is unchanged and hookFailures holds the rule's failure |

**Invariants to preserve**

- A tool result's success flag, data, format and failure kind are what the tool and the executor's own checks decided; a rule can add a report to a success but never change those [[c2]]
- Every tool id that agents use today keeps working with the same input and the same result shape; the only new thing a caller can see is the optional hookFailures and the extra output lines for a failed rule [[c3]]
- Order of the executor's stages is unchanged: input check, approval, execute, output check, then rules; a rule never runs before the approval step has been answered [[c4]]
- A rule runs after the output check, so a result that failed its schema is never passed on to a rule or to the caller as a success [[c2]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), test files named *.test.ts under __tests__ next to the code, using the fakeTool helper in src/daemon/tools/__tests__/_fakes.ts`

**Test levels**

- **unit** — The hook registry and the run point, without the executor
  - Subjects: `registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId`, `runToolHooks runs hooks serially in registration order, catches a throw or rejection, cuts a long message to 500 characters, and gives each hook its own structuredClone of input and result`, `HookFailure report shape`, `failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw`, `a hook that mutates nested result.data, with and without then throwing, leaves the caller's result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest`, `registerToolHook refuses an alias in place of a canonical id`
  - Fixtures: `a reset seam for the module-level registry (_resetToolHooksForTests)`
- **integration** — The executor with real hooks on registered fake tools: where the stage runs and what the caller gets back
  - Subjects: `executeTool runs a registered rule once after a successful call for caller agent, daemon, workflow and unset`, `a failing rule leaves success true, data and format unchanged, sets hookFailures and appends the [hook failed] line`, `a failed tool, a denied call, an input rejection and a schema-mismatch run no rule`, `two rules on one tool run in order and the first failing does not stop the second`, `a successful call with no rule returns the same object the tool returned`, `a tool with no outputSchema still runs its rules`, `callTool copies hookFailures onto the typed success result and omits it when nothing failed`, `a tool called through an alias runs the canonical id's hooks exactly once`
  - Fixtures: `fakeTool from src/daemon/tools/__tests__/_fakes.ts`, `the approval gate and common-approval seams from s3 (_setApprovalGateForTests, _setCommonApprovalForTests) to produce a denial`
- **contract** — The existing tool surface is unchanged for agents (ac5)
  - Subjects: `the read-only tool loop still returns the tool's output text unchanged when no rule is registered`, `the 228-tool snapshot in src/daemon/tools/__tests__/fixtures/approval-snapshot.json still matches, so no tool id or input schema moved`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/tools/__tests__/tool-hooks.test.ts: a registered rule runs once after a successful call for each caller (agent, daemon, workflow, unset)`, `src/daemon/tools/__tests__/tool-hooks.test.ts: a tool with no outputSchema still runs its rules`, `src/daemon/tools/__tests__/tool-hooks.test.ts: a tool called through an alias runs the canonical id's rule exactly once` |
| `ac2` | `src/daemon/tools/__tests__/tool-hooks.test.ts: a failing rule leaves the result a success and reports the failure on hookFailures and in the output text`, `src/daemon/tools/__tests__/tool-hooks.test.ts: callTool carries hookFailures onto the typed success result`, `src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that throws a null-prototype object or a value with a throwing toString is reported with a fixed text` |
| `ac3` | `src/daemon/tools/__tests__/tool-hooks.test.ts: a failed, denied, rejected or schema-mismatch call runs no rule` |
| `ac4` | `src/daemon/tools/__tests__/tool-hooks.test.ts: rules run in registration order and a failing rule does not stop the next`, `src/daemon/tools/__tests__/tool-hooks.test.ts: runToolHooks runs hooks one at a time` |
| `ac5` | `src/daemon/tools/__tests__/tool-hooks.test.ts: a call with no rule returns the object the tool returned`, `src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool snapshot is unchanged`, `src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that mutates nested result data leaves the caller's result untouched` |

## 7. Migration

**State before:** executeTool in src/daemon/tools/executor.ts:63-156 returns the tool's own result at two success exits (lines 132 and 138) and has no stage after the output check. ToolResult (src/daemon/tools/types.ts:76-93) carries no report of follow-on work, and callTool (src/daemon/tools/call-tool.ts:26-39) rebuilds a typed result from success, data and output only. No hook registry exists.

**State after:** A hooks module src/daemon/tools/hooks.ts holds rules by tool id; executeTool runs them at its two success exits through one helper; ToolResult and the success variant of TypedToolResult carry an optional hookFailures, and a failed rule also adds a line to output. With no rule registered, behaviour is byte-for-byte what it is today.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the ToolHook, ToolHookContext and HookFailure types and the optional hookFailures field on ToolResult in src/daemon/tools/types.ts — ↩ rollbackable
2. Add src/daemon/tools/hooks.ts with registerToolHook (refuses an alias of an already registered tool), runToolHooks (looked up by the resolved tool.id, a structuredClone per hook, guarded failure text) and a test reset seam; export registerToolHook from src/daemon/tools/index.ts — ↩ rollbackable
3. Route the two success exits of executeTool through one helper that passes the resolved tool to runToolHooks, and sets hookFailures and the output lines only when a rule failed — ↩ rollbackable
4. Add hookFailures to the success variant of TypedToolResult and copy it in callTool — ↩ rollbackable
5. Add tool-hooks.test.ts for the five criteria and run the executor, call-tool and approval-class-mapping tests unchanged — ↩ rollbackable
6. Document the hook stage and the report in docs/daemon.md next to the approval section; no rule is registered by this Story (s7 registers the first ones) — ↩ rollbackable

**Backward compat:** No public API changes shape for existing callers. executeTool and callTool keep their signatures; the new fields are optional and absent unless a rule failed; a tool with no rule returns the very object it returned before. No rule is registered in this Story, so no current call changes behaviour. The vscode-plugin and JetBrains clients see tool results over IPC only as text and are unaffected.

## 8. Alternatives considered

### 8.1 a1: Registry module and one run point in the executor — **CHOSEN**





### 8.2 a2: Hooks declared on the Tool definition





**Rejected because:** Behaviour is equal to a1, but it ties a rule to the tool's file and departs from the contract s7 consumes.

### 8.3 a3: Fire-and-forget event after the result





**Rejected because:** Fails ac2, ac4 and sc1.

## 9. References

- **[[c1]]** `code` `src/daemon/tools/executor.ts:63-156`
- **[[c2]]** `code` `src/daemon/tools/types.ts:76-93`
- **[[c3]]** `code` `src/daemon/tools/call-tool.ts:26-39`
- **[[c4]]** `doc` `docs/plans/tool-registry.md`

## 10. Open questions

- cd1 (partial): runToolHooks is a new executor-internal helper that sc1 does not name; the contract lists it as new and exported for tests.
- ep2 (partial): a rule that never settles is not detected by the hook stage; the LLD records it as a known limit and adds no timeout.
- ep3 (partial): invariantsToPreserve rest on the s1 bundle for executor.ts and types.ts; the source field holds a citation id as the schema requires.
- alt2 (partial): k1 to k6 were not scored per alternative; none of them is touched by a post-success rule stage.
- sbdry3 (partial): ToolHookContext.caller allows undefined (ToolDeps.caller is optional since s3) and ToolResultHookReport is merged into ToolResult; both refine the sc1 sketch and may need a sharedContract amendment.
- Review round 1 (4 HIGH) revised this LLD: hooks keyed by canonical tool.id, a per-hook deep copy instead of a shallow freeze, guarded failure text, and an accurate statement that the hook stage has no cancellation bound.

## Resolved questions

- `q2b101b1e` — cd1 (partial): runToolHooks is a new executor-internal helper that sc1 does not name; the contract lists it as new and exported for tests.
  - **resolved**: Internal helper with test export — sc1 refinement recorded in docs/plans/tool-registry.md _(2026-10-24T14:16:10.663Z)_
- `q8e8b12c1` — ep2 (partial): a rule that never settles is not detected by the hook stage; the LLD records it as a known limit and adds no timeout.
  - **resolved**: Accept the known limit — No timeout; the LLD states the hook stage has no cancellation bound _(2026-10-24T14:17:10.924Z)_
- `q4e665925` — ep3 (partial): invariantsToPreserve rest on the s1 bundle for executor.ts and types.ts; the source field holds a citation id as the schema requires.
  - **ignored**: left to implementer judgment — Schema note; the invariants are explicit in the LLD _(2026-10-24T14:18:06.766Z)_

## Citations

- **[[c1]]** `code` `src/daemon/tools/executor.ts:63-156`
- **[[c2]]** `code` `src/daemon/tools/types.ts:76-93`
- **[[c3]]** `code` `src/daemon/tools/call-tool.ts:26-39`
- **[[c4]]** `doc` `docs/plans/tool-registry.md`
