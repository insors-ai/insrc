<!-- insrc:artifact LLD-348d4663a4bc17af-s1 -->

# LLD: E20261010348d4663:S001

## Summary

**Epic:** `defect-against-e2-6a131558-issue-b2687832`
**HLD base run:** `wf-1791609042904-5nyjto`
**HLD effective hash:** `dd7f5080a7f4...`

The delivery board becomes a set of screens instead of one page with panes added to it. The reader starts on All work, Epics, Standalone or Issues. They drill into one epic's board, then into a story or issue screen, and a breadcrumb and Back take them out again with their search, filter and scroll kept. Only five filters remain (the four views and a Needs attention toggle), and stages are stacked collapsible sections that work at any pane width. The host owns where the reader is, as a trail of screens, and sends one message per change that replaces the whole screen, so nothing from a previous context can stay visible.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `reduceBoardState`

```typescript
function reduceBoardState(state: BoardState, event: BoardEvent): BoardState; type BoardEvent = { type: 'refresh-requested'; seq: number } | { type: 'snapshot-arrived'; seq: number; result: DeliveryResult<DeliverySnapshot>; at: string } | { type: 'navigate'; intent: NavIntent } | { type: 'set-density'; density: Density }
```

**Parameters:**
- `state: BoardState` — Current state, now carrying selection.trail and entrySeq.
- `event: BoardEvent` — A refresh request or answer, a navigation intent, or a density change. 'navigate' replaces 'selection-changed'.

**Returns:** `BoardState` — The next state. Pure; an intent that does not apply to the current screen returns the same state object.

**Preconditions:**
- Ids inside a 'navigate' intent were already checked against the shown snapshot by the host (open-epic names an epic, open-item names a placeable story or issue).
- state.selection.trail is non-empty and trail[0].screen.kind === 'list'.

**Postconditions:**
- set-view v: trail becomes exactly one fresh entry {screen:{kind:'list',view:v}, search:'', needsAttentionOnly: <current entry's flag>, paging:{}}; a no-op when the trail already is that single root.
- open-epic id: pushes {screen:{kind:'epic',epicItemId:id}, search:'', needsAttentionOnly: <current flag>, paging:{}} and records openedId=id on the entry it left.
- open-item id: pushes {screen:{kind:'item',itemId:id,tab:'overview'}} and records openedId=id on the entry it left; a no-op when the current screen is already that item.
- set-item-tab t: changes only the current item entry's tab (same entry id); ignored elsewhere.
- back: pops one entry when trail.length > 1; go-to-crumb i (0 <= i < length-1): truncates the trail to i+1 entries. The restored entry keeps its own search, attention flag, paging and openedId, and state.restored is set true.
- set-search / set-attention / clear-filters / show-more change only the current entry and only on a list or epic screen; search, attention and clear-filters reset that entry's paging.
- Every pushed or reset entry gets id = ++entrySeq, so an id is never reused within a panel; the trail is capped at 20 entries by dropping trail[1] (the root is kept).
- snapshot-arrived ok: the trail is truncated before the first entry whose epic or item is no longer in the snapshot; when that changes the current screen, selectionNotice is set to 'What you were viewing is no longer on the board.'

### 2.2 `boardDownMessages`

```typescript
function boardDownMessages(state: BoardState, labels: DisplayLabels, now: string, detailsOf: (itemId: string) => ItemDetailsViewModel | null): readonly Envelope<BoardDownMessage>[]
```

**Parameters:**
- `state: BoardState` — Kept state.
- `labels: DisplayLabels` — Display labels (now including view, tab and stage-section texts).
- `now: string` — Host clock for the freshness line.
- `detailsOf: (itemId: string) => ItemDetailsViewModel | null` — The details memory's model for the item screen (plan and opened record included). Replaces the host's separate details message; paging moves into the trail entry.

**Returns:** `readonly Envelope<BoardDownMessage>[]` — The status message first; then, when a snapshot is shown and the status is not 'empty', exactly one {type:'screen', model: ScreenModel} for the current trail entry. Nothing else.

**Errors:**
- `Error (thrown)` when A builder throws on a malformed snapshot; the host's apply() then keeps the previous state and posts nothing, as today.

**Preconditions:**
- The current item screen's item is in the shown snapshot (guaranteed by the reducer's truncation).

**Postconditions:**
- Only the current screen is built (the 150 ms filter target holds).
- The same state, labels, now and details give an equal message list.

### 2.3 `parseBoardUpMessage`

```typescript
function parseBoardUpMessage(raw: unknown): BoardUpMessage | null
```

**Parameters:**
- `raw: unknown` — A message from the webview.

