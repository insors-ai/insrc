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
