<!-- insrc:artifact LLD-ddc4ede1dbf84626-S001 -->

# LLD: E20261012ddc4ede1:S001

## Summary

**Epic:** `page-dev-chat-transcript-show-latest`
**HLD base run:** `wf-1791789281233-4pjafm`
**HLD effective hash:** `6baf2b206346...`

Opening a chat shows only its most recent page of rows; a bar at the top of the transcript (and scrolling to the top) loads the page before it, keeping the reader's place. While a session is active, the view drops its oldest rows once it holds more than a set number and the reader is at the bottom; those rows come back the same way. A new row scrolls the view down only when the reader was already at the bottom. The host sends pages on request and the stored session is not changed.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `postInitialState`

```typescript
postInitialState(): void
```

**Returns:** `void` — Posts theme, then `session-restored` for the active session, then the approval head, the history list, and follows a live turn, as today.

**Preconditions:**
- A panel channel is attached

**Postconditions:**
- `session-restored` carries only the latest window of the transcript, with `firstIndex` and `total` (see the `session-restored` data-model entry)
- The new-chat and open-chat handlers post `session-restored` through the same helper, so all three sites behave alike

### 2.2 `appendEvent`

```typescript
appendEvent(s: ChatSession, ev: TurnEvent): number | undefined
```

**Parameters:**
- `s: ChatSession` — The session whose transcript receives the durable row
- `ev: TurnEvent` — The live event

**Returns:** `number | undefined` — The absolute transcript index of the row the event wrote, or undefined when it wrote none (status, approval-request, permission-outcome, selection-outcome, an unmapped kind). It returned void before.

**Postconditions:**
- The rows written are exactly today's rows
- ORDER CHANGE in both callers: each sink now calls appendEvent FIRST and posts the event second, with the returned index as `rowIndex`. Today both post first
- In the followed-turn sink appendEvent stays outside the `!disposed && session === s` guard, so a turn followed for a session that is not shown is still written; only the post stays inside the guard

### 2.3 `recordPermissionOutcome`

```typescript
recordPermissionOutcome(toolName: string, approved: boolean, requestId: string): void
```

**Parameters:**
- `toolName: string` — The tool the decided card gated
- `approved: boolean` — The decision
- `requestId: string` — The decided request

**Returns:** `void` — Writes the permission-outcome row and posts its turn-event (unchanged).

**Postconditions:**
- ORDER CHANGE: the row is pushed first, then the turn-event is posted with `rowIndex` = the pushed row's index. With no session the event is posted without `rowIndex`, as today
- recordSelectionOutcome changes the same way

### 2.4 `recordSelectionOutcome`

```typescript
recordSelectionOutcome(requestId: string, chosen: readonly string[]): void
```

**Parameters:**
- `requestId: string` — The decided selection request
- `chosen: readonly string[]` — The chosen labels

**Returns:** `void` — Writes the selection-outcome row and posts its turn-event (unchanged).

**Postconditions:**
- ORDER CHANGE: push first, then post with `rowIndex`; no `rowIndex` when there is no session

### 2.5 `runTurn`

```typescript
runTurn(prompt: string, allowedTools?: readonly string[], opts?: { suppressEcho?: boolean | undefined }): Promise<void>
```

**Parameters:**
- `prompt: string` — The user's message or a follow-up prompt
- `allowedTools: readonly string[]` _(optional)_ — Tools pre-allowed for the turn
- `opts: { suppressEcho?: boolean | undefined }` _(optional)_ — Suppress the user-row echo for a synthetic follow-up

**Returns:** `Promise<void>` — Runs the turn (unchanged).

**Postconditions:**
- The `user-row` it posts gains `rowIndex` (the same index its key `r<n>` already carries). It already pushes before it posts, so no order change

### 2.6 `line`

```typescript
line(s: string, cls?: string): HTMLElement
```

**Parameters:**
- `s: string` — The row's text
- `cls: string` _(optional)_ — An optional class

