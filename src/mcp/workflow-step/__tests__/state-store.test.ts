/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * State-store round-trip tests for the workflow-step MCP tool.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/state-store.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_clearWorkflowStateStoreForTests,
	_workflowStateStoreSize,
	loadState,
	releaseState,
	saveState,
} from '../state-store.js';
import {
	assertStage,
	decodeState,
	encodeState,
	WorkflowStateDecodeError,
} from '../state.js';
import type { WorkflowStepStatePayload } from '../state.js';

const fixture = (): WorkflowStepStatePayload => ({
	version:    1,
	runId:      'run-x',
	slug:       'test-slug',
	startedAtMs: 1000,
	intent: {
		workflow: 'stub',
		focus:    'test',
		repoPath: '/tmp/repo',
		repoIndexedAt: null,
		params:   {},
	},
	stage: 'awaiting_plan',
});

test('save + load round-trip', () => {
	_clearWorkflowStateStoreForTests();
	const token = saveState(fixture());
	assert.equal(typeof token, 'string');
	assert.equal(token.length, 22);
	const loaded = loadState(token);
	assert.equal(loaded.runId, 'run-x');
	assert.equal(loaded.intent.focus, 'test');
});

test('release drops the entry', () => {
	_clearWorkflowStateStoreForTests();
	const token = saveState(fixture());
	assert.equal(_workflowStateStoreSize(), 1);
	releaseState(token);
	assert.equal(_workflowStateStoreSize(), 0);
});

test('load throws on unknown token', () => {
	_clearWorkflowStateStoreForTests();
	assert.throws(() => loadState('unknown-token-here-xxxxx'));
});

test('token is URL-safe base64 (no +, /, =)', () => {
	_clearWorkflowStateStoreForTests();
	const token = saveState(fixture());
	assert.ok(/^[A-Za-z0-9_-]{22}$/.test(token), `token '${token}' violates URL-safe shape`);
});

// ---------------------------------------------------------------------------
// S005/t2 — the decodeState error taxonomy (ac2: report an unknown/expired
// continuation reference plainly, distinct from a malformed token).
// ---------------------------------------------------------------------------

const decodeErr = (fn: () => unknown): WorkflowStateDecodeError => {
	try { fn(); }
	catch (e) {
		if (e instanceof WorkflowStateDecodeError) return e;
		throw new Error(`expected WorkflowStateDecodeError, got ${String(e)}`);
	}
	throw new Error('expected a throw, got none');
};

test("s5/t2: decodeState on an unknown/released token throws code 'not-found' with the plain message", () => {
	_clearWorkflowStateStoreForTests();
	const token = encodeState(fixture());   // valid shape, real token
	releaseState(token);                     // now it is gone (mirrors TTL-expiry / completion)
	const err = decodeErr(() => decodeState(token));
	assert.equal(err.code, 'not-found');     // distinct from 'malformed'
	assert.match(err.message, /not found|expired|already been completed|restart/i);   // the plain StateTokenNotFound text, preserved
});

test("s5/t2: decodeState on a structurally-garbage token throws code 'malformed' (distinct from 'not-found')", () => {
	_clearWorkflowStateStoreForTests();
	assert.equal(decodeErr(() => decodeState('short')).code, 'malformed');                 // too short
	assert.equal(decodeErr(() => decodeState('x'.repeat(200))).code, 'malformed');         // too long
	assert.equal(decodeErr(() => decodeState(undefined as unknown as string)).code, 'malformed');   // non-string
});

test("s5/t2: assertStage on a valid token at the wrong stage throws 'wrong-stage' (unchanged)", () => {
	_clearWorkflowStateStoreForTests();
	const token = encodeState(fixture());    // stage is 'awaiting_plan'
	const payload = decodeState(token);      // resolves fine (valid, present)
	const err = decodeErr(() => assertStage(payload, 'awaiting_llm_step'));
	assert.equal(err.code, 'wrong-stage');
});

test("s5/t2: the WorkflowStateDecodeError code union carries 'not-found' plus the original three", () => {
	// A construction-level guard: all four codes are constructible and round-trip on `.code`.
	for (const code of ['malformed', 'wrong-version', 'wrong-stage', 'not-found'] as const) {
		assert.equal(new WorkflowStateDecodeError(code, 'x').code, code);
	}
});
