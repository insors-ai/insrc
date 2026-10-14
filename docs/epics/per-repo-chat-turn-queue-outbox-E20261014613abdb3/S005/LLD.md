<!-- insrc:artifact LLD-613abdb351c2c738-s5 -->

# LLD: E20261014613abdb3:S005

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `02f5e748bf5b...`

A decision sent from the document review pane now joins the repository's chat queue like a typed message: it waits in the chat's outbox behind any running turn, survives the panel or window closing, and runs in order. The review pane's own in-memory waiting list is removed. Where the chat queue cannot be opened (node:sqlite cannot load, or a newer-schema queue file) the chat is disabled, with no fallback path. The 200-session history cap stays a hard cap.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-613abdb351c2c738** § 2. Framework summary

**Rollout phase:** Phase C — retries and the review pane
**Consumes:** `sc1` (ChatQueueStore), `sc4` (ChatQueueWorker), `sc5` (OutboxView)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: undefined — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s2`: undefined — owns `sc5`
- `s3`: undefined
- `s4`: undefined

## 2. Contract details

**Surface level:** internal

### 2.1 `submitExternal`

```typescript
submitExternal(text: string): ExternalSubmitResult  // type ExternalSubmitResult = 'queued' | { readonly kind: 'unavailable'; readonly note: string }
```

**Parameters:**
- `text: string` — The decision message the review pane composed.

**Returns:** `ExternalSubmitResult` — 'queued' when the message joined the repository's queue; otherwise { kind: 'unavailable', note } with a sentence saying why (blank text, no agentic CLI installed, or the queue's own refusal: full or busy). A window without a queue has no chat and no notifyChat binding, so submitExternal is not reached there.

**Errors:**
- `never thrown` when every refusal is a returned unavailable result; a throw from the queue is caught and returned as unavailable

**Preconditions:**
- text is a non-empty string after trimming
- an agentic CLI is installed
- this window has a queue worker (without one the chat is not offered and the review pane is given no hand-over)

**Postconditions:**
- on 'queued' the panel is open, the target chat is saved, and one row with origin 'review-pane' exists in the queue for that chat
- no in-memory list holds the message
- the running turn and its waiting cards are not touched

### 2.2 `ChatQueueWorker.submit`

```typescript
submit(m: { sessionId: string; text: string; origin: 'typed' | 'review-pane'; attachments: readonly AttachmentRef[] }): EnqueueResult
```

**Parameters:**
- `m: { sessionId; text; origin; attachments }` — The message to queue, here with origin 'review-pane' and no attachments.

**Returns:** `EnqueueResult` — ok with the stored row, or a refusal reason (full, busy, unavailable) with a note.

**Errors:**
- `EnqueueResult ok:false` when the queue is at QUEUE_RECORD_BOUND, busy, or unavailable

**Preconditions:**
- the chat session is saved so it exists when the message runs

**Postconditions:**
- the row is visible in every window's outbox for that chat

### 2.3 `notifyChat`

```typescript
notifyChat?: (text: string) => ExternalSubmitResult   // the review host's dependency, was 'sent' | 'queued' | 'unavailable'
```

**Parameters:**
- `text: string` — The decision message.

**Returns:** `ExternalSubmitResult` — The hand-over outcome, with the refusal note carried for the pane.

**Errors:**
- `thrown error` when the host's handOver catches it and reports 'failed'; the decision stays recorded

**Postconditions:**
- the decision is already recorded before the hand-over is attempted

### 2.4 `decisionResultLine`

```typescript
decisionResultLine(res: ReviewDecisionResult, sent: number, chat: ChatHandOver): string   // type ChatHandOver = 'queued' | { kind: 'unavailable'; note: string } | 'failed' | 'none'
```

**Parameters:**
- `chat: ChatHandOver` — How the hand-over went.

**Returns:** `string` — The one line the pane shows: 'queued' reads 'Sent to the chat; it waits its turn in the outbox.'; unavailable reads 'The chat could not be told: <note>'; failed and none are unchanged; the 'sent' wording is gone.

**Postconditions:**
- a refused decision names why it was refused

## 3. Data model changes

### 3.1 `ExternalSubmitResult / ChatHandOver` — field-modify

'sent' is removed; unavailable becomes an object carrying the note so the pane can say why.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `waitingExternal / drainExternal / dropExternal` — field-remove

The in-memory list, its drain at about ten call sites, and its drop-with-warning on panel or host close are removed; dropExternal's reset of webviewReady stays under a clearer name.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `chat availability (extension.ts)` — invariant-change

When createQueueFactory returns undefined (node:sqlite cannot load, or a newer-schema queue file) the chat is not offered in that window, with no direct-run path. In extension.ts, everything that turns the chat on is gated on the queue existing: (1) the insrc.chat.open command is not registered, and package.json gains a menus.commandPalette entry for it with when: insrc.chat.ready, so the Command Palette does not list a command that is not there; (2) setContext('insrc.chat.ready', true), which shows the editor-title chat icon, is not called; (3) the WebviewPanelSerializer for the chat view type is not registered, so a chat tab restored after a reload is not wired to the host (the restored tab is left empty and closes); (4) the review host is given no notifyChat binding, so the review pane still works for its own decisions and shows 'No chat message was sent.'. ANY failure to open the queue disables the chat, since createQueueFactory catches every error from opening the store (a failed mkdir, a permission error, a corrupt or locked file, as well as the two named causes). Three notices, chosen by cause: a StoreUnavailable matching /newer plugin/ -> 'The chat is disabled in this window: its queue was made by a newer insrc plugin; reload this window.'; an error that is the failure to load node:sqlite (ERR_UNKNOWN_BUILTIN_MODULE, or a message naming node:sqlite) -> 'The chat is disabled in this window: this VS Code cannot load node:sqlite, which the chat queue needs.'; any other failure -> 'The chat is disabled in this window: its queue could not be opened (<the error's message>).'. The module doc comments that say the chat 'stays on its direct path' (chat-queue-setup.ts header, extension.ts near the queue factory) are updated. The host's internal no-queue branches stay and are not reachable from the extension; removing them is a separate cleanup.

**Call sites:**
- `vscode-plugin/src/extension.ts (insrc.chat.open registration, setContext insrc.chat.ready, registerWebviewPanelSerializer, the review host's notifyChat binding)`
- `vscode-plugin/src/chat/chat-queue-setup.ts (the two notices and the header comment)`
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/package.json (menus.commandPalette entry for insrc.chat.open)`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Unchanged. This Story reads and writes the queue only through the worker's submit; it adds no reader of the queue files. |
| `sc4` | consumes | submitExternal calls ChatQueueWorker.submit with origin 'review-pane'. worker.liveSessionIds() is not consumed: the sweep and eviction rules are unchanged. |
| `sc5` | consumes | A review-pane row reaches the outbox through the existing projection, which already carries origin 'review-pane'; no change to OutboxView or its actions. |

## 5. Error paths

**Error cases**

- **The chat queue cannot be created in this window (node:sqlite cannot load, a newer-schema queue file, or any other failure to open the store)** (recoverable)
  - Detection: createQueueFactory returns undefined at start-up: it catches every error from opening the store
  - Response: The chat is disabled in this window: the chat command, the chat icon's ready context and the chat tab serializer are not registered, and the review host gets no notifyChat binding; the notice says the chat is disabled and names the cause (sqlite cannot load, newer plugin, or the open error's message)
  - User impact: No chat in that window. A review-pane decision is still recorded and the pane says 'No chat message was sent.'
- **The queue refuses the message: at QUEUE_RECORD_BOUND, or busy** (recoverable)
  - Detection: ChatQueueWorker.submit returns { ok: false, reason, note }
  - Response: Return unavailable with the queue's own note
  - User impact: The pane shows 'The chat could not be told: <note>'; nothing is queued
- **No agentic CLI is installed, or the text is blank or not a string** (recoverable)
  - Detection: deps.providers.available.length === 0, or typeof text !== 'string' or text.trim() === ''
  - Response: Return unavailable with a note for that cause, before any panel is opened or session saved
  - User impact: The pane says why the chat could not be told
- **The target chat session is gone when the message reaches the front (evicted at the hard 200-session cap, or removed)** (recoverable)
  - Detection: queueRunner.run finds deps.store.get(sessionId) undefined and resolves failed 'the chat no longer exists' (S001)
  - Response: Unchanged: the row ends failed with a resend. Eviction does not protect sessions with live rows (the cap is hard)
  - User impact: The outbox shows the failed decision with resend and dismiss; the message text is kept so it can be resent into another chat
- **Saving the draft chat fails before the message is queued** (recoverable)
  - Detection: Not detected at submit: trySave (via trySaveSession) only logs a failed save and returns nothing; the failure is seen later when the runner finds no session and resolves failed 'the chat no longer exists'
  - Response: Proceed as typed messages do: the submit still happens. If the unsaved draft is still the shown chat in the window that runs the message, it runs against the in-memory draft and succeeds. The runner fails the message with 'the chat no longer exists' only when the message is run by another window, or after the chat was switched or the window reloaded (it reads the store only when the shown session is a different chat)
  - User impact: Rare; the decision may show as failed with a resend

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A decision is sent while another chat's message runs in another window | It queues behind that message in strict order; this chat's outbox shows it with the count of other chats' messages ahead |
| A decision is sent while the shown chat has a waiting approval card | It waits in the outbox behind the running turn and the card; submitting never answers or rejects the card |
| The panel is closed and no chat was ever shown in this window | The panel opens on a draft chat, the draft is saved, and the decision is queued for that chat |
| The panel is closed after a chat was shown earlier in this window | The decision goes to that last shown chat, the panel opens on it |
| Two decisions are sent back to back | Two rows in the outbox, in send order; each runs in turn |
| The window is reloaded after the decision is queued and before it runs | The row is in the file, so it survives; the reloaded window's worker runs it when it reaches the front, opening the panel |
| A session with a waiting message and attachments is in the store at start-up | The sweep's keep set already holds every stored session, so its attachments are kept and go with the message when it runs |
| More than 200 sessions exist and the oldest has a waiting message | It is evicted by the hard cap; its message fails with 'the chat no longer exists' and can be resent |

**Invariants to preserve**

- Submitting a message never touches the running turn, its waiting cards or the approval grant chain; a pane decision, like a typed one, waits its turn. [[c3]]
- A decision is recorded by the review host before the chat is told, and a failed hand-over never undoes it. [[c12]]
- Queue order is strict per repository: a review-pane message is an ordinary row and runs at its place in seq order. [[c3]]
- Only the worker writes the queue, in short IMMEDIATE transactions; this Story adds no other reader or writer of the queue files. [[c11]]

## 6. Test strategy

**Test framework:** `node:test (node:assert/strict) run through tsx: npx tsx --test; co-located *.test.ts under src/chat/__tests__ with the existing fake-dom, fake-session-fs and chat-queue-outbox-host harnesses`

**Test levels**

- **unit** — The review host's wording and hand-over, and the start-up attachment sweep over a stored session with a waiting message.
  - Subjects: `decisionResultLine: 'queued' reads 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none unchanged, no 'sent'`, `docs-review-decision: notifyChat's queued and unavailable results reach the pane's result line`, `attachment sweep: with the start-up keep set made from the store's sessions, a session that holds a waiting queued message keeps its attachments directory`, `existing tests rewritten with the change: chat-queue-setup.test.ts (its 'chat keeps the direct path' title and the notice text), review-wiring.test.ts (the unconditional notifyChat binding regex, plus a case where the binding is absent when there is no queue), docs-review-decision.test.ts (its 'sent' default notifyChat and the old 'no chat is available' and 'will be told when it is free' wording), chat-panel.test.ts (the submitExternal suite)`
  - Fixtures: `fake attachment filesystem (fake-attachment-fs)`
- **integration** — The chat host with a real SQLite store and worker: a pane decision is queued, waits behind a running turn, survives a closed panel and reaches the front in order.
  - Subjects: `submitExternal with a running turn: returns 'queued', the row is in the outbox with origin 'review-pane', the running turn and its waiting card are untouched, and the decision runs when the turn ends`, `submitExternal with the panel closed: opens the panel on its session, saves a draft chat, queues, and the message runs once the webview is ready`, `submitExternal with no CLI, blank text, a full queue and a busy queue: each returns unavailable with its own note and queues nothing`, `no waitingExternal list: a message submitted before the panel closes is still in the queue file afterwards (the old test asserted it was dropped)`, `extension wiring: when the queue cannot be created the chat command is not registered, setContext insrc.chat.ready is not set, the chat tab serializer is not registered, the review host has no notifyChat, and each of the three notices (sqlite cannot load, newer plugin, any other open failure) says the chat is disabled (text pinned)`, `extension wiring: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready`
  - Fixtures: `chat-queue-outbox-host harness (real store, createChatQueueWorker, fake adapter)`, `extension-chat-wiring harness`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-queue-outbox-host.test.ts: a review-pane decision sent while a turn runs waits in the outbox as origin review-pane, leaves the running turn and its waiting card alone, and runs when the turn ends`, `docs-review-decision.test.ts: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.'` |
| `ac2` | `chat-queue-outbox-host.test.ts: submitExternal on a closed panel opens it, saves the chat, queues a review-pane row, and the message runs in order once the webview is ready`, `chat-queue-outbox-host.test.ts: a decision queued before the panel or window closes is still in the queue file afterwards` |
| `ac3` | `attachment-store.test.ts: the start-up sweep keeps the attachments of a session in the keep set that holds a waiting message and clears an unreferenced old session`, `chat-queue-outbox-host.test.ts: a queued message with an attachment keeps it and sends it when the message runs` |

## 7. Migration

**State before:** A pane decision goes through submitExternal into the chat host's in-memory waitingExternal list and is run by drainExternal directly through runTurn when this window is idle (bundle read:current-behaviour). It bypasses the repository queue, so another window's running message does not hold it, and it is dropped when the panel or the window closes. A window without a queue runs the chat on a direct path.

**State after:** A pane decision is submitted through the repository's queue worker with origin 'review-pane' and is an ordinary row: it waits in the chat's outbox, survives the panel or window closing, and runs in order. The waiting list and its drain are gone. A window that cannot open the queue has the chat disabled.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Change submitExternal to submit through the worker and return the new result; change the review host's notifyChat type, ChatHandOver and decisionResultLine to carry the note; update the binding — ↩ rollbackable
2. Remove waitingExternal, drainExternal and its call sites; keep the webviewReady reset that dropExternal performs — ↩ rollbackable
3. In extension.ts, when the queue cannot be created: do not register insrc.chat.open, do not set insrc.chat.ready, do not register the chat tab serializer and do not pass notifyChat to the review host; reword the notices in chat-queue-setup.ts to say the chat is disabled and add a third for any other open failure, and update the comments that say it stays on a direct path; add the menus.commandPalette entry for insrc.chat.open in package.json — ↩ rollbackable
4. Rewrite or remove the tests that pinned 'sent', the old wording, the drain order, the direct path and the old notices (chat-panel.test.ts submitExternal suite, docs-review-decision.test.ts, review-wiring.test.ts, chat-queue-setup.test.ts); add the queue-path tests, the extension wiring tests and the sweep test — ↩ rollbackable

**Backward compat:** No stored data changes: the queue file's schema, the session files and the attachment directories are untouched. The review host's notifyChat dependency changes its return type, internal to the plugin and changed in one commit with its only binding. Behaviour change: a VS Code that cannot load node:sqlite no longer runs the chat on a direct path; the chat is not offered there (owner decision). Mixed plugin versions: a window still running the previous plugin starts a pane decision directly outside the queue until it is reloaded, as typed messages already do (S001).

## 8. Alternatives considered

### 8.1 a1: Submit through the worker; hard 200-session cap, sweep unchanged — **CHOSEN**

submitExternal submits through ChatQueueWorker; the sweep's existing keep set already holds every stored session; no new reader and no keep predicate.

submitExternal drops the waiting list: it resolves the target chat (the shown session, or after opening the panel the session it opens on), saves a draft so the chat exists, submits with origin 'review-pane' and returns 'queued' or { kind: 'unavailable', note }. A window without a queue does not offer the chat. The start-up sweep's keep set (chatKeep, every session in the store) already protects a waiting message's attachments; the 200-session cap stays hard, so an evicted session's message fails with the chat gone and a resend.

### 8.2 a2: Submit through the worker; use only this window's worker.liveSessionIds()

Keep only what the open repository's worker already reports.

Same submitExternal change as a1, but the keep set is worker.liveSessionIds() of this window's own repository queue, passed to the sweep and to the store's keep predicate. Other repositories' queue files are not read.

**Rejected because:** ac3 is only partly met: it protects only the open repository's sessions, and the worker does not exist when the start-up sweep runs.

### 8.3 a3: Submit through the worker; record the kept sessions in a shared index file

Every window writes the session ids of its live rows to a small index and the sweep and eviction read that.

Same submitExternal change as a1. Each worker writes ~/.insrc/chat-queue/live-sessions.json (or per-repository files) whenever its rows change, and the sweep and eviction read the union of the index files.

**Rejected because:** It partly meets ac3 (a stale index after a crash) and sc4 (it adds a write path in s1's worker), and duplicates queue state.

## 9. References

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c20]]** `analyze-bundle` `read:current-behaviour: how a review-pane decision reaches the chat today (chat-panel.ts submitExternal/drainExternal, docs-review-panel.ts handOver/decisionResultLine)`
- **[[c21]]** `analyze-bundle` `read:queue-surface: ChatQueueWorker.submit and origin 'review-pane' (chat-queue-worker.ts, chat-queue-setup.ts, chat-outbox.ts)`
- **[[c22]]** `analyze-bundle` `read:attachment-keep: sweep keep set and evictBeyondCap (attachment-store.ts, session-file-store.ts, extension.ts)`
- **[[c23]]** `analyze-bundle` `read:tests: tests that pin the pane hand-over and the waiting list`

## 10. Open questions

- NOTE (trimmed, disclosed): body.hldContextSlice carries the framework summary, the consumed contracts without their interface sketches, this Story's boundary and the adjacent boundaries' owns and depends, not the full verbatim slice.

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-14T18:37:11.922Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
