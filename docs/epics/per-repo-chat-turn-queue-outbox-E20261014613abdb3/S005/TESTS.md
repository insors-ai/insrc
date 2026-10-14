<!-- insrc:artifact TESTS-613abdb351c2c738-s5 -->

# Tests: 613abdb351c2c738 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 11 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T18:51:21.474Z on commit `5bffd27f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat-queue-outbox-host.test.ts: a review-pane decision sent while a turn runs waits in the outbox as origin review-pane, leaves the running turn and its waiting card alone, and runs when the turn ends**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: a review-pane decision sent while a turn runs waits in the outbox as origin review-pane, leaves the running turn and its waiting card alone, and runs when the turn ends | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat-queue-outbox-host.test.ts: submitExternal on a closed panel opens it, saves the chat, queues a review-pane row, and the message runs in order once the webview is ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: submitExternal on a closed panel opens it, saves the chat, queues a review-pane row, and the message runs in order once the webview is ready | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat-queue-outbox-host.test.ts: a decision queued before the panel or window closes is still in the queue file afterwards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: a decision queued before the panel or window closes is still in the queue file afterwards | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat-queue-outbox-host.test.ts: submitExternal with no CLI, blank text, a full queue and a busy queue each returns unavailable with its own note and queues nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: submitExternal with no CLI, blank text, a full queue and a busy queue each returns unavailable with its own note and queues nothing | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**unit: docs-review-decision.test.ts: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none are unchanged, and no 'sent' wording remains**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | docs review host: a queued hand-over shows 'Sent to the chat; it waits its turn in the outbox.', unavailable carries the note, failed and none are unchanged, and no 'sent' wording remains | `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 11 | 3.9 s |  |
| `vscode-plugin/src/chat/__tests__/docs-review-decision.test.ts` | 0 | 14 | 0.9 s |  |

## t2

Run at 2026-10-14T18:54:00.674Z on commit `c8291085`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat-queue-setup.test.ts: when the queue cannot be opened the chat is disabled with a notice chosen by cause (node:sqlite cannot load, newer plugin, any other failure), each saying the chat is disabled, shown once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | when the queue cannot be opened the chat is disabled with a notice chosen by cause (node:sqlite cannot load, newer plugin, any other failure), each saying the chat is disabled, shown once | `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` |

**integration: extension-chat-wiring.test.ts: without a queue the chat command, the chat-ready context, the chat tab serializer and the review host's notifyChat are not set up, and with a queue they are**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: without a queue the chat command, the chat-ready context, the chat tab serializer and the review host's notifyChat are not set up, and with a queue they are | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**unit: review-wiring.test.ts: the review host's notifyChat is bound to the chat host's submitExternal when there is a queue and absent when there is none**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | review wiring: the review host's notifyChat is bound to the chat host's submitExternal when there is a queue and absent when there is none, it is given a readCompanion, and neither host module imports the other | `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` |

**unit: extension-chat-wiring.test.ts: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: package.json lists insrc.chat.open in menus.commandPalette only when insrc.chat.ready | `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/extension-chat-wiring.test.ts` | 0 | 24 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/review-wiring.test.ts` | 0 | 4 | 0.4 s |  |

## t3

Run at 2026-10-14T18:55:05.660Z on commit `7bf3bf1f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: attachment-store.test.ts: the start-up sweep keeps the attachments of a session in the keep set that holds a waiting message and clears an unreferenced old session**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attachment store: the start-up sweep keeps the attachments of a session in the keep set that holds a waiting message and clears an unreferenced old session | `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` |

**integration: chat-queue-outbox-host.test.ts: a queued message with an attachment keeps it and sends it when the message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: a queued message with an attachment keeps it and sends it when the message runs | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/attachment-store.test.ts` | 0 | 6 | 0.4 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 11 | 3.8 s |  |

## t4

Run at 2026-10-14T18:56:34.438Z on commit `b265f65e`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

no test files to run; reported as failed by the builder: hand check: a review-pane decision sent while a turn runs waits in the outbox and runs after it; with the chat panel closed it opens the chat and runs; with the queue unavailable the chat is not offered

**live: hand check: a review-pane decision sent while a turn runs waits in the outbox and runs after it; with the chat panel closed it opens the chat and runs; with the queue unavailable the chat is not offered**

Reported by the builder, not run by the gate: **fail**. Evidence: NOT RUN - needs a person driving the installed plugin; recorded as unverified, not passed. Labelled automated evidence (scripted fake adapter, real store and worker; source-scan for the extension gating): chat-queue-outbox-host.test.ts and extension-chat-wiring.test.ts, described in the BUILD summary.
