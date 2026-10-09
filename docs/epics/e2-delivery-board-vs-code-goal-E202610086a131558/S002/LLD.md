<!-- insrc:artifact LLD-6a1315585c38c41c-s2 -->

# LLD: E202610096a131558:S002

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**HLD base run:** `wf-1791485029499-gnjvqz`
**HLD effective hash:** `6e5370449cb5...`

s2 turns the board's interim item list into six stage columns in workflow order, each card showing the item's title, kind, epic or standalone, and text-labelled badges for approval, review, validation, conflict, attention and data-quality notices, all read from the daemon's snapshot. A reader can search, scope to one epic or to standalone work and turn on Needs attention; every column count and total counts the whole selection, including cards behind a column's show-more control. The same snapshot and filters always give the same cards in the same order.

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
**Owns:** `sc5` (Board view model)
**Consumes:** `sc1` (Delivery client), `sc2` (Board state: load status and selection), `sc3` (Board webview message protocol), `sc4` (Display labels)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The open-board command and its entry in the plugin's command list, the webview panel creation in an editor tab with its CSP and nonce, the refresh sequencing (request numbers and dropping superseded responses), the mapping of client failures to load states, and the status bar of the board (taken-at time, stale and partial notices, the empty, unavailable and failed messages). s1 also records the editor-tab versus sidebar placement check. It renders a minimal list of item titles until s2 supplies columns. s1 also extends vscode-plugin/src/delivery/delivery-contract.ts additively with the stage, attention, notice, task-result, approval and review-verdict types sc4 needs. Its LLD maps every acceptance criterion to a named test, including ac4 (an earlier response arriving after a later one is dropped, with fake out-of-order responses) and ac6 (repeated open and refresh against a temporary git repository leave the store, docs and git untouched). — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s3`: The epic rollup view model (per-epic completion counts that name their denominator, stories grouped by stage, a separate standalone group) and the issue view model (each issue with its fix stories as children and its parent relationship or unresolved-parent notice), both built from the same filtered selection as sc5, and their rendering. Its LLD maps every acceptance criterion to a named test.
- `s4`: Building item details from the snapshot item, reading the story's PLAN through the delivery client and caching it per snapshot, joining the plan's dependencies and acceptance checks to the snapshot's task results, fetching an evidence-read record and showing it as preformatted text, routing a review-view entry to the review pane's openArtifact, the change inside the review pane that implements openArtifact without altering its list, rendering or approval behaviour, and the details rendering. Its LLD maps every acceptance criterion to a named test, including ac5 for both paths: a review-view record opens through openArtifact, and when the review pane is unavailable or the record is evidence-read the record is shown read-only from workflow.deliveryEvidence; the review pane's existing tests run unchanged. — owns `sc6`, `sc7`
- `s5`: The narrow-pane layout (stage-grouped list), keyboard navigation and focus return, live-region announcements of selection and refresh results, the compact and comfortable density styles, and the 500-item performance fixture with its measured render and filter timings. Its LLD maps every acceptance criterion to a named test, with ac5 as the measured fixture.

## 2. Contract details

**Surface level:** internal

### 2.1 `BoardViewModel`

