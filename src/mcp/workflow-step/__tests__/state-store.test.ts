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
