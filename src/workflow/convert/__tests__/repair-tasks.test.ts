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
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { History } from '../../artifact-core/history.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { createFileSidecarStore } from '../../artifact-core/sidecar-store.js';
import { artifactJsonPath } from '../../storage.js';
import type { PlanTask } from '../../artifacts/plan.js';
import { runRepair } from '../repair.js';
import { ACTOR, AT, H, K, appendRound, buildAndReview, epicHead, has, head, lifecycle, plan, repository, result, rounds, rows, storyHead, task, tasksHead } from './repair-kit.js';

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
		// approved after the completion rule, so the live rule is what settles it
		buildAndReview(r, H, 's1', [{ id: 't1', passed: true }, { id: 't2', passed: false }, { id: 't3', passed: true }], '2026-11-20T00:00:00.000Z');
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

test('a BUILD result goes to the live Task when a withdrawn Task once stood for the same plan row', async () => {
	const r = repository();
	try {
		const [one] = rows() as [PlanTask];
		plan(r, H, 's1', 'approved', 1);
		epicHead(r, H); storyHead(r, H, 's1');
		task(r, H, 's1', 't1', one, 'withdrawn');   // withdrawn, and its row came back under a new number
		task(r, H, 's1', 't5', one);
		tasksHead(r, H, 's1', 1, ['t1', 't5']);
		buildAndReview(r, H, 's1', [{ id: one.id, passed: true }], '2026-11-20T00:00:00.000Z');

		const preview = await runRepair(r.repo, 'repair-preview');
		assert.deepEqual(preview.plan.changes.filter(c => c.rule === 'backfill-round').map(c => c.artifactId), [`TASK-${H}-s1-t5`]);
		const out = result(await runRepair(r.repo, 'repair'));
		assert.equal(out.stoppedAt, undefined, JSON.stringify(out.stoppedAt));
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t5`)).length, 1, 'the live Task has the round');
		assert.equal((await rounds(r.repo, `TASK-${H}-s1-t1`)).length, 0, 'the withdrawn one does not');
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
