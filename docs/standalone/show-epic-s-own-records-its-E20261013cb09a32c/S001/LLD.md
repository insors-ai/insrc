<!-- insrc:artifact LLD-cb09a32ccdc4ed2b-S001 -->

# LLD: E20261013cb09a32c:S001

## Summary

**Epic:** `show-epic-s-own-records-its`
**HLD base run:** `wf-1791911363310-x752cu`
**HLD effective hash:** `cb09a32ccdc4...`

On the delivery board, an Epic's own screen now lists the Epic's records (its definition, its high-level design, amendments and spec) with their approval and review state, above the Epic's stages. Each row has the same button a Story's record has: a record that can be reviewed opens in the document review pane, with its diagrams and mocks as tabs; any other opens read-only under the table. Acceptance: ac1, an Epic's board lists the Epic's own records with their approval and review state, also when the Epic has no stories or no story matches the filter; ac2, a row's button opens the record in the review pane when it can be reviewed and read-only on the board otherwise; ac3, Stories' and issues' screens and the list screens are unchanged.

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

**Framework:** Standalone Story — no parent HLD. Designed directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `recordOwnerId`

```typescript
recordOwnerId(selection: BoardSelection): string | null
```

**Parameters:**
- `selection: BoardSelection` — The board's current selection (its trail of screens).

**Returns:** `string | null` — The id of the item whose records are on show: the item of an 'item' screen, the Epic of an 'epic' screen, null on a list screen. New, in board-state.ts beside currentItemId, which stays as it is for its other users. createDeliveryBoardHost passes recordOwnerId(next.selection) to memory.kept in place of currentItemId(next.selection); that is the only change in the host's TypeScript.

**Errors:**
- `none thrown` when Pure function of the selection.

**Preconditions:**
- The selection has a current entry, as it always does

**Postconditions:**
- On an item screen it returns what currentItemId returns
- On an Epic's board the memory's selection is the Epic's id, so openEvidence accepts a record of that Epic and refuses any other
- Leaving the Epic's board for a Story, another Epic or a list changes the selection, so the memory drops the opened record as it does today on any change of selection
- An Epic selection reads no plan: planIdOf returns null for an item that is not a story

### 2.2 `screenBodyOf (the 'epic' case)`

```typescript
case 'epic': body = { ...buildBoardViewModel(snapshot, scope epic, paging, labels), epic: epicRowOf(...), epicRecords: epicRecordsOf(detailsOf(epic.id)) }
```

**Parameters:**
- `detailsOf: (itemId: string) => ItemDetailsViewModel | null` — The existing callback the host gives boardDownMessages; it is memory.model over the shown snapshot, which builds details for any item, an Epic included, and attaches the opened record when the item is the memory's selection.

**Returns:** `StagesBody` — The Epic's board as today plus epicRecords: { itemId: the Epic's id, evidence: the details' evidence rows (one per record of the Epic, in the snapshot's order), openedRecord: the details' opened record or null }. epicRecords is built from the Epic item alone, so the search text and the needs-attention filter do not change it. When detailsOf returns null (it does only when the item is not in the snapshot, and the case has already returned for that) epicRecords is null. buildBoardViewModel sets epicRecords: null, so All work and Standalone carry none.

**Errors:**
- `none thrown` when An Epic with no evidence gives an empty rows list; the webview then says 'No records yet.' as a Story's table does.

**Preconditions:**
- The Epic is in the snapshot (the case returns null otherwise, as today)

**Postconditions:**
- An Epic's board body carries the Epic's records whatever the filter
- Every other screen's body is built as before; a StagesBody of a list screen has epicRecords null

### 2.3 `renderStages (webview)`

```typescript
renderStages(b): if(b.epicRecords!==null) bodyEl.appendChild(epicRecordsBox(b.epicRecords)); then as today
```

**Parameters:**
- `b.epicRecords: EpicRecordsView | null` — The Epic's records and the opened read-only record.

**Returns:** `void` — A box of class 'epic-records' is drawn first in the body, BEFORE the totals line and before the early return for the no-matches panel, so the records are there when no story matches. It holds the existing recordsTable(box, d) (label 'Records', the table, or 'No records yet.'), whose buttons send { type: 'open-evidence', itemId: d.itemId, artifactId } with the Epic's id, and under it the opened record (label 'Record <id>' and its text in a pre), drawn by one function shared with a Story's recordsTab so the two cannot drift. All text is set with the webview's make(), which sets textContent.

**Errors:**
- `none thrown` when A read-only record that cannot be read is shown as the memory's 'Could not read <id>: <message>' text under the table, as on a Story's tab.

**Preconditions:**
- recordsTable reads only d.evidence and d.itemId, which EpicRecordsView has

