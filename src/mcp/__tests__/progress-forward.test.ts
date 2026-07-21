/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mcpProgressSink, type McpProgressNotification } from '../progress-forward.js';
import type { ProgressEvent, StageProgressEvent, TokenProgressEvent } from '../../shared/types.js';

const stage = (over: Partial<StageProgressEvent> = {}): StageProgressEvent => ({
	kind: 'stage', operation: 'workflow.run', stageId: 'decompose', stageLabel: 'decompose',
	index: 0, total: null, ...over,
});
const token = (over: Partial<TokenProgressEvent> = {}): TokenProgressEvent => ({
	kind: 'token', operation: 'workflow.run', stageId: 'synthesize', tokensDelta: 16, tokensTotal: 16, ...over,
});

test('mcpProgressSink: undefined progressToken → sink sends nothing', () => {
	const sent: McpProgressNotification[] = [];
	const sink = mcpProgressSink(async (n) => { sent.push(n); }, undefined);

	sink(stage());
	sink(token());
	sink(stage({ stageId: 'done', stageLabel: 'done' }));

	assert.equal(sent.length, 0, 'no notifications for an undefined token');
});

test('mcpProgressSink: defined token → monotonic progress + correct token + messages', () => {
	const sent: McpProgressNotification[] = [];
	const sink = mcpProgressSink(async (n) => { sent.push(n); }, 'tok-1');

	const events: ProgressEvent[] = [
		stage({ stageLabel: 'decompose' }),
		token({ tokensDelta: 16, tokensTotal: 16 }),
		stage({ stageId: 'synthesize', stageLabel: 'synthesize', index: 3, total: 5 }),
		token({ tokensDelta: 16, tokensTotal: 32 }),
	];
	for (const ev of events) sink(ev);

	assert.equal(sent.length, 4);

	// progress strictly increasing, token echoed on every notification.
	for (let i = 0; i < sent.length; i += 1) {
		assert.equal(sent[i]!.params.progressToken, 'tok-1');
		assert.equal(sent[i]!.method, 'notifications/progress');
		if (i > 0) {
			assert.ok(sent[i]!.params.progress > sent[i - 1]!.params.progress,
				`progress must strictly increase at #${i}`);
		}
	}

	// messages: stage → "▸ <label>", token → "+<delta> tok (<total>)".
	assert.equal(sent[0]!.params.message, '▸ decompose');
	assert.equal(sent[1]!.params.message, '+16 tok (16)');
	assert.equal(sent[2]!.params.message, '▸ synthesize');
	assert.equal(sent[3]!.params.message, '+16 tok (32)');

	// total: present only for a stage with a known (non-null) total.
	assert.equal(sent[0]!.params.total, undefined);        // stage, total null
	assert.equal(sent[1]!.params.total, undefined);        // token, no total
	assert.equal(sent[2]!.params.total, 5);                // stage, total 5
	assert.equal(sent[3]!.params.total, undefined);        // token, no total
});

test('mcpProgressSink: a rejecting sendNotification does not throw out of the sink', () => {
	const sink = mcpProgressSink(async () => { throw new Error('dead client'); }, 7);
	// Must not throw synchronously nor reject up the stack.
	assert.doesNotThrow(() => {
		sink(stage());
		sink(token());
	});
});
