/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared aggregator runner tests (pure helpers + stubbed end-to-end).
 *
 * Live LLM tests for per-target aggregators live in the per-target
 * test dirs (e.g. analyze/runtimes/code/__tests__/aggregate-report.live.test.ts).
 * This file pins the message-composition + upstream rendering +
 * error classification + post-LLM metadata stamping behaviour with
 * a stub provider.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/runtimes/shared/__tests__/aggregator.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_buildMessagesForTest,
	_classifyErrorForTest,
	_renderUpstreamSectionForTest,
	_stableStringifyForTest,
	runAggregator,
} from '../aggregator.js';
import { AGGREGATE_LLM_SCHEMA } from '../aggregate-types.js';
import type { AggregateLLMOutput } from '../aggregate-types.js';
import type { LLMProvider } from '../../../../shared/types.js';

const PROMPT_REL = 'prompts/analyze/code.aggregate.system.md';

function stubProvider(structuredReply: AggregateLLMOutput, capture?: {
	messages?: import('../../../../shared/types.js').LLMMessage[];
	schema?:   Record<string, unknown>;
}): LLMProvider {
	return {
		supportsTools: false,
		capabilities:  {
			structuredOutput: true, toolCalling: false, vision: false,
			webSearch: false, streaming: false, embeddings: false,
		},
		complete:        async () => { throw new Error('stub: complete not used'); },
		stream:          async function* () { yield ''; throw new Error('stub: stream not used'); },
		embed:           async () => [],
		completeStructured: async <T>(messages, schema) => {
			if (capture !== undefined) {
				capture.messages = messages;
				capture.schema   = schema as Record<string, unknown>;
			}
			return structuredReply as unknown as T;
		},
	};
}

function throwingProvider(message: string): LLMProvider {
	return {
		supportsTools: false,
		capabilities:  {
			structuredOutput: true, toolCalling: false, vision: false,
			webSearch: false, streaming: false, embeddings: false,
		},
		complete:        async () => { throw new Error('stub: complete not used'); },
		stream:          async function* () { yield ''; throw new Error('stub: stream not used'); },
		embed:           async () => [],
		completeStructured: async () => { throw new Error(message); },
	};
}

// ---------------------------------------------------------------------------
// stableStringify
// ---------------------------------------------------------------------------

test('stableStringify: object keys sorted', () => {
	const out = _stableStringifyForTest({ z: 1, a: 2, m: 3 });
	assert.match(out, /"a":\s*2/);
	assert.ok(out.indexOf('"a"') < out.indexOf('"m"'));
	assert.ok(out.indexOf('"m"') < out.indexOf('"z"'));
});

test('stableStringify: Map entries sorted + emitted as object', () => {
	const m = new Map<string, number>([['c', 3], ['a', 1], ['b', 2]]);
	const out = _stableStringifyForTest({ m });
	assert.ok(out.indexOf('"a"') < out.indexOf('"b"'));
	assert.ok(out.indexOf('"b"') < out.indexOf('"c"'));
});

test('stableStringify: arrays preserve order', () => {
	const out = _stableStringifyForTest(['z', 'a', 'm']);
	assert.match(out, /\[\s*"z",\s*"a",\s*"m"\s*\]/);
});

// ---------------------------------------------------------------------------
// renderUpstreamSection
// ---------------------------------------------------------------------------

test('renderUpstreamSection: empty map -> "No upstream outputs" sentinel', () => {
	const out = _renderUpstreamSectionForTest(new Map());
	assert.match(out, /No upstream outputs/);
});

test('renderUpstreamSection: tasks emitted in sorted taskId order', () => {
	const map = new Map<string, unknown>([
		['t05', { x: 1 }],
		['t01', { y: 2 }],
		['t03', { z: 3 }],
	]);
	const out = _renderUpstreamSectionForTest(map);
	const i01 = out.indexOf('### t01');
	const i03 = out.indexOf('### t03');
	const i05 = out.indexOf('### t05');
	assert.ok(i01 > 0 && i03 > i01 && i05 > i03,
		`expected sorted taskIds; got positions t01=${i01} t03=${i03} t05=${i05}`);
});

test('renderUpstreamSection: null upstream rendered as unavailable note', () => {
	const map = new Map<string, unknown>([['t01', null]]);
	const out = _renderUpstreamSectionForTest(map);
	assert.match(out, /unavailable.*upstream task t01/);
});

