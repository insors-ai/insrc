<!-- insrc:artifact LLD-b7a68147dcf72034-s3 -->

# LLD: STORY-b7a68147dcf72034-s3

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**HLD base run:** `wf-1792748380403-lgvbgd`
**HLD effective hash:** `49d9b4a4eaf4...`

This Story replaces the executor's 'auto-approving' fallback with a daemon-owned approval broker. A tool declares one approval class (none, common or destructive); a destructive call always asks the user, a common call follows the global setting or the chat's edits mode, and a call nobody answers is denied. Clients (terminal client, editor, chat) open an approval stream, show the exact call and answer over one RPC.

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
**Owns:** `sc4` (Approval class and approval exchange)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The hook stage inside executeTool: the registry of hooks keyed by tool id, registration order, the rule that a hook runs only after a successful, checked call, and the way a hook failure is carried on the result. It places its stage at step 5 of the pipeline order in the architecture shape and does not own the schema check or the approval step. — owns `sc1`
- `s2`: The optional output-schema field and the check at step 4 of the pipeline, the typed call helper that takes a tool definition, the serial conversion queue, the key-value cross-check and the one-time escalation, and the shared failure kinds. It includes the choice of schema language and the way an input-to-tool mismatch is reported. It does not declare or read the approval class. — owns `sc2`, `sc3`, `sc5`
- `s4`: The list of git operation families, their input and output schemas, which git operations are in the destructive class (for example force push, hard reset, clean, deleting a branch or tag), and the parsing of git porcelain output. Operations that need approval but cannot destroy work stay in the common class. Existing git ids keep their meaning.
- `s5`: The list of gh operation families, their schemas (read from gh --json where it exists, converted from text otherwise, for example gh pr diff and gh run view --log), which of the 27 gh operations that need approval are in the destructive class, and the 120 second time limit and its message. Existing gh ids keep their meaning.
- `s6`: The Jira tool families over acli (work item view, search, create, edit, transition, assign, comment, link, project list and view), their schemas, the --yes flag on every mutating command, the bounded forms of search and project list that acli requires, the 'acli jira auth status' sign-in check, and which operations are in the destructive class. An operation acli does not offer is left out and named as unsupported.
- `s7`: The repository check that fails on a direct git, gh or acli spawn outside src/daemon/tools, built first; the inventory it produces (about 32 production files known today, with the indexer, the design corpus reader, the analyze ignore filter, the understanding identity lookup and the daemon self-update included and no allowlist); the rewrite of every listed site and of the tests that import the old wrappers onto the typed helper; and the removal of runGit, commitAndPushArtifacts and the github.ts wrappers. It keeps the artifacts, commits and tracker records the same as before.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ApprovalGate.ask`

```typescript
ask(req: ApprovalRequest): Promise<ApprovalAnswer | ApprovalDenial>
```

**Parameters:**
- `req: ApprovalRequest` — The exact call: tool id, class, repository, arguments, preview, expiry.

**Returns:** `Promise<ApprovalAnswer | ApprovalDenial>` — The user's answer, or the reason no answer was given: declined, timed-out, no-client or cancelled.

**Errors:**
- `none thrown` when Every failure to get an answer resolves to an ApprovalDenial; the broker never rejects.

**Preconditions:**
- req.requestId is unique among pending requests.
- req.expiresAt is in the future.

**Postconditions:**
- The request is removed from the pending table before the promise settles.
- Zero open approval streams resolves to 'no-client' without waiting.
- An expired timer resolves to 'timed-out'; a late answer is ignored.

### 2.2 `executeTool`

```typescript
executeTool(toolId: string, input: ToolInput, deps: ToolDeps): Promise<ToolResult>
```

**Parameters:**
- `toolId: string` — Registered tool id.
- `input: ToolInput` — Call arguments; also used to resolve a per-input approval class.
- `deps: ToolDeps` — Gains caller and approvalMode (set by the entry point, never read for the destructive class).

**Returns:** `Promise<ToolResult>` — The tool's result, or a failed result carrying a denied ToolFailure.

**Errors:**
- `ToolFailure(kind 'denied')` when The approval was declined, timed out or had no client; the tool did not run.

**Preconditions:**
- The tool is registered.

**Postconditions:**
- A destructive call has asked the broker once for this exact call before execute ran.
- A common call asks only when the effective mode is manual or edit-auto.
- The 'auto-approving' fallback is gone.

### 2.3 `Tool.approval`

```typescript
readonly approval?: ApprovalClass | ((input: ToolInput) => ApprovalClass)
```

**Returns:** `ApprovalClass` — none (default), common or destructive.

**Postconditions:**
- It replaces requiresApproval and destructive. Mapping: requiresApproval true becomes common, a predicate becomes a per-input function returning common or none, false or absent becomes none; the eight destructive:true builtins become destructive.

### 2.4 `Tool.buildApprovalGate`

```typescript
buildApprovalGate?(input: ToolInput): ToolApprovalGate | Promise<ToolApprovalGate>
```

**Parameters:**
- `input: ToolInput` — The call's arguments.

**Returns:** `ToolApprovalGate` — Title and content used as the request preview.

**Postconditions:**
- Kept as the preview source; its actions field is ignored by the broker.

## 3. Data model changes

### 3.1 `ApprovalClass / Tool.approval` — field-add

New field on Tool replacing requiresApproval and destructive. Value is a class or a per-input function.

```
- requiresApproval?: boolean | (input) => boolean
- destructive?: boolean
+ approval?: ApprovalClass | (input) => ApprovalClass
```

**Call sites:**
- `src/daemon/tools/types.ts:110-128`
- `src/daemon/tools/executor.ts:41-48`
- `src/daemon/tools/builtins/git/push.ts`
- `src/daemon/tools/builtins/cloud/aws/s3.ts:210`
- `src/daemon/tools/builtins/k8s/index.ts:340`
- `src/docgen/tool.ts:56`

### 3.2 `ToolDeps` — field-add

Adds caller ('agent' | 'daemon' | 'workflow') for logging and approvalMode ('manual' | 'edit-auto' | 'auto', optional) set by the entry point from the chat's edits mode; absent means the global flag. Neither is read for the destructive class. Of the four ToolDeps builders only src/analyze/context/driver.ts and src/agent/providers/ollama.ts reach executeTool; src/workflow/code-review/grounding.ts and src/workflow/runners/build/changed-files.ts call the read-only git_diff tool's execute directly, so no approval step runs for them and this field does not govern them until s7 moves them onto the typed helper.

```
+ caller?: 'agent' | 'daemon' | 'workflow'
+ approvalMode?: CommonApprovalMode
```

**Call sites:**
- `src/daemon/tools/types.ts:50-81`
- `src/analyze/context/driver.ts:1132`
- `src/agent/providers/ollama.ts:686`
- `src/workflow/code-review/grounding.ts:370`
- `src/workflow/runners/build/changed-files.ts:110`

### 3.3 `ApprovalRequest / ApprovalAnswer / ApprovalDenial` — new

Request carries requestId, toolId, approvalClass, repoPath (input cwd, else deps.repoPath), arguments, preview, reason, expiresAt. Answer carries requestId and decision. Denial is one of declined, timed-out, no-client, cancelled (the caller's signal aborted).

**Call sites:**
- `src/daemon/tools/executor.ts:41-48`
- `src/shared/types.ts:907-933`

### 3.4 `Approval broker (pending table)` — new

In-memory map of requestId to resolver and timer, plus the set of open approval streams. Lost on restart; open requests then count as denied. First answer wins. The wait ends 300 seconds after the request is raised (expiresAt); the value is a constant of the broker.

**Call sites:**
- `src/daemon/server.ts:242-290`
- `src/daemon/index.ts:1923-1945`

### 3.5 `Daemon config: tools.commonApproval` — new

Global flag for the common class: manual, edit-auto or auto; default auto. It is an enum entry in the on-disk config catalog (src/config/config-catalog.ts), stored in ~/.insrc/config.json, so it survives a restart; the in-memory ToolSettings snapshot is not used for it, because it resets on restart and nothing sets it now that the IDE is deprecated. In src/daemon/tools/config.ts, approval.defaultAction and destructive.requireDoubleConfirm are read by nothing outside that file; they are removed, because a 'destructive' setting must not be able to alter the destructive path (ac5) and a second common-class setting would conflict with this one. The existing catalog entry permissions.mode ('validate' | 'auto-accept', config-catalog.ts, typed in src/shared/types.ts and surfaced as insrc.permissions.mode in vscode-plugin/package.json) is read by nothing at runtime. It is retired (added to RETIRED_PATHS so the boot reconcile strips it) and not migrated: its default 'validate' was never a user choice, and mapping it to manual would silently turn the confirmed default (auto) into manual. tools.commonApproval is the only tool-approval setting.

**Call sites:**
- `src/config/config-catalog.ts`
- `src/daemon/tools/config.ts`
- `src/shared/types.ts`
- `vscode-plugin/package.json`
- `src/config/__tests__/config-catalog-contract.test.ts`
- `src/daemon/__tests__/config-boot-reconcile.test.ts`
- `site/settings.html`
- `src/config/__tests__/config-reconcile-smoke.test.ts`
- `src/config/__tests__/fixtures/daemon-defaults-literal.json`
- `src/config/__tests__/fixtures/PROVENANCE.md`

### 3.6 `IPC methods approval.subscribe and approval.answer` — new

approval.subscribe is a stream handler pushing 'gate' frames to the client; approval.answer is a unary RPC carrying { requestId, decision }. Client side: a streaming method is added to IpcClient in src/shared/ipc-client.ts (the vscode-plugin reaches the daemon through that interface) as an optional member, so the IpcClient test doubles (vscode-plugin/src/config/__tests__/per-role-engine.test.ts, vscode-plugin/src/workspace/__tests__/registrar.test.ts, and the doubles in activation.test.ts and controller.test.ts) keep compiling and only the subscribing modules check for it; the terminal client subscribes from a service under src/cli/services; the editor and chat modules under vscode-plugin/src/chat and vscode-plugin/src/daemon subscribe, render and answer. src/mcp/daemon-stream.ts is only a model for the streaming client; the MCP process is a machine client and does not subscribe.

**Call sites:**
- `src/daemon/index.ts:1923-1945`
- `src/shared/ipc-client.ts`
- `src/cli/services`
- `vscode-plugin/src/chat`
- `vscode-plugin/src/daemon`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/config/__tests__/per-role-engine.test.ts`
- `vscode-plugin/src/workspace/__tests__/registrar.test.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | s3 owns sc4: builds the class field, the global flag, ApprovalRequest/Answer/Denial, the broker, the timeout and the two IPC methods, and refines the sketch as in the amendment proposal. Carrier decision: the tool-call IPC that CLI-process and chat callers use is built by s7, but its request fields are defined here as part of sc4: caller ('agent' \| 'daemon' \| 'workflow') and an optional approvalMode ('manual' \| 'edit-auto' \| 'auto'); the daemon sets deps.caller and deps.approvalMode from them. This is a requirement on s7: build the method against these fields. A chat sends its session's PermissionMode as approvalMode on each such call. The chat does not call registry tools today, so ac6's chat clause is met at the client level (the chat opens approval.subscribe and answers) and for chat-originated calls once s7's method exists. |
| `sc2` | consumes | Returns denials as s2's ToolFailure with kind 'denied' and ToolDenialReason; adds caller and approvalMode to ToolDeps beside s2's conversion field. The value 'cancelled' (an aborted approval) is not in s2's ToolDenialReason: it is raised as amendment AMD-b7a68147dcf72034-5 on sc5, which must be approved before the s3 build. |
| `sc1` | consumes | Approval runs at step 2 before the hook stage at step 5; a denied call is not run and so fires no hook. |

## 5. Error paths

**Error cases**

- **No client has an open approval stream when a destructive call is made** (recoverable)
  - Detection: The broker finds its set of open approval streams empty when ask() is called.
  - Response: ask() resolves 'no-client' at once; the executor returns a failed result with a denied ToolFailure (reason no-client) and the tool does not run.
  - User impact: The caller is told the call was denied because nobody could answer; nothing changes.
- **A client is subscribed but does not answer before expiresAt** (recoverable)
  - Detection: The per-request timer set at ask() fires while the request is still in the pending table.
  - Response: The request is removed, ask() resolves 'timed-out', the executor returns a denied failure (reason timed-out), and a late approval.answer is ignored.
  - User impact: The call fails with a lack-of-answer message; the user can repeat the call.
- **The user declines** (recoverable)
  - Detection: approval.answer arrives with decision 'decline' for a pending requestId.
  - Response: ask() resolves 'declined'; the executor returns a denied failure (reason declined); the tool does not run.
  - User impact: Nothing is changed; the caller sees the decline.
- **approval.answer names an unknown, expired or already answered requestId** (recoverable)
  - Detection: The pending-table lookup by requestId misses.
  - Response: The RPC returns { accepted: false } and logs at warn level; no pending request is affected.
  - User impact: The client shows that the request is no longer open.
- **Every subscribed client disconnects while a request is pending** (recoverable)
  - Detection: The server aborts each subscribe handler's signal when its socket closes; the broker sees the open-stream count reach zero.
  - Response: All pending requests resolve 'no-client' immediately rather than waiting for the timer.
  - User impact: Calls fail fast with a denial instead of hanging.
- **The daemon restarts with requests pending** (recoverable)
  - Detection: The pending table is in memory, so the old process's callers see their connection drop.
  - Response: Nothing is persisted and nothing is replayed; the interrupted call never ran.
  - User impact: The caller sees a connection error and starts again.
- **The caller's signal aborts while a request is pending** (recoverable)
  - Detection: deps.signal fires while ask() is waiting.
  - Response: The request is removed from the pending table and the subscribers receive a 'gate' cancel frame; ask() resolves 'cancelled' and the executor returns a denied failure with reason cancelled, and the tool does not run.
  - User impact: The prompt disappears from the client.
- **The global setting holds an unknown value or the config cannot be read** (recoverable)
  - Detection: The config reader validates the value against manual, edit-auto and auto.
  - Response: It falls back to the default 'auto' for common calls and logs a warning; the destructive class does not read the setting.
  - User impact: Common calls follow the default; destructive calls still ask.
- **buildApprovalGate throws or is missing** (recoverable)
  - Detection: The executor catches the rejection when building the preview.
  - Response: The request is sent with a generic preview (tool id, repository, arguments as JSON); the approval still happens.
  - User impact: The user sees the raw call instead of a tailored preview.
- **A tool's per-input approval function throws** (recoverable)
  - Detection: The executor catches the exception when resolving the class.
  - Response: The class is treated as destructive (the safe side) and the failure is logged.
  - User impact: The user is asked.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two destructive calls are made at once from different callers | Each gets its own requestId and its own prompt; answering one does not answer the other. |
| Two clients are subscribed and both answer | The first answer wins; the second receives accepted: false. |
| A common-class tool called with deps.approvalMode 'auto' while the global flag is 'manual' | The call mode wins; it does not ask. |
| A common-class tool called with no approvalMode and the global flag 'edit-auto' | It asks, like manual. |
| A destructive tool called with approvalMode 'auto' or caller 'daemon' | It asks; neither field is read for the destructive class. |
| A git tool called with no cwd in its input | The request names deps.repoPath; if that is also empty the request says the repository is unknown. |
| A tool whose per-input approval function returns none for one input and destructive for another | Each call is classed from its own input. |
| A client subscribes after the request was raised | It receives the still-pending requests on subscribe, so a late client can answer them. |
| Arguments contain a very large value such as a file body | The request carries arguments truncated for display with the full length noted; the executed call uses the untruncated input. |

**Invariants to preserve**

- Tool ids and their input schemas do not change; only the approval field replaces requiresApproval and destructive. [[c4]]
- The daemon owns all approval state and CLI, MCP and editor reach it only over the Unix-socket IPC. [[c1]]
- executeTool still never throws: every failure returns a ToolResult with success false. [[c1]]
- The daemon still never opens a connection to a client; it pushes only over a stream the client opened. [[c1]]

## 6. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test 'src/**/__tests__/*.test.ts'), assertions from node:assert/strict`

