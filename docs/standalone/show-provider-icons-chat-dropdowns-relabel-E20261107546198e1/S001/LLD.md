<!-- insrc:artifact LLD-546198e11c24c1e3-s1 -->

# LLD: STORY-546198e11c24c1e3-s1

## Summary

**Epic:** `show-provider-icons-chat-dropdowns-relabel`
**HLD base run:** `wf-1794054802973-szl4bh`
**HLD effective hash:** `0ceb6f7a0bc5...`

The dev-chat header's two dropdowns — history and active chats — will each show the provider icon (Claude, Codex or Vibe) next to every chat, so a user can tell at a glance which provider a chat is running on. When no chat is active, the active-chat dropdown reads 'no active work' instead of the current 'active…' placeholder. The change is contained to the chat webview: the native <select> controls are replaced with custom menus so the real inline provider icon can render per row, which the native popup cannot.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [UX](#8-ux)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `mitem`

```typescript
mitem(sel: boolean, label: string, sub?: string, onclick?: () => void, onhover?: () => void, dis?: boolean, icon?: string): HTMLDivElement
```

**Parameters:**
- `sel: boolean` — true marks the row as the selected chat
- `label: string` — the visible row text (chat title)
- `sub: string` _(optional)_ — optional secondary text under the label
- `onclick: () => void` _(optional)_ — row activation callback
- `onhover: () => void` _(optional)_ — row hover callback
- `dis: boolean` _(optional)_ — disables the row when true
- `icon: string` _(optional)_ — the provider icon mark to paint in the .pico slot

**Returns:** `HTMLDivElement` — a role=menuitem row with .pico/.chk/.lbl descendants

**Preconditions:**
- icon, when provided, is the inline SVG string returned by pico(provider)

**Postconditions:**
- the returned row is a role=menuitem div whose .pico descendant renders the provider icon when icon is set, and whose .chk descendant marks the row when sel is true

### 2.2 `pico`

```typescript
pico(provider: string): string
```

**Parameters:**
- `provider: string` — the provider id (claude/codex/vibe) to resolve

**Returns:** `string` — the inline SVG mark for the provider id

**Preconditions:**
- provider is one of the ids present in ICONS

**Postconditions:**
- returns the inline SVG mark for the provider, reused unchanged as the per-row icon for both chat dropdowns

### 2.3 `paintSel`

```typescript
paintSel(sel: HTMLElement, p: string): void
```

**Parameters:**
- `sel: HTMLElement` — the select element to paint
- `p: string` — the provider id whose mark is painted

**Returns:** `void` — paints the select element’s background with the provider mark (removed after the change)