**Returns:** `HTMLElement` — The appended node (unchanged).

**Postconditions:**
- SCROLL RULE CHANGE: line() no longer sets `scrollTop = scrollHeight` itself. It appends through the pager's `append(node)`, which scrolls to the bottom only when the view was at the bottom before the append and no older page is being rendered
- The two other sites that append to the terminal and force the scroll (renderDiff and the approval-card branch) append through the same pager call
- A session restore still ends at the bottom

### 2.7 `appendKeyed`

```typescript
appendKeyed(vm: RowViewModel, key: string | null): Node | null
```

**Parameters:**
- `vm: RowViewModel` — The row to render
- `key: string | null` — `r<absolute transcript index>` for a replayed or page row; null for an unkeyed row

**Returns:** `Node | null` — The rendered node, or the node already rendered for that key (unchanged).

**Postconditions:**
- Unchanged behaviour. Replayed rows are now keyed by their ABSOLUTE index (`firstIndex + i`), not by their position in the posted array
- The registry gains two companions used by paging: `forgetKeysBefore(index)` drops the `r<n>` keys below an index so a trimmed row renders again when its page is reloaded, and `withIsolatedPending(fn)` runs a render with an empty pending-tool list and restores the live one afterwards, so an older page never captures or loses a live tool row

### 2.8 `resetKeys`

```typescript
resetKeys(): void
```

**Returns:** `void` — Clears the key map, the pending tool rows and the approval-card map (unchanged).

**Postconditions:**
- Still called on `session-restored`, which also resets the pager's window (first held index, last index, total, loading flag)

## 3. Data model changes

### 3.1 `session-restored (HostToWebview message)` — field-add

Adds `firstIndex: number` (absolute transcript index of `transcript[0]`) and `total: number` (rows in the whole transcript). `transcript` now holds only the latest window: the last PAGE_ROWS (100) rows, extended back to the start of the turn (the nearest earlier user row) when that is within PAGE_ROWS more rows, so a window is at most 200 rows. A transcript no longer than one page is sent whole with firstIndex 0. A webview that receives no `firstIndex` treats it as 0.

```
{ type:'session-restored'; sessionId; transcript: TranscriptEntry[]; mode? } -> { ...; firstIndex: number; total: number }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts`

### 3.2 `load-older (WebviewToHost message)` — new

