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

import { assembleDiffCodeReviewGrounding, realDiffGroundingDeps } from '../../../code-review/grounding.js';
import { NoBuildChangesError, changedFiles } from '../changed-files.js';
import { newestStoryCommit, storyChangeSet, storyLines } from '../story-commits.js';
import { getLogger } from '../../../../shared/logger.js';

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

test("a Story with no carrying commit keeps its untrailered commits and leaves out another Story's, so the range of src/a.ts and src/b.ts gives src/a.ts", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		const a = commit(r, { 'src/a.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
		commit(r, { 'src/b.ts': '1\n' }, 'feat(build): S001/t2 another Story', OTHER);
		const today = storyChangeSet(r, base);
		assert.equal(today.attribution, 'first-parent-range');
		assert.deepEqual(today.paths, ['src/a.ts', 'src/b.ts'], 'without a story key nothing is filtered');
		assert.equal(today.perUnit, false, 'an unfiltered range is read as a whole');

		const none = storyChangeSet(r, base, { storyKey: STORY });
		assert.equal(none.attribution, 'first-parent-range');
		assert.deepEqual(none.units.map(u => u.ref), [a]);
		assert.deepEqual(none.paths, ['src/a.ts']);
		assert.deepEqual(none.sharedWithExcluded, []);
		assert.equal(none.perUnit, true, 'a range another Story was left out of is read unit by unit');
	} finally { cleanup(); }
});

test("with no foreign commit, a Story with no carrying commit gets today's first-parent range, read as a whole", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/a.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
		commit(r, { 'src/b.ts': '1\n' }, 'feat(build): S001/t2 untrailed');
		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.deepEqual(set.units, storyChangeSet(r, base).units);
		assert.deepEqual([set.attribution, set.perUnit], ['first-parent-range', false]);
	} finally { cleanup(); }
});

test("when reading trailers fails without strict, the set is today's first-parent range", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/a.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
		commit(r, { 'src/b.ts': '1\n' }, 'feat(build): S001/t2 another Story', OTHER);
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

test('with strict, a trailer scan that cannot read the commit messages throws NoBuildChangesError instead of falling back to the first-parent range', () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/a.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
		commit(r, { 'src/c.ts': '1\n' }, 'feat(build): S001/t2 trailered', STORY);
		assert.equal(storyChangeSet(r, base, { storyKey: STORY, strict: true }).attribution, 'story-trailer', 'strict reads normally when git works');
		git(r, 'config', 'log.date', 'bogus');
		assert.throws(() => storyChangeSet(r, base, { storyKey: STORY, strict: true }), NoBuildChangesError);
		// newestStoryCommit keeps the lenient scan.
		assert.equal(newestStoryCommit(r, base, STORY), undefined);
	} finally { cleanup(); }
});

test("with a storyKey and no commit carrying it, a commit carrying another Story's trailer is left out, and a range of only other Stories' commits gives an empty set", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/b.ts': '1\n', 'src/shared.ts': 'other\n' }, 'feat(build): s3/t1 other', OTHER);
		commit(r, { 'src/d.ts': '1\n' }, 'feat(build): s3/t2 a third Story', 'c2ba6fa6aaaaaaaa/s3');
		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.deepEqual(set.units, []);
		assert.deepEqual(set.paths, []);
		assert.deepEqual(set.sharedWithExcluded, []);
		assert.equal(set.perUnit, true);

		const a = commit(r, { 'src/a.ts': '1\n', 'src/shared.ts': 'mine\n' }, 'feat(build): S001/t1 untrailed');
		const mixed = storyChangeSet(r, base, { storyKey: STORY });
		assert.deepEqual(mixed.units.map(u => u.ref), [a]);
		assert.deepEqual(mixed.paths, ['src/a.ts', 'src/shared.ts']);
		assert.deepEqual(mixed.sharedWithExcluded, ['src/shared.ts'], "the other Story's commit also changed shared.ts");
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

		// The diff review shows the Story's own hunk for flip.ts too (t5).
		const diff = await assembleDiffCodeReviewGrounding(r, realDiffGroundingDeps(), { base, storyKey: STORY });
		assert.deepEqual([...diff.changedFiles].sort(), ['src/flip.ts', 'src/keep.ts']);
		assert.match(diff.grounding.symbols.find(s => s.file === 'src/flip.ts')?.signature ?? '', /^\+mine$/m);
	} finally { cleanup(); }
});

