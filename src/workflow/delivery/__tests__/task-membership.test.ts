/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which Tasks a Story has on the board, in what order and under what ids.
 *
 * Run: npx tsx --test src/workflow/delivery/__tests__/task-membership.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import type { ArtifactRecord, ItemGates, WorkItemGraph, WorkItemNode } from '../types.js';
import { CREATED, buildRecord, defRecord, planRecord, recordFromFile, recordSet, unitHead } from './fixtures.js';

const H = '1111111111111111';
const APPROVED = { approvedAt: CREATED };

const taskHead = (number: string, status: string, row: string, order: number): ArtifactRecord =>
	unitHead('TASK', H, `s1-${number}`, status, { planTaskId: row, order, title: `task for ${row}` });
const tasksHead = (planRevision: number, taskIds: readonly string[]): ArtifactRecord => recordFromFile(`TASKS-${H}-s1.json`, {
	meta: { createdAt: CREATED, epicCreatedAt: CREATED, epicHash: H, storyId: 's1', lifecycle: unitHead('STORY', H, 's1', 'draft').meta['lifecycle'] },
	body: { planRevision, taskIds, nextNumber: 99 },
});
/** The Epic and its Story, with their heads, so a test is about the Tasks alone. */
const units = (): ArtifactRecord[] => [defRecord(H, ['s1'], APPROVED), unitHead('EPIC', H, undefined, 'draft'), unitHead('STORY', H, 's1', 'draft')];
/** A plan with these rows, with `order` as given by the row's position (or the map). */
const planWith = (ids: readonly string[], order: Readonly<Record<string, number>> = {}): ArtifactRecord => {
	const plan = planRecord(H, 's1', ids, APPROVED);
	const body = plan.body as { tasks: { id: string }[] };
	return { ...plan, body: { ...body, tasks: body.tasks.map((t, i) => ({ ...t, order: order[t.id] ?? i + 1 })) } };
};
const CURRENT = 1;

function run(records: readonly ArtifactRecord[]): { graph: WorkItemGraph; tasks: WorkItemNode[]; gates: ItemGates } {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	const story = [...graph.items.values()].find(i => i.kind === 'story');
	assert.ok(story !== undefined);
	const gates = deriveGates(graph, set).items.get(story.id);
	assert.ok(gates !== undefined);
	return { graph, tasks: [...graph.items.values()].filter(i => i.kind === 'task').sort((a, b) => a.id.localeCompare(b.id)), gates };
}
const tail = (id: string): string => id.slice(id.lastIndexOf(':') + 1);
const assertUniqueIds = (tasks: readonly WorkItemNode[]): void => assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length, tasks.map(t => t.id).join());
const resultOf = (g: ItemGates, task: WorkItemNode): string | undefined => g.tasks.find(t => t.taskItemId === task.id)?.result;

test('buildWorkItemGraph: TASKS-listed membership, withdrawn and superseded exclusion, PLAN fallback with an absent PLAN and an empty listing, unit, planRowId and taskOrder, and a Task whose number differs from its plan row has no number alias in sourceIds', () => {
	// the listing is the membership: a withdrawn and a superseded Task are not shown, even with a BUILD result
	const listed = run([...units(), planWith(['t1', 't2', 't3', 't9']), tasksHead(CURRENT, ['t1', 't2', 't3', 't4']),
		taskHead('t1', 'approved', 't1', 1), taskHead('t2', 'withdrawn', 't2', 2), taskHead('t3', 'superseded', 't3', 3), taskHead('t4', 'completed', 't9', 4),
		buildRecord(H, 's1', [{ id: 't1', passed: true }, { id: 't2', passed: true }, { id: 't3', passed: false }, { id: 't9', passed: true }], APPROVED)]);
	assert.deepEqual(listed.tasks.map(t => tail(t.id)), ['T001', 'T004']);
	const [one, four] = listed.tasks as [WorkItemNode, WorkItemNode];
	assert.deepEqual(one.unit, { artifactId: `TASK-${H}-s1-t1`, status: 'approved' });
	assert.deepEqual(four.unit, { artifactId: `TASK-${H}-s1-t4`, status: 'completed' });
	assert.equal(four.planRowId, 't9');
	assert.equal(four.taskOrder, 4);
	assert.deepEqual(four.sourceIds, ['t9'], 'no alias of the number 4');
	assert.equal(resultOf(listed.gates, four), 'passed', 'its validation is the result of its own plan row');
	assert.equal(listed.gates.validation.failed, 0, 'the result of the superseded Task is not counted');

	// an empty listing falls back to the plan's rows
	const empty = run([...units(), planWith(['t1', 't2']), tasksHead(CURRENT, []), taskHead('t1', 'approved', 't1', 1)]);
	assert.deepEqual(empty.tasks.map(t => [tail(t.id), t.unit?.status ?? null, t.planRowId]), [['T001', 'approved', 't1'], ['T002', null, 't2']]);

	// with no PLAN, the listing stands
	const noPlan = run([...units(), tasksHead(CURRENT, ['t1']), taskHead('t1', 'approved', 't1', 7)]);
	assert.deepEqual(noPlan.tasks.map(t => [tail(t.id), t.planRowId, t.taskOrder]), [['T001', 't1', 7]]);
});

