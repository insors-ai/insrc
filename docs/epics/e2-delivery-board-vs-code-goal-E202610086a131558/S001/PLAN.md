<!-- insrc:artifact PLAN-6a1315585c38c41c-s1 -->

# Plan: E202610096a131558:S001

## Summary

**Epic:** `e2-delivery-board-vs-code-goal`
**LLD run:** `wf-1791486668911-o3u8rv`
**LLD effective hash:** `e74ad3720f26...`

Building s1 means adding the board's foundations to the VS Code plugin: the extra delivery types and their display labels, a time-limited client for the daemon's delivery methods, the board's message types, a pure state machine for refreshes and selection, and a host that owns the webview tab. The last step registers an 'Open delivery board' command and records whether the board stays in an editor tab or moves to a sidebar. Each piece is tested on its own with fakes, plus one run against the daemon's real handler over a temporary git repository.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Type-mirror re-exports and display labels | S | — | unit: labels.test.ts: 'every stage, attention reason, notice code, task result, approval state and review verdict has a display label'; unit: labels.test.ts: 'the six stage labels read in workflow order'; integration: contract.test.ts: 'the VS Code plugin type-checks against the published delivery types' | [[c1]] [[c3]] |
| 2 | **`t2`** Delivery client | M | `t1` | unit: delivery-client.test.ts: 'snapshot and evidence send the workspace repo and nothing is sent without a workspace'; unit: delivery-client.test.ts: 'the client classifies a missing workspace, a stopped daemon, a daemon error, a timeout and an unknown schemaVersion into their own failure kinds'; integration: delivery-client.test.ts: 'opening and refreshing against a temporary git repository leaves the store, docs and git untouched' | [[c2]] [[c9]] |
| 3 | **`t3`** Board message protocol and up-message parser | S | — | unit: board-protocol.test.ts: 'every valid up-message parses and a wrong version, unknown type or mistyped field gives null' | [[c4]] |
| 4 | **`t4`** Board-state reducer and down-message derivation | M | `t1`, `t2`, `t3` | unit: board-state.test.ts: 'an answer to a superseded refresh is dropped and nothing from it is applied'; unit: board-state.test.ts: 'empty, unavailable, failed and partial snapshots each give their own status, a partial snapshot still lists every item, and a snapshot with no items but unreadable records is partial, not empty'; unit: board-state.test.ts: 'a failed refresh keeps the last snapshot as stale with the failure and its time'; unit: board-state.test.ts: 'a refresh keeps the selection, and clears a selected item that is gone with a notice' | [[c5]] [[c6]] [[c9]] |
| 5 | **`t5`** Board host and webview document | M | `t4` | integration: board-host.test.ts: 'opening the board creates one editor-tab panel with a CSP-locked document and posts the snapshot's items with its taken-at time'; integration: board-host.test.ts: 'when the earlier refresh answers after the later one, only the later snapshot is posted'; integration: board-host.test.ts: 'an answer or timeout that arrives after the panel is closed is neither posted nor logged'; integration: board-host.test.ts: 'the board document inserts text only through textContent and posts only board up-messages' | [[c7]] [[c9]] |
| 6 | **`t6`** Extension wiring, command and placement record | S | `t5` | integration: packaging.test.ts: 'the 7 durable ad0d45c9 contributes.commands are preserved + the config/panel-track additions (S003 refresh, S004 panel commands)'; integration: truthful-sync.test.ts: 'package.json contributes.commands includes insrc.settings.refresh alongside the 7 shipped commands'; integration: board-wiring.test.ts: 'extension.ts registers insrc.delivery.openBoard outside the chat gate with a warn-and-error logger and a repo-scoped delivery client' | [[c8]] [[c10]] |

### 1.1 E202610096a131558:S001:T001 — Type-mirror re-exports and display labels

Re-export DeliveryStage, AttentionReason, NoticeCode, TaskResult, ApprovalState and ReviewVerdict from the plugin's delivery type mirror, and add DISPLAY_LABELS with exhaustive Records over the six unions plus the unplanned label.

**Acceptance checks:**
- delivery-contract.ts re-exports the six types beside the nine existing ones and stays type-only; `npx tsc -p vscode-plugin/tsconfig.delivery-contract.json` passes.
- DISPLAY_LABELS has a label for every member of the six unions; removing a key fails to compile.
- The stage labels read Scoped, Design & plan, Ready · design approved, Ready · plan approved, Build recorded, Complete.

### 1.2 E202610096a131558:S001:T002 — Delivery client

createDeliveryClient over an rpc function, the workspace repo and two deadlines: snapshot() and evidence(artifactId) send repo in every request, race the deadline, never reject, and classify outcomes into no-workspace, daemon-unavailable, timed-out and read-failed, rejecting a snapshot whose schemaVersion is not 1. It needs only t1's re-exported types, not its labels.

**Acceptance checks:**
- snapshot() sends workflow.delivery with { repo } and evidence() sends workflow.deliveryEvidence with { repo, artifactId }; nothing is sent when repo is null.
- Each failure kind is produced by its documented condition, and neither method ever rejects.
- A never-settling rpc yields timed-out after the deadline, and its late answer is ignored.
- Wired to the daemon's real handleDelivery over a temporary git repository, repeated snapshot() calls change no file under the repository and leave git status and HEAD unchanged.

