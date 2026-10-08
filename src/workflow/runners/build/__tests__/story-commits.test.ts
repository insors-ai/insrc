/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * storyChangeSet / mergeInProgress (ISSUE-f9ced66a, LLD-f9ced66a-s1, task t4),
 * against REAL temporary repositories: the merge semantics under test are git's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { NoBuildChangesError } from '../changed-files.js';
import { mergeInProgress, storyChangeSet } from '../story-commits.js';

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** git that may exit non-zero (a conflicted merge). */
function gitMay(repo: string, ...args: string[]): void {
	try { git(repo, ...args); } catch { /* expected */ }
}

function write(repo: string, rel: string, body: string): void {
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), body);
}

function commit(repo: string, files: Readonly<Record<string, string>>, msg: string): string {
	for (const [f, body] of Object.entries(files)) write(repo, f, body);
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', msg);
	return git(repo, 'rev-parse', 'HEAD').trim();
}

/** A repo on `main` with a base commit and an `upstream` branch from the base
 *  carrying one upstream commit. Returns the base sha. */
function repo(): { repo: string; base: string; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-story-commits-'));
	git(r, 'init', '-q', '-b', 'main');
	git(r, 'config', 'user.email', 't@example.com');
	git(r, 'config', 'user.name', 't');
	git(r, 'config', 'commit.gpgsign', 'false');
	const base = commit(r, { 'README.md': 'base\n', 'shared.txt': 'one\ntwo\nthree\n' }, 'base');
	git(r, 'checkout', '-q', '-b', 'upstream');
	commit(r, { 'up/a.ts': 'upstream a\n' }, 'upstream work');
	git(r, 'checkout', '-q', 'main');
	return { repo: r, base, cleanup: () => rmSync(r, { recursive: true, force: true }) };
}

function snapshot(r: string): string {
	return [git(r, 'rev-parse', 'HEAD'), git(r, 'for-each-ref'), git(r, 'status', '--porcelain'), git(r, 'ls-files', '-s')].join('\n');
}

test("storyChangeSet lists the Story's non-merge first-parent commits and leaves out files only a merge brought in", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		const s1 = commit(r, { 'src/story1.ts': 'one\n' }, 'story 1');
		git(r, 'merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');
		const s2 = commit(r, { 'src/story2.ts': 'two\n' }, 'story 2');

		const before = snapshot(r);
		const set = storyChangeSet(r, base);
		assert.equal(snapshot(r), before, 'refs, index and working tree are untouched');

		assert.deepEqual(set.paths, ['src/story1.ts', 'src/story2.ts']);
		assert.deepEqual(set.units.map(u => [u.kind, u.ref]), [['commit', s1], ['commit', s2]]);
		assert.deepEqual(set.sharedPaths, []);
		assert.deepEqual(set.foldedPaths, []);
		assert.equal(mergeInProgress(r), false);
		assert.equal(snapshot(r), before, 'mergeInProgress is read-only too');
	} finally { cleanup(); }
});

test('storyChangeSet records Story edits folded into a merge commit as a merge-edit unit', () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/story1.ts': 'one\n' }, 'story 1');
		git(r, 'merge', '-q', '--no-ff', '--no-commit', 'upstream');
		write(r, 'src/folded.ts', 'edited inside the merge\n');
		git(r, 'add', '-A');
		git(r, 'commit', '-q', '-m', 'merge upstream (with a Story edit)');
		const merge = git(r, 'rev-parse', 'HEAD').trim();

		const set = storyChangeSet(r, base);
		assert.deepEqual(set.paths, ['src/folded.ts', 'src/story1.ts']);
		const edit = set.units.find(u => u.kind === 'merge-edit');
		assert.ok(edit, 'a merge-edit unit');
		assert.equal(edit.ref, merge);
		assert.equal(edit.to, merge);
		assert.deepEqual(edit.paths, ['src/folded.ts']);
		assert.deepEqual(set.foldedPaths, ['src/folded.ts']);
		assert.equal(set.paths.includes('up/a.ts'), false, 'the merged-in file stays out');
	} finally { cleanup(); }
});

test('storyChangeSet records a hand-resolved conflict as a merge-edit unit', () => {
	const { repo: r, base, cleanup } = repo();
	try {
		git(r, 'checkout', '-q', 'upstream');
		commit(r, { 'shared.txt': 'one\nUPSTREAM\nthree\n' }, 'upstream edits shared');
		git(r, 'checkout', '-q', 'main');
		commit(r, { 'shared.txt': 'one\nSTORY\nthree\n' }, 'story edits shared');
		gitMay(r, 'merge', '--no-ff', 'upstream');
		write(r, 'shared.txt', 'one\nRESOLVED\nthree\n');
		git(r, 'add', '-A');
		git(r, 'commit', '-q', '-m', 'merge upstream (resolved)');

		const set = storyChangeSet(r, base);
		assert.deepEqual(set.paths, ['shared.txt']);
		assert.deepEqual(set.units.map(u => u.kind), ['commit', 'merge-edit']);
		assert.deepEqual(set.foldedPaths, ['shared.txt']);
		assert.deepEqual(set.sharedPaths, ['shared.txt'], 'the merge also brought changes to it');
	} finally { cleanup(); }
});

