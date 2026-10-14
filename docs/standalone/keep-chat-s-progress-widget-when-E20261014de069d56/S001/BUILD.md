<!-- insrc:artifact BUILD-de069d56d76eaacd-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-14T19:17:05.767Z

**Commit:** 56e97c39

## Scope

Keep the chat's progress widget when its panel is rebuilt while a turn is running.

Reproduction: send a chat message that takes a while, so the progress widget shows; while the turn runs, open a document in the review pane in the same editor column as the chat, approve it and return to the chat tab. Expected: the widget is still showing and Stop still works. Observed: the widget is gone and the chat looks idle although the turn continues. (The covering of the chat tab by the review pane is a reading of the code, not yet observed: confirm with a test that a rebuilt page gets no running state.)

Root cause: the chat webview has no retainContextWhenHidden, so VS Code discards its page when another tab covers it and builds a new one; the new page posts 'ready' and the host answers with postInitialState, which sends session-restored (the page then calls setRunning(false) and hideProgress()) and nothing about a running turn. The only message that turns running and the widget on is 'turn-running', posted once by the queue runner when a message starts. A turn this window runs itself is not followed again, so nothing restores it.

Fix intent: after the host answers a webview's 'ready', tell the rebuilt page that a turn is running whenever this window has a turn in progress for the shown chat, so the widget and Stop come back; a window with no running turn still shows the idle chat. Do not change when a turn starts or ends, and leave the queue runner's turn-running behaviour as it is.

Files: vscode-plugin/src/chat/chat-panel.ts (postInitialState, the 'ready' case). Add a test that rebuilds the page (a second 'ready') while a turn runs and expects 'turn-running', and one that expects none when idle.

## Triage rationale

Small bugfix, one module (ISSUE-de069d56d76eaacd, docs/standalone/keep-chat-s-progress-widget-when-E20261014de069d56/ISSUE.md); approved issue is the ledger entry.
