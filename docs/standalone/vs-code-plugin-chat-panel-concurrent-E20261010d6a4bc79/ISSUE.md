<!-- insrc:artifact ISSUE-d6a4bc79bece9d1f -->

# Stop the chat panel from running two CLI processes on the same session at once

## Reproduction

In the VS Code plugin's chat, start a turn that leaves work pending in the CLI (a background test run or a scheduled wake-up), so the CLI process keeps running after its answer. While it is still alive, send another message. Observed (session 7188531d, 2026-10-10): a second `claude -p --resume 7188531d` process starts while the first is still running; the two processes continue as separate branches of one session, each receiving different user messages, both writing the same transcript and both editing and committing in the same working tree (one branch committed the other's uncommitted work). Expected: at most one CLI process works on a chat session at any time; a new message waits for the running process to finish, and the running process is only stopped if it does not finish within a set time.

## Root cause

The panel's single-in-flight rule only covers the turn it is currently reading, and it does not wait for the old process to end. runTurn in vscode-plugin/src/chat/chat-panel.ts calls cancelActive() and then immediately starts the next CLI process through adapter.run. cancelActive only acts on activeTurnId, which is cleared once a turn's stream reaches its done event, so a CLI process that keeps running after its answer (for pending background tasks or wake-ups) is no longer tracked at all. When a turn is still tracked, cancel() and run()'s finally in vscode-plugin/src/chat/cli-adapter.ts call proc.kill(), which sends SIGTERM to the child and returns without waiting for it to exit. Nothing records which session a live process belongs to, so neither the panel nor another panel or window can tell that the session is already in use before spawning `--resume` again.

## Fix intent

Make each chat session single-occupancy. A lock per chat session is held from the moment a CLI process is started for it until that process has actually exited, not just until its stream finishes. A new message, or any other turn for the session, waits for the lock, and the panel shows that it is waiting. If the lock is not released within a set timeout, the holding process (and anything it started) is stopped, its exit is confirmed, and only then does the new turn start. A user's Stop still ends the running turn at once. The lock's behaviour is covered by tests, including a process that outlives its answer.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "runTurn: // Single-in-flight: supersede any prior turn (kill it + bump generation) ... cancelActive(); ... const iterator = adapter.run(req)"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "cancelActive: const tid = activeTurnId; ... activeTurnId = undefined; (cleared in runTurn's finally once the stream ends)"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "if (sawDone || sawError) break; ... finally { proc.kill(); live.delete(turnId); }  kill: () => { child.kill('SIGTERM'); }"
- **[[c4]]** `stakeholder` `session 7188531d transcript, 2026-10-10 14:25-14:40 UTC` — "Two branches of one session ran concurrently: one received 'why did I not get any response back?' and 'continue' and built ISSUE-7224d0d4; the other received 'test suite not finished?'."
- **[[c5]]** `stakeholder` `user, 2026-10-10` — "a semaphore based locking to stop concurrent requests with a timeout. if timeout exceeded only then kill."
