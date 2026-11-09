/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { openVerifiedVibeSession, runVerifiedVibeTurn, VibeSelectionError, VibeTurnError } from '../vibe-session.js';
import type { VibeSessionOptions } from '../vibe-session.js';

const fixture = String.raw`
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { createInterface } = require('node:readline');
const mode = process.argv[1];
const choices = [
	{ name: 'model-a', alias: 'default-local', thinking: 'low', thinkingLevels: ['low', 'high'] },
	{ name: 'model-b', alias: 'selected-local', thinking: 'low', thinkingLevels: ['low', 'high'] },
];
let activeModel = choices[0];
const config = () => ({ runtime: { config: { activeModel, models: choices } } });
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const event = (method, params) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
const methods = [];
createInterface({ input: process.stdin }).on('line', line => {
	const { method, id, params } = JSON.parse(line);
	methods.push(method);
	switch (method) {
		case 'initialize':
			if (mode !== 'hang') send(id, {});
			return;
		case 'initialized':
			assert.equal(id, undefined);
			return;
		case 'session/start':
		case 'session/resume':
			assert.deepEqual(methods.slice(0, 2), ['initialize', 'initialized']);
			assert.equal(params.firstTurn, undefined);
			assert.equal(params.agentConfig.headless, true);
			assert.equal(method === 'session/resume', mode === 'resume');
			send(id, { state: { session: { id: params.sessionId ?? 'new-id' } } });
			return;
		case 'runtime/read':
			send(id, config());
			return;
		case 'config/model/write':
			assert.equal(params.sessionOnly, true);
			assert.equal(params.reasoningEffort, 'high');
			if (mode === 'effort-only') assert.equal(params.modelAlias, undefined);
			else assert.equal(params.modelAlias, 'selected-local');
			if (mode === 'reject') {
				send(id, { status: 'applied', failures: ['policy'] });
				return;
			}
			if (mode !== 'mismatch') {
				activeModel = { ...(mode === 'effort-only' ? choices[0] : choices[1]), thinking: mode === 'effort-mismatch' ? 'low' : 'high' };
			}
			send(id, { status: 'applied' });
			return;
		case 'turn/start': {
			assert.equal(methods.filter(value => value === 'turn/start').length, 1);
			assert.deepEqual(params.message, [{ type: 'text', text: 'work once' }]);
			const sessionId = params.sessionId;
			const turn = { id: 'turn-id', sessionId, status: 'in_progress' };
			if (mode === 'lost-ack') {
				process.exit(1);
			}
			send(id, { turn });
			event('turn/started', { sessionId, turn });
			event('history/entryAdded', { sessionId: 'other', turnId: turn.id, entry: { type: 'ignored' } });
			event('history/entryAdded', { sessionId, turnId: 'other', entry: { type: 'ignored' } });
			event('history/entryAdded', { sessionId, turnId: turn.id, entry: { type: 'reasoning', text: 'working' }, pid: process.pid });
			if (mode === 'turn-hang') return;
			event('history/entryAdded', { sessionId, turnId: turn.id, entry: { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'hello' }] } });
			event('history/entryAdded', { sessionId, turnId: turn.id, entry: { type: 'effect', detail: { kind: 'tool_call' } } });
			event('history/entryUpdated', { sessionId, turnId: turn.id, entryId: 'entry-id', patch: [] });
			if (mode === 'accepted-failure') return process.stdout.write('', () => process.exit(1));
			if (mode === 'oversized') return process.stdout.write('x'.repeat(8 * 1024 * 1024 + 1) + '\n');
			event('turn/completed', { sessionId, turn: { ...turn, status: 'completed' } });
			return;
		}
		case 'turn/interrupt': {
			assert.equal(mode, 'turn-hang');
			assert.equal(params.expectedTurnId, 'turn-id');
			const turn = { id: params.expectedTurnId, sessionId: params.sessionId, status: 'interrupted' };
			writeFileSync(process.argv[2], JSON.stringify(turn));
			send(id, { accepted: true });
			event('turn/completed', { sessionId: params.sessionId, turn });
			return;
		}
		default:
			throw new Error('Unexpected request ' + method);
	}
});
`;

const catalog = [
	{ id: 'model-a', efforts: ['low', 'high'] },
	{ id: 'catalog-b', aliases: ['model-b'], efforts: ['low', 'high'] },
	{ id: 'unavailable', efforts: [] },
];

