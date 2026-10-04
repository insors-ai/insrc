/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-93081bff91ae5108 / S001 / t6 — the Story range-base resolver.
 *
 * Run: npx tsx --test src/workflow/runners/build/__tests__/range-base.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildStartRelPath, readBuildStart, resolveStoryRangeBase, stampBuildStart } from '../range-base.js';
import { ARTIFACTS_DIR, buildArtifactId, lldArtifactId, planArtifactId } from '../../../storage.js';

const HASH = 'abc123def4567890';
const SHA40 = /^[0-9a-f]{40}$/;

function mkRepo(): { repo: string; git: (...a: string[]) => string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-rangebase-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8' }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
	writeFileSync(join(repo, 'seed.ts'), 'export const s = 1;\n');
	git('add', '.'); git('commit', '-qm', 'seed');
	return { repo, git, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

/** Write an artifact json with the given meta. */
function seedArtifact(repo: string, artifactId: string, meta: Record<string, unknown>): string {
	const rel = `${ARTIFACTS_DIR}/${artifactId}.json`;
	const abs = join(repo, rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, JSON.stringify({ meta, body: {} }, null, 2) + '\n');
	return rel;
}

// ---------------------------------------------------------------------------
// 1. the STAMPED base wins
// ---------------------------------------------------------------------------

test('t6: the STAMPED base on the PLAN is used, without needing the artifact committed', () => {
	const s = mkRepo();
	try {
		const stamped = 'a'.repeat(40);
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: stamped });
		// Deliberately NOT committed — this is the state that defeats a
		// history-based lookup, and the stamp exists precisely for it.
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), stamped);
	} finally { s.cleanup(); }
});

test('t6: a STANDALONE story resolves from its LLD stamp when there is no PLAN', () => {
	const s = mkRepo();
	try {
		const stamped = 'b'.repeat(40);
		seedArtifact(s.repo, lldArtifactId(HASH, 'S001'), { workflow: 'design.story', standalone: true, rangeBase: stamped });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), stamped);
	} finally { s.cleanup(); }
});

test('t6: the PLAN stamp takes PRECEDENCE over the LLD stamp — one chain, one base', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: 'c'.repeat(40) });
		seedArtifact(s.repo, lldArtifactId(HASH, 's1'), { workflow: 'design.story', rangeBase: 'd'.repeat(40) });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), 'c'.repeat(40),
			'the PLAN is the nearer upstream, so its base wins');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// 2. the PLAN-INTRODUCING-COMMIT fallback (the pre-stamp records)
// ---------------------------------------------------------------------------

test('t6: a LEGACY record with NO stamp resolves via the PLAN-INTRODUCING COMMIT — the bfe98ff7 s4 repair method', () => {
	const s = mkRepo();
	try {
		// A plan with no rangeBase, COMMITTED — exactly the shape of the 648
		// artifacts written before the stamp existed.
		const rel = seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan' });
		s.git('add', '-A'); s.git('commit', '-qm', 'docs(workflow): PLAN approved');
		const planCommit = s.git('rev-parse', 'HEAD');
		// The Story's work lands AFTER.
		writeFileSync(join(s.repo, 'work.ts'), 'export const w = 1;\n');
		s.git('add', '-A'); s.git('commit', '-qm', 'the Story work');

		const base = resolveStoryRangeBase(s.repo, HASH, 's1');
		assert.match(String(base), SHA40);
		assert.equal(base, planCommit,
			'the base is the introducing commit ITSELF, not its parent: base..HEAD excludes base, and the work lands after the plan was committed');
		// And it genuinely bounds the Story's work.
		const ranged = s.git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
		assert.deepEqual(ranged, ['work.ts'], 'base..HEAD is exactly the Story\'s work');
		assert.ok(rel.length > 0);
	} finally { s.cleanup(); }
});

