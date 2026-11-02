/**
 * assertMayReviseDraft (Story f32c3abf4a55494b/s1): the shared check of a writer that changes a draft outside an authoring run asks
 * the team gate for 'revise' when the stage is in signoff or was sent back from it and for 'author' otherwise.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/revise-draft-gate.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { assertMayReviseDraft } from '../author-gate.js';
import { _setGateDepsForTests, registerCompletionHook, TeamGateRefusedError } from '../gate.js';
import type { GuardedAction } from '../gate.js';
import { _setSignoffDepsForTests } from '../signoff.js';
import { ToolDenied } from '../../tracker/tool-denied.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const EPIC = 'a3f4b8c9d1e2f3a4';
const epic: UnitRef = { unit: 'epic', repoPath: '/repo', epicHash: EPIC };
const story: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: EPIC, storyId: 's1' };
const headOf = (status: string): unknown => ({ lifecycle: { status, revision: { number: 2 }, signoffs: [] } });

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

interface World { actions: GuardedAction[]; claimed: string[]; loads: number }

/** The gate and the signoff reads wired to a world; `holder` is who holds the issue and `me` the acting user. */
function world(heads: Record<string, unknown>, holder: string | null, opts: { me?: string; noPolicy?: boolean; whoAmI?: () => PortResult<string> } = {}): World {
	const w: World = { actions: [], claimed: [], loads: 0 };
	const me = opts.me ?? 'alice';
	const port = {
		whoAmI: opts.whoAmI ?? ((): PortResult<string> => ({ ok: true, value: me })),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (_issue: string, who: string): PortResult<string[]> => { w.claimed.push(who); return { ok: true, value: [who] }; },
	} as unknown as TrackerPort;
	const readPolicy = async () => ({ ok: true as const, value: opts.noPolicy === true ? 'none' as const : policy() });
	_setGateDepsForTests({ readPolicy, loadTracker: () => { w.loads += 1; return { ok: true, value: port }; }, resolveIssue: () => 'acme/demo#2', artifactExists: () => true });
	_setSignoffDepsForTests({ readHead: (_repo, id) => heads[id], readPolicy });
	registerCompletionHook((_repo, _unit, _port, action) => { w.actions.push(action); return 'continue'; });
	return w;
}

const refusal = async (fn: () => Promise<void>): Promise<TeamGateRefusedError> => {
	try { await fn(); } catch (e) { if (e instanceof TeamGateRefusedError) return e; throw e; }
	throw new Error('expected a TeamGateRefusedError');
};

test('assertMayReviseDraft asks teamGate for revise when the stage is in signoff or changes-requested and for author otherwise, and applies assertHeld for revise', async () => {
	const cases: Array<[UnitRef, 'DEF' | 'HLD' | 'LLD', string]> = [[epic, 'DEF', `DEF-${EPIC}`], [epic, 'HLD', `HLD-${EPIC}`], [story, 'LLD', `LLD-${EPIC}-s1`]];
	for (const [unit, stage, id] of cases) {
		for (const status of ['in-signoff', 'changes-requested']) {
			// the holder revises
			let w = world({ [id]: headOf(status) }, 'alice');
			await assertMayReviseDraft('/repo', unit, stage, 'define');
			assert.deepEqual(w.actions, ['revise'], `${stage} ${status}`);
			// someone else is refused naming the holder
			w = world({ [id]: headOf(status) }, 'bob');
			const held = await refusal(() => assertMayReviseDraft('/repo', unit, stage, 'define'));
			assert.equal(held.outcome.kind === 'held-by-other' ? held.outcome.holder : null, 'bob');
			// nobody holding it is refused with a claim first, and revising never takes the claim
			w = world({ [id]: headOf(status) }, null);
			assert.match((await refusal(() => assertMayReviseDraft('/repo', unit, stage, 'define'))).reason, /nobody holds acme\/demo#2: claim it before revising/);
			assert.deepEqual(w.claimed, []);
		}
		// any other status, or no head, is an ordinary author turn, which takes an unassigned stage
		for (const heads of [{ [id]: headOf('approved') }, {}]) {
			const w = world(heads, null);
			await assertMayReviseDraft('/repo', unit, stage, 'define');
			assert.deepEqual(w.actions, ['author']);
			assert.deepEqual(w.claimed, ['alice']);
		}
	}
});

test('assertMayReviseDraft resolves with no tracker call in a repo with no team policy', async () => {
	const w = world({ [`DEF-${EPIC}`]: headOf('in-signoff') }, 'bob', { noPolicy: true });
	await assertMayReviseDraft('/repo', epic, 'DEF', 'define');
	assert.deepEqual([w.loads, w.actions, w.claimed], [0, [], []]);
});

test('assertMayReviseDraft rethrows a ToolDenied and throws TeamGateRefusedError for every other refusal', async () => {
	// a stage held by someone else, a stage whose actor cannot be read and a stage with no issue are all refusals
	world({ [`DEF-${EPIC}`]: headOf('approved') }, 'bob');
	await refusal(() => assertMayReviseDraft('/repo', epic, 'DEF', 'define'));
	world({ [`DEF-${EPIC}`]: headOf('approved') }, 'alice', { whoAmI: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }) });
	await refusal(() => assertMayReviseDraft('/repo', epic, 'DEF', 'define'));

	// a denied tracker call is rethrown as it is, never made a refusal
	const denied = new ToolDenied('gh_tracker', 'declined', {});
	world({ [`DEF-${EPIC}`]: headOf('approved') }, 'alice', { whoAmI: () => { throw denied; } });
	await assert.rejects(() => assertMayReviseDraft('/repo', epic, 'DEF', 'define'), (e: unknown) => e === denied);
});
