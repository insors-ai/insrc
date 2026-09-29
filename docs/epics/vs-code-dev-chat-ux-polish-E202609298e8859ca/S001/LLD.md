<!-- insrc:artifact LLD-8e8859ca0ca83612-s1 -->

# LLD: E202609298e8859ca:S001

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**HLD base run:** `wf-1790676258005-32feqt`
**HLD effective hash:** `f5c70630aa71...`

S001 surfaces tool output in the dev-chat transcript as a structured row: the command that ran, a separator, then the output collapsed to a ~3-line preview you can expand. It reuses the existing 'tool-result' RowKind and the existing host.collapsible 3-line-clamp primitive rather than inventing new ones, adds a new additive 'tool-result' TurnEvent the claude/codex adapter emits (from the tool_result the provider already streams and today drops), maps it and its persisted counterpart through the one toViewModel mapper, and persists it as a structured transcript entry so a reloaded session replays the same command/separator/output with its default-collapsed state. Assistant (non-tool) text keeps rendering in full, never collapsed.

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

## 1. HLD context

> See **HLD-8e8859ca0ca83612** § 2. Framework summary

**Rollout phase:** Phase A — Row-kind pattern + render polish
**Owns:** `sc1` (Tool-output row kind (P1 instance))
**Consumes:** `sc1` (Tool-output row kind (P1 instance))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The input-row markup/CSS so it reads as a terminal prompt with a leading prompt indicator that acts as the send control (reusing the existing submit-turn intent unchanged), and the assistant-row width (~90%). Pure render; owns no cross-cutting contract and changes no event/protocol/persistence shape.
- `s3`: The approval-card render change (resolved approved/rejected state, action buttons removed once decided), suppressing the visible synthesized 'Approved: please proceed…' user-row echo, and recording the persisted permission-outcome marker on decision. The underlying resume-grant path and the existing permission-decision relay are consumed UNCHANGED (k4). — owns `sc2`
- `s4`: The selection-widget render (single/multi selectable controls), the host relay that turns a selection-decision message into the run's continuation (mirroring the existing decision-relay shape), and the resolved-selection persistence. Private to S004 apart from the sc3 shape. — owns `sc3`

## 2. Contract details

**Surface level:** internal

### 2.1 `claudeMapper.mapLine (tool_result handler)`

```typescript
mapLine(line: string, turnId: string, state: TurnState): TurnEvent[]  // add a claude type:'user'/tool_result branch (and the codex item.completed tool-output path), additive
```

**Parameters:**
- `line: string` — One native stdout NDJSON line; a claude type:'user' message carries tool_result content blocks (tool_use_id + content/output) that map to the tool's result. Today this line falls through to `return []` and the output is lost.

**Returns:** `TurnEvent[]` — For a tool_result line, one new ToolResultEvent { kind:'tool-result', turnId, command?, output, exitCode? }. All existing branches (system/assistant tool_use->tool-call/result->done/control) are UNCHANGED (lc1/k1).

**Preconditions:**
- The line is a valid provider stream envelope carrying a tool result (claude tool_result content block; codex item.completed tool output).

**Postconditions:**
- command is set when the provider exposes it (or correlated from the preceding tool_use); output is the tool's textual result; a line with no tool result is byte-identical to today (returns [] or its existing event).

### 2.2 `ToolResultEvent (new TurnEvent member)`

```typescript
interface ToolResultEvent { readonly kind: 'tool-result'; readonly turnId: string; readonly command?: string; readonly output: string; readonly exitCode?: number }
```

**Parameters:**
- `command: string | undefined` _(optional)_ — The command the tool ran, when known (correlated from the tool_use / carried on the result); shown as the row's command line.
- `output: string` — The tool's textual output; rendered below the separator and collapsed to a 3-line preview by default.
- `exitCode: number | undefined` _(optional)_ — The tool's exit status when the provider exposes it; reserved for future status styling, not required by any S001 AC.

**Returns:** `TurnEvent` — The additive union member for a completed tool result. Additive to stream-events.ts TurnEvent (k1); consumers that ignore it are unaffected.

