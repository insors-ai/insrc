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
import { getLogger } from '../../../shared/logger.js';

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

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 S001/t7 — the degraded review's base, exclusions and fallback.
// ---------------------------------------------------------------------------

type Call = readonly [seam: string, ...args: unknown[]];

/** Seams that record every call WITH its arguments (`args.length` is part of
 *  what "today's calls" means) and can be scripted to throw. */
function recordingDeps(script: {
	working?: (globs: readonly string[] | undefined) => DiffResult;
	range?: (base: string, globs: readonly string[] | undefined) => DiffResult;
	lastCommit?: (globs: readonly string[] | undefined) => DiffResult;
	withRange?: boolean;
} = {}): { deps: DiffGroundingDeps; calls: Call[] } {
	const calls: Call[] = [];
	const empty: DiffResult = { files: [], body: '', truncated: false };
	const deps: DiffGroundingDeps = {
		workingTreeDiff: async (...a: unknown[]) => { calls.push(['working', ...a]); return script.working?.(a[1] as readonly string[] | undefined) ?? empty; },
		lastCommitDiff:  async (...a: unknown[]) => { calls.push(['lastCommit', ...a]); return script.lastCommit?.(a[1] as readonly string[] | undefined) ?? empty; },
		...(script.withRange !== false
			? { rangeDiff: async (...a: unknown[]) => { calls.push(['range', ...a]); return script.range?.(a[1] as string, a[2] as readonly string[] | undefined) ?? empty; } }
			: {}),
	};
	return { deps, calls };
}

const one = (path: string): DiffResult => ({ files: [fileStat(path)], body: diffBody(path), truncated: false });
const GLOBS = ['.insrc/artifacts/*.json', 'docs/standalone/**'];

/** Capture the warnings the assembler logs while `fn` runs. */
async function groundingWarnings(fn: () => Promise<unknown>): Promise<unknown[][]> {
	const seen: unknown[][] = [];
	const l = getLogger('workflow:code-review:grounding');
	const orig = l.warn.bind(l);
	(l as unknown as { warn: unknown }).warn = (...a: unknown[]) => { seen.push(a); return orig(...(a as [])); };
	try { await fn(); } finally { (l as unknown as { warn: unknown }).warn = orig; }
	return seen;
}

