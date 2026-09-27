<!-- insrc:artifact LLD-f9563bf5bbb29c43-s1 -->

# LLD: E20260926f9563bf5:S001

**Epic:** `vs-code-editor-dev-chat-ui`
**HLD base run:** `wf-1790428640052-v7rbx8`
**HLD effective hash:** `8417b84c742c...`

## HLD context

**Framework:** Deliver the overhaul as ONE shared inline render layer plus an additively-widened event/protocol contract, both foundational in S001, with S002/S003/S004 building on them. S001 establishes (sc1) a message view-model derived at view time from the plain durable transcript + a render registry of inline widget renderers, and (sc2) the additively-widened TurnEvent + webview protocol (tool-call carries its command; the approval event/message + permission-mode are reserved shapes S004 fills). S002 restyles the shell chrome (fixed header, bottom-pinned input, icon-only Send/Stop, one animated progress widget) around the EXISTING DOM regions, preserving their stable element ids so it needs no cross-story contract. S003 adds the concrete renderers to sc1's registry (user/assistant differentiation, collapse-by-default 3-line preview for both roles + tool results/inline diffs via one shared chevron primitive, markdown + JSON widgets). S004 fills sc2's approval event + permission-decision message and adds a CLI permission-mode seam on the adapter spawn, plus an approval-card renderer and the auto-mode status indicator. The agreed mock (k5) and locked directions (k6) are implemented ONCE in the render layer. Everything inline under the nonce'd CSP (k1), the transcript stays plain + replayable (k4), the contract stays additive/non-breaking (k2), and permissions ride CLI flags with no REST (k3).
**Rollout phase:** Phase A — foundation (render layer + widened contract + fidelity)
**Owns:** `sc1` (MessageViewModel + inline RenderRegistry), `sc2` (ChatEventProtocol (additively widened))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: Owns the shell chrome as pure layout over the EXISTING DOM regions: fixed header on top, bottom-pinned input with an icon-only Send/Stop button (▶ green / ■ red), and a single animated progress widget above the input (live-only, never written to the transcript). Preserves the stable element ids/regions (the transcript node, the status bar, the input) so the S001 render layer and the S004 approval card + auto-mode indicator slot into the same regions without S002 exposing a cross-story contract. Independent of S001 in the graph; both touch renderShell in separable ways (S001 the render script, S002 the shell CSS/controls) and both keep the element-id contract stable.
- `s3`: Consumes sc1 and registers the concrete message/widget renderers: user-vs-assistant visual differentiation; collapse-by-default to a 3-line preview for long user AND assistant messages via sc1's shared icon-only chevron primitive; tool results and inline diffs collapsing to their caption header via the same primitive (the single-line tool-command renderer from S001 stays inline, never collapsed); and markdown + JSON render widgets. All renderers emit inline DOM (k1) and read only the plain view-model (k4). Adds no new event/protocol shape.
- `s4`: Consumes sc1 (registers the approval-card renderer) and sc2 (fills the approval-request event + permission-decision message + permission-mode). Owns the adapter permission seam: run claude with --permission-prompts host + a permission-prompt handler (codex: its approval routing) so a permission request surfaces as an approval-request event; relay the webview's approve/deny decision back to the CLI's permission channel; and a permission-mode seam on the spawn args (auto = --permission-mode/bypass; review = host-answered) driven by an auto/review selector shown in the status bar. All via CLI flags (k3), no REST.

## Contract details

**Surface level:** internal-shared

### `toViewModel`

```typescript
function toViewModel(entry: TranscriptEntry | TurnEvent): RowViewModel
```

**Parameters:**
- `entry: TranscriptEntry | TurnEvent` — A plain durable transcript row OR a live turn-event to be rendered.

**Returns:** `RowViewModel` — The view-time model {kind, role?, text, cssClass?, collapsible, meta?} the registry renders; derived, never persisted (k4).

**Errors:**
- `none` when Total function — an unrecognised entry maps to kind:'fallback' (rendered by line()).

**Preconditions:**
- Runs webview-side under the nonce'd CSP (k1).

