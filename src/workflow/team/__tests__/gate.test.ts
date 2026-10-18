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

import { _setGateDepsForTests, registerCompletionHook, teamGate, type GateDeps, type GuardedAction } from '../gate.js';
import type { PortFailureKind, PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

afterEach(() => { _setGateDepsForTests(); registerCompletionHook(undefined); });

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

function inject(f: Fake | undefined, readPolicy: PolicyReader = policy(), extra: { issue?: string | null; ensure?: GateDeps['ensureIssue']; artifact?: boolean } = {}): { loads: number } {
	const seen = { loads: 0 };
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { seen.loads += 1; return f === undefined ? { ok: false, kind: 'missing-tool', reason: 'gh is not installed' } : { ok: true, value: f.port }; },
		resolveIssue: () => (extra.issue === undefined ? ISSUE : extra.issue),
		...(extra.ensure !== undefined ? { ensureIssue: extra.ensure } : {}),
		...(extra.artifact !== undefined ? { artifactExists: () => extra.artifact as boolean } : {}),
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
	inject(fakePort([]), policy(), { issue: null, ensure: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }), artifact: true });
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'no-issue');
	// a throwing policy reader never escapes
	_setGateDepsForTests({ readPolicy: () => { throw new Error('boom'); } });
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /team gate failed: boom/);
	// anything thrown, not only an Error, is a refusal and the gate itself does not throw
	for (const thrown of [null, undefined, 'a string', 42, { code: 'x' }]) {
		_setGateDepsForTests({ readPolicy: () => { throw thrown; } });
		const o = teamGate('/repo', UNIT, 'author');
		assert.equal(o.kind, 'refused', String(thrown));
	}
	assert.match(String((() => { _setGateDepsForTests({ readPolicy: () => { throw 'a string'; } }); return (teamGate('/repo', UNIT, 'author') as { reason?: string }).reason; })()), /team gate failed: a string/);
});

const FAIL_ENSURE: GateDeps['ensureIssue'] = () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' });

test('the first author turn of a stage with no issue and no artifact is allowed as an explicit exception and any other action on a stage with no issue is refused', () => {
	// no issue, no artifact: only the first author turn is let through, and it says why the issue is missing
	inject(fakePort([]), policy(), { issue: null, ensure: FAIL_ENSURE, artifact: false });
	assert.deepEqual(teamGate('/repo', UNIT, 'author'), { kind: 'no-issue', allowFirstAuthor: true, creationFailure: 'gh timed out' });
	for (const action of ['build', 'approve-local', 'review-fix', 'open-signoff', 'revise', 'release', 'claim'] as GuardedAction[]) {
		const o = teamGate('/repo', UNIT, action);
		assert.deepEqual(o, { kind: 'no-issue', allowFirstAuthor: false, creationFailure: 'gh timed out' }, action);
	}
	// no issue but the artifact exists: not the first draft, so author is refused too
	inject(fakePort([]), policy(), { issue: null, ensure: FAIL_ENSURE, artifact: true });
	assert.equal((teamGate('/repo', UNIT, 'author') as { allowFirstAuthor?: boolean }).allowFirstAuthor, false);

	// a missing issue that ensureUnitIssue can create is created, and the gate then decides on the live assignee
	const f = fakePort([]);
	let ensured = 0;
	inject(f, policy(), { issue: null, ensure: () => { ensured += 1; return { ok: true, value: ISSUE }; }, artifact: false });
	assert.deepEqual(teamGate('/repo', UNIT, 'author'), { kind: 'allowed', implicitClaim: true });
	assert.equal(ensured, 1);
	assert.deepEqual(f.assignees, ['alice']);
});

test('the registered completion hook is consulted for author and build on a next stage and for open-signoff, revise and release, a release called by the hook does not consult it again, and with none registered the gate behaves as continue (a hook-contract test; the completion-releases-the-claim integration test belongs to s7)', () => {
	const f = fakePort(['alice']);
	inject(f);

	// none registered: continue
	assert.deepEqual(teamGate('/repo', UNIT, 'author'), { kind: 'allowed', implicitClaim: false });

	// consulted for the five hooked actions, not for the others; 'continue' lets the gate decide
	const seen: string[] = [];
	registerCompletionHook((_repo, _unit, port) => { seen.push(typeof port.whoAmI); return 'continue'; });
	for (const action of ['author', 'build', 'open-signoff', 'revise', 'release', 'approve-local', 'review-fix', 'claim'] as GuardedAction[]) teamGate('/repo', UNIT, action);
	assert.equal(seen.length, 5, 'author, build, open-signoff, revise and release only');

	// an outcome from the hook is the answer, before the holder is read
	const reads = f.calls.filter(c => c === 'readAssignee').length;
	registerCompletionHook(() => ({ kind: 'awaiting-signoff', request: { ref: 'acme/demo#99' } as never }));
	const o = teamGate('/repo', UNIT, 'author');
	assert.equal(o.kind, 'awaiting-signoff');
	assert.equal(f.calls.filter(c => c === 'readAssignee').length, reads, 'the holder was not read');

	// a gate call made by the hook itself (its release) does not consult the hook again
	let consulted = 0;
	let inner: ReturnType<typeof teamGate> | undefined;
	registerCompletionHook(() => { consulted += 1; inner = teamGate('/repo', UNIT, 'release'); return 'continue'; });
	teamGate('/repo', UNIT, 'open-signoff');
	assert.equal(consulted, 1, 'no recursion');
	assert.equal(inner?.kind, 'allowed');
	// and the guard is released afterwards
	teamGate('/repo', UNIT, 'open-signoff');
	assert.equal(consulted, 2);
});

test('each port failure kind, several assignees, an unreadable policy, a missing issue and a throwing completion hook map to refused or no-issue with the reason and never throw', () => {
	for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as PortFailureKind[]) {
		inject(fakePort([], { failRead: kind }));
		const r = teamGate('/repo', UNIT, 'build');
		assert.equal(r.kind, 'refused', kind);
		assert.match(r.kind === 'refused' ? r.reason : '', new RegExp(`\\(${kind}\\)`));
	}
	inject(fakePort(['bob', 'carol']));
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /more than one assignee/);
	inject(fakePort([]), () => ({ ok: false, reason: 'default branch unknown' }));
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /policy cannot be read/);
	inject(fakePort([]), policy(), { issue: null, ensure: FAIL_ENSURE, artifact: true });
	assert.equal(teamGate('/repo', UNIT, 'build').kind, 'no-issue');

	// a hook that throws (an Error or anything else) refuses with its message and the gate does not throw
	inject(fakePort([]));
	for (const thrown of [new Error('hook broke'), 'plain string', null]) {
		registerCompletionHook(() => { throw thrown; });
		const o = teamGate('/repo', UNIT, 'author');
		assert.equal(o.kind, 'refused');
		assert.match(o.kind === 'refused' ? o.reason : '', /completion hook failed/);
	}
	registerCompletionHook(() => { throw new Error('hook broke'); });
	assert.match(String((teamGate('/repo', UNIT, 'author') as { reason?: string }).reason), /hook broke/);
	// the guard against recursion is reset after a throw
	registerCompletionHook(() => 'continue');
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'allowed');
});
