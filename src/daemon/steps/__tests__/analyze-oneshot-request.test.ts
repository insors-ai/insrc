/**
 * The one-shot tool's input: a structured request in place of a focus, the
 * checks on a malformed one, and the intent and repository the run is sent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkOneShotArgs, oneShotRunParams } from '../analyze-oneshot.js';

const REQUEST = { question: 'how does settlement work', scopeRef: { kind: 'module', value: '/work/app/src/pay' }, context: 'a refactor is planned' };

test('checkOneShotArgs accepts a request with no focus, returns a message for a malformed request, requires one of request or focus; oneShotRunParams builds the intent from the builder and returns the expected repository', () => {
	const ok = checkOneShotArgs({ request: REQUEST });
	assert.equal(typeof ok, 'object');
	assert.equal(typeof checkOneShotArgs({ focus: 'q' }), 'object');

	// neither form
	assert.match(String(checkOneShotArgs({})), /either `request` or a non-empty `focus`/);
	assert.match(String(checkOneShotArgs({ focus: '  ' })), /either `request` or a non-empty `focus`/);
	// malformed requests
	assert.match(String(checkOneShotArgs({ request: 'x' })), /`request` must be an object/);
	assert.match(String(checkOneShotArgs({ request: { ...REQUEST, question: '' } })), /question/);
	assert.match(String(checkOneShotArgs({ request: { ...REQUEST, scopeRef: { kind: 'nope', value: '/x' } } })), /scopeRef\.kind/);
	assert.match(String(checkOneShotArgs({ request: { ...REQUEST, scopeRef: { kind: 'module', value: 7 } } })), /scopeRef\.value/);
	assert.match(String(checkOneShotArgs({ request: { ...REQUEST, context: 7 } })), /context/);
	assert.match(String(checkOneShotArgs({ request: { ...REQUEST, context: 'x'.repeat(5000) } })), /at most/);
	// both forms that disagree
	assert.match(String(checkOneShotArgs({ request: REQUEST, focus: 'something else' })), /send either/);
	assert.equal(typeof checkOneShotArgs({ request: REQUEST, focus: REQUEST.question }), 'object');
	// the other fields keep their checks
	assert.match(String(checkOneShotArgs({ focus: 'q', target: 'nope' })), /target/);
	assert.match(String(checkOneShotArgs({ focus: 'q', repo: 5 })), /repo/);

	// the run is built by the shared builder and carries the call's repository
	const fromRequest = oneShotRunParams({ request: REQUEST as never, target: 'docs', scope: 'XL' }, '/work/app', 'run-1');
	assert.equal(fromRequest.expectedRepo, '/work/app');
	assert.deepEqual(fromRequest.intent.scopeRef, { kind: 'module', value: '/work/app/src/pay' });
	assert.equal(fromRequest.intent.target, 'code', 'the flat target is ignored when a request is present');
	assert.equal(fromRequest.intent.context, 'a refactor is planned');
	assert.equal(fromRequest.intent.scopeSource, 'request');
	assert.equal('sizeHint' in fromRequest, false, 'the flat size is ignored when a request is present');
	const prompt = oneShotRunParams({ focus: 'q', target: 'docs', scope: 'S' }, '/work/app', 'run-2');
	assert.deepEqual(prompt.intent.scopeRef, { kind: 'workspace', value: '/work/app' });
	assert.equal(prompt.intent.scopeSource, 'prompt');
	assert.equal(prompt.sizeHint, 'S');
});
