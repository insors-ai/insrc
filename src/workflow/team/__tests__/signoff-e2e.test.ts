/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Signoff end to end (Story s7): the real team gate with the registered hook, the real lifecycle over a store-backed repository and
 * an in-memory tracker. Claim, submit, refusal while the request is open, settlement at the next-stage attempt, the claim released,
 * the deferred completion run by team.settle for a BUILD, and an unlisted stage left alone.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-e2e.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync as mkdtempRaw, rmSync as rmRaw } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The approval path reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { History } from '../../artifact-core/history.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { approveWorkflowTarget } from '../../gates.js';
import { artifactJsonPath } from '../../storage.js';
import { _setGateDepsForTests, claim, registerCompletionHook, teamGate, TeamGateRefusedError } from '../gate.js';
import { _setSignoffDepsForTests, openSignoff, registerSignoffHook, settleForAttempt } from '../signoff.js';
import type { TeamPolicy } from '../types.js';
import type { PortResult, SignoffRequestRef, SignoffRequestSpec, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { H, alice, bob, clock, kit } from '../../artifact-core/__tests__/store-kit.js';
import { EPIC, RECORDS, STORY, T1, T2, seedEpic } from '../../artifact-core/__tests__/lifecycle-kit.js';
import { handoffRpcHandlers } from '../../../daemon/steps/workflow-step/handoff-rpc.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const EPIC_ISSUE = 'acme/demo#1';
const STORY_ISSUE = 'acme/demo#2';
const DEF = `DEF-${H}`;
const HLD = `HLD-${H}`;
const LLD = `LLD-${H}-s1`;
const BUILD = `BUILD-${H}-s1`;
const CR = `CR-${H}-s1`;

const policy = (signoffStages: TeamPolicy['signoffStages']): TeamPolicy => ({
	teamMode: true, signoffStages, claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

/** An in-memory tracker: assignees per issue, a pull request per request and the state the test sets. */
function tracker(): { port: TrackerPort; assignees: Record<string, string[]>; state: { value: 'open' | 'changes-requested' | 'completed' }; opened: SignoffRequestSpec[] } {
	const assignees: Record<string, string[]> = { [EPIC_ISSUE]: [], [STORY_ISSUE]: [] };
	const state = { value: 'open' as 'open' | 'changes-requested' | 'completed' };
	const opened: SignoffRequestSpec[] = [];
	const port = {
		kind: 'github', capabilities: new Set(['claim', 'signoff-request']),
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (issue: string): PortResult<string | null> => ({ ok: true, value: assignees[issue]?.[0] ?? null }),
		addAssignee: (issue: string, who: string): PortResult<string[]> => { (assignees[issue] ??= []).push(who); return { ok: true, value: [...(assignees[issue] ?? [])] }; },
		setAssignee: (issue: string, who: string | null): PortResult<void> => { assignees[issue] = who === null ? [] : [who]; return { ok: true, value: undefined }; },
		openSignoffRequest: (spec: SignoffRequestSpec): PortResult<SignoffRequestRef> => { opened.push(spec); return { ok: true, value: { ref: `acme/demo#${40 + opened.length}` } }; },
		readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: state.value }),
	} as unknown as TrackerPort;
	return { port, assignees, state, opened };
}

/** The gate, the signoff module and the lifecycle wired to one tracker, one policy and one store. */
function wire(k: ReturnType<typeof kit>, t: ReturnType<typeof tracker>, signoffStages: TeamPolicy['signoffStages'], svc: LifecycleService): void {
	const readPolicy = () => ({ ok: true as const, value: policy(signoffStages) });
	const resolveIssue = (unit: UnitRef) => (unit.unit === 'epic' ? EPIC_ISSUE : STORY_ISSUE);
	_setGateDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: t.port }), resolveIssue, now: () => '2026-10-22T00:00:00.000Z' });
	_setSignoffDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: t.port }), resolveIssue, lifecycleFor: () => svc, publishBranch: () => ({ ok: true, value: 'feature/signoff' }) });
	registerSignoffHook();
}

function serviceFor(k: ReturnType<typeof kit>): LifecycleService {
	return new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce: false, history: new History(k.sidecar) }), now: clock() });
}

/** Review by the daemon, then approve: what a submission requires of each artifact. */
async function approveReviewed(svc: LifecycleService, id: string): Promise<void> {
	await svc.apply(id, 'review', bob, { review: { reviewer: bob, party: 'daemon', verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } });
	await svc.apply(id, 'approve', bob);
}

