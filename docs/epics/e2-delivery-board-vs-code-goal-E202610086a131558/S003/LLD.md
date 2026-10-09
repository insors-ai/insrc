<!-- insrc:artifact LLD-6a1315585c38c41c-s3 -->

# LLD: E202610096a131558:S003

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**HLD base run:** `wf-1791485029499-gnjvqz`
**HLD effective hash:** `d362668c917b...`

s3 adds two views beside the board: an epic rollup and an issue view. The rollup shows each epic with a completion count that names what it counts, such as '2 of 5 stories complete', and its matching cards grouped by stage. Work that belongs to no epic goes in its own 'Not in an epic' group and never counts towards an epic. The issue view lists every matching issue with the story or epic it corrects, which the reader can follow, or with its unresolved-parent notice, and lists each of its fix stories with its own stage. All three views read one shared match set, so switching views keeps the reader's search and scope and the counts agree with the board.

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

**Rollout phase:** Phase C — epic rollup and issue view
**Consumes:** `sc1` (Delivery client), `sc2` (Board state: load status and selection), `sc3` (Board webview message protocol), `sc4` (Display labels), `sc5` (Board view model)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The open-board command and its entry in the plugin's command list, the webview panel creation in an editor tab with its CSP and nonce, the refresh sequencing (request numbers and dropping superseded responses), the mapping of client failures to load states, and the status bar of the board (taken-at time, stale and partial notices, the empty, unavailable and failed messages). s1 also records the editor-tab versus sidebar placement check. It renders a minimal list of item titles until s2 supplies columns. s1 also extends vscode-plugin/src/delivery/delivery-contract.ts additively with the stage, attention, notice, task-result, approval and review-verdict types sc4 needs. Its LLD maps every acceptance criterion to a named test, including ac4 (an earlier response arriving after a later one is dropped, with fake out-of-order responses) and ac6 (repeated open and refresh against a temporary git repository leave the store, docs and git untouched). — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: The pure functions that filter the snapshot by scope, search and attention, group the matches into the six columns in the daemon's order, count over the whole selection, page each column behind show-more, and build each card's badges and accessible label from the snapshot's published fields; and the board view's rendering in the webview script, text-only. Its LLD maps every acceptance criterion to a named test, including ac6 (a title and a notice containing markup and script render as literal text). — owns `sc5`
- `s4`: Building item details from the snapshot item, reading the story's PLAN through the delivery client and caching it per snapshot, joining the plan's dependencies and acceptance checks to the snapshot's task results, fetching an evidence-read record and showing it as preformatted text, routing a review-view entry to the review pane's openArtifact, the change inside the review pane that implements openArtifact without altering its list, rendering or approval behaviour, and the details rendering. Its LLD maps every acceptance criterion to a named test, including ac5 for both paths: a review-view record opens through openArtifact, and when the review pane is unavailable or the record is evidence-read the record is shown read-only from workflow.deliveryEvidence; the review pane's existing tests run unchanged. — owns `sc6`, `sc7`
- `s5`: The narrow-pane layout (stage-grouped list), keyboard navigation and focus return, live-region announcements of selection and refresh results, the compact and comfortable density styles, and the 500-item performance fixture with its measured render and filter timings. Its LLD maps every acceptance criterion to a named test, with ac5 as the measured fixture.

## 2. Contract details

**Surface level:** internal

### 2.1 `buildBoardViewModel`

