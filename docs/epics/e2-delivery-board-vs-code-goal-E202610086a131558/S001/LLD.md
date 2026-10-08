<!-- insrc:artifact LLD-6a1315585c38c41c-s1 -->

# LLD: E202610086a131558:S001

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**HLD base run:** `wf-1791485029499-gnjvqz`
**HLD effective hash:** `e74ad3720f26...`

This story builds the board's frame: a command that opens the delivery board in an editor tab, a client that fetches the open workspace's delivery snapshot from the daemon with a time limit, and the board's state, which keeps the last good snapshot, ignores answers to superseded refreshes and keeps the reader's choices across refreshes. The tab shows when its data was taken and says plainly whether the board is loading, current, empty, partly readable, unavailable or failed, with a simple list of items until the columns of the next story arrive.

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

**Rollout phase:** Phase A — board shell and shared contracts
**Owns:** `sc1` (Delivery client), `sc2` (Board state: load status and selection), `sc3` (Board webview message protocol), `sc4` (Display labels)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The pure functions that filter the snapshot by scope, search and attention, group the matches into the six columns in the daemon's order, count over the whole selection, page each column behind show-more, and build each card's badges and accessible label from the snapshot's published fields; and the board view's rendering in the webview script, text-only. Its LLD maps every acceptance criterion to a named test, including ac6 (a title and a notice containing markup and script render as literal text). — owns `sc5`
- `s3`: The epic rollup view model (per-epic completion counts that name their denominator, stories grouped by stage, a separate standalone group) and the issue view model (each issue with its fix stories as children and its parent relationship or unresolved-parent notice), both built from the same filtered selection as sc5, and their rendering. Its LLD maps every acceptance criterion to a named test.
- `s4`: Building item details from the snapshot item, reading the story's PLAN through the delivery client and caching it per snapshot, joining the plan's dependencies and acceptance checks to the snapshot's task results, fetching an evidence-read record and showing it as preformatted text, routing a review-view entry to the review pane's openArtifact, the change inside the review pane that implements openArtifact without altering its list, rendering or approval behaviour, and the details rendering. Its LLD maps every acceptance criterion to a named test, including ac5 for both paths: a review-view record opens through openArtifact, and when the review pane is unavailable or the record is evidence-read the record is shown read-only from workflow.deliveryEvidence; the review pane's existing tests run unchanged. — owns `sc6`, `sc7`
- `s5`: The narrow-pane layout (stage-grouped list), keyboard navigation and focus return, live-region announcements of selection and refresh results, the compact and comfortable density styles, and the 500-item performance fixture with its measured render and filter timings. Its LLD maps every acceptance criterion to a named test, with ac5 as the measured fixture.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `DeliveryClient`

```typescript
function createDeliveryClient(deps: DeliveryClientDeps): DeliveryClient
```

