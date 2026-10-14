<!-- insrc:artifact TESTS-613abdb351c2c738-s1 -->

# Tests: 613abdb351c2c738 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-14T11:13:11.458Z on commit `f6de7994`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue store: enqueue, head, acknowledge and finish keep seq order, acknowledge a message at most once and only with the lease free, delete a done message, turn a stopped one into failed with a resend, and refuse an enqueue with a note at 500 live rows | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**integration: chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue store: two processes on one database file acknowledging the same head at the same moment: exactly one succeeds and the message is processing once | `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` | 0 | 2 | 0.9 s |  |

## t2

Run at 2026-10-14T11:15:59.550Z on commit `b2e1abe7`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat queue worker: the window whose message is at the front takes the lease, runs it through the runner with onSpawn recording the CLI, heartbeats the lease while it runs, finishes it and releases the lease; another window's message at the front is left alone; a submit in one window is seen by another within one poll; a finish that fails is retried on the next poll before any new message is taken; dispose releases the lease when the turn's CLI has exited and leaves it when it still runs; onChange fires after this window's own submit and after another window's commit | `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` | 0 | 1 | 0.3 s |  |

## t3

Run at 2026-10-14T11:25:37.825Z on commit `5028ef1e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: turn lifecycle: a second start runs after the first ends instead of superseding it, and a start waiting in that chain is dropped by Stop and by detach and never spawns; onSpawn reports the CLI with an exit promise for a live and a followed turn, also after detach**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | turn lifecycle: a second start runs after the first ends instead of superseding it, and a start waiting in that chain is dropped by Stop and by detach and never spawns; onSpawn reports the CLI with an exit promise for a live and a followed turn, also after detach | `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` | 0 | 32 | 1.8 s |  |

## t4

Run at 2026-10-14T11:30:19.422Z on commit `4d70623d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: the queued turn runner shows the message's chat (opening the panel when it is closed), resolves only after a grant re-run continuation ends, resolves stopped when a waiting card gets no answer within the wait, resolves detached-ended only after a detached CLI exits and stopped for a pipe turn, resolves stopped when the turn is dropped before it starts (a chat switch during the session-lease wait), and fails a message whose chat no longer exists | `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` | 0 | 1 | 0.7 s |  |

## t5

Run at 2026-10-14T11:37:04.816Z on commit `6a7a5de3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a message sent while a turn runs waits in the queue, the running turn keeps reporting, and the message runs when the turn ends; a typed message no longer denies the running turn's waiting approval | `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` |

**integration: chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | chat host: a queued message that starts after the previous turn ended tells the webview it is running, so Stop is offered; Stop ends the running turn, its message becomes failed with 'stopped by the user' and a resend even though the stopped CLI reports a terminal error, and the next waiting message runs | `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-routing.test.ts` | 0 | 2 | 1 s |  |

## t6

Run at 2026-10-14T12:04:19.680Z on commit `1cfe1e75`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once | `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-queue-setup.test.ts` | 0 | 1 | 0.3 s |  |
