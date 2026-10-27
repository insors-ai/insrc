/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review s10 · T003 — `assembleDiffCodeReviewGrounding` (the diff-only,
 * degraded sc2 producer). Unit tests drive the assembler over a fake
 * `DiffGroundingDeps`; gated integration tests run the real `git_diff` builtin
 * against throwaway repos. Since ISSUE-b97752e9 the Story's range is the anchor:
 * no base means no diff-only review, never the working tree or the last commit.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	assembleDiffCodeReviewGrounding,
	realDiffGroundingDeps,
	splitDiffByFile,
	storyRangeDiff,
	DiffUnavailableError,
	type DiffGroundingDeps,
	type DiffResult,
} from '../grounding.js';
import type { GitDiffFileStat } from '../../../daemon/tools/builtins/git/diff.js';
import { storyChangeSet, type StoryChangeSet } from '../../runners/build/story-commits.js';

// ---- fixtures ----

const fileStat = (path: string, change = 'modified', ins = 1, del = 1): GitDiffFileStat => ({ path, change, insertions: ins, deletions: del });

/** A unified-diff body with one section per named file (matches the builtin's
 *  `git diff --no-color` shape closely enough for splitDiffByFile). */
function diffBody(...files: string[]): string {
	return files.map(f =>
		`diff --git a/${f} b/${f}\nindex 000..111 100644\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-old ${f}\n+new ${f}`,
	).join('\n');
}

/** Fake DiffGroundingDeps: a scriptable Story range and working tree, counting
 *  how often each seam is called. Every assembler call below passes a base. */
function fakeDeps(opts: {
	range?: DiffResult;
	working?: DiffResult;
	rangeThrows?: Error;
	workingThrows?: Error;
}): { deps: DiffGroundingDeps; calls: { range: number; working: number } } {
	const calls = { range: 0, working: 0 };
	const deps: DiffGroundingDeps = {
		workingTreeDiff: async () => {
			calls.working += 1;
			if (opts.workingThrows) throw opts.workingThrows;
			return opts.working ?? { files: [], body: '', truncated: false };
		},
		rangeDiff: async () => {
			calls.range += 1;
			if (opts.rangeThrows) throw opts.rangeThrows;
			return opts.range ?? { files: [], body: '', truncated: false };
		},
	};
	return { deps, calls };
}

const BASE = { base: 'abc' };

// ---- the Story's range ----

