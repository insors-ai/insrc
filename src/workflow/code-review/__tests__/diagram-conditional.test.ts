/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) — the CONDITIONAL 'diagram' dimension end-to-end. Mirrors
 * functional-coverage-conditional.test.ts: effectiveJudges + expectedDimensions +
 * buildJudgementsSchema include 'diagram' only when the subject carries an
 * erDefinition/diagram companion; runCodeReview folds a DimensionResult{diagram}
 * into the un-forked verdict (pass for a sound model, block for a broken one); a
 * no-ER subject runs exactly the base dimensions (byte-shape compatible with
 * pre-S003); and the block verdict rides enforceCodeReviewGate (withhold under
 * enforce=true, advisory-warn under false). ac1/ac3.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/code-review/__tests__/diagram-conditional.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	runCodeReview,
	effectiveJudges,
	DEFAULT_DEPS,
	type CodeReviewRunnerDeps,
	type JudgeSlot,
} from '../runner.js';
import { judgeDiagram } from '../dimensions/diagram/index.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, ReviewDimension } from '../types.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { ErDefinition } from '../../artifacts/companion/er.js';
import { expectedDimensions, buildJudgementsSchema } from '../../../mcp/code-review-step/handler.js';
import { enforceCodeReviewGate } from '../gate.js';
import { artifactJsonPath, codeReviewArtifactId, ARTIFACTS_DIR, writeAtomic } from '../../storage.js';

const CREATED = '2026-07-17T07:42:28.275Z';
const EPIC = 'e1a2b3c4d5e6f708';

const validEr: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const danglingEr: ErDefinition = { classes: { Order: { attributes: { customer: { range: 'Customer' } } } } };

/** A subject; `er` sets the approved LLD body's erDefinition (undefined → no ER). */
function subject(er: ErDefinition | undefined, repoPath = '/repo'): CodeReviewSubject {
	return {
		repoPath, epicHash: EPIC, storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: {
			meta: { epicHash: EPIC, storyId: 's1', epicSlug: 'slug', createdAt: CREATED },
			body: er !== undefined ? { erDefinition: er } : {},
		} as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null,
		buildRecord: { changedFiles: ['src/a.ts'] } as CodeReviewSubject['buildRecord'],
	};
}

const grounding: CodeReviewGrounding = { symbols: [] };
const fakeProvider = (): LLMProvider => ({}) as unknown as LLMProvider;

/** Deps: the base four judges return [] + the REAL judgeDiagram slot (conditional). */
function makeDeps(): CodeReviewRunnerDeps {
	const base: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
	const judges: JudgeSlot[] = base.map((dimension) => ({ dimension, judge: async (): Promise<DimensionResult> => ({ dimension, findings: [] }) }));
	judges.push({ dimension: 'diagram', judge: judgeDiagram });
	return { judges, assembleGrounding: async () => grounding, write: () => {} };
}

const opts = { runId: 'r', modelLabel: 'test' };

// ── effectiveJudges (pure) ──────────────────────────────────────────────────────

test('effectiveJudges keeps diagram only for a subject with an erDefinition/diagram companion', () => {
	const deps = makeDeps();
	assert.deepEqual(effectiveJudges(deps.judges, subject(validEr)).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'diagram']);
	assert.deepEqual(effectiveJudges(deps.judges, subject(undefined)).map(j => j.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
});

test('DEFAULT_DEPS carries the diagram slot (conditional at run time)', () => {
	// S004 appended the 'ux' slot after 'diagram', so 'diagram' is no longer the very
	// last slot — but it is still a carried conditional, ordered before 'ux'.
	const dims = DEFAULT_DEPS.judges.map(j => j.dimension);
	assert.ok(dims.includes('diagram'));
	assert.ok(dims.indexOf('diagram') < dims.indexOf('ux'));
});

// ── runCodeReview integration ────────────────────────────────────────────────────

test('runCodeReview: a sound erDefinition runs the diagram dimension + folds to pass', async () => {
	const out = await runCodeReview(subject(validEr), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality', 'diagram']);
	const diagram = out.artifact.body.dimensions.find(d => d.dimension === 'diagram')!;
	assert.deepEqual(diagram.findings, []);
	assert.equal(out.artifact.body.verdict, 'pass');
});

test('runCodeReview: a broken (dangling) erDefinition folds a diagram HIGH to block', async () => {
	const out = await runCodeReview(subject(danglingEr), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.equal(out.artifact.body.verdict, 'block');
	assert.ok(out.artifact.body.counts.high >= 1);
});

test('runCodeReview: a no-ER subject runs exactly the base dimensions (byte-shape compatible with pre-S003)', async () => {
	const out = await runCodeReview(subject(undefined), fakeProvider(), opts, makeDeps());
	assert.ok(out.ok);
	assert.deepEqual(out.artifact.body.dimensions.map(d => d.dimension),
		['adherence', 'conventions', 'coverage', 'quality']);
	assert.equal(out.artifact.body.verdict, 'pass');
});

// ── handler expectedDimensions + schema (lockstep) ───────────────────────────────

test('expectedDimensions appends diagram only with an ER/diagram; schema enum + arity follow', () => {
	assert.deepEqual(expectedDimensions(subject(undefined)), ['adherence', 'conventions', 'coverage', 'quality']);
	assert.deepEqual(expectedDimensions(subject(validEr)), ['adherence', 'conventions', 'coverage', 'quality', 'diagram']);

	const schemaWith = buildJudgementsSchema(expectedDimensions(subject(validEr))) as { properties: { judgements: { minItems: number; maxItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(schemaWith.properties.judgements.minItems, 5);
	assert.equal(schemaWith.properties.judgements.maxItems, 5);
	assert.ok(schemaWith.properties.judgements.items.properties.dimension.enum.includes('diagram'));

	const schemaWithout = buildJudgementsSchema(expectedDimensions(subject(undefined))) as { properties: { judgements: { minItems: number; items: { properties: { dimension: { enum: string[] } } } } } };
	assert.equal(schemaWithout.properties.judgements.minItems, 4);
	assert.ok(!schemaWithout.properties.judgements.items.properties.dimension.enum.includes('diagram'));
});

// ── enforceCodeReviewGate rides the diagram block un-forked (ac3) ─────────────────

test('enforceCodeReviewGate: a diagram block withholds under enforce=true, is advisory-warn under false', () => {
	const repo = mkdtempSync(join(tmpdir(), 'diagram-gate-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	const id = codeReviewArtifactId(EPIC, 's1');
	const record = {
		meta: { workflow: 'code-review', epicHash: EPIC, storyId: 's1' },
		body: {
			kind: 'code-review', epicHash: EPIC, storyId: 's1', groundingMode: 'full',
			subject: { changedFiles: ['src/a.ts'] },
			dimensions: [{ dimension: 'diagram', findings: [{ dimension: 'diagram', severity: 'HIGH', location: 'erDefinition:classes', message: 'dangling' }] }],
			verdict: 'block', counts: { high: 1, med: 0, low: 0 },
		},
	};
	writeAtomic(artifactJsonPath(repo, id), JSON.stringify(record, null, 2) + '\n');

	const enforced = enforceCodeReviewGate(repo, EPIC, 's1', { enforce: true });
	assert.equal(enforced.status, 'blocked');

	const advisory = enforceCodeReviewGate(repo, EPIC, 's1', { enforce: false });
	assert.equal(advisory.status, 'warn');
	assert.equal((advisory as { advisory?: boolean }).advisory, true);

	rmSync(repo, { recursive: true, force: true });
});
