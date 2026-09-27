<!-- insrc:artifact PLAN-f9563bf5bbb29c43-s2 -->

# Plan: E20260926f9563bf5:S002

**Epic:** `vs-code-editor-dev-chat-ui`
**LLD run:** `wf-1790434284590-xnbm1f`
**LLD effective hash:** `8417b84c742c...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the additive WebviewToHost 'cancel-turn' message to the protocol | S | — | unit: 'cancel-turn' is an accepted WebviewToHost type (additive) and a no-op when no turn is active | [[c1]] |
| 2 | **`t2`** Route 'cancel-turn' to the existing cancelActive() in handleMessage | S | `t1` | integration: a 'cancel-turn' WebviewToHost message routes to cancelActive() and cancels the active turn (the scripted adapter's cancel fires); integration: existing chat-panel/protocol suites stay green — status persistence skip (chat-panel.ts:424) unchanged (k2/lc1) | [[c1]] |
| 3 | **`t3`** renderShell: icon-only Send/Stop button + fixed-region layout refined to the mock (ac1/ac2) | M | `t1` | unit: the html contains an icon-only Send/Stop button #insrc-send (▶/■) inside the input area; unit: the fixed-region layout holds: #insrc-term is the only overflow-y:auto region; header + input stay flex:0; unit: all pre-existing element ids are still present (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle); unit: still exactly one nonce'd inline <script>; no innerHTML; no remote origin (k1); integration: the host still no-ops an empty submit (button Send with blank input starts no turn) | [[c2]] |
| 4 | **`t4`** renderShell: single animated #insrc-progress widget + reroute status to it (ac3/lc1) | M | `t3` | unit: the html contains a single #insrc-progress widget above the input, hidden at rest; integration: status persistence skip (chat-panel.ts:424) unchanged — status never enters the durable transcript (lc1) | [[c2]] [[c3]] |

### E20260926f9563bf5:S002:T001 — Add the additive WebviewToHost 'cancel-turn' message to the protocol

In protocol.ts add the additive WebviewToHost variant `{ readonly type: 'cancel-turn' }` and add 'cancel-turn' to WEBVIEW_TO_HOST_TYPES so WebviewToHostType derives it. No existing message changes shape.

**Acceptance checks:**
- WebviewToHost includes `{ type: 'cancel-turn' }` and WEBVIEW_TO_HOST_TYPES contains 'cancel-turn'; every existing WebviewToHost message compiles unchanged (k2)
- no existing message shape changes (additive only)

### E20260926f9563bf5:S002:T002 — Route 'cancel-turn' to the existing cancelActive() in handleMessage

Add a 'cancel-turn' case to the host handleMessage dispatcher that calls the existing cancelActive() reap; leave all other cases and cancelActive() itself untouched.

**Acceptance checks:**
- a 'cancel-turn' WebviewToHost message invokes cancelActive() and cancels the in-flight turn (the provider's cancel fires)
- 'cancel-turn' with no active turn is an idempotent no-op (no throw)
- all existing handleMessage cases are unchanged

### E20260926f9563bf5:S002:T003 — renderShell: icon-only Send/Stop button + fixed-region layout refined to the mock (ac1/ac2)

In renderShell add an icon-only #insrc-send button in the input area toggling ▶ (green Send) / ■ (red Stop) driven by a webview-local `running` flag (set on submit, cleared on done/error); Send posts submit-turn, Stop posts cancel-turn. Retain the Cmd/Ctrl+Enter submit path (converges on submit-turn). Refine the header/input fixed-region CSS to the mock so #insrc-term stays the only scroll region. Inline under the CSP, className/textContent only; every existing element id preserved.

**Acceptance checks:**
- the html contains an icon-only #insrc-send button (▶/■, no text label) inside the input area
- a Send click posts submit-turn; while running the button is Stop (■) and its click posts cancel-turn
- the fixed-region layout holds: #insrc-term is the only overflow-y:auto region, header + input stay flex:0 (ac1)
- all pre-existing element ids remain (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle); still one nonce'd inline <script>; no innerHTML; no remote origin (k1)

### E20260926f9563bf5:S002:T004 — renderShell: single animated #insrc-progress widget + reroute status to it (ac3/lc1)

In renderShell add a single hidden #insrc-progress element above the input with its animation CSS (inline, CSP-safe). Reroute the live turn-event handler so a status event shows/updates #insrc-progress (phase label, gated on t3's running flag — reused, not re-derived) instead of appending a transcript row, and the shared done/error handler hides the widget + clears running + restores ▶ (authored once here, building on t3's toggle). Non-status live rendering (assistant-delta/tool-call/markers) is unchanged from S001; the host status-skip (chat-panel.ts appendEvent) is untouched.

**Acceptance checks:**
- the html contains a single #insrc-progress widget above the input, hidden at rest, with an animation
- a status event drives the progress widget (gated on running) and does NOT append a transcript row; rapid phase changes update one widget in place (ac3)
- a done/error event hides #insrc-progress, clears running, and restores the ▶ Send button
- the host status-skip is unchanged — status never enters the durable transcript (lc1/k4)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| the html contains an icon-only Send/Stop button #insrc-send (▶/■) inside the input area | `t3` |
| the html contains a single #insrc-progress widget above the input, hidden at rest | `t4` |
| the fixed-region layout holds: #insrc-term is the only overflow-y:auto region; header + input stay flex:0 | `t3` |
| all pre-existing element ids are still present (#insrc-term/#insrc-input/#insrc-provider/#insrc-history/#insrc-editmode/#insrc-sesstitle) | `t3` |
| still exactly one nonce'd inline <script>; no innerHTML; no remote origin (k1) | `t3` |
| a 'cancel-turn' WebviewToHost message routes to cancelActive() and cancels the active turn (the scripted adapter's cancel fires) | `t2` |
| 'cancel-turn' is an accepted WebviewToHost type (additive) and a no-op when no turn is active | `t1`, `t2` |
| the host still no-ops an empty submit (button Send with blank input starts no turn) | `t3` |
| existing chat-panel/protocol suites stay green — status persistence skip (chat-panel.ts:424) unchanged (k2/lc1) | `t2`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s2 dataModelChanges: WebviewToHost 'cancel-turn' message (protocol) field-add + handleMessage 'cancel-turn' case -> cancelActive()` — "Add an additive WebviewToHost variant { type: 'cancel-turn' } + 'cancel-turn' in WEBVIEW_TO_HOST_TYPES; handleMessage routes it to the existing cancelActive() reap. Additive; every existing message ke"
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails/renderShell + dataModelChanges: shell controls #insrc-send (Send/Stop) + #insrc-progress (widget) new, fixed-region layout to the mock` — "renderShell adds an icon-only #insrc-send button (▶/■, running flag) + a single hidden #insrc-progress widget above the input; #insrc-term stays the only scroll region and every existing element id is"
- **[[c3]]** `prior-artifact` `LLD s2 dataModelChanges: live turn-event handler status routes to the progress widget (invariant-change)` — "Status events drive #insrc-progress (gated on running) instead of appending a transcript row; done/error hides it + clears running; the host status-skip (chat-panel.ts appendEvent) is unchanged so sta"