`{ type:'load-older'; sessionId: string; before: number }`: the webview asks for the page that ends just before absolute index `before` (its first held row). Sent when the 'load earlier' bar is clicked or the transcript is scrolled to its top, at most one request at a time. Added to the WebviewToHost union and to WEBVIEW_TO_HOST_TYPES, with a protocol.test.ts case, as cancel-turn and selection-decision were.

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/__tests__/protocol.test.ts`

### 3.3 `transcript-page (HostToWebview message)` — new

`{ type:'transcript-page'; sessionId: string; before: number; firstIndex: number; rows: TranscriptEntry[]; total: number }`: rows `[firstIndex, before)` of the active session's transcript, cut by the same page rule as the restore window. `rows` is empty and `firstIndex` equals `before` when nothing is older. The webview applies it only when `sessionId` is the shown session and `before` equals its first held index. Added to the HostToWebview union and to HOST_TO_WEBVIEW_TYPES, with a protocol.test.ts case.

**Call sites:**
- `vscode-plugin/src/chat/protocol.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/__tests__/protocol.test.ts`

### 3.4 `turn-event and user-row (HostToWebview messages)` — field-add

Both gain an optional `rowIndex: number`: the absolute transcript index of the row the message wrote. Set by all five writers: appendEvent's two callers (assistant, marker, tool-result rows), recordPermissionOutcome, recordSelectionOutcome and runTurn's user row. Absent on an event that writes no row (status, approval-request) and on an outcome posted with no session. The webview stamps each node it appends with the index it belongs to; a node appended without one takes the latest index seen.

```
{ type:'turn-event'; event } -> { type:'turn-event'; event; rowIndex?: number }; { type:'user-row'; text; key } -> { ...; rowIndex?: number }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/protocol.ts`

### 3.5 `transcript-window (new vscode-free module)` — new

Pure functions the host uses to cut pages: `latestWindow(transcript, pageRows)` and `pageBefore(transcript, before, pageRows)`, each returning `{ firstIndex, rows }`. One rule for both: start PAGE_ROWS rows before the end of the range, then move the start back to the nearest user row within a further PAGE_ROWS rows; with none there, keep the plain cut. `before` is clamped to 0..length. Exports PAGE_ROWS = 100.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.6 `transcript-pager (new webview source module)` — new

The webview's paging logic as an embeddable function source (the pattern render-registry.ts uses), so it is tested against the shared fake DOM. It is created before the registry (the shell's line() needs it) and is handed the registry afterwards. It holds the window state (first held index, last index, total, loading flag, whether a page is being rendered) and exposes: `append(node)`, the single way a node joins the terminal, which follows to the bottom only when the view was at the bottom before the append and no page is being rendered; `reset(firstIndex, total)` for a restore, which ends at the bottom; `stamp(fromChild, rowIndex)` to mark newly appended nodes; `prepend(page)`, which records scrollTop and scrollHeight, renders the page through the registry (keys `r<absolute index>`, pending tool rows isolated, no following), moves the new nodes above the held ones and sets scrollTop to the recorded value plus the height added; `trimIfNeeded()`, which, when more than MAX_HELD_ROWS (300) rows are held and the view is at the bottom, removes the oldest nodes back to a user row leaving about 200 and forgets their keys; a scroll listener that requests an older page at the top and runs the trim when the view returns to the bottom; and the 'load earlier' bar, shown whenever the first held index is above 0, with the count of older rows.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/render-registry.ts`

### 3.7 `fake-dom.ts (shared test fixture)` — field-add

The pager's tests reuse `__tests__/fake-dom.ts` (bodyStub and its parent/sibling links, insertBefore, removeChild); no second fake DOM is written. The fixture gains only the scroll metrics the pager reads and writes: scrollTop, scrollHeight and clientHeight.

**Call sites:**
- `vscode-plugin/src/chat/__tests__/fake-dom.ts`

### 3.8 `ChatSession (stored record)` — invariant-change

No field changes and no storage change. Invariant relied on: transcript rows are only ever appended, so an absolute row index is stable for the life of a session and can identify a row across pages.

