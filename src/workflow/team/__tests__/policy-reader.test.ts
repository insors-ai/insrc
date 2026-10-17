/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PolicyReader tests (Story s2 / t4), against real git in temporary directories.
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/policy-reader.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { POLICY_PATH } from '../git.js';
import { readPolicy } from '../policy-reader.js';
import { readSighting, sightingPath, writeSighting } from '../sighting-store.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin } from './git-fixture.js';
import type { Fixture } from './git-fixture.js';
import type { TeamPolicy } from '../types.js';

const POLICY_OFF = JSON.stringify({ teamMode: false, signoffStages: ['DEF'], claimsEnforced: false, administrators: [] });

function policyOf(result: ReturnType<typeof readPolicy>): TeamPolicy {
	assert.equal(result.ok, true, result.ok ? '' : result.reason);
	assert.ok(result.ok && result.value !== 'none', 'expected a policy');
	return (result as { ok: true; value: TeamPolicy }).value;
}

/** An origin whose default branch carries the policy, and a normal clone of it. */
function teamRepo(f: Fixture): { bare: string; work: string; clone: string } {
	const { bare, work } = makeOrigin(f);
	commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(work, 'push', '-q', 'origin', 'main');
	return { bare, work, clone: cloneOf(f, bare, 'clone') };
}

test("reads the policy from the remote default branch's tracking ref", () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		const policy = policyOf(readPolicy(clone, { teamDir: f.teamDir }));
		assert.equal(policy.teamMode, true);
		assert.deepEqual(policy.signoffStages, ['DEF', 'HLD', 'LLD', 'BUILD']);
		assert.equal(policy.source.ref, 'refs/remotes/origin/main');
		assert.equal(policy.source.anchorKnown, true);
		assert.equal(readSighting(clone, f.teamDir).kind, 'valid', 'the first observation is remembered');
	} finally { f.cleanup(); }
});

test('a working-tree edit has no effect', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		writeFileSync(join(clone, POLICY_PATH), POLICY_OFF);
		assert.equal(policyOf(readPolicy(clone, { teamDir: f.teamDir })).teamMode, true);
	} finally { f.cleanup(); }
});

test('a feature-branch edit has no effect', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		git(clone, 'checkout', '-q', '-b', 'feature');
		commitFile(clone, POLICY_PATH, POLICY_OFF, 'weaken policy on a feature branch');
		assert.equal(policyOf(readPolicy(clone, { teamDir: f.teamDir })).teamMode, true);
	} finally { f.cleanup(); }
});

test('a policy on an unlabelled tracking ref is never applied', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		git(clone, 'remote', 'set-head', 'origin', '-d');
		const result = readPolicy(clone, { teamDir: f.teamDir });
		assert.equal(result.ok, false, 'no policy value is returned for an unlabelled ref');
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent', 'nothing is recorded from an unlabelled ref');
	} finally { f.cleanup(); }
});

test('an unknown default branch with a fetched policy is refused with the --branch instruction', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		git(clone, 'remote', 'set-head', 'origin', '-d');
		const result = readPolicy(clone, { teamDir: f.teamDir });
		assert.equal(result.ok, false);
		if (!result.ok) {
			assert.match(result.reason, /team refresh --branch/);
			assert.match(result.reason, /refs\/remotes\/origin\/main/);
		}
	} finally { f.cleanup(); }
});

test('a remote without a remote HEAD and with no policy on any fetched ref reads as none', () => {
	const f = makeFixture();
	try {
		const { bare } = makeOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		git(clone, 'remote', 'set-head', 'origin', '-d');
		assert.deepEqual(readPolicy(clone, { teamDir: f.teamDir }), { ok: true, value: 'none' });
	} finally { f.cleanup(); }
});

test('a repo with no policy and no sighting reads as none and writes nothing', () => {
	const f = makeFixture();
	try {
		const { bare } = makeOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		assert.deepEqual(readPolicy(clone, { teamDir: f.teamDir }), { ok: true, value: 'none' });
		assert.equal(existsSync(f.teamDir), false, 'no team directory is created');
	} finally { f.cleanup(); }
});

test('non-git, no-commit and no-remote directories without a sighting read as none', () => {
	const f = makeFixture();
	try {
		const plain = join(f.root, 'plain');
		mkdirSync(plain);
		assert.deepEqual(readPolicy(plain, { teamDir: f.teamDir }), { ok: true, value: 'none' });
		assert.deepEqual(readPolicy(join(f.root, 'missing'), { teamDir: f.teamDir }), { ok: true, value: 'none' });

		const empty = join(f.root, 'empty');
		mkdirSync(empty);
		git(empty, 'init', '-q', '-b', 'main');
		assert.deepEqual(readPolicy(empty, { teamDir: f.teamDir }), { ok: true, value: 'none' });

		const noRemote = join(f.root, 'no-remote');
		mkdirSync(noRemote);
		git(noRemote, 'init', '-q', '-b', 'main');
		commitFile(noRemote, 'a.txt', 'x\n', 'a');
		assert.deepEqual(readPolicy(noRemote, { teamDir: f.teamDir }), { ok: true, value: 'none' });
		assert.equal(existsSync(f.teamDir), false, 'nothing is written');
	} finally { f.cleanup(); }
});

test('a never-fetched repo with no sighting reads as none', () => {
	const f = makeFixture();
	try {
		const { bare } = makeOrigin(f);
		const repo = join(f.root, 'never-fetched');
		mkdirSync(repo);
		git(repo, 'init', '-q', '-b', 'main');
		commitFile(repo, 'a.txt', 'x\n', 'a');
		git(repo, 'remote', 'add', 'origin', bare);
		assert.deepEqual(readPolicy(repo, { teamDir: f.teamDir }), { ok: true, value: 'none' });
	} finally { f.cleanup(); }
});

