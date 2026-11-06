/**
 * The shared request builder (Story 65b643840a294422/s1, task t2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_REQUEST_CONTEXT_CHARS, type AnalyzeRequest } from '../../../shared/analyze-types.js';
import { buildIntentFromRequest } from '../request.js';

const REPO = '/repo';
const REQUEST: AnalyzeRequest = {
	question: 'how does the cache work',
	scopeRef: { kind: 'module', value: '/repo/src/cache' },
	context:  'we are porting the cache',
	sizeHint: 'M',
};

test('buildIntentFromRequest makes the same intent for a request through both tools, defaults target to code, ignores a flat target and size, refuses an empty question, an over-long context and a differing focus, and keeps context off scopeRef', () => {
	// Both tools hand the builder the same request; the step tool's input and
	// the one-shot tool's input differ only in the flat fields they may carry.
	const viaStep    = buildIntentFromRequest({ request: REQUEST, target: 'docs', scope: 'XL' }, REPO);
	const viaOneShot = buildIntentFromRequest({ request: REQUEST }, REPO);
	assert.deepEqual(viaStep, viaOneShot);

	// target defaults to code; the flat target and size are ignored
	assert.equal(viaStep.intent.target, 'code');
	assert.equal(viaStep.sizeHint, 'M');
	assert.equal(buildIntentFromRequest({ request: { ...REQUEST, target: 'docs', sizeHint: undefined }, target: 'infra', scope: 'XS' }, REPO).intent.target, 'docs');
	assert.equal(buildIntentFromRequest({ request: { ...REQUEST, sizeHint: undefined }, scope: 'XS' }, REPO).sizeHint, undefined);

	// context and provenance live on the intent; the scope is exactly what the request named
	assert.equal(viaStep.intent.context, 'we are porting the cache');
	assert.equal(viaStep.intent.scopeSource, 'request');
	assert.deepEqual(viaStep.intent.scopeRef, { kind: 'module', value: '/repo/src/cache' });
	assert.equal(viaStep.intent.focus, REQUEST.question);
	assert.equal('context' in buildIntentFromRequest({ request: { ...REQUEST, context: undefined } }, REPO).intent, false);

	// the same question as a focus is accepted; a different one is refused
	assert.deepEqual(buildIntentFromRequest({ request: REQUEST, focus: '  how does the cache work ' }, REPO), viaOneShot);
	assert.throws(() => buildIntentFromRequest({ request: REQUEST, focus: 'something else' }, REPO), /differs from the request's question/);

	// refusals
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, question: '   ' } }, REPO), /question/);
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, context: 'x'.repeat(MAX_REQUEST_CONTEXT_CHARS + 1) } }, REPO), /at most/);
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, scopeRef: { kind: 'planet' as never, value: 'x' } } }, REPO), /scopeRef\.kind/);
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, scopeRef: { kind: 'module', value: '' } } }, REPO), /scopeRef\.value/);
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, target: 'web' as never } }, REPO), /target/);
	assert.throws(() => buildIntentFromRequest({ request: { ...REQUEST, sizeHint: 'XXL' as never } }, REPO), /sizeHint/);
	assert.throws(() => buildIntentFromRequest({}, REPO), /either `request` or a non-empty `focus`/);
	assert.throws(() => buildIntentFromRequest({ focus: '  ' }, REPO), /either `request` or a non-empty `focus`/);
});

test('a prompt-only call gets the workspace scope and scopeSource prompt', () => {
	const built = buildIntentFromRequest({ focus: 'where is X used', target: 'docs', scope: 'S' }, REPO);
	assert.deepEqual(built.intent.scopeRef, { kind: 'workspace', value: REPO });
	assert.equal(built.intent.scopeSource, 'prompt');
	assert.equal(built.intent.target, 'docs');
	assert.equal(built.intent.focus, 'where is X used');
	assert.equal(built.sizeHint, 'S');
	assert.equal(buildIntentFromRequest({ focus: 'x' }, REPO).intent.target, 'code');
});
