/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review round 1 of Story s3 on the shared handling: a prompt that alone does not fit, with no evidence to divide,
 * is a typed budget failure (not an unbounded call), and the aggregator's combine summary is capped like a part's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputTooLargeError } from '../../../agent/providers/cli-provider.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { chunkAtLines, emitDivided } from '../final-emit.js';
import { synthesizeHandled } from '../synthesizer.js';
import type { synthesize } from '../synthesizer.js';
import { HandlingBudgetError } from '../answer-step-error.js';
import { dedupeLayer } from '../handling-adapters.js';
import { runDivided, runHandled } from '../handling-parts.js';
import type { PartAdapter } from '../handling-parts.js';
import { AGGREGATE_COMBINE_SCHEMA } from '../../runtimes/shared/aggregator.js';

test('a prompt that alone does not fit, with nothing to divide, is a typed budget failure and no call is made', async () => {
	let calls = 0;
	const provider = { inputBudgetChars: 16_100, completeStructured: async () => { calls++; return {}; } } as unknown as LLMProvider;
	const adapter = {
		partSchema: { type: 'object' } as unknown as StructuredSchema, combineSchema: { type: 'object' } as unknown as StructuredSchema,
		renderPart: () => [], renderCombine: () => [], summaryOf: () => '', summaryOfCombine: () => '',
	} as unknown as PartAdapter<unknown, unknown>;
	const messages: LLMMessage[] = [{ role: 'user', content: 'x'.repeat(5_000) }];
	const thrown = await runHandled({
		provider, target: { kind: 'cli', inputBudgetChars: 16_100 }, adapter, blocks: [], reference: [],
		found: { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } },
		maxAttempts: 2, size: 'S', singleMessages: messages, singleSchema: { type: 'object' } as unknown as StructuredSchema,
	}).then(() => undefined, (e: unknown) => e);
	assert.ok(thrown instanceof HandlingBudgetError, String(thrown));
	assert.equal(calls, 0);
});

test('the aggregator combine schema caps a summary like a part summary', () => {
	const schema = AGGREGATE_COMBINE_SCHEMA as unknown as { properties: { summary: { maxLength?: number } } };
	assert.equal(schema.properties.summary.maxLength, 2_000);
});

test('distinct files whose names hold the kind separator are both kept; an identical line is still dropped', () => {
	const text = [
		'## Related docs',
		'- docs/A — Notes.md :: A',
		'- docs/B — Notes.md :: B',
		'- docs/A — Notes.md :: A again',
	].join('\n');
	const out = dedupeLayer(text, 'structure', 'docs').split('\n');
	assert.ok(out.includes('- docs/A — Notes.md :: A'));
	assert.ok(out.includes('- docs/B — Notes.md :: B'), 'the second file is kept');
	assert.equal(out.includes('- docs/A — Notes.md :: A again'), false, 'the same file is listed once');
});

const ruleResult = (id: string, texts: string[]): unknown => ({
	exploration: { id, type: 'doc.constraint.enumerate', purpose: 'p', params: {} },
	output: {
		type: 'doc.constraint.enumerate', subject: 's', notFoundNote: '', retrievedSectionCount: texts.length,
		constraints: texts.map((t, i) => ({ constraint: t, kind: 'must', sourceEntityId: `ent-${i}`, file: `docs/rule${i}.md`, heading: `Rule ${i}`, rationale: 'why' })),
		completeness: { complete: true, incomplete: [], failed: [] },
	},
	cached: false, elapsedMs: 1,
});

test('a delivered adherence answer states the rule count and rules from every lookup, whatever the replies said', async () => {
	const executed = {
		plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: [] },
		results: [
			ruleResult('e1', ['The daemon owns every handle.', 'Never use console.log.', 'Imports end in .js.']),
			{ exploration: { id: 'e2', type: 'search.text', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
				output: { type: 'search.text', hits: [{ file: 'src/a.ts', line: 1, snippet: 'console.log(1)' }], completeness: { complete: true, incomplete: [], failed: [] } } },
		],
		totalMs: 1, totalCached: 0,
	} as unknown as Parameters<typeof synthesize>[0]['executed'];
	const lies = { system: 'sys', focus: 'Checked 1 rule.', summary: 'one rule only', structure: 's', surface: 'u', artefacts: 'a', upstream: '' };
	const provider = { inputBudgetChars: 76_000, completeStructured: async () => lies } as unknown as LLMProvider;
	const intent = { target: 'code', scope: 'M', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/tmp/r' }, reasoning: 'r' } as const;
	const out = await synthesizeHandled({ intent, executed, runId: 'r', target: 'adherence', provider });
	assert.equal(out.handling.method, 'partitioned');
	assert.match(out.layers.focus, /Rule sources checked \(counted from every lookup\): 3/);
	for (const rule of ['The daemon owns every handle.', 'Never use console.log.', 'Imports end in .js.']) assert.ok(out.layers.focus.includes(rule), rule);
});

test('a lone section refused for its size is halved by text and both halves are covered', async () => {
	const text = 'x'.repeat(10_000);
	const block = { key: 'big#1', envelope: { tool: 't', input: {} }, text };
	const refused: number[] = [];
	const provider = {
		inputBudgetChars: 76_000,
		completeStructured: async (messages: LLMMessage[]) => {
			const size = String(messages[messages.length - 1]?.content).length;
			refused.push(size);
			if (size > 7_000) throw new InputTooLargeError('too large', 'Prompt is too long', { maxChars: 7_000, actualChars: size });
			return { r: 'ok' };
		},
	} as unknown as LLMProvider;
	const adapter = {
		partSchema: { type: 'object' }, combineSchema: { type: 'object' },
		renderPart: (part: { id: string; sections: { text: string }[] }) => [{ role: 'user', content: part.sections.map(x => x.text).join('') }],
		renderCombine: () => [{ role: 'user', content: 'combine' }],
		summaryOf: () => 'a summary of the part that is long enough', summaryOfCombine: () => 'c',
	} as unknown as PartAdapter<unknown, unknown>;
	const out = await runDivided({
		provider, target: { kind: 'cli', inputBudgetChars: 76_000 }, adapter, blocks: [block], reference: [],
		found: { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } }, maxAttempts: 1,
	}).catch((e: unknown) => e);
	assert.ok(!(out instanceof Error), String(out));
	assert.equal((out as { handling: { notCovered: unknown[] } }).handling.notCovered.length, 0, 'every half was covered');
});

