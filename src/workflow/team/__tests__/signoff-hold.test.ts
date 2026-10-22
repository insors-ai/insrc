/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The completion hold (Story s7): does signoff hold a Story's or an Epic's completion.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-hold.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setSignoffDepsForTests, signoffHoldsCompletion } from '../signoff.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setSignoffDepsForTests(); });

const EPIC = 'a3f4b8c9d1e2f3a4';
const STORY_ID = `STORY-${EPIC}-s1`;
const EPIC_ID = `EPIC-${EPIC}`;

const policy = (over: Partial<TeamPolicy> & { anchorKnown?: boolean } = {}): TeamPolicy => {
	const { anchorKnown, ...rest } = over;
	return {
		teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
		claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
		source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: anchorKnown ?? true },
		...rest,
	} as TeamPolicy;
};

const head = (status: string, approvedAt = '2026-07-01T00:00:00Z'): unknown => ({ lifecycle: { status, revision: { number: 1 }, approval: { revision: 1, at: approvedAt }, signoffs: [] } });

function inject(p: TeamPolicy | 'none', heads: Record<string, unknown>): void {
	_setSignoffDepsForTests({ readPolicy: () => ({ ok: true, value: p }), readHead: (_repo, id) => heads[id] });
}

test('signoffHoldsCompletion is true for a Story whose listed LLD or BUILD is not signed off and for an Epic whose listed DEF or HLD is not, false for a grandfathered pre-anchor member when anchorKnown is true, true for it when anchorKnown is false, and false outside team mode, with no policy, or with no member stage listed', () => {
	const lld = `LLD-${EPIC}-s1`;
	const build = `BUILD-${EPIC}-s1`;
	const def = `DEF-${EPIC}`;
	const hld = `HLD-${EPIC}`;

	// a Story: the BUILD is approved and not signed off
	inject(policy(), { [lld]: head('signed-off'), [build]: head('approved') });
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), true, 'a listed BUILD that is not signed off holds the Story');
	inject(policy(), { [lld]: head('approved'), [build]: head('signed-off') });
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), true, 'a listed LLD that is not signed off holds the Story');
	inject(policy(), { [lld]: head('signed-off'), [build]: head('signed-off') });
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false, 'every listed member is signed off');

	// an Epic: DEF and HLD
	inject(policy(), { [def]: head('signed-off'), [hld]: head('approved') });
	assert.equal(signoffHoldsCompletion('/repo', EPIC_ID), true);
	inject(policy(), { [def]: head('signed-off'), [hld]: head('signed-off') });
	assert.equal(signoffHoldsCompletion('/repo', EPIC_ID), false);

	// a pre-anchor member: grandfathered when the anchor is known, held when it is not
	const old = { [lld]: head('approved', '2026-05-01T00:00:00Z'), [build]: head('signed-off') };
	inject(policy({ anchorKnown: true }), old);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false);
	inject(policy({ anchorKnown: false }), old);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), true);

	// outside team mode, with no policy, or with no member stage listed
	const unsigned = { [lld]: head('approved'), [build]: head('approved') };
	inject(policy({ teamMode: false }), unsigned);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false);
	inject(policy({ claimsEnforced: false }), unsigned);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false);
	inject('none', unsigned);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false);
	inject(policy({ signoffStages: ['DEF', 'HLD'] }), unsigned);
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false, 'LLD and BUILD are not listed');

	// a member with no artifact yet, and a unit that is neither a Story nor an Epic
	inject(policy(), {});
	assert.equal(signoffHoldsCompletion('/repo', STORY_ID), false);
	assert.equal(signoffHoldsCompletion('/repo', `TASK-${EPIC}-s1-t1`), false);
	assert.equal(signoffHoldsCompletion('/repo', 'not-an-id'), false);
});
