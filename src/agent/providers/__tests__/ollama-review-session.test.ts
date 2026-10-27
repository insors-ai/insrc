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
import { closeSync, existsSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { READ_ONLY_TOOL_IDS } from '../../../analyze/context/tool-surface.js';
import { registerBuiltinTools } from '../../../daemon/tools/builtins/index.js';
import { registerLlmAliases } from '../../../daemon/tools/builtins/llm-aliases.js';
import { getTool } from '../../../daemon/tools/registry.js';
import type { ToolDeps, ToolResult } from '../../../daemon/tools/types.js';
import type { LLMMessage, LLMProvider, LLMResponse, ToolCall } from '../../../shared/types.js';
import { FILESYSTEM_ARGS, NOT_FILESYSTEM_ARGS, rootedInput, runReadOnlyToolLoop } from '../../read-only-tool-loop.js';
import { ReviewSessionTimeoutError } from '../cli-provider.js';
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

/** A local server speaking Ollama's streamed chat. `answer` gets each request's
 *  body and its number (1-based) and returns the chunks to stream, 'hang' to
 *  start answering and never finish, or 'cut' to end the stream with no final chunk (a transient error). */
async function fakeOllama(answer: (body: OllamaBody, n: number) => object[] | 'hang' | 'cut'): Promise<{ provider: OllamaProvider; bodies: OllamaBody[]; close: () => Promise<void> }> {
	const bodies: OllamaBody[] = [];
	const server = createServer((req, res) => {
		let raw = '';
		req.on('data', (c: Buffer) => { raw += c.toString(); });
		req.on('end', () => {
			const body = JSON.parse(raw) as OllamaBody;
			bodies.push(body);
			res.writeHead(200, { 'content-type': 'application/x-ndjson' });
			const chunks = answer(body, bodies.length);
			if (chunks === 'cut') {
				res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: false }) + '\n');
				return;
			}
			if (chunks === 'hang') {
				res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: false }) + '\n');
				return;
			}
			res.end(chunks.map(c => JSON.stringify(c)).join('\n') + '\n');
		});
	});
	await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
	return {
		provider: new OllamaProvider('test-model', `http://127.0.0.1:${(server.address() as AddressInfo).port}`),
		bodies,
		close: async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); },
	};
}

interface OllamaBody {
	messages: Array<{ role: string; content: string }>;
	tools?: Array<{ function: { name: string } }>;
	format?: unknown;
}

const asksTool = (name: string, args: Record<string, unknown>): object[] =>
	[{ message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] }, done: true, done_reason: 'stop' }];
const says = (text: string): object[] => [{ message: { role: 'assistant', content: text }, done: true, done_reason: 'stop' }];

const ANSWER_SCHEMA = { type: 'object', required: ['answer'], additionalProperties: false, properties: { answer: { type: 'string' } } };

/** Bounded: a call that never ends would otherwise hang the test. */
function within<T>(p: Promise<T>, ms: number): Promise<T | Error> {
	return Promise.race([p, new Promise<Error>(r => setTimeout(() => r(new Error(`still running after ${ms} ms`)), ms))]);
}

