<!-- insrc:artifact LLD-6a1315585c38c41c-s4 -->

# LLD: E202610096a131558:S004

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**HLD base run:** `wf-1791485029499-gnjvqz`
**HLD effective hash:** `d362668c917b...`

s4 lets a reader open any card and see why the item is where it is. The details show the daemon's reason for its stage and the records that reason cites, each task with its dependencies, acceptance checks and recorded result, any conflict between an approval and failed results, its notices, its linked items and its source ids. Every supporting record is listed with its approval, its original review verdict and any override, and the reader can open it: documents the review pane can show open there, read-only unless they are awaiting review, and build and review records open read-only on the board itself, as plain text.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-6a1315585c38c41c** § 2. Framework summary

**Rollout phase:** Phase B — board columns, and item details with evidence
**Owns:** `sc6` (Item details view model and evidence opening), `sc7` (Review pane open-by-artifact entry point)
**Consumes:** `sc1` (Delivery client), `sc2` (Board state: load status and selection), `sc3` (Board webview message protocol), `sc4` (Display labels)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The open-board command and its entry in the plugin's command list, the webview panel creation in an editor tab with its CSP and nonce, the refresh sequencing (request numbers and dropping superseded responses), the mapping of client failures to load states, and the status bar of the board (taken-at time, stale and partial notices, the empty, unavailable and failed messages). s1 also records the editor-tab versus sidebar placement check. It renders a minimal list of item titles until s2 supplies columns. s1 also extends vscode-plugin/src/delivery/delivery-contract.ts additively with the stage, attention, notice, task-result, approval and review-verdict types sc4 needs. Its LLD maps every acceptance criterion to a named test, including ac4 (an earlier response arriving after a later one is dropped, with fake out-of-order responses) and ac6 (repeated open and refresh against a temporary git repository leave the store, docs and git untouched). — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The pure functions that filter the snapshot by scope, search and attention, group the matches into the six columns in the daemon's order, count over the whole selection, page each column behind show-more, and build each card's badges and accessible label from the snapshot's published fields; and the board view's rendering in the webview script, text-only. Its LLD maps every acceptance criterion to a named test, including ac6 (a title and a notice containing markup and script render as literal text). — owns `sc5`
- `s3`: The epic rollup view model (per-epic completion counts that name their denominator, stories grouped by stage, a separate standalone group) and the issue view model (each issue with its fix stories as children and its parent relationship or unresolved-parent notice), both built from the same filtered selection as sc5, and their rendering. Its LLD maps every acceptance criterion to a named test.
- `s5`: The narrow-pane layout (stage-grouped list), keyboard navigation and focus return, live-region announcements of selection and refresh results, the compact and comfortable density styles, and the 500-item performance fixture with its measured render and filter timings. Its LLD maps every acceptance criterion to a named test, with ac5 as the measured fixture.

## 2. Contract details

**Surface level:** internal

### 2.1 `ItemDetailsViewModel`

