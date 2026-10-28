/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `team park` and `team resume` in the terminal: the unit and --workflow are read from the arguments, the daemon operations are
 * called with them, and the outcome (or the refusal naming the holder, with the park offer) is printed.
 *
 * Run: npx tsx --test src/cli/__tests__/team-park-resume.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand, type CommandCtx } from '../command.js';
import * as team from '../services/team.js';
import { _setGateDepsForTests, registerParkOfferProvider } from '../../workflow/team/gate.js';
import type { PolicyReader } from '../../workflow/team/gate.js';
import type { TeamPolicy } from '../../workflow/team/types.js';
import type { PortResult, TrackerPort } from '../../workflow/tracker/port.js';

const HASH = '315d510cb28100e2';
const USAGE = /^usage: team init .*team park <epicHash> \[storyId\] \| team resume <epicHash> \[storyId\] \[--workflow <name>\]( \| team settle <epicHash> \[storyId\])?$/;

type Call = { method: string; params: Record<string, unknown> };

/** The terminal's services, with the daemon call replaced by `reply`, recording what it was asked. */
function setup(reply: (method: string, params: Record<string, unknown>) => unknown): { ctx: () => CommandCtx; calls: Call[] } {
	const calls: Call[] = [];
	const call = async (method: string, params: Record<string, unknown>): Promise<unknown> => { calls.push({ method, params }); return reply(method, params); };
	const services = { team: { ...team, teamPark: (r: string, u: never) => team.teamPark(r, u, call), teamResume: (r: string, u: never, w?: string) => team.teamResume(r, u, w, call), teamSettle: (r: string, u: never) => team.teamSettle(r, u, call) } };
	return { calls, ctx: () => ({ repoPath: '/repo', onLog: () => undefined, services }) as unknown as CommandCtx };
}

afterEach(() => { _setGateDepsForTests(); registerParkOfferProvider(undefined); });

test('team park and team resume parse the unit and --workflow, print the offer, the outcome or the holder, and print the usage line for bad arguments', async () => {
	// park: the unit goes to the daemon, and the outcome is printed
	const parked = setup(() => ({ next: 'parked', branch: 'insrc/handoff/story-x-s1', commit: 'abc', variant: 'run', noted: false, noteFailure: 'gh timed out' }));
	assert.deepEqual(await runCommand(`team park ${HASH} S1`, parked.ctx()), [`✓ parked story ${HASH}/s1 on insrc/handoff/story-x-s1 (the run and its drafts) — the next owner runs 'team resume ${HASH} s1'  ⚠ the issue note was not added (gh timed out)`]);
	assert.deepEqual(parked.calls, [{ method: 'team.park', params: { repo: '/repo', epicHash: HASH, storyId: 's1' } }]);
	assert.deepEqual(await runCommand(`team park ${HASH}`, parked.ctx()), [`✓ parked epic ${HASH} on insrc/handoff/story-x-s1 (the run and its drafts) — the next owner runs 'team resume ${HASH}'  ⚠ the issue note was not added (gh timed out)`]);
	assert.deepEqual(parked.calls[1], { method: 'team.park', params: { repo: '/repo', epicHash: HASH } });

	// resume: the unit and --workflow (in either position) are passed on, and each answer is printed
	const turns: Record<string, unknown> = {
		plan: { next: 'emit_plan', state: 'tok1' },
		step: { next: 'emit_step', stepId: 's2', state: 'tok2' },
		synth: { next: 'emit_synthesize', state: 'tok3' },
		restart: { next: 'restart', workflow: 'plan', reason: 'the draft only', draftRestored: true },
		none: { next: 'nothing_to_resume', reason: 'the plan stage is already committed' },
	};
	let answer = turns['plan'];
	const resumed = setup(() => answer);
	assert.deepEqual(await runCommand(`team resume ${HASH} s1`, resumed.ctx()), [`✓ resumed story ${HASH}/s1 at the plan turn — the run is stored in the daemon; continue it with insrc_workflow_step (state tok1)`]);
	answer = turns['step'];
	assert.match((await runCommand(`team resume ${HASH} s1 --workflow plan`, resumed.ctx()))[0] ?? '', /at step s2 .*\(state tok2\)$/);
	answer = turns['synth'];
	assert.match((await runCommand(`team resume --workflow design.story ${HASH} s1`, resumed.ctx()))[0] ?? '', /at the synthesis turn .*\(state tok3\)$/);
	answer = turns['restart'];
	assert.deepEqual(await runCommand(`team resume ${HASH} s1`, resumed.ctx()), [`✓ story ${HASH}/s1: the draft only — start plan afresh (the parked draft is back in your working tree)`]);
	answer = turns['none'];
	assert.deepEqual(await runCommand(`team resume ${HASH}`, resumed.ctx()), [`• nothing to resume for epic ${HASH} — the plan stage is already committed`]);
	assert.deepEqual(resumed.calls.map(c => c.params), [
		{ repo: '/repo', epicHash: HASH, storyId: 's1' },
		{ repo: '/repo', epicHash: HASH, storyId: 's1', workflow: 'plan' },
		{ repo: '/repo', epicHash: HASH, storyId: 's1', workflow: 'design.story' },
		{ repo: '/repo', epicHash: HASH, storyId: 's1' },
		{ repo: '/repo', epicHash: HASH },
	]);

	// a refusal names the holder, for park and for resume
	const refused = setup(() => ({ next: 'error', error: { code: 'team-gate-refused', message: 'story is held by bob' } }));
	assert.deepEqual(await runCommand(`team resume ${HASH} s1`, refused.ctx()), ['✗ not resumed — story is held by bob']);
	assert.deepEqual(await runCommand(`team park ${HASH} s1`, refused.ctx()), ['✗ not parked — story is held by bob']);

	// bad arguments print the usage line and call nothing
	const idle = setup(() => { throw new Error('the daemon must not be called'); });
	for (const bad of ['team park', 'team resume', 'team park nothex', `team park ${HASH} story1`, `team park ${HASH} s1 t1`, `team resume ${HASH} s1 t1`, `team park ${HASH} s1 extra`,
		`team resume ${HASH} --workflow`, `team resume ${HASH} --workflow build`, `team park ${HASH} --workflow plan`, `team resume ${HASH} s1 --workflow plan --workflow plan`]) {
		const out = await runCommand(bad, idle.ctx());
		assert.equal(out.length, 1, bad);
		assert.match(out[0] ?? '', USAGE, bad);
	}
	assert.deepEqual(idle.calls, [], 'nothing was called');

	// the refusal line for a held stage carries the park command when an offer exists, and not otherwise
	const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'bob' }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: [] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: policy, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });
	// the daemon's own claim handler stands in for the daemon the terminal's service calls
	const daemon = await import('../../daemon/team-review-handlers.js');
	const real = { repoPath: '/repo', onLog: () => undefined, services: { team: { ...team, teamClaim: (repoPath: string, unit: never) => daemon.handleTeamClaim({ repoPath, unit }) } } } as unknown as CommandCtx;
	assert.equal((await runCommand(`team claim ${HASH} s1`, real))[0], '✗ not claimed — held by bob');
	registerParkOfferProvider(() => true);
	assert.equal((await runCommand(`team claim ${HASH} s1`, real))[0], `✗ not claimed — held by bob; you have unfinished work here, run 'team park <epicHash> [storyId]' to hand it over`);
});

