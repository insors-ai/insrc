<!-- insrc:artifact ISSUE-6fab702a7015853e -->

# End the Claude CLI's stdin after the correlated result so the chat lock is released

## Reproduction

In the VS Code plugin chat on a Claude session, send a message and wait for the reply to finish, then send a second message. Observed: the second message waits in the queue behind the chat lock until the user cancels and resends. Expected: the lock is free as soon as the reply is complete. The session's turn markers show the evidence: every turn run through the correlated stdin path (turn id claude-request-<uuid>) ends with turn-end code 143 (killed by SIGTERM when the next turn takes the lock), while earlier turns run with the prompt on the command line ended with code 0.

## Root cause

The Claude turn is started as `claude -p --input-format=stream-json` with stdin as a pipe and the prompt written to it. The adapter never closes that stdin: SpawnedProcess has only a write method, and after the terminal event the process is 'left to finish'. In stream-json input mode the CLI keeps waiting for more input after its result, so it stays alive and keeps the session's chat lock (released only when the process exits) until the next turn's lock wait sends SIGTERM.

## Fix intent

Once the correlated terminal result for the turn's own request has been seen, end the child's stdin so the CLI exits normally and the lock is released at the end of the turn. The review-mode permission relay must still be able to write to stdin until that point. Cover it with a test that uses the fake spawner.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:549` — "const args = ['-p', '--input-format=stream-json', '--output-format=stream-json', '--replay-user-messages', '--verbose'];"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1494` — "const stdin = opts.closeInput === true ? 'ignore' : 'pipe';"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1245` — "After a terminal event the process is left to finish either way."
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1590` — "write: (data: string) => new Promise<void>((resolve, reject) => {"
- **[[c5]]** `code` `vscode-plugin/src/chat/session-lock.ts`
