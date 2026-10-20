/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Ollama reviewer session and the read-only tool loop under it (Epic
 * 8315a11f s1, plan tasks t5 + t6). The model side is a scripted provider or a
 * local HTTP server speaking Ollama's streamed chat; tools are the real
 * registry and the real executor.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/ollama-review-session.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { READ_ONLY_TOOL_IDS } from '../../../analyze/context/tool-surface.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { registerLlmAliases } from '../../../daemon/tools/builtins/llm-aliases.js';
import type { ToolDeps, ToolResult } from '../../../daemon/tools/types.js';
import type { LLMMessage, LLMProvider, LLMResponse, ToolCall } from '../../../shared/types.js';
import { runReadOnlyToolLoop } from '../../read-only-tool-loop.js';
import { OllamaProvider } from '../ollama.js';

registerBuiltinTools();
registerLlmAliases();
const ALLOW = new Set(READ_ONLY_TOOL_IDS);

/** A provider that answers each turn from a script and records what it was sent. */
function scripted(turns: readonly LLMResponse[]): { provider: LLMProvider; sent: LLMMessage[][] } {
	const sent: LLMMessage[][] = [];
	let i = 0;
	const provider = {
		complete: async (messages: LLMMessage[]) => {
			sent.push(messages.map(m => ({ ...m })));
			const r = turns[i++];
			if (r === undefined) throw new Error('script ran out');
			return r;
		},
		completeStructured: async () => { throw new Error('not used'); },
	} as unknown as LLMProvider;
	return { provider, sent };
}

const call = (id: string, name: string, input: unknown): ToolCall => ({ id, name, input } as ToolCall);
const toolTurn = (...calls: ToolCall[]): LLMResponse => ({ text: '', toolCalls: calls, stopReason: 'tool_use' });
const DONE: LLMResponse = { text: 'done', stopReason: 'end_turn' };

function deps(repoPath: string): ToolDeps {
	return { sessionId: 'test', repoPath, send: () => {}, requestId: 0 } as unknown as ToolDeps;
}

/** The tool_result blocks of the last user turn the loop built. */
function results(messages: readonly LLMMessage[]): Array<{ content: string; isError: boolean }> {
	const last = messages.at(-1);
	assert.ok(last !== undefined && last.role === 'user' && Array.isArray(last.content));
	return (last.content as Array<{ type: string; content: string; isError: boolean }>).filter(b => b.type === 'tool_result');
}