test("storyChangeSet includes a file the Story deleted and a root commit's files", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		git(r, 'rm', '-q', 'README.md');
		git(r, 'commit', '-q', '-m', 'story deletes README');
		assert.deepEqual(storyChangeSet(r, base).paths, ['README.md']);

		// An unrelated history: its root commit is in `<other-base>..HEAD`.
		git(r, 'checkout', '-q', '--orphan', 'fresh');
		git(r, 'rm', '-rq', '--cached', '.');
		const root = commit(r, { 'fresh/root.ts': 'root\n' }, 'root of a new history');
		const set = storyChangeSet(r, base);
		const rootUnit = set.units.find(u => u.ref === root);
		assert.ok(rootUnit, 'the root commit is a unit');
		assert.ok(rootUnit.paths.includes('fresh/root.ts'));
		assert.match(rootUnit.from, /^[0-9a-f]{40,64}$/, 'a root commit is diffed against the empty tree');
	} finally { cleanup(); }
});

test('storyChangeSet is empty when the range holds only a clean merge', () => {
	const { repo: r, base, cleanup } = repo();
	try {
		git(r, 'merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');
		const set = storyChangeSet(r, base);
		assert.deepEqual(set, { paths: [], units: [], sharedPaths: [], foldedPaths: [] });
	} finally { cleanup(); }
});

test('storyChangeSet throws NoBuildChangesError for an unresolvable base', () => {
	const { repo: r, cleanup } = repo();
	try {
		assert.throws(() => storyChangeSet(r, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), NoBuildChangesError);
	} finally { cleanup(); }
});

test('mergeInProgress is true while MERGE_HEAD exists and false after the merge is committed', () => {
	const { repo: r, cleanup } = repo();
	try {
		commit(r, { 'src/story1.ts': 'one\n' }, 'story 1');
		git(r, 'merge', '-q', '--no-ff', '--no-commit', 'upstream');
		assert.equal(mergeInProgress(r), true);
		git(r, 'commit', '-q', '-m', 'merge upstream');
		assert.equal(mergeInProgress(r), false);
	} finally { cleanup(); }
});

test('mergeInProgress is true while an uncommitted squash merge leaves SQUASH_MSG', () => {
	const { repo: r, cleanup } = repo();
	try {
		commit(r, { 'src/story1.ts': 'one\n' }, 'story 1');
		git(r, 'merge', '-q', '--squash', 'upstream');
		assert.equal(mergeInProgress(r), true);
		git(r, 'commit', '-q', '-m', 'squash upstream');
		assert.equal(mergeInProgress(r), false);
	} finally { cleanup(); }
});

test('known limit: upstream commits fast-forwarded or squash-merged into the Story are counted as Story work', () => {
	// Fast-forward: no merge commit, the upstream commit joins the first-parent line.
	const ff = repo();
	try {
		git(ff.repo, 'merge', '-q', '--ff-only', 'upstream');
		assert.deepEqual(storyChangeSet(ff.repo, ff.base).paths, ['up/a.ts']);
	} finally { ff.cleanup(); }

	// Committed squash: an ordinary commit carrying upstream's change.
	const sq = repo();
	try {
		git(sq.repo, 'merge', '-q', '--squash', 'upstream');
		git(sq.repo, 'commit', '-q', '-m', 'squash upstream');
		assert.deepEqual(storyChangeSet(sq.repo, sq.base).paths, ['up/a.ts']);
	} finally { sq.cleanup(); }
});

test('an octopus merge becomes one merge-edit unit over its whole change instead of a failure', () => {
	const { repo: r, base, cleanup } = repo();
	try {
		git(r, 'checkout', '-q', '-b', 'upstream2', base);
		commit(r, { 'up/b.ts': 'upstream b\n' }, 'more upstream work');
		git(r, 'checkout', '-q', 'main');
		commit(r, { 'src/story1.ts': 'one\n' }, 'story 1');
		git(r, 'merge', '-q', '--no-ff', '-m', 'octopus', 'upstream', 'upstream2');

		const set = storyChangeSet(r, base);
		const edit = set.units.find(u => u.kind === 'merge-edit');
		assert.ok(edit, 'one merge-edit unit');
		assert.deepEqual(edit.paths, ['up/a.ts', 'up/b.ts']);
		assert.deepEqual(set.paths, ['src/story1.ts', 'up/a.ts', 'up/b.ts']);
		assert.deepEqual(set.foldedPaths, ['up/a.ts', 'up/b.ts']);
	} finally { cleanup(); }
});
