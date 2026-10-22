/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s7: a Story whose BUILD the policy lists for signoff is held when its BUILD is approved, and completes once its
 * signoff is recorded. Real approval path over a store-backed repo; the policy is injected.
 *
 * Run: npx tsx --test src/workflow/__tests__/signoff-hold.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync as mkdtempRaw, rmSync as rmRaw } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';

// The approval path reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { History } from '../artifact-core/history.js';
import { LifecycleService } from '../artifact-core/lifecycle-service.js';
import { approveWorkflowTarget } from '../gates.js';
import { artifactJsonPath } from '../storage.js';
import { _setSignoffDepsForTests, settleSignoff, signoffHoldsCompletion, signoffReferenceOf } from '../team/signoff.js';
import type { PortResult, SignoffRequestRef, TrackerPort } from '../tracker/port.js';
import type { TeamPolicy } from '../team/types.js';
import { H, alice, bob, clock, kit } from '../artifact-core/__tests__/store-kit.js';
import { EPIC, RECORDS, STORY, T1, T2, seedEpic } from '../artifact-core/__tests__/lifecycle-kit.js';

afterEach(() => { _setSignoffDepsForTests(); });

const BUILD = `BUILD-${H}-s1`;
const CR = `CR-${H}-s1`;

const policy = (signoffStages: TeamPolicy['signoffStages']): TeamPolicy => ({
	teamMode: true, signoffStages, claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

function serviceFor(k: ReturnType<typeof kit>, enforce = false): LifecycleService {
	return new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce, history: new History(k.sidecar) }), now: clock() });
}

/** A Story whose Tasks passed their builds; its code review blocks (advisory), so the Story waits for the BUILD approval with an override. */
async function readyStory(k: ReturnType<typeof kit>, enforce = false): Promise<LifecycleService> {
	await seedEpic(k);
	await k.store.write({ ...(await k.store.read(BUILD)), payload: { body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] }, citations: [] } }, alice);
	await k.store.write({ ...(await k.store.read(CR)), payload: { body: { verdict: 'block', counts: { high: 1, med: 0, low: 0 } }, citations: [] } }, alice);
	for (const t of [T1, T2]) {
		await new History(k.sidecar).appendLog(t, { id: `round-${t}`, actor: bob, timestamp: '2026-10-21T12:00:00.000Z', operation: 'update', outcome: { result: 'pass', summary: 'ok', data: { kind: 'build-round' } } });
	}
	const svc = serviceFor(k, enforce);
	await svc.completeIfRolledUp(T1, bob);
	await svc.completeIfRolledUp(T2, bob);
	assert.equal((await k.store.read(STORY)).lifecycle.status, 'draft', 'the blocked review holds the Story until the approval');
	return svc;
}

const approveBuild = (k: ReturnType<typeof kit>, svc: LifecycleService) =>
	approveWorkflowTarget({ repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), overrideReview: 'known gap, tracked elsewhere', lifecycle: svc, actor: bob }, { enforce: false });

test('completeThroughService leaves a Story approved-not-completed while its listed BUILD awaits signoff', async () => {
	// control: with no policy a BUILD approval completes the Story and then the Epic
	const control = kit();
	try {
		const svc = await readyStory(control);
		_setSignoffDepsForTests({ readPolicy: () => ({ ok: true, value: 'none' }) });
		const result = await approveBuild(control, svc);
		assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
		assert.equal((await control.store.read(STORY)).lifecycle.status, 'completed');
		assert.equal((await control.store.read(EPIC)).lifecycle.status, 'completed');
	} finally { control.done(); }

	// the policy lists BUILD: the approval stands, the Story and the Epic above it are not completed
	const k = kit();
	try {
		const svc = await readyStory(k);
		_setSignoffDepsForTests({ readPolicy: () => ({ ok: true, value: policy(['BUILD']) }) });
		const result = await approveBuild(k, svc);
		assert.equal(result.skipped.length, 0, JSON.stringify(result.skipped));
		assert.equal(result.approved.length, 1);
		assert.equal((await k.store.read(BUILD)).lifecycle.status, 'approved', 'the approval stands and the BUILD stays open to signoff');
		assert.notEqual((await k.store.read(STORY)).lifecycle.status, 'completed', 'the Story is held');
		assert.notEqual((await k.store.read(EPIC)).lifecycle.status, 'completed', 'and so is the Epic above it');
	} finally { k.done(); }
});

test('settleSignoff completes the Story and its Epic once signed-off is recorded, with the members cascaded', async () => {
	const k = kit();
	try {
		const svc = await readyStory(k);
		const released: Array<string | null> = [];
		const port = {
			whoAmI: (): PortResult<string> => ({ ok: true, value: 'bob' }),
			readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: 'completed' }),
			setAssignee: (_issue: string, who: string | null): PortResult<void> => { released.push(who); return { ok: true, value: undefined }; },
		} as unknown as TrackerPort;
		const deps = {
			readPolicy: () => ({ ok: true as const, value: policy(['BUILD']) }),
			loadTracker: () => ({ ok: true as const, value: port }),
			resolveIssue: () => 'acme/demo#2',
			lifecycleFor: () => svc,
		};
		_setSignoffDepsForTests(deps);

		// the BUILD is approved and held; it is submitted for signoff, which keeps the Story open
		await approveBuild(k, svc);
		assert.equal(signoffHoldsCompletion(k.repo, STORY), true);
		await svc.apply(BUILD, 'open-signoff', bob, { request: signoffReferenceOf({ ref: 'acme/demo#9' }) });
		assert.equal((await k.store.read(BUILD)).lifecycle.status, 'in-signoff');
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'draft');

		// the tracker says completed: the BUILD is signed off, the claim released, then the Story and the Epic complete with their members
		await settleSignoff(k.repo, { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' });
		assert.deepEqual(released, [null]);
		const build = await k.store.readWithHistory(BUILD);
		assert.deepEqual(build.changeLog.map(e => e.operation).filter(op => op === 'signed-off' || op === 'complete'), ['signed-off', 'complete'], 'signed off first, then completed with its Story');
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'completed');
		assert.equal((await k.store.read(EPIC)).lifecycle.status, 'completed');
		for (const record of RECORDS) assert.equal((await k.store.read(record)).lifecycle.status, 'completed', record);
	} finally { k.done(); }
});

test('settleSignoff completes a Story whose BUILD was approved over a blocking code review under enforcement: the override the approval stored is read back', async () => {
	const k = kit();
	try {
		const svc = await readyStory(k, true);
		const port = {
			whoAmI: (): PortResult<string> => ({ ok: true, value: 'bob' }),
			readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: 'completed' }),
			setAssignee: (): PortResult<void> => ({ ok: true, value: undefined }),
		} as unknown as TrackerPort;
		_setSignoffDepsForTests({ readPolicy: () => ({ ok: true, value: policy(['BUILD']) }), loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#2', lifecycleFor: () => svc });

		await approveBuild(k, svc);
		await svc.apply(BUILD, 'open-signoff', bob, { request: signoffReferenceOf({ ref: 'acme/demo#9' }) });
		assert.deepEqual(await settleSignoff(k.repo, { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' }), [], 'nothing went wrong');
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'completed');
		assert.equal((await k.store.read(EPIC)).lifecycle.status, 'completed');
	} finally { k.done(); }
});
