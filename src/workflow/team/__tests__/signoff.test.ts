/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Signoff (Story s7): the derived records, the request Reference and, later, submit and settle.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setSignoffDepsForTests, openSignoff, settleSignoff, signoffRecordsFromHeads, signoffRecordsOf, signoffRefOf, signoffReferenceOf, signoffViewOf, stagesOfUnit, type CodeReviewRecord, type SignoffDeps } from '../signoff.js';
import { TeamGateRefusedError } from '../gate.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { PortResult, SignoffRequestRef, SignoffRequestSpec, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

afterEach(() => { _setSignoffDepsForTests(); });

const EPIC = 'a3f4b8c9d1e2f3a4';
const STORY: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: EPIC, storyId: 's1' };

const policy = (over: { anchorKnown?: boolean; firstCommitTime?: string } = {}): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: over.firstCommitTime ?? '2026-06-01T00:00:00Z', anchorKnown: over.anchorKnown ?? true },
}) as TeamPolicy;

const signoff = (revision: number, ref: string, state: 'open' | 'changes-requested' | 'completed', at = '2026-07-01T00:00:00Z', type = 'signoff-request') =>
	({ revision, request: { entityId: ref, type, relation: 'tracked-by' }, state, actors: [], at });

const head = (status: string, over: { revision?: number; approvedAt?: string; signoffs?: unknown[] } = {}): unknown => ({
	lifecycle: {
		status, revision: { number: over.revision ?? 1 },
		...(over.approvedAt !== undefined ? { approval: { revision: over.revision ?? 1, at: over.approvedAt } } : {}),
		signoffs: over.signoffs ?? [],
	},
});

test('signoffRecordsOf derives sc5 records from lifecycle facts, groups by the ref read from entityId, and grandfathers by the shared rule', () => {
	const heads = {
		'LLD-a3f4b8c9d1e2f3a4-s1': head('signed-off', { signoffs: [signoff(1, 'acme/demo#9', 'completed', '2026-07-02T00:00:00Z')] }),
		'BUILD-a3f4b8c9d1e2f3a4-s1': head('signed-off', { signoffs: [signoff(1, 'acme/demo#9', 'completed', '2026-07-03T00:00:00Z')] }),
	};
	const read = (_repo: string, id: string): unknown => (heads as Record<string, unknown>)[id];
	const readPolicy: PolicyReader = () => ({ ok: true, value: policy() });

	const records = signoffRecordsOf('/repo', STORY, { readPolicy, readHead: read });
	assert.equal(records.length, 1, 'one request covers both artifacts');
	assert.deepEqual(records[0]?.request, { ref: 'acme/demo#9' });
	assert.deepEqual(records[0]?.artifacts.map(a => a.artifactId).sort(), ['BUILD-a3f4b8c9d1e2f3a4-s1', 'LLD-a3f4b8c9d1e2f3a4-s1']);
	assert.equal(records[0]?.completedAt, '2026-07-03T00:00:00Z');
	assert.equal(records[0]?.grandfathered, undefined);

	// an open or changes-requested signoff is not a completed record
	assert.deepEqual(signoffRecordsFromHeads(policy(), [{ artifactId: 'LLD-x', meta: head('in-signoff', { signoffs: [signoff(1, 'r#1', 'open')] }) }]), []);

	// a signoff that names no request is skipped
	assert.deepEqual(signoffRecordsFromHeads(policy(), [{ artifactId: 'LLD-x', meta: head('signed-off', { signoffs: [signoff(1, 'r#1', 'completed', '2026-07-01T00:00:00Z', 'something-else')] }) }]), []);

	// grandfathered by the shared rule: approved before the anchor, anchor known
	const old = { artifactId: 'LLD-old', meta: head('approved', { approvedAt: '2026-05-01T00:00:00Z' }) };
	const known = signoffRecordsFromHeads(policy(), [old]);
	assert.equal(known.length, 1);
	assert.equal(known[0]?.grandfathered, true);
	assert.equal(known[0]?.request.ref, '');
	// and never when the anchor is unknown
	assert.deepEqual(signoffRecordsFromHeads(policy({ anchorKnown: false }), [old]), []);

	// no policy, or no team mode: no records
	assert.deepEqual(signoffRecordsOf('/repo', STORY, { readPolicy: () => ({ ok: true, value: 'none' }), readHead: read }), []);
});

