/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t3: runVibeChatJob re-pointed onto the
 * adapter's runVibeTurn (mechanical, no mapper/event-mapping change). Driven against
 * a scripted fake `vibe` binary -- the real adapter module, no app-server transport.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/vibe-session-process.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runVibeChatJob } from '../vibe-session-process.js';

/** A fake `vibe`: ignores its argv (the real flag surface), reads the prompt from
 *  stdin, and prints ONE headless-streaming journal-entry line matching the real
 *  installed binary's shape (session id + an assistant message), exit 0. */
const FAKE_VIBE = `#!/usr/bin/env node
let stdin = '';
for await (const c of process.stdin) stdin += c;
process.stdout.write(JSON.stringify({
  sessionId: 'fixture-session-1',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'echo: ' + stdin }],
}) + '\\n');
process.exit(0);
`;

function makeFakeVibe(): { readonly dir: string; readonly bin: string } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-'));
	const bin = join(dir, 'vibe');
	writeFileSync(bin, FAKE_VIBE);
	chmodSync(bin, 0o755);
	return { dir, bin };
}

test("runVibeChatJob through the adapter's runVibeTurn — the chat worker's observable behavior is unchanged, same rows to the same line protocol", async () => {
	const { dir, bin } = makeFakeVibe();
	try {
		const lines: string[] = [];
		const signal = new AbortController().signal;
		const exitCode = await runVibeChatJob(
			{
				command: bin,
				request: { provider: 'vibe', cwd: dir, prompt: 'hello there', permissionMode: 'auto' },
				catalog: [],
			},
			signal,
			line => lines.push(line),
			true,
		);
		assert.equal(exitCode, 0);
		const rows = lines.map(l => JSON.parse(l) as Record<string, unknown>);
		// The same line protocol as before the re-point: a thinking marker on session
		// open, the assistant message row (now carrying sessionId), then a result row.
		assert.ok(rows.some(r => r['type'] === 'insrc-vibe-thinking'));
		const messageRow = rows.find(r => r['type'] === 'message' && r['role'] === 'assistant');
		assert.ok(messageRow !== undefined, 'the assistant message row must be emitted');
		assert.deepEqual(messageRow?.['content'], [{ type: 'text', text: 'echo: hello there' }]);
		assert.equal(messageRow?.['sessionId'], 'fixture-session-1');
		const resultRow = rows.find(r => r['type'] === 'insrc-vibe-result');
		assert.deepEqual(resultRow, { type: 'insrc-vibe-result', ok: true, sessionId: 'fixture-session-1' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

/** A fake `vibe` that emits a full turn: a reasoning row, a tool-call-and-result
 *  'effect' row, then the final assistant message -- proving the chat worker's
 *  line protocol carries a correlated tool call + result and a reasoning marker,
 *  not just the assistant text (review finding 4). */
const FAKE_VIBE_WITH_TOOL = `#!/usr/bin/env node
let stdin = '';
for await (const c of process.stdin) stdin += c;
const rows = [
  { sessionId: 'fixture-session-2', type: 'reasoning', text: 'thinking about it' },
  {
    sessionId: 'fixture-session-2', type: 'effect', toolCallId: 'tc-1',
    detail: { toolName: 'bash', input: { command: 'ls' } },
    state: { status: 'completed', outputText: 'file.txt' },
  },
  { sessionId: 'fixture-session-2', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'done' }] },
];
for (const row of rows) process.stdout.write(JSON.stringify(row) + '\\n');
process.exit(0);
`;

function makeFakeVibeWithTool(): { readonly dir: string; readonly bin: string } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-tool-'));
	const bin = join(dir, 'vibe');
	writeFileSync(bin, FAKE_VIBE_WITH_TOOL);
	chmodSync(bin, 0o755);
	return { dir, bin };
}

test('runVibeChatJob bridges a correlated tool call + result and a reasoning marker through the real worker line protocol (review finding 4)', async () => {
	const { dir, bin } = makeFakeVibeWithTool();
	try {
		const lines: string[] = [];
		const signal = new AbortController().signal;
		const exitCode = await runVibeChatJob(
			{ command: bin, request: { provider: 'vibe', cwd: dir, prompt: 'use a tool', permissionMode: 'auto' }, catalog: [] },
			signal,
			line => lines.push(line),
			true,
		);
		assert.equal(exitCode, 0);
		const rows = lines.map(l => JSON.parse(l) as Record<string, unknown>);
		assert.ok(rows.some(r => r['type'] === 'insrc-vibe-thinking'), 'the reasoning row must bridge to a thinking marker');
		const callRow = rows.find(r => Array.isArray(r['content']) && (r['content'] as Array<Record<string, unknown>>).some(c => c['type'] === 'tool_call'));
		assert.ok(callRow !== undefined, 'the tool call must be emitted as one message row');
		const toolCallId = ((callRow?.['content'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>)['id'];
		const resultRow = rows.find(r => Array.isArray(r['content']) && (r['content'] as Array<Record<string, unknown>>).some(c => c['type'] === 'tool_result' && c['tool_call_id'] === toolCallId));
		assert.ok(resultRow !== undefined, 'the correlated tool result must reach the chat, not be discarded at the active-map lookup');
		const resultContent = (resultRow?.['content'] as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
		assert.equal(resultContent['content'], 'file.txt');
		assert.equal(resultContent['is_error'], false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
