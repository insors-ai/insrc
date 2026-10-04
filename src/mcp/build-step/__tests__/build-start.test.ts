/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-5f7a7cb95b643ae5 S001/t5 — the build-start stamp, end to end.
 *
 * These drive the REAL implement and validate phases, the REAL approval gate and
 * REAL git. Only the validate verdict session is faked (it shells out to a CLI).
 *
 * Every change-log assertion is on the EXACT set. `includes()` on one expected
 * file would pass for a log that also lists a sibling's files, which is the
 * defect.
 *
 * A convention the fixtures follow and the assertions depend on: the workflow's
 * own record files (a BUILD record, an approval rewrite) are committed BEFORE
 * the next build starts. The BUILD writers exclude only their own record and
 * their own build-start file, by design; a sibling's uncommitted records swept
 * into this Story's commit would be listed, and that is not what is under test.
 *
 * Run: npx tsx --test src/mcp/build-step/__tests__/build-start.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleBuildStep } from '../handler.js';
import { _setBuildValidateProviderForTests } from '../phases/validate.js';
import { approveArtifactByJsonPath, approveWorkflowTarget } from '../../../workflow/gates.js';
import { ARTIFACTS_DIR, buildArtifactId, lldArtifactId, planArtifactId } from '../../../workflow/storage.js';
import { ensureBuildRecordOnCompletion } from '../../../workflow/runners/build/completion-record.js';
import { buildStartRelPath, readBuildStart, resolveStoryRangeBase } from '../../../workflow/runners/build/range-base.js';

const HASH = 'b7c8d9e0f1a2b3c4';
const CREATED_AT = '2026-07-18T00:00:00.000Z';

interface Fx { repo: string; git: (...a: string[]) => string; cleanup: () => void }

function mkGit(): Fx {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-start-'));
	const git = (...a: string[]): string => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(repo, 'before.ts'), 'export const b = 1;\n');
	git('add', '-A'); git('commit', '-qm', 'before any Story');
	return { repo, git, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const artifact = (fx: Fx, id: string): string => join(fx.repo, ARTIFACTS_DIR, `${id}.json`);

function writeArtifact(fx: Fx, id: string, doc: unknown): string {
	mkdirSync(join(fx.repo, ARTIFACTS_DIR), { recursive: true });
	writeFileSync(artifact(fx, id), JSON.stringify(doc, null, 2) + '\n');
	return artifact(fx, id);
}

/** An epic with `stories`, each with an approved LLD and an UNAPPROVED plan of
 *  `tasks`. Committed, so the tree is clean. */
function seedEpic(fx: Fx, stories: Readonly<Record<string, readonly string[]>>): void {
	writeArtifact(fx, `DEF-${HASH}`, {
		meta: { workflow: 'define', epicHash: HASH, epicSlug: 'range-base', createdAt: CREATED_AT, approvedAt: CREATED_AT },
		body: { problem: 'p', stories: Object.keys(stories).map(id => ({ id, title: `Story ${id}` })) },
		citations: [],
	});
	for (const [storyId, tasks] of Object.entries(stories)) {
		writeArtifact(fx, lldArtifactId(HASH, storyId), {
			meta: {
				workflow: 'design.story', runId: `lld-${storyId}`, schemaVersion: 1,
				epicHash: HASH, epicSlug: 'range-base', storyId, createdAt: CREATED_AT,
				hldBaseRunId: 'hld-1', hldEffectiveHash: `basis-${storyId}`, hldAmendmentsApplied: [],
				approvedAt: CREATED_AT,
			},
			body: { openQuestions: [] }, citations: [],
		});
		writeArtifact(fx, planArtifactId(HASH, storyId), {
			meta: {
				workflow: 'plan', runId: `plan-${storyId}`, schemaVersion: 1,
				epicHash: HASH, epicSlug: 'range-base', storyId, createdAt: CREATED_AT,
				lldRunId: `lld-${storyId}`, lldEffectiveHash: `basis-${storyId}`,
			},
			body: {
				tasks: tasks.map((id, i) => ({
					id, title: `Task ${id}`, summary: 's', size: 'S', order: i + 1, dependsOn: [],
					acceptanceChecks: ['it holds'], derivedFrom: ['c1'], tests: [{ level: 'unit', name: `unit: ${id}` }],
				})),
			},
			citations: [{ id: 'c1', kind: 'prior-artifact', ref: 'LLD' }],
		});
	}
	fx.git('add', '-A'); fx.git('commit', '-qm', 'the epic\'s design artifacts');
}

/** Approve every plan while HEAD stands still — one sweep, one shared
 *  approval-time base — then commit the rewrite so the tree is clean again. */
function approvePlansInOneSweep(fx: Fx, storyIds: readonly string[]): string {
	const sharedBase = fx.git('rev-parse', 'HEAD');
	for (const s of storyIds) approveArtifactByJsonPath(artifact(fx, planArtifactId(HASH, s)));
	for (const s of storyIds) {
		const meta = (JSON.parse(readFileSync(artifact(fx, planArtifactId(HASH, s)), 'utf8')) as { meta: { rangeBase?: string } }).meta;
		assert.equal(meta.rangeBase, sharedBase, `fixture precondition: ${s}'s plan carries the shared approval-time base`);
	}
	fx.git('add', '-A'); fx.git('commit', '-qm', 'approve the plans');
	return sharedBase;
}

function out(env: { content: { type: 'text'; text: string }[] }): Record<string, unknown> {
	return JSON.parse(env.content[0]!.text) as Record<string, unknown>;
}

async function implement(fx: Fx, target: string): Promise<Record<string, unknown>> {
	return out(await handleBuildStep({ phase: 'implement', target, repo: fx.repo }));
}

/** Run the validate phase with a canned passing (or failing) verdict. */
async function validate(fx: Fx, target: string, taskId: string, passed = true): Promise<void> {
	_setBuildValidateProviderForTests({
		async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId, passed }) + '\n```' }; },
	});
	try {
		assert.equal(out(await handleBuildStep({ phase: 'validate', target, repo: fx.repo }))['next'], 'done');
	} finally { _setBuildValidateProviderForTests(undefined); }
}

