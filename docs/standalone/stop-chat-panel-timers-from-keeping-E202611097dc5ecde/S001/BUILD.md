<!-- insrc:artifact BUILD-7dc5ecde2730fb17-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-09T17:57:36.097Z  ·  **Updated:** 2026-11-09T18:15:58.409Z

**Commit:** e46593f65

## Scope

A chat panel's repeating timers must no longer keep the Node process alive on their own, while still firing on the same schedule for as long as the process runs and still being cleared on dispose. After the change the chat panel test file vscode-plugin/src/chat/__tests__/chat-panel.test.ts must exit on its own with every test still passing and no test weakened or removed. Because only timers were logged, the fix must confirm by re-running the file that no other open handle still prevents exit.

## Triage rationale

A defect with one obvious fix in one file: the two panel-lifetime intervals in createChatPanelHost hold the Node event loop open after tests finish. Both are created in chat-panel.ts, started only from wireChannel, and cleared on dispose; the module already calls unref on comparable timers, so no design choice or new contract is involved.

## Summary

Unref'd the chat panel's active-list and observer intervals, and made the eight poll loops in chat-panel.test.ts use an unref'd wait, because abandoned fake-adapter turns were the remaining handle after the first change. Added a regression test. A plain re-run without --test-force-exit exits on its own with code 0 in 12 seconds, 233 of 233 passing; the output is saved in docs/standalone/stop-chat-panel-timers-from-keeping-E202611097dc5ecde/S001/evidence/plain-rerun.txt.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-11-09T18:15:58.409Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-11-09T18:15:58.409Z)
