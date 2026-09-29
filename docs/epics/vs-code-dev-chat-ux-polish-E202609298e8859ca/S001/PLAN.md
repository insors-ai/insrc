<!-- insrc:artifact PLAN-8e8859ca0ca83612-s1 -->

# Plan: E202609298e8859ca:S001

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**LLD run:** `wf-1790677077127-2bqtr6`
**LLD effective hash:** `f5c70630aa71...`

Building S001 threads one additive 'tool-result' event through the existing dev-chat pipeline: declare it on the TurnEvent union, emit it from the adapter's tool_result (claude type:'user' + codex item.completed), persist it as a structured transcript entry (with markerFor returning null so it never double-persists as a flat marker), and map+render it as a command/separator/collapsible-output row reusing the existing 'tool-result' RowKind and host.collapsible primitive. The render change also touches the eval'd webview-source copy, so its parity test moves in lockstep; assistant text is confirmed never default-collapsed. Seven small/medium tasks land the type, adapter, persistence, render, and the regression + both-store round-trip tests.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the additive ToolResultEvent to the TurnEvent union | S | — | unit: stream-events: TurnEvent admits the 'tool-result' member and TURN_EVENT_KINDS includes it; existing kinds unchanged | [[c1]] |
| 2 | **`t2`** Emit tool-result from the claude/codex adapter | M | `t1` | unit: claudeMapper.mapLine: a claude type:'user'/tool_result line yields one ToolResultEvent { kind:'tool-result', turnId, command?, output }; a line with no tool result returns [] or its existing event byte-identical to today; unit: claudeMapper.mapLine: the command is correlated onto the event when available; a tool_result with no correlatable command yields command undefined (output still present); unit: codex mapper: item.completed carrying tool output yields the same ToolResultEvent shape (provider-agnostic) | [[c3]] |
| 3 | **`t3`** Add the markerFor tool-result null case | S | `t1` | unit: markerFor: returns null for a 'tool-result' event (exhaustive switch compiles; no flat marker emitted) | [[c2]] |
| 4 | **`t4`** Add the structured tool-result TranscriptEntry variant | S | `t1` | unit: session-store round-trip: a tool-result TranscriptEntry serialises + restores through BOTH createInMemoryChatSessionStore and createMementoChatSessionStore (plain-serialisable), and existing entries are byte-identical | [[c2]] |
| 5 | **`t5`** Persist tool-result via an explicit appendEvent branch | S | `t1`, `t4` | unit: appendEvent: a tool-result event pushes a STRUCTURED tool-result TranscriptEntry (command?, output); assistant-delta/status/marker branches unchanged; status still not persisted | [[c2]] |
| 6 | **`t6`** Map + render the tool-result row and keep parity | M | `t1`, `t4` | unit: toViewModel: a live ToolResultEvent maps to { kind:'tool-result', collapsible:true, meta:{command,output} }; the existing tool-call->tool-command and assistant-delta->assistant-text branches are unchanged; unit: toViewModel: a replayed tool-result TranscriptEntry maps to an IDENTICAL RowViewModel as its originating live event (dual-input parity); unit: tool-result RowRenderer: builds command line + separator + output; ONLY the output is wrapped in host.collapsible(defaultCollapsed:true); command stays outside the collapsible (always visible); unit: assistant-text renderer: is NOT default-collapsed (rendered in full); unit: renderRegistryWebviewSource parity: the eval'd inline toViewModel/markerFor + live-render dispatch stays in parity with the module source after adding the tool-result branch (parity test); unit: renderer isolation: a throwing tool-result renderer falls back to the flat 'fallback' renderer for that one row | [[c1]] |
| 7 | **`t7`** Regression + round-trip tests | M | `t2`, `t3`, `t5`, `t6` | unit: replay: restoring a transcript with a tool-result entry re-renders the same command/separator/output row with default-collapsed output; unit: ac2 interaction: the output can be expanded and re-collapsed via the chevron (collapse-primitive state toggle); unit: The full chat suite passes locally (no-tool-output turns byte-identical; existing approval/marker tests green) | [[c1]] [[c2]] [[c3]] |

### 1.1 E202609298e8859ca:S001:T001 — Add the additive ToolResultEvent to the TurnEvent union

In vscode-plugin/src/chat/stream-events.ts add the additive union member ToolResultEvent { readonly kind:'tool-result'; readonly turnId: string; readonly command?: string; readonly output: string; readonly exitCode?: number } and add 'tool-result' to TURN_EVENT_KINDS. No existing member changes shape.

**Acceptance checks:**
- stream-events.ts declares ToolResultEvent as a TurnEvent member and TURN_EVENT_KINDS includes 'tool-result'
- Existing event kinds are structurally unchanged (k1/lc1)

### 1.2 E202609298e8859ca:S001:T002 — Emit tool-result from the claude/codex adapter

In cli-adapter.ts claudeMapper.mapLine add a type:'user'/tool_result handler that emits a ToolResultEvent (output from the tool_result content block; command correlated from the preceding tool_use when available). Add the codex item.completed tool-output path emitting the same shape. Every existing branch (system/assistant->tool-call/result->done/control) is untouched; a line with no tool result is byte-identical.

**Acceptance checks:**
- A claude type:'user'/tool_result line yields one ToolResultEvent with output set (command set when correlatable, else undefined)
- A line with no tool result returns [] or its existing event byte-identical to today
- The codex path emits the same ToolResultEvent shape (provider-agnostic)

### 1.3 E202609298e8859ca:S001:T003 — Add the markerFor tool-result null case

In markers.ts markerFor add `case 'tool-result': return null;` so the exhaustive switch (never default) keeps compiling with the new kind; tool-result is NOT persisted as a flat marker (it persists structurally). No existing case changes.