function buildRecord(fx: Fx, storyId: string): { meta: Record<string, unknown>; body: Record<string, unknown> } {
	return JSON.parse(readFileSync(artifact(fx, buildArtifactId(HASH, storyId)), 'utf8')) as { meta: Record<string, unknown>; body: Record<string, unknown> };
}

const changeLog = (fx: Fx, storyId: string): string[] =>
	((buildRecord(fx, storyId).body['changeLog'] ?? []) as { target: { file: string } }[]).map(e => e.target.file).sort();

/** The Story's work: write `file` and commit. `how` says what rides along. */
function work(fx: Fx, file: string, how: 'everything' | 'source-only'): void {
	writeFileSync(join(fx.repo, file), `export const x = '${file}';\n`);
	if (how === 'everything') fx.git('add', '-A'); else fx.git('add', file);
	fx.git('commit', '-qm', `work: ${file}`);
}

/** Commit whatever records the workflow left behind, so the next build starts clean. */
function commitRecords(fx: Fx, msg: string): void {
	fx.git('add', '-A');
	if (fx.git('status', '--porcelain') !== '') fx.git('commit', '-qm', msg);
}

const stampFile = (fx: Fx, storyId: string): string => join(fx.repo, buildStartRelPath(HASH, storyId));
const stampedBase = (fx: Fx, storyId: string): string => {
	const r = readBuildStart(fx.repo, HASH, storyId);
	assert.equal(r.kind, 'valid', `expected a valid build-start file for ${storyId}, got ${JSON.stringify(r)}`);
	return (r as { stamp: { rangeBase: string } }).stamp.rangeBase;
};

// ---------------------------------------------------------------------------
// T30-T32 — the defect: Stories approved in one sweep
// ---------------------------------------------------------------------------