**Postconditions:**
- The table is above the totals and the stage sections on an Epic's board only
- A Story's Workflow evidence tab is drawn as before

## 3. Data model changes

### 3.1 `StagesBody` — field-add

One required field, epicRecords: EpicRecordsView | null. null on All work and Standalone; the Epic's records on an Epic's board. Host-to-webview message shape only; nothing is stored and the daemon contract is unchanged.

```
StagesBody { kind; epic; + epicRecords: EpicRecordsView | null; totalsLabel; showAll; sections; fold; emptyPanel }
```

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `EpicRecordsView` — new-entity

The Epic's records as shown: the Epic item's id (sent back by a row's button), its evidence rows and the opened read-only record. The rows are the existing EvidenceRowView and the record the existing OpenedRecord.

```
+ EpicRecordsView { itemId: string; evidence: readonly EvidenceRowView[]; openedRecord: OpenedRecord | null }
```

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

## 4. Error paths

**Error cases**

- **A read-only record of the Epic (an amendment, a spec) cannot be read** (recoverable)
  - Detection: client.evidence fails or throws in the memory's readRecord
  - Response: As for a Story's record today: the failure is logged and the opened record's text is 'Could not read <id>: <message>', shown under the Epic's table
  - User impact: The reader sees why the record did not open; the table and the board stay usable
- **There is no review pane (chat is disabled, so none was wired)** (recoverable)
  - Detection: deps.reviewPane is undefined in openEvidence
  - Response: As for a Story's record today: the record is read and shown read-only under the table
  - User impact: The DEF or HLD opens as text on the board instead of in the pane
- **open-evidence names a record that is not the Epic's on show (a stale button after a refresh, or a forged message)** (recoverable)
  - Detection: openEvidence finds the item is not the selection or the artifact is not in its evidence
  - Response: Refused and logged, as today
  - User impact: Nothing opens
- **A refresh removes the Epic while its board is on show** (recoverable)
  - Detection: The existing check that the screen's Epic is in the snapshot
  - Response: Unchanged: the board leaves the screen as it does today; the memory's snapshot change drops the opened record
  - User impact: As today

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An Epic with no stories | Its board shows the records table, then the totals and the empty stages as today |
| A search or the needs-attention filter leaves no story matching on an Epic's board | The records table is still shown, above the no-matches panel |
| An Epic with no records | The box shows 'No records yet.' |
| The reader opens an amendment read-only, then opens a Story of the Epic | The selection changes, so the opened record is dropped; coming back to the Epic's board shows the table with nothing opened |
| The reader opens an amendment read-only, then presses Open in review on the HLD | The HLD opens in the review pane; the amendment's text stays under the table (an open in the pane does not replace the read-only record, as on a Story's tab today) |
| A refresh brings a new snapshot while a read-only record is shown | The memory drops the opened record, as it does for a Story today |
| A record read is still in flight when the reader leaves the Epic's board | The memory's epoch check drops the late answer, as today |
| A record's id or labels contain markup characters | Shown as text; the webview sets textContent only |
| All work or Standalone | epicRecords is null and nothing is drawn |

**Invariants to preserve**

- Only a record of the memory's selection can be opened [[c3]]
- The webview sends ids only and the host resolves them against the shown snapshot [[c4]]
- A selection or snapshot change drops the opened record and any read in flight [[c3]]
- The board builds every body from the shown snapshot and the memory alone; no daemon call is added [[c2]]
- The webview sets text with textContent only [[c5]]
- A Story's and an issue's screen, and the four list screens, are unchanged [[c2]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), as the plugin's delivery tests are; the webview is run through board-webview-harness.ts and snapshots come from board-fixtures.ts`

**Test levels**

- **unit** — The model: what an Epic's board carries and who owns the records on show.
  - Subjects: `board state: an epic's board carries the epic's own records, built as a story's are, whatever the search and the needs-attention filter; a list screen carries none`, `board state: the record owner is the item of an item screen and the epic of an epic's board, and nothing on a list screen`, `board state: a story's screen and the list screens are built exactly as before`
- **integration** — The memory with an Epic selected, the webview drawing the table, and the host end to end.
  - Subjects: `details memory: with an epic selected, one of its records opens in the review pane when it has a path and is read and kept otherwise; a record of another item is refused; no plan is read for an epic`, `board webview: an epic's board shows its records table above the totals, also when no story matches; a row's button sends open-evidence with the epic's id; an opened read-only record is shown under the table; an epic with no records says so; record text is set as text`, `board host: on an epic's board open-evidence for the epic's HLD opens the review pane with its path, and for an amendment reads it and re-renders the board with its text; moving to a story or back to a list clears the opened record`
