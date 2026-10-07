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
	ShaperAnswerInvalidError,
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
	_classifyShaperErrorForTest as daemonClassify,
} from '../../../daemon/analyze-rpc.js';
import { _classifyShaperErrorForTest as planTreeClassify } from '../driver.js';

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
	[new ShaperAnswerInvalidError('bundle validation', 'focus missing'), 'shaper-schema-unrecoverable'],
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