test('the request Reference round trip keeps the ref and never changes the Reference type', () => {
	const reference = signoffReferenceOf({ ref: 'acme/demo#9' });
	assert.deepEqual(reference, { entityId: 'acme/demo#9', type: 'signoff-request', relation: 'tracked-by' });
	assert.deepEqual(signoffRefOf(reference), { ref: 'acme/demo#9' });
	assert.equal(signoffRefOf({ entityId: 'acme/demo#9', type: 'other', relation: 'tracked-by' }), null);
	assert.equal(signoffRefOf({ entityId: '', type: 'signoff-request', relation: 'tracked-by' }), null);
});

test('signoffViewOf shows the signoff of the current revision only', () => {
	assert.deepEqual(signoffViewOf(head('approved')), { state: 'none', request: null, revision: null });
	const open = head('in-signoff', { revision: 2, signoffs: [signoff(1, 'r#1', 'completed'), signoff(2, 'r#2', 'open')] });
	assert.deepEqual(signoffViewOf(open), { state: 'open', request: { ref: 'r#2' }, revision: 2 });
	// edited since: the old signoff covers an older revision
	const edited = head('draft', { revision: 3, signoffs: [signoff(2, 'r#2', 'completed')] });
	assert.deepEqual(signoffViewOf(edited), { state: 'none', request: null, revision: null });
	assert.deepEqual(signoffViewOf(undefined), { state: 'none', request: null, revision: null });
});

// --- openSignoff ---------------------------------------------------------------------------------------------------------------

const LLD = `LLD-${EPIC}-s1`;
const BUILD = `BUILD-${EPIC}-s1`;
const HLD = `HLD-${EPIC}`;
const DEF = `DEF-${EPIC}`;
const EPIC_UNIT: UnitRef = { unit: 'epic', repoPath: '/repo', epicHash: EPIC };

const approvedHead = (over: { review?: 'daemon' | 'controller' | 'none'; authoredBy?: string; status?: string; revision?: number; approvedRevision?: number; signoffs?: unknown[] } = {}): unknown => ({
	authoredBy: over.authoredBy ?? 'controller',
	lifecycle: {
		status: over.status ?? 'approved', revision: { number: over.revision ?? 1 },
		approval: { revision: over.approvedRevision ?? over.revision ?? 1, at: '2026-07-01T00:00:00Z' },
		...(over.review !== 'none' ? { review: { revision: over.revision ?? 1, party: over.review ?? 'daemon', verdict: 'pass', counts: {}, at: '2026-07-01T00:00:00Z' } } : {}),
		signoffs: over.signoffs ?? [],
	},
});

interface Submit {
	heads: Record<string, unknown>;
	applied: Array<{ id: string; op: string; request: unknown }>;
	opened: SignoffRequestSpec[];
	published: string[][];
	resolved: UnitRef[];
	state: { holder: string | null; me: string; failApplyOn: string | undefined; codeReview: CodeReviewRecord | undefined; stages: TeamPolicy['signoffStages'] };
	deps: SignoffDeps;
}