**Call sites:**
- `vscode-plugin/src/chat/session-store.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/page-dev-chat-transcript-show-latest-E20261012ddc4ede1/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A `load-older` arrives for a session that is no longer the active one (the user switched chats while the request was in flight)** (recoverable)
  - Detection: The host compares the message's `sessionId` with the active session's id
  - Response: The host ignores it and posts nothing
  - User impact: None: the new chat already shows its own latest page
- **A `load-older` carries a `before` that is not a whole number, or a `sessionId` that is not a string** (recoverable)
  - Detection: The host checks `typeof sessionId === 'string'` and `Number.isInteger(before)` before using them
  - Response: The message is dropped, as other malformed inbound messages are
  - User impact: None
- **A `transcript-page` arrives that the webview no longer wants: a duplicate, one for another session, or one whose `before` is not the first held index (the window moved, or a restore happened in between)** (recoverable)
  - Detection: The pager compares `sessionId` with the shown session and `before` with its first held index
  - Response: The page is discarded; the loading flag is cleared only when the page matches the request that set it or a restore reset it
  - User impact: None: no duplicate or misplaced rows
- **No `transcript-page` ever answers a `load-older` (the host dropped it as stale)** (recoverable)
  - Detection: The pager's loading flag is still set when the next `session-restored` arrives, or 5 seconds pass with no page
  - Response: The flag is cleared, so the bar and scroll can ask again
  - User impact: The bar works again after a moment instead of staying stuck
- **One row of an older page fails to render** (recoverable)
  - Detection: The registry's renderRow already catches a renderer's throw and falls back to a plain line
  - Response: That row falls back; the rest of the page is rendered and moved into place; the pager clears its 'rendering a page' state in a finally, so following is never left switched off
  - User impact: One row shows as plain text

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A transcript of 0 rows, or no longer than one page | `session-restored` carries the whole transcript with firstIndex 0 and total = its length; no 'load earlier' bar is shown and nothing is requested |
| A transcript of 1,000 rows with a user row every 20 rows | The restore window starts at the user row at or before index 900 and holds at most 200 rows; each `load-older` returns the page ending at the first held index, also starting at a user row; repeated loads reach index 0 and the bar disappears |
| A single turn longer than 200 rows (no user row within reach) | The window is the plain last 100 rows; the page before it is the previous 100; no row is skipped or sent twice |
| `before` is 0, negative, or beyond the transcript length | It is clamped to 0..length; at 0 the reply has no rows and firstIndex 0, and the webview hides the bar |
| A live row arrives while the reader is scrolled up (reading older rows) during a streaming turn | The row is appended but the view does not move, and nothing is trimmed, however many rows are held |
| The reader scrolls back to the bottom with more than 300 rows held | The scroll listener runs the trim: the oldest rows are removed back to a user row, leaving about 200, and the bar shows the count of older rows |
| A live row arrives while the view is at the bottom and more than 300 rows are held | The view follows to the bottom, then the oldest rows are trimmed as above; the view stays at the bottom |
| An older page is prepended while the reader is at the top | The page's rows appear above; the row the reader was looking at stays where it was on screen (scrollTop grows by the height added); the view is not moved to the bottom at any point |
| An older page ends with a tool command whose result is in the held window | Cannot arise when pages start at a user row; with a plain cut the result row already rendered on its own with its stored command, and the older page's pending tool row is discarded after the page renders, never attached to a later live result |
| A live-only card (approval, diff) sits in rows that are trimmed, then the page is reloaded | The card is not shown again; decided approvals appear as their outcome chips, as on any restore today. The current approval card is the newest node, so it is never in the trimmed range |
| The webview reloads (`ready`) while older pages were loaded | The view resets to the latest window at the bottom; the approval head is posted again after it (unchanged) |
| A follow-up turn that suppresses its user echo writes a user row that is never posted | The next posted row carries a higher `rowIndex`; stamps stay increasing and the gap is harmless |
| A permission or selection outcome is recorded when there is no session | The event is posted without `rowIndex`; its node takes the latest index seen |
| A followed turn's events arrive for a session that is not the one shown | The rows are still written to that session; nothing is posted (unchanged) |
| A stored session from before this change | Works unchanged: the store is not touched and absolute indexes come from the array positions |

**Invariants to preserve**

- A stored session keeps its shape: one whole record per session key, the transcript an array of the existing row types; nothing in the store is rewritten or converted [[c2]]
- `session-restored` still clears the terminal, resets the registry's keys, replays through `reg.appendKeyed(reg.toViewModel(row), key)`, carries the session's mode and ends at the bottom; it is still posted on open, adopt, `ready`, new-chat and open-chat [[c3]]
- The durable rows are unchanged: the same five writers write the same rows; status and approval-request are not persisted; only the order of write and post changes [[c4]]
- A turn followed for a session that is not shown is still written to that session [[c4]]
- A replayed row and its live echo still reconcile to one node: the user row's live key `r<absolute index>` equals its replay key [[c5]]
- A reader at the bottom still sees each new row scroll into view, as today [[c5]]
- The provider lock still settles from whether the session has any rows (now from `total`, not the posted array's length) [[c7]]
- The shell stays one nonce'd inline script with no innerHTML outside the guarded markdown path and no remote origin [[c7]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx; test files are *.test.ts under __tests__ beside the code (vscode-plugin/src/chat/__tests__)`