test('T30/T31: two Stories approved in ONE sweep, built in turn — each change log is EXACTLY its own files (build-start file committed with the work)', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'], s2: ['t1'] });
		const sharedBase = approvePlansInOneSweep(fx, ['s1', 's2']);

		assert.equal((await implement(fx, 's1/t1'))['next'], 'implement');
		const s1Start = fx.git('rev-parse', 'HEAD');
		assert.equal(stampedBase(fx, 's1'), s1Start, 's1 is stamped at the commit its build started from');
		work(fx, 'story-one.ts', 'everything');   // the build-start file rides along (T31)
		assert.ok(fx.git('ls-files').split('\n').includes(buildStartRelPath(HASH, 's1')), 'fixture precondition: s1\'s build-start file is committed inside its range');
		await validate(fx, 's1/t1', 't1');
		assert.deepEqual(changeLog(fx, 's1'), ['story-one.ts']);
		commitRecords(fx, 's1 build record');

		assert.equal((await implement(fx, 's2/t1'))['next'], 'implement');
		const s2Start = fx.git('rev-parse', 'HEAD');
		assert.notEqual(s2Start, sharedBase, 'fixture precondition: HEAD has moved past the shared approval-time base');
		assert.equal(stampedBase(fx, 's2'), s2Start, 's2 is stamped AFTER s1\'s work, not at the shared base');
		assert.equal(resolveStoryRangeBase(fx.repo, HASH, 's2'), s2Start);
		work(fx, 'story-two.ts', 'everything');
		await validate(fx, 's2/t1', 't1');

		assert.deepEqual(changeLog(fx, 's2'), ['story-two.ts'], 's2 must not list its sibling\'s files, nor any build-start file');
		assert.deepEqual(changeLog(fx, 's1'), ['story-one.ts'], 's1\'s record is untouched by s2\'s build');
	} finally { fx.cleanup(); }
});

test('T32: the build-start file left UNCOMMITTED (untracked) with nothing else dirty — the range is still derived, exact set', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		await implement(fx, 's1/t1');
		work(fx, 'story-one.ts', 'source-only');
		assert.ok(fx.git('status', '--porcelain').includes('build-start'), 'fixture precondition: the build-start file is uncommitted');
		await validate(fx, 's1/t1', 't1');
		assert.deepEqual(changeLog(fx, 's1'), ['story-one.ts']);
	} finally { fx.cleanup(); }
});

test('T32 (tracked and modified): a build-start file that is the ONLY dirty tracked path does not stand in for the Story\'s work', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		await implement(fx, 's1/t1');
		const base = stampedBase(fx, 's1');
		work(fx, 'story-one.ts', 'everything');           // the file is now TRACKED
		// Rewrite it in place (same base, new stampedAt), as a hand correction would.
		writeFileSync(stampFile(fx, 's1'), JSON.stringify({ epicHash: HASH, storyId: 's1', rangeBase: base, stampedAt: '2026-10-04T12:00:00.000Z' }, null, 2) + '\n');
		assert.equal(fx.git('diff', '--name-only'), buildStartRelPath(HASH, 's1'), 'fixture precondition: it is the only dirty tracked path');
		await validate(fx, 's1/t1', 't1');
		assert.deepEqual(changeLog(fx, 's1'), ['story-one.ts'], 'the dirty stamp is not evidence of a dirty tree, so the committed range is derived');
	} finally { fx.cleanup(); }
});

// ---------------------------------------------------------------------------
// T33-T35 — approval arriving mid-build, and a rebuild
// ---------------------------------------------------------------------------

