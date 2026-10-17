/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AnchorFinder tests (Story s2 / t3).
 *
 * Run:
 *   npx tsx --test src/workflow/team/__tests__/anchor-finder.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findAnchor, parseAnchorLog } from '../anchor-finder.js';
import { POLICY_PATH } from '../git.js';
import { VALID_POLICY, cloneOf, commitFile, git, makeFixture, makeOrigin, removeAndCommit } from './git-fixture.js';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

test('parsing git log output picks the oldest add even after a later delete and re-add', () => {
	// `--reverse` lists adds oldest first: the first line is the first appearance.
	const out = `${SHA_A}\t2026-01-02T00:00:00+00:00\n${SHA_B}\t2026-03-01T00:00:00+00:00\n`;
	assert.deepEqual(parseAnchorLog(out), { known: true, firstCommit: SHA_A, firstCommitTime: '2026-01-02T00:00:00+00:00' });
	assert.equal(parseAnchorLog('').known, false);
	assert.equal(parseAnchorLog('not a log line').known, false);
});

test('adoption, approval, deletion and reintroduction keeps the adoption commit on real history', () => {
	const f = makeFixture();
	try {
		const { bare, work } = makeOrigin(f);
		const adoption = commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
		commitFile(work, 'docs/approved.md', 'approved after adoption\n', 'approval lands', '2026-02-10T00:00:00+00:00');
		removeAndCommit(work, POLICY_PATH, 'drop policy', '2026-03-01T00:00:00+00:00');
		commitFile(work, POLICY_PATH, VALID_POLICY, 'reintroduce policy', '2026-04-01T00:00:00+00:00');
		git(work, 'push', '-q', 'origin', 'main');

		const clone = cloneOf(f, bare, 'clone');
		const anchor = findAnchor(clone, 'refs/remotes/origin/main');
		assert.equal(anchor.known, true);
		assert.equal(anchor.firstCommit, adoption);
		assert.equal(new Date(anchor.firstCommitTime).toISOString(), '2026-02-01T00:00:00.000Z', 'committer time is ISO');
	} finally { f.cleanup(); }
});

test('a depth-1 shallow clone gives known false and deepening gives a known anchor', () => {
	const f = makeFixture();
	try {
		const { bare, work } = makeOrigin(f);
		const adoption = commitFile(work, POLICY_PATH, VALID_POLICY, 'adopt policy', '2026-02-01T00:00:00+00:00');
		commitFile(work, 'docs/a.md', 'x\n', 'more work', '2026-02-02T00:00:00+00:00');
		git(work, 'push', '-q', 'origin', 'main');

		const shallow = cloneOf(f, bare, 'shallow', '--depth', '1');
		const unknown = findAnchor(shallow, 'refs/remotes/origin/main');
		assert.deepEqual(unknown, { known: false, firstCommit: '', firstCommitTime: '' });

		git(shallow, 'fetch', '-q', '--unshallow');
		const deepened = findAnchor(shallow, 'refs/remotes/origin/main');
		assert.equal(deepened.known, true);
		assert.equal(deepened.firstCommit, adoption);
	} finally { f.cleanup(); }
});

test('a failing git log gives known false without throwing', () => {
	const f = makeFixture();
	try {
		const { work } = makeOrigin(f);
		assert.equal(findAnchor(work, 'refs/remotes/origin/does-not-exist').known, false);
		assert.equal(findAnchor(work, 'refs/remotes/origin/main').known, false, 'no add of the policy file on this history');
		assert.equal(findAnchor(f.root + '/not-a-repo', 'refs/remotes/origin/main').known, false);
	} finally { f.cleanup(); }
});