```typescript
type PlanRead =
  | { readonly state: 'none' }
  | { readonly state: 'loading' }
  | { readonly state: 'ok'; readonly tasks: readonly { readonly id: string; readonly dependsOn: readonly string[]; readonly acceptanceChecks: readonly string[] }[] }
  | { readonly state: 'failed'; readonly message: string };
interface OpenedRecord { readonly artifactId: string; readonly text: string }
function buildItemDetails(snapshot: DeliverySnapshot, itemId: string, plan: PlanRead, opened: OpenedRecord | null, labels: DisplayLabels): ItemDetailsViewModel | null
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `itemId: string` — The selected item.
- `plan: PlanRead` — The selected story's PLAN read: none (no PLAN evidence, or not a story), loading, ok, or failed.
- `opened: OpenedRecord | null` — An evidence-read record of this item the reader opened.
- `labels: DisplayLabels` — sc4 text.

**Returns:** `ItemDetailsViewModel | null` — The sc6 details for the item, or null when the id is not in the snapshot.

**Postconditions:**
- stageLabel and stageReason are the item's stage label and the daemon's stage.reason text and artifactIds, unchanged; null for an item with no stage (an epic or task).
- tasks: one row per entry of the item's tasks (TaskValidation), in its order, with the task item's title, resultLabel from labels.taskResult for a planned task and labels.unplanned for an unplanned one; when plan is ok, the PLAN task whose id is in the task item's sourceIds gives dependsOn (each shown by the matching task item's title, else the raw plan id) and acceptanceChecks; otherwise both are null.
- taskCounts is the item's validation counts (passed, failed, unrecorded, unplanned) as published; unrecorded tasks are counted only as unrecorded.
- conflict, when item.conflict is set, is one sentence naming that the build is approved while N task results failed (and the story-level result, when it failed), naming the failed tasks by title; the approval and the failed rows stay in place.
- evidence: one row per evidence entry in its order: kindLabel is the record kind, approvalLabel labels.approval[approval.state], reviewLabel the recorded verdict's label (labels.reviewVerdict[review.verdict]) with the effective verdict appended when it differs, overrideLabel 'Overridden: <reason>' when review.override is set, and opensIn 'review-pane' when openWith is 'review-view' and mdPath is not null, else 'read-only' (lc1).
- notices are each item notice as '<label>: <message>' using labels.notice, the code itself when unlabelled; linked lists the parent (relation 'parent'), each child ('child') and the corrected item ('corrects') that is in the snapshot, by title; sourceIds are the item's, in order.
- planNotice is set only when plan is failed, naming the failure; openedRecord is the opened argument when its artifactId is one of this item's evidence entries, else null.

### 2.2 `DocsReviewHostOpenArtifact`

```typescript
interface DocsReviewHost {
  open(): void;
  dispose(): void;
  openArtifact(target: { readonly artifactId: string; readonly mdPath: string }): void;
}
// HostToWebview 'docs-content' gains: readonly readOnly?: boolean
```

**Parameters:**
- `target: { readonly artifactId: string; readonly mdPath: string }` — The record and its docs/ markdown path, both taken from the daemon's snapshot evidence entry.

**Returns:** `void` — Opens or reveals the review pane, reads the pending list itself, and shows the document.

**Preconditions:**
- mdPath is the daemon-published mdPath of an evidence entry whose openWith is 'review-view'.

**Postconditions:**
- openArtifact decides pending or read-only from its own call to client.pending(), not from the pane's refresh: it bumps the pane's refresh counter so any refresh already in flight (open()'s or the webview's boot ping) is dropped, replaces the pending map and posts the list from that one answer, and then opens the document. A pending artifact opens exactly as a click on its list row does; if client.pending() fails, the document is shown read-only with the pane's existing 'unavailable' notice for the list.
- Otherwise the content is read with the pane's existing client.content(mdPath) (the daemon's docs/ path guard applies) and posted with readOnly true; the webview then shows no approve or request-changes control, only a 'read-only: not awaiting review' note.
- The pending list, its rendering and the docs-decision guard (decisions only for a live pending artifact) are unchanged, and the pane's existing tests pass unchanged.

### 2.3 `BoardUpMessage`

```typescript
// handled by createDeliveryBoardHost:
// { type: 'select-item'; itemId } | { type: 'close-details' } | { type: 'open-evidence'; itemId; artifactId }
```

**Parameters:**
- `message: BoardUpMessage` — The three detail intents sc3 already declares.

**Returns:** `void` — The host updates its details memory and posts the details message.

**Postconditions:**
- After every derive while an item is selected, the host posts { type: 'details', model } after the view message; close-details posts details null and clears the opened record.
- select-item of a story with a PLAN evidence entry posts details with the plan loading, reads the PLAN once through client.evidence (cached per applied snapshot by PLAN artifact id), and posts again with the plan ok or failed; a failed or timed-out read is logged through error() and shown as planNotice. A read that finishes after a newer snapshot was applied or the panel closed is dropped.
- open-evidence is honoured only when artifactId is one of the selected item's evidence entries (else ignored and logged through warn()). A review-pane entry goes to the injected reviewPane.openArtifact({ artifactId, mdPath }); with no review pane, or for a read-only entry, the host reads the record through client.evidence and shows its renderedMarkdown, or its meta and body as two-space JSON, as openedRecord; a failed read is logged through error() and shown as openedRecord with the text 'Could not read <id>: <message>'.
- The board webview script posts these intents: a click on any card (board, rollup or issue view) posts select-item with its id; the details pane has a close button that posts close-details and one open button per evidence row that posts open-evidence with the item and artifact ids. The details pane renders every ItemDetailsViewModel field with textContent, the opened record in a <pre> element, and nothing when the model is null.

### 2.4 `DeliveryBoardWiringDeps`

```typescript
interface DeliveryBoardWiringDeps {
  // existing fields unchanged, plus:
  readonly reviewPane?: { openArtifact(target: { readonly artifactId: string; readonly mdPath: string }): void } | undefined;
}
```

**Parameters:**
- `reviewPane: { openArtifact(...) } | undefined` _(optional)_ — The review host when the chat setting created one; absent otherwise.

**Returns:** `void` — registerDeliveryBoard passes it to the board host.

**Postconditions:**
- extension.ts passes the docs-review host when insrc.chat.enabled created it, and nothing otherwise; the board command stays outside the chat gate.
- createDeliveryBoardHost's DeliveryBoardHostDeps gains the same optional reviewPane field, which registerDeliveryBoard passes through.
- In extension.ts the docs-review host is declared before the chat gate (let docsReviewHost: DocsReviewHost | undefined), assigned inside it as today, and passed to registerDeliveryBoard, which runs after the gate; nothing else in the gate moves.

## 3. Data model changes

### 3.1 `vscode-plugin/src/delivery/board-protocol.ts ItemDetailsViewModel` — field-modify

ItemDetailsViewModel changes from unknown to the sc6 interface with TaskRowView and EvidenceRowView beside it.

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `vscode-plugin/src/chat/protocol.ts 'docs-content' message` — field-add

An optional readOnly flag, absent for every existing open, true for openArtifact on a non-pending artifact; the pane webview hides its decision controls when it is set.

**Call sites:**
- `vscode-plugin/src/chat/docs-review-panel.ts`

### 3.3 `DetailsMemory (board host memory)` — new

PLAN reads keyed by PLAN artifact id for the applied snapshot (cleared when a new snapshot is applied) and the one opened record; never persisted.

**Call sites:**
- `vscode-plugin/src/delivery/board-host.ts`

### 3.4 `vscode-plugin/src/delivery/board-host.ts DeliveryBoardHostDeps and BOARD_WEBVIEW_SCRIPT` — field-add

DeliveryBoardHostDeps gains the optional reviewPane port. The webview script gains a details pane (rendered with textContent, the opened record in a <pre>), a select-item listener on every card, and close-details and open-evidence buttons.

**Call sites:**
- `vscode-plugin/src/delivery/board-host.ts`
- `vscode-plugin/src/delivery/board-wiring.ts`

### 3.5 `vscode-plugin/src/extension.ts docsReviewHost` — field-modify

The docs-review host is declared before the insrc.chat.enabled gate and assigned inside it, so registerDeliveryBoard (after the gate) can receive it; when the chat setting is off it stays undefined.

**Call sites:**
- `vscode-plugin/src/extension.ts`

### 3.6 `vscode-plugin/src/delivery/delivery-contract.ts DeliveryItemView` — field-add

The plugin-side Pick gains 'tasks', which the details builder reads; E1's contract test keeps compiling the mirror.

**Call sites:**
- `vscode-plugin/src/delivery/delivery-contract.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc6` | implements | board-details.ts builds ItemDetailsViewModel; the host fills PlanRead and the opened record; s5 consumes the model for keyboard and narrow layouts. |
| `sc7` | implements | createDocsReviewHost gains openArtifact; open() and dispose() are unchanged. |
| `sc1` | consumes | client.evidence(artifactId) for PLAN reads and read-only records, with its 15 s deadline and typed failures. |
| `sc2` | consumes | selection.selectedItemId picks the item; s1's reducer clears it when a refresh removes the item. |
| `sc3` | consumes | Fills the 'details' down-message and handles select-item, close-details and open-evidence; no amendment. |
| `sc4` | consumes | Stage, task-result, approval, review-verdict and notice labels. |

## 5. Error paths

**Error cases**

- **The PLAN read fails or times out.** (recoverable)
  - Detection: client.evidence(planArtifactId) returns { ok: false } with kind read-failed or timed-out.
  - Response: PlanRead becomes failed with the failure's message, logged through error() with the artifact id; the details post again with planNotice set and dependsOn and acceptanceChecks null on every row. The failure is cached for that snapshot, so reopening the same item does not re-read until the next refresh.
  - User impact: Tasks and results still show; dependencies and checks read as unavailable with the reason.
- **The PLAN record's body does not have a tasks list of the expected shape.** (recoverable)
  - Detection: The host checks body.tasks is an array and keeps only entries whose id is a string; dependsOn and acceptanceChecks default to empty when they are not string arrays.
  - Response: Malformed entries are skipped; if body.tasks is missing the read counts as failed with 'The plan record has no task list'.
  - User impact: Rows without a usable plan entry show no dependencies or checks.
- **An evidence-read record (or a review-view record with no review pane) cannot be read.** (recoverable)
  - Detection: client.evidence(artifactId) returns { ok: false }.
  - Response: Logged through error(); openedRecord becomes { artifactId, text: 'Could not read <id>: <message>' } so the reader sees why nothing opened.
  - User impact: A one-line failure in place of the record's text.
- **open-evidence names an artifact that is not one of the selected item's evidence entries, or arrives with no item selected.** (recoverable)
  - Detection: The host looks the artifact id up in the selected item's evidence list.
  - Response: Ignored and logged through warn(); nothing is read or opened.
  - User impact: None.
- **A PLAN or record read finishes after a newer snapshot was applied, after the selection moved to another item, or after the panel closed.** (recoverable)
  - Detection: The host compares the read's snapshot request number and selected item with the current ones, and checks the panel generation, before using the answer.
  - Response: The answer is dropped; a PLAN answer for an older snapshot is not cached.
  - User impact: None; the current details are not overwritten.
- **openArtifact's content read fails in the review pane.** (recoverable)
  - Detection: client.content(mdPath) throws inside the pane.
  - Response: The pane's existing failure path applies: an 'unavailable: <message>' body, blocked, and read-only when the artifact is not pending.
  - User impact: The pane says it cannot show the record.
- **openArtifact runs while the review pane's own refresh is in flight (on a first open, open() and the webview's boot ping each start one).** (recoverable)
  - Detection: openArtifact does not rely on the pane's pending map: it calls client.pending() itself and bumps the pane's refresh counter first, so the in-flight refreshes see a newer counter and drop their answers.
  - Response: The pending decision and the posted list both come from openArtifact's own answer, so a pending artifact is never shown read-only because a refresh had not landed.
  - User impact: None; the artifact opens with the right actions.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A story with no PLAN evidence entry. | PlanRead none; no read is made; dependsOn and acceptanceChecks are null and no planNotice is shown. |
| A planned task whose PLAN entry depends on a task id with no matching task item. | The dependency is shown as the raw plan id. |
| A task present only in the BUILD record (planned false). | Labelled with labels.unplanned; no PLAN entry joins to it. |
| A PLAN task with no task item in the snapshot. | Not shown as a row, per sc6's join rule. |
| An approved record whose review once blocked (verdict block, effective pass after resolutions). | reviewLabel reads 'Review blocked (now Review passed)', so the original verdict stays visible. |
| A review override. | overrideLabel 'Overridden: <reason>' beside the original verdict. |
| A rejected record. | approvalLabel 'Rejected', never 'Pending'. |
| A story with a code review and no BUILD. | The stage is the snapshot's, the review-without-build notice is listed, and the CR is an evidence row. |
| An evidence-read record with no rendered markdown. | Its meta and body are shown as two-space JSON, as plain text. |
| Selecting an epic or a task. | Details render with no stage label or reason where none is published, no PLAN read, and its linked items. |
| The same story reopened after close-details within one snapshot. | No second PLAN read; the cached read is used. |

**Invariants to preserve**

- Stage, reasons, results, approvals, reviews and conflicts are shown as the daemon published them. [[c5]]
- Opened record text and every detail string are inserted with textContent only, and the board opens no path except the daemon's mdPath through the review pane's own guarded read. [[c7]]
- The review pane's list, rendering and approval behaviour are unchanged: a non-pending artifact is read-only and decisions still need a live pending artifact. [[c24]]
- Opening details or evidence changes nothing on disk or in git. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx: (cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'); typecheck with npx tsc -p vscode-plugin`

