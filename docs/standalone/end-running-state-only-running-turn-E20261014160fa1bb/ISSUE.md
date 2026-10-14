<!-- insrc:artifact ISSUE-160fa1bb7a8604ad -->

# End the running state only on the running turn's own done, not on an informational line's

## Reproduction

1. In the VS Code plugin, start a chat turn that takes a while, so the progress widget shows the working state and the send button is the Stop square. 2. While it runs, cause the chat to post an informational line: for example a queued message that was retried (the line 'the turn failed with overloaded; retrying (attempt 1 of 3)'), or a message queued into a chat other than the one shown (the note 'Running your queued message in …'). Expected: the turn is still running, so the widget keeps showing the working state and the button stays Stop. Observed: the widget goes idle and the button turns back into Send, though the turn continues and its output keeps arriving. Reproduced in the page test harness: after a 'turn-running' message, a 'turn-event' of kind done under another turn id ('queue-retry-x') changed the widget from 'progress' to 'progress idle' and the button from Stop to Send.

## Root cause

The page's handler for 'turn-event' calls setRunning(false) and setIdle() for every event of kind done or error, whatever turn it belongs to. The host's postInfo and persistInfo post an informational line as an assistant-delta followed by a done event under the line's own turn id (queue notes, the give-up note, a refusal, the blocked-directory and batch notes, the retry line and the sign-in line). The page does not know which turn is the running one: its 'turn-running' message carries only a session id, so it cannot tell a running turn's done from an informational line's.

## Fix intent

The page ends the running state (the idle widget and the Send button) only on the done or error of the turn it considers running; the done that closes an informational line leaves a running turn running. A turn that ends, or Stop, still ends it as today, and the informational lines still appear.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/chat-panel.ts: the webview script's turn-event handler calls setRunning(false);setIdle() for any done or error event`
- **[[c2]]** `code` `vscode-plugin/src/chat/chat-panel.ts: postInfo and persistInfo post an assistant-delta then a done event under their own turn id; their callers are the queue notes, the give-up note, a refusal, the dir-block and batch notes, the retry line and the sign-in line`
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts: the 'turn-running' message carries only sessionId (protocol.ts), so the page holds no turn id for the running turn`
- **[[c4]]** `step-output` `a temporary probe run in the page test harness (chat-shell.test.ts) in this session, then removed: a turn-running message then a done under another turn id turned the widget idle and the button back to Send. Not kept: the fix adds it as a test`