test('a returned file_write or Write call, or any tool outside the read-only allowlist, is refused before dispatch and never executed', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-allowlist-'));
	try {
		// Through the real executor: nothing outside the list runs, so nothing is written.
		const targets = { canonical: join(dir, 'a.txt'), alias: join(dir, 'b.txt'), shell: join(dir, 'c.txt') };
		{
			const { provider } = scripted([
				toolTurn(
					call('1', 'file_write', { path: targets.canonical, content: 'x' }),
					call('2', 'Write', { file_path: targets.alias, path: targets.alias, content: 'x' }),
					call('3', 'shell_exec', { command: `touch ${targets.shell}` }),
					call('4', 'Bash', { command: `touch ${targets.shell}` }),
				),
				DONE,
			]);
			const r = await runReadOnlyToolLoop({ provider, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(dir), maxTurns: 4 });
			assert.equal(r.done, true);
			for (const p of Object.values(targets)) assert.equal(existsSync(p), false, `${p} was not written`);
			// The model is told, as a tool error, for each call.
			const toolResults = results(r.messages.slice(0, -1));
			assert.equal(toolResults.length, 4);
			for (const b of toolResults) {
				assert.equal(b.isError, true);
				assert.ok(b.content.includes('is not available in this session'), b.content);
			}
		}
		// Through the dispatch seam: exactly the allowed calls reach it, an alias of an
		// allowed tool (Read -> file_read) included.
		{
			const executed: string[] = [];
			const execute = async (name: string): Promise<ToolResult> => {
				executed.push(name);
				return { output: 'ok', format: 'text', success: true };
			};
			const { provider } = scripted([
				toolTurn(
					call('1', 'Read', { path: 'x' }),
					call('2', 'file_write', { path: 'y', content: 'x' }),
					call('3', 'Write', { path: 'y', content: 'x' }),
					call('4', 'file_read', { path: 'x' }),
					call('5', 'git_commit', { message: 'x' }),
				),
				DONE,
			]);
			const r = await runReadOnlyToolLoop({ provider, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(dir), maxTurns: 4, execute });
			assert.equal(r.done, true);
			assert.deepEqual(executed, ['Read', 'file_read']);
		}
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cancelling an Ollama reviewer session mid tool loop aborts the in-flight turn and starts no further turn', async () => {
	// Ollama's streamed chat: turn 1 asks for a tool, turn 2 starts answering and never finishes.
	let requests = 0;
	const server = createServer((req, res) => {
		requests++;
		req.resume();
		res.writeHead(200, { 'content-type': 'application/x-ndjson' });
		if (requests === 1) {
			res.end(JSON.stringify({
				message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'file_read', arguments: { path: 'x' } } }] },
				done: true, done_reason: 'stop',
			}) + '\n');
			return;
		}
		res.write(JSON.stringify({ message: { role: 'assistant', content: 'thinking' }, done: false }) + '\n');
		// never ends
	});
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
	const provider = new OllamaProvider('test-model', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	try {
		// Abort while turn 2 is in flight.
		{
			const executed: string[] = [];
			const ac = new AbortController();
			const loop = runReadOnlyToolLoop({
				provider, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(tmpdir()), maxTurns: 5, signal: ac.signal,
				execute: async (name) => { executed.push(name); return { output: 'ok', format: 'text', success: true }; },
			}).then(() => null, (e: unknown) => e);
			const until = Date.now() + 5_000;
			while (requests < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
			assert.equal(requests, 2, 'turn 2 started');
			const t0 = Date.now();
			ac.abort();
			// Bounded: a turn the abort does not reach would otherwise hang the test.
			const err = await Promise.race([loop, new Promise(r => setTimeout(() => r(new Error('still running 5 s after the abort')), 5_000))]);
			assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
			assert.ok(Date.now() - t0 < 2_000, 'the turn in flight ended promptly');
			assert.deepEqual(executed, ['file_read'], 'turn 1\'s tool ran');
			await new Promise(r => setTimeout(r, 200));
			assert.equal(requests, 2, 'no further turn started');
		}
		// Abort while a tool runs: the next tool of that turn and the next turn never start.
		{
			const executed: string[] = [];
			const ac = new AbortController();
			const { provider: p, sent } = scripted([toolTurn(call('1', 'file_read', { path: 'x' }), call('2', 'file_stat', { path: 'x' })), DONE]);
			const err = await runReadOnlyToolLoop({
				provider: p, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(tmpdir()), maxTurns: 5, signal: ac.signal,
				execute: async (name) => { executed.push(name); ac.abort(); return { output: 'ok', format: 'text', success: true }; },
			}).then(() => null, (e: unknown) => e);
			assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
			assert.deepEqual(executed, ['file_read']);
			assert.equal(sent.length, 1, 'no further turn started');
		}
		// Abort during a turn's last tool: the next turn never starts.
		{
			const ac = new AbortController();
			const { provider: p, sent } = scripted([toolTurn(call('1', 'file_read', { path: 'x' })), DONE]);
			const err = await runReadOnlyToolLoop({
				provider: p, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(tmpdir()), maxTurns: 5, signal: ac.signal,
				execute: async () => { ac.abort(); return { output: 'ok', format: 'text', success: true }; },
			}).then(() => null, (e: unknown) => e);
			assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
			assert.equal(sent.length, 1, 'no further turn started');
		}
	} finally {
		server.closeAllConnections();
		await new Promise<void>(r => server.close(() => r()));
	}
});
