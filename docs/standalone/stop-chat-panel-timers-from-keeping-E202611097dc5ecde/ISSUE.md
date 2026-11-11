<!-- insrc:artifact ISSUE-7dc5ecde2730fb17 -->

# Stop chat panel timers from keeping the test process alive

## Reproduction

Run `node --import tsx --test --test-reporter=tap vscode-plugin/src/chat/__tests__/chat-panel.test.ts` without `--test-force-exit`.

Observed: on 2026-11-09 the run reported 229 passing tests and no failures, then was still running when a 150 second limit stopped it. An earlier run of the same file stayed alive for about 26 hours at roughly 8% CPU until it was killed, which also blocked the command waiting on it.

Expected: the test process exits on its own soon after the last test finishes.

## Root cause

Each chat panel starts two repeating timers when its channel is wired: the active-chat list refresh in `startActiveTimer` and the detached-session observer in `startObserverTimer`. Both are created with `setInterval` and are cleared only when the panel is disposed. Many tests open a panel without disposing it, so these timers keep the Node event loop alive after the tests finish. A timer log taken during the hang showed 281 active Timeout resources, and every repeating timer it tracked came from these two start sites, with intervals of 60 s, 20 ms and 600 s. The 20 ms intervals, which tests inject through `observerTimerMs`, account for the ongoing CPU use. Comparable timers in this code already call `unref`, so they do not hold the process open; these two do not.

## Fix intent

A chat panel's repeating timers must no longer keep the Node process alive on their own, while still firing on the same schedule for as long as the process runs and still being cleared on dispose. After the change the chat panel test file must exit on its own with every test still passing and no test weakened or removed. Because only timers were logged, the fix must confirm by re-running the file that no other open handle still prevents exit.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts:634` — "activeTimer = setInterval(() => { if (!disposed) postActive(); }, deps.activeListTimerMs ?? 60_000);"
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts:658` — "observerTimer = setInterval(() => { void runObserverPass(); }, deps.observerTimerMs ?? 60_000);"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3665-3679`
- **[[c4]]** `code` `vscode-plugin/src/chat/chat-panel.ts:762` — "watchdog.unref?.();"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:1591` — "stallTimer.unref?.();"
- **[[c6]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1500` — "timer.unref?.();"
- **[[c7]]** `code` `vscode-plugin/src/chat/__tests__/chat-panel.test.ts:6264` — "observerTimerMs: 20,"
