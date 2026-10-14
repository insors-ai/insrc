<!-- insrc:artifact TESTS-613abdb351c2c738-s2 -->

# Tests: 613abdb351c2c738 s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T12:57:26.478Z on commit `22a97654`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema 2: a fresh queue file is created with the waiting_on column at version 2, and a processing row can be marked waiting | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty, and a newer file is still refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | schema upgrade: a version-1 queue file opens as version 2 with its rows kept and waitingOn empty, and a newer file is still refused | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: markWaiting sets and clears waitingOn on a processing row only**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | markWaiting sets and clears waitingOn on a processing row only | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | resendFrom: a failed or not-delivered message joins the back with its text and attachments under the given window key; any other state is refused | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 6 | 0.9 s |  |

## t2

Run at 2026-10-14T12:59:57.549Z on commit `4a614086`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: worker act: cancel removes a waiting message and is refused once the message has started; dismiss and resend refuse rows in the wrong state; resend takes this window's key; a successful act is seen by onChange at once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker act: cancel removes a waiting message and is refused once the message has started; dismiss and resend refuse rows in the wrong state; resend takes this window's key; a successful act is seen by onChange at once | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**integration: worker onWaiting: the runner's card report sets and clears waitingOn on the running message, and a busy write is retried on the next tick**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker onWaiting: the runner's card report sets and clears waitingOn on the running message, and a busy write is retried on the next tick | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 3 | 0.3 s |  |

## t3

Run at 2026-10-14T13:02:08.162Z on commit `29e9f12f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: outbox projection: with a turn running, the chat's two waiting messages show places 2 and 3, one message from another chat is ahead, and the running chat is named**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outbox projection: with a turn running, the chat's two waiting messages show places 2 and 3, one message from another chat is ahead, and the running chat is named | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |

**unit: outbox projection: processing rows are dropped, failed and not-delivered rows have no place, blockedBy comes from another chat's processing row, attachments are counted and the note is carried**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outbox projection: processing rows are dropped, failed and not-delivered rows have no place, blockedBy comes from another chat's processing row, attachments are counted and the note is carried | `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` |

**unit: protocol: the host-to-webview and webview-to-host type lists include the outbox message and its four actions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | protocol: the host-to-webview and webview-to-host type lists include the outbox message and its four actions | `vscode-plugin/src/chat/__tests__/protocol.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-outbox.test.ts` | 0 | 2 | 0.3 s |  |
| `vscode-plugin/src/chat/__tests__/protocol.test.ts` | 0 | 12 | 0.3 s |  |

## t4

Run at 2026-10-14T13:05:44.767Z on commit `e50dffe3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat's earlier message is counted ahead**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: two messages sent while a turn runs are posted in the outbox with their places, and another chat's earlier message is counted ahead | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: cancelling a waiting message removes it from the queue and the outbox, and it never runs | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat host outbox: resending a failed message queues the same text and attachments at the back under this window's key, and it runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: resending a failed message queues the same text and attachments at the back under this window's key, and it runs | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat host outbox: a refused action is re-posted with its note, a seq of another chat is ignored, and a taken message leaves the outbox**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: a refused action is re-posted with its note, a seq of another chat is ignored, and a taken message leaves the outbox | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**integration: chat host outbox: after the host is rebuilt over the same queue file and its webview is ready, the outbox shows the same messages in the same places**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: after the host is rebuilt over the same queue file and its webview is ready, the outbox shows the same messages in the same places | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 5 | 1.7 s |  |

## t5

Run at 2026-10-14T13:08:37.126Z on commit `fe1d2a5a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat host outbox: while another window's running message waits on an approval, this window's outbox says which chat it waits on, and the line clears once the card is answered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host outbox: while another window's running message waits on an approval, this window's outbox says which chat it waits on, and the line clears once the card is answered | `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-outbox-host.test.ts` | 0 | 6 | 3.8 s |  |

## t6

Run at 2026-10-14T13:11:49.428Z on commit `8425ca74`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat shell: the outbox band and the queue shortcut hint are present only with the queue; an outbox message draws its rows and summary and each action posts its seq; with the queue a submit does not mark the turn running**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat shell: the outbox band and the queue shortcut hint are present only with the queue; an outbox message draws its rows and summary and each action posts its seq; with the queue a submit does not mark the turn running | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 9 | 0.5 s |  |
