# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-09-30T10:41:27.663Z

## Scope

In the VS Code dev-chat panel, the session dropdown (#insrc-history select) shows only a bare down-arrow. Add a history/clock glyph to the #insrc-history select so users recognize it selects a chat session/history. Plugin-only presentation change in vscode-plugin/src/chat/chat-panel.ts renderShell (webview CSS).

## Triage rationale

Presentation-only, single file, one obvious approach (CSS background-image icon + padding on the select).
