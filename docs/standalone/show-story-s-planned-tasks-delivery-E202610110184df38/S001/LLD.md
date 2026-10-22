<!-- insrc:artifact LLD-0184df38314415ae-s1 -->

# LLD: E202610110184df38:S001

## Summary

**Epic:** `show-story-s-planned-tasks-delivery`
**HLD base run:** `wf-1791707694485-8iesyh`
**HLD effective hash:** `0184df383144...`

A story's planned tasks on the Delivery board become a table: one row per task with its short ID, title, result, dependencies as short-ID chips (full title on hover) and a count of acceptance checks that opens them as a plain list under the row. The row model gains the task's short ID and each dependency's short ID and title, so the webview only lays them out. The counts line, the no-plan message and the plan notice stay; the checkbox glyphs that read as unticked go away.

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

**Surface level:** internal

### 2.1 `TaskRowView`

```typescript
interface TaskRowView { readonly taskItemId: string; readonly shortId: string; readonly title: string | null; readonly resultLabel: string; readonly planned: boolean; readonly dependsOn: readonly TaskDependencyView[] | null; readonly acceptanceChecks: readonly string[] | null; readonly resultTone: BadgeView['tone'] } interface TaskDependencyView { readonly shortId: string; readonly title: string }
```

**Returns:** `TaskRowView` — One table row. shortId is new; dependsOn changes from titles to { shortId, title } pairs; every other field keeps its meaning (board-protocol.ts:122-133).

**Postconditions:**
- dependsOn and acceptanceChecks stay null while the story's PLAN is loading or could not be read, as today.

### 2.2 `taskRows`

```typescript
function taskRows(item: DeliveryItemView, plan: PlanRead, byId: ItemIndex, labels: DisplayLabels): TaskRowView[]
```

**Parameters:**
- `item: DeliveryItemView` — The story whose tasks become rows.
- `plan: PlanRead` — The story's PLAN read: dependencies and acceptance checks come from it.
- `byId: ItemIndex` — Snapshot index to resolve task items.
- `labels: DisplayLabels` — Result and unplanned labels.

**Returns:** `TaskRowView[]` — One row per story task, in story order (board-details.ts:40-62).

**Postconditions:**
- shortId is the last ':'-separated segment of taskItemId (E1:S001:T002 gives T002; an id with no ':' is itself).
- Each dependency is { shortId, title } from the task item it joins to (the same sourceIds join as today): shortId by the rule above, title by titleOf. A dependency with no task item keeps its raw PLAN id as both shortId and title.

### 2.3 `BOARD_WEBVIEW_SCRIPT taskList`

```typescript
taskList(box: HTMLElement, d: ItemDetailsViewModel): void  // inside the webview script string in board-host.ts
```

**Parameters:**
- `box: HTMLElement` — The overview column the section is appended to.
- `d: ItemDetailsViewModel` — The selected item's details, carrying tasks, taskCounts and planNotice.

**Returns:** `void` — Appends the 'Planned tasks' label, the counts line, then either 'No task plan recorded yet.' or a .table-wrap holding table.records.tasks (aria-label 'Tasks'), then the plan notice (board-host.ts:227-235).

**Postconditions:**
- Header row: ID, Task, Result, Depends on, Checks.
- Each task row has data-item-id = taskItemId; ID cell is shortId; Task cell is title, or taskItemId when the title is null; Result is the existing pill with its tone.
- Depends on: one neutral chip per dependency showing shortId with title as its hover title; a muted dash when dependsOn is null or empty.
- Checks: a link-style button '<n> checks' (or '1 check') with aria-expanded; clicking it shows or hides the next row, which spans the remaining columns and lists the checks as a plain list: one line each, with no bullet marks and no checkbox glyphs (list-style none), as in the approved mock. With no checks (null or empty) the cell is a muted dash and there is no checks row.
- The open choice is kept in openOf under model.entryId + ':checks:' + taskItemId, so a re-render (refresh) keeps it.

## 3. Data model changes

### 3.1 `TaskRowView` — field-modify

