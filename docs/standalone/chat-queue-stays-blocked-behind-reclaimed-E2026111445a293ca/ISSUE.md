<!-- insrc:artifact ISSUE-45a293ca27e48cb3 -->

# Chat queue stays blocked behind a reclaimed turn that the chat shows as idle and cannot stop

## Reproduction

1. In the VS Code dev chat, send a message whose turn keeps the claude CLI running for a long time. Observed 2026-11-14: the agent kept arming background tasks (a placeholder Monitor, then a test sweep that hung), and each task notification continued the same CLI turn.
2. Reload or close the window while that turn runs. The extension host exits, and the claude CLI is left running as an orphan whose parent is pid 1.
3. Open the chat again in the same window.

Observed: the new window reclaims the queue lease and follows the orphaned CLI. The chat shows the session idle and Stop does not end that turn. Every later message in the repository stays queued. Message 983 stayed `processing` from 13:07 to 14:37 UTC and was only released when the CLI (pid 94176) was killed by hand.

Expected: the chat shows that the turn is still running, including while it waits on background tasks; Stop ends it; and a reclaimed turn whose CLI makes no progress does not block the queue indefinitely.

## Root cause

The queue worker treats a lease as held for as long as the turn's CLI process is alive, and nothing else bounds it.

- `holderGone` counts a lease as abandoned only when both the window's process and the CLI are dead.
- On dispose, the worker keeps a lease whose CLI is still running.
- After a reload, `applyLeaseRules` reclaims a same-window lease whose CLI is alive. `followReclaimed` then only refreshes its heartbeat until the CLI exits. It never checks whether the CLI is still producing output, so the takeover timeout never applies.

The reclaim lives only in the queue worker; the chat panel does not use it. The panel's running state and its Stop control (`cancel-turn`) work from the panel's own turn runtime (`rt.turns`, `session.liveTurn`), which a reloaded window has not rebuilt for a CLI it did not spawn. The panel therefore shows idle, and Stop has no process to stop. An orphaned CLI that never ends its turn holds the queue for the whole repository until it is killed outside VS Code.

## Fix intent

- While the window holds or follows a session's turn, including a turn reclaimed after a reload, the chat shows that turn as running, including when the CLI is only waiting on background tasks.
- Stop works on a reclaimed turn. It ends the CLI process that holds the lease and releases the lease, so the next queued message runs.
- A reclaimed turn whose CLI shows no progress for a bounded time no longer holds the queue forever. The user is told, and the queue can move on.
- Turns whose CLI is still making progress after a reload keep today's behaviour: they are followed, not killed.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:315-316` — "const holderGone = (l: RepoLease): boolean => !deps.isAlive(l.pid, l.pidStartedAt) && !cliAlive(l);"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:338-344` — "reclaimed the lease of message ${lease.seq} after a reload: its CLI (pid ${lease.cliPid}) is still running"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:359-371` — "A reclaimed lease runs a turn this window did not start. Keep it fresh while the CLI lives"
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:453-460` — "A turn whose CLI has already exited is finished now; one still running keeps the lease"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-queue-worker.ts:350` — "if (at - lease.heartbeatAt < LEASE_TAKEOVER_MS || !holderGone(lease)) return;"
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3365-3404` — "case 'cancel-turn': ... void rt.turns.stop().then((verified) => { if (verified) clearProgress(); });"
- **[[c7]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3340-3341` — "if (rt !== undefined && (rt.turns.busy() || rt.startingTurns > 0 || rt.queued !== undefined)) postRunning(rt);"
- **[[c8]]** `stakeholder` `user report 2026-11-14` — "chat says idle but messages are getting queued"
