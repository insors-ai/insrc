<!-- insrc:artifact LLD-b2687832a8c75877-s1 -->

# LLD: E20261009b2687832:S001

## Summary

**Epic:** `defect-against-epic-e2-6a131558-vs`
**HLD base run:** `wf-1791563353258-a8f9df`
**HLD effective hash:** `286bdb2c6cb9...`

The delivery board keeps its data and behaviour but gains the PRD's look: an app bar with a readable freshness line, underline tabs, chip filters, tone pills, and cards that show a compact identifier and task results. The Epics tab becomes a list of rollup rows with progress meters, and choosing an epic opens its board. The details panel opens where the reader can see it, with chips, expandable tasks, a 'Why this stage?' box and the full artifact chain, and the empty, no-match, failed and partial states each get their own panel. Every new value is computed in the board's pure view models; the webview only lays them out.

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

### 2.1 `buildBoardViewModel`

```typescript
function buildBoardViewModel(snapshot: DeliverySnapshot, selection: BoardSelection, paging: BoardPaging, labels: DisplayLabels): BoardViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — Scope, search, attention filter and view.
- `paging: BoardPaging` — Per-column visible limit.
- `labels: DisplayLabels` — Display text for every code.

**Returns:** `BoardViewModel` — Six columns in STAGE_ORDER, each card now carrying compactId and taskSummary (see dataModel CardView). Signature unchanged.

**Preconditions:**
- snapshot is a schemaVersion-1 snapshot already accepted by the delivery client

**Postconditions:**
- All six columns are present, including empty ones
- Every card's compactId and taskSummary are derived from published fields only
- The same arguments give an equal model

### 2.2 `buildEpicRollup`

```typescript
function buildEpicRollup(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): EpicRollupViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — Scope, search and attention filter.
- `labels: DisplayLabels` — Display text.

**Returns:** `EpicRollupViewModel` — One EpicRollupRowView per listed epic in snapshot order, then the 'Not in an epic' row; rows carry counts, not card lists.

**Preconditions:**
- Built from selectMatches, as today

**Postconditions:**
- The listing rule is unchanged: every epic when nothing narrows the selection, otherwise epics with matches plus the scoped epic
- Sum of row match totals equals the board's totals.items for the same selection (AC-09)
- storiesComplete counts stories at stage 'complete'; completionLabel names its denominator
- taskCount counts planned tasks of the row's matching stories; attentionCount counts matches with needsAttention

### 2.3 `buildIssueView`

```typescript
function buildIssueView(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): IssueViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — Scope, search and attention filter.
- `labels: DisplayLabels` — Display text.

**Returns:** `IssueViewModel` — Unchanged shape; each entry's card gains compactId and taskSummary through the shared cardOf.

**Postconditions:**
- Parent, parentNotice and fixStories rules unchanged

### 2.4 `buildItemDetails`

```typescript
function buildItemDetails(snapshot: DeliverySnapshot, itemId: string, plan: PlanRead, opened: OpenedRecord | null, labels: DisplayLabels, byId?: ItemIndex): ItemDetailsViewModel | null
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `itemId: string` — The selected item.
- `plan: PlanRead` — The selected story's PLAN read.
- `opened: OpenedRecord | null` — The record the reader opened read-only.
- `labels: DisplayLabels` — Display text.
- `byId: ItemIndex` _(optional)_ — Pre-built id index.

**Returns:** `ItemDetailsViewModel | null` — Today's fields plus kicker, chips, chain and a structured conflict (see dataModel); null when itemId is not in the snapshot.

**Postconditions:**
- chain lists, in the order DEF, HLD, ISSUE, LLD, PLAN, BUILD, every one of those six kinds the item's route expects plus every one of those six kinds actually recorded; DEF/HLD come from the parent epic's evidence
- A kind the route expects with no record is 'not-recorded'; a kind the route does not use is listed only if recorded; route 'unknown' lists recorded kinds only and never claims 'not-recorded'
- Evidence of kinds outside the six (SPEC, CR, EXT, AMD) never becomes a chain row and never throws; it stays in evidence (Records)
- conflict is non-null exactly when item.conflict is non-null
- evidence (Records), notices, linked, sourceIds and openedRecord keep today's rules

### 2.5 `statusView`

```typescript
function statusView(status: LoadStatus, now: string): StatusView
```

**Parameters:**
- `status: LoadStatus` — The board's load status.
- `now: string` — ISO time used to phrase the freshness line.

