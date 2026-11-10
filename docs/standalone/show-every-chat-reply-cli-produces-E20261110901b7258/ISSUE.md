<!-- insrc:artifact ISSUE-901b72588ec8fcd4 -->

# Show every chat reply the CLI produces and never drop a waiting message

## Reproduction

In the VS Code dev chat with a Claude session, send a message whose work the session runs in the background, such as a long test run or a code review it then waits on.

Observed, chat mui9kpl0 on 2026-11-09: the turn ended in the chat at 16:30 UTC with the message "the full test sweep is running". The CLI kept working and wrote 486 more lines over 3.5 hours: progress updates, three code review rounds, fixes and a final question to the user at 20:04 UTC. None of it appeared in the chat, and the user saw a session that looked hung. The chat's own record of the CLI output (`~/.insrc/chat-output/mui9kpl0-pk3pg0.1.ndjson`) holds every one of those lines. Across the kept records, 17 turns lost text the CLI wrote after the turn's result.

Also observed, chat mvxo88bc on 2026-11-04: a message sent at 18:24 while the previous turn's process was still running never started a turn. The user sent it again at 18:26.

Expected: everything the CLI writes for the chat appears in the chat, and every message the user sends either runs or is shown as not run.

## Root cause

Two parts of the chat discard work.

First, when the result for the user's own message arrives, the chat's stream reader marks the turn done, closes the CLI's input, and reads and discards everything the CLI writes afterwards. A Claude session that has background work keeps running after that point and answers its own task notifications. Those answers are read and thrown away, so the chat never shows them.

Second, a new message has to wait until the session's previous CLI process exits, because the chat allows one process per session. While it waits, a newer message replaces it ("latest message wins"), and the earlier message is dropped without being run. If the previous process is still running after the lock timeout (`insrc.chat.turnLockTimeoutMs`, 10 minutes by default), the waiting turn stops that process, which also ends its background work without telling the user.

A third cause, an empty result from a leftover notification ending the user's turn, was fixed by matching results to the user's request. The kept records show that fix in use from about 2026-11-08.

## Fix intent

Everything the CLI writes for a chat must reach that chat, including what it writes after the result for the user's message, and the chat must show when the session is still working. Every message the user sends must either run or be shown to the user as not run; none may be dropped silently. Work still running in a session must not be stopped without telling the user. The already-working matching of results to the user's request must stay as it is.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1152` — "async function drain(it: AsyncIterator<string>): Promise<void> {"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1343-1355`
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:788-800`
- **[[c4]]** `code` `vscode-plugin/src/chat/session-lock.ts:84` — "export class LockWaitSuperseded extends Error {"
- **[[c5]]** `code` `vscode-plugin/src/chat/session-lock.ts:204` — "waiters.get(sessionId)?.reject(new LockWaitSuperseded(sessionId));"
- **[[c6]]** `code` `vscode-plugin/src/chat/session-lock.ts:223-245`
- **[[c7]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:306-334`
- **[[c8]]** `code` `vscode-plugin/package.json:194` — ""insrc.chat.turnLockTimeoutMs": {"
- **[[c9]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:181`
