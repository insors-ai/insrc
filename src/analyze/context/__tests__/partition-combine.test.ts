/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dividing a call into parts, combining them and assembling the answer
 * (LLD-b9d5c5c40df5a574-s3, task t7), against a scripted provider. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallFailedError, ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from '../driver.js';
import type { AnswerStepFound } from '../driver.js';
import { assembleAggregate, assembleBundle } from '../handling-adapters.js';
import type { BundleLayers } from '../handling-adapters.js';
import { MAX_DIVISIONS, runDivided } from '../handling-parts.js';
import type { DivideArgs, PartAdapter } from '../handling-parts.js';
import type { AdmissionTarget } from '../handling.js';
import { renderSection } from '../sections.js';
import type { EvidenceBlock } from '../sections.js';

const FOUND: AnswerStepFound = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };
const PART_SCHEMA = { kind: 'part' };
const COMBINE_SCHEMA = { kind: 'combine' };

/** A CLI provider whose part limit is `limit` characters. */
const cli = (limit: number): AdmissionTarget => ({ kind: 'cli', inputBudgetChars: limit + 16_000 });

interface Reply extends BundleLayers { readonly summary: string }
type Narrative = { system: string; focus: string; summary: string };

const adapter: PartAdapter<Reply, Narrative> = {
	partSchema: PART_SCHEMA, combineSchema: COMBINE_SCHEMA,
	renderPart: (part, round) => [{ role: 'user', content: `PART ${part.id}\nREF:${round.rendered}\n${part.sections.map(renderSection).join('\n\n')}` }],
	renderCombine: (summaries, round) => [{ role: 'user', content: `COMBINE\nREF:${round.rendered}\n${summaries.map(s => `${s.id}: ${s.summary}`).join('\n')}` }],
	summaryOf: r => r.summary,
	summaryOfCombine: c => c.summary,
};

const block = (key: string, size = 3_000, envelope: Record<string, unknown> = { file: `docs/${key}.md` }): EvidenceBlock =>
	({ key, envelope, text: `MARK-${key} ${'x'.repeat(size)}` });

/** The block keys named in a part prompt. */
const keysIn = (prompt: string): string[] => [...prompt.matchAll(/\[(\S+), section \d+ of \d+\]/g)].map(m => m[1] as string);

type Respond = (prompt: string, kind: 'part' | 'combine') => unknown;

interface Run { provider: LLMProvider; prompts: string[]; maxInFlight: () => number }
function scripted(respond: Respond): Run {
	const prompts: string[] = [];
	let inFlight = 0;
	let max = 0;
	const provider = {
		completeStructured: async (messages: LLMMessage[], schema: unknown) => {
			inFlight++; max = Math.max(max, inFlight);
			try {
				await new Promise(r => setImmediate(r));
				const prompt = String(messages[0]?.content);
				prompts.push(prompt);
				const out = respond(prompt, schema === COMBINE_SCHEMA ? 'combine' : 'part');
				if (out instanceof Error) throw out;
				return out;
			} finally { inFlight--; }
		},
	} as unknown as LLMProvider;
	return { provider, prompts, maxInFlight: () => max };
}

const okPart = (prompt: string): Reply => {
	const keys = keysIn(prompt);
	return {
		system: 's', focus: 'f', summary: `covers ${keys.join(',')}`,
		structure: keys.map(k => `- ${k}`).join('\n'),
		surface: `## Related docs\ndocs/shared.md :: Shared\n${keys.map(k => `docs/${k}.md :: ${k}`).join('\n')}`,
		artefacts: '', upstream: '',
	};
};
const okCombine = (prompt: string): Narrative => ({ system: 'S', focus: 'F', summary: `combined(${(prompt.match(/summary|covers/g) ?? []).length})` });

function args(run: Run, blocks: readonly EvidenceBlock[], limit: number, extra: Partial<DivideArgs<Reply, Narrative>> = {}): DivideArgs<Reply, Narrative> {
	return { provider: run.provider, target: cli(limit), adapter, blocks, reference: [], found: FOUND, maxAttempts: 2, ...extra };
}