**Returns:** `StatusView` — Today's fields plus freshnessLabel and panel (see dataModel StatusView).

**Preconditions:**
- now is the host clock (deps.now())
- Every caller passes now: boardDownMessages, and the host's announceRefresh (board-host.ts, which reads statusView(...).message for the refresh announcement)

**Postconditions:**
- freshnessLabel is null when no snapshot is shown; otherwise 'Updated just now' under one minute, 'Updated N minutes ago' under one hour, else 'Updated <takenAt date and time>'
- panel is 'empty' for an empty store, 'unavailable' or 'refresh-failed' (with retry, and stale when a snapshot is still shown), 'partial' when the shown snapshot has unreadable records or store notices, else null

### 2.6 `boardDownMessages`

```typescript
function boardDownMessages(state: BoardState, labels: DisplayLabels, paging: BoardPaging, now: string): readonly Envelope<BoardDownMessage>[]
```

**Parameters:**
- `state: BoardState` — Board state.
- `labels: DisplayLabels` — Display text.
- `paging: BoardPaging` — Per-column limits.
- `now: string` — Forwarded to statusView.

**Returns:** `readonly Envelope<BoardDownMessage>[]` — Status first, then the selected view's model, as today.

**Postconditions:**
- Message order and kinds unchanged

### 2.7 `renderBoardDocument`

```typescript
function renderBoardDocument(nonce: string): string
```

**Parameters:**
- `nonce: string` — Script nonce.

