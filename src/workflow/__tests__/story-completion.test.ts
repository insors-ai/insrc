/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A BUILD approval completes its Story, Tasks and Epic when the rule holds or says why not, and a later override stays on the
 * approval. The real approval path over store-backed records: task-based code reviews, Task rounds on the log, an injected policy.
 *
 * Run: npx tsx --test src/workflow/__tests__/story-completion.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync as mkdtempRaw, readFileSync, rmSync as rmRaw } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, afterEach, beforeEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// The approval path reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import { approveOutcomeOf } from '../../cli/services/workflow.js';
import { handleApprovePipeline, handleWorkflowApprove } from '../../daemon/workflow-approve.js';
import { reviewedBuildFingerprint } from '../code-review/build-freshness.js';
import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { History } from '../artifact-core/history.js';
import { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { IllegalTransitionError } from '../artifact-core/types.js';
import { approveWorkflowTarget } from '../gates.js';
import type { FollowOnOutcome, WorkflowApproveResult } from '../gates.js';
import { artifactJsonPath, writeArtifact } from '../storage.js';
import { _setSignoffDepsForTests, settleSignoff, signoffReferenceOf } from '../team/signoff.js';
import type { TeamPolicy } from '../team/types.js';
import type { PortResult, SignoffRequestRef, TrackerPort } from '../tracker/port.js';
import { H, alice, artifact, bob, clock, kit } from '../artifact-core/__tests__/store-kit.js';
import type { Kit } from '../artifact-core/__tests__/store-kit.js';
import { EPIC, STORY, T1, T2, TASKS, seedEpic } from '../artifact-core/__tests__/lifecycle-kit.js';

const BUILD = `BUILD-${H}-s1`;
const CR = `CR-${H}-s1`;
const PLAN = `PLAN-${H}-s1`;
const T3 = `TASK-${H}-s1-t3`;
const stubCleanup = async () => ({ deleted: [], retained: [], errors: [] });

const policy = (signoffStages: TeamPolicy['signoffStages']): TeamPolicy => ({
	teamMode: true, signoffStages, claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

beforeEach(() => { _setSignoffDepsForTests({ readPolicy: async () => ({ ok: true, value: 'none' }) }); });
afterEach(() => { _setSignoffDepsForTests(); });

const headOf = (k: Kit, id: string) => JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')) as { meta: Record<string, unknown>; body: unknown };
const statusOf = async (k: Kit, id: string): Promise<string> => (await k.store.read(id)).lifecycle.status;

interface Faulty { fail: boolean }

/** A service over the repository's records; while `fault.fail` holds, the Story walk throws where it reads the Task set. */
function serviceFor(k: Kit, fault: Faulty = { fail: false }): LifecycleService {
	return new LifecycleService({
		store: k.store, now: clock(),
		evidence: ctx => {
			const real = createCompletionEvidence(k.repo, { ...ctx, history: new History(k.sidecar) });
			return { ...real, storyTasks: async (e, s) => { if (fault.fail) throw new Error('injected walk failure'); return real.storyTasks(e, s); } };
		},
	});
}

const round = (k: Kit, id: string, result: 'pass' | 'fail', n = 1): Promise<unknown> => new History(k.sidecar).appendLog(id, {
	id: `round-${id}-${n}`, actor: bob, timestamp: `2026-10-21T12:00:0${n}.000Z`, operation: 'update', outcome: { result, summary: 'round', data: { kind: 'build-round' } },
});

/** Give the BUILD its record and the CR a task-based review of it; `blocking` binds the review to another BUILD, which blocks. */
async function writeBuildAndReview(k: Kit, blocking: boolean): Promise<void> {
	const buildBody = { commit: 'abc1234', focus: 'Change it', summary: 'Changed', tasks: [{ id: 's1', passed: true }], changeLog: [{ target: { file: 'src/a.ts' } }] };
	await k.store.write({ ...(await k.store.read(BUILD)), payload: { body: buildBody, citations: [] } }, alice);
	const path = artifactJsonPath(k.repo, BUILD);
	const stored = headOf(k, BUILD);
	writeArtifact(path, { ...stored, meta: { ...stored.meta, workflow: 'build', epicHash: H, storyId: 's1', authoredBy: 'controller', createdAt: '2026-11-03T00:00:00.000Z' } } as never, 'meta-only');

	const commit = 'a'.repeat(40);
	const scope = { storyId: 's1', documents: {}, reviewSet: [{ commit, parent: 'b'.repeat(40), files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }] };
	const task = { taskId: 's1', status: 'passed', summary: 'Correct', findings: [], testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] }, limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [] };
	const fingerprint = blocking ? 'f'.repeat(64) : reviewedBuildFingerprint(headOf(k, BUILD));
	const summary = { reviewId: 'review-1', attempt: 1, storyId: 's1', reviewer: 'daemon', status: 'passed', scope, tasks: [task], summary: 'Reviewed', completedAt: '2026-11-03T01:00:00.000Z', buildFingerprint: fingerprint };
	await k.store.write({ ...(await k.store.read(CR)), payload: { body: { kind: 'code-review', format: 'task-based', storyId: 's1', status: 'passed', reviews: [summary] }, citations: [] } }, alice);
	const cr = headOf(k, CR);
	writeArtifact(artifactJsonPath(k.repo, CR), { ...cr, meta: { ...cr.meta, workflow: 'code-review', schemaVersion: 2, epicHash: H, storyId: 's1', reviewedBy: 'daemon' } } as never, 'meta-only');
}

/** An Epic with one Story and two Tasks whose builds passed, a BUILD record and its code review. */
async function ready(k: Kit, opts: { blocking?: boolean; failed?: string[] } = {}): Promise<void> {
	await seedEpic(k);
	await writeBuildAndReview(k, opts.blocking === true);
	for (const t of [T1, T2]) await round(k, t, opts.failed?.includes(t) === true ? 'fail' : 'pass');
}

const approve = (k: Kit, svc: LifecycleService, overrideReview?: string): Promise<WorkflowApproveResult> => approveWorkflowTarget({
	repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), lifecycle: svc, actor: bob, afterBuildApproval: stubCleanup,
	...(overrideReview !== undefined ? { overrideReview } : {}),
});
const completion = (r: WorkflowApproveResult): FollowOnOutcome => {
	const entry = r.followOn?.find(e => e.kind === 'story-completion');
	assert.ok(entry !== undefined, `a story-completion outcome: ${JSON.stringify(r)}`);
	return entry;
};
/** The PLAN approved, so the Task set is judged against its revision; `tasks` is what the TASKS head then records. */
async function approvedPlanWith(k: Kit, svc: LifecycleService, tasks: { planRevision: number; taskIds: string[] }): Promise<void> {
	await svc.apply(PLAN, 'approve', bob, {}, {});
	await k.store.write({ ...(await k.store.read(TASKS)), payload: { body: { ...tasks, nextNumber: 9 }, citations: [] } }, alice);
}

