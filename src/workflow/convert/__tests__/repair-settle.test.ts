/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The settle step of a repair: an approval older than the completion rule settles with an attributed override, a later one only by the live
 * rule, and failures part-way are reported exactly and finished by the next run.
 *
 * Run: npx tsx --test src/workflow/convert/__tests__/repair-settle.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import { ArtifactIds } from '../../artifact-ids.js';
import { reviewedBuildFingerprint } from '../../code-review/build-freshness.js';
import { _setSignoffDepsForTests } from '../../team/signoff.js';
import { History } from '../../artifact-core/history.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import { artifactJsonPath, writeAtomic } from '../../storage.js';
import { runRepair } from '../repair.js';
import { COMPLETION_RULE_FROM } from '../settle.js';
import type { ConversionChange, RepairWrite } from '../types.js';
import { legacyRepo } from './legacy-repo.js';
import { AT, H, appendRound, buildAndReview, epicHead, has, head, plan, repository, result, rounds, rows, storyHead, task, tasksHead } from './repair-kit.js';
import type { Repo } from './repair-kit.js';

const STORY = `STORY-${H}-s1`;
const T1 = `TASK-${H}-s1-t1`;
const T2 = `TASK-${H}-s1-t2`;
const TASKS = `TASKS-${H}-s1`;
const LATER = '2026-11-20T00:00:00.000Z';
const log = (repo: string, id: string) => new History(createFileSidecarStore(repo)).log(id);
const statusOf = (repo: string, id: string): string => head(repo, id).meta['lifecycle'].status;

/** An Epic with Story `story`, two Tasks and a passing review; `failing` Tasks have a failed latest round. */
async function ready(r: Repo, story: string, approvedAt: string, failing: string[] = [], override?: string): Promise<void> {
	plan(r, H, story, 'approved', 2);
	storyHead(r, H, story);
	const [one, two] = rows(2) as [never, never];
	task(r, H, story, 't1', one);
	task(r, H, story, 't2', two);
	tasksHead(r, H, story, 1, ['t1', 't2']);
	buildAndReview(r, H, story, [{ id: 't1', passed: true }, { id: 't2', passed: true }], approvedAt, override);
	for (const t of ['t1', 't2']) await appendRound(r.repo, `TASK-${H}-${story}-${t}`, failing.includes(t) ? 'fail' : 'pass');
}

/** Bind the code review to the BUILD as it reads now, after a test has rewritten its head. */
function buildAndReviewLegacyBinding(r: Repo): void {
	const cr = head(r.repo, `CR-${H}-s1`);
	const body = cr.body as { reviews: { buildFingerprint: string }[] };
	body.reviews[0]!.buildFingerprint = reviewedBuildFingerprint(head(r.repo, `BUILD-${H}-s1`));
	r.put(`CR-${H}-s1`, cr.meta, body);
}

/** A store whose head replace fails for files whose name starts with `prefix`, `times` times. */
function failing(prefix: string, times = 1): (path: string, bytes: string) => void {
	let left = times;
	return (path, bytes) => {
		if (left > 0 && basename(path).startsWith(prefix)) { left -= 1; throw new Error(`injected head failure for ${basename(path)}`); }
		writeAtomic(path, bytes);
	};
}

const norm = (id: string): string => id.replace(/-[sS]0*(\d+)\b/g, '-s$1');
const sameUnit = (id: string, change: ConversionChange): boolean => {
	const key = ArtifactIds.parse(norm(id));
	const unit = ArtifactIds.parse(norm(change.artifactId));
	if (key === undefined || unit === undefined || key.epicHash !== unit.epicHash) return false;
	return unit.kind === 'EPIC' ? key.story === undefined : key.story === unit.story;
};
/** The change of the preview a committed write belongs to. */
function belongs(w: RepairWrite, changes: readonly ConversionChange[]): boolean {
	const named = (c: ConversionChange): boolean => norm(c.artifactId) === norm(w.artifactId) || c.detail.includes(w.artifactId) || c.artifactId === w.artifactId;
	const rule = (...rules: string[]) => changes.filter(c => rules.includes(c.rule));
	switch (w.step) {
		case 'rename':        return rule('rename-id', 'repo-rules').some(named);
		case 'stamp':         return rule('stamp-epic-created-at').some(named);
		case 'amendments':    return rule('convert-amendment').some(named);
		case 'feedback':      return rule('convert-feedback').some(named);
		// a flat amendment is listed once, as its conversion: the migration of the head it becomes is part of that change
		case 'migrate':       return rule('migrate-head', 'convert-amendment').some(named);
		case 'units':         return rule('create-epic', 'create-story', 'move-binding', 'set-parent').some(named);
		case 'tasks':         return rule('create-tasks').some(c => sameUnit(w.artifactId, c)) || rule('backfill-round').some(named);
		case 'story-history': return rule('move-story-history').some(named);
		case 'settle':        return rule('settle-unit').some(c => named(c) || sameUnit(w.artifactId, c));
	}
}

