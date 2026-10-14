<!-- insrc:artifact PLAN-613abdb351c2c738-s5 -->

# Plan: E20261014613abdb3:S005

## Summary

**Epic:** `per-repo-chat-turn-queue-outbox`
**LLD run:** `wf-1792001876848-kfdwrw`
**LLD effective hash:** `02f5e748bf5b...`

Building this Story sends the review pane's decisions through the same per-repository queue as typed messages and removes the pane's own waiting list, then makes the chat unavailable (with a clear notice) in a window whose queue cannot be opened. A short test-only task pins that waiting messages keep their attachments, and a closing task scores the Epic's constraints and records the live hand check.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pane decisions through the queue; the waiting list removed | L | — | integration: chat-queue-outbox-host.test.ts: a review-pane decision sent while a turn runs waits in the outbox as origin review-pane, leaves the running turn and its waiting card alone, and runs when the turn ends; integration: chat-queue-outbox-host.test.ts: submitExternal on a closed panel opens it, saves the chat, queues a review-pane row, and the message runs in order once the webview is ready; integration: chat-queue-outbox-host.test.ts: a decision queued before the panel or window closes is still in the queue file afterwards; integration: chat-queue-outbox-host.test.ts: submitExternal with no CLI, blank text, a full queue and a busy queue each returns unavailable with its own note and queues nothing; unit: docs-review-decision.test.ts: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none are unchanged, and no 'sent' wording remains | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Chat disabled when the queue cannot be opened | M | `t1` | unit: chat-queue-setup.test.ts: when the queue cannot be opened the chat is disabled with a notice chosen by cause (node:sqlite cannot load, newer plugin, any other failure), each saying the chat is disabled, shown once; integration: extension-chat-wiring.test.ts: without a queue the chat command, the chat-ready context, the chat tab serializer and the review host's notifyChat are not set up, and with a queue they are; unit: review-wiring.test.ts: the review host's notifyChat is bound to the chat host's submitExternal when there is a queue and absent when there is none; unit: extension-chat-wiring.test.ts: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready | [[c4]] [[c5]] |
| 3 | **`t3`** A waiting message's attachments survive the start-up sweep | S | `t1` | unit: attachment-store.test.ts: the start-up sweep keeps the attachments of a session in the keep set that holds a waiting message and clears an unreferenced old session; integration: chat-queue-outbox-host.test.ts: a queued message with an attachment keeps it and sends it when the message runs | [[c6]] |
| 4 | **`t4`** Closing: constraints scored, crosswalk, deferred amendments and the live hand check | S | `t1`, `t2`, `t3` | live: hand check: a review-pane decision sent while a turn runs waits in the outbox and runs after it; with the chat panel closed it opens the chat and runs; with the queue unavailable the chat is not offered | [[c1]] [[c4]] [[c7]] |

### 1.1 E20261014613abdb3:S005:T001 — Pane decisions through the queue; the waiting list removed

Change submitExternal in chat-panel.ts to resolve the target chat (the shown session, or the one the panel opens on), save it, and submit through ChatQueueWorker.submit with origin 'review-pane', returning 'queued' or { kind: 'unavailable', note } (note for blank text, no CLI, a full or busy queue, and defensively no worker). Change ExternalSubmitResult, the review host's notifyChat dependency type, ChatHandOver and decisionResultLine together so the pane says 'Sent to the chat; it waits its turn in the outbox.' or 'The chat could not be told: <note>'. Remove waitingExternal, drainExternal and every call to it; keep the webviewReady reset that dropExternal performs under a clearer name. Rewrite the chat-panel.test.ts submitExternal suite and the docs-review-decision tests that pinned 'sent', the old wording and the drain order, and add the queue-path tests on the real-store host harness. This stays one L task because the result type is shared by the chat host and the review host through extension.ts's binding, and the old suite runs on hosts without a queue, so a split would leave the typecheck or the suite red between tasks.

**Acceptance checks:**
- a pane decision sent while a turn runs is a review-pane row in the chat's outbox, the running turn and its waiting card are untouched, and it runs when the turn ends
- with the panel closed, submitExternal opens it on its session, saves the chat and queues one row that runs in order once the webview is ready
- blank text, no CLI, a full queue and a busy queue each return unavailable with their own note and queue nothing
- the review pane's result line reads 'Sent to the chat; it waits its turn in the outbox.' for queued and 'The chat could not be told: <note>' for unavailable; 'sent' no longer exists
- waitingExternal and drainExternal are gone and a decision queued before the panel or window closes is still in the queue file afterwards

### 1.2 E20261014613abdb3:S005:T002 — Chat disabled when the queue cannot be opened

Put the gating in a small vscode-free function in chat-queue-setup.ts that says, from the queue factory's result, whether the chat is offered and which notice (if any) to show; extension.ts calls it and, when the chat is not offered, does not register insrc.chat.open, does not set insrc.chat.ready, does not register the chat tab serializer and does not give the review host a notifyChat binding. Add the menus.commandPalette entry for insrc.chat.open (when insrc.chat.ready) in package.json. In chat-queue-setup.ts reword the notices so each says the chat is disabled and add a third for any other open failure, chosen by cause (newer plugin, node:sqlite cannot load, anything else), and update the comments that say the chat stays on a direct path. The vscode-free function and the notice text are tested directly (chat-queue-setup.test.ts); the registration of the four pieces is carried by the extension wiring harness (extension-chat-wiring.test.ts) and review-wiring.test.ts (which gains a case where the binding is absent).

