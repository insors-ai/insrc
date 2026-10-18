/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t2 — storyChangeSet attributes commits by the Story's
 * `Insrc-Story` trailer, against REAL temporary repositories.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/story-commits-trailer.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { changedFiles } from '../changed-files.js';
import { storyChangeSet } from '../story-commits.js';

const STORY = 'b47dadc7cf0cccb1/S001';
const OTHER = '748edb69bd23f767/S001';

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commit(repo: string, files: Readonly<Record<string, string>>, subject: string, storyKey?: string): string {
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), body);
	}
	git(repo, 'add', '-A');
	const msg = storyKey !== undefined ? `${subject}\n\nBody.\n\nInsrc-Story: ${storyKey}\n` : subject;
	git(repo, 'commit', '-q', '-m', msg);
	return git(repo, 'rev-parse', 'HEAD').trim();
}

function repo(): { repo: string; base: string; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-story-trailer-'));
	git(r, 'init', '-q', '-b', 'main');
	git(r, 'config', 'user.email', 't@example.com');
	git(r, 'config', 'user.name', 't');
	git(r, 'config', 'commit.gpgsign', 'false');
	const base = commit(r, { 'README.md': 'base\n' }, 'base');
	git(r, 'checkout', '-q', '-b', 'upstream');
	commit(r, { 'up/a.ts': 'upstream a\n' }, 'upstream work');
	git(r, 'checkout', '-q', 'main');
	return { repo: r, base, cleanup: () => rmSync(r, { recursive: true, force: true }) };
}

test("with a story key, only commits carrying the Story's trailer and merge edits are units; another Story's interleaved commits are not", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		const t1 = commit(r, { 'src/mine.ts': 'one\n', 'src/shared.ts': 'mine\n' }, 'feat(build): S001/t1 mine', STORY);
		commit(r, { 'src/theirs.ts': 'x\n', 'src/shared.ts': 'theirs\n' }, 'feat(build): s3/t1 theirs', 'c2ba6fa6aaaaaaaa/s3');
		commit(r, { 'src/plain.ts': 'y\n' }, 'chore: an untrailed commit');
		git(r, 'merge', '-q', '--no-ff', '--no-commit', 'upstream');
		writeFileSync(join(r, 'src/folded.ts'), 'edited in the merge\n');
		git(r, 'add', '-A');
		git(r, 'commit', '-q', '-m', 'merge upstream (no trailer)');
		const merge = git(r, 'rev-parse', 'HEAD').trim();
		const t2 = commit(r, { 'src/mine2.ts': 'two\n' }, 'feat(build): S001/t2 mine again', STORY);

		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.equal(set.attribution, 'story-trailer');
		assert.deepEqual(set.units.map(u => [u.kind, u.ref]), [['commit', t1], ['merge-edit', merge], ['commit', t2]]);
		assert.deepEqual(set.paths, ['src/folded.ts', 'src/mine.ts', 'src/mine2.ts', 'src/shared.ts']);
		assert.deepEqual(set.sharedWithExcluded, ['src/shared.ts'], 'the other Story also changed shared.ts');
	} finally { cleanup(); }
});

test("two standalone Stories both S001 are told apart by the trailer's epicHash", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		const mine = commit(r, { 'src/mine.ts': '1\n' }, 'feat(build): S001/t1 mine', STORY);
		const theirs = commit(r, { 'src/theirs.ts': '1\n' }, 'feat(build): S001/t1 theirs', OTHER);

		const a = storyChangeSet(r, base, { storyKey: STORY });
		const b = storyChangeSet(r, base, { storyKey: OTHER });
		assert.deepEqual(a.units.map(u => u.ref), [mine]);
		assert.deepEqual(b.units.map(u => u.ref), [theirs]);
		assert.deepEqual([a.attribution, b.attribution], ['story-trailer', 'story-trailer']);
	} finally { cleanup(); }
});

test("with no trailered commit in the range, or when reading trailers fails, the set is today's and attribution is first-parent-range", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/a.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
		commit(r, { 'src/b.ts': '1\n' }, 'feat(build): S001/t2 another Story', OTHER);
		const today = storyChangeSet(r, base);
		assert.equal(today.attribution, 'first-parent-range');

		const none = storyChangeSet(r, base, { storyKey: STORY });
		assert.equal(none.attribution, 'first-parent-range');
		assert.deepEqual(none.units, today.units);
		assert.deepEqual(none.paths, ['src/a.ts', 'src/b.ts']);
		assert.deepEqual(none.sharedWithExcluded, []);

		commit(r, { 'src/c.ts': '1\n' }, 'feat(build): S001/t3 trailered', STORY);
		assert.equal(storyChangeSet(r, base, { storyKey: STORY }).attribution, 'story-trailer', 'trailers read normally first');
		// A bad log.date makes `git log` (the trailer read) fail while `rev-list` still works.
		git(r, 'config', 'log.date', 'bogus');
		const failed = storyChangeSet(r, base, { storyKey: STORY });
		assert.equal(failed.attribution, 'first-parent-range');
		assert.deepEqual(failed.units, storyChangeSet(r, base).units);
		assert.deepEqual(failed.paths, ['src/a.ts', 'src/b.ts', 'src/c.ts']);
	} finally { cleanup(); }
});

test("a file one Story changed and another Story reverted stays in the first Story's subject and diff", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/keep.ts': '1\n', 'src/flip.ts': 'mine\n' }, 'feat(build): S001/t1 mine', STORY);
		git(r, 'rm', '-q', 'src/flip.ts');
		git(r, 'commit', '-q', '-m', 'feat(build): s3/t1 reverts flip.ts\n\nInsrc-Story: c2ba6fa6aaaaaaaa/s3\n');

		assert.deepEqual([...await changedFiles(r, { base })].sort(), ['src/keep.ts'], 'the net range no longer shows flip.ts');
		let attribution: string | undefined;
		const files = await changedFiles(r, { base, storyKey: STORY, onAttribution: a => { attribution = a.attribution; } });
		assert.deepEqual([...files].sort(), ['src/flip.ts', 'src/keep.ts']);
		assert.equal(attribution, 'story-trailer');
	} finally { cleanup(); }
});
