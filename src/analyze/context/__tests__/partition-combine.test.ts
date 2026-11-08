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
import { MAX_DIVISIONS, runDivided, runHandled } from '../handling-parts.js';
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
	const exhausted = await runDivided(args(stuck, [huge, block('small', 100)], 12_000, { maxAttempts: 1 })).then(() => undefined, (e: unknown) => e);
	assert.ok(exhausted instanceof ShaperAnswerStepFailedError);
	const depths = (exhausted.partFailures ?? []).map(p => (p.part.match(/(?:\.\d+)+$/)?.[0].split('.').length ?? 1) - 1);
	assert.equal(Math.max(...depths), MAX_DIVISIONS, 'a part is divided three times and no more');
	assert.ok(depths.filter(d => d === MAX_DIVISIONS).length >= 2, 'the halves of a divided part are each recorded');
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

	// Aggregate: run through real combine stages; the findings are the parts' own, in ordinal order, each keeping its sources.
	interface AggReply { summary: string; findings: { title: string; detail: string; sources: string[] }[] }
	const aggAdapter: PartAdapter<AggReply, { summary: string }> = {
		partSchema: PART_SCHEMA, combineSchema: COMBINE_SCHEMA,
		renderPart: (part, round) => [{ role: 'user', content: `PART ${part.id}\nREF:${round.rendered}\n${part.sections.map(renderSection).join('\n\n')}` }],
		renderCombine: s => [{ role: 'user', content: `COMBINE ${s.map(x => x.summary).join('|')}` }],
		summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
	};
	const aggRun = scripted((prompt, kind) => (kind === 'combine'
		? { summary: `merged[${prompt.split('|').length}]` }
		: { summary: `s:${keysIn(prompt).join(',')}`, findings: keysIn(prompt).map(k => ({ title: `T ${k}`, detail: `D ${k}`, sources: [`task-${k}`] })) }));
	const aggResult = await runDivided<AggReply, { summary: string }>({
		...args(aggRun, ['f1', 'f2', 'f3', 'f4', 'f5'].map(k => block(k, 4_100)), 6_000), adapter: aggAdapter,
	});
	assert.ok((aggResult.handling.combineStages ?? 0) >= 2, 'several combine stages');
	const agg = assembleAggregate(aggResult.covered, aggResult.combine);
	assert.match(agg.summary, /^merged\[/);
	assert.deepEqual(agg.findings.map(f => f.title), ['f1', 'f2', 'f3', 'f4', 'f5'].map(k => `T ${k}`), 'every finding, in ordinal order, none read from a combine');
	assert.deepEqual(agg.findings.map(f => f.sources[0]), ['f1', 'f2', 'f3', 'f4', 'f5'].map(k => `task-${k}`), 'each finding keeps its sources');

	const parts = [1, 2, 3].map(n => ({ id: `part ${n}`, ordinal: n - 1, reply: { summary: `s${n}`, findings: [{ title: `t${n}`, detail: `d${n}`, sources: [`t0${n}`] }] } }));
	const direct = assembleAggregate(parts, { summary: 'final' });
	assert.equal(direct.summary, 'final');
	assert.deepEqual(direct.findings, parts.flatMap(p => p.reply.findings));
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

test('a single pass keeps the legacy route: the original error is thrown as it is, and a size refusal of an admitted pass divides', async () => {
	const messages: LLMMessage[] = [{ role: 'user', content: 'a small question' }];
	const common = { target: cli(12_000), adapter, blocks: [block('g1', 4_000), block('g2', 4_000)], reference: [], found: FOUND, maxAttempts: 2, singleMessages: messages, singleSchema: PART_SCHEMA } as const;

	// Admitted at size S: one call, single-pass handling.
	const ok = scripted(prompt => okPart(prompt));
	const single = await runHandled<Reply, Narrative>({ ...common, provider: ok.provider, size: 'S' });
	assert.equal(single.kind, 'single');
	assert.equal(single.handling.method, 'single-pass');
	assert.equal(ok.prompts.length, 1);

	// A failed single pass throws the original error itself (a transport failure, then an invalid reply), not a typed one.
	const outage = new ModelCallFailedError('claude exited with 1.', { cause: new Error('socket closed') });
	await assert.rejects(runHandled<Reply, Narrative>({ ...common, provider: scripted(() => outage).provider, size: 'S' }), (err: unknown) => err === outage);
	const bad = new ModelResponseShapeError('reply failed validation', ['bad']);
	await assert.rejects(runHandled<Reply, Narrative>({ ...common, provider: scripted(() => bad).provider, size: 'S' }), (err: unknown) => err === bad);

	// The table divides M; the rule divides an input that is not admitted (trigger 'fit').
	const table = await runHandled<Reply, Narrative>({ ...common, provider: scripted((p, k) => (k === 'combine' ? okCombine(p) : okPart(p))).provider, size: 'M' });
	assert.equal(table.kind, 'divided');
	assert.equal(table.kind === 'divided' ? table.handling.trigger : '', 'size');
	const big: LLMMessage[] = [{ role: 'user', content: 'q'.repeat(13_000) }];
	const fit = await runHandled<Reply, Narrative>({ ...common, singleMessages: big, provider: scripted((p, k) => (k === 'combine' ? okCombine(p) : okPart(p))).provider, size: 'XS' });
	assert.equal(fit.kind === 'divided' ? fit.handling.trigger : '', 'fit');

	// The provider refusing an admitted single pass as too large divides it too.
	const { InputTooLargeError } = await import('../../../agent/providers/cli-provider.js');
	let first = true;
	const refusing = scripted((p, k) => {
		if (k === 'part' && first && !p.startsWith('PART')) { first = false; return new InputTooLargeError('prompt is too long', 'prompt is too long', { maxChars: 1, actualChars: 2 }); }
		return k === 'combine' ? okCombine(p) : okPart(p);
	});
	const refused = await runHandled<Reply, Narrative>({ ...common, provider: refusing.provider, size: 'S' });
	assert.equal(refused.kind, 'divided');
	assert.equal(refused.kind === 'divided' ? refused.handling.trigger : '', 'fit');
});

test('dedupe drops only a repeated whole entry: distinct files whose names share a prefix or hold spaces are all kept, and the infra family lists are deduped', () => {
	const replyOf = (surface: string, structure = ''): Reply => ({ system: 's', focus: 'f', summary: 'sum', structure, surface, artefacts: '', upstream: '' });
	const part = (id: string, ordinal: number, reply: Reply) => ({ id, ordinal, reply });
	// Distinct paths with spaces: one part, and two parts.
	const spaced = replyOf('## Related docs\ndocs/Model One.md :: One\ndocs/Model Two.md :: Two\ndocs/Model One.md :: One again');
	const one = assembleBundle('docs', [part('part 1', 0, spaced)], undefined);
	assert.deepEqual(one.surface.split('\n').slice(1), ['docs/Model One.md :: One', 'docs/Model Two.md :: Two']);
	const two = assembleBundle('docs', [part('part 1', 0, replyOf('docs/a b.md :: x\ndocs/a c.md :: y')), part('part 2', 1, replyOf('docs/a b.md :: x again\ndocs/a d.md :: z'))], undefined);
	assert.deepEqual(two.surface.split('\n').filter(l => l.startsWith('docs/')), ['docs/a b.md :: x', 'docs/a c.md :: y', 'docs/a d.md :: z']);
	// Infra: overlapping manifests found in two parts are listed once under their family, in the structure layer too.
	const family = (...files: string[]) => `## By family\n### Kubernetes\n${files.map(f => `- Deployment — ${f}`).join('\n')}\n## Diagnostics\nnone`;
	const infra = assembleBundle('infra', [
		part('part 1', 0, replyOf('deploy/a.yaml\ndeploy/b.yaml', family('deploy/a.yaml', 'deploy/b.yaml'))),
		part('part 2', 1, replyOf('deploy/b.yaml\ndeploy/c.yaml', family('deploy/b.yaml', 'deploy/c.yaml'))),
	], undefined);
	const listed = infra.structure.split('\n').filter(l => l.startsWith('- Deployment'));
	assert.deepEqual(listed, ['- Deployment — deploy/a.yaml', '- Deployment — deploy/b.yaml', '- Deployment — deploy/c.yaml']);
	assert.deepEqual(infra.surface.split('\n').filter(l => l.startsWith('deploy/')), ['deploy/a.yaml', 'deploy/b.yaml', 'deploy/c.yaml']);
	// A line under Diagnostics is not a deduped list.
	assert.equal(infra.structure.split('\n').filter(l => l === 'none').length, 2);
});

