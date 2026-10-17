/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sighting store tests (Story s2 / t2).
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/sighting-store.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	LOCK_STALE_MS,
	REFRESH_DEADLINE_MS,
	isSafeRefName,
	acquireLock,
	mergeAnchor,
	publishSightingIfAbsent,
	readSighting,
	removeSighting,
	sightingKey,
	sightingPath,
	writeSighting,
} from '../sighting-store.js';
import type { Sighting } from '../sighting-store.js';

const SHA = 'a'.repeat(40);
const KNOWN = { known: true, firstCommit: 'c1', firstCommitTime: '2026-01-01T00:00:00+00:00' } as const;
const UNKNOWN = { known: false, firstCommit: '', firstCommitTime: '' } as const;

function sighting(over: Partial<Sighting> = {}): Sighting {
	return { remote: 'origin', branch: 'main', branchSource: 'remote', sha: SHA, refreshedAt: '2026-10-17T00:00:00.000Z', anchor: UNKNOWN, ...over };
}

function scratch(): { root: string; teamDir: string; repoA: string; repoB: string } {
	const root = mkdtempSync(join(tmpdir(), 'sighting-'));
	const repoA = join(root, 'a');
	const repoB = join(root, 'b');
	mkdirSync(repoA);
	mkdirSync(repoB);
	return { root, teamDir: join(root, 'team'), repoA, repoB };
}

test('the sighting key comes from the real path so repositories and symlinks are distinct', () => {
	const { root, repoA, repoB } = scratch();
	try {
		const link = join(root, 'link-to-a');
		symlinkSync(repoA, link);
		assert.match(sightingKey(repoA), /^[0-9a-f]{16}$/);
		assert.notEqual(sightingKey(repoA), sightingKey(repoB));
		assert.equal(sightingKey(link), sightingKey(repoA), 'a symlink resolves to the same real repository');
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('a damaged sighting reads as damaged evidence, branchSource remote or user is validated', () => {
	const { root, teamDir, repoA } = scratch();
	try {
		assert.deepEqual(readSighting(repoA, teamDir), { kind: 'absent' });

		writeSighting(repoA, sighting({ branchSource: 'user' }), teamDir);
		const ok = readSighting(repoA, teamDir);
		assert.equal(ok.kind, 'valid');
		if (ok.kind === 'valid') assert.equal(ok.sighting.branchSource, 'user');

		const path = sightingPath(repoA, teamDir);
		writeFileSync(path, '{not json');
		assert.equal(readSighting(repoA, teamDir).kind, 'damaged');

		for (const bad of [{ branchSource: 'guess' }, { branch: '--upload-pack=x' }, { remote: '' }, { sha: 'zz' }, { anchor: { known: true, firstCommit: '', firstCommitTime: '' } }]) {
			writeFileSync(path, JSON.stringify({ ...sighting(), ...bad }));
			assert.equal(readSighting(repoA, teamDir).kind, 'damaged', JSON.stringify(bad));
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('create-only publish never overwrites an existing or damaged sighting', () => {
	const { root, teamDir, repoA } = scratch();
	try {
		assert.equal(publishSightingIfAbsent(repoA, sighting({ branch: 'first' }), teamDir), 'created');
		assert.equal(publishSightingIfAbsent(repoA, sighting({ branch: 'second' }), teamDir), 'exists');
		const read = readSighting(repoA, teamDir);
		assert.equal(read.kind === 'valid' ? read.sighting.branch : undefined, 'first');

		writeFileSync(sightingPath(repoA, teamDir), 'garbage');
		assert.equal(publishSightingIfAbsent(repoA, sighting(), teamDir), 'exists');
		assert.equal(readFileSync(sightingPath(repoA, teamDir), 'utf8'), 'garbage');

		// The overwrite writer replaces the file, using unique temp names that leave no stray files behind.
		writeSighting(repoA, sighting({ branch: 'third' }), teamDir);
		const after = readSighting(repoA, teamDir);
		assert.equal(after.kind === 'valid' ? after.sighting.branch : undefined, 'third');
		assert.deepEqual(readdirSync(join(teamDir, 'seen')).filter(f => f.endsWith('.tmp')), []);

		removeSighting(repoA, teamDir);
		assert.deepEqual(readSighting(repoA, teamDir), { kind: 'absent' });
		removeSighting(repoA, teamDir); // removing an absent sighting is not an error
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('a known anchor is never replaced by an unknown one and an unknown one is replaced by a known one', () => {
	assert.deepEqual(mergeAnchor(undefined, UNKNOWN), UNKNOWN);
	assert.deepEqual(mergeAnchor(KNOWN, UNKNOWN), KNOWN);
	assert.deepEqual(mergeAnchor(UNKNOWN, KNOWN), KNOWN);
	assert.deepEqual(mergeAnchor(UNKNOWN, UNKNOWN), UNKNOWN);
});

test('the lock refuses a second holder and takes over a lock older than 30 seconds', () => {
	assert.ok(LOCK_STALE_MS >= 3 * REFRESH_DEADLINE_MS, 'a live holder always releases well before its lock can look stale');
	const { root, teamDir, repoA, repoB } = scratch();
	try {
		const first = acquireLock(repoA, teamDir);
		assert.equal(first.ok, true);
		const second = acquireLock(repoA, teamDir);
		assert.equal(second.ok, false);
		if (!second.ok) assert.match(second.reason, /already running/);

		// A different repository has its own lock.
		const other = acquireLock(repoB, teamDir);
		assert.equal(other.ok, true);
		if (other.ok) other.release();

		// Age the lock past the stale limit: it is taken over.
		const lock = join(teamDir, 'seen', `${sightingKey(repoA)}.lock`);
		const old = new Date(Date.now() - LOCK_STALE_MS - 5_000);
		utimesSync(lock, old, old);
		const taken = acquireLock(repoA, teamDir);
		assert.equal(taken.ok, true);

		// A fresh lock is never reclaimed, however many contenders look at it.
		assert.equal(acquireLock(repoA, teamDir).ok, false);

		// The original holder releasing after the takeover must not delete the new holder's lock.
		if (first.ok) first.release();
		const blocked = acquireLock(repoA, teamDir);
		assert.equal(blocked.ok, false, 'the new holder still holds the lock');

		// Releasing the real holder frees it for the next holder, and takeover leaves no stray files.
		if (taken.ok) taken.release();
		const again = acquireLock(repoA, teamDir);
		assert.equal(again.ok, true);
		if (again.ok) again.release();
		assert.deepEqual(readdirSync(join(teamDir, 'seen')).filter(f => f.endsWith('.takeover')), [], 'the takeover guard is cleaned up');
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('safe ref names accept what git accepts and refuse what could be read as an option or break a ref', () => {
	for (const ok of ['main', 'release/1.2', 'équipe', '分支', 'feature_x-1', 'release+team', 'fix#12', 'a;b']) assert.equal(isSafeRefName(ok), true, ok);
	for (const bad of ['', '-x', '--upload-pack=x', 'a..b', 'a/', 'a.', 'a.lock', 'a b', 'a\tb', 'a@{b', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[b', 'a\\b', 'a//b', '/a', '@']) assert.equal(isSafeRefName(bad), false, JSON.stringify(bad));
});
