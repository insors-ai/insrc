<!-- insrc:artifact ISSUE-fcfdd50de84fb31a -->

# Decode socket and child-process output as a UTF-8 stream so a character split across two reads is not corrupted

## Reproduction

Send any reply over the daemon socket that is large enough to arrive in more than one read and contains a multi-byte UTF-8 character (an em dash, an accented letter, an emoji) that happens to fall across the boundary between two reads. Observed: the reader decodes each read on its own, so the two halves of that character each become U+FFFD replacement characters ('���' in place of '—'). Expected: the text arrives exactly as sent. Seen in Story s11 t12 of Epic c2ba6fa6: through the MCP forwarder, the analyze step's prompt (about 30 KB) arrived with '���' in place of an em dash; a unit test that writes a reply in two chunks with the split inside an em dash reproduces it on demand (src/mcp/__tests__/forward-step.test.ts, 'forwarder: a multi-byte character split across two socket chunks arrives whole', which fails when the forwarder decodes per chunk). The same holds for child-process output read chunk by chunk (a command whose output contains such a character on a chunk boundary).

## Root cause

Each of these readers appends `chunk.toString()` (or `chunk.toString('utf8')`) for every 'data' event and only then splits the accumulated string into lines. Buffer#toString decodes the chunk in isolation: when a chunk ends inside a multi-byte sequence, the incomplete tail bytes and the continuation bytes at the start of the next chunk are each decoded as invalid sequences and replaced. The socket readers are src/mcp/daemon-stream.ts at three places (runWorkflowStream line 147, unaryRpc line 226, reviewStreamRequest line 438), src/shared/ipc-client.ts line 58 (the request client of the CLI and IDE), and src/daemon/server.ts line 146 (the daemon's reader of incoming request lines, so a large request parameter can be corrupted too). The same per-chunk decode is in child-process output readers: src/daemon/tools/shell-helper.ts (stdout and stderr), src/daemon/tools/builtins/test/index.ts, src/daemon/tools/builtins/shell/exec-detached.ts, src/daemon/tools/builtins/k8s/index.ts, src/daemon/tools/builtins/ssh/index.ts, src/daemon/tools/builtins/cloud/aws/logs.ts, src/docgen/render/fallback.ts, and vscode-plugin/src/chat/cli-adapter.ts (the chat's line reader of the CLI's stdout, which feeds what the user sees). Readers that collect the Buffers and decode once (Buffer.concat(...).toString, e.g. the http and web tools) are not affected.

## Fix intent

Every reader that accumulates a stream's text decodes the stream as one UTF-8 stream, so a character split across reads is carried over and decoded whole, as src/mcp/forward-step.ts now does. Each corrected reader is covered by a test that delivers a multi-byte character split across two chunks and expects it intact. Behaviour is otherwise unchanged: same framing, same line splitting, same size limits (for the readers that cap bytes, the cap still counts bytes).

## Citations

- **[[c1]]** `code` `src/mcp/daemon-stream.ts` — "buffer += chunk.toString();  (lines 147, 226, 438)"
- **[[c2]]** `code` `src/shared/ipc-client.ts` — "buffer += chunk.toString();  (line 58)"
- **[[c3]]** `code` `src/daemon/server.ts` — "buffer += chunk.toString();  (line 146, handleConnection)"
- **[[c4]]** `code` `src/daemon/tools/shell-helper.ts` — "if (stdoutBytes <= maxBytes) { stdout += chunk.toString('utf8'); }"
- **[[c5]]** `code` `vscode-plugin/src/chat/cli-adapter.ts` — "for await (const chunk of stdout) { buf += (chunk as Buffer).toString('utf8'); let nl = buf.indexOf('\n'); ..."
- **[[c6]]** `code` `src/mcp/forward-step.ts` — "socket.setEncoding('utf8'); socket.on('data', (chunk: string) => { buffer += chunk;"
- **[[c7]]** `code` `src/mcp/__tests__/forward-step.test.ts` — "test('forwarder: a multi-byte character split across two socket chunks arrives whole', ..."
- **[[c8]]** `prior-artifact` `docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S011/BUILD.md` — "Story s11 t12: the forwarder decoded each socket chunk on its own, so a multi-byte character split across chunks arrived as replacement characters (seen on the analyze prompt's em dashes)"
- **[[c9]]** `code` `src/daemon/tools/builtins/k8s/index.ts` — "buf += chunk.toString('utf8');"
- **[[c10]]** `code` `src/docgen/render/fallback.ts` — "child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });"