test('assembler: the Story range yields one pseudo-symbol per changed file (kind:file, name:file, hunks in signature)', async () => {
	const { deps, calls } = fakeDeps({
		range: { files: [fileStat('src/a.ts'), fileStat('src/b.ts')], body: diffBody('src/a.ts', 'src/b.ts'), truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps, BASE);
	assert.deepEqual(changedFiles, ['src/a.ts', 'src/b.ts']);
	assert.equal(grounding.symbols.length, 2);
	const a = grounding.symbols[0]!;
	assert.equal(a.kind, 'file');
	assert.equal(a.name, 'src/a.ts');
	assert.equal(a.file, 'src/a.ts');
	assert.ok(a.signature.includes('+new src/a.ts'), 'the file hunks are carried in signature');
	assert.deepEqual([a.callers, a.callees, a.testsReaching], [[], [], []], 'no graph edges on the diff path');
	assert.deepEqual(calls, { range: 1, working: 1 }, 'the range, then the working tree, once each');
});

test('assembler: with no base the diff-only review is unavailable and no seam is called (ISSUE-b97752e9)', async () => {
	const { deps, calls } = fakeDeps({ working: { files: [fileStat('src/c.ts')], body: diffBody('src/c.ts'), truncated: false } });
	for (const opts of [undefined, {}, { base: '' }, { excludeGlobs: ['x/**'] }]) {
		await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', deps, opts), DiffUnavailableError, `opts=${JSON.stringify(opts)}`);
	}
	assert.deepEqual(calls, { range: 0, working: 0 }, 'never the working tree, never a last commit');
});

// ---- binary file ----

test('assembler: a binary changed file yields a pseudo-symbol with a binary marker (no hunks), still present in changedFiles', async () => {
	const { deps } = fakeDeps({
		range: { files: [fileStat('assets/logo.png', 'binary', 0, 0)], body: '', truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps, BASE);
	assert.deepEqual(changedFiles, ['assets/logo.png']);
	assert.match(grounding.symbols[0]!.signature, /binary file changed/);
});

// ---- both empty ----

test('assembler: an empty range and a clean tree => a valid grounding with symbols:[] (no crash)', async () => {
	const { deps } = fakeDeps({});
	const res = await assembleDiffCodeReviewGrounding('/repo', deps, BASE);
	assert.deepEqual(res.grounding.symbols, []);
	assert.deepEqual(res.changedFiles, []);
	assert.equal(res.excludedFromScope, undefined, 'absent when nothing was left out');
});

// ---- truncated ----

test('DIFF-READER: unrecoverable truncated input refuses before any grounding is returned', async () => {
	const { deps } = fakeDeps({ range: { files: [fileStat('src/big.ts')], body: diffBody('src/big.ts'), truncated: true } });
	await assert.rejects(assembleDiffCodeReviewGrounding('/repo', deps, BASE), /Incomplete diff capture/);
});

test('DIFF-READER: missing textual hunks refuse instead of producing a reviewed placeholder', async () => {
	const { deps } = fakeDeps({ range: { files: [fileStat('src/missing.ts')], body: '', truncated: false } });
	await assert.rejects(assembleDiffCodeReviewGrounding('/repo', deps, BASE), /Missing complete diff evidence.*src\/missing.ts/);
});

// ---- git failures propagate ----

test('assembler: a working-tree git failure propagates (DiffUnavailableError)', async () => {
	const { deps } = fakeDeps({ workingThrows: new DiffUnavailableError('not a git repo') });
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', deps, BASE), DiffUnavailableError);
});

test('assembler: a range git failure propagates at once — no step-down to the working tree or a last commit', async () => {
	const { deps, calls } = fakeDeps({
		rangeThrows: new DiffUnavailableError('unknown revision abc'),
		working: { files: [fileStat('src/wip.ts')], body: diffBody('src/wip.ts'), truncated: false },
	});
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', deps, BASE), DiffUnavailableError);
	assert.deepEqual(calls, { range: 1, working: 0 });
});

// ---- integration: no base, real git ----

test('assembler (integration): a real repo with no base is refused, and the assembler is read-only', async () => {
	let git = true;
	try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { git = false; }
	if (!git) { return; }   // gated: skip cleanly where git is unavailable

	const repo = mkdtempSync(join(tmpdir(), 'cr-diff-int-'));
	const run = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	try {
		run('init', '-q');
		run('config', 'user.email', 't@t');
		run('config', 'user.name', 'T');
		mkdirSync(join(repo, 'src'), { recursive: true });
		writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'c1');
		const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim();
		writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'c2');

		const logBefore = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo }).toString().trim();
		await assert.rejects(() => assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps()), DiffUnavailableError,
			'the last commit is no longer reviewed in place of the Story');
		const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { base });
		assert.deepEqual(changedFiles, ['src/a.ts']);
		assert.ok(grounding.symbols[0]!.signature.includes('+export const a = 2;'), 'the real hunks are carried');

		// read-only: the assembler committed/reindexed nothing.
		const logAfter = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo }).toString().trim();
		assert.equal(logAfter, logBefore, 'the assembler is read-only — no new commits');
		const status = execFileSync('git', ['status', '--porcelain'], { cwd: repo }).toString().trim();
		assert.equal(status, '', 'the working tree is still clean (nothing mutated)');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 S001/t7, revised by ISSUE-b97752e9 — the degraded review's
// base and exclusions. There is no fallback: the Story's range is the anchor.
// ---------------------------------------------------------------------------

type Call = readonly [seam: string, ...args: unknown[]];

