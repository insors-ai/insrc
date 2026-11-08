/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review round 1 of Story s3 on the step tool's answer progress: a single-mode reply is a finished answer, a failure
 * keeps the report derived from the lookups, and a turn that does not fit as rendered is a typed failure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { currentTurn, recordInvalid, startAnswerProgress } from '../../../analyze/context/answer-progress.js';
import type { AnswerProgress } from '../../../analyze/context/answer-progress.js';
import { finalizeSynthesize } from '../../../analyze/context/synthesizer.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from '../../../analyze/context/answer-step-error.js';
import { buildCompleteness } from '../../../analyze/completeness.js';
import type { ExecutedExploration, ExecutedPlan } from '../../../analyze/explore/types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const LAYERS = { system: 'sys', focus: 'f', summary: 'a summary', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };

function search(id: string, size: number): ExecutedExploration {
	return {
		exploration: { id, type: 'search.text', purpose: 'p', params: {} },
		output: { completeness: WHOLE, type: 'search.text', hits: [{ file: `src/${id}.ts`, line: 1, snippet: `code ${'c'.repeat(size)}` }] },
		cached: false, elapsedMs: 1,
	} as unknown as ExecutedExploration;
}
const failedLookup = (id: string): ExecutedExploration => ({
	exploration: { id, type: 'search.text', purpose: 'p', params: {} },
	output: { type: 'failed', requested: 'search.text', errorCode: 'runtime-error', message: 'the search broke' }, cached: false, elapsedMs: 1,
} as unknown as ExecutedExploration);
const plan = (results: ExecutedExploration[]): ExecutedPlan =>
	({ plan: { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: results.map(r => r.exploration) }, results, totalMs: 1, totalCached: 0 }) as unknown as ExecutedPlan;
const intent: ClassifiedIntent = { target: 'code', scope: 'S', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'r' };

test('a single-mode reply is a finished answer carrying how it was handled', () => {
	const executed = plan([search('e1', 100)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'S');
	assert.equal(progress.mode, 'single');
	const done = finalizeSynthesize(LAYERS, undefined, progress, { executed });
	assert.equal(done.kind, 'final');
	if (done.kind === 'final') {
		assert.deepEqual(done.layers, LAYERS);
		assert.equal(done.handling.method, 'single-pass');
	}
});

test('the failure of a divided answer keeps the report derived from the lookups, not a complete one', () => {
	const executed = plan([failedLookup('e1'), search('e2', 40_000), search('e3', 40_000)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	assert.ok(progress.parts.length >= 2, 'the evidence is divided');
	let current: AnswerProgress = progress;
	let thrown: unknown;
	for (let i = 0; i < progress.parts.length + 1 && thrown === undefined; i++) {
		try {
			const out = recordInvalid(current, 'not a bundle', 1, { executed });
			if (out.kind !== 'next') break;
			current = out.progress;
		} catch (e) { thrown = e; }
	}
	assert.ok(thrown instanceof ShaperAnswerStepFailedError, String(thrown));
	assert.equal(thrown.found.report.completeness.complete, false, 'the failed lookup is in the report');
	assert.ok(thrown.partFailures?.length === progress.parts.length, 'every part is named');
});

test('a turn that does not fit as rendered is a typed failure, not a call the client would refuse', () => {
	const executed = plan([search('e1', 40_000), search('e2', 40_000)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	assert.ok(progress.limit !== undefined);
	assert.equal(currentTurn(progress, { intent, executed, target: 'code' }).kind, 'part', 'the planned turn is admitted');
	const squeezed: AnswerProgress = { ...progress, limit: { ...progress.limit, limit: 100 } };
	assert.throws(() => currentTurn(squeezed, { intent, executed, target: 'code' }), HandlingBudgetError);
});
