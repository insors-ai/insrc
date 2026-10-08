/**
 * docs/plans/exploration-based-context-build.md Phase 6. Unit tests for
 * the two driver helpers that anchor the freeform.probe escape hatch:
 *
 * - `fallbackFreeformPlan(intent, shaperId)` synthesises a plan
 *   containing exactly one freeform.probe step, targeted at the
 *   caller's shaperId, so an out-of-recipe intent still gets a
 *   coherent plan the executor can run.
 * - `extractSoleFreeformResult(executed)` recognises the "sole
 *   freeform.probe with a non-empty tool-loop bundle" shape so the
 *   driver can short-circuit the LLM synthesizer pass and return the
 *   raw bundle content directly.
 *
 * These are pure over their inputs -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import { buildCompleteness } from '../../completeness.js';
import assert from 'node:assert/strict';

import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import {
	_extractSoleFreeformResultForTest,
	_fallbackFreeformPlanForTest,
} from '../driver.js';
import type {
	ExecutedExploration,
	ExecutedPlan,
	FreeformProbeOutput,
} from '../../explore/types.js';

const INTENT: ClassifiedIntent = {
	target:    'code',
	scope:     'M',
	focused:   true,
	focus:     'walk me through the payable pipeline',
	scopeRef:  { kind: 'workspace', value: '/tmp/probe-repo' },
	reasoning: 'test',
};

// ---------------------------------------------------------------------------
// fallbackFreeformPlan
// ---------------------------------------------------------------------------

test('fallbackFreeformPlan emits exactly one freeform.probe step', () => {
	const plan = _fallbackFreeformPlanForTest(INTENT, 'code');
	assert.equal(plan.explorations.length, 1);
	const step = plan.explorations[0]!;
	assert.equal(step.type, 'freeform.probe');
	assert.equal((step.params as { shaperId: string }).shaperId, 'code');
	assert.equal((step.params as { purpose: string }).purpose, INTENT.focus);
});

test('fallbackFreeformPlan maps shaperId->answerType so logs stay readable', () => {
	assert.equal(_fallbackFreeformPlanForTest(INTENT, 'code').answerType,  'how-does-it-work');
	assert.equal(_fallbackFreeformPlanForTest(INTENT, 'docs').answerType,  'prose-retrieval');
	assert.equal(_fallbackFreeformPlanForTest(INTENT, 'data').answerType,  'data-inventory');
	assert.equal(_fallbackFreeformPlanForTest(INTENT, 'infra').answerType, 'infra-inventory');
});

test('fallbackFreeformPlan preserves intent.focus in the step purpose', () => {
	const plan = _fallbackFreeformPlanForTest({ ...INTENT, focus: 'trace the RSS' }, 'code');
	assert.equal((plan.explorations[0]!.params as { purpose: string }).purpose, 'trace the RSS');
});

test("free-form replacement's purpose for an unfocused intent is the broad survey", () => {
	// An intent with no focus has no question to hand the loop. It used
	// to be handed the classifier's reasoning text -- a note about how
	// the request was classified, not a question.
	const unfocused = {
		...INTENT, focused: false, focus: undefined,
		reasoning: 'target hinted via slash command (classifier skipped); scope hinted',
	};
	const plan = _fallbackFreeformPlanForTest(unfocused, 'code');
	const step = plan.explorations[0]!;
	const purpose = (step.params as { purpose: string }).purpose;
	assert.equal(purpose, 'Broad survey of the workspace /tmp/probe-repo');
	assert.ok(!purpose.includes('classifier'), purpose);
	assert.ok(!purpose.includes('undefined'), purpose);
	assert.ok(step.purpose.endsWith('Broad survey of the workspace /tmp/probe-repo'), step.purpose);

	// The scope's kind and value are named, whatever they are.
	const onModule = _fallbackFreeformPlanForTest(
		{ ...unfocused, scopeRef: { kind: 'module', value: '/r/src/billing' } }, 'code',
	);
	assert.equal((onModule.explorations[0]!.params as { purpose: string }).purpose, 'Broad survey of the module /r/src/billing');
});

// ---------------------------------------------------------------------------
// extractSoleFreeformResult
// ---------------------------------------------------------------------------

function buildFreeformResult(overrides?: Partial<FreeformProbeOutput>): FreeformProbeOutput {
	return {
		type:         'freeform.probe',
		purpose:      'x',
		shaperId:     'code',
		toolCallCount: 3,
		completeness: buildCompleteness({ returned: 1, basis: 'model-directed', notEstablished: true }),
		rawBundle: {
			system:    'S',
			focus:     'F',
			summary:   'summary body',
			structure: 'structure body',
			surface:   'surface body',
			artefacts: 'artefacts body',
			upstream:  '',
		},
		...overrides,
	};
}

function wrapExecuted(output: FreeformProbeOutput): ExecutedPlan {
	const result: ExecutedExploration = {
		exploration: {
			id:      'e1',
			type:    'freeform.probe',
			purpose: 'probe',
			params:  { purpose: 'x', shaperId: 'code' },
		},
		output,
		cached:    false,
		elapsedMs: 0,
	};
	return {
		plan:        { answerType: 'how-does-it-work', synthesisHint: 't', explorations: [result.exploration] },
		results:     [result],
		totalMs:     0,
		totalCached: 0,
	};
}

test('extractSoleFreeformResult returns the bundle when freeform.probe is the only step', () => {
	const executed = wrapExecuted(buildFreeformResult());
	const r = _extractSoleFreeformResultForTest(executed);
	assert.notEqual(r, null);
	assert.equal(r!.rawBundle.summary, 'summary body');
	assert.equal(r!.toolCallCount, 3);
});

test('extractSoleFreeformResult returns null when the freeform bundle is all-empty', () => {
	const executed = wrapExecuted(buildFreeformResult({
		rawBundle: { system: '', focus: '', summary: '', structure: '', surface: '', artefacts: '', upstream: '' },
	}));
	const r = _extractSoleFreeformResultForTest(executed);
	assert.equal(r, null);
});

test('extractSoleFreeformResult returns null on a mixed plan', () => {
	const freeform = wrapExecuted(buildFreeformResult());
	const stub: ExecutedExploration = {
		exploration: { id: 'e2', type: 'concept.resolve', purpose: 'p', params: { query: 'x' } },
		output:      { type: 'concept.resolve', query: 'x', hits: [] },
		cached:      false,
		elapsedMs:   0,
	};
	const executed: ExecutedPlan = { ...freeform, results: [freeform.results[0]!, stub] };
	const r = _extractSoleFreeformResultForTest(executed);
	assert.equal(r, null);
});
