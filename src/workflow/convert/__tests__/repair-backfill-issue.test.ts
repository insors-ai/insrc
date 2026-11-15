/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The backfill-issue step of a repair (ISSUE-c5b49ff953a9a295): a headless trivial build gets the ISSUE it lacks, written from its own
 * request text, approved by the migration when the BUILD is approved and left pending when it is not.
 *
 * Run: npx tsx --test src/workflow/convert/__tests__/repair-backfill-issue.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { History } from '../../artifact-core/history.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import { artifactJsonPath } from '../../storage.js';
import { BACKFILL_REASON, backfillRunId } from '../backfill-issue.js';
import { runRepair } from '../repair.js';
import { AT, H, K, has, head, lifecycle, repository, result } from './repair-kit.js';
import type { Repo } from './repair-kit.js';

/** A third hash: a trivial BUILD that is not headless, because an LLD heads it. */
const L = 'aaaabbbbccccdddd';
/** A fourth: a trivial BUILD under an ISSUE a person wrote. */
const M = '1111222233334444';

const log = (repo: string, id: string) => new History(createFileSidecarStore(repo)).log(id);

/** A standalone Trivial BUILD record as the build step wrote it before the change: no head of its own. */
function trivialBuild(r: Repo, hash: string, opts: { approved: boolean; approvedAt?: string; rationale?: string; summary?: string; createdAt?: string }): void {
	const createdAt = opts.createdAt ?? AT;
	r.put(`BUILD-${hash}-s1`, {
		workflow: 'build', epicHash: hash, storyId: 's1', standalone: true, sizeClass: 'trivial', authoredBy: 'controller',
		createdAt, epicCreatedAt: createdAt,
		...(opts.rationale !== undefined ? { triageRationale: opts.rationale } : {}),
		lifecycle: opts.approved ? lifecycle('approved', 1, opts.approvedAt ?? AT) : lifecycle('draft'),
	}, {
		focus: `Raise the limit for ${hash}\n\nThe second paragraph of the request.`, producesLld: false,
		...(opts.summary !== undefined ? { summary: opts.summary } : {}),
		tasks: [{ id: 's1', passed: true }], changeLog: [{ target: { file: 'src/a.ts' } }],
	});
}

/** Two headless trivial BUILDs (H approved, K a draft), one under an LLD (L) and one under a person's ISSUE (M). */
function seeded(): Repo {
	const r = repository();
	trivialBuild(r, H, { approved: true, rationale: 'one constant', summary: 'Raised it.', createdAt: '2026-10-01T06:09:05.570Z' });
	trivialBuild(r, K, { approved: false, createdAt: '2026-10-28T07:11:53.580Z' });
	trivialBuild(r, L, { approved: true });
	r.put(`LLD-${L}-s1`, { workflow: 'design.story', epicHash: L, storyId: 's1', standalone: true, lifecycle: lifecycle('approved') }, { openQuestions: [] });
	trivialBuild(r, M, { approved: true });
	r.put(`ISSUE-${M}`, { workflow: 'issue', issueHash: M, runId: 'wf-person', standalone: true, magnitude: 'small', lifecycle: lifecycle('draft') }, { title: 't', reproduction: 'r', rootCause: 'c', fixIntent: 'f' });
	return r;
}

const files = (repo: string): Record<string, string> => Object.fromEntries(readdirSync(repo, { recursive: true }).map(String).filter(n => !n.startsWith('.git')).sort()
	.flatMap(n => { try { return [[n, readFileSync(join(repo, n), 'utf8')]]; } catch { return []; } }));

test('repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing', async () => {
	const r = seeded();
	try {
		const before = files(r.repo);
		const report = await runRepair(r.repo, 'repair-preview');
		assert.equal(report.result, undefined, 'a preview runs no step');
		const backfill = report.plan.changes.filter(c => c.rule === 'backfill-issue');
		assert.deepEqual(backfill.map(c => c.artifactId), [`ISSUE-${H}`, `ISSUE-${K}`], 'one per headless BUILD; not under an LLD or an existing ISSUE');
		assert.match(backfill[0]!.detail, new RegExp(`from BUILD-${H}-s1, approved by the migration`));
		assert.match(backfill[1]!.detail, new RegExp(`from BUILD-${K}-s1, left pending: the BUILD is not approved`));
		// the backfill is listed before the units that need its ISSUE as the head
		const order = report.plan.changes.map(c => c.rule);
		assert.ok(order.indexOf('backfill-issue') < order.indexOf('create-story'), order.join(', '));
		assert.deepEqual(files(r.repo), before, 'the preview wrote nothing');
	} finally { r.done(); }
});

