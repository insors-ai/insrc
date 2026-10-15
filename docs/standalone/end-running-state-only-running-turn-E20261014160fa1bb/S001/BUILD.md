<!-- insrc:artifact BUILD-160fa1bb7a8604ad-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-15T04:44:56.186Z  ·  **Updated:** 2026-10-15T04:52:06.368Z

**Commit:** cdbf3c37

## Scope

Fix ISSUE-160fa1bb7a8604ad: the chat page ends the running state (idle widget, Send button) only on the done or error of the turn it considers running, not on the done that closes an informational line posted by the host (postInfo, persistInfo). Mark the informational done so the page ignores it for the running state; the line still renders; a real turn's done/error and Stop still end it. Files: vscode-plugin/src/chat/chat-panel.ts and protocol.ts. Add a shell test (turn-running, then an informational done keeps it working, then a real done makes it idle) and a host test that the informational done is marked.

## Triage rationale

Small bugfix, one handler in chat-panel.ts.

## Summary

Fix for ISSUE-160fa1bb7a8604ad. The host marks the done that closes an informational line (postInfo and persistInfo in chat-panel.ts) with info: true on the turn-event message (an additive optional field in protocol.ts). The page's turn-event handler now runs setRunning(false) and setIdle() for a done or error only when the message is not marked, so a retry note, sign-in note, queue note or approval note leaves a running turn running; a turn's own done or error and Stop still end it, and the informational lines still render. Tests: chat-shell.test.ts drives turn-running, then a marked informational done (still working, Stop), then the turn's done and error (idle, Send); chat-queue-runner.test.ts checks the retry line closes with a marked done; chat-panel.test.ts's pinned handler regex is updated. Mutation checks: removing the page's !m.info condition fails the shell test; marking the persistInfo done false fails the runner test. The reproduction was first seen with a temporary probe (a turn-running, then a done under another turn id, turned the widget idle and the button to Send), now a permanent test. Tests run file by file: 1355 tests in 92 files, 2 failures (the manifest-catalog tests that were already failing). NOTE: running the whole glob in one go sometimes drops a test file silently (counts varied between 1313 and 1348 on identical runs), so the full-suite number from a single glob run is not reliable. NOT SEEN IN A REAL VS CODE.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-57a2ba4d5f18c356-S001.json` — **insrc-build** (2026-10-15T04:52:06.368Z)
- `docs/standalone/always-show-chat-s-progress-widget-E2026101457a2ba4d/S001/BUILD.md` — **insrc-build** (2026-10-15T04:52:06.368Z)
