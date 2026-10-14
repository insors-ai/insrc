<!-- insrc:artifact SPEC-6932e6aabd83765d -->

# Spec: Rework how chat turns are queued and locked in the VS Code plugin so a message sent while a turn is running waits visibly in an outbox instead of hanging behind a turn the user can no longer see.

**Category:** requirements

## Intent

Rework how chat turns are queued and locked in the VS Code plugin so a message sent while a turn is running waits visibly in an outbox instead of hanging behind a turn the user can no longer see. As confirmed by the user on 2026-10-14:
1. One queue per repo, shared by every chat and every VS Code window on it; one turn runs in a repo at a time.
2. The queue lives in the plugin (extension host), separate from the daemon's own queues; the daemon does not run the CLI.
3. Store: a per-repo SQLite database under ~/.insrc through Node's built-in node:sqlite (no package, nothing native); the plugin's minimum VS Code version rises to one whose Node includes node:sqlite. Each message is keyed by sessionId::turnId with a state: queued, processing, retrying, done, failed or not delivered; every change is a transaction (busy timeout for concurrent windows). Flush: done messages are consumed and deleted when their turn ends; failed and not-delivered messages stay until resent or dismissed; at most about 500 records per repo (queued, processing, retrying, failed, not delivered); a message that would exceed it after flushing is refused with a note in the chat, never dropped. Attachments (images, files) are never stored in the queue: a message holds their paths in the existing attachment store, and that store's clean-up keeps any file a live message refers to.
4. Strict queue order, no interrupt: a message sent mid-turn waits; Stop ends the running turn and the next message runs. A turn that fails for an infrastructure reason before it has acted (CLI fails to start; provider rate limit, overload, network or timeout; CLI exits on such an error with no tool call, command or edit made) is retried up to 3 times, waiting 10 s, 1 min, 5 min, holding its place at the front in a retrying state that its outbox row shows with the attempt and countdown, with retry-now and cancel; then failed with the error and a resend. Not retried: any failure after the turn has acted, a model refusal or error, Stop, an authentication failure. A database-busy error is waited out and retried; if it persists the message is refused with a note.
5. Acknowledgement and lease: when a chat's message reaches the front, the window that chat belongs to takes the repo's lease, acknowledges the message (queued -> processing, only if still queued) and runs the turn there; the lease is refreshed every few seconds while it runs.
6. A dead window: another window may take over once the lease has gone 10 minutes without a refresh and the turn's CLI process is confirmed gone; the processing message is marked failed with a one-click resend, never re-run by itself; a turn whose CLI process survived a reload is picked up again.
7. A queued message whose window is closed when it reaches the front is marked not delivered with a one-click resend, and the queue moves on. Nothing runs unattended.
8. Outbox in each chat panel: that chat's messages with their positions plus one line for other chats' messages ahead; survives reloads; queued, failed and not-delivered rows can be cancelled or dismissed.
9. Review-pane decisions go through the same queue as ordinary messages of their chat; the pane's separate waiting list is removed.

## Scope boundary

Plugin only: the chat host, its turn runner, the chat panel's outbox and the review pane's hand-over; the daemon and its queues are not touched. It stops at queueing, acknowledging, leasing, retrying infrastructure failures and showing the outbox: no interrupting a running turn other than Stop, no editing or reordering of queued messages, nothing run unattended. Also ruled out by the user beyond the drafted options: the daemon running the CLI; a queue per chat; a file per message, a hand-made file format, or a queue library (immature, server-based or native); stop-and-send-now or newest-wins; re-running a turn by itself apart from the bounded infrastructure retries; a 30-second takeover.

## Non-goals

- Daemon-side queue or consumer (queue lives in the extension host)
- Messages that exist only in memory and are lost on reload
- Editing, reordering, or pausing queued messages (only cancel is in scope)
- Separate independent queues or locks per window for the same repo
- Per-window workspace storage as the queue/lease store (it cannot be shared across windows)
- Running or delivering a message whose originating window is closed (it is dropped with a notification)
- Daemon-side queue
- Hybrid: plugin outbox, daemon consumer
- In-memory only
- Persist and auto-resume on startup
- View only
- Cancel, edit and reorder
- Timeout releases the lock, turn marked failed, next message proceeds
- User-driven only: show a 'stuck' state with a manual Cancel/Skip on the running turn
- Timeout pauses the queue and asks the user whether to retry, skip, or abort
- Auto-resume everything, including the interrupted one
- Restore as paused; user resumes manually
- Drop the interrupted message, resume the rest
- Per-window queue, each window independent
- Single-window only: a second window is read-only or blocked while another owns the repo
- Elected leader window owns the queue, others connect over local IPC
- Shared file store, consumer only in the first window that enqueued
- Inside the repo (e.g. .insrc/queue/ in the working tree)
- VS Code global storage (globalStorageUri) with a repo-keyed subfolder
- Each window's outbox shows only messages it sent; the consumer window runs the turn and writes results to the shared store for the sender to render
- The consumer window runs the turn and shows output only in its own chat panel; other windows show a queued/processing status with no output
- Run it and keep the result for later
- Hold it until its window returns
- The daemon running the chat CLI itself
- A queue per chat instead of per repo
- A file per message, a hand-made queue file format, or a third-party queue library
- Stop-and-send-now or newest-wins interruption of a running turn
- Automatic re-running of a turn other than the bounded retries of an infrastructure failure before it acted
- A 30-second lease takeover

