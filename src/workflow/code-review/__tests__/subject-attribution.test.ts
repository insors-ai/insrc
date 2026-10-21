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
const STORY = `${EPIC}/S001`;

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
		const res = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base));
		assert.ok(res.ok);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles].sort(), ['src/mine.ts', 'src/mine2.ts', 'src/shared.ts'],
			"the other Story's file and the ledger json are not in the subject");
		assert.equal(res.subject.changeSetAttribution, 'story-trailer');
	} finally { cleanup(); }
});

test("a Story's review subject is its trailered commits plus edits of its own files; unrelated uncommitted files are left out and listed in excludedFromScope, and the attribution is never working-tree", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		write(r, { 'src/mine.ts': 'in progress\n', 'README.md': 'uncommitted edit\n', 'src/theirs.ts': 'theirs, edited\n' });
		git(r, 'add', 'src/theirs.ts');
		const res = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base));
		assert.ok(res.ok);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles].sort(), ['src/mine.ts', 'src/mine2.ts', 'src/shared.ts']);
		assert.equal(res.subject.changeSetAttribution, 'story-trailer');
		assert.deepEqual(res.subject.excludedFromScope, ['README.md', 'src/theirs.ts'], 'the in-progress Story file is not excluded; the others are');

		// A clean tree: nothing excluded, and the field is absent.
		git(r, 'checkout', '-q', '--', 'README.md', 'src/mine.ts');
		git(r, 'reset', '-q', 'HEAD', '--', 'src/theirs.ts');
		git(r, 'checkout', '-q', '--', 'src/theirs.ts');
		const clean = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base));
		assert.ok(clean.ok);
		if (!clean.ok) return;
		assert.equal(clean.subject.excludedFromScope, undefined);

		// A Story with no carrying commit, in a range of only other Stories' commits:
		// none of them is its work (ISSUE-b97752e9).
		const untrailed = await resolveCodeReviewSubject(r, 'ffffffffffffffff', 'S001', deps(base));
		assert.ok(untrailed.ok);
		if (!untrailed.ok) return;
		assert.equal(untrailed.subject.changeSetAttribution, 'first-parent-range');
		assert.deepEqual([...untrailed.subject.changedFiles], []);
	} finally { cleanup(); }
});

test('with no resolvable range base, or git failing on the anchored derivation, the review declines with no-build-record and never reviews the working tree', async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		write(r, { 'README.md': 'uncommitted edit\n' });
		const seen: (ChangedFilesOptions | undefined)[] = [];
		const spy: SubjectDeps['changedFiles'] = async (repoPath, opts) => { seen.push(opts); return changedFiles(repoPath, opts); };

		const noBase = await resolveCodeReviewSubject(r, EPIC, 'S001', { ...deps(base, spy), resolveRangeBase: () => undefined });
		assert.deepEqual(noBase, { ok: false, reason: 'no-build-record' });
		assert.deepEqual(seen, [], 'the working tree is never read in the Story\'s place');

		const failing = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base, async (_repoPath, opts) => {
			seen.push(opts);
			throw new NoBuildChangesError('git failed');
		}));
		assert.deepEqual(failing, { ok: false, reason: 'no-build-record' });
		assert.equal(seen.length, 1, 'one anchored attempt, and no plainer one');
		assert.equal(seen[0]?.base, base);

		// A broken trailer read fails the anchored derivation (strict), so it declines too.
		git(r, 'config', 'log.date', 'bogus');
		assert.deepEqual(await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base)), { ok: false, reason: 'no-build-record' });
	} finally { cleanup(); }
});

test("a file another Story's excluded commit also changed is listed in sharedWithExcluded on the subject and the record", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		interleaved(r);
		const res = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base));
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
		const subject: CodeReviewSubject = res.subject;
		const out = await runCodeReview(subject, {} as LLMProvider, { runId: 'r', modelLabel: 'test' }, runnerDeps);
		assert.ok(out.ok, out.ok ? '' : out.error);
		if (!out.ok) return;
		assert.equal(out.artifact.body.subject.changeSetAttribution, 'story-trailer');
		assert.deepEqual(out.artifact.body.subject.sharedWithExcluded, ['src/shared.ts']);
		assert.ok(written.length > 0, 'the record was written');
	} finally { cleanup(); }
});

test("a pre-trailer Story's review leaves out an uncommitted edit of a file only a commit after its recorded build commit touched", async () => {
	const { repo: r, base, cleanup } = repo();
	try {
		writeFileSync(join(r, '.git', 'info', 'exclude'), '.insrc/\n');
		commit(r, { 'src/legacy.ts': '1\n' }, 'feat: the Story, before trailers');
		const end = git(r, 'rev-parse', '--short', 'HEAD').trim();
		write(r, { [`.insrc/artifacts/BUILD-${EPIC}-S001.json`]: JSON.stringify({ meta: { workflow: 'build', epicHash: EPIC, storyId: 'S001', createdAt: '2026-10-18T00:00:00.000Z' }, body: { tasks: [], commit: end } }) });
		commit(r, { 'docs/ontology.md': 'added later by someone else\n' }, 'docs: add ontology PRD');
		write(r, { 'docs/ontology.md': 'edited, uncommitted\n' });
		const res = await resolveCodeReviewSubject(r, EPIC, 'S001', deps(base));
		assert.ok(res.ok);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles], ['src/legacy.ts']);
		assert.deepEqual(res.subject.excludedFromScope, ['docs/ontology.md']);
		assert.equal(res.subject.changeSetAttribution, 'first-parent-range');
	} finally { cleanup(); }
});
