/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) integration — the code-review handler with a UX-requiring subject:
 *   - start → emit_judgements hands back FIVE prompts (base four + ux) + a schema
 *     whose dimension enum admits 'ux';
 *   - a controller judgements payload with a UX HIGH finding folds to `block`
 *     (withholds completion), an adhering (empty) UX judgement folds to `pass`;
 *   - a subject with neither uxDefinition nor adherence yields exactly the base four
 *     dimensions (byte-shape compatible).
 *
 * Run: npx tsx --test --test-force-exit src/mcp/code-review-step/__tests__/ux-handler.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleCodeReviewStep, type CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import { runCodeReview } from '../../../workflow/code-review/runner.js';
import type { CodeReviewStepOutput } from '../types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../workflow/code-review/types.js';
import type { UxDefinition } from '../../../workflow/artifacts/companion/ux.js';
import type { AdherenceSelection } from '../../../workflow/artifacts/companion/adherence.js';

const EPIC = 'e1a2b3c4d5e6f7a8';
const STORY = 's4';
const CHANGED = ['src/a.ts'];
const CREATED = '2026-07-18T00:00:00.000Z';
const validUx: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };

function subject(body: { uxDefinition?: UxDefinition; adherence?: AdherenceSelection }): CodeReviewSubject {
	return {
		repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: CHANGED,
		approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
		buildRecord: null,
	};
}

const grounding: CodeReviewGrounding = {
	symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }],
};

function makeDeps(subj: CodeReviewSubject): { deps: CodeReviewStepDeps; writes: { path: string; content: string }[] } {
	const writes: { path: string; content: string }[] = [];
	const deps: CodeReviewStepDeps = {
		resolveSubject: async () => ({ ok: true, subject: subj }),
		fetchGrounding: async () => ({ ok: true, grounding }),
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: [] }),
		assembleDiffGrounding: async () => ({ grounding, changedFiles: CHANGED }),
		runReview:      runCodeReview,
		write:          (path, content) => { writes.push({ path, content }); },
		sleep:          async () => {},
		now:            () => 0,
		freshnessTimeoutMs: () => 120000,
	};
	return { deps, writes };
}

function parse(env: { content: readonly { text: string }[] }): CodeReviewStepOutput {
	return JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
}

/** judgements payload over the given expected dims. */
function judgements(dims: readonly ReviewDimension[], perDim: Partial<Record<ReviewDimension, DimensionResult['findings']>> = {}): { judgements: DimensionResult[] } {
	return { judgements: dims.map(d => ({ dimension: d, findings: perDim[d] ?? [] })) };
}

const UX_DIMS: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality', 'ux'];
const BASE_DIMS: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];

test('start: a uxDefinition subject → emit_judgements with FIVE prompts + a schema admitting ux', () => {
	_clearCodeReviewStateStoreForTests();
	const { deps } = makeDeps(subject({ uxDefinition: validUx }));
	return handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps).then(env => {
		const start = parse(env);
		assert.ok(start.next === 'emit_judgements');
		assert.equal(start.prompts.length, 5, 'base four + ux');
		const enumVals = (start.schema as { properties: { judgements: { items: { properties: { dimension: { enum: string[] } } } } } })
			.properties.judgements.items.properties.dimension.enum;
		assert.ok(enumVals.includes('ux'));
	});
});

test('judgements: a UX HIGH finding withholds completion (verdict block)', async () => {
	_clearCodeReviewStateStoreForTests();
	const { deps, writes } = makeDeps(subject({ adherence: { dimensions: ['ux'] } }));
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	const j = judgements(UX_DIMS, { ux: [{ dimension: 'ux', severity: 'HIGH', location: 'src/a.ts:1', message: 'UX acceptance required but no mock present', confidence: 'breach' }] });
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: j, state: start.state }, deps));
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'block');
	assert.ok(writes.length >= 1, 'a CR record was written');
});

test('judgements: an adhering (empty) UX judgement folds to pass', async () => {
	_clearCodeReviewStateStoreForTests();
	const { deps } = makeDeps(subject({ uxDefinition: validUx }));
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(UX_DIMS), state: start.state }, deps));
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'pass');
});

test('start: a subject with neither uxDefinition nor adherence → the base four (byte-shape compatible)', async () => {
	_clearCodeReviewStateStoreForTests();
	const { deps } = makeDeps(subject({}));
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements');
	assert.equal(start.prompts.length, 4, 'exactly the base four');
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements: judgements(BASE_DIMS), state: start.state }, deps));
	assert.ok(done.next === 'done');
	assert.equal(done.verdict, 'pass');
});