test('T33: approval arrives MID-BUILD (two-task Story, BUILD approved after task 1) — the change log is EXACTLY both tasks\' files', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1', 't2'] });
		approvePlansInOneSweep(fx, ['s1']);

		await implement(fx, 's1/t1');
		const start = stampedBase(fx, 's1');
		work(fx, 'task-one.ts', 'everything');
		await validate(fx, 's1/t1', 't1');
		commitRecords(fx, 'build record after t1');

		// A batch approval of the epic, aimed at anything else, sweeps this BUILD record up.
		const swept = await approveWorkflowTarget({ repoPath: fx.repo, epicHash: HASH });
		assert.ok(swept.approved.some(a => a.path.endsWith(`${buildArtifactId(HASH, 's1')}.json`)), 'fixture precondition: the sweep approved the half-built Story\'s BUILD record');
		assert.equal(typeof buildRecord(fx, 's1').meta['approvedAt'], 'string');
		commitRecords(fx, 'the approval rewrite');

		await implement(fx, 's1/t2');
		assert.equal(stampedBase(fx, 's1'), start, 'the stamp must not move: the plan\'s second task is not built yet');
		work(fx, 'task-two.ts', 'everything');
		await validate(fx, 's1/t2', 't2');

		assert.deepEqual(changeLog(fx, 's1'), ['task-one.ts', 'task-two.ts']);
	} finally { fx.cleanup(); }
});

test('T34: the same mid-build approval with the build-start file DELETED before task 2 — no file is written and the base is the pre-change one', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1', 't2'] });
		const approvalBase = approvePlansInOneSweep(fx, ['s1']);

		await implement(fx, 's1/t1');
		work(fx, 'task-one.ts', 'source-only');
		await validate(fx, 's1/t1', 't1');
		await approveWorkflowTarget({ repoPath: fx.repo, epicHash: HASH });
		unlinkSync(stampFile(fx, 's1'));
		commitRecords(fx, 'records, with the stamp gone');

		await implement(fx, 's1/t2');
		assert.equal(existsSync(stampFile(fx, 's1')), false, 'an approved but half-built record must not be stamped at HEAD');
		assert.equal(resolveStoryRangeBase(fx.repo, HASH, 's1'), approvalBase, 'the base is what the resolver gave before this change: the plan\'s approval-time stamp');

		work(fx, 'task-two.ts', 'source-only');
		await validate(fx, 's1/t2', 't2');
		// From the approval-time base the range also holds the plan's approval
		// rewrite and the records committed since; the Story's own record is
		// excluded. Both task files are there, which is what a moved base would lose.
		const log = changeLog(fx, 's1');
		assert.ok(log.includes('task-one.ts') && log.includes('task-two.ts'), `both tasks' files must be listed, got ${JSON.stringify(log)}`);
		assert.deepEqual(log, [`${ARTIFACTS_DIR}/${planArtifactId(HASH, 's1')}.json`, 'task-one.ts', 'task-two.ts'].sort());
	} finally { fx.cleanup(); }
});

test('T35: a REBUILD of a finished, approved Story lists EXACTLY the rebuild\'s files', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		await implement(fx, 's1/t1');
		const firstStart = stampedBase(fx, 's1');
		work(fx, 'first-build.ts', 'everything');
		await validate(fx, 's1/t1', 't1');
		assert.deepEqual(changeLog(fx, 's1'), ['first-build.ts']);
		commitRecords(fx, 'build record');
		approveArtifactByJsonPath(artifact(fx, buildArtifactId(HASH, 's1')));   // the Story is complete
		commitRecords(fx, 'BUILD approved');

		await implement(fx, 's1/t1');
		const rebuildStart = fx.git('rev-parse', 'HEAD');
		assert.notEqual(rebuildStart, firstStart);
		assert.equal(stampedBase(fx, 's1'), rebuildStart, 'a finished, approved build re-stamps at the rebuild\'s start');
		work(fx, 'rebuild.ts', 'everything');             // the re-stamped (tracked, modified) file rides along
		await validate(fx, 's1/t1', 't1');
		assert.deepEqual(changeLog(fx, 's1'), ['rebuild.ts']);
	} finally { fx.cleanup(); }
});

// ---------------------------------------------------------------------------
// T36 — no approvable record earlier than before
// ---------------------------------------------------------------------------

