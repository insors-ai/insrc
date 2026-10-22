/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { resolveCodeReviewSubject, NoBuildChangesError, type SubjectDeps } from '../subject.js';
import { ArtifactMissingError, ArtifactNotApprovedError } from '../../gates.js';
import { changedFiles as realChangedFiles, LEDGER_EXCLUDE_GLOBS } from '../../runners/build/changed-files.js';
import { stampBuildStart } from '../../runners/build/range-base.js';
import { getLogger } from '../../../shared/logger.js';
import { UnregisteredRepoError } from '../../../db/repos.js';
import type { LldArtifact } from '../../artifacts/lld.js';
import type { PlanArtifact } from '../../artifacts/plan.js';

const fakeLld  = { meta: { workflow: 'design.story' } } as unknown as LldArtifact;
const fakePlan = { meta: { workflow: 'plan' } } as unknown as PlanArtifact;

/** Base deps: approved contract, a resolvable range base and a known 2-file
 *  changed set. Tests override. */
function deps(over: Partial<SubjectDeps> = {}): SubjectDeps {
	return {
		requireApprovedLld:  () => fakeLld,
		requireApprovedPlan: () => fakePlan,
		changedFiles:        async () => ['src/a.ts', 'src/b.ts'],
		resolveRangeBase:    () => 'abc',
		...over,
	};
}

// ---- ac1: subject.changedFiles equals the git-derived set exactly ----

test('resolveCodeReviewSubject: changedFiles equals the git set exactly, build record not mutated', async () => {
	const record = { meta: { workflow: 'build' } } as never;
	let recordArg: unknown;
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		readBuildRecord: (...a) => { recordArg = a; return record; },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.deepEqual(res.subject.changedFiles, ['src/a.ts', 'src/b.ts']);
	assert.equal(res.subject.buildRecord, record);   // consumed for identity, same object
	assert.deepEqual(recordArg, ['/repo', 'epic', 's1']);
});

test('resolveCodeReviewSubject: empty diff is a valid trivial subject (not an error)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({ changedFiles: async () => [] }));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.deepEqual(res.subject.changedFiles, []);
});

// ---- S001: LLD + PLAN both OPTIONAL — three modes keyed on presence ----

test('resolveCodeReviewSubject: LLD+plan approved -> ok:true both set (mode A)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps());
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, fakeLld);
	assert.equal(res.subject.approvedPlan, fakePlan);
});

test('resolveCodeReviewSubject: LLD approved, plan missing/unapproved -> ok:true, approvedPlan null (mode B)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedPlan: () => { throw new ArtifactNotApprovedError('plan not approved'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, fakeLld);
	assert.equal(res.subject.approvedPlan, null);
});

test('resolveCodeReviewSubject: plan approved, LLD missing -> ok:true, approvedLld null (asymmetric)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedLld: () => { throw new ArtifactMissingError('no LLD'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, null);
	assert.equal(res.subject.approvedPlan, fakePlan);
});

test('resolveCodeReviewSubject: both missing/unapproved but changed files present -> ok:true, both null (mode C)', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		requireApprovedLld:  () => { throw new ArtifactMissingError('no LLD'); },
		requireApprovedPlan: () => { throw new ArtifactNotApprovedError('plan not approved'); },
	}));
	assert.equal(res.ok, true);
	if (!res.ok) return;
	assert.equal(res.subject.approvedLld, null);
	assert.equal(res.subject.approvedPlan, null);
	assert.deepEqual(res.subject.changedFiles, ['src/a.ts', 'src/b.ts']);
});

test('resolveCodeReviewSubject: non-Artifact error while resolving a contract propagates (not mapped to null)', async () => {
	await assert.rejects(
		() => resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
			requireApprovedPlan: () => { throw new TypeError('corrupt artifact'); },
		})),
		(err: unknown) => err instanceof TypeError,
	);
});

// ---- no-build-record: git derivation fails — now the ONLY ok:false reason ----

test('resolveCodeReviewSubject: git derivation failure -> no-build-record', async () => {
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		changedFiles: async () => { throw new NoBuildChangesError('not a git repo'); },
	}));
	assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
});

