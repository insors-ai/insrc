<!-- insrc:artifact PLAN-613abdb351c2c738-s2 -->

# Plan: E20261014613abdb3:S002

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**LLD run:** `wf-1791981822071-v8q2gp`
**LLD effective hash:** `e1a7250f3a6d...`

Building the outbox starts in S001's queue: the file moves to schema version 2 with a 'waiting on a card' flag, the store learns to resend a message to the resending window, and the worker gains one action entry point and a way to record the running message's card. On top of that a pure projection turns the queue's rows into the outbox for the shown chat, the chat host posts it and handles its actions, and the webview draws the band and the queue-shortcut hint. A hand check in VS Code closes the Story.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** The queue file at schema version 2, with markWaiting and resendFrom | M | — | integration: schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting; integration: schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty, and a newer file is still refused; integration: markWaiting sets and clears waitingOn on a processing row only; integration: resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused | [[c2]] [[c5]] [[c3]] |
| 2 | **`t2`** The worker's act and the runner's onWaiting | M | `t1` | integration: worker act: cancel removes a waiting message and is refused once the message has started; dismiss and resend refuse rows in the wrong state; resend takes this window's key; a successful act is seen by onChange at once; integration: worker onWaiting: the runner's card report sets and clears waitingOn on the running message, and a busy write is retried on the next tick | [[c1]] [[c3]] [[c6]] |
| 3 | **`t3`** The outbox projection and its protocol messages | M | `t1` | unit: outbox projection: with a turn running, the chat's two waiting messages show places 2 and 3, one message from another chat is ahead, and the running chat is named; unit: outbox projection: processing rows are dropped, failed and not-delivered rows have no place, blockedBy comes from another chat's processing row, attachments are counted and the note is carried; unit: protocol: the host-to-webview and webview-to-host type lists include the outbox message and its four actions | [[c1]] [[c2]] |
| 4 | **`t4`** The chat host posts the outbox and handles its actions | M | `t2`, `t3` | integration: chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat's earlier message is counted ahead; integration: chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs; integration: chat host outbox: resending a failed message queues the same text and attachments at the back under this window's key, and it runs; integration: chat host outbox: a refused action is re-posted with its note, a seq of another chat is ignored, and a taken message leaves the outbox; integration: chat host outbox: after the host is rebuilt over the same queue file and its webview is ready, the outbox shows the same messages in the same places | [[c1]] [[c2]] [[c3]] [[c6]] |
| 5 | **`t5`** The running queued message reports its cards, and every window shows blockedBy | M | `t4` | integration: chat host outbox: while another window's running message waits on an approval, this window's outbox says which chat it waits on, and the line clears once the card is answered | [[c1]] [[c2]] [[c6]] |
| 6 | **`t6`** The outbox band, its actions and the shortcut hint in the webview | M | `t4` | unit: chat shell: the outbox band and the queue shortcut hint are present only with the queue; an outbox message draws its rows and summary and each action posts its seq; with the queue a submit does not mark the turn running | [[c1]] [[c2]] [[c7]] |
| 7 | **`t7`** Run the suites and check by hand | S | `t5`, `t6` | smoke: The plugin's whole test suite and typecheck pass apart from failures that existed before this Story; smoke: By hand in VS Code: messages sent mid-turn show in the outbox with their places and leave it as they run; cancel removes one; a stopped message shows failed and Resend runs it; a reload keeps the outbox; the hint shows while a turn runs; with two windows, a waiting approval in one is named in the other's outbox | [[c4]] |

### 1.1 E20261014613abdb3:S002:T001 — The queue file at schema version 2, with markWaiting and resendFrom

In chat-queue-store.ts: the CREATE TABLE messages gains the nullable waiting_on column and SCHEMA_VERSION becomes 2; on open a version-1 file gets the column by ALTER TABLE in the open transaction and records version 2, keeping its rows; rowToMessage maps waiting_on to QueuedMessage.waitingOn. Add markWaiting(seq, on), which sets or clears waiting_on only on a processing row, and resendFrom(seq, newTurnId, windowKey), resend's single transaction with the given window key (AMD-7, AMD-4).

**Acceptance checks:**
- A fresh file is created at version 2 with waiting_on; a version-1 file opens as version 2 with its rows kept and waitingOn empty
- markWaiting sets and clears waitingOn on a processing row and returns false on any other state
- resendFrom re-queues a failed or not-delivered message at the back with its text and attachments under the given window key, and refuses any other state
- A file newer than version 2 is still refused with the newer-plugin message

### 1.2 E20261014613abdb3:S002:T002 — The worker's act and the runner's onWaiting

In chat-queue-worker.ts: ChatQueueWorker gains act(seq, 'cancel' | 'dismiss' | 'resend') -> { ok: true } | { ok: false; note }, applying store.cancel / dismiss / resendFrom(seq, newTurnId(), claim.windowKey), catching StoreBusy / unavailable into a note, and ticking at once on success (AMD-3). QueuedTurnRunner.run gains the optional onWaiting argument; runMessage passes a handler that writes markWaiting(message.seq, on), keeping the latest value to write again on the next tick if the write fails (AMD-8).

**Acceptance checks:**
- act cancel removes a waiting message and is refused with a note once it has started; dismiss and resend likewise refuse rows in the wrong state
- act resend hands the message to this window's key
- An act that succeeds is seen by an onChange listener without waiting for a poll
- onWaiting from the runner sets and clears waitingOn on the running message's row; a busy write is retried on the next tick

### 1.3 E20261014613abdb3:S002:T003 — The outbox projection and its protocol messages