**Postconditions:**
- The 'tool-result' kind is added to the TurnEvent union (and TURN_EVENT_KINDS) so markerFor's exhaustive switch and toViewModel both get a branch.

### 2.3 `toViewModel (tool-result branch)`

```typescript
toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel  // add ONE branch handling BOTH the live ToolResultEvent and the replayed tool-result TranscriptEntry
```

**Parameters:**
- `entry: TranscriptEntry | TurnEvent` — A live ToolResultEvent OR a replayed tool-result TranscriptEntry; both map to the SAME row so live render and replay converge (the existing dual-input contract).

**Returns:** `RowViewModel` — { kind: 'tool-result', text: command ?? '', collapsible: true, meta: { command, output } } — command + output carried in the existing meta (Readonly<Record<string,unknown>>); RowViewModel shape is UNCHANGED. The existing tool-call->tool-command and assistant-delta->assistant-text branches are untouched.

**Postconditions:**
- A replayed tool-result entry and its originating live event produce an identical RowViewModel (ac4). Unrecognised entries still map to 'fallback' (unchanged).

### 2.4 `tool-result RowRenderer`

```typescript
RowRenderer.render(vm: RowViewModel, host: RenderHost): unknown  // registered for kind 'tool-result'
```

**Parameters:**
- `vm: RowViewModel` — The tool-result view-model; the renderer reads vm.meta.command + vm.meta.output (coerced to string) to build the command line, a visual separator, then the output.
- `host: RenderHost` — Supplies host.collapsible(el, { defaultCollapsed: true }) — the EXISTING icon-only chevron over a 3-line-clamped body — which wraps ONLY the output sub-element (ac2). The command line stays outside the collapsible so it is always visible (ac1).

**Returns:** `unknown (DOM node)` — The tool-result row DOM: command line, separator, collapsible(output, defaultCollapsed:true). Built via className/textContent only (CSP-safe, k1). Registered so 'tool-result' no longer routes to the flat 'fallback' renderer.

**Preconditions:**
- The registry has the 'tool-result' renderer registered (S001); a per-row try/catch still falls back if it throws (existing isolation).

**Postconditions:**
- ac1 command/separator/output; ac2 output default-collapsed to ~3 lines, expandable/re-collapsible via the chevron. The assistant-text renderer is NOT default-collapsed (ac3).

### 2.5 `markerFor (tool-result case)`

```typescript
markerFor(event: TurnEvent): MarkerLine | null  // add `case 'tool-result': return null;`
```

**Parameters:**
- `event: TurnEvent` — The exhaustive switch gains a 'tool-result' case returning null — tool-result is persisted STRUCTURALLY via appendEvent's own branch, NOT as a flat {cssClass,label} marker, so it must not also emit a marker row.

**Returns:** `MarkerLine | null` — null for 'tool-result' (structural persistence path). The `never` default and all existing cases are unchanged; adding the case keeps the exhaustive switch compiling (k2).

**Postconditions:**
- tool-result never double-persists as a flat marker; the flat-marker semantics for every other kind are unchanged.

### 2.6 `appendEvent (tool-result branch)`

```typescript
appendEvent(s: ChatSession, ev: TurnEvent): void  // add an explicit tool-result branch before the markerFor fall-through
```

**Parameters:**
- `ev: TurnEvent` — When ev.kind === 'tool-result', push a STRUCTURED tool-result TranscriptEntry (command?, output) rather than routing through markerFor. Existing assistant-delta / status / marker branches are unchanged.

**Returns:** `void` — The structured tool-result entry is appended to s.transcript so it round-trips through both stores and replays via toViewModel (ac4).

**Preconditions:**
- The tool-result TranscriptEntry variant exists in session-store.ts.

**Postconditions:**
- A persisted tool-result entry restores to the same {kind:'tool-result'} row with default-collapsed output on reload.

## 3. Data model changes

### 3.1 `ToolResultEvent (vscode-plugin/src/chat/stream-events.ts TurnEvent union)` — new

Additive new union member { kind:'tool-result'; turnId; command?; output; exitCode? } + 'tool-result' added to TURN_EVENT_KINDS. No existing member changes shape (k1/lc1).