**Acceptance checks:**
- markerFor returns null for a tool-result event
- The exhaustive switch compiles with the new kind; existing cases unchanged (k2)

### 1.4 E202609298e8859ca:S001:T004 — Add the structured tool-result TranscriptEntry variant

In session-store.ts add the additive structured tool-result TranscriptEntry variant (role:'tool-result' + command? + output + at), plain-serialisable and discriminable from the existing role entries; verify both createInMemoryChatSessionStore and createMementoChatSessionStore round-trip it and existing entries are byte-identical.

**Acceptance checks:**
- TranscriptEntry admits the additive tool-result variant (plain-serialisable)
- A tool-result entry round-trips through both store constructions; existing entries are byte-identical

### 1.5 E202609298e8859ca:S001:T005 — Persist tool-result via an explicit appendEvent branch

In chat-panel.ts appendEvent add an explicit tool-result branch that pushes the structured tool-result TranscriptEntry (bypassing the markerFor flat path). Existing assistant-delta/status/marker branches are unchanged; status still not persisted.

**Acceptance checks:**
- appendEvent pushes a structured tool-result entry for a tool-result event (not a flat marker)
- assistant-delta/status/marker branches are unchanged

### 1.6 E202609298e8859ca:S001:T006 — Map + render the tool-result row and keep parity

In render-registry.ts add the toViewModel dual-input branch (live ToolResultEvent AND persisted tool-result entry -> { kind:'tool-result', collapsible:true, meta:{command,output} }), register a 'tool-result' RowRenderer that builds command / separator and wraps ONLY the output in host.collapsible(defaultCollapsed:true), and keep the eval'd renderRegistryWebviewSource inline toViewModel + live-render dispatch in parity; wire 'tool-result' into the chat-panel webview live-render structured branch. Confirm the assistant-text renderer is NOT default-collapsed.

**Acceptance checks:**
- toViewModel maps a live tool-result event and a replayed tool-result entry to an IDENTICAL RowViewModel (dual-input)
- The registered tool-result renderer shows command + separator + output with ONLY the output default-collapsed to ~3 lines, expandable/re-collapsible
- The eval'd webview source stays in parity with the module (parity test) and the live-render dispatch renders tool-result structurally
- Assistant/non-tool rows are never default-collapsed (ac3)

### 1.7 E202609298e8859ca:S001:T007 — Regression + round-trip tests

Add colocated node:test tests: adapter emission (with/without command, empty output, codex), toViewModel dual-input, renderer collapse (output-only, command visible), markerFor null, appendEvent structured persist, both-store round-trip + replay, parity, assistant-never-default-collapsed, and no-tool-output byte-identity.

**Acceptance checks:**
- Tests cover ac1-ac4 across adapter/render/persist/replay via the eval'd *WebviewSource pattern
- The full chat suite passes locally

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| claudeMapper.mapLine: a claude type:'user'/tool_result line yields one ToolResultEvent { kind:'tool-result', turnId, command?, output }; a line with no tool result returns [] or its existing event byte-identical to today. | `t2` |
| claudeMapper.mapLine: the command is correlated onto the event when available; a tool_result with no correlatable command yields command undefined (output still present). | `t2` |
| codex mapper: item.completed carrying tool output yields the same ToolResultEvent shape (provider-agnostic). | `t2` |
| stream-events: TurnEvent admits the 'tool-result' member and TURN_EVENT_KINDS includes it; existing kinds unchanged. | `t1` |
| toViewModel: a live ToolResultEvent maps to { kind:'tool-result', collapsible:true, meta:{command,output} }; the existing tool-call->tool-command and assistant-delta->assistant-text branches are unchanged. | `t6` |
| toViewModel: a replayed tool-result TranscriptEntry maps to an IDENTICAL RowViewModel as its originating live event (dual-input parity). | `t6` |
| tool-result RowRenderer: builds command line + separator + output; ONLY the output is wrapped in host.collapsible(defaultCollapsed:true); command stays outside the collapsible (always visible). | `t6` |
| assistant-text renderer: is NOT default-collapsed (rendered in full). | `t6` |
| renderRegistryWebviewSource parity: the eval'd inline toViewModel/markerFor + live-render dispatch stays in parity with the module source after adding the tool-result branch (parity test). | `t6` |
| renderer isolation: a throwing tool-result renderer falls back to the flat 'fallback' renderer for that one row. | `t6` |
| markerFor: returns null for a 'tool-result' event (exhaustive switch compiles; no flat marker emitted). | `t3` |
| appendEvent: a tool-result event pushes a STRUCTURED tool-result TranscriptEntry (command?, output); assistant-delta/status/marker branches unchanged; status still not persisted. | `t5` |
| session-store round-trip: a tool-result TranscriptEntry serialises + restores through BOTH createInMemoryChatSessionStore and createMementoChatSessionStore (plain-serialisable), and existing entries are byte-identical. | `t4` |
| replay: restoring a transcript with a tool-result entry re-renders the same command/separator/output row with default-collapsed output. | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 render-model: render-registry.ts RowKind 'tool-result'(:43)/RowViewModel(:53)/toViewModel dual-input(:101)/host.collapsible primitive(:71); the additive TurnEvent + toViewModel branch + renderer + parity`
- **[[c2]]** `prior-artifact` `LLD s1 persistence: markers.ts markerFor exhaustive switch(:43-85, null for tool-result); chat-panel appendEvent(:630-649) structured branch; session-store TranscriptEntry(:16) round-tripped by both stores(:106/:195)`
- **[[c3]]** `prior-artifact` `LLD s1 adapter: cli-adapter claudeMapper.mapLine has no type:'user'/tool_result handler today; add it (+codex item.completed) to emit the additive ToolResultEvent`