**Test levels**

- **unit** — The pure details builder: task rows joined to the PLAN, result labels and counts, the stage reason, the conflict sentence, evidence rows with approval, original review and override, notices, links and source ids.
  - Subjects: `buildItemDetails`
  - Fixtures: `board-fixtures.ts items with tasks, validation, conflict, evidence entries (approved, rejected, overridden, historically blocked; review-view and evidence-read), notices including review-without-build, and task items whose sourceIds hold plan ids`
- **integration** — The board host and the review pane: PLAN read once per story per snapshot and dropped when stale, open-evidence routed by openWith to the review pane or read read-only, the details rendered as text, and openArtifact opening read-only when not pending while the pane's existing tests run unchanged.
  - Subjects: `createDeliveryBoardHost`, `BOARD_WEBVIEW_SCRIPT`, `createDocsReviewHost.openArtifact`, `registerDeliveryBoard`
  - Fixtures: `board-host.test.ts's openWith, runScript and a controlled client whose evidence() answers are scripted`, `docs-review-panel.test.ts's fake channel and fake DocsReviewClient`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-details.test.ts: 'planned tasks show their dependencies and checks with Passed, Failed or Unrecorded, a build-only task is unplanned, and unrecorded tasks are counted apart'`, `board-host.test.ts: 'opening a story reads its plan once per snapshot and shows the dependencies when it arrives'` |
| `ac2` | `board-details.test.ts: 'the details give the daemon's stage reason and the records it cites'` |
| `ac3` | `board-details.test.ts: 'an approved build with failed tasks shows the approval, the failed rows and a sentence explaining the conflict'` |
| `ac4` | `board-details.test.ts: 'a rejected record reads Rejected, and the original review verdict is shown with any override'` |
| `ac5` | `board-host.test.ts: 'a review-view record opens in the review pane and a build record opens read-only from the daemon as text'`, `docs-review-panel.test.ts: 'openArtifact opens a non-pending artifact without approve or request-changes, and a pending one as its list row does'`, `docs-review-panel.test.ts: 'openArtifact on a cold pane decides pending from its own pending read, even when the boot ping's refresh is superseded'` |
| `ac6` | `board-details.test.ts: 'a code review with no build keeps its stage, lists the review-without-build notice and shows the review as evidence'` |