```
export type TurnEvent = /* existing */ | ToolResultEvent;
+ interface ToolResultEvent { readonly kind: 'tool-result'; readonly turnId: string; readonly command?: string; readonly output: string; readonly exitCode?: number }
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts`
- `vscode-plugin/src/chat/cli-adapter.ts`
- `vscode-plugin/src/chat/markers.ts`
- `vscode-plugin/src/chat/render-registry.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.2 `TranscriptEntry (vscode-plugin/src/chat/session-store.ts)` — field-add

Additive structured tool-result variant carrying the command + output so a reloaded session replays the structured row (ac4). Plain-serialisable (rides the Memento path). Shape kept discriminable from the existing role 'user'|'assistant'|'marker' entries; existing entries are byte-identical. Round-tripped by createInMemoryChatSessionStore (:195) and createMementoChatSessionStore (:106).

```
// existing: { readonly role:'user'|'assistant'|'marker'; readonly text; readonly at; readonly cssClass? }
+ // additive tool-result entry: { readonly role:'tool-result'; readonly command?: string; readonly output: string; readonly at: string }
```

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts:16-22`
- `vscode-plugin/src/chat/chat-panel.ts:630-649`
- `vscode-plugin/src/chat/render-registry.ts:101-119`

### 3.3 `RowViewModel.meta (vscode-plugin/src/chat/render-registry.ts)` — invariant-change

No type change — RowViewModel.meta (Readonly<Record<string,unknown>>) already exists and now carries { command, output } for a 'tool-result' row. The tool-result renderer coerces meta.command/meta.output to string defensively. RowViewModel's declared shape is unchanged (k1).

```
(no type change) toViewModel emits { kind:'tool-result', collapsible:true, meta:{ command, output } }
```

**Call sites:**
- `vscode-plugin/src/chat/render-registry.ts:53-60`
- `vscode-plugin/src/chat/render-registry.ts:101-119`
- `vscode-plugin/src/chat/render-registry.ts:159`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 OWNS and implements sc1 (the persisted tool row, P1 instance), reconciled to the EXISTING 'tool-result' RowKind rather than the HLD's illustrative 'tool-output' name, and persisted via a STRUCTURED TranscriptEntry variant (not a flat markerFor marker) so ac4's command/separator/output replay is exact. The additive ToolResultEvent + toViewModel dual-input branch + the reused host.collapsible primitive + markerFor->null + the appendEvent structured branch together realise sc1's 'command, separator, default-collapsed output, mapped identically for live and replay'. |

## 5. Error paths

**Error cases**

- **A tool_result stream line carries output but no correlatable command (the provider omits it and no preceding tool_use is matchable).** (recoverable)
  - Detection: The tool_result handler in claudeMapper.mapLine finds command undefined after attempting correlation from the preceding tool_use / result fields.
  - Response: Emit the ToolResultEvent with command omitted; the renderer renders the separator + output with no command line (or a neutral 'tool' label). The output still shows.
  - User impact: The output is still surfaced and collapsible; only the command line is absent for that provider-shape — strictly better than today (output dropped entirely).
- **The tool-result renderer throws while building the DOM (e.g. an unexpected meta shape).** (recoverable)
  - Detection: The registry's existing per-row try/catch around renderRow catches the throw.
  - Response: The row falls back to the existing 'fallback' flat renderer for that one row; the rest of the transcript renders normally.
  - User impact: That single tool row degrades to a flat line instead of the structured widget; no transcript-wide blanking.
- **A persisted tool-result TranscriptEntry is read back with a missing/undefined output field (corrupt or partially-written store row).** (recoverable)
  - Detection: toViewModel's tool-result branch coerces output to a string and finds it empty/undefined; the renderer's defensive string coercion of meta.output yields ''.
  - Response: Render the command line + separator + an empty output body (collapsed). Never throw; the entry still validates as a tool-result row.
  - User impact: A degenerate stored row shows an empty output rather than crashing replay; cosmetic only.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tool with no output (empty string) — e.g. a command that produced nothing. | The tool-result row shows the command + separator + an empty (collapsed) output body; it does not suppress the row (the command is still worth seeing). |