**Test levels**

- **unit** — Prove the broker's decisions and the executor's class and mode rules without a socket.
  - Subjects: `approval broker ask(): answered, declined, timed-out, no-client, late answer, first answer wins, abort resolves cancelled`, `executor class resolution: none, common, destructive, per-input function, throwing function`, `effective-mode rule for the common class: call mode over global flag, default auto`, `config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload (it survives a restart)`, `request building: repoPath from input cwd then deps.repoPath, preview fallback, argument truncation`
  - Fixtures: `fake tools of each class registered in a test registry`, `fake approval stream sink capturing frames`, `fake timers for the timeout`
- **integration** — Prove the exchange over the real Unix-socket server: subscribe, frame, answer, disconnect.
  - Subjects: `approval.subscribe stream and approval.answer RPC against src/daemon/server.ts`, `late subscriber receives still-pending requests`, `all subscribers disconnecting resolves pending requests to no-client`, `caller signal abort sends a cancel frame`, `terminal client and editor/chat client: receive a gate frame, render tool, repository and arguments, answer through approval.answer`
  - Fixtures: `temporary socket path and server started with the real handler map`, `IPC test client opening a stream`
- **contract** — Prove no existing tool is left running unasked and that the class mapping is exactly as decided.
  - Subjects: `every builtin that had requiresApproval true maps to common, a predicate to a per-input class, and every one that had false or absent resolves to none`, `the eight destructive:true builtins map to destructive`, `no builtin still declares requiresApproval or destructive`, `type test: ToolDeps accepts caller and approvalMode; the destructive path does not read them`
  - Fixtures: `the registered builtin list`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/tools/__tests__/approval-broker.test.ts: a destructive call raises one request naming tool, repository and arguments and waits`, `src/daemon/tools/__tests__/approval-ipc.test.ts: a subscribed client receives the gate frame for a destructive call and its answer lets the tool run` |
| `ac2` | `src/daemon/tools/__tests__/executor-approval.test.ts: a second destructive call after an approved one raises its own request with a new id` |
| `ac3` | `src/daemon/tools/__tests__/approval-broker.test.ts: no open stream resolves no-client at once`, `src/daemon/tools/__tests__/approval-broker.test.ts: an unanswered request resolves timed-out at expiry and a late answer is ignored`, `src/daemon/tools/__tests__/executor-approval.test.ts: a timed-out call returns a denied failure with reason timed-out and the tool is not run` |
| `ac4` | `src/daemon/tools/__tests__/executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called` |
| `ac5` | `src/daemon/tools/__tests__/executor-approval.test.ts: a destructive tool asks under every approvalMode, every global flag value, any caller and any argument values`, `src/daemon/tools/__tests__/approval-class-mapping.test.ts: a per-input function that throws is treated as destructive` |
| `ac6` | `src/daemon/tools/__tests__/approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, every former false or absent tool resolves to none (no read-only tool asks), and none keeps the old fields`, `src/daemon/tools/__tests__/approval-class-mapping.test.ts: the eight destructive builtins are destructive`, `src/daemon/tools/__tests__/executor-approval.test.ts: a common tool asks in manual and edit-auto and runs without asking in auto, with the call mode over the global flag`, `src/cli/services/__tests__/approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer`, `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer` |
| `ac7` | `src/daemon/tools/__tests__/approval-ipc.test.ts: a client that subscribes after the request was raised receives it and answers with approval.answer`, `src/daemon/tools/__tests__/approval-ipc.test.ts: an answer for an unknown request id returns accepted false`, `src/cli/services/__tests__/approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer`, `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer` |

## 7. Migration

**State before:** executeTool in src/daemon/tools/executor.ts:41-48 treats requiresApproval (true or a predicate) as approved, logs 'auto-approving' and runs the tool, so nothing asks. Tool in src/daemon/tools/types.ts:110-128 has requiresApproval and destructive; eight builtins set destructive: true. ToolDeps (src/daemon/tools/types.ts:50-81) has no caller or approval-mode field. The IPC server can push to a client only over a stream the client opened (src/daemon/server.ts:242-290); IpcStreamKind already lists 'gate' but no handler uses it, and the gate.request-permission stream is an offline stub (src/daemon/index.ts:1923-1945).

**State after:** Tool declares one approval field (none, common or destructive, or a per-input function). executeTool resolves the class and, for destructive calls and for common calls whose effective mode is manual or edit-auto, asks the daemon-owned broker, which pushes the exact call to every client with an open approval.subscribe stream and waits for an approval.answer, a timeout or a disconnect. A call not approved returns a denied failure and does not run. The terminal client, the editor and a chat each implement the subscribe and answer. The common class follows tools.commonApproval (default auto) unless the call carries an approvalMode. The 'auto-approving' fallback, requiresApproval and destructive are gone.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add the ApprovalClass type, the optional approval field on Tool, and the optional caller and approvalMode fields on ToolDeps beside the old fields; nothing reads them yet. — ↩ rollbackable
2. Add the tools.commonApproval entry (enum manual, edit-auto, auto; default auto) to src/config/config-catalog.ts so it is stored in ~/.insrc/config.json, filled by the boot reconcile and read by the executor per call; remove the unread approval.defaultAction and destructive.requireDoubleConfirm from src/daemon/tools/config.ts so no second approval setting remains. Retire permissions.mode (unread) through RETIRED_PATHS in src/config/config-catalog.ts, and remove its insrc.permissions.mode contribution from vscode-plugin/package.json. Update the tests that assert the current state: the RETIRED_PATHS count test in src/config/__tests__/config-catalog-contract.test.ts (6 becomes 7), and the assertion in src/daemon/__tests__/config-boot-reconcile.test.ts that permissions.mode is 'validate' (it becomes: tools.commonApproval is 'auto' and permissions.mode is pruned). Drop permissions.mode from site/settings.html. Also update src/config/__tests__/config-reconcile-smoke.test.ts (the permissions assertion becomes: permissions is absent), the fixture src/config/__tests__/fixtures/daemon-defaults-literal.json (drop permissions.mode), and the note in src/config/__tests__/fixtures/PROVENANCE.md that names permissions.mode as surviving. — ↩ rollbackable
3. Add the approval broker and the approval.subscribe stream and approval.answer RPC to the daemon handler maps; no tool uses them yet. Keep the gate.request-permission stub as it is. — ↩ rollbackable
4. Add the client side: the terminal client, the editor and the chat open approval.subscribe, show the exact call and answer through approval.answer. Clients that connect before the executor change simply receive no frames. — ↩ rollbackable _(needs: `broker and IPC methods merged`)_
5. Map every builtin: map requiresApproval true to approval 'common', a predicate to a per-input function returning common or none, and false or absent to none (the 77 requiresApproval: false declarations across 55 read-only tools just drop the field and stay at none), and replace the eight destructive: true builtins with approval 'destructive'; remove the old fields from every file in the same change, including src/docgen/tool.ts, the one Tool outside the builtins that declares requiresApproval. — ↩ rollbackable
6. Switch the executor to resolve the class and ask the broker; remove the 'auto-approving' branch; set caller at the two ToolDeps builders that reach executeTool (src/analyze/context/driver.ts and src/agent/providers/ollama.ts); the two direct-execute builders are left to s7. Remove requiresApproval and destructive from the Tool type. — ↩ rollbackable _(needs: `clients in step 4 shipped`, `builtin mapping in step 5 merged`)_
7. Run the full test sweep once, then update docs/daemon.md with the approval exchange, the config key and the class mapping. — ↩ rollbackable

**Backward compat:** Tool ids and input schemas are unchanged. The Tool type loses requiresApproval and destructive; every use is in this repository's builtins and is changed in the same step, and the IDE repo is deprecated so no outside consumer exists. Behaviour changes on purpose: tools flagged requiresApproval now ask in manual and edit-auto, and the eight destructive builtins always ask; with no client attached a destructive call is denied where it used to run. Under the default auto mode common calls still run without asking, so existing unattended flows are unchanged except for destructive tools.

## 8. Alternatives considered

### 8.1 a1: A daemon-owned approval broker that human clients subscribe to — **CHOSEN**





### 8.2 a2: Ask the client that started the call, over its own stream





**Rejected because:** Many callers have no human behind their stream (an MCP-driven workflow, daemon-internal work), so their destructive calls are denied even when a TUI is open; partial on ac1, ac6 and sc4.

### 8.3 a3: Hybrid: the originating client first, subscribers otherwise





**Rejected because:** Adds a routing path and a caller-sent capability flag to a rule that must not depend on the caller; a silent client waits out the timeout; partial on ac5 and k5.

### 8.4 a4: A caller-supplied approval gate on ToolDeps





**Rejected because:** Any caller can pass a function that always approves and the ask never crosses the daemon's IPC; violates ac5, sc4, k4 and k5.

## 9. References

- **[[c1]]** `code` `src/daemon/server.ts:242-290`
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:79`
- **[[c3]]** `code` `src/daemon/tools/executor.ts:41-48`
- **[[c4]]** `doc` `docs/plans/tool-registry.md`

