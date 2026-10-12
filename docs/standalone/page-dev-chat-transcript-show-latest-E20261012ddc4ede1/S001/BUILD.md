<!-- insrc:artifact BUILD-ddc4ede1dbf84626-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-12T07:35:29.855Z  ·  **Updated:** 2026-10-12T07:40:33.173Z

**Commit:** 8fa23116

## Summary

appendEvent now returns the index of the row it wrote; both sinks, the two outcome recorders and the user-row write first and post with rowIndex. A load-older handler answers one transcript-page for the active session and ignores stale or malformed requests. session-restored goes through one helper and carries firstIndex 0 and total; the whole transcript is still sent. One plan check could not be tested as worded: "a turn followed for a session that is not shown still writes its rows" describes a state that cannot occur, because a chat switch or a closed panel aborts the follow at once (turn-lifecycle detach), so no event is delivered for a session that is not shown. The mapped test pins what does hold: a followed row is written before it is posted, the stopped follow posts and writes nothing more (the rest is read again on resume, as before this change), and the write sits outside the shown-session guard in the code.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/PLAN-ddc4ede1dbf84626-S001.json` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/__tests__/protocol.test.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/__tests__/transcript-window.test.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/chat-panel.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/protocol.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
- `vscode-plugin/src/chat/transcript-window.ts` — **insrc-build** (2026-10-12T07:40:33.173Z)
