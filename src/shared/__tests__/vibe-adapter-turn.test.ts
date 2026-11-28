/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t2: vibe-adapter.ts's turn-execution
 * internals -- live event production, process-group cleanup, exit-evidence readback,
 * and naming. The runVibeTurn/mapVibeTurnOptions job-bridge tests this file once also
 * carried were removed in s3/t11, along with runVibeTurn itself (its only consumer,
 * the app-server-shaped vibe-session-process.ts, is deleted).
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-turn.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createVibeAdapter, fromStreamedName } from '../vibe-adapter.js';
import type { VibeAdapterDeps, VibeChildProcess, VibeTurnRequest } from '../vibe-adapter.js';

function fakeChild(pid: number | undefined = 4242, opts: { readonly autoClose?: boolean } = {}): { child: VibeChildProcess; stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; emitter: EventEmitter } {
	const emitter = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new PassThrough();
	// A real child's stdio closes very shortly after 'exit' once nothing still
	// holds the pipes open; chain 'close' automatically so most tests don't have
	// to emit it themselves and don't pay the adapter's CLOSE_GRACE_MS fallback.
	// A test exercising the exit/close ordering itself passes autoClose:false
	// and emits 'close' at the exact moment it wants to.
	if (opts.autoClose !== false) {
		emitter.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
			queueMicrotask(() => emitter.emit('close', code, signal));
		});
	}
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

