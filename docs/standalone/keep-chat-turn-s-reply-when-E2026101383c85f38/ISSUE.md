<!-- insrc:artifact ISSUE-83c85f38afad7843 -->

# Keep a chat turn's reply when the CLI answers a queued item first

## Reproduction

In the VS Code dev chat with the claude provider:
1. In one turn, have the assistant start a background task (a background shell command) that is still running when the turn ends.
2. Send the next message.

Observed: the chat shows the user's message, then marks the turn done within seconds, with no assistant text, no tool rows and no final reply. The work did happen: the CLI's own transcript holds the full reply. Seen on turn claude-1791914993551-13 on 2026-10-13. Its raw output stream (~/.insrc/chat-output/mv2ob2c2-nnzxi7.ndjson) has two result lines: first an empty one (0 turns, 34 ms, no text) for the leftover notice about the stopped background task, then the real one carrying the 1,807-character reply. The chat's record (~/.insrc/chat-sessions/mv2ob2c2-nnzxi7.rows.ndjson) holds only the user's message and a 'done' marker five seconds later. Across the chat sessions on this machine since 2026-10-02, 18 turns look like this; in 17 the CLI transcript has the full reply, and in 13 a leftover background-task notice was queued just before the user's message. A resumed interrupted turn, for which the CLI first writes a placeholder 'No response requested.' reply, produces the same extra result.

Expected: the chat shows every assistant message, tool row and the final reply of the user's turn; a result for something answered before the user's message does not end the turn.

## Root cause

The chat runs each message as `claude -p --resume <id> --output-format=stream-json --verbose` (vscode-plugin/src/chat/cli-adapter.ts:520-521). The claude mapper turns every `result` line into a `done` event (cli-adapter.ts:655-656). The live turn loop in makeStreamAdapter ends the turn at the first terminal event: it hands the rest of the output to drain (cli-adapter.ts:813-819), which reads and discards it, and returns, so nothing after the first result reaches the chat (cli-adapter.ts:939-949). The loop that reattaches to a running turn after a reload does the same (cli-adapter.ts:1071-1072). The claude CLI answers each queued item with its own result line. When something is queued ahead of the user's message (a leftover background-task notice, or a resumed interrupted turn), its result comes first, and the chat takes it for the end of the user's turn. The codex mapper also treats a result line as terminal (cli-adapter.ts:780); whether codex can emit more than one per run has not been checked.

## Fix intent

A turn in the chat ends at the result of the user's own message, or when the CLI process exits, and not at a result the CLI produced for something queued ahead of that message. Every assistant message, tool row and the final reply of the user's turn reach the chat and its record, on a live turn and on a turn reattached after a reload. The existing guarantee that the chat never blocks on a CLI that keeps running after it has answered is kept. The codex provider is checked for the same flaw and fixed alike if it has it.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:655` — "if (type === 'result') {"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:945` — "void drain(stdout);"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:813`
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1072` — "if (ev.kind === 'done' || ev.kind === 'error') return;"
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:520` — "const args = ['-p', '--output-format=stream-json', '--verbose'];"
- **[[c6]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:780` — "if (type === 'turn.completed' || type === 'thread.completed' || type === 'result') {"
- **[[c7]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:821`
- **[[c8]]** `analyze-bundle` `insrc_analyze_step run on the chat CLI adapter (2026-10-14): result -> done at :655, live loop drains at :945 (drain :813-819), resume stops at :1072, codex terminal at :780`
- **[[c9]]** `step-output` `investigation 2026-10-13: raw stream ~/.insrc/chat-output/mv2ob2c2-nnzxi7.ndjson turn claude-1791914993551-13 has results n=0/34ms/empty then n=7/49351ms/1807 chars; rows file shows user + done only; 18 such turns across ~/.insrc/chat-sessions, 17 with the reply in the CLI transcript, 13 with a queued task-notification before the prompt`
