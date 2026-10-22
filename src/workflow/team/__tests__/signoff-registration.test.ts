/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Where the signoff hook is registered and what the gate hands it (Story s7).
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-registration.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setGateDepsForTests, registerCompletionHook, teamGate, type GuardedAction } from '../gate.js';
import { _setSignoffDepsForTests, registerSignoffHook } from '../signoff.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const policy = { teamMode: true, claimsEnforced: true, administrators: [], signoffStages: ['LLD'], source: { anchorKnown: true, firstCommitTime: '2026-06-01T00:00:00Z' } } as unknown as TeamPolicy;
const port = {
	kind: 'github', capabilities: new Set(['claim']),
	whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
	readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'alice' }),
} as unknown as TrackerPort;

function injectGate(): void {
	_setGateDepsForTests({ readPolicy: () => ({ ok: true, value: policy }), loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', now: () => '2026-10-18T00:00:00.000Z' });
}

test('consultHook passes the action and the authoring workflow to the hook and an older three-argument hook still works', () => {
	injectGate();

	// a hook that takes the new arguments gets them
	const seen: Array<{ action: GuardedAction; authoring: string | undefined }> = [];
	registerCompletionHook((_repo, _unit, _port, action, authoring) => { seen.push({ action, authoring }); return 'continue'; });
	teamGate('/repo', UNIT, 'author', 'plan');
	teamGate('/repo', UNIT, 'build');
	assert.deepEqual(seen, [{ action: 'author', authoring: 'plan' }, { action: 'build', authoring: undefined }]);

	// a hook written with three parameters keeps working
	let calls = 0;
	registerCompletionHook((_repo: string, _unit: UnitRef, _port: TrackerPort) => { calls += 1; return 'continue'; });
	assert.deepEqual(teamGate('/repo', UNIT, 'author', 'design.story'), { kind: 'allowed', implicitClaim: false });
	assert.equal(calls, 1);

	// the registered signoff hook is judged by the stage the attempt follows, through the real gate
	registerSignoffHook();
	_setSignoffDepsForTests({
		readPolicy: () => ({ ok: true, value: policy }),
		readHead: (_repo, id) => id === 'LLD-a3f4b8c9d1e2f3a4-s1'
			? { lifecycle: { status: 'in-signoff', revision: { number: 1 }, approval: { revision: 1, at: '2026-07-01T00:00:00Z' }, signoffs: [{ revision: 1, request: { entityId: 'acme/demo#2', type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: '2026-07-01T00:00:00Z' }] } }
			: undefined,
	});
	assert.deepEqual(teamGate('/repo', UNIT, 'author', 'plan'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	assert.deepEqual(teamGate('/repo', UNIT, 'author', 'design.story'), { kind: 'allowed', implicitClaim: false }, 'design.story follows the HLD, which is not listed');
	assert.deepEqual(teamGate('/repo', UNIT, 'open-signoff'), { kind: 'allowed', implicitClaim: false }, 'a submission is never blocked by its own request');
});
