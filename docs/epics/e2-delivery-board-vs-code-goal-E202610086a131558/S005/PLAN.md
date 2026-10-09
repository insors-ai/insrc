<!-- insrc:artifact PLAN-6a1315585c38c41c-s5 -->

# Plan: E202610096a131558:S005

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**LLD run:** `wf-1791547519791-sa3xxc`
**LLD effective hash:** `d362668c917b...`

Building s5 changes the board in three places. The page gains its first stylesheet, a density toggle and one announcement region. The host learns to say what changed, once per selection and once per finished refresh. The webview script becomes fully keyboard-operable and remembers the reader's density. A last task adds a 500-item fixture and a timing test that measures the host and the script together.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The board document: stylesheet, density control and the single announcer | S | — | unit: board-host.test.ts: 'a narrow pane stacks the columns into one list grouped by stage, and no rule hides a card, badge or warning' | [[c21]] [[c23]] [[c14]] |
| 2 | **`t2`** Host announcements for selection and settled refresh | M | — | integration: board-host.test.ts: 'a selection and a settled refresh are each announced once, and loading, superseded answers, reloads and other intents announce nothing' | [[c22]] [[c23]] |
| 3 | **`t3`** Webview keyboard: focusable cards, arrows, Escape and focus return | M | `t1` | integration: board-host.test.ts: 'every card is focusable and opens with Enter or Space, arrows move between cards, and closing the details returns focus to the card'; integration: board-host.test.ts: 'when the card that opened the details is gone, closing them focuses the shown view's tab' | [[c21]] [[c23]] [[c26]] |
| 4 | **`t4`** Webview announce region and density persistence | S | `t1` | integration: board-host.test.ts: 'the announce region is the only live region and is set once per message'; integration: board-host.test.ts: 'density is restored from the webview state, saved on change and mirrored to the host, and both densities render every badge, warning and label' | [[c22]] [[c25]] [[c23]] |
| 5 | **`t5`** The 500-item performance fixture and timing test | M | `t2`, `t3`, `t4` | integration: board-perf.test.ts: 'a 500-item, 1,000-record board renders within one second and each filter change within 150 ms, best of three' | [[c13]] [[c26]] |

### 1.1 E202610096a131558:S005:T001 — The board document: stylesheet, density control and the single announcer

Add one inline <style> to renderBoardDocument, using --vscode-* variables only. It lays the six columns out side by side when wide and stacks them below 600 px, with no hiding rule. body[data-density] changes only spacing and font size, and :focus-visible gets an outline. Add the #density-compact/#density-comfortable buttons (aria-pressed) and the #announce region (aria-live=polite, aria-atomic=true). Remove aria-live from #status, keeping role=status. The CSP is unchanged.

**Acceptance checks:**
- The stylesheet stacks the columns into one stage-grouped list under a max-width 600px media query and has no display:none, visibility:hidden or clipping rule.
- Density and focus rules exist and use only --vscode-* variables; the CSP string is unchanged.
- #announce is the only element with aria-live; #status keeps role=status.

### 1.2 E202610096a131558:S005:T002 — Host announcements for selection and settled refresh

The host posts { type: 'announce' } once when an accepted select-item changes the selected item: 'Selected: <title>', plus ' · <stage label>' when the item has a stage. It also posts one when a refresh settles: 'Board refreshed: N items, M needing attention', both counted over the snapshot's placeable items, or the status message for empty, unavailable or failed. The refresh announce goes after the applied try, in its own logging try. No announce for loading, superseded or closed answers, 'ready' or the other intents.

**Acceptance checks:**
- A select-item that changes the selection posts exactly one announce, after the view and details messages; reselecting the same item posts none, and neither does a selection whose item is not in the shown snapshot.
- A settled refresh posts exactly one announce with the snapshot-wide counts or the status message; loading, superseded and closed-panel answers post none.
- A webview reload ('ready') re-posts the board but no announce, and close-details, set-view, set-search, set-scope, set-attention, set-density and show-more post none.
- A throwing announce post is only logged and never turns a rendered board into a failed refresh.