**Test levels**

- **unit** — The page-cutting rule, with no VS Code and no DOM
  - Subjects: `latestWindow: a transcript no longer than one page is returned whole with firstIndex 0`, `latestWindow: a long transcript returns its last page, moved back to the start of the turn when a user row is within one more page, and never more than two pages of rows`, `latestWindow and pageBefore: with no user row within reach the cut is the plain page; consecutive pages cover every row exactly once`, `pageBefore: before is clamped to 0..length; at 0 it returns no rows and firstIndex 0`, `walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated`
- **unit** — The webview pager on the shared fake DOM, driving the REAL registry through the same line() the shell uses (line() appends through the pager), so scroll behaviour is observed, not assumed
  - Subjects: `a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held`, `a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, the bar appears, and the view is still at the bottom`, `returning to the bottom with more than 300 rows held runs the trim from the scroll listener`, `pager prepend: an older page is rendered above the held rows in transcript order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view is never moved to the bottom while the page renders`, `pager prepend: a page for another session, or whose before is not the first held index, is discarded and adds no row`, `trimmed rows render again when their page comes back: the dropped keys are forgotten, so appendKeyed renders new nodes`, `pager reset: a restore sets the first held index and total, ends at the bottom, and shows the 'load earlier' bar only when the first held index is above 0, naming the count of older rows`, `pager load request: one load-older is sent for the first held index on a bar click or a scroll to the top; no second request is sent while one is loading; the flag clears on the matching page, on a restore and after 5 seconds`, `a row that throws while an older page renders falls back, and following is switched back on afterwards`, `registry forgetKeysBefore drops only the r<n> keys below the index; withIsolatedPending runs a render with an empty pending-tool list and restores the live list afterwards`
  - Fixtures: `__tests__/fake-dom.ts (bodyStub, insertBefore, removeChild), extended with scrollTop, scrollHeight and clientHeight; no second fake DOM`
- **unit** — The protocol inventories
  - Subjects: `WEBVIEW_TO_HOST_TYPES includes 'load-older' and HOST_TO_WEBVIEW_TYPES includes 'transcript-page', alongside every prior kind`
- **integration** — The panel host over the in-memory store and a fake channel
  - Subjects: `opening a 1,000-row session posts session-restored with at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0`, `ready, new-chat and open-chat post the same windowed session-restored`, `load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0`, `load-older for another session id, or with a malformed before or sessionId, posts nothing`, `live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none`, `write-then-post order: when each live row is posted, the transcript already holds it at that index`, `a turn followed for a session that is not shown still writes its rows and posts nothing`, `the shell embeds the pager: line() appends through it, session-restored replays with absolute keys through its reset, transcript-page goes to prepend, live rows are stamped and trimmed, and the provider lock settles from total`, `the stored session is unchanged by paging: after restores and page loads the saved transcript equals the original rows`
  - Fixtures: `a seeded in-memory store with a long transcript of whole turns (user row, assistant rows, markers)`, `the existing fakeChannel and scriptedAdapter`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `opening a 1,000-row session posts session-restored with at most 200 rows, firstIndex at a turn start, total 1,000 and the session's mode; a short session is posted whole with firstIndex 0`, `ready, new-chat and open-chat post the same windowed session-restored` |
| `ac2` | `load-older for the active session answers one transcript-page whose rows end just before `before`; repeated requests walk back to index 0`, `pager prepend: an older page is rendered above the held rows in transcript order, keyed r<absolute index>; scrollTop grows by exactly the height added and the view is never moved to the bottom while the page renders`, `walking pageBefore from the latest window down to 0 reproduces the whole transcript in order with no row skipped or repeated` |
| `ac3` | `a live row rendered by the registry while the view is scrolled up leaves scrollTop unchanged and trims nothing, even with more than 300 rows held`, `a live row rendered by the registry while the view is at the bottom moves the view to the bottom; with more than 300 rows held the oldest nodes are then removed back to a user row leaving about 200, the bar appears, and the view is still at the bottom`, `returning to the bottom with more than 300 rows held runs the trim from the scroll listener`, `live rows carry rowIndex from all five writers: assistant, marker and tool-result events, the user-row, a permission outcome and a selection outcome are each posted with the absolute index of the row already written; status and approval-request carry none` |
| `ac4` | `the stored session is unchanged by paging: after restores and page loads the saved transcript equals the original rows` |