**Returns:** `string` — The board document with the PRD chrome: an app bar (insrc wordmark, 'Workspace / Delivery' breadcrumb, #status freshness line and Read-only marker, Refresh and density controls), a role=tablist of underline tabs (role=tab, aria-selected), a chip toolbar (search input, scope chips, Needs attention chip as aria-pressed buttons), #totals, the #announce live region, #panel for state panels, then a layout region holding <aside id=details> before #board.

**Postconditions:**
- CSP unchanged: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-…'
- Exactly one aria-live region (#announce)
- #details precedes #board in the DOM so a narrow pane shows it first; the wide layout places it as a side column by CSS grid, with nothing hidden

### 2.8 `BOARD_STYLE`

```typescript
const BOARD_STYLE: string
```

**Returns:** `string` — The one stylesheet, rewritten to the mocks' structure.

**Postconditions:**
- Only var(--vscode-*) colours; no literal colour
- No display:none, visibility:hidden or clipping rule
- .board keeps display:grid with six equal columns at wide widths (repeat(6,minmax(0,1fr))) and one stage-grouped list below 600 px
- Tone pills: success/warning/danger/neutral map to --vscode-testing-iconPassed, --vscode-editorWarning-foreground, --vscode-errorForeground and --vscode-descriptionForeground on --vscode-badge-background / --vscode-editorWidget-background
- Below 600 px empty stage sections wrap onto one compact line after the non-empty groups (CSS order), each still showing its label and its 0 count chip. This is a deliberate deviation from mock E's 'Other stages · 0 matching' disclosure: the same DOM serves the wide board, where the PRD requires empty columns to stay visible, and the no-hiding rule forbids collapsing them; it awaits the user's confirmation (open question).
- Both density rules and the :focus-visible outline kept

### 2.9 `BOARD_WEBVIEW_SCRIPT`

```typescript
const BOARD_WEBVIEW_SCRIPT: string
```

**Returns:** `string` — The webview renderer, still textContent-only and posting only BoardUpMessage envelopes.

**Postconditions:**
- Cards render kicker '<KIND> · <compactId>', title, epic line, task summary and tone pills
- Every stage heading, in the wide board and in the narrow grouped list, renders the stage label followed by its total as a count chip (an element carrying the number, with the label and count also in the section's aria-label), replacing today's 'Label (n)' text
- Epics tab renders rollup rows: kicker, title button (posts set-scope to the epic, or standalone for the 'Not in an epic' row, then set-view board), story count, meter with completionLabel as its text label and aria-valuenow/max, task count, attention chip
- Details render kicker, title, chips, the conflict box first when present, tasks as <details> rows with result and dependency chips and acceptance checks, a 'Why this stage?' highlight, the chain rows and the existing Records/Notices/Linked sections
- #panel renders the status panel or, when the view's emptySelection is true, a 'Nothing matches this view' panel with a Clear filters button (posts clear-filters); a retry action posts refresh; a partial panel lists affected records in a <details> 'Inspect affected records'
- Keyboard: cards, tabs (arrow keys move between tabs), chips and row titles are focusable; Escape closes details; focus return and the single announcer unchanged

### 2.10 `createDeliveryBoardHost`

```typescript
function createDeliveryBoardHost(deps: DeliveryBoardHostDeps): DeliveryBoardHost
```

**Parameters:**
- `deps: DeliveryBoardHostDeps` — Panel factory, client, logger, clock, nonce, review pane.

**Returns:** `DeliveryBoardHost` — Unchanged surface; its message handler also accepts clear-filters, and it passes deps.now() into boardDownMessages and into announceRefresh's statusView call.

**Errors:**
- `logged warning` when A set-scope from a rollup row names an epic not on the board (existing knownScope check)

**Postconditions:**
- clear-filters resets search to '' and needsAttentionOnly to false, keeps scope and view, and resets paging, like the other filter changes

## 3. Data model changes

### 3.1 `CardView` — field-add

compactId: string — parsed from the canonical work-item id format published in src/workflow/delivery/types.ts ("E<date><hash8>[:S<nnn>][:T<nnn>]", or an H-form / ":R(<raw>)" fallback): for 'E<8-digit date><8 hex>' ids, the 8 hex characters in upper case; for 'H<hash>' ids, the hash's first 8 characters in upper case; then ' / S<nnn>' when the id carries a ':S<nnn>' segment (cards are stories and issues, so ':T<nnn>' never reaches a card). An id containing ':R(' or matching neither form gives the full item id. Examples: 'E20261009abcdef01:S001' -> 'ABCDEF01 / S001'; 'E20261009abcdef01' -> 'ABCDEF01'; 'Habcdef0123456789:S002' -> 'ABCDEF01 / S002'; 'E20261009abcdef01:R(x)' -> the full id. taskSummary: { passed: number; total: number; label: string } | null — from item.validation: passed = validation.passed, total = passed + failed + unrecorded; label 'n/N tasks passed'; null when the item has no validation or total is 0. accessibleLabel gains the compactId and task summary.

```
+ readonly compactId: string;
+ readonly taskSummary: { readonly passed: number; readonly total: number; readonly label: string } | null;
```

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `EpicRollupRowView` — new

Replaces EpicGroupView in the Epics tab: { epicItemId: string | null; compactId: string | null; title: string; storiesTotal: number; storiesComplete: number; completionLabel: string; taskCount: number; issueCount: number; total: number; attentionCount: number; attentionLabel: string; attentionTone: 'warning' | 'success' } with attentionLabel 'N need attention' (1: '1 needs attention') or 'No open gates'.

```
+ interface EpicRollupRowView { ... }
```

**Call sites:**
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.3 `EpicRollupViewModel` — field-modify

epics: readonly EpicRollupRowView[] (was EpicGroupView[]); notInEpic: EpicRollupRowView (was EpicGroupView). EpicGroupView and StageGroupView are removed with their only consumer (renderGroup).

```
- readonly epics: readonly EpicGroupView[];
+ readonly epics: readonly EpicRollupRowView[];
- readonly notInEpic: EpicGroupView;
+ readonly notInEpic: EpicRollupRowView;
```

**Call sites:**
- `vscode-plugin/src/delivery/board-views.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.4 `ChainRowView` — new

{ kind: 'DEF' | 'HLD' | 'ISSUE' | 'LLD' | 'PLAN' | 'BUILD'; status: 'recorded' | 'not-recorded'; artifactId: string | null; label: string; tone: BadgeView['tone']; note: string | null }. Only these six chain kinds are ever chain rows: evidence of any other published kind (SPEC, CR, EXT, AMD) is skipped by the chain and stays listed under Records, so no published kind can make the chain throw. label is the approval label for a recorded row and DisplayLabels.chain.notRecorded otherwise; note carries the review label when present. One row per recorded artifact (two BUILDs give two rows).

```
+ interface ChainRowView { ... }
```

**Call sites:**
- `vscode-plugin/src/delivery/board-details.ts`
- `vscode-plugin/src/delivery/board-protocol.ts`

### 3.5 `ItemDetailsViewModel` — field-add

kicker: string ('<KIND> · <compactId>'); chips: readonly BadgeView[] (stage pill, task summary, the card's badges); chain: readonly ChainRowView[]; conflict changes from string | null to { headline: 'Two records disagree'; text: string } | null (text is today's sentence). TaskRowView gains resultTone: BadgeView['tone'] (Passed success, Failed danger, Unrecorded/Unplanned neutral).

```
+ readonly kicker: string;
+ readonly chips: readonly BadgeView[];
+ readonly chain: readonly ChainRowView[];
- readonly conflict: string | null;
+ readonly conflict: { readonly headline: string; readonly text: string } | null;
```

**Call sites:**
- `vscode-plugin/src/delivery/board-details.ts`
- `vscode-plugin/src/delivery/details-memory.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.6 `StatusView` — field-add

freshnessLabel: string | null; panel: { kind: 'empty' | 'unavailable' | 'refresh-failed' | 'partial'; title: string; text: string; action: 'retry' | null; stale: boolean; affected: readonly { artifactIds: readonly string[]; text: string }[] } | null. Titles: 'No work items yet', 'The delivery board is unavailable', 'Showing the last successful snapshot' (or 'The refresh failed' with no snapshot), 'Some evidence could not be read'. affected lists the snapshot's store notices and an unreadable-count line.

```
+ readonly freshnessLabel: string | null;
+ readonly panel: StatePanelView | null;
```

**Call sites:**
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts`

### 3.7 `BoardUpMessage` — field-add

New member { type: 'clear-filters' }; parseBoardUpMessage accepts it with no other fields.

```
+ | { readonly type: 'clear-filters' }
```

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.8 `DisplayLabels` — field-add

chain: { notRecorded: 'Not recorded' }; conflictHeadline: 'Two records disagree'; noMatchesTitle: 'Nothing matches this view'.

```
+ readonly chain: { readonly notRecorded: string };
+ readonly conflictHeadline: string;
+ readonly noMatchesTitle: string;
```

**Call sites:**
- `vscode-plugin/src/delivery/labels.ts`

## 4. Error paths

**Error cases**

- **A rollup row's title posts set-scope for an epic a refresh has since removed.** (recoverable)
  - Detection: The host's knownScope check finds no epic item with that id in the shown snapshot.
  - Response: The message is ignored and a warning is logged (existing behaviour); the set-view that follows still switches to the board with the current scope.
  - User impact: The board opens unscoped instead of on the vanished epic; nothing is changed on disk.
- **The webview sends clear-filters while no snapshot is shown (loading with no previous board, or unavailable with none).** (recoverable)
  - Detection: handle() dispatches selection-changed; boardDownMessages finds shownSnapshot null and emits only the status message.
  - Response: The selection is reset and kept; no view model is posted until a snapshot arrives.
  - User impact: None visible beyond the status panel; filters are clear when data arrives.
- **A view-model builder throws while deriving the new fields (a malformed snapshot that slipped past the delivery client's checks, for example an evidence entry with no artifactId).** (recoverable)
  - Detection: apply() derives messages before keeping state; the throw is caught by the message handler or by refresh()'s apply try.
  - Response: State and paging stay as they were; the error is logged; a throw during a refresh is shown as a failed refresh over the previous board (existing path).
  - User impact: The previous board stays on screen with a refresh-failed panel.
- **deps.now() returns an unparseable time, or takenAt is unparseable.** (recoverable)
  - Detection: statusView finds Date.parse(now) or Date.parse(takenAt) is NaN.
  - Response: freshnessLabel falls back to 'Updated <takenAt>' with the raw string (or null when no snapshot); no throw.
  - User impact: A less friendly freshness line; the board still renders.
- **parseBoardUpMessage receives clear-filters with extra or wrong-typed fields, or an unknown type.** (recoverable)
  - Detection: The parser's per-type shape check rejects it and returns null.
  - Response: The host logs 'ignored a malformed webview message' (existing).
  - User impact: None.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A story whose id is an H-form or raw fallback id (no 8-hex hash or no story ordinal). | compactId is the full item id; the card still renders its kicker. |
| A story with validation null, or with passed + failed + unrecorded = 0 (only unplanned tasks). | taskSummary is null and no task summary line is shown. |
| An epic with no matching work when nothing narrows the selection. | Its rollup row is listed with 0 stories, '0 of 0 stories complete', an empty meter and 'No open gates'. |
| Only standalone work in the snapshot. | The Epics tab lists only the 'Not in an epic' row; its title opens the standalone scope. |
| A small-route story with an approved LLD and no PLAN (AC-15). | Chain shows LLD recorded and BUILD not recorded; no PLAN row and no missing-plan wording. |
| A small-bugfix issue with an approved ISSUE and no LLD. | Chain shows ISSUE recorded and BUILD not recorded; no LLD or PLAN rows. |
| A trivial-route item that appears with only its BUILD. | Chain shows just the BUILD row(s). |
| Route 'unknown'. | Chain lists only recorded kinds and no 'Not recorded' row; the existing unknown-route notice remains in Notices. |
| A story under an epic whose DEF and HLD exist, and a standalone story with no parent epic. | The first shows DEF and HLD rows from the epic's evidence; the second shows none (standalone routes do not expect them). |
| Two BUILD records on one story. | Two BUILD chain rows, in evidence order (artifactId). |
| An approved BUILD with a failed task (AC-04). | Item stays in Complete; details show the 'Two records disagree' box above the tasks, with today's sentence. |
| All six stages empty except one, in a pane below 600 px. | The one non-empty group is listed first; the five empty stage labels with 0 wrap onto one compact line after it; nothing is hidden. |
| A partial snapshot with unreadableCount > 0 and no store notices. | Partial panel with one affected line for the unreadable count and an empty artifact list. |
| A view with emptySelection true while the status panel is also 'partial'. | Both panels show: the partial panel first, then 'Nothing matches this view' with Clear filters. |
| Density compact. | Pills, chips, rows and meters shrink spacing and font only; every label stays visible. |
| A story whose evidence includes CR, SPEC, EXT or AMD records. | The chain lists only its DEF/HLD/ISSUE/LLD/PLAN/BUILD rows; the CR, SPEC, EXT and AMD records appear under Records only; no error. |

**Invariants to preserve**

- The document stays CSP-locked (default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-…') and the script sets text only through textContent. [[c1]]
- Every colour in BOARD_STYLE is a var(--vscode-*) reference; there is no literal colour and no display:none, visibility:hidden or clipping rule. [[c5]]
- The board, rollup and issue views all derive from selectMatches, so their counts agree for the same snapshot and selection (AC-09). [[c4]]
- Nothing the daemon decided (stage, route, attention, conflict, review effect) is recomputed in the plugin; new fields only relabel or count published values. [[c3]]
- One aria-live region (#announce); #status keeps role=status without aria-live; focus returns to the item's card on close, else to the shown view's tab. [[c1]]
- First render within 1 s and each filter change within 150 ms on the 500-item / 1,000-record fixture, best of three. [[c6]]
- The webview posts only BoardUpMessage envelopes; every message the host acts on is validated (knownScope, onBoard, parseBoardUpMessage). [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), with the shared fake DOM in __tests__/board-webview-harness.ts booting the real BOARD_WEBVIEW_SCRIPT`

**Test levels**

- **unit** — Pin every new view-model value on the pure builders: card compactId and taskSummary, rollup rows and their counts, chain rows per route, structured conflict, kicker and chips, statusView freshness and panels, the clear-filters parser case and the new labels.
  - Subjects: `board-model.ts cardOf via buildBoardViewModel / selectMatches`, `board-views.ts buildEpicRollup / buildIssueView`, `board-details.ts buildItemDetails`, `board-state.ts statusView / boardDownMessages`, `board-protocol.ts parseBoardUpMessage`, `labels.ts DISPLAY_LABELS`
  - Fixtures: `board-fixtures.ts items with canonical ids in the published format ('E20261009abcdef01:S001', epic 'E20261009abcdef01'), H-form ids ('Habcdef0123456789:S002'), ':R(<raw>)' fallback ids, and each DeliveryRoute`, `an epic with DEF and HLD evidence and child stories on full-chain, a standalone small story, a small-bugfix and a sized-bugfix issue, a trivial item, an unknown-route item`, `a story with two BUILDs and one with an approved BUILD and a failed task`, `snapshots with unreadableCount > 0 and with store notices carrying artifactIds`, `stories carrying CR, SPEC, EXT and AMD evidence alongside LLD/PLAN/BUILD`
- **integration** — Run the real host and real webview script through the fake DOM: document chrome, stylesheet rules, rendered cards, rollup rows and their scope navigation, details placement and content, conflict box order, panels and their actions, keyboard and focus, and that only BoardUpMessage envelopes are posted.
  - Subjects: `board-host.ts renderBoardDocument / BOARD_STYLE / BOARD_WEBVIEW_SCRIPT / createDeliveryBoardHost`
  - Fixtures: `board-webview-harness.ts extended with role/aria-selected queries and <details> elements`
- **smoke** — Keep the measured performance targets with the richer DOM.
  - Subjects: `board-perf.test.ts 500-item / 1,000-record fixture through the real host and script`
  - Fixtures: `existing perf fixture, with tasks and validation on its stories so taskSummary and rollup task counts are exercised`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-model.test.ts: compactId is 'ABCDEF01 / S001' for 'E20261009abcdef01:S001', 'ABCDEF01' for an epic-level 'E20261009abcdef01', 'ABCDEF01 / S002' for the H-form 'Habcdef0123456789:S002', and the full id for a ':R(<raw>)' fallback id`, `board-model.test.ts: taskSummary is 'n/N tasks passed' from validation and null when validation is null or has no recorded tasks`, `board-host.test.ts: a rendered card shows its kicker, title, epic line, task summary and tone pills (data-tone) in the six-column board` |
| `ac2` | `board-views.test.ts: buildEpicRollup returns one row per listed epic plus 'Not in an epic' with story, complete, task, issue and attention counts, and the row totals sum to the board's totals.items for the same selection`, `board-views.test.ts: attentionLabel is 'No open gates' at 0, '1 needs attention' at 1, 'N need attention' otherwise`, `board-host.test.ts: clicking a rollup row title posts set-scope for that epic (standalone for 'Not in an epic') and then set-view board, and the meter exposes completionLabel and aria-valuenow/max` |
| `ac3` | `board-details.test.ts: chain rows per route — full-chain story shows DEF/HLD from its epic plus LLD/PLAN/BUILD; small story has no PLAN row; small-bugfix has ISSUE and BUILD only; trivial has BUILD only; unknown lists recorded kinds only; a missing expected kind is 'Not recorded'; two BUILDs give two rows`, `board-details.test.ts: a story with CR, SPEC, EXT and AMD evidence gets a chain without those kinds, they remain in Records, and buildItemDetails does not throw`, `board-details.test.ts: kicker, chips and TaskRowView.resultTone`, `board-host.test.ts: opening a card shows #details before #board in DOM order with its heading focused, tasks as <details> rows with checks and dependency chips, and a 'Why this stage?' highlight with the stage reason` |
| `ac4` | `board-details.test.ts: conflict is { headline: 'Two records disagree', text } exactly when item.conflict is set`, `board-host.test.ts: the conflict box is the first element after the details chips, before the task list` |
| `ac5` | `board-host.test.ts: every board column heading renders its label and a count chip holding the column total, for empty and non-empty stages alike`, `board-host.test.ts: BOARD_STYLE's 600 px block orders empty stage sections after non-empty ones and contains no hiding rule; each empty section still renders its label and a 0 count chip` |
| `ac6` | `board-state.test.ts: statusView panel kinds — empty, unavailable, refresh-failed (stale with a shown snapshot, retry action), partial with affected entries from store notices and the unreadable count; freshnessLabel phrasing and NaN fallback`, `board-protocol.test.ts: parseBoardUpMessage accepts { type: 'clear-filters' } and rejects it with extra fields`, `board-host.test.ts: a view with emptySelection renders 'Nothing matches this view' with Clear filters; Clear filters posts clear-filters and the host resets search and attention, keeps scope and view, and resets paging; Retry posts refresh; the partial panel's 'Inspect affected records' lists artifact ids` |
| `ac7` | `board-host.test.ts: CSP string unchanged; the script uses textContent only; BOARD_STYLE has only var(--vscode-*) colours and no display:none/visibility:hidden/clip; exactly one aria-live region; density rules and :focus-visible kept; tabs are role=tab with aria-selected and arrow-key movement; Escape closes details and focus returns to the card or the tab` |
| `ac8` | `board-perf.test.ts: first render under 1 s and each filter change under 150 ms, best of three, on the 500-item / 1,000-record fixture with the new DOM` |

## 6. Migration

**State before:** Per the s1 structural map and type bundles: the board document has a plain header, toggle-button tabs, a <select> scope and a checkbox filter; BOARD_STYLE holds about 20 rules (auto-fit grid, outlined badges, density, focus); cards carry no compact id or task summary; the Epics tab renders EpicGroupView stage groups of cards; details are flat text in an <aside> placed after #board; StatusView carries only a message and partialNotice; the empty and no-match states are single #empty / #status / #notice lines.

**State after:** The document carries the PRD chrome (app bar with freshness line, role=tablist underline tabs, chip toolbar, #panel); cards carry compactId and taskSummary; the Epics tab renders EpicRollupRowView rows whose titles open the scoped board; details sit before #board in the DOM with kicker, chips, conflict box, task disclosures, 'Why this stage?' and the route-aware chain; StatusView carries freshnessLabel and a typed panel; a clear-filters up-message exists. Colours remain --vscode-* only and the CSP is unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the new view-model fields and types (CardView compactId/taskSummary, EpicRollupRowView, ChainRowView, details kicker/chips/chain/structured conflict, StatusView freshnessLabel/panel, clear-filters message, new labels) and derive them in the pure builders, keeping existing fields in place. — ↩ rollbackable
2. Switch EpicRollupViewModel.epics / notInEpic to EpicRollupRowView and remove EpicGroupView / StageGroupView once their only consumer (renderGroup) is replaced in the same change. — ↩ rollbackable
3. Rewrite renderBoardDocument, BOARD_STYLE and the webview DOM builders to the new structure; move #details before #board; replace #empty/#notice with #panel. — ↩ rollbackable
4. Thread deps.now() through boardDownMessages into statusView and through announceRefresh's statusView call (both in board-host.ts), update the existing three-argument boardDownMessages calls in board-state.test.ts and the other tests, and handle clear-filters in the host. — ↩ rollbackable
5. Update and extend the board tests and re-run the performance fixture; rebuild and reinstall the VS Code extension package. — ↩ rollbackable

**Backward compat:** Internal only: board-protocol.ts types travel between the host and its own webview script, both shipped in the same extension build, so there is no cross-version consumer. No daemon IPC, setting, persisted state or command id changes. The webview's saved state keeps only density, which is unchanged. The removed EpicGroupView / StageGroupView have no consumer outside vscode-plugin/src/delivery.

## 7. Alternatives considered

### 7.1 a1: Model-first: extend view models, then restyle the renderer — **CHOSEN**

Add every value the mocks show to the pure view models (board-protocol types), and have the webview script and stylesheet only lay them out.

Keep the split the module already has: pure builders derive every displayed value from the snapshot, and the webview renders text. CardView gains a compact identifier and a task-validation summary. EpicGroupView is replaced, for the Epics tab, by a rollup-row model carrying story, complete, task and attention counts plus the epic id, with no per-stage card lists. ItemDetailsViewModel gains an ordered artifact chain for the route, with one row per expected kind (recorded, not recorded, or not applicable), drawing DEF/HLD from the parent epic's evidence. ColumnView and the stage groups carry whether a stage is empty so the narrow pane can fold them. StatusView gains a typed state panel (empty, no-matches, refresh-failed, partial with affected record ids). The webview's DOM builders and BOARD_STYLE are rewritten to the mocks' structure using --vscode-* variables only: app bar, underline tabs (role=tablist), chip filters (buttons with aria-pressed, keeping the existing set-scope/set-attention messages), tone pills, six-column grid, rollup rows whose title posts set-scope + set-view, details as a side panel when wide and full-width above the board when narrow, and state panels with clear-filters and retry buttons. One new up-message, clear-filters, is added; retry reuses refresh.

### 7.2 a2: Renderer-only: derive the extra values in the webview script

Leave the view models as they are and compute identifiers, rollup counts, chain rows and state panels inside BOARD_WEBVIEW_SCRIPT.

The script already receives the board, epics, issues and details models. It would compute rollup counts by walking the stage groups it is sent, the compact identifier from the item id string, the chain by comparing evidence kinds against a hard-coded per-route list, and the state panel from the status message and #empty text. Only BOARD_STYLE and the script's DOM builders change.

**Rejected because:** Cannot fully present mock A or B (k1 partial) and moves interpretation into the untyped script.

### 7.3 a3: Split delivery: presentation pass now, rollup and details models in a second story

Ship stylesheet, chrome, chips, pills, six columns, conflict box and state panels first; rework the rollup and details models separately.

First story: rewrite BOARD_STYLE and the document chrome, restyle existing elements (badges as pills, tabs, chips), fix details placement, add state panels from existing StatusView fields, and add the card identifier and task count. Second story: replace the Epics tab with rollup rows and add the artifact chain with 'Not recorded' rows, both needing model changes. The two stories share the same tests and files.

**Rejected because:** Same end state as a1 but k1 only partial within this story, and both halves edit the same files.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 structural-map: vscode-plugin/src/delivery module layout and consumers`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: view-model types in vscode-plugin/src/delivery/board-protocol.ts`
- **[[c3]]** `analyze-bundle` `s1 data-model.trace: DeliveryItemView pick (vscode-plugin/src/delivery/delivery-contract.ts, src/workflow/delivery/types.ts)`
- **[[c4]]** `analyze-bundle` `s1 usage.example: builders and their callers (board-state.ts, board-views.ts, board-model.ts, details-memory.ts, board-host.ts)`
- **[[c5]]** `analyze-bundle` `s1 search.text: stylesheet / DOM constraints pinned in vscode-plugin/src/delivery/__tests__/board-host.test.ts`
- **[[c6]]** `analyze-bundle` `s1 test.locate: vscode-plugin/src/delivery/__tests__ suites incl. board-perf.test.ts`
- **[[c7]]** `doc` `docs/insrc-delivery-board-prd.html` — "Cards show type, human title, compact stable identifier, epic context, recorded size when present, and task-validation count."
- **[[c8]]** `prior-artifact` `docs/standalone/defect-against-epic-e2-6a131558-vs-E20261009b2687832/ISSUE.md`

## 9. Open questions

- Standalone bugfix stories carry no acceptance criteria (6f31771d); ac1-ac8 in the test strategy are derived from ISSUE-b2687832's fix intent. Confirm they stand in for the story's criteria.
- Mock E folds empty stages under an 'Other stages · 0 matching' disclosure; this LLD instead wraps empty stage labels (each with its 0 count chip) onto one compact line in narrow panes, because the same DOM serves the wide board where empty columns must stay visible and the no-hiding rule forbids collapsing them. Confirm this deviation from the ISSUE's fix intent.
- cd3/dm2 audit partials: errors are log-and-keep-state rather than typed throws, and the rollup/conflict field-modify entries rely on the AC-09 invariant stated in postconditions and s5 rather than in the dataModel entry.

## Resolved questions

- `q20f1064b` — Mock E folds empty stages under an 'Other stages · 0 matching' disclosure; this LLD instead wraps empty stage labels (each with its 0 count chip) onto one compact line in narrow panes, because the same DOM serves the wide board where empty columns must stay visible and the no-hiding rule forbids collapsing them. Confirm this deviation from the ISSUE's fix intent.
  - **resolved**: Accept the LLD deviation (wrap empty labels inline) — Confirmed by the user in chat on 2026-10-09; recorded on the LLD review as fix-targets-defect.1 resolved. _(2026-10-09T16:45:38.059Z)_
- `qb1dffdca` — Standalone bugfix stories carry no acceptance criteria (6f31771d); ac1-ac8 in the test strategy are derived from ISSUE-b2687832's fix intent. Confirm they stand in for the story's criteria.
  - **resolved**: Accept ac1-ac8 as the story's criteria — Standalone bugfix stories carry no criteria (6f31771d); ac1-ac8 trace one-to-one to the approved ISSUE-b2687832 fix intent. _(2026-10-09T16:45:58.325Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: vscode-plugin/src/delivery module layout and consumers`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate: view-model types in vscode-plugin/src/delivery/board-protocol.ts`
- **[[c3]]** `analyze-bundle` `s1 data-model.trace: DeliveryItemView pick (vscode-plugin/src/delivery/delivery-contract.ts, src/workflow/delivery/types.ts)`
- **[[c4]]** `analyze-bundle` `s1 usage.example: builders and their callers (board-state.ts, board-views.ts, board-model.ts, details-memory.ts, board-host.ts)`
- **[[c5]]** `analyze-bundle` `s1 search.text: stylesheet / DOM constraints pinned in vscode-plugin/src/delivery/__tests__/board-host.test.ts`
- **[[c6]]** `analyze-bundle` `s1 test.locate: vscode-plugin/src/delivery/__tests__ suites incl. board-perf.test.ts`
- **[[c7]]** `doc` `docs/insrc-delivery-board-prd.html` — "Cards show type, human title, compact stable identifier, epic context, recorded size when present, and task-validation count."
- **[[c8]]** `prior-artifact` `docs/standalone/defect-against-epic-e2-6a131558-vs-E20261009b2687832/ISSUE.md`
