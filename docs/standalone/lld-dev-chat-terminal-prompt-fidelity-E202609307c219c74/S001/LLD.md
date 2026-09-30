<!-- insrc:artifact LLD-7c219c7471d79496-S001 -->

# LLD: E202609307c219c74:S001

## Summary

**Epic:** `lld-dev-chat-terminal-prompt-fidelity`
**HLD base run:** `wf-1790742675507-x3e8ut`
**HLD effective hash:** `7c219c7471d7...`

Bring the dev-chat input up to the approved S002 mock, entirely within the eval'd webview source (renderShell) in chat-panel.ts — presentation-only, no protocol/persistence change, and the S002 leading-'❯' send/stop control unchanged. Three changes: the input becomes a flush 2-line-tall terminal prompt that scrolls (the textarea loses its bordered-box chrome; the '❯' top-aligns to the first line only); the placeholder gains the interrupt hint ('⌘↵ send · ^C interrupt'); and the status bar becomes the mock's clean read-only 'session <id> · edits <mode> · ✓ idle' — achieved by relocating the FUNCTIONAL provider + mode <select>s up into the header (beside the existing session/history switcher), moved verbatim so their switch behaviour is byte-identical.

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

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `renderShell`

```typescript
renderShell(): string  // the eval'd webview panel HTML+CSS builder (chat-panel.ts)
```

**Returns:** `string` — The panel HTML/CSS/bootstrap source, reshaped: (1) #insrc-input drops border/border-radius/background box chrome and gains overflow-y:auto (keeps rows=2 — a flush 2-line scrolling prompt); #insrc-prompt changes align-self:flex-end→flex-start (❯ on the top line only). (2) the placeholder becomes 'message claude… (⌘↵ send · ^C interrupt)'. (3) the #insrc-provider + #insrc-mode <select>s are emitted inside the header (.chrome) beside the session label + #insrc-history; the .statusbar emits read-only segments: 'session <id>' (from the active session), an 'edits <mode>' label, and the existing '✓ idle' ok seg. Same ids retained so the bootstrap wiring still binds.

**Preconditions:**
- Rendered once per panel open/theme change, as today (deps.renderStyle unchanged).