const statusOf = async (k: ReturnType<typeof kit>, id: string): Promise<string> => (await k.store.read(id)).lifecycle.status;
const EPIC_UNIT = (k: ReturnType<typeof kit>): UnitRef => ({ unit: 'epic', repoPath: k.repo, epicHash: H });
const STORY_UNIT = (k: ReturnType<typeof kit>): UnitRef => ({ unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' });

test('claim, submit, refused next stage while open, completion settled at the next-stage attempt, all artifacts signed off together, claim released, deferred Story completion run by team.settle for a BUILD, and an unlisted stage unaffected', async () => {
	const k = kit();
	try {
		await seedEpic(k);
		const svc = serviceFor(k);
		const t = tracker();
		wire(k, t, ['DEF', 'HLD', 'LLD', 'BUILD'], svc);

		// --- the Epic: DEF and HLD are claimed, submitted as one request, and the next stage waits for it ---
		await approveReviewed(svc, DEF);
		await approveReviewed(svc, HLD);
		assert.equal((await claim(k.repo, EPIC_UNIT(k))).kind, 'allowed');
		assert.deepEqual(t.assignees[EPIC_ISSUE], ['alice']);

		const opened = await openSignoff(k.repo, EPIC_UNIT(k), [DEF, HLD]);
		assert.deepEqual(opened, { ok: true, value: { ref: 'acme/demo#41' } });
		assert.equal(t.opened.length, 1, 'one request covers both artifacts');
		assert.equal(await statusOf(k, DEF), 'in-signoff');
		assert.equal(await statusOf(k, HLD), 'in-signoff');

		// the next stage (design.story) is refused by the entry and by the gate, saying it awaits signoff and linking the request
		await assert.rejects(settleForAttempt(k.repo, STORY_UNIT(k), 'author', 'design.story'), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'awaiting-signoff' && e.outcome.request.ref === 'acme/demo#41');
		assert.deepEqual(await teamGate(k.repo, STORY_UNIT(k), 'author', 'design.story'), { kind: 'awaiting-signoff', request: { ref: 'acme/demo#41' } });
		assert.equal(await statusOf(k, DEF), 'in-signoff', 'nothing is recorded while the request is open');

		// the tracker reports it completed: starting the next stage records both artifacts together, releases the claim and proceeds
		t.state.value = 'completed';
		await settleForAttempt(k.repo, STORY_UNIT(k), 'author', 'design.story');
		assert.equal(await statusOf(k, DEF), 'signed-off');
		assert.equal(await statusOf(k, HLD), 'signed-off');
		for (const id of [DEF, HLD]) {
			const log = (await k.store.readWithHistory(id)).changeLog;
			assert.equal(log.filter(e => e.operation === 'signed-off').length, 1, `${id} is signed off once, with its request`);
		}
		assert.deepEqual(t.assignees[EPIC_ISSUE], [], 'the claim on the Epic is released');
		assert.deepEqual(await teamGate(k.repo, STORY_UNIT(k), 'author', 'design.story'), { kind: 'allowed', implicitClaim: true });

		// --- the Story: its LLD is submitted, plan waits for it, and an unlisted stage is not held ---
		await approveReviewed(svc, LLD);
		t.state.value = 'open';
		assert.equal((await claim(k.repo, STORY_UNIT(k))).kind, 'allowed');
		const lldRequest = await openSignoff(k.repo, STORY_UNIT(k), [LLD]);
		assert.deepEqual(lldRequest, { ok: true, value: { ref: 'acme/demo#42' } });
		await assert.rejects(settleForAttempt(k.repo, STORY_UNIT(k), 'author', 'plan'), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'awaiting-signoff');
		t.state.value = 'completed';
		await settleForAttempt(k.repo, STORY_UNIT(k), 'author', 'plan');
		assert.equal(await statusOf(k, LLD), 'signed-off');
		assert.deepEqual(t.assignees[STORY_ISSUE], [], 'the Story claim is released too');

		// --- an unlisted stage: with only BUILD listed, an approved and never-submitted LLD does not hold the next stage ---
		wire(k, t, ['BUILD'], svc);
		await settleForAttempt(k.repo, STORY_UNIT(k), 'author', 'plan');
		assert.equal((await teamGate(k.repo, STORY_UNIT(k), 'author', 'plan')).kind, 'allowed');
	} finally { k.done(); }

	// --- a BUILD: held at approval, submitted, and the Story completes when team.settle reads the completed request ---
	const k2 = kit();
	try {
		await seedEpic(k2);
		await k2.store.write({ ...(await k2.store.read(BUILD)), payload: { body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] }, citations: [] } }, alice);
		await k2.store.write({ ...(await k2.store.read(CR)), payload: { body: { verdict: 'block', counts: { high: 1, med: 0, low: 0 } }, citations: [] } }, alice);
		for (const task of [T1, T2]) await new History(k2.sidecar).appendLog(task, { id: `round-${task}`, actor: bob, timestamp: '2026-10-21T12:00:00.000Z', operation: 'update', outcome: { result: 'pass', summary: 'ok', data: { kind: 'build-round' } } });
		const svc = serviceFor(k2);
		await svc.completeIfRolledUp(T1, bob);
		await svc.completeIfRolledUp(T2, bob);
		const t = tracker();
		wire(k2, t, ['BUILD'], svc);
		_setGateDepsForTests();   // the BUILD approval is not under claim here: only the signoff hold is under test

		await approveWorkflowTarget({ repoPath: k2.repo, artifactPath: artifactJsonPath(k2.repo, BUILD), overrideReview: 'known gap', lifecycle: svc, actor: bob }, { enforce: false });
		assert.notEqual(await statusOf(k2, STORY), 'completed', 'the Story is held while its listed BUILD awaits signoff');
		// the CR record carries a daemon review so the BUILD can be submitted (its review is the code-review record)
		await k2.store.write({ ...(await k2.store.read(CR)), payload: { body: { verdict: 'warn', counts: { high: 0, med: 1, low: 0 } }, citations: [] } }, alice);
		t.assignees[STORY_ISSUE] = ['alice'];
		const submitted = await openSignoff(k2.repo, STORY_UNIT(k2), [BUILD], { readCodeReview: () => ({ verdict: 'warn', party: 'daemon' }) });
		assert.equal(submitted.ok, true, JSON.stringify(submitted));

		t.state.value = 'completed';
		const reply = await handoffRpcHandlers()['team.settle']!({ repo: k2.repo, epicHash: H, storyId: 's1' }) as { next: string; recorded: Array<{ artifactId: string; to: string }> };
		assert.equal(reply.next, 'settled');
		assert.ok(reply.recorded.some(r => r.artifactId === BUILD), 'the BUILD is recorded');
		assert.equal(await statusOf(k2, STORY), 'completed');
		assert.equal(await statusOf(k2, EPIC), 'completed');
		for (const record of RECORDS) assert.equal(await statusOf(k2, record), 'completed', record);
	} finally { k2.done(); }
});