**Returns:** `BoardUpMessage | null` — The typed intent for a v1 envelope carrying a known, well-typed message; null otherwise. Accepts ready, refresh, set-view {view: 'all'|'epics'|'standalone'|'issues'}, open-epic {epicItemId}, open-item {itemId}, set-item-tab {tab: 'overview'|'evidence'|'linked'}, back (bare), go-to-crumb {index: non-negative integer}, set-search, set-attention, clear-filters (bare), open-evidence, set-density, show-more. set-scope, select-item and close-details are no longer accepted.

**Postconditions:**
- Ids only; no path or free-form target is ever accepted.
- set-view with the old 'board' value returns null.

### 2.4 `statusView`

```typescript
function statusView(status: LoadStatus, now: string): StatusView
```

**Parameters:**
- `status: LoadStatus` — Load status.
- `now: string` — Host clock.

**Returns:** `StatusView` — As today, with StatePanelView.placement: 'body' for empty, and for unavailable or refresh-failed with no snapshot shown (the panel replaces the screen); 'banner' for refresh-failed or unavailable over a stale snapshot and for partial (the screen stays usable under it).

**Postconditions:**
- Messages and announcement texts are unchanged.

### 2.5 `selectMatches`

```typescript
function selectMatches(snapshot: DeliverySnapshot, filter: MatchFilter, labels: DisplayLabels, byId?: ItemIndex): readonly MatchedCard[]; interface MatchFilter { readonly scope: BoardScope; readonly search: string; readonly needsAttentionOnly: boolean }
```

**Parameters:**
- `filter: MatchFilter` — Scope derived from the screen (all, standalone, or epic), plus the entry's search and attention flag. Replaces the BoardSelection parameter.

**Returns:** `readonly MatchedCard[]` — Unchanged matching rule and order, except that an epic scope now excludes items flagged standalone (the rule buildEpicRollup already applied).

**Postconditions:**
- The same rule feeds the stage screens, the epic header, the epics rows and the issues list, so their counts agree.
- Epic membership rule: an item belongs to epic X exactly when it is not flagged standalone and epicOf(item) is X. inScope's epic case excludes item.standalone, so a standalone issue that corrects one of X's stories is on Standalone and Issues, never on X's board or in X's Epics row.

### 2.6 `buildBoardViewModel`

```typescript
function buildBoardViewModel(snapshot: DeliverySnapshot, filter: MatchFilter, paging: BoardPaging, labels: DisplayLabels): StagesBody
```

**Parameters:**
- `filter: MatchFilter` — The screen's scope, search and attention flag.
- `paging: BoardPaging` — The current trail entry's paging.

**Returns:** `StagesBody` — Six StageSectionView in STAGE_ORDER with default open state and hints, the totals label, the empty-stage fold and the no-matches panel. scopeOptions is removed.

**Postconditions:**
- A non-empty stage starts open, except Complete, which starts closed unless Needs attention is on; an empty stage starts closed with emptyText 'nothing at this stage'.
- A closed non-empty section carries hint = attentionLabel(attentionCount) when attentionCount > 0.
- fold.always is true exactly when Needs attention is on; fold.text names the empty stages.

### 2.7 `buildEpicRollup`

```typescript
function buildEpicRollup(snapshot: DeliverySnapshot, filter: { readonly search: string; readonly needsAttentionOnly: boolean }, labels: DisplayLabels): EpicsBody
```

**Parameters:**
- `filter: { search: string; needsAttentionOnly: boolean }` — Search over epic titles and ids; attention keeps epics with attentionCount > 0.

**Returns:** `EpicsBody` — One EpicRollupRowView per listed epic in snapshot order, each counted over that epic's whole scope (no search or attention applied to the counts), the totals label and the no-matches panel. The 'Not in an epic' row is removed; the body links to Standalone instead.

**Postconditions:**
- An epic row's numbers equal the epic screen's header for the same snapshot: both count selectMatches with scope {kind:'epic', epicItemId} and no search or attention, under the epic membership rule (standalone items count towards no epic).

### 2.8 `buildIssueView`

```typescript
function buildIssueView(snapshot: DeliverySnapshot, filter: MatchFilter, labels: DisplayLabels): IssuesBody
```

**Parameters:**
- `filter: MatchFilter` — Scope all, plus the Issues entry's search and attention flag.

**Returns:** `IssuesBody` — IssueEntryView rows (unchanged shape) in stage order then snapshot order, the totals label and the no-matches or no-issues panel.

**Postconditions:**
- scopeOptions and selectedItemId are removed from the model.

### 2.9 `buildItemDetails`

```typescript
function buildItemDetails(snapshot: DeliverySnapshot, itemId: string, plan: PlanRead, opened: OpenedRecord | null, labels: DisplayLabels, byId?: ItemIndex): ItemDetailsViewModel | null
```

**Parameters:**
- `itemId: string` — The item screen's item.