test('record-override keeps status, revision and approval time, logs the actor and reason, and is refused from a completed BUILD', async () => {
	const k = kit();
	try {
		await ready(k, { failed: [T2] });
		const svc = serviceFor(k);
		await approve(k, svc);
		const before = (await k.store.read(BUILD)).lifecycle;
		assert.equal(before.status, 'approved');

		await svc.apply(BUILD, 'record-override', alice, { override: { reason: 'accepted by the owner' } });
		const after = await k.store.readWithHistory(BUILD);
		assert.equal(after.lifecycle.status, 'approved');
		assert.deepEqual(after.lifecycle.revision, before.revision);
		assert.equal(after.lifecycle.approval?.at, before.approval?.at);
		assert.equal(after.lifecycle.approval?.override?.reason, 'accepted by the owner');
		const entry = after.changeLog.at(-1);
		assert.equal(entry?.operation, 'record-override');
		assert.equal(entry?.actor.id, alice.id);
		assert.equal(entry?.outcome?.result, 'override');
		assert.equal(entry?.outcome?.summary, 'accepted by the owner');

		await assert.rejects(svc.apply(BUILD, 'record-override', alice, { override: { reason: '  ' } }), IllegalTransitionError, 'a blank reason is not an override');
		await assert.rejects(svc.apply(LLD_OF(), 'record-override', alice, { override: { reason: 'r' } }), IllegalTransitionError, 'only a BUILD carries one');

		await svc.apply(BUILD, 'complete', alice, {});
		assert.equal(await statusOf(k, BUILD), 'completed');
		await assert.rejects(svc.apply(BUILD, 'record-override', alice, { override: { reason: 'later' } }), IllegalTransitionError);
	} finally { k.done(); }
});
const LLD_OF = (): string => `LLD-${H}-s1`;

