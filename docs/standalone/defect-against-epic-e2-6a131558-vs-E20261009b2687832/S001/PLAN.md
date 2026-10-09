<!-- insrc:artifact PLAN-b2687832a8c75877-s1 -->

# Plan: E20261009b2687832:S001

## Summary

**Epic:** `defect-against-epic-e2-6a131558-vs`
**LLD run:** `wf-1791563353258-a8f9df`
**LLD effective hash:** `286bdb2c6cb9...`

Building this story reshapes the delivery board's pure view models first (card identifiers and task counts, epic rollup rows, the details chain and conflict, the freshness line and state panels, and a clear-filters message), then rewrites the webview document, stylesheet and renderers on top of them. Each step keeps the existing board test suite passing, and the last step re-checks the 1 s / 150 ms performance targets and rebuilds the extension.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Card compact identifier and task summary | M | — | unit: board-model.test.ts: compactId is 'ABCDEF01 / S001' for 'E20261009abcdef01:S001', 'ABCDEF01' for an epic-level 'E20261009abcdef01', 'ABCDEF01 / S002' for the H-form 'Habcdef0123456789:S002', and the full id for a ':R(<raw>)' fallback id; unit: board-model.test.ts: taskSummary is 'n/N tasks passed' from validation and null when validation is null or has no recorded tasks; unit: board-model.test.ts: accessibleLabel carries the compactId and task summary, and badges are unchanged | [[c1]] [[c2]] |
| 2 | **`t2`** Epic rollup rows replace stage groups | M | `t1` | unit: board-views.test.ts: buildEpicRollup returns one row per listed epic plus 'Not in an epic' with story, complete, task, issue and attention counts, and the row totals sum to the board's totals.items for the same selection; unit: board-views.test.ts: attentionLabel is 'No open gates' at 0, '1 needs attention' at 1, 'N need attention' otherwise; unit: board-views.test.ts: an epic row's compactId is the epic's compact id and the 'Not in an epic' row's compactId is null | [[c1]] [[c3]] |
| 3 | **`t3`** Details kicker, chips, artifact chain and structured conflict | M | `t1` | unit: board-details.test.ts: chain rows per route — full-chain story shows DEF/HLD from its epic plus LLD/PLAN/BUILD; small story has no PLAN row; small-bugfix has ISSUE and BUILD only; trivial has BUILD only; unknown lists recorded kinds only; a missing expected kind is 'Not recorded'; two BUILDs give two rows; unit: board-details.test.ts: a story with CR, SPEC, EXT and AMD evidence gets a chain without those kinds, they remain in Records, and buildItemDetails does not throw; unit: board-details.test.ts: conflict is { headline: 'Two records disagree', text } exactly when item.conflict is set; unit: board-details.test.ts: kicker, chips and TaskRowView.resultTone; unit: labels.test.ts: DISPLAY_LABELS carries chain.notRecorded, conflictHeadline and noMatchesTitle | [[c1]] [[c4]] [[c7]] |
| 4 | **`t4`** Freshness line and state panels in StatusView | M | — | unit: board-state.test.ts: statusView panel kinds — empty, unavailable, refresh-failed (stale with a shown snapshot, retry action), partial with affected entries from store notices and the unreadable count; freshnessLabel phrasing and NaN fallback; unit: board-state.test.ts: boardDownMessages with now keeps status first and the selected view's model second; integration: board-host.test.ts: the refresh announcement text is unchanged after statusView takes now | [[c1]] [[c5]] [[c8]] |
| 5 | **`t5`** clear-filters up-message | S | — | unit: board-protocol.test.ts: parseBoardUpMessage accepts { type: 'clear-filters' } and rejects it with extra fields; integration: board-host.test.ts: clear-filters resets search and attention, keeps scope and view, and resets paging; integration: board-host.test.ts: clear-filters with no snapshot shown posts only the status message | [[c1]] [[c6]] [[c8]] |
| 6 | **`t6`** Document chrome and stylesheet | L | `t4`, `t5` | integration: board-host.test.ts: CSP string unchanged, exactly one aria-live region, #details precedes #board; integration: board-host.test.ts: BOARD_STYLE has only var(--vscode-*) colours, no display:none/visibility:hidden/clip, six equal columns when wide, density rules and :focus-visible; integration: board-host.test.ts: BOARD_STYLE's 600 px block orders empty stage sections after non-empty ones and contains no hiding rule | [[c1]] [[c9]] [[c10]] |
| 7 | **`t7`** Board and epics renderers | M | `t1`, `t2`, `t6` | integration: board-host.test.ts: a rendered card shows its kicker, title, epic line, task summary and tone pills (data-tone) in the six-column board; integration: board-host.test.ts: every board column heading renders its label and a count chip holding the column total, for empty and non-empty stages alike; integration: board-host.test.ts: clicking a rollup row title posts set-scope for that epic (standalone for 'Not in an epic') and then set-view board, and the meter exposes completionLabel and aria-valuenow/max; integration: board-host.test.ts: scope and attention chips post set-scope / set-attention with aria-pressed; tabs are role=tab with aria-selected and arrow-key movement | [[c1]] [[c2]] [[c3]] [[c9]] |
| 8 | **`t8`** Details and panel renderers | M | `t3`, `t4`, `t5`, `t7` | integration: board-host.test.ts: opening a card shows #details before #board in DOM order with its heading focused, tasks as <details> rows with checks and dependency chips, and a 'Why this stage?' highlight with the stage reason; integration: board-host.test.ts: the conflict box is the first element after the details chips, before the task list; integration: board-host.test.ts: a view with emptySelection renders 'Nothing matches this view' with Clear filters posting clear-filters; Retry posts refresh; the partial panel's 'Inspect affected records' lists artifact ids; integration: board-host.test.ts: the script uses textContent only and posts only BoardUpMessage envelopes; Escape closes details and focus returns to the card or the tab | [[c1]] [[c4]] [[c5]] [[c6]] [[c9]] |
| 9 | **`t9`** Performance check and extension rebuild | S | `t8` | smoke: board-perf.test.ts: first render under 1 s and each filter change under 150 ms, best of three, on the 500-item / 1,000-record fixture with the new DOM | [[c9]] [[c10]] |