**Returns:** `ItemDetailsViewModel | null` — As today, plus correctedBy: LinkView[] (issues whose correctsRef resolves to this item, in snapshot order) and EvidenceRowView.approvedAt (approval.at as 'YYYY-MM-DD HH:MM UTC', or null).

**Postconditions:**
- No value is inferred; absent read-model fields (purpose, size, dependencies, revision time) stay absent.

### 2.10 `createDeliveryBoardHost`

```typescript
function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost
```

**Parameters:**
- `deps: DeliveryBoardHostDeps` — Unchanged dependencies.

**Returns:** `DeliveryBoardHost` — Same open()/dispose(). handle() maps each up-message to a 'navigate' or 'set-density' event after validating ids (open-epic: an epic in the shown snapshot; open-item: a placeable story or issue, and an epic id is routed to open-epic), tells the details memory the current item screen's id (or null) on every kept state, and announces each screen change once.

**Postconditions:**
- The host-level paging variable is removed; paging lives in each trail entry.
- No 'details' message is posted; the item screen arrives inside the screen message.
- Announcements: 'Opened: <title> · <stage>' for an item, 'Epic: <title>' for an epic, 'Showing <view label>' for set-view, 'Back to <crumb label>' for back and go-to-crumb, and the existing 'Board refreshed: …'.

### 2.11 `renderBoardDocument`

```typescript
function renderBoardDocument(nonce: string): string
```

**Parameters:**
- `nonce: string` — Script nonce.