## 7. Migration

**State before:** A session is one whole record in VS Code global state with its transcript inline (s1: 'How a session and its transcript are stored'). The host posts the whole transcript in `session-restored` from three sites and the webview replays every row, keyed by its position in the posted array (s1: 'Where the whole transcript is posted and replayed'). The five row writers post before or without an index (s1: 'The five places that write a transcript row and post it live, and their order'). Every appended row forces the view to the bottom and nothing removes rows (s1: 'How rows are appended and scrolled in the webview').

**State after:** The stored record is the same. `session-restored` carries the latest window with `firstIndex` and `total`; the webview asks for older pages with `load-older` and receives `transcript-page`; every live row is written first and posted with `rowIndex`; all appends to the terminal go through the pager, which follows only from the bottom, holds a bounded window keyed by absolute index, and trims its oldest rows while a session is active.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the page-cutting module and its constants; nothing uses it yet — ↩ rollbackable
2. Add the new protocol shapes: the optional fields on session-restored, turn-event and user-row, the load-older and transcript-page messages, and their entries in the two type inventories — ↩ rollbackable
3. Make every live row write-then-post with its row index at the five writers, and have the host answer load-older; the restore still sends the whole transcript, now with firstIndex 0 and total — ↩ rollbackable
4. Add the scroll metrics to the shared fake DOM, the registry's paging companions and the webview pager source, with their tests; the shell does not embed the pager yet — ↩ rollbackable
5. Embed the pager in the shell: route line() and the two other append sites through it, replay with absolute keys, handle transcript-page, stamp and trim live rows, show the bar, settle the provider lock from total — ↩ rollbackable
6. Switch the three restore sites to the latest window, and update the tests that pinned the whole-transcript replay — ↩ rollbackable

**Backward compat:** No stored data changes, so sessions written before and after are interchangeable and an older build of the plugin reads them unchanged. The host and its webview shell ship together in one extension build, so there is no mixed-version pair; even so the new message fields are optional and a webview that sees no `firstIndex` treats it as 0. One visible behaviour changes on purpose: a new row no longer pulls a reader who has scrolled up back to the bottom. Reverting the change restores the whole-transcript restore with no clean-up.

## 8. Alternatives considered

### 8.1 a1: Windowed view: the host sends pages, the webview holds a bounded window — **CHOSEN**

The stored session is unchanged; the host posts only the latest page on restore and older pages on request, and the webview trims its oldest rows as the active session grows.



### 8.2 a2: Paged storage plus windowed view

As a1, and the stored transcript is split into fixed-size pages under their own keys so saves write only the last page.



**Rejected because:** Gives everything a1 does and also cheaper saves, but that extra is not what was asked, and it puts existing history at risk through a storage conversion. It can follow as its own tracked change, built on a1's protocol.

### 8.3 a3: Send everything, render lazily in the webview

The host still posts the whole transcript; the webview keeps the rows as data and renders only a window of them.



**Rejected because:** Leaves part of the open cost in place and does not page the active session out of the webview, which the ask names explicitly.

## 9. References

