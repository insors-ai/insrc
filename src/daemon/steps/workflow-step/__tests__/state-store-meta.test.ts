/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The state store's entry meta (the run's owner and upstream snapshot) and listStates.
 *
 * Run: npx tsx --test src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _clearWorkflowStateStoreForTests, listStates, loadState, replaceState, saveState, type RunEntryMeta } from '../state-store.js';
import { encodeState, reencodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';

afterEach(() => { _clearWorkflowStateStoreForTests(); });

const payload = (runId: string): WorkflowStepStatePayload => ({
	version: STATE_VERSION, runId, epicKey: 'k', startedAtMs: 1, stage: 'awaiting_plan',
	intent: { workflow: 'plan', focus: 'f', repoPath: '/repo', repoIndexedAt: null, params: {} },
});

const META: RunEntryMeta = { owner: 'alice', upstream: [{ artifactId: 'DEF-x', revision: 3 }, { artifactId: 'LLD-x-s1', revision: 0 }] };

/** Run `fn` with Date.now returning successive values from `times`, then the last one. */
function withClock<T>(times: readonly number[], fn: () => T): T {
	const real = Date.now;
	let i = 0;
	Date.now = () => times[Math.min(i++, times.length - 1)] ?? real();
	try { return fn(); } finally { Date.now = real; }
}

test('the state store keeps meta beside the payload, carries it through reencodeState and replaceState, lists entries newest first without touching expiry, and an entry saved without meta behaves as before', () => {
	// encodeState keeps the meta beside the payload; the payload and the token format are unchanged
	const first = encodeState(payload('r1'), META);
	assert.match(first, /^[A-Za-z0-9_-]{22}$/);
	assert.deepEqual(loadState(first), payload('r1'));
	assert.deepEqual(listStates().find(e => e.token === first)?.meta, META);

	// reencodeState and replaceState carry the previous entry's meta onto the replacement
	const second = reencodeState(first, payload('r1'));
	assert.notEqual(second, first);
	assert.deepEqual(listStates().find(e => e.token === second)?.meta, META);
	assert.equal(listStates().some(e => e.token === first), false, 'the superseded token is released');
	const third = replaceState(second, payload('r1'));
	assert.deepEqual(listStates().find(e => e.token === third)?.meta, META);

	// an entry saved without meta behaves as before and has no owner
	const plain = saveState(payload('r2'));
	assert.equal(listStates().find(e => e.token === plain)?.meta, undefined);
	assert.equal(loadState(plain).runId, 'r2');
	const replacedPlain = replaceState(plain, payload('r2'));
	assert.equal(listStates().find(e => e.token === replacedPlain)?.meta, undefined);
	assert.equal(listStates().find(e => e.token === replacedPlain)?.meta?.owner, undefined);

	// listStates: newest touch first, and reading it moves no expiry
	_clearWorkflowStateStoreForTests();
	const base = Date.now();
	const a = withClock([base + 1_000], () => saveState(payload('a'), { owner: 'a' }));
	const b = withClock([base + 2_000], () => saveState(payload('b'), { owner: 'b' }));
	const c = withClock([base + 3_000], () => saveState(payload('c'), { owner: 'c' }));
	withClock([base + 4_000], () => loadState(a));   // a is now the most recently touched
	const before = listStates().map(e => [e.token, e.touchedAt]);
	assert.deepEqual(before.map(x => x[0]), [a, c, b]);
	listStates(); listStates();
	assert.deepEqual(listStates().map(e => [e.token, e.touchedAt]), before, 'listing changed no touch time');
	// an entry past its time to live is not listed, and listing does not sweep it
	const stale = withClock([Date.now() - 2 * 60 * 60 * 1000], () => saveState(payload('old'), { owner: 'old' }));
	assert.equal(listStates().some(e => e.token === stale), false);
	assert.equal(loadState(stale).runId, 'old', 'the stale entry was left for the next save to sweep');
});