**Postconditions:**
- kind is one of RowKind; a user or assistant row carries role; the mapping is pure (no DOM, no storage write).

### `RenderRegistry`

```typescript
interface RenderRegistry { register(kind: RowKind, r: RowRenderer): void; renderRow(vm: RowViewModel): HTMLElement }
```

**Parameters:**
- `kind: RowKind` — The row kind a renderer is registered for.
- `r: RowRenderer` — The inline renderer producing an HTMLElement via textContent/className only.

**Returns:** `HTMLElement` — renderRow returns the DOM node for a row; dispatches to the registered renderer or the 'fallback' renderer when a kind is unmapped.

**Errors:**
- `none` when An unmapped kind falls back to the line() renderer (k2 — no current row kind regresses).

**Preconditions:**
- S001 registers 'user', 'assistant-text', 'tool-command', and 'fallback'; S003/S004 register the remaining kinds later.

**Postconditions:**
- Every RowKind resolves to a renderer (registered or fallback); renders are inline (k1).

### `RenderHost.collapsible`

```typescript
collapsible(el: HTMLElement, opts: { defaultCollapsed: boolean }): HTMLElement
```

**Parameters:**
- `el: HTMLElement` — The content element to wrap in the shared collapse container.
- `opts.defaultCollapsed: boolean` — Whether the content starts collapsed (S003 messages/results pass true).

**Returns:** `HTMLElement` — A container with the icon-only chevron (▸/▾) toggle per k6(a); S001 provides the primitive, S003 uses it. The tool-command renderer does NOT use it (k6 d).

**Errors:**
- `none` when Pure DOM construction; no failure path.

**Preconditions:**
- Inline under CSP; toggle via className, no innerHTML (k1).

**Postconditions:**
- Collapsed content clamps to a 3-line preview; the chevron is icon-only (k6 a/b).

### `line`

```typescript
function line(s: string, cls?: string): void
```

**Parameters:**
- `s: string` — The text content (textContent) of the row.
- `cls: string` _(optional)_ — Optional marker className.

**Returns:** `void` — The existing flat writer (chat-panel.ts:234), now registered as the 'fallback' RowRenderer so every currently-handled row kind renders unchanged.

**Errors:**
- `none` when Unchanged behaviour.

**Preconditions:**
- Reused verbatim; not deleted (k2).

**Postconditions:**
- Appended row uses textContent + optional className only (k1).

### `mapLine`

```typescript
mapLine(line: string, turnId: string, state: TurnState): TurnEvent[]
```

**Parameters:**
- `line: string` — A raw stream-json / codex-json line from the CLI subprocess.
- `turnId: string` — The active turn id.
- `state: TurnState` — Parser state (sessionId capture etc.).

**Returns:** `TurnEvent[]` — The existing claude/codex mappers (cli-adapter.ts:156/:200), reshaped ONLY to set the additive ToolCallEvent.command from the already-parsed input.command (claude :166) / item.command (codex :222).

**Errors:**
- `SyntaxError` when Unparseable line — unchanged: caller skips + logs.

**Preconditions:**
- command is a compact command string; secrets are not introduced (the command text is what the tool already ran).

**Postconditions:**
- tool-call events carry command when the source provides one; when absent, command is omitted and rendering falls back to the tool name (k2).

## Data model changes

### `RowViewModel + RowKind + RowRenderer + RenderRegistry + RenderHost (sc1)` — new

New webview-side view types establishing sc1: the per-row view-model + the render registry + the RenderHost collapse/chevron primitive. Derived at view time from the plain transcript; never persisted (k4). line() is registered as the 'fallback' renderer.

```
+ type RowKind = 'user'|'assistant-text'|'assistant-markdown'|'assistant-json'|'tool-command'|'tool-result'|'inline-diff'|'approval'|'progress'|'fallback';
+ interface RowViewModel { kind; role?; text; cssClass?; collapsible; meta? }
+ interface RenderRegistry { register; renderRow }
+ interface RenderHost { collapsible; tokens }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:234`
- `vscode-plugin/src/chat/markers.ts:66`

