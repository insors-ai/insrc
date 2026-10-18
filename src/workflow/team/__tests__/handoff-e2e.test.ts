/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A reassigned stage, end to end: the previous owner is refused with an offer to park, parks, and the new owner resumes on a
 * second clone at another absolute path; and after a lost machine, with nothing parked, only the stage that has no artifact
 * restarts. Real bare origin, real git, the real plan workflow and the real park offer.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-e2e.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { _setHandoffDepsForTests, handleWorkflowStep } from '../../../daemon/steps/workflow-step/handler.js';
import { registerParkOffer } from '../../../daemon/steps/workflow-step/park-offer.js';
import { _clearWorkflowStateStoreForTests, listStates } from '../../../daemon/steps/workflow-step/state-store.js';
import { registerWorkflowRunners } from '../../index.js';
import { _setGateDepsForTests, registerParkOfferProvider } from '../gate.js';
import { HASH, PLAN_STEPS, entryOf, git, mkWorld, parse, resumeDeps, s1Context, taskCore } from './helpers/handoff-world.js';

afterEach(() => { _setGateDepsForTests(); _setHandoffDepsForTests(); registerParkOfferProvider(undefined); _clearWorkflowStateStoreForTests(); });

test('from a reassignment refusal with an offer through park to resume on a second clone, and after a lost machine with no parked branch only the stage that has no artifact restarts, a committed LLD leaving the plan to do', async () => {
	registerWorkflowRunners();
	registerParkOffer();

	// ---- alice is working; the Story is reassigned to bob --------------------------------------------
	const w = mkWorld();
	try {
		_setHandoffDepsForTests(resumeDeps(w));
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'plan s1', repo: w.parker, params: { epicHash: HASH, storyId: 's1' } }));
		const planned = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: started.state } as never));
		const atS2 = parse(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Context, state: planned.state } as never));
		assert.equal(atS2['stepId'], 's2');

		w.actor.holder = 'bob';
		const refused = parse(await handleWorkflowStep({ phase: 'step', stepId: 's2', response: { tasks: [taskCore] }, state: atS2['state'] } as never));
		assert.equal(refused['next'], 'error', JSON.stringify(refused));
		assert.equal(refused['error'].code, 'team-gate-refused');
		assert.match(refused['error'].message, /held by bob/);
		assert.match(refused['error'].message, /run 'team park <epicHash> \[storyId\]' to hand it over/, 'the refusal offers to park');

		// ---- she parks: the run and its checkpoint reach the remote, her tree is untouched ---------------
		const head = git(w.parker, 'rev-parse', 'HEAD');
		const status = git(w.parker, 'status', '--porcelain');
		const parked = parse(await handleWorkflowStep({ phase: 'park', epicHash: HASH, storyId: 's1', repo: w.parker }));
		assert.equal(parked['next'], 'parked', JSON.stringify(parked));
		assert.equal(parked['variant'], 'run');
		assert.equal(git(w.parker, 'rev-parse', 'HEAD'), head);
		assert.equal(git(w.parker, 'status', '--porcelain'), status);
		assert.equal(git(w.origin, 'rev-parse', '--verify', `refs/heads/${parked['branch']}`).length, 40, 'the handoff branch is on the remote');

		// ---- bob resumes on his own clone, at another absolute path ---------------------------------------
		_clearWorkflowStateStoreForTests();
		w.actor.who = 'bob';
		assert.notEqual(w.recv, w.parker);
		const resumed = parse(await handleWorkflowStep({ phase: 'resume', epicHash: HASH, storyId: 's1', repo: w.recv }));
		assert.equal(resumed['next'], 'emit_step', JSON.stringify(resumed));
		assert.equal(resumed['stepId'], 's2', 'the step alice had reached');
		const stored = entryOf(resumed['state']);
		assert.equal(stored?.meta?.owner, 'bob');
		assert.equal(stored?.payload.intent.repoPath, w.recv, 'rebound to bob\'s clone');
		assert.deepEqual(stored?.payload.executor?.stepOutputs['s1'], s1Context, 'with the steps alice had finished');
		// and the run goes on from there
		const next = parse(await handleWorkflowStep({ phase: 'step', stepId: 's2', response: { tasks: [taskCore] }, state: resumed['state'] } as never));
		assert.equal(next['next'], 'emit_step', JSON.stringify(next));
		assert.equal(next['stepId'], 's3');
	} finally { rmSync(w.root, { recursive: true, force: true }); }

	// ---- a lost machine: nothing was parked, only the committed artifacts are on the remote -----------------
	_clearWorkflowStateStoreForTests();
	const lost = mkWorld();
	try {
		_setHandoffDepsForTests(resumeDeps(lost));
		lost.actor.who = 'bob'; lost.actor.holder = 'bob';
		// the Define, HLD and the Story's LLD are committed, the PLAN is not: only the plan stage is left to do
		const restart = parse(await handleWorkflowStep({ phase: 'resume', epicHash: HASH, storyId: 's1', repo: lost.recv }));
		assert.equal(restart['next'], 'restart', JSON.stringify(restart));
		assert.equal(restart['workflow'], 'plan');
		assert.equal(restart['draftRestored'], false);
		assert.deepEqual(restart['params'], { epicHash: HASH, storyId: 's1' });
		// the stage that already has its artifact has nothing to redo
		const done = parse(await handleWorkflowStep({ phase: 'resume', epicHash: HASH, storyId: 's1', repo: lost.recv, workflow: 'design.story' }));
		assert.equal(done['next'], 'nothing_to_resume', JSON.stringify(done));
		assert.match(done['reason'], /already committed/);
		assert.equal(listStates().length, 0, 'a restart stores no run');
	} finally { rmSync(lost.root, { recursive: true, force: true }); }
});
