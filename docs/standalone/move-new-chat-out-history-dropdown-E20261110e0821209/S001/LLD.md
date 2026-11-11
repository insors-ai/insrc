<!-- insrc:artifact LLD-e0821209d94791d0-s1 -->

# LLD: STORY-e0821209d94791d0-s1 — Move new-chat out of the history dropdown into an icon button left of the history widget

## Summary

**Epic:** `move-new-chat-out-history-dropdown`
**HLD base run:** `wf-1794370888746-51o06i`
**HLD effective hash:** `71e6c90a5ff7...`

This story moves the chat panel's new-chat action out of the history dropdown menu and into a dedicated icon button sitting immediately left of the history widget in the chrome bar. The button carries a chat-bubble-with-plus glyph and posts the exact same new-chat message as before, so session creation and all host-side handling are untouched; only the webview trigger and its pinning tests change.

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

**Surface level:** VS Code chat webview shell (vscode-plugin/src/chat/chat-panel.ts): the .chrome header's right-aligned cluster (.right > #insrc-newchat button + .histchip > #insrc-history + #insrc-histmenu popup) [[c2]]. The history menu becomes a pure session list; new-chat is a first-class chrome button. No change to the host message protocol, the session store, or provider adapters.

### 2.1 `renderHistoryMenu`

```typescript
() => void — rebuilds #insrc-histmenu rows from histEntries (webview bootstrap function in the nonce'd shell script)
```

**Returns:** `undefined` — undefined

**Errors:**
- `undefined` when undefined

**Preconditions:**
- histMenu element exists in the shell
- histEntries populated from history-list messages

**Postconditions:**
- #insrc-histmenu contains exactly one role=menuitem row per persisted chat and NO 'new…' row (the row this story removes)

### 2.2 `newChatPick`

```typescript
newChatPick(trigger: HTMLElement | null) => void — closes popups, refocuses trigger, posts the new-chat message (webview bootstrap function)
```