### 1.1 E20261009b2687832:S001:T001 — Card compact identifier and task summary

Add compactId and taskSummary to CardView (board-protocol.ts) and derive them in board-model.ts's cardOf from the item id (canonical E<date><hash8>[:S<nnn>], H-form, :R(<raw>) fallback) and item.validation; extend accessibleLabel. Every view picks them up through selectMatches.

**Acceptance checks:**
- compactId is 'ABCDEF01 / S001' for 'E20261009abcdef01:S001', 'ABCDEF01' for 'E20261009abcdef01', 'ABCDEF01 / S002' for 'Habcdef0123456789:S002', and the full id for a ':R(<raw>)' id
- taskSummary is { passed, total, label: 'n/N tasks passed' } from validation, and null when validation is null or passed+failed+unrecorded is 0
- accessibleLabel includes the compactId and the task summary
- No other card field or badge changes

### 1.2 E20261009b2687832:S001:T002 — Epic rollup rows replace stage groups

Introduce EpicRollupRowView, switch EpicRollupViewModel.epics / notInEpic to it, rewrite buildEpicRollup's groupOf to emit counts (stories, complete, tasks, issues, total, attention + label/tone, compactId), remove EpicGroupView and StageGroupView, and update the webview's renderEpics to render rows as text so the Epics tab keeps working until the full restyle.

**Acceptance checks:**
- One row per listed epic in snapshot order plus a 'Not in an epic' row; the listing rule is unchanged
- Row totals sum to the board's totals.items for the same selection (AC-09)
- taskCount counts planned tasks of the row's matching stories; attentionLabel is 'No open gates' / '1 needs attention' / 'N need attention' with matching tone
- Each epic row's compactId is the epic id's compact form; the 'Not in an epic' row's compactId is null
- EpicGroupView and StageGroupView no longer exist and nothing references them; the existing host tests still pass

### 1.3 E20261009b2687832:S001:T003 — Details kicker, chips, artifact chain and structured conflict

Extend ItemDetailsViewModel with kicker, chips and the route-aware chain (ChainRowView: DEF/HLD from the parent epic, ISSUE/LLD/PLAN/BUILD from the item, 'Not recorded' for expected-but-missing kinds, other kinds skipped), change conflict to { headline, text }, add TaskRowView.resultTone, and add the chain/conflict/no-matches labels to DisplayLabels. Update renderDetails minimally for the conflict object.