test('t6: an APPROVED-BUT-UNCOMMITTED plan with no stamp yields UNDEFINED, not an error — the state this Story\'s own LLD was in', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', approvedAt: '2026-10-02T00:00:00.000Z' });
		// Never committed, and no stamp (a pre-t5 approval).
        let out: string | undefined | 'threw';
        try { out = resolveStoryRangeBase(s.repo, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined, 'no stamp + never committed → undefined, and emphatically not a throw');
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// 3. honest absence — the deliberate divergence from the HEAD^ chain
// ---------------------------------------------------------------------------

test('t6: NO upstream at all (the TRIVIAL route) yields undefined — the specified outcome, not a failure', () => {
	const s = mkRepo();
	try {
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), undefined,
			'a trivial build has no plan and no LLD, so there is nothing to stamp or locate');
	} finally { s.cleanup(); }
});

test('t6: the resolver NEVER substitutes HEAD^ or the empty-tree object — the divergence from the code-review chain', () => {
	const s = mkRepo();
	try {
		writeFileSync(join(s.repo, 'later.ts'), 'export const l = 1;\n');
		s.git('add', '-A'); s.git('commit', '-qm', 'a second commit, so HEAD^ EXISTS and would resolve');
		const headParent = s.git('rev-parse', 'HEAD^');
		const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

		const base = resolveStoryRangeBase(s.repo, HASH, 's1');
		assert.equal(base, undefined, 'still undefined');
		assert.notEqual(base, headParent, 'NOT HEAD^ — that would silently describe the last commit as the Story\'s work');
		assert.notEqual(base, emptyTree, 'NOT the empty-tree object — that would describe the whole history');
	} finally { s.cleanup(); }
});

test('t6: git UNAVAILABLE / a non-git directory yields undefined without throwing', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-nogit-rb-'));
	try {
		seedArtifact(dir, planArtifactId(HASH, 's1'), { workflow: 'plan' });   // no stamp
		let out: string | undefined | 'threw';
		try { out = resolveStoryRangeBase(dir, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined, 'the git lookup failing must not throw out of the resolver');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// 4. malformed / empty inputs
// ---------------------------------------------------------------------------

test('t6: an EMPTY-STRING stamp is treated as absent and falls through to the commit lookup', () => {
	const s = mkRepo();
	try {
		seedArtifact(s.repo, planArtifactId(HASH, 's1'), { workflow: 'plan', rangeBase: '' });
		s.git('add', '-A'); s.git('commit', '-qm', 'PLAN approved');
		const planCommit = s.git('rev-parse', 'HEAD');
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 's1'), planCommit,
			'an empty stamp is not a base — fall through rather than persist a malformed range');
	} finally { s.cleanup(); }
});

test('t6: a MALFORMED artifact json is treated as absent rather than throwing', () => {
	const s = mkRepo();
	try {
		const abs = join(s.repo, ARTIFACTS_DIR, `${planArtifactId(HASH, 's1')}.json`);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, '{ not valid json');
		let out: string | undefined | 'threw';
		try { out = resolveStoryRangeBase(s.repo, HASH, 's1'); } catch { out = 'threw'; }
		assert.equal(out, undefined);
	} finally { s.cleanup(); }
});