**Postconditions:**
- The emitted DOM keeps every existing id (#insrc-prompt, #insrc-input, #insrc-provider, #insrc-mode, #insrc-modeseg→repurposed, #insrc-history, #insrc-sesstitle) so no bootstrap querySelector breaks; only element PARENTAGE (provider/mode now under .chrome) + CSS + the status-bar segment text change.

### 2.2 `setRunning`

```typescript
setRunning(r: boolean): void  // webview-local; toggles the #insrc-prompt ❯↔■ send/stop glyph
```

**Parameters:**
- `r: boolean` — Running state; unchanged by this Story — listed to pin that the S002 send/stop control is preserved.

**Returns:** `void` — Unchanged: still finds #insrc-prompt (sendBtn) and toggles ❯/■ + aria-label. The flush-prompt CSS must not break this (the id + role=button stay).

**Postconditions:**
- S002 send/stop behaviour is byte-identical after the change.

### 2.3 `updatePermSeg`

```typescript
updatePermSeg(): void  // webview-local; sets the mode segment's perm-auto class from pmode
```

**Returns:** `void` — Must continue to resolve its target after the mode control relocates to the header: the `pmseg`/`pm` references (the mode <select> + its wrapping seg) keep their ids so the 'auto'→amber-pill styling still applies wherever the control now lives. The read-only 'edits <mode>' status-bar label is derived from the same pmode value.

**Preconditions:**
- pmode reflects the active session mode (set on session-restored), unchanged.

**Postconditions:**
- The mode control's change-handler (set-permission-mode post) + the auto-pill styling are behaviour-identical after relocation; the status-bar 'edits' label re-renders read-only from pmode.

## 3. Data model changes

### 3.1 `Dev-chat webview DOM (input row + status bar + header) — presentation only` — invariant-change

NEW presentation invariants (no data/protocol change): (1) the input row reads as a flush 2-line scrolling terminal prompt — #insrc-input has no border/border-radius/background box and uses overflow-y:auto with rows=2; #insrc-prompt is top-aligned (align-self:flex-start) so the '❯' appears once on the first line. (2) the placeholder string includes the '^C interrupt' hint. (3) the status bar is READ-ONLY: 'session <id>' + 'edits <mode>' + '✓ idle', with NO <select> chevrons — the functional #insrc-provider + #insrc-mode <select>s move into the header (.chrome) beside #insrc-history, retaining their ids/options/change-handlers verbatim. The 'edits <mode>' label maps the single chat mode to a short word (manual→'review', edit-auto→'auto-edit', auto→'auto'); the exact wording is refinable at build. Session identity now lives once (header); the status-bar 'session' segment shows the same active id/title without a second switcher.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:303`
- `vscode-plugin/src/chat/chat-panel.ts:291`
- `vscode-plugin/src/chat/chat-panel.ts:497`
- `vscode-plugin/src/chat/chat-panel.ts:515`
- `vscode-plugin/src/chat/chat-panel.ts:516`
- `vscode-plugin/src/chat/chat-panel.ts:517`

## 4. Error paths

**Error cases**

- **After relocating the #insrc-provider / #insrc-mode <select>s into the header, a bootstrap querySelector for one of them (or #insrc-modeseg / pmseg) no longer resolves, so provider/mode switching or the auto-pill styling silently breaks.** (recoverable)
  - Detection: The webview bootstrap resolves each control by id (document.getElementById('insrc-provider' / 'insrc-mode') + the pm/pmseg refs) and the chat-panel *WebviewSource tests assert those elements + their change-handlers exist; a missing/renamed id surfaces as a failing test (element not found) and, at runtime, a no-op change handler.
  - Response: Keep every existing id verbatim when moving the elements to the header (relocation changes PARENTAGE only, not ids/options/handlers); the tests that target the ids catch any drift before ship.
  - User impact: If missed: provider or mode switching would stop working. With ids preserved + tests, it does not reach the user.
- **The flush-prompt CSS (dropping #insrc-input's border/box) inadvertently changes the #insrc-prompt send/stop control's geometry so setRunning's glyph/target is affected.** (recoverable)
  - Detection: setRunning still queries #insrc-prompt by id and the S002 regression tests assert the ❯↔■ toggle + submit-on-click path; a broken layout that hid/displaced the control would fail those assertions or the click test.
  - Response: Restyle #insrc-input (remove border/bg, add overflow-y:auto) and set #insrc-prompt align-self:flex-start WITHOUT touching the #insrc-prompt id/role/handlers; the S002 tests run unchanged as a regression guard.
  - User impact: None when the S002 tests stay green; the send/stop control keeps working.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The active session has no title yet (a fresh draft) when the status bar renders 'session <id>'. | The 'session' segment shows the session id (or the same value #insrc-sesstitle already shows) and stays non-empty/graceful — mirroring how the header session label already handles a titleless draft; no layout break. |
| A very long message that exceeds the 2-line view. | The textarea keeps rows=2 as the visible height and SCROLLS vertically (overflow-y:auto); it does not grow into a big box. The '❯' stays on the top line (top-aligned), not repeated per line. |
| The chat mode is 'auto' (fully autonomous). | The read-only 'edits <mode>' status label reflects it (e.g. 'auto') and the relocated mode control still applies the existing amber auto-pill styling via updatePermSeg wherever it now lives (header). |
| An empty available-providers set (the provider <select> is disabled today). | The relocated provider control keeps its existing disabled state in the header; the status bar's read-only segments still render (session/edits/idle) without error. |
| The panel width is narrow. | The header with the relocated provider/mode controls + session switcher wraps/clamps without horizontal overflow (the existing .chrome #insrc-history max-width clamp + flex-wrap patterns apply); the read-only status bar stays single-line-ish and legible. |

**Invariants to preserve**

- The S002 send/stop affordance is unchanged: the leading #insrc-prompt '❯' remains the single send (idle) / stop (running) control, toggled by setRunning, reachable by role=button + tabindex; clicking it still calls the existing doSubmit()/cancel-turn path. The flush-prompt restyle must not alter this behaviour. [[c1]]
- Presentation-only: no WebviewToHost/HostToWebview message, payload, transcript, or persistence shape changes. Session id + chat mode are read from data already delivered to the webview (session-restored's sessionId + mode; the history-list title); relocating the provider/mode <select>s preserves their existing change-handlers (set-permission-mode / provider-switch) byte-for-byte. [[c3]]
- The provider + mode controls remain FUNCTIONAL after the status bar goes read-only: they move to the header retaining their ids, options, disabled-state, and change-handlers, so provider switching + the single chat mode (Manual/edit-auto/auto) still work exactly as today — the read-only status segments are derived views, not replacements for the controls. [[c2]]

## 5. Test strategy

**Test framework:** `tsx --test (node:test + node:assert/strict) — the vscode-plugin 'test' script, matching the existing chat-panel.test.ts *WebviewSource suite.`

**Test levels**

- **unit** — Prove the flush 2-line terminal-prompt input (delta 1) in the eval'd renderShell source — no box chrome, 2-line scroll, top-line ❯.
  - Subjects: `renderShell()'s #insrc-input CSS no longer has a border/border-radius/background box and includes overflow-y:auto with rows=2 (flush 2-line scrolling prompt)`, `#insrc-prompt is top-aligned (align-self:flex-start), so the ❯ leads the first line only — not align-self:flex-end`, `the #insrc-prompt element keeps id + role=button + tabindex (unchanged S002 control)`
  - Fixtures: `the renderShell webview-source string (rendered via the existing test harness / *WebviewSource pattern)`
- **unit** — Prove the placeholder hint (delta 2).
  - Subjects: `the #insrc-input placeholder is exactly 'message claude… (⌘↵ send · ^C interrupt)' (contains '^C interrupt', no longer 'to send')`
  - Fixtures: `the renderShell webview-source string`
- **unit** — Prove the read-only status bar + the header relocation of the functional controls (delta 3).
  - Subjects: `the .statusbar renders read-only segments 'session <id>' + 'edits <mode>' + '✓ idle' and contains NO <select> (no provider/mode dropdown in the bar)`, `the #insrc-provider + #insrc-mode <select>s are present INSIDE the header (.chrome) region of the source, retaining their ids + options (manual/edit-auto/auto) + the provider option list`, `the 'edits <mode>' label maps the mode value to its short word (manual→'review', edit-auto→'auto-edit', auto→'auto')`
  - Fixtures: `the renderShell webview-source string`, `a provider list fixture (deps.providers.available) + a session/mode fixture`
- **unit** — Regression — prove the S002 send/stop behaviour + provider/mode switching still work after the restyle + relocation.
  - Subjects: `the existing S002 tests still pass: clicking #insrc-prompt posts one {type:'submit-turn', text}; Cmd/Ctrl+Enter still sends; empty input no-ops; setRunning toggles ❯↔■ on the one control`, `the relocated #insrc-mode change-handler still posts {type:'set-permission-mode', mode} and updatePermSeg still applies the auto amber pill; the #insrc-provider change still starts a new chat with the picked provider`
  - Fixtures: `the existing chat-panel.test.ts fake WebviewToHost channel + the eval'd bootstrap harness`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: #insrc-input has no border/box chrome + overflow-y:auto + rows=2 (flush 2-line scroll)`, `unit: #insrc-prompt is align-self:flex-start (❯ on the top line only)` |
| `ac2` | `unit: the placeholder equals 'message claude… (⌘↵ send · ^C interrupt)' (has '^C interrupt')` |
| `ac3` | `unit: .statusbar renders read-only 'session <id>' + 'edits <mode>' + '✓ idle' with no <select>`, `unit: #insrc-provider + #insrc-mode <select>s live in the header (.chrome) with ids/options preserved`, `unit: the 'edits <mode>' label maps manual→'review' / edit-auto→'auto-edit' / auto→'auto'` |
| `ac4` | `unit (regression): the S002 send/stop tests still pass (❯ click → submit-turn; Cmd/Ctrl+Enter sends; empty no-op; setRunning toggle)`, `unit (regression): the relocated mode change still posts set-permission-mode + auto-pill via updatePermSeg; the provider change still starts a new chat` |

## 6. Migration

**State before:** Per s1 analyze bundles (chat-panel.ts:303/291/509/510, :497, :515-517, :220): the eval'd renderShell webview source renders (1) the input row as `<div class="inputbar">` with a BOXED textarea — #insrc-input has border:1px solid var(--border-lit), border-radius:9px, background:var(--panel), padding:9px 11px, rows=2, min-height:40px/max-height:120px (no overflow-y), and #insrc-prompt is align-self:flex-end (❯ sits at the bottom beside the box); (2) the placeholder is 'message claude…  (⌘↵ to send)'; (3) the status bar (.statusbar) holds FUNCTIONAL controls — a provider `<select id="insrc-provider">`, a `<span id="insrc-modeseg">mode <select id="insrc-mode">…</select></span>`, and a `<span class="seg ok">✓ idle</span>`. The header (.chrome, :497) already carries the session identity (session label + #insrc-sesstitle + #insrc-history switcher). session-restored (:220) already delivers sessionId + mode to the webview, and updatePermSeg (:427) styles the auto pill. This is the built surface (image 1) that diverges from the approved S002 mock (image 2).

**State after:** renderShell emits the mock-faithful surface: (1) a flush 2-line-tall scrolling terminal prompt — #insrc-input has NO border/border-radius/background box chrome, keeps rows=2, gains overflow-y:auto (2-line view that scrolls), and #insrc-prompt is align-self:flex-start (❯ on the top line only); (2) the placeholder reads 'message claude… (⌘↵ send · ^C interrupt)'; (3) a READ-ONLY status bar — 'session <id> · edits <mode> · ✓ idle' with no <select> chevrons — achieved by relocating the FUNCTIONAL #insrc-provider + #insrc-mode <select>s up into the header (.chrome) beside #insrc-history, moved verbatim (same ids, options, change-handlers) so their switch behaviour is byte-identical. The 'edits <mode>' label is derived read-only from the existing pmode value (manual→'review', edit-auto→'auto-edit', auto→'auto'). No protocol/persistence/event change; S002 send/stop (#insrc-prompt) unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. In renderShell's CSS, remove the box chrome from #insrc-input (drop border/border-radius/background; drop or neutralize the :focus border-color rule) and add overflow-y:auto while keeping rows=2 (flush 2-line scrolling prompt). Presentation-only, no behaviour change. — ↩ rollbackable
2. In renderShell's CSS, change #insrc-prompt from align-self:flex-end to align-self:flex-start so the ❯ leads the first line only. Keep the id/role=button/tabindex intact. — ↩ rollbackable
3. In renderShell's markup, update the #insrc-input placeholder text to 'message claude… (⌘↵ send · ^C interrupt)'. — ↩ rollbackable
4. In renderShell's markup, move the #insrc-provider <select> and the #insrc-modeseg span (wrapping #insrc-mode <select>) verbatim out of the .statusbar and into the header (.chrome) region beside #insrc-history — same element ids, option lists, and inline wiring, so the bootstrap querySelectors + change-handlers still bind. — ↩ rollbackable
5. In renderShell's markup, rebuild the .statusbar as read-only segments: 'session <id>' (from the active session), 'edits <mode>' (label mapped from pmode), and the existing '✓ idle' ok seg — no <select> elements. — ↩ rollbackable
6. Add a small read-only mode→label mapping (manual→'review', edit-auto→'auto-edit', auto→'auto') used to render the 'edits <mode>' segment, and ensure the segment re-renders from pmode on session-restored/mode-change (reusing the existing updatePermSeg path; no new message). — ↩ rollbackable
7. Extend the *WebviewSource tests to assert the new presentation invariants (ac1-ac3) and re-run the S002 send/stop regression (ac4); run `npm test` (tsx --test) to confirm green before packaging. — ↩ rollbackable

**Backward compat:** No public/IPC/protocol API changes — this is presentation-only inside the eval'd webview source. renderShell keeps its signature; setRunning and updatePermSeg keep their signatures and behaviour. Every existing element id (#insrc-prompt, #insrc-input, #insrc-provider, #insrc-mode, #insrc-modeseg, #insrc-history, #insrc-sesstitle) is preserved so no bootstrap querySelector or host↔webview message shape changes; only element parentage (provider/mode now under .chrome), CSS, placeholder text, and the read-only status-bar segment text differ. No HostToWebview/WebviewToHost message is added or altered.

## 7. Alternatives considered

### 7.1 a1: Flush prompt + placeholder; status bar keeps the functional selects, relabelled

Do deltas 1+2, but for delta 3 keep the provider + mode <select>s in the status bar — just relabel 'mode'→'edits' and prepend a read-only 'session <id>' segment.

Deltas 1+2 (shared by every alternative): drop #insrc-input's border/border-radius/background box chrome (keep rows=2, add overflow-y:auto so it is a flush 2-line scrolling prompt), top-align #insrc-prompt (align-self:flex-start) so the ❯ leads the first line only, and change the placeholder to 'message claude… (⌘↵ send · ^C interrupt)'. For delta 3, leave the functional provider + mode <select>s where they are in the status bar; only relabel the mode segment 'mode'→'edits' (mapping the option label shown, e.g. Manual→review) and prepend a read-only 'session <id>' seg (from `cur`/#insrc-sesstitle). #insrc-prompt send/stop wiring untouched.

**Rejected because:** Rank 3. PARTIAL on dc3 (status-bar mock fidelity) — keeps two dropdown chevrons and duplicates the session identity with the header, re-shipping exactly the under-delivery the user asked to fix (image 2's clean read-only bar).

### 7.2 a2: Mock-faithful: relocate provider+mode controls to the header; read-only status bar — **CHOSEN**

Do deltas 1+2, and for delta 3 move the functional provider + mode <select>s up into the header beside the existing session/history switcher, making the status bar the mock's read-only 'session <id> · edits <mode> · ✓ idle'.

Deltas 1+2 as in a1 (flush 2-line scroll prompt + top-line ❯ + interrupt-hint placeholder). For delta 3, relocate the FUNCTIONAL #insrc-provider + #insrc-mode <select>s from the status bar into the header (.chrome) next to the existing session label + #insrc-history switcher (their ids, options, and change-handlers move verbatim — same elements, new parent, so provider-switch + mode-switch behaviour is byte-identical). The status bar becomes the mock's read-only segments: a 'session <id>' seg (bound to `cur`/the active session title), an 'edits <mode>' seg (a read-only label derived from the current mode value, e.g. Manual→'review'), and the existing '✓ idle' ok seg. All controls keep their ids so their existing wiring + the setRunning/updatePermSeg logic still find them; presentation-only, no message/persistence change.

### 7.3 a3: Hybrid: read-only status bar; move only the provider select to the header, keep mode inline as the 'edits' control

Do deltas 1+2; for delta 3 render the status bar read-only per the mock but keep the mode as the live 'edits' control inline (styled as a label) and move only the provider select to the header.

Deltas 1+2 as in a1. For delta 3, move ONLY the #insrc-provider select to the header (it changes rarely — the fixed installed set), add a read-only 'session <id>' seg to the status bar (dedup with the header title), and keep #insrc-mode in the status bar as the 'edits <mode>' segment but styled to read as a plain label (borderless/chevron-suppressed) while remaining a functional control. The '✓ idle' seg stays. Presentation-only; ids + handlers preserved.

**Rejected because:** Rank 2. PARTIAL on dc3 — 'edits' stays an interactive control disguised as a read-only label (looks read-only yet is clickable, mildly misleading), and the mixed one-in-header/one-in-bar model is harder to test than a2's clean split: more complexity than a2 for less fidelity.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 'input-row-markup-and-css' — vscode-plugin/src/chat/chat-panel.ts:291 (#insrc-prompt align-self:flex-end), :303 (#insrc-input box CSS), :509-510 (inputbar markup)` — "#insrc-prompt is a role=button send/stop control (❯); #insrc-input is a rows=2 textarea inside a bordered box (border/border-radius/background), and the ❯ is bottom-aligned."
- **[[c2]]** `analyze-bundle` `s1 'statusbar-and-header-composition' — vscode-plugin/src/chat/chat-panel.ts:497 (.chrome session label + #insrc-history), :515-517 (.statusbar #insrc-provider + #insrc-modeseg/#insrc-mode + ✓ idle)` — "The status bar holds the FUNCTIONAL provider + mode <select>s; the header already carries the session identity + history switcher, so the mock's read-only bar is reachable by relocating the selects to"
- **[[c3]]** `analyze-bundle` `s1 'webview-data-availability' — vscode-plugin/src/chat/chat-panel.ts:220 (session-restored posts sessionId+mode), :423-427 (pmode/updatePermSeg), :462 (history title)` — "session id + chat mode are already delivered to the webview, so the read-only 'session'/'edits' segments need NO new message — presentation-only holds."
- **[[c4]]** `analyze-bundle` `s1 'test-scaffold' — vscode-plugin/src/chat/__tests__/chat-panel.test.ts + vscode-plugin/package.json 'test'` — "The *WebviewSource pattern drives the eval'd renderShell source under tsx --test (node:test + node:assert/strict); the fix's assertions extend it and re-run the S002 send/stop regression."
- **[[c5]]** `step-output` `s3 winner selection` — "a2 is the only alternative that fully satisfies dc3 (mock fidelity) while preserving control behaviour (dc4) and staying presentation-only (dc5)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-09-30T04:48:29.461Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1 | citation | LOW | auto | renderShell exists in vscode-plugin/src/chat/chat-panel.ts as the eval'd webview panel HTML+CSS builder. | Confirmed in source: chat-panel.ts:248 `const renderShell = (): string => {` (arrow-const, so 'function renderShell' grep missed it) and :902 `channel.setHtml(renderShell())`. The symbol exists and is the eval'd webview builder. | Accept — citation resolves; no change needed. |
| 2.2 | citation | LOW | auto | setRunning exists in chat-panel.ts and toggles the #insrc-prompt send/stop glyph. | setRunning resolves in chat-panel.ts (toggles the #insrc-prompt send/stop glyph, per S002 LLD lineage). Confirmed as an existing symbol the design preserves. | Accept — citation resolves; no change needed. |
| 2.3 | citation | LOW | auto | updatePermSeg exists in chat-panel.ts and sets the mode segment's perm-auto class from pmode. | Confirmed: chat-panel.ts:427 `function updatePermSeg(){if(pmseg)pmseg.className='seg'+(pmode==='auto'?' perm-auto':'');}`, pmode at :424, pmseg/#insrc-modeseg at :426. Exactly as the design describes. | Accept — citation resolves; no change needed. |
| c1 | citation | LOW | auto | chat-panel.ts:291 sets #insrc-prompt align-self:flex-end (the ❯ is currently bottom-aligned). | Read anchor confirmed: chat-panel.ts:291 `#insrc-prompt{flex:0 0 auto;align-self:flex-end;...color:var(--accent);...}` — the ❯ is bottom-aligned today, exactly the CSS the fix flips to flex-start. | Accept — citation resolves; no change needed. |
| c1 | citation | LOW | auto | chat-panel.ts:303 defines the #insrc-input box CSS (border, border-radius, background) — the box chrome the fix removes. | Read anchor confirmed: chat-panel.ts:303 `#insrc-input{...background:var(--panel);...border:1px solid var(--border-lit);border-radius:9px;padding:9px 11px;...}` — the box chrome the fix removes. | Accept — citation resolves; no change needed. |
| c1 | citation | LOW | auto | The input row markup (around chat-panel.ts:509-510) has #insrc-prompt (role=button ❯) + a rows=2 #insrc-input textarea with placeholder 'message claude…  (⌘↵ to send)'. | Confirmed: chat-panel.ts:509 `<span id="insrc-prompt" role="button" tabindex="0" aria-label="send">❯</span>` and :510 `<textarea id="insrc-input" rows="2" aria-label="message" placeholder="message claude…  (⌘↵ to send)">`. Markup matches the design's stateBefore exactly. | Accept — citation resolves; no change needed. |
| c2 | citation | LOW | auto | chat-panel.ts:497 renders the header (.chrome) with the session label + #insrc-sesstitle + #insrc-history switcher. | Read anchor confirmed: chat-panel.ts:497 renders `<span class="seglabel">session</span><span class="sesstitle" id="insrc-sesstitle"></span><select id="insrc-history" ...>` — the header already carries the session identity + history switcher, the basis for delta-3 relocation. | Accept — citation resolves; no change needed. |
| c2 | citation | LOW | auto | chat-panel.ts:515-517 renders the .statusbar with the #insrc-provider <select>, the #insrc-modeseg span wrapping #insrc-mode <select> (options manual/edit-auto/auto), and a ✓ idle seg. | Confirmed in source: chat-panel.ts:515 `<div class="statusbar">`, :516 `<select id="insrc-provider" ...>`, :517 `<span class="seg" id="insrc-modeseg">mode <select id="insrc-mode">` with options manual/edit-auto/auto, :518 `<span class="seg ok">✓ idle</span>`. Statusbar composition matches the design exactly. | Accept — citation resolves; no change needed. |
| c3 | citation | LOW | auto | chat-panel.ts:220 posts a session-restored message carrying sessionId + mode to the webview (so delta 3 needs no new message). | Read anchor confirmed: chat-panel.ts:220 `post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript, mode: permissionMode });` — sessionId + mode already reach the webview, so delta 3 needs no new message (presentation-only holds). | Accept — citation resolves; no change needed. |
| c4 | citation | LOW | auto | The *WebviewSource test scaffold exists at vscode-plugin/src/chat/__tests__/chat-panel.test.ts and the 'test' script in vscode-plugin/package.json runs tsx --test. | Confirmed: vscode-plugin/src/chat/__tests__/chat-panel.test.ts exists (105KB) with renderShell-source assertions (e.g. 'S002 ac3: renderShell embeds...', 'S001 (bugfix): renderShell has the SINGLE merged mode control...'), and package.json:734 `"test": "tsx --test 'src/**/__tests__/*.test.ts'"`. Framework matches; the 'WebviewSource' label is descriptive — the actual harness asserts against renderShell()'s emitted string. | Accept — scaffold + framework confirmed; the new tests extend this file. |
| 3.1 | semantic | LOW | auto | The set of element ids the design preserves (#insrc-prompt, #insrc-input, #insrc-provider, #insrc-mode, #insrc-modeseg, #insrc-history, #insrc-sesstitle) all currently exist in chat-panel.ts. | All preserved ids confirmed present in chat-panel.ts: #insrc-prompt (:509), #insrc-input (:510), #insrc-provider (:516), #insrc-mode (:517), #insrc-modeseg (:517), #insrc-history (:497), #insrc-sesstitle (:497). The id-preservation invariant is grounded. | Accept — every id exists; relocation preserves them. |
