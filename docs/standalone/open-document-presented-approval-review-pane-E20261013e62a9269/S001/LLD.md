<!-- insrc:artifact LLD-e62a9269a7cb9550-S001 -->

# LLD: E20261013e62a9269:S001

## Summary

**Epic:** `open-document-presented-approval-review-pane`
**HLD base run:** `wf-1791912226419-3iyvlb`
**HLD effective hash:** `e5eb37a3afce...`

When the assistant in the chat produces a document that needs your approval, the review pane now opens on that document by itself; you no longer run the review command and look for it in the table. It opens once per turn for each document, beside the chat and without taking the cursor out of the chat box. If a turn produces several documents they are opened one after another, so the last is the one on show and the others are in the pane's table. A turn that was picked up again after a window reload opens what it produces from then on; a document it wrote before the reload is in the table. Acceptance: ac1, a document a chat turn presents for approval is opened in the review pane without any action, whether a workflow tool call wrote it or it became pending some other way during the turn, for a turn the window runs and for one it picks up again; ac2, each document is opened once per turn, the chat keeps keyboard focus, and re-reads or re-renders of the pane open nothing; ac3, nothing happens when the review pane is not available, and a failure to read the pending list never disturbs the chat turn.

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

### 2.1 `createReviewPresenter`

```typescript
createReviewPresenter(deps: { pendingDocuments(): Promise<readonly { id: string; mdPath: string }[]>; open(target: { artifactId: string; mdPath: string }): void; log: ChatPanelLogger }): ReviewPresenter
```

**Parameters:**
- `deps.pendingDocuments: () => Promise<readonly { id: string; mdPath: string }[]>` — The documents awaiting approval, each with its path; wired to the review client's new pendingDocuments().
- `deps.open: (target: { artifactId: string; mdPath: string }) => void` — Opens the review pane on one document; wired to the review host's openArtifact with quiet set.
- `deps.log: ChatPanelLogger` — Where a failed pending read or a throwing open is recorded.

**Returns:** `ReviewPresenter { begin(): PresentedTurn }; PresentedTurn { toolResult(output: string): void; end(): void }` — New module vscode-plugin/src/chat/review-presenter.ts, free of vscode. begin() starts one turn's state and returns its handle, which becomes the newest. When the previous newest handle has ended (or there is none) the state is fresh: the set of ids this turn opened is empty and `before`, the ids pending now, is read at once. When the previous newest handle has NOT ended (the user sent a message while a turn was still running), the new handle takes over that handle's `before` and its opened set instead of reading anew, so whatever the earlier turn makes pending is still new to the later one. toolResult(output): when the text contains 'pendingApproval' and parses as a JSON object whose pendingApproval.artifactPath is a non-empty string, it reads the pending list and opens the document whose mdPath EQUALS that path (both are absolute paths the daemon resolves the same way); as tolerance only, a list path that is the block's path's tail after a '/' also matches. It opens nothing when this turn already opened that id. end(): when this handle is still the newest, it reads the pending list and opens each document whose id is not in `before` and was not opened by this turn, in the list's order; when a later begin() has happened it opens nothing: the later handle carries its state on and its own end opens what is new. end() a second time does nothing. Every call of a handle is queued behind that handle's earlier calls, including the read begin() started, so a slow read cannot reorder them. Calls return at once and never throw to the caller.

**Errors:**
- `none thrown` when A pending read that fails or throws, and an open that throws, are logged; nothing is opened for that call. If the read in begin() failed, `before` is unknown and end() opens nothing, while toolResult still works.

**Preconditions:**
- The chat host calls begin() once per turn and end() once on its handle

**Postconditions:**
- A turn opens a document at most once
- A document that was pending before the turn is opened only if a tool result of the turn names it
- Text that is not JSON, JSON without the block, and a path that matches no pending document open nothing
- A later turn may open the same document again when it is presented again
- With overlapping turns (begin A, begin B, end A, end B) A's end opens nothing and B's end opens every document that became pending since A began and was not opened yet

### 2.2 `createChatPanelHost (deps.presenter)`

```typescript
deps.presenter?: ReviewPresenter | undefined
```

**Parameters:**
- `deps.presenter: ReviewPresenter | undefined` — Optional. The chat host begins a presented turn for every turn it runs and for every turn it follows.