test('t6: an empty epicHash or storyId yields undefined without touching the filesystem or git', () => {
	const s = mkRepo();
	try {
		assert.equal(resolveStoryRangeBase(s.repo, '', 's1'), undefined);
		assert.equal(resolveStoryRangeBase(s.repo, HASH, ''), undefined);
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 S001/t3 — step 0, the build-start file.
//
// Every fixture here ALSO seeds a different approval-time stamp on the PLAN, so
// each assertion distinguishes "the build-start file was used" from "it was
// ignored and the next step answered": with no competing stamp both would return
// the same thing only by accident, or undefined, and prove nothing.
// ---------------------------------------------------------------------------

/** Write a Story's build-start file with arbitrary content. */
function seedBuildStart(repo: string, epicHash: string, storyId: string, content: unknown): string {
	const rel = buildStartRelPath(epicHash, storyId);
	mkdirSync(dirname(join(repo, rel)), { recursive: true });
	writeFileSync(join(repo, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
	return rel;
}

const PLAN_STAMP = 'e'.repeat(40);

/** A repo with two commits and a PLAN stamped with PLAN_STAMP. Returns the
 *  first commit, a real one that a build-start file can legitimately name. */
function mkStampedRepo(): { repo: string; git: (...a: string[]) => string; cleanup: () => void; first: string } {
	const s = mkRepo();
	const first = s.git('rev-parse', 'HEAD');
	writeFileSync(join(s.repo, 'second.ts'), 'export const t = 2;\n');
	s.git('add', '.'); s.git('commit', '-qm', 'second');
	seedArtifact(s.repo, planArtifactId(HASH, 'S001'), { workflow: 'plan', rangeBase: PLAN_STAMP });
	return { ...s, first };
}

test('T18: buildStartRelPath is the one path, outside the artifact store', () => {
	assert.equal(buildStartRelPath(HASH, 'S001'), `.insrc/build-start/${HASH}-S001.json`);
	assert.ok(!buildStartRelPath(HASH, 'S001').startsWith(`${ARTIFACTS_DIR}/`), 'it must not sit where the approval sweep looks');
});

test('T18: a VALID build-start file wins over a different approval-time stamp on the PLAN', () => {
	const s = mkStampedRepo();
	try {
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), PLAN_STAMP, 'fixture precondition: without the file the PLAN stamp answers');
		seedBuildStart(s.repo, HASH, 'S001', { epicHash: HASH, storyId: 'S001', rangeBase: s.first, stampedAt: '2026-10-04T10:00:00.000Z' });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), s.first);
		assert.deepEqual(readBuildStart(s.repo, HASH, 'S001'), {
			kind: 'valid',
			stamp: { epicHash: HASH, storyId: 'S001', rangeBase: s.first, stampedAt: '2026-10-04T10:00:00.000Z' },
		});
	} finally { s.cleanup(); }
});

test('T18: a HAND-WRITTEN file with the four fields is accepted — compact json, extra keys, any key order', () => {
	const s = mkStampedRepo();
	try {
		seedBuildStart(s.repo, HASH, 'S001', `{"stampedAt":"2026-10-04T10:00:00Z","note":"set by hand","rangeBase":"${s.first}","storyId":"S001","epicHash":"${HASH}"}`);
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), s.first);
	} finally { s.cleanup(); }
});

test('T18: one Story\'s build-start file does not answer for another Story of the same epic', () => {
	const s = mkStampedRepo();
	try {
		seedBuildStart(s.repo, HASH, 'S001', { epicHash: HASH, storyId: 'S001', rangeBase: s.first, stampedAt: '2026-10-04T10:00:00.000Z' });
		seedArtifact(s.repo, planArtifactId(HASH, 'S002'), { workflow: 'plan', rangeBase: 'f'.repeat(40) });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S002'), 'f'.repeat(40));
	} finally { s.cleanup(); }
});

test('T19: an invalid build-start file is IGNORED and the approval-time stamp is returned', () => {
	const s = mkStampedRepo();
	try {
		const good = { epicHash: HASH, storyId: 'S001', rangeBase: s.first, stampedAt: '2026-10-04T10:00:00.000Z' };
		const cases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
			['not json',                    '{ this is not json',                              /not json/],
			['a json array',                '[]',                                              /different Story|not a json object/],
			['json null',                   'null',                                            /not a json object/],
			['names another Story',         { ...good, storyId: 'S002' },                      /different Story/],
			['names another epic',          { ...good, epicHash: '0'.repeat(16) },             /different Story/],
			['rangeBase missing',           { epicHash: HASH, storyId: 'S001', stampedAt: good.stampedAt }, /40-hex/],
			['rangeBase abbreviated',       { ...good, rangeBase: s.first.slice(0, 12) },      /40-hex/],
			['rangeBase a ref name',        { ...good, rangeBase: 'HEAD' },                    /40-hex/],
			['stampedAt missing',           { epicHash: HASH, storyId: 'S001', rangeBase: s.first }, /stampedAt/],
			['stampedAt not a time',        { ...good, stampedAt: 'yesterday-ish' },           /stampedAt/],
			['commit not in this repo',     { ...good, rangeBase: '1'.repeat(40) },            /does not have/],
		];
		for (const [name, content, reason] of cases) {
			seedBuildStart(s.repo, HASH, 'S001', content);
			const read = readBuildStart(s.repo, HASH, 'S001');
			assert.equal(read.kind, 'invalid', `${name}: must read as invalid, got ${JSON.stringify(read)}`);
			assert.match((read as { reason: string }).reason, reason, name);
			assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), PLAN_STAMP, `${name}: resolution must continue to the PLAN stamp`);
		}
	} finally { s.cleanup(); }
});

