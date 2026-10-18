/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-aef82b03 S001/t4 — the review job core: one call with today's prompt
 * when it fits (or the budget is unknown); otherwise MAP calls over the cross
 * product of clause and symbol batches, every one within the budget and every
 * atom read whole; a refused call re-planned and never resent; findings merged.
 * A toy strategy and a fake provider that answers from what each prompt holds.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/review-job.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { InputTooLargeError } from '../../../agent/providers/cli-provider.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import {
	applyAnswer, createReviewJob, jobResult, nextCalls, promptChars, RETRY_NOTE_RESERVE_CHARS, runReviewJob,
	type Atom, type DimensionStrategy,
} from '../review-job.js';
import type { DimensionFinding } from '../types.js';

const SCHEMA = { type: 'object', required: ['findings'], properties: { findings: { type: 'array' } } } as const;

const symbol = (i: number, size = 400): Atom => ({ id: `sym${i}`, label: `src/f${i}.ts#fn${i}`, data: { id: `sym${i}`, body: `body-${i}-${'x'.repeat(size)}` } });
const clause = (i: number, size = 300): Atom => ({ id: `cl${i}`, label: `LLD 2.${i}`, data: { id: `cl${i}`, text: `clause-${i}-${'y'.repeat(size)}` } });

function strategy(symbols: readonly Atom[], context: readonly Atom[] = []): DimensionStrategy {
	const findingsOf = (output: unknown): DimensionFinding[] => (output as { findings: DimensionFinding[] }).findings;
	return {
		dimension: 'quality',
		whole: {
			messages: note => [
				{ role: 'system', content: `Judge the whole Story.${note !== undefined ? ` Correction: ${note}` : ''}` },
				{ role: 'user', content: JSON.stringify({ symbols: symbols.map(s => s.data), clauses: context.map(c => c.data) }) },
			],
			schema: SCHEMA as never,
			toFindings: findingsOf,
		},
		symbols, context,
		map: {
			messages: (syms, ctx) => [
				{ role: 'system', content: 'Judge these symbols against these clauses; report no absence findings.' },
				{ role: 'user', content: JSON.stringify({ symbols: syms.map(s => s.data), clauses: ctx.map(c => c.data) }) },
			],
			schema: SCHEMA as never,
			toOutput: output => ({ findings: findingsOf(output) }),
		},
	};
}

/** The prompt exactly as the CLI receives it (cli-provider serialiseMessages). */
const asSent = (messages: readonly LLMMessage[]): string =>
	messages.map(m => (m.role === 'system' ? '## System\n' : '') + (m.content as string)).join('\n\n');

/** A provider that answers one finding per symbol id in the prompt, recording every prompt as sent; refuses prompts over `refuseOver` (reporting it unless `silent`). */
function fakeProvider(budget: number | undefined, refuseOver?: number, silent = false): { provider: LLMProvider; prompts: string[] } {
	const prompts: string[] = [];
	const provider = {
		inputBudgetChars: budget,
		completeStructured: async (messages: LLMMessage[]) => {
			const text = asSent(messages);
			assert.equal(text.length, promptChars(messages), 'promptChars measures what the CLI receives');
			prompts.push(text);
			if (refuseOver !== undefined && text.length > refuseOver) {
				throw new InputTooLargeError('codex exited with 1. too large', 'input_too_large', silent ? {} : { maxChars: refuseOver, actualChars: text.length });
			}
			const ids = [...text.matchAll(/"id":"(sym\d+)"/g)].map(m => m[1]!);
			return { findings: ids.map(id => ({ dimension: 'quality', severity: 'LOW', location: `src/${id}.ts:1`, message: `seen ${id}` })) };
		},
	} as unknown as LLMProvider;
	return { provider, prompts };
}

