/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (provenance/feedback) t2/t3 — the shared git changed-file seam.
 *
 * `changedFiles` is the extracted, behaviour-preserving body of the code-review
 * resolver's former `realChangedFiles` — exercised here against a real tmp git
 * repo (a staged new file appears in the changed set). `collectBuildChangeLog`
 * maps the changed set into a file-level change-log and SWALLOWS a derivation
 * failure to `[]`.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/changed-files.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { changedFiles, collectBuildChangeLog, NoBuildChangesError } from '../changed-files.js';

// ---------------------------------------------------------------------------
// t2 — changedFiles (real git): a staged new file is in the changed set
// ---------------------------------------------------------------------------

test('changedFiles: derives the staged changed set from a real git repo (extraction is behaviour-preserving)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-changed-files-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
		execFileSync('git', ['add', 'a.ts'], { cwd: repo });
		const files = await changedFiles(repo);
		assert.ok(files.includes('a.ts'), `expected a.ts in the changed set, got ${JSON.stringify(files)}`);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('changedFiles: throws NoBuildChangesError on a non-git directory', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-non-git-'));
	try {
		await assert.rejects(() => changedFiles(dir), (e: unknown) => e instanceof NoBuildChangesError);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// t3 — collectBuildChangeLog (stubbed changedFiles seam)
// ---------------------------------------------------------------------------

test('collectBuildChangeLog: one file-level entry per changed path (segment omitted), stamped author/timestamp', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
		async () => ['src/a.ts', 'src/b.ts'],
	);
	assert.deepEqual([...cl], [
		{ target: { file: 'src/a.ts' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
		{ target: { file: 'src/b.ts' }, author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z' },
	]);
	// segment is never set (file-level).
	assert.ok(cl.every(e => e.target.segment === undefined));
});

test('collectBuildChangeLog: version is threaded onto target when supplied', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: '2026-09-28T00:00:00.000Z', version: 'deadbeef' },
		async () => ['src/a.ts'],
	);
	assert.deepEqual(cl[0]!.target, { file: 'src/a.ts', version: 'deadbeef' });
});

test('collectBuildChangeLog: an empty changed set → []', async () => {
	const cl = await collectBuildChangeLog('/repo', { author: 'insrc-build', timestamp: 't' }, async () => []);
	assert.deepEqual([...cl], []);
});

test('collectBuildChangeLog: a git derivation failure is SWALLOWED → [] (never throws out)', async () => {
	const cl = await collectBuildChangeLog(
		'/repo',
		{ author: 'insrc-build', timestamp: 't' },
		async () => { throw new NoBuildChangesError('not a git repo'); },
	);
	assert.deepEqual([...cl], []);
});

// ---------------------------------------------------------------------------
// t3 (ISSUE-93081bff91ae5108 / S001) — the ADDITIVE options seam.
//
// Every assertion here is argument-level where it can be: the defect was in what
// git was actually ASKED, so a result-level check would pass for the wrong
// reason. A recording seam captures the options the collector forwards.
// ---------------------------------------------------------------------------

/** A recording `listChanged` seam: returns a fixed set and remembers every call. */
function recordingSeam(result: readonly string[] = ['src/a.ts']) {
	const calls: { repoPath: string; opts: unknown }[] = [];
	const fn = async (repoPath: string, opts?: unknown): Promise<readonly string[]> => {
		calls.push({ repoPath, opts });
		return result;
	};
	return { fn, calls };
}

const CTX = { author: 'insrc-build', timestamp: '2026-10-02T00:00:00.000Z' };

test('t3: collectBuildChangeLog with NO base/exclude forwards `undefined` — the seam sees exactly what it sees today', async () => {
	const seam = recordingSeam();
	const log = await collectBuildChangeLog('/repo', CTX, seam.fn);
	assert.equal(seam.calls.length, 1);
	assert.equal(seam.calls[0]!.repoPath, '/repo');
	// Argument-level: NOT `{ base: undefined, exclude: undefined }`, which would be
	// a different call even though it behaves the same.
	assert.equal(seam.calls[0]!.opts, undefined,
		'a ctx carrying neither field must forward undefined, keeping the call byte-for-byte as it was');
	assert.deepEqual(log.map(e => e.target.file), ['src/a.ts']);
});

test('t3: a base on the ctx REACHES the seam as opts.base', async () => {
	const seam = recordingSeam();
	await collectBuildChangeLog('/repo', { ...CTX, base: 'abc1234' }, seam.fn);
	assert.deepEqual(seam.calls[0]!.opts, { base: 'abc1234' },
		'the range base is threaded through the ctx to the seam');
});

test('t3: an exclude list on the ctx REACHES the seam as opts.exclude', async () => {
	const seam = recordingSeam();
	await collectBuildChangeLog('/repo', { ...CTX, exclude: ['.insrc/artifacts/BUILD-x.json'] }, seam.fn);
	assert.deepEqual(seam.calls[0]!.opts, { exclude: ['.insrc/artifacts/BUILD-x.json'] });
});

test('t3: existing TWO-ARGUMENT call sites and ONE-PARAMETER seam stubs still compile and behave identically', async () => {
	// The mandated 2-arg form — no seam, no options.
	const viaDefault = collectBuildChangeLog('/definitely-not-a-git-repo-xyz', CTX);
	await assert.doesNotReject(() => viaDefault, 'the 2-arg form still works and still swallows');
	assert.deepEqual(await viaDefault, [], 'and still yields [] on a non-git path');

	// A 1-PARAMETER stub stays assignable to the widened 2-parameter seam type —
	// this is what keeps every existing test stub compiling untouched.
	const oneParam = async (repoPath: string): Promise<readonly string[]> => [`${repoPath.length > 0 ? 'src/b.ts' : ''}`];
	const log = await collectBuildChangeLog('/repo', CTX, oneParam);
	assert.deepEqual(log.map(e => e.target.file), ['src/b.ts']);
});

test('t3: collectBuildChangeLog STILL never throws and STILL logs — a seam that throws yields [] (ac6 regression guard)', async () => {
	const thrower = async (): Promise<readonly string[]> => { throw new NoBuildChangesError('git exploded'); };
	const log = await collectBuildChangeLog('/repo', { ...CTX, base: 'abc1234' }, thrower);
	assert.deepEqual(log, [], 'a throwing seam is swallowed to [] even with a base supplied');
	// The log.warn at changed-files.ts:77-83 is the ONLY trace a failure leaves,
	// since ac6 forbids throwing. Assert the call rather than assume it: a seam
	// that returned [] silently would turn a recorded condition invisible.
	const logged = await (async () => {
		const seen: unknown[] = [];
		const { getLogger } = await import('../../../../shared/logger.js');
		const l = getLogger('workflow:build:changed-files');
		const orig = l.warn.bind(l);
		(l as unknown as { warn: unknown }).warn = (...a: unknown[]) => { seen.push(a); return orig(...(a as [])); };
		await collectBuildChangeLog('/repo', CTX, thrower);
		(l as unknown as { warn: unknown }).warn = orig;
		return seen;
	})();
	assert.equal(logged.length, 1, 'exactly one warn emitted for the swallowed failure');
	assert.match(JSON.stringify(logged[0]), /could not derive the changed set/,
		'and it is the existing message, surviving the widening verbatim');
});

test('t3: `exclude` is ACCEPTED but INERT today — pinned so t4 inverts it rather than discovering it', async () => {
	// changedFiles reaches real git; a non-git dir throws, so drive the inertness
	// through the seam instead: the collector forwards exclude untouched and does
	// no filtering of its own.
	const seam = recordingSeam(['keep.ts', '.insrc/artifacts/BUILD-x.json']);
	const log = await collectBuildChangeLog('/repo', { ...CTX, exclude: ['.insrc/artifacts/BUILD-x.json'] }, seam.fn);
	assert.deepEqual(log.map(e => e.target.file), ['keep.ts', '.insrc/artifacts/BUILD-x.json'],
		'TODAY: the excluded path is still in the change-log — t4 applies the filter and INVERTS this');
});

// ---------------------------------------------------------------------------
// t3 — the DERIVATION itself, against real git. This is the half the seam tests
// cannot reach: whether a base actually becomes a `git_diff` range.
// ---------------------------------------------------------------------------

/** A repo with a base commit, then a second commit touching `shipped.ts`.
 *  Returns the repo path and the base sha (the commit BEFORE the Story's work). */
function mkRangeRepo(): { repo: string; base: string } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-range-'));
	const git = (...a: string[]): string =>
		execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	git('init', '-q');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	writeFileSync(join(repo, 'base.ts'), 'export const v = 0;\n');
	git('add', '.'); git('commit', '-qm', 'base');
	const base = git('rev-parse', 'HEAD');
	// The Story's work, COMMITTED — which is what empties the working tree.
	writeFileSync(join(repo, 'shipped.ts'), 'export const v = 1;\n');
	git('add', '.'); git('commit', '-qm', 'the Story work');
	return { repo, base };
}

