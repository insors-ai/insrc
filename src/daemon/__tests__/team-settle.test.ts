/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `team.settle` and the terminal's `team settle` (Story s7): settle a unit's signoff requests on demand, which is how a BUILD's
 * request is read. The daemon operation runs over a store-backed repository with an injected policy and tracker.
 *
 * Run: npx tsx --test src/daemon/__tests__/team-settle.test.ts
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

import { createCompletionEvidence } from '../../workflow/artifact-core/completion-evidence.js';
import { History } from '../../workflow/artifact-core/history.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { approveWorkflowTarget } from '../../workflow/gates.js';
import { artifactJsonPath } from '../../workflow/storage.js';
import { _setSignoffDepsForTests, signoffReferenceOf } from '../../workflow/team/signoff.js';
import type { TeamPolicy } from '../../workflow/team/types.js';
import type { PortResult, SignoffRequestRef, TrackerPort } from '../../workflow/tracker/port.js';
import { H, alice, bob, clock, kit } from '../../workflow/artifact-core/__tests__/store-kit.js';
import { EPIC, RECORDS, STORY, T1, T2, seedEpic } from '../../workflow/artifact-core/__tests__/lifecycle-kit.js';
import { handoffRpcHandlers } from '../steps/workflow-step/handoff-rpc.js';
import { teamSettle } from '../../cli/services/team.js';

afterEach(() => { _setSignoffDepsForTests(); });

const BUILD = `BUILD-${H}-s1`;
const CR = `CR-${H}-s1`;

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

test('the team.settle operation runs settleSignoff for the unit, so a BUILD\'s completed request is recorded as signed-off and the held Story completes, and teamSettle prints what was recorded or why nothing was', async () => {
	const k = kit();
	try {
		// a Story whose BUILD is approved over an advisory-blocked review, held for signoff and submitted
		await seedEpic(k);
		await k.store.write({ ...(await k.store.read(BUILD)), payload: { body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }] }, citations: [] } }, alice);
		await k.store.write({ ...(await k.store.read(CR)), payload: { body: { verdict: 'block', counts: { high: 1, med: 0, low: 0 } }, citations: [] } }, alice);
		for (const t of [T1, T2]) await new History(k.sidecar).appendLog(t, { id: `round-${t}`, actor: bob, timestamp: '2026-10-21T12:00:00.000Z', operation: 'update', outcome: { result: 'pass', summary: 'ok', data: { kind: 'build-round' } } });
		const svc = new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce: false, history: new History(k.sidecar) }), now: clock() });
		await svc.completeIfRolledUp(T1, bob);
		await svc.completeIfRolledUp(T2, bob);

		let state: 'open' | 'completed' = 'open';
		const port = {
			whoAmI: (): PortResult<string> => ({ ok: true, value: 'bob' }),
			readSignoffState: (_r: SignoffRequestRef): PortResult<'open' | 'changes-requested' | 'completed'> => ({ ok: true, value: state }),
			setAssignee: (): PortResult<void> => ({ ok: true, value: undefined }),
		} as unknown as TrackerPort;
		_setSignoffDepsForTests({
			readPolicy: () => ({ ok: true, value: policy() }),
			loadTracker: () => ({ ok: true, value: port }),
			resolveIssue: () => 'acme/demo#2',
			lifecycleFor: () => svc,
		});
		await approveWorkflowTarget({ repoPath: k.repo, artifactPath: artifactJsonPath(k.repo, BUILD), overrideReview: 'known gap', lifecycle: svc, actor: bob }, { enforce: false });
		await svc.apply(BUILD, 'open-signoff', bob, { request: signoffReferenceOf({ ref: 'acme/demo#9' }) });
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'draft', 'the Story is held while the BUILD awaits signoff');

		// the daemon operation: nothing is recorded while the request is open, and the reply says what still waits
		const handlers = handoffRpcHandlers();
		const settle = handlers['team.settle'];
		assert.ok(settle, 'team.settle is served beside team.park and team.resume');
		const params = { repo: k.repo, epicHash: H, storyId: 's1' };
		const waiting = await settle(params) as { next: string; recorded: unknown[]; statuses: Record<string, string> };
		assert.equal(waiting.next, 'settled');
		assert.deepEqual(waiting.recorded, []);
		assert.equal(waiting.statuses[BUILD], 'in-signoff');
		assert.match(await teamSettle(k.repo, { unit: 'story', epicHash: H, storyId: 's1' }, async (method, p) => { assert.equal(method, 'team.settle'); return handlers['team.settle']!(p); }), /still awaiting signoff: BUILD-/);

		// the tracker reports it completed: the BUILD is signed off and the held Story and Epic complete
		state = 'completed';
		const line = await teamSettle(k.repo, { unit: 'story', epicHash: H, storyId: 's1' }, async (_method, p) => handlers['team.settle']!(p));
		assert.match(line, /^✓ settled story .* BUILD-.* in-signoff → completed/);
		assert.equal((await k.store.read(STORY)).lifecycle.status, 'completed');
		assert.equal((await k.store.read(EPIC)).lifecycle.status, 'completed');
		for (const record of RECORDS) assert.equal((await k.store.read(record)).lifecycle.status, 'completed', record);

		// settling again finds nothing waiting
		assert.match(await teamSettle(k.repo, { unit: 'story', epicHash: H, storyId: 's1' }, async (_method, p) => handlers['team.settle']!(p)), /no signoff request is waiting/);

		// a bad hash and a failed daemon reply print a cross line
		assert.equal((await settle({ repo: k.repo, epicHash: 'nope' }) as { next: string }).next, 'error');
		assert.match(await teamSettle(k.repo, { unit: 'epic', epicHash: H }, async () => ({ next: 'error', error: { code: 'bad-input', message: 'no repo' } })), /^✗ not settled — no repo/);
	} finally { k.done(); }
});
