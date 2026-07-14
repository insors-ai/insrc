/**
 * Unit tests for `McpSamplingProvider`. The provider is transport-
 * neutral -- callers inject a `SamplingCallback` in the constructor
 * and we exercise the callback here rather than any real MCP stack.
 *
 * Coverage aims:
 *   - complete() forwards messages + returns the callback's response
 *   - complete() with tools throws (tool-loop callers must stay on Ollama)
 *   - completeStructured() extracts JSON, validates, returns typed value
 *   - completeStructured() retries on validation failure, using retry note
 *   - completeStructured() gives up after maxAttempts
 *   - system messages are lifted onto the top-level systemPrompt field
 *   - stream() throws NOT_IMPLEMENTED
 *   - embed() delegates when embedDelegate is wired; throws otherwise
 *   - extractJsonPayload strips markdown fences
 *   - mapStopReason collapses stopSequence -> end_turn
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	McpSamplingProvider,
	_augmentForSchemaForTest,
	_extractJsonPayloadForTest,
	_mapStopReasonForTest,
	type SamplingCallback,
	type SamplingRequest,
	type SamplingResponse,
} from '../mcp-sampling-provider.js';
import type { StructuredSchema } from '../../../shared/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SIMPLE_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['ok', 'note'],
	properties: {
		ok:   { type: 'boolean' },
		note: { type: 'string' },
	},
};

function makeSampler(responder: (req: SamplingRequest, callCount: number) => SamplingResponse): {
	sampler: SamplingCallback;
	requests: SamplingRequest[];
} {
	const requests: SamplingRequest[] = [];
	let n = 0;
	return {
		requests,
		sampler: async (req) => {
			requests.push(req);
			n += 1;
			return responder(req, n);
		},
	};
}

// ---------------------------------------------------------------------------
// complete()
// ---------------------------------------------------------------------------

test('complete() forwards messages + returns text from the sampler', async () => {
	const { sampler, requests } = makeSampler(() => ({
		role: 'assistant',
		content: 'hello back',
		stopReason: 'endTurn',
		usage: { inputTokens: 12, outputTokens: 3 },
	}));
	const p = new McpSamplingProvider({ sampler });
	const res = await p.complete([
		{ role: 'system', content: 'be helpful' },
		{ role: 'user',   content: 'hi' },
	]);
	assert.equal(res.text, 'hello back');
	assert.equal(res.stopReason, 'end_turn');
	assert.equal(res.usage?.outputTokens, 3);
	assert.equal(requests[0]!.systemPrompt, 'be helpful');
	assert.equal(requests[0]!.messages.length, 1);
	assert.equal(requests[0]!.messages[0]!.role, 'user');
});

test('complete() with tools throws (tool-loop callers must stay on Ollama)', async () => {
	const { sampler } = makeSampler(() => ({ role: 'assistant', content: '' }));
	const p = new McpSamplingProvider({ sampler });
	await assert.rejects(
		() => p.complete(
			[{ role: 'user', content: 'x' }],
			{ tools: [{ id: 't', description: 'x', inputSchema: {} }] as never },
		),
		/tool_use requests are not supported/,
	);
});

test('complete() concatenates multiple system messages into one systemPrompt', async () => {
	const { sampler, requests } = makeSampler(() => ({ role: 'assistant', content: '' }));
	const p = new McpSamplingProvider({ sampler });
	await p.complete([
		{ role: 'system', content: 'A' },
		{ role: 'system', content: 'B' },
		{ role: 'user',   content: 'q' },
	]);
	assert.equal(requests[0]!.systemPrompt, 'A\n\nB');
});

test('complete() forwards modelHints via modelPreferences', async () => {
	const { sampler, requests } = makeSampler(() => ({ role: 'assistant', content: '' }));
	const p = new McpSamplingProvider({ sampler, modelHints: ['claude-haiku', 'haiku'] });
	await p.complete([{ role: 'user', content: 'q' }]);
	assert.deepEqual(requests[0]!.modelPreferences?.hints, ['claude-haiku', 'haiku']);
});

// ---------------------------------------------------------------------------
// completeStructured()
// ---------------------------------------------------------------------------

test('completeStructured() extracts JSON + returns typed value', async () => {
	const { sampler } = makeSampler(() => ({
		role: 'assistant',
		content: '{"ok":true,"note":"first"}',
	}));
	const p = new McpSamplingProvider({ sampler });
	const out = await p.completeStructured(
		[{ role: 'user', content: 'do it' }],
		SIMPLE_SCHEMA,
	);
	assert.deepEqual(out, { ok: true, note: 'first' });
});

test('completeStructured() strips a ```json markdown fence around the payload', async () => {
	const { sampler } = makeSampler(() => ({
		role: 'assistant',
		content: '```json\n{"ok":true,"note":"fenced"}\n```',
	}));
	const p = new McpSamplingProvider({ sampler });
	const out = await p.completeStructured(
		[{ role: 'user', content: 'x' }],
		SIMPLE_SCHEMA,
	);
	assert.deepEqual(out, { ok: true, note: 'fenced' });
});

test('completeStructured() retries on validation failure + appends the retry note', async () => {
	const { sampler, requests } = makeSampler((_req, n) => {
		// First attempt: invalid (missing `note`). Second: valid.
		if (n === 1) return { role: 'assistant', content: '{"ok":true}' };
		return { role: 'assistant', content: '{"ok":true,"note":"corrected"}' };
	});
	const p = new McpSamplingProvider({ sampler });
	const out = await p.completeStructured(
		[{ role: 'user', content: 'do it' }],
		SIMPLE_SCHEMA,
	);
	assert.deepEqual(out, { ok: true, note: 'corrected' });
	assert.equal(requests.length, 2);
	// Second request carries a corrective retry note appended after
	// the schema-instruction turn.
	const secondUserTurns = requests[1]!.messages.filter(m => m.role === 'user');
	assert.ok(
		secondUserTurns.some(m => m.content.includes('previous response')),
		'expected a retry note referring to the previous response',
	);
});

test('completeStructured() throws after exhausting maxAttempts', async () => {
	const { sampler } = makeSampler(() => ({
		role: 'assistant',
		content: '{"ok":"not-a-bool"}',
	}));
	const p = new McpSamplingProvider({ sampler });
	await assert.rejects(
		() => p.completeStructured(
			[{ role: 'user', content: 'x' }],
			SIMPLE_SCHEMA,
			{ maxAttempts: 2 },
		),
		/validation failed after 2 attempts/,
	);
});

test('completeStructured() classifies unparseable output as a validation failure', async () => {
	// First: prose, not JSON. Second: valid JSON. The retry loop
	// should recover.
	const { sampler } = makeSampler((_req, n) => {
		if (n === 1) return { role: 'assistant', content: 'not JSON at all' };
		return { role: 'assistant', content: '{"ok":true,"note":"ok"}' };
	});
	const p = new McpSamplingProvider({ sampler });
	const out = await p.completeStructured(
		[{ role: 'user', content: 'x' }],
		SIMPLE_SCHEMA,
	);
	assert.deepEqual(out, { ok: true, note: 'ok' });
});

// ---------------------------------------------------------------------------
// stream() + embed()
// ---------------------------------------------------------------------------

test('stream() throws NOT_IMPLEMENTED', () => {
	const p = new McpSamplingProvider({ sampler: async () => ({ role: 'assistant', content: '' }) });
	assert.throws(
		() => p.stream([{ role: 'user', content: 'x' }]),
		/stream\(\) is not implemented/,
	);
});

test('embed() throws when no embedDelegate is wired', async () => {
	const p = new McpSamplingProvider({ sampler: async () => ({ role: 'assistant', content: '' }) });
	await assert.rejects(() => p.embed('text'), /no embedDelegate is wired/);
});

test('embed() delegates when embedDelegate is provided', async () => {
	const delegate = {
		embed: async (_text: string): Promise<number[]> => [1, 2, 3],
		capabilities: {
			structuredOutput: false, toolCalling: false, vision: false,
			webSearch: false, streaming: false, embeddings: true,
		},
	};
	const p = new McpSamplingProvider({
		sampler: async () => ({ role: 'assistant', content: '' }),
		embedDelegate: delegate,
	});
	assert.deepEqual(await p.embed('anything'), [1, 2, 3]);
	assert.equal(p.capabilities.embeddings, true);
});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

test('capabilities: structuredOutput=true, tools=false, streaming=false', () => {
	const p = new McpSamplingProvider({
		sampler: async () => ({ role: 'assistant', content: '' }),
	});
	assert.equal(p.capabilities.structuredOutput, true);
	assert.equal(p.capabilities.toolCalling,      false);
	assert.equal(p.capabilities.streaming,        false);
	assert.equal(p.supportsTools,                 false);
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('extractJsonPayload strips a bare ```json fence', () => {
	const out = _extractJsonPayloadForTest('```json\n{"a":1}\n```');
	assert.deepEqual(out, { a: 1 });
});

test('extractJsonPayload accepts a bare JSON object without a fence', () => {
	const out = _extractJsonPayloadForTest('  {"a":1}  ');
	assert.deepEqual(out, { a: 1 });
});

test('extractJsonPayload throws when the payload is not JSON', () => {
	assert.throws(() => _extractJsonPayloadForTest('nope'), /not valid JSON/);
});

test('augmentForSchema appends a tail user turn with the schema instruction', () => {
	const out = _augmentForSchemaForTest(
		[{ role: 'user', content: 'q' }],
		SIMPLE_SCHEMA,
		undefined,
	);
	assert.equal(out.length, 2);
	assert.equal(out[0]!.role, 'user');
	assert.equal(out[1]!.role, 'user');
	assert.match(out[1]!.content as string, /Respond with ONLY a JSON object/);
});

test('augmentForSchema appends the retry note when supplied', () => {
	const out = _augmentForSchemaForTest(
		[{ role: 'user', content: 'q' }],
		SIMPLE_SCHEMA,
		'Retry: previous response was missing `note`',
	);
	assert.equal(out.length, 3);
	assert.match(out[2]!.content as string, /Retry: previous response/);
});

test('mapStopReason maps MCP names to LLMResponse names', () => {
	assert.equal(_mapStopReasonForTest('endTurn'),      'end_turn');
	assert.equal(_mapStopReasonForTest('maxTokens'),    'max_tokens');
	assert.equal(_mapStopReasonForTest('toolUse'),      'tool_use');
	// stopSequence collapses to end_turn (no counterpart in the union)
	assert.equal(_mapStopReasonForTest('stopSequence'), 'end_turn');
	assert.equal(_mapStopReasonForTest(undefined),      'end_turn');
});