**Parameters:**
- `trigger: HTMLElement | null` — element to refocus after posting (the #insrc-newchat button)

**Returns:** `undefined` — undefined

**Errors:**
- `undefined` when undefined

**Preconditions:**
- vs message channel open

**Postconditions:**
- posts {v:1, payload:{type:'new-chat', provider: curProv || ''}} — identical payload to the old menu row, so the host's new-chat handler is unchanged

### 2.3 `#insrc-newchat click listener`

```typescript
(click on the chrome button) => stopPropagation(); newChatPick(nc) — new wiring added by this story
```

**Parameters:**
- `event: MouseEvent` — stopPropagation so document click-close does not race the post

**Returns:** `undefined` — undefined

**Errors:**
- `undefined` when undefined

**Preconditions:**
- #insrc-newchat exists in the shell markup, placed before .histchip in .right [[c2]], with the shared .pico 14px icon slot for its SVG [[c4]]

**Postconditions:**
- popups closed, new-chat posted, button keeps focus

## 3. Data model changes

### 3.1 `ChatSession / history-list / new-chat message envelope` — invariant-change

No persisted or protocol change: the new-chat payload {type:'new-chat', provider} is byte-identical, history-list is unchanged, and no store schema is touched. The only data change is presentational: the history menu's row set loses its synthetic 'new…' entry.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2564`
- `vscode-plugin/src/chat/chat-panel.ts:2568`
- `vscode-plugin/src/chat/chat-panel.ts:2751`
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:2017-2018`
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:2337`

## 4. Error paths

**Error cases**

- **User clicks #insrc-newchat while a history/active popup is open** (recoverable)
  - Detection: the button's own click listener stopPropagation()s before document click-close runs; newChatPick then calls closePops() itself
  - Response: all popups close, new-chat is posted once, focus moves to the button
  - User impact: none — single new-chat post, no double-fire
- **Host rejects the new-chat (e.g. cross-provider new-chat on a started session)** (recoverable)
  - Detection: the host’s new-chat provider-rejection branch calls only postRunConfig (chat-panel.ts:3309-3313), so the webview receives a ‘run-config’ message; that handler (chat-panel.ts:2693) re-syncs the curProv/run-button labels but does not call reconcile() — reconcile() fires only from ‘history-list’ (chat-panel.ts:2698, the rejected open-chat path) and ‘session-restored’
  - Response: webview state unchanged — the click never wrote to the trigger selections, so there is nothing to snap back; no menu row involved anymore
  - User impact: same as before the change — the refusal path is host-side and untouched

**Edge cases**

| Input | Expected |
| :--- | :--- |
| empty history list (no persisted chats yet) | history menu opens with zero rows (no 'new…' row anymore); the #insrc-newchat button remains the only new-chat affordance and works identically |
| keyboard user focuses #insrc-newchat and presses Enter/Space | native <button> fires click -> newChatPick(nc) posts new-chat; no custom key handler needed |
| Escape while focus is on #insrc-newchat | document keydown closes popups (closePops); button is not a popup trigger, nothing else happens |
| CSP of the webview | inline SVG in static shell markup is allowed under the webview CSP (default-src ‘none’; style-src ‘unsafe-inline’ — the shell already carries a static inline SVG at chat-panel.ts:2782); the icon renders with currentColor |

**Invariants to preserve**

- The new-chat message payload {type:'new-chat', provider: curProv||''} is unchanged, so the host's session-creation handler and all env('new-chat') host tests keep passing. [[c1]]
- The history trigger’s empty label stays ‘new…’ (renderTriggers, chat-panel.ts:2561) — only the MENU row is removed, not the chip label. [[c1]]
- closePops() still closes every popup and clears aria-expanded on both triggers; the new button needs no popup state. [[c1]]

## 5. Test strategy

**Test framework:** `node:test + assert/strict via npx tsx --test, with the panel's fidelityHtml() shell snapshot and fakeChannel() host-message capture (existing chat-panel.test.ts conventions)`

**Test levels**

- **unit** — Pin the shell markup and bootstrap wiring for the relocated new-chat trigger and the row-less history menu.
  - Subjects: `vscode-plugin/src/chat/__tests__/chat-panel.test.ts — update the 'regression: the history trigger still opens/new-chats…' test (lines ~2011-2021): newChatPick still posts {type:'new-chat',provider:curProv||''}, now triggered by the #insrc-newchat click listener; renderHistoryMenu output contains no 'new…'/'starts a new chat' row`, `vscode-plugin/src/chat/__tests__/chat-panel.test.ts — update the '#insrc-history session dropdown' markup test (line ~2337): .right contains <button id="insrc-newchat"> BEFORE <span class="histchip">; the button carries the bubble-plus SVG in its .pico slot and aria-label/title 'new chat'`, `vscode-plugin/src/chat/__tests__/chat-panel.test.ts — add assertions: doesNotMatch 'starts a new chat'; match on id="insrc-newchat" click wiring calling newChatPick; match on the bubble path + plus strokes of the icon SVG`
  - Fixtures: `fidelityHtml() snapshot (existing)`
- **integration** — Prove the host contract is unchanged: env('new-chat', ...) host tests still pass unmodified.
  - Subjects: `vscode-plugin/src/chat/__tests__/chat-panel.test.ts — existing new-chat host tests (representative sample: lines 229, 648, 659, 735, 792, 869, 1101, 1144, 1573, 3514, 3952, 4431, 4505, 4524, 4619) run unchanged; the guarantee is ac5’s full-suite run, not this enumerated list. Cross-file note: chat-shell.test.ts:717-724 renders the same .right/.histchip chrome with an index-based assertion (histAt > rightAt) that still holds after the insertion — verified unaffected`
  - Fixtures: `fakeChannel() + createChatPanelHost with scriptedAdapter (existing)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `updated history-trigger regression test: doesNotMatch /starts a new chat/ in renderHistoryMenu; history menu rows = histEntries only (also covers the empty-history edge case: zero rows, no ‘new…’ row)` |
| `ac2` | `markup test: /<button type="button" id="insrc-newchat"[^>]*><span class="pico">/ appears before /<span class="histchip">/ in the .right span` |
| `ac3` | `markup test: the #insrc-newchat .pico contains the inline bubble-plus SVG (bubble path + two plus strokes), fill/stroke currentColor` |
| `ac4` | `wiring test: /insrc-newchat/ listener calls newChatPick with the button element itself (nc) as the trigger argument (proves the ‘button keeps focus’ postcondition), and newChatPick posts /type:’new-chat’,provider:curProv\|\|’’/; clicking while a popup is open posts exactly once (stopPropagation + closePops); all existing env(’new-chat’) host tests pass unchanged` |
| `ac5` | `full suite: npx tsx --test vscode-plugin/src/chat/__tests__/chat-panel.test.ts passes (plus cli-adapter.test.ts), tsc --noEmit clean` |

## 6. Migration

**State before:** The chat chrome's .right cluster contains only the .histchip history widget; its dropdown menu (#insrc-histmenu) ends with a synthetic 'new…' / 'starts a new chat' row that posts {type:'new-chat'} via newChatPick (chat-panel.ts:2568). No dedicated new-chat button exists in the chrome.

**State after:** The history menu lists only persisted chats (no 'new…' row), and a dedicated icon button #insrc-newchat sits immediately left of .histchip in .right, carrying a chat-bubble-plus inline SVG and posting the identical {type:'new-chat', provider: curProv||''} message on click (native button keyboard semantics). Host, store and message protocol unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the #insrc-newchat button markup before .histchip in .chrome .right with the bubble-plus SVG in a .pico slot, plus .newchatbtn CSS (chip-matching ground/border/radius, hover/focus-visible states) — ↩ rollbackable
2. Wire the button's click listener (stopPropagation + newChatPick(nc)) in the bootstrap script and remove the trailing mitem row from renderHistoryMenu — ↩ rollbackable
3. Update the two pinning tests in chat-panel.test.ts (history-trigger regression test, histchip markup test) and add assertions for the button placement, icon, wiring and the row-less menu — ↩ rollbackable

**Backward compat:** Fully backward compatible: the new-chat webview->host message payload is byte-identical, history-list is unchanged, no persisted schema exists for the chrome, and all host-side env('new-chat') tests pass unmodified. Older webview shells are not persisted (the shell is rebuilt on every panel open), so there is no mixed-version state.

## 7. Alternatives considered

### 7.1 a1: Icon button left of the history chip (chosen shape) — **CHOSEN**

A real <button id=insrc-newchat> in .chrome .right immediately before .histchip; click posts the unchanged {type:'new-chat'} via newChatPick; the history menu loses its trailing new… row.

Markup: insert the button into the .right span before the histchip (chat-panel.ts:2751) [[c2]]. CSS: a compact bordered icon button reusing the chip's ground/border/radius and the existing .pico 14px slot [[c4]] for a bubble-plus inline SVG (currentColor). JS: const nc=getElementById('insrc-newchat'); nc click -> stopPropagation + newChatPick(nc); renderHistoryMenu drops the appended mitem row. Native <button> gives Enter/Space activation and focus for free; aria-label/title 'new chat'.

### 7.2 a2: Keep the row, add a header button too (dual affordance)

Add the icon button left of .histchip but ALSO keep the new… row at the bottom of the history menu.

Same as a1 for the button, plus renderHistoryMenu keeps its trailing mitem row.

**Rejected because:** Violates the primary requirement — keeps the duplicated 'new…' row the story asks to remove

### 7.3 a3: Icon button inside the input bar

Place the new-chat button at the left edge of .inputbar next to the ❯ prompt instead of the chrome.

Markup in the .inputbar div; same click wiring; history menu row removed.

**Rejected because:** Places the button in the input bar instead of left of the history widget; adds layout risk

### 7.4 a4: Status quo (row only)

Keep the trailing new… row in the history menu; change nothing.

No change.

**Rejected because:** No change at all — does not meet the story

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2526-2590` — "bootstrap JS wiring: hs=#insrc-history, renderHistoryMenu with the trailing new… row, newChatPick posting {type:'new-chat',provider:curProv||''}, closePops"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2747-2752` — "chrome markup: .right > .histchip > #insrc-history button + #insrc-histmenu popup — the placement point for the new button"
- **[[c3]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:2017-2018` — "pinning assertions for newChatPick/'new…' row and the histchip markup (line 2337) that this story updates"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:2282-2283` — ".pico{...14px...} .pico svg{width:14px;height:14px;display:block;} — the icon slot the bubble-plus SVG reuses"