function setup(mode: string, overrides: Partial<VibeSessionOptions> = {}): VibeSessionOptions {
	return {
		command: process.execPath, args: ['-e', fixture, mode], timeoutMs: 4_000,
		agentConfig: { headless: true }, catalog, model: 'catalog-b', effort: 'high',
		...overrides,
	};
}

test('Vibe preflight verifies a new and a resumed session without starting a turn', async () => {
	for (const [mode, nativeSessionId] of [['new', undefined], ['resume', 'saved-id']] as const) {
		const session = await openVerifiedVibeSession(setup(mode, { nativeSessionId }));
		try {
			assert.deepEqual([session.id, session.model, session.effort], [nativeSessionId ?? 'new-id', 'catalog-b', 'high']);
		} finally {
			await session.transport.close();
		}
	}
});

test('Vibe preflight applies effort to the active catalog model when no model is explicit', async () => {
	const session = await openVerifiedVibeSession(setup('effort-only', { model: undefined }));
	try {
		assert.equal(session.model, 'model-a');
		assert.equal(session.effort, 'high');
	} finally {
		await session.transport.close();
	}
});

test('Vibe preflight rejects unavailable aliases, effort, mutation and mismatched read-back', async () => {
	await assert.rejects(openVerifiedVibeSession(setup('new', { model: 'unknown' })), /absent from the catalog/);
	await assert.rejects(openVerifiedVibeSession(setup('new', { model: 'unavailable' })), /no unambiguous local alias/);
	await assert.rejects(openVerifiedVibeSession(setup('new', { effort: 'max' })), /effort is unavailable/);
	await assert.rejects(openVerifiedVibeSession(setup('reject')), /session rejected/);
	await assert.rejects(openVerifiedVibeSession(setup('mismatch')), VibeSelectionError);
	await assert.rejects(openVerifiedVibeSession(setup('effort-mismatch')), error =>
		error instanceof VibeSelectionError && /runtime did not confirm the requested settings/.test(error.message));
});

test('Vibe preflight releases the child on cancellation and timeout', async () => {
	const controller = new AbortController();
	const canceled = openVerifiedVibeSession(setup('hang', { signal: controller.signal }));
	controller.abort();
	await assert.rejects(canceled, /aborted/);
	await assert.rejects(openVerifiedVibeSession(setup('hang', { timeoutMs: 80 })), /timed out/);
});

test('Vibe dispatch sends one verified turn and forwards matching bounded events', async () => {
	const events: string[] = [];
	const result = await runVerifiedVibeTurn({
		...setup('turn'), prompt: 'work once',
		onSession: id => events.push(id),
		onHistory: (method, params) => events.push(method === 'history/entryUpdated' ? method : (params['entry'] as { type: string }).type),
	});
	assert.deepEqual(result, { sessionId: 'new-id', stopReason: undefined });
	assert.deepEqual(events, ['new-id', 'reasoning', 'message', 'effect', 'history/entryUpdated']);
	await assert.rejects(runVerifiedVibeTurn({ ...setup('oversized'), prompt: 'work once' }), error =>
		error instanceof VibeTurnError && error.dispatchState === 'accepted' && /frame limit/.test(error.message));
});

test('Vibe dispatch retains uncertainty across acknowledgement loss and accepted failure', async () => {
	for (const [mode, state] of [['lost-ack', 'possibly-sent'], ['accepted-failure', 'accepted']] as const) {
		await assert.rejects(runVerifiedVibeTurn({ ...setup(mode), prompt: 'work once' }), error =>
			error instanceof VibeTurnError && error.dispatchState === state && error.sessionId === 'new-id');
	}
});

test('Vibe dispatch cancellation preserves partial events and the native session ID', async () => {
	const controller = new AbortController();
	const received: unknown[] = [];
	const dir = await mkdtemp(join(tmpdir(), 'insrc-vibe-turn-'));
	const terminal = join(dir, 'terminal.json');
	let pid: number | undefined;
	try {
		await assert.rejects(runVerifiedVibeTurn({
			...setup('turn-hang', { args: ['-e', fixture, 'turn-hang', terminal], signal: controller.signal }), prompt: 'work once',
			onHistory: (_method, params) => {
				received.push(params['entry']);
				pid = params['pid'] as number;
				controller.abort();
			},
		}), error => error instanceof VibeTurnError && error.dispatchState === 'accepted' && error.sessionId === 'new-id');
		assert.deepEqual(received, [{ type: 'reasoning', text: 'working' }]);
		assert.deepEqual(JSON.parse(await readFile(terminal, 'utf8')), { id: 'turn-id', sessionId: 'new-id', status: 'interrupted' });
		assert.ok(pid);
		assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
