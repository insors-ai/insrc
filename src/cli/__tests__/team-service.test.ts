/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Team service end to end (Story s2 / t8): the real `team init` and `team refresh`
 * commands against real git, then the policy reader.
 *
 * HOME is pointed at a scratch directory BEFORE the modules load, so the sightings
 * the service writes under ~/.insrc/team never touch the real home directory.
 *
 * Run: npx tsx --test src/cli/__tests__/team-service.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'team-home-'));
process.env['HOME'] = home;

const { runCommand } = await import('../command.js');
const { makeServices } = await import('../services/index.js');
const { readPolicy } = await import('../../workflow/team/policy-reader.js');
const { PATHS } = await import('../../shared/paths.js');
const fixture = await import('../../workflow/team/__tests__/git-fixture.js');

test.after(() => rmSync(home, { recursive: true, force: true }));

test('team refresh followed by a reader call in a temp clone returns the policy end to end', async () => {
	assert.ok(PATHS.team.startsWith(home), 'the sightings go to the scratch home');
	const f = fixture.makeFixture();
	try {
		const { bare, work } = fixture.makeOrigin(f);
		fixture.commitFile(work, '.insrc/policy.json', fixture.VALID_POLICY, 'adopt policy');
		fixture.git(work, 'push', '-q', 'origin', 'main');
		const clone = fixture.cloneOf(f, bare, 'clone');
		fixture.git(clone, 'remote', 'set-head', 'origin', '-d');
		fixture.git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/gone'); // the remote cannot name its default branch

		const ctx = { services: makeServices(), repoPath: clone, setPane: () => {}, onLog: () => {}, exit: () => {} };

		// With the default branch unknown and a policy on a fetched ref, the reader asks for the branch...
		const before = readPolicy(clone);
		assert.equal(before.ok, false);

		// ...the command is told the branch, fetches it and records it...
		const refused = await runCommand('team refresh --branch nope', ctx);
		assert.match(refused[0] ?? '', /^✗ .*does not exist/);
		const out = await runCommand('team refresh --branch main', ctx);
		assert.match(out[0] ?? '', /^✓ fetched main @ [0-9a-f]{7} — team policy applied/);

		// ...and the reader now returns the policy.
		const after = readPolicy(clone);
		assert.ok(after.ok && after.value !== 'none' && after.value.teamMode === true);
	} finally { f.cleanup(); }
});

test('team init writes a starter that the reader accepts once it is on the default branch', async () => {
	const f = fixture.makeFixture();
	try {
		const { bare, work } = fixture.makeOrigin(f);
		const ctx = { services: makeServices(), repoPath: work, setPane: () => {}, onLog: () => {}, exit: () => {} };
		mkdirSync(join(work, '.insrc'), { recursive: true });
		const out = await runCommand('team init', ctx);
		assert.match(out[0] ?? '', /^✓ wrote .*\.insrc\/policy\.json/);
		assert.match((await runCommand('team init', ctx))[0] ?? '', /^✗ .*already exists/);

		fixture.git(work, 'add', '-A');
		fixture.git(work, 'commit', '-q', '-m', 'adopt the starter policy');
		fixture.git(work, 'push', '-q', 'origin', 'main');
		const clone = fixture.cloneOf(f, bare, 'clone');
		const read = readPolicy(clone);
		assert.ok(read.ok && read.value !== 'none' && read.value.signoffStages.join() === 'DEF,HLD,LLD,BUILD' && read.value.claimsEnforced);
	} finally { f.cleanup(); }
});
