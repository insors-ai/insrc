/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * git_diff `exclude` (ISSUE-5f7a7cb9 S001/t1).
 *
 * The exclusion is applied by git, so these run against a REAL temporary
 * repository: the glob semantics under test are git's, and a re-implementation
 * in the test would only prove the test agrees with itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildDiffArgv, buildStatArgv, gitDiffTool, setGitDiffShellForTests } from '../diff.js';
import type { GitDiffData } from '../diff.js';
import type { ToolDeps } from '../../../types.js';
import { runShell } from '../../../shell-helper.js';

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(repo: string, rel: string, body: string): void {
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), body);
}

/** A repo with one base commit, then a second commit touching `files`. */
function repoWithChange(files: readonly string[]): { repo: string; base: string } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gitdiff-'));
	git(repo, 'init', '-q');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 't');
	git(repo, 'config', 'commit.gpgsign', 'false');
	write(repo, 'README.md', 'base\n');
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'base');
	const base = git(repo, 'rev-parse', 'HEAD').trim();
	for (const f of files) write(repo, f, `content of ${f}\n`);
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', 'change');
	return { repo, base };
}

function deps(repo: string): ToolDeps {
	return { sessionId: 'test', repoPath: repo, send: () => {}, requestId: 0 };
}

const paths = (data: unknown): string[] => (data as GitDiffData).files.map(f => f.path).sort();