Adds shortId: string; dependsOn changes from readonly string[] | null to readonly TaskDependencyView[] | null. Webview-only protocol; nothing is persisted. The old dependency-pill and checkbox CSS (.task, .checks) is replaced by the table's own rules.

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-details.ts`
- `vscode-plugin/src/delivery/board-host.ts`

## 4. Error paths

**Error cases**

- **The story's PLAN could not be read.** (recoverable)
  - Detection: taskRows receives a PlanRead whose state is not 'ok', so no PLAN task joins to a row.
  - Response: dependsOn and acceptanceChecks stay null; the table still lists every task with its ID, title and result, the Depends on and Checks cells show a muted dash, and the existing plan notice renders under the table.
  - User impact: Tasks and results stay visible; only dependencies and checks are missing, with the notice explaining why.
- **A PLAN dependency names a task id that no task item carries.** (recoverable)
  - Detection: The sourceIds join in taskRows finds no task item for the dependency id.
  - Response: The dependency is { shortId: <raw id>, title: <raw id> }, shown as a chip with the raw id.
  - User impact: The reader still sees the dependency, by its PLAN id.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A story with no tasks. | No table; 'No task plan recorded yet.' as today. |
| A task item missing from the snapshot (title null). | The Task cell shows taskItemId, as the old summary did; the ID cell still shows the short id. |
| A task with exactly one acceptance check. | The toggle reads '1 check'. |
| A task with an empty check list, or while the PLAN is loading. | The Checks cell is a muted dash and no checks row exists. |
| The board re-renders (refresh, snapshot update) while a task's checks are open. | The checks stay open: the choice is read back from openOf under the screen entry and task id. |
| Opening another story, then going Back. | Each story's open choices are its own (keyed by the screen entry), as for the board's other folds. |
| A task id with no ':' separator. | shortId is the whole id. |
| A narrow editor column. | The table scrolls horizontally inside .table-wrap, as the Records table does. |

**Invariants to preserve**

- Rows follow the story's task order, and a PLAN task with no matching task item is not a row (the sourceIds join in taskRows, board-details.ts:40-62). [[c1]]
- dependsOn and acceptanceChecks are null until the PLAN read arrives, and the counts line, the 'No task plan recorded yet.' message and the plan notice keep their places (taskList, board-host.ts:227-235). [[c2]]
- The webview builds DOM with textContent and attributes only, never innerHTML (the board-webview-harness fake DOM throws on innerHTML). [[c3]]
- Fold choices live in openOf keyed by the screen entry, so they survive re-renders (board-host.ts:103, 161-162, 171). [[c2]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (vscode-plugin/src/**/__tests__/*.test.ts); the board-webview-harness fake DOM runs the real BOARD_WEBVIEW_SCRIPT`

**Test levels**

- **unit** — The row model: short ids and dependency pairs built in taskRows.
  - Subjects: `taskRows gives each row its short id (last ':' segment; the whole id when there is none)`, `taskRows gives each dependency its task item's short id and title, and the raw PLAN id for both when no task item joins`, `dependsOn and acceptanceChecks stay null while the PLAN is loading or failed`
  - Fixtures: `vscode-plugin/src/delivery/__tests__/board-fixtures.ts (item, snapshot)`
- **integration** — The rendered story screen through the real webview script on the fake DOM.
  - Subjects: `the Planned tasks section renders table.records.tasks with ID, Task, Result, Depends on and Checks headers and one row per task`, `a row shows the short id, the title (or the task item id), the result pill with its tone, and dependency chips with the full title as their hover title, or a dash`, `the checks toggle reads '<n> checks' or '1 check', starts closed, opens a row listing the checks as plain lines with no bullet or checkbox glyph, and its aria-expanded follows`, `an open checks row stays open across a re-render (openOf under the screen entry)`, `no task plan: 'No task plan recorded yet.' and no table; the plan notice still renders`, `the evidence tab still shows no task rows`
  - Fixtures: `vscode-plugin/src/delivery/__tests__/board-webview-harness.ts`, `vscode-plugin/src/delivery/__tests__/board-host.test.ts liveBoard/onStory helpers`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `ac1: each task row carries its short id, and each dependency its short id and full title, built from the PLAN-to-task-item join — proven by board-details.test.ts: taskRows short ids and dependency pairs` |
| `ac2` | `ac2: the story screen shows the tasks as a table with ID, Task, Result, Depends on and Checks columns; dependencies as short-id chips with the title on hover; checks behind a count toggle as a plain list — proven by board-host.test.ts: the story's tasks render as a table with the five columns, chips and checks toggle` |
| `ac3` | `ac3: a task's open checks stay open across a re-render — proven by board-host.test.ts: an open checks row stays open across a re-render` |

## 6. Migration