// ---- operator-misconfig: UnregisteredRepoError propagates unchanged ----

test('resolveCodeReviewSubject: UnregisteredRepoError propagates (not collapsed to a reason)', async () => {
	await assert.rejects(
		() => resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
			requireApprovedLld: () => { throw new UnregisteredRepoError('/repo'); },
		})),
		(err: unknown) => err instanceof UnregisteredRepoError,
	);
});

// ---- ac5: read-only — the resolver invokes no write/edit tool ----

test('resolveCodeReviewSubject: read-only — only the injected read seams are called', async () => {
	const calls: string[] = [];
	await resolveCodeReviewSubject('/repo', 'epic', 's1', {
		requireApprovedLld:  () => { calls.push('lld'); return fakeLld; },
		requireApprovedPlan: () => { calls.push('plan'); return fakePlan; },
		changedFiles:        async () => { calls.push('diff'); return []; },
		readBuildRecord:     () => { calls.push('build'); return null; },
		resolveRangeBase:    () => 'abc',
	});
	// exactly the read seams, no mutation surface exists in the resolver at all
	assert.deepEqual(calls, ['lld', 'plan', 'diff', 'build']);
});

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 s1/t6 — the review measures from the Story's base, leaves
// the workflow's ledger files out, and never loses the ability to start.
//
// T39-T41 use the REAL changedFiles against a real temporary repo: what is under
// test is what git reports, and a faked seam would only echo the fixture.
// ---------------------------------------------------------------------------

interface GitFx { repo: string; git: (...a: string[]) => string; base: string; cleanup: () => void }

/** A base commit, then the Story's work committed on top of it. */
function mkStoryRepo(storyFiles: readonly string[]): GitFx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-cr-subject-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
	const put = (rel: string, body: string): void => { mkdirSync(dirname(join(repo, rel)), { recursive: true }); writeFileSync(join(repo, rel), body); };
	put('before.ts', 'export const b = 1;\n');
	put('.insrc/artifacts/PLAN-x-s1.json', '{"v":1}\n');
	git('add', '-A'); git('commit', '-qm', 'before the Story');
	const base = git('rev-parse', 'HEAD');
	for (const f of storyFiles) put(f, `${f}\n`);
	git('add', '-A'); git('commit', '-qm', 'the Story work');
	return { repo, git, base, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Real git, with the range base supplied by the test. */
function realDeps(base: string | undefined, over: Partial<SubjectDeps> = {}): SubjectDeps {
	return { requireApprovedLld: () => fakeLld, requireApprovedPlan: () => fakePlan, changedFiles: realChangedFiles, resolveRangeBase: () => base, ...over };
}

/** Count the warnings the subject resolver logs while `fn` runs. */
async function warningsDuring(fn: () => Promise<unknown>): Promise<unknown[][]> {
	const seen: unknown[][] = [];
	const l = getLogger('workflow:code-review:subject');
	const orig = l.warn.bind(l);
	(l as unknown as { warn: unknown }).warn = (...a: unknown[]) => { seen.push(a); return orig(...(a as [])); };
	try { await fn(); } finally { (l as unknown as { warn: unknown }).warn = orig; }
	return seen;
}

test('T39: the Story committed and ONLY an approval-stamped artifact json dirty -> changedFiles is exactly the Story\'s source files', async () => {
	const fx = mkStoryRepo(['src/a.ts', 'src/b.ts']);
	try {
		writeFileSync(join(fx.repo, '.insrc/artifacts/PLAN-x-s1.json'), '{"v":2,"status":"approved"}\n');
		assert.deepEqual([...await realChangedFiles(fx.repo)], ['.insrc/artifacts/PLAN-x-s1.json'],
			'fixture precondition: the old derivation reviewed the one dirty ledger file and nothing else');

		const res = await resolveCodeReviewSubject(fx.repo, 'epic', 's1', realDeps(fx.base));
		assert.equal(res.ok, true);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles].sort(), ['src/a.ts', 'src/b.ts']);
	} finally { fx.cleanup(); }
});