```typescript
interface MatchedCard {
  readonly item: DeliveryItemView;
  readonly epic: DeliveryItemView | null;
  readonly stage: DeliveryStage;
  readonly card: CardView;
}
function selectMatches(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): readonly MatchedCard[]
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — Scope, search and needsAttentionOnly.
- `labels: DisplayLabels` — sc4 text for each card.

**Returns:** `readonly MatchedCard[]` — Every story and issue with a known stage that matches the selection, in snapshot order, each with its epic (s2's epicOf) and its CardView.

**Postconditions:**
- buildBoardViewModel builds from selectMatches and its output is unchanged; s2's board-model tests keep passing.
- The board, the rollup and the issue view all call selectMatches with the same arguments, so they count the same matches.

### 2.2 `EpicRollupViewModel`

```typescript
interface StageGroupView { readonly stage: DeliveryStage; readonly label: string; readonly cards: readonly CardView[] }
interface EpicGroupView {
  /** null for the 'Not in an epic' group. */
  readonly epicItemId: string | null;
  readonly title: string;
  /** e.g. '2 of 5 stories complete'; names its denominator. */
  readonly completionLabel: string;
  readonly storiesComplete: number;
  readonly storiesTotal: number;
  readonly issueCount: number;
  /** Matching cards in this group. */
  readonly total: number;
  /** Non-empty stages only, in STAGE_ORDER. */
  readonly stages: readonly StageGroupView[];
}
interface EpicRollupViewModel {
  readonly epics: readonly EpicGroupView[];
  readonly notInEpic: EpicGroupView;
  readonly totals: { readonly items: number; readonly needsAttention: number };
  readonly selectedItemId: string | null;
  readonly emptySelection: boolean;
}
function buildEpicRollup(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): EpicRollupViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — The board's selection; the rollup applies the same scope, search and attention filter.
- `labels: DisplayLabels` — Stage labels.

**Returns:** `EpicRollupViewModel` — One group per epic in snapshot order, then the 'Not in an epic' group of matches with no epic, with totals that equal the board's totals for the same selection.

**Postconditions:**
- Every match from selectMatches is in exactly one group. A match flagged standalone goes to notInEpic whatever its epic is, so standalone work never counts towards an epic (ac2); any other match goes to its epic's group, or to notInEpic when its epic is null. totals.items is the number of matches, the same as the board's totals.items.
- storiesTotal counts a group's matching stories, storiesComplete counts those whose stage is 'complete', and completionLabel reads 'N of M stories complete' ('1 of 1 story complete' when M is 1). Issues are counted in issueCount and never in the story counts.
- An epic is listed when it has a match, when it is the scoped epic, or when nothing narrows the selection (scope all, empty search, attention off); a listed epic with no matches shows '0 of 0 stories complete'.
- Within a group, cards keep snapshot order inside each stage, and stages follow STAGE_ORDER.
- emptySelection is true when the snapshot has cards but none match; selectedItemId echoes the selection.

### 2.3 `IssueViewModel`

```typescript
interface LinkView {
  readonly itemId: string;
  readonly kind: 'epic' | 'story' | 'task' | 'issue';
  readonly title: string;
  /** null for an epic or an item with no stage. */
  readonly stageLabel: string | null;
}
interface IssueEntryView {
  readonly card: CardView;
  readonly stageLabel: string;
  /** The story or epic the issue corrects; null when it names none or cannot be resolved. */
  readonly parent: LinkView | null;
  /** The issue's unresolved-parent notice message, when it has one. */
  readonly parentNotice: string | null;
  /** Each fix story among the issue's children, in childIds order. */
  readonly fixStories: readonly LinkView[];
}
interface IssueViewModel {
  readonly issues: readonly IssueEntryView[];
  readonly totals: { readonly issues: number; readonly needsAttention: number };
  readonly selectedItemId: string | null;
  readonly emptySelection: boolean;
}
function buildIssueView(snapshot: DeliverySnapshot, selection: BoardSelection, labels: DisplayLabels): IssueViewModel
```

**Parameters:**
- `snapshot: DeliverySnapshot` — The shown snapshot.
- `selection: BoardSelection` — The same selection the board uses.
- `labels: DisplayLabels` — Stage labels.

**Returns:** `IssueViewModel` — Every matching issue in snapshot order with its parent link or notice and its fix stories.

**Postconditions:**
- issues are exactly the issue matches of selectMatches, so totals.issues equals the number of issue cards on the board for the same selection.
- parent is the snapshot item named by correctsRef.resolvedItemId; when it is null or missing from the snapshot, parent is null and parentNotice carries the issue's unresolved-parent notice message if it has one.
- fixStories lists every child of the issue whose kind is story, each with its own stage label, whether or not it matches the search; a child id missing from the snapshot is skipped.
- Links carry ids only; the webview follows one by posting the existing select-item intent.
- A follow link the host receives as select-item is checked against the shown snapshot, as set-scope's epic id is; an id that is not on the board is ignored and logged once through warn(), and the selection is unchanged.