test('T36 (plan-driven): implement writes NO BUILD record, and a batch approval then approves none for the Story', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		await implement(fx, 's1/t1');
		assert.equal(readBuildStart(fx.repo, HASH, 's1').kind, 'valid', 'the build did start');
		assert.equal(existsSync(artifact(fx, buildArtifactId(HASH, 's1'))), false, 'no BUILD record until validate');
		// Everything under the epic is already approved, and the build-start file
		// is not an artifact, so the sweep finds NOTHING pending. (T33 shows the
		// same sweep does approve a BUILD record once one exists.)
		await assert.rejects(
			() => approveWorkflowTarget({ repoPath: fx.repo, epicHash: HASH }),
			(e: unknown) => e instanceof Error && e.name === 'NoPendingArtifactsError',
			'the sweep must find no pending artifact: nothing to complete',
		);
		assert.equal(existsSync(artifact(fx, buildArtifactId(HASH, 's1'))), false);
	} finally { fx.cleanup(); }
});

const SMALL = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'small' };
const TRIVIAL = { standalone: true as const, epicHash: HASH, storyId: 's1', sizeClass: 'trivial', focus: 'Add a flag.' };

function seedStandaloneLld(fx: Fx): void {
	writeArtifact(fx, lldArtifactId(HASH, 's1'), {
		meta: {
			workflow: 'design.story', runId: 'lld-s1', schemaVersion: 1,
			epicHash: HASH, epicSlug: 'range-base', storyId: 's1', createdAt: CREATED_AT,
			standalone: true, approvedAt: CREATED_AT,
		},
		body: { openQuestions: [] }, citations: [],
	});
	fx.git('add', '-A'); fx.git('commit', '-qm', 'the standalone LLD');
}

test('T36 (Small route): implement stamps and writes NO BUILD record; a batch approval approves none', async () => {
	const fx = mkGit();
	try {
		seedStandaloneLld(fx);
		const res = out(await handleBuildStep({ phase: 'implement', target: 's1', repo: fx.repo, standalone: SMALL }));
		assert.equal(res['next'], 'implement');
		assert.equal(stampedBase(fx, 's1'), fx.git('rev-parse', 'HEAD'));
		assert.equal(existsSync(artifact(fx, buildArtifactId(HASH, 's1'))), false);
		await assert.rejects(
			() => approveWorkflowTarget({ repoPath: fx.repo, epicHash: HASH }),
			(e: unknown) => e instanceof Error && e.name === 'NoPendingArtifactsError',
		);
	} finally { fx.cleanup(); }
});

// ---------------------------------------------------------------------------
// The Trivial route, and fail-open
// ---------------------------------------------------------------------------

test('Trivial route: the first implement stamps HEAD and writes its task-less record; a second implement keeps the stamp', async () => {
	const fx = mkGit();
	try {
		const first = out(await handleBuildStep({ phase: 'implement', target: 's1', repo: fx.repo, standalone: TRIVIAL }));
		assert.equal(first['next'], 'implement');
		const start = fx.git('rev-parse', 'HEAD');
		assert.equal(stampedBase(fx, 's1'), start);
		const rec = buildRecord(fx, 's1');
		assert.equal(rec.body['tasks'], undefined, 'the Trivial record is task-less');

		const bytes = readFileSync(stampFile(fx, 's1'), 'utf8');
		work(fx, 'trivial-work.ts', 'source-only');
		const second = out(await handleBuildStep({ phase: 'implement', target: 's1', repo: fx.repo, standalone: TRIVIAL }));
		assert.equal(second['next'], 'implement');
		assert.equal(readFileSync(stampFile(fx, 's1'), 'utf8'), bytes, 'the task-less record must not trigger a re-stamp or a skip');

		// The Trivial route had no base before; with the stamp it records its work.
		_setBuildValidateProviderForTests({ async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; } });
		try { await handleBuildStep({ phase: 'validate', target: 's1', repo: fx.repo, standalone: TRIVIAL }); } finally { _setBuildValidateProviderForTests(undefined); }
		assert.deepEqual(changeLog(fx, 's1'), ['trivial-work.ts']);
	} finally { fx.cleanup(); }
});

