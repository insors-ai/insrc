/**
 * Messages of the context builder's typed errors. A failure must name
 * its actual cause, so the text is part of the contract.
 *
 * Pure -- no LMDB, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ShaperAnswerStepFailedError,
	ShaperInvalidInputError,
	ShaperLlmUnavailableError,
	ShaperNoPlanError,
	toolOutputText,
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

test('ShaperAnswerStepFailedError states its reason, keeps what the lookups found, and never reports retries', () => {
	const found = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };
	const bundle = new ShaperAnswerStepFailedError('invalid-bundle', '/focus must be string', found);
	assert.equal(bundle.reason, 'invalid-bundle');
	assert.equal(bundle.message, 'The answer could not be written after 0 lookup(s) ran -- the bundle failed validation: /focus must be string');

	const answer = new ShaperAnswerStepFailedError('invalid-answer', 'no JSON object', found);
	assert.equal(answer.reason, 'invalid-answer');
	assert.equal(answer.message, 'The answer could not be written after 0 lookup(s) ran -- the answer-writing output was invalid: no JSON object');

	// The report it carries says the answer step failed; the one it was given is not changed.
	assert.equal(answer.found.report.answerFailure, 'the answer-writing output was invalid: no JSON object');
	assert.deepEqual(answer.found.report.completeness, found.report.completeness);
	assert.equal('answerFailure' in found.report, false);

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

test("a tool's output with no JSON form is described as text and never thrown into the tool loop", () => {
	assert.equal(toolOutputText('plain'), 'plain');
	assert.equal(toolOutputText({ a: 1 }), '{"a":1}');
	// JSON.stringify(undefined) is undefined, which is not text.
	assert.equal(toolOutputText(undefined), '(the tool returned undefined)');
	const circular: Record<string, unknown> = {};
	circular['self'] = circular;
	assert.match(toolOutputText(circular), /^\(the tool's output has no JSON form: /);
	assert.match(toolOutputText({ n: 10n }), /^\(the tool's output has no JSON form: /);
});