**Returns:** `ChatPanelHost` — RUN TURN, in startTurn: after the two early returns that refuse a message before any run, and just before turns.start, `const shown = presenter?.begin()`. In the run sink's onEvent, a 'tool-result' event whose isError is not true calls shown.toolResult(ev.output), before the existing handling and whatever that handling does with the event (held back for a diff or posted). A turn that was superseded gets no more events at its sink (turn-lifecycle.ts:361-374 drops them before sink.onEvent), so its later tool results are not passed; what it writes afterwards is opened by the end of the turn that superseded it, which took over its state. shown.end() is in a finally around the existing `await run`, which is the one site that runs for a turn that completed, failed, was stopped or was superseded. FOLLOWED TURN, in followLiveTurn (this window's own saved turn picked up after a window reload or a switch back to the chat, or one whose owner is gone): the presented turn is begun LAZILY, on the follow sink's first onEvent, never when the follow is asked for: followLiveTurn is asked for on every webview 'ready' (chat-panel.ts:691, 1436-1442) and turns.follow returns without following while this window runs the turn (turn-lifecycle.ts:403), so a request alone must not begin anything. toolResult is passed in the sink's onEvent the same way; end() is called in the sink's onEnd when the outcome is 'ended' and a turn was begun. A follow whose outcome is not 'ended' (a failed resume leaves the turn for a later follow) ends nothing. For a followed turn `before` is the list at its first event, so a document the turn wrote before the reload is not opened by the end rule (it is in the table); one it writes afterwards is. Each presenter call is wrapped so a throw is logged and the turn goes on.

**Errors:**
- `none thrown` when A throwing presenter is caught and logged.

**Preconditions:**
- None: with no presenter the host behaves as today

**Postconditions:**
- The events posted to the chat's webview and the transcript rows are exactly as before
- end() is called once per run turn, also when the turn failed, was stopped or was superseded
- A message refused before any run begins no presented turn

### 2.3 `DocsReviewHost.openArtifact (quiet), createPanel (quiet), ChatPanelChannel.reveal (preserveFocus)`

```typescript
openArtifact(target: { artifactId: string; mdPath: string; quiet?: boolean | undefined }): void; createPanel(opts: { viewType: string; title: string; quiet?: boolean | undefined }): ChatPanelChannel; reveal(opts?: { preserveFocus?: boolean | undefined }): void
```

**Parameters:**
- `target.quiet: boolean | undefined` — The pane is shown without taking keyboard focus. Absent or false: as today (the review command and the delivery board).
- `createPanel opts.quiet: boolean | undefined` — The review host passes it on when it has to create the pane for a quiet open. extension.ts then creates the panel with { viewColumn: ViewColumn.Beside, preserveFocus: true }; without it, with ViewColumn.Active exactly as today.
- `reveal opts.preserveFocus: boolean | undefined` — An optional argument on the shared channel interface. webview-channel.ts calls panel.reveal(undefined, true) when it is set and panel.reveal() otherwise, so every existing caller is unchanged.

**Returns:** `void` — The host's open() gains an internal quiet argument: with no pane it calls createPanel({ viewType, title, quiet: true }); with a pane it calls channel.reveal({ preserveFocus: true }), so a pane that is a background tab is brought to the front of its group without moving the cursor out of the chat. The document is then opened with reveal as today, so the pane's document view shows it. The plugin's vscode.d.ts gains the two forms it does not declare yet: createWebviewPanel's showOptions as ViewColumn | { viewColumn: ViewColumn; preserveFocus?: boolean }, reveal(viewColumn?, preserveFocus?) and ViewColumn.Beside if absent. The reviewer's drafts on another document are kept, as they are saved per document.

**Errors:**
- `none thrown` when A failed read of the document is shown in the pane as a failed open is today.

**Preconditions:**
- The review host exists (the chat is enabled)

**Postconditions:**
- The review command and the delivery board create the pane in the active column with focus and reveal it with focus, as before
- A quiet open never moves keyboard focus
- review-wiring.test.ts, which pins the source of the review host's createPanel in extension.ts (its lines 118-120 match `createPanel: ({ viewType, title }) => {` and the createWebviewPanel call with ViewColumn.Active), is restated in this Story: the non-quiet branch still creates with ViewColumn.Active and { enableScripts: true }; the quiet branch with { viewColumn: ViewColumn.Beside, preserveFocus: true }

### 2.4 `DocsReviewClient.pendingDocuments`

```typescript
pendingDocuments(): Promise<readonly { id: string; mdPath: string }[]>
```

**Returns:** `Promise<readonly { id: string; mdPath: string }[]>` — One workflow.pending call (with the workspace folder as repo, as every call of the client); each pending artifact with a non-empty mdPath, in the daemon's order. It does not touch the id-to-path map that pending() keeps.

