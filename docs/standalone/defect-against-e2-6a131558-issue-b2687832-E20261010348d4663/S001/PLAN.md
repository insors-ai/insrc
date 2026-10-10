<!-- insrc:artifact PLAN-348d4663a4bc17af-s1 -->

# Plan: E20261010348d4663:S001

## Summary

**Epic:** `defect-against-e2-6a131558-issue-b2687832`
**LLD run:** `wf-1791609042904-5nyjto`
**LLD effective hash:** `dd7f5080a7f4...`

The build replaces the board's one-page model with screens in eight steps, all inside vscode-plugin/src/delivery. First the new protocol types and labels are added beside the old ones. Next come the screen bodies built from the existing match pipeline, then the navigation trail in the state and host. After that, the webview renders the list screens and then the story and issue screens, and the stylesheet gets the minimum widths. The old composite-page code is removed last, and performance and the full suite are verified.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Screen protocol types, labels and the new up-messages | S | — | unit: board-protocol.test.ts: 'every new up-message parses and a malformed crumb, back or set-view gives null'; unit: board-state.test.ts: 'statusView places empty and snapshot-less failures in the body and stale failures and partial evidence in the banner'; unit: labels.test.ts: 'DISPLAY_LABELS carries the view, item-tab, attention and stage-section labels' | [[c1]] [[c2]] [[c8]] |
| 2 | **`t2`** Screen bodies from the match pipeline, with one epic membership rule | M | `t1` | unit: board-model.test.ts: 'stage sections start open when they hold matches, closed when empty, and Complete closed with its attention hint unless Needs attention is on'; unit: board-model.test.ts: 'totals read N items · M need attention, or M of N with Show all under Needs attention, and empty stages fold under Needs attention'; unit: board-views.test.ts: 'a standalone issue correcting a story of an epic counts towards no epic, and the epic's Epics row equals its board header'; unit: board-views.test.ts: 'the Epics body filters rows by epic title or id and by attention, with whole-epic counts, and a search matching no epic gives the no-matches panel'; unit: board-views.test.ts: 'the Issues body lists issues in stage order with their parent, parent notice and fix stories'; unit: board-details.test.ts: 'correctedBy lists the issues correcting the item and approvedAt reads the approval time' | [[c6]] [[c7]] |
| 3 | **`t3`** Navigation trail in the board state and the host | L | `t2` | unit: board-state.test.ts: 'set-view from a story screen resets the trail to one root and keeps only the attention flag'; unit: board-state.test.ts: 'open-epic and open-item push entries with new ids and record the opener, and the trail is capped at 20 keeping the root'; unit: board-state.test.ts: 'back and go-to-crumb restore the earlier entry with its own search, attention and paging'; unit: board-state.test.ts: 'filter intents are ignored on an item screen, and a refresh that removes the item truncates the trail with a notice'; unit: board-state.test.ts: 'every screen message carries a breadcrumb that follows the trail and a back label naming where Back goes'; integration: details-memory.test.ts: 'the memory is told null once the item screen is left' | [[c1]] [[c3]] [[c7]] |
| 4 | **`t4`** Screen shell and list screens in the webview | L | `t3` | integration: board-host.test.ts: 'opening an epic and then a story replaces #main each time, and nothing from an earlier screen remains'; integration: board-host.test.ts: 'the filter bar has exactly the four views and Needs attention, and no epic is a chip'; integration: board-host.test.ts: 'an Epics row opens that epic's board with its header, breadcrumb and ← Epics, and no view control'; integration: board-host.test.ts: 'stages render as six <details> sections in workflow order, and a toggled section stays as the reader left it across a refresh'; integration: board-host.test.ts: 'a narrow pane shortens the breadcrumb and folds empty stages into Other stages · 0 matching, and widening re-renders the wide form'; integration: board-host.test.ts: 'Back restores the saved scroll and focuses the card that opened the story; Escape goes back'; integration: board-host.test.ts: 'empty replaces the screen, no matches replaces the list area with Clear filters, and a failed refresh over a story keeps the story under the banner'; integration: board-host.test.ts: 'CSP string unchanged, exactly one aria-live region, and the script uses textContent only and posts only BoardUpMessage envelopes' | [[c4]] [[c10]] |
| 5 | **`t5`** Story and issue screens in the webview | M | `t4` | integration: board-host.test.ts: 'opening a story replaces the screen: #main holds only the story screen, with its breadcrumb and Back, and no card from the list it came from'; integration: board-host.test.ts: 'the story tabs post set-item-tab; overview shows the conflict first, tasks, why and chain; evidence is a records table with open buttons'; integration: board-host.test.ts: 'linked work lists the epic, children and correcting issues, each opening its own screen'; integration: board-host.test.ts: 'the issue screen opens what it corrects, or shows the parent notice, and lists its fix stories' | [[c4]] [[c7]] [[c10]] |
| 6 | **`t6`** Stylesheet for screens, accordions and minimum widths | M | `t5` | integration: board-host.test.ts: 'BOARD_STYLE keeps a 320px minimum, card and column minimums, the records table scroll wrapper and only var(--vscode-*) colours, with no hiding rule'; integration: board-host.test.ts: 'density is restored from the webview state, saved on change and mirrored to the host, and both densities render every screen' | [[c5]] [[c10]] |
| 7 | **`t7`** Remove the composite-page leftovers | S | `t6` | unit: board-protocol.test.ts: 'the removed set-scope, select-item, close-details and set-view board give null'; integration: board-wiring.test.ts: 'extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client' | [[c2]] [[c11]] |
| 8 | **`t8`** Performance and full verification | S | `t7` | smoke: board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change or drill-down within 150 ms, best of three' | [[c9]] [[c12]] |

