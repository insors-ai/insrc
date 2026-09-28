/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (sc3) elicitation — the per-phase STEP schemas ELICIT the plain-language
 * document `summary` (+ `audience`) so the reshaped templates are not hollow, and
 * the design.story step also elicits optional `contextRefs`:
 *   - define `epic.frame`            → Epic-scoped summary (business|product)
 *   - design.epic `framework.write`  → Epic-scoped summary (product|technical)
 *   - design.story `contract.detail` → Story-scoped summary (product|technical) + contextRefs
 *   - plan `test-strategy.write`     → Story-scoped build summary (product|technical)
 *
 * And the two PURE synthesizer body schemas (define, design.epic) ADMIT
 * `body.summary` while keeping `additionalProperties:false` (a field a step emits
 * now flows through the synthesize gate instead of being rejected). Every summary
 * field stays absent-safe (omitting it still validates) — matching the forward-only
 * optional body field. design.story / plan synthesize is proven end-to-end by the
 * design-story-e2e + plan e2e suites (they touch gates/disk).
 *
 * Run: npx tsx --test src/workflow/runners/__tests__/summary-elicitation-schemas.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { epicFrameSchema } from '../define/schemas.js';
import { frameworkWriteSchema } from '../design-epic/schemas.js';
import { contractDetailSchema } from '../design-story/schemas.js';
import { testStrategyWriteSchema } from '../plan/schemas.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { prepareSynthesize } from '../../orchestrator.js';
import type { WorkflowIntent } from '../../types.js';

const CITES = [{ id: 'c1', kind: 'doc', ref: 'r' }];

// ---------------------------------------------------------------------------
// Minimal otherwise-valid step outputs — `summary` is the knob under test.
// ---------------------------------------------------------------------------

function epicFrameWith(summary?: unknown): unknown {
	return {
		problem: 'A sufficiently long problem statement describing the gap.',
		nonGoals: [], assumptions: [], constraints: [], citations: CITES,
		...(summary !== undefined ? { summary } : {}),
	};
}

function frameworkWith(summary?: unknown): unknown {
	return {
		frameworkSummary:  'A sufficiently long framework summary paragraph.',
		architectureShape: 'A sufficiently long architecture shape paragraph.',
		sharedContracts:   [],
		storyBoundaries:   [{ storyId: 's1', owns: [], depends: [], internal: 'private bits' }],
		nonFunctional:     {},
		...(summary !== undefined ? { summary } : {}),
	};
}

function contractDetailWith(extra?: Record<string, unknown>): unknown {
	return {
		surfaceLevel: 'internal',
		api: [], dataModel: [], interactionWithShared: [],
		...(extra ?? {}),
	};
}

function testStrategyWriteWith(summary?: unknown): unknown {
	return {
		tasks: [{
			id: 't1', title: 'T', summary: 'do the thing', size: 'S', order: 1,
			dependsOn: [], acceptanceChecks: ['check'], derivedFrom: ['c1'],
			tests: [{ level: 'unit', name: 'proves it' }],
		}],
		testStrategyCoverage: [{ lldStrategyItem: 'x', coveredByTaskIds: ['t1'] }],
		...(summary !== undefined ? { summary } : {}),
	};
}

// ---------------------------------------------------------------------------
// Step schemas — summary is admitted, absent-safe, audience-constrained.
// ---------------------------------------------------------------------------

const STEP_CASES: ReadonlyArray<{ readonly name: string; readonly schema: object; readonly make: (s?: unknown) => unknown; readonly goodAudience: string; readonly badAudience: string }> = [
	{ name: 'define epic.frame',              schema: epicFrameSchema,        make: epicFrameWith,          goodAudience: 'business',  badAudience: 'technical' },
	{ name: 'design.epic framework.write',    schema: frameworkWriteSchema,   make: frameworkWith,          goodAudience: 'technical', badAudience: 'business'  },
	{ name: 'design.story contract.detail',   schema: contractDetailSchema,   make: (s) => contractDetailWith(s !== undefined ? { summary: s } : undefined), goodAudience: 'product', badAudience: 'business' },
	{ name: 'plan test-strategy.write',       schema: testStrategyWriteSchema, make: testStrategyWriteWith, goodAudience: 'product',   badAudience: 'business'  },
];

