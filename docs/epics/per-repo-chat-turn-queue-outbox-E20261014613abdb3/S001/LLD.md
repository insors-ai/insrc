<!-- insrc:artifact LLD-613abdb351c2c738-s1 -->

# LLD: E20261014613abdb3:S001

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**HLD base run:** `wf-1791967985926-oydluz`
**HLD effective hash:** `e1a7250f3a6d...`

This Story puts every chat message for a repository into one shared queue and runs them one at a time, in order, whichever chat or window they come from. A message sent while a turn runs no longer hides or interrupts it: it waits and runs when the turn ends. The queue is a small SQLite file per repository that all windows share; the window that owns the message at the front takes the repository's lease, marks the message taken and runs it with the chat's existing turn engine.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)

## 1. HLD context

> See **HLD-613abdb351c2c738** § 2. Framework summary

**Rollout phase:** Phase A — the shared queue and in-order turns
**Owns:** `sc1` (ChatQueueStore), `sc2` (RepoLease and WindowPresence), `sc3` (TurnOutcome), `sc4` (ChatQueueWorker)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The outbox's markup, styles (VS Code theme variables, the chat panel's rounded style) and its live updates in the webview, the projection from queue rows to OutboxView for the shown session (processing rows are dropped: the running message is in the transcript), and the handling of the four outbox actions in the chat host. When the queue is held by a waiting approval or selection card, other chats' outboxes say which chat it is waiting on (blockedBy). — owns `sc5`
- `s3`: The takeover rule (lease stale for LEASE_TAKEOVER_MS and both the holder window's process and the lease's CLI process gone), marking a processing message failed when its window died with no CLI left, re-attaching a turn whose CLI survived a reload (the reloaded window, same window key, reclaims the lease with reclaim() and follows the turn through the session's saved cursor), the not-delivered rule for a head message whose window is closed (no live presence past PRESENCE_GRACE_MS and its process gone), and the flush that keeps the stored records within QUEUE_RECORD_BOUND.
- `s4`: The classification of a failed turn's error into an InfraCause, the 'acted' tracking from the turn's tool-call, file-edit and tool-result events, the retry schedule (10 s, 1 min, 5 min; at most 3), the retrying state's row in the outbox with its countdown, retry-now and cancel, and the authentication message.
- `s5`: A pane decision goes to the chat the review pane hands over to today: the chat shown in this window's panel, or, when the panel is closed, the chat the panel opens on (this window's last active chat). It is submitted through ChatQueueWorker.submit with origin 'review-pane', and the panel is opened. submitExternal returns ExternalSubmitResult = 'queued' | { readonly kind: 'unavailable'; readonly note: string } (from EnqueueResult: ok -> 'queued', full / busy / unavailable -> unavailable with the queue's note; 'sent' is no longer returned since every message queues), and the review host's notifyChat type, ChatHandOver and decisionResultLine carry the note so the pane shows why a decision was refused; the change sites are ExternalSubmitResult in chat-panel.ts:148-154, the review host's notifyChat dep type and ChatHandOver in docs-review-panel.ts:45 and :65 with the hand-over sentence at :2452 (the 'sent' branch goes; 'queued' reads 'Sent to the chat; it waits its turn in the outbox.'; 'unavailable' shows the queue's note), the binding in extension.ts:712, and the tests review-wiring.test.ts, docs-review-decision.test.ts (its default notifyChat returning 'sent' at :126 and the result lines at :457-462) and chat-panel.test.ts's submitExternal suite (:4931-5235), which assert 'sent', the wording and the drain order. The waitingExternal list and drainExternal are removed. Attachments: liveSessionIds() across every repository's queue file under ~/.insrc/chat-queue is added to the start-up sweep's keep set (which takes session ids, extension.ts:470, attachment-store.ts:199), and session eviction skips any session with live rows in any queue: createFileChatSessionStore (session-file-store.ts: FileStoreDeps at :98-105, evictBeyondCap at :285-313, built at extension.ts:459) gains a keep predicate dependency: the oldest-first eviction skips kept sessions and evicts other sessions instead to respect the cap, since onEvict runs after the eviction and cannot veto it.