### 1.3 E202610096a131558:S001:T003 — Board message protocol and up-message parser

The Envelope, BoardDownMessage (including the interim 'items' variant from AMD-6a131558-1), BoardUpMessage and StatusView types, and parseBoardUpMessage, which accepts only a v1 envelope with a known type and well-typed fields.

**Acceptance checks:**
- The down- and up-message unions match the HLD sc3 sketch plus the approved 'items' variant.
- parseBoardUpMessage returns the typed intent for every valid up-message and null for a wrong version, an unknown type or a mistyped field.

### 1.4 E202610096a131558:S001:T004 — Board-state reducer and down-message derivation

initialBoardState, reduceBoardState over refresh-requested, snapshot-arrived and selection-changed events, and boardDownMessages, which derives the status message and the interim item list from state using the display labels.

**Acceptance checks:**
- An answer whose seq is not the latest leaves state unchanged.
- Status is empty only for a non-partial snapshot with no items; partial snapshots are ready with a partial notice; daemon-unavailable and no-workspace give unavailable, read-failed and timed-out give failed, each keeping the last snapshot.
- The selection survives an applied snapshot; a selected item that is gone is cleared with a notice; selection-changed changes only the selection and leaves status and latestSeq unchanged.
- boardDownMessages always starts with status, marks a failure over an old snapshot as stale with the failure and its time, and lists every item of the shown snapshot in its own order.

### 1.5 E202610096a131558:S001:T005 — Board host and webview document

createDeliveryBoardHost over createPanel, the client, a ChatPanelLogger, a clock and a nonce source: opens or reveals one panel, sets a CSP-locked document whose single nonce'd script renders the status and item list as text, runs refreshes through the reducer, posts derived messages, logs superseded and failed answers, and discards answers after the panel is disposed.

**Acceptance checks:**
- open() creates one panel with view type insrc.deliveryBoard and a document whose CSP is default-src 'none' with a nonce'd script; a second open() reveals it and refreshes.
- When an earlier refresh answers after a later one, only the later snapshot is posted, and the dropped answer is logged through warn().
- A failed or timed-out refresh is logged through error(); an answer or timeout arriving after dispose is neither posted nor logged.
- Asserted against the generated document, the webview script inserts all text with textContent (never innerHTML) and posts only BoardUpMessage envelopes; richer rendering tests belong to s2.

### 1.6 E202610096a131558:S001:T006 — Extension wiring, command and placement record

Add insrc.delivery.openBoard to package.json, the InsrcCommandId union and the command tests; wire the client, logger and host in extension.ts outside the chat gate; and record the editor-tab versus sidebar placement decision in the s1 BUILD record's summary.

**Acceptance checks:**
- package.json contributes insrc.delivery.openBoard ('Open delivery board', category insrc), InsrcCommandId includes it, and packaging.test.ts and truthful-sync.test.ts expect it.
- extension.ts builds the logger as { warn: panelLog.warn, error: console.error wrapper }, the client from createIpcClient().rpc with workspaceFolders[0] and 30 s / 15 s deadlines, and registers the command outside the insrc.chat.enabled gate.
- `npx tsc -p vscode-plugin` passes and the plugin's existing tests still pass.
- The comparison of the editor tab against a sidebar entry point, and the decision with its reason, are given as the validate summary so they land in the s1 BUILD record.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| createDeliveryClient | `t2` |
| reduceBoardState / initialBoardState | `t4` |
| boardDownMessages | `t4` |
| parseBoardUpMessage | `t3` |
| DISPLAY_LABELS | `t1` |
| createDeliveryBoardHost | `t5` |
| createDeliveryClient over src/workflow/delivery/handlers.ts handleDelivery | `t2` |
| vscode-plugin/src/delivery/delivery-contract.ts | `t1` |
| vscode-plugin/package.json contributes.commands | `t6` |
| vscode-plugin/src/extension.ts wiring | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 dataModelChanges: vscode-plugin/src/delivery/delivery-contract.ts type mirror re-exports`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails: DeliveryClient, DeliveryClient.snapshot, DeliveryClient.evidence (sc1)`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: DisplayLabels / DISPLAY_LABELS (sc4)`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails: BoardUpMessage / parseBoardUpMessage and the sc3 protocol with AMD-6a1315585c38c41c-1's 'items' variant`
- **[[c5]]** `prior-artifact` `LLD s1 contractDetails: BoardState / initialBoardState / reduceBoardState (sc2)`
- **[[c6]]** `prior-artifact` `LLD s1 contractDetails: BoardDownMessage / boardDownMessages`
- **[[c7]]** `prior-artifact` `LLD s1 contractDetails: createDeliveryBoardHost (the board host over DeliveryClientDeps)`
- **[[c8]]** `prior-artifact` `LLD s1 dataModelChanges: package.json contributes.commands, InsrcCommandId and extension.ts board wiring`
- **[[c9]]** `prior-artifact` `LLD s1 errorPaths: error cases, edge cases and invariants`
- **[[c10]]** `prior-artifact` `LLD s1 localConstraint lc1 and the board host's lc1 postcondition: the editor-tab versus sidebar placement decision`
