/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for sc2 (S001, Task t5): the CONDITIONAL dimension set. functional-coverage
 * is expected/judged only when the review subject carries a non-empty
 * functionalDefinition; a non-FR subject keeps exactly the base four dimensions.
 * Covers the daemon runner (effectiveJudges + runCodeReview) and the controller
 * handler (expectedDimensions + buildJudgementsSchema).
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/functional-coverage-conditional.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	runCodeReview,
	effectiveJudges,
	DEFAULT_DEPS,
	type CodeReviewRunnerDeps,
	type JudgeSlot,
} from '../runner.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionFinding, DimensionResult, ReviewDimension } from '../types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { expectedDimensions, buildJudgementsSchema } from '../../../mcp/code-review-step/handler.js';

const CREATED = '2026-07-17T07:42:28.275Z';
const EPIC = 'e1a2b3c4d5e6f708';

/** A subject; `withFr` toggles a non-empty functionalDefinition on the approved LLD body. */
const subject = (withFr: boolean): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: 's1', changedFiles: ['src/a.ts'],
	approvedLld: {
		meta: { epicHash: EPIC, storyId: 's1', epicSlug: 'slug', createdAt: CREATED },
		body: withFr ? { functionalDefinition: { requirements: [{ id: `E20260717e1a2b3c4:FR001`, statement: 'x', scope: 'doc' }] } } : {},
	} as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null,
	buildRecord: { changedFiles: ['src/a.ts'] } as CodeReviewSubject['buildRecord'],
});

const grounding: CodeReviewGrounding = { symbols: [] };
const fakeProvider = (): LLMProvider => ({}) as unknown as LLMProvider;

const fcFinding: DimensionFinding = { dimension: 'functional-coverage', severity: 'HIGH', location: 'src/a.ts:1', message: 'FR not realized', expectationRef: 'E20260717e1a2b3c4:FR001' };

/** Injected deps whose judges cover all five dimensions; each returns [] except
 *  functional-coverage which returns a HIGH (only reached when the subject has FRs). */
function makeDeps(): CodeReviewRunnerDeps {
	const dims: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage'];
	const judges: JudgeSlot[] = dims.map((dimension) => ({
		dimension,
		judge: async (): Promise<DimensionResult> =>
			dimension === 'functional-coverage'
				? { dimension, findings: [fcFinding] }
				: { dimension, findings: [] },
	}));
	return { judges, assembleGrounding: async () => grounding, write: () => {} };
}

const opts = { runId: 'r', modelLabel: 'test' };

// ---- effectiveJudges (pure) ----

test('effectiveJudges keeps functional-coverage only for a subject with FRs', () => {
	const deps = makeDeps();
	assert.deepEqual(effectiveJudges(deps.judges, subject(true)).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage']);
	assert.deepEqual(effectiveJudges(deps.judges, subject(false)).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
});

// ---- runCodeReview integration ----

test('runCodeReview: an FR subject runs five dimensions and a functional-coverage HIGH folds to block', async () => {
	const out = await runCodeReview(subject(true), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.equal(out.artifact.body.dimensions.length, 5);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage']);
	assert.equal(out.artifact.body.verdict, 'block');
});

test('runCodeReview: a no-FR subject runs exactly the four base dimensions (absent-safe)', async () => {
	const out = await runCodeReview(subject(false), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.equal(out.artifact.body.dimensions.length, 4);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
	assert.equal(out.artifact.body.verdict, 'pass'); // functional-coverage HIGH never ran
});

test('DEFAULT_DEPS carries the functional-coverage slot (conditional at run time)', () => {
	// functional-coverage precedes diagram (sc4 — S003), both conditional at run time.
	const dims = DEFAULT_DEPS.judges.map(j => j.dimension);
	assert.deepEqual(dims.slice(0, 5), ['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage']);
});

// ---- handler expectedDimensions + schema ----

test('expectedDimensions appends functional-coverage only with FRs; schema enum + arity follow', () => {
	assert.deepEqual(expectedDimensions(subject(false)), ['adherence', 'conventions', 'coverage', 'quality']);
	assert.deepEqual(expectedDimensions(subject(true)), ['adherence', 'conventions', 'coverage', 'quality', 'functional-coverage']);

	const schemaFive = buildJudgementsSchema(expectedDimensions(subject(true))) as { properties: { judgements: { minItems: number; maxItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(schemaFive.properties.judgements.minItems, 5);
	assert.equal(schemaFive.properties.judgements.maxItems, 5);
	assert.ok(schemaFive.properties.judgements.items.properties.dimension.enum.includes('functional-coverage'));

	const schemaFour = buildJudgementsSchema(expectedDimensions(subject(false))) as { properties: { judgements: { minItems: number; maxItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(schemaFour.properties.judgements.minItems, 4);
	assert.ok(!schemaFour.properties.judgements.items.properties.dimension.enum.includes('functional-coverage'));
});