test("adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv", async () => {
	const cwd = realDir();
	const { child, stdout, stdin, emitter } = fakeChild();
	const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
	const stdinChunks: string[] = [];
	stdin.on('data', chunk => stdinChunks.push(chunk.toString()));
	const deps: VibeAdapterDeps = {
		spawn: (command, args) => { spawnCalls.push({ command, args }); return child; },
		mkdtemp: async () => realDir(),
		readFile: async () => { throw new Error('no export'); },
		rm: async () => undefined,
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest({ prompt: 'the actual prompt text' }));
		turn.result.catch(() => undefined);
		const consume = (async () => { for await (const _event of turn) { /* drain */ } })();
		await tick();
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;

		assert.equal(spawnCalls.length, 1);
		assert.deepEqual(spawnCalls[0]?.args.slice(0, 2), ['-p', '--output']);
		assert.ok(!spawnCalls[0]?.args.includes('--model'));
		assert.ok(!spawnCalls[0]?.args.includes('--thinking'));
		assert.ok(!spawnCalls[0]?.args.some(a => a.includes('the actual prompt text')), 'the prompt must never appear in argv');
		assert.equal(stdinChunks.join(''), 'the actual prompt text', 'the prompt travels via stdin, not argv');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

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

test('a final stdout chunk delivered after exit but before close is still captured (the exit/close drain race, review finding 2)', async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild(4242, { autoClose: false });
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest({ outputMode: 'text' }));
		const consume = (async () => { for await (const _e of turn) { /* text mode emits no events */ } })();
		await tick();
		// 'exit' fires first (as a real child's does when it terminates before its
		// pipe has finished flushing); the final chunk arrives after, 'close' only
		// once the write has actually landed -- proving the adapter waited for it
		// rather than finalizing the moment 'exit' fired.
		emitter.emit('exit', 0, null);
		await tick();
		stdout.write('the real answer');
		stdout.end();
		await tick();
		emitter.emit('close', 0, null);
		await consume;
		const result = await turn.result;
		assert.equal(result.text, 'the real answer', 'the race must not finalize on an empty/partial buffer');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('streaming mode flushes a final journal row that has no trailing newline (review finding 2)', async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild(4242, { autoClose: false });
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn(baseRequest());
		const events: unknown[] = [];
		const consume = (async () => { for await (const event of turn) events.push(event); })();
		await tick();
		// No trailing \n on this last write -- the row must still be parsed once the stream ends.
		stdout.write(JSON.stringify({ sessionId: 'no-newline-session', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hi' }] }));
		stdout.end();
		await tick();
		emitter.emit('exit', 0, null);
		await tick();
		emitter.emit('close', 0, null);
		await consume;
		const result = await turn.result;
		assert.equal(result.text, 'hi');
		assert.equal(result.sessionId, 'no-newline-session');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("a VibeTurnError's mutating flag is true for every approval EXCEPT 'manual' -- the installed CLI's own default_approval_policy config setting (accept-edits by default) governs an omitted/'default' approval, so only 'manual' (--approval-policy ask, which the CLI denies outright in headless mode) is verified non-mutating (review finding r2-1)", async () => {
	const cwd = realDir();
	try {
		for (const approval of ['auto', 'edit-auto', 'default', undefined] as const) {
			const { child, emitter } = fakeChild();
			const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest({ approval }));
			turn.result.catch(() => undefined);
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			emitter.emit('exit', 1, null);
			await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'VibeTurnError' && (err as { mutating?: boolean }).mutating === true && (err as { dispatchState?: string }).dispatchState === 'possibly-sent', `approval:${String(approval)} must be classified mutating`);
		}
		{
			const { child, emitter } = fakeChild();
			const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest({ approval: 'manual' }));
			turn.result.catch(() => undefined);
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			emitter.emit('exit', 1, null);
			await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'VibeTurnError' && (err as { mutating?: boolean }).mutating === false, "approval:'manual' must be the only non-mutating classification");
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('a request whose signal is already aborted before dispatch spawns nothing and rejects with a real AbortError (review finding 5)', async () => {
	const cwd = realDir();
	const spawnCalls: unknown[] = [];
	const { child } = fakeChild();
	const deps: VibeAdapterDeps = {
		spawn: (...args) => { spawnCalls.push(args); return child; },
		mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); },
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const controller = new AbortController();
		controller.abort();
		const turn = adapter.startTurn(baseRequest({ signal: controller.signal }));
		const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
		await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'AbortError');
		await assert.rejects(turn.result, (err: unknown) => err instanceof Error && err.name === 'AbortError');
		assert.equal(spawnCalls.length, 0, 'an already-aborted request must never spawn a subprocess');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('a mid-flight cancellation (signal fires after dispatch) still rejects with a real AbortError, not a generic VibeTurnError (review finding 5)', async () => {
	const cwd = realDir();
	const { child, emitter } = fakeChild();
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const controller = new AbortController();
		const turn = adapter.startTurn(baseRequest({ signal: controller.signal }));
		turn.result.catch(() => undefined);
		const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
		await tick();
		controller.abort();
		await tick();
		emitter.emit('exit', null, 'SIGKILL');
		await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'AbortError');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('a cancel() or deadline that fires after the leader exits cleanly but during output extraction (export/exit-evidence reads) still rejects, instead of resolving the turn as an ordinary success (review finding r3-2)', async () => {
	const cwd = realDir();
	try {
		{
			// Cancellation during extraction: the fake child exits 0 immediately, but
			// deps.readFile (export.json) only resolves once the test cancels.
			const { child, emitter } = fakeChild();
			let releaseRead!: () => void;
			const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
			const controller = new AbortController();
			const deps: VibeAdapterDeps = {
				spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
				readFile: async () => { await readGate; throw new Error('no export'); },
			};
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest({ outputMode: 'text', signal: controller.signal }));
			turn.result.catch(() => undefined);
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			emitter.emit('exit', 0, null);
			emitter.emit('close', 0, null);
			await tick();
			controller.abort();
			releaseRead();
			await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'AbortError');
			await assert.rejects(turn.result, (err: unknown) => err instanceof Error && err.name === 'AbortError');
		}
		{
			// Deadline expiry during extraction: same shape, but via deadlineMs instead
			// of an external signal.
			const { child, emitter } = fakeChild();
			let releaseRead!: () => void;
			const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
			const deps: VibeAdapterDeps = {
				spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
				readFile: async () => { await readGate; throw new Error('no export'); },
			};
			const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
			const turn = adapter.startTurn(baseRequest({ outputMode: 'text', deadlineMs: 20 }));
			turn.result.catch(() => undefined);
			const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
			await tick();
			emitter.emit('exit', 0, null);
			emitter.emit('close', 0, null);
			await new Promise(resolve => setTimeout(resolve, 40));
			releaseRead();
			await assert.rejects(consume, (err: unknown) => err instanceof Error && err.name === 'VibeTurnError' && /deadline/.test(err.message));
		}
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