test('fail-open: a stamp that cannot be written leaves the implement result unchanged on every route', async () => {
	// Block the directory with a FILE, so stampBuildStart reports not-written.
	const block = (fx: Fx): void => { mkdirSync(join(fx.repo, '.insrc'), { recursive: true }); writeFileSync(join(fx.repo, '.insrc', 'build-start'), 'in the way\n'); };
	const unblock = (fx: Fx): void => { unlinkSync(join(fx.repo, '.insrc', 'build-start')); };

	const planDriven = mkGit();
	try {
		seedEpic(planDriven, { s1: ['t1'] });
		approvePlansInOneSweep(planDriven, ['s1']);
		block(planDriven);
		const blocked = await implement(planDriven, 's1/t1');
		assert.equal(blocked['next'], 'implement', 'the build is not refused or failed');
		assert.equal(readBuildStart(planDriven.repo, HASH, 's1').kind, 'absent', 'fixture precondition: nothing was stamped');
		unblock(planDriven);
		assert.deepEqual(blocked, await implement(planDriven, 's1/t1'), 'the same result as an implement that could stamp');
		assert.equal(readBuildStart(planDriven.repo, HASH, 's1').kind, 'valid');
	} finally { planDriven.cleanup(); }

	for (const standalone of [SMALL, TRIVIAL]) {
		const fx = mkGit();
		try {
			if (standalone === SMALL) seedStandaloneLld(fx);
			block(fx);
			const blocked = out(await handleBuildStep({ phase: 'implement', target: 's1', repo: fx.repo, standalone }));
			assert.equal(blocked['next'], 'implement', `${standalone.sizeClass}: not refused or failed`);
			unblock(fx);
			assert.deepEqual(blocked, out(await handleBuildStep({ phase: 'implement', target: 's1', repo: fx.repo, standalone })), `${standalone.sizeClass}: same result`);
		} finally { fx.cleanup(); }
	}
});

test('a REFUSED implement stamps nothing', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });                      // the plan is NOT approved
		assert.equal((await implement(fx, 's1/t1'))['next'], 'refused');
		assert.equal(readBuildStart(fx.repo, HASH, 's1').kind, 'absent', 'a build that was not admitted has not started');
	} finally { fx.cleanup(); }
});

// ---------------------------------------------------------------------------
// T37 — the completion writer; T38 — no base
// ---------------------------------------------------------------------------

test('T37: the completion writer excludes a COMMITTED build-start file — exact set', async () => {
	const fx = mkGit();
	try {
		seedEpic(fx, { s1: ['t1'] });
		approvePlansInOneSweep(fx, ['s1']);
		await implement(fx, 's1/t1');
		work(fx, 'story-one.ts', 'everything');
		assert.ok(fx.git('ls-files').split('\n').includes(buildStartRelPath(HASH, 's1')), 'fixture precondition: the build-start file is in the range');

		const paths = await ensureBuildRecordOnCompletion(fx.repo, { epicHash: HASH, storyId: 's1' });
		assert.ok(paths !== undefined);
		assert.deepEqual(changeLog(fx, 's1'), ['story-one.ts']);
	} finally { fx.cleanup(); }
});

test('T38: no resolvable base and a clean tree -> validate writes an EMPTY change log (no substituted range)', async () => {
	const fx = mkGit();
	try {
		work(fx, 'unrelated.ts', 'everything');
		assert.equal(resolveStoryRangeBase(fx.repo, HASH, 's1'), undefined, 'fixture precondition: no stamp, no upstream artifact');
		_setBuildValidateProviderForTests({ async runEditSession() { return { text: '```json\n' + JSON.stringify({ taskId: 's1', passed: true }) + '\n```' }; } });
		try { await handleBuildStep({ phase: 'validate', target: 's1', repo: fx.repo, standalone: TRIVIAL }); } finally { _setBuildValidateProviderForTests(undefined); }
		assert.equal(buildRecord(fx, 's1').body['changeLog'], undefined);
	} finally { fx.cleanup(); }
});