test('handleWorkflowApprove on a BUILD: the outcome merges the approval\'s own followOn with the seam\'s, and the Story, its Tasks and its Epic complete', async () => {
	const k = kit();
	try {
		await ready(k);
		const svc = serviceFor(k);
		const seam: FollowOnOutcome = { kind: 'tasks-sync', artifactPath: 'x', ok: true };
		const r = await handleWorkflowApprove(
			{ repo: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), actor: bob.id },
			{ lifecycleFor: () => svc, approve: req => approveWorkflowTarget({ ...req, afterBuildApproval: stubCleanup }), followOn: async () => [seam] },
		);
		assert.ok(!('error' in r), JSON.stringify(r));
		assert.equal(r.skipped.length, 0, JSON.stringify(r.skipped));
		assert.deepEqual(r.followOn?.map(e => e.kind), ['story-completion', 'tasks-sync']);
		const done = completion(r);
		assert.equal(done.ok, true);
		assert.ok(done.completed?.includes(STORY), JSON.stringify(done));
		assert.ok(done.completed?.includes(EPIC), JSON.stringify(done));
		for (const id of [STORY, T1, T2, EPIC, BUILD]) assert.equal(await statusOf(k, id), 'completed', id);
	} finally { k.done(); }
});

test('a walk failure leaves the approval standing and reports ok false', async () => {
	const k = kit();
	try {
		await ready(k);
		const r = await approve(k, serviceFor(k, { fail: true }));
		assert.equal(r.approved.length, 1, 'the approval stands');
		assert.equal(await statusOf(k, BUILD), 'approved');
		assert.equal(await statusOf(k, STORY), 'draft');
		const done = completion(r);
		assert.equal(done.ok, false);
		assert.match(done.note ?? '', /injected walk failure/);
		assert.deepEqual(done.completed, []);
	} finally { k.done(); }
});

test('a live approval with a listed Task missing its head is held and named in the note', async () => {
	const k = kit();
	try {
		await ready(k);
		const svc = serviceFor(k);
		await approvedPlanWith(k, svc, { planRevision: 1, taskIds: ['t1', 't2', 't3'] });
		const r = await approve(k, svc);
		assert.equal(r.approved.length, 1);
		const done = completion(r);
		assert.equal(done.ok, true);
		assert.ok(done.note?.includes(T3), done.note);
		assert.deepEqual(done.completed, []);
		assert.equal(await statusOf(k, STORY), 'draft');
		assert.equal(await statusOf(k, T1), 'draft', 'nothing was frozen');
	} finally { k.done(); }
});