- **smoke** — The suite and a hand check in VS Code.
  - Subjects: `The plugin's whole test suite and typecheck pass apart from failures that exist before this Story`, `By hand in VS Code: on an Epic's board the Records table lists its DEF, HLD and amendments; Open in review on the HLD shows it in the review pane with its HTML tabs; Open read-only on an amendment shows its text under the table`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board state: an epic's board carries the epic's own records, built as a story's are, whatever the search and the needs-attention filter; a list screen carries none`, `board webview: an epic's board shows its records table above the totals, also when no story matches; a row's button sends open-evidence with the epic's id; an opened read-only record is shown under the table; an epic with no records says so; record text is set as text`, `By hand in VS Code: on an Epic's board the Records table lists its DEF, HLD and amendments; Open in review on the HLD shows it in the review pane with its HTML tabs; Open read-only on an amendment shows its text under the table` |
| `ac2` | `board state: the record owner is the item of an item screen and the epic of an epic's board, and nothing on a list screen`, `details memory: with an epic selected, one of its records opens in the review pane when it has a path and is read and kept otherwise; a record of another item is refused; no plan is read for an epic`, `board host: on an epic's board open-evidence for the epic's HLD opens the review pane with its path, and for an amendment reads it and re-renders the board with its text; moving to a story or back to a list clears the opened record`, `By hand in VS Code: on an Epic's board the Records table lists its DEF, HLD and amendments; Open in review on the HLD shows it in the review pane with its HTML tabs; Open read-only on an amendment shows its text under the table` |
| `ac3` | `board state: a story's screen and the list screens are built exactly as before`, `The plugin's whole test suite and typecheck pass apart from failures that exist before this Story` |

## 6. Migration

**State before:** An Epic's board shows the Epic's header, the totals and the stages of its stories. The Epic's own records are in the snapshot but are shown nowhere, and the details memory has no selection on an Epic's board, so none of them can be opened.

**State after:** An Epic's board shows a Records table of the Epic's own records above the totals. The memory's selection is the Epic while its board is on show, so a row opens in the review pane or read-only as a Story's does.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add EpicRecordsView and StagesBody.epicRecords to the protocol; buildBoardViewModel sets it null; the 'epic' case of the screen body fills it from the details callback — ↩ rollbackable
2. Add recordOwnerId to board-state and pass it to memory.kept in the host in place of currentItemId — ↩ rollbackable
3. Draw the records box in the webview's renderStages, sharing the opened-record drawing with a Story's tab — ↩ rollbackable
4. Run the suite, build, package and install the plugin; check by hand — ↩ rollbackable

**Backward compat:** Plugin only. No daemon call, IPC shape or stored record changes; the host and the webview ship together in one plugin build, so the added message field has no version skew.

## 7. Alternatives considered

### 7.1 a1: Records table on the Epic's board — **CHOSEN**

The Epic's board screen shows the Epic's own records above its stages, opened the same way as a Story's

The Epic screen's body (StagesBody) gains epicRecords: the Epic item's id, its evidence rows (built by the existing evidenceRow through buildItemDetails) and the opened read-only record. board-state builds it for the 'epic' screen from the details the memory already gives for any item. The details memory is told the Epic is the selection while its board is on show (a new recordOwnerId replaces currentItemId at the one call site), so the existing openEvidence accepts the Epic's records unchanged: a reviewable one goes to the review pane, another is read and shown under the table. The webview draws the existing recordsTable in a box above the totals line.

### 7.2 a2: A details screen for an Epic

An Epic gets its own tabbed screen like a Story's, with a link to its board

Add a screen kind for an Epic's details with Overview, Workflow evidence and Linked work tabs, built by buildItemDetails; the Epics list opens it and it links on to the Epic's board.

**Rejected because:** Works, but adds a screen kind and a click for a table of two to four rows, and most of the screen's tabs would be empty for an Epic.

### 7.3 a3: Epic records on each Story's Records table

A Story's Workflow evidence tab also lists its Epic's DEF and HLD

buildItemDetails appends the parent Epic's DEF and HLD to a Story's evidence rows, and the memory accepts opening a parent's record.

**Rejected because:** Leaves Epics without stories uncovered and repeats the same records on every Story.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/delivery/board-protocol.ts`
- **[[c2]]** `code` `vscode-plugin/src/delivery/board-state.ts`
- **[[c3]]** `code` `vscode-plugin/src/delivery/details-memory.ts`
- **[[c4]]** `code` `vscode-plugin/src/delivery/board-host.ts`
- **[[c5]]** `code` `vscode-plugin/src/delivery/board-details.ts`
- **[[c6]]** `code` `vscode-plugin/src/delivery/board-model.ts`
- **[[c7]]** `code` `src/workflow/delivery/graph.ts`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T17:09:30.677Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