test('T19: a build-start file naming a TREE or BLOB object, not a commit, is invalid', () => {
	const s = mkStampedRepo();
	try {
		const tree = s.git('rev-parse', 'HEAD^{tree}');
		seedBuildStart(s.repo, HASH, 'S001', { epicHash: HASH, storyId: 'S001', rangeBase: tree, stampedAt: '2026-10-04T10:00:00.000Z' });
		assert.equal(readBuildStart(s.repo, HASH, 'S001').kind, 'invalid');
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), PLAN_STAMP);
	} finally { s.cleanup(); }
});

test('T19/T20: with an invalid file and NOTHING else to resolve from, the answer is still undefined — no substituted range', () => {
	const s = mkRepo();
	try {
		seedBuildStart(s.repo, HASH, 'S001', { epicHash: HASH, storyId: 'S001', rangeBase: '1'.repeat(40), stampedAt: '2026-10-04T10:00:00.000Z' });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), undefined);
	} finally { s.cleanup(); }
});

test('T20: with NO build-start file the read is `absent` and resolution is exactly the pre-existing chain', () => {
	const s = mkStampedRepo();
	try {
		assert.deepEqual(readBuildStart(s.repo, HASH, 'S001'), { kind: 'absent' });
		assert.equal(resolveStoryRangeBase(s.repo, HASH, 'S001'), PLAN_STAMP);
	} finally { s.cleanup(); }
});

// ---------------------------------------------------------------------------
// ISSUE-5f7a7cb9 S001/t4 — stampBuildStart and the FINISHED test.
//
// Times are chosen, never sampled: every stamp and every approval in these
// fixtures carries an explicit instant, so "approved after the stamp" is a fact
// of the fixture and not of how fast the test ran. A kept stamp is asserted on
// the file's BYTES, and a replaced one on the sha it now holds.
// ---------------------------------------------------------------------------

const T_STAMP  = '2026-10-04T10:00:00.000Z';
const T_BEFORE = '2026-10-04T09:00:00.000Z';
const T_AFTER  = '2026-10-04T11:00:00.000Z';

interface Fx { repo: string; git: (...a: string[]) => string; cleanup: () => void; first: string; head: string }

/** Two commits; `first` is where a stamp taken at build start would point, and
 *  `head` is where a re-stamp would. They differ, so the two are distinguishable. */
function mkStampRepo(): Fx {
	const s = mkRepo();
	const first = s.git('rev-parse', 'HEAD');
	writeFileSync(join(s.repo, 'work.ts'), 'export const w = 1;\n');
	s.git('add', '.'); s.git('commit', '-qm', 'the Story work');
	return { ...s, first, head: s.git('rev-parse', 'HEAD') };
}

function seedStamp(fx: Fx, storyId = 'S001'): string {
	const rel = seedBuildStart(fx.repo, HASH, storyId, { epicHash: HASH, storyId, rangeBase: fx.first, stampedAt: T_STAMP });
	return readFileSync(join(fx.repo, rel), 'utf8');
}

function seedBuild(fx: Fx, o: { approvedAt?: string; tasks?: unknown }, storyId = 'S001'): void {
	seedArtifact(fx.repo, buildArtifactId(HASH, storyId), { workflow: 'build', epicHash: HASH, storyId, ...(o.approvedAt !== undefined ? { approvedAt: o.approvedAt } : {}) });
	const p = join(fx.repo, ARTIFACTS_DIR, `${buildArtifactId(HASH, storyId)}.json`);
	const doc = JSON.parse(readFileSync(p, 'utf8')) as { body: Record<string, unknown> };
	if (o.tasks !== undefined) doc.body['tasks'] = o.tasks;
	writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
}

