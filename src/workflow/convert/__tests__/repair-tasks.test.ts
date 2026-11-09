/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repair creates the units and Tasks a repository is missing, on a repository that is already converted: Stories are found from any
 * record, a plan past approved qualifies, and a BUILD result reaches the Task made from its plan row.
 *
 * Run: npx tsx --test src/workflow/convert/__tests__/repair-tasks.test.ts
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { reviewedBuildFingerprint } from '../../code-review/build-freshness.js';
import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { History } from '../../artifact-core/history.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { writeRepoSchema } from '../../artifact-core/repo-schema.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import { artifactJsonPath } from '../../storage.js';
import { citations } from '../../tasks/__tests__/task-kit.js';
import { threeRows } from '../../tasks/__tests__/task-set-kit.js';
import { taskPayloadFromRow } from '../../tasks/pure.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { runRepair } from '../repair.js';
import type { RepairReport, RepairResult } from '../types.js';

const H = '0123456789abcdef';
const K = 'fedcba9876543210';
const AT = '2026-10-10T00:00:00.000Z';
const BY = { id: 'insrc:system', kind: 'system', properties: {} };
const ACTOR = { id: 'insrc:build', kind: 'system', properties: {} };
type Obj = Record<string, unknown>;

function lifecycle(status: string, number = 1): Obj {
	return { status, revision: { number, contentHash: '', at: AT, by: BY }, signoffs: [], ...(status !== 'draft' ? { approval: { revision: number, by: BY, at: AT } } : {}) };
}
function repository(): { repo: string; put(id: string, meta: Obj, body: Obj, cites?: unknown[]): void; done(): void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-repair-tasks-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	writeRepoSchema(repo, { version: 2, convertedAt: AT });
	return {
		repo,
		put: (id, meta, body, cites = []) => {
			const path = artifactJsonPath(repo, id);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify({ meta: { repoPath: repo, createdAt: AT, epicCreatedAt: AT, revision: 1, ...meta }, body, citations: cites }, null, 2) + '\n');
		},
		done: () => rmSync(repo, { recursive: true, force: true }),
	};
}
type Repo = ReturnType<typeof repository>;
const head = (repo: string, id: string): { meta: Record<string, any>; body: Record<string, any> } => JSON.parse(readFileSync(artifactJsonPath(repo, id), 'utf8'));
const has = (repo: string, id: string): boolean => existsSync(artifactJsonPath(repo, id));
const result = (r: RepairReport): RepairResult => { assert.ok(r.result !== undefined, JSON.stringify(r)); return r.result; };
const rows = (n = 3): PlanTask[] => threeRows().slice(0, n).map(r => ({ ...r, dependsOn: [] }));
const plan = (r: Repo, hash: string, story: string, status: string, n = 3, number = 1): void => r.put(`PLAN-${hash}-${story}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle(status, number), revision: number }, { tasks: rows(n) }, citations);
/** A Task head made from plan row `row`, under the Story's head. */
function task(r: Repo, hash: string, story: string, number: string, row: PlanTask, status = 'approved'): void {
	r.put(`TASK-${hash}-${story}-${number}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle(status), envelope: { description: row.title, parent: { entityId: `STORY-${hash}-${story}`, type: 'STORY', relation: 'derived-from' }, references: [], attachments: [] } }, taskPayloadFromRow(row) as unknown as Obj);
}
const tasksHead = (r: Repo, hash: string, story: string, planRevision: number, taskIds: string[]): void => r.put(`TASKS-${hash}-${story}`, { workflow: 'plan', epicHash: hash, storyId: story, lifecycle: lifecycle('draft') }, { planRevision, taskIds, nextNumber: taskIds.length + 1 });
const storyHead = (r: Repo, hash: string, story: string): void => r.put(`STORY-${hash}-${story}`, { workflow: 'define', epicHash: hash, storyId: story, lifecycle: lifecycle('draft'), envelope: { description: '', parent: { entityId: `EPIC-${hash}`, type: 'EPIC', relation: 'derived-from' }, references: [], attachments: [] } }, {});
const epicHead = (r: Repo, hash: string): void => { r.put(`DEF-${hash}`, { workflow: 'define', epicHash: hash, lifecycle: lifecycle('approved') }, { stories: [] }); r.put(`EPIC-${hash}`, { workflow: 'define', epicHash: hash, lifecycle: lifecycle('draft'), envelope: { description: '', references: [], attachments: [] } }, {}); };
/** An approved BUILD with these task results and a passing code review bound to it. */
function buildAndReview(r: Repo, hash: string, story: string, results: { id: string; passed: boolean }[]): void {
	r.put(`BUILD-${hash}-${story}`, { workflow: 'build', epicHash: hash, storyId: story, authoredBy: 'controller', lifecycle: lifecycle('approved') }, { commit: 'abc1234', focus: 'Change it', summary: 'Changed', tasks: results, changeLog: [{ target: { file: 'src/a.ts' } }] });
	const commit = 'a'.repeat(40);
	const scope = { storyId: story, documents: {}, reviewSet: [{ commit, parent: 'b'.repeat(40), files: [{ path: 'src/a.ts', segments: [{ after: [1, 1] }] }] }] };
	const review = (taskId: string) => ({ taskId, status: 'passed', summary: 'Correct', findings: [], testCoverage: { assessment: 'verified', explanation: 'Covered', evidenceReferences: ['ref:test'] }, limitations: [], advice: [], inspectedReferences: ['ref:code'], executedTests: [] });
	const summary = { reviewId: 'review-1', attempt: 1, storyId: story, reviewer: 'daemon', status: 'passed', scope, tasks: results.map(t => review(t.id)), summary: 'Reviewed', completedAt: '2026-11-03T01:00:00.000Z', buildFingerprint: reviewedBuildFingerprint(head(r.repo, `BUILD-${hash}-${story}`)) };
	r.put(`CR-${hash}-${story}`, { workflow: 'code-review', schemaVersion: 2, epicHash: hash, storyId: story, reviewedBy: 'daemon', lifecycle: lifecycle('draft') }, { kind: 'code-review', format: 'task-based', storyId: story, status: 'passed', reviews: [summary] });
}
const rounds = async (repo: string, id: string) => (await new History(createFileSidecarStore(repo)).log(id)).filter(e => (e.outcome?.data as { kind?: unknown } | undefined)?.kind === 'build-round');
const appendRound = (repo: string, id: string, res: 'pass' | 'fail'): Promise<void> => new History(createFileSidecarStore(repo)).appendLog(id, { id: `own-${id}`, actor: ACTOR, timestamp: AT, operation: 'update', outcome: { result: res, summary: 'own round', data: { kind: 'build-round' } } });

