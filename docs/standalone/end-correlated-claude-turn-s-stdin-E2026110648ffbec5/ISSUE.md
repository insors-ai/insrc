<!-- insrc:artifact ISSUE-48ffbec56130edb6 -->

# End a correlated Claude turn's stdin when its reader is abandoned, and stop an idle process after its result

## Reproduction

In the VS Code chat with the claude provider, start a turn, then switch to another chat (or reload the panel) while the turn is running, so the first chat is detached. The CLI finishes its answer, but the process stays alive and the session's chat lock stays held, so the next message in that chat is blocked or has to kill the idle process. Expected: the process exits once its answer is written and the lock is released. Seen after the second sync of main into v2, because main's detach abandons the reader that v2's code relied on to close the CLI's input.

## Root cause

A Claude turn is started with a structured user message on stdin and the CLI keeps waiting for more input after its result. The adapter closes that input only inside run()'s read loop when the correlated result arrives. When the reader is abandoned first (the lifecycle's detach stops the iterator and leaves the CLI writing to the session file), run()'s finally leaves a turn that writes to the session file alone, so the input is never closed. The background observer that later finishes the detached turn only reads the file with the recorded pid; it holds no stdin handle, so nothing ends the idle process after the observer has ingested the result.

## Fix intent

When a correlated Claude turn's reader is abandoned before its result, close the CLI's input so the CLI finishes in-flight work and exits. When the background observer has ingested the correlated result of a detached turn, saved its checkpoint, and finds the process still alive after a grace period, stop that idle process. Claude only: codex and vibe start without a stdin and exit by themselves. Two live checks decide the details: what the CLI does on stdin EOF in the middle of a turn, and whether stopping it after its result cuts off background work.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1322` — "if (state.requestUuid !== undefined) proc.endInput?.();"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1376-1380` — "if (!terminal && output === undefined) {"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1841`
- **[[c4]]** `code` `vscode-plugin/src/chat/turn-lifecycle.ts:486` — "finishIterator(it); // stop reading; the CLI keeps writing to the session file"
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:640`
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:895`
- **[[c7]]** `doc` `docs/plans/main-sync-2-conflicts.md`