test('repair-preview writes nothing, and every write repair makes belongs to a change the preview listed, including proposed head creation, round back-fill and settlement', async () => {
	const l = legacyRepo();
	try {
		const build = join(l.repo, '.insrc', 'artifacts', `BUILD-${H}-S001.json`);
		const stored = JSON.parse(readFileSync(build, 'utf8')) as { meta: Record<string, unknown> };
		writeAtomic(build, JSON.stringify({ ...stored, meta: { ...stored.meta, approvedAt: AT, authoredBy: 'controller' } }, null, 2) + '\n');
		const files = (): Record<string, string> => Object.fromEntries(readdirSync(l.repo, { recursive: true }).map(String).filter(n => !n.startsWith('.git')).sort().flatMap(n => { try { return [[n, readFileSync(join(l.repo, n), 'utf8')]]; } catch { return []; } }));

		const before = files();
		const preview = await runRepair(l.repo, 'repair-preview');
		assert.deepEqual(files(), before, 'the preview writes nothing');
		assert.equal(preview.result, undefined);
		for (const rule of ['create-epic', 'create-story', 'create-tasks', 'settle-unit']) assert.ok(preview.plan.changes.some(c => c.rule === rule), `the preview lists ${rule}`);

		const out = result(await runRepair(l.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		const unmatched = out.written.filter(w => !belongs(w, preview.plan.changes));
		assert.deepEqual(unmatched, []);
		for (const step of ['units', 'tasks', 'settle']) assert.ok(out.written.some(w => w.step === step), `${step} wrote something, so the check above has something to check`);
		assert.equal(statusOf(l.repo, `STORY-${H}-s1`), 'completed');
	} finally { l.done(); }
});

test('repair settles a BUILD approved before COMPLETION_RULE_FROM with the attributed override', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', '2026-11-09T15:59:59.999Z', ['t2']);
		const out = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(out.held, []);
		assert.deepEqual(out.failed, []);
		assert.equal(statusOf(r.repo, STORY), 'completed', 'the failed round does not hold back an approval older than the rule');
		const complete = (await log(r.repo, STORY)).filter(e => e.operation === 'complete');
		assert.equal(complete.length, 1);
		assert.equal(complete[0]?.actor.id, 'insrc:migration');
		assert.deepEqual(complete[0]?.outcome?.data, { codeReviewOverride: 'settled from an approved BUILD' });
		for (const t of [T1, T2]) assert.equal(statusOf(r.repo, t), 'completed', t);
		assert.equal(statusOf(r.repo, `EPIC-${H}`), 'completed');
	} finally { r.done(); }
});

test('repair holds a BUILD approved exactly at COMPLETION_RULE_FROM, and a later one, whose latest round failed, and lists them in result.held', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', COMPLETION_RULE_FROM, ['t2']);
		await ready(r, 's2', LATER, ['t1']);
		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes.filter(c => c.rule === 'settle-unit'), [], 'neither is proposed for settling');
		const out = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(out.failed, []);
		assert.deepEqual(out.held.map(h => h.artifactId).sort(), [STORY, `STORY-${H}-s2`]);
		assert.ok(out.held.find(h => h.artifactId === STORY)?.reason.includes(T2), JSON.stringify(out.held));
		assert.ok(out.held.find(h => h.artifactId === `STORY-${H}-s2`)?.reason.includes(`TASK-${H}-s2-t1`), JSON.stringify(out.held));
		for (const s of [STORY, `STORY-${H}-s2`]) assert.equal(statusOf(r.repo, s), 'draft', s);
		assert.equal(statusOf(r.repo, T2), 'approved', 'its Tasks are left as they are');
	} finally { r.done(); }
});

test('repair completes a later BUILD whose latest round failed when its approval carries a stored explicit override', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', LATER, ['t2'], 'accepted by the owner');
		const preview = await runRepair(r.repo, 'repair-preview');
		assert.ok(preview.plan.changes.some(c => c.rule === 'settle-unit' && c.artifactId === STORY), JSON.stringify(preview.plan.changes));
		const out = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(out.held, []);
		assert.equal(statusOf(r.repo, STORY), 'completed');
		const complete = (await log(r.repo, STORY)).filter(e => e.operation === 'complete');
		assert.equal(complete.length, 1);
		assert.notDeepEqual(complete[0]?.outcome?.data, { codeReviewOverride: 'settled from an approved BUILD' }, 'settled by the live rule, not the migration override');
	} finally { r.done(); }
});