test('a live approval after a failed reconcile, and after one that stopped part-way with newly created unlisted Tasks, is held and leaves those Tasks unfrozen', async () => {
	// the reconcile failed: the approved PLAN has a TASKS head that lists nothing
	const failed = kit();
	try {
		await ready(failed);
		const svc = serviceFor(failed);
		await approvedPlanWith(failed, svc, { planRevision: 1, taskIds: [] });
		const done = completion(await approve(failed, svc));
		assert.match(done.note ?? '', /Task set is not finished/);
		assert.equal(await statusOf(failed, STORY), 'draft');
		for (const t of [T1, T2]) assert.equal(await statusOf(failed, t), 'draft', t);
	} finally { failed.done(); }

	// it stopped part-way: the plan moved on, a new Task was created and passed, and the TASKS head still names the earlier revision
	const partWay = kit();
	try {
		await ready(partWay);
		const svc = serviceFor(partWay);
		await partWay.store.write({ ...(await partWay.store.read(PLAN)), payload: { body: { text: 'revised' }, citations: [] } }, alice);
		await partWay.store.write(artifact(T3, { parent: { entityId: STORY, type: 'STORY', relation: 'derived-from' } }), alice);
		await round(partWay, T3, 'pass');
		await approvedPlanWith(partWay, svc, { planRevision: 1, taskIds: ['t1', 't2'] });
		const done = completion(await approve(partWay, svc));
		assert.match(done.note ?? '', /Task set is not finished/);
		assert.deepEqual(done.completed, []);
		assert.equal(await statusOf(partWay, STORY), 'draft');
		assert.equal(await statusOf(partWay, T3), 'draft', 'the unlisted Task stays open for the reconcile to finish');
	} finally { partWay.done(); }
});

test('initial approval held, then re-approval with an override records it and completes the Story', async () => {
	const k = kit();
	try {
		await ready(k, { failed: [T2] });
		const svc = serviceFor(k);
		const held = completion(await approve(k, svc));
		assert.equal(held.ok, true);
		assert.ok(held.note?.includes(T2), held.note);
		assert.equal(await statusOf(k, STORY), 'draft');
		const before = (await k.store.read(BUILD)).lifecycle;

		const r = await approve(k, svc, 'failing Task accepted by the owner');
		assert.equal(r.skipped.length, 0, JSON.stringify(r.skipped));
		assert.equal(completion(r).ok, true);
		assert.equal(await statusOf(k, STORY), 'completed');
		assert.equal(await statusOf(k, EPIC), 'completed');

		const build = await k.store.readWithHistory(BUILD);
		assert.equal(build.lifecycle.approval?.override?.reason, 'failing Task accepted by the owner');
		assert.equal(build.lifecycle.approval?.at, before.approval?.at, 'the approval keeps its time');
		assert.deepEqual(build.lifecycle.revision, before.revision, 'and its revision');
		const entries = build.changeLog.filter(e => e.operation === 'record-override');
		assert.equal(entries.length, 1);
		assert.equal(entries[0]?.actor.id, bob.id);
	} finally { k.done(); }
});

test('a BUILD approved over a blocking code review with an override, a failure injected in completion, then re-approval with no override in the request passes the outer gate on the stored override and completes', async () => {
	const k = kit();
	try {
		await ready(k, { blocking: true });
		const fault = { fail: true };
		const svc = serviceFor(k, fault);
		const first = await approve(k, svc, 'known gap');
		assert.equal(first.approved.length, 1, JSON.stringify(first));
		assert.equal(completion(first).ok, false);
		assert.equal(await statusOf(k, STORY), 'draft');

		fault.fail = false;
		const second = await approve(k, svc);
		assert.equal(second.skipped.length, 0, JSON.stringify(second.skipped));
		assert.equal(second.codeReview[0]?.status, 'overridden');
		assert.equal(completion(second).ok, true);
		assert.equal(await statusOf(k, STORY), 'completed');
		assert.equal((await k.store.readWithHistory(BUILD)).changeLog.filter(e => e.operation === 'record-override').length, 0, 'nothing new to record');
	} finally { k.done(); }
});