/** Seams that record every call WITH its arguments and can be scripted to throw. */
function recordingDeps(script: {
	working?: (globs: readonly string[] | undefined) => DiffResult;
	range?: (base: string, globs: readonly string[] | undefined) => DiffResult;
	withRange?: boolean;
} = {}): { deps: DiffGroundingDeps; calls: Call[] } {
	const calls: Call[] = [];
	const empty: DiffResult = { files: [], body: '', truncated: false };
	const deps: DiffGroundingDeps = {
		workingTreeDiff: async (...a: unknown[]) => { calls.push(['working', ...a]); return script.working?.(a[1] as readonly string[] | undefined) ?? empty; },
		...(script.withRange !== false
			? { rangeDiff: async (...a: unknown[]) => { calls.push(['range', ...a]); return script.range?.(a[1] as string, a[2] as readonly string[] | undefined) ?? empty; } }
			: {}),
	};
	return { deps, calls };
}

const one = (path: string): DiffResult => ({ files: [fileStat(path)], body: diffBody(path), truncated: false });
const GLOBS = ['.insrc/artifacts/*.json', 'docs/standalone/**'];

test('a base and no globs: the range then the working tree, with no excludeGlobs argument', async () => {
	const r = recordingDeps({ range: () => one('src/a.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc' });
	assert.deepEqual(r.calls, [['range', '/repo', 'abc'], ['working', '/repo']]);
	assert.deepEqual(res.changedFiles, ['src/a.ts']);
	for (const opts of [{ base: 'abc', excludeGlobs: [] }, { base: 'abc', excludeGlobs: undefined }]) {
		const e = recordingDeps();
		await assembleDiffCodeReviewGrounding('/repo', e.deps, opts);
		assert.deepEqual(e.calls, [['range', '/repo', 'abc'], ['working', '/repo']], `opts=${JSON.stringify(opts)}`);
	}
});

test('a base and globs: the RANGE is read first, then the working tree, both with the globs', async () => {
	const r = recordingDeps({ range: () => one('src/story.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(r.calls, [['range', '/repo', 'abc', GLOBS], ['working', '/repo', GLOBS]]);
	assert.deepEqual(res.changedFiles, ['src/story.ts']);
});

test("a dirty working tree: a Story file's uncommitted hunks join its committed ones; an unrelated file is left out and listed in excludedFromScope", async () => {
	const r = recordingDeps({
		range: () => ({ files: [fileStat('src/story.ts')], body: diffBody('src/story.ts'), truncated: false, storyPaths: ['src/story.ts'] }),
		working: () => ({ files: [fileStat('src/story.ts'), fileStat('src/wip.ts')], body: diffBody('src/wip.ts', 'src/story.ts'), truncated: false }),
	});
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(res.changedFiles, ['src/story.ts']);
	assert.deepEqual(res.excludedFromScope, ['src/wip.ts']);
	const sig = sigOf(res, 'src/story.ts');
	assert.equal(sig.split('diff --git a/src/story.ts').length - 1, 2, 'the committed section and the uncommitted one');
	assert.match(sig, /\[uncommitted change\]\ndiff --git a\/src\/story\.ts/);
	assert.doesNotMatch(sig, /src\/wip\.ts/);
});

test('T45: a base whose range is EMPTY after exclusion gives an empty result, and an uncommitted file is only reported', async () => {
	const r = recordingDeps({ working: () => one('src/someone-else.ts') });   // range returns empty
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(res.changedFiles, [], 'a Story that changed only ledger files has nothing to review');
	assert.deepEqual(res.grounding.symbols, []);
	assert.deepEqual(res.excludedFromScope, ['src/someone-else.ts']);
});

test('seams without rangeDiff cannot anchor the Story: DiffUnavailableError, and the working tree is not read', async () => {
	const r = recordingDeps({ withRange: false, working: () => one('src/a.ts') });
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }), DiffUnavailableError);
	assert.deepEqual(r.calls, []);
});

test('an error that is not a diff failure propagates at once', async () => {
	const r = recordingDeps({ range: () => { throw new TypeError('a bug'); } });
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }), (e: unknown) => e instanceof TypeError);
	assert.equal(r.calls.length, 1);
});

