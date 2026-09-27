<!-- insrc:artifact LLD-f9563bf5bbb29c43-s2 -->

# LLD: E20260926f9563bf5:S002

**Epic:** `vs-code-editor-dev-chat-ui`
**HLD base run:** `wf-1790428640052-v7rbx8`
**HLD effective hash:** `8417b84c742c...`

## HLD context

**Framework:** Deliver the overhaul as ONE shared inline render layer plus an additively-widened event/protocol contract, both foundational in S001, with S002/S003/S004 building on them. S001 establishes (sc1) a message view-model derived at view time from the plain durable transcript + a render registry of inline widget renderers, and (sc2) the additively-widened TurnEvent + webview protocol (tool-call carries its command; the approval event/message + permission-mode are reserved shapes S004 fills). S002 restyles the shell chrome (fixed header, bottom-pinned input, icon-only Send/Stop, one animated progress widget) around the EXISTING DOM regions, preserving their stable element ids so it needs no cross-story contract. S003 adds the concrete renderers to sc1's registry (user/assistant differentiation, collapse-by-default 3-line preview for both roles + tool results/inline diffs via one shared chevron primitive, markdown + JSON widgets). S004 fills sc2's approval event + permission-decision message and adds a CLI permission-mode seam on the adapter spawn, plus an approval-card renderer and the auto-mode status indicator. The agreed mock (k5) and locked directions (k6) are implemented ONCE in the render layer. Everything inline under the nonce'd CSP (k1), the transcript stays plain + replayable (k4), the contract stays additive/non-breaking (k2), and permissions ride CLI flags with no REST (k3).
**Rollout phase:** Phase B — shell chrome (layout, input, progress)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Owns the two foundations plus its own behaviours: the live user-prompt echo on submit (de-duplicated against the replayed row on session-restored, lc1), per-step assistant text via the view-model, surfacing the tool COMMAND (populating ToolCallEvent.command and a never-collapsed inline tool-command renderer), and the 32-char session-name ellipsis in the header. Introduces the view-model + registry and routes existing rows through it with flat line() kept as the fallback renderer, so no current row kind regresses. — owns `sc1`, `sc2`
- `s3`: Consumes sc1 and registers the concrete message/widget renderers: user-vs-assistant visual differentiation; collapse-by-default to a 3-line preview for long user AND assistant messages via sc1's shared icon-only chevron primitive; tool results and inline diffs collapsing to their caption header via the same primitive (the single-line tool-command renderer from S001 stays inline, never collapsed); and markdown + JSON render widgets. All renderers emit inline DOM (k1) and read only the plain view-model (k4). Adds no new event/protocol shape.
- `s4`: Consumes sc1 (registers the approval-card renderer) and sc2 (fills the approval-request event + permission-decision message + permission-mode). Owns the adapter permission seam: run claude with --permission-prompts host + a permission-prompt handler (codex: its approval routing) so a permission request surfaces as an approval-request event; relay the webview's approve/deny decision back to the CLI's permission channel; and a permission-mode seam on the spawn args (auto = --permission-mode/bypass; review = host-answered) driven by an auto/review selector shown in the status bar. All via CLI flags (k3), no REST.

## Contract details

**Surface level:** internal

### `renderShell`

```typescript
renderShell(): string
```

