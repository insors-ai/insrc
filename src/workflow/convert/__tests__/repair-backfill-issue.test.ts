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
