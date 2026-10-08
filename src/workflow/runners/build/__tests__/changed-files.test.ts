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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { changedFiles, collectBuildChangeLog, LEDGER_EXCLUDE_GLOBS, NoBuildChangesError } from '../changed-files.js';
import { gitDiffTool } from '../../../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData } from '../../../../daemon/tools/builtins/git/diff.js';

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

test('t4: `exclude` is forwarded to the seam, and the COLLECTOR itself still does no filtering (the filter lives in changedFiles)', async () => {
	// INVERTED FROM t3, where this pinned `exclude` as inert. t4 applies the filter
	// inside changedFiles, NOT in collectBuildChangeLog — so a stubbed seam that
	// ignores the option still returns everything, which is correct: the collector's
	// job is to FORWARD the option, and the derivation's job is to honour it.
	const seam = recordingSeam(['keep.ts', '.insrc/artifacts/BUILD-x.json']);
	const log = await collectBuildChangeLog('/repo', { ...CTX, exclude: ['.insrc/artifacts/BUILD-x.json'] }, seam.fn);
	assert.deepEqual(seam.calls[0]!.opts, { exclude: ['.insrc/artifacts/BUILD-x.json'] },
		'the option reaches the seam');
	assert.deepEqual(log.map(e => e.target.file), ['keep.ts', '.insrc/artifacts/BUILD-x.json'],
		'and a seam that ignores it is passed through unfiltered — the filter is the derivation\'s responsibility, asserted against real git below');
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

// ---------------------------------------------------------------------------
// t4 — the exclusion, against real git. Asserted SEPARATELY for the
// working-tree and range derivations: an exclusion honoured by only one is the
// bug half-fixed, and a single test over the union would not catch that.
// ---------------------------------------------------------------------------

test('t4 (WORKING-TREE derivation): the record\'s own json + md are dirty and are EXCLUDED, while a genuinely-changed artifact survives', async () => {
	const { repo } = mkRangeRepo();
	try {
		const own = ['.insrc/artifacts/BUILD-abc-s1.json', 'docs/epics/x/S001/BUILD.md'];
		const other = '.insrc/artifacts/LLD-abc-s1.json';     // a DIFFERENT artifact
		for (const f of [...own, other, 'src/real.ts']) {
			mkdirSync(join(repo, dirname(f)), { recursive: true });
			writeFileSync(join(repo, f), 'x\n');
		}
		execFileSync('git', ['add', '-A'], { cwd: repo });

		// Reproduces the observed state: the record's own files dirty in the tree.
		const unfiltered = await changedFiles(repo);
		assert.ok(own.every(f => unfiltered.includes(f)), 'precondition: the record\'s own paths ARE in the raw working-tree set');

		const filtered = await changedFiles(repo, { exclude: own });
		for (const f of own) assert.ok(!filtered.includes(f), `${f} must be excluded`);
		assert.ok(filtered.includes(other), 'a DIFFERENT artifact under .insrc/artifacts still counts — not a blanket artifact filter');
		assert.ok(filtered.includes('src/real.ts'), 'and real source is untouched');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4 (RANGE derivation): the exclusion is honoured on a CLEAN tree deriving base..HEAD — asserted separately from the working-tree case', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-t4-range-'));
	try {
		const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
		writeFileSync(join(repo, 'base.ts'), '0\n'); git('add', '.'); git('commit', '-qm', 'base');
		const base = git('rev-parse', 'HEAD');
		// COMMIT the record's own files plus real work — tree ends up clean.
		const own = ['.insrc/artifacts/BUILD-abc-s1.json', 'docs/epics/x/S001/BUILD.md'];
		for (const f of [...own, 'src/shipped.ts']) {
			mkdirSync(join(repo, dirname(f)), { recursive: true });
			writeFileSync(join(repo, f), 'x\n');
		}
		git('add', '-A'); git('commit', '-qm', 'the Story work + its ledger record');
		assert.equal(git('status', '--porcelain'), '', 'precondition: clean tree, so the RANGE derivation runs');

		const ranged = await changedFiles(repo, { base });
		assert.ok(own.every(f => ranged.includes(f)), 'precondition: the range set DOES contain the record\'s own paths');

		const filtered = await changedFiles(repo, { base, exclude: own });
		for (const f of own) assert.ok(!filtered.includes(f), `${f} must be excluded from the RANGE derivation too`);
		assert.ok(filtered.includes('src/shipped.ts'), 'the Story\'s real committed change survives');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// CR-1 — code-review finding on this Story (cold review of 9b14d95..e15ef63).
//
// The emptiness gate that decides whether to consult the committed range ran
// BEFORE the exclusion. So a tree whose ONLY dirty paths are the record's own two
// files counted as "dirty" — the range was never consulted — and the set then
// filtered down to nothing. Neither derivation produced anything, and because the
// collector omits an empty changeLog, mergeWithPrior kept the PREVIOUS write's
// file list: the record reported a stale change set as this Story's work.
//
// This is the Story's own central promise failing in its MOST COMMON case, and
// the Story's own code says so: completion-record.ts notes that at completion
// time those two paths are "typically the only dirty paths". Every other t4 test
// seeds ADDITIONAL dirty files, which is why none of them caught it.
// ---------------------------------------------------------------------------

test('CR-1: a tree dirty with ONLY the record\'s own paths still derives the COMMITTED range — the exclusion is applied BEFORE the emptiness gate', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		// mkRangeRepo already committed the Story's work (shipped.ts) on top of
		// `base`, so the range base..HEAD is non-empty and the tree is clean.
		const own = ['.insrc/artifacts/BUILD-abc-s1.json', 'docs/epics/x/S001/BUILD.md'];
		for (const f of own) {
			mkdirSync(join(repo, dirname(f)), { recursive: true });
			writeFileSync(join(repo, f), 'placeholder\n');
		}
		execFileSync('git', ['add', '-f', ...own], { cwd: repo });
		execFileSync('git', ['commit', '-qm', 'the ledger record', '--', ...own], { cwd: repo, stdio: 'ignore' });
		// Now the build REWRITES its own record — tracked, modified, and the only
		// dirty paths in the tree. Exactly the observed state.
		for (const f of own) writeFileSync(join(repo, f), 'rewritten by this build\n');

		const raw = await changedFiles(repo);
		assert.deepEqual([...raw].sort(), [...own].sort(),
			'precondition: the record\'s own two paths are the ONLY dirty paths git reports');

		const derived = await changedFiles(repo, { base, exclude: own });
		assert.ok(derived.includes('shipped.ts'),
			`the Story's committed work must still be derived, got ${JSON.stringify(derived)}`);
		for (const f of own) assert.ok(!derived.includes(f), `${f} is still excluded`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('CR-1: a tree dirty with REAL work plus the record\'s own paths still does NOT consult the base — the fix must not widen the gate', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		// One real dirty file alongside the record's own: the working tree genuinely
		// has the Story's work in it, so the range must stay unconsulted. This pins
		// the OTHER side of the gate, so a fix cannot simply always union the range.
		writeFileSync(join(repo, 'wip.ts'), 'export const w = 1;\n');
		const ownJson = '.insrc/artifacts/BUILD-abc-s1.json';
		mkdirSync(join(repo, dirname(ownJson)), { recursive: true });
		writeFileSync(join(repo, ownJson), 'x\n');
		execFileSync('git', ['add', '-A'], { cwd: repo });

		const derived = await changedFiles(repo, { base, exclude: [ownJson] });
		assert.deepEqual(derived, ['wip.ts'],
			'only the working tree\'s real file — `shipped.ts` from base..HEAD must NOT appear');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4: ABSOLUTE exclusion paths are normalised — callers hold absolute paths while git reports relative ones', async () => {
	const { repo } = mkRangeRepo();
	try {
		writeFileSync(join(repo, 'dirty.ts'), '1\n');
		execFileSync('git', ['add', 'dirty.ts'], { cwd: repo });
		const filtered = await changedFiles(repo, { exclude: [join(repo, 'dirty.ts')] });
		assert.deepEqual(filtered, [], 'an absolute path under the repo matches the relative path git reports');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4: a Story that changed ONLY artifact files still yields a NON-EMPTY change set (docs-only edge case)', async () => {
	const { repo } = mkRangeRepo();
	try {
		// Only artifacts dirty — but NOT this record's own two paths.
		for (const f of ['.insrc/artifacts/LLD-other-s1.json', 'docs/epics/y/S002/LLD.md']) {
			mkdirSync(join(repo, dirname(f)), { recursive: true });
			writeFileSync(join(repo, f), 'x\n');
		}
		execFileSync('git', ['add', '-A'], { cwd: repo });
		const filtered = await changedFiles(repo, { exclude: ['.insrc/artifacts/BUILD-abc-s1.json', 'docs/epics/x/S001/BUILD.md'] });
		assert.equal(filtered.length, 2, `an artifact-only Story is still reported, got ${JSON.stringify(filtered)}`);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('t4: an exclusion path OUTSIDE the repo is left alone rather than relativised into something that might match', async () => {
	const { repo } = mkRangeRepo();
	try {
		writeFileSync(join(repo, 'dirty.ts'), '1\n');
		execFileSync('git', ['add', 'dirty.ts'], { cwd: repo });
		const filtered = await changedFiles(repo, { exclude: ['/somewhere/else/dirty.ts'] });
		assert.deepEqual(filtered, ['dirty.ts'],
			'a path outside the repo cannot match a git path — relativising it would produce ../.. noise that might');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 S001/t2 — excludeGlobs + LEDGER_EXCLUDE_GLOBS.
//
// The globs are handed to git, so every assertion on what they match runs
// against REAL git: a matcher re-implemented in the test would only agree with
// itself. Kept and dropped sets are asserted EXACTLY — a subset check passes for
// a glob that matches nothing as happily as for one that matches too much.
// ---------------------------------------------------------------------------

/** One path for every location the ledger globs must decide, in one commit. */
const LEDGER_KEPT = [
	'.insrc/artifacts/formats/f.md',
	'.insrc/artifacts/templates/t.json',
	'.insrc/conventions/c.md',
	'.insrc/feedback/fb.md',
	'.insrc/templates/tp.md',
	'docs/epics-notes/n.md',
	'src/a.ts',
];
const LEDGER_DROPPED = [
	'.insrc/artifacts/LLD-x.json',
	'.insrc/build-start/x-S001.json',
	'docs/epics/e/S001/LLD.md',
	'docs/standalone/s/S001/BUILD.md',
];

function mkLedgerRepo(): { repo: string; base: string } {
	const { repo, base: _unused } = mkRangeRepo();
	void _unused;
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	const base = git('rev-parse', 'HEAD');
	for (const f of [...LEDGER_KEPT, ...LEDGER_DROPPED]) {
		mkdirSync(join(repo, dirname(f)), { recursive: true });
		writeFileSync(join(repo, f), `${f}\n`);
	}
	git('add', '-A'); git('commit', '-qm', 'one commit touching every location');
	return { repo, base };
}

test('T26: LEDGER_EXCLUDE_GLOBS keep and drop EXACTLY the listed sets (real git)', async () => {
	const { repo, base } = mkLedgerRepo();
	try {
		const all = [...await changedFiles(repo, { base })].sort();
		assert.deepEqual(all, [...LEDGER_KEPT, ...LEDGER_DROPPED].sort(), 'fixture precondition: without the globs every path is in the range');

		const kept = [...await changedFiles(repo, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS })].sort();
		assert.deepEqual(kept, [...LEDGER_KEPT].sort());
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T26: the constant is exactly the four globs, and frozen', () => {
	assert.deepEqual([...LEDGER_EXCLUDE_GLOBS], ['.insrc/artifacts/*.json', '.insrc/build-start/**', 'docs/epics/**', 'docs/standalone/**']);
	assert.ok(Object.isFrozen(LEDGER_EXCLUDE_GLOBS));
});

test('T27: the globs give the SAME result when git_diff runs from a subdirectory of the repo', async () => {
	const { repo, base } = mkLedgerRepo();
	try {
		const res = await gitDiffTool.execute(
			{ cwd: join(repo, 'src'), from: base, exclude: [...LEDGER_EXCLUDE_GLOBS] },
			{ sessionId: 't', repoPath: repo, send: () => {}, requestId: 0 },
		);
		assert.equal(res.success, true, res.error);
		const fromSubdir = (res.data as GitDiffData).files.map(f => f.path).sort();
		assert.deepEqual(fromSubdir, [...LEDGER_KEPT].sort(), 'the exclusions anchor at the repo root, not at the cwd');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T28 (WORKING-TREE derivation): a tree dirty ONLY with an artifact json is clean under excludeGlobs, so the range is derived', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		// The observed state: the Story is committed and an approval rewrote a
		// TRACKED artifact json, leaving it as the only dirty path.
		const artifact = '.insrc/artifacts/PLAN-abc-S001.json';
		mkdirSync(join(repo, dirname(artifact)), { recursive: true });
		writeFileSync(join(repo, artifact), '{"v":1}\n');
		execFileSync('git', ['add', '-A'], { cwd: repo });
		execFileSync('git', ['commit', '-qm', 'the plan'], { cwd: repo });
		writeFileSync(join(repo, artifact), '{"v":2,"approvedAt":"now"}\n');   // unstaged

		assert.deepEqual([...await changedFiles(repo, { base })], [artifact],
			'fixture precondition: without the globs the dirty artifact IS the whole set and the range is never consulted');

		const withGlobs = [...await changedFiles(repo, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS })];
		assert.deepEqual(withGlobs, ['shipped.ts'], 'the artifact is not evidence of a dirty tree, so the committed range is derived — and the artifact is excluded from it too');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T28 (STAGED derivation): a STAGED artifact json is excluded as well — the glob reaches both working-tree diffs', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		const artifact = '.insrc/artifacts/BUILD-abc-S001.json';
		mkdirSync(join(repo, dirname(artifact)), { recursive: true });
		writeFileSync(join(repo, artifact), '{}\n');
		execFileSync('git', ['add', '-A'], { cwd: repo });   // staged, never committed
		const withGlobs = [...await changedFiles(repo, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS })];
		assert.deepEqual(withGlobs, ['shipped.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

/** Record every input `changedFiles` hands to git_diff, by swapping the tool's
 *  `execute` for the duration of `fn`. The tool is the seam `changedFiles`
 *  actually calls, so this observes the real inputs rather than a copy. */
async function recordDiffInputs(fn: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
	const seen: Record<string, unknown>[] = [];
	const real = gitDiffTool.execute;
	gitDiffTool.execute = async (input, deps) => { seen.push({ ...input }); return real.call(gitDiffTool, input, deps); };
	try { await fn(); } finally { gitDiffTool.execute = real; }
	return seen;
}

test('T29: WITHOUT excludeGlobs the inputs sent to git_diff are exactly today\'s — no `exclude` key at all', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		for (const opts of [undefined, { base }, { base, exclude: ['x'] }, { base, excludeGlobs: [] as string[] }]) {
			const seen = await recordDiffInputs(() => changedFiles(repo, opts));
			assert.deepEqual(seen, [
				{ cwd: repo, staged: false },
				{ cwd: repo, staged: true },
				...(opts?.base !== undefined ? [{ cwd: repo, from: base }] : []),
			], `opts=${JSON.stringify(opts)}`);
		}
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T29: WITH excludeGlobs every one of the three diffs carries them', async () => {
	const { repo, base } = mkRangeRepo();
	try {
		const seen = await recordDiffInputs(() => changedFiles(repo, { base, excludeGlobs: ['a/**', 'b/*.json'] }));
		assert.deepEqual(seen, [
			{ cwd: repo, staged: false, exclude: ['a/**', 'b/*.json'] },
			{ cwd: repo, staged: true,  exclude: ['a/**', 'b/*.json'] },
			{ cwd: repo, from: base,    exclude: ['a/**', 'b/*.json'] },
		]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T29: collectBuildChangeLog passes NO excludeGlobs — the BUILD writers are unaffected', async () => {
	const seenOpts: unknown[] = [];
	await collectBuildChangeLog('/repo', { ...CTX, base: 'abc', exclude: ['own.json'] }, async (_repo: string, opts?: unknown) => { seenOpts.push(opts); return []; });
	assert.deepEqual(seenOpts, [{ base: 'abc', exclude: ['own.json'] }]);
});

// ---------------------------------------------------------------------------
// ISSUE-f9ced66a (LLD-f9ced66a-s1, task t5): only the Story's OWN files count
// after a mid-build merge.
// ---------------------------------------------------------------------------

/** base → Story commit → `--no-ff` merge of an upstream branch → Story commit.
 *  Each Story commit also commits a ledger file, as the workflow does. */
function mkMergedRepo(): { repo: string; base: string } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-merged-'));
	const git = (...a: string[]): string =>
		execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	const put = (rel: string, body: string): void => {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), body);
	};
	git('init', '-q', '-b', 'main');
	git('config', 'user.email', 'test@insrc.local');
	git('config', 'user.name', 'insrc-test');
	git('config', 'commit.gpgsign', 'false');
	put('base.ts', 'export const v = 0;\n');
	git('add', '-A'); git('commit', '-qm', 'base');
	const base = git('rev-parse', 'HEAD');
	git('checkout', '-q', '-b', 'upstream');
	put('upstream/merged.ts', 'export const u = 1;\n');
	git('add', '-A'); git('commit', '-qm', 'upstream work');
	git('checkout', '-q', 'main');
	put('src/story1.ts', 'export const s1 = 1;\n');
	put('.insrc/artifacts/BUILD-x-s1.json', '{}\n');
	git('add', '-A'); git('commit', '-qm', 'story 1');
	git('merge', '-q', '--no-ff', '-m', 'merge upstream', 'upstream');
	put('src/story2.ts', 'export const s2 = 1;\n');
	git('add', '-A'); git('commit', '-qm', 'story 2');
	return { repo, base };
}

test("a clean tree with a base reports only the Story's own files, not files a merge brought in", async () => {
	const { repo, base } = mkMergedRepo();
	try {
		const files = [...await changedFiles(repo, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS })].sort();
		assert.deepEqual(files, ['src/story1.ts', 'src/story2.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('without a base the derivation is unchanged', async () => {
	const { repo } = mkMergedRepo();
	try {
		// Clean tree, no base: empty, as before.
		assert.deepEqual(await changedFiles(repo), []);
		// Dirty tree, no base: the working-tree set, as before.
		writeFileSync(join(repo, 'upstream', 'merged.ts'), 'export const u = 2;\n');
		assert.deepEqual(await changedFiles(repo), ['upstream/merged.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("collectBuildChangeLog with a base lists only the Story's own files after a mid-build merge", async () => {
	const { repo, base } = mkMergedRepo();
	try {
		const log = await collectBuildChangeLog(repo, { ...CTX, base });
		const files = log.map(e => e.target.file).sort();
		// The writers' exact-path exclusions are unchanged, so the committed
		// ledger file is still listed; the merged-in file is not.
		assert.deepEqual(files, ['.insrc/artifacts/BUILD-x-s1.json', 'src/story1.ts', 'src/story2.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a committed ledger file stays out of the range result after a mid-build merge', async () => {
	const { repo, base } = mkMergedRepo();
	try {
		const files = await changedFiles(repo, { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS });
		assert.equal(files.includes('.insrc/artifacts/BUILD-x-s1.json'), false, 'git still excludes the ledger file');
		assert.equal(files.includes('upstream/merged.ts'), false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