test('repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none', async () => {
	const r = seeded();
	try {
		const done = result(await runRepair(r.repo, 'repair'));
		assert.equal(done.stoppedAt, undefined, JSON.stringify(done.stoppedAt));
		assert.deepEqual(done.written.filter(w => w.step === 'backfill-issue' && w.action === 'backfilled').map(w => w.artifactId), [`ISSUE-${H}`, `ISSUE-${K}`]);

		// H: the ISSUE carries the BUILD's request, reason and change, under the BUILD's hash and anchor
		const issue = head(r.repo, `ISSUE-${H}`);
		assert.equal(issue.meta['kind'], 'change');
		assert.equal(issue.meta['magnitude'], 'small');
		assert.equal(issue.meta['issueHash'], H);
		assert.equal(issue.meta['runId'], backfillRunId(H));
		assert.equal(issue.meta['createdAt'], '2026-10-01T06:09:05.570Z', 'anchored at the BUILD');
		assert.equal(issue.meta['epicCreatedAt'], '2026-10-01T06:09:05.570Z');
		assert.equal(issue.body['title'], `Raise the limit for ${H}`);
		assert.equal(issue.body['reproduction'], `Raise the limit for ${H}\n\nThe second paragraph of the request.`);
		assert.equal(issue.body['rootCause'], 'one constant');
		assert.equal(issue.body['fixIntent'], 'Raised it.');
		assert.equal(issue.meta['lifecycle'].status, 'approved');
		const approval = (await log(r.repo, `ISSUE-${H}`)).find(e => e.operation === 'approve');
		assert.ok(approval !== undefined, 'the approval is on the log');
		assert.equal(approval.actor.id, 'insrc:migration');
		assert.equal(approval.outcome?.summary, BACKFILL_REASON);
		// the ISSUE document sits in the BUILD's folder
		const md = readdirSync(join(r.repo, 'docs', 'standalone'), { recursive: true }).map(String).filter(n => n.endsWith('ISSUE.md'));
		assert.ok(md.some(n => n.startsWith(`${H}-E20261001`)), md.join(', '));

		// K: a BUILD that is not approved gets its ISSUE, left pending; nothing defaults it
		assert.equal(head(r.repo, `ISSUE-${K}`).meta['lifecycle']?.status ?? 'draft', 'draft');
		assert.equal(head(r.repo, `ISSUE-${K}`).body['rootCause'], 'not recorded');
		assert.equal(head(r.repo, `ISSUE-${K}`).body['fixIntent'], head(r.repo, `BUILD-${K}-s1`).body['focus'], 'no summary: the change is the request');
		// L and M are left alone
		assert.equal(has(r.repo, `ISSUE-${L}`), false);
		assert.equal(head(r.repo, `ISSUE-${M}`).meta['runId'], 'wf-person');

		const again = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(again.plan.changes.filter(c => c.rule === 'backfill-issue'), [], 'a second repair lists none');
		const rerun = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(rerun.written.filter(w => w.step === 'backfill-issue'), [], 'and writes nothing in the step');
	} finally { r.done(); }
});

// ---------------------------------------------------------------------------
// t7: the backfilled Stories are settled by the completion rule, and a run that stops part-way is finished by the next one
// ---------------------------------------------------------------------------

/** After the cutoff of the completion rule: an approval here is settled only by the live rule. */
const LATER = '2026-11-20T00:00:00.000Z';
/** A fifth hash: a headless trivial BUILD approved after the cutoff, with no code review. */
const N = '5555666677778888';

test('repair settles a backfilled Story by the completion rule: one approved before the cutoff completes, one approved after it with no code review is held, and a draft BUILD is not settled', async () => {
	const r = repository();
	try {
		trivialBuild(r, H, { approved: true, approvedAt: AT });            // before COMPLETION_RULE_FROM
		trivialBuild(r, N, { approved: true, approvedAt: LATER });         // after it, and no CR
		trivialBuild(r, K, { approved: false });                           // a draft
		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes.filter(c => c.rule === 'settle-unit').map(c => c.artifactId).sort(), [`EPIC-${H}`, `STORY-${H}-s1`].sort(), 'only the old approval is proposed for settling');

		const done = result(await runRepair(r.repo, 'repair'));
		assert.equal(done.stoppedAt, undefined, JSON.stringify(done.stoppedAt));
		// H completes under its backfilled ISSUE: the Story and the Epic the ISSUE heads
		assert.equal(head(r.repo, `STORY-${H}-s1`).meta['lifecycle'].status, 'completed');
		assert.equal(head(r.repo, `EPIC-${H}`).meta['lifecycle'].status, 'completed');
		// N: its Story exists under the ISSUE now, but the live rule needs a code review, so it is held and says why
		assert.equal(head(r.repo, `ISSUE-${N}`).meta['lifecycle'].status, 'approved');
		assert.equal(head(r.repo, `STORY-${N}-s1`).meta['lifecycle'].status, 'draft');
		const heldN = done.held.find(h => h.artifactId === `STORY-${N}-s1`);
		assert.ok(heldN !== undefined, JSON.stringify(done.held));
		assert.match(heldN.reason, /review/i);
		// K: its ISSUE is pending and its Story is neither settled nor reported held: nothing was approved
		assert.notEqual(head(r.repo, `STORY-${K}-s1`).meta['lifecycle']?.status, 'completed');
		assert.equal(done.held.some(h => h.artifactId.includes(K)), false);
		assert.equal(done.failed.length, 0, JSON.stringify(done.failed));
	} finally { r.done(); }
});

