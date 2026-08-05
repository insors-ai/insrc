/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review s10 · T003 — `assembleDiffCodeReviewGrounding` (the diff-only,
 * degraded sc2 producer). Unit tests drive the assembler over a fake
 * `DiffGroundingDeps`; a gated integration test exercises the real `git_diff`
 * builtin last-commit fallback against a tiny throwaway repo.
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
	DiffUnavailableError,
	type DiffGroundingDeps,
	type DiffResult,
} from '../grounding.js';
import type { GitDiffFileStat } from '../../../daemon/tools/builtins/git/diff.js';

// ---- fixtures ----

const fileStat = (path: string, change = 'modified', ins = 1, del = 1): GitDiffFileStat => ({ path, change, insertions: ins, deletions: del });

/** A unified-diff body with one section per named file (matches the builtin's
 *  `git diff --no-color` shape closely enough for splitDiffByFile). */
function diffBody(...files: string[]): string {
	return files.map(f =>
		`diff --git a/${f} b/${f}\nindex 000..111 100644\n--- a/${f}\n+++ b/${f}\n@@ -1 +1 @@\n-old ${f}\n+new ${f}`,
	).join('\n');
}

/** Build a fake DiffGroundingDeps with scriptable working-tree / last-commit
 *  results, counting how often each seam is called. */
function fakeDeps(opts: {
	working?: DiffResult;
	lastCommit?: DiffResult;
	workingThrows?: Error;
	lastCommitThrows?: Error;
}): { deps: DiffGroundingDeps; calls: { working: number; lastCommit: number } } {
	const calls = { working: 0, lastCommit: 0 };
	const deps: DiffGroundingDeps = {
		workingTreeDiff: async () => {
			calls.working += 1;
			if (opts.workingThrows) throw opts.workingThrows;
			return opts.working ?? { files: [], body: '', truncated: false };
		},
		lastCommitDiff: async () => {
			calls.lastCommit += 1;
			if (opts.lastCommitThrows) throw opts.lastCommitThrows;
			return opts.lastCommit ?? { files: [], body: '', truncated: false };
		},
	};
	return { deps, calls };
}

// ---- working tree non-empty ----

test('assembler: a non-empty working tree yields one pseudo-symbol per changed file (kind:file, name:file, hunks in signature) and does NOT call the HEAD^ seam', async () => {
	const { deps, calls } = fakeDeps({
		working: { files: [fileStat('src/a.ts'), fileStat('src/b.ts')], body: diffBody('src/a.ts', 'src/b.ts'), truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps);
	assert.deepEqual(changedFiles, ['src/a.ts', 'src/b.ts']);
	assert.equal(grounding.symbols.length, 2);
	const a = grounding.symbols[0]!;
	assert.equal(a.kind, 'file');
	assert.equal(a.name, 'src/a.ts');
	assert.equal(a.file, 'src/a.ts');
	assert.ok(a.signature.includes('+new src/a.ts'), 'the file hunks are carried in signature');
	assert.deepEqual([a.callers, a.callees, a.testsReaching], [[], [], []], 'no graph edges on the diff path');
	assert.equal(calls.lastCommit, 0, 'a non-empty working tree never falls back to HEAD^');
});

// ---- working tree empty -> HEAD^ fallback ----

test('assembler: an empty working tree falls back to the last-commit diff (ac2)', async () => {
	const { deps, calls } = fakeDeps({
		working: { files: [], body: '', truncated: false },
		lastCommit: { files: [fileStat('src/c.ts')], body: diffBody('src/c.ts'), truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps);
	assert.deepEqual(changedFiles, ['src/c.ts'], 'the last commit changed set is recovered');
	assert.equal(calls.working, 1);
	assert.equal(calls.lastCommit, 1, 'a clean tree falls back to the last commit');
	assert.ok(grounding.symbols[0]!.signature.includes('+new src/c.ts'));
});

// ---- binary file ----

test('assembler: a binary changed file yields a pseudo-symbol with a binary marker (no hunks), still present in changedFiles', async () => {
	const { deps } = fakeDeps({
		working: { files: [fileStat('assets/logo.png', 'binary', 0, 0)], body: '', truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps);
	assert.deepEqual(changedFiles, ['assets/logo.png']);
	assert.match(grounding.symbols[0]!.signature, /binary file changed/);
});

// ---- both empty ----

test('assembler: both the working tree and the last commit empty => a valid grounding with symbols:[] (no crash)', async () => {
	const { deps } = fakeDeps({
		working: { files: [], body: '', truncated: false },
		lastCommit: { files: [], body: '', truncated: false },
	});
	const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding('/repo', deps);
	assert.deepEqual(grounding.symbols, []);
	assert.deepEqual(changedFiles, []);
});

// ---- truncated ----

test('assembler: a truncated diff still yields a valid grounding (bounded hunks + a truncation note, review proceeds)', async () => {
	const { deps } = fakeDeps({
		working: { files: [fileStat('src/big.ts')], body: diffBody('src/big.ts'), truncated: true },
	});
	const { grounding } = await assembleDiffCodeReviewGrounding('/repo', deps);
	assert.equal(grounding.symbols.length, 1, 'a bounded slice is still reviewable, not an error');
	assert.match(grounding.symbols[0]!.signature, /diff truncated/);
});

// ---- both paths fail => propagate ----

test('assembler: a working-tree git failure propagates (DiffUnavailableError)', async () => {
	const { deps } = fakeDeps({ workingThrows: new DiffUnavailableError('not a git repo') });
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', deps), DiffUnavailableError);
});

test('assembler: a clean tree whose last-commit diff also fails propagates (both paths unavailable)', async () => {
	const { deps } = fakeDeps({
		working: { files: [], body: '', truncated: false },
		lastCommitThrows: new DiffUnavailableError('git errored'),
	});
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', deps), DiffUnavailableError);
});

// ---- integration: the real git_diff last-commit fallback over a throwaway repo ----

test('assembler (integration): a clean-working-tree repo recovers the last commit via the real git_diff HEAD^ fallback — read-only', async () => {
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
		writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 2;\n');
		run('add', '-A'); run('commit', '-q', '-m', 'c2');   // two commits => HEAD^..HEAD resolves

		const logBefore = execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: repo }).toString().trim();

		// working tree is clean => the assembler falls back to the last commit (HEAD^..HEAD).
		const { grounding, changedFiles } = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps());
		assert.deepEqual(changedFiles, ['src/a.ts'], 'the last commit changed file is recovered from a clean tree');
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
