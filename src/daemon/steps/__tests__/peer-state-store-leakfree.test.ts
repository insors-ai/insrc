/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929c71f7106:S001 t4/t5 — peer-store leak-free REGRESSION guards.
 *
 * The state-token eviction fix (replaceState/reencodeState) is applied ONLY to the
 * two stores that leak (workflow-step + analyze-step). The other two peer stores are
 * ALREADY leak-free by other means and are LEFT UNCHANGED:
 *   - review-step holds ONE token per run via updateState (in-place; never mints a
 *     new token per turn), so a multi-turn run keeps _reviewStateStoreSize bounded.
 *   - code-review-step releases the incoming token on each transition + on consume,
 *     preserving single-use-on-consume (a resend of a released token fails loadState).
 * These assertions pin that already-correct behaviour so a future change cannot
 * silently regress it.
 *
 * Run: npx tsx --test src/daemon/steps/__tests__/peer-state-store-leakfree.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { HubClient, serveHub } from '../../threads/channel.js';
import {
	HubStepStateStore,
	installStepStateStore,
	LocalStepStateStore,
	stepStateHubHandlers,
} from '../../threads/step-state.js';

import {
	saveState as reviewSave,
	loadState as reviewLoad,
	updateState as reviewUpdate,
	releaseState as reviewRelease,
	_clearReviewStateStoreForTests,
	_reviewStateStoreSize,
} from '../review-step/state-store.js';
import type { ReviewStepStatePayload } from '../review-step/types.js';

import {
	saveState as crSave,
	loadState as crLoad,
	releaseState as crRelease,
	_clearCodeReviewStateStoreForTests,
	_codeReviewStateStoreSize,
} from '../code-review-step/state-store.js';
import type { CodeReviewStepStatePayload } from '../code-review-step/types.js';

// Both stores are reached through the hub, as they are from a session worker
// (Epic 86197ac6 s1/t9).
const hubChannel = new MessageChannel();
before(() => {
	serveHub(hubChannel.port1, stepStateHubHandlers(new LocalStepStateStore()));
	installStepStateStore(new HubStepStateStore(new HubClient(hubChannel.port2)));
});
after(() => {
	installStepStateStore(new LocalStepStateStore());
	hubChannel.port1.close();
	hubChannel.port2.close();
});

const reviewPayload = (): ReviewStepStatePayload => ({
	runId:       'rev-1',
	startedAtMs: 1000,
	mdPath:      '/repo/docs/x/LLD.md',
	jsonPath:    '/repo/.insrc/artifacts/LLD-x.json',
	repo:        '/repo',
	stage:       'awaiting_claims',
	markdown:    '# doc',
});

const crPayload = (): CodeReviewStepStatePayload => ({
	runId:       'cr-1',
	startedAtMs: 1000,
	repo:        '/repo',
	epicHash:    'e2c6705fd105d4ac',
	storyId:     's1',
	// The store holds the payload opaquely; a minimal subject cast is sufficient
	// for a store-level lifecycle assertion (we never read subject internals here).
	subject:     {} as unknown as CodeReviewStepStatePayload['subject'],
});

test('review-step stays leak-free: updateState is in-place — a multi-turn run keeps ~1 live token', async () => {
	await _clearReviewStateStoreForTests();
	const token = await reviewSave(reviewPayload());
	assert.equal(await _reviewStateStoreSize(), 1);
	// Many intermediate updates on the SAME token (the claims-phase pattern): no new
	// token minted, so the store never grows — the leak-free mechanism this fix relies on.
	for (let i = 0; i < 150; i++) {
		await reviewUpdate(token, { ...reviewPayload(), stage: `turn-${i}` });
		assert.equal(await _reviewStateStoreSize(), 1);
	}
	assert.equal((await reviewLoad(token)).stage, 'turn-149');
	await reviewRelease(token);
	assert.equal(await _reviewStateStoreSize(), 0);
});

test('code-review-step stays leak-free: release-on-consume — a resend of a released token fails loadState', async () => {
	await _clearCodeReviewStateStoreForTests();
	const token = await crSave(crPayload());
	assert.equal(await _codeReviewStateStoreSize(), 1);
	assert.equal((await crLoad(token)).runId, 'cr-1');
	await crRelease(token);                                   // consumed (the handler.ts:493 property)
	assert.equal(await _codeReviewStateStoreSize(), 0);
	await assert.rejects(() => crLoad(token));          // a resend fails — no double-write
});

test("review-step updateState on a released token fails with today's not-found message, across the hub", async () => {
	await _clearReviewStateStoreForTests();
	const token = await reviewSave(reviewPayload());
	await reviewRelease(token);
	await assert.rejects(
		() => reviewUpdate(token, reviewPayload()),
		(err: unknown) => err instanceof Error && err.name === 'StateTokenNotFound'
			&& err.message === `review state token '${token}' not found while updating: the insrc daemon was restarted, the token went unused for an hour, `
				+ `or the run was already completed. Start the run again with phase='start'.`,
	);
});