### 1.3 E202610096a131558:S005:T003 — Webview keyboard: focusable cards, arrows, Escape and focus return

In BOARD_WEBVIEW_SCRIPT, give every card tabindex=0. Enter and Space (keydown) post select-item, and ArrowDown/ArrowUp move between #board's li.card elements with no wrap. When a details message names a new item, remember it and focus the details heading (tabindex=-1). Escape inside the details posts close-details. On a null model, focus returns to the li.card with the remembered id, or to the shown view's tab when that card is gone. The fake DOM gains body, activeElement, focus(), key events and querySelectorAll('li.card').

**Acceptance checks:**
- Every card in the board, rollup and issue views is focusable, keeps its aria-label (accessibleLabel), and posts select-item on Enter or Space.
- Arrow keys move focus between cards in document order without wrapping, with preventDefault so the pane does not scroll.
- Opening details focuses their heading, Escape posts close-details, and closing returns focus to the opening card, or to the shown view's tab when the card is gone.

### 1.4 E202610096a131558:S005:T004 — Webview announce region and density persistence

In the script, an 'announce' message clears #announce and then sets its text. On boot, the script reads density from getState(): a missing, invalid or throwing state reads as comfortable. It applies the density to body[data-density], marks the matching button pressed and posts set-density. A density button applies, saves (setState) and posts its density. The fake acquireVsCodeApi gains getState/setState.

**Acceptance checks:**
- Each announce message sets #announce once, to its text.
- Density is restored from saved state, or defaults to comfortable for missing or invalid state. A change is applied, saved and posted as set-density.
- Both densities render the same cards, badges, warnings and accessible labels.

### 1.5 E202610096a131558:S005:T005 — The 500-item performance fixture and timing test

Add largeSnapshot() to board-fixtures.ts: 20 epics, 400 stories with 2 evidence entries each across the six stages, and 80 issues, deterministic, with recordCount 1000. Add board-perf.test.ts. It times the host's derive and post plus the real script's DOM build on the fake DOM, for the first board and for each filter change (search, attention, scope), best of three, and reports the timings through diagnostics. By default it asserts 5× the targets; with INSRC_PERF=1 it asserts the exact 1 s and 150 ms.

**Acceptance checks:**
- The fixture has 500 items and recordCount 1000, and is deterministic.
- Timings are taken through createDeliveryBoardHost posting into the real BOARD_WEBVIEW_SCRIPT on the fake DOM, for the first render and each filter change, best of three, and reported.
- It asserts the 5× tripwire by default and the exact 1 s / 150 ms targets under INSRC_PERF=1.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| renderBoardDocument | `t1` |
| BOARD_WEBVIEW_SCRIPT | `t3`, `t4`, `t5` |
| createDeliveryBoardHost | `t2`, `t5` |

## 3. References

- **[[c13]]** `prior-artifact` `LLD s5 testStrategy: the measured performance fixture (ac5, k7: 1 s first render, 150 ms per filter change)`
- **[[c14]]** `prior-artifact` `LLD s5 contractDetails renderBoardDocument: the CSP stays unwidened (k8)`
- **[[c21]]** `prior-artifact` `LLD s5 contractDetails renderBoardDocument and BOARD_WEBVIEW_SCRIPT (stylesheet, regions, keyboard and focus return)`
- **[[c22]]** `prior-artifact` `LLD s5 contractDetails createDeliveryBoardHost announcements and the sc3 'announce'/'set-density' messages`
- **[[c23]]** `prior-artifact` `LLD s5 invariant k11: every state has a text label, keyboard reachability with visible focus, announcements without chatter, nothing hidden in a narrow pane`
- **[[c25]]** `prior-artifact` `LLD s5 dataModelChanges: webview state { density } and BoardSelection.density as its mirror`
- **[[c26]]** `prior-artifact` `LLD s5 testStrategy fixtures: the fake-DOM harness extensions and largeSnapshot()`