```typescript
function buildBoardViewModel(snapshot: DeliverySnapshot, selection: BoardSelection, paging: BoardPaging, labels: DisplayLabels): BoardViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The snapshot the board shows (sc2's current one, or the last one behind a loading or failed state).
- `selection: BoardSelection` — sc2's scope, search and needsAttentionOnly; view, selectedItemId and density do not change the model.
- `paging: BoardPaging` — The visible card limit per column.
- `labels: DisplayLabels` — sc4's text for stages and every signal.

**Returns:** `BoardViewModel` — Six columns in STAGE_ORDER, each with its label, total, the shown page of cards in snapshot order and hiddenCount; totals over the whole selection; the epics to scope to; and whether the selection matched nothing.

**Preconditions:**
- snapshot.items is sorted by id (the daemon's published order).

**Postconditions:**
- Cards are the stories and issues whose stage is one of the six; epics, tasks and items with no stage are not cards.
- An item matches when it is in scope (all; epic E: a story whose parentId is E, or an issue whose correctsRef.resolvedItemId is E or a story under E; standalone: standalone is true), its title, id, any source id or its epic title contains the trimmed search case-insensitively (toLowerCase, no locale), and, when needsAttentionOnly is on, its needsAttention is true.
- Each match appears exactly once, in the column of its stage.stage, in snapshot order; nothing is derived or overridden (k2).
- For every column, total = cards.length + hiddenCount and cards.length = min(total, the column's visible limit); totals.items is the sum of the column totals and totals.needsAttention counts the matches whose needsAttention is true.
- Badges are built in this order, each with a text label from labels: approval (the worst approval among the evidence entries the stage reason names: rejected, then pending, then approved); review (Review blocked, tone danger, when any evidence entry's review.blocking is true, otherwise the worst effectiveVerdict among the reason's entries); validation (Validation failed when validation.failed > 0 or storyLevelResult is 'failed'; Unrecorded when any task or the storyLevelResult is unrecorded; otherwise Passed; only when the item has task results or a storyLevelResult); conflict (Validation conflict when conflict is not null); attention (one per attentionReasons entry that is an attention reason); notice (one per distinct item notice code, tone warning when the notice raises attention). A badge whose label is already on the card is not repeated.
- accessibleLabel names the kind, title, stage label, standalone or epic, Needs attention when set, and every badge label in order.
- scopeOptions lists every epic in the snapshot in snapshot order with its title, or its id when it has none.
- emptySelection is true when the snapshot has cards but none match.
- The same arguments always give an equal model (k9).
- The final column keeps the label 'Complete' (sc4, c11). The usability check the epics plan assigns to S2, whether readers take 'Complete' for validation success, is deferred to E2's usability session after s5: it needs a reader panel and the whole board, including s4's details, and no automated test can stand in for it. Until then the validation-conflict badge on Complete cards (ac2) carries the distinction. If the session shows readers misread it, the label changes in DISPLAY_LABELS alone (for example to 'Completion approved').

### 2.2 `BoardPaging`

```typescript
type BoardPaging = Readonly<Partial<Record<DeliveryStage, number>>>;
const BOARD_PAGE_SIZE = 50;
function showMore(paging: BoardPaging, stage: DeliveryStage): BoardPaging
```

**Parameters:**
- `paging: BoardPaging` — The current visible limits; a missing stage means BOARD_PAGE_SIZE.
- `stage: DeliveryStage` — The column whose next page to reveal.

**Returns:** `BoardPaging` — The same limits with that column's limit raised by BOARD_PAGE_SIZE.

**Postconditions:**
- The board host keeps BoardPaging beside sc2's BoardState and resets it to {} whenever scope, search or needsAttentionOnly changes; a refresh and a view, selection or density change keep it.

### 2.3 `boardDownMessages`

```typescript
function boardDownMessages(state: BoardState, labels: DisplayLabels, paging: BoardPaging): readonly Envelope<BoardDownMessage>[]
```

**Parameters:**
- `state: BoardState` — sc2's state.
- `labels: DisplayLabels` — sc4's text.
- `paging: BoardPaging` — The host's visible limits.

**Returns:** `readonly Envelope<BoardDownMessage>[]` — The status message first, then, when a snapshot is shown, one 'board' message built by buildBoardViewModel. The interim 'items' message is no longer sent (AMD-6a1315585c38c41c-1).

**Postconditions:**
- status is unchanged from s1.
- Every host path that derives messages (a refresh answer, a selection change, show-more and 'ready') reduces first and keeps the new state and paging only when boardDownMessages returns; when it throws, the previous state and paging stay, nothing is posted, and the error is logged through error() with the intent's type.
- BoardDownMessage keeps its 'items' variant in the type (AMD-6a1315585c38c41c-1 added it to sc3, and removing it would need a breaking amendment), but no s2 path sends it.

### 2.4 `BoardUpMessage`

```typescript
function parseBoardUpMessage(raw: unknown): BoardUpMessage | null  // gains { type: 'show-more'; stage: DeliveryStage }
```

**Parameters:**
- `raw: unknown` — Whatever the webview posted.

**Returns:** `BoardUpMessage | null` — The typed intent, now including show-more with a stage that is one of STAGE_ORDER; null otherwise.

**Postconditions:**
- A show-more whose stage is not one of the six is rejected (null) and logged once through warn() by the host, like any malformed message.
- The host answers a valid show-more by replacing paging with showMore(paging, stage) and posting the derived messages.

### 2.5 `unknownStages`

```typescript
function unknownStages(snapshot: DeliverySnapshot): ReadonlyMap<string, number>
```

**Parameters:**
- `snapshot: DeliverySnapshot` — A snapshot that a refresh has just applied.

**Returns:** `ReadonlyMap<string, number>` — Every stage id on a story or issue that is not one of STAGE_ORDER, with how many items carry it, in id order; empty when every stage is known.

**Postconditions:**
- The board host calls it only when a 'snapshot-arrived' event applies a snapshot, never on a selection change, show-more or 'ready', and logs one warn() per refresh when the map is not empty.

## 3. Data model changes

### 3.1 `vscode-plugin/src/delivery/board-protocol.ts BoardViewModel` — field-modify

BoardViewModel changes from unknown to the sc5 interface, with ColumnView, CardView and BadgeView declared beside it; BoardUpMessage gains the 'show-more' variant (amendment). The s1 tests that read the 'items' message move to 'board': board-state.test.ts's itemsOf and board-host.test.ts's lastItems read card ids from the board's columns, and the webview test delivers a 'board' message. One s1 assertion is retired by design: the test that an unlabelled stage shows its raw id. Under s2 that item is left off the board and logged once per refresh, and a board-host test replaces the assertion.

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`
- `vscode-plugin/src/delivery/__tests__/board-state.test.ts`
- `vscode-plugin/src/delivery/__tests__/board-host.test.ts`