test('T44 (integration, real git): DIFF-READER: real git recovers full file evidence after an aggregate cap and preserves exclusions', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'cr-diff-cap-'));
	const run = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	const put = (rel: string, body: string): void => { mkdirSync(join(repo, rel, '..'), { recursive: true }); writeFileSync(join(repo, rel), body); };
	try {
		run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 'T'); run('config', 'commit.gpgsign', 'false');
		put('README.md', 'base\n');
		run('add', '-A'); run('commit', '-q', '-m', 'base');
		const base = run('rev-parse', 'HEAD');

		// > 256 KB of ledger text. `.insrc/` and `docs/` both sort before `src/`.
		const big = Array.from({ length: 6000 }, (_, i) => `"line-${i}": "${'x'.repeat(40)}",`).join('\n') + '\n';
		assert.ok(big.length > 256 * 1024, 'fixture precondition: the ledger file alone exceeds the default cap');
		put('.insrc/artifacts/LLD-x-S001.json', big);
		put('docs/standalone/x-E1/S001/LLD.md', big);
		put('src/a.ts', 'export const a = 1;\n');
		put('src/b.ts', 'export const b = 2;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'the Story, with its ledger files');
		// A second commit, so "the last commit" is NOT the Story's whole range.
		put('src/c.ts', 'export const c = 3;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'the Story, second commit');

		const globs = ['.insrc/artifacts/*.json', '.insrc/build-start/**', 'docs/epics/**', 'docs/standalone/**'];
		const withGlobs = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { base, excludeGlobs: globs });
		assert.deepEqual([...withGlobs.changedFiles].sort(), ['src/a.ts', 'src/b.ts', 'src/c.ts'], 'the whole Story range, and no ledger path');
		for (const s of withGlobs.grounding.symbols) {
			assert.ok(s.signature.includes(`diff --git a/${s.file}`), `${s.file} must carry its own hunks, got: ${s.signature.slice(0, 80)}`);
			assert.ok(!s.signature.includes('[no hunk text'), `${s.file} must not be a placeholder`);
		}

		// The same range WITHOUT the exclusion: the ledger hunks take the cap and
		// the source files are left with placeholders. This is what makes the
		// assertions above capable of failing.
		const without = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { base });
		assert.ok(without.changedFiles.includes('.insrc/artifacts/LLD-x-S001.json'), 'fixture precondition: unexcluded, the ledger file is in the reviewed set');
		const srcA = without.grounding.symbols.find(s => s.file === 'src/a.ts');
		assert.ok(srcA !== undefined);
		assert.ok(srcA.signature.includes('diff --git a/src/a.ts'), 'the review reader recovers the file after the aggregate capture cap');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('integration, real git: with no base and a clean tree nothing is reviewed in the Story\'s place', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'cr-diff-nobase-'));
	const run = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	try {
		run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 'T'); run('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'README.md'), 'base\n');
		run('add', '-A'); run('commit', '-q', '-m', 'base');
		mkdirSync(join(repo, 'src'), { recursive: true });
		writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'somebody\'s last commit');
		await assert.rejects(() => assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { excludeGlobs: ['.insrc/artifacts/*.json'] }), DiffUnavailableError);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// ISSUE-f9ced66a (LLD-f9ced66a-s1, task t6): the range diff carries only the
// Story's own hunks, whatever a mid-build merge brought in.
// ---------------------------------------------------------------------------