test('renderUpstreamSection: JSON output rendered in fenced block', () => {
	const map = new Map<string, unknown>([['t02', { modules: ['a', 'b'] }]]);
	const out = _renderUpstreamSectionForTest(map);
	assert.match(out, /### t02/);
	assert.match(out, /```json/);
	assert.match(out, /"modules"/);
	assert.match(out, /```/);
});

// ---------------------------------------------------------------------------
// buildMessages
// ---------------------------------------------------------------------------

test('buildMessages: system has prompt content, user has Target/Scope/upstream', () => {
	const msgs = _buildMessagesForTest({
		promptContent:   'PROMPT BODY',
		target:          'code',
		scope:           'M',
		upstreamOutputs: new Map([['t01', { items: ['a'] }]]),
	});
	assert.equal(msgs.length, 2);
	assert.equal(msgs[0]!.role, 'system');
	assert.match(msgs[0]!.content as string, /PROMPT BODY/);
	assert.equal(msgs[1]!.role, 'user');
	const user = msgs[1]!.content as string;
	assert.match(user, /Target: code/);
	assert.match(user, /Scope:  M/);
	assert.match(user, /### t01/);
});

test('buildMessages: focus is included in the user message when present', () => {
	const msgs = _buildMessagesForTest({
		promptContent:   'PROMPT',
		target:          'code',
		scope:           'S',
		focus:           'why is the auth flow slow?',
		upstreamOutputs: new Map(),
	});
	const user = msgs[1]!.content as string;
	assert.match(user, /Focus: why is the auth flow slow\?/);
});

test('buildMessages: focus omitted when undefined', () => {
	const msgs = _buildMessagesForTest({
		promptContent:   'PROMPT',
		target:          'code',
		scope:           'XS',
		upstreamOutputs: new Map(),
	});
	const user = msgs[1]!.content as string;
	assert.doesNotMatch(user, /Focus:/);
});

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

test('classifyError: Ollama-down patterns -> aggregator-llm-unavailable', () => {
	for (const pat of ['ECONNREFUSED', 'Model not found', 'fetch failed']) {
		const wrapped = _classifyErrorForTest(new Error(`oops: ${pat} downstream`));
		assert.match(wrapped.message, /aggregator-llm-unavailable/);
	}
});

test('classifyError: arbitrary error -> aggregator-schema-unrecoverable', () => {
	const wrapped = _classifyErrorForTest(new Error('schema validation failed: missing summary'));
	assert.match(wrapped.message, /aggregator-schema-unrecoverable/);
});

test('classifyError: non-Error -> aggregator-internal wrapper', () => {
	const wrapped = _classifyErrorForTest('a plain string thrown somehow');
	assert.match(wrapped.message, /aggregator-internal/);
});

// ---------------------------------------------------------------------------
// runAggregator (end-to-end with stub provider; pins metadata stamping
// + the LLM-schema vs returned-report split)
// ---------------------------------------------------------------------------

test('runAggregator: stub provider -> report carries LLM output + runtime metadata', async () => {
	const reply: AggregateLLMOutput = {
		summary:  'Summary covers the goal and notes the upstream outputs were limited but actionable.',
		findings: [
			{ title: 'A', detail: 'a body', sources: ['t01'] },
			{ title: 'B', detail: 'b body', sources: ['t02', 't03'] },
		],
	};
	const capture: { messages?: unknown; schema?: Record<string, unknown> } = {};
	const provider = stubProvider(reply, capture);

	const report = await runAggregator({
		promptRelPath:   PROMPT_REL,
		target:          'code',
		scope:           'M',
		runId:           'rt-agg-1',
		upstreamOutputs: new Map<string, unknown>([
			['t01', { ok: 1 }],
			['t02', { ok: 2 }],
			['t03', { ok: 3 }],
		]),
		provider,
	});

	assert.equal(report.summary, reply.summary);
	assert.equal(report.findings.length, 2);
	assert.equal(report.metadata.target, 'code');
	assert.equal(report.metadata.scope,  'M');
	assert.equal(report.metadata.runId,  'rt-agg-1');
	assert.equal(report.metadata.tasksAnalyzed, 3);

	// Schema passed to the LLM is the LLM-facing schema (no metadata required).
	assert.equal(capture.schema, AGGREGATE_LLM_SCHEMA as unknown);
});

test('runAggregator: focus passed through to the user message', async () => {
	const reply: AggregateLLMOutput = {
		summary:  'A focused summary that addresses the specific area.',
		findings: [{ title: 'F', detail: 'd', sources: ['t01'] }],
	};
	const capture: { messages?: import('../../../../shared/types.js').LLMMessage[] } = {};
	await runAggregator({
		promptRelPath:   PROMPT_REL,
		target:          'code',
		scope:           'XS',
		runId:           'rt-agg-2',
		upstreamOutputs: new Map([['t01', { ok: 1 }]]),
		focus:           'the central User entity',
		provider:        stubProvider(reply, capture),
	});
	const user = capture.messages![1]!.content as string;
	assert.match(user, /Focus: the central User entity/);
});

test('runAggregator: provider throws ECONNREFUSED -> rethrown as aggregator-llm-unavailable', async () => {
	await assert.rejects(
		runAggregator({
			promptRelPath:   PROMPT_REL,
			target:          'code',
			scope:           'XS',
			runId:           'rt-agg-3',
			upstreamOutputs: new Map(),
			provider:        throwingProvider('boom ECONNREFUSED localhost'),
		}),
		/aggregator-llm-unavailable/,
	);
});

test('runAggregator: provider throws arbitrary error -> aggregator-schema-unrecoverable', async () => {
	await assert.rejects(
		runAggregator({
			promptRelPath:   PROMPT_REL,
			target:          'code',
			scope:           'XS',
			runId:           'rt-agg-4',
			upstreamOutputs: new Map(),
			provider:        throwingProvider('schema mismatch on attempt 3'),
		}),
		/aggregator-schema-unrecoverable/,
	);
});

test('runAggregator: missing prompt file -> "aggregator prompt missing"', async () => {
	await assert.rejects(
		runAggregator({
			promptRelPath:   'prompts/analyze/does-not-exist.system.md',
			target:          'code',
			scope:           'XS',
			runId:           'rt-agg-5',
			upstreamOutputs: new Map(),
			provider:        stubProvider({
				summary:  'unused, prompt load fails first',
				findings: [{ title: 't', detail: 'd', sources: ['t01'] }],
			}),
		}),
		/aggregator prompt missing/,
	);
});

// ---------------------------------------------------------------------------
// AGGREGATE_LLM_SCHEMA -- shape sanity
// ---------------------------------------------------------------------------

test('AGGREGATE_LLM_SCHEMA: requires summary + findings, additionalProperties false', () => {
	const s = AGGREGATE_LLM_SCHEMA as Record<string, unknown>;
	assert.equal(s['type'], 'object');
	assert.equal(s['additionalProperties'], false);
	assert.deepEqual(s['required'], ['summary', 'findings']);
});
