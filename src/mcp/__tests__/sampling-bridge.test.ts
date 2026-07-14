/**
 * Unit tests for the sampling bridge -- translation between the
 * framework's `SamplingRequest` / `SamplingResponse` and the MCP
 * SDK's `CreateMessageRequestParamsBase` / `CreateMessageResult`.
 * No SDK server is instantiated; the translators run directly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fromSdkResult, toSdkParams, DEFAULT_MAX_TOKENS } from '../sampling-bridge.js';
import type { SamplingRequest } from '../../agent/providers/mcp-sampling-provider.js';

// ---------------------------------------------------------------------------
// toSdkParams
// ---------------------------------------------------------------------------

test('toSdkParams wraps each SamplingMessage as {type:"text", text}', () => {
	const req: SamplingRequest = {
		messages: [
			{ role: 'user',      content: 'hi' },
			{ role: 'assistant', content: 'hello' },
		],
	};
	const params = toSdkParams(req);
	assert.equal(params.messages.length, 2);
	assert.deepEqual(params.messages[0], {
		role: 'user',
		content: { type: 'text', text: 'hi' },
	});
	assert.deepEqual(params.messages[1], {
		role: 'assistant',
		content: { type: 'text', text: 'hello' },
	});
});

test('toSdkParams defaults maxTokens to DEFAULT_MAX_TOKENS when unset', () => {
	const params = toSdkParams({
		messages: [{ role: 'user', content: 'x' }],
	});
	assert.equal(params.maxTokens, DEFAULT_MAX_TOKENS);
});

test('toSdkParams honours an explicit maxTokens', () => {
	const params = toSdkParams({
		messages:  [{ role: 'user', content: 'x' }],
		maxTokens: 512,
	});
	assert.equal(params.maxTokens, 512);
});

test('toSdkParams forwards systemPrompt + temperature', () => {
	const params = toSdkParams({
		messages:     [{ role: 'user', content: 'x' }],
		systemPrompt: 'be helpful',
		temperature:  0.2,
	});
	assert.equal((params as { systemPrompt?: string }).systemPrompt, 'be helpful');
	assert.equal((params as { temperature?: number }).temperature, 0.2);
});

test('toSdkParams forwards stopSequences when non-empty', () => {
	const params = toSdkParams({
		messages:      [{ role: 'user', content: 'x' }],
		stopSequences: ['stop'],
	});
	assert.deepEqual(
		(params as { stopSequences?: readonly string[] }).stopSequences,
		['stop'],
	);
});

test('toSdkParams wraps modelHints as {name} objects', () => {
	const params = toSdkParams({
		messages: [{ role: 'user', content: 'x' }],
		modelPreferences: { hints: ['claude-haiku'] },
	});
	const prefs = (params as { modelPreferences?: { hints?: readonly { name: string }[] } })
		.modelPreferences;
	assert.deepEqual(prefs?.hints, [{ name: 'claude-haiku' }]);
});

test('toSdkParams passes through the three priority fields when set', () => {
	const params = toSdkParams({
		messages: [{ role: 'user', content: 'x' }],
		modelPreferences: {
			costPriority:         0.9,
			speedPriority:        0.1,
			intelligencePriority: 0.5,
		},
	});
	const prefs = (params as { modelPreferences?: {
		costPriority?: number; speedPriority?: number; intelligencePriority?: number;
	} }).modelPreferences;
	assert.equal(prefs?.costPriority,         0.9);
	assert.equal(prefs?.speedPriority,        0.1);
	assert.equal(prefs?.intelligencePriority, 0.5);
});

// ---------------------------------------------------------------------------
// fromSdkResult
// ---------------------------------------------------------------------------

test('fromSdkResult extracts text content + preserves model/stopReason', () => {
	const res = fromSdkResult({
		role:    'assistant',
		content: { type: 'text', text: 'hello back' },
		model:   'claude-haiku-4-5',
		stopReason: 'endTurn',
	});
	assert.equal(res.content, 'hello back');
	assert.equal(res.role,    'assistant');
	assert.equal(res.model,   'claude-haiku-4-5');
	assert.equal(res.stopReason, 'endTurn');
});

test('fromSdkResult throws when content is not text (image/audio)', () => {
	assert.throws(
		() => fromSdkResult({
			role:    'assistant',
			content: { type: 'image', data: 'xxx', mimeType: 'image/png' } as never,
		}),
		/content was not text/,
	);
});