test('a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest', async () => {
	const r = repository();
	try {
		trivialBuild(r, H, { approved: true });
		trivialBuild(r, K, { approved: true });
		// the second ISSUE's write fails once: the run stops in the backfill, before any later step
		let failures = 1;
		const stopped = result(await runRepair(r.repo, 'repair', { backfill: { beforeWrite: id => { if (id === `ISSUE-${K}` && failures-- > 0) throw new Error(`injected failure before ${id}`); } } }));
		assert.equal(stopped.stoppedAt?.step, 'backfill-issue');
		assert.match(stopped.stoppedAt?.reason ?? '', /injected failure before ISSUE-fedcba9876543210/);
		assert.deepEqual(stopped.written.filter(w => w.step === 'backfill-issue' && w.action === 'backfilled').map(w => w.artifactId), [`ISSUE-${H}`], 'what was written is listed');
		assert.equal(has(r.repo, `ISSUE-${K}`), false);
		assert.equal(has(r.repo, `STORY-${H}-s1`), false, 'no later step ran');
		assert.ok(stopped.remaining.some(c => c.rule === 'backfill-issue' && c.artifactId === `ISSUE-${K}`), 'and what is left');
		const firstH = readFileSync(artifactJsonPath(r.repo, `ISSUE-${H}`), 'utf8');

		const rerun = result(await runRepair(r.repo, 'repair'));
		assert.equal(rerun.stoppedAt, undefined, JSON.stringify(rerun.stoppedAt));
		assert.deepEqual(rerun.written.filter(w => w.step === 'backfill-issue' && w.action === 'backfilled').map(w => w.artifactId), [`ISSUE-${K}`], 'only the rest is written');
		assert.equal(readFileSync(artifactJsonPath(r.repo, `ISSUE-${H}`), 'utf8'), firstH, 'the ISSUE written before is not written again');
		assert.equal(head(r.repo, `ISSUE-${K}`).meta['lifecycle'].status, 'approved');
		assert.equal(head(r.repo, `STORY-${H}-s1`).meta['lifecycle'].status, 'completed');
		assert.equal(head(r.repo, `STORY-${K}-s1`).meta['lifecycle'].status, 'completed');
	} finally { r.done(); }
});

test('a backfilled ISSUE whose approval did not happen is approved by the next run, and is not written again', async () => {
	const r = repository();
	try {
		trivialBuild(r, H, { approved: true });
		// an earlier run wrote the ISSUE and stopped before approving it
		await runRepair(r.repo, 'repair', { backfill: { beforeWrite: () => undefined } });
		const issue = head(r.repo, `ISSUE-${H}`);
		r.put(`ISSUE-${H}`, { ...issue.meta, lifecycle: lifecycle('draft') }, issue.body, (issue as unknown as { citations: unknown[] }).citations);
		const preview = await runRepair(r.repo, 'repair-preview');
		const change = preview.plan.changes.find(c => c.rule === 'backfill-issue');
		assert.match(change?.detail ?? '', /^approve: written from BUILD-0123456789abcdef-s1 by an earlier run$/);
		const rerun = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(rerun.written.filter(w => w.action === 'backfilled'), [], 'not written again');
		assert.equal(head(r.repo, `ISSUE-${H}`).meta['lifecycle'].status, 'approved');
	} finally { r.done(); }
});

test('a legacy trivial BUILD not migrated yet: its approvedAt counts as approved, and its ISSUE is written under the renamed record', async () => {
	const r = repository();
	try {
		// as the build step wrote it before the common model: an uppercase Story id and an approval stamp, no lifecycle
		r.put(`BUILD-${H}-S001`, {
			workflow: 'build', epicHash: H, storyId: 'S001', standalone: true, sizeClass: 'trivial', authoredBy: 'controller', approvedAt: AT,
		}, { focus: 'Fix a typo', producesLld: false, tasks: [{ id: 'S001', passed: true }], changeLog: [] });
		const preview = await runRepair(r.repo, 'repair-preview');
		const change = preview.plan.changes.find(c => c.rule === 'backfill-issue');
		assert.equal(change?.artifactId, `ISSUE-${H}`);
		assert.match(change?.detail ?? '', /approved by the migration/);

		const done = result(await runRepair(r.repo, 'repair'));
		assert.equal(done.stoppedAt, undefined, JSON.stringify(done.stoppedAt));
		assert.equal(head(r.repo, `ISSUE-${H}`).meta['lifecycle'].status, 'approved');
		assert.match(String(head(r.repo, `ISSUE-${H}`).body['reproduction']), /Fix a typo/);
	} finally { r.done(); }
});