test('serial parts, division up to three times, repair exhaustion never discards a successful part, combine terminates and a combine failure returns per-part results with \'combine\' in notCovered', async () => {
	// Six blocks pack two to a part. A part with two blocks never answers validly, so each is divided once;
	// b5 never answers validly at all, so it ends as not covered while every other block is kept.
	const blocks = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map(k => block(k, 4_000));
	const run = scripted((prompt, kind) => {
		if (kind === 'combine') return okCombine(prompt);
		const keys = keysIn(prompt);
		return keys.length > 1 || keys.includes('b5') ? new ModelResponseShapeError('reply failed validation', ['bad']) : okPart(prompt);
	});
	const result = await runDivided(args(run, blocks, 12_000));
	assert.equal(run.maxInFlight(), 1, 'calls are made one after another');
	assert.deepEqual(result.covered.map(c => keysIn(`[${c.reply.structure.slice(2)}, section 1 of 1]`)[0]), ['b1', 'b2', 'b3', 'b4', 'b6']);
	assert.equal(result.handling.method, 'partitioned');
	assert.equal(result.handling.parts, 3);
	assert.equal(result.handling.notCovered.length, 1);
	assert.match(result.handling.notCovered[0]?.part ?? '', /b5/);
	assert.ok(result.combine !== undefined, 'the covered parts are combined');
	assert.ok((result.handling.combineStages ?? 0) >= 1);

	// A divisible part is divided at most MAX_DIVISIONS times, then recorded as not covered.
	assert.equal(MAX_DIVISIONS, 3);
	const huge = block('big', 60_000);
	const stuck = scripted(() => new ModelResponseShapeError('reply failed validation', ['bad']));
	await assert.rejects(runDivided(args(stuck, [huge, block('small', 100)], 12_000, { maxAttempts: 1 })), ShaperAnswerStepFailedError);
	assert.ok(stuck.prompts.length < 200, 'division is bounded');

	// A combine that cannot be answered returns the per-part results with 'combine' in notCovered and throws nothing.
	const noCombine = scripted((prompt, kind) => (kind === 'combine' ? new ModelResponseShapeError('reply failed validation', ['bad']) : okPart(prompt)));
	const parts = ['c1', 'c2', 'c3'].map(k => block(k, 7_000));
	const fallback = await runDivided(args(noCombine, parts, 12_000));
	assert.equal(fallback.covered.length, 3);
	assert.equal(fallback.combine, undefined);
	assert.deepEqual(fallback.handling.notCovered.map(n => n.part), ['combine']);

	// A combine that is not admitted (the limit leaves no room for two capped summaries) falls back the same way.
	const tight = scripted((prompt, kind) => (kind === 'combine' ? okCombine(prompt) : okPart(prompt)));
	const bigPrompt = { ...adapter, renderCombine: (s: readonly { id: string; summary: string }[]) => [{ role: 'user' as const, content: 'C'.repeat(12_500) + String(s.length) }] };
	const notAdmitted = await runDivided({ ...args(tight, parts, 12_000), adapter: bigPrompt });
	assert.deepEqual(notAdmitted.handling.notCovered.map(n => n.part), ['combine']);
	assert.equal(notAdmitted.covered.length, 3);

	// Combine terminates: six summaries and groups of two take three stages (6 -> 3 -> 2 -> 1).
	const six = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'].map(k => block(k, 4_100));
	const staged = scripted((prompt, kind) => (kind === 'combine' ? okCombine(prompt) : okPart(prompt)));
	const done = await runDivided(args(staged, six, 6_000));
	assert.equal(done.covered.length, 6);
	assert.equal(done.handling.combineStages, 3);
	assert.equal(staged.prompts.filter(p => p.startsWith('COMBINE')).length, 3 + 2 + 1);
	assert.equal(staged.maxInFlight(), 1);
});

test('terminal precedence by cause (unadmittable, invalid-reply, call-failed) with partFailures kinds and cause chains', async () => {
	const fat = (key: string): EvidenceBlock => ({ key, envelope: { params: { blob: 'p'.repeat(9_000) } }, text: 'x'.repeat(20_000) });
	const catchTyped = async (run: Run, blocks: readonly EvidenceBlock[]): Promise<ShaperAnswerStepFailedError> => {
		try { await runDivided(args(run, blocks, 12_000, { maxAttempts: 1, upstream: [{ taskId: 't1', template: 'x', params: {}, value: 1 }] })); } catch (err) {
			assert.ok(err instanceof ShaperAnswerStepFailedError);
			return err;
		}
		throw new Error('expected a typed failure');
	};

	// Every uncovered part unadmittable: a budget error that carries the results, the report and the upstream inputs.
	const never = scripted(() => okPart(''));
	const budget = await catchTyped(never, [fat('a'), fat('b')]);
	assert.ok(budget instanceof HandlingBudgetError);
	assert.equal(budget.reason, 'input-does-not-fit');
	assert.deepEqual(budget.partFailures?.map(p => p.kind), ['unadmittable', 'unadmittable']);
	assert.equal(never.prompts.length, 0, 'nothing unadmittable is sent');
	assert.equal(budget.upstream?.[0]?.taskId, 't1');
	assert.deepEqual(budget.found.report.handling?.notCovered.map(n => n.part), ['block a', 'block b']);

	// Unadmittable mixed with invalid replies: invalid-answer, not a budget error.
	const invalid = scripted(() => new ModelResponseShapeError('reply failed validation', ['bad']));
	const mixed = await catchTyped(invalid, [fat('a'), block('ok', 500)]);
	assert.equal(mixed.constructor, ShaperAnswerStepFailedError);
	assert.equal(mixed.reason, 'invalid-answer');
	assert.deepEqual(mixed.partFailures?.map(p => p.kind).sort(), ['invalid-reply', 'unadmittable']);

	// Any failed call: model-failed, each part with its kind and cause chain (outer and inner messages).
	const down = scripted(() => new ModelCallFailedError('vibe exited with 1.', { cause: new Error('socket closed') }));
	const failed = await catchTyped(down, [block('p', 500), block('q', 8_000)]);
	assert.equal(failed.reason, 'model-failed');
	assert.ok(failed.partFailures?.every(p => p.kind === 'call-failed'));
	assert.equal(failed.partFailures?.[0]?.cause?.message.includes('vibe exited with 1.'), true);
	assert.equal(failed.partFailures?.[0]?.cause?.cause?.message, 'socket closed');
	assert.match(failed.found.report.handling?.notCovered[0]?.reason ?? '', /vibe exited with 1\./);

	// A thrown schema-invalid error is invalid-reply even next to an unadmittable part, and a call failure outranks both.
	const both = scripted(prompt => (prompt.includes('MARK-q') ? new ModelCallFailedError('claude exited with 1.') : new ModelResponseShapeError('x', ['bad'])));
	const precedence = await catchTyped(both, [block('p', 500), block('q', 11_400), fat('z')]);
	assert.equal(precedence.reason, 'model-failed');
	assert.deepEqual(precedence.partFailures?.map(p => p.kind).sort(), ['call-failed', 'invalid-reply', 'unadmittable']);
});

