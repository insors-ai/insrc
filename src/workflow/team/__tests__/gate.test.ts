/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The team gate (sc4): who may change a stage. Driven against an in-memory tracker
 * port and an injected policy, with no network and no git.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/gate.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setGateDepsForTests, teamGate, type GuardedAction } from '../gate.js';
import type { PortFailureKind, PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

afterEach(() => _setGateDepsForTests());

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const ISSUE = 'acme/demo#7';

const policy = (over: Partial<TeamPolicy> = {}): PolicyReader => () => ({
	ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'], ...over } as unknown as TeamPolicy,
});
const none: PolicyReader = () => ({ ok: true, value: 'none' });

interface Fake { port: TrackerPort; assignees: string[]; calls: string[] }

/** An in-memory port: `assignees` is the issue's live assignee list. */
function fakePort(initial: string[], over: { me?: string; failWho?: PortFailureKind; failRead?: PortFailureKind; failAdd?: PortFailureKind; raceWith?: string } = {}): Fake {
	const assignees = [...initial];
	const calls: string[] = [];
	const port = {
		kind: 'github', capabilities: new Set(['claim']),
		whoAmI: (): PortResult<string> => {
			calls.push('whoAmI');
			return over.failWho !== undefined ? { ok: false, kind: over.failWho, reason: `who ${over.failWho}` } : { ok: true, value: over.me ?? 'alice' };
		},
		readAssignee: (): PortResult<string | null> => {
			calls.push('readAssignee');
			if (over.failRead !== undefined) return { ok: false, kind: over.failRead, reason: `read ${over.failRead}` };
			if (assignees.length > 1) return { ok: false, kind: 'rejected', reason: `${ISSUE} has more than one assignee (${assignees.join(', ')})` };
			return { ok: true, value: assignees[0] ?? null };
		},
		addAssignee: (_issue: string, who: string): PortResult<string[]> => {
			calls.push(`addAssignee:${who}`);
			if (over.failAdd !== undefined) return { ok: false, kind: over.failAdd, reason: `add ${over.failAdd}` };
			if (over.raceWith !== undefined) assignees.push(over.raceWith);   // another claimant got in between
			if (!assignees.some(a => a.toLowerCase() === who.toLowerCase())) assignees.push(who);
			return { ok: true, value: [...assignees] };
		},
		setAssignee: (): PortResult<void> => { calls.push('setAssignee'); return { ok: true, value: undefined }; },
	} as unknown as TrackerPort;
	return { port, assignees, calls };
}

function inject(f: Fake | undefined, readPolicy: PolicyReader = policy(), extra: { issue?: string | null } = {}): { loads: number } {
	const seen = { loads: 0 };
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { seen.loads += 1; return f === undefined ? { ok: false, kind: 'missing-tool', reason: 'gh is not installed' } : { ok: true, value: f.port }; },
		resolveIssue: () => (extra.issue === undefined ? ISSUE : extra.issue),
		now: () => '2026-10-18T00:00:00.000Z',
	});
	return seen;
}

test('teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false', () => {
	for (const readPolicy of [none, policy({ teamMode: false }), policy({ claimsEnforced: false })]) {
		const f = fakePort(['bob']);
		const seen = inject(f, readPolicy);
		for (const action of ['author', 'build', 'approve-local', 'open-signoff', 'review-fix'] as GuardedAction[]) {
			assert.deepEqual(teamGate('/repo', UNIT, action), { kind: 'allowed', implicitClaim: false }, action);
		}
		assert.equal(seen.loads, 0, 'the tracker is never loaded');
		assert.deepEqual(f.calls, [], 'no port call');
	}
	// an action the gate does not know is not guarded
	inject(fakePort(['bob']));
	assert.deepEqual(teamGate('/repo', UNIT, 'analyze' as GuardedAction), { kind: 'allowed', implicitClaim: false });
});

