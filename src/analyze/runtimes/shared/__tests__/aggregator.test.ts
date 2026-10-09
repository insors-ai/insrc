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

// ---------------------------------------------------------------------------
// Absent inputs (Story s7, task t9)
// ---------------------------------------------------------------------------

test("the aggregator's prompt lists each absent input with its producer and reason after the outputs that exist, and is unchanged when nothing is absent", async () => {
	const upstream = new Map<string, unknown>([['t01', { modules: ['pay'] }], ['t03', { entrypoints: ['settle'] }]]);
	const reply: AggregateLLMOutput = { summary: 's', findings: [] };
	const ask = async (absentInputs?: Parameters<typeof runAggregator>[0]['absentInputs'], omit = false) => {
		const capture: { messages?: import('../../../../shared/types.js').LLMMessage[] } = {};
		await runAggregator({
			promptRelPath: PROMPT_REL, target: 'code', scope: 'M', runId: 'r1', upstreamOutputs: upstream, focus: 'refunds',
			provider: stubProvider(reply, capture),
			...(omit ? {} : { absentInputs }),
		});
		return { system: String(capture.messages![0]!.content), user: String(capture.messages![1]!.content) };
	};

	// --- nothing absent: the prompt is the one it always was, in each way of saying so ---
	const before = _buildMessagesForTest({ promptContent: 'P', target: 'code', scope: 'M', focus: 'refunds', upstreamOutputs: upstream });
	const none = await ask(undefined, true);
	assert.equal(none.user, String(before[1]!.content), 'no absentInputs argument');
	assert.equal((await ask(undefined)).user, none.user, 'absentInputs undefined');
	assert.equal((await ask([])).user, none.user, 'an empty list');
	assert.ok(!none.user.includes('Absent inputs'));
	// Today's prompt, spelled out: the outputs, then the closing instruction.
	assert.ok(none.user.endsWith(
		'### t03\n```json\n{\n  "entrypoints": [\n    "settle"\n  ]\n}\n```\n\n' +
		'Compose the aggregate report. Respond with ONLY the JSON object matching the schema -- no markdown fences, no prose outside the JSON body.'));

	// --- two absent inputs: one a failed task's, one that no task produces ---
	const longReason = `runtime-threw: code.structure.module-tree: ${'the graph could not be read; '.repeat(40)}end of reason`;
	const some = await ask([
		{ name: 'module-tree', producedBy: 't02', reason: longReason },
		{ name: 'adherence-report', producedBy: null, reason: 'no task of the plan produces this name' },
	]);
	const section =
		'\n\nAbsent inputs (NOT available to you):\n' +
		`- module-tree: task t02 should have produced it. Reason: ${longReason}\n` +
		'- adherence-report: no task of the plan produces it. Reason: no task of the plan produces this name\n\n' +
		'These inputs were not produced, so you have nothing about them. In the summary and in the findings, state nothing about an absent input ' +
		'except that it is absent, with the task that should have produced it and the reason given above. Do not infer, estimate or describe what ' +
		'it would have held, and do not present the report as covering it.';
	// The prompt is today's with the section put in, whole, at one place ...
	const closing = '\n\nCompose the aggregate report.';
	const at = none.user.lastIndexOf(closing);
	assert.equal(some.user, none.user.slice(0, at) + section + none.user.slice(at));
	// ... which is after every output that exists and before the closing instruction.
	assert.ok(some.user.indexOf('### t03') < some.user.indexOf('Absent inputs (NOT available to you):'));
	assert.ok(some.user.indexOf('Absent inputs (NOT available to you):') < some.user.indexOf('Compose the aggregate report.'));
	// The reason is carried whole, however long.
	assert.ok(some.user.includes(longReason));
	// The reference material stays at the end: the system prompt, which holds
	// it, is untouched, and the user turn still ends with the instruction to answer.
	assert.equal(some.system, none.system);
	assert.ok(some.user.endsWith('no markdown fences, no prose outside the JSON body.'));

	// With no output at all, the section follows the note that says so.
	const empty = _buildMessagesForTest({
		promptContent: 'P', target: 'code', scope: 'M', upstreamOutputs: new Map(),
		absentInputs: [{ name: 'modules', producedBy: 't01', reason: 'scope-not-indexed' }],
	});
	assert.match(String(empty[1]!.content), /No upstream outputs were available[^\n]*\n\nAbsent inputs \(NOT available to you\):\n- modules: task t01 should have produced it\. Reason: scope-not-indexed\n/);
});