test('the part-id probe uses the longest key in the limit\'s own unit: a shorter key of wide characters can be the larger', async () => {
	const wide = '漢'.repeat(50);
	const ascii = 'a'.repeat(100);
	const probes: string[] = [];
	const adapter = {
		partSchema: { type: 'object' }, combineSchema: { type: 'object' },
		renderPart: (part: { id: string; sections: unknown[] }) => { if (part.sections.length === 0) probes.push(part.id); return [{ role: 'user', content: 'p' }]; },
		renderCombine: () => [{ role: 'user', content: 'c' }],
		summaryOf: () => 'a summary of the part that is long enough', summaryOfCombine: () => 'c',
	} as unknown as PartAdapter<unknown, unknown>;
	const provider = { completeStructured: async () => ({ r: 1 }) } as unknown as LLMProvider;
	await runDivided({
		provider, target: { kind: 'local', windowTokens: 40_000, singlePassOutputTokens: 20_480 }, adapter,
		blocks: [{ key: ascii, envelope: { tool: 't', input: {} }, text: 'x' }, { key: wide, envelope: { tool: 't', input: {} }, text: 'y' }], reference: [],
		found: { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } }, maxAttempts: 1,
	});
	assert.ok(probes.some(id => id.includes(wide)), `the probe carries the wide key: ${probes.join('|')}`);
});

test('plain infra file names that hold the separator stay distinct; a kind before a real path is still taken off', () => {
	const text = [
		'## By family',
		'- Alpha — Notes.yaml',
		'- Beta — Notes.yaml',
		'- Deployment — k8s/app.yaml',
		'- Service — k8s/app.yaml',
	].join('\n');
	const out = dedupeLayer(text, 'structure', 'infra').split('\n');
	assert.ok(out.includes('- Alpha — Notes.yaml') && out.includes('- Beta — Notes.yaml'), 'two plain files are two entries');
	assert.equal(out.filter(l => l.includes('k8s/app.yaml')).length, 1, 'one file listed under two kinds is listed once');
});

