<!-- insrc:artifact PLAN-6a1315585c38c41c-s2 -->

# Plan: E202610096a131558:S002

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**LLD run:** `wf-1791526663756-5pux7j`
**LLD effective hash:** `6e5370449cb5...`

Building s2 adds one pure module, board-model.ts. It turns the shown snapshot and the reader's scope, search and attention filter into six stage columns of cards with text badges, counted before paging. The protocol gains the view-model types and the show-more intent. The host replaces s1's interim item list with the 'board' message, keeps per-column paging, logs unknown stages once per refresh, and survives a render that throws. The webview script then draws the columns, cards and controls as plain text.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** View-model types, the show-more intent and the wider item mirror | S | — | unit: board-protocol.test.ts: 'show-more is accepted only for one of the six stages' | [[c4]] [[c6]] [[c7]] |
| 2 | **`t2`** Board model: filtering, columns, counts and paging | M | `t1` | unit: board-model.test.ts: 'six columns in workflow order hold every story and issue exactly once, in the column the snapshot assigns'; unit: board-model.test.ts: 'with an epic scope and a search, cards, hidden counts, column totals and totals agree, and clearing both restores the full set'; unit: board-model.test.ts: 'the same snapshot and filters give an identical model, including items with equal timestamps'; unit: board-model.test.ts: 'unknownStages counts every stage id outside the six, and those items are in no column' | [[c1]] [[c2]] [[c5]] [[c9]] |
| 3 | **`t3`** Card badges, titles and accessible labels | M | `t2` | unit: board-model.test.ts: 'an approved build with failed tasks stays in Complete and carries a text-labelled validation-conflict badge'; unit: board-model.test.ts: 'a review-blocked design shows a Review blocked badge, matches Needs attention and keeps its column'; unit: board-model.test.ts: 'a failed story-level result shows Validation failed, badges never repeat a label, and the accessible label names every badge' | [[c1]] [[c9]] |
| 4 | **`t4`** Host: the board message, paging and safe derive paths | M | `t3` | integration: board-host.test.ts: 'show-more reveals the next page of one column, and a new search resets paging'; integration: board-host.test.ts: 'an item with an unknown stage is left off the board and logged once per refresh'; integration: board-host.test.ts: 'a selection change that cannot be rendered keeps the previous board and is logged' | [[c3]] [[c5]] [[c8]] [[c9]] |
| 5 | **`t5`** Webview rendering of the board and its controls | M | `t4` | integration: board-host.test.ts: 'the board view renders titles and notices containing markup and script as literal text'; integration: board-host.test.ts: 'the board controls post only board up-messages, the scope control lists every epic, and an empty selection says nothing matches' | [[c4]] [[c10]] |

### 1.1 E202610096a131558:S002:T001 — View-model types, the show-more intent and the wider item mirror

Declare BadgeView, CardView, ColumnView and BoardViewModel in board-protocol.ts in place of unknown, add the 'show-more' { stage } up-message (AMD-6a1315585c38c41c-2) to BoardUpMessage and parseBoardUpMessage, and widen DeliveryItemView with standalone, sourceIds, validation, conflict and correctsRef.

**Acceptance checks:**
- BoardViewModel, ColumnView, CardView and BadgeView match the sc5 sketch, and the 'board' down-message carries a BoardViewModel.
- parseBoardUpMessage accepts show-more whose stage is one of STAGE_ORDER and rejects any other stage or a missing one.
- DeliveryItemView picks the five added fields and E1's contract test still compiles the mirror; the 'items' variant stays in BoardDownMessage.

### 1.2 E202610096a131558:S002:T002 — Board model: filtering, columns, counts and paging

board-model.ts with each item's epic (a story's parent epic; an issue's corrected epic, or the epic of its corrected story), buildBoardViewModel's matching (scope, search, attention), STAGE_ORDER columns in snapshot order, totals counted before paging, BoardPaging with BOARD_PAGE_SIZE and showMore, scopeOptions, emptySelection, and unknownStages.

**Acceptance checks:**
- Six columns in workflow order hold every story and issue with a known stage exactly once, in the column its stage names, in snapshot order; epics, tasks and stage-less items are not cards.
- Scope all, epic and standalone, a trimmed case-insensitive substring search over title, id, source ids and epic title, and Needs attention select exactly the matching items.
- For every column total = cards.length + hiddenCount and cards.length = min(total, limit); totals sum the columns; showMore raises one column by BOARD_PAGE_SIZE.
- unknownStages returns every unknown stage id with its count; those items are not in any column or total.
- The same arguments give a deep-equal model.

