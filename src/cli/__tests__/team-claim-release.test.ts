/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `team claim` and `team release` in the terminal: the unit is read from the arguments, the real
 * services call the gate's claim and release, and the outcome (or the refusal naming the holder) is printed.
 *
 * Run: npx tsx --test src/cli/__tests__/team-claim-release.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand, type CommandCtx } from '../command.js';
import * as team from '../services/team.js';
import { _setGateDepsForTests, type PolicyReader } from '../../workflow/team/gate.js';
import type { TeamPolicy } from '../../workflow/team/types.js';
import type { PortResult, TrackerPort } from '../../workflow/tracker/port.js';
import type { UnitRef } from '../../workflow/tracker/refs.js';

const HASH = '315d510cb28100e2';
const policy = (admins: string[] = []): PolicyReader => () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: admins } as unknown as TeamPolicy });

const ctx = (): CommandCtx => ({ repoPath: '/repo', onLog: () => undefined, services: { team } } as unknown as CommandCtx);

interface Seen { units: UnitRef[]; added: string[]; cleared: number }

/** A tracker where `assignees` are on the issue; the actor is alice. */
function inject(assignees: string[], admins: string[] = []): Seen {
	const seen: Seen = { units: [], added: [], cleared: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: assignees[0] ?? null }),
		addAssignee: (_i: unknown, who: string): PortResult<string[]> => { seen.added.push(who); return { ok: true, value: [...assignees, who] }; },
		setAssignee: (): PortResult<string[]> => { seen.cleared += 1; return { ok: true, value: [] }; },
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy: policy(admins),
		loadTracker: () => ({ ok: true, value: port }),
		resolveIssue: u => { seen.units.push(u); return 'acme/demo#7'; },
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	return seen;
}

afterEach(() => _setGateDepsForTests());

test('team claim and team release resolve the unit, call the gate functions, print the outcome or the holder, and print the usage line for bad arguments', async () => {
	// claim: an epic, a story and a task each reach the gate as that unit
	const free = inject([]);
	assert.deepEqual(await runCommand(`team claim ${HASH}`, ctx()), [`✓ claimed epic ${HASH}`]);
	assert.deepEqual(await runCommand(`team claim ${HASH} S1`, ctx()), [`✓ claimed story ${HASH}/s1`]);
	assert.deepEqual(await runCommand(`team claim ${HASH} s1 t2`, ctx()), [`✓ claimed task ${HASH}/s1/t2`]);
	assert.deepEqual(free.units.map(u => [u.unit, u.repoPath, u.epicHash, u.storyId, u.taskId]), [
		['epic', '/repo', HASH, undefined, undefined],
		['story', '/repo', HASH, 's1', undefined],
		['task', '/repo', HASH, 's1', 't2'],
	]);
	assert.deepEqual(free.added, ['alice', 'alice', 'alice'], 'the actor was added through the add-only call');

	// a stage someone else holds: the refusal names the holder, and nothing is added
	const held = inject(['bob']);
	assert.deepEqual(await runCommand(`team claim ${HASH} s1`, ctx()), ['✗ not claimed — held by bob']);
	assert.deepEqual(held.added, []);

	// release: the holder clears the stage; a stranger is refused naming the holder; an administrator may release it
	const mine = inject(['alice']);
	assert.deepEqual(await runCommand(`team release ${HASH} s1 t2`, ctx()), [`✓ released task ${HASH}/s1/t2`]);
	assert.equal(mine.cleared, 1);
	const theirs = inject(['bob']);
	const refused = await runCommand(`team release ${HASH} s1`, ctx());
	assert.match(refused[0] ?? '', /^✗ not released — only the holder \(bob\) or a policy administrator may release this stage$/);
	assert.equal(theirs.cleared, 0);
	const admin = inject(['bob'], ['alice']);
	assert.deepEqual(await runCommand(`team release ${HASH}`, ctx()), [`✓ released epic ${HASH}`]);
	assert.equal(admin.cleared, 1);

	// a repo that does not enforce claims says so rather than pretending
	_setGateDepsForTests({ readPolicy: () => ({ ok: true, value: 'none' }) });
	assert.match((await runCommand(`team claim ${HASH}`, ctx()))[0] ?? '', /^✗ not claimed — this repository does not enforce claims/);

	// bad or missing arguments: the usage line, and nothing is asked of the gate
	const idle = inject([]);
	for (const bad of ['team claim', 'team release', 'team claim nothex', `team claim ${HASH} story1`, `team claim ${HASH} s1 task2`, `team claim ${HASH} s1 t1 extra`, `team release ${HASH} t1`]) {
		const out = await runCommand(bad, ctx());
		assert.equal(out.length, 1, bad);
		assert.match(out[0] ?? '', /^usage: team init .*team claim\|release <epicHash> \[storyId \[taskId\]\] \| team park .*team resume .*$/, bad);
	}
	assert.deepEqual(idle.units, []);
});