test('an Ollama reviewer session reads the repo with read-only tools and returns a schema-checked answer within its deadline', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-ollama-review-'));
	writeFileSync(join(repo, 'notes.txt'), 'the answer is forty-two\n');
	try {
		// Turn 1 reads a repo-relative path, turn 2 stops, then the structured answer.
		{
			const f = await fakeOllama((body, n) => n === 1 ? asksTool('file_read', { path: 'notes.txt' }) : n === 2 ? says('read it') : says('{"answer":"forty-two"}'));
			try {
				const out = await f.provider.runReviewSession<{ answer: string }>('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 10_000 });
				assert.deepEqual(out, { answer: 'forty-two' });
				assert.equal(f.bodies.length, 3);
				// Only read-only tools are offered.
				const offered = (f.bodies[0]!.tools ?? []).map(t => t.function.name);
				assert.ok(offered.length > 0 && offered.every(n => ALLOW.has(n)), 'every offered tool is read-only');
				assert.ok(offered.includes('file_read') && !offered.includes('file_write'));
				// The relative path was read in the repo, not the daemon's cwd.
				const turn2 = JSON.stringify(f.bodies[1]!.messages);
				assert.ok(turn2.includes('the answer is forty-two'), 'the tool read the repo file');
				// The answer was asked for against the schema.
				assert.deepEqual(f.bodies[2]!.format, ANSWER_SCHEMA);
				assert.equal(f.bodies[2]!.tools, undefined);
			} finally { await f.close(); }
		}
		// A range diff in the repo: git_diff's revisions reach git unchanged and git runs in the repo.
		{
			const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
			git('init', '-q');
			git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'one');
			writeFileSync(join(repo, 'changed.txt'), 'a line only the second commit adds\n');
			git('add', 'changed.txt');
			git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'two');
			const f = await fakeOllama((_b, n) => n === 1 ? asksTool('git_diff', { from: 'HEAD~1', to: 'HEAD' }) : n === 2 ? says('seen') : says('{"answer":"ok"}'));
			try {
				await f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 20_000 });
				const turn2 = JSON.stringify(f.bodies[1]!.messages);
				assert.ok(turn2.includes('a line only the second commit adds'), `the range diff was read: ${turn2.slice(-600)}`);
			} finally { await f.close(); }
		}
		// An answer that breaks the schema is rejected: with internalRetry false, one attempt only.
		{
			const f = await fakeOllama((_b, n) => n === 1 ? says('nothing to read') : says('{"answer":42}'));
			try {
				const err = await f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 10_000, internalRetry: false }).then(() => null, (e: unknown) => e);
				assert.ok(err instanceof Error, 'a schema-breaking answer is not returned');
				assert.equal(f.bodies.length, 2, 'one answer attempt');
			} finally { await f.close(); }
		}
		// The deadline: a turn that never finishes ends at the deadline with ReviewSessionTimeoutError.
		{
			const f = await fakeOllama(() => 'hang');
			try {
				const t0 = Date.now();
				const err = await within(f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 400 }).then(() => null, (e: unknown) => e as Error), 5_000);
				assert.ok(err instanceof ReviewSessionTimeoutError, `got ${String(err)}`);
				assert.ok(Date.now() - t0 < 2_000, 'ended at its deadline');
				assert.equal(f.bodies.length, 1, 'never retried');
			} finally { await f.close(); }
		}
		// The deadline holds through a transient-error retry backoff (5 s): the stream is cut mid-answer.
		{
			const f = await fakeOllama(() => 'cut');
			try {
				const t0 = Date.now();
				const err = await within(f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 400 }).then(() => null, (e: unknown) => e as Error), 8_000);
				assert.ok(err instanceof ReviewSessionTimeoutError, `got ${String(err)}`);
				assert.ok(Date.now() - t0 < 2_000, `ended at its deadline, not after the backoff (${Date.now() - t0} ms)`);
				assert.equal(f.bodies.length, 1, 'the retry never went out');
			} finally { await f.close(); }
		}
		// The deadline also holds while a tool runs: file_read on a FIFO blocks until a writer opens it.
		{
			const fifo = join(repo, 'blocked');
			execFileSync('mkfifo', [fifo]);
			const f = await fakeOllama(() => asksTool('file_read', { path: 'blocked' }));
			try {
				const t0 = Date.now();
				const err = await within(f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: repo, deadlineMs: 500 }).then(() => null, (e: unknown) => e as Error), 5_000);
				assert.ok(err instanceof ReviewSessionTimeoutError, `got ${String(err)}`);
				assert.ok(Date.now() - t0 < 2_000, 'ended at its deadline, the tool still blocked');
				assert.equal(f.bodies.length, 1, 'no further turn');
			} finally {
				// Release the blocked read so the test process can exit.
				closeSync(openSync(fifo, 'w'));
				await f.close();
			}
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a tool input is anchored at the session repo: relative paths resolve there and an absent optional root defaults to it', () => {
	// Filesystem arguments: relative resolves at the repo; an absent optional root defaults to it.
	assert.deepEqual(rootedInput('file_read', { path: 'src/a.ts' }, '/repo'), { path: '/repo/src/a.ts' });
	assert.deepEqual(rootedInput('file_read', { path: '/abs/a.ts' }, '/repo'), { path: '/abs/a.ts' });
	assert.deepEqual(rootedInput('file_read', {}, '/repo'), {}, 'a required path is never invented');
	assert.deepEqual(rootedInput('search_grep', { pattern: 'x' }, '/repo'), { pattern: 'x', path: '/repo' });
	assert.deepEqual(rootedInput('search_glob', { pattern: '**/*.ts' }, '/repo'), { pattern: '**/*.ts', cwd: '/repo' });
	assert.deepEqual(rootedInput('code_orm_scan', { orm: 'prisma' }, '/repo'), { orm: 'prisma', repoPath: '/repo' });
	assert.deepEqual(rootedInput('code_class_locate', { className: 'A', repos: ['/r'] }, '/repo'), { className: 'A', repos: ['/r'] }, 'repoPath is exclusive with repos');
	// git: only cwd is anchored; revisions and repo-relative paths pass through as given.
	assert.deepEqual(rootedInput('git_diff', { from: 'HEAD~1', to: 'HEAD' }, '/repo'), { from: 'HEAD~1', to: 'HEAD', cwd: '/repo' });
	assert.deepEqual(rootedInput('git_diff', { paths: ['src/a.ts'] }, '/repo'), { paths: ['src/a.ts'], cwd: '/repo' }, 'no path is added beside paths');
	assert.deepEqual(rootedInput('git_log', { path: 'src' }, '/repo'), { path: 'src', cwd: '/repo' });
	// Not filesystem locations at all.
	assert.deepEqual(rootedInput('db_file_distinct', { connectionId: 'c', column: 'x', path: 'Sheet1' }, '/repo'), { connectionId: 'c', column: 'x', path: 'Sheet1' });
	assert.deepEqual(rootedInput('graph_search', { query: 'x' }, '/repo'), { query: 'x' });
});