test('a draft BUILD at a new revision is not passed by an earlier revision\'s override', async () => {
	const open = kit();
	try {
		await ready(open, { blocking: true });
		const fault = { fail: true };
		const svc = serviceFor(open, fault);
		assert.equal((await approve(open, svc, 'known gap')).approved.length, 1);
		assert.equal(await statusOf(open, BUILD), 'approved');
		await svc.updateContent(BUILD, alice, { body: { commit: 'def5678', focus: 'Change it again', summary: 'Changed', tasks: [], changeLog: [] }, citations: [] });
		assert.equal(await statusOf(open, BUILD), 'draft', 'the new revision is a draft');

		fault.fail = false;
		const r = await approve(open, svc);
		assert.equal(r.approved.length, 0, JSON.stringify(r));
		assert.equal(r.skipped.length, 1);
		assert.equal(r.codeReview[0]?.status, 'blocked');
		assert.equal(await statusOf(open, BUILD), 'draft');
	} finally { open.done(); }
});

function signoffPort(): TrackerPort {
	return {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'bob' }),
		readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: 'completed' }),
		setAssignee: (): PortResult<void> => ({ ok: true, value: undefined }),
	} as unknown as TrackerPort;
}

test('a held Story in signoff completes later from the stored override', async () => {
	const k = kit();
	try {
		await ready(k, { blocking: true, failed: [T2] });
		const svc = serviceFor(k);
		_setSignoffDepsForTests({ readPolicy: async () => ({ ok: true, value: policy(['BUILD']) }), loadTracker: () => ({ ok: true, value: signoffPort() }), resolveIssue: () => 'acme/demo#2', lifecycleFor: () => svc });
		const r = await approve(k, svc, 'known gap');
		assert.equal(r.approved.length, 1, JSON.stringify(r));
		const held = completion(r);
		assert.match(held.note ?? '', /signoff/);
		assert.equal(await statusOf(k, STORY), 'draft');

		await svc.apply(BUILD, 'open-signoff', bob, { request: signoffReferenceOf({ ref: 'acme/demo#9' }) });
		assert.deepEqual(await settleSignoff(k.repo, { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' }), [], 'nothing went wrong');
		assert.equal(await statusOf(k, STORY), 'completed', 'no override in this call: the one the approval stored is read back');
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'completed');
	} finally { k.done(); }
});

test('an Epic with a signoff hold stays open after its Story completes', async () => {
	const k = kit();
	try {
		await ready(k);
		const svc = serviceFor(k);
		_setSignoffDepsForTests({ readPolicy: async () => ({ ok: true, value: policy(['DEF']) }) });
		const done = completion(await approve(k, svc));
		assert.equal(await statusOf(k, STORY), 'completed');
		assert.equal(await statusOf(k, EPIC), 'draft', 'the Define it is waiting on is not signed off');
		assert.ok(done.completed?.includes(STORY));
		assert.ok(!done.completed?.includes(EPIC));
		assert.ok(done.note?.includes(EPIC), done.note);
		assert.match(done.note ?? '', /signoff/);
	} finally { k.done(); }
});

test('the CLI adapter exposes the story-completion outcome', async () => {
	const k = kit();
	try {
		await ready(k, { failed: [T1] });
		const svc = serviceFor(k);
		const reply = await handleApprovePipeline(
			{ repo: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), actor: bob.id, withTracker: false },
			() => async () => [],
			{ lifecycleFor: () => svc, approve: req => approveWorkflowTarget({ ...req, afterBuildApproval: stubCleanup }) },
		);
		assert.ok(!('error' in reply), JSON.stringify(reply));
		const outcome = approveOutcomeOf(reply);
		assert.equal(outcome.storyCompletion?.ok, true);
		assert.deepEqual(outcome.storyCompletion?.completed, []);
		assert.ok(outcome.storyCompletion?.note?.includes(T1), outcome.storyCompletion?.note);
	} finally { k.done(); }
});