**Acceptance checks:**
- Chain per route: full-chain shows DEF/HLD/LLD/PLAN/BUILD; feature shows LLD/PLAN/BUILD; small has no PLAN row; small-bugfix has ISSUE and BUILD only; sized-bugfix has ISSUE/LLD/PLAN/BUILD; trivial has BUILD only; unknown lists recorded kinds only and no 'Not recorded'
- CR, SPEC, EXT and AMD evidence never becomes a chain row, stays in evidence, and never throws
- Two BUILD records give two BUILD rows in artifactId order
- conflict is { headline: 'Two records disagree', text } exactly when item.conflict is set; text equals today's sentence
- resultTone is success / danger / neutral for Passed / Failed / Unrecorded or Unplanned
- The existing host tests still pass

### 1.4 E20261009b2687832:S001:T004 — Freshness line and state panels in StatusView

Add freshnessLabel and panel to StatusView; change statusView(status, now) and boardDownMessages(..., now); thread deps.now() through the host's apply() and announceRefresh; update the existing three-argument test calls.

**Acceptance checks:**
- freshnessLabel: null with no snapshot; 'Updated just now' under a minute; 'Updated N minutes ago' under an hour; 'Updated <takenAt>' otherwise; raw takenAt when either time is unparseable, with no throw
- panel kinds: empty for an empty store; unavailable / refresh-failed with action retry and stale true when a snapshot is still shown; partial with affected entries from store notices and the unreadable count; null otherwise
- Every boardDownMessages and statusView call passes now, including board-state.test.ts:29/:36 and announceRefresh, and the plugin typechecks
- The refresh announcement text is unchanged; down-message order and kinds are unchanged

### 1.5 E20261009b2687832:S001:T005 — clear-filters up-message

Add { type: 'clear-filters' } to BoardUpMessage and parseBoardUpMessage, and handle it in createDeliveryBoardHost: reset search and needsAttentionOnly, keep scope and view, reset paging.

**Acceptance checks:**
- parseBoardUpMessage accepts { type: 'clear-filters' } and rejects it with extra or wrong-typed fields
- After clear-filters the selection has search '' and needsAttentionOnly false, the same scope and view, and paging is reset
- With no snapshot shown, clear-filters keeps the reset selection and posts only the status message

### 1.6 E20261009b2687832:S001:T006 — Document chrome and stylesheet