## 7. Alternatives considered

### 7.1 a1: Pure details builder, host-held PLAN and opened-record memory, and an injected review-pane port — **CHOSEN**

buildItemDetails is pure over the snapshot item, the story's PLAN read and an opened record; the host reads the PLAN once per story per snapshot, routes open-evidence by openWith, and reaches the review pane through an optional port that implements sc7.

A pure module board-details.ts builds ItemDetailsViewModel (sc6) from the selected item, a PlanRead (none, loading, ok with tasks, or failed with a message) and an opened record, joining PLAN tasks to task items by sourceIds and labelling everything from DISPLAY_LABELS. The host keeps DetailsMemory: the PLAN reads for the shown snapshot, keyed by the PLAN artifact id and cleared when a new snapshot is applied, so each story's PLAN is read at most once per snapshot; and the one opened record. On select-item the host posts the details at once (PLAN loading) and, when the item has a PLAN evidence entry, reads it through client.evidence and posts the details again. On open-evidence it checks the artifact is one of the item's evidence entries, then follows the daemon's openWith (lc1): 'review-view' with an mdPath goes to the injected reviewPane port, when present; otherwise, or when the port is absent, it reads the record through client.evidence and shows its renderedMarkdown, or its meta and body as two-space JSON, as preformatted text. The review pane gains openArtifact (sc7): it opens or reveals the pane, refreshes its pending list, and opens the document by its mdPath, marking it read-only when it is not pending, so the pane's existing decision guard and its list, rendering and approval behaviour are unchanged. extension.ts passes the review host to registerDeliveryBoard when the chat setting is on.

