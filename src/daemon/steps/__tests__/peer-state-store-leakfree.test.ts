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