/** A real repo on `main`: a base, and an `upstream` branch from it. */
function mergeRepo(): { repo: string; base: string; git: (...a: string[]) => string; put: (rel: string, body: string) => void; commit: (msg: string) => void; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'cr-diff-story-'));
	const git = (...args: string[]): string => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	const put = (rel: string, body: string): void => { mkdirSync(join(repo, rel, '..'), { recursive: true }); writeFileSync(join(repo, rel), body); };
	const commit = (msg: string): void => { git('add', '-A'); git('commit', '-q', '-m', msg); };
	git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 'T'); git('config', 'commit.gpgsign', 'false');
	put('README.md', 'base\n');
	put('shared.txt', ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9'].join('\n') + '\n');
	commit('base');
	const base = git('rev-parse', 'HEAD');
	git('checkout', '-q', '-b', 'upstream');
	put('up/merged.ts', 'export const merged = "UPSTREAM-FILE";\n');
	put('shared.txt', ['UPSTREAM-LINE', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9'].join('\n') + '\n');
	commit('upstream work');
	git('checkout', '-q', 'main');
	return { repo, base, git, put, commit, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const sigOf = (res: { grounding: { symbols: readonly { file: string; signature: string }[] } }, file: string): string => {
	const s = res.grounding.symbols.find(x => x.file === file);
	assert.ok(s !== undefined, `${file} is in the grounding`);
	return s.signature;
};

test('the range diff carries full hunks for the Story files and none for merged-in files', async () => {
	const r = mergeRepo();
	try {
		r.put('src/story1.ts', 'export const s1 = "STORY-ONE";\n'); r.commit('story 1');
		r.git('merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');
		r.put('src/story2.ts', 'export const s2 = "STORY-TWO";\n'); r.commit('story 2');

		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base });
		assert.deepEqual([...res.changedFiles].sort(), ['src/story1.ts', 'src/story2.ts']);
		assert.match(sigOf(res, 'src/story1.ts'), /\+export const s1 = "STORY-ONE";/);
		assert.match(sigOf(res, 'src/story2.ts'), /\+export const s2 = "STORY-TWO";/);
		for (const s of res.grounding.symbols) assert.doesNotMatch(s.signature, /UPSTREAM/);
	} finally { r.cleanup(); }
});

test("a file changed by both a Story commit and the merge carries only the Story's own hunks", async () => {
	const r = mergeRepo();
	try {
		r.put('shared.txt', ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'STORY-LINE'].join('\n') + '\n'); r.commit('story edits shared');
		r.git('merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');

		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base });
		assert.deepEqual(res.changedFiles, ['shared.txt']);
		const sig = sigOf(res, 'shared.txt');
		assert.match(sig, /\+STORY-LINE/);
		assert.doesNotMatch(sig, /UPSTREAM-LINE/, 'the merged-in line does not reach the reviewer');
	} finally { r.cleanup(); }
});

test('edits folded into a merge commit are reviewed and marked', async () => {
	const r = mergeRepo();
	try {
		r.put('src/story1.ts', 'export const s1 = 1;\n'); r.commit('story 1');
		r.git('merge', '-q', '--no-ff', '--no-commit', 'upstream');
		r.put('src/folded.ts', 'export const folded = "INSIDE-MERGE";\n');
		r.commit('merge upstream, with a Story edit');
		const merge = r.git('rev-parse', 'HEAD');

		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base });
		assert.deepEqual([...res.changedFiles].sort(), ['src/folded.ts', 'src/story1.ts']);
		const sig = sigOf(res, 'src/folded.ts');
		assert.ok(sig.startsWith(`[edited inside merge commit ${merge.slice(0, 12)}]`), sig.slice(0, 80));
		assert.match(sig, /INSIDE-MERGE/);
		assert.doesNotMatch(sigOf(res, 'src/story1.ts'), /edited inside merge commit/);
	} finally { r.cleanup(); }
});

test('a range with no Story change gives an empty grounding without calling git_diff', async () => {
	const r = mergeRepo();
	try {
		r.git('merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');
		const set = storyChangeSet(r.repo, r.base);
		let calls = 0;
		const out = await storyRangeDiff(r.repo, r.base, set, undefined, async () => { calls++; return { files: [], body: '', truncated: false }; });
		assert.equal(calls, 0);
		assert.deepEqual(out.files, []);
		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base });
		assert.deepEqual(res.grounding.symbols, []);
	} finally { r.cleanup(); }
});

test("a shared path touched by two Story commits keeps both commits' hunks and a folded marker stays on its own file when it is not first", async () => {
	const r = mergeRepo();
	try {
		r.put('shared.txt', ['l1', 'l2', 'l3', 'l4', 'STORY-A', 'l6', 'l7', 'l8', 'l9'].join('\n') + '\n'); r.commit('story A');
		r.put('shared.txt', ['l1', 'l2', 'l3', 'l4', 'STORY-A', 'l6', 'l7', 'l8', 'STORY-B'].join('\n') + '\n'); r.commit('story B');
		r.git('merge', '-q', '--no-ff', '--no-commit', 'upstream');
		r.put('z-folded.ts', 'export const z = "FOLDED";\n');
		r.commit('merge upstream, with a Story edit');

		const res = await assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: r.base });
		assert.deepEqual([...res.changedFiles].sort(), ['shared.txt', 'z-folded.ts']);
		const shared = sigOf(res, 'shared.txt');
		assert.match(shared, /\+STORY-A/);
		assert.match(shared, /\+STORY-B/);
		assert.equal(shared.split('diff --git a/shared.txt').length - 1, 2, 'one section per Story commit, none overwritten');
		assert.doesNotMatch(shared, /UPSTREAM-LINE|edited inside merge commit/);
		assert.match(sigOf(res, 'z-folded.ts'), /^\[edited inside merge commit [0-9a-f]{12}\]\n/);
	} finally { r.cleanup(); }
});