## 10. Open questions

- dm2 (partial): the dataModel entries do not each cite the invariant they might break; the invariant that tool ids and schemas stay unchanged is listed under invariantsToPreserve.
- ep3 (partial): the invariants rest on direct code reads recorded in the s1 bundles, not on insrc_analyze_step output.
- DEF reading for s3 ac6: 'a tool that needs approval asks when the effective mode says ask (manual, edit-auto), and a destructive tool always asks'; the amendment tool is HLD-only, so this is recorded here only.
- Open design details left to the plan: the exact terminal-client and editor prompt UI, and whether the terminal client and editor open approval.subscribe at attach or on demand.
- Amendments filed, pending the user's approval: AMD-b7a68147dcf72034-4 (sc4 request fields, three chat modes, approval.subscribe), -5 (sc5 'cancelled' denial reason), -6 (sc2 typebox outputSchema, TypedTool, callTool), -7 (sc3 convertText takes ToolDeps, keyValues required). -1 (superseded) and -2 (duplicate of -3) are to be rejected.

## Resolved questions

- `q57e86d4a` — Amendments filed, pending the user's approval: AMD-b7a68147dcf72034-4 (sc4 request fields, three chat modes, approval.subscribe), -5 (sc5 'cancelled' denial reason), -6 (sc2 typebox outputSchema, TypedTool, callTool), -7 (sc3 convertText takes ToolDeps, keyValues required). -1 (superseded) and -2 (duplicate of -3) are to be rejected.
  - **resolved**: Approve -4..-7, reject -1/-2, then plan — Done: AMD-3 to AMD-7 approved and AMD-1 and AMD-2 rejected by the user's instruction on 2026-10-23. _(2026-10-23T14:04:23.531Z)_