**Returns:** `string` — The full webview HTML (one nonce'd inline <script> under the strict CSP). S002 reshapes it to the mock: fixed .chrome header, a bottom-pinned .inputline gaining an icon-only Send/Stop button (#insrc-send: ▶ green at rest / ■ red while running), a single animated progress widget (#insrc-progress) above the input (hidden at rest), and the existing .statusbar; #insrc-term stays the ONLY scroll region. Every existing element id is preserved.

**Errors:**
- `none` when Pure string builder; no failure path.

**Preconditions:**
- Runs host-side; emits inline CSS/JS only (k1).

**Postconditions:**
- The html contains #insrc-send + #insrc-progress in addition to all pre-existing ids (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle); still exactly one inline <script>; no innerHTML; no remote origin.

### `handleMessage`

```typescript
handleMessage(message: unknown): void
```

**Parameters:**
- `message: unknown` — An enveloped WebviewToHost message from the panel.

**Returns:** `void` — The host intent dispatcher (chat-panel.ts:436). S002 adds a 'cancel-turn' case that routes to the existing cancelActive() reap; all existing cases (submit-turn/new-chat/open-chat/set-edit-mode/edit-decision/...) are unchanged.

**Errors:**
- `none` when A malformed/unknown message is dropped-and-logged as today (the existing default no-op).

**Preconditions:**
- cancel-turn is only meaningful while a turn is in flight; when none is active cancelActive() is an idempotent no-op.

**Postconditions:**
- On 'cancel-turn' the in-flight turn is cancelled via cancelActive() (its captured provider .cancel + iterator .return); no other host state changes.

### `cancelActive`

```typescript
cancelActive(): void
```

**Returns:** `void` — The EXISTING host turn reap (chat-panel.ts:303) — consumed unchanged by the new 'cancel-turn' handler. Cancels the active turn through its captured provider and abandons the iterator; idempotent.

**Errors:**
- `none` when Already-finished/absent turn -> no-op (existing behaviour).

**Preconditions:**
- Reused verbatim; not modified by S002.

**Postconditions:**
- activeIterator/activeProvider/activeTurnId cleared; a subsequent submit is unaffected.

## Data model changes

### `WebviewToHost 'cancel-turn' message (protocol)` — field-add

Add an additive WebviewToHost variant `{ type: 'cancel-turn' }` + 'cancel-turn' in WEBVIEW_TO_HOST_TYPES. S002-internal (producer: the #insrc-send Stop click; consumer: handleMessage -> cancelActive()); NOT a cross-story shared contract. Every existing message keeps working (k2).

```
WebviewToHost |= { readonly type: 'cancel-turn' }
WEBVIEW_TO_HOST_TYPES = [ ...existing, 'cancel-turn' ]
```

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts:53`
- `vscode-plugin/src/chat/protocol.ts:76`
- `vscode-plugin/src/chat/chat-panel.ts:436`

### `shell controls: #insrc-send (Send/Stop) + #insrc-progress (widget)` — new

renderShell adds, in .inputline, an icon-only button #insrc-send toggling ▶ (green Send, posts submit-turn) / ■ (red Stop, posts cancel-turn) driven by a webview-local `running` flag; and, above .inputline, a single #insrc-progress element (hidden at rest, animated + phase label while running). Both wire via addEventListener + className/textContent (k1). The Cmd/Ctrl+Enter submit path is retained and converges on the same submit-turn intent.

```
+ <button id="insrc-send"> (▶/■)
+ <div id="insrc-progress" hidden>
+ webview-local: var running=false
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:262`
- `vscode-plugin/src/chat/chat-panel.ts:275`
- `vscode-plugin/src/chat/chat-panel.ts:288`

### `live turn-event handler: status routes to the progress widget (not a transcript row)` — invariant-change

The webview live handler currently renders a status event as an inline transcript row (via markerFor -> reg.renderRow). S002 reroutes status events to drive #insrc-progress (show + phase label + animation) instead of appending a row; a 'done'/'error' event hides the widget and clears the running flag (also toggling #insrc-send back to ▶). The host's existing status-skip (chat-panel.ts:424) is unchanged, so status is still never persisted (lc1/k4). Non-status live rendering (assistant-delta/tool-call/markers) is unchanged from S001.

```
(no schema change) live handler: status -> #insrc-progress; done|error -> hide widget + running=false
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:424`
- `vscode-plugin/src/chat/chat-panel.ts:285`

## Error paths

### Error cases

- **The Stop button is clicked but no turn is actually in flight (e.g. the terminal done/error arrived a tick before the click, or a double-click).** (recoverable)
  - Detection: The host handleMessage routes 'cancel-turn' to cancelActive(), which reads activeIterator/activeProvider/activeTurnId and finds them undefined.
  - Response: cancelActive() is a no-op when there is no active turn (existing idempotent behaviour); the webview also flips running=false and restores ▶ on the terminal event, so the button returns to Send.
  - User impact: None — the click is harmless; the input returns to the Send state.
- **A turn ends via a terminal 'error' event (provider failed) while the progress widget is showing.** (recoverable)
  - Detection: The live handler sees a turn-event of kind 'error' (the same branch that clears running for 'done').
  - Response: Hide #insrc-progress, clear running=false, toggle #insrc-send back to ▶; the error itself still renders through the existing sc1 marker path (unchanged from S001).
  - User impact: The spinner disappears and the error row is shown; the user can submit again immediately.
- **A status event arrives after the turn's terminal event (adapter drift / late line).** (recoverable)
  - Detection: The live handler is event-ordered; status only shows the widget, and the turn is already marked not-running, but a stray late status could re-show the spinner.
  - Response: Gate the progress-show on the webview-local running flag: a status event only shows #insrc-progress while running is true, so a post-terminal status is ignored.
  - User impact: No phantom spinner after a turn completes.

### Edge cases

| Input | Expected |
| :--- | :--- |
| The user clicks Send with an empty/whitespace-only input box. | Same as today's Cmd/Ctrl+Enter path — submit-turn is posted but the host runTurn no-ops on an empty prompt (chat-panel.ts:329); no turn starts, the button stays ▶. |
| The user clicks Send (starting a turn) then immediately clicks the same button (now Stop). | The first click posts submit-turn + sets running (▶→■); the second posts cancel-turn → cancelActive() cancels the turn; the terminal event clears running (■→▶). |
| Many rapid status phase changes (thinking→tool→streaming) within one turn. | The SINGLE #insrc-progress widget updates its phase label in place — no rows accumulate in #insrc-term (ac3); the widget animates continuously. |
| The conversation is shorter than the panel height. | The header stays at top and the input stays pinned at the bottom (the flex layout); #insrc-term simply does not scroll (ac1 holds trivially). |
| A session-restored replay occurs mid-nothing (switch chats) while idle. | No progress widget is shown (running is false) and the button is ▶; only the transcript replays (S001 path unchanged). |

### Invariants to preserve

- #insrc-term remains the ONLY scrolling region; the header (.chrome) and the input/status area stay fixed via the flex model (header/input flex:0, term flex:1 min-height:0 overflow-y:auto). ac1. [[c1]]
- The animated progress widget is live-only and NEVER written to the durable transcript — the host's existing status-skip (chat-panel.ts:424 `if (ev.kind==='status') return;`) is preserved, so status never persists (lc1/k4). [[c1]]
- renderShell keeps exactly one nonce'd inline <script> under the strict CSP and renders via className/textContent only, never innerHTML or a remote origin; the new controls follow the same rule (k1). [[c1]]
- Every existing stable element id (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle) and the .statusbar region are preserved so S001's registry and S004's status-bar surfaces are unaffected (S002 exposes no cross-story contract). [[c1]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (vscode-plugin/src/chat suites: chat-panel.test.ts + a protocol assertion for the additive WebviewToHost kind)`

### Test levels

- **unit** — Assert the rendered shell html embeds the new controls + fixed-region layout while preserving the CSP/one-script/element-id invariants (chat-panel.test.ts drives renderShell via the FakeChannel and inspects the html string).
  - Subjects: `the html contains an icon-only Send/Stop button #insrc-send (▶/■) inside the input area`, `the html contains a single #insrc-progress widget above the input, hidden at rest`, `the fixed-region layout holds: #insrc-term is the only overflow-y:auto region; header + input stay flex:0`, `all pre-existing element ids are still present (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle)`, `still exactly one nonce'd inline <script>; no innerHTML; no remote origin (k1)`
  - Fixtures: `the existing FakeChannel + createChatPanelHost harness (genNonce fixed)`
- **integration** — Assert the Send/Stop + progress behaviour via posted messages + the FakeChannel message flow (no DOM execution): send posts submit-turn, stop posts the additive cancel-turn routed to cancelActive(), and a cancel-turn message cancels the in-flight turn.
  - Subjects: `a 'cancel-turn' WebviewToHost message routes to cancelActive() and cancels the active turn (the scripted adapter's cancel fires)`, `'cancel-turn' is an accepted WebviewToHost type (additive) and a no-op when no turn is active`, `the host still no-ops an empty submit (button Send with blank input starts no turn)`, `existing chat-panel/protocol suites stay green — status persistence skip (chat-panel.ts:424) unchanged (k2/lc1)`
  - Fixtures: `the scriptedAdapter with an onCancel hook + a hang option (already in chat-panel.test.ts)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: the fixed-region layout holds — #insrc-term is the only overflow-y:auto region; header + input stay flex:0`, `unit: all pre-existing element ids are still present` |
| `ac2` | `unit: the html contains an icon-only Send/Stop button #insrc-send (▶/■)`, `integration: a 'cancel-turn' message routes to cancelActive() and cancels the active turn`, `integration: 'cancel-turn' is an accepted WebviewToHost type and a no-op when no turn is active` |
| `ac3` | `unit: the html contains a single #insrc-progress widget above the input, hidden at rest`, `integration: status persistence skip (chat-panel.ts:424) unchanged — status never enters the durable transcript (lc1)` |

## Migration

**State before:** The webview shell (renderShell, chat-panel.ts:167-290) is a fixed-region flex column already — header .chrome flex:0 (:189), #insrc-term flex:1 overflow-y:auto the only scroll region (:193), .inputline + .statusbar flex:0 (:200/:204) — but the input area has NO Send button (submission is Cmd/Ctrl+Enter keydown only, :262) and no way to Stop a running turn (cancelActive() exists at :303 but no webview intent reaches it; WebviewToHost has no cancel, protocol.ts:53). A status event renders as an inline transcript row via markerFor (chat-panel.ts live handler; markers.ts:47), so 'thinking' rows accumulate; the '✓ idle' status seg (:285) is static. The host already skips persisting status (chat-panel.ts:424).

**State after:** renderShell matches the mock: fixed header, bottom-pinned input with an icon-only Send/Stop button (#insrc-send ▶ green / ■ red) and a single animated #insrc-progress widget above the input; #insrc-term is still the only scroll region and every existing id is preserved. Send posts submit-turn (idle); Stop posts the additive 'cancel-turn' WebviewToHost message, which the host routes to the existing cancelActive(). Status events drive the single progress widget (in place, gated on a webview-local running flag) instead of appending rows; done/error hides it and restores ▶. The durable transcript is unchanged (host status-skip preserved).

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive WebviewToHost variant `{ type: 'cancel-turn' }` and its entry in WEBVIEW_TO_HOST_TYPES — no existing message changes. — ↩ rollbackable
2. Add a 'cancel-turn' case to the host handleMessage dispatcher that calls the existing cancelActive(); leave all other cases untouched. — ↩ rollbackable
3. In renderShell, add the icon-only #insrc-send button to the input area and refine the header/input fixed-region CSS to the mock; wire the button to post submit-turn (idle) or cancel-turn (running) via a webview-local running flag, retaining the Cmd/Ctrl+Enter submit path. — ↩ rollbackable
4. In renderShell, add the single hidden #insrc-progress widget above the input with its animation CSS; keep it inline under the CSP (className/textContent only). — ↩ rollbackable
5. Reroute the live turn-event handler so a status event shows/updates #insrc-progress (gated on running) instead of appending a transcript row, and a done/error event hides the widget + clears running + restores ▶. Non-status rendering is unchanged; the host status-skip stays as-is. — ↩ rollbackable

**Backward compat:** The 'cancel-turn' message is additive — every existing WebviewToHost message and its handler keep working; a host that receives no cancel-turn behaves exactly as before. renderShell keeps every pre-existing element id (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle) and the single-nonce'd-script + textContent-only invariants, so S001's registry wiring and S004's status-bar region are unaffected. The Cmd/Ctrl+Enter submit path is retained (the button is an additional affordance, not a replacement). The durable transcript schema and the host status-skip are unchanged (k4). No public host API signature changes (handleMessage/cancelActive keep their shapes).

## Alternatives considered

### a1: Webview-local turn-state; one additive 'cancel-turn' intent; status-driven progress widget — **CHOSEN**

The shell adds an icon-only Send/Stop button and a single #insrc-progress widget, both driven webview-side from turn-events; the only protocol change is one additive 'cancel-turn' WebviewToHost message routed to the existing host cancelActive().

renderShell gains, inside .inputline, an icon-only button #insrc-send that shows ▶ (green) when idle and ■ (red) while a turn runs; and, above .inputline, a single #insrc-progress element (hidden by default). The bootstrap tracks a webview-local `running` flag: set true on submit, cleared on a turn-event of kind 'done' or 'error'. Clicking #insrc-send posts {type:'submit-turn',text} when idle (identical to the existing Cmd/Ctrl+Enter path) or {type:'cancel-turn'} when running. 'cancel-turn' is a NEW additive WebviewToHost message whose host handler calls the existing cancelActive() (chat-panel.ts:303) — no new host state. Status turn-events (thinking/streaming/tool/editing) drive #insrc-progress (show + animate + phase label) INSTEAD of appending a transcript row; done/error hide it. The host's existing status-skip (chat-panel.ts:424) already keeps status out of the durable transcript, so lc1 holds with no host change. All stable element ids preserved; the .statusbar '✓ idle'/running seg reflects the same webview-local flag.

### a2: Host-authoritative turn-state via a new host->webview 'turn-state' message

The host emits an explicit {type:'turn-state',running} message the webview uses to toggle Send/Stop and the progress widget; cancel is a new 'cancel-turn' intent.

Same #insrc-send + #insrc-progress DOM as a1, but running-state is HOST-authoritative: the host posts a new additive HostToWebview {type:'turn-state', running:boolean} at turn start and at done/error, and the webview toggles Send/Stop + shows/hides the progress widget from that message rather than inferring from turn-events. Cancellation is still a new 'cancel-turn' WebviewToHost message -> cancelActive(). Progress phase label still comes from status events.

**Rejected because:** Behaviourally equivalent to a1 but doubles the protocol surface + adds host emit points for no user-visible gain — partial on k2's minimal-additive intent.

### a3: Send button only; Stop is a client-side abandon (no cancel intent)

Add the Send button + progress widget, but Stop merely hides the widget/ignores further output client-side without a real host cancel.

Add #insrc-send (▶/■) + #insrc-progress as in a1, but do NOT add a 'cancel-turn' message: clicking Stop only flips the webview-local running flag and stops rendering further turn-events, leaving the underlying CLI turn running in the host until it finishes on its own. No protocol change at all.

**Rejected because:** VIOLATES ac2 — a Stop that doesn't cancel leaves the CLI turn running and leaks an orphan; the zero-protocol saving is not worth failing the core acceptance.

## Citations

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/chat/chat-panel.ts:167-290,:262,:303,:424,:285 + protocol.ts:53/:76 (S002 s1 shell grounding)` — "renderShell is a fixed-region flex column (#insrc-term the only overflow-y:auto region); submit is Cmd/Ctrl+Enter only (:262); cancelActive() (:303) is not webview-reachable; status renders as an inli"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 9 LOW** · model `client` · reviewed 2026-09-26T15:08:58.604Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| contractDetails/renderShell | citation | LOW | manual | vscode-plugin/src/chat/chat-panel.ts defines renderShell building the webview HTML with a fixed-region flex layout where #insrc-term is the only overflow-y:auto scroll region. | grep confirms `const renderShell = (): string =>` at chat-panel.ts:169 and #insrc-term + overflow-y:auto present — the fixed-region flex shell exists as cited (the :193 read drifted to a header rule after S001's edits, but the layout is verified). | None — symbol + behaviour confirmed; build targets renderShell by symbol. |
| migration/stateBefore | citation | LOW | manual | Submission today is a Cmd/Ctrl+Enter keydown that posts {type:'submit-turn'} and clears the box; there is NO Send button element in the input area. | grep found the keydown submit handler `if(e.key==='Enter'&&(e.metaKey\|\|e.ctrlKey)){...submit-turn...}` at chat-panel.ts:286 — the Cmd/Ctrl+Enter-only submission is confirmed. The LLD's :262 anchor is stale (S001 commits shifted the file ~+24 lines); the cited behaviour is intact. | Accept-with-note: the submit-keydown is at :286 now, not :262 — a line drift from S001, not a design error. |
| contractDetails/cancelActive | citation | LOW | manual | The host has an existing cancelActive() turn-reap that the new 'cancel-turn' handler will call unchanged. | grep confirms cancelActive exists in chat-panel.ts (35 refs) with .cancel() reaping — the existing turn-reap the new handler will call is real. The :303 read drifted to a `</div>` line; the symbol is verified present. | Accept-with-note: cancelActive exists; the :303 anchor drifted post-S001. |
| invariants/lc1 | citation | LOW | manual | appendEvent skips persisting status events (`if (ev.kind === 'status') return;`), so the live progress widget need not touch persistence to keep status out of the durable transcript. | The status-skip behaviour is confirmed present (the `ev.kind === 'status'` guard in appendEvent; S001 did not remove it — S001's own LLD/tests still rely on it). The :424 read drifted to a `}` line after S001's additions; the invariant holds. | Accept-with-note: the status-skip guard is intact; the :424 anchor drifted. |
| dataModel/cancel-turn | semantic | LOW | manual | WebviewToHost has no existing 'cancel'/'stop'/'cancel-turn' intent, so adding 'cancel-turn' is a net-new additive message (the webview cannot currently reach cancelActive()). | grep: 'cancel-turn' appears ONLY in the S002 LLD, not in source — confirming it is net-new; WebviewToHost + WEBVIEW_TO_HOST_TYPES exist in protocol.ts. So the webview genuinely cannot reach cancelActive() today and the additive message is justified. | None — net-new additive message confirmed. |
| dataModel/status-row | citation | LOW | manual | A status TurnEvent is currently rendered live as an inline row via markerFor (status -> 'thinking…' etc.), which S002 reroutes to the progress widget. | markers.ts:47 `case 'status':` confirmed — a status event maps to a marker (thinking…) today, which S002 reroutes to the progress widget. Citation resolves verbatim. | None — confirmed. |
| postconditions/renderShell | inventory | LOW | manual | The stable element ids S002 must preserve exist in the current shell: #insrc-term, #insrc-input, #insrc-provider, #insrc-history, #insrc-editmode, #insrc-sesstitle. | grep confirms every listed id (insrc-term/input/provider/history/editmode/sesstitle) exists in chat-panel.ts (sesstitle added by S001 t6; the rest pre-existing) — the preservation inventory is accurate. | None — all stable ids present. |
| boundary | cross-artifact | LOW | manual | S002 owns no HLD shared contract (interactionWithShared is empty); sc1/sc2 are owned by S001, so S002 correctly designs no shared contract. | The bare-path HLD read returned found:false (no line anchor), but grep confirms this epic's HLD defines sc1/sc2 and the LLD's embedded HLD slice records they are owned by s1; S002's interactionWithShared is empty, so it designs no shared contract. Trace holds. | None — ownership trace confirmed via grep + the approved HLD slice. |
| edgeCases | citation | LOW | manual | The host runTurn no-ops on an empty/whitespace prompt, so a Send click with a blank box starts no turn. | grep confirms runTurn exists (chat-panel.ts) and its empty-prompt guard (`prompt === '' \|\| session === undefined` → return) is present — a blank Send starts no turn. The :329 read drifted to `const prov = activeProvider` after S001's edits; the guard is intact. | Accept-with-note: the empty-prompt no-op holds; the :329 anchor drifted post-S001. |
