<!-- insrc:artifact PLAN-b7a68147dcf72034-s1 -->

# Plan: STORY-b7a68147dcf72034-s1

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792849689113-zzgave`
**LLD effective hash:** `8118b9bf1de5...`

The build adds a small hook registry to the daemon's tool executor and wires it in at the two places where a tool call succeeds. It is built bottom-up: the types first, then the registry and its run point with its unit tests, then the executor stage, then the callTool pass-through, and last the contract checks and docs. No rule is registered by this Story, so nothing a caller sees changes until s7 registers the first ones.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Hook types and the hookFailures field | S | — | — | unit: src/daemon/tools/__tests__/tool-hooks.test.ts: HookFailure report shape | [[c2]] [[c5]] |
| 2 | **`t2`** The hook registry and its run point | M | — | `t1` | unit: src/daemon/tools/__tests__/tool-hooks.test.ts: registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId; unit: src/daemon/tools/__tests__/tool-hooks.test.ts: registerToolHook refuses an alias in place of a canonical id; unit: src/daemon/tools/__tests__/tool-hooks.test.ts: runToolHooks runs hooks one at a time; unit: src/daemon/tools/__tests__/tool-hooks.test.ts: runToolHooks catches a throw or rejection, cuts a long message to 500 characters and gives each hook its own structuredClone of input and result; unit: src/daemon/tools/__tests__/tool-hooks.test.ts: failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw; unit: src/daemon/tools/__tests__/tool-hooks.test.ts: a hook that mutates nested result.data, with and without then throwing, leaves the caller's result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest | [[c1]] [[c2]] [[c3]] [[c4]] |
| 3 | **`t3`** Run the hooks from executeTool | M | — | `t2` | integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a registered rule runs once after a successful call for each caller (agent, daemon, workflow, unset); integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a tool with no outputSchema still runs its rules; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a tool called through an alias runs the canonical id's rule exactly once; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a failing rule leaves the result a success and reports the failure on hookFailures and in the output text; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a failed, denied, rejected or schema-mismatch call runs no rule; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: rules run in registration order and a failing rule does not stop the next; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a call with no rule returns the object the tool returned | [[c1]] [[c3]] [[c5]] |
| 4 | **`t4`** callTool carries the report | S | — | `t3` | integration: src/daemon/tools/__tests__/tool-hooks.test.ts: callTool carries hookFailures onto the typed success result; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: callTool omits hookFailures when nothing failed | [[c1]] [[c2]] |
| 5 | **`t5`** Contract check and docs | M | — | `t4` | integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that throws a null-prototype object or a value with a throwing toString is reported with a fixed text; integration: src/daemon/tools/__tests__/tool-hooks.test.ts: a rule that mutates nested result data leaves the caller's result untouched; integration: src/daemon/tools/__tests__/approval-class-mapping.test.ts: the tool snapshot is unchanged; integration: src/agent/__tests__/read-only-tool-loop.test.ts: the read-only tool loop still returns the tool's output text unchanged when no rule is registered | [[c4]] [[c5]] |

### 1.1 TASK-b7a68147dcf72034-s1-t1 — Hook types and the hookFailures field

Add ToolHook, ToolHookContext and HookFailure to src/daemon/tools/types.ts, the optional hookFailures on ToolResult and the optional hookFailures on the success variant of TypedToolResult. Types only; nothing reads them yet.

**Acceptance checks:**
- tsc --noEmit is clean at the root
- ToolHookContext.caller is 'agent' | 'daemon' | 'workflow' | undefined and the context has no signal field
- ToolResult.hookFailures and TypedToolResult success hookFailures are optional with | undefined
- call-tool.type-test.ts still compiles

### 1.2 TASK-b7a68147dcf72034-s1-t2 — The hook registry and its run point

Add src/daemon/tools/hooks.ts with registerToolHook (duplicate, empty id and alias refusal), runToolHooks (resolved tool.id lookup, a structuredClone of input and result per hook, serial run, guarded failure text cut to 500 characters, clone failure reported per hook, per-hook log line) and the test reset seam; export registerToolHook from src/daemon/tools/index.ts. Create src/daemon/tools/__tests__/tool-hooks.test.ts with the registry and run-point unit tests; t3, t4 and t5 extend the same file so every proving test the LLD names lives there.

**Acceptance checks:**
- registerToolHook throws on a duplicate toolId+id, an empty id or toolId, and an alias of an already registered tool
- runToolHooks runs hooks in registration order, one at a time, and a failing hook does not stop the next
- a null-prototype throw, a throwing toString and an empty message give the fixed fallback text and nothing throws out of runToolHooks
- a hook that mutates nested result.data, with or without then throwing, leaves the original untouched
- an uncloneable result reports that hook as failed and the rest still run
- a message over 500 characters is cut to 500

### 1.3 TASK-b7a68147dcf72034-s1-t3 — Run the hooks from executeTool

Route executeTool's two success exits through one helper that calls runToolHooks with the resolved tool, and sets hookFailures and appends one `[hook failed] <hookId>: <message>` line per failure to output only when a rule failed; every failed exit stays hook-free and a call with no hook returns the very object the tool returned. Extend tool-hooks.test.ts with the executor tests.

**Acceptance checks:**
- a registered rule runs once after a successful call for caller agent, daemon, workflow and unset, with and without an outputSchema
- a failed, denied, rejected or schema-mismatch call runs no rule and carries no hookFailures
- a tool called through an alias runs the canonical id's hooks exactly once
- a failing rule leaves success, data and format unchanged, sets hookFailures, and appends exactly one `[hook failed] <hookId>: <message>` line per failure to output
- hookFailures is absent when no rule failed and the result object is the one the tool returned when no hook is registered
- executor-approval.test.ts passes unchanged

### 1.4 TASK-b7a68147dcf72034-s1-t4 — callTool carries the report

Copy hookFailures from the executor result onto the success variant of TypedToolResult in callTool, only when at least one rule failed. Extend tool-hooks.test.ts with the callTool tests.

**Acceptance checks:**
- callTool returns hookFailures on a success whose rule failed and omits the key otherwise
- call-tool.type-test.ts and the existing call-tool tests pass

### 1.5 TASK-b7a68147dcf72034-s1-t5 — Contract check and docs

Complete tool-hooks.test.ts so every test the LLD acceptance mapping names exists (ac1 to ac5); confirm the read-only tool loop output and the 228-tool snapshot are unchanged; add the hook stage section to docs/daemon.md after the approval section.

**Acceptance checks:**
- tool-hooks.test.ts holds a test with each title the LLD acceptance mapping names for ac1 to ac5
- approval-class-mapping.test.ts and the read-only tool loop tests pass unchanged
- docs/daemon.md describes the stage, the report, the canonical id rule, the per-hook copy and the missing cancellation bound

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId | `t2` |
| runToolHooks runs hooks serially in registration order, catches a throw or rejection, cuts a long message to 500 characters, and gives each hook its own structuredClone of input and result | `t2` |
| HookFailure report shape | `t1` |
| failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw | `t2`, `t5` |
| a hook that mutates nested result.data, with and without then throwing, leaves the caller's result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest | `t2`, `t5` |
| registerToolHook refuses an alias in place of a canonical id | `t2` |
| executeTool runs a registered rule once after a successful call for caller agent, daemon, workflow and unset | `t3` |
| a failing rule leaves success true, data and format unchanged, sets hookFailures and appends the [hook failed] line | `t3` |
| a failed tool, a denied call, an input rejection and a schema-mismatch run no rule | `t3` |
| two rules on one tool run in order and the first failing does not stop the second | `t3` |
| a successful call with no rule returns the same object the tool returned | `t3` |
| a tool with no outputSchema still runs its rules | `t3` |
| callTool copies hookFailures onto the typed success result and omits it when nothing failed | `t4` |
| a tool called through an alias runs the canonical id's hooks exactly once | `t3` |
| the read-only tool loop still returns the tool's output text unchanged when no rule is registered | `t5` |
| the 228-tool snapshot in src/daemon/tools/__tests__/fixtures/approval-snapshot.json still matches, so no tool id or input schema moved | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contract details (registerToolHook, runToolHooks, executeTool, callTool)`
- **[[c2]]** `prior-artifact` `LLD s1 data model changes (ToolHook, ToolHookContext, HookFailure, ToolResult, TypedToolResult)`
- **[[c3]]** `prior-artifact` `LLD s1 error paths and edge cases`
- **[[c4]]** `prior-artifact` `LLD s1 test strategy and acceptance mapping`
- **[[c5]]** `prior-artifact` `LLD s1 migration steps`