**State before:** taskRows (board-details.ts:40-62) gives each row dependsOn as dependency titles; taskList (board-host.ts:227-235) renders each task as a <details class='task'> with only the title in its summary, a 'Depends on <titles>' pill and a ballot-box check list (s1 bundles).

**State after:** TaskRowView carries shortId and dependsOn as { shortId, title } pairs; taskList renders a table.records tasks table with ID, Task, Result, Depends on chips and a checks toggle whose open choice is kept in openOf. The .task/.checks CSS is replaced by table rules.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Change TaskRowView and taskRows to the new row shape and update the view-model tests. — ↩ rollbackable
2. Replace taskList's details blocks with the table, swap the task CSS, and update the host tests that pin the old markup. — ↩ rollbackable

**Backward compat:** TaskRowView is a webview-only protocol between the extension host and its own webview script, which ship together in one .vsix, so no other consumer sees the shape change. Nothing is persisted: the openOf fold memory lives only in the webview's session.

## 7. Alternatives considered

### 7.1 a1: Host-built short ids, webview table — **CHOSEN**

TaskRowView gains shortId, and dependsOn becomes {shortId, title} pairs built in taskRows; the webview renders a table from them.

taskRows in board-details.ts computes each row's shortId (the last ':'-separated segment of the task item id, so E1:S001:T002 gives T002) and each dependency as { shortId, title } (the dependency's task item short id and titleOf, or the raw PLAN id for both when no task item matches). TaskRowView in board-protocol.ts carries shortId and the new dependsOn shape. taskList in BOARD_WEBVIEW_SCRIPT draws a table.records tasks table: ID, Task, Result pill, Depends on chips (shortId text, title as the hover title), and a Checks toggle button (aria-expanded) that shows or hides a following row holding the checks as a plain list; the open choice is kept in openOf under the screen entry. The counts line, the empty message and the plan notice stay where they are.

### 7.2 a2: Webview derives short ids

Keep TaskRowView as is (dependsOn titles) and derive short ids in the webview script from taskItemId and by matching titles.

Only the BOARD_WEBVIEW_SCRIPT changes: it shortens taskItemId itself and maps each dependency title back to a row by matching titles to get its short id.

**Rejected because:** Violates correct dependency ids: title matching fails on duplicate titles and dependencies without a task item.

### 7.3 a3: Dependencies as task item ids

dependsOn carries the dependencies' full task item ids; the webview shortens them and looks titles up among the rows.

taskRows maps each dependency to its task item id (or the raw PLAN id); the webview shortens ids and finds titles by looking up the rows of the same story.

**Rejected because:** Partial on the mock's hover titles (none for a dependency outside the table) and on testability (rule split across host and webview).

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/delivery/board-details.ts` — "function taskRows(item: DeliveryItemView, plan: PlanRead, byId: ItemIndex, labels: DisplayLabels): TaskRowView[] {"
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-host.ts` — "`function taskList(box,d){box.appendChild(label('Planned tasks'));`,"
- **[[c3]]** `code` `vscode-plugin/src/delivery/__tests__/board-webview-harness.ts` — "/** A fake DOM element: records text, attributes, children, listeners and form values; innerHTML throws. */"
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-protocol.ts` — "export interface TaskRowView {"
- **[[c5]]** `prior-artifact` `/tmp/board-shot/mock.png (the layout the user approved)`

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 1 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-11T08:38:29.324Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | The open checks row lists the checks as a 'plain bulleted list' (§2.3 postcondition). | In the mock the open T002 checks row shows plain indented lines with no bullet marks, such as 'stop cancels the provider turn…' and 'stop or detach while a turn waits…'. The design's own Summary says 'opens them as a plain list'. Only the §2.3 postcondition says 'bulleted', so the design contradicts the mock and itself. [files: /tmp/board-shot/mock.png] | State that the checks render as an unbulleted list (ul with list-style:none and no ::before glyph), matching the mock, or confirm that bullets are wanted. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The ac1–ac3 acceptance criteria named in §5 trace to an upstream spec or triage record. | I grepped the repo for '0184df38'. It matches only the LLD itself (docs/standalone/.../S001/LLD.md and .insrc/artifacts/LLD-0184df38314415ae-s1.json). No SPEC or triage artifact defines ac1..ac3, so I could not check the criteria's wording against an upstream source. | Spell out ac1–ac3 in the LLD, or link the triage/spec record that defines them. |
