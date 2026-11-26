/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t2: vibe-adapter.ts's turn-execution
 * internals -- live event production, process-group cleanup, exit-evidence readback,
 * naming, and runVibeTurn's total parameter mapping.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-turn.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createVibeAdapter, fromStreamedName, mapVibeTurnOptions,
} from '../vibe-adapter.js';
import type { VibeAdapterDeps, VibeChildProcess, VibeTurnRequest, VibeTurnOptions } from '../vibe-adapter.js';

function fakeChild(pid: number | undefined = 4242): { child: VibeChildProcess; stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; emitter: EventEmitter } {
	const emitter = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new PassThrough();
	const child: VibeChildProcess = {
		pid,
		stdout,
		stderr,
		stdin,
		on(event, listener) { emitter.on(event, listener); },
		once(event, listener) { emitter.once(event, listener); },
		kill() { emitter.emit('exit', null, 'SIGKILL'); },
	};
	return { child, stdout, stderr, stdin, emitter };
}

function realDir(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-turn-'));
}

/** runTurn reaches its spawn + event-listener registration only after an `await
 *  deps.mkdtemp()` hop; a test must let that settle before emitting on the fake
 *  child's streams/emitter, or the emission is lost before anything is listening. */
function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

function baseRequest(overrides: Partial<VibeTurnRequest> = {}): VibeTurnRequest {
	return {
		prompt: 'hello',
		outputMode: 'streaming',
		session: { kind: 'new' },
		mode: 'default',
		...overrides,
	};
}