function submit(heads: Record<string, unknown>, over: Partial<Submit['state']> = {}): Submit {
	const s: Submit = { heads: { ...heads }, applied: [], opened: [], published: [], resolved: [], state: { holder: 'alice', me: 'alice', failApplyOn: undefined, codeReview: { verdict: 'pass', party: 'daemon' }, stages: ['DEF', 'HLD', 'LLD', 'BUILD'], ...over }, deps: {} };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: s.state.me }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: s.state.holder }),
		openSignoffRequest: (spec: SignoffRequestSpec): PortResult<SignoffRequestRef> => { s.opened.push(spec); return { ok: true, value: { ref: `acme/demo#${40 + s.opened.length}` } }; },
	} as unknown as TrackerPort;
	const service = {
		apply: async (id: string, op: string, _by: unknown, detail: { request?: unknown }) => {
			if (s.state.failApplyOn === id) { s.state.failApplyOn = undefined; throw new Error('injected failure'); }
			s.applied.push({ id, op, request: detail.request });
			const request = detail.request as { entityId: string };
			s.heads[id] = approvedHead({ status: 'in-signoff', signoffs: [{ revision: 1, request: { entityId: request.entityId, type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: 'x' }] });
		},
	} as unknown as LifecycleService;
	s.deps = {
		readPolicy: () => ({ ok: true, value: { ...policy({}), signoffStages: s.state.stages } as TeamPolicy }),
		readHead: (_repo, id) => s.heads[id],
		loadTracker: () => ({ ok: true, value: port }),
		resolveIssue: unit => { s.resolved.push(unit); return unit.unit === 'epic' ? 'acme/demo#1' : 'acme/demo#2'; },
		lifecycleFor: () => service,
		publishBranch: (_repo, paths) => { s.published.push([...paths]); return { ok: true, value: 'feature/signoff' }; },
		readCodeReview: () => s.state.codeReview,
	};
	return s;
}

const reasonOf = (r: PortResult<unknown>): string => { assert.equal(r.ok, false); return r.ok ? '' : r.reason; };

