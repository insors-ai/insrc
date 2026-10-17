/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * PolicyRefresh tests (Story s2 / t6), against real git in temporary directories.
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/policy-refresh.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { POLICY_PATH } from '../git.js';
import { readPolicy } from '../policy-reader.js';
import { refreshPolicy } from '../policy-refresh.js';
import { LOCK_STALE_MS, acquireLock, readSighting, sightingKey } from '../sighting-store.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin, removeAndCommit } from './git-fixture.js';

const POLICY_OFF = JSON.stringify({ teamMode: false, signoffStages: ['DEF'], claimsEnforced: false, administrators: [] });

function teamOrigin(f: ReturnType<typeof makeFixture>): { bare: string; work: string } {
	const origin = makeOrigin(f);
	commitFile(origin.work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
	git(origin.work, 'push', '-q', 'origin', 'main');
	return origin;
}

test('refresh brings a changed policy into the tracking ref and the reader applies it', async () => {
	const f = makeFixture();
	try {
		const { bare, work } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		const before = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(before.ok && before.value !== 'none' && before.value.teamMode === true);

		commitFile(work, POLICY_PATH, POLICY_OFF, 'relax policy');
		git(work, 'push', '-q', 'origin', 'main');
		assert.ok(readPolicy(clone, { teamDir: f.teamDir }).ok, 'unchanged until refreshed');
		const stale = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(stale.ok && stale.value !== 'none' && stale.value.teamMode === true, 'the reader uses the last fetched policy');

		const refreshed = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(refreshed.ok, true, refreshed.ok ? '' : refreshed.reason);
		assert.ok(refreshed.ok && refreshed.value.kind === 'fetched');

		const after = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(after.ok && after.value !== 'none' && after.value.teamMode === false, 'the reader now applies the fetched policy');
	} finally { f.cleanup(); }
});

test("only the default branch's tracking ref changes with no tag, other branch, FETCH_HEAD or prune effect", async () => {
	const f = makeFixture();
	try {
		const { bare, work } = teamOrigin(f);
		git(work, 'branch', 'feat');
		git(work, 'tag', 'v1');
		git(work, 'push', '-q', 'origin', 'feat', 'v1');
		const clone = cloneOf(f, bare, 'clone');
		git(clone, 'config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'); // the standard configured mapping
		const featBefore = git(clone, 'rev-parse', 'refs/remotes/origin/feat');

		// The remote moves on: main and feat advance, a new tag and a new branch appear, and an old branch is deleted.
		commitFile(work, 'docs/x.md', 'x\n', 'main moves');
		git(work, 'push', '-q', 'origin', 'main');
		git(work, 'checkout', '-q', 'feat');
		commitFile(work, 'docs/y.md', 'y\n', 'feat moves');
		git(work, 'push', '-q', 'origin', 'feat');
		git(work, 'tag', 'v2');
		git(work, 'push', '-q', 'origin', 'v2');
		git(work, 'checkout', '-q', '-b', 'newbranch');
		git(work, 'push', '-q', 'origin', 'newbranch');
		git(work, 'push', '-q', 'origin', '--delete', 'feat');

		const mainBefore = git(clone, 'rev-parse', 'refs/remotes/origin/main');
		const refreshed = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(refreshed.ok, true, refreshed.ok ? '' : refreshed.reason);

		assert.notEqual(git(clone, 'rev-parse', 'refs/remotes/origin/main'), mainBefore, 'the default branch moved');
		assert.equal(git(clone, 'rev-parse', 'refs/remotes/origin/feat'), featBefore, 'another branch kept its old position and was not pruned');
		assert.equal(git(clone, 'for-each-ref', 'refs/remotes/origin/newbranch'), '', 'a new branch was not fetched');
		assert.equal(git(clone, 'tag', '--list'), 'v1', 'no new tag was fetched');
		assert.equal(existsSync(join(clone, '.git', 'FETCH_HEAD')), false, 'FETCH_HEAD was not written');
	} finally { f.cleanup(); }
});

test('unreachable remote reports failure and the last fetched policy stays in use', async () => {
	const f = makeFixture();
	try {
		const { bare } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		assert.ok((await refreshPolicy(clone, { teamDir: f.teamDir })).ok);

		git(clone, 'remote', 'set-url', 'origin', join(f.root, 'gone.git'));
		const result = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(result.ok, false);
		if (!result.ok) assert.match(result.reason, /could not be reached/);

		const stillThere = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(stillThere.ok && stillThere.value !== 'none' && stillThere.value.teamMode === true);
	} finally { f.cleanup(); }
});

test('a supplied branch is refused when the remote is unreachable and nothing is recorded', async () => {
	const f = makeFixture();
	try {
		const { bare } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		git(clone, 'remote', 'set-url', 'origin', join(f.root, 'gone.git'));
		const result = await refreshPolicy(clone, { teamDir: f.teamDir, branch: 'main' });
		assert.equal(result.ok, false);
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent');
		assert.equal(existsSync(join(f.teamDir, 'seen', `${sightingKey(clone)}.json`)), false);
	} finally { f.cleanup(); }
});

test('sighting write failure reports failure and cosmetic HEAD failure is a warning only', async () => {
	const f = makeFixture();
	try {
		const { bare, work } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');

		// The sighting cannot be recorded after the ref moved: failure, with the ref already updated.
		commitFile(work, POLICY_PATH, POLICY_OFF, 'relax policy');
		git(work, 'push', '-q', 'origin', 'main');
		const moved = git(work, 'rev-parse', 'HEAD');
		const failing = (): never => { throw new Error('disk full'); };
		const failed = await refreshPolicy(clone, { teamDir: f.teamDir, write: failing });
		assert.equal(failed.ok, false);
		if (!failed.ok) assert.match(failed.reason, /could not be recorded/);
		assert.equal(git(clone, 'rev-parse', 'refs/remotes/origin/main'), moved, 'the tracking ref had already moved');
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent');

		// A cosmetic remote HEAD failure (the symbolic ref is locked) is only a warning; the sighting was written first.
		writeFileSync(join(clone, '.git', 'refs', 'remotes', 'origin', 'HEAD.lock'), '');
		const warned = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(warned.ok, true, warned.ok ? '' : warned.reason);
		assert.ok(warned.ok && warned.value.warnings.length === 1 && /refs\/remotes\/origin\/HEAD/.test(warned.value.warnings[0] ?? ''));
		assert.equal(readSighting(clone, f.teamDir).kind, 'valid');
	} finally { f.cleanup(); }
});

test('a second refresh is refused while the lock is held and a stale lock is taken over', async () => {
	const f = makeFixture();
	try {
		const { bare } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		const held = acquireLock(clone, f.teamDir);
		assert.ok(held.ok);

		const refused = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(refused.ok, false);
		if (!refused.ok) assert.match(refused.reason, /already running/);

		const lock = join(f.teamDir, 'seen', `${sightingKey(clone)}.lock`);
		const old = new Date(Date.now() - LOCK_STALE_MS - 5_000);
		utimesSync(lock, old, old);
		const taken = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(taken.ok, true, taken.ok ? '' : taken.reason);
		assert.equal(existsSync(lock), false, 'the lock is released when the refresh ends');
	} finally { f.cleanup(); }
});

test('default-branch rename and policy file removal', async () => {
	const f = makeFixture();
	try {
		const { bare, work } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		assert.ok((await refreshPolicy(clone, { teamDir: f.teamDir })).ok);

		// The remote renames its default branch main -> trunk.
		git(work, 'branch', '-m', 'main', 'trunk');
		git(work, 'push', '-q', 'origin', 'trunk');
		git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
		git(work, 'push', '-q', 'origin', '--delete', 'main');

		const renamed = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(renamed.ok, true, renamed.ok ? '' : renamed.reason);
		const seen = readSighting(clone, f.teamDir);
		assert.equal(seen.kind === 'valid' ? seen.sighting.branch : undefined, 'trunk');
		const afterRename = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(afterRename.ok && afterRename.value !== 'none' && afterRename.value.source.ref === 'refs/remotes/origin/trunk');

		// The policy file is removed from the default branch: refresh removes the sighting first, then updates the remote
		// HEAD; a HEAD that cannot be updated is only a warning.
		removeAndCommit(work, POLICY_PATH, 'drop policy');
		git(work, 'push', '-q', 'origin', 'trunk');
		const removed = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.ok(removed.ok && removed.value.kind === 'absent');
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent');
		assert.deepEqual(readPolicy(clone, { teamDir: f.teamDir }), { ok: true, value: 'none' });
	} finally { f.cleanup(); }
});

test('refresh with --branch on a dangling remote HEAD fetches and records source user', async () => {
	const f = makeFixture();
	try {
		const { bare } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/gone');
		git(clone, 'remote', 'set-head', 'origin', '-d');
		mkdirSync(f.teamDir, { recursive: true });

		const refused = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.equal(refused.ok, false);
		if (!refused.ok) assert.match(refused.reason, /team refresh --branch/);

		const pinned = await refreshPolicy(clone, { teamDir: f.teamDir, branch: 'main' });
		assert.equal(pinned.ok, true, pinned.ok ? '' : pinned.reason);
		const seen = readSighting(clone, f.teamDir);
		assert.equal(seen.kind === 'valid' ? seen.sighting.branchSource : undefined, 'user');
		const read = readPolicy(clone, { teamDir: f.teamDir });
		assert.ok(read.ok && read.value !== 'none' && read.value.teamMode === true);
	} finally { f.cleanup(); }
});

test('an exhausted deadline stops the refresh and records nothing', async () => {
	const f = makeFixture();
	try {
		const { bare } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		const result = await refreshPolicy(clone, { teamDir: f.teamDir, deadlineMs: 0 });
		assert.equal(result.ok, false);
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent');
	} finally { f.cleanup(); }
});

test('removing the policy while the remote HEAD cannot be updated still removes the record and only warns', async () => {
	const f = makeFixture();
	try {
		const { bare, work } = teamOrigin(f);
		const clone = cloneOf(f, bare, 'clone');
		assert.ok((await refreshPolicy(clone, { teamDir: f.teamDir })).ok);
		removeAndCommit(work, POLICY_PATH, 'drop policy');
		git(work, 'push', '-q', 'origin', 'main');
		writeFileSync(join(clone, '.git', 'refs', 'remotes', 'origin', 'HEAD.lock'), '');

		const removed = await refreshPolicy(clone, { teamDir: f.teamDir });
		assert.ok(removed.ok && removed.value.kind === 'absent' && removed.value.warnings.length === 1);
		assert.equal(readSighting(clone, f.teamDir).kind, 'absent');
		assert.deepEqual(readPolicy(clone, { teamDir: f.teamDir }), { ok: true, value: 'none' });
	} finally { f.cleanup(); }
});
