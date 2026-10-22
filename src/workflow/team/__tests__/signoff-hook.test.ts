/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The signoff decisions (Story s7): the stage an attempt follows, what counts as signed off, and (later) the read-only
 * decision and the completion hook.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-hook.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { followedStageOf, isSignedOffOrGrandfathered } from '../signoff.js';
import type { GuardedAction } from '../gate.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

const EPIC = 'a3f4b8c9d1e2f3a4';
const epicUnit: UnitRef = { unit: 'epic', repoPath: '/repo', epicHash: EPIC };
const storyUnit: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: EPIC, storyId: 's1' };
const taskUnit: UnitRef = { unit: 'task', repoPath: '/repo', epicHash: EPIC, storyId: 's1', taskId: 't1' };

const policy = (over: { anchorKnown: boolean; firstCommitTime?: string }): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: over.firstCommitTime ?? '2026-06-01T00:00:00Z', anchorKnown: over.anchorKnown },
}) as TeamPolicy;

const meta = (status: string, approvedAt?: string): unknown => ({ lifecycle: { status, revision: { number: 1 }, signoffs: [], ...(approvedAt !== undefined ? { approval: { revision: 1, at: approvedAt } } : {}) } });

test('isSignedOffOrGrandfathered counts a signed-off head, counts a head approved before the anchor only when anchorKnown is true, and never grandfathers when anchorKnown is false', () => {
	const known = policy({ anchorKnown: true });
	const unknown = policy({ anchorKnown: false });

	assert.equal(isSignedOffOrGrandfathered(known, meta('signed-off')), true);
	assert.equal(isSignedOffOrGrandfathered(known, meta('completed')), true, 'completion freezes a head that was signed off or grandfathered');
	assert.equal(isSignedOffOrGrandfathered(known, meta('approved', '2026-07-01T00:00:00Z')), false, 'approved after the anchor');
	assert.equal(isSignedOffOrGrandfathered(known, meta('in-signoff', '2026-07-01T00:00:00Z')), false);

	assert.equal(isSignedOffOrGrandfathered(known, meta('approved', '2026-05-01T00:00:00Z')), true, 'approved before the anchor');
	assert.equal(isSignedOffOrGrandfathered(known, meta('draft')), false, 'a draft has no approval');
	assert.equal(isSignedOffOrGrandfathered(known, meta('approved')), false, 'no approval time');

	assert.equal(isSignedOffOrGrandfathered(unknown, meta('approved', '2026-05-01T00:00:00Z')), false, 'never when the anchor is unknown');
	assert.equal(isSignedOffOrGrandfathered(unknown, meta('signed-off')), true);
});

test('followedStageOf maps author design.epic to DEF on the epic, author design.story to HLD on the epic, author plan and build to LLD on the story, and anything else to null', () => {
	assert.deepEqual(followedStageOf('author', 'design.epic', epicUnit), { stage: 'DEF', unit: epicUnit });
	assert.deepEqual(followedStageOf('author', 'design.story', storyUnit), { stage: 'HLD', unit: epicUnit });
	assert.deepEqual(followedStageOf('author', 'plan', storyUnit), { stage: 'LLD', unit: storyUnit });
	assert.deepEqual(followedStageOf('build', undefined, storyUnit), { stage: 'LLD', unit: storyUnit });
	assert.deepEqual(followedStageOf('build', undefined, taskUnit), { stage: 'LLD', unit: storyUnit }, 'a task build follows its Story LLD');

	const others: GuardedAction[] = ['approve-local', 'open-signoff', 'revise', 'release', 'claim', 'review-fix'];
	for (const action of others) assert.equal(followedStageOf(action, 'plan', storyUnit), null, action);
	assert.equal(followedStageOf('author', undefined, storyUnit), null, 'an author turn with no workflow follows nothing');
	assert.equal(followedStageOf('author', 'define', epicUnit), null);
	assert.equal(followedStageOf('author', 'design.epic', storyUnit), null, 'design.epic is an epic-unit attempt');
	assert.equal(followedStageOf('build', undefined, epicUnit), null);
});
