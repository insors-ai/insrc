/**
 * The run RPC's intent parser keeps the two optional intent fields the
 * structured analyze request adds (Story 65b643840a294422/s1, task t1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_REQUEST_CONTEXT_CHARS } from '../../shared/analyze-types.js';
import { _parseIntentForTest } from '../analyze-rpc.js';

const BASE = {
	target:    'code',
	focused:   true,
	focus:     'how does X work',
	scopeRef:  { kind: 'module', value: '/repo/src/x' },
	reasoning: 'test',
};

test('parseIntent keeps context and scopeSource, refuses a bad value of either, and parses an intent without them as before', () => {
	const kept = _parseIntentForTest({ ...BASE, context: 'the user is porting X', scopeSource: 'request' }, 'size-optional');
	assert.equal(kept.context, 'the user is porting X');
	assert.equal(kept.scopeSource, 'request');
	assert.deepEqual(kept.scopeRef, BASE.scopeRef);

	assert.equal(_parseIntentForTest({ ...BASE, scopeSource: 'prompt' }, 'size-optional').scopeSource, 'prompt');

	assert.throws(() => _parseIntentForTest({ ...BASE, scopeSource: 'caller' }, 'size-optional'), /scopeSource/);
	assert.throws(() => _parseIntentForTest({ ...BASE, scopeSource: 7 }, 'size-optional'), /scopeSource/);
	assert.throws(() => _parseIntentForTest({ ...BASE, scopeSource: null }, 'size-optional'), /scopeSource/);
	assert.throws(() => _parseIntentForTest({ ...BASE, context: null }, 'size-optional'), /context/);
	assert.throws(() => _parseIntentForTest({ ...BASE, context: 7 }, 'size-optional'), /context/);
	assert.throws(() => _parseIntentForTest({ ...BASE, context: 'x'.repeat(MAX_REQUEST_CONTEXT_CHARS + 1) }, 'size-optional'), /at most/);
	assert.equal(_parseIntentForTest({ ...BASE, context: 'x'.repeat(MAX_REQUEST_CONTEXT_CHARS) }, 'size-optional').context?.length, MAX_REQUEST_CONTEXT_CHARS);

	const plain = _parseIntentForTest(BASE, 'size-optional');
	assert.equal('context' in plain, false);
	assert.equal('scopeSource' in plain, false);
	assert.deepEqual(plain, { target: 'code', focused: true, scopeRef: BASE.scopeRef, reasoning: 'test', focus: 'how does X work' });

	assert.equal(_parseIntentForTest({ ...BASE, scope: 'M', context: 'c' }, 'size-required').scope, 'M');
});