function seedPlan(fx: Fx, taskIds: readonly string[], storyId = 'S001'): void {
	seedArtifact(fx.repo, planArtifactId(HASH, storyId), { workflow: 'plan' });
	const p = join(fx.repo, ARTIFACTS_DIR, `${planArtifactId(HASH, storyId)}.json`);
	writeFileSync(p, JSON.stringify({ meta: { workflow: 'plan' }, body: { tasks: taskIds.map(id => ({ id, title: id })) } }, null, 2) + '\n');
}

const stampPath = (fx: Fx, storyId = 'S001'): string => join(fx.repo, buildStartRelPath(HASH, storyId));
const stampOnDisk = (fx: Fx, storyId = 'S001'): { rangeBase: string; epicHash: string; storyId: string; stampedAt: string } =>
	JSON.parse(readFileSync(stampPath(fx, storyId), 'utf8'));
const pass = (...ids: string[]): Array<{ id: string; passed: boolean }> => ids.map(id => ({ id, passed: true }));

/** Assert the outcome is `kept` and the file is byte-for-byte what was seeded. */
function assertKept(fx: Fx, before: string, why: string): void {
	assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'kept', why);
	assert.equal(readFileSync(stampPath(fx), 'utf8'), before, `${why}: the file must be untouched`);
}

/** Assert the outcome is `stamped` and the file now names HEAD, not `first`. */
function assertRestamped(fx: Fx, why: string): void {
	assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped', why);
	assert.equal(stampOnDisk(fx).rangeBase, fx.head, `${why}: the stamp must now be HEAD`);
	assert.notEqual(stampOnDisk(fx).rangeBase, fx.first);
}

/** Assert the outcome is `skipped-work-exists` and no usable file was written. */
function assertSkipped(fx: Fx, why: string): void {
	assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'skipped-work-exists', why);
	assert.notEqual(readBuildStart(fx.repo, HASH, 'S001').kind, 'valid', `${why}: no valid stamp may exist afterwards`);
}

test('T1: no stamp and no BUILD record -> stamped; the file holds HEAD\'s full sha and the Story\'s ids', () => {
	const fx = mkStampRepo();
	try {
		const t0 = Date.now();
		assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped');
		const onDisk = stampOnDisk(fx);
		assert.equal(onDisk.rangeBase, fx.head);
		assert.match(onDisk.rangeBase, SHA40);
		assert.equal(onDisk.epicHash, HASH);
		assert.equal(onDisk.storyId, 'S001');
		assert.ok(Date.parse(onDisk.stampedAt) >= t0 - 1000 && Date.parse(onDisk.stampedAt) <= Date.now() + 1000, 'stampedAt is the time of the call');
		assert.deepEqual(Object.keys(onDisk).sort(), ['epicHash', 'rangeBase', 'stampedAt', 'storyId']);
		// What it wrote is what the resolver then returns.
		assert.equal(resolveStoryRangeBase(fx.repo, HASH, 'S001'), fx.head);
	} finally { fx.cleanup(); }
});

test('T2: a valid stamp, HEAD moved, no BUILD record -> kept; file bytes unchanged', () => {
	const fx = mkStampRepo();
	try { assertKept(fx, seedStamp(fx), 'a retry or the next task must not move the base'); } finally { fx.cleanup(); }
});

test('T3: mid-build approval — plan t1,t2,t3, record has t1 passed and was approved AFTER the stamp -> kept', () => {
	const fx = mkStampRepo();
	try {
		const before = seedStamp(fx);
		seedPlan(fx, ['t1', 't2', 't3']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1') });
		assertKept(fx, before, 'an approval that arrives while tasks remain is not the end of the build');
	} finally { fx.cleanup(); }
});

test('T4: a record approved after the stamp whose one task has passed FALSE, or passed ABSENT -> kept', () => {
	for (const task of [{ id: 'S001', passed: false }, { id: 'S001' }, { id: 'S001', passed: 'true' }, { id: 'S001', passed: 1 }]) {
		const fx = mkStampRepo();
		try {
			const before = seedStamp(fx);
			seedBuild(fx, { approvedAt: T_AFTER, tasks: [task] });
			assertKept(fx, before, `task=${JSON.stringify(task)}: only a literal passed:true counts`);
		} finally { fx.cleanup(); }
	}
});

test('T4 (mixed): EVERY task must have passed — one passed and one failed, plan covered, approved after the stamp -> kept', () => {
	const fx = mkStampRepo();
	try {
		const before = seedStamp(fx);
		seedPlan(fx, ['t1', 't2']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: [{ id: 't1', passed: true }, { id: 't2', passed: false }] });
		assertKept(fx, before, 'a single passed task does not finish a build whose other task failed');
	} finally { fx.cleanup(); }
});