for (const c of STEP_CASES) {
	test(`${c.name}: omitting summary still validates (absent-safe)`, () => {
		const res = validateAgainstSchema(c.schema, c.make());
		assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
	});

	test(`${c.name}: a { prose, audience } summary validates`, () => {
		const res = validateAgainstSchema(c.schema, c.make({ prose: 'A plain-language abstract.', audience: c.goodAudience }));
		assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
	});

	test(`${c.name}: a summary without prose is REJECTED`, () => {
		const res = validateAgainstSchema(c.schema, c.make({ audience: c.goodAudience }));
		assert.equal(res.ok, false, 'prose is required on a summary');
	});

	test(`${c.name}: an out-of-set audience is REJECTED`, () => {
		const res = validateAgainstSchema(c.schema, c.make({ prose: 'x', audience: c.badAudience }));
		assert.equal(res.ok, false, `audience '${c.badAudience}' is not valid for ${c.name}`);
	});

	test(`${c.name}: an unknown key inside summary is REJECTED (additionalProperties:false)`, () => {
		const res = validateAgainstSchema(c.schema, c.make({ prose: 'x', bogus: 1 }));
		assert.equal(res.ok, false);
	});
}

// ---------------------------------------------------------------------------
// design.story contract.detail — contextRefs is admitted + absent-safe.
// ---------------------------------------------------------------------------

test('contract.detail: omitting contextRefs still validates (engine derives the HLD ref)', () => {
	const res = validateAgainstSchema(contractDetailSchema, contractDetailWith());
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('contract.detail: an explicit contextRefs entry validates', () => {
	const res = validateAgainstSchema(contractDetailSchema, contractDetailWith({
		contextRefs: [{ sourceArtifactId: 'HLD-0123456789abcdef', sectionId: '2-framework-summary' }],
	}));
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('contract.detail: a contextRefs entry missing sectionId is REJECTED', () => {
	const res = validateAgainstSchema(contractDetailSchema, contractDetailWith({
		contextRefs: [{ sourceArtifactId: 'HLD-0123456789abcdef' }],
	}));
	assert.equal(res.ok, false);
});

// ---------------------------------------------------------------------------
// Synthesizer body schemas (pure: define + design.epic) — admit body.summary,
// keep additionalProperties:false.
// ---------------------------------------------------------------------------

function intentFor(workflow: WorkflowIntent['workflow']): WorkflowIntent {
	return { workflow, focus: 'x', repoPath: '/tmp/repo', repoIndexedAt: null, params: {} };
}

function defineBody(summary?: unknown): unknown {
	return {
		flavor: 'new-capability', problem: 'A sufficiently long problem statement.',
		nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1' }], openQuestions: [],
		...(summary !== undefined ? { summary } : {}),
	};
}

function hldBody(summary?: unknown): unknown {
	return {
		frameworkSummary: 'A sufficiently long framework summary.',
		architectureShape: 'A sufficiently long architecture shape.',
		sharedContracts: [], storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'x' }],
		nonFunctional: {}, rolloutOverview: {},
		alternativesConsidered: [{ id: 'a1' }, { id: 'a2' }], chosenAlternative: 'a1', openQuestions: [],
		...(summary !== undefined ? { summary } : {}),
	};
}

test('defineSynthesizer body schema: admits body.summary', () => {
	const { schema } = prepareSynthesize(intentFor('define'), { s1: { decision: 'new' } });
	const res = validateAgainstSchema(schema, { body: defineBody({ prose: 'Epic-scoped abstract.', audience: 'business' }), citations: CITES });
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('defineSynthesizer body schema: still rejects an unknown body key (additionalProperties:false retained)', () => {
	const { schema } = prepareSynthesize(intentFor('define'), { s1: { decision: 'new' } });
	const body = defineBody({ prose: 'x' }) as Record<string, unknown>;
	body['bogusField'] = 1;
	const res = validateAgainstSchema(schema, { body, citations: CITES });
	assert.equal(res.ok, false);
});

test('designEpicSynthesizer body schema: admits body.summary', () => {
	const { schema } = prepareSynthesize(intentFor('design.epic'), {});
	const res = validateAgainstSchema(schema, { body: hldBody({ prose: 'Epic-scoped abstract.', audience: 'technical' }), citations: CITES });
	assert.equal(res.ok, true, res.ok ? '' : res.errors.join('; '));
});

test('designEpicSynthesizer body schema: still rejects an unknown body key (additionalProperties:false retained)', () => {
	const { schema } = prepareSynthesize(intentFor('design.epic'), {});
	const body = hldBody({ prose: 'x' }) as Record<string, unknown>;
	body['bogusField'] = 1;
	const res = validateAgainstSchema(schema, { body, citations: CITES });
	assert.equal(res.ok, false);
});