test('buildWorkItemGraph: a TASKS head from an older plan revision yields the PLAN\'s rows matched by planTaskId, in the PLAN\'s order even when a matching Task head carries an older order', () => {
	const { tasks, gates } = run([...units(), planWith(['t2', 't1', 't3'], { t2: 1, t1: 2, t3: 3 }), tasksHead(CURRENT - 1, ['t1', 't2']),
		taskHead('t1', 'approved', 't1', 1), taskHead('t2', 'approved', 't2', 2)]);
	assert.deepEqual(tasks.map(t => [tail(t.id), t.planRowId, t.taskOrder, t.unit === null]), [['T001', 't1', 2, false], ['T002', 't2', 1, false], ['T003', 't3', 3, true]]);
	assert.deepEqual(gates.tasks.map(t => tail(t.taskItemId)), ['T002', 'T001', 'T003'], 'the gate reads them in the plan\'s order');
});

test('board id: Task t4 representing row t9 with a new headless row t4 gives :T004 and :R004 with separate validation and evidence', () => {
	const plan = planWith(['t9', 't4']);
	const build = buildRecord(H, 's1', [{ id: 't9', passed: true }, { id: 't4', passed: false }], APPROVED);
	const { tasks, gates } = run([...units(), plan, tasksHead(CURRENT - 1, ['t4']), taskHead('t4', 'approved', 't9', 1), build]);
	assertUniqueIds(tasks);
	const real = tasks.find(t => t.id.endsWith(':T004'));
	const row = tasks.find(t => t.id.endsWith(':R004'));
	assert.ok(real !== undefined && row !== undefined, tasks.map(t => t.id).join());
	assert.deepEqual([real.planRowId, row.planRowId], ['t9', 't4']);
	assert.deepEqual(real.sourceIds, ['t9']);
	assert.deepEqual(row.sourceIds, ['t4']);
	assert.equal(resultOf(gates, real), 'passed');
	assert.equal(resultOf(gates, row), 'failed', 'neither absorbs the other');
	assert.deepEqual(real.evidenceArtifactIds, [plan.artifactId, build.artifactId].sort());
});

test('board id: Task t4 representing row t9 with an unmatched BUILD result for t4 gives :T004 and :R004', () => {
	const { tasks, gates } = run([...units(), planWith(['t9']), tasksHead(CURRENT, ['t4']), taskHead('t4', 'approved', 't9', 1),
		buildRecord(H, 's1', [{ id: 't4', passed: false }, { id: 't9', passed: true }], APPROVED)]);
	assertUniqueIds(tasks);
	const row = tasks.find(t => t.id.endsWith(':R004'));
	assert.ok(row !== undefined, tasks.map(t => t.id).join());
	assert.equal(row.planRowId, null);
	assert.equal(row.unit, null);
	assert.equal(resultOf(gates, row), 'failed', 'the result stays on the row');
	assert.equal(resultOf(gates, tasks.find(t => t.id.endsWith(':T004')) as WorkItemNode), 'passed');
	assert.ok(!gates.attentionReasons.includes('needs-migration'), JSON.stringify(gates.attentionReasons));
});

test('board id: a headless row and a BUILD result for the same row stay one item; a row whose number no real Task holds keeps :T<nnn>; no two items in a Story share an id', () => {
	const { tasks, gates } = run([...units(), planWith(['t4', 't5']), tasksHead(CURRENT - 1, ['t7']), taskHead('t7', 'approved', 't5', 2),
		buildRecord(H, 's1', [{ id: 't4', passed: false }], APPROVED)]);
	assertUniqueIds(tasks);
	assert.deepEqual(tasks.map(t => tail(t.id)), ['T004', 'T007']);
	const row = tasks[0] as WorkItemNode;
	assert.equal(row.planRowId, 't4', 'the row and its result are one item');
	assert.equal(resultOf(gates, row), 'failed');
	assert.equal(row.evidenceArtifactIds.length, 2, 'with both as evidence');
});

test('buildWorkItemGraph and gate: a PLAN plus an extra failed BUILD result, and a BUILD with no PLAN, keep those task items, their failed count and their validation conflict, with no needs-migration', () => {
	const extra = run([...units(), planWith(['t1']), tasksHead(CURRENT, ['t1']), taskHead('t1', 'approved', 't1', 1),
		buildRecord(H, 's1', [{ id: 't1', passed: true }, { id: 't3', passed: false }], APPROVED)]);
	const failed = extra.tasks.find(t => t.id.endsWith(':T003'));
	assert.ok(failed !== undefined);
	assert.equal(failed.planRowId, null);
	assert.equal(failed.unit, null);
	assert.equal(extra.gates.validation.failed, 1);
	assert.equal(extra.gates.validation.unplanned, 1);
	assert.deepEqual(extra.gates.conflict?.failedTaskItemIds, [failed.id]);
	assert.ok(!extra.gates.attentionReasons.includes('needs-migration'), JSON.stringify(extra.gates.attentionReasons));

	const noPlan = run([...units(), buildRecord(H, 's1', [{ id: 't1', passed: false }, { id: 't2', passed: true }], APPROVED)]);
	assert.deepEqual(noPlan.tasks.map(t => tail(t.id)), ['T001', 'T002']);
	assert.equal(noPlan.gates.validation.failed, 1);
	assert.equal(noPlan.gates.conflict?.failedTaskItemIds.length, 1);
	assert.ok(!noPlan.gates.attentionReasons.includes('needs-migration'), JSON.stringify(noPlan.gates.attentionReasons));
});

test('gate sorts tasks by taskOrder, null last, then id', () => {
	const { gates } = run([...units(), planWith(['t1', 't2', 't3'], { t1: 3, t2: 2, t3: 3 }), tasksHead(CURRENT - 1, []),
		buildRecord(H, 's1', [{ id: 't8', passed: true }, { id: 't7', passed: true }], APPROVED)]);
	assert.deepEqual(gates.tasks.map(t => [tail(t.taskItemId), t.taskOrder]), [['T002', 2], ['T001', 3], ['T003', 3], ['T007', null], ['T008', null]]);
});
