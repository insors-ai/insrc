<!-- insrc:artifact CR-613abdb351c2c738-s4 -->

# Code review: 613abdb351c2c738:s4

⚠️ **WARN** — HIGH 0 · MED 4 · LOW 7 · model `claude:opus`

**Changed files:** 14

## adherence — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/chat-panel.ts:2115 | The queue runner's note() hook, which the worker uses for the BUSY_GIVE_UP_MS give-up note, writes through persistInfo. That gives persistInfo a third stored line, the queue-could-not-record note, on top of the retry line and the sign-in line. The LLD restricts persistInfo to exactly those two lines and keeps queue notes live-only via postInfo. |
| LOW | vscode-plugin/src/chat/chat-panel.ts:690 | The stored sign-in line tells the user to run the bare binary ("run `claude`" / "run `codex`") instead of naming the CLI's login command (for example `codex login`). If the CLI can't be found in the error text, the line reads "run `the CLI` in a terminal", which names no command. |

## conventions — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts:284 | The test helper asFailed declares its return type as `{ error: string; acted: boolean; cause?: string }`. The optional `cause` is missing `\| undefined`. Elsewhere in the same suite, optional fields spell it out, e.g. runShell's opts and pasteEvent's `file?: … \| undefined`. |
| LOW | vscode-plugin/src/chat/__tests__/cli-adapter.test.ts:389 | The toolCall test helper casts to `{ tool: string; command?: string; mcp?: unknown }`. The optional `command` is missing `\| undefined`. |
| LOW | vscode-plugin/src/chat/__tests__/cli-adapter.test.ts:450 | The toolResult test helper casts to `{ output: string; command?: string; exitCode?: number }`. The optional `command` and `exitCode` are missing `\| undefined`. |

## coverage — 2 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/chat-queue-worker.ts:1 | The promised live hand check (a real provider failure waits, shows its countdown and runs again; retry-now runs it at once; a failure after an edit stays failed) has no recorded result. The latest commit (af771a88) says 'live hand check not run'. It is not an automated test, so it is reported as not run rather than as a missing test file. |
| LOW | vscode-plugin/src/chat/chat-failure.ts:1 | All 22 promised automated tests exist with their exact titles: chat-failure.test.ts:6/29/42, chat-queue-store.test.ts:528/556/587/612, cli-adapter.test.ts:1533, chat-queue-runner.test.ts:219/289/348/359/388/400/420/440, chat-queue-worker.test.ts:741/825/849/874, chat-outbox.test.ts:72 and chat-shell.test.ts:572. Whether they pass is unknown because no build record was supplied. The graph also shows no test reaching classifyFailure, isRetryableCause, createChatQueueStore, the worker or the panel, but tests that call them by name exist. These empty edges look like gaps in the call graph, not untested code, so no HIGH findings were raised for them. Run the vscode-plugin chat test suite to confirm the tests pass. |

## quality — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | vscode-plugin/src/chat/chat-panel.ts:193 | createChatPanelHost is a ~2000-line closure that reaches about 70 nested helpers. They share mutable state: the diff turn, the approval queue, queued runs, pending attachments and external drains. This story adds more retry and outbox paths to it (outboxAction, postOutbox, settleQueued with classifyFailure, persistInfo). Each new path widens the interleavings that are hard to reason about or test in isolation. Consider pulling the queued-run, outbox and approval-queue state out into their own small modules with explicit interfaces. |
| MED | vscode-plugin/src/chat/chat-panel.ts:1755 | handleMessage dispatches to about 30 helpers. It drives queue settlement (settleQueued, queuedViewLost, runCompletedBatch, drainExternal) and approval-queue teardown (rejectQueuedApprovals, dropQueuedApprovals) from one tangled routine. The order of these calls decides correctness, for example when an approval queue is rejected or dropped relative to settling a queued outcome. That ordering is not enforced anywhere it can be checked separately. |
| MED | vscode-plugin/src/chat/chat-panel.ts:1468 | startTurn coordinates 23 callees in one async routine: diff-turn open, settle and end, approval enqueue, settleQueued, applyTitle, drainExternal and runCompletedBatch. With the new skipUserRow retry path running through it, a failure part-way through could leave the diff turn or the queued run unsettled. This depends on how errors are caught inside a single large function. |
| LOW | vscode-plugin/src/chat/__tests__/chat-queue-runner.test.ts | The test fixture message(sessionId, text) builds a QueuedMessage that overlaps with row(sessionId, state, text, extra) in chat-outbox.test.ts. A shared fixture would keep the two in step when QueuedMessage changes. |