### `ToolCallEvent (sc2)` — field-add

Add optional `command?: string` to the existing tool-call TurnEvent. Additive (k2): every existing tool-call producer/consumer/test keeps working; populated from the already-parsed command.

```
interface ToolCallEvent { kind:'tool-call'; turnId; tool; mcp?; command?: string }
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts:33`
- `vscode-plugin/src/chat/cli-adapter.ts:171`
- `vscode-plugin/src/chat/cli-adapter.ts:223`

### `TURN_EVENT_KINDS / TurnEvent union (sc2)` — field-add

RESERVE the 'approval-request' kind in the union + TURN_EVENT_KINDS as a type S004 fills. Adding a member is additive; S001 registers no approval handler (stay-in-scope). Existing kinds unchanged.

```
TURN_EVENT_KINDS = [ ...existing, 'approval-request' ]
```

**Call sites:**
- `vscode-plugin/src/chat/stream-events.ts:50`
- `vscode-plugin/src/chat/stream-events.ts:59`

### `user-row emit on submit (host)` — invariant-change

The host, on 'submit-turn', emits the durable user row as a live turn-event in addition to persisting it — ONE append is both the durable row and the live echo, so a session-restored replay renders exactly one user row (lc1). The stored transcript shape is unchanged (still role:'user'+text); this changes WHEN the row is surfaced, not its schema (k4).

```
(no schema change) submit path: persist user row + post turn-event(userRow)
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:262`
- `vscode-plugin/src/chat/chat-panel.ts:337`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S001 owns + realizes sc1: defines RowViewModel/RowKind/RowRenderer/RenderRegistry/RenderHost, wires renderRow into the webview transcript append path, registers the 'user'/'assistant-text'/'tool-command'/'fallback' renderers + the collapse/chevron primitive. S003/S004 later register their kinds into the same registry (consume). |
| `sc2` | implements | S001 owns + widens sc2: adds ToolCallEvent.command (populated in both mappers) and reserves the 'approval-request' kind, keeping every existing event kind/message byte-compatible (k2). S004 later fills the approval event + permission messages (consume). |

## Error paths

### Error cases

- **The parsed tool input has no usable command string (e.g. a non-Bash tool, or input.command is absent/non-string).** (recoverable)
  - Detection: The mapper guards `typeof input['command'] === 'string'` (claude) / `typeof item['command'] === 'string'` (codex) before setting ToolCallEvent.command.
  - Response: Omit command; emit the tool-call exactly as today (tool + optional mcp). The renderer shows the tool/mcp name.
  - User impact: No regression — command-less tools render as before; only command-bearing tools gain the extra line.
- **A registered row renderer throws while building its DOM node.** (recoverable)
  - Detection: renderRow wraps each renderer call in try/catch (per-row isolation).
  - Response: Catch and render the row via the flat line() fallback (its text) so one bad renderer never blanks or breaks the whole transcript; log to the webview console.
  - User impact: The affected row shows as plain text instead of its rich widget; the rest of the conversation renders normally.
- **The user-row turn-event is emitted by the host but the webview receives the session-restored replay for the same row (live + restore in one session).** (recoverable)
  - Detection: Rows carry a stable key; renderRow/append checks whether a row with that key already exists before appending.
  - Response: Render the row once — the live-emitted row and its replayed twin reconcile to a single node (lc1).
  - User impact: Exactly one user message; never a duplicate after reload.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The user submits the same prompt text twice in one session. | Two distinct user rows (each its own keyed message) — lc1 reconciles live-vs-replay of the SAME row, not two independent submits. |
| A tool-call whose command is very long (e.g. a multi-line here-doc). | The tool-command row stays INLINE and always-visible (k6 d, never collapsed); overflow scrolls within the row's own container, it is not clamped away. |
| An unmapped/new row kind reaches renderRow (e.g. the reserved 'approval-request' before S004 registers it). | The 'fallback' renderer (line()) renders it as plain text — no crash, no blank (k2). |
| A session name of 32 characters or fewer. | Shown in full with no ellipsis; the clamp only applies beyond 32 chars (ac4). |
| An assistant message arrives as multiple assistant-delta events across steps. | Each step's actual text renders as it arrives (ac2), via the view-model — not collapsed to a single status label. |