test('every read-only tool argument that looks like a path is classified as a filesystem location or not', () => {
	const PATHY = /^(path|paths|file_?path|cwd|dir|directory|root|repoPath|repo)$/i;
	for (const id of READ_ONLY_TOOL_IDS) {
		const props = Object.keys((getTool(id)?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties ?? {});
		for (const key of props.filter(k => PATHY.test(k))) {
			const fs = (FILESYSTEM_ARGS[id] ?? []).some(a => a.key === key);
			const not = (NOT_FILESYSTEM_ARGS[id] ?? []).includes(key);
			assert.ok(fs !== not, `${id}.${key} must be listed in exactly one of FILESYSTEM_ARGS / NOT_FILESYSTEM_ARGS`);
		}
	}
	for (const id of [...Object.keys(FILESYSTEM_ARGS), ...Object.keys(NOT_FILESYSTEM_ARGS)]) {
		assert.ok(READ_ONLY_TOOL_IDS.includes(id), `${id} is a read-only tool`);
	}
});

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
		// Through the Ollama reviewer session: a file_write the model returns writes nothing.
		{
			const target = join(dir, 'session.txt');
			const f = await fakeOllama((_b, n) => n === 1 ? asksTool('file_write', { path: 'session.txt', content: 'x' }) : n === 2 ? says('ok') : says('{"answer":"done"}'));
			try {
				const out = await f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: dir, deadlineMs: 10_000 });
				assert.deepEqual(out, { answer: 'done' });
				assert.equal(existsSync(target), false, 'nothing was written');
				assert.ok(JSON.stringify(f.bodies[1]!.messages).includes('is not available in this session'), 'the model was told');
			} finally { await f.close(); }
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
		// OllamaProvider.complete in its transient-error backoff: an abort ends the wait at once.
		{
			const f = await fakeOllama(() => 'cut');
			try {
				const ac = new AbortController();
				const run = f.provider.complete([{ role: 'user', content: 'x' }], { signal: ac.signal }).then(() => null, (e: unknown) => e as Error);
				const until = Date.now() + 5_000;
				while (f.bodies.length < 1 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
				await new Promise(r => setTimeout(r, 300)); // the cut has happened; the provider is in its backoff
				const t0 = Date.now();
				ac.abort();
				const err = await within(run, 8_000);
				assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
				assert.ok(Date.now() - t0 < 1_000, `the backoff ended with the abort (${Date.now() - t0} ms)`);
				assert.equal(f.bodies.length, 1, 'no retry went out');
			} finally { await f.close(); }
		}
		// Through the reviewer session: the caller's signal is AbortError, not a timeout, and no further turn starts.
		{
			const f = await fakeOllama((_b, n) => n === 1 ? asksTool('file_read', { path: 'x' }) : 'hang');
			try {
				const ac = new AbortController();
				const run = f.provider.runReviewSession('review this', ANSWER_SCHEMA, { cwd: tmpdir(), deadlineMs: 60_000, signal: ac.signal }).then(() => null, (e: unknown) => e as Error);
				const until = Date.now() + 5_000;
				while (f.bodies.length < 2 && Date.now() < until) await new Promise(r => setTimeout(r, 20));
				assert.equal(f.bodies.length, 2, 'turn 2 started');
				const t0 = Date.now();
				ac.abort();
				const err = await within(run, 5_000);
				assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
				assert.ok(Date.now() - t0 < 2_000, 'the turn in flight ended promptly');
				await new Promise(r => setTimeout(r, 200));
				assert.equal(f.bodies.length, 2, 'no further turn started');
			} finally { await f.close(); }
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
		// Abort during a model turn whose provider ignores the signal: the loop still ends at once.
		{
			const ac = new AbortController();
			const deaf = { complete: () => new Promise<LLMResponse>(() => {}), completeStructured: () => new Promise(() => {}) } as unknown as LLMProvider;
			setTimeout(() => ac.abort(), 50);
			const t0 = Date.now();
			const err = await within(runReadOnlyToolLoop({
				provider: deaf, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(tmpdir()), maxTurns: 5, signal: ac.signal,
			}).then(() => null, (e: unknown) => e as Error), 5_000);
			assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
			assert.ok(Date.now() - t0 < 1_000, 'not held by the provider');
		}
		// Abort while a tool that ignores the signal is still running: the loop ends at once.
		{
			const ac = new AbortController();
			const { provider: p, sent } = scripted([toolTurn(call('1', 'file_read', { path: 'x' })), DONE]);
			setTimeout(() => ac.abort(), 50);
			const t0 = Date.now();
			const err = await within(runReadOnlyToolLoop({
				provider: p, messages: [{ role: 'user', content: 'go' }], tools: [], allow: ALLOW, deps: deps(tmpdir()), maxTurns: 5, signal: ac.signal,
				execute: () => new Promise<ToolResult>(() => {}),
			}).then(() => null, (e: unknown) => e as Error), 5_000);
			assert.ok(err instanceof Error && err.name === 'AbortError', `got ${String(err)}`);
			assert.ok(Date.now() - t0 < 1_000, 'not held by the tool');
			assert.equal(sent.length, 1, 'no further turn started');
		}
	} finally {
		server.closeAllConnections();
		await new Promise<void>(r => server.close(() => r()));
	}
});