### 2.4 `boardDownMessages`

```typescript
function boardDownMessages(state: BoardState, labels: DisplayLabels, paging: BoardPaging): readonly Envelope<BoardDownMessage>[]
```

**Parameters:**
- `state: BoardState` — sc2's state; selection.view picks the view.
- `labels: DisplayLabels` — sc4 text.
- `paging: BoardPaging` — Used by the board view only.

**Returns:** `readonly Envelope<BoardDownMessage>[]` — The status message, then, when a snapshot is shown, the 'board', 'epics' or 'issues' message for selection.view.

**Postconditions:**
- Only the selected view's model is built and posted.
- A set-view keeps scope, search, attention and paging, so switching back to the board shows the same page.

## 3. Data model changes

### 3.1 `vscode-plugin/src/delivery/board-protocol.ts EpicRollupViewModel and IssueViewModel` — field-modify

Both change from unknown to the interfaces above, declared beside BoardViewModel with StageGroupView, EpicGroupView, LinkView and IssueEntryView.

**Call sites:**
- `vscode-plugin/src/delivery/board-protocol.ts`
- `vscode-plugin/src/delivery/board-state.ts`
- `vscode-plugin/src/delivery/board-host.ts`

### 3.2 `vscode-plugin/src/delivery/board-model.ts selectMatches` — new

The matching step inside buildBoardViewModel is exported as selectMatches, with no change in behaviour; board-views.ts (new) holds buildEpicRollup and buildIssueView.

**Call sites:**
- `vscode-plugin/src/delivery/board-model.ts`
- `vscode-plugin/src/delivery/__tests__/board-model.test.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc2` | consumes | Reads selection.view to choose the view, and scope, search, needsAttentionOnly and selectedItemId to build it; set-view and select-item keep going through selection-changed. |
| `sc3` | consumes | Fills the declared 'epics' and 'issues' down-messages and uses the existing set-view and select-item up-messages; no amendment. |
| `sc4` | consumes | Stage labels for groups and links; notice text comes from the snapshot. |
| `sc5` | consumes | Reuses CardView for every listed card and the board's matching (through selectMatches), so the views agree with the board. |
| `sc1` | consumes | No new client call. |

## 5. Error paths

**Error cases**

- **An issue's correctsRef names an item id that is not in the snapshot (the daemon resolved it, then a later record removed it, or the snapshot is partial).** (recoverable)
  - Detection: buildIssueView looks correctsRef.resolvedItemId up in the snapshot's id index and finds nothing.
  - Response: parent is null and parentNotice carries the issue's unresolved-parent notice if it has one; otherwise the entry reads 'Parent not on the board' from a fixed text, so the reader still sees that a link was recorded.
  - User impact: The issue is listed with a notice instead of a link.
- **A follow link names an item that is not on the board, for example one a refresh removed after the view was drawn.** (recoverable)
  - Detection: The host's select-item handler looks the id up in the shown snapshot before dispatching selection-changed, as knownScope does for set-scope.
  - Response: The intent is ignored and logged once through warn(); the selection and the view are unchanged.
  - User impact: Nothing happens on that click; the redrawn view no longer shows the link.
- **Building the rollup or the issue view throws on a malformed item that got past the client's shallow checks.** (recoverable)
  - Detection: apply() in the host derives the messages before keeping the new state (s2), so the throw surfaces inside it.
  - Response: The previous state is kept, nothing is posted and the error is logged through error() with the intent's type, as for the board.
  - User impact: The view stays as it was.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An epic with no stories in the snapshot, nothing narrowing the selection. | The epic is listed with '0 of 0 stories complete' and no stage groups. |