test('repair on an already converted repository creates missing EPIC, STORY, TASKS and TASK heads, including from signed-off and completed PLANs, and finishes a part-way Task set', async () => {
	const r = repository();
	try {
		r.put(`DEF-${H}`, { workflow: 'define', epicHash: H, lifecycle: lifecycle('approved'), envelope: { description: '', references: [], attachments: [] } }, { stories: [{ id: 'S001', title: 'One' }, { id: 's2', title: 'Two' }, { id: 's4', title: 'Not started' }] });
		plan(r, H, 's1', 'approved');
		plan(r, H, 's2', 'signed-off');
		plan(r, K, 's1', 'completed');   // a standalone Story: no Define names it
		r.put(`LLD-${K}-s1`, { workflow: 'design.story', epicHash: K, storyId: 's1', standalone: true, lifecycle: lifecycle('approved') }, { goal: 'g' });
		plan(r, H, 's3', 'approved', 2);   // part-way: its first Task exists and there is no TASKS head
		storyHead(r, H, 's3');
		task(r, H, 's3', 't1', rows()[0]!);
		const lonelyIssue = '1111111111111111';
		r.put(`ISSUE-${lonelyIssue}`, { workflow: 'issue', issueHash: lonelyIssue, lifecycle: lifecycle('draft') }, { title: 't' });

		const preview = await runRepair(r.repo, 'repair-preview');
		assert.ok(preview.plan.changes.some(c => c.rule === 'create-tasks' && c.artifactId === `PLAN-${K}-s1`), 'a completed PLAN qualifies');
		const out = result(await runRepair(r.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		assert.deepEqual(out.failed, []);

		for (const id of [`EPIC-${H}`, `STORY-${H}-s1`, `STORY-${H}-s2`, `STORY-${H}-s3`, `STORY-${H}-s4`, `EPIC-${K}`, `STORY-${K}-s1`]) assert.ok(has(r.repo, id), id);
		for (const [hash, story, n] of [[H, 's1', 3], [H, 's2', 3], [K, 's1', 3], [H, 's3', 2]] as const) {
			assert.ok(has(r.repo, `TASKS-${hash}-${story}`), `TASKS ${hash} ${story}`);
			assert.equal(head(r.repo, `TASKS-${hash}-${story}`).body['taskIds'].length, n, `${hash} ${story}`);
		}
		assert.ok(has(r.repo, `TASK-${K}-s1-t3`));
		assert.equal(head(r.repo, `TASK-${H}-s3-t2`).meta['lifecycle'].status, 'approved', 'the part-way set was finished');
		assert.equal(has(r.repo, `EPIC-${lonelyIssue}`), false, 'an ISSUE alone creates nothing');

		const again = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(again.plan.changes, [], 'a second run has nothing to do');
	} finally { r.done(); }
});

test('repair with crossed Task numbers and plan rows gives each BUILD result to the Task with that planTaskId and leaves existing rounds alone, before the live rule settles the Story', async () => {
	const r = repository();
	try {
		const [one, two, three] = rows() as [PlanTask, PlanTask, PlanTask];
		plan(r, H, 's1', 'approved');
		epicHead(r, H); storyHead(r, H, 's1');
		task(r, H, 's1', 't1', two);   // Task t1 is plan row t2, and Task t2 is plan row t1
		task(r, H, 's1', 't2', one);
		task(r, H, 's1', 't3', three);
		tasksHead(r, H, 's1', 1, ['t1', 't2', 't3']);
		buildAndReview(r, H, 's1', [{ id: 't1', passed: true }, { id: 't2', passed: false }, { id: 't3', passed: true }]);
		await appendRound(r.repo, `TASK-${H}-s1-t3`, 'fail');

		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes.filter(c => c.rule === 'backfill-round').map(c => c.artifactId), [`TASK-${H}-s1-t2`], 'only the Task made from the passed row, and t3 has a round already');

		const out = result(await runRepair(r.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		const evidence = createCompletionEvidence(r.repo);
		assert.equal(await evidence.taskBuildPassed(`TASK-${H}-s1-t2`), true, 'plan row t1 is Task t2');
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t1`)).length, 0, 'plan row t2 did not pass, whatever number its Task has');
		const third = await rounds(r.repo, `TASK-${H}-s1-t3`);
		assert.deepEqual(third.map(e => e.outcome?.result), ['fail'], 'the round it had is left alone');

		// the live rule then reads those rounds: held until the two other Tasks pass, and complete once they do
		const { service } = createRepoLifecycle(r.repo);
		await service.completeIfRolledUp(`STORY-${H}-s1`, ACTOR as never);
		assert.notEqual(head(r.repo, `STORY-${H}-s1`).meta['lifecycle'].status, 'completed');
		await appendRound(r.repo, `TASK-${H}-s1-t1`, 'pass');
		await new History(createFileSidecarStore(r.repo)).appendLog(`TASK-${H}-s1-t3`, { id: 'own-pass', actor: ACTOR as never, timestamp: '2026-10-11T00:00:00.000Z', operation: 'update', outcome: { result: 'pass', summary: 'rebuilt', data: { kind: 'build-round' } } });
		await service.completeIfRolledUp(`STORY-${H}-s1`, ACTOR as never);
		assert.equal(head(r.repo, `STORY-${H}-s1`).meta['lifecycle'].status, 'completed');
	} finally { r.done(); }
});

test('a failure injected while Task rounds are back-filled lists the rounds already written', async () => {
	const r = repository();
	try {
		plan(r, H, 's1', 'approved', 2);
		epicHead(r, H); storyHead(r, H, 's1');
		buildAndReview(r, H, 's1', [{ id: 't1', passed: true }, { id: 't2', passed: true }]);
		let seen = 0;
		const out = result(await runRepair(r.repo, 'repair', { beforeRound: () => { seen += 1; if (seen === 2) throw new Error('injected round failure'); } }));
		assert.equal(out.stoppedAt?.step, 'tasks');
		assert.match(out.stoppedAt?.reason ?? '', /injected round failure/);
		const logged = out.written.filter(w => w.step === 'tasks' && w.action === 'log-entry' && w.artifactId.startsWith('TASK-')).map(w => w.artifactId);
		const onDisk = (await rounds(r.repo, `TASK-${H}-s1-t1`)).length;
		assert.equal(onDisk, 1, 'control: one round was written before the failure');
		assert.ok(logged.includes(`TASK-${H}-s1-t1`), JSON.stringify(logged));
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t2`)).length, 0);
		assert.ok(out.remaining.some(c => c.rule === 'backfill-round' && c.artifactId === `TASK-${H}-s1-t2`), JSON.stringify(out.remaining));

		const next = result(await runRepair(r.repo, 'repair'));
		assert.equal(next.stoppedAt, undefined, JSON.stringify(next.stoppedAt));
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t1`)).length, 1, 'the written round is not added twice');
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t2`)).length, 1);
	} finally { r.done(); }
});