### 3.2 `vscode-plugin/src/delivery/delivery-contract.ts DeliveryItemView` — field-add

The plugin-side Pick gains standalone, sourceIds, validation, conflict and correctsRef, the fields the cards read; E1's contract test keeps compiling the mirror, so a renamed daemon field fails there.

**Call sites:**
- `vscode-plugin/src/delivery/delivery-contract.ts`

### 3.3 `BoardPaging (host memory)` — new

A per-stage visible limit held by the board host for the panel's life, reset by scope, search or attention changes; never persisted.

**Call sites:**
- `vscode-plugin/src/delivery/board-host.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | board-model.ts implements buildBoardViewModel and declares BadgeView, CardView, ColumnView and BoardViewModel as sketched; s3 and s5 consume them. |
| `sc2` | consumes | Reads BoardState's shown snapshot and BoardSelection's scope, search and needsAttentionOnly through the existing reducer; selection intents keep going through selection-changed. |
| `sc3` | consumes | Posts 'board' in place of the interim 'items' message, sends set-scope, set-search and set-attention from the webview's controls, and adds the 'show-more' up-message through the proposed amendment. |
| `sc4` | consumes | Every column label and badge label comes from DISPLAY_LABELS. |
| `sc1` | consumes | No new client call; the board model reads the snapshot s1's refresh applied. |

## 5. Error paths

**Error cases**

- **A card's stage is not one of the six (a newer daemon, still schemaVersion 1).** (recoverable)
  - Detection: unknownStages(snapshot) finds stage ids outside STAGE_ORDER when the host applies a refreshed snapshot; buildBoardViewModel skips those items while grouping.
  - Response: The item is left out of the columns and the totals, and the host logs one warn() for that refresh naming each unknown stage id and how many items carry it; selection changes and show-more do not log it again.
  - User impact: The item is missing from the board until the plugin catches up; counts still agree with what is shown.
- **A scope names an epic that a refresh removed.** (recoverable)
  - Detection: buildBoardViewModel finds no epic item with selection.scope.epicItemId in the snapshot.
  - Response: The model matches nothing in that scope, sets emptySelection, and keeps the epic out of scopeOptions; the webview shows the empty-selection message with the scope control still set, so the reader can clear it.
  - User impact: The board shows no cards and says the selection matches nothing.
- **A show-more names a stage that is not one of the six, or a set-scope names an unknown epic id.** (recoverable)
  - Detection: parseBoardUpMessage rejects an unknown stage; the host checks a set-scope epic id against the shown snapshot before dispatching it.
  - Response: The message is ignored and logged once through warn(); nothing changes.
  - User impact: None.
- **Building the board model throws on a malformed item that got past the client's shallow checks, on a refresh or later on a selection change, show-more or 'ready' (for example a non-list sourceIds that only a non-empty search reads).** (recoverable)
  - Detection: The host reduces and derives messages before keeping the new state, so a throw from boardDownMessages surfaces inside that step on every path.
  - Response: On a refresh, s1's recovery applies: the refresh ends as failed over the previous board. On a selection change, show-more or 'ready', the previous state and paging are kept, nothing is posted, and the error is logged through error() with the intent's type.
  - User impact: After a failed refresh the previous board stays. After a failed selection change the board stays as it was and the control has no visible effect.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An item with a null title. | The card shows its id as the title and search matches the id. |
| A search of only spaces. | Trimmed to empty; every in-scope item matches. |
| A search with regular-expression or markup characters, e.g. '(<b>'. | Matched as a plain substring; nothing is interpreted. |
| A column with exactly BOARD_PAGE_SIZE matches, and one with one more. | The first shows every card with hiddenCount 0 and no show-more; the second shows 50 cards, hiddenCount 1 and a show-more control. |
| Show-more, then a new search. | Paging resets, so every column starts at the first page again; total still counts every match. |
| Show-more, then a refresh that removes cards. | Paging is kept; a limit larger than the column shows every card with hiddenCount 0. |
| An issue with no correctsRef, or one whose target is unresolved. | It has no epic; it matches only 'all' and, when standalone is true, 'standalone'. |
| A story with no evidence named by its stage reason. | No approval or review badge; other badges are unaffected. |
| A review overridden or no longer blocking (effectiveVerdict block, blocking false). | The review badge reads Review blocked with tone neutral, not danger, and the card does not count as needing attention unless needsAttention says so. |
| A snapshot with no cards at all (only epics, or empty). | Six empty columns with total 0 and emptySelection false; s1's empty status message carries the explanation. |

**Invariants to preserve**

- The same snapshot, selection and paging always give the same columns, card order and counts; order follows the snapshot's id order, never time or locale. [[c15]]
- Stage, attention and conflict are read from the snapshot, never derived or overridden. [[c5]]
- Card text, titles and notice messages are inserted with textContent only. [[c7]]
- Filters, search, scope and show-more change only host memory; nothing is written. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx: (cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'); typecheck with npx tsc -p vscode-plugin`