## 2. Contract details

**Surface level:** internal

### 2.1 `ChatQueueStore`

```typescript
createChatQueueStore(deps: { readonly path: string; readonly openDatabase: (path: string) => SqliteDatabase; readonly now: () => number; readonly pluginVersion: string; readonly log: ChatPanelLogger }): ChatQueueStore & ChatQueueLeases
```

**Parameters:**
- `deps.path: string` — The repository's database file, ~/.insrc/chat-queue/<repo key>.sqlite; its directory is created if missing.
- `deps.openDatabase: (path: string) => SqliteDatabase` — Opens the file with node:sqlite's DatabaseSync; injected so the module stays free of the runtime check and tests can use a temp file. SqliteDatabase is the subset used: exec, prepare(...).run/get/all.
- `deps.now: () => number` — Clock for heartbeats and timestamps.
- `deps.pluginVersion: string` — Recorded in the meta table when the store is created.
- `deps.log: ChatPanelLogger` — Logs refusals and busy waits.

**Returns:** `ChatQueueStore & ChatQueueLeases` — New module chat-queue-store.ts implementing HLD sc1 and sc2. On open: PRAGMA journal_mode=WAL, synchronous=NORMAL, busy_timeout=5000; schema version 1 created or migrated in one transaction (tables messages, lease, presence, meta). Every write is BEGIN IMMEDIATE ... COMMIT. enqueue counts live rows and returns { ok:false, reason:'full', note } at QUEUE_RECORD_BOUND (500), else inserts with state queued and the next seq. head() returns the first row in seq order whose state is queued or retrying. acknowledge(seq, claim) succeeds only when the row is that head, its state is queued (or retrying and due) and the lease row is empty: it sets the lease { windowKey, pid, pidStartedAt, seq, heartbeatAt: now } and the row's state to processing in the same transaction. finish(seq, outcome) maps done and detached-ended to DELETE, stopped to failed with error 'stopped by the user' (or the given reason), failed to failed with its error (s4 adds retrying), not-delivered to not-delivered (s3), and clears the lease when it names seq. cancel deletes a queued or retrying row; dismiss deletes a failed or not-delivered row; resend inserts a copy at the back with a new turn id and deletes the old row. attachCli, heartbeat, release, presence and windowAlive operate on the lease and presence rows; takeOver and reclaim are declared here and return false until s3 implements their rules. dataVersion() reads PRAGMA data_version.

**Errors:**
- `EnqueueResult { ok:false, reason:'busy' }` when SQLITE_BUSY persisting past busy_timeout: the caller gets a note, nothing is lost.
- `thrown StoreUnavailable` when openDatabase throws (node:sqlite missing) or the schema version is newer than this plugin knows; extension.ts turns it into the 'unsupported' notice.

**Preconditions:**
- One store per repository file per window; two windows open the same file

**Postconditions:**
- A message is acknowledged at most once, by one window
- Rows run in seq order; a retrying head is never skipped
- done rows never remain; live rows never exceed 500

### 2.2 `ChatQueueWorker`

```typescript
createChatQueueWorker(deps: ChatQueueWorkerDeps): ChatQueueWorker
```

