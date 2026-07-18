/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the daemon VERIFIER (Story s3, t5): the injectable seam
 * that extracts the stated test command verbatim, runs it, and computes
 * `filesTouched` from the real git working-tree diff — the sole authority
 * for a reached outcome, computed with NO reference to any implementer
 * report. Uses real (but trivial) shell commands + a scratch git repo.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/verifier.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createGitTestVerifier, defaultResolveTestCommand, gitFilesTouched } from '../verifier.js';
import type { PlanTask } from '../../../artifacts/plan.js';

function planTask(overrides: Partial<PlanTask>): PlanTask {
	return {
		id: 't1', title: 'T', summary: 'S', size: 'M', order: 1,
		dependsOn: [], acceptanceChecks: ['ok'], derivedFrom: ['c1'],
		tests: [{ level: 'unit', name: 'exit 0' }],
		...overrides,
	};
}

function gitRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-verifier-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	return repo;
}

test('t5: extracts the stated command verbatim and passes when it exits 0', async () => {
	const repo = gitRepo();
	try {
		const v = createGitTestVerifier();
		const task = planTask({ tests: [{ level: 'unit', name: 'exit 0' }] });
		assert.equal(v.resolveTestCommand(task), 'exit 0');   // verbatim
		const { verdict } = await v.verify(task, repo);
		assert.equal(verdict.command, 'exit 0');
		assert.equal(verdict.passed, true);
		assert.equal(verdict.exitCode, 0);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: a non-zero exit yields a NON-passing verdict (never a fabricated pass)', async () => {
	const repo = gitRepo();
	try {
		const v = createGitTestVerifier();
		const { verdict } = await v.verify(planTask({ tests: [{ level: 'unit', name: 'exit 3' }] }), repo);
		assert.equal(verdict.passed, false);
		assert.equal(verdict.exitCode, 3);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: an empty/absent stated test command yields a non-passing verdict, never fabricated', async () => {
	const repo = gitRepo();
	try {
		const v = createGitTestVerifier();
		const task = planTask({ tests: [] });   // no stated tests
		assert.equal(v.resolveTestCommand(task), '');
		const { verdict } = await v.verify(task, repo);
		assert.equal(verdict.command, '');
		assert.equal(verdict.passed, false);
		assert.ok(verdict.exitCode !== 0);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: filesTouched reflects the actual working-tree diff (untracked + tracked)', async () => {
	const repo = gitRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'hello');   // untracked
		const files = gitFilesTouched(repo);
		assert.ok(files.includes('a.txt'), `expected a.txt in ${JSON.stringify(files)}`);

		// The verifier surfaces the same diff on the verdict path.
		const v = createGitTestVerifier();
		const { filesTouched } = await v.verify(planTask({}), repo);
		assert.ok(filesTouched.includes('a.txt'));
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t5: gitFilesTouched on a non-git dir is [] (nothing observably touched)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-nongit-'));
	try {
		writeFileSync(join(dir, 'a.txt'), 'x');
		assert.deepEqual(gitFilesTouched(dir), []);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('t5: defaultResolveTestCommand takes the first stated test name verbatim', () => {
	assert.equal(defaultResolveTestCommand(planTask({ tests: [{ level: 'unit', name: 'npx tsx --test x' }] })), 'npx tsx --test x');
	assert.equal(defaultResolveTestCommand(planTask({ tests: [] })), '');
});
