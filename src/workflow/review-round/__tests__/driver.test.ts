/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runReviewRound } from '../driver.js';
import type { RoundDriverHooks } from '../types.js';
import type { ReviewTargets } from '../../artifact-core/types.js';

const targets: ReviewTargets = { entries: [] };

function stubHooks<F>(ground: RoundDriverHooks<F>['ground'], security?: RoundDriverHooks<F>['security']): RoundDriverHooks<F> {
	return { reviewKind: 'design', checkpointGranularity: 'round', ground, ...(security !== undefined ? { security } : {}) };
}

describe('runReviewRound', () => {
	it('a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument', async () => {
		const calls: Array<[ReviewTargets, number]> = [];
		const hooks = stubHooks<string>(async (t, r) => { calls.push([t, r]); return ['finding-a']; });

		const result = await runReviewRound('review-1', hooks, 1, targets);

		assert.equal(calls.length, 1);
		assert.deepEqual(calls[0], [targets, 1]);
		assert.deepEqual(result, { round: 1, findings: ['finding-a'] });
	});
});