test('team settle passes the unit to the daemon and prints what was recorded, what still waits, or the failure; a task or a bad hash prints the usage line', async () => {
	let answer: unknown = { next: 'settled', recorded: [{ artifactId: `BUILD-${HASH}-s1`, from: 'in-signoff', to: 'completed' }], statuses: {} };
	const settled = setup(() => answer);
	assert.deepEqual(await runCommand(`team settle ${HASH} S1`, settled.ctx()), [`✓ settled story ${HASH}/s1 — BUILD-${HASH}-s1 in-signoff → completed`]);
	assert.deepEqual(settled.calls, [{ method: 'team.settle', params: { repo: '/repo', epicHash: HASH, storyId: 's1' } }]);
	answer = { next: 'settled', recorded: [], statuses: { [`BUILD-${HASH}-s1`]: 'in-signoff' } };
	assert.match((await runCommand(`team settle ${HASH} s1`, settled.ctx()))[0] ?? '', /nothing to record yet — still awaiting signoff: BUILD-/);
	answer = { next: 'settled', recorded: [], statuses: {} };
	assert.match((await runCommand(`team settle ${HASH}`, settled.ctx()))[0] ?? '', /no signoff request is waiting/);
	answer = { next: 'settled', recorded: [], statuses: { [`BUILD-${HASH}-s1`]: 'in-signoff' }, problems: ['the tracker is not available, so the signoff requests could not be read (no gh)'] };
	assert.match((await runCommand(`team settle ${HASH} s1`, settled.ctx()))[0] ?? '', /^! story .*could not settle completely — the tracker is not available/);
	answer = { next: 'error', error: { code: 'bad-input', message: 'no repo' } };
	assert.deepEqual(await runCommand(`team settle ${HASH}`, settled.ctx()), ['✗ not settled — no repo']);
	for (const bad of ['team settle', 'team settle nope', `team settle ${HASH} s1 t1`]) assert.match((await runCommand(bad, settled.ctx()))[0] ?? '', USAGE, bad);
});
