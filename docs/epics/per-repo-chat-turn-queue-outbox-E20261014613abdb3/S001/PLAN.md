<!-- insrc:artifact PLAN-613abdb351c2c738-s1 -->

# Plan: E20261014613abdb3:S001

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**LLD run:** `wf-1791969455067-dfc1hm`
**LLD effective hash:** `e1a7250f3a6d...`

Building this Story adds two new modules (the repository's queue store and each window's queue worker), changes the turn engine so starts run one after another and report their CLI process, gives the chat host a runner for queued messages and routes the chat's messages through the queue, and wires it all in the extension with a safe fallback. It ends with the suite and a hand check with two windows.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the repository queue store | L | — | unit: chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows; integration: chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once | [[c1]] [[c8]] |
| 2 | **`t2`** Add the per-window queue worker | M | `t1` | unit: chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit | [[c2]] [[c8]] |
| 3 | **`t3`** Chain starts in the turn lifecycle and report the CLI process | M | — | unit: turn lifecycle: a second start runs after the first ends instead of superseding it, and a start waiting in that chain is dropped by Stop and by detach and never spawns; onSpawn reports the CLI with an exit promise for a live and a followed turn, also after detach | [[c3]] |
| 4 | **`t4`** Give the chat host the queued turn runner | M | `t1`, `t2`, `t3` | integration: chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists | [[c4]] [[c6]] [[c8]] |
| 5 | **`t5`** Route the chat's messages through the queue | M | `t4` | integration: chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval; integration: chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs | [[c4]] |
| 6 | **`t6`** Wire the queue in the extension and raise the floor | S | `t1`, `t2`, `t5` | integration: extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once | [[c5]] |
| 7 | **`t7`** Run the suites and check by hand with two windows | S | `t6` | smoke: The plugin's whole test suite and typecheck pass apart from failures that exist before this Story, with the tests the HLD lists as changing updated; smoke: By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs | [[c7]] |

### 1.1 E20261014613abdb3:S001:T001 — Add the repository queue store

New chat-queue-store.ts over node:sqlite (injected openDatabase): schema v1 (messages, lease, presence, meta), WAL, synchronous NORMAL, busy_timeout 5000, every write BEGIN IMMEDIATE; enqueue with the 500-row bound, head (queued or retrying, never skipping a retrying head), acknowledge with the lease in one transaction, finish's outcome mapping, cancel, dismiss, resend, attachCli, heartbeat, release, presence, windowAlive, takeOver and reclaim stubs returning false, dataVersion plus an own-write counter, and the schema-version guard.

**Acceptance checks:**
- A message is acknowledged at most once, only with the lease free, and only when it is the head
- Rows run in seq order and a retrying head is never skipped
- done and detached-ended rows are deleted; stopped becomes failed 'stopped by the user'; live rows never exceed 500 and the 501st enqueue is refused with a note
- Two processes on one file acknowledging one head: exactly one succeeds
- A newer schema version, or a database that cannot be opened, is reported as unavailable

### 1.2 E20261014613abdb3:S001:T002 — Add the per-window queue worker

New chat-queue-worker.ts: presence and lease heartbeats every 5 s, polling data_version and the store's own-write counter (500 ms active, 5 s idle), onChange, acknowledging this window's head, calling the runner with onSpawn recording the CLI, finish and release with a pending retry on failure, submit, liveSessionIds, and dispose releasing a lease whose CLI has exited.

**Acceptance checks:**
- The window whose message is at the front takes the lease, runs it, heartbeats while it runs, finishes and releases
- Another window's message at the front is left alone
- onChange fires after this window's own writes and after another window's commit
- A finish that fails is retried before any new message is taken
- dispose releases a lease whose CLI exited and leaves one whose CLI still runs

### 1.3 E20261014613abdb3:S001:T003 — Chain starts in the turn lifecycle and report the CLI process

turn-lifecycle.ts: remove the newest-wins supersede (a start made while a turn is in progress waits for it, then takes its generation), drop a chained start on stop/detach/invalidate through a chain epoch, and add onSpawn (pid optional, start time, exited promise surviving detach) to TurnSink and FollowSink for live and followed turns; update the lifecycle tests the HLD lists.

**Acceptance checks:**
- A second start runs after the first instead of superseding it
- A chained start is dropped by Stop and by detach and never spawns
- onSpawn reports every spawned process, with or without a pid, and its exit also after detach, for live and followed turns
- The listed lifecycle tests are updated and the rest pass unchanged

### 1.4 E20261014613abdb3:S001:T004 — Give the chat host the queued turn runner

