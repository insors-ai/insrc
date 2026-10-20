/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t3 — the review subject is the Story's own files, with how
 * it was scoped (changeSetAttribution) and the files another Story also changed
 * (sharedWithExcluded) recorded on the subject and on the code-review record.
 * Real temporary repositories through the real changed-file derivation.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/subject-attribution.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ArtifactMissingError } from '../../gates.js';
import { changedFiles, NoBuildChangesError } from '../../runners/build/changed-files.js';
import type { ChangedFilesOptions } from '../../runners/build/changed-files.js';
import { resolveCodeReviewSubject, type SubjectDeps } from '../subject.js';
import { runCodeReview, type CodeReviewRunnerDeps } from '../runner.js';
import type { CodeReviewSubject, DimensionResult, ReviewDimension } from '../types.js';
import type { LLMProvider } from '../../../shared/types.js';

const EPIC = 'b47dadc7cf0cccb1';
const STORY = `${EPIC}/s1`;

function git(repo: string, ...args: string[]): string {
	return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function write(repo: string, files: Readonly<Record<string, string>>): void {
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), body);
	}
}

function commit(repo: string, files: Readonly<Record<string, string>>, subject: string, storyKey?: string): void {
	write(repo, files);
	git(repo, 'add', '-A');
	git(repo, 'commit', '-q', '-m', storyKey !== undefined ? `${subject}\n\nInsrc-Story: ${storyKey}\n` : subject);
}

function repo(): { repo: string; base: string; cleanup: () => void } {
	const r = mkdtempSync(join(tmpdir(), 'insrc-subject-attr-'));
	git(r, 'init', '-q', '-b', 'main');
	git(r, 'config', 'user.email', 't@example.com');
	git(r, 'config', 'user.name', 't');
	git(r, 'config', 'commit.gpgsign', 'false');
	commit(r, { 'README.md': 'base\n', 'src/shared.ts': 'base\n' }, 'base');
	return { repo: r, base: git(r, 'rev-parse', 'HEAD').trim(), cleanup: () => rmSync(r, { recursive: true, force: true }) };
}

const missing = (): never => { throw new ArtifactMissingError('none'); };

function deps(base: string, seam: SubjectDeps['changedFiles'] = changedFiles): SubjectDeps {
	return {
		requireApprovedLld: missing, requireApprovedPlan: missing, changedFiles: seam,
		resolveRangeBase: () => base, readBuildRecord: () => null, readTestRecord: () => null,
	};
}

/** Story S001 commits around another Story's commit, plus its own ledger file. */
function interleaved(r: string): void {
	commit(r, { 'src/mine.ts': '1\n', 'src/shared.ts': 'mine\n', '.insrc/artifacts/BUILD-x.json': '{}\n' }, 'feat(build): S001/t1 mine', STORY);
	commit(r, { 'src/theirs.ts': '1\n', 'src/shared.ts': 'theirs\n' }, 'feat(build): s3/t1 theirs', 'c2ba6fa6aaaaaaaa/s3');
	commit(r, { 'src/mine2.ts': '1\n' }, 'feat(build): S001/t2 mine again', STORY);
}

test("the review subject holds only the Story's own files and records attribution story-trailer", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		const res = await resolveCodeReviewSubject(r, EPIC, 's1', deps(base));
		assert.ok(res.ok);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles].sort(), ['src/mine.ts', 'src/mine2.ts', 'src/shared.ts'],
			"the other Story's file and the ledger json are not in the subject");
		assert.equal(res.subject.changeSetAttribution, 'story-trailer');
	} finally { cleanup(); }
});

test('a dirty tree gives attribution working-tree and the step-down order is unchanged', async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		write(r, { 'README.md': 'uncommitted edit\n' });
		const dirty = await resolveCodeReviewSubject(r, EPIC, 's1', deps(base));
		assert.ok(dirty.ok);
		if (!dirty.ok) return;
		assert.deepEqual([...dirty.subject.changedFiles], ['README.md']);
		assert.equal(dirty.subject.changeSetAttribution, 'working-tree');
		assert.deepEqual(dirty.subject.sharedWithExcluded, []);

		// A clean tree with no trailered commit: the first-parent range, as before.
		git(r, 'checkout', '-q', '--', 'README.md');
		const untrailed = await resolveCodeReviewSubject(r, 'ffffffffffffffff', 's1', deps(base));
		assert.ok(untrailed.ok);
		if (!untrailed.ok) return;
		assert.equal(untrailed.subject.changeSetAttribution, 'first-parent-range');
		assert.deepEqual([...untrailed.subject.changedFiles].sort(), ['src/mine.ts', 'src/mine2.ts', 'src/shared.ts', 'src/theirs.ts']);

		// Step down: the range attempt fails, then the ledger-only one, then the plain call.
		const labels: string[] = [];
		const stepping = await resolveCodeReviewSubject(r, EPIC, 's1', deps(base, async (repoPath: string, opts?: ChangedFilesOptions) => {
			labels.push(opts === undefined ? 'plain' : opts.base !== undefined ? 'range' : 'ledger');
			if (opts !== undefined) throw new NoBuildChangesError('refused');
			return changedFiles(repoPath);
		}));
		assert.deepEqual(labels, ['range', 'ledger', 'plain']);
		assert.ok(stepping.ok);
		if (!stepping.ok) return;
		assert.equal(stepping.subject.changeSetAttribution, 'working-tree', 'a plainer attempt reads the working tree only');
	} finally { cleanup(); }
});

test("a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		const res = await resolveCodeReviewSubject(r, EPIC, 's1', deps(base));
		assert.ok(res.ok);
		if (!res.ok) return;
		assert.deepEqual(res.subject.sharedWithExcluded, ['src/shared.ts']);

		const written: string[] = [];
		const dims: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
		const runnerDeps: CodeReviewRunnerDeps = {
			judges: dims.map(dimension => ({ dimension, judge: async (): Promise<DimensionResult> => ({ dimension, findings: [] }) })),
			assembleGrounding: async () => ({ symbols: [] }),
			write: (path) => { written.push(path); },
		};
		// The review is filed beside the Story's records, so the subject carries the build record's stamp.
		const stamp = '2026-10-05T00:00:00.000Z';
		const subject: CodeReviewSubject = {
			...res.subject,
			buildRecord: { meta: { workflow: 'build', epicHash: EPIC, storyId: 's1', createdAt: stamp, epicCreatedAt: stamp }, body: { tasks: [] } } as unknown as CodeReviewSubject['buildRecord'],
		};
		const out = await runCodeReview(subject, {} as LLMProvider, { runId: 'r', modelLabel: 'test' }, runnerDeps);
		assert.ok(out.ok, out.ok ? '' : out.error);
		if (!out.ok) return;
		assert.equal(out.artifact.body.subject.changeSetAttribution, 'story-trailer');
		assert.deepEqual(out.artifact.body.subject.sharedWithExcluded, ['src/shared.ts']);
		assert.ok(written.length > 0, 'the record was written');
	} finally { cleanup(); }
});