test('t3: a CLEAN tree + base derives the COMMITTED range — the base reaches git_diff as `from`', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		// Without a base the clean tree yields nothing — the defect, reproduced here
		// so the contrast is in one test rather than asserted elsewhere.
		assert.deepEqual(await changedFiles(repo), [], 'clean tree, no base → empty (today\'s behaviour)');
		// With a base, the same clean tree yields the Story's committed change.
		const ranged = await changedFiles(repo, { base });
		assert.ok(ranged.includes('shipped.ts'),
			`clean tree + base → the committed range, got ${JSON.stringify(ranged)}`);
		assert.ok(!ranged.includes('base.ts'),
			'and only the range base..HEAD, not the whole history');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3: a DIRTY tree NEVER consults the base — the result cannot depend on which range was supplied', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		writeFileSync(join(repo, 'dirty.ts'), 'export const d = 1;\n');
		execFileSync('git', ['add', 'dirty.ts'], { cwd: repo });

		const withBase    = await changedFiles(repo, { base });
		const withoutBase = await changedFiles(repo);
		assert.deepEqual(withBase, withoutBase,
			'a dirty tree yields EXACTLY today\'s result whether or not a base is supplied');
		assert.ok(withBase.includes('dirty.ts'));
		assert.ok(!withBase.includes('shipped.ts'),
			'the committed range is NOT unioned in — a dirty tree is left alone entirely');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3: an UNRESOLVABLE base on a clean tree throws out of changedFiles (the caller swallows it — ac6 is enforced one level up)', async () => {
	const { repo } = mkRangeRepo();
	try {
		await assert.rejects(() => changedFiles(repo, { base: 'nonexistentsha123456' }),
			(e: unknown) => e instanceof NoBuildChangesError,
			'changedFiles surfaces the git failure; collectBuildChangeLog is what guarantees never-throw');
		// And through the collector it is swallowed, as ac6 requires.
		assert.deepEqual(
			await collectBuildChangeLog(repo, { ...CTX, base: 'nonexistentsha123456' }),
			[], 'an unresolvable base yields an EMPTY change-log rather than blocking the build');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t3: an empty-string base behaves as ABSENT (contract pinned; the guard itself is defence-in-depth)', async () => {
	const { repo } = mkRangeRepo();
	try {
		assert.deepEqual(await changedFiles(repo, { base: '' }), [],
			'an empty base yields the same empty result as no base at all');
		// HONEST LIMIT OF THIS TEST, stated rather than implied. It pins the
		// observable CONTRACT, not the `base.length > 0` guard that implements it:
		// a mutation removing that guard leaves this test GREEN, because the
		// git_diff builtin tolerates `from: ''` — verified directly, it returns
		// `success: true, files: []`. So the guard is belt-and-braces against the
		// builtin becoming strict, not a behaviour this test can falsify. Proving
		// the guard would need git_diff injected into changedFiles, which is out of
		// this Task's scope and not worth the seam.
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