test("a fitting dimension, or an unknown budget, is one call with today's prompt and schema", async () => {
	const small = strategy([symbol(1), symbol(2)], [clause(1)]);
	const job = createReviewJob(small, 1_048_576);
	const calls = nextCalls(job);
	assert.equal(calls.length, 1);
	assert.equal(calls[0]!.stage, 'whole');
	assert.deepEqual(calls[0]!.messages, small.whole.messages(undefined), "today's prompt, byte for byte");
	assert.equal(calls[0]!.schema, small.whole.schema);

	// A Story far over any budget, with the budget unknown: still one whole call.
	const big = strategy(Array.from({ length: 500 }, (_, i) => symbol(i)));
	const unknown = createReviewJob(big, undefined);
	assert.deepEqual(nextCalls(unknown).map(c => c.stage), ['whole']);

	const { provider, prompts } = fakeProvider(undefined);
	const result = await runReviewJob(small, provider);
	assert.equal(prompts.length, 1);
	assert.equal(result.findings.length, 2);
	assert.equal(result.parts, undefined, 'one call records no parts');

	// A whole prompt that fits the provider's budget but not the budget less the retry reserve: still today's one call.
	const near = strategy(Array.from({ length: 50 }, (_, i) => symbol(i)));
	const chars = promptChars(near.whole.messages(undefined));
	const nearJob = createReviewJob(near, chars + RETRY_NOTE_RESERVE_CHARS - 1);
	assert.deepEqual(nextCalls(nearJob).map(c => c.stage), ['whole']);
});

test('every call the job issues fits the budget at every stage, for a Story many times the budget', async () => {
	const s = strategy(Array.from({ length: 300 }, (_, i) => symbol(i)), Array.from({ length: 40 }, (_, i) => clause(i)));
	const providerBudget = 30_000;
	assert.ok(promptChars(s.whole.messages(undefined)) > 4 * providerBudget, 'the whole prompt is several times the budget');
	const { provider, prompts } = fakeProvider(providerBudget);
	const result = await runReviewJob(s, provider);
	assert.ok(prompts.length > 4);
	for (const p of prompts) assert.ok(p.length <= providerBudget - RETRY_NOTE_RESERVE_CHARS, `a ${p.length}-character prompt`);
	assert.ok(result.parts !== undefined && result.parts.map === prompts.length);
});

test('every original symbol summary and clause is read whole by some call', async () => {
	const symbols = Array.from({ length: 120 }, (_, i) => symbol(i, 700));
	// One clause takes most of the budget: more than half of it, yet it fits beside a small symbol.
	const clauses = [...Array.from({ length: 30 }, (_, i) => clause(i, 500)), clause(99, 14_000)];
	const s = strategy(symbols, clauses);
	const { provider, prompts } = fakeProvider(25_000);
	await runReviewJob(s, provider);
	for (const a of [...symbols, ...clauses]) {
		const whole = JSON.stringify(a.data);
		assert.ok(prompts.some(p => p.includes(whole)), `${a.label} is read whole by some call`);
	}
	// Every symbol meets every clause: in some call, both are present.
	for (const a of symbols) for (const c of clauses) {
		assert.ok(prompts.some(p => p.includes(JSON.stringify(a.data)) && p.includes(JSON.stringify(c.data))), `${a.label} meets ${c.label}`);
	}
	for (const p of prompts) assert.ok(p.length <= 25_000 - RETRY_NOTE_RESERVE_CHARS || p.includes('"clauses":[{'));

	// With no context: a symbol larger than the reserved budget but within the provider's is judged
	// in its own call (as today's single call would be), never dropped; one larger than the provider's
	// whole budget is named, not dropped.
	const providerBudget = 30_000;
	const big = symbol(900, 24_000);
	const plain = strategy([...Array.from({ length: 60 }, (_, i) => symbol(i)), big]);
	const solo = fakeProvider(providerBudget);
	const judged = await runReviewJob(plain, solo.provider);
	assert.ok(judged.findings.some(f => f.location === 'src/sym900.ts:1'), 'the large symbol is judged');
	assert.ok(solo.prompts.every(p => p.length <= providerBudget));
	const tooBig = strategy([...Array.from({ length: 60 }, (_, i) => symbol(i)), symbol(901, 40_000)]);
	await assert.rejects(runReviewJob(tooBig, fakeProvider(providerBudget).provider), (e: unknown) => e instanceof Error && e.name === 'AtomTooLargeError' && e.message.includes('src/f901.ts#fn901'));

	// A clause larger than the reserved budget, which fits the provider's beside each small symbol:
	// read whole, beside every symbol, never refused for the reserve.
	const wideClause = clause(98, 24_000);
	const few = Array.from({ length: 60 }, (_, i) => symbol(i));
	const wide = fakeProvider(providerBudget);
	await runReviewJob(strategy(few, [clause(1), wideClause]), wide.provider);
	assert.ok(wide.prompts.every(p => p.length <= providerBudget));
	for (const a of few) {
		assert.ok(wide.prompts.some(p => p.includes(JSON.stringify(a.data)) && p.includes(JSON.stringify(wideClause.data))), `${a.label} meets the wide clause`);
	}
	// The wide clause's calls are packed with symbols up to the provider's budget, not one call per symbol.
	const besideWide = wide.prompts.filter(p => p.includes(JSON.stringify(wideClause.data)));
	assert.ok(besideWide.length < few.length / 4, `${besideWide.length} calls beside the wide clause`);
});