test('without hunksByFile buildDiffSymbols splits the body as before', async () => {
	const { deps } = fakeDeps({ range: { files: [fileStat('src/a.ts'), fileStat('src/b.ts')], body: diffBody('src/a.ts', 'src/b.ts'), truncated: false } });
	const res = await assembleDiffCodeReviewGrounding('/repo', deps, BASE);
	assert.match(sigOf(res, 'src/a.ts'), /^diff --git a\/src\/a\.ts b\/src\/a\.ts/);
	assert.match(sigOf(res, 'src/b.ts'), /^diff --git a\/src\/b\.ts b\/src\/b\.ts/);
	// With hunksByFile, the map wins over the body.
	const withMap: DiffGroundingDeps = {
		workingTreeDiff: async () => ({ files: [], body: '', truncated: false }),
		rangeDiff:       async () => ({ files: [fileStat('src/a.ts')], body: diffBody('src/a.ts'), truncated: false, hunksByFile: new Map([['src/a.ts', diffBody('src/a.ts').replace('+new src/a.ts', '+FROM-THE-MAP')]]) }),
	};
	assert.match(sigOf(await assembleDiffCodeReviewGrounding('/repo', withMap, BASE), 'src/a.ts'), /\+FROM-THE-MAP/);
});

test('the range diff applies the exclusions to every per-unit call', async () => {
	const set: StoryChangeSet = {
		paths: ['plain.ts', 'shared.txt'],
		units: [
			{ kind: 'commit', ref: 'c1', from: 'p1', to: 'c1', paths: ['plain.ts', 'shared.txt'] },
			{ kind: 'commit', ref: 'c2', from: 'c1', to: 'c2', paths: ['shared.txt'] },
		],
		sharedPaths: ['shared.txt'],
		foldedPaths: [],
	};
	const inputs: Record<string, unknown>[] = [];
	await storyRangeDiff('/repo', 'base', set, ['ledger/**'], async (_r, input) => { inputs.push(input); return { files: [], body: '', truncated: false }; });
	assert.deepEqual(inputs, [
		{ from: 'base', paths: ['plain.ts'], exclude: ['ledger/**'] },
		{ from: 'p1', to: 'c1', paths: ['shared.txt'], exclude: ['ledger/**'] },
		{ from: 'c1', to: 'c2', paths: ['shared.txt'], exclude: ['ledger/**'] },
	]);
});

