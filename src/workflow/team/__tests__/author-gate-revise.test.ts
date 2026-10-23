/**
 * The revise gate on the authoring runs (Story s8): a design.epic or design.story run on an HLD or LLD that is in signoff, or was
 * sent back from it, asks the gate for 'revise' instead of 'author', and revising never takes the claim.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/author-gate-revise.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { assertMayAuthor, settleBeforeAuthor } from '../author-gate.js';
import { _setGateDepsForTests, registerCompletionHook, TeamGateRefusedError } from '../gate.js';
import type { GuardedAction } from '../gate.js';
import { _setSignoffDepsForTests } from '../signoff.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { PortResult, SignoffRequestRef, TrackerPort } from '../../tracker/port.js';
import type { WorkflowIntent } from '../../types.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const EPIC = 'a3f4b8c9d1e2f3a4';
const HLD = `HLD-${EPIC}`;
const LLD = `LLD-${EPIC}-s1`;
type Intent = Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>;
const intent = (workflow: string, params: Record<string, unknown> = { epicHash: EPIC, storyId: 's1' }): Intent => ({ workflow, repoPath: '/repo', params }) as Intent;

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

const headOf = (status: string, signoffs: unknown[] = []): unknown => ({ lifecycle: { status, revision: { number: 2 }, signoffs } });

interface World { actions: GuardedAction[]; claimed: string[]; loads: number; heads: Record<string, unknown>; holder: string | null }

/** A world with the gate and the signoff reads wired to it; `me` is the acting user. */
function world(heads: Record<string, unknown>, holder: string | null, me = 'alice', noPolicy = false): World {
	const w: World = { actions: [], claimed: [], loads: 0, heads, holder };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: me }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: w.holder }),
		addAssignee: (_issue: string, who: string): PortResult<string[]> => { w.claimed.push(who); return { ok: true, value: [who] }; },
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy: () => ({ ok: true, value: noPolicy ? 'none' : policy() }),
		loadTracker: () => { w.loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#2',
		artifactExists: () => true,
	});
	_setSignoffDepsForTests({ readHead: (_repo, id) => w.heads[id], readPolicy: () => ({ ok: true, value: noPolicy ? 'none' : policy() }) });
	registerCompletionHook((_repo, _unit, _port, action) => { w.actions.push(action); return 'continue'; });
	return w;
}

const refusal = (fn: () => void): TeamGateRefusedError => {
	try { fn(); } catch (e) { if (e instanceof TeamGateRefusedError) return e; throw e; }
	throw new Error('expected a TeamGateRefusedError');
};

test("assertMayAuthor asks 'revise' for an HLD or LLD in signoff, refuses a non-holder and an unassigned unit without taking the claim, and asks 'author' for any other status, a define run and a plan run", () => {
	for (const [workflow, id] of [['design.epic', HLD], ['design.story', LLD]] as const) {
		for (const status of ['in-signoff', 'changes-requested']) {
			// the holder revises
			let w = world({ [id]: headOf(status) }, 'alice');
			assert.doesNotThrow(() => assertMayAuthor(intent(workflow)), `${workflow} ${status}`);
			assert.deepEqual(w.actions, ['revise']);
			// someone else is refused naming the holder
			w = world({ [id]: headOf(status) }, 'bob');
			const held = refusal(() => assertMayAuthor(intent(workflow)));
			assert.deepEqual(held.outcome.kind === 'held-by-other' ? held.outcome.holder : null, 'bob');
			// nobody holding it is refused with a claim first, and the claim is not taken
			w = world({ [id]: headOf(status) }, null);
			assert.match(refusal(() => assertMayAuthor(intent(workflow))).reason, /nobody holds acme\/demo#2: claim it before revising/);
			assert.deepEqual(w.claimed, [], 'revising never takes the claim');
		}
		// any other status is an ordinary author turn, which takes an unassigned stage as before
		const w = world({ [id]: headOf('approved') }, null);
		assert.doesNotThrow(() => assertMayAuthor(intent(workflow)));
		assert.deepEqual(w.actions, ['author']);
		assert.deepEqual(w.claimed, ['alice']);
	}

	// a plan run is not covered, even over an LLD in signoff, and neither is a head that does not exist yet
	let w = world({ [LLD]: headOf('in-signoff') }, 'alice');
	assertMayAuthor(intent('plan'));
	assert.deepEqual(w.actions, ['author']);
	w = world({}, 'alice');
	assertMayAuthor(intent('design.story'));
	assert.deepEqual(w.actions, ['author']);
	// a define run names no unit, so it reaches no gate
	w = world({ [HLD]: headOf('in-signoff') }, 'bob');
	assertMayAuthor(intent('define', {}));
	assert.deepEqual([w.actions, w.loads], [[], 0]);
	// a repository with no policy makes no tracker call
	w = world({ [LLD]: headOf('in-signoff') }, 'bob', 'alice', true);
	assertMayAuthor(intent('design.story'));
	assert.equal(w.loads, 0);
});

test('a design.story run on an LLD in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor', async () => {
	const request = { entityId: 'acme/demo#5', type: 'signoff-request', relation: 'tracked-by' };
	const w = world({
		[HLD]: headOf('in-signoff', [{ revision: 2, request, state: 'open', actors: [], at: '2026-07-01T00:00:00Z' }]),
		[LLD]: headOf('changes-requested', [{ revision: 1, request, state: 'changes-requested', actors: [], at: '2026-07-01T00:00:00Z' }]),
	}, 'alice');
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: 'open' }),
	} as unknown as TrackerPort;
	_setSignoffDepsForTests({
		readHead: (_repo, id) => w.heads[id], readPolicy: () => ({ ok: true, value: policy() }),
		loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#2',
		lifecycleFor: () => ({ completeIfRolledUp: async () => ({ completed: [] }) }) as unknown as LifecycleService,
	});
	await assert.rejects(settleBeforeAuthor(intent('design.story')), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'awaiting-signoff' && e.outcome.request.ref === 'acme/demo#5');
	assert.deepEqual(w.actions, [], 'the gate was never asked: the refusal came before assertMayAuthor');
});