test('T5: a record approved after the stamp but TASK-LESS -> kept', () => {
	for (const tasks of [undefined, []]) {
		const fx = mkStampRepo();
		try {
			const before = seedStamp(fx);
			seedBuild(fx, { approvedAt: T_AFTER, ...(tasks !== undefined ? { tasks } : {}) });
			assertKept(fx, before, `tasks=${JSON.stringify(tasks)}`);
		} finally { fx.cleanup(); }
	}
});

test('T6: a FINISHED plan-driven build (plan t1,t2; both passed; approved after the stamp) -> stamped at the new HEAD', () => {
	const fx = mkStampRepo();
	try {
		seedStamp(fx);
		seedPlan(fx, ['t1', 't2']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1', 't2') });
		assertRestamped(fx, 'a rebuild of a finished Story starts a new range');
	} finally { fx.cleanup(); }
});

test('T7: a FINISHED standalone build (no PLAN; one passed task; approved after the stamp) -> stamped', () => {
	const fx = mkStampRepo();
	try {
		seedStamp(fx);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('S001') });
		assertRestamped(fx, 'no plan means the recorded task is the whole Story');
	} finally { fx.cleanup(); }
});

test('T8: a planned Story validated as a WHOLE (plan t1,t2; record holds a passed task whose id is the storyId) -> stamped', () => {
	const fx = mkStampRepo();
	try {
		seedStamp(fx);
		seedPlan(fx, ['t1', 't2']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('S001') });
		assertRestamped(fx, 'a whole-Story validation covers the plan');
	} finally { fx.cleanup(); }
});

test('T8 (contrast): a passed task that is neither a plan task nor the storyId does NOT cover the plan -> kept', () => {
	const fx = mkStampRepo();
	try {
		const before = seedStamp(fx);
		seedPlan(fx, ['t1', 't2']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('S002') });
		assertKept(fx, before, 'another Story\'s id is not this Story\'s whole-Story task');
	} finally { fx.cleanup(); }
});

test('T9: a finished record approved BEFORE the stamp (or at the same instant, or with no approval, or an unparseable one) -> kept', () => {
	for (const approvedAt of [T_BEFORE, T_STAMP, undefined, 'not-a-time']) {
		const fx = mkStampRepo();
		try {
			const before = seedStamp(fx);
			seedBuild(fx, { ...(approvedAt !== undefined ? { approvedAt } : {}), tasks: pass('S001') });
			assertKept(fx, before, `approvedAt=${String(approvedAt)}`);
		} finally { fx.cleanup(); }
	}
});

test('T10: a PLAN json that is present but malformed makes an otherwise finished record NOT finished -> kept', () => {
	const bodies: unknown[] = ['{ not json', JSON.stringify({ meta: {}, body: {} }), JSON.stringify({ meta: {}, body: { tasks: 'none' } }), JSON.stringify({ meta: {}, body: { tasks: [{ title: 'no id' }] } }), JSON.stringify({ meta: {}, body: { tasks: [null] } })];
	for (const body of bodies) {
		const fx = mkStampRepo();
		try {
			const before = seedStamp(fx);
			seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1', 't2', 'S001') });
			mkdirSync(join(fx.repo, ARTIFACTS_DIR), { recursive: true });
			writeFileSync(join(fx.repo, ARTIFACTS_DIR, `${planArtifactId(HASH, 'S001')}.json`), body as string);
			assertKept(fx, before, `plan=${String(body).slice(0, 40)}`);
		} finally { fx.cleanup(); }
	}
});