test('T47: with NO opts the calls on the seams, including their argument counts, are exactly the old ones', async () => {
	const dirty = recordingDeps({ working: () => one('src/a.ts') });
	await assembleDiffCodeReviewGrounding('/repo', dirty.deps);
	assert.deepEqual(dirty.calls, [['working', '/repo']]);

	const clean = recordingDeps({ lastCommit: () => one('src/a.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', clean.deps);
	assert.deepEqual(clean.calls, [['working', '/repo'], ['lastCommit', '/repo']], 'one argument each, and the range seam is never touched');
	assert.deepEqual(res.changedFiles, ['src/a.ts']);

	// An empty opts object, and empty values, are the same as no opts.
	for (const opts of [{}, { base: '' }, { excludeGlobs: [] }, { base: undefined, excludeGlobs: undefined }]) {
		const r = recordingDeps();
		await assembleDiffCodeReviewGrounding('/repo', r.deps, opts);
		assert.deepEqual(r.calls, [['working', '/repo'], ['lastCommit', '/repo']], `opts=${JSON.stringify(opts)}`);
	}
});

test('a base and globs: the working tree is read with the globs; when it is clean the RANGE is read, with the base and the globs', async () => {
	const r = recordingDeps({ range: () => one('src/story.ts'), lastCommit: () => one('src/someone-else.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(r.calls, [['working', '/repo', GLOBS], ['range', '/repo', 'abc', GLOBS]]);
	assert.deepEqual(res.changedFiles, ['src/story.ts']);
});

test('a dirty working tree is reviewed as it is: neither the range nor the last commit is consulted', async () => {
	const r = recordingDeps({ working: () => one('src/wip.ts'), range: () => one('src/story.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(r.calls, [['working', '/repo', GLOBS]]);
	assert.deepEqual(res.changedFiles, ['src/wip.ts']);
});

test('T45: a base whose range is EMPTY after exclusion gives an empty result — the last-commit fallback is NOT used', async () => {
	const r = recordingDeps({ lastCommit: () => one('src/someone-else.ts') });   // range returns empty
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(res.changedFiles, [], 'a Story that changed only ledger files has nothing to review');
	assert.deepEqual(res.grounding.symbols, []);
	assert.ok(!r.calls.some(c => c[0] === 'lastCommit'), 'the last commit would be somebody else\'s work');
});

test('globs but NO base: the last-commit fallback runs, with the globs', async () => {
	const r = recordingDeps({ lastCommit: () => one('src/a.ts') });
	await assembleDiffCodeReviewGrounding('/repo', r.deps, { excludeGlobs: GLOBS });
	assert.deepEqual(r.calls, [['working', '/repo', GLOBS], ['lastCommit', '/repo', GLOBS]]);
});

test('seams written before rangeDiff existed: a base is ignored and the sequence is the globs-only one', async () => {
	const r = recordingDeps({ withRange: false, lastCommit: () => one('src/a.ts') });
	const res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS });
	assert.deepEqual(r.calls, [['working', '/repo', GLOBS], ['lastCommit', '/repo', GLOBS]]);
	assert.deepEqual(res.changedFiles, ['src/a.ts']);
});

test('T46: a failing RANGE diff retries the sequence without the base; one warning', async () => {
	const r = recordingDeps({
		range: () => { throw new DiffUnavailableError('unknown revision abc'); },
		lastCommit: () => one('src/a.ts'),
	});
	let res: Awaited<ReturnType<typeof assembleDiffCodeReviewGrounding>> | undefined;
	const warned = await groundingWarnings(async () => { res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }); });
	assert.deepEqual(r.calls, [
		['working', '/repo', GLOBS], ['range', '/repo', 'abc', GLOBS],
		['working', '/repo', GLOBS], ['lastCommit', '/repo', GLOBS],
	]);
	assert.deepEqual(res?.changedFiles, ['src/a.ts']);
	assert.equal(warned.length, 1);
});

test('T46: failing EXCLUSIONS step all the way down to the old sequence, called with no excludeGlobs argument; two warnings', async () => {
	const rejectGlobs = (g: readonly string[] | undefined): void => { if (g !== undefined) throw new DiffUnavailableError('this git rejects exclude pathspecs'); };
	const r = recordingDeps({
		working: g => { rejectGlobs(g); return { files: [], body: '', truncated: false }; },
		range: (_b, g) => { rejectGlobs(g); return one('src/never.ts'); },
		lastCommit: g => { rejectGlobs(g); return one('src/plain.ts'); },
	});
	let res: Awaited<ReturnType<typeof assembleDiffCodeReviewGrounding>> | undefined;
	const warned = await groundingWarnings(async () => { res = await assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }); });
	assert.deepEqual(r.calls, [
		['working', '/repo', GLOBS],            // base + exclusions: fails
		['working', '/repo', GLOBS],            // exclusions only: fails
		['working', '/repo'], ['lastCommit', '/repo'],   // the old sequence, one argument each
	]);
	assert.deepEqual(res?.changedFiles, ['src/plain.ts']);
	assert.equal(warned.length, 2);
});

test('T46: when the OLD sequence itself fails, DiffUnavailableError still leaves the function', async () => {
	const r = recordingDeps({ working: () => { throw new DiffUnavailableError('not a git repository'); } });
	await assert.rejects(
		() => assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }),
		(e: unknown) => e instanceof DiffUnavailableError,
	);
	assert.equal(r.calls.length, 3, 'all three attempts were made before giving up');
});

test('T46: an error that is not a diff failure propagates at once — the fallback does not swallow a bug', async () => {
	const r = recordingDeps({ working: () => { throw new TypeError('a bug'); } });
	await assert.rejects(() => assembleDiffCodeReviewGrounding('/repo', r.deps, { base: 'abc', excludeGlobs: GLOBS }), (e: unknown) => e instanceof TypeError);
	assert.equal(r.calls.length, 1);
});

test('T44 (integration, real git): ledger hunks larger than the diff cap that sort before src/ — with the exclusion every source file keeps its diff text; without it the text is lost', async () => {
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
		assert.ok(!srcA.signature.includes('diff --git a/src/a.ts'), 'fixture precondition: unexcluded, the source file has lost its diff text to the cap');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('integration, real git: with no base and a clean tree the last commit is reviewed, minus ledger files', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'cr-diff-nobase-'));
	const run = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	try {
		run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 'T'); run('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'README.md'), 'base\n');
		run('add', '-A'); run('commit', '-q', '-m', 'base');
		mkdirSync(join(repo, 'src'), { recursive: true }); mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
		writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
		writeFileSync(join(repo, '.insrc', 'artifacts', 'BUILD-x.json'), '{}\n');
		run('add', '-A'); run('commit', '-q', '-m', 'work and its record');
		const res = await assembleDiffCodeReviewGrounding(repo, realDiffGroundingDeps(), { excludeGlobs: ['.insrc/artifacts/*.json'] });
		assert.deepEqual(res.changedFiles, ['src/a.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