test('an oversized rule reference goes through the real synthesizer: every section reaches the parts, every site is classified and the rule facts are whole', async () => {
	const rule = `RULE-START ${'a'.repeat(50_000)} RULE-MIDDLE ${'b'.repeat(50_000)} RULE-END`;
	const site = (id: string, n: number): unknown => ({
		exploration: { id, type: 'search.text', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
		output: { type: 'search.text', hits: [{ file: `src/s${n}.ts`, line: 1, snippet: `code${n} ${'c'.repeat(20_000)}` }], completeness: { complete: true, incomplete: [], failed: [] } },
	});
	const executed = {
		plan: { answerType: 'adherence-check', synthesisHint: 'h', explorations: [] },
		results: [ruleResult('e1', [rule]), site('e2', 0), site('e3', 1), site('e4', 2)],
		totalMs: 1, totalCached: 0,
	} as unknown as Parameters<typeof synthesize>[0]['executed'];
	const prompts: string[] = [];
	const provider = {
		inputBudgetChars: 76_000,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			const prompt = String(messages[messages.length - 1]?.content);
			prompts.push(prompt);
			if ((schema.required ?? []).length === 3) return { system: 'S', focus: 'F', summary: 'combined summary of every part' };
			const sites = [...new Set([...prompt.matchAll(/code(\d)/g)].map(m => m[1]))];
			return { system: 'sys', focus: 'f', summary: `classified ${sites.join(',')}`, structure: sites.map(n => `- site ${n}: violates`).join('\n'), surface: '', artefacts: '', upstream: '' };
		},
	} as unknown as LLMProvider;
	const intent = { target: 'code', scope: 'XL', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/tmp/r' }, reasoning: 'r' } as const;
	const out = await synthesizeHandled({ intent, executed, runId: 'r', target: 'adherence', provider });
	assert.equal(out.handling.method, 'partitioned');
	const partPrompts = prompts.filter(p => /THIS PART only/.test(p));
	assert.ok(partPrompts.length >= 3, 'the sites are in several calls');
	// Each part sees the whole rule, across the rounds of the reference that its own call holds.
	for (const marker of ['RULE-START', 'RULE-MIDDLE', 'RULE-END']) {
		assert.ok(partPrompts.some(p => p.includes(marker)), `${marker} reached a part`);
	}
	assert.ok(partPrompts.length >= 3 * 2, 'every part is asked once per round of the reference');
	for (const n of [0, 1, 2]) assert.ok(out.layers.structure.includes(`- site ${n}: violates`), `site ${n} is classified in the delivered answer`);
	assert.ok(out.layers.focus.includes('RULE-START') && out.layers.focus.includes('RULE-END'), 'the delivered answer states the rule whole');
});

test('a reuse candidate is never listed among the other modules, even when the candidates span several rounds of the reference', async () => {
	const candidates = Array.from({ length: 120 }, (_, i) => ({
		path: i === 100 ? 'src/a' : `src/cand${i}`, moduleName: `m${i}`, verdict: 'partial-match', rationale: `r${i} ${'x'.repeat(900)}`, evidenceEntities: [], conceptScore: 0.5,
	}));
	const executed = {
		plan: { answerType: 'capability-discovery', synthesisHint: 'h', explorations: [] },
		results: [
			{ exploration: { id: 'e1', type: 'capability.reuse-check', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
				output: { type: 'capability.reuse-check', capability: 'c', candidates, notFoundNote: '', completeness: { complete: true, incomplete: [], failed: [] } } },
			{ exploration: { id: 'e2', type: 'concept.resolve', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
				output: { type: 'concept.resolve', query: 'q', hits: [{ path: 'src/a' }, { path: 'src/free' }], completeness: { complete: true, incomplete: [], failed: [] } } },
		],
		totalMs: 1, totalCached: 0,
	} as unknown as Parameters<typeof synthesize>[0]['executed'];
	let rounds = 0;
	const provider = {
		inputBudgetChars: 76_000,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			if ((schema.required ?? []).length === 3) return { system: 'S', focus: 'F', summary: 'combined summary of every part' };
			rounds++;
			return { system: 's', focus: 'f', summary: 'part', structure: '## Related modules (concept.resolve)\n- src/a\n- src/free', surface: '', artefacts: '', upstream: '' };
		},
	} as unknown as LLMProvider;
	const intent = { target: 'code', scope: 'XL', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/tmp/r' }, reasoning: 'r' } as const;
	const out = await synthesizeHandled({ intent, executed, runId: 'r', target: 'capability', provider });
	assert.ok(rounds >= 2, `the candidates span several rounds of the reference: ${rounds}`);
	const lines = out.layers.structure.split('\n');
	assert.ok(!lines.includes('- src/a'), 'a candidate of another round is not listed among the other modules');
	assert.ok(lines.includes('- src/free'), 'a module that is no candidate still is');
});

test('a tool result cut into blocks is cut at line breaks: no entry loses its source prefix, and nothing is lost', async () => {
	const lines = Array.from({ length: 600 }, (_, i) => `src/f${i}.ts:${i + 1}: needle ${i}`);
	const text = lines.join('\n');
	const chunks = chunkAtLines(text);
	assert.ok(chunks.length > 1);
	assert.equal(chunks.join('\n'), text, 'the chunks are the whole result, in order');
	for (const chunk of chunks) for (const line of chunk.split('\n')) assert.ok(lines.includes(line), `an entry is whole: ${line}`);
	// And through the final answer in parts, every part prompt holds whole entries.
	const seen: string[] = [];
	const provider = {
		inputBudgetChars: 16_000 + 12_000,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }) => {
			if ((schema.required ?? []).length === 3) return { system: 'S', focus: 'F', summary: 'combined summary of every part' };
			seen.push(String(messages[messages.length - 1]?.content));
			return { system: 'sys', focus: 'f', summary: 'part', structure: 's', surface: 'u', artefacts: 'a', upstream: '' };
		},
	} as unknown as LLMProvider;
	const messages: LLMMessage[] = [
		{ role: 'system', content: 'You are the code shaper.' }, { role: 'user', content: 'find needles' },
		{ role: 'assistant', content: [{ type: 'tool_use', id: 'c1', name: 'search_grep', input: { pattern: 'needle' } }] },
		{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: text, isError: false }] },
	];
	const divided = await emitDivided({
		provider, target: { kind: 'cli', inputBudgetChars: 28_000 }, messages, schema: { type: 'object', properties: {} } as never,
		found: { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } }, trigger: 'size', maxAttempts: 1,
	});
	assert.ok(divided.handling.parts >= 2);
	const entries = seen.flatMap(p => p.split('\n').filter(l => /needle \d+/.test(l)));
	assert.equal(new Set(entries).size, 600, 'every entry reached a part');
	for (const e of entries) assert.match(e, /^src\/f\d+\.ts:\d+: needle \d+$/);
});
