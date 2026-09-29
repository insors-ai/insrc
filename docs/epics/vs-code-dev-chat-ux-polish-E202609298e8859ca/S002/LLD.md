<!-- insrc:artifact LLD-8e8859ca0ca83612-s2 -->

# LLD: E202609298e8859ca:S002

## Summary

**Epic:** `vs-code-dev-chat-ux-polish`
**HLD base run:** `wf-1790676258005-32feqt`
**HLD effective hash:** `f5c70630aa71...`

S002 makes the dev-chat input read as a terminal prompt: a leading '>' indicator becomes the clickable send control (and the stop control while a turn runs), the textarea sits flush after it, and the separate trailing send button is retired — so there is one prompt-style send affordance. The click reuses the existing doSubmit()/submit-turn path unchanged, and Cmd/Ctrl+Enter still sends. It also widens the assistant message bubble from 88% to ~90% of the panel. Pure webview render/CSS/wiring in chat-panel.ts; no event, protocol, or persistence change.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-8e8859ca0ca83612** § 2. Framework summary

**Rollout phase:** Phase A — Row-kind pattern + render polish

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The webview render + CSS for a tool-output row (command, a visual separator, output collapsed to a ~3-line preview with expand/collapse), the rule that assistant/non-tool rows are never collapsed, and the adapter emission that produces the tool-output event from the provider stream. Private to S001 apart from the sc1 shape it establishes. — owns `sc1`
- `s3`: The approval-card render change (resolved approved/rejected state, action buttons removed once decided), suppressing the visible synthesized 'Approved: please proceed…' user-row echo, and recording the persisted permission-outcome marker on decision. The underlying resume-grant path and the existing permission-decision relay are consumed UNCHANGED (k4). — owns `sc2`
- `s4`: The selection-widget render (single/multi selectable controls), the host relay that turns a selection-decision message into the run's continuation (mirroring the existing decision-relay shape), and the resolved-selection persistence. Private to S004 apart from the sc3 shape. — owns `sc3`

## 2. Contract details

**Surface level:** internal

### 2.1 `chat-panel webview input row (renderRegistryWebviewSource / panel HTML)`

```typescript
// eval'd webview HTML (chat-panel.ts): the input row markup gains a leading '>' prompt control before #insrc-input; the trailing #insrc-send button is removed
```

**Parameters:**
- `leadingPrompt: HTMLElement (a '>' control, e.g. id 'insrc-prompt')` — The terminal-prompt indicator rendered before the textarea; it is the send control (ac1/ac2). Styled terminal-green as a shell prompt; a comfortably clickable target.

**Returns:** `string (webview source)` — The panel HTML now shows a single terminal-prompt input line ('>' + textarea). No other row/markup changes; className/textContent-safe, CSP-safe (k1).

**Preconditions:**
- The webview is the existing dev-chat panel HTML behind insrc.chat.enabled.

**Postconditions:**
- ac1: the input reads as a terminal prompt with a leading indicator; the redundant trailing send button is gone.

### 2.2 `doSubmit (chat-panel.ts:434) — REUSED unchanged`

```typescript
function doSubmit(): void  // consumed as-is: guards non-empty, posts {type:'submit-turn', text}, clears the box, setRunning(true)
```

**Returns:** `void` — The leading '>' click handler calls doSubmit() (send) exactly as the old button did, so the sent message and the submit-turn payload are byte-identical (ac2/lc1). While running, the '>' click posts cancel-turn (the existing stop behaviour).