test('explicit managed profile and unsupported native-hard qualification refusal', async () => {
	const { createReviewBudgetPolicy, admitReviewBudget, ReviewBudgetError } = await import('../../../workflow/review-pipeline/budget.js');
	const { reviewWireSchemaJson } = await import('../review-budget.js');
	const fixture = await fakeOllama(() => [{ message: { role: 'assistant', content: '{"ok":true}' }, done: true }]);
	try {
		const schema = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };
		const profile = fixture.provider.getReviewBudgetProfile('structured');
		assert.equal(profile.qualification, 'managed-estimate');
		assert.equal(profile.inspectionReserveTokens, 0);
		assert.ok(Object.isFrozen(profile));
		const session = fixture.provider.getReviewBudgetProfile('reviewer-session');
		assert.equal(session.inspectionReserveTokens, 24576);
		assert.ok(JSON.parse(session.declaredToolsJson).length > 0);
		assert.throws(() => createReviewBudgetPolicy({ ...profile, qualification: 'hard-native' as never }, 'structured'), e => e instanceof ReviewBudgetError && e.code === 'native-budget-unqualified');
		const policy = createReviewBudgetPolicy(profile, 'structured');
		const messages: LLMMessage[] = [{ role: 'user', content: 'review' }];
		const wireSchemaJson = reviewWireSchemaJson(profile, schema);
		const budget = { policy, admitted: admitReviewBudget(policy, { promptChars: 100, wireSchemaJson, phase: 'planning' }), outputAllowanceTokens: 8192, reviewId: 'review', callId: 'call', stage: 'review', role: 'single', attempt: 1 };
		assert.deepEqual(await fixture.provider.completeStructured(messages, schema, { reviewBudget: budget, internalRetry: false }), { ok: true });
		assert.equal(fixture.bodies.length, 1);
		assert.deepEqual((fixture.bodies[0] as unknown as { format: unknown }).format, schema);
		assert.equal((fixture.bodies[0] as unknown as { options: { num_predict: number } }).options.num_predict, 8192);
		await assert.rejects(() => fixture.provider.completeStructured(messages, schema, { reviewBudget: { ...budget, policy: { ...policy, profile: { ...profile, transportVersion: 'other' } } }, internalRetry: false }), e => e instanceof ReviewBudgetError && e.code === 'budget-profile-mismatch');
		assert.equal(fixture.bodies.length, 1, 'profile mismatch refuses before HTTP');
		await assert.rejects(() => fixture.provider.completeStructured(messages, schema, { reviewBudget: budget, maxTokens: 8193, internalRetry: false }), e => e instanceof ReviewBudgetError && e.code === 'budget-profile-mismatch');
		assert.equal(fixture.bodies.length, 1, 'output cannot exceed the reserved allowance');
	} finally { await fixture.close(); }
});