test('openSignoff refuses a missing approval, a missing or author-written review for DEF, HLD and LLD, a stage the policy does not list, and a submitter who is not the holder', async () => {
	// not approved
	let s = submit({ [LLD]: approvedHead({ status: 'draft' }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /not approved.*approve it locally first/);
	// approved at an older revision
	s = submit({ [LLD]: approvedHead({ revision: 3, approvedRevision: 2 }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /approved at revision 2 but is at revision 3/);
	// no review, then a review by the party that wrote it
	s = submit({ [LLD]: approvedHead({ review: 'none' }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /no other-party review/);
	s = submit({ [LLD]: approvedHead({ review: 'controller', authoredBy: 'controller' }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /needs the other party/);
	// DEF and HLD are judged the same way, on the epic unit
	s = submit({ [DEF]: approvedHead({ review: 'none' }), [HLD]: approvedHead() });
	assert.match(reasonOf(await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], s.deps)), /DEF.*no other-party review|no other-party review/);
	// a stage the policy does not list, and an artifact this unit does not hold
	s = submit({ [LLD]: approvedHead() }, { stages: ['DEF', 'HLD'] });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /does not ask for signoff at the LLD/);
	s = submit({ [LLD]: approvedHead(), [HLD]: approvedHead() });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [HLD], s.deps)), /not an artifact this unit holds/);
	// nothing is opened or recorded for any refusal above
	assert.deepEqual([s.opened.length, s.applied.length, s.published.length], [0, 0, 0]);

	// a submitter who is not the holder is refused with the gate's error naming the holder
	s = submit({ [LLD]: approvedHead() }, { holder: 'bob' });
	await assert.rejects(openSignoff('/repo', STORY, [LLD], s.deps), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'held-by-other' && e.outcome.holder === 'bob');
	assert.deepEqual([s.opened.length, s.applied.length], [0, 0]);
	// the holder is compared without regard to case
	s = submit({ [LLD]: approvedHead() }, { holder: 'Alice', me: 'alice' });
	assert.equal((await openSignoff('/repo', STORY, [LLD], s.deps)).ok, true);
});

test('openSignoff refuses an unassigned unit saying it must be claimed first', async () => {
	const s = submit({ [LLD]: approvedHead() }, { holder: null });
	await assert.rejects(openSignoff('/repo', STORY, [LLD], s.deps), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'refused' && /claim it before submitting/.test(e.outcome.reason));
	assert.deepEqual([s.opened.length, s.applied.length, s.published.length], [0, 0, 0]);
	// and a unit with no issue at all
	const none = submit({ [LLD]: approvedHead() });
	await assert.rejects(openSignoff('/repo', STORY, [LLD], { ...none.deps, resolveIssue: () => null }), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'no-issue');
});

test('openSignoff for BUILD checks the Story\'s code-review record (missing, written by the author, or blocking is refused; pass or warn by the other party is accepted) and never the lifecycle review', async () => {
	// a BUILD head carries no lifecycle review
	const build = approvedHead({ review: 'none', authoredBy: 'controller' });
	const cases: Array<[CodeReviewRecord | undefined, RegExp | null]> = [
		[undefined, /has no code review/],
		[{ verdict: 'block', party: 'daemon' }, /code review of .* is blocking/],
		[{ verdict: 'pass', party: 'controller' }, /was run by the controller, who wrote the code/],
		[{ verdict: 'pass', party: 'daemon' }, null],
		[{ verdict: 'warn', party: 'daemon' }, null],
	];
	for (const [codeReview, expected] of cases) {
		const s = submit({ [BUILD]: build }, { codeReview });
		const r = await openSignoff('/repo', STORY, [BUILD], s.deps);
		if (expected === null) assert.equal(r.ok, true, JSON.stringify(codeReview));
		else assert.match(reasonOf(r), expected);
	}
	// an unknown party never refuses by itself
	const unknown = submit({ [BUILD]: approvedHead({ review: 'none', authoredBy: 'unknown' }) }, { codeReview: { verdict: 'pass', party: 'controller' } });
	assert.equal((await openSignoff('/repo', STORY, [BUILD], unknown.deps)).ok, true);
});

test('openSignoff for BUILD reads the holder of the Story\'s issue and links the request from it even when claimUnits puts BUILD on task units, and settleSignoff for a story unit selects LLD and BUILD while an epic unit selects DEF and HLD', async () => {
	const s = submit({ [BUILD]: approvedHead({ review: 'none' }) });
	const r = await openSignoff('/repo', STORY, [BUILD], s.deps);
	assert.equal(r.ok, true);
	assert.deepEqual(s.resolved, [STORY], 'the issue read is the Story\'s, whatever claimUnits says about tasks');
	assert.equal(s.opened[0]?.issue, 'acme/demo#2', 'the request is linked from the Story issue');
	assert.deepEqual(s.opened[0]?.unit, STORY);
	assert.deepEqual(s.opened[0]?.artifacts, [{ artifactId: BUILD, revision: 1, path: `.insrc/artifacts/${BUILD}.json` }]);
	assert.equal(s.opened[0]?.branch, 'feature/signoff');

	// the stages a unit holds, which settle reads
	assert.deepEqual(stagesOfUnit(STORY), ['LLD', 'BUILD']);
	assert.deepEqual(stagesOfUnit(EPIC_UNIT), ['DEF', 'HLD']);
	assert.deepEqual(stagesOfUnit({ unit: 'task', repoPath: '/repo', epicHash: EPIC, storyId: 's1', taskId: 't1' }), []);
});

test('openSignoff opens one request, records open-signoff on every artifact with the Reference { entityId: ref, type: signoff-request, relation: tracked-by }, and finds the open request on a repeat after a partial recording', async () => {
	const s = submit({ [DEF]: approvedHead(), [HLD]: approvedHead() });
	const r = await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], s.deps);
	assert.deepEqual(r, { ok: true, value: { ref: 'acme/demo#41' } });
	assert.equal(s.opened.length, 1, 'one request for both artifacts');
	assert.equal(s.opened[0]?.issue, 'acme/demo#1');
	assert.deepEqual(s.published, [[`/repo/.insrc/artifacts/${DEF}.json`, `/repo/.insrc/artifacts/${HLD}.json`]]);
	assert.deepEqual(s.applied.map(a => [a.id, a.op]), [[DEF, 'open-signoff'], [HLD, 'open-signoff']]);
	for (const a of s.applied) assert.deepEqual(a.request, { entityId: 'acme/demo#41', type: 'signoff-request', relation: 'tracked-by' });

	// a failure part-way: the second artifact cannot be recorded, the request stays open on the first
	const partial = submit({ [DEF]: approvedHead(), [HLD]: approvedHead() }, { failApplyOn: HLD });
	const failed = await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], partial.deps);
	assert.match(reasonOf(failed), /could not be recorded in signoff.*acme\/demo#41 is open, submit again/);
	assert.equal(partial.opened.length, 1);
	assert.deepEqual(partial.applied.map(a => a.id), [DEF]);

	// the repeat finds the request on the recorded artifact, opens nothing and records only the rest with the same Reference
	const again = await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], partial.deps);
	assert.deepEqual(again, { ok: true, value: { ref: 'acme/demo#41' } });
	assert.equal(partial.opened.length, 1, 'no second request is opened');
	assert.equal(partial.published.length, 1, 'and nothing is published again');
	assert.deepEqual(partial.applied.map(a => a.id), [DEF, HLD]);
	assert.deepEqual(partial.applied[1]?.request, { entityId: 'acme/demo#41', type: 'signoff-request', relation: 'tracked-by' });

	// a third call with everything recorded is a no-op
	const done = await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], partial.deps);
	assert.deepEqual(done, { ok: true, value: { ref: 'acme/demo#41' } });
	assert.equal(partial.applied.length, 2);

	// artifacts in two different open requests are refused
	const split = submit({ [DEF]: approvedHead({ status: 'in-signoff', signoffs: [{ revision: 1, request: { entityId: 'r#1', type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: 'x' }] }), [HLD]: approvedHead({ status: 'in-signoff', signoffs: [{ revision: 1, request: { entityId: 'r#2', type: 'signoff-request', relation: 'tracked-by' }, state: 'open', actors: [], at: 'x' }] }) });
	assert.match(reasonOf(await openSignoff('/repo', EPIC_UNIT, [DEF, HLD], split.deps)), /different open requests/);
});