### 7.2 a2: Read every story's PLAN with the snapshot

On each applied snapshot, read the PLAN of every story through workflow.deliveryEvidence so details are complete the moment they open.

Same details builder and review-pane port as a1, but the host fans PLAN reads out after each refresh and keeps them all, so opening details never waits.

**Rejected because:** Correct, but reads every story's PLAN on every refresh, far past the HLD's budget.

### 7.3 a3: Open review-view records in VS Code's markdown preview

Route review-view evidence to the built-in markdown preview of its docs/ file instead of extending the review pane.

Same details builder as a1, but a review-view entry opens its mdPath with VS Code's markdown preview command, so the review pane is not changed at all.

**Rejected because:** Avoids touching the review pane but breaks k10 and k4.

## 8. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c4]]** `code` `src/workflow/delivery/types.ts` — "readonly tasks:            readonly TaskValidation[];"
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c17]]** `code` `src/workflow/delivery/types.ts` — "readonly openWith:       'review-view' | 'evidence-read';"
- **[[c24]]** `stakeholder` `Stakeholder decision in chat, 2026-10-09: option A, add an open-this-artifact entry to the review pane` — "go with A"
- **[[c5]]** `prior-artifact` `DEF-6a131558 k2: the board displays the daemon's facts and does not derive them`
- **[[c6]]** `doc` `docs/insrc-delivery-board-prd.html` — "FR-09Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c7]]** `prior-artifact` `DEF-6a131558 k4: artifact text is rendered as data`
- **[[c21]]** `analyze-bundle` `s1: vscode-plugin/src/chat/docs-review-panel.ts and docs-review-client.ts (review pane host, pending list, content read, decision guard)`
- **[[c22]]** `analyze-bundle` `s1: src/workflow/delivery/types.ts DeliveryItem evidence, tasks, conflict; DeliveryEvidenceRecord; PLAN body.tasks`
- **[[c23]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/ (board-protocol, board-host, board-state, board-wiring, delivery-client) and their tests`

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 12 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-09T09:45:53.874Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | MED | The change-site inventory is complete. §3 lists only board-protocol.ts, board-host.ts, chat/protocol.ts and docs-review-panel.ts, and §2.4 says registerDeliveryBoard passes reviewPane to the host and extension.ts passes the docs-review host. | Four sites the design depends on are missing from the inventory. (1) DeliveryBoardHostDeps (board-host.ts:43-50) has no reviewPane field, and the LLD gives no signature change for createDeliveryBoardHost; only DeliveryBoardWiringDeps is specified. (2) BOARD_WEBVIEW_SCRIPT (board-host.ts:68-152) has no details pane, no click-to-select on board cards (renderCard attaches no listener; only issue-view linkButtons post select-item), and nothing that posts open-evidence or close-details. The LLD names it only as a test subject and does not design the rendering or these intents. (3) In extension.ts:594, `const docsReviewHost = createDocsReviewHost(...)` is declared inside `if (chatEnabled) {`, while registerDeliveryBoard is called at :606, outside that block. The host has to be hoisted, and extension.ts is not in any call-site list. (4) DeliveryItemView (delivery-contract.ts:59-61) does not pick 'tasks', which the builder reads. [files: vscode-plugin/src/delivery/board-host.ts, vscode-plugin/src/extension.ts, vscode-plugin/src/delivery/delivery-contract.ts] | Add these to the contract and §3: the DeliveryBoardHostDeps.reviewPane field; the webview script changes (selecting a card, rendering the details pane with textContent, the open-evidence and close-details buttons); hoisting docsReviewHost in extension.ts; and adding 'tasks' to DeliveryItemView. |
| error-paths | MED | openArtifact can refresh the pending list and then decide pending versus read-only from the refreshed list: 'When the artifact is in the pending list after the refresh, it opens exactly as a click on its list row does'. | refreshPending (docs-review-panel.ts:1246-1253) returns early without updating the `pending` map when a newer refresh superseded it: `if (mySeq !== refreshSeq) return;`. On a first open, open() calls refreshPending (:1784), and the webview's boot ping (:1739-1740) starts another. A refresh that openArtifact awaits can therefore resolve before `pending` is populated, so a pending artifact is wrongly shown read-only, without approve. On a cold panel, `pending` is also empty until a refresh lands. The LLD's error paths do not cover this race. [files: vscode-plugin/src/chat/docs-review-panel.ts] | Specify how openArtifact gets an authoritative pending check: call client.pending() directly and use its result, or keep the open request and resolve it once the latest refresh completes. Add a test where the boot ping supersedes the refresh. |

#### Could not verify (does not block)

_None._