**Parameters:**
- `deps: DeliveryClientDeps` — rpc (the shared IpcClient's rpc), the workspace root or null, and the two deadlines in milliseconds.

**Returns:** `DeliveryClient` — The board's only path to workflow.delivery and workflow.deliveryEvidence; it exposes no other method.

**Preconditions:**
- deps.deadlinesMs.snapshot and deps.deadlinesMs.evidence are positive.

**Postconditions:**
- Nothing is sent to the daemon until snapshot() or evidence() is called.

### 2.2 `DeliveryClient.snapshot`

```typescript
snapshot(): Promise<DeliveryResult<DeliverySnapshot>>
```

**Returns:** `DeliveryResult<DeliverySnapshot>` — ok with the snapshot when the daemon returned a schemaVersion-1 DeliverySnapshot for deps.repo; otherwise a typed failure. Never rejects.

**Errors:**
- `no-workspace` when deps.repo is null; the daemon is not called.
- `daemon-unavailable` when rpc rejects with the shared client's 'daemon is not running' message (ENOENT or ECONNREFUSED on the socket).
- `timed-out` when No answer within deps.deadlinesMs.snapshot; the late answer, if any, is ignored.
- `read-failed` when rpc rejects for any other reason (including an envelope error such as an unknown method on an older daemon), the result is a DeliveryError { error }, the result is not an object, or its schemaVersion is not 1.

**Postconditions:**
- The request sent is workflow.delivery with params { repo: deps.repo }.
- A failure's message is the daemon's error text, the socket error message, or a fixed text naming the timeout or the unsupported schemaVersion.

### 2.3 `DeliveryClient.evidence`

```typescript
evidence(artifactId: string): Promise<DeliveryResult<DeliveryEvidenceRecord>>
```

**Parameters:**
- `artifactId: string` — An artifact id taken from the current snapshot's evidence entries.

**Returns:** `DeliveryResult<DeliveryEvidenceRecord>` — ok with the record when the daemon returned one; otherwise a typed failure. Never rejects. Provided for s4; s1 does not call it.

**Errors:**
- `no-workspace` when deps.repo is null.
- `daemon-unavailable` when As for snapshot().
- `timed-out` when No answer within deps.deadlinesMs.evidence.
- `read-failed` when Any other rejection, or a DeliveryError result such as 'invalid artifact id' or 'not found'.

**Postconditions:**
- The request sent is workflow.deliveryEvidence with params { repo: deps.repo, artifactId }.

### 2.4 `BoardState`

```typescript
function initialBoardState(): BoardState;
function reduceBoardState(state: BoardState, event: BoardEvent): BoardState;

type BoardEvent =
  | { readonly type: 'refresh-requested'; readonly seq: number }
  | { readonly type: 'snapshot-arrived'; readonly seq: number; readonly result: DeliveryResult<DeliverySnapshot>; readonly at: string }
  | { readonly type: 'selection-changed'; readonly selection: BoardSelection };

/** BoardState (sc2) plus the request bookkeeping the reducer needs. */
interface BoardState {
  readonly status: LoadStatus;
  readonly selection: BoardSelection;
  readonly selectionNotice: string | null;
  /** The newest refresh request number; only its answer is applied. */
  readonly latestSeq: number;
}
```

**Parameters:**
- `state: BoardState` — The current state.
- `event: BoardEvent` — One refresh request, one client answer stamped with its request number, or one selection change.

**Returns:** `BoardState` — The next state; the input is never mutated.

**Preconditions:**
- refresh-requested seq values are strictly increasing.

**Postconditions:**
- snapshot-arrived with seq !== state.latestSeq returns state unchanged (a superseded answer is dropped).
- An ok snapshot gives status 'empty' only when it has no items and is not partial (unreadableCount is 0 and it has no store-level notices); otherwise 'ready'. AppliedSnapshot.partial is true when unreadableCount > 0 or the snapshot has store-level notices, so a store whose every record failed to load shows 'ready' with a partial notice, never 'empty'.
- A daemon-unavailable or no-workspace failure gives 'unavailable', a read-failed or timed-out failure gives 'failed'; both keep the last applied snapshot as last.
- On an applied snapshot the selection is kept; a selectedItemId not present in the new snapshot is set to null and selectionNotice says the item is no longer in the board; otherwise selectionNotice is null.
- refresh-requested sets status to 'loading' with the last applied snapshot kept.

### 2.5 `BoardDownMessage`

```typescript
function boardDownMessages(state: BoardState, labels: DisplayLabels): readonly Envelope<BoardDownMessage>[]
```

**Parameters:**
- `state: BoardState` — The state to render.
- `labels: DisplayLabels` — Text for stage ids in the interim item list.

**Returns:** `readonly Envelope<BoardDownMessage>[]` — Always a 'status' message (StatusView) first; then, when a snapshot is shown (current, or last for a stale state), an 'items' message listing every item's id, kind, title and stage label in the snapshot's own order. s2 replaces the 'items' message with 'board'.

**Postconditions:**
- StatusView.stale is true exactly when the state is unavailable or failed and a last snapshot exists; takenAt is that snapshot's takenAt; message names the failure and its time.
- StatusView.partialNotice is set when the shown snapshot is partial, naming unreadableCount and the store-level notices.
- No message carries artifact text other than titles, labels and notice messages, all destined for textContent.

### 2.6 `BoardUpMessage`

```typescript
function parseBoardUpMessage(raw: unknown): BoardUpMessage | null
```

**Parameters:**
- `raw: unknown` — Whatever the webview posted.

**Returns:** `BoardUpMessage | null` — The typed intent when raw is an Envelope<BoardUpMessage> with v 1 and a known type with well-typed fields; null otherwise.

**Postconditions:**
- A null result is ignored by the host and logged once through warn().

### 2.7 `DisplayLabels`

```typescript
const DISPLAY_LABELS: DisplayLabels
```

**Returns:** `DisplayLabels` — Exhaustive text for every DeliveryStage, AttentionReason, NoticeCode, TaskResult, ApprovalState and ReviewVerdict, plus the unplanned label; e.g. stage 'ready-plan-approved' -> 'Ready · plan approved', 'complete' -> 'Complete'.

**Postconditions:**
- Adding a member to any of the six unions without a label fails to compile.

### 2.8 `DeliveryClientDeps`

```typescript
function createDeliveryBoardHost(deps: {
  readonly createPanel: (opts: { readonly viewType: string; readonly title: string }) => ChatPanelChannel;
  readonly client: DeliveryClient;
  readonly logger: ChatPanelLogger;
  readonly now: () => string;
  readonly genNonce: () => string;
}): { open(): void; dispose(): void }
```

**Parameters:**
- `deps: object` — The webview channel factory, the delivery client (built from DeliveryClientDeps), the logger, a clock and a nonce source; vscode-free so the host is tested with fakes.

**Returns:** `{ open(): void; dispose(): void }` — open() reveals the existing panel or creates one (view type 'insrc.deliveryBoard', title 'Delivery board'), sets its CSP-locked HTML, and starts a refresh; dispose() closes it.

**Postconditions:**
- Each 'refresh' intent (and open) dispatches refresh-requested with the next seq, calls client.snapshot(), and dispatches snapshot-arrived with that seq; after each dispatch it posts boardDownMessages(state).
- A dropped (superseded) answer is logged through warn(); a failed or timed-out one through error(), with the seq and elapsed time.
- Selection intents (set-view, set-scope, set-search, set-attention, select-item, close-details, set-density) update the selection through selection-changed; in s1 they change no rendering beyond the status and item list.
- lc1: before s1 completes, the builder compares the editor tab against a sidebar (webview view) entry point for the board, and records the decision and its reason in the BUILD record's summary; the editor tab stays unless that comparison shows a sidebar entry is required.
- The host records the channel's onDidDispose; once disposed it discards any answer still outstanding without dispatching, posting or logging it, and the next open() creates a new panel with a fresh state.

## 3. Data model changes

### 3.1 `vscode-plugin/src/delivery/delivery-contract.ts type mirror` — field-add

Re-export DeliveryStage, AttentionReason, NoticeCode, TaskResult, ApprovalState and ReviewVerdict from src/workflow/delivery/types.ts beside the nine existing types; tsconfig.delivery-contract.json and E1's contract test keep compiling it.

**Call sites:**
- `vscode-plugin/src/delivery/delivery-contract.ts`
- `src/workflow/delivery/types.ts`

### 3.2 `BoardState` — new

The sc2 state value plus latestSeq, changed only by reduceBoardState; held by the board host for the panel's life and never persisted.


### 3.3 `vscode-plugin/package.json contributes.commands` — field-add

One command, insrc.delivery.openBoard titled 'Open delivery board' in category insrc, registered through the command registry in extension.ts outside the insrc.chat.enabled gate. The id joins the closed InsrcCommandId union in vscode-plugin/src/surfaces/command-registry.ts (CommandDescriptor.id is typed by it); packaging.test.ts's exact command list and truthful-sync.test.ts's command count (13 to 14) gain it, and an extension wiring test asserts the command is contributed.

**Call sites:**
- `vscode-plugin/package.json`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/surfaces/command-registry.ts`
- `vscode-plugin/src/__tests__/packaging.test.ts`
- `vscode-plugin/src/config/__tests__/truthful-sync.test.ts`

### 3.4 `vscode-plugin/src/extension.ts board wiring` — field-add

extension.ts builds the board host's ChatPanelLogger from the existing warn-only panelLog plus an error sink: { warn: panelLog.warn, error: (m) => console.error(`[insrc] ${m}`) }, builds the delivery client from createIpcClient().rpc, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null and deadlines of 30 s and 15 s, creates the host with vscode.window.createWebviewPanel(viewType, title, ViewColumn.Active, { enableScripts: true }) wrapped as a ChatPanelChannel, and registers insrc.delivery.openBoard through the command registry.

**Call sites:**
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `src/shared/ipc-client.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | createDeliveryClient implements DeliveryClient over DeliveryClientDeps: repo in every request, a deadline per call, typed failures, a schemaVersion-1 check; extension.ts builds it from createIpcClient().rpc, vscode.workspace.workspaceFolders[0] and deadlines of 30 s and 15 s. |
| `sc2` | implements | BoardState, LoadStatus, AppliedSnapshot and BoardSelection as sketched, changed only through reduceBoardState; the initial selection is view 'board', scope all, empty search, attention off, nothing selected, density comfortable. |
| `sc3` | implements | Envelope v1 with the sketched BoardDownMessage and BoardUpMessage unions, parsed by parseBoardUpMessage; s1 posts 'status' and the interim 'items' message (see the HLD amendment proposal) and accepts every up-message type, applying the selection ones to state for later stories. |
| `sc4` | implements | DISPLAY_LABELS with exhaustive Records over the six re-exported unions; s1 uses only the stage labels, in the interim item list. |

## 5. Error paths

**Error cases**

- **The daemon is not running or its socket does not exist.** (recoverable)
  - Detection: rpc rejects with the shared client's fixed 'daemon is not running' message, which the client maps to a daemon-unavailable failure.
  - Response: Status becomes 'unavailable' with that message and the time; a last snapshot, if any, stays shown and is marked stale.
  - User impact: The board says the daemon is unavailable rather than showing an empty board.
- **No workspace folder is open.** (recoverable)
  - Detection: deps.repo is null when the client is called; the client returns no-workspace without calling the daemon.
  - Response: Status becomes 'unavailable' with a message asking the user to open a folder.
  - User impact: The board explains why it cannot show anything.
- **The daemon answers with a DeliveryError, such as an unreadable artifact store or 'repo is required'.** (recoverable)
  - Detection: The resolved result is an object with a string error field.
  - Response: The client returns read-failed with the daemon's text; status becomes 'failed', keeping any last snapshot as stale.
  - User impact: A failed read is shown as a failure, distinct from an empty workspace.
- **The daemon is older and does not know workflow.delivery.** (recoverable)
  - Detection: rpc rejects with the daemon envelope's error text (an unknown-method error), which is not the not-running message.
  - Response: read-failed with that text; status 'failed'.
  - User impact: The board reports the daemon's error instead of hanging or showing an empty board.
- **The daemon accepts the connection but never answers.** (recoverable)
  - Detection: The snapshot deadline (30 s) passes before rpc settles.
  - Response: The client returns timed-out; status 'failed' with a timeout message; a later answer to that request is ignored.
  - User impact: The board leaves the loading state instead of spinning forever.
- **The daemon returns a snapshot with a schemaVersion other than 1, or a value that is not an object.** (recoverable)
  - Detection: The client checks typeof result === 'object' and result.schemaVersion === 1 before returning ok.
  - Response: read-failed naming the unsupported schemaVersion; the snapshot is not applied.
  - User impact: A contract the board does not understand is never half-rendered.
- **The webview posts a malformed or unknown message.** (recoverable)
  - Detection: parseBoardUpMessage returns null.
  - Response: The host ignores it and logs one warn() line.
  - User impact: None visible; a bad message cannot trigger any action.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A snapshot with zero items and zero unreadable records. | Status 'empty' with a message that the workspace has no recorded delivery work; no items message content. |
| A snapshot with zero items but unreadable records. | Status 'ready' with a partial notice naming the unreadable count, not 'empty', so missing data is never mistaken for missing work. |
| A snapshot with items and store-level notices. | Status 'ready', partial true, partialNotice listing the notices; every readable item is listed. |
| Two refreshes; the first answer arrives after the second. | The second answer is applied; the first is dropped and logged through warn(); nothing from it is shown. |
| A refresh fails while the board shows an older snapshot. | The older snapshot stays, marked stale, with the failure and its time. |
| The selected item disappears in the next snapshot. | selectedItemId is cleared and selectionNotice tells the user; search, scope, attention, view and density are kept. |
| The open command runs while the board is already open. | The existing panel is revealed and refreshed; no second panel is created. |
| The panel is closed while a refresh is outstanding. | The host has recorded the dispose, so the late answer (or its timeout) is discarded: it is not dispatched, not posted and not logged. |

**Invariants to preserve**

- Only one coherent snapshot is applied at a time; a superseded response is dropped and never merged with a newer one. [[c8]]
- No navigation, filter, expansion or refresh changes any artifact, approval, source file or Git state. [[c6]]

## 6. Test strategy

**Test framework:** `node:test with node:assert/strict, run by tsx --test over vscode-plugin/src/**/__tests__/*.test.ts (the plugin's package.json test script), using the existing fakeIpc and fake ChatPanelChannel idioms`

**Test levels**

- **unit** — The client's request shape, deadline and failure classification; the reducer's sequencing, status and selection rules; the down-message derivation; up-message parsing; label exhaustiveness.
  - Subjects: `createDeliveryClient`, `reduceBoardState / initialBoardState`, `boardDownMessages`, `parseBoardUpMessage`, `DISPLAY_LABELS`
  - Fixtures: `A fake rpc whose answers and rejections are scripted per call, including a never-settling promise for the timeout case`, `Small DeliverySnapshot fixtures: empty, items, unreadable records, store-level notices`
- **integration** — The board host over a fake ChatPanelChannel and the real reducer: open, refresh, out-of-order answers, failures, reveal of an existing panel; and the client against the daemon's real handleDelivery over a temporary git repository to prove nothing is written.
  - Subjects: `createDeliveryBoardHost`, `createDeliveryClient over src/workflow/delivery/handlers.ts handleDelivery`
  - Fixtures: `A fake ChatPanelChannel recording setHtml and posted messages`, `A temporary git repository with a small artifact store and docs/ tree`
- **contract** — The type mirror still compiles with the six added re-exports, and the new command is contributed and wired.
  - Subjects: `vscode-plugin/src/delivery/delivery-contract.ts`, `vscode-plugin/package.json contributes.commands`, `vscode-plugin/src/extension.ts wiring`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `board-host.test.ts: 'opening the board creates one editor-tab panel with a CSP-locked document and posts the snapshot's items with its taken-at time'`, `packaging.test.ts: 'the 7 durable ad0d45c9 contributes.commands are preserved + the config/panel-track additions (S003 refresh, S004 panel commands)'` |
| `ac2` | `board-state.test.ts: 'a failed refresh keeps the last snapshot as stale with the failure and its time'` |
| `ac3` | `board-state.test.ts: 'empty, unavailable, failed and partial snapshots each give their own status, a partial snapshot still lists every item, and a snapshot with no items but unreadable records is partial, not empty'`, `delivery-client.test.ts: 'the client classifies a missing workspace, a stopped daemon, a daemon error, a timeout and an unknown schemaVersion into their own failure kinds'` |
| `ac4` | `board-state.test.ts: 'an answer to a superseded refresh is dropped and nothing from it is applied'`, `board-host.test.ts: 'when the earlier refresh answers after the later one, only the later snapshot is posted'`, `board-host.test.ts: 'an answer or timeout that arrives after the panel is closed is neither posted nor logged'` |
| `ac5` | `board-state.test.ts: 'a refresh keeps the selection, and clears a selected item that is gone with a notice'` |
| `ac6` | `delivery-client.test.ts: 'opening and refreshing against a temporary git repository leaves the store, docs and git untouched'` |

## 7. Alternatives considered

### 7.1 a1: Pure state reducer driven by a thin effect shell — **CHOSEN**

Board state (sc2) changes only through a pure reduce(state, event) function; a small host shell issues client calls, stamps request numbers, dispatches their results as events and posts the down-messages derived from the new state.

The delivery client (sc1) is a factory over an rpc function, the workspace repo and two deadlines; each method races the rpc against its deadline and classifies the outcome into a DeliveryResult. Board state is a plain value: the load status, the selection and a selection notice, plus the next request number and the sequence number of the outstanding request. A pure reducer handles events such as refresh-requested, snapshot-arrived (with its request number), and the reader's intents; a snapshot-arrived event whose number is not the newest outstanding one leaves state unchanged, which is the whole of the drop-the-superseded-response rule.

The host shell, created with injected deps (createPanel, the client, a clock, a nonce generator and a ChatPanelLogger), owns the webview channel. On each intent it dispatches to the reducer, performs any requested client call, and after every state change derives the down-messages (status always; a minimal item list in s1, replaced by s2's board model later) from the new state and posts them. The display labels (sc4) and the message protocol types (sc3) are separate modules the reducer and renderers import.

### 7.2 a2: Imperative host closure with mutable state

One createDeliveryBoardHost factory holds mutable fields (last snapshot, outstanding request number, selection) and handles each message inline, like createDocsReviewHost.

The host closure keeps let-bound fields and a message switch. A refresh increments a counter, awaits the client, compares the counter before applying, and posts status and items directly from inside the handler. Failures set the status fields in place. The client, labels and protocol types are as in a1.

This follows the shape of the existing review host (docs-review-panel.ts createDocsReviewHost), which keeps its state in closure variables and posts from its handlers.

**Rejected because:** Meets the criteria in principle, but ac4 and ac5 depend on correct ordering of awaits inside one handler, which is only partially checkable without controllable fake promises, and later stories keep editing the same switch.

## 8. References

- **[[c3]]** `prior-artifact` `docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md` — "Fix sc7 in this HLD, version it with schemaVersion, and allow only additive optional fields after approval; any breaking change goes through an HLD amendment before E2 consumes it."
- **[[c6]]** `doc` `docs/insrc-delivery-board-prd.html` — "FR-09Keep the MVP read-only: all navigation and filtering leave artifacts, approvals, code, and Git state unchanged."
- **[[c8]]** `doc` `docs/insrc-delivery-board-prd.html` — "Concurrency: apply one coherent snapshot at a time. Drop superseded responses; do not combine half of an old snapshot with half of a newer one."
- **[[c9]]** `doc` `docs/insrc-delivery-board-prd.html` — "Placement: a dedicated editor tab is the leading candidate for a wide board; validate against a tool-window entry point."
- **[[c10]]** `doc` `docs/insrc-delivery-board-prd.html` — "Refresh strategy: manual refresh is sufficient for the first increment; confirm whether existing daemon events can support later automatic updates."
- **[[c11]]** `doc` `docs/plans/delivery-board-epics.md` — "| Completion wording | Keep "Complete"; test it in E2's usability session | E2 S2 |"
- **[[c25]]** `code` `src/shared/ipc-client.ts` — "export async function rpc<T = unknown>(method: string, params: unknown = {}, connect: () => Socket = () => createConnection(PATHS.sockFile)): Promise<T> {"
- **[[c26]]** `code` `src/shared/ipc-client.ts` — "reject(new Error('daemon is not running — start it with: insrc daemon start'));"
- **[[c27]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "export interface ChatPanelChannel {"
- **[[c28]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "export interface ChatPanelLogger {"
- **[[c29]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts` — "const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;"
- **[[c30]]** `code` `vscode-plugin/src/extension.ts` — "const panelLog = { warn: (message: string): void => console.warn(`[insrc] ${message}`) };"
- **[[c31]]** `code` `vscode-plugin/src/__tests__/packaging.test.ts` — "test('the 7 durable ad0d45c9 contributes.commands are preserved + the config/panel-track additions (S003 refresh, S004 panel commands)', () => {"
- **[[c32]]** `code` `vscode-plugin/src/delivery/delivery-contract.ts` — "readonly 'workflow.delivery':         { readonly request: DeliverySnapshotRequest; readonly response: DeliverySnapshotResponse };"
- **[[c33]]** `code` `src/workflow/delivery/types.ts` — "readonly schemaVersion:   1;"
- **[[c34]]** `code` `vscode-plugin/src/chat/__tests__/docs-review-client.test.ts` — "function fakeIpc(responder: (method: string, params: unknown) => unknown) {"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 14 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-08T19:24:53.930Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
