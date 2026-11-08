/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * synthesize on the shared helper (LLD-b9d5c5c40df5a574-s3, task t8): an XS or
 * S request whose input is admitted makes the one call of today; a larger one,
 * or one that is not admitted, is divided and a failed part is named. The real
 * synthesizer and its real prompt, against a scripted provider. No model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelResponseShapeError } from '../../../agent/providers/model-call-error.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import type { ExecutedPlan } from '../../explore/types.js';
import { ShaperAnswerStepFailedError } from '../driver.js';
import { synthesize, synthesizeHandled } from '../synthesizer.js';

const LAYERS = { system: 'code-shaper', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };

const intent = (scope: ClassifiedIntent['scope']): ClassifiedIntent =>
	({ target: 'code', scope, focused: true, focus: 'how does settlement work', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'r' });

const hit = (i: number, size: number) => ({ file: `src/m${i}.ts`, line: i + 1, snippet: `code${i} ${'c'.repeat(size)}` });
function executed(count: number, size: number): ExecutedPlan {
	const results = Array.from({ length: count }, (_, i) => ({
		exploration: { id: `e${i + 1}`, type: 'search.text', purpose: 'find it', params: {} },
		output: { type: 'search.text', hits: [hit(i, size)] }, cached: false, elapsedMs: 1,
	}));
	return { plan: { answerType: 'how-does-it-work', synthesisHint: 'walk the flow', explorations: results.map(r => r.exploration) }, results, totalMs: 1, totalCached: 0 } as unknown as ExecutedPlan;
}

interface Run { provider: LLMProvider; calls: Array<{ messages: LLMMessage[]; opts: Record<string, unknown> | undefined }> }
function provider(respond: (prompt: string, combine: boolean) => unknown, limitChars = 60_000): Run {
	const calls: Run['calls'] = [];
	const p = {
		inputBudgetChars: 16_000 + limitChars,
		completeStructured: async (messages: LLMMessage[], schema: { required?: string[] }, opts?: Record<string, unknown>) => {
			calls.push({ messages, opts });
			const out = respond(String(messages[1]?.content), (schema.required ?? []).length === 3);
			if (out instanceof Error) throw out;
			return out;
		},
	} as unknown as LLMProvider;
	return { provider: p, calls };
}

test('XS or S admitted makes the one call of today; M or larger or not admitted divides and a failed part is named', async () => {
	// XS and S, admitted: exactly one call, with the system prompt and the user turn it always had.
	for (const size of ['XS', 'S'] as const) {
		const run = provider(() => LAYERS);
		const out = await synthesizeHandled({ runId: 'r', intent: intent(size), executed: executed(2, 500), target: 'code', provider: run.provider });
		assert.equal(run.calls.length, 1, size);
		assert.equal(run.calls[0]?.messages[0]?.role, 'system');
		assert.match(String(run.calls[0]?.messages[1]?.content), /^Classified intent:/);
		assert.match(String(run.calls[0]?.messages[1]?.content), /Compose the AnalyzeContextBundle now\./);
		assert.equal(run.calls[0]?.opts?.['internalRetry'], false);
		assert.deepEqual(out.layers, LAYERS);
		assert.deepEqual(out.handling.method, 'single-pass');
		assert.equal(out.handling.parts, 1);
		// synthesize is the wrapper: it returns the layers alone.
		assert.deepEqual(await synthesize({ runId: 'r', intent: intent(size), executed: executed(2, 500), target: 'code', provider: provider(() => LAYERS).provider }), LAYERS);
	}

	// M divides although the input fits (trigger 'size'); a small size whose input is not admitted divides too ('fit').
	const part = (prompt: string): unknown => ({ ...LAYERS, summary: `covers ${[...prompt.matchAll(/code(\d)/g)].map(m => m[1]).join(',')}` });
	const respond = (prompt: string, combine: boolean): unknown => (combine ? { system: 'S', focus: 'F', summary: 'combined' } : part(prompt));
	const byTable = provider(respond);
	const m = await synthesizeHandled({ runId: 'r', intent: intent('M'), executed: executed(2, 500), target: 'code', provider: byTable.provider });
	assert.equal(m.handling.method, 'partitioned');
	assert.equal(m.handling.trigger, 'size');
	assert.ok(byTable.calls.length >= 1, 'a small M input is one part, answered by the part prompt');
	assert.match(String(byTable.calls[0]?.messages[1]?.content), /THIS PART only/);
	const byFit = provider(respond, 20_000);
	const big = await synthesizeHandled({ runId: 'r', intent: intent('S'), executed: executed(8, 4_500), target: 'code', provider: byFit.provider });
	assert.equal(big.handling.trigger, 'fit');
	assert.ok(big.handling.parts >= 3);
	assert.equal(big.layers.system, 'S');
	for (let i = 0; i < 8; i++) assert.ok(big.layers.structure.includes(`code${i}`) || big.layers.summary.includes('combined'), `evidence ${i}`);

	// A part that never answers validly is named, and the others are kept.
	const failing = provider((prompt, combine) => (combine ? { system: 'S', focus: 'F', summary: 'combined' } : prompt.includes('code3 ') ? new ModelResponseShapeError('reply failed validation', ['bad']) : part(prompt)), 20_000);
	const partial = await synthesizeHandled({ runId: 'r', intent: intent('L'), executed: executed(8, 4_500), target: 'code', provider: failing.provider });
	assert.ok(partial.handling.notCovered.length >= 1);
	assert.ok(partial.handling.notCovered.some(n => /m3\.ts|code3|part/.test(n.part)));
	assert.equal(partial.layers.system, 'S');

	// No part answering: the typed failure, with the results and the report.
	const dead = provider(() => new ModelResponseShapeError('reply failed validation', ['bad']), 20_000);
	await assert.rejects(
		synthesizeHandled({ runId: 'r', intent: intent('L'), executed: executed(3, 4_500), target: 'code', provider: dead.provider }),
		(err: unknown) => err instanceof ShaperAnswerStepFailedError && err.reason === 'invalid-answer' && err.found.report.handling?.method === 'partitioned',
	);
});