**Preconditions:**
- sel is one of the two native chat selects (#insrc-history / #insrc-active)

**Postconditions:**
- removed: it and picoUrl/paintOpt only painted the two native chat selects with a data-URI background-image; with those selects replaced by custom menus the helpers have no remaining caller. The run-config provider/model menus already render through mitem + pico, not paintSel, and are untouched.

### 2.4 `paintOpt`

```typescript
paintOpt(o: HTMLElement, p: string): void
```

**Parameters:**
- `o: HTMLElement` — the option element to paint
- `p: string` — the provider id whose mark is painted

**Returns:** `void` — assigns the option’s background-image to the provider mark (removed after the change)

**Preconditions:**
- o is a native option inside one of the two chat selects

**Postconditions:**
- removed alongside paintSel/picoUrl: chat rows render via mitem’s icon slot instead of an option background-image; the run-config menus are already mitem-based and untouched.

## 3. Data model changes

### 3.1 `insrc-active / insrc-history chrome controls` — field-modify

Replace the two native <select> controls (#insrc-active, #insrc-history) with <button> triggers (aria-haspopup='menu', aria-expanded toggled) plus custom div menus, and cache the list entries client-side as histEntries (ChatSummary[]) and actEntries (ActiveChatEntry[]) plus the selected-id strings histSel and actSel. The trigger renders from selected-id membership: histChatFor(id) returns the histEntries entry when id is present, else undefined; activeChatFor(id) returns the actEntries entry when id is present, else undefined. An unsaved draft has no persisted record, so it is absent from BOTH lists (activeChats enumerates persisted records with status, and history holds only saved chats); membership-driven rendering therefore clears both selections and shows the empty placeholders ('no active work' / 'new…') until the draft's first save enters it into history.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2537`
- `vscode-plugin/src/chat/chat-panel.ts:2538`
- `vscode-plugin/src/chat/chat-panel.ts:2488`
- `vscode-plugin/src/chat/chat-panel.ts:2493`

### 3.2 `chat dropdown rows (history + active)` — field-modify

Each open row is built through mitem with sel = (chat.id === selectedId), label = chat.title and icon = pico(chat.provider), so the real inline provider SVG renders per row — the gap the native option background-image cannot close. Active rows additionally render a status dot coloured through the DOT map {waiting-input:'red', working:'yellow', done:'green'}; the active trigger still shows the highest-ranked status.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2383`
- `vscode-plugin/src/chat/chat-panel.ts:2493`

### 3.3 `activation + session-restored selection state` — invariant-change

Activation becomes a WRITER, and both selected ids are reconciled to the host-confirmed current session (cur) on EVERY host message: (1) on activating chat B — an active row or a persisted history row — the click/Enter handler writes actSel = histSel = B optimistically and re-renders both triggers before posting open-chat {chatId: B}, so the triggers flip immediately; activating the history 'new…' row posts new-chat {provider: curProv} unchanged (no optimistic write — there is no chat yet). (2) on session-restored, cur = m.sessionId, then reconcile BOTH selections and re-render in the order actSel then histSel: actSel = cur when cur is present in actEntries, else cleared ('no active work'); histSel = cur when cur is present in histEntries, else cleared ('new…'). (3) on history-list AND on active-list, re-settle BOTH selections against cur the same way (actSel = cur when present in actEntries else clear; histSel = cur when present in histEntries else clear): a rejected open-chat arrives as history-list alone (no session-restored, no active-list), so the history-list handler reconciles both selections — the active trigger snaps back to the confirmed session even when the stale id B remains in the cached actEntries and no active-list arrives. (4) the run-config branch (2484) no longer paints the chat triggers from curProv — it only updates curProv and the run-config button labels; paintSel/paintOpt/picoUrl are removed with the native chat selects.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2367`
- `vscode-plugin/src/chat/chat-panel.ts:2422`
- `vscode-plugin/src/chat/chat-panel.ts:2474`
- `vscode-plugin/src/chat/chat-panel.ts:2484`
- `vscode-plugin/src/chat/chat-panel.ts:2488`
- `vscode-plugin/src/chat/chat-panel.ts:2493`

### 3.4 `chat dropdown menu keyboard/focus lifecycle` — invariant-change

Keyboard and focus lifecycle (replaces the native selects' built-in interaction). The two triggers are <button> elements with aria-haspopup='menu'; Enter/Space on a focused trigger toggles its menu (the same keydown pattern as the existing '>' send button, line 2510), and aria-expanded reflects the open state. Each menu is a role='menu' panel whose rows are mitem's role='menuitem' divs; the chat-menu builder assigns a roving tabindex (the focused row tabindex=0, the others -1) and tracks the focused index in a JS variable the keydown handler reads (mitem's signature and structure are unchanged, so the run-config callers are untouched). On open, focus moves to the selected row when one exists, else to the first enabled row; an empty menu shows a single disabled placeholder row and focus stays on the trigger. Arrow Up/Down move the focused row with wrap-around, Home/End jump to first/last, Enter/Space activate the focused row (the same handler as click), Escape closes the menu and returns focus to its trigger, Tab closes the menu and moves focus onward, and an outside click closes the menu — the existing document click + Escape closePops pattern (lines 2394-2395) is extended to cover the two chat menus. On activation the menu closes and focus returns to its trigger. Opening one chat menu closes the other chat menu and the run-config provider/effort popups.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts:2382`
- `vscode-plugin/src/chat/chat-panel.ts:2394`
- `vscode-plugin/src/chat/chat-panel.ts:2395`
- `vscode-plugin/src/chat/chat-panel.ts:2510`

## 4. Error paths

**Error cases**

- **a chat entry carries a provider id that has no ICONS entry (unknown or legacy provider)** (recoverable)
  - Detection: pico(provider) returns no mark for a provider id absent from ICONS, leaving the row icon slot empty
  - Response: render the row without an icon and fall back to the chat title alone; the trigger shows the title without an icon
  - User impact: the chat is still listed and selectable; only the icon is missing for that provider
- **the selected id (actSel/histSel) points at a chat the host no longer recognises (rejected open-chat or removed between renders)** (recoverable)
  - Detection: an open-chat was rejected or the selected chat was removed: the host answers with history-list alone (no session-restored, no active-list) and cur is unchanged; histChatFor(id) and activeChatFor(id) return undefined for the optimistic id (it is neither in histEntries/actEntries nor the confirmed current cur)
  - Response: the history-list handler re-settles BOTH actSel and histSel against cur (actSel = cur when present in actEntries else clear; histSel = cur when present in histEntries else clear), so both triggers return to the confirmed session — the active trigger clears the stale id even though it may remain in the cached actEntries and no active-list arrives
  - User impact: both triggers snap back to the confirmed session on the history-list response alone — no crash and no stuck stale icon
- **the session-restored message arrives before the list entries have been cached** (recoverable)
  - Detection: session-restored arrives before history-list / active-list have cached histEntries / actEntries
  - Response: defer reconciliation to the next history-list / active-list render: keep the raw restored id (cur) and re-run the membership check once histEntries/actEntries are populated (histSel then actSel)
  - User impact: the triggers may briefly read the empty placeholder, then flip to the restored chat when the lists arrive

**Edge cases**

| Input | Expected |
| :--- | :--- |
| no chat is active (actEntries empty and no restored session) | the active trigger reads 'no active work' and the menu opens with zero rows (or a disabled placeholder) |
| the user activates chat B while chat A is already active (A→B switch) | actSel flips A→B optimistically, the trigger re-renders to B's icon/title immediately, and open-chat is posted with B's chatId |
| history contains a persisted chat whose session is not in the active list (completed / aged-out / legacy session) | the history row renders normally (icon + title); activating it posts open-chat with its chatId exactly like any persisted history row — it is never treated as a draft and never posts new-chat |
| an active chat's status is waiting-input / working / done | the row's status dot and the trigger's aggregate status match the DOT map colour, and the provider icon renders alongside — not replacing — the status |
| the current chat is a not-yet-saved draft (no persisted record, so absent from both the active list and history) | both triggers show their empty placeholders — 'no active work' (active) and 'new…' (history) — until the draft's first save enters it into history; the draft is never routed through new-chat or open-chat as a separate row |

**Invariants to preserve**

- activating an active row posts open-chat with its chatId; activating a persisted history row posts open-chat with its chatId; activating the history 'new…' row posts new-chat with the current provider — each message is unchanged, and a persisted history row is never routed through new-chat regardless of active-list membership. [[c5]]
- mitem's first parameter stays a SELECTED boolean and its role=menuitem / .pico / .chk / .lbl structure is unchanged, so the run-config renderProvPane/renderModelPane callers are untouched; the chat-menu builder sets tabindex on the returned rows, not mitem itself. [[c6]]
- the per-row provider mark is the real inline SVG from pico(provider), not a text glyph or an option background-image (which the native popup cannot render). [[c2]]
- the DOT status-colour mapping {waiting-input:'red', working:'yellow', done:'green'} and the highest-ranked aggregate status on the active trigger are preserved. [[c5]]
- an unsaved draft has no persisted record and is therefore absent from both actEntries and histEntries; it renders the empty placeholders (never a synthesized row) and is never an activation route. [[c5]]

## 5. Test strategy

**Test framework:** `node:test (tsx) with the chat-panel fake-DOM harness for pure logic; real-browser (headless Chrome screenshot) for interaction. Fake-DOM limitations and how each is handled: (1) innerHTML is not parsed into descendants, so icon tests assert the returned row's innerHTML CONTAINS the pico(chat.provider) SVG string (a string match), not a .pico descendant read; (2) native focus is inert, so the menu tracks its focused index in a JS variable and unit tests assert that index's transitions by invoking the keydown handler with synthetic events — actual focus movement, document-level outside-click propagation and bubbling are verified in the real browser, not fake-DOM; (3) document listeners are not dispatched in fake-DOM, so dismissal tests invoke the close handler directly, and real-browser smoke verifies actual outside-click.`

**Test levels**

- **unit** — Prove the pure logic against the fake-DOM harness: the row innerHTML contains the real per-row provider SVG string, the empty active trigger reads 'no active work', activation writes the selected id optimistically, every host message (session-restored/history-list/active-list) reconciles BOTH selections against cur (including recovery from a rejected open-chat on a history-list-only response and the session-restored-before-list ordering), the persisted-history vs new-chat message split, unknown-provider fallback, and the menu keyboard/focus logic via the roving-focus index.
  - Subjects: `vscode-plugin/src/chat/chat-panel.ts:2383 mitem row render (innerHTML contains pico SVG string)`, `vscode-plugin/src/chat/chat-panel.ts:2537 insrc-active trigger`, `vscode-plugin/src/chat/chat-panel.ts:2538 insrc-history trigger`, `vscode-plugin/src/chat/chat-panel.ts:2367 active activation`, `vscode-plugin/src/chat/chat-panel.ts:2422 history activation`, `vscode-plugin/src/chat/chat-panel.ts:2474 session-restored reconcile`, `vscode-plugin/src/chat/chat-panel.ts:2488 history-list reconcile (rejected open-chat recovery)`, `vscode-plugin/src/chat/chat-panel.ts:2493 active-list reconcile`, `vscode-plugin/src/chat/chat-panel.ts:2394-2395 menu keyboard/focus (roving-focus index)`, `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:5928 migrate existing native options/change assertions`
- **smoke** — Confirm in the real webview browser (headless Chrome screenshot): the header renders without error, both triggers open their custom menus, the per-row provider SVGs render, the active trigger reads 'no active work' when empty, focus moves into the menu on open and returns to the trigger on activation, keyboard navigation (Arrow/Enter/Escape/Tab) works, and an outside click dismisses the menu.
  - Subjects: `vscode-plugin/src/chat/chat-panel.ts header render`, `vscode-plugin/src/chat/chat-panel.ts both chat menus open + per-row provider SVG render`, `vscode-plugin/src/chat/chat-panel.ts focus entry/return + keyboard navigation + outside-click dismissal`, `vscode-plugin/src/chat/chat-panel.ts active trigger empty-state 'no active work'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: every history row's innerHTML contains the pico(chat.provider) SVG string`, `unit: every active row's innerHTML contains the pico(chat.provider) SVG string` |
| `ac2` | `unit: with actEntries empty and no restored session, the insrc-active trigger text is 'no active work'`, `unit: the run-config branch no longer repaints the chat triggers from curProv, so the placeholder cannot be overwritten`, `unit: a not-yet-saved draft (absent from both lists) renders 'no active work' on the active trigger and 'new…' on the history trigger` |
| `ac3` | `unit: activating chat B sets actSel/histSel to B and re-renders both triggers to B’s icon/title before posting open-chat (A→B switch)`, `unit: activating a persisted history row posts open-chat with its chatId; activating the history ‘new…’ row posts new-chat with the current provider (message split)`, `unit: on a history-list-only rejection response, BOTH triggers reconcile against cur (the active trigger clears the stale id with no active-list message)` |
| `ac4` | `unit: session-restored sets actSel AND histSel to the restored session id when it is present in actEntries/histEntries`, `unit: session-restored clears actSel when the restored id is absent from actEntries, yielding 'no active work'`, `unit: history-list re-settles both selections to cur after a rejected open-chat (recovery), and does NOT synthesize a row for an id that is not cur`, `unit: the active trigger shows the highest-ranked aggregate status even when the selected row carries a different status (per-row vs aggregate)` |

## 6. Migration

**State before:** The dev-chat header renders two native <select> controls — #insrc-active with an 'active…' empty placeholder and #insrc-history with a 'new…' empty placeholder. Per-chat provider marks are painted as option background-images via paintOpt/paintSel/picoUrl, which native select popups cannot render, and activation reads act.value/hs.value through change listeners to post open-chat / open-chat+new-chat.

**State after:** Both controls are button triggers plus custom div menus whose rows render the real inline provider icon via mitem's icon param (pico(chat.provider)) and, for active rows, a DOT-coloured status dot, with a keyboard/focus lifecycle (roving focus, Escape/Tab/outside-click dismissal, popup coordination). The active trigger reads 'no active work' when no id is selected (membership-driven rendering); activation writes actSel/histSel optimistically and re-renders the triggers before posting the unchanged messages; session-restored reconciles actSel then histSel against the restored session and cached entries, and history-list/active-list re-settle the selections to the confirmed current session (recovering a rejected open-chat).

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Replace the two native <select> controls (#insrc-active, #insrc-history) with button triggers plus custom div menus, and cache the list entries client-side as histEntries/actEntries plus the selected-id strings histSel/actSel. — ↩ rollbackable
2. Render each open row through mitem with icon = pico(chat.provider) and sel = (chat.id === selectedId); add the DOT-coloured status dot to active rows. — ↩ rollbackable
3. Change the activation handlers (active and history) to WRITE actSel/histSel optimistically and re-render the triggers before posting open-chat / new-chat. — ↩ rollbackable
4. Reconcile actSel then histSel on session-restored, and re-settle both selections on history-list / active-list (recovering a rejected open-chat); remove paintSel/paintOpt/picoUrl with the native chat selects. — ↩ rollbackable
5. Wire the keyboard/focus/aria lifecycle for both menus (roving focus, Enter/Space activation, Escape/Tab/outside-click dismissal, popup coordination). — ↩ rollbackable

**Backward compat:** No public API is affected — the change is internal webview chrome. The open-chat / new-chat IPC messages and the ChatSummary/ActiveChatEntry payloads are unchanged, so no host or IPC contract needs to stay backward compatible. Steps 1-5 are one atomic webview change and roll back together: changing the markup alone leaves the existing .options/.value/change handlers incompatible with the replacement buttons.

## 7. Alternatives considered

### 7.1 a1: Button triggers + custom div menus, mitem reused unchanged, membership-driven trigger rendering — **CHOSEN**

Custom menus with cached entries; per-row icons via mitem's existing icon param; the trigger and selected row update optimistically on activation.



### 7.2 a2: Text-glyph prefix on native options

Prefix each option's text with a per-provider text mark; no structural change.



**Rejected because:** violates the real-icon constraint (a text glyph is not the real provider SVG); while the empty-state wording could be changed independently, it still leaves the native popup unable to render per-row icons.

### 7.3 a3: ARIA listbox wrapper shared with the provider/model menus

A role=listbox/option structure reused by all four menus, trigger from selected row.



**Rejected because:** satisfies both constraints but rewires the run-config provider/model menus — scope creep and regression risk the Story does not need.

## 8. UX

- [UX mock](docs/standalone/show-provider-icons-chat-dropdowns-relabel-E20261107546198e1/S001/ux-mock.html)

## 9. References

- **[[c1]]** `analyze-bundle` `read:chrome-markup: the two chrome dropdowns #insrc-history/#insrc-active and their empty placeholder options 'new…'/'active…' (vscode-plugin/src/chat/chat-panel.ts:2537-2538)`
- **[[c2]]** `analyze-bundle` `read:provider-icon-rendering: paintOpt/paintSel paint data-URI SVG backgrounds on options/selects that native popups ignore; pico() resolves the inline SVG from ICONS (vscode-plugin/src/chat/provider-icons.ts:26,32; vscode-plugin/src/chat/chat-panel.ts:2364-2365)`
- **[[c3]]** `analyze-bundle` `read:select-surface: the list handlers use hs/act .options/.value/'change', option[data-dot] status colours, and the run-config branch paints both selects with curProv (vscode-plugin/src/chat/chat-panel.ts:2488,2493,2474,2484)`
- **[[c4]]** `analyze-bundle` `read:wire-shapes: ChatSummary.provider and ActiveChatEntry.provider already carry the provider id (vscode-plugin/src/chat/session-store.ts:252; vscode-plugin/src/chat/protocol.ts:87)`
- **[[c5]]** `analyze-bundle` `read:status-map: the DOT map waiting-input→red/working→yellow/done→green, actChip data-urgent, and the open-chat/new-chat change-listener messages (vscode-plugin/src/chat/chat-panel.ts:2493,2367,2422)`
- **[[c6]]** `analyze-bundle` `read:mitem-signature: mitem(sel,label,sub,onclick,onhover,dis,icon) takes a selected boolean first and is called by renderProvPane/renderModelPane (vscode-plugin/src/chat/chat-panel.ts:2383-2385)`

