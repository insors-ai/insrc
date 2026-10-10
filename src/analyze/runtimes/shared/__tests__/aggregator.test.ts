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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	_buildMessagesForTest,
	_classifyErrorForTest,
	_renderAbsentSectionForTest,
	_renderUpstreamSectionForTest,
	_stableStringifyForTest,
	runAggregator,
} from '../aggregator.js';
import { AGGREGATE_LLM_SCHEMA } from '../aggregate-types.js';
import type { AggregateLLMOutput } from '../aggregate-types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { UpstreamOutput } from '../../../executor/types.js';

const PROMPT_REL = 'prompts/analyze/code.aggregate.system.md';

/** A map in which each name has the one output of the task it is named after. */
function single(entries: ReadonlyArray<readonly [string, unknown]>): Map<string, UpstreamOutput[]> {
	return new Map(entries.map(([name, value]) => [name, [{ taskId: name, template: 'demo.ok', params: {}, value }]]));
}

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
	const map = single([
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
	const map = single([['t01', null]]);
	const out = _renderUpstreamSectionForTest(map);
	assert.match(out, /unavailable.*upstream task t01/);
});

test('renderUpstreamSection: JSON output rendered in fenced block', () => {
	const map = single([['t02', { modules: ['a', 'b'] }]]);
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
		upstreamOutputs: single([['t01', { items: ['a'] }]]),
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
		upstreamOutputs: single([
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
		upstreamOutputs: single([['t01', { ok: 1 }]]),
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
	const upstream = single([['t01', { modules: ['pay'] }], ['t03', { entrypoints: ['settle'] }]]);
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

// ---------------------------------------------------------------------------
// Several outputs under one name (ISSUE-8ab2cc2e)
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const UNAVAILABLE = (producer: string): string =>
	`[unavailable: upstream task ${producer} produced no output; reflect this gap in the report rather than fabricating.]`;

test('a map in which every name has one output renders a user message byte-identical to the one rendered before the change', () => {
	// The messages the code rendered at the commit before the change, for the
	// same values, one per name: without and with absent inputs.
	const before = JSON.parse(readFileSync(join(HERE, 'aggregate-message-before-8ab2cc2e.json'), 'utf8')) as { plain: string; withAbsent: string };
	// The producing tasks are not named after their outputs, and carry params:
	// none of it may show where a name has one output.
	const upstream = new Map<string, UpstreamOutput[]>([
		['surface',   [{ taskId: 't01', template: 'code.surface.functional', params: { module: 'src/pay' }, value: { b: 1, a: [1, 2] } }]],
		['inventory', [{ taskId: 't02', template: 'docs.inventory.list',     params: {},                  value: null }]],
		['report',    [{ taskId: 't03', template: 'code.subrun.deep-dive',   params: { area: 'pay' },     value: { summary: 's' } }]],
	]);
	const absent = [
		{ name: 'x', producedBy: 't03', reason: 'runtime-threw: boom' },
		{ name: 'y', producedBy: null, reason: 'no task of the plan produces this name' },
	];
	const base = { promptContent: 'P', target: 'code', scope: 'M', focus: 'refunds', upstreamOutputs: upstream } as const;
	assert.equal(_buildMessagesForTest(base)[1]!.content, before.plain);
	// No absent name has an output: the absent section is the old one too.
	assert.equal(_buildMessagesForTest({ ...base, absentInputs: absent })[1]!.content, before.withAbsent);
	// The kept strings are the real thing and not empty stand-ins.
	assert.ok(before.plain.includes('### inventory\n[unavailable: upstream task inventory produced no output;'));
	assert.ok(before.withAbsent.includes('- x: task t03 should have produced it. Reason: runtime-threw: boom\n'));
});

test('a name with several outputs renders one sub-section per task in plan order, with the task id, the template and the params, and a null value renders the unavailable line in its sub-section', () => {
	const map = new Map<string, UpstreamOutput[]>([
		// Given in plan order, which is not the sorted order of the task ids.
		['functional-surface', [
			{ taskId: 't02', template: 'code.surface.functional', params: { module: 'src/pay' },          value: { symbols: ['settle'] } },
			{ taskId: 't03', template: 'code.surface.functional', params: { module: 'src/refund' },       value: null },
			{ taskId: 't01', template: 'code.surface.other',      params: { z: 1, module: 'src/ledger' }, value: ['post'] },
		]],
		['modules', [{ taskId: 't00', template: 'code.discovery.modules', params: { depth: 2 }, value: ['pay'] }]],
	]);
	assert.equal(_renderUpstreamSectionForTest(map), [
		'Upstream task outputs:',
		'### functional-surface (3 outputs, one per task)',
		'#### functional-surface from task t02 (code.surface.functional)\nparams: {"module":"src/pay"}\n```json\n{\n  "symbols": [\n    "settle"\n  ]\n}\n```',
		`#### functional-surface from task t03 (code.surface.functional)\nparams: {"module":"src/refund"}\n${UNAVAILABLE('t03')}`,
		// The params are written with their keys sorted, on one line.
		'#### functional-surface from task t01 (code.surface.other)\nparams: {"module":"src/ledger","z":1}\n```json\n[\n  "post"\n]\n```',
		// A name with one output beside it keeps the plain block, with no task and no params.
		'### modules\n```json\n[\n  "pay"\n]\n```',
	].join('\n\n'));

	// Two producers with the same params are both rendered; their task ids tell them apart.
	const twins = _renderUpstreamSectionForTest(new Map([['report', [
		{ taskId: 't01', template: 'code.subrun.deep-dive', params: {}, value: 'a' },
		{ taskId: 't02', template: 'code.subrun.deep-dive', params: {}, value: 'b' },
	]]]));
	assert.equal(twins, [
		'Upstream task outputs:',
		'### report (2 outputs, one per task)',
		'#### report from task t01 (code.subrun.deep-dive)\nparams: {}\n```json\n"a"\n```',
		'#### report from task t02 (code.subrun.deep-dive)\nparams: {}\n```json\n"b"\n```',
	].join('\n\n'));

	// One output left of several (a sibling producer of the name is absent): the
	// per-task form, so the output is attributable. An absent name nothing
	// produced, or an absent entry with no producer, changes nothing.
	const survivor = new Map([['modules', [{ taskId: 't04', template: 'code.discovery.modules', params: { dir: 'src/pay' }, value: ['pay'] }]]]);
	const attributed = [
		'Upstream task outputs:',
		'### modules (1 output, one per task)',
		'#### modules from task t04 (code.discovery.modules)\nparams: {"dir":"src/pay"}\n```json\n[\n  "pay"\n]\n```',
	].join('\n\n');
	const plain = 'Upstream task outputs:\n\n### modules\n```json\n[\n  "pay"\n]\n```';
	assert.equal(_renderUpstreamSectionForTest(survivor, [{ name: 'modules', producedBy: 't02', reason: 'r' }]), attributed);
	assert.equal(_renderUpstreamSectionForTest(survivor, [{ name: 'module-tree', producedBy: 't02', reason: 'r' }]), plain);
	assert.equal(_renderUpstreamSectionForTest(survivor, [{ name: 'modules', producedBy: null, reason: 'r' }]), plain);
	assert.equal(_renderUpstreamSectionForTest(survivor, []), plain);
	assert.equal(_renderUpstreamSectionForTest(survivor), plain);

	// A name with no output is read as not there.
	assert.match(_renderUpstreamSectionForTest(new Map([['modules', []]])), /^No upstream outputs were available/);
});

test('an absent output of one of several producers is worded by its task and the others are said to be available; a name with no output keeps the old wording', () => {
	const upstream = new Map<string, UpstreamOutput[]>([['functional-surface', [
		{ taskId: 't01', template: 'code.surface.functional', params: { module: 'src/pay' }, value: 1 },
		{ taskId: 't03', template: 'code.surface.functional', params: { module: 'src/ledger' }, value: 3 },
	]]]);
	const absent = [
		{ name: 'functional-surface', producedBy: 't02', reason: 'runtime-threw: the graph store is closed' },
		{ name: 'module-tree', producedBy: 't04', reason: 'scope-not-indexed' },
		{ name: 'adherence-report', producedBy: null, reason: 'no task of the plan produces this name' },
	];
	assert.equal(_renderAbsentSectionForTest(absent, upstream),
		'\n\nAbsent inputs (NOT available to you):\n' +
		'- functional-surface: the output of task t02 under this name is absent; the other outputs under functional-surface are available. Reason: runtime-threw: the graph store is closed\n' +
		'- module-tree: task t04 should have produced it. Reason: scope-not-indexed\n' +
		'- adherence-report: no task of the plan produces it. Reason: no task of the plan produces this name\n\n' +
		'These outputs were not produced, so you have nothing about them. Where a line above says that the output of one task under a name is absent, ' +
		"only that task's output is missing: the other outputs given to you under the same name are available and the report covers them. In the summary " +
		'and in the findings, state nothing about an absent output except that it is absent, with the task that should have produced it and the reason ' +
		'given above. Do not infer, estimate or describe what it would have held, and do not present the report as covering it.');

	// The same list where no absent name has an output: the section as it always was.
	const old =
		'\n\nAbsent inputs (NOT available to you):\n' +
		'- functional-surface: task t02 should have produced it. Reason: runtime-threw: the graph store is closed\n' +
		'- module-tree: task t04 should have produced it. Reason: scope-not-indexed\n' +
		'- adherence-report: no task of the plan produces it. Reason: no task of the plan produces this name\n\n' +
		'These inputs were not produced, so you have nothing about them. In the summary and in the findings, state nothing about an absent input ' +
		'except that it is absent, with the task that should have produced it and the reason given above. Do not infer, estimate or describe what ' +
		'it would have held, and do not present the report as covering it.';
	assert.equal(_renderAbsentSectionForTest(absent, new Map()), old);
	assert.equal(_renderAbsentSectionForTest(absent), old);
	assert.equal(_renderAbsentSectionForTest(absent, new Map([['modules', upstream.get('functional-surface')!]])), old);
});