- **[[c1]]** `analyze-bundle` `s1: vscode-plugin/src/chat module profile and import graph` — "A leaf consumer: in-degree 10 (9 from vscode-plugin/src/extension.ts, 1 from vscode-plugin/src/delivery/board-wiring.ts), out-degree 2."
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts` — "void memento.update(SESSION_PREFIX + session.id, session);"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript, mode: permissionMode });"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "else post({ type: 'turn-event', event: ev });"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;t.appendChild(d);t.scrollTop=t.scrollHeight;return d;}"
- **[[c6]]** `code` `vscode-plugin/src/chat/protocol.ts` — "export const WEBVIEW_TO_HOST_TYPES = ["
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — "assert.match(html, /reg\.appendKeyed\(reg\.toViewModel\(x\),'r'\+i\)/, 'restore replays keyed via the sc1 registry');"
- **[[c8]]** `code` `vscode-plugin/src/chat/__tests__/fake-dom.ts` — "insertBefore(c: BodyStub, ref: BodyStub | null): BodyStub;"
- **[[c9]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "function appendKeyed(vm,key){if(key==null)return renderRow(vm);if(KEYS[key])return KEYS[key];var n=renderRow(vm);if(n)KEYS[key]=n;return n;}"
- **[[c10]]** `stakeholder` `user request, 2026-10-12` — "Support pagination of chat history, it takes ages to open when chat history is long. - even active session should page out history"
- **[[c11]]** `prior-artifact` `first review of LLD-ddc4ede1dbf84626-S001 (block: 1 high, 4 medium)` — "Every row the registry renders goes through the shell's `line()`, which forces the view to the bottom on each append"

## 10. Open questions

- Should the stored session also be split into pages (alternative a2), so a save during a turn stops rewriting the whole transcript? This design leaves storage alone; if wanted, it would be a separate tracked change after this one.
- Are fixed sizes acceptable (a page of 100 rows, at most 200 on open, trim an active session above 300 held rows back to about 200), or should they be a setting?

## Resolved questions

- `qa610cc1d` — Should the stored session also be split into pages (alternative a2), so a save during a turn stops rewriting the whole transcript? This design leaves storage alone; if wanted, it would be a separate tracked change after this one.
  - **resolved**: Defer a2 but log it as a tracked follow-up now — User decision 2026-10-12: "log this as an issue". Filed as ISSUE-c96a97a204fac22b; storage stays out of this Story. _(2026-10-12T07:27:15.637Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1: vscode-plugin/src/chat module profile and import graph` — "A leaf consumer: in-degree 10 (9 from vscode-plugin/src/extension.ts, 1 from vscode-plugin/src/delivery/board-wiring.ts), out-degree 2."
- **[[c2]]** `code` `vscode-plugin/src/chat/session-store.ts` — "void memento.update(SESSION_PREFIX + session.id, session);"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "post({ type: 'session-restored', sessionId: session.id, transcript: session.transcript, mode: permissionMode });"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "else post({ type: 'turn-event', event: ev });"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "function line(s,cls){const d=document.createElement('div');if(cls)d.className=cls;d.textContent=s;t.appendChild(d);t.scrollTop=t.scrollHeight;return d;}"
- **[[c6]]** `code` `vscode-plugin/src/chat/protocol.ts` — "export const WEBVIEW_TO_HOST_TYPES = ["
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — "assert.match(html, /reg\.appendKeyed\(reg\.toViewModel\(x\),'r'\+i\)/, 'restore replays keyed via the sc1 registry');"
- **[[c8]]** `code` `vscode-plugin/src/chat/__tests__/fake-dom.ts` — "insertBefore(c: BodyStub, ref: BodyStub | null): BodyStub;"
- **[[c9]]** `code` `vscode-plugin/src/chat/render-registry.ts` — "function appendKeyed(vm,key){if(key==null)return renderRow(vm);if(KEYS[key])return KEYS[key];var n=renderRow(vm);if(n)KEYS[key]=n;return n;}"
- **[[c10]]** `stakeholder` `user request, 2026-10-12` — "Support pagination of chat history, it takes ages to open when chat history is long. - even active session should page out history"
- **[[c11]]** `prior-artifact` `first review of LLD-ddc4ede1dbf84626-S001 (block: 1 high, 4 medium)` — "Every row the registry renders goes through the shell's `line()`, which forces the view to the bottom on each append"
