/**
 * Messages of the context builder's typed errors. A failure must name
 * its actual cause, so the text is part of the contract.
 *
 * Pure -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ShaperAnswerInvalidError,
	ShaperInvalidInputError,
	ShaperLlmUnavailableError,
	ShaperNoPlanError,
} from '../driver.js';
import { ScopeKindTargetMismatchError, ScopeRefUnresolvedError } from '../invariants.js';

test('ShaperLlmUnavailableError message with and without a call', () => {
	const planning = new ShaperLlmUnavailableError('claude exited with 1', 'planning');
	assert.equal(planning.message, 'The model call for planning failed: claude exited with 1');
	assert.ok(!planning.message.includes('Ollama'));

	const answer = new ShaperLlmUnavailableError('codex exited with 2', 'answer writing');
	assert.equal(answer.message, 'The model call for answer writing failed: codex exited with 2');

	// No call: the tool loop's message, unchanged.
	const bare = new ShaperLlmUnavailableError('ECONNREFUSED');
	assert.equal(bare.message, 'Local Ollama unavailable for shaper invocation: ECONNREFUSED');
	assert.equal(bare.name, 'ShaperLlmUnavailableError');
});

test('ShaperAnswerInvalidError states its stage and never reports retries', () => {
	const bundle = new ShaperAnswerInvalidError('bundle validation', '/focus must be string');
	assert.equal(bundle.stage, 'bundle validation');
	assert.equal(bundle.message, 'The bundle failed validation: /focus must be string');

	const answer = new ShaperAnswerInvalidError('answer writing', 'no JSON object');
	assert.equal(answer.stage, 'answer writing');
	assert.equal(answer.message, 'The answer-writing output was invalid: no JSON object');

	for (const e of [bundle, answer]) {
		assert.ok(!/exhausted|retries/i.test(e.message), e.message);
	}
});

test('the other new errors carry their detail and their own name', () => {
	assert.match(new ShaperInvalidInputError('no intent').message, /no intent/);
	assert.equal(new ShaperInvalidInputError('x').name, 'ShaperInvalidInputError');
	assert.match(new ShaperNoPlanError('empty plan').message, /empty plan/);
	assert.equal(new ShaperNoPlanError('x').name, 'ShaperNoPlanError');
	assert.equal(new ScopeRefUnresolvedError('gone').message, 'gone');
	assert.equal(new ScopeRefUnresolvedError('x').name, 'ScopeRefUnresolvedError');
	const mm = new ScopeKindTargetMismatchError('connection', 'code', ['repo', 'module']);
	assert.equal(
		mm.message,
		"scopeRef.kind='connection' is incompatible with target='code'. Allowed kinds for this target: repo, module.",
	);
});