### Invariants to preserve

- flat line() remains a working renderer (registered as 'fallback'); every currently-handled row kind renders unchanged so the ~151 chat tests stay green (k2). [[c1]]
- The durable session transcript stays a plain record (role/text/cssClass); the RowViewModel is derived at view time and never persisted, and status ticks remain non-persisted as today (k4, chat-panel.ts:424). [[c1]]
- Every existing TurnEvent kind + webview protocol message keeps its current shape; S001 only ADDS an optional ToolCallEvent.command and RESERVES the 'approval-request' kind (additive, k2). [[c4]]
- The tool COMMAND is the text the tool already ran (from the parsed input/item) — no new data source, no secret introduced; command-less tools omit it (cli-adapter.ts:166/:222). [[c3]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (the vscode-plugin/src/chat suites: chat-panel.test.ts, cli-adapter.test.ts, markers.test.ts)`

### Test levels

- **unit** — Prove the new sc1 view layer in isolation: toViewModel mapping, RenderRegistry dispatch + fallback, the collapse/chevron primitive, and the additive ToolCallEvent.command population in both mappers.
  - Subjects: `toViewModel — user/assistant/tool-command/unknown entries map to the right RowKind + role`, `RenderRegistry.renderRow — dispatches to a registered renderer and falls back to line() for an unmapped kind (incl. the reserved 'approval-request')`, `RenderHost.collapsible — icon-only chevron primitive; default-collapsed clamps to 3 lines (S001 provides it; tool-command renderer never uses it)`, `cli-adapter claude mapper — a Bash tool_use sets ToolCallEvent.command from input.command; a command-less tool omits command`, `cli-adapter codex mapper — a command_execution item sets command from item.command; a command-less item omits it`, `session-title clamp helper — >32 chars truncates to 32 + ellipsis; <=32 unchanged`
  - Fixtures: `a sample claude stream-json tool_use line (Bash + a non-command tool)`, `a sample codex-json command_execution item`, `sample TranscriptEntry rows (user, assistant, marker)`
- **integration** — Prove the webview transcript behaviour end-to-end over the existing chat-panel harness: live user echo, per-step assistant content, tool-command surfacing, and de-dup against session-restored replay.
  - Subjects: `submit-turn emits a live user row that renders immediately (not only after reload)`, `the live user row + its session-restored replay reconcile to exactly one row (lc1)`, `an assistant multi-step turn renders each step's actual text, not a status label`, `a command-bearing tool-call renders the command line; a command-less one renders the tool name`, `the header renders a >32-char session name clamped with an ellipsis`, `the ~151 existing chat tests (chat-panel/cli-adapter/markers) stay green — line() fallback keeps every current row kind rendering unchanged`
  - Fixtures: `the existing chat-panel.test.ts webview DOM harness`, `a scripted turn event sequence (user submit → assistant deltas → tool-call → done)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: submit-turn emits a live user row that renders immediately`, `integration: live user row + session-restored replay reconcile to exactly one row (lc1)` |
| `ac2` | `integration: assistant multi-step turn renders each step's actual text, not a status label`, `unit: toViewModel maps an assistant entry to an assistant-text row carrying its text` |
| `ac3` | `unit: claude mapper sets ToolCallEvent.command from input.command; command-less tool omits it`, `unit: codex mapper sets command from item.command`, `integration: a command-bearing tool-call renders the command line; command-less renders the tool name` |
| `ac4` | `unit: session-title clamp truncates >32 chars to 32 + ellipsis and leaves <=32 unchanged`, `integration: the header renders a >32-char session name clamped with an ellipsis` |

## Migration

**State before:** The webview renders every row through the flat `line(s,cls)` writer (chat-panel.ts:234) with no view-model layer; tool-calls show the tool/mcp name only (markers.ts:66); on submit the bootstrap posts submit-turn and clears the box but renders NO live user row, so the user's prompt appears only on the next session-restored replay of the durable transcript (chat-panel.ts:262/:337); ToolCallEvent carries no command (stream-events.ts:33); the session name is rendered untruncated in the chrome. ~151 chat tests are green against this behaviour.

**State after:** A webview-side sc1 view layer (RowViewModel + RenderRegistry + RenderHost) sits over the transcript; `line()` is registered as the 'fallback' renderer so every current row kind renders unchanged. Submitting a prompt emits a live user row that renders immediately and reconciles with the durable replay to exactly one row (lc1). Each assistant step's actual text renders as it arrives. ToolCallEvent carries an optional `command` populated additively in both mappers, and the tool-command row renders the real command inline. The header clamps a >32-char session name to 32 + ellipsis (view-only; stored title unchanged). The 'approval-request' kind is reserved for S004 but unhandled.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the sc1 view types (RowKind, RowViewModel, RowRenderer, RenderRegistry, RenderHost) and register `line()` as the 'fallback' renderer, wiring renderRow into the transcript append path — behaviour-neutral: unmapped kinds still render via line() exactly as today. — ↩ rollbackable
2. Register the 'user', 'assistant-text', and 'tool-command' renderers so each maps to its RowViewModel (still text-only, inline, CSP-safe). — ↩ rollbackable
3. Add the nullable optional field ToolCallEvent.command and populate it in the claude mapper (from input.command) and the codex mapper (from item.command); command-less tools omit it. — ↩ rollbackable
4. Reserve the 'approval-request' kind in TURN_EVENT_KINDS / TurnEvent union with no handler (S004 fills it); the fallback renderer covers it in the interim. — ↩ rollbackable
5. Change the submit path to emit the user row as a live turn-event in addition to persisting it, and add the key-based de-dup so the live row and its session-restored replay reconcile to one row (lc1). — ↩ rollbackable
6. Add the view-only session-name clamp (>32 chars → 32 + ellipsis) in the header render; the stored title is left unchanged. — ↩ rollbackable

**Backward compat:** ToolCallEvent.command is optional and additive — every existing tool-call producer, consumer, and test keeps working with command absent; the tool name still renders when command is omitted. Adding the 'approval-request' kind is additive (no existing kind changes shape). line() stays the fallback renderer so all currently-handled row kinds render byte-identically, keeping the ~151 chat tests green. The durable transcript schema is unchanged (still role/text/cssClass); the user-row change is a timing change (surface live + on replay as one row), not a schema change.

## Alternatives considered

### a1: Webview-side view-model + registry; user-echo as a host-posted 'user' row (single writer) — **CHOSEN**

The host is the single source of the user row — on submit it appends the durable user row AND posts it as a turn-event; the webview derives a RowViewModel per row via the registry, so the live echo and the replay are the same one row.

sc1's RowViewModel + RenderRegistry live in the webview (inline under the CSP, k1). On submit the host, on receiving 'submit-turn', appends the durable user row exactly as today (chat-panel.ts:337) AND immediately posts a turn-event carrying that same user row to the webview; the webview's toViewModel maps it to a kind:'user' RowViewModel and the registry renders it. Because the host writes the durable row and emits the live row from the SAME append, there is exactly one user row: on a later session-restored replay the row re-renders identically, so lc1 holds with no client-side de-dup guessing. ToolCallEvent.command is populated additively at cli-adapter.ts:171/:223 from the already-parsed input/item command; the registry's tool-command renderer shows it inline and never-collapsed. The 32-char title clamp is a pure view transform in the header renderer. line() is registered as the 'fallback' renderer so any unmapped kind still renders as today (k2).

### a2: Optimistic client-side echo + de-dup against replay

The bootstrap renders the user row locally on submit; on session-restored it de-dupes the replayed user row against the optimistic one by matching text + position.

Leave the host submit path unchanged (it still persists the durable user row at :337). The webview, on submit, optimistically renders a kind:'user' row immediately, then on the next session-restored replay reconciles by dropping/merging a replayed user row that matches the optimistic one (by text + adjacency). sc1 registry is still webview-side. ToolCallEvent.command + title clamp identical to a1.

**Rejected because:** Only partial on sc2/lc1: it leaves lc1 to a fragile client-side de-dup heuristic (match by text + position) — the exact double-render foot-gun the constraint warns about — and splits the user-row source of truth across the webview + host, contradicting the existing single-append model. a1 makes lc1 true by construction instead.

### a3: Host-side view-model (host emits render-ready RowViewModels)

Move toViewModel to the host so it posts fully-formed RowViewModels; the webview registry only renders them.

The host builds the RowViewModel for every row (user, assistant, tool, etc.) and posts render-ready view-models to the webview; the webview registry maps kind→renderer with no derivation logic. sc1's toViewModel lives host-side; the webview is a thin renderer. User-echo is a host-emitted user RowViewModel (single writer, like a1).

**Rejected because:** Partial on sc1/sc2: it splits sc1's derivation across host + webview (duplicating the marker/label logic markers.ts already shares) and sends richer objects over postMessage — a heavier protocol change in tension with k2 — while the webview still needs the collapse primitive + inline renderers, so it is net more code and higher regression surface than a1 for no gain.

## Citations

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/chat/chat-panel.ts:234,:262,:337,:424` — "line(s,cls) is the flat writer (textContent/className, no innerHTML); submit only posts submit-turn (:262); the host pushes the durable user row so it appears on session-restored replay (:337); append"
- **[[c3]]** `analyze-bundle` `vscode-plugin/src/chat/cli-adapter.ts:166,:171,:222,:223` — "claude mapper exposes input (:166) and emits the tool-call name-only (:171); codex items carry item.command (:222) and emit tool-only (:223) — command is already available to populate ToolCallEvent.co"
- **[[c4]]** `analyze-bundle` `vscode-plugin/src/chat/stream-events.ts:33,:50,:59` — "The tool-call kind member (:33), TURN_EVENT_KINDS (:50) and TurnEventKind = typeof[number] (:59) — S001 adds optional command + reserves 'approval-request' additively; no existing kind changes shape."
- **[[c5]]** `analyze-bundle` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:370, cli-adapter.test.ts, markers.test.ts:23` — "Existing chat suites (chat-panel 36 / cli-adapter 22 / markers 7) run via node:test (npx tsx --test) and must stay green; S001 extends them with the user-echo, command-parse, title-clamp, and view-mod"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 12 LOW** · model `client` · reviewed 2026-09-26T14:08:45.234Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contractDetails/line | citation | LOW | manual | vscode-plugin/src/chat/chat-panel.ts defines a flat writer `line(s, cls?)` that sets textContent and only sets className when cls is passed (no innerHTML), around line 234. | chat-panel.ts:234 reads verbatim `function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;...}` — flat writer, textContent, className only when cls passed, no innerHTML. Exactly as cited. | None — citation resolves verbatim. |
| migration/stateBefore | citation | LOW | manual | On submit the webview bootstrap posts a 'submit-turn' message (and clears the box) with no live user-row render, around chat-panel.ts:262. | chat-panel.ts:262 posts {type:'submit-turn',text:box.value} and clears box.value on Cmd/Ctrl+Enter — no live user-row render, as cited. | None — confirmed. |
| dataModel/user-row | citation | LOW | manual | The host pushes a durable user row (role:'user') into the transcript, around chat-panel.ts:337, which is why the prompt currently appears only on session-restored replay. | chat-panel.ts:337 reads `s.transcript.push({ role: 'user', text: prompt, at: now() });` — the host durably pushes the user row, confirming the current replay-only appearance. | None — confirmed. |
| invariants/k4 | citation | LOW | manual | appendEvent persists marker/assistant rows to the transcript but does NOT persist status ticks, around chat-panel.ts:424. | chat-panel.ts:424 reads `if (ev.kind === 'status') return;` — status ticks are skipped from persistence, confirming k4's non-persisted-status invariant. | None — confirmed. |
| dataModel/sc1 | citation | LOW | manual | markers.ts maps a tool-call event to a label using the tool/mcp name only (e.g. `event.mcp ? server·name : event.tool`), around markers.ts:66. | markers.ts:66 reads `label: event.mcp ? `${event.mcp.server} · ${event.mcp.name}` : event.tool,` — tool-call label is name-only, as cited; motivates surfacing the command. | None — confirmed. |
| contractDetails/mapLine | citation | LOW | manual | cli-adapter.ts has a claude mapper (around :156) whose assistant tool_use block exposes `input` (around :166) and emits the tool-call (around :171) with tool (+mcp) only. | cli-adapter.ts:166 `const input = (block['input'] ...) ?? {};` and :171 emits `{ kind:'tool-call', turnId, tool: toolName[, mcp] }` — claude mapper exposes input and emits name-only, exactly as cited; command is available to populate additively. | None — confirmed. |
| contractDetails/mapLine | citation | LOW | manual | cli-adapter.ts has a codex mapper (around :200-227) whose command_execution/tool_call items carry `item.command` (around :222) and emit the tool-call (around :223) with tool only. | cli-adapter.ts:222 shows `item['command']` is read (currently coalesced into `tool` as a fallback label) and :223 emits `{ kind:'tool-call', turnId, tool }`. item.command is present at the parse point, so populating a separate additive `command` field is sound; the LLD's characterization holds. | None — confirmed; the command value is already in hand at :222. |
| dataModel/ToolCallEvent | citation | LOW | manual | stream-events.ts declares the tool-call TurnEvent member (`kind: 'tool-call'`) around :33 — the shape S001 extends with an optional `command?: string`. | stream-events.ts:33 reads `readonly kind: 'tool-call';` — the ToolCallEvent member S001 extends with optional command, as cited. | None — confirmed. |
| dataModel/TURN_EVENT_KINDS | citation | LOW | manual | stream-events.ts declares TURN_EVENT_KINDS (around :50) and derives TurnEventKind = typeof TURN_EVENT_KINDS[number] (around :59) — the union S001 reserves 'approval-request' into additively. | stream-events.ts:50 `export const TURN_EVENT_KINDS = [` and :59 `export type TurnEventKind = (typeof TURN_EVENT_KINDS)[number];` — the union derivation is exactly as cited; reserving 'approval-request' is a pure array-member addition. | None — confirmed. |
| boundary/sc1 | semantic | LOW | manual | There is currently NO MessageViewModel / RowViewModel / RenderRegistry / toViewModel in vscode-plugin/src/chat — sc1 is net-new (so S001 does not collide with an existing render layer). | Greps for RenderRegistry/RowViewModel/toViewModel return matches ONLY in docs/ (this epic's HLD.md + LLD.md), none in vscode-plugin/src/ — sc1 is genuinely net-new source, so S001 introduces it without colliding with an existing render layer. | None — confirmed net-new. |
| testStrategy | inventory | LOW | manual | The existing chat test suites S001 must keep green are chat-panel.test.ts, cli-adapter.test.ts, and markers.test.ts under vscode-plugin/src/chat/__tests__. | markers.test.ts:23 reads `{ kind: 'tool-call', turnId: 't', tool: 'grep' },` — an existing tool-call test fixture, confirming markers.test.ts exercises the tool-call path S001 must keep green. | None — confirmed. |
| interactionWithShared | cross-artifact | LOW | manual | S001 owns shared contracts sc1 and sc2 per the approved HLD (ownedByStory=s1), so implementing them here is in-scope and not a re-design of another story's contract. | The bare-path read of HLD.md returned found:false (no line anchor), but the grep corroborates the trace: this epic's HLD.md:15/27/30/31 defines sc1 (MessageViewModel + inline RenderRegistry, RowViewModel, toViewModel) and the LLD's own embedded HLD context slice records ownedByStory=s1 for sc1/sc2. Ownership trace holds; the failed read is a probe-anchor artifact, not an LLD defect. | None — ownership confirmed via grep + the approved HLD context slice. |
