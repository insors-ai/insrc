<!-- insrc:artifact LLD-613abdb351c2c738-s5 -->

# LLD: E20261014613abdb3:S005

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `02f5e748bf5b...`

A decision sent from the document review pane now joins the repository's chat queue like a typed message: it waits in the chat's outbox behind any running turn, survives the panel or window closing, and runs in order. The review pane's own in-memory waiting list is removed. A new read-only look at every repository's queue file keeps the chats (and attachments) of waiting or failed messages from being swept or evicted.

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

**Returns:** `ExternalSubmitResult` — 'queued' when the message joined the repository's queue; otherwise { kind: 'unavailable', note } with a sentence saying why (blank text, no agentic CLI installed, no queue in this window, or the queue's own refusal: full or busy).

**Errors:**
- `never thrown` when every refusal is a returned unavailable result; a throw from the queue is caught and returned as unavailable

**Preconditions:**
- text is a non-empty string after trimming
- an agentic CLI is installed
- this window has a queue worker

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

### 2.5 `createFileChatSessionStore`

```typescript
createFileChatSessionStore(deps: FileStoreDeps & { keepSessionIds?: () => ReadonlySet<string> | undefined }): ChatSessionStore
```

**Parameters:**
- `deps.keepSessionIds: () => ReadonlySet<string> | undefined` _(optional)_ — Sessions that must not be evicted: those with a live row in any repository's queue.

**Returns:** `ChatSessionStore` — The same store; evictBeyondCap calls keepSessionIds once per eviction pass, only when the history is over the cap, and removes the oldest sessions not in that set.

**Errors:**
- `swallowed` when keepSessionIds throws: logged, and eviction proceeds as before so history is still capped

**Postconditions:**
- a kept session is never evicted
- the history may stay above maxSessions while kept sessions fill it

## 3. Data model changes

### 3.1 `liveSessionIdsOfAllQueues (new function, chat-queue-setup.ts)` — new