### 1.1 E20261010348d4663:S001:T001 — Screen protocol types, labels and the new up-messages

Add BoardScreen, ListView, ItemTab, ScreenModel, the ScreenBody variants (StagesBody, EpicsBody, IssuesBody, StoryBody, IssueBody), StageSectionView, StatePanelView.placement, ItemDetailsViewModel.correctedBy and EvidenceRowView.approvedAt to board-protocol.ts, and a 'screen' down-message. parseBoardUpMessage accepts set-view with a ListView, open-epic, open-item, set-item-tab, back (bare) and go-to-crumb (non-negative integer index); the old messages stay accepted until t7. DisplayLabels gains views, itemTabs, needsAttention, nothingAtStage and otherStages. statusView and selectionPanel set placement.

**Acceptance checks:**
- parseBoardUpMessage returns the typed intent for every new up-message and null for a malformed one (go-to-crumb with a negative, fractional or string index; back or clear-filters carrying extra fields).
- statusView gives placement 'body' for empty and for unavailable or refresh-failed with no snapshot shown, and 'banner' for a stale failure and for partial; no-matches and no-issues panels are 'body'.
- DISPLAY_LABELS carries the four view labels, the three item-tab long and short labels, 'Needs attention', 'nothing at this stage' and 'Other stages · 0 matching'.
- The plugin typechecks and the existing suite stays at its baseline.

### 1.2 E20261010348d4663:S001:T002 — Screen bodies from the match pipeline, with one epic membership rule

selectMatches takes a MatchFilter {scope, search, needsAttentionOnly}; inScope's epic case excludes items flagged standalone. buildBoardViewModel returns a StagesBody (six StageSectionView with attentionCount, defaultOpen, emptyText, hint; totalsLabel; showAll; fold; emptyPanel); buildEpicRollup returns an EpicsBody (rows for every epic counted over the epic's whole scope, filtered by epic title or id and by attention; no 'Not in an epic' row); buildIssueView returns an IssuesBody in stage order. buildItemDetails adds correctedBy and approvedAt. The board/epics/issues down-messages carry the new bodies until t3 replaces them with the screen message. Validation: this task's unit tests (board-model, board-views, board-details) and the typecheck; board-host.test.ts is rewritten in t4-t6, and the full suite is back at baseline from t6 and proved in t8.

