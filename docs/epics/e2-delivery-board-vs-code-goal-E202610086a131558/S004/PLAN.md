<!-- insrc:artifact PLAN-6a1315585c38c41c-s4 -->

# Plan: E202610096a131558:S004

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**LLD run:** `wf-1791538672573-nqv8bc`
**LLD effective hash:** `d362668c917b...`

Building s4 adds a pure details builder (board-details.ts) and teaches the board host to keep a small details memory: the selected story's PLAN, read once per snapshot, and the one record the reader opened. Evidence is routed by the daemon's open-with value, either to the review pane's new openArtifact or to a read-only read through the daemon. The review pane gains that entry point and a read-only flag. The webview draws the details as text, and extension.ts hands the review pane to the board when the chat setting has created one.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Details view-model types and the item mirror's tasks | S | — | unit: contract.test.ts: 'the VS Code plugin type-checks against the published delivery types' | [[c5]] [[c10]] |
| 2 | **`t2`** The pure details builder | M | `t1` | unit: board-details.test.ts: 'planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart'; unit: board-details.test.ts: 'the details give the daemon's stage reason and the records it cites'; unit: board-details.test.ts: 'an approved build with failed tasks shows the approval, the failed rows and a sentence explaining the conflict'; unit: board-details.test.ts: 'a rejected record reads Rejected, and the original review verdict is shown with any override'; unit: board-details.test.ts: 'a code review with no build keeps its stage, lists the review-without-build notice and shows the review as evidence' | [[c1]] [[c11]] |
| 3 | **`t3`** Review pane: openArtifact and read-only content | M | — | integration: docs-review-panel.test.ts: 'openArtifact opens a non-pending artifact without approve or request-changes, and a pending one as its list row does'; integration: docs-review-panel.test.ts: 'openArtifact on a cold pane decides pending from its own pending read, even when the boot ping's refresh is superseded' | [[c2]] [[c6]] [[c11]] |
| 4 | **`t4`** Board host: details memory, PLAN reads and evidence routing | M | `t2` | integration: board-host.test.ts: 'opening a story reads its plan once per snapshot and shows the dependencies when it arrives'; integration: board-host.test.ts: 'a review-view record opens in the review pane and a build record opens read-only from the daemon as text'; integration: board-host.test.ts: 'a failed, malformed or stale plan read leaves the details standing with a notice' | [[c3]] [[c7]] [[c8]] [[c11]] |
| 5 | **`t5`** Webview: the details pane and its controls | M | `t4` | integration: board-host.test.ts: 'the details pane renders as text and its controls post only select-item, close-details and open-evidence' | [[c8]] [[c12]] |
| 6 | **`t6`** Wiring: pass the review pane to the board | S | `t3`, `t4` | integration: board-wiring.test.ts: 'the board receives the review pane when the chat setting creates one, and reads evidence itself when it does not' | [[c4]] [[c9]] |

### 1.1 E202610096a131558:S004:T001 — Details view-model types and the item mirror's tasks

Declare TaskRowView, EvidenceRowView and ItemDetailsViewModel in board-protocol.ts in place of unknown, and add 'tasks' to DeliveryItemView.

**Acceptance checks:**
- ItemDetailsViewModel, TaskRowView and EvidenceRowView match the sc6 sketch and the 'details' down-message carries ItemDetailsViewModel | null.
- DeliveryItemView picks 'tasks' and E1's contract test still compiles the mirror.

### 1.2 E202610096a131558:S004:T002 — The pure details builder

board-details.ts buildItemDetails(snapshot, itemId, plan, opened, labels): stage label and reason, task rows joined to the PLAN by sourceIds with dependencies by title, result labels and counts, the conflict sentence, evidence rows (approval, original review verdict with the effective one when different, override, opensIn by openWith), notices, linked items, source ids, planNotice and the opened record.

**Acceptance checks:**
- Planned tasks show dependencies (by task title, else the raw plan id) and checks when the plan is ok, and null for both otherwise; a PLAN task with no task item is not a row; a build-only task reads Unplanned; counts come from validation, with unrecorded counted apart.
- stageReason is the daemon's text and cited artifact ids, unchanged.
- An approved build with failed tasks keeps its approval row and failed rows and gets a conflict sentence naming the failed tasks.
- A rejected record reads Rejected; a historically blocked review reads 'Review blocked (now Review passed)'; an override reads 'Overridden: <reason>'.
- A code review with no build lists the review-without-build notice and the CR as an evidence row; a record with openWith review-view and an mdPath opens in the review pane, any other read-only.

### 1.3 E202610096a131558:S004:T003 — Review pane: openArtifact and read-only content

