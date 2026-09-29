/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) — the CONDITIONAL first-class 'ux' dimension end-to-end. Mirrors
 * diagram-conditional.test.ts: effectiveJudges + expectedDimensions +
 * buildJudgementsSchema include 'ux' only when hasUxAcceptance; expectedDimensions
 * UNIONS the recorded adherence selection so a declared-but-uncontented dimension is
 * still enforced (ac3); runCodeReview folds a DimensionResult{ux} into the un-forked
 * verdict (block for a required-but-missing UX design); a subject with neither
 * uxDefinition nor adherence runs exactly the base four; DEFAULT_JUDGES carries the
 * 'ux' slot last. ac2/ac3.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/code-review/__tests__/ux-conditional.test.ts
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
import { judgeUx } from '../dimensions/ux/index.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, ReviewDimension } from '../types.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { UxDefinition } from '../../artifacts/companion/ux.js';
import type { AdherenceSelection } from '../../artifacts/companion/adherence.js';
import { expectedDimensions, buildJudgementsSchema } from '../../../mcp/code-review-step/handler.js';

const CREATED = '2026-07-17T07:42:28.275Z';
const EPIC = 'e1a2b3c4d5e6f708';

const validUx: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };

/** A subject whose approved LLD body carries the given uxDefinition/adherence. */
function subject(body: { uxDefinition?: UxDefinition; adherence?: AdherenceSelection }): CodeReviewSubject {
	return {
		repoPath: '/repo', epicHash: EPIC, storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: {
			meta: { epicHash: EPIC, storyId: 's1', epicSlug: 'slug', createdAt: CREATED },
			body,
		} as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null,
		buildRecord: { changedFiles: ['src/a.ts'] } as CodeReviewSubject['buildRecord'],
	};
}

const grounding: CodeReviewGrounding = { symbols: [] };
const fakeProvider = (): LLMProvider => ({}) as unknown as LLMProvider;

/** Deps: the base four judges return [] + the REAL judgeUx slot (conditional). */
function makeDeps(): CodeReviewRunnerDeps {
	const base: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
	const judges: JudgeSlot[] = base.map((dimension) => ({ dimension, judge: async (): Promise<DimensionResult> => ({ dimension, findings: [] }) }));
	judges.push({ dimension: 'ux', judge: judgeUx });
	return { judges, assembleGrounding: async () => grounding, write: () => {} };
}

const opts = { runId: 'r', modelLabel: 'test' };

// ── effectiveJudges (pure) ──────────────────────────────────────────────────────

test('effectiveJudges keeps ux only when hasUxAcceptance', () => {
	const deps = makeDeps();
	assert.deepEqual(effectiveJudges(deps.judges, subject({ uxDefinition: validUx })).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'ux']);
	assert.deepEqual(effectiveJudges(deps.judges, subject({ adherence: { dimensions: ['ux'] } })).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'ux']);
	assert.deepEqual(effectiveJudges(deps.judges, subject({})).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
});

test('DEFAULT_DEPS carries the ux slot last (conditional at run time)', () => {
	assert.ok(DEFAULT_DEPS.judges.map(j => j.dimension).includes('ux'));
	assert.equal(DEFAULT_DEPS.judges[DEFAULT_DEPS.judges.length - 1]!.dimension, 'ux');
});

// ── expectedDimensions unions the recorded selection (ac3) ───────────────────────

test('expectedDimensions: base four when neither fires; pushes ux on hasUxAcceptance', () => {
	assert.deepEqual(expectedDimensions(subject({})), ['adherence', 'conventions', 'coverage', 'quality']);
	assert.deepEqual(expectedDimensions(subject({ uxDefinition: validUx })), ['adherence', 'conventions', 'coverage', 'quality', 'ux']);
});

test('expectedDimensions: a declared-but-uncontented adherence selection is still expected (ac3)', () => {
	// 'diagram-er' recorded but NO erDefinition/companion present → still expects 'diagram'.
	assert.deepEqual(expectedDimensions(subject({ adherence: { dimensions: ['diagram-er'] } })),
		['adherence', 'conventions', 'coverage', 'quality', 'diagram']);
	// 'ux' recorded but NO uxDefinition present → still expects 'ux'.
	assert.deepEqual(expectedDimensions(subject({ adherence: { dimensions: ['ux'] } })),
		['adherence', 'conventions', 'coverage', 'quality', 'ux']);
	// both content-derived (uxDefinition) and a selected 'diagram-component' union without duplication.
	assert.deepEqual(expectedDimensions(subject({ uxDefinition: validUx, adherence: { dimensions: ['diagram-component'] } })),
		['adherence', 'conventions', 'coverage', 'quality', 'diagram', 'ux']);
});

test('buildJudgementsSchema: admits ux in the enum exactly when ux is in the computed dims', () => {
	const withUx = buildJudgementsSchema(expectedDimensions(subject({ uxDefinition: validUx }))) as { properties: { judgements: { minItems: number; maxItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(withUx.properties.judgements.minItems, 5);
	assert.equal(withUx.properties.judgements.maxItems, 5);
	assert.ok(withUx.properties.judgements.items.properties.dimension.enum.includes('ux'));

	const withoutUx = buildJudgementsSchema(expectedDimensions(subject({}))) as { properties: { judgements: { minItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(withoutUx.properties.judgements.minItems, 4);
	assert.ok(!withoutUx.properties.judgements.items.properties.dimension.enum.includes('ux'));
});

// ── runCodeReview integration — verdict folds un-forked ───────────────────────────

test('runCodeReview: a valid uxDefinition runs the ux dimension + folds to pass', async () => {
	const out = await runCodeReview(subject({ uxDefinition: validUx }), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'ux']);
	assert.equal(out.artifact.body.verdict, 'pass');
});

test('runCodeReview: a required-but-missing UX design folds a ux HIGH to block (un-forked, ac2)', async () => {
	const out = await runCodeReview(subject({ adherence: { dimensions: ['ux'] } }), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.equal(out.artifact.body.verdict, 'block');
	assert.ok(out.artifact.body.counts.high >= 1);
	const ux = out.artifact.body.dimensions.find(d => d.dimension === 'ux')!;
	assert.ok(ux.findings.some(f => f.severity === 'HIGH'));
});

test('runCodeReview: neither uxDefinition nor adherence → exactly the base four (byte-shape compatible)', async () => {
	const out = await runCodeReview(subject({}), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
	assert.equal(out.artifact.body.verdict, 'pass');
});