// --- settleSignoff -------------------------------------------------------------------------------------------------------------

interface Settle {
	heads: Record<string, unknown>;
	applied: Array<{ id: string; op: string }>;
	released: Array<string | null>;
	completed: string[];
	reads: string[];
	loads: number;
	deps: SignoffDeps;
	fail: { on: string | undefined; state: 'open' | 'changes-requested' | 'completed'; read: boolean; load: boolean };
}

const inSignoff = (ref: string, type = 'signoff-request'): unknown => approvedHead({ status: 'in-signoff', signoffs: [{ revision: 1, request: { entityId: ref, type, relation: 'tracked-by' }, state: 'open', actors: [], at: 'x' }] });

function settleWorld(heads: Record<string, unknown>, over: Partial<Settle['fail']> = {}, stages: TeamPolicy['signoffStages'] = ['DEF', 'HLD', 'LLD', 'BUILD']): Settle {
	const s: Settle = { heads: { ...heads }, applied: [], released: [], completed: [], reads: [], loads: 0, deps: {}, fail: { on: undefined, state: 'completed', read: false, load: false, ...over } };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readSignoffState: (r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => {
			s.reads.push(r.ref);
			return s.fail.read ? { ok: false, kind: 'unreachable', reason: 'offline' } : { ok: true, value: s.fail.state };
		},
		setAssignee: (_issue: string, who: string | null): PortResult<void> => { s.released.push(who); return { ok: true, value: undefined }; },
	} as unknown as TrackerPort;
	const service = {
		apply: async (id: string, op: string) => {
			if (s.fail.on === id) throw new Error('injected failure');
			s.applied.push({ id, op });
			s.heads[id] = approvedHead({ status: op === 'signed-off' ? 'signed-off' : 'changes-requested' });
		},
		completeIfRolledUp: async (id: string) => { s.completed.push(id); return { completed: [] }; },
	} as unknown as LifecycleService;
	s.deps = {
		readPolicy: () => ({ ok: true, value: { ...policy({}), signoffStages: stages } as TeamPolicy }),
		readHead: (_repo, id) => s.heads[id],
		loadTracker: () => { s.loads += 1; return s.fail.load ? { ok: false, kind: 'missing-tool', reason: 'no gh' } : { ok: true, value: port }; },
		resolveIssue: unit => (unit.unit === 'epic' ? 'acme/demo#1' : 'acme/demo#2'),
		lifecycleFor: () => service,
	};
	return s;
}