### 1.3 E202610096a131558:S002:T003 — Card badges, titles and accessible labels

Build each card's title (id when null), epic title (from t2's epic resolution), standalone flag and badges in the fixed order (approval, review, validation with storyLevelResult, conflict, attention, notice) with labels from DISPLAY_LABELS and de-duplication by label, plus the accessible label.

**Acceptance checks:**
- An approved build with failed tasks is a Complete card with a Validation conflict badge.
- A blocking review gives a Review blocked badge with tone danger; an overridden one gives tone neutral.
- Tasks that all passed with a failed storyLevelResult give Validation failed, never Passed.
- No two badges on a card share a label, and accessibleLabel names kind, title, stage, standalone or epic, Needs attention and every badge in order.

### 1.4 E202610096a131558:S002:T004 — Host: the board message, paging and safe derive paths

boardDownMessages(state, labels, paging) posts status then 'board'; the host keeps BoardPaging, answers show-more, resets paging on scope, search or attention changes, ignores an unknown set-scope epic id, logs unknownStages once per applied refresh, and keeps the previous state on any derive that throws. The s1 tests that read 'items' from the host and state move to 'board'. Until t5 the webview script still renders only 'items', so the board shows its status line alone between t4 and t5; the webview's own test moves with t5.

**Acceptance checks:**
- After a snapshot the host posts status then one 'board' message and never 'items'.
- show-more raises one column's page; a new scope, search or attention resets paging; a refresh keeps it.
- An unknown stage logs exactly one warn() per applied refresh, and none on selection changes or show-more.
- A selection change, show-more or ready whose rendering throws keeps the previous state and paging, posts nothing and logs through error().
- The s1 tests in board-state.test.ts and board-host.test.ts that read the host's messages read 'board' and pass; the unlabelled-stage raw-id assertion is retired.

### 1.5 E202610096a131558:S002:T005 — Webview rendering of the board and its controls

Extend BOARD_WEBVIEW_SCRIPT to render the 'board' message: six columns with labels and totals, cards with title, kind, epic or standalone and text badges, a show-more control per column with hidden cards, the empty-selection message, and search, scope and Needs attention controls that post set-search, set-scope and set-attention, all with textContent. The s1 webview test moves from 'items' to 'board'.

**Acceptance checks:**
- A 'board' message renders six columns with their label and total, and every card's title, kind and badge labels as text.
- A title or notice containing markup or script is shown literally; the fake DOM's innerHTML is never touched.
- Show-more, search, scope and attention controls post only show-more, set-search, set-scope and set-attention envelopes that parseBoardUpMessage accepts.
- The scope control offers All, Standalone and every scopeOptions epic, and emptySelection shows a nothing-matches message with the controls still set.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildBoardViewModel | `t2`, `t3` |
| showMore | `t2`, `t4` |
| parseBoardUpMessage (show-more) | `t1` |
| unknownStages | `t2`, `t4` |
| createDeliveryBoardHost | `t4` |
| boardDownMessages | `t4` |
| BOARD_WEBVIEW_SCRIPT | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 §2.1 BoardViewModel (buildBoardViewModel)`
- **[[c2]]** `prior-artifact` `LLD s2 §2.2 BoardPaging (BOARD_PAGE_SIZE, showMore)`
- **[[c3]]** `prior-artifact` `LLD s2 §2.3 boardDownMessages`
- **[[c4]]** `prior-artifact` `LLD s2 §2.4 BoardUpMessage (show-more; AMD-6a1315585c38c41c-2)`
- **[[c5]]** `prior-artifact` `LLD s2 §2.5 unknownStages`
- **[[c6]]** `prior-artifact` `LLD s2 §3.1 board-protocol.ts BoardViewModel field-modify`
- **[[c7]]** `prior-artifact` `LLD s2 §3.2 delivery-contract.ts DeliveryItemView field-add`
- **[[c8]]** `prior-artifact` `LLD s2 §3.3 BoardPaging (host memory)`
- **[[c9]]** `prior-artifact` `LLD s2 §5 Error paths`
- **[[c10]]** `prior-artifact` `LLD s2 §6 Test strategy`
