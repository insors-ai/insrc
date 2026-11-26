/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t5: vibe-adapter.ts's outputMode:'text'
 * and 'json' final-message mapping, needed once the backend's complete()/
 * completeStructuredVibe()/readOnlySessionOnce() dispatch through the adapter.
 *
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-output-modes.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createVibeAdapter } from '../vibe-adapter.js';
import type { VibeAdapterDeps, VibeChildProcess } from '../vibe-adapter.js';

function fakeChild(): { child: VibeChildProcess; stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; emitter: EventEmitter } {
	const emitter = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new PassThrough();
	// A real child's stdio closes very shortly after 'exit' once nothing still
	// holds the pipes open; chain 'close' automatically so tests don't have to
	// emit it themselves and don't pay the adapter's CLOSE_GRACE_MS fallback.
	emitter.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
		queueMicrotask(() => emitter.emit('close', code, signal));
	});
	const child: VibeChildProcess = {
		pid: 4242, stdout, stderr, stdin,
		on(event, listener) { emitter.on(event, listener); },
		once(event, listener) { emitter.once(event, listener); },
		kill() { emitter.emit('exit', null, 'SIGKILL'); },
	};
	return { child, stdout, stderr, stdin, emitter };
}

function realDir(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-modes-'));
}

function tick(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

test("outputMode:'text' takes the raw trimmed stdout as the final text, with sessionId read back from export.json", async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = {
		spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
		readFile: async () => JSON.stringify({ session_id: 'text-mode-session', stop_reason: null, outcome: 'finished' }),
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn({ prompt: 'hi', outputMode: 'text', session: { kind: 'new' }, mode: 'default' });
		const consume = (async () => { for await (const _e of turn) { /* text mode emits no events */ } })();
		await tick();
		stdout.write('Hi there!\n');
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const result = await turn.result;
		assert.equal(result.text, 'Hi there!');
		assert.equal(result.sessionId, 'text-mode-session');
		assert.equal(result.resumeHandle, 'text-mode-session');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("outputMode:'json' parses the printed entry array and takes the LAST assistant message's joined text, with sessionId from the entries", async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = {
		spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined,
		readFile: async () => { throw new Error('no export'); },
	};
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn({ prompt: 'hi', outputMode: 'json', session: { kind: 'new' }, mode: 'default' });
		const consume = (async () => { for await (const _e of turn) { /* json mode emits no events */ } })();
		await tick();
		const entries = [
			{ sessionId: 'json-mode-session', type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] },
			{ sessionId: 'json-mode-session', type: 'reasoning', text: 'thinking' },
			{ sessionId: 'json-mode-session', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
		];
		stdout.write(JSON.stringify(entries));
		stdout.end();
		emitter.emit('exit', 0, null);
		await consume;
		const result = await turn.result;
		assert.equal(result.text, 'Hi there!');
		assert.equal(result.sessionId, 'json-mode-session');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test("outputMode:'json' with no assistant message throws, same as the old vibeLastAssistantText contract", async () => {
	const cwd = realDir();
	const { child, stdout, emitter } = fakeChild();
	const deps: VibeAdapterDeps = { spawn: () => child, mkdtemp: async () => realDir(), rm: async () => undefined, readFile: async () => { throw new Error('no export'); } };
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' }, deps);
		const turn = adapter.startTurn({ prompt: 'hi', outputMode: 'json', session: { kind: 'new' }, mode: 'default' });
		turn.result.catch(() => undefined);
		const consume = (async () => { for await (const _e of turn) { /* drain */ } })();
		await tick();
		stdout.write(JSON.stringify([{ sessionId: 's1', type: 'message', role: 'user', content: [{ type: 'text', text: 'hi' }] }]));
		stdout.end();
		emitter.emit('exit', 0, null);
		await assert.rejects(consume);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