test('failures injected inside nested Task-set creation, settlement and completing a pending operation, after a log append and before head replacement, are recorded accurately and the pending operation is finished on the next run', async () => {
	// nested Task-set creation: the second Task's head fails after its log entry committed
	const nested = repository();
	try {
		epicHead(nested, H);
		plan(nested, H, 's1', 'approved', 2);
		storyHead(nested, H, 's1');
		const out = result(await runRepair(nested.repo, 'repair', { writeHead: failing('TASK-') }));
		assert.equal(out.stoppedAt?.step, 'tasks', JSON.stringify(out.stoppedAt));
		assert.ok(out.written.some(w => w.artifactId === T1 && w.action === 'log-entry'), JSON.stringify(out.written));
		assert.equal(out.written.some(w => w.artifactId === T1 && w.action === 'head'), false);
		const next = result(await runRepair(nested.repo, 'repair'));
		assert.equal(next.stoppedAt, undefined, JSON.stringify(next.stoppedAt));
		assert.ok(next.written.some(w => w.artifactId === T1 && w.action === 'head'), 'the pending head is finished and listed');
		assert.equal((await log(nested.repo, T1)).filter(e => e.operation === 'create').length, 1, 'with no second log entry');
	} finally { nested.done(); }

	// settlement: the Story's own head fails after its log entry committed
	const settling = repository();
	try {
		epicHead(settling, H);
		await ready(settling, 's1', AT);
		const out = result(await runRepair(settling.repo, 'repair', { writeHead: failing('STORY-') }));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		assert.ok(out.written.some(w => w.step === 'settle' && w.artifactId === STORY && w.action === 'log-entry'));
		assert.equal(out.written.some(w => w.step === 'settle' && w.artifactId === STORY && w.action === 'head'), false);
		const next = result(await runRepair(settling.repo, 'repair'));
		assert.equal(statusOf(settling.repo, STORY), 'completed');
		assert.ok(next.written.some(w => w.artifactId === STORY && w.action === 'head'));
		assert.equal((await log(settling.repo, STORY)).filter(e => e.operation === 'complete').length, 1);
	} finally { settling.done(); }

	// completing the pending operation fails again before it succeeds
	const pending = repository();
	try {
		epicHead(pending, H);
		plan(pending, H, 's1', 'approved', 1);
		storyHead(pending, H, 's1');
		const first = result(await runRepair(pending.repo, 'repair', { writeHead: failing('TASKS-') }));
		assert.ok(first.written.some(w => w.artifactId === TASKS && w.action === 'log-entry'));
		const second = result(await runRepair(pending.repo, 'repair', { writeHead: failing('TASKS-') }));
		assert.equal(second.stoppedAt?.step, 'tasks');
		assert.equal(second.written.some(w => w.artifactId === TASKS), false, 'the retry appended nothing and replaced nothing');
		assert.equal(has(pending.repo, TASKS), false);
		const third = result(await runRepair(pending.repo, 'repair'));
		assert.equal(third.stoppedAt, undefined, JSON.stringify(third.stoppedAt));
		assert.deepEqual(third.written.filter(w => w.artifactId === TASKS).map(w => w.action), ['head']);
		assert.equal((await log(pending.repo, TASKS)).filter(e => e.operation === 'create').length, 1);
	} finally { pending.done(); }
});

test('a failure injected after earlier members commit is listed with completedMembers, and the next repair run finishes the unit', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', AT);
		await ready(r, 's2', AT);
		const out = result(await runRepair(r.repo, 'repair', { writeHead: failing(`STORY-${H}-s1`) }));
		assert.equal(out.stoppedAt, undefined);
		assert.equal(out.failed.length, 1, JSON.stringify(out.failed));
		const failure = out.failed[0]!;
		assert.equal(failure.artifactId, STORY);
		assert.match(failure.reason, /injected head failure/);
		assert.ok(failure.completedMembers.includes(T1), JSON.stringify(failure.completedMembers));
		assert.ok(failure.completedMembers.includes(`BUILD-${H}-s1`));
		assert.equal(statusOf(r.repo, `STORY-${H}-s2`), 'completed', 'the other Story went on');

		const next = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(next.failed, []);
		assert.equal(statusOf(r.repo, STORY), 'completed');
		assert.equal(statusOf(r.repo, `EPIC-${H}`), 'completed');
	} finally { r.done(); }
});

test('the preview proposes a later legacy approval the live rule will settle once it is migrated', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', LATER);
		const stored = head(r.repo, `BUILD-${H}-s1`);
		const { lifecycle: _gone, ...legacy } = stored.meta;
		r.put(`BUILD-${H}-s1`, { ...legacy, approvedAt: LATER }, stored.body);
		// the review binds the BUILD as it now reads
		buildAndReviewLegacyBinding(r);

		const preview = await runRepair(r.repo, 'repair-preview');
		assert.ok(preview.plan.changes.some(c => c.rule === 'settle-unit' && c.artifactId === STORY), JSON.stringify(preview.plan.changes.filter(c => c.rule !== 'migrate-head')));
		const out = result(await runRepair(r.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		assert.equal(statusOf(r.repo, STORY), 'completed');
	} finally { r.done(); }
});