test('settleSignoff records signed-off on all artifacts of a completed request, clears the assignee of the unit issue, records signoff-changes on changes-requested, leaves the rest on a part-way failure, skips a Signoff whose Reference is not a signoff-request, and is idempotent across two clones', async () => {
	// a completed request covering two artifacts: both are signed off together, the claim is cleared, the completion is run
	let s = settleWorld({ [DEF]: inSignoff('acme/demo#9'), [HLD]: inSignoff('acme/demo#9') });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual(s.applied, [{ id: DEF, op: 'signed-off' }, { id: HLD, op: 'signed-off' }]);
	assert.deepEqual(s.reads, ['acme/demo#9'], 'the request is read once, not once per artifact');
	assert.deepEqual(s.released, [null], 'the unit issue is released');
	assert.deepEqual(s.completed, [`EPIC-${EPIC}`], 'the completion the hold deferred is run');

	// a second clone settling the same request finds nothing waiting: nothing is read or recorded
	const loadsBefore = s.loads;
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.equal(s.applied.length, 2);
	assert.equal(s.loads, loadsBefore, 'no tracker is loaded when nothing waits');
	assert.deepEqual(s.released, [null]);

	// changes requested: signoff-changes on every artifact of the request, no release
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9'), [HLD]: inSignoff('acme/demo#9') }, { state: 'changes-requested' });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual(s.applied, [{ id: DEF, op: 'signoff-changes' }, { id: HLD, op: 'signoff-changes' }]);
	assert.deepEqual(s.released, []);

	// still open: nothing is recorded
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9') }, { state: 'open' });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual([s.applied.length, s.released.length], [0, 0]);

	// a part-way failure: the first artifact is recorded, the rest is left, nothing is released or completed
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9'), [HLD]: inSignoff('acme/demo#9') }, { on: HLD });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual(s.applied, [{ id: DEF, op: 'signed-off' }]);
	assert.deepEqual([s.released.length, s.completed.length], [0, 0]);
	// the next settle records the rest, then releases and completes
	s.fail.on = undefined;
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual(s.applied.map(a => a.id), [DEF, HLD]);
	assert.deepEqual(s.released, [null]);
	assert.deepEqual(s.completed, [`EPIC-${EPIC}`]);

	// a Signoff whose Reference is not a signoff-request is skipped: no tracker read for it
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9', 'something-else') });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual([s.reads.length, s.applied.length], [0, 0]);

	// the tracker cannot be loaded or read: nothing is recorded and nothing throws
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9') }, { load: true });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.equal(s.applied.length, 0);
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9') }, { read: true });
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual([s.applied.length, s.released.length], [0, 0]);

	// a stage the policy does not list is not read, and outside team mode nothing happens at all
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9') }, {}, ['LLD']);
	await settleSignoff('/repo', EPIC_UNIT, s.deps);
	assert.deepEqual([s.loads, s.applied.length], [0, 0]);
	s = settleWorld({ [DEF]: inSignoff('acme/demo#9') });
	await settleSignoff('/repo', EPIC_UNIT, { ...s.deps, readPolicy: () => ({ ok: true, value: 'none' }) });
	assert.deepEqual([s.loads, s.applied.length, s.completed.length], [0, 0, 0]);

	// a story unit settles the LLD and the BUILD and releases the Story's issue
	s = settleWorld({ [LLD]: inSignoff('acme/demo#7'), [BUILD]: inSignoff('acme/demo#7') });
	await settleSignoff('/repo', STORY, s.deps);
	assert.deepEqual(s.applied.map(a => a.id), [LLD, BUILD]);
	assert.deepEqual(s.completed, [`STORY-${EPIC}-s1`]);
});
