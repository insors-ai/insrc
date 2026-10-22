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

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setSignoffDepsForTests, blockedBySignoff, followedStageOf, isSignedOffOrGrandfathered, settleForAttempt, signoffCompletionHook } from '../signoff.js';
import { TeamGateRefusedError } from '../gate.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { PortResult, SignoffRequestRef, TrackerPort } from '../../tracker/port.js';
import type { GuardedAction } from '../gate.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setSignoffDepsForTests(); });

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

// --- blockedBySignoff and the hook ------------------------------------------------------------------------------------------

const so = (revision: number, ref: string, state: 'open' | 'changes-requested' | 'completed') =>
	({ revision, request: { entityId: ref, type: 'signoff-request', relation: 'tracked-by' }, state, actors: [], at: '2026-07-01T00:00:00Z' });
const headOf = (status: string, signoffs: unknown[] = [], approvedAt = '2026-07-01T00:00:00Z'): unknown =>
	({ lifecycle: { status, revision: { number: 1 }, approval: { revision: 1, at: approvedAt }, signoffs } });

interface World { policy?: TeamPolicy | 'none'; heads: Record<string, unknown>; reads: string[] }

function world(w: World): World {
	_setSignoffDepsForTests({
		readPolicy: () => ({ ok: true, value: w.policy ?? policy({ anchorKnown: true }) }),
		readHead: (_repo, id) => { w.reads.push(id); return w.heads[id]; },
	});
	return w;
}

const HLD = `HLD-${EPIC}`;
const LLD = `LLD-${EPIC}-s1`;
const DEF = `DEF-${EPIC}`;