**Errors:**
- `Error` when The daemon answers with an error, as pending() throws today; the presenter logs it.

**Postconditions:**
- pending() and content() are unchanged

## 3. Data model changes

### 3.1 `ReviewPresenter` — new-entity

In-memory only, per turn: the ids pending when the turn began and the ids the turn opened; plus which handle is the newest. Nothing is stored and no daemon shape changes.

```
+ ReviewPresenter { begin(): PresentedTurn }; + PresentedTurn { toolResult(output: string); end() }
```

**Call sites:**
- `vscode-plugin/src/chat/review-presenter.ts`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `ChatPanelChannel / DocsReviewHostDeps.createPanel` — field-add

Two optional arguments on in-process interfaces: reveal(opts?: { preserveFocus? }) and createPanel's opts.quiet. Existing callers pass neither.

```
reveal(): void -> reveal(opts?: { preserveFocus?: boolean }): void; createPanel(opts: { viewType; title; + quiet?: boolean })
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/webview-channel.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/extension.ts`
- `vscode-plugin/src/vscode.d.ts`
- `vscode-plugin/src/chat/__tests__/review-wiring.test.ts`

## 4. Error paths

**Error cases**

- **The pending list cannot be read at the start of a turn** (recoverable)
  - Detection: pendingDocuments rejects
  - Response: Logged; the presenter marks what was pending before as unknown
  - User impact: Documents named by a tool result still open; a document that only became pending by another route is not opened this turn and is in the pane's table
- **The pending list cannot be read for a tool result or at the turn's end** (recoverable)
  - Detection: pendingDocuments rejects
  - Response: Logged; nothing is opened for that call
  - User impact: The document is not opened by itself; the assistant's message still names it and the table lists it
- **Opening the pane throws** (recoverable)
  - Detection: deps.open throws
  - Response: Caught and logged; the id is still marked opened so it is not retried in a loop
  - User impact: The chat turn is not disturbed
- **The review pane is not available (the review host was not created)** (recoverable)
  - Detection: extension.ts passes no presenter
  - Response: The chat host makes no presenter calls
  - User impact: As today
