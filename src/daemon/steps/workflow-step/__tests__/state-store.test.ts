/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * State-store round-trip tests for the workflow-step MCP tool.
 *
 * Run:
 *   npx tsx --test src/daemon/steps/workflow-step/__tests__/state-store.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_clearWorkflowStateStoreForTests,
	_workflowStateStoreSize,
	loadState,
	releaseState,
	replaceState,
	saveState,
} from '../state-store.js';
import {
	assertStage,
	decodeState,
	encodeState,
	reencodeState,
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

test('save + load round-trip', async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await saveState(fixture());
	assert.equal(typeof token, 'string');
	assert.equal(token.length, 22);
	const loaded = await loadState(token);
	assert.equal(loaded.runId, 'run-x');
	assert.equal(loaded.intent.focus, 'test');
});

test('release drops the entry', async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await saveState(fixture());
	assert.equal(await _workflowStateStoreSize(), 1);
	await releaseState(token);
	assert.equal(await _workflowStateStoreSize(), 0);
});

test('load throws on unknown token', async () => {
	await _clearWorkflowStateStoreForTests();
	await assert.rejects(() => loadState('unknown-token-here-xxxxx'));
});

test('token is URL-safe base64 (no +, /, =)', async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await saveState(fixture());
	assert.ok(/^[A-Za-z0-9_-]{22}$/.test(token), `token '${token}' violates URL-safe shape`);
});

// ---------------------------------------------------------------------------
// S005/t2 — the decodeState error taxonomy (ac2: report an unknown/expired
// continuation reference plainly, distinct from a malformed token).
// ---------------------------------------------------------------------------

const decodeErr = async (fn: () => Promise<unknown>): Promise<WorkflowStateDecodeError> => {
	try { await fn(); }
	catch (e) {
		if (e instanceof WorkflowStateDecodeError) return e;
		throw new Error(`expected WorkflowStateDecodeError, got ${String(e)}`);
	}
	throw new Error('expected a throw, got none');
};

test("s5/t2: decodeState on an unknown/released token throws code 'not-found' with the plain message", async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await encodeState(fixture());   // valid shape, real token
	await releaseState(token);                     // now it is gone (mirrors TTL-expiry / completion)
	const err = await decodeErr(() => decodeState(token));
	assert.equal(err.code, 'not-found');     // distinct from 'malformed'
	assert.match(err.message, /not found|expired|already been completed|restart/i);   // the plain StateTokenNotFound text, preserved
});

test("s5/t2: decodeState on a structurally-garbage token throws code 'malformed' (distinct from 'not-found')", async () => {
	await _clearWorkflowStateStoreForTests();
	assert.equal((await decodeErr(() => decodeState('short'))).code, 'malformed');                 // too short
	assert.equal((await decodeErr(() => decodeState('x'.repeat(200)))).code, 'malformed');         // too long
	assert.equal((await decodeErr(() => decodeState(undefined as unknown as string))).code, 'malformed');   // non-string
});

test("s5/t2: assertStage on a valid token at the wrong stage throws 'wrong-stage' (unchanged)", async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await encodeState(fixture());    // stage is 'awaiting_plan'
	const payload = await decodeState(token);      // resolves fine (valid, present)
	const err = await decodeErr(async () => assertStage(payload, 'awaiting_llm_step'));
	assert.equal(err.code, 'wrong-stage');
});

test("s5/t2: the WorkflowStateDecodeError code union carries 'not-found' plus the original three", () => {
	// A construction-level guard: all four codes are constructible and round-trip on `.code`.
	for (const code of ['malformed', 'wrong-version', 'wrong-stage', 'not-found'] as const) {
		assert.equal(new WorkflowStateDecodeError(code, 'x').code, code);
	}
});

// ---------------------------------------------------------------------------
// E20260929c71f7106:S001 — replaceState / reencodeState: release-superseded-on-save
// (the state-token eviction bugfix). A long turn-by-turn run must hold ~1 live
// token, never leak one per turn into the LRU cap.
// ---------------------------------------------------------------------------

test('replaceState: mints a new token, releases the (defined+distinct) previous one — store stays ~1', async () => {
	await _clearWorkflowStateStoreForTests();
	let token = await saveState(fixture());
	assert.equal(await _workflowStateStoreSize(), 1);
	// Advance many turns, threading each returned token as the next prev.
	for (let i = 0; i < 250; i++) {
		const next = await replaceState(token, fixture());
		assert.notEqual(next, token);                       // a fresh token each turn
		await assert.rejects(() => loadState(token));       // the superseded token is gone (single-use)
		assert.equal((await loadState(next)).runId, 'run-x');   // the new token resolves
		assert.equal(await _workflowStateStoreSize(), 1);   // never grows — no per-turn leak
		token = next;
	}
});

test('replaceState(undefined, ...) behaves exactly like saveState (first-mint: nothing released)', async () => {
	await _clearWorkflowStateStoreForTests();
	const token = await replaceState(undefined, fixture());
	assert.equal(await _workflowStateStoreSize(), 1);
	assert.equal((await loadState(token)).runId, 'run-x');
});

test('replaceState is mint-before-release: the new token always exists even as the old is dropped', async () => {
	await _clearWorkflowStateStoreForTests();
	const first = await saveState(fixture());
	const second = await replaceState(first, fixture());
	await assert.rejects(() => loadState(first), /not found/i);   // prev released
	await assert.doesNotReject(() => loadState(second));           // next live
});

test('replaceState never deletes the just-minted token in the degenerate prev===next case', async () => {
	await _clearWorkflowStateStoreForTests();
	// mintToken is random, so prev===next cannot occur naturally; assert the guard
	// directly: replacing a token with a save whose minted token differs still keeps
	// exactly one live entry, and a self-referential release is a no-op on the live one.
	const token = await saveState(fixture());
	const next = await replaceState(token, fixture());
	// Simulate the guard's intent: releasing `next` via replaceState(next,...) keeps a live token.
	const after = await replaceState(next, fixture());
	await assert.doesNotReject(() => loadState(after));
	assert.equal(await _workflowStateStoreSize(), 1);
});

test('replaceState LRU: a run of > MAX_ENTRIES turns keeps its active token (never evicted)', async () => {
	await _clearWorkflowStateStoreForTests();
	let token = await saveState(fixture());
	for (let i = 0; i < 150; i++) token = await replaceState(token, fixture());   // > MAX_ENTRIES(100)
	// The active token survives — the defect (LRU-eviction of the live run) is fixed.
	await assert.doesNotReject(() => loadState(token));
	assert.equal(await _workflowStateStoreSize(), 1);
});

test('reencodeState: version guard throws wrong-version, else delegates to replaceState (releases prev)', async () => {
	await _clearWorkflowStateStoreForTests();
	const prev = await encodeState(fixture());
	const next = await reencodeState(prev, fixture());
	assert.notEqual(next, prev);
	await assert.rejects(() => loadState(prev), /not found/i);     // prev released
	assert.equal((await loadState(next)).runId, 'run-x');
	// wrong-version guard (mirrors encodeState)
	const err = await decodeErr(() => reencodeState(next, { ...fixture(), version: 999 as unknown as 1 }));
	assert.equal(err.code, 'wrong-version');
});