test('a truncated per-unit call marks the grounding truncated and a storyChangeSet failure makes the review unavailable', async () => {
	const set: StoryChangeSet = {
		paths: ['shared.txt'],
		units: [{ kind: 'commit', ref: 'c1', from: 'p1', to: 'c1', paths: ['shared.txt'] }],
		sharedPaths: ['shared.txt'], foldedPaths: [],
	};
	await assert.rejects(storyRangeDiff('/repo', 'base', set, undefined, async () => ({ files: [fileStat('shared.txt')], body: diffBody('shared.txt'), truncated: true })), /Incomplete diff capture/);

	// An unresolvable base: the real rangeDiff raises DiffUnavailableError, and
	// so does the assembler; nothing steps down to the last commit (ISSUE-b97752e9).
	const r = mergeRepo();
	try {
		r.put('src/story1.ts', 'export const s1 = 1;\n'); r.commit('story 1');
		await assert.rejects(realDiffGroundingDeps().rangeDiff!(r.repo, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'), DiffUnavailableError);
		await assert.rejects(() => assembleDiffCodeReviewGrounding(r.repo, realDiffGroundingDeps(), { base: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }), DiffUnavailableError);
	} finally { r.cleanup(); }
});

test('splitDiffByFile keys a quoted header by its decoded literal path: tab, newline, quote, backslash and octal UTF-8 escapes', () => {
	const section = (header: string, marker: string): string => `${header}\nindex 000..111 100644\n@@ -1 +1 @@\n-old\n+${marker}`;
	const body = [
		section('diff --git a/src/plain.ts b/src/plain.ts', 'PLAIN'),
		section('diff --git a/docs/with space.md b/docs/with space.md', 'SPACE'),
		section('diff --git "a/src/a\\tb.ts" "b/src/a\\tb.ts"', 'TAB'),
		section('diff --git "a/odd\\nname\\"q\\\\b.ts" "b/odd\\nname\\"q\\\\b.ts"', 'ESCAPES'),
		section('diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"', 'UTF8'),
		section('diff --git a/old/x.ts "b/new\\tdir/x.ts"', 'MIXED'),
	].join('\n');
	const map = splitDiffByFile(body);
	assert.deepEqual([...map.keys()], ['src/plain.ts', 'docs/with space.md', 'src/a\tb.ts', 'odd\nname"q\\b.ts', 'café.ts', 'new\tdir/x.ts']);
	for (const [path, marker] of [['src/a\tb.ts', 'TAB'], ['café.ts', 'UTF8'], ['new\tdir/x.ts', 'MIXED']] as const) {
		assert.ok(map.get(path)?.includes(`+${marker}`), `${JSON.stringify(path)} keeps its hunk`);
	}
});

test('DIFF-READER: a real file larger than the public tool hard cap is recovered through its final byte', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'cr-complete-large-'));
	const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	try {
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 'T'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'base.txt'), 'base\n'); git('add', '.'); git('commit', '-qm', 'base');
		const base = git('rev-parse', 'HEAD');
		const payload = `{"data":"${'x'.repeat(3 * 1024 * 1024)}","last":"COMPLETE-END"}\n`;
		writeFileSync(join(repo, 'large.json'), payload); git('add', 'large.json'); git('commit', '-qm', 'large evidence');
		const result = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { base });
		assert.deepEqual(result.changedFiles, ['large.json']);
		const signature = result.grounding.symbols.filter(s => s.file === 'large.json').map(s => s.signature).join('');
		assert.ok(signature.includes(`+${payload.trimEnd()}`), 'entire giant line, including its final marker, is retained');
		assert.ok(!signature.includes('truncated') && !signature.includes('[no hunk text'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('DIFF-READER: unflagged partial or header-only hunks cannot masquerade as complete evidence', async () => {
	for (const body of [
		'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts',
		'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old',
		diffBody('a.ts') + '\n+undeclared extra line',
	]) {
		const { deps } = fakeDeps({ range: { files: [fileStat('a.ts')], body, truncated: false } });
		await assert.rejects(assembleDiffCodeReviewGrounding('/repo', deps, BASE), /Incomplete unified hunks/);
	}
	const { deps } = fakeDeps({ range: { files: [fileStat('a.ts', 'modified', 2, 2)], body: diffBody('a.ts'), truncated: false } });
	await assert.rejects(assembleDiffCodeReviewGrounding('/repo', deps, BASE), /Incomplete unified hunks/, 'a whole omitted hunk cannot hide behind a complete first hunk');
});

test('DIFF-READER: a later complete unit cannot hide an earlier missing section for the same file', async () => {
	const set: StoryChangeSet = { paths: ['a.ts'], sharedPaths: ['a.ts'], foldedPaths: [], units: [
		{ kind: 'commit', ref: 'c1', from: 'p1', to: 'c1', paths: ['a.ts'] },
		{ kind: 'commit', ref: 'c2', from: 'c1', to: 'c2', paths: ['a.ts'] },
	] };
	let calls = 0;
	await assert.rejects(storyRangeDiff('/repo', 'base', set, undefined, async () => {
		calls++;
		return { files: [fileStat('a.ts')], body: calls === 1 ? '' : diffBody('a.ts'), truncated: false };
	}), /Missing complete diff evidence/);
	assert.equal(calls, 1, 'the first incomplete unit is refused before another can overwrite it');
});