test('T11: no stamp and an UNAPPROVED record with one task -> skipped-work-exists, no file', () => {
	const fx = mkStampRepo();
	try {
		seedBuild(fx, { tasks: pass('S001') });
		assertSkipped(fx, 'a build in flight when the change was installed');
		assert.equal(existsSync(stampPath(fx)), false);
	} finally { fx.cleanup(); }
});

test('T12: no stamp and an APPROVED record covering one of three plan tasks -> skipped-work-exists, no file', () => {
	const fx = mkStampRepo();
	try {
		seedPlan(fx, ['t1', 't2', 't3']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1') });
		assertSkipped(fx, 'approval does not turn a half-built Story into a fresh start');
		assert.equal(existsSync(stampPath(fx)), false);
	} finally { fx.cleanup(); }
});

test('T13: no stamp and an APPROVED record whose one task has passed false -> skipped-work-exists, no file', () => {
	const fx = mkStampRepo();
	try {
		seedBuild(fx, { approvedAt: T_AFTER, tasks: [{ id: 'S001', passed: false }] });
		assertSkipped(fx, 'a failed task is unfinished work whatever the approval says');
		assert.equal(existsSync(stampPath(fx)), false);
	} finally { fx.cleanup(); }
});

test('T13 (unreadable record): no stamp and a BUILD record that cannot be parsed -> skipped-work-exists', () => {
	for (const raw of ['{ not json', JSON.stringify({ meta: {}, body: { tasks: 'x' } }), JSON.stringify({ meta: {}, body: { tasks: [{ passed: true }] } })]) {
		const fx = mkStampRepo();
		try {
			mkdirSync(join(fx.repo, ARTIFACTS_DIR), { recursive: true });
			writeFileSync(join(fx.repo, ARTIFACTS_DIR, `${buildArtifactId(HASH, 'S001')}.json`), raw);
			assertSkipped(fx, `record=${raw.slice(0, 30)}: an unreadable record is treated as unfinished work`);
		} finally { fx.cleanup(); }
	}
});

test('T14: no stamp and a FINISHED record -> stamped', () => {
	const fx = mkStampRepo();
	try {
		seedPlan(fx, ['t1', 't2']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1', 't2') });
		assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped');
		assert.equal(stampOnDisk(fx).rangeBase, fx.head);
	} finally { fx.cleanup(); }
});

test('T15: no stamp and a TASK-LESS record, approved or not -> stamped', () => {
	for (const approvedAt of [undefined, T_AFTER]) {
		const fx = mkStampRepo();
		try {
			seedBuild(fx, { ...(approvedAt !== undefined ? { approvedAt } : {}) });
			assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped', `approvedAt=${String(approvedAt)}`);
			assert.equal(stampOnDisk(fx).rangeBase, fx.head);
		} finally { fx.cleanup(); }
	}
});

test('T16: a repo with no commits -> not-written, no file', () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-nocommit-'));
	try {
		execFileSync('git', ['init', '-q'], { cwd: repo });
		assert.equal(stampBuildStart(repo, HASH, 'S001'), 'not-written');
		assert.equal(existsSync(join(repo, buildStartRelPath(HASH, 'S001'))), false);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('T16: a directory that is not a git repo -> not-written, without throwing', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-nogit-'));
	try {
		assert.equal(stampBuildStart(dir, HASH, 'S001'), 'not-written');
		assert.equal(existsSync(join(dir, buildStartRelPath(HASH, 'S001'))), false);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('T16: the build-start directory cannot be created -> not-written, without throwing', () => {
	const fx = mkStampRepo();
	try {
		// A FILE where the directory must go: mkdir fails on every platform, with
		// no reliance on permission bits (which root ignores).
		mkdirSync(join(fx.repo, '.insrc'), { recursive: true });
		writeFileSync(join(fx.repo, '.insrc', 'build-start'), 'in the way\n');
		assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'not-written');
	} finally { fx.cleanup(); }
});

test('T16: an empty epicHash or storyId -> not-written, nothing created', () => {
	const fx = mkStampRepo();
	try {
		assert.equal(stampBuildStart(fx.repo, '', 'S001'), 'not-written');
		assert.equal(stampBuildStart(fx.repo, HASH, ''), 'not-written');
		assert.equal(existsSync(join(fx.repo, '.insrc', 'build-start')), false);
	} finally { fx.cleanup(); }
});

test('T17: an INVALID stamp with no recorded task is replaced by a fresh one; with an unfinished record it is left alone', () => {
	const invalid = (fx: Fx): ReadonlyArray<readonly [string, unknown]> => [
		['malformed',             '{ not json'],
		['names another Story',   { epicHash: HASH, storyId: 'S002', rangeBase: fx.first, stampedAt: T_STAMP }],
		['names a missing commit', { epicHash: HASH, storyId: 'S001', rangeBase: '1'.repeat(40), stampedAt: T_STAMP }],
	];
	for (const i of [0, 1, 2]) {
		// No recorded task: the invalid file is replaced.
		const a = mkStampRepo();
		try {
			const [name, content] = invalid(a)[i]!;
			seedBuildStart(a.repo, HASH, 'S001', content);
			assert.equal(stampBuildStart(a.repo, HASH, 'S001'), 'stamped', `${name}, no record`);
			assert.deepEqual(readBuildStart(a.repo, HASH, 'S001').kind, 'valid');
			assert.equal(stampOnDisk(a).rangeBase, a.head);
		} finally { a.cleanup(); }

		// An unfinished record: nothing is written, and the invalid file stays as it was.
		const b = mkStampRepo();
		try {
			const [name, content] = invalid(b)[i]!;
			const rel = seedBuildStart(b.repo, HASH, 'S001', content);
			const before = readFileSync(join(b.repo, rel), 'utf8');
			seedBuild(b, { approvedAt: T_AFTER, tasks: [{ id: 'S001', passed: false }] });
			assert.equal(stampBuildStart(b.repo, HASH, 'S001'), 'skipped-work-exists', `${name}, unfinished record`);
			assert.equal(readFileSync(join(b.repo, rel), 'utf8'), before);
		} finally { b.cleanup(); }
	}
});

test('T1/T2 together: a second call after the first stamp keeps it, even after HEAD moves on', () => {
	const fx = mkStampRepo();
	try {
		assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped');
		const before = readFileSync(stampPath(fx), 'utf8');
		writeFileSync(join(fx.repo, 'more.ts'), 'export const m = 1;\n');
		fx.git('add', 'more.ts'); fx.git('commit', '-qm', 'task 1 of the Story');
		assertKept(fx, before, 'the Story\'s own commit must not pull the base forward');
		assert.equal(resolveStoryRangeBase(fx.repo, HASH, 'S001'), fx.head, 'the base is still where the build started');
	} finally { fx.cleanup(); }
});

test('stampBuildStart never writes or changes an artifact record', () => {
	const fx = mkStampRepo();
	try {
		seedPlan(fx, ['t1']);
		seedBuild(fx, { approvedAt: T_AFTER, tasks: pass('t1') });
		const dir = join(fx.repo, ARTIFACTS_DIR);
		const snapshot = (): Record<string, string> => Object.fromEntries(readdirSync(dir).sort().map(f => [f, readFileSync(join(dir, f), 'utf8')]));
		const before = snapshot();
		assert.equal(stampBuildStart(fx.repo, HASH, 'S001'), 'stamped');
		assert.deepEqual(snapshot(), before);
	} finally { fx.cleanup(); }
});

test('T21: range-base.ts has no RUNTIME import of gates.ts (type-only imports excluded)', () => {
	const src = readFileSync(new URL('../range-base.ts', import.meta.url), 'utf8');
	const gatesImports = src.split('\n').filter(l => /from\s+['"][^'"]*\/gates\.js['"]/.test(l) || /import\(\s*['"][^'"]*\/gates\.js['"]\s*\)/.test(l));
	assert.ok(gatesImports.length > 0, 'fixture precondition: the module does reference gates.js (type-only), so this scan can see a gates import');
	for (const line of gatesImports) {
		assert.match(line, /^\s*import\s+type\s/, `a runtime import of gates would be a cycle through completion-record: ${line.trim()}`);
	}
});
