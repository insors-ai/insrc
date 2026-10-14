<!-- insrc:artifact LLD-613abdb351c2c738-s2 -->

# LLD: E20261014613abdb3:S002

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `e1a7250f3a6d...`

The chat panel gains an outbox: a band above the message box listing this chat's messages that are waiting in the repository's queue (with their place in line), and those that failed or could not be delivered (with the reason). One line says how many other chats' messages are ahead and which chat is running, and, in every window, when that chat is waiting for an approval or a choice. Each waiting row can be cancelled, and each failed or undelivered row dismissed or resent as it was, attachments included. The outbox is drawn from the queue file, so a reload or restart shows the same rows.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [UX](#9-ux)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-613abdb351c2c738** § 2. Framework summary

**Rollout phase:** Phase B — the outbox and a dead window
**Owns:** `sc5` (OutboxView)
**Consumes:** `sc1` (ChatQueueStore), `sc4` (ChatQueueWorker)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The SQLite schema, its migrations and pragmas (WAL, busy_timeout), the repo key and the store's file location, the window key kept in workspace storage, the worker's polling cadence and timers, and the chat host's change from starting turns to submitting them. Every caller of runTurn is accounted for: the webview's submit-turn and the attachment submit enqueue a 'typed' message; the approval grant's re-run (chat-panel.ts:578, with allowedTools and suppressEcho) and the selection continuation (:1671, suppressEcho) are continuations of the turn already holding the lease and run under it, off the queue; submitExternal enqueues a 'review-pane' message (s5). The runner opens the panel and shows the message's chat when needed, and reports the lease's CLI process at spawn. turn-lifecycle.ts gains onSpawn with an exit promise that survives detach(), for live and followed turns (the tests that pin newest-wins or the supersede change: turn-lifecycle.test.ts:205 'a second start drops a turn still waiting for its lease', :229, :252, :728, :766, :984; chat-panel.test.ts:138 'single-in-flight: a second submit supersedes the first', :1318 (its 'a newer turn's start' leg: a submit no longer ends the running turn's diff state, since runTurn's start no longer calls endDiffTurn for a queued message), :2854 'Stop ends the running process at once and cancels a waiting message' (now: the waiting message runs after Stop), :4745, :5018, and the presenter tests of a superseded turn at :5302 and :5455 (now: there are no superseded turns); the rest stand). Sending a message never touches the running turn: submit and enqueue no longer call supersedeQueuedApprovals (chat-panel.ts:1432 and :1506, and drainExternal's call at :702 goes with the list in s5), so a typed message waits behind a waiting card, which the user answers; chat-panel.test.ts:4745 changes to assert the card stays. A waiting approval or selection card of the running turn ends at an answer, Stop, a chat switch, the panel closing or CONTINUATION_WAIT_MS; the message then finishes 'stopped', which leaves it failed with a resend, and the lease is released. A head message whose session no longer exists fails with that reason. Mixed plugin versions: a window still running the previous plugin after an update starts turns outside the queue until it is reloaded; VS Code asks for that reload after an extension update, the store records the plugin version that created it, and s1's hand check covers reloading every window. The plugin's test runtime is pinned to a Node with unflagged node:sqlite (engines.node >= 22.13). The newest-wins supersede in turn-lifecycle.ts is removed; a chat switch, the panel closing or adopt() detach the view only, and the runner then resolves 'detached-ended' when the detached CLI exits, the window holding and heartbeating the lease until then; a pipe turn, which detach() stops (turn-lifecycle.ts:517-525), resolves 'stopped' and so stays as a failed message with a resend. Stop ends the running turn and releases the lease. The minimum VS Code version and the plain 'unsupported VS Code' message when node:sqlite cannot load are part of s1. — owns `sc1`, `sc2`, `sc3`, `sc4`
- `s3`: The takeover rule (lease stale for LEASE_TAKEOVER_MS and both the holder window's process and the lease's CLI process gone), marking a processing message failed when its window died with no CLI left, re-attaching a turn whose CLI survived a reload (the reloaded window, same window key, reclaims the lease with reclaim() and follows the turn through the session's saved cursor), the not-delivered rule for a head message whose window is closed (no live presence past PRESENCE_GRACE_MS and its process gone), and the flush that keeps the stored records within QUEUE_RECORD_BOUND.
- `s4`: The classification of a failed turn's error into an InfraCause, the 'acted' tracking from the turn's tool-call, file-edit and tool-result events, the retry schedule (10 s, 1 min, 5 min; at most 3), the retrying state's row in the outbox with its countdown, retry-now and cancel, and the authentication message.
- `s5`: A pane decision goes to the chat the review pane hands over to today: the chat shown in this window's panel, or, when the panel is closed, the chat the panel opens on (this window's last active chat). It is submitted through ChatQueueWorker.submit with origin 'review-pane', and the panel is opened. submitExternal returns ExternalSubmitResult = 'queued' | { readonly kind: 'unavailable'; readonly note: string } (from EnqueueResult: ok -> 'queued', full / busy / unavailable -> unavailable with the queue's note; 'sent' is no longer returned since every message queues), and the review host's notifyChat type, ChatHandOver and decisionResultLine carry the note so the pane shows why a decision was refused; the change sites are ExternalSubmitResult in chat-panel.ts:148-154, the review host's notifyChat dep type and ChatHandOver in docs-review-panel.ts:45 and :65 with the hand-over sentence at :2452 (the 'sent' branch goes; 'queued' reads 'Sent to the chat; it waits its turn in the outbox.'; 'unavailable' shows the queue's note), the binding in extension.ts:712, and the tests review-wiring.test.ts, docs-review-decision.test.ts (its default notifyChat returning 'sent' at :126 and the result lines at :457-462) and chat-panel.test.ts's submitExternal suite (:4931-5235), which assert 'sent', the wording and the drain order. The waitingExternal list and drainExternal are removed. Attachments: liveSessionIds() across every repository's queue file under ~/.insrc/chat-queue is added to the start-up sweep's keep set (which takes session ids, extension.ts:470, attachment-store.ts:199), and session eviction skips any session with live rows in any queue: createFileChatSessionStore (session-file-store.ts: FileStoreDeps at :98-105, evictBeyondCap at :285-313, built at extension.ts:459) gains a keep predicate dependency: the oldest-first eviction skips kept sessions and evicts other sessions instead to respect the cap, since onEvict runs after the eviction and cannot veto it.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `OutboxView`

```typescript
interface OutboxView { readonly sessionId: string; readonly rows: readonly OutboxRow[]; readonly aheadFromOtherChats: number; readonly runningChat?: { readonly title: string; readonly here: boolean } | undefined; readonly blockedBy?: { readonly chatTitle: string; readonly reason: 'approval' | 'selection' } | undefined; readonly note?: string | undefined }
```

**Returns:** `OutboxView` — What the webview draws for the shown chat (sc5). runningChat names the chat whose message is being processed when it is not this one (here: true when it runs in this window); blockedBy names that chat and the card kind when its processing row carries waitingOn, in every window; note is a one-off sentence (an action that was refused).

**Preconditions:**
- sessionId is the chat shown in the panel

**Postconditions:**
- rows hold only this chat's queued, retrying, failed and not-delivered messages, in queue order; never a processing row

### 2.2 `OutboxRow`

```typescript
interface OutboxRow { readonly seq: number; readonly position?: number | undefined; readonly state: 'queued' | 'retrying' | 'failed' | 'not-delivered'; readonly text: string; readonly attachments: number; readonly origin: 'typed' | 'review-pane'; readonly error?: string | undefined; readonly attempt?: number | undefined; readonly nextAttemptAt?: number | undefined }
```

**Returns:** `OutboxRow` — One message as the outbox shows it (sc5). position is the 1-based place among every waiting (queued or retrying) message in the repository's queue, 1 being the next to run; absent on failed and not-delivered rows. attachments is a count; the refs stay in the queue.

**Postconditions:**
- position is set exactly when state is queued or retrying

### 2.3 `OutboxAction`

```typescript
type OutboxAction = { readonly type: 'outbox-cancel' | 'outbox-dismiss' | 'outbox-resend' | 'outbox-retry-now'; readonly seq: number }
```

**Returns:** `OutboxAction` — The webview's request for one row (sc5). 'outbox-retry-now' is declared for s4 and ignored by the host until then.

### 2.4 `projectOutbox`

```typescript
function projectOutbox(rows: readonly QueuedMessage[], sessionId: string, ctx: { readonly titleOf: (sessionId: string) => string | undefined; readonly here?: ((m: QueuedMessage) => boolean) | undefined; readonly note?: string | undefined }): OutboxView
```

**Parameters:**
- `rows: readonly QueuedMessage[]` — Every live row of the repository's queue in seq order, as ChatQueueWorker.onChange delivers them
- `sessionId: string` — The chat shown in this window's panel
- `ctx: { titleOf, here?, note? }` — Chat titles from the session store; whether a row belongs to this window (for runningChat.here); a note to carry

**Returns:** `OutboxView` — The sc5 view for sessionId (pure; no I/O)

**Preconditions:**
- rows are in seq order

**Postconditions:**
- aheadFromOtherChats counts the other chats' waiting (queued or retrying) rows with a seq below this chat's first waiting row (all other chats' waiting rows when this chat has none waiting); processing rows are never counted
- runningChat is set when a processing row belongs to another chat; blockedBy is set from that processing row's waitingOn, so it is the same in every window

### 2.5 `ChatQueueWorker.act`

```typescript
act(seq: number, action: 'cancel' | 'dismiss' | 'resend'): { readonly ok: true } | { readonly ok: false; readonly note: string }
```

**Parameters:**
- `seq: number` — The row the user acted on
- `action: 'cancel' | 'dismiss' | 'resend'` — Which of the store's cancel / dismiss / resendFrom to apply

**Returns:** `{ ok: true } | { ok: false; note: string }` — ok after the store changed the row; otherwise a sentence for the outbox (the message already started, was already removed, or the queue is full or busy)

**Errors:**
- `StoreBusy / StoreUnavailable (caught)` when The store could not be written; returned as { ok: false, note } with the queue's note, never thrown

**Preconditions:**
- the worker is not disposed

**Postconditions:**
- on ok, the worker ticks at once, so onChange listeners in this window see the change before the next poll and other windows within one poll
- resend calls store.resendFrom(seq, newTurnId(), claim.windowKey), so the row keeps its text and attachment refs, joins the back of the queue and is this window's to run

### 2.6 `HostToWebview 'outbox'`

```typescript
{ readonly type: 'outbox'; readonly view: OutboxView }
```

**Returns:** `void` — Posted by the chat host after every queue change, on a chat switch and on 'ready'; added to HOST_TO_WEBVIEW_TYPES

**Preconditions:**
- the queue is in use (deps.queue present)

**Postconditions:**
- the webview redraws #insrc-outbox from view alone

### 2.7 `WebviewToHost outbox actions`

```typescript
OutboxAction (added to the WebviewToHost union and WEBVIEW_TO_HOST_TYPES as 'outbox-cancel' | 'outbox-dismiss' | 'outbox-resend' | 'outbox-retry-now')
```

**Returns:** `void` — The host calls worker.act and, on refusal, re-posts the outbox with the note

**Postconditions:**
- a seq that is not the shown chat's row is ignored

### 2.8 `ChatQueueStore.markWaiting`

```typescript
markWaiting(seq: number, on: 'approval' | 'selection' | undefined): boolean
```

**Parameters:**
- `seq: number` — The processing message
- `on: 'approval' | 'selection' | undefined` — The kind of card it waits on, or undefined when none waits

**Returns:** `boolean` — true when the processing row was updated; false when the row is not processing (finished, or taken over)

**Errors:**
- `StoreBusy` when The write could not take the lock within the busy timeout; thrown to the worker, which logs it and keeps the last value to write again on its next tick

**Preconditions:**
- schema version 2

**Postconditions:**
- list() returns the row with waitingOn set or cleared; other windows see it at their next poll

### 2.9 `QueuedTurnRunner.run (onWaiting)`

```typescript
run(message: QueuedMessage, onSpawn: (cli: { readonly pid?: number | undefined; readonly startedAt?: number | undefined }) => void, onWaiting?: (on: 'approval' | 'selection' | undefined) => void): Promise<TurnOutcome>
```

**Parameters:**
- `onWaiting: (on: 'approval' | 'selection' | undefined) => void` _(optional)_ — Called by the chat host when the running queued message's first approval or selection card appears, and with undefined once no card of it waits

**Returns:** `Promise<TurnOutcome>` — Unchanged

**Preconditions:**
- called only for the message the runner is running

**Postconditions:**
- the worker writes each call with markWaiting(message.seq, on)

## 3. Data model changes

### 3.1 `OutboxView / OutboxRow (sc5)` — new

View-only types in the new module vscode-plugin/src/chat/chat-outbox.ts, projected from the queue's rows; nothing new is stored. runningChat is added to the HLD sketch (s2 owns sc5).

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/protocol.ts`

### 3.2 `Chat host outbox state` — field-add

createChatPanelHost keeps the last rows from worker.onChange and a pending note; it posts the projected view for the shown session on change, in showSession, in postInitialState ('ready'), and after an action. The webview's doSubmit stops marking the turn running when the queue is on (the host's 'turn-running' does), so a message that waits shows in the outbox instead of a 'working…' that has not begun. The queue runner also calls onWaiting when the running queued message's first approval or selection card appears and when none is left.

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `ChatQueueWorker` — field-add

act(seq, action) added (proposed sc4 amendment AMD act); delegates to store.cancel / dismiss / resendFrom (proposed sc1 amendment) and schedules an immediate tick. runMessage passes onWaiting to the runner and writes each value with store.markWaiting (proposed sc1 amendment).

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-worker.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.4 `messages.waiting_on (QueuedMessage.waitingOn)` — field-add

Nullable TEXT column on messages ('approval' | 'selection'), schema version 2. The SCHEMA's CREATE TABLE messages gains `waiting_on TEXT`, so a fresh file is created with the column and recorded as version 2; a version-1 file is upgraded in the open transaction (ALTER TABLE adds the column, version 2 recorded). rowToMessage maps it to waitingOn. Set only on a processing row through markWaiting; it ends with the row.

```
CREATE TABLE messages (... , waiting_on TEXT) for a fresh file; ALTER TABLE messages ADD COLUMN waiting_on TEXT for a version-1 file; meta.schema_version 1 -> 2
```

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/chat/chat-queue-worker.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc5` | implements | chat-outbox.ts defines OutboxRow, OutboxView (adding runningChat) and OutboxAction and projectOutbox; protocol.ts carries 'outbox' and the four actions; the chat webview draws #insrc-outbox. s4 will fill attempt / nextAttemptAt and handle 'outbox-retry-now'; s5's review-pane rows appear with origin 'review-pane'. |
| `sc4` | consumes | The host subscribes to onChange for the rows, calls the proposed act(seq, action) for the three actions, and reports the running message's card through the runner's new onWaiting argument; submit is used as S001 left it. |
| `sc1` | consumes | Through the worker only: list() rows via onChange (now carrying waitingOn), cancel / dismiss / resendFrom via act, and markWaiting from the runner's onWaiting. Additive: resendFrom, markWaiting and the waiting_on column (schema version 2 with an upgrade on open). |

## 5. Error paths

**Error cases**

- **Cancel of a message that started between the user's click and the write** (recoverable)
  - Detection: store.cancel deletes only `WHERE state IN ('queued','retrying')` and returns false when no row changed (chat-queue-store.ts:407-409); worker.act maps false to { ok: false }
  - Response: The host re-posts the outbox with the note 'That message has already started; it is in the chat now.'
  - User impact: The message runs; the user can Stop it
- **Dismiss or resend of a row another window already dismissed or resent** (recoverable)
  - Detection: store.dismiss returns false; store.resendFrom refuses with 'That message can no longer be sent again.' when the row is missing or not failed / not-delivered
  - Response: { ok: false, note } re-posted in the outbox; the next onChange drops the stale row
  - User impact: A one-line note; nothing is sent twice
- **The store is busy or unavailable when an action is written** (recoverable)
  - Detection: write() throws StoreBusy / the open fails; worker.act catches it and returns { ok: false, note: BUSY_NOTE or the unavailable note }
  - Response: Note in the outbox; the row is unchanged and the action can be pressed again
  - User impact: The action did not happen, and the outbox says so
- **The rows cannot be read for a change (list() throws)** (recoverable)
  - Detection: the worker's emit catches the read error and logs it, delivering no rows (chat-queue-worker.ts:85-91)
  - Response: The host keeps the last rows it posted; the next successful change redraws
  - User impact: The outbox may lag until the next readable poll
- **An outbox action arrives for a seq that is not the shown chat's row (a stale webview after a chat switch)** (recoverable)
  - Detection: the host looks the seq up in its last rows and checks sessionId === the shown session
  - Response: Ignored and logged at debug
  - User impact: None
- **The waiting flag cannot be written (the store is busy)** (recoverable)
  - Detection: markWaiting throws StoreBusy inside the worker's onWaiting handler
  - Response: The worker logs it and keeps the latest value, writing it on its next tick while the message runs
  - User impact: Other windows may show the card a poll later
- **A window still on the previous plugin opens a version-2 queue file** (recoverable)
  - Detection: its store sees schema_version 2 > 1 on open and throws StoreUnavailable ('made by a newer plugin')
  - Response: That window's chat runs messages directly, with the notice, until it is reloaded onto the new plugin
  - User impact: Messages from that window skip the queue until the reload VS Code asks for after the update

**Edge cases**

| Input | Expected |
| :--- | :--- |
| The shown chat has no live rows | The outbox band is hidden, or shows only the 'N messages from other chats are ahead' / running line when those are non-zero |
| The shown chat's message is being processed and two more of its messages wait | The processing row is not shown (it is in the transcript); the two waiting rows show positions 1 and 2 when nothing else waits |
| Another chat's message is processing and one of its messages waits ahead of this chat's two | runningChat names that chat; aheadFromOtherChats = 1; this chat's rows show positions 2 and 3 (ac1) |
| A retrying head (s4) that is not yet due | It counts as waiting with position 1; its row shows state retrying (s4 fills attempt and nextAttemptAt) |
| A failed row whose chat was switched away and back | showSession re-posts the outbox; the failed row is shown with its error and Resend / Dismiss |
| A window reload while rows wait or failed | On 'ready' the host posts the outbox from the last rows; the worker's first tick after start emits the rows from the file, so the same rows and positions are shown (ac4) |
| The queue is off (node:sqlite could not load) | No outbox band is rendered and no 'outbox' message is posted; doSubmit keeps marking the turn running as before |
| A message with only attachments and no text | The row shows the attachment count with an empty text line, e.g. '2 attachments' |
| A very long message | The row shows the first line, clipped with an ellipsis by CSS; the full text is in the row's title tooltip |
| Resending a not-delivered message from a different window than the one that sent it | resendFrom gives it this window's key, so this window runs it when it reaches the front |
| Another window's running message waits on an approval card | Every window's outbox for another chat says the queue is waiting for an approval in that chat (blockedBy); the line clears when the card is answered or the message ends |
| The window running the message dies with a card showing | The flag stays with the processing row until s3 fails the message; until then other windows still say it waits on that card, which is true |
| A version-1 queue file from S001 | Upgraded on open in one transaction (column added, version 2 recorded); its rows are kept |

**Invariants to preserve**

- Only the worker writes the queue in the chat host; the host holds the worker, not the store (chat-panel.ts:1985). [[c1]]
- A message the user sends never touches the running turn or its waiting cards (S001: sendTyped enqueues without supersedeQueuedApprovals). [[c1]]
- The webview draws only what the host posts, with textContent (no innerHTML), and re-sends nothing on its own; every view is re-posted on 'ready' (chat-panel.ts handleMessage 'ready' -> postInitialState). [[c2]]
- Without the queue (deps.queue absent) the chat behaves exactly as before: direct runTurn and the local running state on submit. [[c1]]
- Protocol message types are additive and listed in HOST_TO_WEBVIEW_TYPES / WEBVIEW_TO_HOST_TYPES (protocol.ts:309, :325). [[c3]]

## 6. Test strategy

**Test framework:** `node:test via `npx tsx --test` (vscode-plugin/src/**/__tests__/*.test.ts), with node:assert/strict; real SQLite files in a temp dir and fake timers, as chat-queue-store.test.ts and chat-queue-worker.test.ts do`

**Test levels**

- **unit** — The projection rules, independent of SQLite and the webview
  - Subjects: `projectOutbox: processing rows dropped, positions among waiting rows, aheadFromOtherChats, runningChat, blockedBy from another chat's processing row's waitingOn, failed / not-delivered rows without position, attachment count, note carried`
  - Fixtures: `plain QueuedMessage arrays`
- **integration** — The worker's act and the store's resendFrom over a real queue file
  - Subjects: `ChatQueueWorker.act cancel / dismiss / resend and their refusals; an immediate onChange after an act`, `ChatQueueStore.resendFrom keeps text and attachment refs, joins the back, takes the given window key`, `ChatQueueStore.markWaiting sets and clears waitingOn on a processing row only; a version-1 file is upgraded to version 2 on open with its rows kept`, `a fresh file is created at version 2 with waiting_on, and markWaiting works on it`
  - Fixtures: `temp dir store`, `fake timers`
- **integration** — The chat host's outbox over a real store and worker (tempQueue())
  - Subjects: `'outbox' posted after a change, on showSession and on 'ready'`, `outbox-cancel / -dismiss / -resend routed to worker.act; a refusal re-posts with the note; a seq of another chat is ignored`, `a queued message leaves the outbox when it is taken (its row is processing)`
  - Fixtures: `FakeChannel`, `tempQueue()`, `two hosts over one queue file for the other-chat leg`
- **contract** — The wire contract and the shell
  - Subjects: `protocol.ts lists 'outbox' and the four action types`, `renderShell includes #insrc-outbox only when the queue is on; doSubmit does not mark running when the queue is on`
- **smoke** — By hand in VS Code
  - Subjects: `Send two messages mid-turn: both appear in the outbox with places 1 and 2 and leave it as they run; cancel one; a stopped message shows failed with Resend / Dismiss; Resend runs it again; reload the window: the outbox shows the same rows`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat-outbox.test.ts: 'outbox projection: with a turn running, the chat's two waiting messages show places 2 and 3, one message from another chat is ahead, and the running chat is named'`, `chat-queue-outbox-host.test.ts: 'chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat's earlier message is counted ahead'`, `chat-queue-outbox-host.test.ts: 'chat host outbox: while another window's running message waits on an approval, this window's outbox says which chat it waits on, and the line clears once the card is answered'` |
| `ac2` | `chat-queue-outbox-host.test.ts: 'chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs'`, `chat-queue-worker.test.ts: 'worker act: cancel removes a waiting message and is refused once the message has started'` |
| `ac3` | `chat-queue-outbox-host.test.ts: 'chat host outbox: resending a failed message queues the same text and attachments at the back under this window's key, and it runs'`, `chat-queue-store.test.ts: 'resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused'` |
| `ac4` | `chat-queue-outbox-host.test.ts: 'chat host outbox: after the host is rebuilt over the same queue file and its webview is ready, the outbox shows the same messages in the same places'`, `chat-queue-store.test.ts: 'schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty'`, `chat-queue-store.test.ts: 'schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting'` |

## 7. Migration

**State before:** After S001 (read:queue-contracts, read:chat-webview): messages go through the repository's queue, but the chat shows nothing of it. A waiting message is invisible until it runs; a stopped or failed message stays in the queue file as failed with no way to see, dismiss or resend it; the webview marks a turn running as soon as a message is submitted, even when it only waits. The worker offers submit / onChange / liveSessionIds / running / dispose; the store has cancel / dismiss / resend (old window key) and list.

**State after:** The chat shows an outbox for the shown chat, projected from the queue's rows on every change, chat switch and webview ready; its rows can be cancelled, dismissed or resent through ChatQueueWorker.act; resend hands the message to the resending window through ChatQueueStore.resendFrom. The webview marks a turn running only when the host says it started ('turn-running') when the queue is on. The running message's row carries waitingOn while it waits on a card, so every window's outbox can show blockedBy; the queue file is schema version 2.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Raise the store's schema to version 2: the CREATE TABLE messages in SCHEMA gains the nullable waiting_on column, so a fresh file is created with it at version 2; on open, a version-1 file gets the column by ALTER TABLE in the open transaction and records version 2; add markWaiting and resendFrom — ✕ non-rollbackable
2. Add act to the worker and pass onWaiting to the runner, writing it with markWaiting — ↩ rollbackable
3. Add chat-outbox.ts (types and projectOutbox) and the 'outbox' / outbox-* protocol types additively — ↩ rollbackable
4. Wire the chat host: keep the last rows from onChange, post 'outbox' on change / showSession / ready / after an action, route the four actions, report the running message's cards through onWaiting; render #insrc-outbox and stop the local running mark on submit only when the queue is on — ↩ rollbackable

**Backward compat:** Additive except the schema version. A version-1 queue file is upgraded in place on open and keeps its rows; S001's failed rows appear in the outbox as they are. A window still on the previous plugin refuses a version-2 file (it was written for that: 'made by a newer plugin') and runs messages directly until reloaded, which VS Code asks for after an update; rolling the plugin back leaves a version-2 file the older plugin refuses, so a rollback needs the queue file removed (it holds only live messages). Without the queue nothing changes. Existing worker and store members are unchanged; resend stays. Protocol additions are new types only.

## 8. Alternatives considered

### 8.1 a1: Pure projection module + additive worker actions

A new vscode-free chat-outbox.ts projects queue rows to OutboxView; the worker gains one act(seq, action) that applies cancel / dismiss / resend through the store and ticks at once; the host posts 'outbox' on every change, chat switch and ready.

New module vscode-plugin/src/chat/chat-outbox.ts owns sc5: the OutboxRow / OutboxView / OutboxAction types and projectOutbox(rows, sessionId, ctx) -> OutboxView, a pure function (processing rows dropped; positions are 1-based places among the queue's waiting (queued or retrying) rows; aheadFromOtherChats counts other chats' waiting (queued or retrying) rows ahead of this chat's first waiting row, never processing rows, and a processing row of another chat is named in runningChat instead; blockedBy filled from ctx when this window's running message waits on a card). ChatQueueWorker gains one additive method, act(seq, action: 'cancel' | 'dismiss' | 'resend') -> { ok: true } | { ok: false; note }, which applies store.cancel, store.dismiss or store.resendFrom(seq, newTurnId(), claim.windowKey) and schedules an immediate tick so every listener sees the change at once. The chat host subscribes to worker.onChange, keeps the last rows, and posts {type:'outbox', view} for the shown session after every change, on showSession and on 'ready'; it handles 'outbox-cancel' / 'outbox-dismiss' / 'outbox-resend' (and accepts 'outbox-retry-now' as a no-op until s4). The webview gains an #insrc-outbox band above the input bar, drawn with textContent and role=button spans, styled with the chat's theme variables. protocol.ts gains the 'outbox' and four action types additively.

**Rejected because:** Satisfies the acceptance criteria, but delivers blockedBy only in the window running the message, so the HLD's s2 boundary decision is met only in part; the user chose the cross-window flag (a3).

### 8.2 a2: Host holds the store beside the worker

The queue factory hands the host both the worker and the store; the host calls store.cancel/dismiss/resend directly and projects with the same pure module.

chat-queue-setup.ts's factory returns { worker, store } (or the host deps gain queueStore). The host calls the store's cancel/dismiss/resend itself, generating the resend turn id, and nudges a re-post of the outbox from store.list() after each action since the worker only notices the write on its next poll. Projection as in a1.

**Rejected because:** Avoids extending sc4 but changes s1's factory instead, splits the queue across two objects and duplicates the turn-id rule; no acceptance criterion gains.

### 8.3 a3: a1 plus a cross-window 'waiting on' flag on the running message — **CHOSEN**

As a1, and the running message's row records when it waits on an approval or selection card, so every window's outbox can say which chat holds the queue and why.

As a1, plus: the messages table gains a nullable waiting_on column (schema version 2, added on open in one transaction by an upgrade step from version 1), carried on QueuedMessage as waitingOn?: 'approval' | 'selection'. The store gains markWaiting(seq, on) that sets or clears it only on a processing row. The chat host reports a card of the running queued message through a third argument of QueuedTurnRunner.run, onWaiting(on | undefined), called when the first approval or selection card of the run appears and again (undefined) when no card waits; the worker writes it with markWaiting, so the worker stays the only writer. Every window receives the flag in the rows of onChange, and projectOutbox fills blockedBy from the processing row of another chat: { chatTitle, reason }. The flag ends with the row (finish deletes or fails it).

## 9. UX

- [UX mock](docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S002/ux-mock.html)

## 10. References

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts`
- **[[c5]]** `prior-artifact` `HLD-613abdb351c2c738`

## 11. Open questions

- cd1 (partial): projectOutbox is a new function of the sc5 module, not an existing symbol; it is the projection the HLD boundary for s2 names.
- Four additive changes to s1-owned contracts need approval as HLD amendments: sc4 act(seq, action) and sc1 resendFrom(seq, newTurnId, windowKey) (filed by the first run of this design), and sc1 markWaiting(seq, on) with the waiting_on column and sc4's runner onWaiting argument (filed by this run).
- The schema moves to version 2: a window still on the previous plugin refuses the file and runs messages directly until it is reloaded, and a plugin rollback needs the queue file removed.
- While a turn runs, the send control is Stop, so a message can be queued mid-turn only with Cmd/Ctrl+Enter; whether to offer a separate send while running is left to a later change.

## Resolved questions

- `q4ab57645` — cd1 (partial): projectOutbox is a new function of the sc5 module, not an existing symbol; it is the projection the HLD boundary for s2 names.
  - **resolved**: Accept the HLD boundary as enough — projectOutbox is new by design; s2 creates it in chat-outbox.ts (the sc5 module). _(2026-10-14T12:50:03.494Z)_
- `q5eea7566` — Four additive changes to s1-owned contracts need approval as HLD amendments: sc4 act(seq, action) and sc1 resendFrom(seq, newTurnId, windowKey) (filed by the first run of this design), and sc1 markWaiting(seq, on) with the waiting_on column and sc4's runner onWaiting argument (filed by this run).
  - **resolved**: Approve all, but plan s1 tasks first — The user approved all four amendments (AMD-3, 4, 7, 8) with the LLD on 2026-10-14; the plan puts the s1-owned additions first. _(2026-10-14T12:50:40.209Z)_
- `qfad1a51a` — The schema moves to version 2: a window still on the previous plugin refuses the file and runs messages directly until it is reloaded, and a plugin rollback needs the queue file removed.
  - **resolved**: Accept the v2 break, with a documented runbook — The user approved the LLD with the schema 2 trade-offs presented (old window runs directly until reloaded; rollback removes the queue file). _(2026-10-14T12:51:01.331Z)_

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/protocol.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-queue-store.ts`
- **[[c5]]** `prior-artifact` `HLD-613abdb351c2c738`