**Acceptance checks:**
- A non-empty stage section starts open except Complete, which starts closed with hint attentionLabel(n) when n > 0, unless Needs attention is on; an empty section starts closed with emptyText 'nothing at this stage'; fold.always is true exactly when Needs attention is on and fold.text names the empty stages.
- totalsLabel reads 'N items · M need attention', or 'M of N items need attention' with showAll true when the toggle is on.
- A standalone issue whose correctsRef resolves to a story of epic X is not on X's board and does not count in X's Epics row, and X's row equals the header built for X's board.
- The Epics body lists epics whose title or id contains the search and, with attention on, only epics with attentionCount > 0; a search matching no epic gives the no-matches panel.
- Issues rows are ordered by stage, then snapshot order; an issue with an unresolved parent keeps its parentNotice.
- correctedBy lists the issues whose correctsRef resolves to the item, in snapshot order; approvedAt is 'YYYY-MM-DD HH:MM UTC' or null.
- The plugin typechecks.

### 1.3 E20261010348d4663:S001:T003 — Navigation trail in the board state and the host

BoardSelection becomes {trail, density}; BoardState gains entrySeq and restored; reduceBoardState handles 'navigate' intents (set-view reset keeping the attention flag, open-epic and open-item push recording openedId, set-item-tab, back, go-to-crumb, filter intents and show-more on list or epic screens only, cap at 20) and 'set-density'; applySnapshot truncates the trail at the first entry whose epic or item is gone and sets selectionNotice. boardDownMessages(state, labels, now, detailsOf) posts status then one screen message (crumbs, back label, filters, title, restored, focusItemId, body). The host maps up-messages to intents after id checks (an epic id in open-item routes to open-epic), keeps paging in the trail entry, tells the details memory the current item screen's id, posts no details message, and announces screen changes and the selection notice. Kept as one task because the host reads the BoardSelection fields the trail replaces. Validation: board-state.test.ts, details-memory.test.ts and the typecheck.

**Acceptance checks:**
- set-view from a story screen leaves one root entry for the chosen view with the previous attention flag and an empty search; set-view to the current single root returns the same state.
- open-epic and open-item push an entry with a new, never reused id and record openedId on the entry left; opening the current item again is a no-op; the trail is capped at 20 entries keeping the root.
- back and go-to-crumb restore the earlier entry with its own search, attention flag, paging and openedId, and set restored; out-of-range indexes and back on a root return the same state.
- set-search, set-attention, clear-filters and show-more are ignored on an item screen.
- A refresh that removes the current item truncates the trail to the nearest valid entry and sets selectionNotice to 'What you were viewing is no longer on the board.'
- boardDownMessages posts status then exactly one screen message, or status only when no snapshot is shown or the status is empty; crumbs and back labels follow the LLD rules (Delivery / Epics / <epic> / S001; '← Epics', '← Back to epic', '← Back to <id>').
- The details memory is told the current item screen's id on every kept state and null once the item screen is left (details-memory.test.ts).
- The host ignores and logs open-epic or open-item naming an id that is not on the board, and announces 'Opened: …', 'Epic: …', 'Showing …' and 'Back to …' once each.
- The plugin typechecks.

### 1.4 E20261010348d4663:S001:T004 — Screen shell and list screens in the webview

renderBoardDocument becomes the app bar (breadcrumb nav, status, Read-only, Refresh, density), #announce, #banner and <main id='main'>. The webview script renders each screen message by clearing #main: breadcrumb buttons posting go-to-crumb (last one aria-current), Back, the filter bar (four-view group only on root lists, Needs attention toggle with ×, search), the totals line with Show all, stage sections as <details> with remembered toggles per entry and stage, card grids, Epics rows posting open-epic and the Standalone link, the Issues list posting open-item, and the state panels by placement. Focus and scroll: a new screen focuses its h1 and scrolls to the top; a restored one restores the saved scroll and focuses the opener. Escape on an epic or item screen posts back. Narrow (<= 480 px): short breadcrumb and the empty-stage fold, re-rendered on resize. The fake-DOM harness gains clientWidth, scroll, resize and <details> open/toggle. board-host.test.ts is rewritten for the shell, list screens and navigation.