**Preconditions:**
- Non-empty input (doSubmit's existing guard).

**Postconditions:**
- ac2: activating the leading indicator sends identically to the existing send action; the Cmd/Ctrl+Enter keydown path is unchanged.

### 2.3 `setRunning (chat-panel.ts:372) — running/stop glyph relocated`

```typescript
function setRunning(r: boolean): void  // the send/stop indicator ('>' at rest / stop while running) moves from #insrc-send onto the leading '>' control
```

**Parameters:**
- `r: boolean` — Running state; the leading control shows the send prompt at rest and the stop affordance while a turn is in flight (inheriting the current ▶↔■ send/stop semantics, now on the '>' control).

**Returns:** `void` — The one send/stop control is the leading '>' rather than the trailing button; the running-state semantics are unchanged, only the element they target moves.

**Postconditions:**
- Exactly one send/stop control exists (no state drift between two controls).

### 2.4 `.insrc-bubble--assistant (chat-panel.ts:305) — width bump`

```typescript
/* CSS */ .insrc-bubble--assistant { max-width: ~90%; /* was 88% */ }
```

**Returns:** `string (CSS in the panel style)` — The assistant message bubble spans ~90% of the panel width (ac3). CSS-only; no structural/render-model change. User bubble + .insrc-msg wrapper unchanged.

**Postconditions:**
- ac3: assistant text uses the large majority (~90%) of the panel width.

## 3. Data model changes

### 3.1 `submit-turn intent + transcript (chat-panel.ts)` — invariant-change

No data-model change: S002 is presentation-only. The submit-turn WebviewToHost message, its {text} payload, the transcript entries, and every event/persistence shape are UNCHANGED (lc1/k1). Only the input-row markup/CSS, the send-control element, and the assistant bubble width change.

```
(no type/message change) '>' click -> doSubmit() -> post {type:'submit-turn', text} (identical to today)
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Error paths

**Error cases**

- **The user clicks the leading '>' send control with an empty (or whitespace-only) input.** (recoverable)
  - Detection: doSubmit()'s existing non-empty guard (box.value.trim()) sees an empty value.
  - Response: No submit-turn is posted — identical to today's empty-input behaviour (the guard is reused unchanged).
  - User impact: Nothing sends; no error surfaced. Same as clicking the old button on an empty box.
- **The user activates the leading control while a turn is already running (intending to stop).** (recoverable)
  - Detection: The click handler checks the current running flag (the same flag setRunning maintains).
  - Response: It posts cancel-turn (the existing stop path), exactly as the old trailing button did while running.
  - User impact: The in-flight turn is cancelled; the control returns to the send prompt — unchanged stop behaviour.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Cmd/Ctrl+Enter pressed in the textarea (the keyboard send path). | Unchanged: the existing keydown handler still calls doSubmit() and sends; the '>' control is an ADDITIONAL affordance, not a replacement for the keyboard path (ac2). |
| A very long or multi-line input in the textarea. | The textarea keeps its existing min/max-height + resize behaviour (#insrc-input CSS unchanged); the leading '>' sits at the prompt position and still sends the full value. |
| An assistant response narrower than ~90% (a short reply). | The bubble is content-sized up to the ~90% max-width cap; short replies are unaffected — only the cap widened from 88% to ~90%. |
| A user message row (right-aligned bubble). | Unchanged: only .insrc-bubble--assistant width changes; .insrc-bubble--user (82%, right-aligned) and .insrc-msg wrapper are untouched. |
| A tool-result row (S001) rendered near the input. | Unaffected — S002 does not touch the S001 tool-output render; only the input row + assistant bubble width change (adjacent-boundary respected). |

**Invariants to preserve**

- The send intent is unchanged: activating the leading '>' calls the EXISTING doSubmit() which posts the same {type:'submit-turn', text} message; the payload, the host handler, the transcript, and the Cmd/Ctrl+Enter path are byte-identical (lc1/k1). [[c1]]
- Exactly one send/stop control exists after the change: the send/stop running-state indicator moves from the trailing #insrc-send button onto the leading '>' control, so there is no second control and no state drift. [[c1]]
- The change is confined to the eval'd webview source (HTML + CSS + click wiring) in chat-panel.ts and verified via the eval'd *WebviewSource test pattern; no TurnEvent/protocol/persistence shape changes and no adjacent-story (S001/S003/S004) scope is touched (k1/k3). [[c1]]
- Only .insrc-bubble--assistant's max-width changes (88% -> ~90%); the user bubble and the .insrc-msg wrapper widths are unchanged (ac3, presentation-only). [[c1]]

## 5. Test strategy

**Test framework:** `node:test (tsx --test), the repo-wide convention — colocated vscode-plugin/src/chat/__tests__/chat-panel.test.ts; the eval'd *WebviewSource pattern (the panel HTML/source is eval'd and its DOM + a fakeChannel's posted messages asserted); live provider turns gated behind INSRC_LIVE_TESTS.`

**Test levels**

- **unit** — Prove the input reads as a terminal prompt whose leading indicator sends, reusing the existing submit path.
  - Subjects: `The eval'd panel HTML renders a leading '>' prompt control before #insrc-input and no longer renders the separate trailing #insrc-send button (ac1).`, `Clicking the leading '>' control with non-empty input posts exactly one {type:'submit-turn', text:<box value>} on the fake channel — identical payload to the pre-change send button (ac2/lc1).`, `Clicking '>' with an empty/whitespace input posts nothing (doSubmit guard reused).`, `Cmd/Ctrl+Enter in the textarea still sends (the keydown path is unchanged).`, `While a turn is running, activating the leading control posts cancel-turn (the stop path), and setRunning toggles the ONE control's send/stop state (no second control).`
  - Fixtures: `the existing fakeChannel/scriptedAdapter chat-panel test harness (eval'd *WebviewSource)`
- **unit** — Prove the assistant bubble width is ~90% and other rows are unchanged.
  - Subjects: `.insrc-bubble--assistant max-width is ~90% in the panel style string (bumped from 88%).`, `.insrc-bubble--user (82%) and .insrc-msg wrapper (100%) widths are unchanged (only the assistant cap moved).`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `The eval'd panel HTML renders a leading '>' prompt control before #insrc-input and no trailing #insrc-send button` |
| `ac2` | `Clicking the leading '>' posts exactly one {type:'submit-turn', text} identical to the old send button`, `Cmd/Ctrl+Enter still sends via the unchanged keydown path`, `Empty-input click posts nothing (reused doSubmit guard)` |
| `ac3` | `.insrc-bubble--assistant max-width is ~90% in the panel style; user bubble + wrapper widths unchanged` |

## 6. Migration

**State before:** The dev-chat input row (chat-panel.ts eval'd webview source) is a bare textarea #insrc-input (:471) with a SEPARATE TRAILING 40x40 green send button #insrc-send ▶ (:473, CSS :260-261) aligned flex-end. Send converges on doSubmit() (:434, posts {type:'submit-turn', text}, clears the box, setRunning(true)), invoked from Cmd/Ctrl+Enter (keydown :435) and the button click (:438, cancel-turn while running); setRunning (:372) swaps the button glyph ▶↔■. Assistant text renders as .insrc-bubble--assistant (:305) at max-width:88%. The input does not read as a terminal prompt and the '>'/prompt indicator is absent (the trailing ▶ is the only send affordance).

**State after:** The input row reads as a single terminal-prompt line: a leading '>' prompt control sits before the textarea and IS the send control — clicking it calls the EXISTING doSubmit() (send) / cancel-turn (while running), with the running/stop state indicator relocated from #insrc-send onto the '>' control; the separate trailing button is removed. The Cmd/Ctrl+Enter path and the submit-turn message/payload are unchanged. Assistant .insrc-bubble--assistant max-width is bumped 88% -> ~90%. All confined to the eval'd webview source (HTML + CSS + click wiring) in chat-panel.ts.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add a leading '>' prompt control element to the input-row HTML before #insrc-input, and add its terminal-prompt CSS (green, comfortably clickable); keep #insrc-input's id/placeholder/CSS unchanged. — ↩ rollbackable
2. Wire the '>' control's click to the EXISTING doSubmit() (send when idle) / cancel-turn (while running), and relocate the setRunning send/stop state indicator from #insrc-send onto the '>' control; leave doSubmit and the submit-turn message untouched. — ↩ rollbackable
3. Remove the trailing #insrc-send button element (and its now-unused CSS) so there is exactly one send/stop control; the Cmd/Ctrl+Enter keydown path is unchanged. — ↩ rollbackable
4. Bump the .insrc-bubble--assistant max-width from 88% to ~90% in the panel style string (CSS only); user bubble + .insrc-msg wrapper unchanged. — ↩ rollbackable
5. Update the existing 'Send/Stop button' *WebviewSource tests to target the relocated '>' control, and add tests for the leading-prompt presence, the click->submit-turn identity, the empty-input no-op, Cmd↵ still sends, and the ~90% assistant width. — ↩ rollbackable

**Backward compat:** Fully backward-compatible at the contract level: the submit-turn WebviewToHost message and its {text} payload, the host handlers, the transcript, and the Cmd/Ctrl+Enter path are byte-identical (lc1/k1). The only user-visible change is presentation — the send control moves from a trailing button to a leading '>' prompt, and the assistant bubble is ~2% wider. The removed #insrc-send is an internal webview element, not a public API; the 'Send/Stop button' tests are updated to the relocated control (a test-surface change reflecting the same behaviour). No stored data or protocol message shape changes.

## 7. Alternatives considered

### 7.1 a1: Leading '>' prompt IS the send/stop control; retire the trailing button — **CHOSEN**

Render the input as a single terminal-prompt line — a leading clickable '>' glyph that acts as the send control (and the stop control while running) with the textarea flush after it — and remove the separate trailing #insrc-send button.

The input row becomes a terminal-prompt line: a leading '>' prompt indicator (terminal-green, styled as a shell prompt) sits before the textarea; clicking '>' calls the EXISTING doSubmit() unchanged, and while a turn is running '>' switches to the stop affordance and posts cancel-turn (inheriting the current setRunning glyph-swap + send/stop logic, moved from #insrc-send onto the '>' control). The textarea keeps its id/placeholder and the Cmd/Ctrl+Enter keydown path unchanged. The trailing #insrc-send button is removed so there is ONE send affordance that reads as a prompt. Assistant width: bump .insrc-bubble--assistant max-width 88% -> ~90% (CSS only). All within the eval'd webview source in chat-panel.ts; submit-turn message + host handlers unchanged (lc1/k1).

### 7.2 a2: Leading '>' clickable-to-send AND keep the trailing button

Add a leading clickable '>' that also triggers doSubmit, but keep the existing trailing #insrc-send ▶/■ button as well.

Prepend a leading '>' prompt indicator wired to doSubmit (send) / cancel-turn (while running), but leave the trailing #insrc-send button in place unchanged. Two controls both send. Assistant width bumped to ~90% as in a1.

**Rejected because:** Meets ac2 but only partial on ac1 (two redundant send affordances keep the cluttered feel the story exists to remove) and risks send/stop state drift between the two controls.

### 7.3 a3: Cosmetic '>' prompt; send stays on the trailing button

Style a leading '>' as pure terminal decoration; sending stays on the trailing button + Cmd↵ only.

Add a non-interactive leading '>' glyph purely for the terminal look; the textarea + trailing send button + Cmd↵ keep the send behaviour exactly as today. Assistant width bumped to ~90%.

**Rejected because:** Violates ac2 (the leading indicator does not send), leaving an inert glyph — the exact defect the story targets.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 input-row-and-send + assistant-width-css: chat-panel.ts webview source — #insrc-input textarea(:471), trailing #insrc-send button(:473, CSS :260), doSubmit(:434), keydown(:435), click(:438), setRunning(:372), .insrc-bubble--assistant max-width:88%(:305)` — "The input is a bare textarea + a trailing #insrc-send ▶ button; doSubmit posts {type:'submit-turn', text}; setRunning swaps ▶↔■; the assistant bubble is max-width:88%. S002 makes a leading '>' the sen"
- **[[c4]]** `prior-artifact` `HLD/DEF constraint lc1/k1: input + layout changes are presentation-only; the submit-turn intent and message are unchanged` — "Input and layout changes are presentation-only; the send intent and the message it produces are unchanged (lc1); every new webview<->host message stays additive with existing shapes unchanged (k1)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 4 LOW** · model `client` · reviewed 2026-09-29T12:00:56.622Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1/migration | citation | LOW | manual | The chat-panel.ts webview HTML has a #insrc-input textarea and a SEPARATE trailing #insrc-send send button — the input row S002 reshapes into a leading-'>' terminal prompt. | Confirmed: chat-panel.ts:471 `<textarea id="insrc-input" ...>`, :473 `<button id="insrc-send" class="sendbtn">▶</button>`, :260 `#insrc-send{...}` — the textarea + trailing send button S002 reshapes into a leading '>' prompt. | none — verified sound |
| 2.2 | citation | LOW | manual | doSubmit() in chat-panel.ts is the shared send path that posts a submit-turn message with the box text; the leading '>' click reuses it unchanged. | Confirmed: chat-panel.ts:434 `function doSubmit(){if(!box.value.trim())return;vs.postMessage({...type:'submit-turn'...})}` — the shared send path (with the non-empty guard) the '>' click reuses unchanged. | none — verified sound |
| 2.3 | citation | LOW | manual | setRunning(r) in chat-panel.ts drives the send/stop control state (the running-state indicator S002 relocates onto the '>' control). | Confirmed: chat-panel.ts:372 `function setRunning(r){running=r;if(sendBtn){sendBtn.textContent=r?'■':'▶';...}}` — drives the send/stop control state. (The 'cancel-turn' grep returned 0 due to the hyphenated-pattern escaping; the cancel-turn post exists in the send-button click handler at ~:438, verified directly this session — not a real gap.) | none — verified sound |
| 2.4/ac3 | citation | LOW | manual | The assistant message bubble .insrc-bubble--assistant currently has max-width:88% — the value S002 bumps to ~90%. | Confirmed: chat-panel.ts:305 `.insrc-bubble--assistant{...max-width:88%...}` — the assistant bubble width S002 bumps to ~90% (CSS only). | none — verified sound |