**Test levels**

- **unit** — The pure board model: columns, placement, scope, search, attention, counts, paging, badges, accessible labels and determinism.
  - Subjects: `buildBoardViewModel`, `showMore`, `parseBoardUpMessage (show-more)`, `unknownStages`
  - Fixtures: `A snapshot fixture with stories and issues at every stage, two epics, standalone work, a conflict story, a review-blocked design, notices, and more than 50 items in one stage, cast through unknown like board-state.test.ts`, `A story whose tasks all passed but whose storyLevelResult failed, and an item whose sourceIds is not a list`
- **integration** — The host and webview: 'board' replaces 'items', show-more and filter intents reach the model with paging reset, and the webview renders columns and cards as literal text.
  - Subjects: `createDeliveryBoardHost`, `boardDownMessages`, `BOARD_WEBVIEW_SCRIPT`
  - Fixtures: `board-host.test.ts's fake channel, controlled client and runScript fake DOM whose innerHTML throws`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-model.test.ts: 'six columns in workflow order hold every story and issue exactly once, in the column the snapshot assigns'`, `board-host.test.ts: 'an item with an unknown stage is left off the board and logged once per refresh'` |
| `ac2` | `board-model.test.ts: 'an approved build with failed tasks stays in Complete and carries a text-labelled validation-conflict badge'` |
| `ac3` | `board-model.test.ts: 'a review-blocked design shows a Review blocked badge, matches Needs attention and keeps its column'` |
| `ac4` | `board-model.test.ts: 'with an epic scope and a search, cards, hidden counts, column totals and totals agree, and clearing both restores the full set'`, `board-host.test.ts: 'show-more reveals the next page of one column, and a new search resets paging'`, `board-host.test.ts: 'a selection change that cannot be rendered keeps the previous board and is logged'` |
| `ac5` | `board-model.test.ts: 'the same snapshot and filters give an identical model, including items with equal timestamps'` |
| `ac6` | `board-host.test.ts: 'the board view renders titles and notices containing markup and script as literal text'` |

## 7. Alternatives considered

### 7.1 a1: Pure board model with host-held paging and one additive show-more intent — **CHOSEN**

buildBoardViewModel(snapshot, selection, paging, labels) is pure; the host keeps a per-column page count beside the selection and an additive sc3 up-message 'show-more' {stage} raises it.

A pure module board-model.ts filters the shown snapshot's stories and issues by scope, search and the daemon's needsAttention, groups the matches into STAGE_ORDER columns keeping snapshot order (items are sorted by id, so equal timestamps cannot reorder), counts total per column and overall before paging, then slices each column to its page limit and reports hiddenCount. Cards and badges come from published fields only: the deciding records' approval and review (stage.reason.artifactIds joined to evidence), validation counts, conflict, attentionReasons and item notices, each labelled from DISPLAY_LABELS. The host holds BoardPaging (a per-stage visible limit, reset when scope, search or attention change) beside sc2's BoardState, adds one up-message variant { type: 'show-more'; stage } to sc3 through an amendment, and posts 'board' instead of the interim 'items' message. The webview renders columns and cards with textContent.

### 7.2 a2: Webview-side paging over a full column list

The view model carries every matching card per column plus a page size; the webview hides cards past the page and expands locally on show-more.

board-model.ts builds the same filtered, grouped, counted model but puts every matching card in each column and a pageSize field; hiddenCount is computed by the webview from cards.length minus what it shows. Show-more is handled entirely inside the webview script, so sc3 needs no new up-message, and the host never learns which columns are expanded.

**Rejected because:** Avoids the amendment, but breaks sc5's meaning of hiddenCount, moves counting into the webview and posts every card on every change.

### 7.3 a3: Paging inside the sc2 selection

BoardSelection gains expandedStages, and show-more is a selection change through the existing reducer.

Extend sc2's BoardSelection with an expandedStages field and sc3 with a show-more intent mapped to selection-changed, so paging rides the s1 reducer and survives refreshes like the rest of the selection. board-model.ts reads the page limits from the selection.

**Rejected because:** Works, but amends two s1-owned contracts and pushes a board-only field to every BoardSelection consumer.

## 8. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c5]]** `prior-artifact` `DEF-6a131558 k2: the board displays the daemon's facts and does not derive them`
- **[[c6]]** `doc` `docs/insrc-delivery-board-prd.html` — "FR-09Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c7]]** `prior-artifact` `DEF-6a131558 k4: artifact text is rendered as data`
- **[[c15]]** `prior-artifact` `DEF-6a131558 k9: the same snapshot and filters always produce the same order and counts`
- **[[c16]]** `prior-artifact` `AMD-6a1315585c38c41c-1: the interim items down-message; s2 stops sending it once board is posted`
- **[[c21]]** `analyze-bundle` `s1: src/workflow/delivery/types.ts DeliveryItem / DeliverySnapshot`
- **[[c22]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/ (delivery-contract, labels, board-protocol, board-state, board-host)`
- **[[c23]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/__tests__/`

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-09T06:26:26.326Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | Every DEF decision assigned to S2 is designed or explicitly deferred. | DEF.md:79 says: '"Complete" stays as the final stage's label; whether readers take it for validation success is tested in a usability session that the epics plan assigns to S2, outside this Define's acceptance criteria. [[c11]]'. The LLD cites c11 in §8 but no section plans, schedules or defers that usability session. The DEF review also proposed adding it as an S2 acceptance criterion (DEF.md:306). [files: docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/DEF.md] | Add a short note to the LLD that keeps the 'Complete' label and either plans the usability check (who runs it, and what result would switch the label to 'Completion approved') or explicitly defers it, with the reason. |
| new-versus-reuse | MED | The validation badge can be built from validation.failed and the unrecorded tasks ('Validation failed when validation.failed > 0 … otherwise Passed'). | gate.ts:349 counts tasks only: `failed: validation.tasks.filter(t => t.result === 'failed').length`. A failed story-level result is kept separately in storyLevelResult (gate.ts:301, snapshot.ts:140), but it still raises attention: gate.ts:341 `... \|\| validation.storyLevelResult === 'failed') reasons.add('validation-failed')`, and it can set conflict (types.ts:217). When a story's tasks all passed but its story-level result failed, the rule as written shows a 'Passed' validation badge next to a 'Validation failed' attention badge. That is a contradictory signal, and it departs from the daemon's own fact (k2). [files: src/workflow/delivery/gate.ts, src/workflow/delivery/snapshot.ts] | Change the validation-badge rule to read storyLevelResult as well: 'Validation failed' when validation.failed > 0 or storyLevelResult === 'failed', and 'Unrecorded' when an unrecorded task or storyLevelResult === 'unrecorded'. Add the case to the badge fixture. |
| change-sites | MED | The call-site inventory for replacing 'items' with 'board' and adding paging to boardDownMessages is complete (board-protocol.ts, board-state.ts, board-host.ts). | Existing s1 tests read the 'items' message directly and call the two-argument signature: board-state.test.ts:43-44, :82-87 (`boardDownMessages(state, DISPLAY_LABELS)...find(p => p.type === 'items')`, including the unknown-stage label test), and board-host.test.ts:79-80, :120, :240-244 (the webview test delivers `{ type: 'items', ... }`). Removing the message breaks these tests. Neither §3.1's call sites nor §6 says whether to rewrite or retire them, or which 'board' tests replace their coverage. One example is the s1 test that an unlabelled stage shows its raw id; under s2 that item is dropped instead. The BoardDownMessage 'items' variant itself is also not said to be removed or kept. [files: vscode-plugin/src/delivery/__tests__/board-state.test.ts, vscode-plugin/src/delivery/__tests__/board-host.test.ts, vscode-plugin/src/delivery/board-protocol.ts] | List board-state.test.ts and board-host.test.ts as change sites. Say which s1 assertions move to 'board' messages and which are retired (with the unknown-stage behaviour change made explicit). State whether the 'items' variant stays in BoardDownMessage. |
| error-paths | MED | An item with an unknown stage is detected and the host logs one warn() per refresh naming the stage id and its count. | buildBoardViewModel is specified as pure, and BoardViewModel (HLD.md:249-254) has no field that reports dropped stages, so the host cannot learn which stages were dropped or how many. boardDownMessages also runs on every dispatch and every post(): board-host.ts:102 on 'ready', :108 on every selection change and refresh event. A log placed there would fire on every search keystroke, not once per refresh. The statement 'counts still agree' holds, but the detection and logging seam is not designed. [files: vscode-plugin/src/delivery/board-host.ts, docs/epics/e2-delivery-board-vs-code-goal-E202610086a131558/HLD.md] | Specify the seam, for example a separate pure helper `unknownStages(snapshot): ReadonlyMap<string, number>` that the host calls only when a 'snapshot-arrived' event is applied. Add a test that asserts exactly one warn() per refresh. |
| error-paths | MED | A throw while building the board model is recovered by s1's existing path, which ends the refresh as failed over the previous board. | Recovery exists only in refresh() (board-host.ts:141-154). handle() calls dispatch() without try/catch for set-scope, set-search, set-attention and the rest (board-host.ts:157-171), and the new show-more uses the same path. post() on 'ready' (board-host.ts:101-103) also has no catch. The client checks only that items, rootIds and notices are lists (delivery-client.ts:117-119). Under the LLD's own matching rule, an item whose sourceIds or title is malformed renders fine with an empty search (because the search is trimmed to empty and nothing is read), passes the refresh, and then throws on the first set-search. That exception escapes from the webview onMessage handler with no state recovery and no stated user impact. [files: vscode-plugin/src/delivery/board-host.ts, vscode-plugin/src/delivery/delivery-client.ts] | State the handling for a throw during a selection change, show-more or ready: for example, wrap dispatch in handle() and post() so that state is not committed, the error is logged, and the status is marked failed. Add a host test that uses a malformed sourceIds and a non-empty search. |

#### Could not verify (does not block)

_None._