test('a known team repo with no fetched policy is refused with the reason', () => {
	const f = makeFixture();
	try {
		const repo = join(f.root, 'known');
		mkdirSync(repo);
		git(repo, 'init', '-q', '-b', 'main');
		commitFile(repo, 'a.txt', 'x\n', 'a');
		writeSighting(repo, { remote: 'origin', branch: 'main', branchSource: 'remote', sha: 'c'.repeat(40), refreshedAt: 'then', anchor: { known: false, firstCommit: '', firstCommitTime: '' } }, f.teamDir);
		const result = readPolicy(repo, { teamDir: f.teamDir });
		assert.equal(result.ok, false);
		if (!result.ok) assert.match(result.reason, /known to carry a team policy/);

		// A damaged record is evidence too: refused, never none, and left untouched.
		writeFileSync(sightingPath(repo, f.teamDir), 'garbage');
		const damaged = readPolicy(repo, { teamDir: f.teamDir });
		assert.equal(damaged.ok, false);
		if (!damaged.ok) assert.match(damaged.reason, /damaged/);
		assert.equal(readFileSync(sightingPath(repo, f.teamDir), 'utf8'), 'garbage');
	} finally { f.cleanup(); }
});

test('a known team repo whose remote was removed is refused or read from the recorded commit, never none', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);
		assert.equal(policyOf(readPolicy(clone, { teamDir: f.teamDir })).teamMode, true);

		git(clone, 'remote', 'remove', 'origin'); // also deletes the remote-tracking refs
		const afterRemoval = readPolicy(clone, { teamDir: f.teamDir });
		assert.notDeepEqual(afterRemoval, { ok: true, value: 'none' });
		assert.equal(policyOf(afterRemoval).teamMode, true, 'read from the commit the sighting recorded');

		// The directory is no longer a git repository at all: refused, still never none.
		const gone = join(f.root, 'not-a-repo-anymore');
		mkdirSync(gone);
		writeSighting(gone, { remote: 'origin', branch: 'main', branchSource: 'remote', sha: 'd'.repeat(40), refreshedAt: 'then', anchor: { known: false, firstCommit: '', firstCommitTime: '' } }, f.teamDir);
		const refused = readPolicy(gone, { teamDir: f.teamDir });
		assert.equal(refused.ok, false);
	} finally { f.cleanup(); }
});

test("the remote is origin, else the sole remote, never guessed, and a sighting's remote stays authoritative", () => {
	const f = makeFixture();
	try {
		const { bare, work } = makeOrigin(f);
		commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy');
		git(work, 'push', '-q', 'origin', 'main');

		// A sole remote that is not called origin is used.
		const sole = join(f.root, 'sole');
		git(f.root, 'clone', '-q', '-o', 'upstream', `file://${bare}`, sole);
		assert.equal(policyOf(readPolicy(sole, { teamDir: join(f.teamDir, 'sole') })).source.ref, 'refs/remotes/upstream/main');

		// Two remotes and no origin: not guessed, so there is no evidence and the repo reads as none.
		const two = join(f.root, 'two');
		git(f.root, 'clone', '-q', '-o', 'one', `file://${bare}`, two);
		git(two, 'remote', 'add', 'two', `file://${bare}`);
		git(two, 'fetch', '-q', 'two');
		assert.deepEqual(readPolicy(two, { teamDir: join(f.teamDir, 'two') }), { ok: true, value: 'none' });

		// With origin present, origin wins over another remote.
		git(two, 'remote', 'rename', 'one', 'origin');
		assert.equal(policyOf(readPolicy(two, { teamDir: join(f.teamDir, 'two-origin') })).source.ref, 'refs/remotes/origin/main');

		// A recorded remote stays authoritative even when origin exists.
		const sha = git(two, 'rev-parse', 'refs/remotes/two/main');
		writeSighting(two, { remote: 'two', branch: 'main', branchSource: 'remote', sha, refreshedAt: 'then', anchor: { known: false, firstCommit: '', firstCommitTime: '' } }, join(f.teamDir, 'auth'));
		assert.equal(policyOf(readPolicy(two, { teamDir: join(f.teamDir, 'auth') })).source.ref, 'refs/remotes/two/main');
	} finally { f.cleanup(); }
});

test('first observation creates the sighting create-only and a failed write does not change the result', () => {
	const f = makeFixture();
	try {
		const { clone } = teamRepo(f);

		// A team directory that cannot be created (a file is in the way): the result is unchanged.
		const blocked = join(f.root, 'blocked');
		writeFileSync(blocked, 'a file where the directory should be');
		assert.equal(policyOf(readPolicy(clone, { teamDir: blocked })).teamMode, true);

		// Create-only: an existing sighting is never overwritten by a later read.
		writeSighting(clone, { remote: 'origin', branch: 'main', branchSource: 'user', sha: git(clone, 'rev-parse', 'origin/main'), refreshedAt: 'then', anchor: { known: false, firstCommit: '', firstCommitTime: '' } }, f.teamDir);
		readPolicy(clone, { teamDir: f.teamDir });
		const after = readSighting(clone, f.teamDir);
		assert.equal(after.kind === 'valid' ? after.sighting.branchSource : undefined, 'user', 'the reader did not overwrite the existing sighting');
	} finally { f.cleanup(); }
});
