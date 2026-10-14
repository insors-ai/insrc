<!-- insrc:artifact BUILD-613abdb351c2c738-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-10-14T11:13:11.458Z  ·  **Updated:** 2026-10-14T11:30:19.422Z

**Commit:** 4d70623d

## Summary

vscode-plugin/src/chat/chat-panel.ts gains queueRunner (QueuedTurnRunner, HLD sc3) and CONTINUATION_WAIT_MS (with deps.continuationWaitMs for tests); protocol.ts gains the host->webview message 'turn-running' { sessionId } (HostToWebview member and HOST_TO_WEBVIEW_TYPES entry), and the webview script sets its running state on it. run(message, onSpawn): opens the panel if closed (hostOpen, factored from open()) and waits for the webview's 'ready'; if another chat is shown, loads the message's session from the store and shows it (showSession, as opening it from the history does) with an informational note, or resolves failed 'the chat no longer exists'; then sets the queued-run state, posts 'turn-running' and calls runTurn with the message's text and attachments. startTurn counts every turn of the queued message's session (its own and continuations such as the grant re-run and the selection continuation), records onSpawn (reported to the queue as pid/startedAt), the terminal kind and errors, and on each turn's end calls settleQueued, which resolves: stopped when the stop flag is set (cancel-turn sets it before stopping, so it wins over the stopped CLI's terminal error); after a chat switch, panel close or adopt (view lost): detached-ended when the session still has its saved cursor and the CLI's exited promise settles, stopped for a pipe turn or one that never spawned; stopped 'the turn was dropped before it started' when nothing spawned; held while an approval or selection card waits, ended stopped 'no answer to the approval' after continuationWaitMs; failed with the error; else done. Permission and selection decisions re-check the queued run. Test: the named test in chat-queue-runner.test.ts with a spawning fake adapter; ten mutations each failed it. Plugin typecheck clean. Known: three chat-panel tests that pin newest-wins at the host (:138, :5018, :5455 as the HLD lists) fail until t5 routes submits through the queue and updates them.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-store.test.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/__tests__/chat-queue-worker.test.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/__tests__/fixtures/queue-ack-child.mts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/__tests__/turn-lifecycle.test.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/chat-queue-store.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/chat-queue-worker.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
- `vscode-plugin/src/chat/turn-lifecycle.ts` — **insrc-build** (2026-10-14T11:30:19.422Z)
