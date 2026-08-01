/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story S001 (brainstorm stage scaffold) — plan task t5.
 * BrainstormElicitState rides the EXISTING workflow-step state store inside
 * WorkflowStepStatePayload; the opaque-token save/load/release round-trip and
 * the unknown/expired-token throw are unchanged (k8/k9 — no new store).
 *
 * Run: npx tsx --test src/mcp/workflow-step/__tests__/brainstorm-state.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_clearWorkflowStateStoreForTests,
	loadState,
	releaseState,
	saveState,
	StateTokenNotFound,
} from '../state-store.js';
import { STATE_VERSION, type BrainstormElicitState, type WorkflowStepStatePayload } from '../state.js';

const brainstorm: BrainstormElicitState = {
	workingStatement: 'A dark-mode toggle in the settings pane.',
	answered:         ['scope: settings only'],
	openQuestions:    ['persist per-device or per-account?'],
};

const fixture = (): WorkflowStepStatePayload => ({
	version:     STATE_VERSION,
	runId:       'wf-test-brainstorm',
	epicKey:     'brainstorm-slug',
	startedAtMs: 0,
	intent:      { workflow: 'brainstorm', focus: 'dark mode', repoPath: '/tmp/x', repoIndexedAt: null, params: {} },
	brainstorm,
	stage:       'awaiting_llm_step',
});

test('t5: a payload carrying BrainstormElicitState round-trips unchanged through save->token->load', () => {
	_clearWorkflowStateStoreForTests();
	const token = saveState(fixture());
	const loaded = loadState(token);
	assert.deepEqual(loaded.brainstorm, brainstorm);
	assert.deepEqual(loaded, fixture());   // the whole payload is byte-identical
});

test('t5: releaseState frees the token (subsequent load throws StateTokenNotFound)', () => {
	_clearWorkflowStateStoreForTests();
	const token = saveState(fixture());
	releaseState(token);
	assert.throws(() => loadState(token), StateTokenNotFound);
});

test('t5: loadState for an unknown/expired token still throws unchanged — no brainstorm-specific silent-replace', () => {
	_clearWorkflowStateStoreForTests();
	assert.throws(() => loadState('this-token-was-never-saved'), StateTokenNotFound);
});

test('t5: BrainstormElicitState has exactly the three sc3 fields', () => {
	assert.deepEqual(Object.keys(brainstorm).sort(), ['answered', 'openQuestions', 'workingStatement']);
});