createDocsReviewHost gains openArtifact(target): open or reveal the pane, bump the refresh counter, read client.pending() itself, replace the pending map and post the list, then open the document by mdPath, read-only when not pending. The 'docs-content' message gains readOnly?, and the pane webview hides approve and request-changes and shows 'read-only: not awaiting review' when it is set.

**Acceptance checks:**
- openArtifact on a non-pending artifact posts its content with readOnly true, and the webview shows no approve or request-changes control.
- openArtifact on a pending artifact opens it as a list-row click does, with its actions.
- On a cold pane, a refresh superseded by the boot ping cannot make a pending artifact read-only: the decision comes from openArtifact's own pending read.
- The pane's existing tests pass unchanged.

### 1.4 E202610096a131558:S004:T004 — Board host: details memory, PLAN reads and evidence routing

DeliveryBoardHostDeps gains reviewPane?; the host keeps DetailsMemory (PLAN reads per applied snapshot keyed by PLAN artifact id, the opened record), posts 'details' after the view message while an item is selected, reads the selected story's PLAN once per snapshot, drops stale answers, and routes open-evidence by openWith to the review pane or a read-only client.evidence read.

**Acceptance checks:**
- Selecting a story with a PLAN posts details with the plan loading, makes one evidence read, and posts again with dependencies; reopening it in the same snapshot makes no second read, and a new snapshot reads again.
- A PLAN read that fails shows planNotice and is logged; one that finishes after a newer snapshot or a closed panel is dropped; a PLAN whose body has no tasks list reads as failed with 'The plan record has no task list', and malformed entries are skipped.
- open-evidence for a review-view entry calls reviewPane.openArtifact with its id and mdPath; for a build record, or with no review pane, it reads the record and shows its text as openedRecord; an artifact that is not the item's evidence is ignored and logged.
- close-details posts details null and clears the opened record.

### 1.5 E202610096a131558:S004:T005 — Webview: the details pane and its controls

BOARD_WEBVIEW_SCRIPT gains a details pane rendering every ItemDetailsViewModel field with textContent (the opened record in a <pre>), a select-item listener on every card in all three views, a close button posting close-details and an open button per evidence row posting open-evidence.

**Acceptance checks:**
- A 'details' message renders the title, stage and reason, task rows with dependencies, checks and results, the conflict, evidence rows, notices, links and source ids as text; a null model clears the pane.
- Titles, notices and the opened record containing markup render literally; innerHTML is never touched.
- Card clicks post select-item, the close button close-details and the evidence buttons open-evidence, each accepted by parseBoardUpMessage.

### 1.6 E202610096a131558:S004:T006 — Wiring: pass the review pane to the board

registerDeliveryBoard takes reviewPane? and passes it to the host; extension.ts declares docsReviewHost before the chat gate, assigns it inside, and passes it to registerDeliveryBoard after the gate.

**Acceptance checks:**
- registerDeliveryBoard passes reviewPane through, so an open-evidence on a review-view entry reaches it; without it the board reads the record read-only.
- extension.ts declares docsReviewHost before the chat gate and passes it to registerDeliveryBoard outside the gate; the existing chat wiring tests pass.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| buildItemDetails | `t2` |
| createDeliveryBoardHost | `t4` |
| BOARD_WEBVIEW_SCRIPT | `t5` |
| createDocsReviewHost.openArtifact | `t3` |
| registerDeliveryBoard | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 §2.1 ItemDetailsViewModel (buildItemDetails)`
- **[[c2]]** `prior-artifact` `LLD s4 §2.2 DocsReviewHostOpenArtifact (openArtifact)`
- **[[c3]]** `prior-artifact` `LLD s4 §2.3 BoardUpMessage (select-item, close-details, open-evidence in the host)`
- **[[c4]]** `prior-artifact` `LLD s4 §2.4 DeliveryBoardWiringDeps (reviewPane)`
- **[[c5]]** `prior-artifact` `LLD s4 §3.1 board-protocol.ts ItemDetailsViewModel field-modify`
- **[[c6]]** `prior-artifact` `LLD s4 §3.2 chat/protocol.ts 'docs-content' readOnly field-add`
- **[[c7]]** `prior-artifact` `LLD s4 §3.3 DetailsMemory (board host memory)`
- **[[c8]]** `prior-artifact` `LLD s4 §3.4 board-host.ts DeliveryBoardHostDeps and BOARD_WEBVIEW_SCRIPT`
- **[[c9]]** `prior-artifact` `LLD s4 §3.5 extension.ts docsReviewHost declared before the chat gate`
- **[[c10]]** `prior-artifact` `LLD s4 §3.6 delivery-contract.ts DeliveryItemView 'tasks'`
- **[[c11]]** `prior-artifact` `LLD s4 §5 Error paths`
- **[[c12]]** `prior-artifact` `LLD s4 §6 Test strategy`