- `q284f2b99` — dm2 (partial): the dataModel entries do not each cite the invariant they might break; the invariant that tool ids and schemas stay unchanged is listed under invariantsToPreserve.
  - **resolved**: Carry the mapping into the plan — One invariant covers every entry; a per-task check enforces it where the work is verified. _(2026-10-23T14:05:26.709Z)_
- `qeab4c947` — ep3 (partial): the invariants rest on direct code reads recorded in the s1 bundles, not on insrc_analyze_step output.
  - **resolved**: Accept the direct reads as grounding — The invariants are enforced by per-task checks (previous answer); the direct reads of the code are concrete. _(2026-10-23T14:06:10.568Z)_
- `q0a9521fc` — DEF reading for s3 ac6: 'a tool that needs approval asks when the effective mode says ask (manual, edit-auto), and a destructive tool always asks'; the amendment tool is HLD-only, so this is recorded here only.
  - **resolved**: Adopt it and pin it with a mode × tool test matrix — Recorded in docs/plans/tool-registry.md as the ac6 reading; the DEF cannot be amended with the HLD-only tool. _(2026-10-23T14:06:50.614Z)_

## Citations

- **[[c1]]** `code` `src/daemon/server.ts:242-290`
- **[[c2]]** `code` `vscode-plugin/src/chat/protocol.ts:79`
- **[[c3]]** `code` `src/daemon/tools/executor.ts:41-48`
- **[[c4]]** `doc` `docs/plans/tool-registry.md`
