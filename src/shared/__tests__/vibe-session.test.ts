/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openVerifiedVibeSession, VibeSelectionError } from '../vibe-session.js';
import type { VibeSessionOptions } from '../vibe-session.js';

const fixture = String.raw`
const assert = require('node:assert/strict');
const { createInterface } = require('node:readline');
const mode = process.argv[1];
const choices = [
	{ name: 'model-a', alias: 'default-local', thinking: 'low', thinkingLevels: ['low', 'high'] },
	{ name: 'model-b', alias: 'selected-local', thinking: 'low', thinkingLevels: ['low', 'high'] },
];
let activeModel = choices[0];
const config = () => ({ runtime: { config: { activeModel, models: choices } } });
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
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
				activeModel = { ...(mode === 'effort-only' ? choices[0] : choices[1]), thinking: 'high' };
			}
			send(id, { status: 'applied' });
			return;
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
});

test('Vibe preflight releases the child on cancellation and timeout', async () => {
	const controller = new AbortController();
	const canceled = openVerifiedVibeSession(setup('hang', { signal: controller.signal }));
	controller.abort();
	await assert.rejects(canceled, /aborted/);
	await assert.rejects(openVerifiedVibeSession(setup('hang', { timeoutMs: 80 })), /timed out/);
});