| An epic whose only story is complete. | '1 of 1 story complete'. |
| A search that matches only one story of an epic. | The epic is listed with '0 of 1 stories complete' or '1 of 1 story complete' for that story alone; epics with no match are not listed. |
| An epic scope whose epic has no matches after a search. | That epic is still listed, with '0 of 0 stories complete', so the reader sees the scope is active. |
| An issue that corrects an epic rather than a story. | Its parent link names the epic, with no stage label. In the rollup the issue counts in that epic's issueCount only when it is not flagged standalone; the daemon writes issues as standalone today (graph.ts:228), so it normally sits in 'Not in an epic'. |
| An issue with no fix stories yet. | Listed with an empty fix-story list, which the webview shows as 'No fix stories yet'. |
| A fix story whose own search text does not match. | Still listed under its matching issue, with its stage. |
| A fix story of an issue that belongs to an epic. | On the board and in the rollup it sits in 'Not in an epic', because s2's epicOf follows a story's parent epic only and a fix story's parent is its issue; under its issue in the issue view it is listed as a child. |
| An issue with no correctsRef at all (it names no parent). | parent and parentNotice are both null; the entry shows no parent line. |
| A standalone issue that corrects a story in an epic. | In the issue view its parent link names the story. In the rollup it is in 'Not in an epic', never in that epic's counts. On the board, epic scope still includes it through s2's epicOf, and the totals agree because every match is in exactly one rollup group. |

**Invariants to preserve**