test('teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding', () => {
	for (const action of ['author', 'build'] as GuardedAction[]) {
		const f = fakePort([]);
		inject(f);
		assert.deepEqual(teamGate('/repo', UNIT, action), { kind: 'allowed', implicitClaim: true }, action);
		assert.deepEqual(f.assignees, ['alice']);
		assert.ok(f.calls.includes('addAssignee:alice'));
		assert.ok(!f.calls.includes('setAssignee'), 'a claim never uses the replacing setAssignee');
	}
	// approve-local and applying a finding (review-fix) take no claim
	for (const action of ['approve-local', 'review-fix'] as GuardedAction[]) {
		const f = fakePort([]);
		inject(f);
		assert.deepEqual(teamGate('/repo', UNIT, action), { kind: 'allowed', implicitClaim: false }, action);
		assert.deepEqual(f.assignees, []);
		assert.ok(!f.calls.some(c => c.startsWith('addAssignee')));
	}
	// a failed or contested implicit claim refuses the action
	const failed = fakePort([], { failAdd: 'unreachable' });
	inject(failed);
	const r = teamGate('/repo', UNIT, 'author');
	assert.equal(r.kind, 'refused');
	assert.match(r.kind === 'refused' ? r.reason : '', /implicit claim failed \(unreachable\)/);
	const raced = fakePort([], { raceWith: 'bob' });
	inject(raced);
	const c = teamGate('/repo', UNIT, 'build');
	assert.equal(c.kind, 'refused');
	assert.match(c.kind === 'refused' ? c.reason : '', /contested: bob, alice/);
	assert.deepEqual(raced.assignees, ['bob', 'alice'], 'nobody is removed');
});

test('teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively', () => {
	const f = fakePort(['Alice']);
	inject(f);
	for (const action of ['author', 'build', 'approve-local', 'review-fix'] as GuardedAction[]) {
		assert.deepEqual(teamGate('/repo', UNIT, action), { kind: 'allowed', implicitClaim: false }, action);
	}
	assert.ok(!f.calls.some(c => c.startsWith('addAssignee')), 'no claim was needed');
});

test('teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder\'s idle time', () => {
	const f = fakePort(['bob']);
	inject(f);
	for (const action of ['author', 'build', 'approve-local', 'review-fix', 'open-signoff'] as GuardedAction[]) {
		const o = teamGate('/repo', UNIT, action);
		assert.deepEqual(o, { kind: 'held-by-other', holder: 'bob', offerPark: false }, action);
	}
	assert.deepEqual(f.assignees, ['bob'], 'the holder is never replaced');
	assert.ok(!f.calls.some(c => c.startsWith('addAssignee') || c === 'setAssignee'));

	// every refusal shape: several assignees, each port failure kind, an unreadable policy, a missing issue
	const several = fakePort(['bob', 'carol']);
	inject(several);
	const m = teamGate('/repo', UNIT, 'author');
	assert.equal(m.kind, 'refused');
	assert.match(m.kind === 'refused' ? m.reason : '', /more than one assignee \(bob, carol\)/);
	for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as PortFailureKind[]) {
		inject(fakePort([], { failRead: kind }));
		const r = teamGate('/repo', UNIT, 'author');
		assert.equal(r.kind, 'refused', kind);
		assert.match(r.kind === 'refused' ? r.reason : '', new RegExp(`\\(${kind}\\)`));
		inject(fakePort([], { failWho: kind }));
		assert.equal(teamGate('/repo', UNIT, 'author').kind, 'refused', `whoAmI ${kind}`);
	}
	inject(undefined);
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /gh is not installed/);
	inject(fakePort([]), () => ({ ok: false, reason: 'default branch unknown' }));
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /policy cannot be read: default branch unknown/);
	inject(fakePort([]), policy(), { issue: null });
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'refused');
	// a throwing policy reader never escapes
	_setGateDepsForTests({ readPolicy: () => { throw new Error('boom'); } });
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /team gate failed: boom/);
});