**Parameters:**
- `deps.store: ChatQueueStore & ChatQueueLeases` — The repository's store.
- `deps.claim: LeaseClaim` — This window: its window key (stable across reloads) and extension-host pid with start time.
- `deps.runner: QueuedTurnRunner` — The chat host's runQueued.
- `deps.isAlive: (pid: number, startedAt?: number) => boolean` — Process check built in extension.ts from session-lock.ts's defaultIsAlive(pid) and defaultProcessStartTime(pid) (the pid is alive and, when a start time is given, it matches).
- `deps.now: () => number` — Clock.
- `deps.timers: Timers` _(optional)_ — setTimeout/clearTimeout, injected for tests (async-util.ts's Timers).

**Returns:** `ChatQueueWorker` — New module chat-queue-worker.ts implementing HLD sc4. It refreshes this window's presence every LEASE_HEARTBEAT_MS; polls store.dataVersion() every 500 ms while the store has live rows or this window holds the lease, every 5 s otherwise; on a change it emits onChange(list()). Because PRAGMA data_version does not change for a connection's own commits, the store also counts its own committed writes (a local version bumped by every enqueue, acknowledge, finish, cancel, dismiss, resend, attachCli and release); the worker compares both, so onChange fires after this window's writes too, as sc4 requires. When idle (not running) and head() is this window's (windowKey === claim.windowKey) and not a retrying row still waiting, it calls acknowledge(head.seq, claim); on success it starts heartbeating the lease every LEASE_HEARTBEAT_MS, calls runner.run(message, onSpawn) where onSpawn calls attachCli, and on the outcome calls finish(seq, outcome) and release(claim); if either throws (SQLITE_BUSY past the timeout), the pair is kept as a pending finish and retried on every poll until it commits, and the worker takes no new message meanwhile. One message runs at a time per window, and the lease makes that one per repository. submit() enqueues and triggers an immediate check. liveSessionIds() lists sessions with live rows. dispose() stops the timers, removes this window's presence row, and releases a held lease when the turn's CLI has already exited (finishing its message as the runner reported, or as failed 'the window closed during the turn'); a lease whose CLI is still running is left to its heartbeat timeout, which s3's takeover acts on.

**Errors:**
- `none thrown` when A runner that rejects is treated as failed with the error and acted=true (so it is never retried); store errors are logged and retried on the next poll.

**Preconditions:**
- The store opened

**Postconditions:**
- A window never runs two messages at once
- A head message of another window is left to that window

### 2.3 `QueuedTurnRunner`

```typescript
interface QueuedTurnRunner { run(message: QueuedMessage, onSpawn: (cli: { readonly pid?: number | undefined; readonly startedAt?: number | undefined }) => void): Promise<TurnOutcome> }
```

**Parameters:**
- `message: QueuedMessage` — The acknowledged message: its session, text and attachments (AttachmentRef as the attachment store gives it).
- `onSpawn: (cli) => void` — Called once the turn's CLI is spawned, so the lease records the CLI process.

**Returns:** `Promise<TurnOutcome>` — Implemented by createChatPanelHost as runQueued. It opens the panel if it is closed and shows the message's session if another is shown (posting a note 'Running your queued message in <title>'); if the session no longer exists it resolves failed 'the chat no longer exists'. It posts 'turn-running' { sessionId } to the webview, which sets its running state (setRunning(true) and the progress line, as doSubmit does today) so the send button becomes Stop for a queued turn that started without a click (a message typed mid-turn, one from another window or after a reload); the turn's done or error clears it as today. It then runs what startTurn does today for that session (user row and live echo, first-message title, save, TurnRequest with readDirs, turns.start) and resolves when the turn and its continuations have ended; it also resolves when turns.start()'s promise settles with no terminal event, no reported error and no onSpawn call (the turn was dropped while waiting for the session lease or in beforeRun, e.g. a chat switch at that moment): stopped with error 'the turn was dropped before it started'. Otherwise: done on a terminal done; failed with the error (acted=true until s4 tracks it) on a terminal error or a reported error; stopped on Stop: cancel-turn (chat-panel.ts:1509-1514) sets a stop flag on the running queued message, and that flag takes precedence over the terminal error a stopped CLI produces ('the CLI ended without finishing the turn'), so a Stop is always 'stopped by the user', never a failure that s4 could retry; detached-ended when the view was detached and the detached CLI's exited promise settles (a pipe turn, which detach() stops, resolves stopped). A continuation (the approval grant's re-run and the selection continuation, which call runTurn with allowedTools or suppressEcho) runs under the same lease, off the queue, and the message resolves only after the last continuation ends; a waiting approval or selection card ends at an answer, Stop, a chat switch, the panel closing or CONTINUATION_WAIT_MS (10 minutes), and then the message resolves stopped with error 'no answer to the approval'.

**Errors:**
- `none thrown` when Every failure is a TurnOutcome.

**Preconditions:**
- The worker acknowledged the message for this window

**Postconditions:**
- The user row is pushed to the transcript only when the message runs (it leaves the outbox for the transcript)

### 2.4 `createTurnLifecycle`

```typescript
createTurnLifecycle(deps: TurnLifecycleDeps): TurnLifecycle  // TurnSink and FollowSink gain onSpawn?(cli: { pid?: number; startedAt?: number; exited: Promise<void> }): void
```

**Parameters:**
- `deps: TurnLifecycleDeps` — Unchanged.

**Returns:** `TurnLifecycle` — Two changes, as the HLD decides. (1) The newest-wins supersede is removed: start() no longer aborts a turn waiting for the session lease and no longer takes over reporting from a turn in progress; a start() made while a turn of this lifecycle is in progress waits until that turn has ended (start calls are chained) and only then takes its generation, so the earlier turn is never dropped. The generation still guards detach(), invalidate() and Stop, and a start still waiting in the chain is dropped by them too: stop(), detach() and invalidate() bump a chain epoch that the chained start checks when it resumes, so it never spawns (the grant re-run chained inside onTerminal cannot run after its message resolved stopped). The tests that pinned the supersede change as the HLD lists (turn-lifecycle.test.ts:205, :229, :252, :728, :766, :984: a second start now runs after the first). (2) Both sinks gain onSpawn, called from the existing onSpawn closure of run() and from follow()'s resumed process, with an exited promise that settles on the process's exit and survives detach(). onSpawn is called for every spawned process, also one without a pid (TurnProcess.pid is number | undefined, cli-adapter.ts:74): the pid is then absent, the lease records no CLI, and 'spawned' is still known, so runQueued never mistakes it for a turn dropped before it started.

**Errors:**
- `none` when onSpawn throwing is logged and ignored.

**Postconditions:**
- A detached session-file turn's CLI exit is observable to the chat host
- A second start() runs after the first ends; no turn is dropped by a later start
- A start waiting in the chain is dropped by stop(), detach() and invalidate() and never spawns

### 2.5 `createChatPanelHost`

```typescript
createChatPanelHost(deps: ChatPanelHostDeps & { readonly queue?: ((runner: QueuedTurnRunner) => ChatQueueWorker) | undefined }): ChatPanelHost
```

**Parameters:**
- `deps.queue: (runner) => ChatQueueWorker` _(optional)_ — Builds the window's worker over the repository's store with the host's runner; absent (tests, or node:sqlite unavailable) keeps today's direct start path.

**Returns:** `ChatPanelHost` — With a queue: the webview's submit-turn and the attachment submit call worker.submit({ sessionId, text, origin: 'typed', attachments }) instead of runTurn, and no longer call supersedeQueuedApprovals (chat-panel.ts:1432, :1506), so sending never touches the running turn; a refused submit posts the queue's note as a chat notice. The grant re-run (:578) and the selection continuation (:1671) keep calling runTurn directly, as continuations under the lease. Stop calls turns.stop(); the running message then resolves stopped. The host exposes the runner. submitExternal and drainExternal are left to s5, which moves them onto the queue; until then drainExternal (chat-panel.ts:697-704) is a third direct start, and in s1 it is held back while this window's worker is running a message (it waits for the worker to be idle). A pane decision in Phase A can still start a turn while another window's queued turn holds the lease: a stated rollout gap closed by s5.

**Errors:**
- `none thrown` when A submit refused by the queue is shown, never thrown.

**Postconditions:**
- A typed message never starts a turn directly while a queue is present

### 2.6 `activate (extension.ts)`

```typescript
activate(context: vscode.ExtensionContext): void
```

**Parameters:**
- `context: vscode.ExtensionContext` — Gives workspaceState for the window key.

**Returns:** `void` — Builds the queue for the chat: the window key is read from workspaceState 'insrc.chat.windowKey' (a random id created once); the repo key is the sha256 (first 16 hex) of the real path of `git -C <chat folder> rev-parse --show-toplevel`, else the real path of the folder, else of process.cwd(); the store opens at ~/.insrc/chat-queue/<repo key>.sqlite through openDatabase = (p) => new (require('node:sqlite').DatabaseSync)(p). As DEF k5 requires, package.json engines.vscode rises to ^1.141.0, the version whose runtime was checked (Electron 43, Node 24.21), so an older VS Code does not install this plugin version. If opening the store still throws (a runtime without the module, e.g. a modified build), the chat runs without the queue (today's behaviour) and says plainly once: 'This VS Code is not supported by the chat queue: its runtime cannot load node:sqlite. Messages run as before.' The extension also gives the worker isAlive = (pid, startedAt) => defaultIsAlive(pid) && (startedAt === undefined || defaultProcessStartTime(pid) === startedAt), built from session-lock.ts's two existing checks. The plugin's tests need Node >= 22.13 (node:sqlite unflagged); the repo's toolchain runs Node 22.22 and 24.

**Errors:**
- `none thrown` when Any queue set-up failure falls back to the direct path with the notice.

**Postconditions:**
- Two windows on the same working tree get the same repo key

## 3. Data model changes

### 3.1 `ChatQueueStore schema v1` — new

messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, session_id, turn_id, window_key, origin, text, attachments_json, state, attempts INTEGER DEFAULT 0, next_attempt_at, error, created_at, updated_at); lease(id INTEGER PRIMARY KEY CHECK(id=1), window_key, pid, pid_started_at, seq, cli_pid, cli_started_at, heartbeat_at); presence(window_key PRIMARY KEY, pid, pid_started_at, heartbeat_at); meta(key PRIMARY KEY, value) with schema_version and created_by. Index on messages(state, seq).

```
+ ~/.insrc/chat-queue/<repo key>.sqlite (new file per repository)
```

**Call sites:**
- `vscode-plugin/src/chat/chat-queue-store.ts`
- `vscode-plugin/src/extension.ts`

### 3.2 `TurnSink / FollowSink` — field-add

Optional onSpawn(cli: { pid?, startedAt?, exited: Promise<void> }), called for every spawned process.

```
TurnSink { ...; + onSpawn?(cli) } ; FollowSink { ...; + onSpawn?(cli) }
```

**Call sites:**
- `vscode-plugin/src/chat/turn-lifecycle.ts`
- `vscode-plugin/src/chat/chat-panel.ts`

### 3.3 `vscode-plugin/package.json engines` — field-modify

engines.vscode ^1.75.0 -> ^1.141.0 (DEF k5); engines.node '>=22.13' added so the test runtime has node:sqlite unflagged (HLD).

```
"vscode": "^1.141.0", "node": ">=22.13"
```

**Call sites:**
- `vscode-plugin/package.json`

### 3.4 `Chat webview message 'turn-running'` — new

Host -> webview { type: 'turn-running', sessionId }: posted when a queued message begins, for the shown session; the webview enters its running state. Typed in protocol.ts (a HostToWebview member and a HOST_TO_WEBVIEW_TYPES entry); the protocol test that pins the type list is updated.

```
+ { type: 'turn-running'; sessionId: string }
```

**Call sites:**
- `vscode-plugin/src/chat/chat-panel.ts`
- `vscode-plugin/src/chat/protocol.ts`

## 4. Diagrams

- [Sequence diagram](docs/epics/per-repo-chat-turn-queue-outbox-E20261014613abdb3/S001/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | chat-queue-store.ts implements ChatQueueStore with the schema above; finish() maps outcomes as the HLD states; retrying and not-delivered transitions are left to s4 and s3. |
| `sc2` | implements | The lease and presence tables and attachCli, heartbeat, release, presence, windowAlive; takeOver and reclaim are declared and return false until s3 gives their rules. |
| `sc3` | implements | TurnOutcome and QueuedTurnRunner as runQueued in the chat host; onSpawn on both sinks in the turn lifecycle. |
| `sc4` | implements | chat-queue-worker.ts with the timers and decisions above; submit and onChange are the entry points s2 and s5 use. |

## 6. Error paths

**Error cases**

- **The store's schema is newer than this plugin (a newer plugin in another window created it)** (recoverable)
  - Detection: meta.schema_version greater than the version this module knows
  - Response: StoreUnavailable; the chat falls back to the direct path with a notice asking to reload or update
  - User impact: As above until every window runs the same plugin
- **Another window holds the database lock longer than the busy timeout** (recoverable)
  - Detection: SQLITE_BUSY after busy_timeout=5000
  - Response: enqueue returns busy with a note; the worker retries on its next poll
  - User impact: A rare 'try again' note on a send; nothing lost
- **The runner rejects instead of resolving an outcome** (recoverable)
  - Detection: The worker's await of runner.run throws
  - Response: finish(seq, failed with the error, acted=true) and release
  - User impact: The message shows failed with a resend
- **The head message's chat session no longer exists (evicted or deleted)** (recoverable)
  - Detection: The store lookup for message.sessionId returns undefined in runQueued
  - Response: Resolved failed 'the chat no longer exists'
  - User impact: The queue moves on; the reason is shown
- **A window running the previous plugin version starts turns directly after an update** (recoverable)
  - Detection: Not detectable by the queue
  - Response: Accepted until that window is reloaded; VS Code prompts for the reload after an extension update
  - User impact: Until the reload, that window's turns are outside the queue
- **A queued turn is dropped before it starts (a chat switch or panel close while it waits for the session lease or runs beforeRun)** (recoverable)
  - Detection: turns.start()'s promise settles with no terminal event, no reported error and no onSpawn
  - Response: runQueued resolves stopped with error 'the turn was dropped before it started'
  - User impact: The message shows failed with a resend; the queue moves on
- **finish or release fails after a turn ends (SQLITE_BUSY past the timeout)** (recoverable)
  - Detection: The store call throws in the worker
  - Response: Kept as a pending finish and retried on every poll; no new message is taken meanwhile
  - User impact: A short delay before the next message
- **node:sqlite cannot be loaded (a VS Code whose runtime lacks it) or the database cannot be opened** (recoverable)
  - Detection: openDatabase throws inside activate's queue set-up
  - Response: The chat is built without the queue (today's direct path); a one-time notice says why
  - User impact: Chat works as before without ordering across windows

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A message typed while an approval card of the running turn waits | The card stays; the message waits behind the turn |
| The user approves the card | The grant re-run runs as a continuation under the same lease; the queued message runs after it ends |
| No answer to a waiting card for 10 minutes | The running message resolves stopped (failed, 'no answer to the approval'), the lease is released, the next message runs |
| The user switches chat while a session-file turn runs | The view detaches; the window keeps the lease and heartbeats it until the CLI exits; then the message finishes |
| A pipe turn (no session output) when the user switches chat | detach() stops it; the message resolves stopped and shows failed with a resend |
| The head message belongs to a chat not shown in its window | The panel shows that chat with a note and the turn runs there |
| The panel is closed when the window's message reaches the front | The panel opens on the message's chat and the turn runs |
| Two windows open on the repo root and on a subfolder of it | Same git top-level, same repo key, one queue |
| A window with no folder open | Keyed by the real path of its process's working directory |
| The 500th live message | Accepted; the 501st is refused with 'The chat queue for this repository is full (500 messages). Dismiss or cancel some to send more.' |
| A review-pane decision in Phase A while another window's queued turn holds the lease | drainExternal still starts it in this window (held back only while this window's worker runs); a stated gap closed by s5 |
| Stop while the CLI is mid-answer | The CLI's terminal error is overridden by the stop flag: the message is failed with 'stopped by the user' and a resend, never retried |
| A window crashes while its turn runs (Phase A, before s3) | The lease stays held; the queue waits for s3's takeover. A stated Phase A gap. |
| A window is closed normally while its turn's CLI is still running (Phase A) | dispose() leaves the lease to its heartbeat timeout; the queue waits for s3's takeover. A stated Phase A gap. |
| A window is closed normally after its turn's CLI exited | dispose() finishes the message and releases the lease; the queue moves on |
| A closed window's own message reaches the head (Phase A) | Other windows leave it alone; the queue waits until that window reopens or s3's not-delivered rule. A stated Phase A gap. |
| A queued message starts after the previous turn's done cleared the webview's running state | 'turn-running' puts the webview back into its running state, so Stop is available |
| Stop while a grant re-run is chained behind the turn | The chained start is dropped and never spawns; the message resolves stopped and the lease is released |
| A spawned CLI process without a pid | onSpawn still fires (no pid); the lease records no CLI; the turn is not treated as dropped |
| This window's own submit, cancel or finish | onChange fires from the store's own-write counter, though data_version is unchanged for its own connection |

**Invariants to preserve**

- One CLI process per chat session (the per-session lease stays as a guard) [[c4]]
- The turn lifecycle stays free of the vscode import and deps-injected; createTurnLifecycle(deps) at turn-lifecycle.ts:138 [[c1]]
- A followed turn after a reload resumes from its saved cursor [[c4]]
- The grant re-run and the selection continuation keep their allowedTools and suppressEcho [[c6]]
- Only extension.ts imports vscode; new modules are deps-injected [[c3]]

## 7. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test) under Node >= 22.13 so node:sqlite is unflagged (the repo's toolchain runs Node 22.22 and 24); the two-process test forks a child with child_process.fork over a temp database file; the chat host tests use the existing fake channel and gated adapters`

**Test levels**

- **unit** — The store's transactions and rules, the worker's decisions, the lifecycle's spawn surface.
  - Subjects: `chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows`, `chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit`, `turn lifecycle: a second start runs after the first ends instead of superseding it, and a start waiting in that chain is dropped by Stop and by detach and never spawns; onSpawn reports the CLI with an exit promise for a live and a followed turn, also after detach`
- **integration** — Two processes on one file, the chat host with the queue, and the wiring.
  - Subjects: `chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once`, `chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval`, `chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs`, `chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists`, `extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once`
- **smoke** — The suite and a hand check with two windows.
  - Subjects: `The plugin's whole test suite and typecheck pass apart from failures that exist before this Story, with the tests the HLD lists as changing updated`, `By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval`, `By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs` |
| `ac2` | `chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit`, `By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs` |
| `ac3` | `chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows`, `chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once`, `chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit` |
| `ac4` | `chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs`, `By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs` |

## 8. Migration

**State before:** A typed message starts a turn at once and the newest message wins: the running turn stops reporting and the new one waits for the session's previous CLI to exit. Turns of different chats run at the same time.

**State after:** Every typed message goes into the repository's shared queue and runs in order, one turn per repository; the running turn keeps reporting; Stop leaves the message failed with a resend.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add chat-queue-store.ts with the schema and transactions, and its tests including the two-process test — ↩ rollbackable
2. Add chat-queue-worker.ts and its tests — ↩ rollbackable
3. Remove the newest-wins supersede from the turn lifecycle (chained starts) and add onSpawn with the exit promise to its sinks; update the lifecycle tests the HLD lists — ↩ rollbackable
4. Give the chat host the runner and route typed messages through the queue; update the chat-panel tests the HLD lists — ↩ rollbackable
5. Wire the repo key, window key and store in extension.ts with the fallback and notice; raise engines.vscode to ^1.141.0 and add engines.node >=22.13 — ↩ rollbackable
6. Run the suite, build, package, install; hand check with two windows — ↩ rollbackable

**Backward compat:** A new file per repository under ~/.insrc/chat-queue; nothing existing is rewritten. Without node:sqlite the chat keeps today's direct path. A window still on the old plugin starts turns outside the queue until reloaded. Phase A gaps closed by later Stories: a lease held by a crashed window, or by a window closed while its CLI still runs, waits for s3's takeover; a closed window's message at the head waits for s3's not-delivered rule; and a review-pane decision can start a turn outside the queue until s5.

## 9. Alternatives considered

### 9.1 a1: Store and worker as two new modules; the chat host submits and supplies the runner — **CHOSEN**

chat-queue-store.ts and chat-queue-worker.ts as the HLD lays out; the chat host's typed and pane messages call worker.submit, and the host's runQueued is the QueuedTurnRunner

chat-queue-store.ts wraps one node:sqlite database (opened through an injected factory) with the schema, pragmas and every transaction of sc1 and sc2. chat-queue-worker.ts owns timing: presence and lease heartbeats, data_version polling, deciding to acknowledge the head, and calling the runner. The chat host keeps the turn path it has: runQueued(message) shows the message's chat, then does what startTurn does today (transcript row, echo, title, request) and resolves a TurnOutcome from the sink.

### 9.2 a2: One combined queue module

Store and worker in one file with one factory

A single chat-queue.ts holds the schema, transactions, timers and the run decision behind one factory.

**Rejected because:** Harder to test the cross-process guarantees.

### 9.3 a3: Queue inside the turn lifecycle

turn-lifecycle.ts itself enqueues and decides when to run

turns.start would enqueue and run when its message reaches the front, so the chat host would not change.

**Rejected because:** Against the HLD's boundary.

## 10. References

- **[[c1]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:138` — "export function createTurnLifecycle(deps: TurnLifecycleDeps): TurnLifecycle {"
- **[[c2]]** `analyze-bundle` `s1 analyze:capability-discovery — no node:sqlite or cross-window store in the plugin`
- **[[c3]]** `analyze-bundle` `s1 analyze:convention.detect — kebab-case files, *.test files, deps-injected modules, only extension.ts imports vscode`
- **[[c4]]** `analyze-bundle` `s1 read:turn-flow — the session lease, follow after reload, detach, waitingExternal, the attachment sweep`
- **[[c5]]** `analyze-bundle` `s1 read:start-turn — chat-panel.ts:1236 startTurn and cli-adapter.ts:44 TurnRequest`
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:578 and :1671` — "void runTurn(prompt, approvals.grantChain(), { suppressEcho: true }) ... runTurn(`Selected: ...`, undefined, { suppressEcho: true })"
- **[[c7]]** `prior-artifact` `HLD-613abdb351c2c738 (approved 2026-10-14)`
- **[[c8]]** `analyze-bundle` `s1 read:extension-state — workspaceState, the chat folder, git via execFile`
- **[[c9]]** `prior-artifact` `The daemon review of revision 1 of this LLD, 2026-10-14: block, 1 high (a turn dropped before it starts never resolves) and 4 medium (the lifecycle change could not do what it said; drainExternal as a third direct start; the engines floor defeats the fallback notice; a failed finish or release)`
- **[[c10]]** `prior-artifact` `The daemon review of revision 2 of this LLD, 2026-10-14: block, 3 medium (k5 requires the engines floor raised; the isAlive shape; Stop must win over the stopped CLI terminal error)`
- **[[c11]]** `prior-artifact` `The daemon review of revision 3 of this LLD, 2026-10-14: block, 3 medium (the HLD removes the supersede; engines.node; Phase A stalls on a normally closed window)`
- **[[c12]]** `prior-artifact` `The daemon review of revision 4 of this LLD, 2026-10-14: block, 2 medium (the webview is not told a queued turn is running; Stop and detach must drop a chained start)`
- **[[c13]]** `prior-artifact` `The daemon review of revision 5 of this LLD, 2026-10-14: block, 3 medium (data_version misses own commits; protocol.ts for turn-running; a spawned process without a pid)`

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 1 could not be verified · 15 hold** · template `design-spec` · model `cli-claude:opus` · reviewed 2026-10-14T09:17:38.911Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| new-versus-reuse | VS Code 1.141's runtime (Electron 43, Node 24.21) can load node:sqlite's DatabaseSync in the extension host. | This depends on the external VS Code/Electron runtime, which is not in the repo. Nothing local can confirm the version mapping. The design falls back to the direct path with a notice if loading fails (§2.6), so a wrong premise degrades the feature rather than breaking the chat. [files: vscode-plugin/package.json] | Confirm by hand during the step-6 check in VS Code 1.141 that the store opens and the 'unsupported' notice does not appear. |