test('T39: the Story\'s committed ledger files (artifact json, build-start, rendered docs) are not in the reviewed set either', async () => {
	const fx = mkStoryRepo(['src/a.ts', '.insrc/artifacts/BUILD-x-s1.json', '.insrc/build-start/x-s1.json', 'docs/standalone/x-E1/S001/BUILD.md', 'docs/epics/y-E1/S001/LLD.md']);
	try {
		const res = await resolveCodeReviewSubject(fx.repo, 'epic', 's1', realDeps(fx.base));
		assert.equal(res.ok, true);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles], ['src/a.ts']);
	} finally { fx.cleanup(); }
});

test('T40: a Story that edited .insrc/artifacts/templates/t.json (and other user-authored .insrc files) keeps them in changedFiles', async () => {
	const user = ['.insrc/artifacts/formats/f.md', '.insrc/artifacts/templates/t.json', '.insrc/conventions/c.md', '.insrc/feedback/fb.md', '.insrc/templates/tp.md'];
	const fx = mkStoryRepo([...user, 'src/a.ts']);
	try {
		const res = await resolveCodeReviewSubject(fx.repo, 'epic', 's1', realDeps(fx.base));
		assert.equal(res.ok, true);
		if (!res.ok) return;
		assert.deepEqual([...res.subject.changedFiles].sort(), [...user, 'src/a.ts'].sort());
	} finally { fx.cleanup(); }
});

test('T41: a base naming a commit that does not exist -> no-build-record, never the working tree, and exactly one warning (ISSUE-b97752e9)', async () => {
	const fx = mkStoryRepo(['src/a.ts']);
	try {
		writeFileSync(join(fx.repo, 'unrelated.ts'), 'x\n');
		fx.git('add', 'unrelated.ts');
		let res: Awaited<ReturnType<typeof resolveCodeReviewSubject>> | undefined;
		const warned = await warningsDuring(async () => { res = await resolveCodeReviewSubject(fx.repo, 'epic', 's1', realDeps('1'.repeat(40))); });
		assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
		assert.equal(warned.length, 1);
	} finally { fx.cleanup(); }
});

test('T41: with NO resolvable base the review declines and the changed-file seam is never called — no base is invented', async () => {
	const calls: unknown[] = [];
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		resolveRangeBase: () => undefined,
		changedFiles: async (_r, opts) => { calls.push(opts); return ['src/a.ts']; },
	}));
	assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
	assert.deepEqual(calls, []);
});

test('the resolver is asked for THIS Story\'s base, and that base plus the ledger globs reach the seam', async () => {
	const asked: unknown[] = [];
	const calls: unknown[] = [];
	await resolveCodeReviewSubject('/repo', 'epic-h', 'S007', deps({
		resolveRangeBase: (...a) => { asked.push(a); return 'abc'; },
		changedFiles: async (_r, opts) => { calls.push(opts); return []; },
	}));
	assert.deepEqual(asked, [['/repo', 'epic-h', 'S007']]);
	assert.equal(calls.length, 1);
	const { onAttribution, ...rest } = calls[0] as { onAttribution?: unknown };
	assert.deepEqual(rest, { base: 'abc', excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: 'epic-h/S007' });
	assert.equal(typeof onAttribution, 'function');
});

test('T43: a seam that throws on the anchored derivation -> no-build-record after ONE attempt; there is no plainer one', async () => {
	let n = 0;
	const res = await resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
		resolveRangeBase: () => 'abc',
		changedFiles: async () => { n++; throw new NoBuildChangesError('not a git repo'); },
	}));
	assert.deepEqual(res, { ok: false, reason: 'no-build-record' });
	assert.equal(n, 1);
});

test('T43: an error that is NOT a derivation failure propagates from the first attempt — it is not swallowed by the fallback', async () => {
	let n = 0;
	await assert.rejects(
		() => resolveCodeReviewSubject('/repo', 'epic', 's1', deps({
			resolveRangeBase: () => 'abc',
			changedFiles: async () => { n++; throw new TypeError('a bug, not a git failure'); },
		})),
		(e: unknown) => e instanceof TypeError,
	);
	assert.equal(n, 1, 'no retry on an unexpected error');
});