- **The presenter itself throws synchronously** (recoverable)
  - Detection: The chat host's wrapper catches it
  - Response: Logged; the turn goes on
  - User impact: None

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A tool result names a document that is no longer pending (it was approved in the same turn) | No pending document has that path, so nothing is opened |
| A revision of a document that was already pending before the turn | Opened when the tool result names it; not opened by the end-of-turn rule, since its id was pending before |
| Two documents are presented in one turn | Each is opened as it is presented; the last is the one on show and the others are in the table |
| The same document is named by two tool results of one turn | Opened once |
| The assistant drives a workflow from a shell script, so no tool result carries the block | The document is opened at the turn's end, as it became pending during the turn |
| A tool result is large (the document's markdown rides with it) | Parsed once as JSON; text that does not contain the word pendingApproval is not parsed at all |
| A tool result of an ordinary tool whose text happens to be JSON with other keys | Nothing is opened |
| The reviewer has drafts on another document in the pane when a new one is opened | The drafts are kept with their document, as on any change of document |
| A pending document with no path | Skipped by pendingDocuments; it cannot be opened |
| A message sent from the review pane starts a chat turn (a decision) | It is a turn like any other; approving a document makes nothing new pending, so nothing opens unless the turn produces a document |
| A turn is stopped or fails | Its end still runs (the finally around the run); documents that became pending in it are opened if it is still the newest turn |
| A turn is superseded: the user sends another message while it runs, and its process ends after the next turn began | Its later events never reach its sink, so its later tool results are not seen. The turn that superseded it took over its start list and what it opened, so a document the old turn writes at any time is opened at the newer turn's end if no tool result opened it first. The old turn's own end opens nothing |
| A turn picked up after a window reload or a switch back to the chat (a followed turn) | A presented turn begins on the follow's first event: tool results from then on open what they name, and at its end documents that became pending since that first event are opened. A document it wrote before the reload is not opened by itself; it is in the table |
| A follow that does not start (another live window owns the turn) or a resume that fails | Nothing is begun (no event arrives) or nothing is ended; nothing is opened by the end rule, and the run turn's own handle, if there is one, is untouched |
| The pane exists but is a background tab when a document is presented | It is brought to the front of its group with the cursor left where it was |
| The review command or the delivery board opens the pane | As before: the active column, with focus |
| The chat tab is hidden and shown again while a turn runs (a webview 'ready', which asks for a follow that does not start) | No presented turn is begun and no pending read is made; the run turn's end still opens what became pending |

**Invariants to preserve**

- The chat's posted events and transcript rows are unchanged by the presenter [[c1]]
- Only a chat turn's events call the presenter; the review pane's own re-reads and re-renders never do [[c2]]
- The plugin reaches the daemon only through its client; no new daemon call or shape [[c3]]
- The review host stays free of vscode; the pane is created by the injected createPanel [[c2]]
- The delivery board's openArtifact behaves as before [[c2]]
- A failure in presenting never fails or delays a chat turn [[c1]]
- Every existing caller of reveal() and createPanel behaves as before; the new arguments are optional [[c9]]
- A stopped or superseded turn still reports nothing more to the webview [[c8]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), as the plugin's chat tests are, with the fake channel, fake client and fake turn events those tests already use`

**Test levels**

- **unit** — The presenter's rule, with absolute paths as the daemon gives them, and the client's new call.
  - Subjects: `review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing`, `review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged`, `review presenter: a later turn opens a document again when it is presented again; several documents in one turn are opened in order, so the last presented is the one on show`, `review presenter: a turn begun while the one before it has not ended takes over that turn's start list and what it opened; the earlier turn's end then opens nothing and the later turn's end opens what became pending since the earlier one began`, `docs review client: pendingDocuments returns each pending document's id and path and skips one with no path`
- **integration** — The chat host's call sites for run and followed turns, the review host's quiet open and the wiring.
  - Subjects: `chat host: a run turn begins a presenter turn just before it starts, passes each tool result that is not an error, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn`, `chat host: a followed turn begins a presenter turn on its first event, not when the follow is asked for, passes its tool results and ends it when the follow ended; a ready message during a run turn begins nothing, and the run turn's end still opens a newly pending document`, `extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in the active column without quiet and beside without focus with it; there is no presenter when the review pane is not created`, `docs review host: openArtifact with quiet creates the pane with quiet when there is none and reveals an existing one without taking focus; without quiet both are as before`, `chat host: a superseded turn's later tool results are not passed to the presenter, and a document it writes afterwards is opened at the end of the turn that superseded it`
- **smoke** — The suite and a hand check in VS Code.
  - Subjects: `The plugin's whole test suite and typecheck pass apart from failures that exist before this Story`, `By hand in VS Code: a workflow run in the chat that writes a document awaiting approval opens the review pane on that document without any action, once, with the cursor left in the chat; a second document in a later turn replaces it`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing`, `review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged`, `chat host: a run turn begins a presenter turn just before it starts, passes each tool result that is not an error, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn`, `chat host: a followed turn begins a presenter turn on its first event, not when the follow is asked for, passes its tool results and ends it when the follow ended; a ready message during a run turn begins nothing, and the run turn's end still opens a newly pending document`, `extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in the active column without quiet and beside without focus with it; there is no presenter when the review pane is not created`, `By hand in VS Code: a workflow run in the chat that writes a document awaiting approval opens the review pane on that document without any action, once, with the cursor left in the chat; a second document in a later turn replaces it`, `chat host: a superseded turn's later tool results are not passed to the presenter, and a document it writes afterwards is opened at the end of the turn that superseded it` |
| `ac2` | `review presenter: a tool result that carries a pendingApproval path opens the pending document with that absolute path once; the same path again in the turn does not; a path that is not pending, a result with no such block and one that is not JSON open nothing`, `review presenter: a later turn opens a document again when it is presented again; several documents in one turn are opened in order, so the last presented is the one on show`, `review presenter: a turn begun while the one before it has not ended takes over that turn's start list and what it opened; the earlier turn's end then opens nothing and the later turn's end opens what became pending since the earlier one began`, `docs review host: openArtifact with quiet creates the pane with quiet when there is none and reveals an existing one without taking focus; without quiet both are as before`, `By hand in VS Code: a workflow run in the chat that writes a document awaiting approval opens the review pane on that document without any action, once, with the cursor left in the chat; a second document in a later turn replaces it` |
| `ac3` | `review presenter: at the end of a turn each document that became pending during the turn and was not opened yet is opened; a document pending before the turn is not; a failed pending read opens nothing and is logged`, `chat host: a run turn begins a presenter turn just before it starts, passes each tool result that is not an error, and ends it once when the run is over, also for a turn that failed, was stopped or was superseded; a message refused before any run begins none; a presenter that throws does not disturb the turn`, `extension wiring: the chat host's presenter opens a document through the review host's openArtifact with the pending list's id and path and quiet set; createPanel creates the pane in the active column without quiet and beside without focus with it; there is no presenter when the review pane is not created`, `The plugin's whole test suite and typecheck pass apart from failures that exist before this Story` |

## 6. Migration

**State before:** A document awaiting approval is shown in the review pane only when the user runs the review command and picks it, or opens it from the delivery board. The chat host passes tool results to its webview and transcript only.

**State after:** The chat host tells a presenter about each run turn's start, tool results and end; the presenter opens presented documents in the review pane, once per turn each, without taking focus.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add pendingDocuments() to the review client — ↩ rollbackable
2. Add review-presenter.ts with its rule — ↩ rollbackable
3. Add the optional reveal argument to the channel, the quiet option to createPanel and openArtifact, and the two declarations to vscode.d.ts — ↩ rollbackable
4. Begin, feed and end a presented turn from the chat host's run turn and followed turn, and wire the presenter in extension.ts — ↩ rollbackable
5. Run the suite, build, package and install the plugin; check by hand — ↩ rollbackable

**Backward compat:** Plugin only. No daemon call, IPC shape or stored record changes. With no presenter wired the chat behaves exactly as before.

## 7. Alternatives considered

### 7.1 a1: A presenter fed by the chat turn: the tool result's path, and the pending list at the turn's end — **CHOSEN**

The chat host tells a small presenter about each tool result and the turn's end; the presenter opens what was presented, once per turn

A new module, review-presenter.ts, holds the rule. The chat host calls it at three points of a turn it runs: the start (the presenter reads the pending list and remembers which documents were already pending), each tool result (when the result's text is JSON carrying pendingApproval.artifactPath, the presenter re-reads the pending list and opens the pending document with that path), and the end (it re-reads the list and opens every document that became pending during the turn and was not opened yet in it). Opening goes through the review host's openArtifact with a new quiet flag, so the pane is created or updated without pulling keyboard focus from the chat. The client gains pendingDocuments() to give ids with paths.

### 7.2 a2: Parse the tool result only

Open the document named by a tool result's pendingApproval block

The chat host looks for pendingApproval.artifactPath in each tool result and opens that path in the review pane.

**Rejected because:** Simplest, but leaves out documents that are presented without the block.

### 7.3 a3: The review pane watches the pending list

The pane's host polls the pending list and opens whatever is new

The review host polls workflow.pending on a timer (or watches .insrc/artifacts) and opens any new pending document, whether or not a chat turn made it.

**Rejected because:** Opens too much and at the wrong times.

## 8. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/docs-review-panel.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/docs-review-client.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts`
- **[[c5]]** `code` `vscode-plugin/src/extension.ts`
- **[[c6]]** `code` `src/daemon/steps/workflow-step/phases/synthesize.ts`
- **[[c7]]** `code` `src/workflow/pending.ts`
- **[[c8]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts`
- **[[c9]]** `code` `vscode-plugin/src/chat/webview-channel.ts`
- **[[c10]]** `code` `src/workflow/path-scheme.ts`
- **[[c11]]** `prior-artifact` `The daemon review of revision 1 of this LLD, 2026-10-13: block, 4 medium (the pending list's path is absolute, not repo-relative; a followed turn is this window's own turn, not another window's; one createPanel serves every open, so focus and column cannot change for all; the turn's start and end had no named call sites and overlapping turns were not safe)`
- **[[c12]]** `code` `vscode-plugin/src/chat/__tests__/review-wiring.test.ts`
- **[[c13]]** `prior-artifact` `The daemon review of revision 2 of this LLD, 2026-10-13: block, 3 medium (a follow is asked for on every webview ready, so beginning a presented turn there demotes the run turn; a superseded turn's events never reach its sink; review-wiring.test.ts pins the createPanel source that changes)`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-13T17:23:46.815Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| current-behaviour | The equality match also holds for a brainstorm SPEC. | storage.ts:911-915 writes a brainstorm SPEC with workItemKind forced to 'standalone' (`specArtifactPaths(repoPath, specHash, createdAtISO, 'standalone', epicSlug)`), while pending.ts:192 derives the kind from the record: `meta['standalone'] === true ? 'standalone' : 'epic'`. I did not read where the SPEC's meta is stamped, so I could not confirm meta.standalone is true on a SPEC; if it is not, the list path is under docs/epics and neither the equality nor the '/'-tail tolerance matches. [files: src/workflow/storage.ts, src/workflow/pending.ts] | Check a SPEC's meta.standalone. If it can be absent, the SPEC is still opened by the end-of-turn rule (its id is new), only later than at the tool result; say so in the edge cases or match on the artifact id as a second key. |