**Acceptance checks:**
- Each screen message replaces #main entirely: after opening an epic and then a story, no card or row from an earlier screen remains in the DOM.
- The filter bar has exactly the four views and Needs attention, no epic button, and no view control on an epic screen.
- Stage sections render as six <details> in workflow order with their default open state; a section the reader toggled keeps its state across a refresh of the same entry.
- Under Needs attention or below 480 px the empty stages fold into one section; widening past 480 px re-renders the wide form.
- Back restores the saved scroll and focuses the card or row that opened the screen; Escape posts back.
- Empty and snapshot-less failures replace #main; a stale failure and partial evidence sit in #banner above the screen; no matches replaces the list area with Clear filters.
- Text is set only through textContent and only BoardUpMessage envelopes are posted; #announce is the only live region; the CSP string is unchanged.

### 1.5 E20261010348d4663:S001:T005 — Story and issue screens in the webview

The story screen: kicker, title, chips, the conflict box first, tab buttons (role=tab, roving tabindex, set-item-tab) for Overview & tasks (tasks as <details> rows with checks and dependencies, the why box and the artifact chain), Workflow evidence (a records table with record, approval and date, review, override and the open button, then notices and the opened record) and Linked work (the epic with its completion, children, issues correcting the story, each posting open-item or open-epic). The issue screen: the trail's back, 'Open what it corrects →' or the parent notice, fix stories, why, chain, records and notices. Short tab labels in a narrow pane. board-host.test.ts gains the item-screen tests.

**Acceptance checks:**
- Opening a story shows only the story screen with its breadcrumb and Back; the three tabs post set-item-tab and render their own content; the conflict box comes before the tasks.
- Workflow evidence lists every record in a table inside a scroll wrapper, each with its open button posting open-evidence; an opened record renders as preformatted text.
- Linked work lists the parent epic, the children and the correcting issues, and each row posts open-item or open-epic; a standalone story has no Epic section.
- The issue screen shows 'Open what it corrects →' posting open-item (open-epic for an epic parent), or the parent notice when the parent is unresolved, and lists each fix story with its stage.
- Narrow panes use 'Overview', 'Evidence' and 'Linked'.

### 1.6 E20261010348d4663:S001:T006 — Stylesheet for screens, accordions and minimum widths

Rewrite BOARD_STYLE: body min-width 320px; #main as an inline-size container; card grid repeat(auto-fill,minmax(min(240px,100%),1fr)); epic rows with a 220px minimum title column; the story overview as two columns minmax(340px,1.4fr) minmax(280px,1fr) stacking under @container (max-width:760px) with why and chain first; records table min-width 620px inside .table-wrap{overflow-x:auto}; stage section summaries with label, count and hint; breadcrumb, back, filter bar and banner styles. The six-column grid, the side column and the 600px block are removed. From this task on the full plugin suite is at its baseline.

**Acceptance checks:**
- BOARD_STYLE contains body{min-width:320px}, container-type:inline-size on #main, the card-grid minimum, the 340/280 column minimums, the 760px container rule with order, and table.records min-width 620px inside .table-wrap with overflow-x:auto.
- BOARD_STYLE uses only var(--vscode-*) colours and contains no display:none, visibility:hidden, clip, overflow:hidden, height:0 or text-overflow.
- Both densities change only spacing and font size.
- Headless-Chrome screenshots of each screen at 1200, 600 and 360 px show no overlapping or squeezed content.
- The full plugin suite is at its baseline.

### 1.7 E20261010348d4663:S001:T007 — Remove the composite-page leftovers

Delete the board/epics/issues/details/items down-messages, the set-scope, select-item and close-details up-messages, BoardView, BoardViewModel, EpicRollupViewModel, IssueViewModel, ColumnView, scopeOptionsOf, NOT_IN_EPIC_TITLE and the 'Not in an epic' row, and the old tabs, scope chips, .layout and #details code paths; update the comments that describe the old page.

