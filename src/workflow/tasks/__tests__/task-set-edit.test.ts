import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LifecycleConflictError } from '../../artifact-core/types.js';
import { TaskStructureError } from '../types.js';
import type { TaskPayload } from '../types.js';
import { row } from './task-kit.js';
import { PLAN, alice, bob, setKit, taskId, threeRows } from './task-set-kit.js';

describe('task-set-edit', () => {
	it("editing a Task's summary, size, checks or tests moves it to a new revision in draft with no signoff, a structural edit is refused and writes nothing, and a conflicting edit is refused", async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			const snapshot = async (ids: string[]) => JSON.stringify(await Promise.all(ids.map(id => s.k.store.readWithHistory(id))));
			const others = [taskId(1), taskId(3), PLAN];
			const planRevision = (await s.k.store.read(PLAN)).lifecycle.revision.number;
			const beforeOthers = await snapshot(others);

			// an edit of the editable fields: a new revision, back to draft, a log entry by the editor, no signoff opened
			const before = await s.k.store.read(taskId(2));
			assert.equal(before.lifecycle.status, 'approved');
			await s.sets.edit(taskId(2), { summary: 'sharper', size: 'L', acceptanceChecks: ['a', 'b'], tests: [{ level: 'integration', name: 'x.test.ts: y' }] }, bob, { expectedRevision: 1 });
			const after = await s.k.store.readWithHistory(taskId(2));
			const body = after.payload.body as unknown as TaskPayload;
			assert.deepEqual([body.summary, body.size, body.acceptanceChecks, body.tests, body.planTaskId, body.order], ['sharper', 'L', ['a', 'b'], [{ level: 'integration', name: 'x.test.ts: y' }], 't2', 2]);
			assert.equal(after.lifecycle.revision.number, 2);
			assert.equal(after.lifecycle.status, 'draft', 'the Task needs the local user\'s approval again');
			assert.deepEqual(after.lifecycle.signoffs, []);
			assert.equal(after.changeLog.at(-1)?.operation, 'update');
			assert.equal(after.changeLog.at(-1)?.actor.id, bob.id);
			// the plan keeps its revision and the other Tasks are untouched
			assert.equal((await s.k.store.read(PLAN)).lifecycle.revision.number, planRevision);
			assert.equal(await snapshot(others), beforeOthers);

			// an edit that changes nothing writes nothing
			const log = (await s.k.store.readWithHistory(taskId(2))).changeLog.length;
			await s.sets.edit(taskId(2), { summary: 'sharper' }, bob);
			assert.equal((await s.k.store.readWithHistory(taskId(2))).changeLog.length, log);
			assert.equal((await s.k.store.read(taskId(2))).lifecycle.revision.number, 2);

			// a structural edit is refused with a pointer to a re-plan, and nothing is written
			const frozen = await snapshot([taskId(2)]);
			for (const patch of [{ order: 5 }, { dependsOn: ['t1'] }, { planTaskId: 't7' }] as Array<Record<string, unknown>>) {
				await assert.rejects(s.sets.edit(taskId(2), patch as never, bob), (e: Error) => e instanceof TaskStructureError && /re-plan/.test(e.message), JSON.stringify(patch));
			}
			assert.equal(await snapshot([taskId(2)]), frozen);

			// a wrongly typed value is refused by the Task codec, and a non-Task id is refused
			await assert.rejects(s.sets.edit(taskId(2), { size: 'XL' as never }, bob));
			await assert.rejects(s.sets.edit(PLAN, { summary: 'x' }, bob), TaskStructureError);

			// a conflicting edit: made from revision 1 when the Task is already at 2
			await assert.rejects(s.sets.edit(taskId(2), { summary: 'late' }, bob, { expectedRevision: 1 }), (e: Error) => e instanceof LifecycleConflictError);
			assert.equal(await snapshot([taskId(2)]), frozen);
		} finally { s.done(); }
	});

	it('an edit and a reconcile that read the same revision cannot both land, and a withdrawn Task cannot be edited', async () => {
		const s = setKit();
		try {
			await s.plan(threeRows());
			await s.sets.createFromPlan(PLAN, alice);
			const read = (await s.k.store.read(taskId(1))).lifecycle.revision.number;

			// a re-plan rewords t1 and drops t3
			await s.plan([row('t1', 1, { summary: 'from the plan' }), row('t2', 2)]);
			await s.sets.reconcile(PLAN, alice);
			assert.equal((await s.k.store.read(taskId(1))).lifecycle.revision.number, 2);
			// the edit was made from revision 1: refused, the plan's wording stands
			await assert.rejects(s.sets.edit(taskId(1), { summary: 'mine' }, bob, { expectedRevision: read }), LifecycleConflictError);
			assert.equal(((await s.k.store.read(taskId(1))).payload.body as unknown as TaskPayload).summary, 'from the plan');

			// a withdrawn Task is not edited
			assert.equal((await s.k.store.read(taskId(3))).lifecycle.status, 'withdrawn');
			await assert.rejects(s.sets.edit(taskId(3), { summary: 'x' }, bob), (e: Error) => e instanceof TaskStructureError && /withdrawn/.test(e.message));
		} finally { s.done(); }
	});
});