**Returns:** `string` — The same CSP. Shell: app bar (<nav id='crumbs' aria-label='Breadcrumb'>, #status, Read-only, Refresh, density group), #announce (the only aria-live region), #banner, and <main id='main'>. The tabs, toolbar, #scope-chips, #totals, .layout, #details aside and #board are removed.

**Postconditions:**
- Exactly one aria-live region; one nonce'd script.

### 2.12 `BOARD_WEBVIEW_SCRIPT`

```typescript
const BOARD_WEBVIEW_SCRIPT: string
```

**Returns:** `string` — Renders each screen message by clearing #main and building: the back button, the filter bar (the four-view group with aria-pressed only when model.filters.views, the Needs attention toggle with aria-pressed and × when on, the search box), the totals line (with Show all under attention), then the body: stage sections as <details> (open state = the reader's toggle remembered per entry id and stage, else defaultOpen), card grids, epics rows (the whole row is one button posting open-epic), the issues list (rows post open-item), the story screen (tab buttons role=tab posting set-item-tab; overview with chips, conflict first, tasks and why+chain; evidence table; linked work) or the issue screen ('Open what it corrects →', fix stories, why, chain, records). Breadcrumb crumbs are buttons posting go-to-crumb, the last has aria-current='page'. Narrow (documentElement.clientWidth <= 480, re-rendered when the width crosses it): the breadcrumb shows only the back step and current place, empty stages fold into one 'Other stages · 0 matching' section, and sub-tab labels use their short form. Text via textContent only; posts only BoardUpMessage envelopes.

**Postconditions:**
- A new screen focuses its heading (h1, tabindex -1) and scrolls to the top; a restored screen restores the scroll saved for its entry id and focuses the card or row whose id is model.focusItemId (else the heading).
- Escape on an epic or item screen posts back.
- Cards stay focusable with Enter/Space opening them and Up/Down moving between cards on the screen.

### 2.13 `BOARD_STYLE`

```typescript
const BOARD_STYLE: string
```

**Returns:** `string` — body{min-width:320px}; #main{container-type:inline-size}; card grid repeat(auto-fill,minmax(min(240px,100%),1fr)); epic rows with a 220px minimum title column; the story overview as two columns minmax(340px,1.4fr) minmax(280px,1fr) that stack under @container (max-width:760px) with why+chain first (order); the records table min-width:620px inside .table-wrap{overflow-x:auto}; stage <details> sections with summary label, count and hint. Six-column grid, side column and 600px media block removed.

**Postconditions:**
- Only var(--vscode-*) colours; still no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow. A closed stage section is a native <details> the reader opens; its summary always shows the label, count and attention hint.

## 3. Data model changes

### 3.1 `BoardScreen (board-protocol.ts)` — new

Where the reader is: { kind:'list'; view: ListView } | { kind:'epic'; epicItemId: string } | { kind:'item'; itemId: string; tab: ItemTab }. ListView = 'all'|'epics'|'standalone'|'issues'; ItemTab = 'overview'|'evidence'|'linked'. The tab applies to stories; an issue screen ignores it.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `TrailEntry (board-state.ts)` — new

{ id: number; screen: BoardScreen; search: string; needsAttentionOnly: boolean; paging: BoardPaging; openedId: string | null }. openedId is the epic or item the reader opened from this entry, so Back can return focus to it.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`

### 3.3 `BoardSelection (board-state.ts)` — field-modify

Becomes { trail: readonly TrailEntry[]; density: Density }. view, scope, search, needsAttentionOnly and selectedItemId are removed. INITIAL_SELECTION is one root entry {id:1, screen:{kind:'list',view:'all'}, search:'', needsAttentionOnly:false, paging:{}, openedId:null}. Helper currentEntry(selection) returns the last entry.

```
- view, scope, search, needsAttentionOnly, selectedItemId
+ trail: readonly TrailEntry[]
```

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-views.ts`

### 3.4 `BoardState (board-state.ts)` — field-add

Adds entrySeq: number (the last entry id handed out) and restored: boolean (the last navigation was back or go-to-crumb). selectionNotice is kept with the new text.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.5 `NavIntent (board-state.ts)` — new

{type:'set-view';view} | {type:'open-epic';epicItemId} | {type:'open-item';itemId} | {type:'set-item-tab';tab} | {type:'back'} | {type:'go-to-crumb';index} | {type:'set-search';search} | {type:'set-attention';on} | {type:'clear-filters'} | {type:'show-more';stage}.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.6 `ScreenModel (board-protocol.ts)` — new

{ entryId: number; restored: boolean; focusItemId: string | null; title: string; crumbs: readonly { label: string; index: number }[]; back: { label: string } | null; filters: { views: boolean; view: ListView | null; search: string; searchPlaceholder: string; needsAttentionOnly: boolean } | null; body: ScreenBody }. Crumbs: 'Delivery', then the view label for a non-'all' root ('Epics', 'Standalone', 'Issues'), 'Needs attention' when the root's toggle is on, then the epic title for an epic entry and the item's short id ('S001' for a story, the 8-hex hash for an issue) for an item entry; each crumb's index is its trail entry. back.label: '← Back to epic' when the previous entry is an epic, '← <view label>' when it is a list (All work, Epics, Standalone, Issues), '← Back to <short id>' when it is an item. filters is null on item screens; views is true only on a root list screen.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.7 `ScreenBody (board-protocol.ts)` — new

StagesBody {kind:'stages'; epic: EpicRollupRowView | null; totalsLabel: string; showAll: boolean; sections: readonly StageSectionView[]; fold: { always: boolean; text: string }; emptyPanel: StatePanelView | null} | EpicsBody {kind:'epics'; totalsLabel; rows: readonly EpicRollupRowView[]; emptyPanel} | IssuesBody {kind:'issues'; totalsLabel; issues: readonly IssueEntryView[]; emptyPanel} | StoryBody {kind:'story'; tab: ItemTab; details: ItemDetailsViewModel; epic: EpicRollupRowView | null} | IssueBody {kind:'issue'; details: ItemDetailsViewModel; entry: IssueEntryView}. totalsLabel: '12 items · 3 need attention', or '3 of 12 items need attention' with showAll when the toggle is on; '31 epics · completion counts stories at Complete'; '13 issues · 2 need attention'.

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.8 `StageSectionView (board-protocol.ts)` — new

Replaces ColumnView: { stage; label; total; cards; hiddenCount; attentionCount: number; defaultOpen: boolean; emptyText: string | null; hint: string | null }.

```
- ColumnView
+ StageSectionView (ColumnView fields + attentionCount, defaultOpen, emptyText, hint)
```

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`

### 3.9 `BoardDownMessage / BoardUpMessage (board-protocol.ts)` — field-modify

Down: status | screen | announce (items, board, epics, issues and details removed). Up: ready, refresh, set-view, open-epic, open-item, set-item-tab, back, go-to-crumb, set-search, set-attention, clear-filters, open-evidence, set-density, show-more (set-scope, select-item and close-details removed). BoardView is replaced by ListView; BoardScope stays as an internal match scope.

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.10 `StatePanelView (board-protocol.ts)` — field-add

placement: 'body' | 'banner' (see statusView); the views' no-matches and no-issues panels are 'body'.

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-model.ts`

### 3.11 `ItemDetailsViewModel / EvidenceRowView (board-protocol.ts)` — field-add

ItemDetailsViewModel.correctedBy: readonly LinkView[]; EvidenceRowView.approvedAt: string | null.

**Call sites:**
- `vscode-plugin/src/delivery/board-details.ts`

### 3.12 `DisplayLabels (labels.ts)` — field-add

views: Record<ListView, string> ('All work','Epics','Standalone','Issues'); itemTabs: Record<ItemTab, { long: string; short: string }> ('Overview & tasks'/'Overview', 'Workflow evidence'/'Evidence', 'Linked work'/'Linked'); needsAttention: 'Needs attention'; nothingAtStage: 'nothing at this stage'; otherStages: 'Other stages · 0 matching'.

**Call sites:**
- `vscode-plugin/src/delivery/labels.ts`

### 3.13 `BoardViewModel / EpicRollupViewModel / IssueViewModel / ColumnView / NOT_IN_EPIC_TITLE` — field-remove

Replaced by the ScreenBody variants; scopeOptions, selectedItemId, emptySelection and the 'Not in an epic' row go with them.

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-host.ts`

## 4. Error paths

**Error cases**

- **The webview posts open-epic or open-item naming an id that is not in the shown snapshot (stale webview, crafted message, or a refresh removed it).** (recoverable)
  - Detection: handle() looks the id up in shownSnapshot(state.status): open-epic needs an item of kind 'epic'; open-item needs a placeable story or issue (an epic id is routed to open-epic; any other kind or a missing id fails).
  - Response: The message is dropped with log.warn('delivery board: ignored a link to an item that is not on the board'); no state change, nothing posted.
  - User impact: The click does nothing; the current screen stays.
- **A refresh removes the epic or item of an entry in the trail.** (recoverable)
  - Detection: applySnapshot walks the trail and finds the first entry whose screen names an epic or item id not in the new snapshot's items.
  - Response: The trail is truncated before that entry (the root always survives); when the current screen changed, selectionNotice is set and the host announces it once.
  - User impact: The reader lands on the nearest screen still valid, with an announcement saying what they were viewing is gone; nothing stale stays visible.
- **Building the screen model throws (a malformed snapshot that slipped past the client checks, or a details builder failure).** (recoverable)
  - Detection: apply() derives boardDownMessages before assigning state; the throw propagates to its caller.
  - Response: State, trail and the details memory's kept item are left as they were; nothing is posted; the message handler logs '<type> could not be shown'. For a refresh, the existing fallback dispatches a read-failed answer over the previous board.
  - User impact: The previous screen stays; a failed refresh shows the banner over it.
- **go-to-crumb names an index outside the trail, or back is posted on a root screen.** (recoverable)
  - Detection: parseBoardUpMessage rejects a negative, non-integer or non-number index; the reducer checks 0 <= index < trail.length - 1 and trail.length > 1 for back.
  - Response: Malformed message: log.warn('ignored a malformed webview message'). In-range checks failing: the reducer returns the same state, and the host posts nothing.
  - User impact: None; the screen stays.
- **A filter intent (set-search, set-attention, clear-filters, show-more) arrives while an item screen is current (a race with navigation).** (recoverable)
  - Detection: The reducer checks currentEntry(selection).screen.kind is 'list' or 'epic'.
  - Response: The intent is ignored and the same state is returned; nothing is posted.
  - User impact: None; the item screen has no filters.
- **The story's PLAN read or an evidence read fails while the item screen is shown.** (recoverable)
  - Detection: The details memory resolves the read to state 'failed' (unchanged behaviour) and calls rerender.
  - Response: The screen is re-derived with planNotice set (or the evidence failure logged as today); the rest of the item screen renders.
  - User impact: The overview shows 'The plan could not be read: …' in place of dependencies and checks.
- **The webview's saved state (density) is corrupt or getState throws.** (recoverable)
  - Detection: savedState() wraps vs.getState in try/catch and checks the object shape (unchanged).
  - Response: Falls back to comfortable density; scroll and accordion memory are in-memory only and start empty.
  - User impact: Default density; nothing else changes.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| set-view to the view already shown as the single root entry. | No-op: the same state; no screen message, no announcement. |
| set-view while three entries deep (Epics › epic › story). | The trail resets to one root for the chosen view, keeping only the attention flag; the story screen is gone and the details memory is told null. |
| open-item from a story's Linked work for an issue, then from that issue 'Open what it corrects' back to the same story. | Two pushes (story, issue, story); the breadcrumb shows each step; Back returns one step at a time. Opening the item that is already the current screen is a no-op. |
| More than 20 navigations by following links. | The trail keeps the root and the newest 19 entries (trail[1] is dropped each time); entry ids keep increasing and are never reused. |
| Back to an epic board after the reader had opened its Complete section and paged Design & plan. | The entry's search, attention flag and paging come back; the webview reopens the sections the reader toggled for that entry id, restores the saved scroll, and focuses the story card the reader opened. |
| Needs attention on, with matches in only three stages. | Totals read 'N of M items need attention' with Show all; Complete opens if it has matches; the three empty stages fold into one line naming them. |
| A narrow pane (<= 480 px) on the epic board, then widened past 480 px. | Narrow: short breadcrumb, empty stages in one 'Other stages · 0 matching' section, short tab labels. Crossing the threshold re-renders the same screen model in the wide form without a host round trip. |
| Epics screen with a search that matches no epic title or id. | The rows area shows the no-matches panel with Clear filters; the standalone link stays. |
| An issue whose parent cannot be resolved. | The issue screen shows the parent notice in place of 'Open what it corrects'; the issue still lists on Issues with its Unresolved parent pill. |
| A story with no parent epic (standalone) opened from Standalone. | Breadcrumb 'Delivery / Standalone / S001', back '← Standalone'; the Linked work tab has no Epic section. |
| Status 'empty' (workspace read, no records). | No screen message; the empty panel replaces #main; the breadcrumb is just 'Delivery'. |
| Refresh fails while on a story screen. | The story screen stays; the refresh-failed banner (Stale, Retry) sits above it. |
| A standalone issue whose correctsRef resolves to a story of epic X. | It is listed on Standalone and on Issues; it is not a card on X's board and does not count in X's Epics row or header, so the row and the header agree. |

**Invariants to preserve**

- Only the newest refresh answer is applied; a failed refresh keeps the last snapshot shown as stale. [[c1]]
- Up-messages carry ids only and every inbound message passes parseBoardUpMessage; clear-filters is accepted only bare. [[c2]]
- apply() derives every message before keeping state, tells the details memory before assigning, and a derive that throws leaves state as it was and posts nothing. [[c3]]
- The webview sets all text through textContent, posts only board up-messages, keeps density in vs.getState mirrored to the host, and #announce is the only live region. [[c4]]
- The stylesheet uses only --vscode-* colours and no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow; density changes spacing and font size only. [[c5]]
- Every view counts the same matches through selectMatches (scope via epicOf, search over title, id, sourceIds and epic title, attention from the daemon), and nothing the daemon decided is derived. [[c6]]
- The item details show only published fields: the chain per route with Not recorded rows, PLAN-joined task rows, the conflict sentence, evidence opening in the review pane or read-only; the PLAN is read once per snapshot. [[c7]]
- The 500-item, 1,000-record board renders within 1 s and each filter change within 150 ms (best of three). [[c9]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test 'src/**/__tests__/*.test.ts' in vscode-plugin), node:assert/strict; webview behaviour through the fake-DOM harness board-webview-harness.ts booting the real BOARD_WEBVIEW_SCRIPT`

**Test levels**

- **unit** — Pure navigation rules: the trail reducer, breadcrumb and back labels, screen model selection, status panel placement.
  - Subjects: `board-state.ts reduceBoardState navigate intents (set-view reset, open-epic/open-item push with openedId, set-item-tab, back, go-to-crumb, filter intents ignored on item screens, cap at 20, ids never reused)`, `board-state.ts applySnapshot trail truncation and selectionNotice`, `board-state.ts boardDownMessages: status then exactly one screen; crumbs, back label, filters, restored, focusItemId`, `board-state.ts statusView placement body/banner`
  - Fixtures: `board-fixtures.ts snapshot with two epics, stories in several stages, a standalone story, issues (one with an unresolved parent, one correcting a story)`
- **unit** — Screen bodies built from the snapshot.
  - Subjects: `board-model.ts buildBoardViewModel StageSectionView defaultOpen / emptyText / hint / fold / totalsLabel / showAll`, `board-views.ts buildEpicRollup rows filtered by epic title or id and attention, counts unfiltered and equal to the epic header`, `board-views.ts buildIssueView rows and panels`, `board-details.ts correctedBy and approvedAt`, `labels.ts new labels`, `board-protocol.ts parseBoardUpMessage new and removed messages`
- **integration** — Host plus real webview script in the fake DOM: what the reader sees and can do on each screen, and that nothing from a previous context remains.
  - Subjects: `board-host.test.ts screen rendering per body kind, breadcrumb and Back, Escape, focus and scroll restore, five filters only, accordions, narrow form, state panel placement, CSP/textContent/live region/style invariants, announcements`, `board-wiring.test.ts command registration unchanged`, `details-memory.test.ts kept() follows the current item screen`
  - Fixtures: `board-webview-harness.ts gains documentElement.clientWidth, window.scrollY/scrollTo and a resize event, and a 'details' tag with an open attribute and toggle listener`
- **smoke** — Performance targets on the new screens.
  - Subjects: `board-perf.test.ts 500 items / 1,000 records: first render of All work within 1 s, each filter change and an open-epic within 150 ms, best of three`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-state.test.ts: 'every screen message carries a breadcrumb that follows the trail and a back label naming where Back goes'`, `board-host.test.ts: 'opening a story replaces the screen: #main holds only the story screen, with its breadcrumb and Back, and no card from the list it came from'` |
| `ac2` | `board-host.test.ts: 'the filter bar has exactly the four views and Needs attention, and no epic is a chip'`, `board-host.test.ts: 'an Epics row opens that epic's board with its header, breadcrumb and ← Epics, and no view control'`, `board-views.test.ts: 'a standalone issue correcting a story of an epic counts towards no epic, and the epic's Epics row equals its board header'` |
| `ac3` | `board-model.test.ts: 'stage sections start open when they hold matches, closed when empty, and Complete closed with its attention hint unless Needs attention is on'`, `board-host.test.ts: 'stages render as six <details> sections in workflow order, and a toggled section stays as the reader left it across a refresh'` |
| `ac4` | `board-state.test.ts: 'set-view from a story screen resets the trail to one root and keeps only the attention flag'`, `board-state.test.ts: 'back and go-to-crumb restore the earlier entry with its own search, attention and paging'`, `board-host.test.ts: 'Back restores the saved scroll and focuses the card that opened the story; Escape goes back'`, `details-memory.test.ts: 'the memory is told null once the item screen is left'` |
| `ac5` | `board-state.test.ts: 'statusView places empty and snapshot-less failures in the body and stale failures and partial evidence in the banner'`, `board-host.test.ts: 'empty replaces the screen, no matches replaces the list area with Clear filters, and a failed refresh over a story keeps the story under the banner'` |
| `ac6` | `board-host.test.ts: 'BOARD_STYLE keeps a 320px minimum, card and column minimums, the records table scroll wrapper and only var(--vscode-*) colours, with no hiding rule'`, `board-host.test.ts: 'a narrow pane shortens the breadcrumb and tab labels and folds empty stages into Other stages · 0 matching, and widening re-renders the wide form'` |
| `ac7` | `board-host.test.ts: 'CSP string unchanged, exactly one aria-live region, and the script uses textContent only and posts only BoardUpMessage envelopes'`, `board-protocol.test.ts: 'every new up-message parses, the removed ones and malformed crumbs give null'`, `board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three'` |

## 6. Migration

**State before:** One composite page (s1 bundles c1-c5): BoardSelection holds view/scope/search/attention/selectedItemId; the host keeps selectedItemId across every selection change and posts the chosen view's model plus a separate details message; the webview renders tabs, one scope chip per epic, a details aside beside or above a six-column board.

**State after:** Screens with a host-owned trail: BoardSelection {trail, density}; the host posts status plus one screen message that replaces #main; four views and a Needs attention toggle; epic and item screens reached by drill-down with breadcrumb and Back; stages as collapsible sections; min widths and container queries.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the new protocol types (BoardScreen, ListView, ItemTab, ScreenModel, ScreenBody, StageSectionView, placement, correctedBy, approvedAt) and the new labels alongside the old ones; parser accepts the new up-messages. — ↩ rollbackable
2. Rebuild the view builders on MatchFilter and return the new bodies; add correctedBy and approvedAt to the details builder. — ↩ rollbackable
3. Replace BoardSelection with the trail and the reducer's navigate intents; boardDownMessages emits status plus one screen; statusView sets placement. — ↩ rollbackable
4. Rewire the host handler to the new intents and the details memory to the current item screen; drop the details message and host paging. — ↩ rollbackable
5. Replace the document shell, webview script and stylesheet with the screen renderer; extend the fake-DOM harness. — ↩ rollbackable
6. Remove the old message variants, view models, scope chips and 'Not in an epic' row; rewrite the tests; run the full plugin suite, typecheck, perf test and a headless-Chrome look at each screen; package and install the extension. — ↩ rollbackable

**Backward compat:** The webview protocol is private to one extension build: the host and the webview script ship in the same file, so old and new never talk to each other; a reloaded webview always gets the new script. No persisted state changes except the webview's saved density, which keeps its shape. The daemon read model, delivery client and the insrc.delivery.openBoard command are unchanged.

## 7. Alternatives considered

### 7.1 a1: Host-owned navigation trail, one screen message — **CHOSEN**

BoardSelection becomes a trail of screen entries owned by the host; every derive posts one 'screen' down-message that replaces the whole body.

Replace view/scope/selectedItemId in BoardSelection with a navigation trail: an array of entries {screen, search, needsAttentionOnly}, where screen is {kind:'list', view:'all'|'epics'|'standalone'|'issues'} | {kind:'epic', epicItemId} | {kind:'item', itemId, tab}. The last entry is the current screen; the root is always a list screen. New up-messages (set-view, open-epic, open-item, set-item-tab, back, go-to-crumb) replace set-scope/select-item/close-details; set-view resets the trail to one root (so any context change leaves an item screen). boardDownMessages posts status, then exactly one {type:'screen', model: ScreenModel} carrying the breadcrumb, back target, filter bar flags and a body discriminated by kind (stages | epics | issues | story | issue). The existing match pipeline and builders are reused with a scope derived from the screen. The webview clears its main region on every screen message, so nothing from a previous context can stay on screen; it keeps only presentation memory (accordion open state and scroll per trail entry, the narrow flag).

### 7.2 a2: Webview-side router over unchanged host models

Keep the host protocol and models; the webview script keeps its own screen stack and shows/hides board, epics, issues and details regions.

Leave BoardSelection and the down-messages as they are. The webview keeps a client-side stack of screens and a breadcrumb, decides which region to render, and posts the existing set-view/set-scope/select-item/close-details messages as side effects of navigation. Back pops the stack and re-posts the previous selection. Stages become <details> in renderBoard; scope chips are removed from renderScope.

**Rejected because:** Cheapest, but leaves the root cause (host selection outliving the context) in place and splits the source of truth.

### 7.3 a3: Separate down-messages per screen kind with host stack

Host keeps a screen stack, but posts distinct board/epics/issues/story/issue/crumbs messages that the webview composes.

Add a history stack to the host state as in a1, but keep separate down-messages for each body (board, epics, issues, details) plus a new 'crumbs' message for the breadcrumb and back target. The webview shows the body named by the last body message and clears the others.

**Rejected because:** Host owns navigation, but composing several messages per screen keeps a window for mismatched crumb and body that a1 closes.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/delivery/board-state.ts` — "BoardSelection, reduceBoardState, boardDownMessages, statusView"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "BoardDownMessage, BoardUpMessage, parseBoardUpMessage"
- **[[c3]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "createDeliveryBoardHost handle() and apply()"
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "BOARD_WEBVIEW_SCRIPT, renderBoardDocument"
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "BOARD_STYLE"
- **[[c6]]** `code` `vscode-plugin/src/delivery/board-model.ts` — "selectMatches, buildBoardViewModel; board-views.ts buildEpicRollup, buildIssueView"
- **[[c7]]** `code` `vscode-plugin/src/delivery/board-details.ts` — "buildItemDetails; details-memory.ts createDetailsMemory"
- **[[c8]]** `code` `vscode-plugin/src/delivery/labels.ts` — "DISPLAY_LABELS, STAGE_ORDER"
- **[[c9]]** `code` `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — "500-item, 1,000-record board within one second, each filter change within 150 ms"
- **[[c10]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "screens 1-14"
- **[[c11]]** `prior-artifact` `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/ISSUE.md` — "Present the delivery board as the PRD's screens"
- **[[c12]]** `step-output` `s1..s8 of this run`

## 9. Open questions

- dm2 (partial): the BoardSelection field-modify relies on s5's invariants (c1, c3, c7) for the selection and details-memory behaviour it changes, rather than citing them on the data-model entry itself.
- The Issues view is a list sorted by stage, not a stage-grouped issue board (mocks screen 5 'open choice'); the PRD's 'defect cards using the same evidence-based stages' is read as satisfied by stage pills and stage ordering.
- Closing a stage section hides its cards inside a native <details>, which relaxes E2 S005's no-hidden-content rule for collapsed sections only, as the reader requested accordions; summaries always carry the label, count and attention hint.

## Resolved questions

- `q2134e31a` — dm2 (partial): the BoardSelection field-modify relies on s5's invariants (c1, c3, c7) for the selection and details-memory behaviour it changes, rather than citing them on the data-model entry itself.
  - **resolved**: Accept as-is with a reviewer note — The invariants live in the LLD's own error-paths section (c1, c3, c7) and the build tests them; there is no separate s5 story to depend on. The approved LLD stands. _(2026-10-10T05:32:35.501Z)_
- `q1099e950` — The Issues view is a list sorted by stage, not a stage-grouped issue board (mocks screen 5 'open choice'); the PRD's 'defect cards using the same evidence-based stages' is read as satisfied by stage pills and stage ordering.
  - **resolved**: Keep stage-sorted list (accept LLD reading) — The user approved the LLD with this choice stated explicitly, and it matches mocks screen 5. _(2026-10-10T05:33:00.025Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/delivery/board-state.ts` — "BoardSelection, reduceBoardState, boardDownMessages, statusView"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "BoardDownMessage, BoardUpMessage, parseBoardUpMessage"
- **[[c3]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "createDeliveryBoardHost handle() and apply()"
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "BOARD_WEBVIEW_SCRIPT, renderBoardDocument"
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "BOARD_STYLE"
- **[[c6]]** `code` `vscode-plugin/src/delivery/board-model.ts` — "selectMatches, buildBoardViewModel; board-views.ts buildEpicRollup, buildIssueView"
- **[[c7]]** `code` `vscode-plugin/src/delivery/board-details.ts` — "buildItemDetails; details-memory.ts createDetailsMemory"
- **[[c8]]** `code` `vscode-plugin/src/delivery/labels.ts` — "DISPLAY_LABELS, STAGE_ORDER"
- **[[c9]]** `code` `vscode-plugin/src/delivery/__tests__/board-perf.test.ts` — "500-item, 1,000-record board within one second, each filter change within 150 ms"
- **[[c10]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "screens 1-14"
- **[[c11]]** `prior-artifact` `docs/standalone/defect-against-e2-6a131558-issue-b2687832-E20261010348d4663/ISSUE.md` — "Present the delivery board as the PRD's screens"
- **[[c12]]** `step-output` `s1..s8 of this run`
