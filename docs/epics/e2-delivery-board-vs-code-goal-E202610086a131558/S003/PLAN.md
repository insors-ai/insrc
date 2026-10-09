<!-- insrc:artifact PLAN-6a1315585c38c41c-s3 -->

# Plan: E202610096a131558:S003

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**LLD run:** `wf-1791535429046-07qmp1`
**LLD effective hash:** `d362668c917b...`

Building s3 exports the board's matching as one shared step and adds a new pure module, board-views.ts, with the epic rollup and issue-view builders on top of it. The extension then posts whichever view the reader has chosen and checks follow links against the board. Last, the webview gets Board, Epics and Issues tabs and draws the two new views as plain text.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The shared match step and the two view-model types | S | — | unit: board-model.test.ts: 'selectMatches returns the board's matches in snapshot order, each with its epic and card' | [[c1]] [[c5]] [[c6]] |
| 2 | **`t2`** Epic rollup builder | M | `t1` | unit: board-views.test.ts: 'an epic with five stories, two complete, reads 2 of 5 stories complete and groups its stories by stage'; unit: board-views.test.ts: 'standalone stories and issues sit in their own group and count towards no epic' | [[c2]] [[c7]] |
| 3 | **`t3`** Issue view builder | M | `t1` | unit: board-views.test.ts: 'an issue links to the story it corrects, and an issue with an unresolved parent is listed with its notice'; unit: board-views.test.ts: 'an issue with two fix stories lists each as its own child with its own stage' | [[c3]] [[c7]] |
| 4 | **`t4`** Host: post the selected view and check follow links | S | `t2`, `t3` | unit: board-views.test.ts: 'with a search and an epic scope, the rollup and issue view count the same matches as the board'; integration: board-host.test.ts: 'switching views posts the selected view with the same selection, and switching back keeps the board page'; integration: board-host.test.ts: 'a follow link naming an item that is not on the board is ignored and logged' | [[c4]] [[c7]] |
| 5 | **`t5`** Webview: view tabs, the rollup and the issue view | M | `t4` | integration: board-host.test.ts: 'the epic rollup and issue view render as text, and their tabs and links post only set-view and select-item' | [[c4]] [[c8]] |

### 1.1 E202610096a131558:S003:T001 — The shared match step and the two view-model types

Export the matching inside buildBoardViewModel as selectMatches (MatchedCard: item, epic, stage, card) with buildBoardViewModel built from it and unchanged in output, and declare StageGroupView, EpicGroupView, EpicRollupViewModel, LinkView, IssueEntryView and IssueViewModel in board-protocol.ts in place of unknown.

**Acceptance checks:**
- selectMatches returns every matching story and issue with a known stage, in snapshot order, with its epic and CardView.
- buildBoardViewModel builds from selectMatches and s2's seven board-model tests pass unchanged.
- EpicRollupViewModel and IssueViewModel match the LLD's interfaces, and the 'epics' and 'issues' down-messages carry them.

### 1.2 E202610096a131558:S003:T002 — Epic rollup builder

board-views.ts buildEpicRollup: one group per listed epic in snapshot order and a 'Not in an epic' group; standalone-flagged matches always go to 'Not in an epic'; story counts with a completion label that names its denominator; issue counts; non-empty stage groups in STAGE_ORDER; totals equal to the board's; emptySelection and selectedItemId.

**Acceptance checks:**
- An epic with five matching stories, two complete, reads '2 of 5 stories complete' and its cards are grouped by stage in STAGE_ORDER; one story reads '1 of 1 story complete'.
- Standalone stories and issues, including a standalone issue that corrects an epic story, are in 'Not in an epic' and in no epic's counts.
- An epic is listed when it has a match, is the scoped epic, or nothing narrows the selection; totals.items equals the board's totals.items for the same selection.
- emptySelection is true when the snapshot has cards but none match, and selectedItemId echoes the selection.

### 1.3 E202610096a131558:S003:T003 — Issue view builder

board-views.ts buildIssueView: each matching issue in snapshot order with its parent link (the story or epic its correctsRef resolves to) or its unresolved-parent notice (or a fixed 'Parent not on the board' text when the resolved id is missing), and each fix story among its children with its own stage.

**Acceptance checks:**
- An issue correcting a story has a parent link carrying that story's id, title and stage label; one correcting an epic links the epic with no stage label.
- An issue whose parent is unresolved is listed with parent null and its unresolved-parent notice message; a resolved id missing from the snapshot gives the fixed 'Parent not on the board' text when there is no notice; an issue with no correctsRef has neither.
- An issue with two fix stories lists both as separate entries with their own stage labels, whether or not they match the search; totals.issues equals the board's issue cards.

### 1.4 E202610096a131558:S003:T004 — Host: post the selected view and check follow links

boardDownMessages posts status then the board, epics or issues message by selection.view; the host's select-item checks the id against the shown snapshot and ignores and logs an absent one. Until t5 the webview has no tabs, so only the board is reachable from the UI.

**Acceptance checks:**
- After set-view 'epics' or 'issues' the host posts that view's model with the same scope, search and attention, and set-view 'board' posts the board with its paging kept.
- A select-item naming an id that is not in the shown snapshot posts nothing, changes no selection and logs one warn().
- A derive that throws on a view switch keeps the previous state, as for any intent.

### 1.5 E202610096a131558:S003:T005 — Webview: view tabs, the rollup and the issue view

BOARD_WEBVIEW_SCRIPT gains Board, Epics and Issues tabs posting set-view, renders the rollup (epic title, completion label, issue count, stage groups of cards, the 'Not in an epic' group) and the issue view (issue card, parent link or notice, fix stories with stages, 'No fix stories yet'), all with textContent; follow links post select-item.

**Acceptance checks:**
- An 'epics' message renders each group's title, completion label and stage groups as text, and an 'issues' message renders each issue with its parent link or notice and its fix stories with their stages, or 'No fix stories yet'.
- Titles and notices containing markup render literally; the fake DOM's innerHTML is never touched.
- The tabs post only set-view and the follow links only select-item, each accepted by parseBoardUpMessage.
- An empty selection in either view shows the nothing-matches message.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| selectMatches | `t1` |
| buildEpicRollup | `t2`, `t4` |
| buildIssueView | `t3`, `t4` |
| boardDownMessages | `t4` |
| createDeliveryBoardHost | `t4` |
| BOARD_WEBVIEW_SCRIPT | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 §2.1 buildBoardViewModel (selectMatches)`
- **[[c2]]** `prior-artifact` `LLD s3 §2.2 EpicRollupViewModel (buildEpicRollup)`
- **[[c3]]** `prior-artifact` `LLD s3 §2.3 IssueViewModel (buildIssueView)`
- **[[c4]]** `prior-artifact` `LLD s3 §2.4 boardDownMessages`
- **[[c5]]** `prior-artifact` `LLD s3 §3.1 board-protocol.ts EpicRollupViewModel and IssueViewModel field-modify`
- **[[c6]]** `prior-artifact` `LLD s3 §3.2 board-model.ts selectMatches`
- **[[c7]]** `prior-artifact` `LLD s3 §5 Error paths`
- **[[c8]]** `prior-artifact` `LLD s3 §6 Test strategy`