## Decisions

- **Plugin-side (extension host) queue** — Where should the per-repo queue and its single consumer live?
  - Ruled out: _Daemon-side queue_, _Hybrid: plugin outbox, daemon consumer_
- **Persist to workspace storage** — The queue lives in the extension host, which can restart independently of the daemon, so lifetime across restarts is the next open boundary.
  - Ruled out: _In-memory only_, _Persist and auto-resume on startup_
- **Cancel a queued message** — What can the user do with a message while it is waiting in the outbox?
  - Ruled out: _View only_, _Cancel, edit and reorder_
- **Heartbeat-based liveness: release the lock only when the turn's heartbeat stops (also covers crashed or restarted host)** — The core complaint is a message 'hanging' behind a running turn; the persisted queue also means a stale lock can survive a reload, so lock-release behaviour must be pinned.
  - Ruled out: _Timeout releases the lock, turn marked failed, next message proceeds_, _User-driven only: show a 'stuck' state with a manual Cancel/Skip on the running turn_, _Timeout pauses the queue and asks the user whether to retry, skip, or abort_
- **Resume queued, ask about the interrupted one** — Persistence to workspace storage (decision 2) and heartbeat liveness (decision 4) imply that a restart leaves orphaned in-flight work. The replay policy is not yet pinned.
  - Ruled out: _Auto-resume everything, including the interrupted one_, _Restore as paused; user resumes manually_, _Drop the interrupted message, resume the rest_
- **One shared queue and lock per repo across windows** — Decisions 1, 2 and 4 settled an extension-host queue persisted to workspace storage with heartbeat-based lock release; none of them says what happens when several hosts share one repo.
  - Ruled out: _Per-window queue, each window independent_, _Single-window only: a second window is read-only or blocked while another owns the repo_
- **Shared file store with lease-based consumer election** — Earlier choices fix the queue in the extension host (not the daemon), persisted, with heartbeat-based lock release. A shared per-repo queue now needs a store both windows can reach and a way to pick one consumer.
  - Ruled out: _Elected leader window owns the queue, others connect over local IPC_, _Shared file store, consumer only in the first window that enqueued_
- **Per-repo directory under ~/.insrc (keyed by repo hash)** — Per-window workspace storage can't be shared between windows. Where should the shared queue/lease file store live?
  - Ruled out: _Inside the repo (e.g. .insrc/queue/ in the working tree)_, _VS Code global storage (globalStorageUri) with a repo-keyed subfolder_
- **Sender window runs its own turn when it holds the lease; any window's outbox shows the full shared queue, output goes to the originating window's chat** — Settled: one shared per-repo queue and lock across windows, with a file store under ~/.insrc and lease election, so sender and consumer can be different windows.
  - Ruled out: _Each window's outbox shows only messages it sent; the consumer window runs the turn and writes results to the shared store for the sender to render_, _The consumer window runs the turn and shows output only in its own chat panel; other windows show a queued/processing status with no output_
- **Drop it and notify** — Decision 9 routes turn output to the originating window's chat, and decision 5 persists the queue across restarts. So the originating window can disappear while its message is still queued.
  - Ruled out: _Run it and keep the result for later_, _Hold it until its window returns_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `stakeholder` `The user's answers in the chat of 2026-10-14: per-repo queue; queue in the plugin, separate from the daemon's; one bounded store per repo keyed by sessionId::turnId; strict order with no interrupt; failed on a dead window with resend; 10-minute lease takeover; cancel only; review-pane decisions through the same queue; node:sqlite instead of a library or a hand-made file; a flush bounding records per queue; retries for infrastructure failures only`
- **[[c3]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts`
- **[[c4]]** `code` `vscode-plugin/src/chat/session-lock.ts`
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts`