test("a commit counts as the Story's when its Insrc-Story line is in any paragraph, never when the key is only mentioned (ISSUE-f431a442)", () => {
	const { repo: r, base, cleanup } = repo();
	const raw = (files: Readonly<Record<string, string>>, msg: string): string => {
		for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(r, f)), { recursive: true }); writeFileSync(join(r, f), body); }
		git(r, 'add', '-A');
		git(r, 'commit', '-q', '-m', msg);
		return git(r, 'rev-parse', 'HEAD').trim();
	};
	try {
		// The shape that was dropped: the Story line, a blank line, then a co-author block.
		const own = raw({ 'src/own.ts': '1\n' }, `feat: own paragraph\n\nBody.\n\nInsrc-Story: ${STORY}\n\nCo-Authored-By: A <a@example.com>\n`);
		// The shape that always counted: the Story line in the final trailer block.
		const block = raw({ 'src/block.ts': '1\n' }, `feat: final block\n\nBody.\n\nInsrc-Story: ${STORY}\nCo-Authored-By: A <a@example.com>\n`);
		// The Story line in the middle of the message.
		const middle = raw({ 'src/middle.ts': '1\n' }, `feat: middle\n\nInsrc-Story: ${STORY}\n\nMore text after it.\n`);
		// Not the Story's: the key only mentioned, another Story's key, a key with a suffix.
		raw({ 'src/mention.ts': '1\n' }, `docs: mention\n\nSee the line Insrc-Story: ${STORY} in the other commits.\n`);
		raw({ 'src/other.ts': '1\n' }, `feat: other\n\nInsrc-Story: ${OTHER}\n\nCo-Authored-By: A <a@example.com>\n`);
		raw({ 'src/suffix.ts': '1\n' }, `feat: suffix\n\nInsrc-Story: ${STORY}-extra\n`);

		// The dropped shape is what git's own trailer parser misses.
		assert.equal(git(r, 'log', '-1', '--format=%(trailers:key=Insrc-Story,valueonly)', own).trim(), '');

		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.equal(set.attribution, 'story-trailer');
		assert.deepEqual(set.units.map(u => u.ref), [own, block, middle]);
		assert.deepEqual(set.paths, ['src/block.ts', 'src/middle.ts', 'src/own.ts']);
	} finally { cleanup(); }
});

test('storyLines reads every whole Insrc-Story line and nothing else', () => {
	assert.deepEqual(storyLines(`s\n\nInsrc-Story: ${STORY}\n\nCo-Authored-By: x\n`), [STORY]);
	assert.deepEqual(storyLines(`s\n\n  Insrc-Story:   ${STORY}  \n`), [STORY], 'surrounding spaces are trimmed');
	assert.deepEqual(storyLines(`s\n\nsee Insrc-Story: ${STORY}\nInsrc-Storyline: x\n`), [], 'a mention or another key is not a Story line');
	assert.deepEqual(storyLines(`Insrc-Story: ${STORY}\nInsrc-Story: ${OTHER}\n`), [STORY, OTHER]);
});

/** Merge `branches` into main with `msg`; with `edit`, change a file inside the merge commit. */
function merge(r: string, branches: readonly string[], msg: string, edit?: Readonly<Record<string, string>>): string {
	git(r, 'merge', '-q', '--no-ff', '--no-commit', ...branches);
	for (const [f, body] of Object.entries(edit ?? {})) {
		mkdirSync(dirname(join(r, f)), { recursive: true });
		writeFileSync(join(r, f), body);
	}
	git(r, 'add', '-A');
	git(r, 'commit', '-q', '-m', msg);
	return git(r, 'rev-parse', 'HEAD').trim();
}

test("a merge carrying only another Story's trailer is not a unit, two-parent or octopus, with and without a commit carrying this Story's trailer, while an untrailered merge edit still is", () => {
	for (const carrying of [false, true]) {
		const { repo: r, base, cleanup } = repo();
		try {
			git(r, 'checkout', '-q', '-b', 'up2', base);
			commit(r, { 'up/b.ts': 'upstream b\n' }, 'upstream b');
			git(r, 'checkout', '-q', '-b', 'up3', base);
			commit(r, { 'up/c.ts': 'upstream c\n' }, 'upstream c');
			git(r, 'checkout', '-q', 'main');

			const own = carrying
				? commit(r, { 'src/mine.ts': '1\n' }, 'feat(build): S001/t1 mine', STORY)
				: commit(r, { 'src/mine.ts': '1\n' }, 'feat(build): S001/t1 untrailed');
			// Another Story's two-parent merge, with an edit inside it.
			merge(r, ['upstream'], `merge upstream\n\nInsrc-Story: ${OTHER}\n`, { 'src/their-fold.ts': 'theirs\n' });
			// Another Story's octopus merge.
			merge(r, ['up2', 'up3'], `octopus\n\nInsrc-Story: ${OTHER}\n`);
			// An untrailered merge with an edit inside it: still the Story's.
			git(r, 'checkout', '-q', '-b', 'up4', base);
			commit(r, { 'up/d.ts': 'upstream d\n' }, 'upstream d');
			git(r, 'checkout', '-q', 'main');
			const plain = merge(r, ['up4'], 'merge up4 (no trailer)', { 'src/my-fold.ts': 'mine\n' });

			const set = storyChangeSet(r, base, { storyKey: STORY });
			assert.deepEqual(set.units.map(u => [u.kind, u.ref]), [['commit', own], ['merge-edit', plain]], `carrying=${carrying}`);
			assert.deepEqual(set.paths, ['src/mine.ts', 'src/my-fold.ts'], `carrying=${carrying}`);
			assert.equal(set.perUnit, true, `carrying=${carrying}`);
			assert.equal(set.attribution, carrying ? 'story-trailer' : 'first-parent-range');
		} finally { cleanup(); }
	}
});

