/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Default-branch resolution tests (Story s2 / t5).
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/branch-resolution.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createDeadline } from '../git-async.js';
import type { GitAsync } from '../git-async.js';
import { parseSymrefHead, resolveDefaultBranch } from '../branch-resolution.js';
import { readSighting, writeSighting } from '../sighting-store.js';
import type { Sighting } from '../sighting-store.js';
import { cloneOf, git, makeFixture, makeOrigin } from './git-fixture.js';

const NO_ANCHOR = { known: false, firstCommit: '', firstCommitTime: '' } as const;
function recorded(branch: string, branchSource: 'remote' | 'user'): Sighting {
	return { remote: 'origin', branch, branchSource, sha: 'a'.repeat(40), refreshedAt: 'then', anchor: NO_ANCHOR };
}

/** A fake git: `symref` is ls-remote --symref's stdout (or a failure), `heads` the branches ls-remote --heads lists. */
function fakeGit(symref: string | Error, heads: readonly string[]): GitAsync {
	return async (_cwd, args) => {
		if (args.includes('--symref')) return symref instanceof Error ? { ok: false, stderr: symref.message, timedOut: false } : { ok: true, stdout: symref };
		const wanted = args[args.length - 1] ?? '';
		return { ok: true, stdout: heads.filter(h => `refs/heads/${h}` === wanted).map(h => `${'1'.repeat(40)}\trefs/heads/${h}\n`).join('') };
	};
}

test("the remote's answer wins over a supplied branch, then the sighting's branch, then the supplied branch after verification", async () => {
	assert.equal(parseSymrefHead('ref: refs/heads/trunk\tHEAD\n' + '1'.repeat(40) + '\tHEAD\n'), 'trunk');
	assert.equal(parseSymrefHead('' + '1'.repeat(40) + '\tHEAD\n'), undefined);

	const base = { repo: '/unused', remote: 'origin', deadline: createDeadline() };
	const named = fakeGit('ref: refs/heads/main\tHEAD\n', ['dev']);

	// The remote's answer wins over a supplied branch and over an earlier user pin.
	assert.deepEqual(await resolveDefaultBranch({ ...base, git: named, supplied: 'dev', sighting: recorded('dev', 'user') }), { ok: true, branch: 'main', source: 'remote' });

	// The remote cannot name one: the recorded branch (from the remote, or a user pin) is used before a supplied one.
	const silent = fakeGit('', ['dev', 'main']);
	assert.deepEqual(await resolveDefaultBranch({ ...base, git: silent, sighting: recorded('main', 'remote') }), { ok: true, branch: 'main', source: 'remote' });
	assert.deepEqual(await resolveDefaultBranch({ ...base, git: silent, supplied: 'main', sighting: recorded('dev', 'user') }), { ok: true, branch: 'dev', source: 'user' });

	// With nothing recorded, a supplied branch is used only after ls-remote --heads lists it.
	assert.deepEqual(await resolveDefaultBranch({ ...base, git: silent, supplied: 'main' }), { ok: true, branch: 'main', source: 'user' });
	assert.equal((await resolveDefaultBranch({ ...base, git: silent, supplied: 'nope' })).ok, false);

	// A remote that cannot be reached is refused even when a branch is recorded.
	const down = fakeGit(new Error('network is down'), []);
	const refused = await resolveDefaultBranch({ ...base, git: down, sighting: recorded('main', 'remote') });
	assert.equal(refused.ok, false);
	if (!refused.ok) assert.match(refused.reason, /could not be reached/);

	// A sighting for another remote is not used; unsafe names are refused.
	const other = await resolveDefaultBranch({ ...base, git: silent, sighting: { ...recorded('main', 'remote'), remote: 'upstream' } });
	assert.equal(other.ok, false);
	const unsafe = await resolveDefaultBranch({ ...base, git: silent, supplied: '--upload-pack=x' });
	assert.equal(unsafe.ok, false);
});

test('a dangling remote HEAD is refused without --branch and a real branch is recorded with source user', async () => {
	const f = makeFixture();
	try {
		const { bare } = makeOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/gone'); // the remote's HEAD now points at a branch that does not exist

		const refused = await resolveDefaultBranch({ repo: clone, remote: 'origin', deadline: createDeadline() });
		assert.equal(refused.ok, false);
		if (!refused.ok) assert.match(refused.reason, /team refresh --branch/);

		const pinned = await resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'main', deadline: createDeadline() });
		assert.deepEqual(pinned, { ok: true, branch: 'main', source: 'user' });

		// The decision is what gets recorded: stored in the sighting it reads back as a user pin.
		if (pinned.ok) {
			writeSighting(clone, { remote: 'origin', branch: pinned.branch, branchSource: pinned.source, sha: git(clone, 'rev-parse', 'origin/main'), refreshedAt: 'now', anchor: NO_ANCHOR }, f.teamDir);
			const back = readSighting(clone, f.teamDir);
			assert.equal(back.kind === 'valid' ? back.sighting.branchSource : undefined, 'user');
			assert.equal(back.kind === 'valid' ? back.sighting.branch : undefined, 'main');
		}
	} finally { f.cleanup(); }
});

test('a missing branch name or an unreachable remote records nothing', async () => {
	const f = makeFixture();
	try {
		const { bare } = makeOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/gone');

		const missing = await resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'nope', deadline: createDeadline() });
		assert.equal(missing.ok, false);
		if (!missing.ok) assert.match(missing.reason, /does not exist/);

		// An unreachable remote: the name cannot be verified, so it is refused.
		git(clone, 'remote', 'set-url', 'origin', join(f.root, 'no-such-remote.git'));
		const unreachable = await resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'main', deadline: createDeadline() });
		assert.equal(unreachable.ok, false);
		if (!unreachable.ok) assert.match(unreachable.reason, /could not be reached/);

		// An exhausted deadline never starts git.
		const spent = await resolveDefaultBranch({ repo: clone, remote: 'origin', supplied: 'main', deadline: createDeadline(0) });
		assert.equal(spent.ok, false);

		assert.equal(existsSync(f.teamDir), false, 'resolution never writes anything');
	} finally { f.cleanup(); }
});