| Tool output shorter than the 3-line preview. | host.collapsible(defaultCollapsed:true) shows the whole short output within the clamp; the chevron is present but expanding reveals nothing more (consistent with the existing collapse primitive's behaviour). |
| A turn with NO tool output at all (assistant-only or tool-call-only turn). | Byte-identical to today: no tool-result event is emitted, no tool-result row appears, existing rows render unchanged (lc1/k1). |
| An assistant text response of many lines. | Rendered in full, never default-collapsed (ac3) — the assistant-text renderer is not wrapped in collapsible(defaultCollapsed:true). |
| Output containing characters that look like a separator (e.g. dashes). | Because command and output are DISTINCT structured fields (not a packed string), the separator is drawn by the renderer between them and output content never affects the split (the a1 structured choice). |
| A tool-result event on the codex provider (item.completed carrying tool output). | The codex mapper path emits the same ToolResultEvent shape, so the row renders identically regardless of provider (provider-agnostic TurnEvent contract). |

**Invariants to preserve**

- The TurnEvent union stays additive: every existing kind (assistant-delta, tool-call, file-edit, status, done, error, approval-request) keeps its shape and mapping; adding 'tool-result' must not alter the existing tool-call->tool-command or assistant-delta->assistant-text branches (k1/lc1). [[c1]]
- toViewModel remains pure/total/deterministic and dual-input: a live ToolResultEvent and its replayed TranscriptEntry map to an IDENTICAL RowViewModel so live render and restore never diverge (ac4). [[c1]]
- The live-only vs persisted discipline holds: 'status' stays live-only (not persisted); tool-result persists structurally via appendEvent and markerFor returns null for it, so it never double-persists as a flat marker, and no ephemeral surface leaks into the durable transcript (k2). [[c2]]
- The eval'd renderRegistryWebviewSource inline copy of toViewModel (and the live-render dispatch branch) stays in parity with the module source — the parity test that pins them must still pass after adding the tool-result branch (k3). [[c1]]
- Assistant/non-tool rows are never default-collapsed; only the tool-result output sub-element is wrapped in host.collapsible(defaultCollapsed:true) (ac3). [[c1]]

## 6. Test strategy

**Test framework:** `node:test (tsx --test), the repo-wide convention — colocated vscode-plugin/src/chat/__tests__/*.test.ts; webview render/host exercised via the eval'd renderRegistryWebviewSource / *WebviewSource pattern, with a parity test pinning the inline toViewModel/markerFor copies to the module source; live provider turns gated behind INSRC_LIVE_TESTS.`

**Test levels**

- **unit** — Prove the adapter surfaces tool output as a new additive event without disturbing existing branches.
  - Subjects: `claudeMapper.mapLine: a claude type:'user'/tool_result line yields one ToolResultEvent { kind:'tool-result', turnId, command?, output }; a line with no tool result returns [] or its existing event byte-identical to today.`, `claudeMapper.mapLine: the command is correlated onto the event when available; a tool_result with no correlatable command yields command undefined (output still present).`, `codex mapper: item.completed carrying tool output yields the same ToolResultEvent shape (provider-agnostic).`, `stream-events: TurnEvent admits the 'tool-result' member and TURN_EVENT_KINDS includes it; existing kinds unchanged.`
- **unit** — Prove the row model maps + renders the tool-result row and leaves assistant text uncollapsed.
  - Subjects: `toViewModel: a live ToolResultEvent maps to { kind:'tool-result', collapsible:true, meta:{command,output} }; the existing tool-call->tool-command and assistant-delta->assistant-text branches are unchanged.`, `toViewModel: a replayed tool-result TranscriptEntry maps to an IDENTICAL RowViewModel as its originating live event (dual-input parity).`, `tool-result RowRenderer: builds command line + separator + output; ONLY the output is wrapped in host.collapsible(defaultCollapsed:true); command stays outside the collapsible (always visible).`, `assistant-text renderer: is NOT default-collapsed (rendered in full).`, `renderRegistryWebviewSource parity: the eval'd inline toViewModel/markerFor + live-render dispatch stays in parity with the module source after adding the tool-result branch (parity test).`, `renderer isolation: a throwing tool-result renderer falls back to the flat 'fallback' renderer for that one row.`
- **unit** — Prove persistence + replay round-trip and the live-only discipline.
  - Subjects: `markerFor: returns null for a 'tool-result' event (exhaustive switch compiles; no flat marker emitted).`, `appendEvent: a tool-result event pushes a STRUCTURED tool-result TranscriptEntry (command?, output); assistant-delta/status/marker branches unchanged; status still not persisted.`, `session-store round-trip: a tool-result TranscriptEntry serialises + restores through BOTH createInMemoryChatSessionStore and createMementoChatSessionStore (plain-serialisable), and existing entries are byte-identical.`, `replay: restoring a transcript with a tool-result entry re-renders the same command/separator/output row with default-collapsed output.`
  - Fixtures: `a claude type:'user'/tool_result NDJSON line fixture (with and without a correlatable command; empty-output variant)`, `a fake Memento (the existing MementoLike test double) for the store round-trip`, `a tool-result TranscriptEntry fixture for the replay test`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `claudeMapper.mapLine yields a ToolResultEvent from a tool_result line`, `tool-result RowRenderer builds command line + separator + output`, `toViewModel maps the live ToolResultEvent to { kind:'tool-result', meta:{command,output} }` |
| `ac2` | `tool-result RowRenderer wraps ONLY the output in host.collapsible(defaultCollapsed:true) (3-line preview), command stays visible`, `the output can be expanded and re-collapsed via the chevron (collapse-primitive state toggle)` |
| `ac3` | `assistant-text renderer is NOT default-collapsed (rendered in full)`, `toViewModel assistant-delta->assistant-text branch is unchanged` |
| `ac4` | `session-store round-trip of a tool-result TranscriptEntry through both createInMemoryChatSessionStore and createMementoChatSessionStore`, `replay: toViewModel maps the replayed tool-result entry to an identical RowViewModel and re-renders the same structure with default-collapsed output`, `markerFor returns null for tool-result so it persists ONLY as the structured entry (no duplicate flat marker)` |

## 7. Migration

**State before:** The dev-chat adapter (cli-adapter.ts claudeMapper.mapLine) handles system/assistant(tool_use->tool-call)/result/control lines but has NO handler for a claude type:'user' tool_result message, so tool OUTPUT falls through to `return []` and is never surfaced. The render row model already declares a 'tool-result' RowKind (render-registry.ts:43) and a reusable host.collapsible(el,{defaultCollapsed}) 3-line-clamp primitive, but toViewModel (:101-119) has no tool-result branch and no 'tool-result' renderer is registered, so any tool-result would route to the flat 'fallback' line. Persistence (chat-panel appendEvent :630-649) sends every non-assistant/non-status event through markerFor (markers.ts:43-85), which returns a flat {cssClass,label} MarkerLine persisted as a role:'marker' entry and replayed by toViewModel as a flat fallback line — structure is lost. Net: tool output is invisible, and even tool-call activity replays as a flat marker.

**State after:** A new additive 'tool-result' TurnEvent { kind:'tool-result', turnId, command?, output, exitCode? } is emitted by the adapter from the claude tool_result (and codex item.completed) the provider already streams. toViewModel gains one dual-input branch mapping BOTH the live event and a persisted tool-result TranscriptEntry to { kind:'tool-result', collapsible:true, meta:{command,output} }; a registered 'tool-result' RowRenderer builds command / separator / output and wraps ONLY the output in the existing host.collapsible(defaultCollapsed:true). Persistence is a STRUCTURED tool-result TranscriptEntry written by an explicit appendEvent branch and round-tripped by both stores; markerFor returns null for 'tool-result' so it never double-persists as a flat marker. Assistant/non-tool rows stay uncollapsed. Turns with no tool output are byte-identical to before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the additive ToolResultEvent member to the TurnEvent union (stream-events.ts) and to TURN_EVENT_KINDS — a pure additive nullable-by-omission type surface; no existing kind changes. — ↩ rollbackable
2. Add the claude type:'user'/tool_result handler (and the codex item.completed tool-output path) to the adapter, emitting the ToolResultEvent; leave every existing branch untouched so a line with no tool result is byte-identical. — ↩ rollbackable
3. Add the 'tool-result' case to markerFor returning null (structural persistence, not a flat marker) so the exhaustive switch keeps compiling with the new kind. — ↩ rollbackable
4. Add the additive structured tool-result variant to TranscriptEntry (session-store.ts), plain-serialisable, discriminable from the existing role entries; both store constructions round-trip it unchanged. — ↩ rollbackable
5. Add the explicit tool-result branch to appendEvent (chat-panel.ts) that persists the structured entry (bypassing the markerFor flat path); existing assistant-delta/status/marker branches unchanged. — ↩ rollbackable
6. Add the toViewModel dual-input branch (live event + persisted entry -> the same tool-result RowViewModel) and register the 'tool-result' RowRenderer (command/separator/collapsible output); keep the eval'd renderRegistryWebviewSource inline copy + the live-render dispatch branch in parity, and confirm the assistant-text renderer stays not-default-collapsed. — ↩ rollbackable
7. Add the regression + round-trip tests (adapter emission, toViewModel dual-input, renderer collapse, markerFor null, both-store persist/replay, parity, assistant-never-collapsed). — ↩ rollbackable

**Backward compat:** Fully backward-compatible. The ToolResultEvent is an additive TurnEvent member and the tool-result TranscriptEntry is an additive variant — existing event kinds, protocol messages, and stored entries keep their exact shape, and a session with no tool-result rows serialises/replays byte-identically. RowViewModel's declared type is unchanged (command/output ride the pre-existing meta). markerFor gains a null-returning case, changing no existing case. Old stored transcripts (no tool-result entries) load unchanged; new tool-result entries are simply absent from them. No existing public API signature changes.

## 8. Alternatives considered

### 8.1 a1: Structured tool-result event + structured TranscriptEntry, fields carried in RowViewModel.meta — **CHOSEN**

A new 'tool-result' TurnEvent and a new structured TranscriptEntry variant each carry command + output as DISTINCT fields; toViewModel maps both to a {kind:'tool-result', collapsible:true} RowViewModel whose command/output ride in meta; the renderer composes command / separator / collapsible(output).

stream-events.ts gains an additive ToolResultEvent { kind:'tool-result'; turnId; command?; output; exitCode? }. cli-adapter emits it (claude type:'user'/tool_result blocks; codex item.completed tool output) — tool-call (command) emission unchanged. session-store.ts gains an additive structured TranscriptEntry variant carrying { kind/role discriminator, command?, output } (plain-serialisable). toViewModel gains ONE branch handling BOTH the live event and the replayed entry -> { kind:'tool-result', text: command ?? '', collapsible: true, meta: { command, output } }. A registered 'tool-result' RowRenderer reads meta.command + meta.output and builds the command line, a visual separator, then wraps ONLY the output in host.collapsible(el, { defaultCollapsed: true }) (the existing 3-line-clamp primitive). appendEvent gains an explicit tool-result branch persisting the structured entry; markerFor returns null for 'tool-result' (structural persistence, not a flat marker). assistant-text stays collapsible:true but its renderer does NOT default-collapse (ac3).

### 8.2 a2: Text-packed tool-result (single pre-composed string + separator sentinel)

The event and TranscriptEntry carry a single pre-composed text ('command<sentinel>output'); RowViewModel.text holds it and the renderer splits on the sentinel to collapse the output portion.

ToolResultEvent carries a single `text` already formatted as command + a separator sentinel + output; the TranscriptEntry variant stores the same string. toViewModel maps to { kind:'tool-result', text, collapsible:true } with no meta. The 'tool-result' renderer splits text on the sentinel, renders the command part, a separator, then host.collapsible(outputPart, {defaultCollapsed:true}). appendEvent + markerFor as in a1.

**Rejected because:** Works, but the sentinel-parse makes ac4/sc1 only partial — a command or output containing the separator corrupts the split, the exact fragility a1's structured fields remove.

### 8.3 a3: Extend the marker path with a structured marker entry

Instead of a new TranscriptEntry role, extend the existing marker entry + MarkerLine to carry optional command/output so the tool-result persists on the marker path.

markerFor returns a structured MarkerLine for 'tool-result' (adding optional command/output to MarkerLine), appendEvent persists it as a role:'marker' entry with the extra fields, and toViewModel's marker branch is extended to emit a 'tool-result' row when those fields are present.

**Rejected because:** Violates k1 by reshaping the shared MarkerLine contract other stories depend on and conflates the flat-marker concept with a structured row — out of S001's boundary.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 render-model-reconciliation: render-registry.ts RowKind(:43 tool-result)/RowViewModel(:53-60)/toViewModel(:101-119)/host.collapsible 3-line primitive(:132)` — "render-registry.ts ALREADY declares a 'tool-result' RowKind member and a reusable host.collapsible(el,{defaultCollapsed}) 3-line-clamp primitive; toViewModel maps tool-call->tool-command and assistant"
- **[[c2]]** `analyze-bundle` `s1 persistence-flow: chat-panel appendEvent(:630-649) + markers.ts markerFor(:43-85) + session-store TranscriptEntry(:16-22) + both stores(:106/:195)` — "appendEvent routes non-assistant/non-status events through markerFor (flat {cssClass,label}); status is live-only; the flat marker path cannot carry structured command/output, so tool-result persists "
- **[[c3]]** `analyze-bundle` `s1 adapter-emission-gap: cli-adapter claudeMapper.mapLine has no type:'user'/tool_result handler, so tool output falls through to return []` — "claudeMapper.mapLine handles system/assistant/result/control but not type:'user' tool_result, so tool OUTPUT is never surfaced; S001 adds the handler emitting the additive tool-result event."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-29T10:27:58.021Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.3/2.4 | citation | LOW | manual | render-registry.ts declares a 'tool-result' RowKind member, the RowViewModel interface, the dual-input toViewModel(TranscriptEntry\|TurnEvent), and a RenderHost.collapsible primitive — the seams S001 reuses. | Confirmed: render-registry.ts:43 = `\| 'tool-result'` (RowKind member), :53 export interface RowViewModel, :101 export function toViewModel(entry: TranscriptEntry \| TurnEvent): RowViewModel, :71 collapsible(el, {defaultCollapsed}) primitive. All reuse targets exist. | none — verified sound |
| 2.1 | citation | LOW | manual | cli-adapter.ts claudeMapper.mapLine handles type 'system'/'assistant'/'result' but has no type:'user'/tool_result handler, so a tool_result line is not surfaced today (the additive gap S001 fills). | Confirmed: cli-adapter.ts:307 `if (type === 'assistant')` and :337 `if (type === 'result')` exist, and there are ZERO matches for `type === 'user'` or `tool_result` in the chat source — so the tool_result handler genuinely does not exist today (the additive gap S001 fills). | none — verified sound |
| 2.5 | closed-union | LOW | manual | markers.ts markerFor(event: TurnEvent): MarkerLine \| null is an exhaustive switch over event.kind with a `never` default, so adding a new 'tool-result' TurnEvent kind requires a new case (S001 returns null). | Confirmed: markers.ts:43 markerFor(event: TurnEvent): MarkerLine \| null, :80 `const _never: never = event` (exhaustive-switch default), :63 case 'tool-call' — so a new 'tool-result' kind requires a case, which S001 adds as return null. | none — verified sound |
| 2.6 | citation | LOW | manual | chat-panel.ts appendEvent persists assistant-delta as role:'assistant', drops 'status' (live-only), and routes every other event through markerFor to a flat role:'marker' entry — the persistence path S001 adds a structured tool-result branch to. | Confirmed: chat-panel.ts:630 appendEvent, :643 `const marker = markerFor(ev)`, :647 push { role: 'marker', ... } — the flat-marker persistence path S001 adds a structured tool-result branch beside. | none — verified sound |
| 3.2 | inventory | LOW | manual | session-store.ts declares the TranscriptEntry interface and exactly two store constructions — createInMemoryChatSessionStore and createMementoChatSessionStore — that a new persisted tool-result entry must round-trip. | Confirmed: session-store.ts:16 export interface TranscriptEntry, :195 createInMemoryChatSessionStore, :106 createMementoChatSessionStore — exactly the two store constructions a new persisted entry must round-trip. | none — verified sound |