test("a 'session' event opens every turn carrying the native session id and, for a new session, the resume handle", async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const killed: number[] = [];
	const deps: VibeAdapterDeps = {
		spawn: () => child,
		killProcessGroup: pid => killed.push(pid),
		mkdtemp: async () => realDir(),
		readFile: async () => { throw new Error('no export.json'); },
		rm: async () => undefined,
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
			await tick();
		stdout.write(JSON.stringify({ sessionId: 'sess-123', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hi' }] }) + '\n');
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const result = await turn.result;
		assert.deepEqual(events[0], { kind: 'session', sessionId: 'sess-123', resumeHandle: 'sess-123' });
		assert.equal(result.sessionId, 'sess-123');
		assert.equal(result.resumeHandle, 'sess-123');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("a 'session' event for a RESUMED session carries the caller's own resumeHandle, not a new one", async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = {
		spawn: () => child,
		mkdtemp: async () => realDir(),
		readFile: async () => { throw new Error('no export.json'); },
		rm: async () => undefined,
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'supervisor-owned' }, deps);
		const turn = adapter.startTurn(baseRequest({ session: { kind: 'resume', resumeHandle: 'prior-session' } }));
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
			await tick();
		stdout.write(JSON.stringify({ sessionId: 'prior-session', type: 'reasoning', text: 'thinking' }) + '\n');
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		assert.deepEqual(events[0], { kind: 'session', sessionId: 'prior-session' });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('every exit path removes the turn\'s temporary files; adapter-owned mode additionally sweeps the child group on every exit path', async () => {
	const cwd = realDir();
	const removed: string[] = [];
	const killed: number[] = [];
	async function runOnce(exitCode: number | null, spawnErrors = false): Promise<void> {
		const { child, stdout, emitter } = fakeChild();
		const deps: VibeAdapterDeps = {
			spawn: () => child,
			killProcessGroup: pid => killed.push(pid),
			mkdtemp: async () => realDir(),
			readFile: async () => { throw new Error('no export'); },
			rm: async (p) => { removed.push(p); },
		};
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		turn.result.catch(() => undefined);
		const consume = (async () => { for await (const _event of turn) { /* drain */ } })();
		await tick();
		if (spawnErrors) emitter.emit('error', new Error('ENOENT'));
		else { stdout.end(); emitter.emit('exit', exitCode, exitCode === null ? 'SIGKILL' : null); }
		if (exitCode === 0 && !spawnErrors) await consume;
		else await assert.rejects(consume);
	}
	try {
		await runOnce(0); // success exit path
		await runOnce(1); // non-zero exit path
		await runOnce(null); // abort/deadline-style signal-killed exit path
		await runOnce(0, true); // spawn failure path (exitCode unused)
		assert.equal(removed.length, 4, 'temp dir removed on every exit path, including spawn failure');
		// killed fires for the three paths that actually spawned a child (not the spawn-failure path)
		assert.ok(killed.length >= 3);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('exit evidence is read back from export.json; a missing/malformed export.json yields undefined evidence rather than a fabricated value', async () => {
	const cwd = realDir();
	try {
		{
			const { child, stdout, emitter } = fakeChild();
			const deps: VibeAdapterDeps = {
				spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
				readFile: async () => JSON.stringify({ stop_reason: 'done', outcome: 'finished', config: { active_model: 'mistral-medium-latest' } }),
			};
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest());
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			stdout.end();
			emitter.emit('exit', 0, null);
			await consume;
			const result = await turn.result;
			assert.deepEqual(result.exitEvidence, { stopReason: 'done', outcome: 'finished', effectiveSelection: { model: 'mistral-medium-latest', thinking: undefined } });
		}
		{
			const { child, stdout, emitter } = fakeChild();
			const deps: VibeAdapterDeps = {
				spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
				readFile: async () => { throw new Error('ENOENT'); },
			};
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest());
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			stdout.end();
			emitter.emit('exit', 0, null);
			await consume;
			const result = await turn.result;
			assert.equal(result.exitEvidence, undefined);
		}
		{
			const { child, stdout, emitter } = fakeChild();
			const deps: VibeAdapterDeps = {
				spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
				readFile: async () => 'not json {{{',
			};
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest());
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			stdout.end();
			emitter.emit('exit', 0, null);
			await consume;
			const result = await turn.result;
			assert.equal(result.exitEvidence, undefined);
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('VibeMcpNaming.fromStreamedName returns undefined for a name matching no insrc MCP tool, never a guess', () => {
	assert.deepEqual(fromStreamedName('mcp_insrc.insrc_analyze'), { server: 'insrc', tool: 'insrc_analyze', streamedName: 'mcp_insrc.insrc_analyze' });
	assert.deepEqual(fromStreamedName('mcp_insrc.insrc_present'), { server: 'insrc', tool: 'insrc_present', streamedName: 'mcp_insrc.insrc_present' });
	assert.equal(fromStreamedName('read_file'), undefined);
	assert.equal(fromStreamedName('grep'), undefined);
	assert.equal(fromStreamedName('mcp_other.some_tool'), undefined);
	assert.equal(fromStreamedName('mcp_insrc'), undefined);
	assert.equal(fromStreamedName('mcp_insrc.'), undefined);
	assert.equal(fromStreamedName(''), undefined);
});

test('a streaming tool-result with outputText/output/error/reason normalizes to the existing chat precedence, never an empty payload', async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = {
		spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
		readFile: async () => { throw new Error('no export'); },
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
			await tick();
		const row = (state: Record<string, unknown>) => JSON.stringify({
			sessionId: 's1', type: 'effect', toolCallId: 'tc1', detail: { toolName: 'bash', input: { command: 'ls' } }, state: { status: 'completed', ...state },
		}) + '\n';
		stdout.write(row({ outputText: 'from outputText' }));
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const toolResult = events.find((e): e is { kind: string; output: string } => (e as { kind?: string }).kind === 'tool-result');
		assert.equal(toolResult?.output, 'from outputText');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('tool-result precedence: output used when outputText is absent', async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
			await tick();
		stdout.write(JSON.stringify({ sessionId: 's1', type: 'effect', toolCallId: 'tc1', detail: { toolName: 'bash', input: {} }, state: { status: 'completed', output: 'from output' } }) + '\n');
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const toolResult = events.find((e): e is { kind: string; output: string } => (e as { kind?: string }).kind === 'tool-result');
		assert.equal(toolResult?.output, 'from output');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('tool-result precedence: an error-only, failed result falls back to the error message', async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
			await tick();
		stdout.write(JSON.stringify({ sessionId: 's1', type: 'effect', toolCallId: 'tc1', detail: { toolName: 'bash', input: {} }, state: { status: 'failed', error: { message: 'boom' } } }) + '\n');
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const toolResult = events.find((e): e is { kind: string; output: string; ok: boolean } => (e as { kind?: string }).kind === 'tool-result');
		assert.equal(toolResult?.output, 'boom');
		assert.equal(toolResult?.ok, false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('the adapter recognizes the tool\'s selection-failure wording and raises VibeSelectionError before any model call, not retried by withTransientRetry', async () => {
	const cwd = realDir();
	const { child, stderr, emitter } = fakeChild();
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest({ session: { kind: 'new', model: '__no_such_alias__' } }));
		const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
		stderr.write('Error: Unknown model: __no_such_alias__. Available: mistral-large-4-0, mistral-medium-latest\n');
		stderr.end();
		emitter.emit('exit', 1, null);
		await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'VibeSelectionError' && /Unknown model/.test(err.message));
		await assert.rejects(turn.result);

		const { isTransientCliError } = await import('../../agent/providers/cli-provider.js');
		assert.equal(isTransientCliError('Error: Unknown model: __no_such_alias__. Available: mistral-large-4-0'), false);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("runVibeTurn's parameter mapping from VibeTurnOptions is total: every field the plugin's existing options object carries maps onto the adapter's context+request with no silently dropped option", () => {
	const controller = new AbortController();

	const newSession: VibeTurnOptions = {
		command: 'vibe',
		cwd: '/repo',
		env: { FOO: 'bar' },
		timeoutMs: 60_000,
		signal: controller.signal,
		agentConfig: { cwd: '/repo', headless: true, workspaceRoots: ['/tmp/a', '/tmp/b'], agent: 'ask' },
		model: 'mistral-medium-latest',
		effort: 'high',
		catalog: [{ id: 'mistral-medium-latest', efforts: ['high'] }],
		inheritProcessGroup: true,
		prompt: 'do the thing',
	};
	const mappedNew = mapVibeTurnOptions(newSession);
	assert.equal(mappedNew.command, 'vibe');
	assert.deepEqual(mappedNew.context, { cwd: '/repo', env: { FOO: 'bar' }, processGroup: 'supervisor-owned' });
	assert.deepEqual(mappedNew.request, {
		prompt: 'do the thing',
		outputMode: 'streaming',
		session: { kind: 'new', model: 'mistral-medium-latest', thinking: 'high' },
		mode: 'default',
		approval: 'manual',
		readDirs: ['/tmp/a', '/tmp/b'],
		signal: controller.signal,
		deadlineMs: 60_000,
	});

	const resumed: VibeTurnOptions = {
		command: 'vibe',
		timeoutMs: 30_000,
		agentConfig: { autoApprove: true },
		nativeSessionId: 'prior-session',
		catalog: [],
		prompt: 'continue',
	};
	const mappedResumed = mapVibeTurnOptions(resumed);
	assert.equal(mappedResumed.context.processGroup, 'adapter-owned');
	assert.deepEqual(mappedResumed.request.session, { kind: 'resume', resumeHandle: 'prior-session' });
	assert.equal(mappedResumed.request.approval, 'auto');
	assert.equal(mappedResumed.request.readDirs, undefined);

	const editAuto: VibeTurnOptions = { command: 'vibe', timeoutMs: 1000, agentConfig: { agent: 'accept-edits' }, catalog: [], prompt: 'x' };
	assert.equal(mapVibeTurnOptions(editAuto).request.approval, 'edit-auto');
	const defaultApproval: VibeTurnOptions = { command: 'vibe', timeoutMs: 1000, agentConfig: {}, catalog: [], prompt: 'x' };
	assert.equal(mapVibeTurnOptions(defaultApproval).request.approval, 'default');
});
