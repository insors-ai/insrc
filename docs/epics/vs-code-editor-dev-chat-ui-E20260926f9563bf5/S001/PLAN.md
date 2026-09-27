<!-- insrc:artifact PLAN-f9563bf5bbb29c43-s1 -->

# Plan: E20260926f9563bf5:S001

**Epic:** `vs-code-editor-dev-chat-ui`
**LLD run:** `wf-1790430623509-50mblv`
**LLD effective hash:** `8417b84c742c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Introduce sc1 view layer: types + RenderRegistry + RenderHost collapse primitive + line() fallback, wired into the append path | M | — | unit: RenderRegistry.renderRow — dispatches to a registered renderer and falls back to line() for an unmapped kind (incl. the reserved 'approval-request'); unit: RenderHost.collapsible — icon-only chevron primitive; default-collapsed clamps to 3 lines (S001 provides it; tool-command renderer never uses it); integration: the ~151 existing chat tests (chat-panel/cli-adapter/markers) stay green — line() fallback keeps every current row kind rendering unchanged | [[c1]] |
| 2 | **`t2`** Additively widen sc2: add optional ToolCallEvent.command + reserve the 'approval-request' kind | S | — | unit: TURN_EVENT_KINDS includes 'approval-request' and TurnEventKind derives it; ToolCallEvent accepts an optional command with no existing kind changing shape (additive, k2) | [[c2]] [[c3]] |
| 3 | **`t3`** Populate ToolCallEvent.command in both cli-adapter mappers | S | `t2` | unit: cli-adapter claude mapper — a Bash tool_use sets ToolCallEvent.command from input.command; a command-less tool omits command; unit: cli-adapter codex mapper — a command_execution item sets command from item.command; a command-less item omits it | [[c2]] |
| 4 | **`t4`** Implement toViewModel + register the user / assistant-text / tool-command renderers | M | `t1`, `t2` | unit: toViewModel — user/assistant/tool-command/unknown entries map to the right RowKind + role; integration: an assistant multi-step turn renders each step's actual text, not a status label; integration: a command-bearing tool-call renders the command line; a command-less one renders the tool name | [[c1]] [[c2]] |
| 5 | **`t5`** Host single-writer live user-row echo on submit, reconciled against replay (lc1) | M | `t1`, `t4` | integration: submit-turn emits a live user row that renders immediately (not only after reload); integration: the live user row + its session-restored replay reconcile to exactly one row (lc1) | [[c4]] |
| 6 | **`t6`** 32-char session-name ellipsis in the header (view-only) | S | — | unit: session-title clamp helper — >32 chars truncates to 32 + ellipsis; <=32 unchanged; integration: the header renders a >32-char session name clamped with an ellipsis | [[c5]] |

### E20260926f9563bf5:S001:T001 — Introduce sc1 view layer: types + RenderRegistry + RenderHost collapse primitive + line() fallback, wired into the append path

Add the net-new sc1 webview types (RowKind, RowViewModel, RowRenderer, RenderRegistry, RenderHost) inline under the CSP, implement RenderRegistry.renderRow (dispatch by kind, fall back to the flat line() renderer for any unmapped kind incl. the reserved 'approval-request'), implement RenderHost.collapsible as the icon-only chevron (▸/▾) 3-line-clamp primitive (provided but not yet consumed by S001), wrap the existing line() (chat-panel.ts:234) as the registered 'fallback' RowRenderer, and route the transcript append path through renderRow. Behaviour-neutral: every currently-handled row kind renders exactly as today.

**Acceptance checks:**
- RenderRegistry.renderRow dispatches to a registered renderer and returns line()'s output for any unmapped kind (incl. 'approval-request')
- RenderHost.collapsible produces an icon-only chevron toggle and a default-collapsed 3-line-clamped container using className/textContent only, no innerHTML (k1)
- line() is registered as the 'fallback' renderer and is unchanged; all currently-handled row kinds render byte-identically — the ~151 chat tests stay green (k2)
- the render layer is inline under the nonce'd CSP; nothing fetches externally (k1)

### E20260926f9563bf5:S001:T002 — Additively widen sc2: add optional ToolCallEvent.command + reserve the 'approval-request' kind

In stream-events.ts add an optional `command?: string` to the ToolCallEvent member (:33) and add 'approval-request' to TURN_EVENT_KINDS (:50) so TurnEventKind (:59) gains it — no handler, S004 fills it. Purely additive: no existing kind or message changes shape.

**Acceptance checks:**
- ToolCallEvent has an optional `command?: string`; existing tool-call producers/consumers/tests compile and pass unchanged (k2)
- TURN_EVENT_KINDS contains 'approval-request' and TurnEventKind includes it; no S001 handler is registered for it
- no existing TurnEvent kind or protocol message changes shape (additive only, k2)

### E20260926f9563bf5:S001:T003 — Populate ToolCallEvent.command in both cli-adapter mappers

In the claude mapper set command from the already-parsed `input['command']` at the tool-call emit (cli-adapter.ts:166/:171) and in the codex mapper from `item['command']` (cli-adapter.ts:222/:223), each guarded by a `typeof ... === 'string'` check so command-less tools omit the field and emit exactly as today.

**Acceptance checks:**
- a Bash claude tool_use emits a tool-call carrying command from input.command; a command-less tool omits command
- a codex command_execution item emits a tool-call carrying command from item.command; a command-less item omits command
- an unparseable line still skips+logs unchanged (SyntaxError path preserved)

### E20260926f9563bf5:S001:T004 — Implement toViewModel + register the user / assistant-text / tool-command renderers

Implement toViewModel(entry) as a pure mapping from a TranscriptEntry or TurnEvent to a RowViewModel (unrecognised → kind:'fallback'), and register the 'user', 'assistant-text', and 'tool-command' renderers on the registry. The tool-command renderer shows the real command inline and is NEVER collapsed (k6 d). renderRow wraps each renderer in try/catch, falling back to line() on throw. Type-level deps are t1 (registry/host) and t2 (the command field); the command-bearing render proof is exercised after t3 populates command (order already places t3 before t4).

**Acceptance checks:**
- toViewModel maps user/assistant/tool-command/unknown entries to the correct RowKind + role and is pure (no DOM, no storage write)
- an assistant entry maps to an assistant-text row carrying its actual text (ac2)
- the tool-command renderer renders the command inline and never uses collapsible (k6 d); with t3 populating command, a command-bearing tool-call shows the command, a command-less one shows the tool/mcp name
- a renderer that throws is caught and the row falls back to line() text (per-row isolation)

### E20260926f9563bf5:S001:T005 — Host single-writer live user-row echo on submit, reconciled against replay (lc1)

Change the submit-turn host handler so the SAME append that persists the durable user row (chat-panel.ts:337) also emits it as a live turn-event to the webview, and give rows a stable key so a live-emitted row and its session-restored replay reconcile to exactly one rendered row. The stored transcript shape is unchanged (role:'user'+text); only WHEN the row surfaces changes (k4).

**Acceptance checks:**
- on submit the user's prompt renders immediately as its own row, during the turn, not only after reload (ac1)
- the live user row and its session-restored replay reconcile to exactly one row via the stable key (lc1) — no duplicate after reload
- submitting the same prompt twice yields two distinct keyed rows
- the durable transcript schema is unchanged and status ticks remain non-persisted (k4, chat-panel.ts:424)

### E20260926f9563bf5:S001:T006 — 32-char session-name ellipsis in the header (view-only)

Add a pure view transform where the header renders the session title in the chrome: names longer than 32 chars truncate to 32 + a trailing ellipsis; names of 32 or fewer chars render in full. The stored title is left unchanged (k4).

**Acceptance checks:**
- a session name >32 chars renders truncated to 32 chars + a trailing ellipsis in the header (ac4)
- a session name <=32 chars renders in full with no ellipsis
- the stored/persisted session title is unchanged (view-only transform, k4)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| toViewModel — user/assistant/tool-command/unknown entries map to the right RowKind + role | `t4` |
| RenderRegistry.renderRow — dispatches to a registered renderer and falls back to line() for an unmapped kind (incl. the reserved 'approval-request') | `t1` |
| RenderHost.collapsible — icon-only chevron primitive; default-collapsed clamps to 3 lines (S001 provides it; tool-command renderer never uses it) | `t1` |
| cli-adapter claude mapper — a Bash tool_use sets ToolCallEvent.command from input.command; a command-less tool omits command | `t3` |
| cli-adapter codex mapper — a command_execution item sets command from item.command; a command-less item omits it | `t3` |
| session-title clamp helper — >32 chars truncates to 32 + ellipsis; <=32 unchanged | `t6` |
| submit-turn emits a live user row that renders immediately (not only after reload) | `t5` |
| the live user row + its session-restored replay reconcile to exactly one row (lc1) | `t5` |
| an assistant multi-step turn renders each step's actual text, not a status label | `t4` |
| a command-bearing tool-call renders the command line; a command-less one renders the tool name | `t4`, `t3` |
| the header renders a >32-char session name clamped with an ellipsis | `t6` |
| the ~151 existing chat tests (chat-panel/cli-adapter/markers) stay green — line() fallback keeps every current row kind rendering unchanged | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails + dataModelChanges: sc1 view layer (toViewModel/RenderRegistry/RenderHost/line fallback; RowViewModel+RowKind+RowRenderer new)` — "New webview-side view types establishing sc1: the per-row view-model + the render registry + the RenderHost collapse/chevron primitive; line() is registered as the 'fallback' renderer."
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: ToolCallEvent (sc2) field-add command?: string + mapLine population at cli-adapter.ts:171/:223` — "Add optional command?: string to the existing tool-call TurnEvent; populated from the already-parsed input.command (claude :166) / item.command (codex :222)."
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: TURN_EVENT_KINDS / TurnEvent union (sc2) field-add reserving 'approval-request'` — "RESERVE the 'approval-request' kind in the union + TURN_EVENT_KINDS as a type S004 fills; adding a member is additive; S001 registers no approval handler."
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: user-row emit on submit (host) invariant-change + lc1 (chat-panel.ts:262/:337)` — "The host, on 'submit-turn', emits the durable user row as a live turn-event in addition to persisting it — one append is both the durable row and the live echo, so a session-restored replay renders ex"
- **[[c5]]** `prior-artifact` `LLD s1 acceptanceCriteria ac4 + migration step 6: 32-char session-name ellipsis (view-only)` — "Add the view-only session-name clamp (>32 chars → 32 + ellipsis) in the header render; the stored title is left unchanged (k4)."
