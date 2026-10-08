/**
 * The plan tree and the daemon each map a context-builder error to a
 * code (two functions, both named classifyShaperError). They are one
 * contract: the same error class must give the same code from both.
 *
 * Pure over their inputs -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ShaperAnswerStepFailedError,
	ShaperInvalidInputError,
	ShaperLlmUnavailableError,
	ShaperNoPlanError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	ShaperToolLoopExhausted,
} from '../../context/driver.js';
import {
	ScopeKindTargetMismatchError,
	ScopeNotIndexedError,
	ScopeRefUnresolvedError,
} from '../../context/invariants.js';
import {
	CAUSE_CODES_IN_BOTH_LISTS,
	_classifyPlannerErrorForTest as daemonPlannerClassify,
	_classifyShaperErrorForTest as daemonClassify,
} from '../../../daemon/analyze-rpc.js';
import { _classifyShaperErrorForTest as planTreeClassify } from '../driver.js';
import { buildCompleteness } from '../../completeness.js';
import { reportFromLookups } from '../../explore/answer-report.js';
import type { ExecutedExploration } from '../../explore/types.js';

/** The five classes mapped before this contract grew, then the five new ones. */
const CASES: ReadonlyArray<readonly [Error, string]> = [
	[new ScopeNotIndexedError('/r/unindexed', undefined, 'no entities'), 'scope-not-indexed'],
	[new ShaperLlmUnavailableError('down'),                              'shaper-llm-unavailable'],
	[new ShaperToolLoopExhausted(40),                                    'shaper-tool-loop-exhausted'],
	[new ShaperSchemaUnrecoverable(3, ['bad schema']),                   'shaper-schema-unrecoverable'],
	[new ShaperPromptMissingError('/p'),                                 'shaper-prompt-missing'],
	[new ShaperInvalidInputError('no intent'),                           'invalid-input'],
	[new ShaperNoPlanError('empty plan'),                                'no-plan-for-request'],
	[new ScopeRefUnresolvedError("no entity named 'x'"),                 'scope-ref-unresolved'],
	[new ScopeKindTargetMismatchError('connection', 'code', ['repo']),   'scope-ref-kind-target-mismatch'],
	[new ShaperAnswerStepFailedError('invalid-bundle', 'focus missing', { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } }), 'answer-step-failed'],
];

test('both classifyShaperError functions map each of the five new error classes to its code', () => {
	for (const [err, expected] of CASES.slice(5)) {
		assert.equal(planTreeClassify(err).code, expected, `plan tree: ${err.name}`);
		assert.equal(daemonClassify(err).code, expected, `daemon: ${err.name}`);
	}
});

test('one list of ten error classes gives the same code from the plan tree\'s and the daemon\'s mapping', () => {
	assert.equal(CASES.length, 10);
	assert.equal(new Set(CASES.map(([e]) => e.name)).size, 10, 'ten distinct classes');
	for (const [err, expected] of CASES) {
		const a = planTreeClassify(err);
		const b = daemonClassify(err);
		assert.equal(a.code, b.code, `${err.name}: plan tree '${a.code}' vs daemon '${b.code}'`);
		assert.equal(a.code, expected, `${err.name} should map to ${expected}`);
		assert.equal(a.message, err.message);
		assert.equal(b.message, err.message);
	}
});

test('an error neither mapping knows stays internal-error on both sides', () => {
	const err = new Error('totally unknown');
	assert.equal(planTreeClassify(err).code, 'internal-error');
	assert.equal(daemonClassify(err).code, 'internal-error');
});

test('the three new cause codes are declared in both lists', () => {
	assert.deepEqual([...CAUSE_CODES_IN_BOTH_LISTS], [
		'no-plan-for-request',
		'answer-step-failed',
		'run-abandoned',
	]);
});

// ---------------------------------------------------------------------------
// A failed answer step
// ---------------------------------------------------------------------------

/** One limited and one failed lookup: what the lookups found before the answer step failed. */
const RESULTS = [
	{
		exploration: { id: 'e1', type: 'search.text', purpose: 'p', params: {} },
		output: {
			type: 'search.text',
			completeness: buildCompleteness({
				returned: 30, basis: 'text-search',
				limited: [{ what: 'hits', limit: 30, scope: 'overall', reason: 'the search stops at 30 hits' }],
			}),
		},
		cached: false, elapsedMs: 0,
	},
	{
		exploration: { id: 'e2', type: 'symbol.locate', purpose: 'p', params: {} },
		output: { type: 'failed', requested: 'symbol.locate', errorCode: 'runtime-error', message: 'the graph store is closed' },
		cached: false, elapsedMs: 0,
	},
] as unknown as readonly ExecutedExploration[];
const FOUND = { results: RESULTS, report: reportFromLookups(RESULTS) };

test("both mapping functions return 'answer-step-failed' with the reason, the results and the report, and a failed planning call is still 'shaper-llm-unavailable'", () => {
	assert.equal(FOUND.report.completeness.complete, false);
	assert.equal(FOUND.report.completeness.incomplete.length, 1);
	assert.equal(FOUND.report.completeness.failed.length, 1);

	for (const reason of ['model-failed', 'invalid-answer', 'invalid-bundle'] as const) {
		const err = new ShaperAnswerStepFailedError(reason, 'detail', FOUND);
		// The plan tree's run-context step and the daemon's run handler map through
		// the context mapping; the daemon's plan-tree entry through its planner
		// mapping, which hands a context error on to the same function.
		for (const [name, classify] of [
			['plan tree', planTreeClassify], ['daemon', daemonClassify], ['daemon plan-tree entry', daemonPlannerClassify],
		] as const) {
			const out = classify(err);
			assert.equal(out.code, 'answer-step-failed', name);
			assert.equal(out.message, err.message, name);
			assert.deepEqual(Object.keys(out.data ?? {}).sort(), ['reason', 'report', 'results'], name);
			assert.equal(out.data?.['reason'], reason, name);
			assert.equal(out.data?.['results'], RESULTS, name);
			// The report names both lookups and says the answer step failed.
			assert.deepEqual(out.data?.['report'], { ...FOUND.report, answerFailure: err.found.report.answerFailure }, name);
			assert.ok(typeof err.found.report.answerFailure === 'string' && err.found.report.answerFailure.endsWith(': detail'));
		}
	}

	// No lookup ran when the planning call failed: the code and the absence of data are unchanged.
	const planning = new ShaperLlmUnavailableError('claude exited with 1', 'planning');
	for (const classify of [planTreeClassify, daemonClassify]) {
		assert.deepEqual(classify(planning), { code: 'shaper-llm-unavailable', message: planning.message });
	}
});

test('both mapping functions keep the code of a missing prompt and put the results and the report in its data only when the lookups ran', () => {
	const afterLookups = new ShaperPromptMissingError('/x/synth.md', FOUND);
	const beforeLookups = new ShaperPromptMissingError('/x/plan.md');
	for (const classify of [planTreeClassify, daemonClassify]) {
		assert.deepEqual(classify(afterLookups), {
			code: 'shaper-prompt-missing',
			message: 'Shaper prompt file missing: /x/synth.md',
			data: { results: RESULTS, report: FOUND.report },
		});
		assert.deepEqual(classify(beforeLookups), { code: 'shaper-prompt-missing', message: 'Shaper prompt file missing: /x/plan.md' });
	}
});