test('bundle and aggregate adapters keep evidence layers and findings exactly through several combine stages', async () => {
	const blocks = ['e1', 'e2', 'e3', 'e4', 'e5'].map(k => block(k, 4_100));
	const run = scripted((prompt, kind) => (kind === 'combine' ? okCombine(prompt) : okPart(prompt)));
	const result = await runDivided(args(run, blocks, 6_000));
	assert.equal(result.covered.length, 5);
	assert.ok((result.handling.combineStages ?? 0) >= 2, 'several combine stages');

	const layers = assembleBundle('docs', result.covered, result.combine);
	// The narrative is the final combine's; the evidence layers are the parts' own, by ordinal, under their headings.
	assert.deepEqual([layers.system, layers.focus], ['S', 'F']);
	assert.match(layers.summary, /^combined\(/);
	const headings = [...layers.structure.matchAll(/^### (part \d+: \S+)$/gm)].map(m => m[1]);
	assert.deepEqual(headings, result.covered.map(c => c.id));
	for (const key of ['e1', 'e2', 'e3', 'e4', 'e5']) assert.ok(layers.structure.includes(`- ${key}`));
	assert.ok(layers.structure.indexOf('- e1') < layers.structure.indexOf('- e5'));
	// Related docs lists docs/shared.md once, though every part named it, and every part's own file once.
	assert.equal(layers.surface.split('docs/shared.md').length - 1, 1);
	for (const key of ['e1', 'e2', 'e3', 'e4', 'e5']) assert.equal(layers.surface.split(`docs/${key}.md`).length - 1, 1);

	// Without a combine the summaries are the parts' own, joined by ordinal.
	assert.equal(assembleBundle('docs', result.covered, undefined).summary.split('\n\n').length, 5);

	// A single part is returned as it is, with no part heading.
	const only = assembleBundle('docs', [result.covered[0] as (typeof result.covered)[number]], undefined);
	assert.equal(only.structure, result.covered[0]?.reply.structure);

	// Aggregate: the findings are concatenated in ordinal order, each keeping its sources; the summary is the combine's.
	const parts = [1, 2, 3].map(n => ({ id: `part ${n}`, ordinal: n - 1, reply: { summary: `s${n}`, findings: [{ title: `t${n}`, detail: `d${n}`, sources: [`t0${n}`] }] } }));
	const agg = assembleAggregate(parts, { summary: 'final' });
	assert.equal(agg.summary, 'final');
	assert.deepEqual(agg.findings, parts.flatMap(p => p.reply.findings));
	assert.equal(assembleAggregate(parts, undefined).summary, 's1\n\ns2\n\ns3');
});

test('mixed oversized-envelope and admissible blocks return the covered parts with the oversized block in notCovered', async () => {
	const fat: EvidenceBlock = { key: 'fat', envelope: { params: { blob: 'p'.repeat(9_000) } }, text: 'x'.repeat(20_000) };
	const run = scripted((prompt, kind) => (kind === 'combine' ? okCombine(prompt) : okPart(prompt)));
	const result = await runDivided(args(run, [block('g1', 4_000), fat, block('g2', 4_000), block('g3', 7_000)], 12_000));
	assert.deepEqual(result.covered.flatMap(c => keysIn(`[${c.reply.structure.split('\n').map(l => l.slice(2)).join(', section 1 of 1] [')}, section 1 of 1]`)), ['g1', 'g2', 'g3']);
	assert.equal(result.handling.notCovered.length, 1);
	assert.equal(result.handling.notCovered[0]?.part, 'block fat');
	assert.match(result.handling.notCovered[0]?.reason ?? '', /envelope of block 'fat'/);
	assert.ok(!run.prompts.some(p => p.includes('MARK-fat') || p.includes('blob')), 'the oversized block is never sent');
});