Lists ~/.insrc/chat-queue/*.sqlite and, for each, opens it read-only and runs SELECT DISTINCT session_id FROM messages; returns the union as a ReadonlySet<string>. A file that cannot be opened or read is skipped and logged. It never migrates, stamps or writes, so a file of a newer schema is read the same way.

```
none: reads the existing messages.session_id column
```

**Call sites:**
- `vscode-plugin/src/extension.ts (chatKeep for both sweeps; keepSessionIds for the store)`
- `vscode-plugin/src/chat/chat-queue-setup.ts`

### 3.2 `ExternalSubmitResult / ChatHandOver` — field-modify

'sent' is removed; unavailable becomes an object carrying the note so the pane can say why.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/docs-review-panel.ts`
- `vscode-plugin/src/extension.ts`

### 3.3 `waitingExternal / drainExternal / dropExternal` — field-remove

The in-memory list, its drain at about ten call sites, and its drop-with-warning on panel or host close are removed; dropExternal's reset of webviewReady stays under a clearer name.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `FileStoreDeps` — field-add

keepSessionIds?: () => ReadonlySet<string> | undefined.

```
FileStoreDeps gains one optional dependency
```

**Call sites:**
- `vscode-plugin/src/chat/session-file-store.ts`
- `vscode-plugin/src/extension.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Reads the queue file's messages table read-only for session ids; writes only through the worker's submit. The store contract is unchanged. |
| `sc4` | consumes | submitExternal calls ChatQueueWorker.submit with origin 'review-pane'. worker.liveSessionIds() still reports this repository's rows; the cross-repository set is a separate read-only reader. |
| `sc5` | consumes | A review-pane row reaches the outbox through the existing projection, which already carries origin 'review-pane'; no change to OutboxView or its actions. |

## 5. Error paths

**Error cases**

- **A decision is sent in a window with no queue (node:sqlite could not load, or a newer-schema queue file)** (recoverable)
  - Detection: submitExternal finds no queue worker for this window (worker is undefined, as createQueueFactory returned undefined)
  - Response: Return { kind: 'unavailable', note } saying the chat queue is not available in this window; do not start a turn and keep no list
  - User impact: The decision is already recorded by the review host; the pane's line says the chat could not be told and why, and the user can paste it
- **The queue refuses the message: at QUEUE_RECORD_BOUND, or busy** (recoverable)
  - Detection: ChatQueueWorker.submit returns { ok: false, reason, note }
  - Response: Return unavailable with the queue's own note
  - User impact: The pane shows 'The chat could not be told: <note>'; nothing is queued
- **No agentic CLI is installed, or the text is blank or not a string** (recoverable)
  - Detection: deps.providers.available.length === 0, or typeof text !== 'string' or text.trim() === ''
  - Response: Return unavailable with a note for that cause, before any panel is opened or session saved
  - User impact: The pane says why the chat could not be told
- **The target chat session is gone when the message reaches the front (evicted or removed)** (recoverable)
  - Detection: queueRunner.run finds deps.store.get(sessionId) undefined and resolves failed 'the chat no longer exists' (S001)
  - Response: Unchanged: the row ends failed with a resend; the eviction keep predicate makes this unlikely for a session with live rows
  - User impact: The outbox shows the failed decision with resend and dismiss
- **A queue file under ~/.insrc/chat-queue cannot be opened or read while listing live sessions (locked, corrupt, a stray file)** (recoverable)
  - Detection: the read-only open or the SELECT throws for that file
  - Response: Skip the file, log a warning with its name, and continue with the other files; the set is partial
  - User impact: Sessions with live rows in that one file are not protected on this pass; their messages may later fail with the chat gone
- **The keep predicate throws during eviction** (recoverable)
  - Detection: evictBeyondCap catches the exception from keepSessionIds()
  - Response: Log it and evict as if no session were kept, so the history is still capped
  - User impact: None visible; protection is lost for that one pass
- **Saving the draft chat fails before the message is queued** (recoverable)
  - Detection: trySave returns false or throws (the existing guard in enqueueTyped)
  - Response: Proceed as typed messages do: the save failure is logged and the submit still happens; if the chat is then missing the runner fails the message with a resend
  - User impact: Rare; the decision shows as failed with a resend

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A decision is sent while another chat's message runs in another window | It queues behind that message in strict order; this chat's outbox shows it with the count of other chats' messages ahead |
| A decision is sent while the shown chat has a waiting approval card | It waits in the outbox behind the running turn and the card; submitting never answers or rejects the card |
| The panel is closed and no chat was ever shown in this window | The panel opens on a draft chat, the draft is saved, and the decision is queued for that chat |
| The panel is closed after a chat was shown earlier in this window | The decision goes to that last shown chat, the panel opens on it |
| Two decisions are sent back to back | Two rows in the outbox, in send order; each runs in turn |
| The window is reloaded after the decision is queued and before it runs | The row is in the file, so it survives; the reloaded window's worker runs it when it reaches the front, opening the panel |
| A session has live rows in the queue of a repository other than the open one | It is in the cross-repository keep set, so neither the sweep nor eviction removes it or its attachments |
| Every one of the 200 sessions is kept | No eviction happens and the history stays above the cap until rows finish |
| The chat-queue directory does not exist or holds no queue files | The keep set is empty and nothing changes |

**Invariants to preserve**

- Submitting a message never touches the running turn, its waiting cards or the approval grant chain; a pane decision, like a typed one, waits its turn. [[c3]]
- Only the worker writes the queue, in short IMMEDIATE transactions; the new keep reader opens other repositories' files read-only and never migrates, stamps or writes them. [[c11]]
- A decision is recorded by the review host before the chat is told, and a failed hand-over never undoes it. [[c12]]
- Queue order is strict per repository: a review-pane message is an ordinary row and runs at its place in seq order. [[c3]]

## 6. Test strategy

**Test framework:** `node:test (node:assert/strict) run through tsx: npx tsx --test; co-located *.test.ts under src/chat/__tests__ with the existing fake-dom, fake-session-fs and chat-queue-outbox-host harnesses`

**Test levels**

- **unit** — The review host's wording and hand-over, the session store's keep predicate, and the cross-repository reader, each in isolation.
  - Subjects: `decisionResultLine: 'queued' reads 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none unchanged, no 'sent'`, `docs-review-decision: notifyChat's queued and unavailable results reach the pane's result line`, `createFileChatSessionStore: with keepSessionIds, evictBeyondCap skips kept sessions and evicts others; a throwing predicate is logged and eviction still caps; the predicate is not called under the cap`, `liveSessionIdsOfAllQueues: the union over several queue files; an unreadable file is skipped with a warning; a missing directory gives an empty set; a file of a newer schema is read without being modified`
  - Fixtures: `temporary directory with real SQLite queue files made by createChatQueueStore`, `fake session files filesystem (fake-session-fs)`
- **integration** — The chat host with a real SQLite store and worker: a pane decision is queued, waits behind a running turn, survives a closed panel and reaches the front in order.
  - Subjects: `submitExternal with a running turn: returns 'queued', the row is in the outbox with origin 'review-pane', the running turn and its waiting card are untouched, and the decision runs when the turn ends`, `submitExternal with the panel closed: opens the panel on its session, saves a draft chat, queues, and the message runs once the webview is ready`, `submitExternal with no worker, no CLI, blank text, a full queue and a busy queue: each returns unavailable with its own note and queues nothing`, `no waitingExternal list: a message submitted before the panel closes is still in the queue file afterwards (the old test asserted it was dropped)`, `start-up wiring in extension.ts: chatKeep and the store's keepSessionIds include sessions with live rows in another repository's queue file`
  - Fixtures: `chat-queue-outbox-host harness (real store, createChatQueueWorker, fake adapter)`, `two queue files in one temp chat-queue directory`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-queue-outbox-host.test.ts: a review-pane decision sent while a turn runs waits in the outbox as origin review-pane, leaves the running turn and its waiting card alone, and runs when the turn ends`, `docs-review-decision.test.ts: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.'` |
| `ac2` | `chat-queue-outbox-host.test.ts: submitExternal on a closed panel opens it, saves the chat, queues a review-pane row, and the message runs in order once the webview is ready`, `chat-queue-outbox-host.test.ts: a decision queued before the panel or window closes is still in the queue file afterwards` |
| `ac3` | `session-file-store.test.ts: eviction skips sessions in keepSessionIds and evicts others to respect the cap`, `chat-queue-setup.test.ts: liveSessionIdsOfAllQueues returns the sessions of every queue file, skips an unreadable file and reads a newer-schema file without changing it`, `extension-chat-wiring.test.ts: the start-up sweep's keep set contains a session with a live row in another repository's queue` |

## 7. Migration

**State before:** A pane decision goes through submitExternal into the chat host's in-memory waitingExternal list and is run by drainExternal directly through runTurn when this window is idle (bundle read:current-behaviour). It bypasses the repository queue, so another window's running message does not hold it, and it is dropped when the panel or the window closes. Attachments of waiting messages are protected only by the session being in this window's store at start-up; eviction at the 200-session cap can remove a session with live queue rows (bundle read:attachment-keep).

**State after:** A pane decision is submitted through the repository's queue worker with origin 'review-pane' and is an ordinary row: it waits in the chat's outbox, survives the panel or window closing, and runs in order. The waiting list and its drain are gone. The start-up sweep and session eviction both consult a read-only list of the sessions that have live rows in any repository's queue file.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the read-only reader of every queue file's session ids and its tests; nothing calls it yet — ↩ rollbackable
2. Add the optional keepSessionIds dependency to the session file store, used only when over the cap, with its tests; nothing passes it yet — ↩ rollbackable
3. Wire the reader into the start-up: add its set to the keep set of both sweeps and pass it to the store as keepSessionIds — ↩ rollbackable
4. Change submitExternal to submit through the worker and return the new result; change the review host's notifyChat type, ChatHandOver and decisionResultLine to carry the note; update the binding — ↩ rollbackable
5. Remove waitingExternal, drainExternal and its call sites; keep the webviewReady reset that dropExternal performs — ↩ rollbackable
6. Rewrite or remove the tests that pinned 'sent', the wording and the drain order; add the queue-path tests — ↩ rollbackable

**Backward compat:** No stored data changes: the queue file's schema, the session files and the attachment directories are untouched, and the keep reader only reads. The IPC and the review pane's webview messages are unchanged. The review host's notifyChat dependency changes its return type, which is internal to the plugin and changes in one commit with its only binding. Mixed plugin versions: a window still running the previous plugin starts a pane decision directly outside the queue until it is reloaded, as typed messages already do (S001); and a previous-plugin window never reads the keep set, so it may still evict a session another window's queue holds, until it is reloaded.

## 8. Alternatives considered

### 8.1 a1: Submit through the worker; a read-only reader of every queue file — **CHOSEN**

submitExternal submits through ChatQueueWorker; a small read-only reader lists the session ids of every repository's queue file for the sweep and for eviction.

submitExternal drops the waiting list: it resolves the target chat (the shown session, or after opening the panel the session it opens on), saves a draft so the chat exists, submits with origin 'review-pane' and returns 'queued' or { kind: 'unavailable', note }. With no worker it returns unavailable with a note. A new pure function liveSessionIdsOfAllQueues(root, openDatabase, log) lists ~/.insrc/chat-queue/*.sqlite and runs one SELECT DISTINCT session_id FROM messages over each, opened read-only, skipping (and logging) a file it cannot open. Its result joins chatKeep for both sweeps, and createFileChatSessionStore gains keepSessionIds?: () => ReadonlySet<string> that evictBeyondCap calls once, only when over the cap, and skips those sessions when choosing whom to evict.

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

- OWNER DECISION: with no queue in this window (node:sqlite cannot load, or a newer-schema file), should a review-pane decision be refused with a note (this LLD's choice: the decision stays recorded and the pane says the chat could not be told), or keep a direct-run fallback for that case? The HLD removes the waiting list entirely, so a fallback would keep part of what S005 removes. Recommendation: refuse with a note.
- OWNER DECISION: eviction skips every session with live queue rows in any repository, so the 200-session history can grow above its cap while many sessions hold waiting or failed messages. Accept that, or evict a kept session anyway once the history passes a hard ceiling (and fail its message with the chat gone)? Recommendation: accept; rows are bounded at 500 per repository, so the overshoot is bounded too.
- cd1 (partial): liveSessionIdsOfAllQueues and the keepSessionIds dependency are new names this Story introduces; they are labelled new in dataModel and are not existing symbols.
- ep3 (partial): the invariantsToPreserve cite the HLD assumption ids c3, c11 and c12 as the schema requires; the behaviours are shown by the read:queue-surface and read:current-behaviour bundles, but the ids do not name a bundle directly.
- NOTE (trimmed, disclosed): body.hldContextSlice carries the framework summary, the consumed contracts without their interface sketches, this Story's boundary and the adjacent boundaries' owns and depends, not the full verbatim slice.

## Resolved questions

- `qbcf071c5` — OWNER DECISION: with no queue in this window (node:sqlite cannot load, or a newer-schema file), should a review-pane decision be refused with a note (this LLD's choice: the decision stays recorded and the pane says the chat could not be told), or keep a direct-run fallback for that case? The HLD removes the waiting list entirely, so a fallback would keep part of what S005 removes. Recommendation: refuse with a note.
  - **resolved**: No fallback anywhere: when the chat queue cannot be opened (node:sqlite cannot load, or the queue file is from a newer plugin) the chat is disabled. extension.ts does not register the chat command and shows the existing unsupported-VS-Code notice once; there is no direct-run path to keep working. A review-pane decision therefore reaches submitExternal only in a window that has a queue; submitExternal still returns unavailable with a note if it is ever called without one, and keeps no waiting list. The host's own internal no-queue branches (sendTyped's direct runTurn) are not rewritten in this Story: removing them rewrites hundreds of host tests and belongs to a separate cleanup. — Owner decision: chat is a core feature; a fallback path is too complicated to keep functional, so without sqlite the chat is disabled. _(2026-10-14T18:25:59.900Z)_
- `qcd5a85b2` — OWNER DECISION: eviction skips every session with live queue rows in any repository, so the 200-session history can grow above its cap while many sessions hold waiting or failed messages. Accept that, or evict a kept session anyway once the history passes a hard ceiling (and fail its message with the chat gone)? Recommendation: accept; rows are bounded at 500 per repository, so the overshoot is bounded too.
  - **resolved**: The 200-session history cap is a hard cap and eviction is unchanged: the oldest session is evicted even if it still has queue rows, and such a message then fails with 'the chat no longer exists' (S001's existing path) and offers a resend. No keep predicate on the session store and no cross-repository reader of other queue files are added; protecting sessions beyond the cap is over-engineering. The start-up attachment sweep already keeps every session still in the store (chatKeep), so a waiting message's attachments survive it; Story S005 only pins that with a test. — Owner decision: hard cap of 200; anything more is unrealistic and over-engineering. _(2026-10-14T18:29:07.479Z)_
- `q719063a7` — cd1 (partial): liveSessionIdsOfAllQueues and the keepSessionIds dependency are new names this Story introduces; they are labelled new in dataModel and are not existing symbols.
  - **resolved**: Moot: the owner's hard-cap ruling removes liveSessionIdsOfAllQueues and the keepSessionIds dependency from the design, so no new names remain to ground. The LLD is amended to drop them. — Follows from the hard-cap decision. _(2026-10-14T18:29:42.904Z)_
- `qbabde9a5` — ep3 (partial): the invariantsToPreserve cite the HLD assumption ids c3, c11 and c12 as the schema requires; the behaviours are shown by the read:queue-surface and read:current-behaviour bundles, but the ids do not name a bundle directly.
  - **resolved**: Add a bundle crosswalk in the plan: keep the HLD c-ids (c3, c11, c12) in the LLD and map them to the read:queue-surface and read:current-behaviour bundles in the plan's closing task, as ruled for s4. — Same ruling as Story s4 (option A there). _(2026-10-14T18:30:06.224Z)_

## Citations

- **[[c3]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c3 (the worker decides from the database alone)`
- **[[c11]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c11 (acknowledge takes the lease in one transaction)`
- **[[c12]]** `prior-artifact` `HLD-613abdb351c2c738 assumption c12 (writes are short IMMEDIATE transactions)`
- **[[c20]]** `analyze-bundle` `read:current-behaviour: how a review-pane decision reaches the chat today (chat-panel.ts submitExternal/drainExternal, docs-review-panel.ts handOver/decisionResultLine)`
- **[[c21]]** `analyze-bundle` `read:queue-surface: ChatQueueWorker.submit and origin 'review-pane' (chat-queue-worker.ts, chat-queue-setup.ts, chat-outbox.ts)`
- **[[c22]]** `analyze-bundle` `read:attachment-keep: sweep keep set and evictBeyondCap (attachment-store.ts, session-file-store.ts, extension.ts)`
- **[[c23]]** `analyze-bundle` `read:tests: tests that pin the pane hand-over and the waiting list`