chat-panel.ts: runQueued as the QueuedTurnRunner: show the message's chat (opening the panel when closed) with a note, post 'turn-running' (protocol.ts gains it; the webview enters its running state), push the user row and echo at run time, start the turn, and resolve the outcome: done, failed with the error, stopped by the stop flag set on cancel-turn, detached-ended after a detached CLI exits, stopped for a pipe turn or a turn dropped before it started, failed for a missing chat; continuations (the grant re-run, the selection continuation) run under the lease and the message resolves after the last one, a waiting card ending at an answer, Stop, a chat switch, the panel closing or CONTINUATION_WAIT_MS.

**Acceptance checks:**
- A queued turn that starts on its own puts the webview in its running state so Stop is offered
- Stop leaves the message failed 'stopped by the user' even though the stopped CLI reports a terminal error
- The runner resolves for every way a turn ends, including detached, pipe, dropped before start and a missing chat, and only after continuations end

### 1.5 E20261014613abdb3:S001:T005 — Route the chat's messages through the queue

chat-panel.ts: typed and attachment submits call worker.submit and no longer call supersedeQueuedApprovals; a refused submit shows the queue's note; drainExternal is held back while the worker runs a message; the chat-panel tests the HLD and LLD list are updated (:138, :1318, :2854, :4745, :5018, :5302, :5455).

**Acceptance checks:**
- A message sent mid-turn waits, the running turn keeps reporting, and the message runs when the turn ends
- A typed message no longer denies the running turn's waiting approval
- After Stop the next waiting message runs
- The listed chat-panel tests are updated and the rest pass unchanged

### 1.6 E20261014613abdb3:S001:T006 — Wire the queue in the extension and raise the floor

extension.ts: the window key in workspaceState, the repo key from the git top-level's real path (fallbacks), the store under ~/.insrc/chat-queue opened with node:sqlite, isAlive from session-lock's defaultIsAlive and defaultProcessStartTime, the worker given to the chat host, the one-time notice and direct path when the store cannot open; package.json engines.vscode ^1.141.0 and engines.node >=22.13.

**Acceptance checks:**
- Two folders in one git working tree get the same repo key; no folder keys by the process's working directory
- The window key survives a reload
- When node:sqlite cannot load the chat keeps the direct path and shows the notice once
- engines.vscode is ^1.141.0 and engines.node >=22.13

### 1.7 E20261014613abdb3:S001:T007 — Run the suites and check by hand with two windows

Run the plugin's suite and typecheck, build, package and install the plugin, and have the user check in VS Code 1.141 with two windows on one repository.

**Acceptance checks:**
- The plugin's suite and typecheck pass apart from failures that exist before this Story
- By hand: a message typed mid-turn waits and runs after the turn; a message from the second window runs after the first window's turn; Stop marks the message failed and the next runs; a reload while a message waits keeps it; the store opens in the real extension host with no 'unsupported' notice

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows | `t1` |
| chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit | `t2` |
| turn lifecycle: a second start runs after the first ends instead of superseding it, and a start waiting in that chain is dropped by Stop and by detach and never spawns; onSpawn reports the CLI with an exit promise for a live and a followed turn, also after detach | `t3` |
| chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once | `t1` |
| chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval | `t5` |
| chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs | `t5` |
| chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists | `t4` |
| extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once | `t6` |
| The plugin's whole test suite and typecheck pass apart from failures that exist before this Story, with the tests the HLD lists as changing updated | `t7` |
| By hand in VS Code (1.141) with two windows on one repository: a message typed mid-turn waits and runs after the turn, the running turn keeps showing; a message sent in the second window runs after the first window's turn; Stop marks the message failed and the next runs; a window reload while a message waits keeps it and it runs | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 ChatQueueStore (chat-queue-store.ts, schema v1)`
- **[[c2]]** `prior-artifact` `LLD s1 ChatQueueWorker (chat-queue-worker.ts)`
- **[[c3]]** `prior-artifact` `LLD s1 createTurnLifecycle changes (chained starts, chain epoch, onSpawn)`
- **[[c4]]** `prior-artifact` `LLD s1 QueuedTurnRunner and createChatPanelHost changes`
- **[[c5]]** `prior-artifact` `LLD s1 activate (extension.ts) wiring and the engines change`
- **[[c6]]** `prior-artifact` `LLD s1 data model: the 'turn-running' webview message in protocol.ts`
- **[[c7]]** `prior-artifact` `LLD s1 test strategy (smoke checks)`
- **[[c8]]** `prior-artifact` `LLD s1 error paths and edge cases`