test('the preview proposes a later approval whose override or review the migration has yet to bring in', async () => {
	// a legacy override on a BUILD whose latest round failed: migration moves it onto the approval, and only then can the live rule read it
	const overridden = repository();
	try {
		epicHead(overridden, H);
		await ready(overridden, 's1', LATER, ['t2']);
		const stored = head(overridden.repo, `BUILD-${H}-s1`);
		const { lifecycle: _gone, ...legacy } = stored.meta;
		overridden.put(`BUILD-${H}-s1`, { ...legacy, approvedAt: LATER, reviewOverride: { reason: 'accepted', at: LATER } }, stored.body);
		buildAndReviewLegacyBinding(overridden);
		const preview = await runRepair(overridden.repo, 'repair-preview');
		assert.ok(preview.plan.changes.some(c => c.rule === 'settle-unit' && c.artifactId === STORY), 'proposed');
		const out = result(await runRepair(overridden.repo, 'repair'));
		assert.equal(statusOf(overridden.repo, STORY), 'completed', JSON.stringify(out.held));
		assert.deepEqual((await runRepair(overridden.repo, 'repair-preview')).plan.changes.filter(c => c.rule === 'settle-unit'), [], 'nothing is left to propose');
	} finally { overridden.done(); }

	// a code review stored under the uppercase id the rename step has yet to fix
	const renamed = repository();
	try {
		epicHead(renamed, H);
		await ready(renamed, 's1', LATER);
		const cr = head(renamed.repo, `CR-${H}-s1`);
		renamed.put(`CR-${H}-S001`, { ...cr.meta, storyId: 'S001' }, cr.body);
		rmSync(artifactJsonPath(renamed.repo, `CR-${H}-s1`));
		const preview = await runRepair(renamed.repo, 'repair-preview');
		assert.ok(preview.plan.changes.some(c => c.rule === 'settle-unit' && c.artifactId === STORY), JSON.stringify(preview.plan.changes.slice(0, 4)));
	} finally { renamed.done(); }
});

test('an open Epic whose Stories are all completed is in the preview and is settled', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', AT);
		const failed = result(await runRepair(r.repo, 'repair', { writeHead: failing('EPIC-') }));
		assert.equal(statusOf(r.repo, STORY), 'completed', 'control: the Story completed and only the Epic is open');
		assert.equal(failed.failed.length, 1);

		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes.filter(c => c.rule === 'settle-unit').map(c => c.artifactId), [`EPIC-${H}`]);
		result(await runRepair(r.repo, 'repair'));
		assert.equal(statusOf(r.repo, `EPIC-${H}`), 'completed');
	} finally { r.done(); }
});

test('a settlement outcome names the Epic that held or failed, not the Story that walked to it', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		await ready(r, 's1', AT);
		const out = result(await runRepair(r.repo, 'repair', { writeHead: failing('EPIC-') }));
		assert.deepEqual(out.failed.map(f => f.artifactId), [`EPIC-${H}`], JSON.stringify(out.failed));
		assert.match(out.failed[0]!.reason, /injected head failure/);
		assert.ok(out.failed[0]!.completedMembers.includes(`DEF-${H}`), JSON.stringify(out.failed[0]!.completedMembers));
		assert.ok(!out.failed[0]!.completedMembers.includes(T1), 'the members are the Epic\'s own');
	} finally { r.done(); }

	const held = repository();
	try {
		epicHead(held, H);
		await ready(held, 's1', AT);
		_setSignoffDepsForTests({ readPolicy: async () => ({ ok: true, value: { teamMode: true, signoffStages: ['DEF'], claimsEnforced: true, administrators: [], claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true, source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true } } as never }) });
		try {
			const out = result(await runRepair(held.repo, 'repair'));
			assert.equal(statusOf(held.repo, STORY), 'completed');
			assert.deepEqual(out.held.map(h => h.artifactId), [`EPIC-${H}`], JSON.stringify(out.held));
			assert.match(out.held[0]!.reason, /signoff/);
		} finally { _setSignoffDepsForTests(); }
	} finally { held.done(); }
});

test('a second repair lists no changes', async () => {
	const l = legacyRepo();
	try {
		const out = result(await runRepair(l.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		assert.ok(out.written.length > 0, 'control: the first run did something');
		const again = await runRepair(l.repo, 'repair-preview');
		assert.deepEqual(again.plan.changes, []);
		const run = result(await runRepair(l.repo, 'repair'));
		assert.deepEqual(run.written, []);
		assert.deepEqual(run.remaining, []);
	} finally { l.done(); }
});