Rewrite renderBoardDocument (app bar with wordmark, breadcrumb, #status freshness and Read-only, Refresh and density; role=tablist underline tabs; chip toolbar with search, scope chips and the Needs attention chip; #totals; #announce; #panel; layout region with #details before #board) and BOARD_STYLE (six equal columns when wide, side-column details, tone pills mapped to --vscode-* variables, chips, meters, rollup rows, conflict box, panels, narrow grouped list with empty stages ordered last and wrapped, both densities, focus ring). Keep every element id the current script reads (#notice, #empty, #search, #scope, #attention, tab ids) alongside the new ones until t8 removes the old ones.

**Acceptance checks:**
- CSP string unchanged; exactly one aria-live region (#announce); #status keeps role=status without aria-live
- #details precedes #board in the DOM
- BOARD_STYLE uses only var(--vscode-*) colours and has no display:none, visibility:hidden or clipping rule
- .board is display:grid with repeat(6,minmax(0,1fr)) when wide and one list below 600 px, with empty stage sections ordered after the others
- Both density rules and the :focus-visible outline remain
- The existing host tests still pass

### 1.7 E20261009b2687832:S001:T007 — Board and epics renderers

Rewrite the board and epics builders in BOARD_WEBVIEW_SCRIPT: cards with kicker, title, epic line, task summary and tone pills; every stage heading with a count chip; rollup rows whose title posts set-scope (epic, or standalone for 'Not in an epic') then set-view board, with a labelled meter, task count and attention chip; scope and Needs attention chips posting the existing set-scope / set-attention messages; tabs as role=tab with aria-selected and arrow-key movement.

**Acceptance checks:**
- Every stage heading shows its label and a count chip, empty and non-empty alike
- A card renders kicker '<KIND> · <compactId>', title, epic line, task summary and data-tone pills
- Clicking a rollup row title posts set-scope for that epic (standalone for 'Not in an epic') and then set-view board; the meter exposes completionLabel and aria-valuenow/max
- Scope and attention chips post set-scope / set-attention with aria-pressed reflecting the selection; arrow keys move between tabs
- Text is set only through textContent and only BoardUpMessage envelopes are posted

### 1.8 E20261009b2687832:S001:T008 — Details and panel renderers

Rewrite renderDetails and the status rendering in BOARD_WEBVIEW_SCRIPT: kicker, chips, the conflict box first, task <details> rows with result and dependency chips and checks, the 'Why this stage?' highlight, chain rows, the existing Records/Notices/Linked sections; #panel for the status panel and, when a view's emptySelection is true, 'Nothing matches this view' with Clear filters (posts clear-filters); Retry posts refresh; the partial panel's 'Inspect affected records' disclosure; the freshness line in the app bar. Remove #empty, #notice and the old <select>/checkbox controls.

**Acceptance checks:**
- Opening a card shows #details before #board with its heading focused; the conflict box is the first element after the chips, before the task list
- Tasks render as <details> rows with result and dependency chips and acceptance checks; the chain shows 'Not recorded' rows from the model
- A view with emptySelection shows 'Nothing matches this view' with Clear filters posting clear-filters; Retry posts refresh; the partial panel lists affected artifact ids
- Escape closes details and focus returns to the card or the shown view's tab
- #empty, #notice, the scope <select> and the attention checkbox no longer exist

### 1.9 E20261009b2687832:S001:T009 — Performance check and extension rebuild

Give the perf fixture's stories tasks and validation so the new card and rollup values are exercised, re-run the 1 s / 150 ms targets with the new DOM, and rebuild the VS Code extension package.

**Acceptance checks:**
- board-perf.test.ts passes: first render under 1 s and each filter change under 150 ms, best of three, on the 500-item / 1,000-record fixture
- The plugin suite shows no new failures beyond the known manifest-catalog failure
- npm run package in vscode-plugin produces the extension package

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| board-model.ts cardOf via buildBoardViewModel / selectMatches | `t1` |
| board-views.ts buildEpicRollup / buildIssueView | `t1`, `t2` |
| board-details.ts buildItemDetails | `t3` |
| board-state.ts statusView / boardDownMessages | `t4` |
| board-protocol.ts parseBoardUpMessage | `t5` |
| labels.ts DISPLAY_LABELS | `t3` |
| board-host.ts renderBoardDocument / BOARD_STYLE / BOARD_WEBVIEW_SCRIPT / createDeliveryBoardHost | `t4`, `t5`, `t6`, `t7`, `t8` |
| board-perf.test.ts 500-item / 1,000-record fixture through the real host and script | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api (buildBoardViewModel, buildEpicRollup, buildIssueView, buildItemDetails, statusView, boardDownMessages, renderBoardDocument, BOARD_STYLE, BOARD_WEBVIEW_SCRIPT, createDeliveryBoardHost)`
- **[[c2]]** `prior-artifact` `LLD s1 dataModelChanges: CardView field-add (compactId, taskSummary)`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: EpicRollupRowView new, EpicRollupViewModel field-modify`
- **[[c4]]** `prior-artifact` `LLD s1 dataModelChanges: ChainRowView new, ItemDetailsViewModel field-add (kicker, chips, chain, structured conflict, resultTone)`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges: StatusView field-add (freshnessLabel, panel)`
- **[[c6]]** `prior-artifact` `LLD s1 dataModelChanges: BoardUpMessage field-add (clear-filters)`
- **[[c7]]** `prior-artifact` `LLD s1 dataModelChanges: DisplayLabels field-add (chain.notRecorded, conflictHeadline, noMatchesTitle)`
- **[[c8]]** `prior-artifact` `LLD s1 errorPaths (errorCases, edgeCases, invariantsToPreserve)`
- **[[c9]]** `prior-artifact` `LLD s1 testStrategy (testLevels, acceptanceMapping ac1-ac8)`
- **[[c10]]** `prior-artifact` `LLD s1 migration (stateBefore, stateAfter, migrationSteps, backwardCompat)`