test('T22: exclude removes a file from BOTH the diff body and the file list; a kept file stays in both', async () => {
	const { repo, base } = repoWithChange(['src/a.ts', 'ledger/x.json']);
	try {
		const res = await gitDiffTool.execute({ cwd: repo, from: base, exclude: ['ledger/**'] }, deps(repo));
		assert.equal(res.success, true, res.error);
		assert.deepEqual(paths(res.data), ['src/a.ts']);
		assert.ok(res.output.includes('content of src/a.ts'), 'the kept file\'s hunk must be in the body');
		assert.ok(!res.output.includes('content of ledger/x.json'), 'the excluded file\'s hunk must not be in the body');

		// Control: without the exclusion both are there, so the assertions above
		// are about the exclusion and not about the fixture.
		const all = await gitDiffTool.execute({ cwd: repo, from: base }, deps(repo));
		assert.deepEqual(paths(all.data), ['ledger/x.json', 'src/a.ts']);
		assert.ok(all.output.includes('content of ledger/x.json'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T22: an excluded file does not count against maxBytes', async () => {
	const { repo, base } = repoWithChange(['src/a.ts']);
	try {
		// Sorts BEFORE src/, and alone exceeds the 1024-byte floor of maxBytes.
		write(repo, 'ledger/big.json', 'x'.repeat(8000) + '\n');
		git(repo, 'add', '-A');
		git(repo, 'commit', '-q', '-m', 'big');

		// Fixture precondition: under the cap the source hunk is lost. Asserted on
		// the body rather than on `truncated`, because the shell helper drops any
		// chunk that would cross the cap, so an over-cap diff can come back SHORTER
		// than the cap and report truncated=false.
		const capped = await gitDiffTool.execute({ cwd: repo, from: base, maxBytes: 1024 }, deps(repo));
		assert.equal(capped.success, true, capped.error);
		assert.ok(!capped.output.includes('content of src/a.ts'), 'fixture precondition: the ledger hunk costs the source hunk its place under the cap');
		assert.deepEqual(paths(capped.data), ['ledger/big.json', 'src/a.ts'], 'fixture precondition: both files are in the range');

		const res = await gitDiffTool.execute({ cwd: repo, from: base, maxBytes: 1024, exclude: ['ledger/**'] }, deps(repo));
		assert.equal(res.success, true, res.error);
		assert.ok(res.output.includes('content of src/a.ts'), 'with the ledger excluded inside git the source hunk fits');
		assert.deepEqual(paths(res.data), ['src/a.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T23: with no exclude, and with an empty one, both argument vectors are exactly today\'s (numstat reads -z since ISSUE-b97752e9)', () => {
	for (const exclude of [undefined, [] as string[]]) {
		const extra = exclude === undefined ? {} : { exclude };
		assert.deepEqual(buildDiffArgv({ staged: false, ...extra }).argv, ['git', 'diff', '--no-color']);
		assert.deepEqual(buildStatArgv({ staged: false, ...extra }), ['git', 'diff', '--no-color', '--numstat', '-z']);
		assert.deepEqual(buildDiffArgv({ staged: true, ...extra }).argv, ['git', 'diff', '--no-color', '--cached']);
		assert.deepEqual(buildDiffArgv({ from: 'abc', ...extra }).argv, ['git', 'diff', '--no-color', 'abc..HEAD']);
		assert.deepEqual(buildDiffArgv({ from: 'abc', path: 'src', ...extra }).argv, ['git', 'diff', '--no-color', 'abc..HEAD', '--', 'src']);
		assert.deepEqual(buildStatArgv({ from: 'abc', path: 'src', ...extra }), ['git', 'diff', '--no-color', '--numstat', '-z', 'abc..HEAD', '--', 'src']);
	}
});

test('T23: the body and the numstat command receive the SAME pathspecs', () => {
	const o = { from: 'abc', exclude: ['a/*.json', 'b/**'] };
	const tail = ['--', ':(top)', ':(top,exclude,glob)a/*.json', ':(top,exclude,glob)b/**'];
	assert.deepEqual(buildDiffArgv(o).argv.slice(-tail.length), tail);
	assert.deepEqual(buildStatArgv(o).slice(-tail.length), tail);
});

test('T24: path stays the positive pathspec when exclude is given, and the exclusions narrow it', async () => {
	assert.deepEqual(
		buildDiffArgv({ from: 'abc', path: 'src', exclude: ['src/gen/**'] }).argv.slice(-3),
		['--', 'src', ':(top,exclude,glob)src/gen/**'],
	);
	const { repo, base } = repoWithChange(['src/a.ts', 'src/gen/b.ts', 'other/c.ts']);
	try {
		const res = await gitDiffTool.execute({ cwd: repo, from: base, path: 'src', exclude: ['src/gen/**'] }, deps(repo));
		assert.equal(res.success, true, res.error);
		assert.deepEqual(paths(res.data), ['src/a.ts'], 'other/ is outside the path; src/gen/ is excluded');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T25: a malformed exclude is invalid-input and git is not run', async () => {
	// A cwd that is not a repository: if git ran, the failure would be git's
	// ("not a git repository"), not invalid-input.
	const notARepo = mkdtempSync(join(tmpdir(), 'insrc-gitdiff-norepo-'));
	try {
		for (const bad of ['ledger/**', [''], ['ok', 7], { 0: 'x' }, null]) {
			const res = await gitDiffTool.execute({ cwd: notARepo, exclude: bad as unknown as string[] }, deps(notARepo));
			assert.equal(res.success, false, `exclude=${JSON.stringify(bad)} must be rejected`);
			assert.equal(res.error, 'invalid-input', `exclude=${JSON.stringify(bad)} must fail as invalid-input, got ${res.error}`);
		}
	} finally { rmSync(notARepo, { recursive: true, force: true }); }
});

test('T25: the closed input schema declares exclude as an array of non-empty strings', () => {
	const schema = gitDiffTool.inputSchema as { additionalProperties?: boolean; properties: Record<string, { type?: string; items?: { type?: string; minLength?: number } }> };
	assert.equal(schema.additionalProperties, false, 'the schema is closed, so an undeclared input would be rejected upstream');
	assert.equal(schema.properties['exclude']?.type, 'array');
	assert.equal(schema.properties['exclude']?.items?.type, 'string');
	assert.equal(schema.properties['exclude']?.items?.minLength, 1);
});

test('when the diff body command succeeds and the numstat command fails, git_diff returns success: false naming the stat failure', async () => {
	const { repo, base } = repoWithChange(['src/a.ts']);
	// The real body command runs; the numstat command fails as git would.
	setGitDiffShellForTests((argv, opts) => argv.includes('--numstat')
		? Promise.resolve({ stdout: '', stderr: 'fatal: numstat read failed', code: 128, spawnError: false, timedOut: false, stdoutTruncated: false })
		: runShell(argv, opts));
	try {
		const res = await gitDiffTool.execute({ cwd: repo, from: base }, deps(repo));
		assert.equal(res.success, false);
		assert.ok(res.error?.includes('numstat failed'), `the error names the stat read: ${res.error}`);
		assert.ok(res.error?.includes('fatal: numstat read failed'), `the error carries git's message: ${res.error}`);
	} finally {
		setGitDiffShellForTests();
		rmSync(repo, { recursive: true, force: true });
	}
});


// ---------------------------------------------------------------------------
// ISSUE-b97752e9 t11: literal paths and complete inventories.
// ---------------------------------------------------------------------------

test('a renamed file is reported by its literal new path and old path, including a compact rename inside a shared directory and a path with spaces', async () => {
	const { repo } = repoWithChange(['src/seed.ts']);
	try {
		const body = Array.from({ length: 20 }, (_, i) => `export const line${i} = ${i};`).join('\n') + '\n';
		write(repo, 'src/workflow/code-review/__tests__/pack.test.ts', body);
		write(repo, 'docs/my old notes.md', body);
		git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'files to rename');
		const base = git(repo, 'rev-parse', 'HEAD').trim();
		mkdirSync(join(repo, 'src/workflow/review-pipeline/__tests__'), { recursive: true });
		git(repo, 'mv', 'src/workflow/code-review/__tests__/pack.test.ts', 'src/workflow/review-pipeline/__tests__/pack.test.ts');
		git(repo, 'mv', 'docs/my old notes.md', 'docs/my new => notes.md');
		git(repo, 'commit', '-q', '-m', 'renames');
		// Precondition: git's own display of the first rename is the compact form.
		assert.match(git(repo, 'diff', '--numstat', base, 'HEAD'), /src\/workflow\/\{code-review => review-pipeline\}\/__tests__\/pack\.test\.ts/);

		const res = await gitDiffTool.execute({ cwd: repo, from: base }, deps(repo));
		assert.equal(res.success, true, res.error);
		const files = (res.data as GitDiffData).files.map(f => [f.path, f.origPath, f.change]).sort();
		assert.deepEqual(files, [
			['docs/my new => notes.md', 'docs/my old notes.md', 'renamed'],
			['src/workflow/review-pipeline/__tests__/pack.test.ts', 'src/workflow/code-review/__tests__/pack.test.ts', 'renamed'],
		]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a body whose capture dropped output is marked truncated even when the captured text is under the cap, and a numstat read that was truncated or ends mid-record fails the call', async () => {
	const { repo, base } = repoWithChange(['src/a.ts']);
	const run = async (fake: (argv: readonly string[]) => Awaited<ReturnType<typeof runShell>> | undefined) => {
		setGitDiffShellForTests((argv, opts) => { const f = fake(argv); return f !== undefined ? Promise.resolve(f) : runShell(argv, opts); });
		try { return await gitDiffTool.execute({ cwd: repo, from: base }, deps(repo)); } finally { setGitDiffShellForTests(); }
	};
	const ok = { stderr: '', code: 0, spawnError: false, timedOut: false };
	try {
		// The body: a short capture whose shell flag says output was dropped.
		const body = await run(argv => argv.includes('--numstat') ? undefined : { ...ok, stdout: 'diff --git a/src/a.ts b/src/a.ts\n+x\n', stdoutTruncated: true });
		assert.equal(body.success, true, body.error);
		assert.equal((body.data as GitDiffData).truncated, true);

		// The file list cut by the capture limit.
		const cut = await run(argv => argv.includes('--numstat') ? { ...ok, stdout: '1\t0\tsrc/a.ts\0', stdoutTruncated: true } : undefined);
		assert.equal(cut.success, false);
		assert.match(cut.error ?? '', /numstat incomplete: its output passed the capture limit/);

		// The file list ending mid-record: a rename header with only its old path.
		const partial = await run(argv => argv.includes('--numstat') ? { ...ok, stdout: '1\t0\tsrc/a.ts\0' + '2\t1\t\0src/old.ts\0', stdoutTruncated: false } : undefined);
		assert.equal(partial.success, false);
		assert.match(partial.error ?? '', /numstat incomplete: its output ends mid-record/);
		const unterminated = await run(argv => argv.includes('--numstat') ? { ...ok, stdout: '1\t0\tsrc/a.ts', stdoutTruncated: false } : undefined);
		assert.equal(unterminated.success, false);

		// Untouched, the real read succeeds and is not truncated.
		const real = await gitDiffTool.execute({ cwd: repo, from: base }, deps(repo));
		assert.equal(real.success, true);
		assert.equal((real.data as GitDiffData).truncated, false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