test('blockedBySignoff and signoffCompletionHook on one story unit block design.story authoring on the HLD\'s open request and plan authoring on the LLD\'s open request, but not the LLD\'s own authoring, skip a grandfathered head, return awaiting-signoff, a changes-requested refusal, an unsettled-completed refusal, or continue, never write, and need no tracker call', () => {
	// the HLD awaits signoff and the LLD awaits signoff: design.story is judged by the HLD, plan by the LLD
	const w = world({ heads: { [HLD]: headOf('in-signoff', [so(1, 'acme/demo#1', 'open')]), [LLD]: headOf('in-signoff', [so(1, 'acme/demo#2', 'open')]) }, reads: [] });

	assert.deepEqual(blockedBySignoff('/repo', storyUnit, 'author', 'design.story'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#1' } });
	assert.deepEqual(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	assert.deepEqual(blockedBySignoff('/repo', taskUnit, 'build'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	assert.deepEqual(w.reads.filter(id => id === LLD).length > 0, true);

	// the LLD's own request does not block authoring the LLD once the HLD is signed off
	w.heads[HLD] = headOf('signed-off', [so(1, 'acme/demo#1', 'completed')]);
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'design.story'), null);

	// the hook: author and build answer with the decision, everything else continues; the port is never used
	const port = new Proxy({}, { get: () => { throw new Error('the hook must not touch the tracker'); } });
	assert.deepEqual(signoffCompletionHook('/repo', storyUnit, port, 'author', 'plan'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	assert.deepEqual(signoffCompletionHook('/repo', taskUnit, port, 'build'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#2' } });
	for (const action of ['open-signoff', 'revise', 'release', 'approve-local', 'claim', 'review-fix'] as GuardedAction[]) {
		assert.equal(signoffCompletionHook('/repo', storyUnit, port, action, 'plan'), 'continue', action);
	}

	// changes requested, never submitted, and a completed request that is not yet recorded all refuse
	w.heads[LLD] = headOf('changes-requested', [so(1, 'acme/demo#2', 'changes-requested')]);
	const changes = blockedBySignoff('/repo', storyUnit, 'author', 'plan');
	assert.equal(changes?.kind, 'refused');
	assert.match(changes?.kind === 'refused' ? changes.reason : '', /changes were requested.*acme\/demo#2/);
	w.heads[LLD] = headOf('approved');
	assert.match((blockedBySignoff('/repo', storyUnit, 'author', 'plan') as { reason: string }).reason, /submit it for signoff/);
	w.heads[LLD] = headOf('in-signoff', [so(1, 'acme/demo#2', 'completed')]);
	assert.match((blockedBySignoff('/repo', storyUnit, 'author', 'plan') as { reason: string }).reason, /completed but not yet recorded/);

	// a head that is signed off, or grandfathered, does not block
	w.heads[LLD] = headOf('signed-off', [so(1, 'acme/demo#2', 'completed')]);
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null);
	w.heads[LLD] = headOf('approved', [], '2026-05-01T00:00:00Z');
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null, 'approved before the anchor');
	w.policy = policy({ anchorKnown: false });
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan')?.kind, 'refused', 'nothing is grandfathered when the anchor is unknown');

	// a stage the policy does not list, no policy, no artifact yet: nothing blocks
	w.policy = { ...policy({ anchorKnown: true }), signoffStages: ['DEF', 'HLD'] } as TeamPolicy;
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null, 'LLD is not listed');
	w.policy = 'none';
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null);
	w.policy = { ...policy({ anchorKnown: true }), teamMode: false } as TeamPolicy;
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null, 'not team mode');
	w.policy = policy({ anchorKnown: true });
	delete w.heads[LLD];
	assert.equal(blockedBySignoff('/repo', storyUnit, 'author', 'plan'), null, 'no artifact to wait on');

	// design.epic follows the DEF
	w.heads[DEF] = headOf('in-signoff', [so(1, 'acme/demo#3', 'open')]);
	assert.deepEqual(blockedBySignoff('/repo', epicUnit, 'author', 'design.epic'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#3' } });
	// an attempt that follows nothing is never blocked
	assert.equal(blockedBySignoff('/repo', storyUnit, 'approve-local'), null);
});

test('settleForAttempt refuses a first design.story turn on a story whose issue could not be created while the HLD awaits signoff, before teamGate\'s allowFirstAuthor exception is reached', async () => {
	// the HLD of the epic awaits signoff; the story has no issue at all, which is the case teamGate lets a first author turn through
	const heads: Record<string, unknown> = { [`HLD-${EPIC}`]: headOf('in-signoff', [so(1, 'acme/demo#5', 'open')]) };
	let state: 'open' | 'completed' = 'open';
	const applied: string[] = [];
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: state }),
		setAssignee: (): PortResult<void> => ({ ok: true, value: undefined }),
	} as unknown as TrackerPort;
	const service = {
		apply: async (id: string, op: string) => { applied.push(`${id}:${op}`); heads[id] = headOf('signed-off', [so(1, 'acme/demo#5', 'completed')]); },
		completeIfRolledUp: async () => ({ completed: [] }),
	} as unknown as LifecycleService;
	const deps = {
		readPolicy: () => ({ ok: true as const, value: policy({ anchorKnown: true }) }),
		readHead: (_repo: string, id: string) => heads[id],
		loadTracker: () => ({ ok: true as const, value: port }),
		resolveIssue: () => null,
		lifecycleFor: () => service,
	};

	// refused at the entry, as awaiting signoff and linking the request, whatever the gate would have said
	await assert.rejects(settleForAttempt('/repo', storyUnit, 'author', 'design.story', deps), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'awaiting-signoff' && e.outcome.request.ref === 'acme/demo#5');
	assert.deepEqual(applied, []);

	// the tracker reports it completed: it is recorded and the attempt proceeds
	state = 'completed';
	await settleForAttempt('/repo', storyUnit, 'author', 'design.story', deps);
	assert.deepEqual(applied, [`HLD-${EPIC}:signed-off`]);

	// an attempt that follows nothing is not touched, and a never-submitted stage refuses
	await settleForAttempt('/repo', storyUnit, 'approve-local', undefined, deps);
	heads[`LLD-${EPIC}-s1`] = headOf('approved');
	await assert.rejects(settleForAttempt('/repo', storyUnit, 'author', 'plan', deps), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'refused' && /submit it for signoff/.test(e.outcome.reason));
});