test('a refused call is re-planned and the job completes, sending no prompt twice', async () => {
	const symbols = Array.from({ length: 200 }, (_, i) => symbol(i));
	const s = strategy(symbols, [clause(1)]);
	// The budget is unknown (as for claude); the model refuses any prompt over 20,000 characters.
	const { provider, prompts } = fakeProvider(undefined, 20_000);
	const result = await runReviewJob(s, provider);
	assert.equal(new Set(prompts).size, prompts.length, 'no prompt was sent twice');
	assert.ok(prompts.length > 2);
	const seen = new Set(result.findings.map(f => f.location));
	for (const a of symbols) assert.ok(seen.has(`src/${a.id}.ts:1`), `${a.id} was judged`);

	// The same with a reported budget, and a refusal below what the provider claimed.
	const lying = fakeProvider(60_000, 20_000);
	const again = await runReviewJob(s, lying.provider);
	assert.equal(new Set(lying.prompts).size, lying.prompts.length);
	assert.equal(new Set(again.findings.map(f => f.location)).size, symbols.length);

	// A refusal that reports no size (halves), on calls whose clause batch itself must split.
	const clauses = Array.from({ length: 40 }, (_, i) => clause(i, 600));
	const withClauses = strategy(Array.from({ length: 30 }, (_, i) => symbol(i)), clauses);
	const silent = fakeProvider(60_000, 15_000, true);
	const halved = await runReviewJob(withClauses, silent.provider);
	assert.equal(new Set(silent.prompts).size, silent.prompts.length, 'no prompt sent twice');
	assert.equal(new Set(halved.findings.map(f => f.location)).size, 30, 'every symbol judged');
	for (const c of clauses) assert.ok(silent.prompts.some(p => p.length <= 15_000 && p.includes(JSON.stringify(c.data))), `${c.label} read in an accepted call`);

	// An indivisible symbol within the reported limit but over it less the reserve: judged, not refused.
	const large = symbol(500, 15_000);
	const limited = fakeProvider(undefined, 20_000);
	const judged = await runReviewJob(strategy([...Array.from({ length: 40 }, (_, i) => symbol(i)), large]), limited.provider);
	assert.equal(new Set(limited.prompts).size, limited.prompts.length, 'no prompt sent twice');
	assert.ok(judged.findings.some(f => f.location === 'src/sym500.ts:1'), 'the large symbol is judged');
	// One over the reported limit is named, not resent.
	const over = fakeProvider(undefined, 20_000);
	await assert.rejects(runReviewJob(strategy([...Array.from({ length: 40 }, (_, i) => symbol(i)), symbol(501, 25_000)]), over.provider),
		(e: unknown) => e instanceof Error && e.name === 'AtomTooLargeError' && e.message.includes('src/f501.ts#fn501'));
	assert.equal(new Set(over.prompts).size, over.prompts.length, 'no prompt sent twice');
});

test('identical findings merge once; findings differing in any field are all kept', () => {
	const s = strategy([symbol(1), symbol(2)]);
	let job = createReviewJob(s, 1_048_576);
	const base = { dimension: 'quality', severity: 'LOW', location: 'src/a.ts:1', message: 'm' } as const;
	job = applyAnswer(job, s, nextCalls(job)[0]!.callId, { findings: [
		base, { ...base },
		{ ...base, severity: 'HIGH' },
		{ ...base, counterpartRef: 'src/b.ts#g' },
		{ ...base, symbolId: 'sym2' },
		{ ...base, confidence: 'observation' },
	] });
	const result = jobResult(job);
	assert.equal(result.findings.length, 5, 'the exact duplicate once; every variant kept');
	assert.ok(result.findings.some(f => f.severity === 'HIGH'), 'a HIGH is never merged into a LOW');
});