New vscode-free module chat-outbox.ts (sc5): OutboxRow, OutboxView (with runningChat and blockedBy), OutboxAction and projectOutbox(rows, sessionId, ctx), a pure function. protocol.ts gains the host->webview 'outbox' message and the four outbox-* actions, added to HOST_TO_WEBVIEW_TYPES and WEBVIEW_TO_HOST_TYPES.

**Acceptance checks:**
- Processing rows are never outbox rows; positions are 1-based among all waiting rows; failed and not-delivered rows have no position
- aheadFromOtherChats counts only other chats' waiting rows ahead of this chat's first waiting row
- runningChat names another chat's processing row (here when it is this window's); blockedBy comes from that row's waitingOn
- The protocol lists include 'outbox' and the four actions, and the protocol tests' exhaustive lists are updated to match

### 1.4 E20261014613abdb3:S002:T004 — The chat host posts the outbox and handles its actions

In chat-panel.ts createChatPanelHost: subscribe to worker.onChange and keep the last rows; post the projected view for the shown chat after every change, in showSession, on 'ready' and after an action. Route outbox-cancel / -dismiss / -resend to worker.act (ignoring a seq that is not the shown chat's; outbox-retry-now ignored until s4) and re-post with the note on refusal.

**Acceptance checks:**
- Messages sent while a turn runs appear in the posted outbox with their places, and leave it when they are taken
- Cancel, dismiss and resend from the webview change the queue; a refused action is re-posted with its note; a seq of another chat is ignored
- After the host is rebuilt over the same file and its webview is ready, the same outbox is posted
- Without the queue no 'outbox' message is posted

### 1.5 E20261014613abdb3:S002:T005 — The running queued message reports its cards, and every window shows blockedBy

In chat-panel.ts: the queue runner passes onWaiting through for the running queued message: called with 'approval' or 'selection' when its first approval or selection card appears, and with undefined when no card of it is left waiting (answered, Stop, the wait timing out, or the run ending). The worker writes it (t2), and every host's outbox projection shows blockedBy from the processing row.

**Acceptance checks:**
- While one host's running queued message waits on an approval, a second host on the same queue file posts an outbox whose blockedBy names that chat and 'approval'
- The flag clears once the card is answered, and when the run ends
- A selection card reports 'selection'
- A turn not run from the queue reports nothing

### 1.6 E20261014613abdb3:S002:T006 — The outbox band, its actions and the shortcut hint in the webview

In the chat webview shell (chat-panel.ts renderShell): an #insrc-outbox band above the input bar, present only when the queue is on, drawn from 'outbox' with textContent (summary line with ahead / running / waiting-on, rows with place, first line, attachment count, error, and Cancel / Resend / Dismiss as role=button spans with keyboard activation), styled with the chat's theme variables in its rounded style. With the queue on, doSubmit no longer marks the turn running (the host's 'turn-running' does), and the hint '⌘/Ctrl+Enter to queue' is shown beside the message box while a turn runs.

**Acceptance checks:**
- The shell has #insrc-outbox and the hint only when the queue is on
- An 'outbox' message draws its rows and summary line (ahead, running, waiting on); an empty view hides the band
- Each action posts its outbox-* message with the row's seq
- With the queue on, submitting does not mark the turn running; the hint shows while a turn runs and hides after; without the queue, submitting still marks running locally and the existing tests for it stand

### 1.7 E20261014613abdb3:S002:T007 — Run the suites and check by hand

Run the plugin's suite and typecheck, build, package and install the plugin, and have the user check the outbox in VS Code.

**Acceptance checks:**
- The plugin's suite and typecheck pass apart from failures that existed before this Story
- By hand: messages sent mid-turn show in the outbox with their places and leave it as they run; cancel removes one; a stopped message shows failed and Resend runs it; a reload keeps the outbox; the hint shows while a turn runs; with two windows, a waiting approval in one is named in the other's outbox

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| projectOutbox: processing rows dropped, positions among waiting rows, aheadFromOtherChats, runningChat, blockedBy from another chat's processing row's waitingOn, failed / not-delivered rows without position, attachment count, note carried | `t3` |
| ChatQueueWorker.act cancel / dismiss / resend and their refusals; an immediate onChange after an act | `t2` |
| ChatQueueStore.resendFrom keeps text and attachment refs, joins the back, takes the given window key | `t1` |
| ChatQueueStore.markWaiting sets and clears waitingOn on a processing row only; a version-1 file is upgraded to version 2 on open with its rows kept | `t1`, `t2` |
| a fresh file is created at version 2 with waiting_on, and markWaiting works on it | `t1` |
| 'outbox' posted after a change, on showSession and on 'ready' | `t4` |
| outbox-cancel / -dismiss / -resend routed to worker.act; a refusal re-posts with the note; a seq of another chat is ignored | `t4` |
| a queued message leaves the outbox when it is taken (its row is processing) | `t4` |
| protocol.ts lists 'outbox' and the four action types | `t3` |
| renderShell includes #insrc-outbox only when the queue is on; doSubmit does not mark running when the queue is on | `t6` |
| Send two messages mid-turn: both appear in the outbox with places 1 and 2 and leave it as they run; cancel one; a stopped message shows failed with Resend / Dismiss; Resend runs it again; reload the window: the outbox shows the same rows | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails`
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges`
- **[[c3]]** `prior-artifact` `LLD s2 errorPaths`
- **[[c4]]** `prior-artifact` `LLD s2 testStrategy`
- **[[c5]]** `prior-artifact` `LLD s2 migration`
- **[[c6]]** `prior-artifact` `LLD s2 interactionWithShared`
- **[[c7]]** `stakeholder` `Open question qd70938cc resolved 2026-10-14: keep Cmd/Ctrl+Enter and show the hint '⌘/Ctrl+Enter to queue' next to the message box while a turn runs`