// ---------------------------------------------------------------------------
// ISSUE-1102dc71 s1/t1 — the default deps read the Story's BUILD and TESTS
// records onto the subject, so the coverage dimension can judge pass-state.
// ---------------------------------------------------------------------------

test('the default deps read the Story\'s BUILD and TESTS records onto the subject; an absent or misshapen record is null and the subject is still built', async () => {
	const fx = mkStoryRepo(['src/story.ts']);
	try {
		// The production base resolver needs the Story's build start: stamp it at the base.
		fx.git('checkout', '-q', fx.base);
		assert.equal(stampBuildStart(fx.repo, 'abcdef0123456789', 's9'), 'stamped');
		fx.git('checkout', '-q', '-');

		const artifacts = join(fx.repo, '.insrc', 'artifacts');
		const build = { meta: { workflow: 'build', epicHash: 'abcdef0123456789', storyId: 's9', createdAt: '2026-10-17T00:00:00.000Z' }, body: { tasks: [{ id: 't1', passed: true }] } };
		const tests = { meta: { workflow: 'tests', epicHash: 'abcdef0123456789', storyId: 's9', createdAt: '2026-10-17T00:00:00.000Z', updatedAt: '2026-10-17T00:00:00.000Z' },
			body: { tasks: [{ taskId: 't1', ranAt: '2026-10-17T00:00:00.000Z', testsPassed: true, tests: [], files: [] }] } };
		writeFileSync(join(artifacts, 'BUILD-abcdef0123456789-s9.json'), JSON.stringify(build));
		writeFileSync(join(artifacts, 'TESTS-abcdef0123456789-s9.json'), JSON.stringify(tests));

		// No deps argument: the production defaults (s9 has no LLD or PLAN, so both are null).
		const res = await resolveCodeReviewSubject(fx.repo, 'abcdef0123456789', 's9');
		assert.ok(res.ok);
		assert.deepEqual(res.subject.buildRecord, build);
		assert.deepEqual(res.subject.testRecord, tests);

		// Misshapen BUILD json, each way, is null; an unreadable TESTS json is null; the subject is still built.
		writeFileSync(join(artifacts, 'TESTS-abcdef0123456789-s9.json'), '{ not json');
		const meta = build.meta;
		for (const [label, rec] of [
			['no epicHash/storyId', { meta: { workflow: 'build' }, body: {} }],
			['an array body', { meta, body: [] }],
			['another Story', { meta: { ...meta, storyId: 'S010' }, body: {} }],
			['not a build record', { meta: { ...meta, workflow: 'tests' }, body: {} }],
			['tasks not an array', { meta, body: { tasks: {} } }],
			['a task without an id', { meta, body: { tasks: [{ passed: true }] } }],
			['a non-boolean passed', { meta, body: { tasks: [{ id: 't1', passed: 'yes' }] } }],
		] as const) {
			writeFileSync(join(artifacts, 'BUILD-abcdef0123456789-s9.json'), JSON.stringify(rec));
			const bad = await resolveCodeReviewSubject(fx.repo, 'abcdef0123456789', 's9');
			assert.ok(bad.ok, label);
			assert.equal(bad.subject.buildRecord, null, label);
			assert.equal(bad.subject.testRecord, null, label);
		}

		// Absent records are null too, and the absent BUILD record is warned about.
		rmSync(join(artifacts, 'BUILD-abcdef0123456789-s9.json'));
		rmSync(join(artifacts, 'TESTS-abcdef0123456789-s9.json'));
		let none!: Awaited<ReturnType<typeof resolveCodeReviewSubject>>;
		const warned = await warningsDuring(async () => { none = await resolveCodeReviewSubject(fx.repo, 'abcdef0123456789', 's9'); });
		assert.ok(warned.some(w => String(w[1] ?? w[0]).includes('no BUILD record')), 'an absent BUILD record is warned about');
		assert.ok(none.ok);
		assert.equal(none.subject.buildRecord, null);
		assert.equal(none.subject.testRecord, null);
	} finally { fx.cleanup(); }
});
