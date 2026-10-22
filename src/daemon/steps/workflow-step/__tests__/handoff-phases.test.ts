/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parking and resuming through the workflow-step `park` / `resume` phases and through the daemon operations `team.park` /
 * `team.resume`: both reach the run store, answer the same, and a gate refusal comes back as team-gate-refused.
 * Real bare origin, real git, the real plan workflow.
 *
 * Run: npx tsx --test src/daemon/steps/workflow-step/__tests__/handoff-phases.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { _setHandoffDepsForTests, handleWorkflowStep } from '../handler.js';
import { handoffRpcHandlers } from '../handoff-rpc.js';
import { _clearWorkflowStateStoreForTests, listStates } from '../state-store.js';
import { registerWorkflowRunners } from '../../../../workflow/index.js';
import { _setGateDepsForTests } from '../../../../workflow/team/gate.js';
import {
	HASH, PLAN_STEPS, entryOf, mkWorld, parse, resumeDeps, s1Context, type World,
} from '../../../../workflow/team/__tests__/helpers/handoff-world.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

afterEach(() => { _setGateDepsForTests(); _setHandoffDepsForTests(); _clearWorkflowStateStoreForTests(); });

type Out = Record<string, any>;
interface Way {
	park: (w: World) => Promise<Out>;
	resume: (w: World, extra?: Record<string, unknown>) => Promise<Out>;
}

/** Through the workflow-step phases, as the MCP tool dispatches them. */
const viaPhases: Way = {
	park: async w => parse(await handleWorkflowStep({ phase: 'park', epicHash: HASH, storyId: 's1', repo: w.parker })),
	resume: async (w, extra) => parse(await handleWorkflowStep({ phase: 'resume', epicHash: HASH, storyId: 's1', repo: w.recv, ...extra })),
};
/** Through the daemon operations, as the terminal calls them. */
const viaRpc = (w: World): Way => {
	const h = handoffRpcHandlers(resumeDeps(w));
	// over the socket the answer is JSON, as the phases' envelope already is
	const call = async (m: string, p: Record<string, unknown>): Promise<Out> => JSON.parse(JSON.stringify(await h[m]!(p, () => undefined, new AbortController().signal))) as Out;
	return {
		park: async x => call('team.park', { epicHash: HASH, storyId: 's1', repo: x.parker }),
		resume: async (x, extra) => call('team.resume', { epicHash: HASH, storyId: 's1', repo: x.recv, ...extra }),
	};
};

/** Alice runs the plan workflow to its second step, then parks while bob holds the Story; bob resumes on the other clone. */
async function scenario(way: (w: World) => Way): Promise<{ parked: Out; resumed: Out; stored: ReturnType<typeof entryOf>; refused: Out; w: World }> {
	const w = mkWorld();
	_setHandoffDepsForTests({ ...resumeDeps(w) });
	const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'plan s1', repo: w.parker, params: { epicHash: HASH, storyId: 's1' } }));
	const planned = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: started.state } as never));
	const atS2 = parse(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Context, state: planned.state } as never));
	assert.equal(atS2.stepId, 's2', JSON.stringify(atS2));
	assert.equal(listStates().length, 1);

	const via = way(w);
	w.actor.who = 'alice'; w.actor.holder = 'bob';
	const parked = await via.park(w);
	_clearWorkflowStateStoreForTests();

	// carol is not the holder: the gate refuses her, naming bob
	w.actor.who = 'carol';
	const refused = await via.resume(w);
	assert.equal(listStates().length, 0, 'a refused resume stores nothing');

	w.actor.who = 'bob'; w.actor.holder = 'bob';
	const resumed = await via.resume(w);
	return { parked, resumed, stored: resumed['state'] !== undefined ? entryOf(resumed['state'] as string) : undefined, refused, w };
}

test('the park and resume phases and the team.park and team.resume operations reach the run store, return the park result or the next turn, and map a gate refusal to team-gate-refused', async () => {
	registerWorkflowRunners();
	const results: Array<{ name: string; out: Awaited<ReturnType<typeof scenario>> }> = [];
	try {
		for (const [name, way] of [['phases', () => viaPhases], ['rpc', viaRpc]] as const) {
			const out = await scenario(way);
			results.push({ name, out });
			rmSync(out.w.root, { recursive: true, force: true });
			_clearWorkflowStateStoreForTests();
		}
		for (const { name, out } of results) {
			assert.equal(out.parked['next'], 'parked', `${name}: ${JSON.stringify(out.parked)}`);
			assert.match(out.parked['branch'], /^insrc\/handoff\/story-/);
			assert.equal(out.parked['variant'], 'run');
			assert.equal(out.parked['noted'], true);
			// a gate refusal keeps its own code and names the holder
			assert.equal(out.refused['next'], 'error', `${name}: ${JSON.stringify(out.refused)}`);
			assert.equal(out.refused['error'].code, 'team-gate-refused');
			assert.match(out.refused['error'].message, /bob/);
			// the resume returned the step the run stopped at and stored the run under bob
			assert.equal(out.resumed['next'], 'emit_step', `${name}: ${JSON.stringify(out.resumed)}`);
			assert.equal(out.resumed['stepId'], 's2');
			assert.equal(out.stored?.payload.stage, 'awaiting_llm_step');
			assert.equal(out.stored?.meta?.owner, 'bob');
			assert.equal(out.stored?.payload.intent.repoPath, out.w.recv);
		}
		const [a, b] = results;
		// the operation answers what the phase answers
		assert.deepEqual({ ...a!.out.parked, commit: 0 }, { ...b!.out.parked, commit: 0 });
		assert.equal(a!.out.resumed['prompt'], b!.out.resumed['prompt']);
		assert.equal(a!.out.refused['error'].message.replaceAll(a!.out.w.parker, '<R>'), b!.out.refused['error'].message.replaceAll(b!.out.w.parker, '<R>'));
	} finally { for (const { out } of results) rmSync(out.w.root, { recursive: true, force: true }); }
});
