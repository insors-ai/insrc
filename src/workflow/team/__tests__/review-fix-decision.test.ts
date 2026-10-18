/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Whether an automatic review may write fixes: yes for the holder or when no gate applies,
 * report-only for a non-holder or a failed read. A review itself is never refused.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/review-fix-decision.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setGateDepsForTests, reviewFixDecision } from '../gate.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

afterEach(() => _setGateDepsForTests());

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

function inject(holder: string | null | 'fail', readPolicy: PolicyReader = team): { addCalls: number } {
	const seen = { addCalls: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => (holder === 'fail' ? { ok: false, kind: 'unreachable', reason: 'timed out' } : { ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => { seen.addCalls += 1; return { ok: true, value: ['alice'] }; },
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7' });
	return seen;
}

test('reviewFixDecision returns apply-auto-fixes for the holder or when no gate applies and report-only for a non-holder or a failed read', () => {
	inject('alice');
	assert.equal(reviewFixDecision('/repo', UNIT), 'apply-auto-fixes', 'the holder');
	const free = inject(null);
	assert.equal(reviewFixDecision('/repo', UNIT), 'apply-auto-fixes', 'an unassigned stage: nobody to protect, and a review takes no claim');
	assert.equal(free.addCalls, 0, 'a review never takes a claim');
	inject('bob');
	assert.equal(reviewFixDecision('/repo', UNIT), 'report-only', 'a non-holder');
	inject('fail');
	assert.equal(reviewFixDecision('/repo', UNIT), 'report-only', 'a failed read');
	inject('bob', () => ({ ok: true, value: 'none' }));
	assert.equal(reviewFixDecision('/repo', UNIT), 'apply-auto-fixes', 'no team policy: no gate applies');
	_setGateDepsForTests({ readPolicy: () => { throw new Error('boom'); } });
	assert.equal(reviewFixDecision('/repo', UNIT), 'report-only', 'a throwing dependency never escapes');
});
