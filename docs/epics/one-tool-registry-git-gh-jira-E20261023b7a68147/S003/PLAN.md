<!-- insrc:artifact PLAN-b7a68147dcf72034-s3 -->

# Plan: STORY-b7a68147dcf72034-s3

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792753489483-m36f90`
**LLD effective hash:** `49d9b4a4eaf4...`

The build lays down the approval types and the setting first, then the daemon-side broker and its IPC, then the pure policy and the executor change, then the mechanical rewrite of about a hundred builtins behind a before/after snapshot, and last the client prompts and docs. The destructive-always-asks rule is proved at three levels: the pure policy, the executor with a fake broker, and a mode by tool-class matrix through the real executor and broker.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Declare the approval types and the new Tool and ToolDeps fields | S | — | — | unit: src/daemon/tools/__tests__/approval-types.test.ts: ApprovalDenial holds exactly the four values and ToolDeps accepts caller and approvalMode | [[c3]] |
| 2 | **`t2`** Add the tools.commonApproval setting and retire permissions.mode | M | — | — | unit: src/config/__tests__/tools-common-approval.test.ts: config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload; unit: src/config/__tests__/tools-common-approval.test.ts: permissions.mode is stripped from an existing config and is gone from the catalog, the plugin manifest and the settings page | [[c3]] [[c6]] |
| 3 | **`t3`** Build the approval broker | M | — | `t1` | unit: src/daemon/tools/__tests__/approval-broker.test.ts: an answered request resolves approved and a declined one resolves declined; unit: src/daemon/tools/__tests__/approval-broker.test.ts: no open stream resolves no-client at once; unit: src/daemon/tools/__tests__/approval-broker.test.ts: an unanswered request resolves timed-out at expiry and a late answer is ignored; unit: src/daemon/tools/__tests__/approval-broker.test.ts: with two subscribers the first answer wins and the second is refused; unit: src/daemon/tools/__tests__/approval-broker.test.ts: closing the last stream resolves every pending request to no-client; unit: src/daemon/tools/__tests__/approval-broker.test.ts: an aborted caller signal resolves cancelled and sends the subscribers a cancel frame; unit: src/daemon/tools/__tests__/approval-broker.test.ts: a late subscriber receives the still-pending requests | [[c2]] [[c4]] |
| 4 | **`t4`** Expose the broker over IPC | M | — | `t3` | integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a subscribed client receives the gate frame for a pending request and its answer resolves it; integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a client that subscribes after the request was raised receives it and answers with approval.answer; integration: src/daemon/tools/__tests__/approval-ipc.test.ts: an answer for an unknown request id returns accepted false; integration: src/daemon/tools/__tests__/approval-ipc.test.ts: disconnecting the only subscriber resolves pending requests to no-client; integration: src/daemon/tools/__tests__/approval-ipc.test.ts: a cancelled request sends a cancel frame over the socket | [[c2]] [[c8]] |
| 5 | **`t5`** Resolve the approval class, the effective mode and the request | M | — | `t1`, `t2` | unit: src/daemon/tools/__tests__/approval-policy.test.ts: class resolution gives none, common, destructive, a per-input class, and destructive for a throwing function; unit: src/daemon/tools/__tests__/approval-policy.test.ts: a destructive tool asks under every approvalMode, every flag value, any caller and any argument; unit: src/daemon/tools/__tests__/approval-policy.test.ts: a common tool asks in manual and edit-auto, not in auto, and the call mode wins over the flag; unit: src/daemon/tools/__tests__/approval-policy.test.ts: the request takes the repository from input cwd then deps.repoPath, truncates large arguments and falls back to a generic preview | [[c1]] [[c4]] |
| 6 | **`t6`** Make executeTool ask before it runs | M | — | `t3`, `t5` | unit: src/daemon/tools/__tests__/executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called; unit: src/daemon/tools/__tests__/executor-approval.test.ts: a timed-out call returns a denied failure with reason timed-out and the tool is not run; unit: src/daemon/tools/__tests__/executor-approval.test.ts: no client and a cancelled request return denied with their reasons; unit: src/daemon/tools/__tests__/executor-approval.test.ts: an approved call runs and returns the tool's result unchanged; unit: src/daemon/tools/__tests__/executor-approval.test.ts: a second destructive call after an approved one raises its own request with a new id; unit: src/daemon/tools/__tests__/executor-approval.test.ts: a bad input is rejected before any prompt | [[c1]] [[c4]] |
| 7 | **`t7`** Map every builtin onto the approval field | L | — | `t6` | unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: every former requiresApproval true builtin is common, every predicate one is per-input, and every former false or absent tool resolves to none; unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the eight destructive builtins are destructive; unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: no builtin still declares requiresApproval or destructive; unit: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool ids and input schemas match the snapshot taken before the rewrite | [[c1]] [[c3]] [[c6]] |
| 8 | **`t8`** Add an optional streaming method to IpcClient | M | — | `t4` | integration: src/shared/__tests__/ipc-client-stream.test.ts: a client opens a stream, receives the pushed frames and closes it; integration: src/shared/__tests__/ipc-client-stream.test.ts: closing the handle aborts the server's stream handler | [[c8]] [[c6]] |
| 9 | **`t9`** Terminal client approval prompt | M | — | `t8` | integration: src/cli/services/__tests__/approval-subscribe.test.ts: the terminal client receives a gate frame, shows the tool, repository and arguments, and sends approval.answer; integration: src/cli/services/__tests__/approval-subscribe.test.ts: a cancel frame removes the prompt and the stream is reopened after a restart | [[c8]] |
| 10 | **`t10`** Editor approval prompt | M | — | `t8` | integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: the editor and chat client receive a gate frame, show the exact call and send approval.answer; integration: vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts: a cancel frame closes the notification and the stream is reopened after a restart | [[c8]] |
| 11 | **`t11`** Docs, the ac6 matrix and the s7 requirement | S | — | `t7`, `t9`, `t10` | integration: src/daemon/tools/__tests__/approval-matrix.test.ts: every mode against none, common and destructive tools asks exactly as the ac6 reading says, through the real executor and broker | [[c5]] [[c7]] |

### 1.1 TASK-b7a68147dcf72034-s3-t1 — Declare the approval types and the new Tool and ToolDeps fields

Add ApprovalClass (none, common, destructive), CommonApprovalMode (manual, edit-auto, auto), ApprovalRequest { requestId, toolId, approvalClass, repoPath, arguments, preview, reason, expiresAt }, ApprovalAnswer, ApprovalDenial (declined, timed-out, no-client, cancelled) and ApprovalGate beside the s2 types in src/daemon/tools, plus the optional Tool.approval (a class or a per-input function) and the optional ToolDeps.caller ('agent' | 'daemon' | 'workflow') and approvalMode. requiresApproval and destructive stay for now, so nothing else changes.

**Acceptance checks:**
- npm run build compiles with the four ToolDeps builders and every builtin unchanged
- ApprovalDenial has exactly declined, timed-out, no-client and cancelled and is assignable to s2's ToolDenialReason
- no existing Tool, ToolResult or ToolDeps field changes meaning, and tool ids and input schemas are unchanged

### 1.2 TASK-b7a68147dcf72034-s3-t2 — Add the tools.commonApproval setting and retire permissions.mode

Add the tools.commonApproval enum entry (manual, edit-auto, auto; default auto) to src/config/config-catalog.ts with a reader the executor uses per call (an unknown value falls back to auto with a warning). Retire permissions.mode through RETIRED_PATHS and remove its type use in src/shared/types.ts, its insrc.permissions.mode contribution in vscode-plugin/package.json and its entry in site/settings.html; remove the unread approval.defaultAction and destructive.requireDoubleConfirm from src/daemon/tools/config.ts. Update the tests and fixture that assert the old state (config-catalog-contract, config-boot-reconcile, config-reconcile-smoke, daemon-defaults-literal.json and its PROVENANCE.md).

**Acceptance checks:**
- a fresh config gets tools.commonApproval = auto from the boot reconcile and a written value survives a reload
- an unknown value reads as auto and logs a warning
- permissions.mode is stripped from an existing config on reconcile and appears nowhere in the catalog, the plugin manifest or the settings page
- the tests that asserted permissions.mode now assert its absence and pass
- no remaining reader of approval.defaultAction or destructive.requireDoubleConfirm

### 1.3 TASK-b7a68147dcf72034-s3-t3 — Build the approval broker

Add the daemon-owned broker (src/daemon/approval-broker.ts): a pending table keyed by requestId with a resolver and a 300 second timer, the set of open approval streams, ask(request) resolving to an answer or an ApprovalDenial (no-client at once with no stream open, timed-out at expiry, declined, cancelled when the caller's signal aborts, which also sends the subscribers a cancel frame), answer(requestId, decision) where the first answer wins and an unknown or already answered id is refused, replay of still-pending requests to a late subscriber, and no-client for every pending request when the last stream closes. It never rejects.

**Acceptance checks:**
- ask() with no open stream resolves no-client without waiting
- an unanswered request resolves timed-out at its expiry and a late answer is ignored
- two subscribers: the first answer wins and the second is told accepted false
- closing the last stream resolves every pending request to no-client
- an aborted caller signal resolves cancelled and removes the request
- the broker holds no state across a restart and never rejects

### 1.4 TASK-b7a68147dcf72034-s3-t4 — Expose the broker over IPC

Register the approval.subscribe stream handler (pushes 'gate' frames, replays pending requests, closes with the socket) and the approval.answer RPC ({ requestId, decision } returning { accepted }) in src/daemon/index.ts against the single broker created at daemon start, and add the frame and method shapes to src/shared/types.ts. The gate.request-permission stub stays. Prove the exchange over the real unix-socket server with the real broker: a client attaches, sees the exact call and answers over its own connection.

**Acceptance checks:**
- a client that opens approval.subscribe receives a gate frame for a pending request and its approval.answer resolves the request
- a client that subscribes after the request was raised receives it
- an answer for an unknown request id returns accepted false
- disconnecting the only subscriber resolves pending requests to no-client
- an integration test over the real unix-socket server and the real broker shows a client seeing the exact call and answering over its connection

### 1.5 TASK-b7a68147dcf72034-s3-t5 — Resolve the approval class, the effective mode and the request

Add the pure resolution used by the executor (src/daemon/tools/approval-policy.ts): the class from the field or the per-input function (a function that throws counts as destructive; absent means none), the rule for whether to ask (destructive always; common when the effective mode, deps.approvalMode else tools.commonApproval, is manual or edit-auto; none never), and the request builder (repository from input cwd then deps.repoPath, the exact arguments truncated for display with the length noted, the preview from buildApprovalGate with a generic preview if it throws, a 300 second expiry). No broker and no IO.

**Acceptance checks:**
- a destructive tool asks for every approvalMode, every tools.commonApproval value, any caller and any argument
- a common tool asks in manual and edit-auto and not in auto, with the call's approvalMode over the flag
- a throwing class function resolves to destructive
- the request names the tool, the repository and the untruncated-length of large arguments
- a missing buildApprovalGate or one that throws gives a generic preview

### 1.6 TASK-b7a68147dcf72034-s3-t6 — Make executeTool ask before it runs

In src/daemon/tools/executor.ts run s2's input check, then the approval step from t5: ask the broker for the request, and on a decline, timeout, no client or cancel return a failed result with failure kind denied and the denial reason, without running the tool. Remove the 'auto-approving' branch. Set caller at the two ToolDeps builders that reach executeTool (src/analyze/context/driver.ts, src/agent/providers/ollama.ts). The broker is reached through a daemon-level accessor so executeTool keeps its signature.

**Acceptance checks:**
- a declined, timed-out, no-client or cancelled answer returns failure kind denied with that reason and execute is never called
- an approved call runs and returns the tool's own result unchanged
- a second destructive call after an approved one asks again with a new request id
- a bad input is rejected before any prompt
- the 'auto-approving' log line and branch are gone
- tool ids and input schemas are unchanged

### 1.7 TASK-b7a68147dcf72034-s3-t7 — Map every builtin onto the approval field

Rewrite the builtins: requiresApproval true becomes approval 'common', each of the 7 predicates becomes a per-input function returning common or none, requiresApproval false or absent becomes none (the field is dropped), and the 8 destructive: true builtins (cloud az/vm, k8s, aws s3, gcp compute, aws cloudformation, gcp run, gcp storage, aws ec2) become approval 'destructive'. Include src/docgen/tool.ts. Then remove requiresApproval and destructive from the Tool type. A script-assisted, mechanical change that keeps every tool id and input schema; a snapshot of tool id, input schema and old flag taken before the rewrite is kept as a test fixture.

**Acceptance checks:**
- no file under src declares requiresApproval or destructive
- every former requiresApproval true tool is common, every predicate tool is per-input, every former false or absent tool resolves to none (no read-only tool asks)
- the 8 destructive builtins resolve to destructive
- the snapshot taken before the rewrite matches the new approval field for every tool, and the list of tool ids and input schemas is identical
- npm run build and the existing builtin tests pass

### 1.8 TASK-b7a68147dcf72034-s3-t8 — Add an optional streaming method to IpcClient

Add an optional stream method to the IpcClient interface and its implementation in src/shared/ipc-client.ts (open a stream request, deliver frames to a callback, return a handle that closes the socket), modelled on src/mcp/daemon-stream.ts. It is optional so the IpcClient test doubles (per-role-engine, registrar, activation and controller tests) keep compiling; only subscribing modules check for it.

**Acceptance checks:**
- a client opens a stream, receives the frames the daemon pushes and closes it
- closing the handle closes the socket and the server aborts the handler
- the existing IpcClient test doubles compile unchanged

### 1.9 TASK-b7a68147dcf72034-s3-t9 — Terminal client approval prompt

In the ink TUI (src/cli) add a service that opens approval.subscribe at attach and a view that shows each pending request inline (tool, repository, exact arguments, preview, time left) with approve and decline keys, answering through approval.answer and dropping the prompt on a cancel frame. Reconnect after a daemon restart.

**Acceptance checks:**
- the client subscribes at attach and shows the tool, repository and arguments of a raised request
- approve and decline send approval.answer with the request id
- a cancel frame removes the prompt
- the stream is reopened after the daemon restarts

### 1.10 TASK-b7a68147dcf72034-s3-t10 — Editor approval prompt

In vscode-plugin subscribe to approval.subscribe at attach (through the controller) and show each request as a notification with Approve and Decline actions that names the tool, repository and arguments, answering through approval.answer and removing it on a cancel frame.

**Acceptance checks:**
- the editor subscribes at attach and shows a notification for a raised request with the tool, repository and arguments
- choosing Approve or Decline sends approval.answer
- a cancel frame closes the notification
- the stream is reopened after the daemon restarts

### 1.11 TASK-b7a68147dcf72034-s3-t11 — Docs, the ac6 matrix and the s7 requirement

Update docs/daemon.md with the approval exchange, the tools.commonApproval setting, the class mapping and the retirement of permissions.mode; add the mode x tool-class matrix test that pins the DEF ac6 reading across the real executor and broker; record in docs/plans/tool-registry.md what s7 must build against (the tool-call IPC carries caller and optional approvalMode, and a chat sends its session's PermissionMode as approvalMode).

**Acceptance checks:**
- docs/daemon.md describes the exchange, the setting and the class mapping
- the matrix test asserts the ask rule for every mode against none, common and destructive tools through the real executor and broker
- docs/plans/tool-registry.md states what s7 must build against

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| approval broker ask(): answered, declined, timed-out, no-client, late answer, first answer wins, abort resolves cancelled | `t3` |
| executor class resolution: none, common, destructive, per-input function, throwing function | `t5` |
| effective-mode rule for the common class: call mode over global flag, default auto | `t5`, `t6` |
| config catalog entry tools.commonApproval: default auto, an unknown value falls back to auto with a warning, and a value written to config.json is read back after a reload (it survives a restart) | `t2` |
| request building: repoPath from input cwd then deps.repoPath, preview fallback, argument truncation | `t5` |
| approval.subscribe stream and approval.answer RPC against src/daemon/server.ts | `t4` |
| late subscriber receives still-pending requests | `t3`, `t4` |
| all subscribers disconnecting resolves pending requests to no-client | `t3`, `t4` |
| caller signal abort sends a cancel frame | `t3`, `t4` |
| terminal client and editor/chat client: receive a gate frame, render tool, repository and arguments, answer through approval.answer | `t9`, `t10` |
| every builtin that had requiresApproval true maps to common, a predicate to a per-input class, and every one that had false or absent resolves to none | `t7` |
| the eight destructive:true builtins map to destructive | `t7` |
| no builtin still declares requiresApproval or destructive | `t7` |
| type test: ToolDeps accepts caller and approvalMode; the destructive path does not read them | `t1`, `t5`, `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 executeTool, Tool.approval and Tool.buildApprovalGate (contract 2)`
- **[[c2]]** `prior-artifact` `LLD s3 ApprovalGate.ask, the broker and its IPC methods (contract 2 and data model 3.4, 3.6)`
- **[[c3]]** `prior-artifact` `LLD s3 data model changes: Tool.approval, ToolDeps, the request types and tools.commonApproval (section 3)`
- **[[c4]]** `prior-artifact` `LLD s3 error paths, edge cases and invariants (section 5)`
- **[[c5]]** `prior-artifact` `LLD s3 test strategy (section 6)`
- **[[c6]]** `prior-artifact` `LLD s3 migration steps (section 7)`
- **[[c7]]** `doc` `docs/plans/tool-registry.md#s3-lld-review-2026-10-23-six-rounds-approved-with-override`
- **[[c8]]** `prior-artifact` `LLD s3 interaction with shared contracts and the client call sites (sections 3.6 and 4)`