test('a TASKS head listing a missing Task, or made from a different plan revision, is reported failed and not settled, and other Stories continue', async () => {
	const r = repository();
	try {
		epicHead(r, H);
		// listed Task t9 has no head
		plan(r, H, 's1', 'approved', 1);
		storyHead(r, H, 's1');
		task(r, H, 's1', 't1', rows()[0]!);
		tasksHead(r, H, 's1', 1, ['t1', 't9']);
		// the Tasks were made from an earlier revision of the plan
		plan(r, H, 's2', 'approved', 1, 2);
		storyHead(r, H, 's2');
		task(r, H, 's2', 't1', rows()[0]!);
		tasksHead(r, H, 's2', 1, ['t1']);
		// a healthy Story alongside them
		plan(r, H, 's3', 'approved', 2);
		const untouched = [`TASKS-${H}-s1`, `TASKS-${H}-s2`].map(id => readFileSync(artifactJsonPath(r.repo, id), 'utf8'));

		const out = result(await runRepair(r.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		const failed = new Map(out.failed.map(f => [f.artifactId, f.reason]));
		assert.match(failed.get(`STORY-${H}-s1`) ?? '', /t9.*no head/);
		assert.match(failed.get(`STORY-${H}-s2`) ?? '', /plan revision 1, not 2/);
		assert.equal(failed.size, 2);
		assert.deepEqual([`TASKS-${H}-s1`, `TASKS-${H}-s2`].map(id => readFileSync(artifactJsonPath(r.repo, id), 'utf8')), untouched, 'left unchanged');
		for (const story of ['s1', 's2']) assert.notEqual(head(r.repo, `STORY-${H}-${story}`).meta['lifecycle'].status, 'completed', story);
		assert.ok(has(r.repo, `TASKS-${H}-s3`), 'the other Story went on');
		assert.equal(head(r.repo, `TASKS-${H}-s3`).body['taskIds'].length, 2);

		// a later run with nothing else to do still reports them
		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes, [], 'control: nothing is left to change');
		const later = result(await runRepair(r.repo, 'repair'));
		assert.deepEqual(later.failed.map(f => f.artifactId).sort(), [`STORY-${H}-s1`, `STORY-${H}-s2`]);
		assert.deepEqual(later.written, []);
	} finally { r.done(); }
});