// ---------------------------------------------------------------------------
// ISSUE-b97752e9 t9: a pre-trailer Story's range ends at its recorded build commit.
// ---------------------------------------------------------------------------

/** Write the Story's BUILD record with `commit` as its body.commit. */
function recordEnd(r: string, storyKey: string, commit: string): void {
	const [epic, story] = storyKey.split('/');
	// The record is not committed: the fixture's `git add -A` must not pick it up.
	writeFileSync(join(r, '.git', 'info', 'exclude'), '.insrc/\n');
	mkdirSync(join(r, '.insrc', 'artifacts'), { recursive: true });
	writeFileSync(join(r, '.insrc', 'artifacts', `BUILD-${epic}-${story}.json`), JSON.stringify({ meta: { workflow: 'build', epicHash: epic, storyId: story, createdAt: '2026-10-18T00:00:00.000Z' }, body: { tasks: [], commit } }));
}

/** Capture the warnings story-commits logs while `fn` runs. */
function storyWarnings(fn: () => void): unknown[][] {
	const seen: unknown[][] = [];
	const l = getLogger('workflow:build:story-commits');
	const orig = l.warn.bind(l);
	(l as unknown as { warn: unknown }).warn = (...a: unknown[]) => { seen.push(a); return orig(...(a as [])); };
	try { fn(); } finally { (l as unknown as { warn: unknown }).warn = orig; }
	return seen;
}

test("a pre-trailer Story's range ends at its BUILD record's commit: a later untrailered commit is not its unit, and an end off the first-parent line is ignored", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		const a = commit(r, { 'src/a.ts': '1\n', 'src/shared.ts': 'mine\n' }, 'feat(build): S001/t1 untrailed');
		recordEnd(r, STORY, a.slice(0, 8));
		commit(r, { 'src/later.ts': '1\n', 'src/shared.ts': 'later\n' }, 'docs: someone else, later, untrailed');
		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.deepEqual(set.units.map(u => u.ref), [a]);
		assert.deepEqual(set.paths, ['src/a.ts', 'src/shared.ts']);
		assert.deepEqual(set.sharedWithExcluded, ['src/shared.ts'], 'the later commit also changed shared.ts');
		assert.equal(set.perUnit, true);
		assert.equal(set.attribution, 'first-parent-range');
		// Without a story key nothing is bounded.
		assert.deepEqual(storyChangeSet(r, base).paths, ['src/a.ts', 'src/later.ts', 'src/shared.ts']);

		// An end that is not on the first-parent line (here, the upstream branch) is ignored, with a warning.
		recordEnd(r, STORY, git(r, 'rev-parse', 'upstream').trim());
		let off: ReturnType<typeof storyChangeSet> | undefined;
		const warned = storyWarnings(() => { off = storyChangeSet(r, base, { storyKey: STORY }); });
		assert.deepEqual(off?.paths, ['src/a.ts', 'src/later.ts', 'src/shared.ts']);
		assert.ok(warned.some(w => String(w[1]).includes('not on the range')), 'the ignored end is warned about');
		// An end that does not resolve is ignored too.
		recordEnd(r, STORY, 'f'.repeat(40));
		assert.deepEqual(storyChangeSet(r, base, { storyKey: STORY }).paths, ['src/a.ts', 'src/later.ts', 'src/shared.ts']);
	} finally { cleanup(); }
});

test("the missing-trailer warning names only untrailered commits, never another Story's commit whose subject reads the same story id", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		commit(r, { 'src/mine.ts': '1\n' }, 'feat(build): S001/t1 mine', STORY);
		const theirs = commit(r, { 'src/theirs.ts': '1\n' }, 'feat(build): S001/t1 theirs', OTHER);
		const forgot = commit(r, { 'src/forgot.ts': '1\n' }, 'feat(build): S001/t2 mine, trailer forgotten');
		const warned = storyWarnings(() => { storyChangeSet(r, base, { storyKey: STORY }); });
		const named = warned.map(w => (w[0] as { commit?: string }).commit).filter(c => c !== undefined);
		assert.deepEqual(named, [forgot], `only the untrailered commit is named, not ${theirs}`);
	} finally { cleanup(); }
});

test("a pre-trailer Story whose recorded end equals its base (the trivial route's first record) has an empty set, even after someone else's untrailered commits", () => {
	const { repo: r, base, cleanup } = repo();
	try {
		recordEnd(r, STORY, base);
		commit(r, { 'src/x.ts': '1\n' }, 'docs: someone else, untrailed');
		commit(r, { 'src/y.ts': '1\n' }, 'chore: another, untrailed');
		const set = storyChangeSet(r, base, { storyKey: STORY });
		assert.deepEqual(set.units, []);
		assert.deepEqual(set.paths, []);
		assert.equal(set.perUnit, true);
	} finally { cleanup(); }
});
