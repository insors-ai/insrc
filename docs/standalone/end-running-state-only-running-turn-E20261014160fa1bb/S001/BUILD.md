<!-- insrc:artifact BUILD-160fa1bb7a8604ad-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-15T04:44:56.186Z

**Commit:** 0aa8d514

## Scope

Fix ISSUE-160fa1bb7a8604ad: the chat page ends the running state (idle widget, Send button) only on the done or error of the turn it considers running, not on the done that closes an informational line posted by the host (postInfo, persistInfo). Mark the informational done so the page ignores it for the running state; the line still renders; a real turn's done/error and Stop still end it. Files: vscode-plugin/src/chat/chat-panel.ts and protocol.ts. Add a shell test (turn-running, then an informational done keeps it working, then a real done makes it idle) and a host test that the informational done is marked.

## Triage rationale

Small bugfix, one handler in chat-panel.ts (ISSUE-160fa1bb7a8604ad).