- The board, the rollup and the issue view count the same matches for the same selection. [[c15]]
- Stage, parent links and notices are read from the snapshot; nothing is derived. [[c5]]
- Titles, notices and link text are inserted with textContent only. [[c7]]
- Switching views or following a link changes only host memory. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx: (cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'); typecheck with npx tsc -p vscode-plugin`

**Test levels**

- **unit** — The pure rollup and issue-view builders and the shared match step: grouping, completion counts, the not-in-an-epic group, parent links and notices, fix stories, and agreement with the board.
  - Subjects: `selectMatches`, `buildEpicRollup`, `buildIssueView`
  - Fixtures: `board-fixtures.ts snapshots with two epics (one with five stories, two complete), standalone stories and issues, an issue correcting a story, an issue correcting an epic, an issue with an unresolved parent and its notice, and an issue with two fix stories at different stages`, `A standalone issue that corrects a story in an epic`
- **integration** — The host and webview: set-view posts the selected view's model with the selection kept, and the webview renders the rollup and issue view as text, with view tabs and follow links that post only set-view and select-item.
  - Subjects: `boardDownMessages`, `createDeliveryBoardHost`, `BOARD_WEBVIEW_SCRIPT`
  - Fixtures: `board-host.test.ts's openWith, lastBoard and the runScript fake DOM whose innerHTML throws`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-views.test.ts: 'an epic with five stories, two complete, reads 2 of 5 stories complete and groups its stories by stage'` |
| `ac2` | `board-views.test.ts: 'standalone stories and issues sit in their own group and count towards no epic'` |
| `ac3` | `board-views.test.ts: 'an issue links to the story it corrects, and an issue with an unresolved parent is listed with its notice'`, `board-host.test.ts: 'the epic rollup and issue view render as text, and their tabs and links post only set-view and select-item'`, `board-host.test.ts: 'a follow link naming an item that is not on the board is ignored and logged'` |
| `ac4` | `board-views.test.ts: 'an issue with two fix stories lists each as its own child with its own stage'` |
| `ac5` | `board-views.test.ts: 'with a search and an epic scope, the rollup and issue view count the same matches as the board'`, `board-host.test.ts: 'switching views posts the selected view with the same selection, and switching back keeps the board page'` |

## 7. Alternatives considered

### 7.1 a1: One shared match step feeding three pure view builders, with the selected view posted — **CHOSEN**

board-model.ts exposes selectMatches(snapshot, selection); buildBoardViewModel, buildEpicRollup and buildIssueView all build from it, and boardDownMessages posts only the model of selection.view.

Lift s2's private matching (scope, search, attention, known stage, epicOf, cardOf) into one exported selectMatches that returns each matching story or issue with its epic and its CardView, in snapshot order. buildBoardViewModel keeps its output and builds from it. A new pure module board-views.ts adds buildEpicRollup (one group per epic in snapshot order, with its matching cards grouped by STAGE_ORDER and 'N of M stories complete' naming the denominator, plus one standalone group for matches with no epic) and buildIssueView (each matching issue with its parent relationship: the resolved story or epic with its id, title and stage label, or the issue's unresolved-parent notice; and each fix story among its children as a distinct entry with its own stage). EpicRollupViewModel and IssueViewModel replace unknown in board-protocol.ts. boardDownMessages posts status and then the board, the epics or the issues message by selection.view, so switching views keeps the same selection. A parent or fix story is followed with the existing select-item intent. The webview adds Board, Epics and Issues view tabs that post set-view, and renders both new views as text.

### 7.2 a2: Build the rollup and issue view from the board's view model

buildEpicRollup and buildIssueView take the BoardViewModel's columns as input and regroup its cards.

Leave board-model.ts as is and write the two new builders over BoardViewModel: regroup each column's cards by their epicTitle for the rollup, and list the issue cards for the issue view, looking parents and fix stories up in the snapshot by id.

**Rejected because:** Counts would miss cards behind show-more, and epics with the same title would merge.

### 7.3 a3: Post all three view models on every change

boardDownMessages always posts board, epics and issues; the webview shows the one selection.view names.

Use a1's shared match step and builders, but post all three models after every dispatch and let the webview pick which to display, so a view switch needs no new message.

**Rejected because:** Correct, but triples the work per change and moves view choice into the webview.

## 8. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c5]]** `prior-artifact` `DEF-6a131558 k2: the board displays the daemon's facts and does not derive them`
- **[[c6]]** `doc` `docs/insrc-delivery-board-prd.html` — "FR-09Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c7]]** `prior-artifact` `DEF-6a131558 k4: artifact text is rendered as data`
- **[[c15]]** `prior-artifact` `DEF-6a131558 k9: the same snapshot and filters always produce the same order and counts`
- **[[c21]]** `analyze-bundle` `s1: src/workflow/delivery/graph.ts issue fix stories, correctsRef, unresolved-parent`
- **[[c22]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/ (board-model, board-state, board-host, board-protocol)`
- **[[c23]]** `analyze-bundle` `s1: vscode-plugin/src/delivery/__tests__/`

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**2 do not hold · 0 could not be verified · 10 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-09T08:49:26.307Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| coverage-of-intent | MED | ac2: standalone stories and standalone issues are shown in their own group and are never counted towards any epic, by grouping every match whose epicOf is null into 'Not in an epic'. | The rollup groups on s2's epicOf, not on the item's standalone flag. epicOf (board-model.ts:58-68) returns an epic for an issue through its correctsRef: 'if (target.kind === 'epic') return target; ... return targetParent?.kind === 'epic' ? targetParent : null'. The issue's standalone flag is set separately (graph.ts:228 'standalone: head.meta['standalone'] === true'), and issue artifacts are written with standalone: true (issue-artifact.test.ts:57, 132). So a standalone issue that corrects an epic's story has standalone=true, and the board's 'standalone' scope includes it (inScope: 'case 'standalone': return item.standalone'), and its card reads 'Standalone.' (cardOf). Yet the rollup puts it in that epic's group and issueCount, and the LLD's edge-case table says so explicitly. Under scope 'standalone', the rollup would then list epic groups. That breaks ac2 ('standalone issues ... not counted towards any epic'). [files: vscode-plugin/src/delivery/board-model.ts, src/workflow/delivery/graph.ts] | Decide the rollup's grouping key against ac2: either group standalone-flagged items under the standalone group whatever epicOf says, or record in the LLD that an issue correcting epic work counts in that epic's issueCount even when flagged standalone, with a reason. Then add a test with a standalone issue that corrects an epic story. |
| error-paths | MED | A follow link to an item a refresh has removed is detected because 'the host's selection-changed reduction already clears a selectedItemId that is not in the snapshot and sets selectionNotice (s1)'. | reduceBoardState handles selection-changed as 'case 'selection-changed': return { ...state, selection: event.selection };' (board-state.ts:109-110), with no membership check. Only applySnapshot (:93-100) clears a missing selectedItemId and sets selectionNotice, and only when a snapshot arrives. board-host.ts:248 'case 'select-item': select({ ...sel, selectedItemId: msg.itemId })' passes any id through. So a stale link clicked after a refresh sets a selectedItemId that is not in the snapshot, with no notice. [files: vscode-plugin/src/delivery/board-state.ts, vscode-plugin/src/delivery/board-host.ts] | Either validate the id in the host's select-item handler (as knownScope does for set-scope), clearing it with s1's notice, or restate the detection and response so they match what the code does. Add a test for a select-item naming an absent id. |

#### Could not verify (does not block)

_None._
