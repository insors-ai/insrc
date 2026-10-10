<!-- insrc:artifact ISSUE-1d04e56057b3daba -->

# Keep the chat CLI's output when the reader stops, instead of reading it only from the live stdout pipe

## Reproduction

In the VS Code plugin's chat, send a prompt that runs for a long time (for example a build step that waits on a long validation call or a background test run). Observed (session 7188531d, 2026-10-10, 14:25 UTC): the turn's validation result and reply never appeared in the panel; the user asked 'why did I not get any response back?'. Output the CLI produced after the panel stopped reading (after its first done event, after a kill, or across a window reload) is never shown and cannot be recovered from the panel. Expected: everything the CLI writes for a turn is kept until the panel has read it, and the panel can read it again or continue from where it stopped, however long the turn runs.

## Root cause

The CLI's output exists only in the child's stdout pipe. The real spawner in vscode-plugin/src/chat/cli-adapter.ts starts the CLI with stdio ['pipe', 'pipe', 'pipe'] and lines() iterates child.stdout directly, splitting on newlines in memory. The adapter's run() reads from that iterator only while the panel consumes it: it breaks at the first done or error event and its finally kills the child, so anything written afterwards has no reader. Nothing is written anywhere durable, so a reader that stops, a kill or a window reload loses whatever was in flight, and there is no offset to resume from. stderr is likewise kept only in an in-memory buffer.

## Fix intent

Give each CLI turn a durable output channel that outlives the reader. The CLI's output for a turn goes to a persistent place (a temp file, or an IPC channel the extension owns) that the panel reads from, rather than only to the live pipe. The panel can stop and start reading without losing anything: it can re-read a turn's output and continue from the last line it handled, including after a window reload. Partial lines are never shown as complete events. The channel is cleaned up once the turn's process has exited and its output has been read. It works together with the per-session lock (ISSUE-d6a4bc79) so the reader always knows which process's output it is following. Tests cover a long turn, a reader that stops and resumes, and a reload.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "const child = nodeChildSpawn(command, [...args], { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] }); ... async function* lines() { ... for await (const chunk of stdout) {"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "for await (const line of proc.lines()) { if (sawDone || sawError) break; ... } finally { proc.kill(); live.delete(turnId); }"
- **[[c3]]** `code` `vscode-plugin/src/chat/chat-panel.ts` — "runTurn: const iterator = adapter.run(req)[Symbol.asyncIterator](); ... if (disposed || myGen !== generation) break;"
- **[[c4]]** `stakeholder` `session 7188531d transcript, 2026-10-10 14:25 UTC` — "why did I not get any response back?"
- **[[c5]]** `stakeholder` `user, 2026-10-10` — "the CLI output needs to be via a persistent mechanism, long running prompts can cause print output issues. output should be routed via a temp file or an IPC mechanism"
