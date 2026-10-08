/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * git_diff `paths` (ISSUE-f9ced66a, LLD-f9ced66a-s1, task t3), against a REAL
 * temporary repository so the pathspec semantics under test are git's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildDiffArgv, buildStatArgv, gitDiffTool } from '../diff.js';
import type { GitDiffData } from '../diff.js';
import type { ToolDeps } from '../../../types.js';

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(repo: string, rel: string, body: string): void {
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), body);
}

/** A repo with one base commit, then a second commit touching `files`. */
function repoWithChange(files: readonly string[]): { repo: string; base: string } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gitdiff-paths-'));
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

const changed = (data: unknown): string[] => (data as GitDiffData).files.map(f => f.path).sort();

test("git_diff limits the body and file list to the given paths, literally", async () => {
	const { repo, base } = repoWithChange(['src/a.ts', 'src/b.ts', 'src/[x].ts', 'src/y.ts', 'ledger/l.json']);
	try {
		const res = await gitDiffTool.execute({ cwd: repo, from: base, paths: ['src/a.ts', 'src/[x].ts'] }, deps(repo));
		assert.equal(res.success, true, res.output);
		// '[x]' is literal: it does not match src/y.ts or src/b.ts as a glob would.
		assert.deepEqual(changed(res.data), ['src/[x].ts', 'src/a.ts']);
		assert.match(res.output, /content of src\/a\.ts/);
		assert.match(res.output, /content of src\/\[x\]\.ts/);
		assert.doesNotMatch(res.output, /content of src\/b\.ts|content of src\/y\.ts|content of ledger/);

		// Combined with exclude, the exclusion still applies.
		const both = await gitDiffTool.execute({ cwd: repo, from: base, paths: ['src/a.ts', 'ledger/l.json'], exclude: ['ledger/**'] }, deps(repo));
		assert.equal(both.success, true, both.output);
		assert.deepEqual(changed(both.data), ['src/a.ts']);

		// Without paths the command lines are what they were.
		assert.deepEqual(buildDiffArgv({ from: base }).argv, ['git', 'diff', '--no-color', `${base}..HEAD`]);
		assert.deepEqual(buildStatArgv({ from: base, exclude: ['ledger/**'] }), ['git', 'diff', '--no-color', '--numstat', `${base}..HEAD`, '--', ':(top)', ':(top,exclude,glob)ledger/**']);
		assert.deepEqual(buildDiffArgv({ path: 'src' }).argv, ['git', 'diff', '--no-color', '--', 'src']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("git_diff rejects paths together with path and an empty paths array", async () => {
	const notARepo = mkdtempSync(join(tmpdir(), 'insrc-gitdiff-paths-bad-'));
	try {
		const bad: ReadonlyArray<Record<string, unknown>> = [
			{ paths: ['src/a.ts'], path: 'src' },
			{ paths: [] },
			{ paths: ['src/a.ts', ''] },
			{ paths: ['src/a.ts', 3] },
			{ paths: 'src/a.ts' },
		];
		for (const input of bad) {
			const res = await gitDiffTool.execute({ cwd: notARepo, ...input }, deps(notARepo));
			assert.equal(res.success, false, JSON.stringify(input));
			assert.equal(res.error, 'invalid-input', JSON.stringify(input));
			assert.match(res.output, /^\[git:diff\] invalid-input/);
		}
	} finally { rmSync(notARepo, { recursive: true, force: true }); }
});
