/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-call progress from the code review (ISSUE-1973e125, t2): runCodeReview
 * reports each review pipeline call of a dimension as it starts, so a long
 * review is seen to progress. Recorded answers stand in for the model.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/call-progress.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { LLMMessage, LLMProvider, StructuredCompletionOpts, StructuredSchema } from '../../../shared/types.js';
import { enveloped } from '../../review-pipeline/__tests__/enveloped.js';
import { ADHERENCE_FINDINGS_SCHEMA, judgeAdherence } from '../dimensions/adherence.js';
import { CONVENTIONS_FINDINGS_SCHEMA } from '../dimensions/conventions.js';
import { COVERAGE_FINDINGS_SCHEMA } from '../dimensions/coverage.js';
import { QUALITY_FINDINGS_SCHEMA } from '../dimensions/quality.js';
import { DEFAULT_DEPS, runCodeReview } from '../runner.js';
import type { CodeReviewProgress } from '../runner.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../types.js';

const subject: CodeReviewSubject = {
	repoPath: '/tmp/insrc-call-progress', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/a.ts'],
	// An approved LLD, so adherence has a contract to judge against and makes its call.
	approvedLld: {
		meta: { epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', epicSlug: 'slug', createdAt: '2026-10-20T00:00:00.000Z', epicCreatedAt: '2026-10-20T00:00:00.000Z' },
		body: {},
	} as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null,
	buildRecord: { changedFiles: ['src/a.ts'] } as CodeReviewSubject['buildRecord'],
};
const grounding = {
	symbols: [{ entityId: 'e1', name: 'placeOrder', kind: 'function', file: 'src/a.ts', startLine: 1, endLine: 9, signature: 'placeOrder()', callers: [], callees: [], testsReaching: [] }],
} as unknown as CodeReviewGrounding;
const ANSWERS = new Map<unknown, unknown>([
	[ADHERENCE_FINDINGS_SCHEMA, { findings: [] }],
	[CONVENTIONS_FINDINGS_SCHEMA, { findings: [] }],
	[COVERAGE_FINDINGS_SCHEMA, { findings: [] }],
	[QUALITY_FINDINGS_SCHEMA, { findings: [] }],
]);

/** A provider answering from ANSWERS; `log` records each call. */
function provider(log: string[]): LLMProvider {
	return {
		completeStructured: async (_m: LLMMessage[], schema: StructuredSchema, _o?: StructuredCompletionOpts) => {
			const inner = (schema as unknown as { properties: { answer: unknown } }).properties.answer;
			log.push('model call');
			if (!ANSWERS.has(inner)) throw new Error('no recorded answer for this schema');
			return enveloped(schema, ANSWERS.get(inner));
		},
	} as unknown as LLMProvider;
}

test("runCodeReview emits a 'call' progress per pipeline call of a dimension, with stage, role and count in detail, between its dimension-start and dimension-done", async () => {
	const log: string[] = [];
	const frames: CodeReviewProgress[] = [];
	const out = await runCodeReview(subject, provider(log), {
		runId: 'r', modelLabel: 'test',
		onProgress: (f) => { frames.push(f); if (f.phase === 'call') log.push(`call ${f.dimension}`); },
	}, { judges: DEFAULT_DEPS.judges, assembleGrounding: async () => grounding, write: () => {} });
	assert.ok(out.ok, out.ok ? '' : out.error);

	// Each model call is preceded by its own 'call' frame.
	const modelCalls = log.filter(l => l === 'model call').length;
	assert.ok(modelCalls >= 4, `the four model dimensions each made a call (${modelCalls})`);
	assert.equal(log.filter(l => l.startsWith('call ')).length, modelCalls, 'one call frame per model call');
	for (let i = 0; i < log.length; i++) {
		if (log[i] === 'model call') assert.match(log[i - 1] ?? '', /^call /, `model call #${i} follows its call frame`);
	}

	// Each call frame sits between its dimension's start and done, and counts within the dimension.
	let open: string | undefined;
	const counts = new Map<string, number>();
	for (const f of frames) {
		if (f.phase === 'dimension-start') open = f.dimension;
		else if (f.phase === 'dimension-done') open = undefined;
		else if (f.phase === 'call') {
			assert.equal(f.dimension, open, 'inside its own dimension');
			const n = (counts.get(f.dimension!) ?? 0) + 1;
			counts.set(f.dimension!, n);
			assert.match(f.detail ?? '', new RegExp(`^\\S+ \\S+ #${n}$`), `stage, role and count: ${f.detail}`);
		}
	}
	assert.deepEqual([...counts.keys()], ['adherence', 'conventions', 'coverage', 'quality']);
	assert.match(frames.find(f => f.phase === 'call')!.detail!, /^judge /, 'the stage is named');
});

test("runDimensionJob forwards JudgeContext.onCall to runReviewJob's onCall; without it the job runs as today", async () => {
	const log: string[] = [];
	const seen: { stage: string; role: string }[] = [];
	const told = await judgeAdherence(subject, grounding, provider(log), { groundingMode: 'full', onCall: (c) => { seen.push({ stage: c.stage, role: c.role }); log.push('onCall'); } });
	assert.ok(seen.length >= 1, 'told of the call');
	assert.deepEqual(log.filter(l => l !== 'onCall').length, seen.length, 'once per model call');
	assert.equal(log[0], 'onCall', 'before the call is made');

	const quiet: string[] = [];
	const plain = await judgeAdherence(subject, grounding, provider(quiet), { groundingMode: 'full' });
	assert.equal(quiet.length, seen.length, 'the same calls without onCall');
	assert.deepEqual(plain, told, 'the same result');
});