**Acceptance checks:**
- parseBoardUpMessage returns null for set-scope, select-item, close-details and set-view 'board'.
- No source file in vscode-plugin/src/delivery references the removed types, messages, #scope-chips, #details or 'Not in an epic'.
- The plugin typechecks.

### 1.8 E20261010348d4663:S001:T008 — Performance and full verification

Update board-perf.test.ts for the screen message (first render of All work within 1 s; each filter change and an open-epic within 150 ms, best of three, on 500 items and 1,000 records), run the full plugin suite and the typecheck, and save the evidence.

**Acceptance checks:**
- The perf test passes its 1 s and 150 ms targets.
- The full plugin suite is at its baseline (only the known manifest-catalog failure, 4 live skips) and the typecheck is clean.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| board-state.ts reduceBoardState navigate intents (set-view reset, open-epic/open-item push with openedId, set-item-tab, back, go-to-crumb, filter intents ignored on item screens, cap at 20, ids never reused) | `t3` |
| board-state.ts applySnapshot trail truncation and selectionNotice | `t3` |
| board-state.ts boardDownMessages: status then exactly one screen; crumbs, back label, filters, restored, focusItemId | `t3` |
| board-state.ts statusView placement body/banner | `t1` |
| board-model.ts buildBoardViewModel StageSectionView defaultOpen / emptyText / hint / fold / totalsLabel / showAll | `t2` |
| board-views.ts buildEpicRollup rows filtered by epic title or id and attention, counts unfiltered and equal to the epic header | `t2` |
| board-views.ts buildIssueView rows and panels | `t2` |
| board-details.ts correctedBy and approvedAt | `t2` |
| labels.ts new labels | `t1` |
| board-protocol.ts parseBoardUpMessage new and removed messages | `t1`, `t7` |
| board-host.test.ts screen rendering per body kind, breadcrumb and Back, Escape, focus and scroll restore, five filters only, accordions, narrow form, state panel placement, CSP/textContent/live region/style invariants, announcements | `t4`, `t5`, `t6` |
| board-wiring.test.ts command registration unchanged | `t7` |
| details-memory.test.ts kept() follows the current item screen | `t3` |
| board-perf.test.ts 500 items / 1,000 records: first render of All work within 1 s, each filter change and an open-epic within 150 ms, best of three | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails reduceBoardState / boardDownMessages / statusView; dataModelChanges BoardSelection, TrailEntry, BoardState, NavIntent`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails parseBoardUpMessage; dataModelChanges BoardScreen, ScreenModel, ScreenBody, StageSectionView, BoardDownMessage / BoardUpMessage, StatePanelView`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails createDeliveryBoardHost`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails renderBoardDocument / BOARD_WEBVIEW_SCRIPT`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails BOARD_STYLE`
- **[[c6]]** `prior-artifact` `LLD s1 contractDetails selectMatches / buildBoardViewModel / buildEpicRollup / buildIssueView (epic membership rule)`
- **[[c7]]** `prior-artifact` `LLD s1 contractDetails buildItemDetails; dataModelChanges ItemDetailsViewModel / EvidenceRowView; errorPaths details memory`
- **[[c8]]** `prior-artifact` `LLD s1 dataModelChanges DisplayLabels`
- **[[c9]]** `prior-artifact` `LLD s1 errorPaths invariant: 1 s first render, 150 ms filter change (board-perf.test.ts)`
- **[[c10]]** `doc` `docs/plans/delivery-board-screen-mocks.html` — "screens 1-14"
- **[[c11]]** `prior-artifact` `LLD s1 dataModelChanges field-remove BoardViewModel / EpicRollupViewModel / IssueViewModel / ColumnView / NOT_IN_EPIC_TITLE; migration step 6`
- **[[c12]]** `prior-artifact` `LLD s1 testStrategy (smoke level and acceptance mapping ac7)`