**Acceptance checks:**
- when the queue cannot be created none of the chat command, the chat-ready context, the chat tab serializer or the review host's notifyChat is set up (wiring harness), and package.json hides the command from the Command Palette without insrc.chat.ready
- the three notices (node:sqlite cannot load, newer plugin, any other open failure) each say the chat is disabled and name the cause, are chosen by cause and are shown once (chat-queue-setup tests)
- with a queue, the chat command, ready context, serializer and notifyChat binding are set up exactly as before

### 1.3 E20261014613abdb3:S005:T003 — A waiting message's attachments survive the start-up sweep

Add tests only: the start-up sweep over a keep set made from the store's sessions keeps the attachments directory of a session that holds a waiting queued message and clears an unreferenced old session; and a queued message with an attachment keeps it and sends it when the message runs. Show the sweep test can fail: temporarily build the keep set without the stored session and see the directory removed, then restore it. No production change is planned; if the tests show the keep set does not protect the session, that is reported, not worked around.

**Acceptance checks:**
- the sweep keeps the attachments of a stored session with a waiting message and removes an unreferenced old one, and the same test fails when the stored session is left out of the keep set
- a queued message with an attachment still has it and sends it when it runs

### 1.4 E20261014613abdb3:S005:T004 — Closing: constraints scored, crosswalk, deferred amendments and the live hand check

Score the Epic constraints k1-k5 against the finished change in the BUILD summary; carry the c-id crosswalk (c3 and c12 to read:current-behaviour, c11 to read:queue-surface); list the deferred HLD additions for the Epic-end batch, including that S005 dropped the HLD's cross-repository keep set and session-store keep predicate by owner decision; run the live hand check (send a decision from the review pane while a turn runs and with the chat panel closed; disable the queue and confirm the chat is not offered), or record it as not run with the reason and the labelled fault-injection evidence.

**Acceptance checks:**
- the BUILD summary scores k1-k5, lists the deferred HLD additions and carries the crosswalk
- the hand check is recorded as a reported live test with its evidence, or as not run with the reason and labelled evidence

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| decisionResultLine: 'queued' reads 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none unchanged, no 'sent' | `t1` |
| docs-review-decision: notifyChat's queued and unavailable results reach the pane's result line | `t1` |
| attachment sweep: with the start-up keep set made from the store's sessions, a session that holds a waiting queued message keeps its attachments directory | `t3` |
| existing tests rewritten with the change: chat-queue-setup.test.ts (its 'chat keeps the direct path' title and the notice text), review-wiring.test.ts (the unconditional notifyChat binding regex, plus a case where the binding is absent when there is no queue), docs-review-decision.test.ts (its 'sent' default notifyChat and the old 'no chat is available' and 'will be told when it is free' wording), chat-panel.test.ts (the submitExternal suite) | `t1`, `t2` |
| submitExternal with a running turn: returns 'queued', the row is in the outbox with origin 'review-pane', the running turn and its waiting card are untouched, and the decision runs when the turn ends | `t1` |
| submitExternal with the panel closed: opens the panel on its session, saves a draft chat, queues, and the message runs once the webview is ready | `t1` |
| submitExternal with no CLI, blank text, a full queue and a busy queue: each returns unavailable with its own note and queues nothing | `t1` |
| no waitingExternal list: a message submitted before the panel closes is still in the queue file afterwards (the old test asserted it was dropped) | `t1` |
| extension wiring: when the queue cannot be created the chat command is not registered, setContext insrc.chat.ready is not set, the chat tab serializer is not registered, the review host has no notifyChat, and each of the three notices (sqlite cannot load, newer plugin, any other open failure) says the chat is disabled (text pinned) | `t2` |
| extension wiring: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails: submitExternal, ChatQueueWorker.submit, notifyChat, decisionResultLine`
- **[[c2]]** `prior-artifact` `LLD s5 dataModelChanges: ExternalSubmitResult / ChatHandOver and waitingExternal / drainExternal / dropExternal`
- **[[c3]]** `prior-artifact` `LLD s5 errorPaths and invariantsToPreserve (c3, c12, c11): a decision waits its turn, is recorded before the chat is told, and queue order is strict`
- **[[c4]]** `prior-artifact` `LLD s5 dataModelChanges: chat availability (extension.ts) - the chat is disabled when the queue cannot be opened`
- **[[c5]]** `prior-artifact` `LLD s5 migration steps 3 and 4: the gating, the notices and the tests to rewrite`
- **[[c6]]** `prior-artifact` `LLD s5 edgeCases and acceptanceMapping ac3: a waiting message's attachments survive the start-up sweep`
- **[[c7]]** `prior-artifact` `LLD s5 openQuestions resolutions and the Epic-end HLD amendment batch`
